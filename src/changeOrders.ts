import { recalculatePlans, detectConflicts } from './data';
import type {
  ChangeFieldKey,
  Cue,
  FieldChangeItem,
  FieldChangeOrder,
  LightingPlan,
  Scene,
  UserRole
} from './types';

/** 现场人员可申请调整的字段：通道、亮度或渐变参数 */
export const changeFieldDefs: { key: ChangeFieldKey; group: '通道' | '亮度' | '渐变'; label: string; unit?: string }[] = [
  { key: 'channel', group: '通道', label: '控制通道' },
  { key: 'brightness', group: '亮度', label: '亮度', unit: '%' },
  { key: 'fadeIn', group: '渐变', label: '渐入', unit: 's' },
  { key: 'hold', group: '渐变', label: '保持', unit: 's' },
  { key: 'fadeOut', group: '渐变', label: '渐出', unit: 's' }
];

export const changeFieldLabels: Record<ChangeFieldKey, string> = Object.fromEntries(
  changeFieldDefs.map((item) => [item.key, item.label])
) as Record<ChangeFieldKey, string>;

export const changeOrderStatusMeta = {
  pending: { label: '待设计审批', color: 'orange' },
  conflict: { label: '冲突 · 待重提', color: 'red' },
  merged: { label: '已合入', color: 'green' },
  withdrawn: { label: '已撤回', color: 'gray' }
} as const;

export function findCueLocation(plans: LightingPlan[], planId: string, cueId: string) {
  const plan = plans.find((item) => item.id === planId);
  const scene = plan?.scenes.find((item) => item.cues.some((cue) => cue.id === cueId));
  const cue = scene?.cues.find((item) => item.id === cueId);
  return { plan, scene, cue };
}

export function formatFieldValue(field: ChangeFieldKey, value: string | number) {
  const def = changeFieldDefs.find((item) => item.key === field);
  return `${value}${def?.unit ?? ''}`;
}

export function createChangeOrder(input: {
  cue: Cue;
  planId: string;
  sceneId: string;
  items: FieldChangeItem[];
  reason: string;
  role: UserRole;
}): FieldChangeOrder {
  const now = new Date().toISOString();
  return {
    id: `co-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    planId: input.planId,
    sceneId: input.sceneId,
    cueId: input.cue.id,
    cueNumber: input.cue.number,
    cueLabel: input.cue.label,
    items: input.items,
    reason: input.reason.trim(),
    status: 'pending',
    requestedBy: input.role,
    requestedAt: now,
    history: [{ at: now, action: '提交字段变更单，等待灯光设计审批' }]
  };
}

/**
 * 计算一条进行中的变更单与当前提示值的漂移情况。
 * 提交后目标字段又被改过的项即为冲突项。
 */
export function evaluateOrder(order: FieldChangeOrder, cue: Cue | undefined) {
  if (!cue) return { missing: true as const, drifted: new Set<ChangeFieldKey>() };
  const drifted = new Set<ChangeFieldKey>();
  for (const item of order.items) {
    if (item.outcome === 'merged') continue;
    if (cue[item.field] !== item.baseline) drifted.add(item.field);
  }
  return { missing: false as const, drifted };
}

/**
 * 合入审批结果：仅合入未冲突的勾选项；已经被改过的字段保留新值并标为冲突。
 * 全单无冲突 → merged；存在冲突 → conflict，由现场人员重提。
 * 调用前需保证场次未冻结、角色为灯光设计。
 */
export function applyApproval(order: FieldChangeOrder, cue: Cue) {
  const mergedKeys: ChangeFieldKey[] = [];
  const conflictedKeys: ChangeFieldKey[] = [];
  for (const item of order.items) {
    if (cue[item.field] === item.baseline) {
      cue[item.field] = item.proposed as never;
      item.outcome = 'merged';
      mergedKeys.push(item.field);
    } else {
      // 目标字段已被他人改过：保留当前新值，本项标记冲突
      item.outcome = 'conflicted';
      conflictedKeys.push(item.field);
    }
  }
  const now = new Date().toISOString();
  order.decidedAt = now;
  if (!conflictedKeys.length) {
    order.status = 'merged';
    order.history.push({
      at: now,
      action: `灯光设计同意合入 ${mergedKeys.length} 项：${mergedKeys.map((key) => changeFieldLabels[key]).join('、')}`
    });
  } else {
    order.status = 'conflict';
    const parts: string[] = [];
    if (mergedKeys.length) {
      parts.push(`已合入 ${mergedKeys.map((key) => changeFieldLabels[key]).join('、')}`);
    }
    parts.push(`提交后被改动、保留现场新值待重提：${conflictedKeys.map((key) => changeFieldLabels[key]).join('、')}`);
    order.history.push({ at: now, action: parts.join('；') });
  }
  return { mergedKeys, conflictedKeys };
}

/** 从一组已检测冲突中筛出与某提示实际相关的叠光/跟随冲突 */
export function relatedOverlapFollowConflicts(
  conflicts: ReturnType<typeof detectConflicts>,
  planId: string,
  scene: Scene,
  cueId: string
) {
  const cue = scene.cues.find((item) => item.id === cueId);
  if (!cue) return [];
  return conflicts.filter((conflict) => {
    if (conflict.planId !== planId || conflict.sceneId !== scene.id) return false;
    if (conflict.type !== 'channel-overlap' && conflict.type !== 'follow-order') return false;
    if (conflict.cueId === cueId) return true;
    if (conflict.type === 'follow-order') {
      const owner = scene.cues.find((item) => item.id === conflict.cueId);
      return owner?.followCueId === cueId || cue.followCueId === conflict.cueId;
    }
    const owner = scene.cues.find((item) => item.id === conflict.cueId);
    return Boolean(
      owner &&
        owner.channel.trim() &&
        owner.channel === cue.channel &&
        (owner.startTime ?? 0) < (cue.endTime ?? 0) - 0.01 &&
        (cue.startTime ?? 0) < (owner.endTime ?? 0) - 0.01
    );
  });
}

/** 合入后重新核对叠光与跟随关系：在计划集上重算并检测，返回该提示实际相关的冲突摘要 */
export function previewPostMergeConflicts(
  plans: LightingPlan[],
  planId: string,
  sceneId: string,
  cueId: string
) {
  recalculatePlans(plans);
  const plan = plans.find((item) => item.id === planId);
  const scene = plan?.scenes.find((item) => item.id === sceneId);
  if (!scene) return [];
  return relatedOverlapFollowConflicts(detectConflicts(plans), planId, scene, cueId);
}

export function reviewSummary(conflicts: ReturnType<typeof previewPostMergeConflicts>) {
  if (!conflicts.length) return '合入后重新核对叠光与跟随关系，未发现异常。';
  const overlap = conflicts.filter((item) => item.type === 'channel-overlap').length;
  const follow = conflicts.filter((item) => item.type === 'follow-order').length;
  const parts: string[] = [];
  if (overlap) parts.push(`${overlap} 处同通道叠光`);
  if (follow) parts.push(`${follow} 处跟随关系`);
  return `合入后重新核对：${parts.join('、')}需关注（见冲突页）。`;
}

export function canSubmitForRole(role: UserRole) {
  return role === 'programmer';
}

export function canApproveForRole(role: UserRole) {
  return role === 'designer';
}
