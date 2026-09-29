import { detectConflicts, recalculatePlans } from './data';
import type {
  ChangeOrderField,
  ChangeOrderStatus,
  ChangeableField,
  Cue,
  FieldChangeOrder,
  LightingPlan,
  Scene,
  UserRole,
  Workspace
} from './types';

export interface ChangeableFieldMeta {
  field: ChangeableField;
  label: string;
  group: string;
  kind: 'text' | 'number' | 'percent';
  unit?: string;
}

/** 可纳入字段变更单的参数：通道、亮度与渐变（渐入/保持/渐出） */
export const changeableFields: ChangeableFieldMeta[] = [
  { field: 'channel', label: '控制通道', group: '通道', kind: 'text' },
  { field: 'brightness', label: '亮度', group: '亮度', kind: 'percent', unit: '%' },
  { field: 'fadeIn', label: '渐入', group: '渐变', kind: 'number', unit: 's' },
  { field: 'hold', label: '保持', group: '渐变', kind: 'number', unit: 's' },
  { field: 'fadeOut', label: '渐出', group: '渐变', kind: 'number', unit: 's' }
];

export const changeableFieldNames = changeableFields.map((item) => item.field);

export const changeOrderStatusMeta: Record<ChangeOrderStatus, { label: string; color: string }> = {
  pending: { label: '待设计审批', color: 'amber' },
  approved: { label: '已同意合入', color: 'green' },
  rejected: { label: '已退回', color: 'red' },
  conflict: { label: '字段冲突', color: 'orange' }
};

export function fieldMeta(field: ChangeableField) {
  return changeableFields.find((item) => item.field === field);
}

export function formatFieldValue(field: ChangeableField, value: string | number | undefined) {
  if (value === undefined || value === '') return '空';
  const meta = fieldMeta(field);
  return `${value}${meta?.unit ?? ''}`;
}

export function findOrderTarget(workspace: Workspace, order: FieldChangeOrder) {
  const plan = workspace.plans.find((item) => item.id === order.planId);
  const scene = plan?.scenes.find((item) => item.id === order.sceneId);
  const cue = scene?.cues.find((item) => item.id === order.cueId);
  return { plan, scene, cue };
}

/** 勾选字段中，当前提示值已与提交时基准不一致的字段（提示被删除时视为全部漂移） */
export function driftedFields(workspace: Workspace, order: FieldChangeOrder): ChangeableField[] {
  const checked = order.fields.filter((item) => item.checked);
  const { cue } = findOrderTarget(workspace, order);
  if (!cue) return checked.map((item) => item.field);
  return checked.filter((item) => !Object.is(cue[item.field], item.baseline)).map((item) => item.field);
}

/**
 * 任意提交后扫描待审批变更单：目标字段又被人改过时标成冲突。
 * 已经改过的字段保持提示上的新值，变更单保留待重提，不做任何回滚。
 */
export function markOrderConflicts(workspace: Workspace): string[] {
  const flipped: string[] = [];
  for (const order of workspace.changeOrders) {
    if (order.status !== 'pending') continue;
    const drifted = driftedFields(workspace, order);
    if (drifted.length) {
      order.status = 'conflict';
      order.conflictFields = drifted;
      flipped.push(order.id);
    }
  }
  return flipped;
}

let orderSequence = 0;

export function newOrderId() {
  orderSequence += 1;
  return `co-${Date.now().toString(36)}-${orderSequence}`;
}

export type FieldDraft = Record<ChangeableField, { checked: boolean; value: string }>;

export function buildOrderFields(cue: Cue, draft: FieldDraft): ChangeOrderField[] {
  const meta = changeableFields;
  return meta.map(({ field, kind }) => {
    const raw = draft[field].value;
    const proposed: string | number = kind === 'text' ? raw.trim() : Number(raw);
    return {
      field,
      checked: draft[field].checked,
      baseline: cue[field],
      proposed
    };
  });
}

export function validateOrderFields(fields: ChangeOrderField[]): string | null {
  const checked = fields.filter((item) => item.checked);
  if (!checked.length) return '请至少勾选一个要调整的字段';
  for (const item of checked) {
    const meta = fieldMeta(item.field);
    if (meta?.kind === 'text' && typeof item.proposed === 'string' && !item.proposed) {
      return `${meta.label}不能为空`;
    }
    if (meta?.kind === 'number' && (typeof item.proposed !== 'number' || Number.isNaN(item.proposed) || item.proposed < 0)) {
      return `${meta.label}需为不小于 0 的数字`;
    }
    if (item.field === 'brightness' && (typeof item.proposed !== 'number' || item.proposed < 0 || item.proposed > 100)) {
      return '亮度应在 0–100 之间';
    }
  }
  return null;
}

export interface SubmitOrderInput {
  plan: LightingPlan;
  scene: Scene;
  cue: Cue;
  fields: ChangeOrderField[];
  reason: string;
  submitterRole: UserRole;
}

export function createOrder({ plan, scene, cue, fields, reason, submitterRole }: SubmitOrderInput): FieldChangeOrder {
  const now = new Date().toISOString();
  return {
    id: newOrderId(),
    planId: plan.id,
    planName: plan.name,
    sceneId: scene.id,
    sceneName: scene.name,
    cueId: cue.id,
    cueNumber: cue.number,
    cueLabel: cue.label,
    fields,
    reason: reason.trim(),
    status: 'pending',
    submitterRole,
    createdAt: now,
    submittedAt: now
  };
}

export type ReviewResult =
  | { ok: true; mergedCount: number; conflictCount: number }
  | { ok: false; reason: 'missing' | 'frozen' | 'not-pending' | 'drifted' | 'invalid' };

/**
 * 设计同意后合入：只写入勾选且仍与提交基准一致的字段，未勾选字段照旧。
 * 合入后立即重算时间并重新核对叠光与跟随关系。
 */
export function approveOrder(
  workspace: Workspace,
  orderId: string,
  reviewerRole: UserRole,
  reviewNote?: string
): ReviewResult {
  const order = workspace.changeOrders.find((item) => item.id === orderId);
  if (!order) return { ok: false, reason: 'missing' };
  if (order.status !== 'pending') return { ok: false, reason: 'not-pending' };
  const { plan, scene, cue } = findOrderTarget(workspace, order);
  if (!plan || !scene || !cue) return { ok: false, reason: 'missing' };
  if (scene.frozen) return { ok: false, reason: 'frozen' };

  const checked = order.fields.filter((item) => item.checked);
  if (validateOrderFields(order.fields)) return { ok: false, reason: 'invalid' };

  const drifted = driftedFields(workspace, order);
  if (drifted.length) {
    order.status = 'conflict';
    order.conflictFields = drifted;
    return { ok: false, reason: 'drifted' };
  }

  for (const item of checked) {
    (cue as Cue)[item.field] = item.proposed as never;
  }

  order.status = 'approved';
  order.reviewerRole = reviewerRole;
  order.reviewNote = reviewNote?.trim() || '设计同意，按勾选项合入';
  order.resolvedAt = new Date().toISOString();
  order.conflictFields = [];

  recalculatePlans(workspace.plans);
  return { ok: true, mergedCount: checked.length, conflictCount: detectConflicts(workspace.plans).filter((c) => c.planId === plan.id).length };
}

export function rejectOrder(workspace: Workspace, orderId: string, reviewerRole: UserRole, reviewNote?: string): boolean {
  const order = workspace.changeOrders.find((item) => item.id === orderId);
  if (!order || order.status !== 'pending') return false;
  order.status = 'rejected';
  order.reviewerRole = reviewerRole;
  order.reviewNote = reviewNote?.trim() || '设计退回，请调整后重新提交';
  order.resolvedAt = new Date().toISOString();
  return true;
}

/** 冲突重提：以提示当前值作为新基准，保留申请值与原因，重新进入待审批。 */
export function resubmitOrder(
  workspace: Workspace,
  orderId: string,
  fields: ChangeOrderField[],
  reason: string
): boolean {
  const order = workspace.changeOrders.find((item) => item.id === orderId);
  if (!order) return false;
  const { cue } = findOrderTarget(workspace, order);
  if (!cue) return false;
  order.fields = fields.map((item) => ({ ...item, baseline: cue[item.field] }));
  order.reason = reason.trim();
  order.status = 'pending';
  order.conflictFields = [];
  order.reviewNote = undefined;
  order.submittedAt = new Date().toISOString();
  return true;
}

export function withdrawOrder(workspace: Workspace, orderId: string): boolean {
  const order = workspace.changeOrders.find((item) => item.id === orderId);
  if (!order || (order.status !== 'pending' && order.status !== 'conflict')) return false;
  workspace.changeOrders = workspace.changeOrders.filter((item) => item.id !== orderId);
  return true;
}
