export type CueStatus = 'draft' | 'ready' | 'confirmed';
export type UserRole = 'designer' | 'programmer' | 'stage-manager' | 'readonly';
export type ConflictSeverity = 'error' | 'warning';

export interface Cue {
  id: string;
  number: string;
  label: string;
  position: string;
  channel: string;
  color: string;
  colorHex: string;
  brightness: number;
  fadeIn: number;
  hold: number;
  fadeOut: number;
  followCueId: string;
  targetNote: string;
  notes: string;
  status: CueStatus;
  startTime?: number;
  duration?: number;
  endTime?: number;
}

export interface Scene {
  id: string;
  name: string;
  order: number;
  frozen: boolean;
  startTime?: number;
  duration?: number;
  cues: Cue[];
}

export interface LightingPlan {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  scenes: Scene[];
}

export interface CueConflict {
  id: string;
  planId: string;
  cueId: string;
  sceneId: string;
  severity: ConflictSeverity;
  type: 'channel-overlap' | 'follow-order' | 'missing-data' | 'duplicate-position' | 'duration';
  message: string;
}

/** 变更单可申请调整的字段：通道、亮度、渐变（入/保持/出） */
export type ChangeFieldKey = 'channel' | 'brightness' | 'fadeIn' | 'hold' | 'fadeOut';

export type FieldChangeStatus = 'pending' | 'conflict' | 'merged' | 'withdrawn';

export interface FieldChangeItem {
  field: ChangeFieldKey;
  /** 提出时目标字段的现值，用于审批时判定是否又被改过 */
  baseline: string | number;
  proposed: string | number;
  outcome?: 'merged' | 'conflicted';
}

export interface FieldChangeOrder {
  id: string;
  planId: string;
  sceneId: string;
  cueId: string;
  /** 提交时的提示编号与名称，便于提示删除后仍可辨认 */
  cueNumber: string;
  cueLabel: string;
  items: FieldChangeItem[];
  reason: string;
  status: FieldChangeStatus;
  requestedBy: UserRole;
  requestedAt: string;
  decidedAt?: string;
  /** 合入后重新核对叠光与跟随关系的提示摘要，全部合入时写入 */
  reviewNote?: string;
  history: { at: string; action: string }[];
}

export interface Workspace {
  plans: LightingPlan[];
  changeOrders: FieldChangeOrder[];
  activePlanId: string;
  comparePlanId: string;
  selectedSceneId: string;
  selectedCueId: string;
  role: UserRole;
}

export interface EditorState {
  workspace: Workspace;
  past: Workspace[];
  future: Workspace[];
  lastAction: string;
}

export interface PersistedState {
  workspace: Workspace;
}
