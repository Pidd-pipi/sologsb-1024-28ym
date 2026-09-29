export type CueStatus = 'draft' | 'ready' | 'confirmed';
export type UserRole = 'designer' | 'programmer' | 'stage-manager' | 'readonly';
export type ConflictSeverity = 'error' | 'warning';

/** 可纳入字段变更单审批的参数：通道、亮度与渐变 */
export type ChangeableField = 'channel' | 'brightness' | 'fadeIn' | 'hold' | 'fadeOut';

export type ChangeOrderStatus = 'pending' | 'approved' | 'rejected' | 'conflict';

export interface ChangeOrderField {
  field: ChangeableField;
  checked: boolean;
  /** 提交瞬间该字段的原始值，用于之后判定目标字段是否又被改动 */
  baseline: string | number;
  /** 变更单申请的新值 */
  proposed: string | number;
}

export interface FieldChangeOrder {
  id: string;
  planId: string;
  planName: string;
  sceneId: string;
  sceneName: string;
  cueId: string;
  cueNumber: string;
  cueLabel: string;
  fields: ChangeOrderField[];
  reason: string;
  status: ChangeOrderStatus;
  submitterRole: UserRole;
  reviewerRole?: UserRole;
  reviewNote?: string;
  createdAt: string;
  submittedAt: string;
  resolvedAt?: string;
  conflictFields?: ChangeableField[];
}

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

export interface Workspace {
  plans: LightingPlan[];
  activePlanId: string;
  comparePlanId: string;
  selectedSceneId: string;
  selectedCueId: string;
  role: UserRole;
  /** 字段变更单（含待审批、冲突、已批复记录），随离线草稿保留 */
  changeOrders: FieldChangeOrder[];
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
