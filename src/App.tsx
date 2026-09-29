import {
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  Box,
  Button,
  ButtonGroup,
  Checkbox,
  Divider,
  Flex,
  FormControl,
  FormLabel,
  Grid,
  GridItem,
  HStack,
  Heading,
  IconButton,
  Input,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Select,
  SimpleGrid,
  Spacer,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
  Text,
  Textarea,
  Tooltip,
  VStack,
  useToast
} from '@chakra-ui/react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Ban,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ClipboardList,
  Clock3,
  Copy,
  GripVertical,
  Lightbulb,
  Lock,
  LockOpen,
  Pause,
  Plus,
  Redo2,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  SkipForward,
  Trash2,
  Undo2,
  Unlock,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  colorPresets,
  detectConflicts,
  roleLabels,
  statusLabels
} from './data';
import {
  applyApproval,
  canApproveForRole,
  canSubmitForRole,
  changeFieldDefs,
  changeFieldLabels,
  changeOrderStatusMeta,
  createChangeOrder,
  evaluateOrder,
  findCueLocation,
  formatFieldValue,
  previewPostMergeConflicts,
  relatedOverlapFollowConflicts,
  reviewSummary
} from './changeOrders';
import {
  LIGHTING_STORAGE_KEY,
  canEditScene,
  canFreeze,
  findActivePlan,
  findActiveScene,
  findActiveCue,
  formatTime,
  useLightingDesk
} from './state/useLightingDesk';
import type {
  ChangeFieldKey,
  Cue,
  CueConflict,
  FieldChangeItem,
  FieldChangeOrder,
  LightingPlan,
  Scene,
  UserRole,
  Workspace
} from './types';

const statusColors = {
  draft: 'orange',
  ready: 'blue',
  confirmed: 'green'
} as const;

/** 变更单受控字段：通道、亮度、渐变（入/保持/出），编程执行需申请后由设计审批合入 */
const MANAGED_CHANGE_FIELDS: ChangeFieldKey[] = ['channel', 'brightness', 'fadeIn', 'hold', 'fadeOut'];

function conflictLabel(conflict: CueConflict) {
  return {
    'channel-overlap': '通道叠光',
    'follow-order': '跟随关系',
    'missing-data': '数据缺失',
    'duplicate-position': '灯位重复',
    duration: '时间异常'
  }[conflict.type];
}

interface SortableCueRowProps {
  cue: Cue;
  index: number;
  selected: boolean;
  disabled: boolean;
  conflicts: CueConflict[];
  onSelect: () => void;
}

function SortableCueRow({ cue, index, selected, disabled, conflicts, onSelect }: SortableCueRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cue.id,
    disabled
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <Box
      ref={setNodeRef}
      style={style}
      role="option"
      aria-selected={selected}
      aria-label={`${cue.number} ${cue.label}，${statusLabels[cue.status]}，${conflicts.length} 个冲突`}
      className={`cue-row ${selected ? 'active' : ''} ${isDragging ? 'dragging' : ''}`}
      borderBottomWidth="1px"
      borderColor="whiteAlpha.100"
      onClick={onSelect}
    >
      <Flex align="center" gap={3} px={3} py={3}>
        <Tooltip label={disabled ? '场次已冻结或当前角色无排序权限' : '拖动调整提示顺序'}>
          <IconButton
            aria-label={`拖动 ${cue.number}`}
            icon={<GripVertical size={17} />}
            size="sm"
            variant="ghost"
            color="whiteAlpha.500"
            cursor={disabled ? 'not-allowed' : 'grab'}
            isDisabled={disabled}
            {...attributes}
            {...listeners}
          />
        </Tooltip>
        <Text w="42px" color="whiteAlpha.500" fontFamily="mono" fontSize="xs">
          {(index + 1).toString().padStart(2, '0')}
        </Text>
        <Box w="84px">
          <Text fontFamily="mono" fontWeight="700" color="amber.300">{cue.number}</Text>
          <Text color="whiteAlpha.500" fontSize="10px">{formatTime(cue.startTime)}</Text>
        </Box>
        <Box className="color-swatch" bg={cue.colorHex} boxSize="14px" flexShrink={0} />
        <Box minW={0} flex="1">
          <Flex align="center" gap={2}>
            <Text fontWeight="650" noOfLines={1}>{cue.label}</Text>
            {cue.followCueId ? <Tag size="sm" variant="subtle" colorScheme="purple">跟随</Tag> : null}
          </Flex>
          <Text color="whiteAlpha.500" fontSize="xs" noOfLines={1}>
            {cue.position} · {cue.channel} · {cue.color}
          </Text>
        </Box>
        <Box w="72px" textAlign="right">
          <Text fontFamily="mono" fontSize="sm">{cue.brightness}%</Text>
          <Text color="whiteAlpha.500" fontSize="10px">亮度</Text>
        </Box>
        <Box w="112px" textAlign="right" display={{ base: 'none', xl: 'block' }}>
          <Text fontFamily="mono" fontSize="xs">{cue.fadeIn}s / {cue.hold}s / {cue.fadeOut}s</Text>
          <Text color="whiteAlpha.500" fontSize="10px">入/保持/出</Text>
        </Box>
        <Tag size="sm" colorScheme={statusColors[cue.status]} minW="62px" justifyContent="center">
          {statusLabels[cue.status]}
        </Tag>
        <Tooltip label={conflicts.length ? conflicts.map((item) => item.message).join('；') : '无冲突'}>
          <Box color={conflicts.length ? (conflicts.some((item) => item.severity === 'error') ? 'red.300' : 'orange.300') : 'green.300'}>
            {conflicts.length ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          </Box>
        </Tooltip>
      </Flex>
    </Box>
  );
}

interface CueListProps {
  scene: Scene;
  selectedCueId: string;
  canEdit: boolean;
  conflicts: CueConflict[];
  onSelect: (cueId: string) => void;
  onReorder: (activeId: string, overId: string) => void;
}

function CueList({ scene, selectedCueId, canEdit, conflicts, onSelect, onReorder }: CueListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onReorder(String(active.id), String(over.id));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={scene.cues.map((cue) => cue.id)} strategy={verticalListSortingStrategy}>
        <Box role="listbox" aria-label={`${scene.name}灯光提示列表`} bg="blackAlpha.200" borderRadius="xl" overflow="hidden">
          {scene.cues.map((cue, index) => (
            <SortableCueRow
              key={cue.id}
              cue={cue}
              index={index}
              selected={cue.id === selectedCueId}
              disabled={!canEdit}
              conflicts={conflicts.filter((item) => item.cueId === cue.id)}
              onSelect={() => onSelect(cue.id)}
            />
          ))}
          {!scene.cues.length ? (
            <Flex minH="180px" align="center" justify="center" color="whiteAlpha.500">
              当前场次暂无提示，可使用“新增提示”开始设计。
            </Flex>
          ) : null}
        </Box>
      </SortableContext>
    </DndContext>
  );
}

interface InspectorProps {
  cue: Cue | undefined;
  scene: Scene;
  roles: UserRole;
  workspace: Workspace;
  canEdit: boolean;
  conflicts: CueConflict[];
  onApply: (draft: Cue) => void;
  onDelete: () => void;
  onSelectCue: (cueId: string) => void;
  onOpenChangeOrders: () => void;
}

function CueInspector({ cue, scene, workspace, canEdit, conflicts, onApply, onDelete, onSelectCue, onOpenChangeOrders }: InspectorProps) {
  const [draft, setDraft] = useState<Cue | null>(cue ? structuredClone(cue) : null);

  // 编程执行可直接编辑非受控字段；通道、亮度、渐变必须通过字段变更单申请
  const managedLocked = workspace.role === 'programmer';

  useEffect(() => {
    setDraft(cue ? structuredClone(cue) : null);
  }, [cue?.id]);

  if (!cue || !draft) {
    return (
      <Flex minH="360px" align="center" justify="center" color="whiteAlpha.500" textAlign="center">
        <Box>
          <Lightbulb size={34} style={{ margin: '0 auto 10px' }} />
          <Text>选择一条灯光提示查看并编辑参数</Text>
        </Box>
      </Flex>
    );
  }

  const update = <K extends keyof Cue>(key: K, value: Cue[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  return (
    <VStack align="stretch" spacing={4}>
      <Flex align="center">
        <Box>
          <Heading size="sm">{cue.number} · {cue.label}</Heading>
          <Text color="whiteAlpha.500" fontSize="xs">开始 {formatTime(cue.startTime)} · 总时长 {cue.duration?.toFixed(1)}s</Text>
        </Box>
        <Spacer />
        <Tag colorScheme={statusColors[cue.status]}>{statusLabels[cue.status]}</Tag>
      </Flex>

      {!canEdit ? (
        <Alert status="warning" borderRadius="lg">
          <AlertIcon />
          <AlertDescription fontSize="sm">
            {scene.frozen ? '该场次已冻结。解除冻结后才能修改。' : '当前角色只能查看或执行场次冻结，不能修改提示参数。'}
          </AlertDescription>
        </Alert>
      ) : null}

      {canEdit && managedLocked ? (
        <Alert status="info" borderRadius="lg" flexDirection="column" alignItems="start">
          <HStack mb={1}>
            <AlertIcon />
            <Text fontSize="sm" fontWeight="700">通道、亮度与渐变参数需走字段变更单</Text>
          </HStack>
          <AlertDescription fontSize="xs" lineHeight={1.7}>
            勾选要调的通道、亮度或渐变参数并写明原因，提交后由灯光设计审批；设计同意后才合入这几项，其余字段不受影响。
          </AlertDescription>
          <Button size="xs" mt={2} colorScheme="amber" leftIcon={<ClipboardList size={13} />} onClick={onOpenChangeOrders}>
            前往变更单提交申请
          </Button>
        </Alert>
      ) : null}

      <SimpleGrid columns={2} spacing={3}>
        <FormControl>
          <FormLabel htmlFor="cue-number">提示编号</FormLabel>
          <Input id="cue-number" value={draft.number} isDisabled={!canEdit} onChange={(event) => update('number', event.target.value)} />
        </FormControl>
        <FormControl>
          <FormLabel htmlFor="cue-label">提示名称</FormLabel>
          <Input id="cue-label" value={draft.label} isDisabled={!canEdit} onChange={(event) => update('label', event.target.value)} />
        </FormControl>
        <FormControl>
          <FormLabel htmlFor="cue-position">灯位 / 区域</FormLabel>
          <Input id="cue-position" value={draft.position} isDisabled={!canEdit} onChange={(event) => update('position', event.target.value)} />
        </FormControl>
        <FormControl>
          <FormLabel htmlFor="cue-channel">控制通道</FormLabel>
          <Input id="cue-channel" value={draft.channel} isDisabled={!canEdit || managedLocked} onChange={(event) => update('channel', event.target.value)} />
        </FormControl>
        <FormControl>
          <FormLabel htmlFor="cue-color">颜色名称</FormLabel>
          <Select id="cue-color" value={draft.color} isDisabled={!canEdit} onChange={(event) => update('color', event.target.value)}>
            {colorPresets.map((preset) => <option key={preset.value} value={preset.name}>{preset.name}</option>)}
          </Select>
        </FormControl>
        <FormControl>
          <FormLabel htmlFor="cue-color-hex">色值</FormLabel>
          <HStack>
            <Input
              id="cue-color-hex"
              type="color"
              p={1}
              w="56px"
              value={draft.colorHex}
              isDisabled={!canEdit}
              onChange={(event) => update('colorHex', event.target.value)}
            />
            <Input value={draft.colorHex} isDisabled={!canEdit} onChange={(event) => update('colorHex', event.target.value)} fontFamily="mono" />
          </HStack>
        </FormControl>
      </SimpleGrid>

      <FormControl>
        <FormLabel>亮度 {draft.brightness}%{managedLocked ? '（走变更单）' : ''}</FormLabel>
        <input
          aria-label="提示亮度"
          type="range"
          min={0}
          max={100}
          value={draft.brightness}
          disabled={!canEdit || managedLocked}
          onChange={(event) => update('brightness', Number(event.target.value))}
          style={{ width: '100%', accentColor: '#f6c453' }}
        />
      </FormControl>

      <SimpleGrid columns={3} spacing={3}>
        {([
          ['fadeIn', '渐入'],
          ['hold', '保持'],
          ['fadeOut', '渐出']
        ] as const).map(([key, label]) => (
          <FormControl key={key}>
            <FormLabel htmlFor={`cue-${key}`}>{label}（秒）{managedLocked ? ' · 走变更单' : ''}</FormLabel>
            <NumberInput
              id={`cue-${key}`}
              min={0}
              step={0.5}
              precision={1}
              value={draft[key]}
              isDisabled={!canEdit || managedLocked}
              onChange={(_, value) => update(key, Number.isNaN(value) ? draft[key] : value)}
            >
              <NumberInputField />
              <NumberInputStepper>
                <NumberIncrementStepper />
                <NumberDecrementStepper />
              </NumberInputStepper>
            </NumberInput>
          </FormControl>
        ))}
      </SimpleGrid>

      <FormControl>
        <FormLabel htmlFor="cue-follow">跟随关系</FormLabel>
        <Select
          id="cue-follow"
          value={draft.followCueId}
          isDisabled={!canEdit}
          onChange={(event) => update('followCueId', event.target.value)}
        >
          <option value="">不跟随，按顺序触发</option>
          {scene.cues.filter((item) => item.id !== cue.id).map((item) => (
            <option key={item.id} value={item.id}>{item.number} · {item.label}</option>
          ))}
        </Select>
        <Text mt={1} color="whiteAlpha.500" fontSize="11px">跟随目标结束后触发；时间会在拖拽或参数变化后自动重算。</Text>
      </FormControl>

      <FormControl>
        <FormLabel htmlFor="cue-target">触发点 / 舞台动作</FormLabel>
        <Input
          id="cue-target"
          value={draft.targetNote}
          isDisabled={!canEdit}
          onChange={(event) => update('targetNote', event.target.value)}
          placeholder="台词、音乐节拍、演员动作或手动 GO"
        />
      </FormControl>

      <FormControl>
        <FormLabel htmlFor="cue-notes">备注</FormLabel>
        <Textarea
          id="cue-notes"
          value={draft.notes}
          isDisabled={!canEdit}
          onChange={(event) => update('notes', event.target.value)}
          minH="92px"
          placeholder="记录焦点、遮光、设备限制或执行提醒"
        />
      </FormControl>

      <FormControl>
        <FormLabel>执行状态</FormLabel>
        <ButtonGroup isAttached variant="outline" width="100%">
          {(['draft', 'ready', 'confirmed'] as const).map((status) => (
            <Button
              key={status}
              flex="1"
              colorScheme={draft.status === status ? statusColors[status] : 'whiteAlpha'}
              variant={draft.status === status ? 'solid' : 'outline'}
              isDisabled={!canEdit}
              onClick={() => update('status', status)}
            >
              {statusLabels[status]}
            </Button>
          ))}
        </ButtonGroup>
      </FormControl>

      {conflicts.length ? (
        <Alert status={conflicts.some((item) => item.severity === 'error') ? 'error' : 'warning'} borderRadius="lg">
          <AlertIcon />
          <AlertDescription fontSize="sm">
            {conflicts.map((item) => item.message).join('；')}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert status="success" borderRadius="lg">
          <AlertIcon />
          <AlertDescription fontSize="sm">当前提示没有检测到时间、通道或数据冲突。</AlertDescription>
        </Alert>
      )}

      <HStack>
        <Button colorScheme="amber" isDisabled={!canEdit} leftIcon={<Save size={16} />} onClick={() => onApply(draft)}>
          应用参数并重算
        </Button>
        <Spacer />
        <Button colorScheme="red" variant="ghost" isDisabled={!canEdit} leftIcon={<Trash2 size={16} />} onClick={onDelete}>
          删除
        </Button>
      </HStack>

      <Divider />
      <Box>
        <Text color="whiteAlpha.600" fontSize="xs" mb={2}>其他提示快速跳转</Text>
        <HStack wrap="wrap">
          {scene.cues.filter((item) => item.id !== cue.id).map((item) => (
            <Button key={item.id} size="xs" variant="ghost" onClick={() => onSelectCue(item.id)}>{item.number}</Button>
          ))}
        </HStack>
      </Box>
    </VStack>
  );
}

interface ChangeOrdersPanelProps {
  workspace: Workspace;
  cue: Cue | undefined;
  scene: Scene | undefined;
  allConflicts: CueConflict[];
  onFocusCue: (order: FieldChangeOrder) => void;
  onSubmit: (items: FieldChangeItem[], reason: string, resubmitId: string | undefined, targetCueId: string) => void;
  onApprove: (order: FieldChangeOrder) => void;
  onWithdraw: (order: FieldChangeOrder) => void;
}

function ChangeOrdersPanel({
  workspace,
  cue,
  scene,
  allConflicts,
  onFocusCue,
  onSubmit,
  onApprove,
  onWithdraw
}: ChangeOrdersPanelProps) {
  const role = workspace.role;
  const canSubmit = canSubmitForRole(role);
  const canApprove = canApproveForRole(role);
  const frozen = Boolean(scene?.frozen);
  const [scope, setScope] = useState<'scene' | 'plan'>('scene');
  const [selected, setSelected] = useState<ChangeFieldKey[]>([]);
  const [proposed, setProposed] = useState<Partial<Record<ChangeFieldKey, string>>>({});
  const [reason, setReason] = useState('');
  const [resubmitId, setResubmitId] = useState<string | undefined>(undefined);
  // 表单目标提示：默认跟随当前选中；重提其他提示的单子时显式指定
  const [formCueId, setFormCueId] = useState<string | undefined>(undefined);

  const formCue = useMemo(() => {
    if (formCueId) {
      return workspace.plans
        .find((plan) => plan.id === workspace.activePlanId)
        ?.scenes.flatMap((item) => item.cues)
        .find((item) => item.id === formCueId);
    }
    return cue;
  }, [formCueId, cue, workspace.plans, workspace.activePlanId]);
  const formScene = useMemo(
    () =>
      workspace.plans
        .find((plan) => plan.id === workspace.activePlanId)
        ?.scenes.find((item) => item.cues.some((candidate) => candidate.id === formCue?.id)),
    [workspace.plans, workspace.activePlanId, formCue?.id]
  );
  const formFrozen = Boolean(formScene?.frozen);

  const orders = useMemo(() => {
    const list = workspace.changeOrders
      .filter((order) => order.planId === workspace.activePlanId)
      .filter((order) => (scope === 'scene' ? order.sceneId === workspace.selectedSceneId : true))
      .sort((a, b) => (a.status === 'merged' || a.status === 'withdrawn' ? 1 : 0) - (b.status === 'merged' || b.status === 'withdrawn' ? 1 : 0) || b.requestedAt.localeCompare(a.requestedAt));
    return list;
  }, [workspace.changeOrders, workspace.activePlanId, workspace.selectedSceneId, scope]);

  const pendingCount = workspace.changeOrders.filter(
    (order) => order.planId === workspace.activePlanId && (order.status === 'pending' || order.status === 'conflict')
  ).length;

  // 切换场次或选中提示时，若表单没有被“重提”钉在其他提示上，则重置并跟随当前提示
  useEffect(() => {
    if (resubmitId) return;
    setFormCueId(undefined);
    setSelected([]);
    setProposed({});
    setReason('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cue?.id, workspace.selectedSceneId]);

  // 自动带出表单目标提示的进行中变更单
  const activeOrder = formCue
    ? workspace.changeOrders.find(
        (order) => order.cueId === formCue.id && (order.status === 'pending' || order.status === 'conflict')
      )
    : undefined;

  function toggleField(key: ChangeFieldKey) {
    if (selected.includes(key)) {
      setSelected(selected.filter((item) => item !== key));
      setProposed((values) => ({ ...values, [key]: undefined }));
    } else {
      setSelected([...selected, key]);
      setProposed((values) => ({ ...values, [key]: String(cue?.[key] ?? '') }));
    }
  }

  function startResubmit(order: FieldChangeOrder) {
    setResubmitId(order.id);
    setFormCueId(order.cueId);
    const keys = order.items.filter((item) => item.outcome !== 'merged').map((item) => item.field);
    setSelected(keys);
    const values: Partial<Record<ChangeFieldKey, string>> = {};
    for (const item of order.items) {
      if (item.outcome !== 'merged') values[item.field] = String(item.proposed);
    }
    setProposed(values);
    setReason(order.reason);
  }

  function cancelResubmit() {
    setResubmitId(undefined);
    setFormCueId(undefined);
    setSelected([]);
    setProposed({});
    setReason('');
  }

  function submit() {
    if (!formCue) return;
    const items: FieldChangeItem[] = [];
    for (const key of selected) {
      const raw = proposed[key] ?? '';
      if (key === 'channel') {
        if (!raw.trim()) return;
        items.push({ field: key, baseline: formCue.channel, proposed: raw.trim() });
      } else {
        const numeric = Number(raw);
        if (!Number.isFinite(numeric)) return;
        items.push({ field: key, baseline: formCue[key] as number, proposed: numeric });
      }
    }
    if (!items.length || !reason.trim()) return;
    onSubmit(items, reason, resubmitId, formCue.id);
    setSelected([]);
    setProposed({});
    setReason('');
    setResubmitId(undefined);
    setFormCueId(undefined);
  }

  const formDisabledReason = formFrozen
    ? '冻结场次不能提交变更单，请先由灯光设计或舞台监督解除冻结。'
    : !formCue
      ? '请先选择一条提示。'
      : !canSubmit
        ? canApprove
          ? '灯光设计在“待审批”列表中合入即可，无需自行提交。'
          : '当前角色只能查看变更单。'
        : activeOrder && activeOrder.id !== resubmitId
          ? `该提示已有${changeOrderStatusMeta[activeOrder.status].label}的变更单，请等待审批或在下方处理。`
          : '';

  return (
    <VStack align="stretch" spacing={4}>
      <HStack>
        <ButtonGroup size="xs" isAttached variant="outline">
          <Button variant={scope === 'scene' ? 'solid' : 'outline'} colorScheme={scope === 'scene' ? 'amber' : 'whiteAlpha'} onClick={() => setScope('scene')}>本场</Button>
          <Button variant={scope === 'plan' ? 'solid' : 'outline'} colorScheme={scope === 'plan' ? 'amber' : 'whiteAlpha'} onClick={() => setScope('plan')}>本方案全部</Button>
        </ButtonGroup>
        <Spacer />
        <Tag size="sm" colorScheme={pendingCount ? 'orange' : 'green'}>{pendingCount ? `${pendingCount} 单待处理` : '无待处理'}</Tag>
      </HStack>

      {canSubmit && formCue ? (
        <Box p={3} borderRadius="lg" borderWidth="1px" borderColor="whiteAlpha.100" bg="blackAlpha.200">
          <HStack mb={2}>
            <ClipboardList size={15} color="#f6c453" />
            <Text fontWeight="700" fontSize="sm">
              {resubmitId
                ? `重提 ${formCue.number} 的冲突项`
                : `为 ${formCue.number} · ${formCue.label} 提交变更单`}
            </Text>
            {formScene && formScene.id !== workspace.selectedSceneId ? (
              <Tag size="sm" colorScheme="purple">来自 {formScene.name}</Tag>
            ) : null}
          </HStack>

          {formDisabledReason ? (
            <Alert status={formFrozen ? 'warning' : 'info'} borderRadius="md" mb={2}>
              <AlertIcon />
              <AlertDescription fontSize="xs">{formDisabledReason}</AlertDescription>
            </Alert>
          ) : null}

          <VStack align="stretch" spacing={1} mb={3}>
            {changeFieldDefs.map((def) => {
              const checked = selected.includes(def.key);
              const baseline = String(formCue[def.key]);
              return (
                <Flex
                  key={def.key}
                  align="center"
                  gap={2}
                  px={2}
                  py={1.5}
                  borderRadius="md"
                  bg={checked ? 'amber.900' : 'whiteAlpha.50'}
                  borderWidth="1px"
                  borderColor={checked ? 'amber.600' : 'transparent'}
                >
                  <Checkbox
                    aria-label={`勾选申请调整${def.label}`}
                    isChecked={checked}
                    isDisabled={Boolean(formDisabledReason)}
                    onChange={() => toggleField(def.key)}
                    colorScheme="amber"
                  >
                    <HStack spacing={1}>
                      <Tag size="sm" variant="subtle">{def.group}</Tag>
                      <Text fontSize="xs" fontWeight={650}>{def.label}</Text>
                    </HStack>
                  </Checkbox>
                  <Spacer />
                  {checked ? (
                    def.key === 'channel' ? (
                      <Input
                        aria-label={`${def.label}新值`}
                        size="xs"
                        w="150px"
                        fontFamily="mono"
                        value={proposed[def.key] ?? ''}
                        onChange={(event) => setProposed((values) => ({ ...values, [def.key]: event.target.value }))}
                      />
                    ) : (
                      <NumberInput
                        aria-label={`${def.label}新值`}
                        size="xs"
                        w="110px"
                        min={0}
                        max={def.key === 'brightness' ? 100 : undefined}
                        step={0.5}
                        precision={1}
                        value={proposed[def.key] ?? '0'}
                        onChange={(value) => setProposed((values) => ({ ...values, [def.key]: value }))}
                      >
                        <NumberInputField fontFamily="mono" />
                        <NumberInputStepper>
                          <NumberIncrementStepper />
                          <NumberDecrementStepper />
                        </NumberInputStepper>
                      </NumberInput>
                    )
                  ) : (
                    <Text fontSize="xs" color="whiteAlpha.500" fontFamily="mono">现值 {baseline}{def.unit ?? ''}</Text>
                  )}
                </Flex>
              );
            })}
          </VStack>

          <FormControl mb={3}>
            <FormLabel htmlFor="co-reason">调整原因（必填）</FormLabel>
            <Textarea
              id="co-reason"
              size="sm"
              minH="64px"
              value={reason}
              isDisabled={Boolean(formDisabledReason)}
              onChange={(event) => setReason(event.target.value)}
              placeholder="排练实测：例如该通道偏暗、渐入跟不上台词点……"
            />
          </FormControl>

          <HStack>
            <Button
              size="sm"
              colorScheme="amber"
              leftIcon={<Send size={14} />}
              isDisabled={Boolean(formDisabledReason) || !selected.length || !reason.trim()}
              onClick={submit}
            >
              {resubmitId ? '重新提交审批' : '提交变更单'}
            </Button>
            {resubmitId ? (
              <Button size="sm" variant="ghost" leftIcon={<RotateCcw size={14} />} onClick={cancelResubmit}>取消重提</Button>
            ) : null}
          </HStack>
        </Box>
      ) : null}

      {!orders.length ? (
        <Flex minH="140px" align="center" justify="center" color="whiteAlpha.500" fontSize="sm" textAlign="center">
          {scope === 'scene' ? '本场暂无变更单。' : '本方案暂无变更单。'}
        </Flex>
      ) : (
        <VStack align="stretch" spacing={3}>
          {orders.map((order) => (
            <ChangeOrderCard
              key={order.id}
              order={order}
              workspace={workspace}
              conflicts={allConflicts}
              canApprove={canApprove}
              canSubmit={canSubmit}
              currentCueId={cue?.id}
              onFocus={() => onFocusCue(order)}
              onApprove={() => onApprove(order)}
              onWithdraw={() => onWithdraw(order)}
              onResubmit={() => {
                if (cue?.id !== order.cueId) onFocusCue(order);
                startResubmit(order);
              }}
              resubmitting={resubmitId === order.id && formCueId === order.cueId}
            />
          ))}
        </VStack>
      )}
    </VStack>
  );
}

interface ChangeOrderCardProps {
  order: FieldChangeOrder;
  workspace: Workspace;
  conflicts: CueConflict[];
  canApprove: boolean;
  canSubmit: boolean;
  currentCueId?: string;
  resubmitting: boolean;
  onFocus: () => void;
  onApprove: () => void;
  onWithdraw: () => void;
  onResubmit: () => void;
}

function ChangeOrderCard({
  order,
  workspace,
  conflicts,
  canApprove,
  canSubmit,
  currentCueId,
  resubmitting,
  onFocus,
  onApprove,
  onWithdraw,
  onResubmit
}: ChangeOrderCardProps) {
  const { scene, cue } = findCueLocation(workspace.plans, order.planId, order.cueId);
  const evaluation = evaluateOrder(order, cue);
  const meta = changeOrderStatusMeta[order.status];
  const driftedKeys = evaluation.drifted;
  const cueConflicts = order.status === 'merged' && scene
    ? relatedOverlapFollowConflicts(conflicts, order.planId, scene, order.cueId)
    : [];
  const showApproveWarning = order.status === 'pending' && driftedKeys.size > 0;
  const approveBlocked = !scene || scene.frozen || order.status !== 'pending';

  return (
    <Box
      p={3}
      borderRadius="lg"
      borderWidth="1px"
      borderColor={
        order.status === 'conflict' ? 'red.700' : order.status === 'merged' ? 'green.800' : order.status === 'withdrawn' ? 'whiteAlpha.100' : 'orange.700'
      }
      bg={order.status === 'conflict' ? 'red.900' : order.status === 'merged' ? 'green.900' : order.status === 'withdrawn' ? 'blackAlpha.200' : 'orange.900'}
    >
      <Flex align="center" gap={2} mb={2}>
        <Box as="button" type="button" textAlign="left" onClick={onFocus} _hover={{ textDecoration: 'underline' }}>
          <HStack>
            <Text fontFamily="mono" fontSize="sm" color="amber.300">{order.cueNumber}</Text>
            <Text fontSize="sm" fontWeight={650}>{order.cueLabel}</Text>
            {scene ? <Tag size="sm" variant="outline">{scene.name}</Tag> : null}
          </HStack>
        </Box>
        <Spacer />
        <Tag size="sm" colorScheme={meta.color}>{meta.label}</Tag>
      </Flex>

      {!cue ? (
        <Alert status="warning" borderRadius="md" mb={2}>
          <AlertIcon />
          <AlertDescription fontSize="xs">对应提示已删除，变更单仅留档，无法继续操作。</AlertDescription>
        </Alert>
      ) : null}

      <VStack align="stretch" spacing={1} mb={2}>
        {order.items.map((item) => {
          const drifted = driftedKeys.has(item.field);
          return (
            <Flex key={item.field} fontSize="xs" align="center" gap={2} fontFamily="mono">
              <Text w="42px" color="whiteAlpha.600">{changeFieldLabels[item.field]}</Text>
              <Text as="span" color={item.outcome === 'merged' ? 'green.300' : 'whiteAlpha.600'} textDecoration={item.outcome === 'merged' ? undefined : 'line-through'}>
                {formatFieldValue(item.field, item.baseline)}
              </Text>
              <ChevronRight size={12} />
              <Text as="span" fontWeight={700}>{formatFieldValue(item.field, item.proposed)}</Text>
              {item.outcome === 'merged' ? <Tag size="sm" colorScheme="green">已合入</Tag> : null}
              {item.outcome === 'conflicted' || drifted ? (
                <Tag size="sm" colorScheme="red">
                  {item.outcome === 'conflicted' ? '已被改动 · 保留新值' : `现值已改为 ${cue ? formatFieldValue(item.field, cue[item.field] as string | number) : '—'}`}
                </Tag>
              ) : null}
            </Flex>
          );
        })}
      </VStack>

      <Text fontSize="xs" color="whiteAlpha.700" mb={2}><Text as="span" color="whiteAlpha.500">原因：</Text>{order.reason}</Text>

      {showApproveWarning ? (
        <Alert status="error" borderRadius="md" mb={2}>
          <AlertIcon />
          <AlertDescription fontSize="xs">
            提交后有 {driftedKeys.size} 项目标字段又被改过（{[...driftedKeys].map((key) => changeFieldLabels[key]).join('、')}）。同意合入时这些项将标记冲突并保留现值，其余项照常合入。
          </AlertDescription>
        </Alert>
      ) : null}

      {order.status === 'merged' && order.reviewNote ? (
        <Alert status={cueConflicts.length ? 'warning' : 'success'} borderRadius="md" mb={2}>
          <AlertIcon />
          <AlertDescription fontSize="xs">{order.reviewNote}</AlertDescription>
        </Alert>
      ) : null}

      <VStack align="stretch" spacing={0} mb={2}>
        {order.history.slice(-3).map((entry, index) => (
          <HStack key={`${entry.at}-${index}`} fontSize="10px" color="whiteAlpha.500" spacing={2}>
            <Clock3 size={10} />
            <Text>{new Date(entry.at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</Text>
            <Text noOfLines={1}>{entry.action}</Text>
          </HStack>
        ))}
      </VStack>

      <HStack>
        {canApprove && order.status === 'pending' && cue ? (
          <Button
            size="xs"
            colorScheme={showApproveWarning ? 'red' : 'green'}
            leftIcon={<CheckCircle2 size={13} />}
            isDisabled={approveBlocked}
            onClick={onApprove}
          >
            {scene?.frozen ? '冻结场次不可合入' : showApproveWarning ? '按规则处理并合入其余项' : '同意并合入勾选项'}
          </Button>
        ) : null}
        {canSubmit && order.status === 'conflict' && cue ? (
          <Button size="xs" colorScheme="amber" leftIcon={<RotateCcw size={13} />} isDisabled={scene?.frozen} onClick={onResubmit}>
            {scene?.frozen ? '冻结场次不可重提' : resubmitting && currentCueId === order.cueId ? '已载入，请在上方调整后提交' : '按最新值重提'}
          </Button>
        ) : null}
        {canSubmit && (order.status === 'pending' || order.status === 'conflict') && cue ? (
          <Button size="xs" variant="ghost" colorScheme="gray" leftIcon={<Ban size={13} />} onClick={onWithdraw}>撤回</Button>
        ) : null}
        {!canApprove && !canSubmit && (order.status === 'pending' || order.status === 'conflict') ? (
          <Text fontSize="10px" color="whiteAlpha.500">等待灯光设计审批合入。</Text>
        ) : null}
      </HStack>
    </Box>
  );
}

function ConflictList({
  conflicts,
  onSelect
}: {
  conflicts: CueConflict[];
  onSelect: (sceneId: string, cueId: string) => void;
}) {
  if (!conflicts.length) {
    return (
      <Flex minH="240px" align="center" justify="center" color="green.300" textAlign="center">
        <Box>
          <ShieldCheck size={36} style={{ margin: '0 auto 10px' }} />
          <Text>没有检测到时间、通道或数据冲突</Text>
        </Box>
      </Flex>
    );
  }

  return (
    <VStack align="stretch" spacing={3}>
      {conflicts.map((conflict) => (
        <Box
          key={conflict.id}
          as="button"
          textAlign="left"
          p={3}
          borderRadius="lg"
          borderWidth="1px"
          borderColor={conflict.severity === 'error' ? 'red.700' : 'orange.700'}
          bg={conflict.severity === 'error' ? 'red.900' : 'orange.900'}
          _hover={{ filter: 'brightness(1.12)' }}
          onClick={() => onSelect(conflict.sceneId, conflict.cueId)}
        >
          <HStack mb={1}>
            <AlertCircle size={15} color={conflict.severity === 'error' ? '#fc8181' : '#f6ad55'} />
            <Text fontSize="xs" color="whiteAlpha.700">{conflictLabel(conflict)}</Text>
          </HStack>
          <Text fontSize="sm">{conflict.message}</Text>
        </Box>
      ))}
    </VStack>
  );
}

function ComparePlan({
  activePlan,
  comparePlan,
  sceneOrder,
  onSelectCue
}: {
  activePlan: LightingPlan;
  comparePlan: LightingPlan;
  sceneOrder: number;
  onSelectCue: (cueId: string) => void;
}) {
  const leftScene = activePlan.scenes.find((scene) => scene.order === sceneOrder) ?? activePlan.scenes[0];
  const rightScene = comparePlan.scenes.find((scene) => scene.order === sceneOrder) ?? comparePlan.scenes[0];

  function column(plan: LightingPlan, scene: Scene | undefined, active: boolean) {
    return (
      <Box borderWidth="1px" borderColor="whiteAlpha.100" borderRadius="lg" overflow="hidden" bg="blackAlpha.200">
        <Box px={3} py={2} bg={active ? 'blue.900' : 'whiteAlpha.50'}>
          <Text fontWeight="700" fontSize="sm">{plan.name}</Text>
          <Text color="whiteAlpha.500" fontSize="xs">{scene?.name ?? '无对应场次'} · {formatTime(scene?.duration)}</Text>
        </Box>
        <VStack align="stretch" spacing={0}>
          {scene?.cues.map((cue) => (
            <Flex key={cue.id} px={3} py={2} borderBottomWidth="1px" borderColor="whiteAlpha.50" align="center" gap={2}>
              <Box className="color-swatch" bg={cue.colorHex} />
              <Text fontFamily="mono" fontSize="xs" color="amber.300" w="42px">{cue.number}</Text>
              <Box flex="1" minW={0}>
                <Text fontSize="xs" noOfLines={1}>{cue.label}</Text>
                <Text color="whiteAlpha.500" fontSize="10px">{formatTime(cue.startTime)} · {cue.channel} · {cue.brightness}%</Text>
              </Box>
              {active ? (
                <IconButton aria-label={`选择 ${cue.number}`} size="xs" variant="ghost" icon={<ChevronRight size={14} />} onClick={() => onSelectCue(cue.id)} />
              ) : null}
            </Flex>
          ))}
          {!scene?.cues.length ? <Text p={4} color="whiteAlpha.500" fontSize="sm">该方案此处无对应提示。</Text> : null}
        </VStack>
      </Box>
    );
  }

  return (
    <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr' }} gap={3}>
      {column(activePlan, leftScene, true)}
      {column(comparePlan, rightScene, false)}
    </Grid>
  );
}

export default function App() {
  const [state, dispatch] = useLightingDesk();
  const [hydrated, setHydrated] = useState(false);
  const [online, setOnline] = useState(true);
  const [savedAt, setSavedAt] = useState('');
  const [syncMessage, setSyncMessage] = useState('离线草稿待命');
  const [rightTab, setRightTab] = useState(0);
  const toast = useToast();
  const workspace = state.workspace;
  const activePlan = findActivePlan(workspace);
  const activeScene = findActiveScene(workspace);
  const selectedCue = findActiveCue(workspace);
  const comparePlan = workspace.plans.find((plan) => plan.id === workspace.comparePlanId) ?? workspace.plans[0];
  const allConflicts = useMemo(() => detectConflicts(workspace.plans), [workspace.plans]);
  const activeConflicts = allConflicts.filter((item) => item.planId === activePlan.id);
  const activeCueConflicts = selectedCue
    ? allConflicts.filter((item) => item.cueId === selectedCue.id)
    : [];
  const editable = canEditScene(workspace.role, activeScene);
  const freezer = canFreeze(workspace.role);
  const incompleteCount = activePlan.scenes.flatMap((scene) => scene.cues).filter((cue) => cue.status !== 'confirmed').length;
  const pendingOrderCount = workspace.changeOrders.filter(
    (order) => order.planId === activePlan.id && (order.status === 'pending' || order.status === 'conflict')
  ).length;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LIGHTING_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Workspace;
        if (parsed.plans?.length) dispatch({ type: 'hydrate', workspace: parsed });
      }
    } catch {
      setSyncMessage('离线草稿损坏，已载入模拟方案');
    }
    setHydrated(true);
    setOnline(navigator.onLine);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      localStorage.setItem(LIGHTING_STORAGE_KEY, JSON.stringify(workspace));
      setSavedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [hydrated, workspace]);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  function commit(label: string, mutate: (next: Workspace) => void) {
    dispatch({ type: 'commit', label, mutate });
  }

  function reorderCue(activeId: string, overId: string) {
    commit('拖动提示并自动重算时间', (next) => {
      const plan = next.plans.find((item) => item.id === next.activePlanId);
      const scene = plan?.scenes.find((item) => item.id === next.selectedSceneId);
      if (!scene) return;
      const oldIndex = scene.cues.findIndex((cue) => cue.id === activeId);
      const newIndex = scene.cues.findIndex((cue) => cue.id === overId);
      if (oldIndex < 0 || newIndex < 0) return;
      scene.cues = arrayMove(scene.cues, oldIndex, newIndex);
    });
  }

  function applyCue(draft: Cue) {
    const role = workspace.role;
    commit(role === 'programmer' ? '应用非受控参数（通道/亮度/渐变请走变更单）' : '应用提示参数并重算', (next) => {
      const cue = next.plans
        .find((plan) => plan.id === next.activePlanId)
        ?.scenes.find((scene) => scene.id === next.selectedSceneId)
        ?.cues.find((item) => item.id === draft.id);
      if (!cue) return;
      const { startTime: _start, duration: _duration, endTime: _end, ...fields } = draft;
      // 编程执行只能直接合并非受控字段；通道、亮度、渐变保留现值，须经变更单审批
      if (role === 'programmer') {
        for (const key of MANAGED_CHANGE_FIELDS) delete (fields as Partial<Cue>)[key];
      }
      Object.assign(cue, fields);
    });
    toast({
      title: role === 'programmer' ? '已保存非受控参数' : '提示参数已应用',
      description: role === 'programmer' ? '通道、亮度与渐变需在“变更单”页提交申请。' : undefined,
      status: 'success',
      duration: 2200
    });
  }

  function deleteCue() {
    if (!selectedCue || !window.confirm(`删除提示 ${selectedCue.number}？后续时间将自动重算。`)) return;
    commit('删除灯光提示', (next) => {
      const scene = next.plans
        .find((plan) => plan.id === next.activePlanId)
        ?.scenes.find((item) => item.id === next.selectedSceneId);
      if (!scene) return;
      scene.cues = scene.cues.filter((cue) => cue.id !== selectedCue.id);
      next.selectedCueId = scene.cues[0]?.id ?? '';
      // 该提示仍待处理的变更单无法再合入，自动撤回留档；已合入/已撤回的继续保留
      for (const order of next.changeOrders) {
        if (order.cueId === selectedCue.id && (order.status === 'pending' || order.status === 'conflict')) {
          order.status = 'withdrawn';
          order.history.push({ at: new Date().toISOString(), action: '提示被删除，待处理变更单自动撤回留档' });
        }
      }
    });
  }

  function addCue() {
    if (!activeScene) return;
    const id = `cue-${Date.now().toString(36)}`;
    commit('新增灯光提示', (next) => {
      const scene = next.plans
        .find((plan) => plan.id === next.activePlanId)
        ?.scenes.find((item) => item.id === next.selectedSceneId);
      if (!scene) return;
      const sequence = scene.cues.length + 1;
      scene.cues.push({
        id,
        number: `Q${activeScene.order * 10 + sequence}`,
        label: '新提示',
        position: '待指定',
        channel: '',
        color: '暖白',
        colorHex: '#FFF1C7',
        brightness: 60,
        fadeIn: 3,
        hold: 5,
        fadeOut: 3,
        followCueId: '',
        targetNote: '',
        notes: '',
        status: 'draft'
      });
      next.selectedCueId = id;
    });
  }

  function toggleFreeze() {
    if (!activeScene || !freezer) {
      toast({ title: '当前角色不能冻结或解冻场次', status: 'warning' });
      return;
    }
    const hasBlockingOrders = workspace.changeOrders.some(
      (order) => order.planId === activePlan.id && order.sceneId === activeScene.id &&
        (order.status === 'pending' || order.status === 'conflict')
    );
    if (!activeScene.frozen && hasBlockingOrders) {
      toast({
        title: '本场还有待处理变更单',
        description: '请先合入、重提或撤回后再冻结；冻结场次不能提交或批准变更单。',
        status: 'warning'
      });
      return;
    }
    commit(activeScene.frozen ? '解除场次冻结' : '冻结已确认场次', (next) => {
      const scene = next.plans.find((plan) => plan.id === next.activePlanId)?.scenes.find((item) => item.id === next.selectedSceneId);
      if (scene) scene.frozen = !scene.frozen;
    });
  }

  function submitChangeOrder(items: FieldChangeItem[], reason: string, resubmitId: string | undefined, targetCueId: string) {
    if (!activePlan) return;
    const targetScene = activePlan.scenes.find((item) => item.cues.some((candidate) => candidate.id === targetCueId));
    const targetCue = targetScene?.cues.find((item) => item.id === targetCueId);
    if (!targetScene || !targetCue) {
      toast({ title: '目标提示不存在，无法提交变更单', status: 'error' });
      return;
    }
    if (targetScene.frozen) {
      toast({ title: '冻结场次不能提交变更单', status: 'error' });
      return;
    }
    if (!canSubmitForRole(workspace.role)) {
      toast({ title: '仅编程执行（现场）可提交字段变更单', status: 'warning' });
      return;
    }
    commit(resubmitId ? '重提字段变更单' : '提交字段变更单', (next) => {
      const liveCue = next.plans
        .find((plan) => plan.id === next.activePlanId)
        ?.scenes.find((sceneItem) => sceneItem.cues.some((candidate) => candidate.id === targetCueId))
        ?.cues.find((item) => item.id === targetCueId);
      if (!liveCue) return;
      const refreshedItems = items.map((item) => ({
        ...item,
        baseline: liveCue[item.field] as string | number
      }));
      const order = next.changeOrders.find((item) => item.id === resubmitId);
      if (order) {
        // 冲突单重提：基准刷新为当前新值，只保留仍需调整的项
        order.items = refreshedItems.map((item) => ({ ...item, outcome: undefined }));
        order.reason = reason.trim();
        order.status = 'pending';
        order.decidedAt = undefined;
        order.reviewNote = undefined;
        order.requestedAt = new Date().toISOString();
        order.history.push({
          at: order.requestedAt,
          action: `现场人员按最新值重提 ${order.items.length} 项，等待再次审批`
        });
      } else {
        const liveSceneId = next.plans
          .find((plan) => plan.id === next.activePlanId)
          ?.scenes.find((sceneItem) => sceneItem.cues.some((candidate) => candidate.id === targetCueId))?.id ?? '';
        next.changeOrders.push(
          createChangeOrder({
            cue: liveCue,
            planId: next.activePlanId,
            sceneId: liveSceneId,
            items: refreshedItems,
            reason,
            role: next.role
          })
        );
      }
    });
    toast({ title: resubmitId ? '变更单已重提，等待设计审批' : '变更单已提交，等待灯光设计审批', status: 'success' });
  }

  function approveChangeOrder(order: FieldChangeOrder) {
    if (!canApproveForRole(workspace.role)) {
      toast({ title: '仅灯光设计可批准变更单', status: 'warning' });
      return;
    }
    const location = findCueLocation(workspace.plans, order.planId, order.cueId);
    if (!location.scene || !location.cue) {
      toast({ title: '对应提示或场次已不存在，无法合入', status: 'error' });
      return;
    }
    if (location.scene.frozen) {
      toast({ title: '冻结场次不能批准变更单', status: 'error' });
      return;
    }
    if (order.status !== 'pending') {
      toast({ title: '该变更单存在冲突项', description: '请通知现场按最新值重提后再审批。', status: 'warning' });
      return;
    }

    // 先在克隆数据上模拟一次，拿到合入后的叠光/跟随核对结果
    const simulation = structuredClone(workspace);
    const simLocation = findCueLocation(simulation.plans, order.planId, order.cueId);
    let mergedKeys: ChangeFieldKey[] = [];
    let conflictedKeys: ChangeFieldKey[] = [];
    let postConflicts: ReturnType<typeof previewPostMergeConflicts> = [];
    if (simLocation.scene && simLocation.cue) {
      const simOrder = simulation.changeOrders.find((item) => item.id === order.id);
      if (simOrder) {
        const result = applyApproval(simOrder, simLocation.cue);
        mergedKeys = result.mergedKeys;
        conflictedKeys = result.conflictedKeys;
        postConflicts = previewPostMergeConflicts(simulation.plans, order.planId, order.sceneId, order.cueId);
      }
    }

    commit(conflictedKeys.length ? '部分合入：冲突项保留现值待重提' : '审批合入字段变更单', (next) => {
      const live = findCueLocation(next.plans, order.planId, order.cueId);
      const liveOrder = next.changeOrders.find((item) => item.id === order.id);
      if (!live.scene || !live.cue || !liveOrder) return;
      const result = applyApproval(liveOrder, live.cue);
      mergedKeys = result.mergedKeys;
      conflictedKeys = result.conflictedKeys;
      if (!conflictedKeys.length) {
        const finalConflicts = previewPostMergeConflicts(next.plans, order.planId, order.sceneId, order.cueId);
        liveOrder.reviewNote = reviewSummary(finalConflicts);
      }
    });

    if (conflictedKeys.length) {
      toast({
        title: `已合入 ${mergedKeys.length} 项，${conflictedKeys.length} 项冲突`,
        description: '提交后又被改过的字段保留当前新值，变更单已留下待现场重提。',
        status: 'warning',
        duration: 3600
      });
    } else {
      toast({
        title: `已合入 ${mergedKeys.length} 项并重新核对`,
        description: postConflicts.length ? reviewSummary(postConflicts) : '叠光与跟随关系核对通过。',
        status: postConflicts.length ? 'warning' : 'success',
        duration: 3200
      });
    }
  }

  function withdrawChangeOrder(order: FieldChangeOrder) {
    commit('撤回字段变更单', (next) => {
      const live = next.changeOrders.find((item) => item.id === order.id);
      if (!live) return;
      live.status = 'withdrawn';
      live.history.push({ at: new Date().toISOString(), action: '现场人员撤回该变更单' });
    });
    toast({ title: '变更单已撤回并留档', status: 'info' });
  }

  function focusOrderCue(order: FieldChangeOrder) {
    const plan = workspace.plans.find((item) => item.id === order.planId);
    const scene = plan?.scenes.find((item) => item.id === order.sceneId);
    if (!plan || !scene) {
      toast({ title: '该变更单所属方案或场次已不存在', status: 'warning' });
      return;
    }
    if (plan.id !== workspace.activePlanId) {
      dispatch({ type: 'selectPlan', planId: plan.id });
    }
    dispatch({ type: 'selectCue', sceneId: scene.id, cueId: order.cueId });
  }

  function duplicatePlan() {
    const id = `plan-${Date.now().toString(36)}`;
    commit('复制为新方案', (next) => {
      const source = next.plans.find((plan) => plan.id === next.activePlanId);
      if (!source) return;
      const copy = structuredClone(source);
      copy.id = id;
      copy.name = `${source.name} · 副本`;
      copy.description = '从现有方案复制，可独立调整场次和提示。';
      copy.scenes.forEach((scene) => {
        scene.id = `${id}-${scene.id}`;
        scene.cues.forEach((cue) => {
          cue.id = `${id}-${cue.id}`;
          cue.followCueId = cue.followCueId ? `${id}-${cue.followCueId}` : '';
        });
      });
      next.plans.push(copy);
      next.activePlanId = id;
      next.comparePlanId = source.id;
      next.selectedSceneId = copy.scenes[0]?.id ?? '';
      next.selectedCueId = copy.scenes[0]?.cues[0]?.id ?? '';
    });
    toast({ title: '已复制方案', status: 'success' });
  }

  function jumpIncomplete() {
    const scenes = activePlan.scenes;
    const startScene = Math.max(0, scenes.findIndex((scene) => scene.id === activeScene?.id));
    const all: { scene: Scene; cue: Cue }[] = [];
    for (let index = 0; index < scenes.length; index += 1) {
      const scene = scenes[(startScene + index) % scenes.length];
      scene.cues.forEach((cue) => {
        const hasConflict = activeConflicts.some((item) => item.cueId === cue.id && item.severity === 'error');
        if (cue.status !== 'confirmed' || hasConflict) all.push({ scene, cue });
      });
    }
    const currentIndex = all.findIndex((item) => item.cue.id === selectedCue?.id);
    const target = all[(currentIndex + 1) % Math.max(1, all.length)];
    if (!target) {
      toast({ title: '所有提示均已完成且无阻断冲突', status: 'success' });
      return;
    }
    dispatch({ type: 'selectCue', sceneId: target.scene.id, cueId: target.cue.id });
    window.setTimeout(() => document.getElementById(`cue-${target.cue.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }

  async function persistNow() {
    setSyncMessage('正在模拟同步到制作服务器…');
    await new Promise((resolve) => window.setTimeout(resolve, 320));
    localStorage.setItem(LIGHTING_STORAGE_KEY, JSON.stringify(workspace));
    setSavedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
    setSyncMessage('模拟接口返回 200，本地草稿保持一致');
    toast({ title: '当前方案已保存', description: syncMessage, status: 'success', duration: 2200 });
  }

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void persistNow();
        return;
      }
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
        return;
      }
      if (modifier && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        dispatch({ type: 'redo' });
        return;
      }
      if (typing) return;
      if (event.altKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        jumpIncomplete();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!activeScene?.cues.length) return;
        const index = activeScene.cues.findIndex((cue) => cue.id === selectedCue?.id);
        const nextIndex = Math.max(0, Math.min(activeScene.cues.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
        dispatch({ type: 'selectCue', sceneId: activeScene.id, cueId: activeScene.cues[nextIndex].id });
      } else if (event.key.toLowerCase() === 'f') {
        toggleFreeze();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  function selectCue(sceneId: string, cueId: string) {
    dispatch({ type: 'selectCue', sceneId, cueId });
  }

  function exportPlan() {
    const payload = {
      exportedAt: new Date().toISOString(),
      plan: activePlan,
      conflicts: activeConflicts,
      changeOrders: workspace.changeOrders.filter((order) => order.planId === activePlan.id),
      role: workspace.role
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activePlan.name}-灯光提示.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Box minH="100vh">
      <Box as="header" position="sticky" top={0} zIndex={50} bg="rgba(9, 14, 24, .88)" backdropFilter="blur(18px)" borderBottomWidth="1px" borderColor="whiteAlpha.100">
        <Flex px={{ base: 3, xl: 5 }} py={3} align="center" gap={3} wrap="wrap">
          <Flex align="center" gap={3}>
            <Flex w="42px" h="42px" borderRadius="12px" align="center" justify="center" bg="amber.400" color="stage.950" boxShadow="0 8px 24px rgba(246,196,83,.2)">
              <Lightbulb size={22} />
            </Flex>
            <Box>
              <Heading size="md" letterSpacing="wide">光影谱 · 灯光提示设计台</Heading>
              <Text color="whiteAlpha.500" fontSize="xs">场次编排、跟随关系、冲突核对与多方案比较</Text>
            </Box>
          </Flex>

          <HStack ml={{ base: 0, xl: 'auto' }} spacing={2} wrap="wrap">
            <Tooltip label="当前编辑方案">
              <Select
                aria-label="当前编辑方案"
                size="sm"
                w="190px"
                value={workspace.activePlanId}
                bg="whiteAlpha.100"
                onChange={(event) => dispatch({ type: 'selectPlan', planId: event.target.value })}
              >
                {workspace.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
              </Select>
            </Tooltip>
            <Tooltip label="并排比较的双方案">
              <Select
                aria-label="比较方案"
                size="sm"
                w="170px"
                value={workspace.comparePlanId}
                bg="whiteAlpha.100"
                onChange={(event) => dispatch({ type: 'comparePlan', planId: event.target.value })}
              >
                {workspace.plans.filter((plan) => plan.id !== workspace.activePlanId).map((plan) => (
                  <option key={plan.id} value={plan.id}>{plan.name}</option>
                ))}
              </Select>
            </Tooltip>
            <Tooltip label="角色权限决定可编辑的场次与提示范围">
              <Select
                aria-label="当前角色"
                size="sm"
                w="132px"
                value={workspace.role}
                bg="whiteAlpha.100"
                onChange={(event) => dispatch({ type: 'setRole', role: event.target.value as UserRole })}
              >
                {Object.entries(roleLabels).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
              </Select>
            </Tooltip>
            <Badge colorScheme={online ? 'green' : 'orange'} variant="subtle" px={2} py={1} borderRadius="md">
              <HStack spacing={1}>{online ? <Wifi size={12} /> : <WifiOff size={12} />}<Text>{online ? '在线' : '离线草稿'}</Text></HStack>
            </Badge>
            <IconButton
              aria-label="撤销"
              icon={<Undo2 size={17} />}
              size="sm"
              isDisabled={!state.past.length}
              onClick={() => dispatch({ type: 'undo' })}
            />
            <IconButton
              aria-label="重做"
              icon={<Redo2 size={17} />}
              size="sm"
              isDisabled={!state.future.length}
              onClick={() => dispatch({ type: 'redo' })}
            />
            <Button size="sm" colorScheme="amber" leftIcon={<Save size={16} />} onClick={() => void persistNow()}>保存</Button>
          </HStack>
        </Flex>
        <Flex px={{ base: 3, xl: 5 }} pb={2} gap={3} color="whiteAlpha.500" fontSize="11px" wrap="wrap">
          <Text>最近操作：{state.lastAction}</Text>
          {savedAt ? <Text>本地草稿 {savedAt}</Text> : null}
          <Text>{syncMessage}</Text>
          <Text ml="auto">快捷键：↑/↓ 选择 · Alt+N 下一未完成 · F 冻结/解冻 · Ctrl/⌘+Z 撤销 · Ctrl/⌘+S 保存</Text>
        </Flex>
      </Box>

      <Grid className="desk-grid" templateColumns={{ base: '1fr', xl: '286px minmax(0, 1fr) 380px' }} gap={4} p={{ base: 3, xl: 5 }} maxW="1920px" mx="auto">
        <Box as="aside" className="side-panel" position="sticky" top="104px" alignSelf="start" maxH="calc(100vh - 124px)" overflowY="auto" pr={1}>
          <VStack align="stretch" spacing={4}>
            <Box borderWidth="1px" borderColor="whiteAlpha.100" borderRadius="xl" bg="whiteAlpha.50" p={4}>
              <Flex align="center" mb={3}>
                <Heading size="sm">场次</Heading>
                <Spacer />
                <Tag size="sm" colorScheme="blue">{activePlan.scenes.length} 场</Tag>
              </Flex>
              <VStack align="stretch" spacing={2}>
                {activePlan.scenes.map((scene) => {
                  const sceneConflicts = activeConflicts.filter((item) => item.sceneId === scene.id);
                  const selected = scene.id === activeScene?.id;
                  return (
                    <Box
                      key={scene.id}
                      as="button"
                      textAlign="left"
                      p={3}
                      borderRadius="lg"
                      borderWidth="1px"
                      borderColor={selected ? 'blue.400' : 'transparent'}
                      bg={selected ? 'blue.900' : 'blackAlpha.200'}
                      _hover={{ bg: selected ? 'blue.900' : 'whiteAlpha.100' }}
                      onClick={() => dispatch({ type: 'selectScene', sceneId: scene.id })}
                    >
                      <Flex align="center" gap={2}>
                        <Text color="amber.300" fontFamily="mono" fontSize="xs">{(scene.order).toString().padStart(2, '0')}</Text>
                        <Text fontWeight="650" fontSize="sm" flex="1" noOfLines={1}>{scene.name}</Text>
                        {scene.frozen ? <Lock size={13} color="#9ae6b4" /> : <Unlock size={13} color="#718096" />}
                      </Flex>
                      <Flex mt={2} color="whiteAlpha.500" fontSize="10px" gap={2}>
                        <Text>{formatTime(scene.duration)}</Text>
                        <Text>{scene.cues.length} 条</Text>
                        <Text color={sceneConflicts.length ? 'orange.300' : 'green.300'}>{sceneConflicts.length} 冲突</Text>
                      </Flex>
                    </Box>
                  );
                })}
              </VStack>
            </Box>

            <Box borderWidth="1px" borderColor="whiteAlpha.100" borderRadius="xl" bg="whiteAlpha.50" p={4}>
              <Heading size="sm" mb={3}>执行概览</Heading>
              <SimpleGrid columns={2} spacing={2}>
                <Box p={3} borderRadius="lg" bg="blackAlpha.200">
                  <Text fontSize="2xl" fontWeight="800">{incompleteCount}</Text>
                  <Text color="whiteAlpha.500" fontSize="xs">未确认提示</Text>
                </Box>
                <Box p={3} borderRadius="lg" bg="blackAlpha.200">
                  <Text fontSize="2xl" fontWeight="800" color={activeConflicts.length ? 'orange.300' : 'green.300'}>{activeConflicts.length}</Text>
                  <Text color="whiteAlpha.500" fontSize="xs">当前方案冲突</Text>
                </Box>
                <Box gridColumn="1 / -1" p={3} borderRadius="lg" bg="blackAlpha.200">
                  <Flex align="center">
                    <Box>
                      <Text fontSize="xl" fontWeight="800" color={pendingOrderCount ? 'orange.300' : 'green.300'}>{pendingOrderCount}</Text>
                      <Text color="whiteAlpha.500" fontSize="xs">待处理字段变更单（待审批 / 冲突待重提）</Text>
                    </Box>
                    <Spacer />
                    <Button size="xs" variant="outline" colorScheme="amber" leftIcon={<ClipboardList size={13} />} onClick={() => setRightTab(1)}>
                      打开变更单
                    </Button>
                  </Flex>
                </Box>
              </SimpleGrid>
              <Button mt={3} w="full" colorScheme="blue" variant="outline" leftIcon={<SkipForward size={16} />} onClick={jumpIncomplete}>
                下一未完成 / 阻断项
              </Button>
            </Box>

            <Box borderWidth="1px" borderColor="whiteAlpha.100" borderRadius="xl" bg="whiteAlpha.50" p={4}>
              <Heading size="sm" mb={3}>角色权限</Heading>
              <HStack mb={3}><ShieldCheck size={17} color="#f6c453" /><Text fontSize="sm">{roleLabels[workspace.role]}</Text></HStack>
              <Text color="whiteAlpha.500" fontSize="xs" lineHeight="1.7">
                {workspace.role === 'designer' && '可编辑所有未冻结方案与提示，也可冻结场次。'}
                {workspace.role === 'programmer' && '可编辑灯位、颜色、跟随、备注等参数；通道、亮度与渐变需勾选字段并写明原因提交变更单，灯光设计同意后才合入；不能冻结场次。'}
                {workspace.role === 'stage-manager' && '只能冻结或解冻场次，不能修改提示内容。'}
                {workspace.role === 'readonly' && '只读查看所有方案、冲突和比较结果。'}
              </Text>
            </Box>

            <Button variant="outline" leftIcon={<Copy size={16} />} onClick={duplicatePlan}>复制为新方案</Button>
            <Button variant="ghost" leftIcon={<RefreshCw size={16} />} onClick={exportPlan}>导出当前方案 JSON</Button>
          </VStack>
        </Box>

        <Box minW={0}>
          {!activeScene ? (
            <Alert status="warning" borderRadius="xl"><AlertIcon />请选择或新建场次。</Alert>
          ) : (
            <VStack align="stretch" spacing={4}>
              <Box borderWidth="1px" borderColor="whiteAlpha.100" borderRadius="xl" bg="whiteAlpha.50" p={4}>
                <Flex align={{ base: 'start', md: 'center' }} gap={3} wrap="wrap">
                  <Box>
                    <Flex align="center" gap={2}>
                      <Heading size="md">{activeScene.name}</Heading>
                      {activeScene.frozen ? <Tag colorScheme="green"><HStack spacing={1}><Lock size={12} /><Text>已冻结</Text></HStack></Tag> : <Tag variant="subtle">编辑中</Tag>}
                    </Flex>
                    <Text color="whiteAlpha.500" fontSize="sm" mt={1}>
                      场次开始 {formatTime(activeScene.startTime)} · 时长 {formatTime(activeScene.duration)} · {activeScene.cues.length} 条提示
                    </Text>
                  </Box>
                  <Spacer />
                  <ButtonGroup size="sm" variant="outline">
                    <Button leftIcon={<Plus size={15} />} isDisabled={!editable} onClick={addCue}>新增提示</Button>
                    <Button leftIcon={activeScene.frozen ? <LockOpen size={15} /> : <Lock size={15} />} isDisabled={!freezer} onClick={toggleFreeze}>
                      {activeScene.frozen ? '解除冻结' : '冻结场次'}
                    </Button>
                    <Button leftIcon={<SkipForward size={15} />} onClick={jumpIncomplete}>定位未完成</Button>
                  </ButtonGroup>
                </Flex>

                <Box mt={4}>
                  <Flex mb={2} align="center">
                    <Text color="whiteAlpha.600" fontSize="xs">自动重算时间轴</Text>
                    <Spacer />
                    <Text color="whiteAlpha.500" fontSize="xs">{formatTime(activeScene.startTime)} — {formatTime((activeScene.startTime ?? 0) + (activeScene.duration ?? 0))}</Text>
                  </Flex>
                  <Flex className="timeline-track" role="list" aria-label={`${activeScene.name}时间轴`}>
                    {activeScene.cues.map((cue) => (
                      <Tooltip key={cue.id} label={`${cue.number} ${cue.label}，${formatTime(cue.startTime)} 开始，持续 ${cue.duration?.toFixed(1)} 秒`}>
                        <Box
                          as="button"
                          role="listitem"
                          className="timeline-block focus-ring"
                          aria-label={`时间轴 ${cue.number} ${cue.label}`}
                          bg={cue.colorHex}
                          color={cue.brightness > 55 ? '#111827' : '#fff'}
                          flexGrow={Math.max(1, cue.duration ?? 1)}
                          flexBasis={`${Math.max(40, (cue.duration ?? 1) * 14)}px`}
                          borderLeft={cue.id === selectedCue?.id ? '3px solid #f6c453' : undefined}
                          onClick={() => selectCue(activeScene.id, cue.id)}
                        >
                          <Text fontWeight="800">{cue.number}</Text>
                          <Text noOfLines={1}>{cue.label}</Text>
                        </Box>
                      </Tooltip>
                    ))}
                    {!activeScene.cues.length ? <Text p={3} color="whiteAlpha.500" fontSize="sm">时间轴暂无数据</Text> : null}
                  </Flex>
                </Box>
              </Box>

              {!editable ? (
                <Alert status={activeScene.frozen ? 'success' : 'warning'} borderRadius="lg">
                  <AlertIcon />
                  <AlertDescription>
                    {activeScene.frozen
                      ? '该场次已冻结。提示顺序与参数保持只读；可由灯光设计或舞台监督解除冻结。'
                      : '当前角色处于审阅或执行权限，拖动顺序与参数编辑已锁定。'}
                  </AlertDescription>
                </Alert>
              ) : null}

              <CueList
                scene={activeScene}
                selectedCueId={workspace.selectedCueId}
                canEdit={editable}
                conflicts={activeConflicts}
                onSelect={(cueId) => selectCue(activeScene.id, cueId)}
                onReorder={reorderCue}
              />

              <Box borderWidth="1px" borderColor="whiteAlpha.100" borderRadius="xl" bg="whiteAlpha.50" p={4}>
                <Flex align="center" mb={3}>
                  <Box>
                    <Heading size="sm">双方案并排比较</Heading>
                    <Text color="whiteAlpha.500" fontSize="xs">按场次顺序对应比较通道、亮度和时间。</Text>
                  </Box>
                  <Spacer />
                  <Tag colorScheme="purple">{activePlan.name} × {comparePlan.name}</Tag>
                </Flex>
                <ComparePlan
                  activePlan={activePlan}
                  comparePlan={comparePlan}
                  sceneOrder={activeScene.order}
                  onSelectCue={(cueId) => selectCue(activeScene.id, cueId)}
                />
              </Box>
            </VStack>
          )}
        </Box>

        <Box as="aside" className="side-panel" position="sticky" top="104px" alignSelf="start" maxH="calc(100vh - 124px)" overflowY="auto" pl={1}>
          <Box borderWidth="1px" borderColor="whiteAlpha.100" borderRadius="xl" bg="whiteAlpha.50" overflow="hidden">
            <Tabs colorScheme="amber" variant="line" index={rightTab} onChange={setRightTab}>
              <TabList px={3} pt={2}>
                <Tab>提示编辑</Tab>
                <Tab>
                  变更单
                  {pendingOrderCount ? <Badge ml={1} colorScheme="orange">{pendingOrderCount}</Badge> : null}
                </Tab>
                <Tab>冲突 <Badge ml={1} colorScheme={activeConflicts.length ? 'orange' : 'green'}>{activeConflicts.length}</Badge></Tab>
                <Tab>关系图</Tab>
              </TabList>
              <TabPanels>
                <TabPanel px={4} pb={5}>
                  {activeScene ? (
                    <CueInspector
                      cue={selectedCue}
                      scene={activeScene}
                      roles={workspace.role}
                      workspace={workspace}
                      canEdit={editable}
                      conflicts={activeCueConflicts}
                      onApply={applyCue}
                      onDelete={deleteCue}
                      onSelectCue={(cueId) => selectCue(activeScene.id, cueId)}
                      onOpenChangeOrders={() => setRightTab(1)}
                    />
                  ) : null}
                </TabPanel>
                <TabPanel px={4} pb={5}>
                  {activeScene ? (
                    <ChangeOrdersPanel
                      workspace={workspace}
                      cue={selectedCue}
                      scene={activeScene}
                      allConflicts={allConflicts}
                      onFocusCue={focusOrderCue}
                      onSubmit={submitChangeOrder}
                      onApprove={approveChangeOrder}
                      onWithdraw={withdrawChangeOrder}
                    />
                  ) : null}
                </TabPanel>
                <TabPanel px={4} pb={5}>
                  <ConflictList
                    conflicts={activeConflicts}
                    onSelect={(sceneId, cueId) => selectCue(sceneId, cueId)}
                  />
                </TabPanel>
                <TabPanel px={4} pb={5}>
                  {activeScene ? (
                    <VStack align="stretch" spacing={3}>
                      {activeScene.cues.map((cue, index) => {
                        const followed = activeScene.cues.find((item) => item.id === cue.followCueId);
                        return (
                          <Box key={cue.id} p={3} borderRadius="lg" bg="blackAlpha.200" borderWidth="1px" borderColor="whiteAlpha.100">
                            <Flex align="center" gap={2}>
                              <CircleDot size={14} color={cue.colorHex} />
                              <Text fontFamily="mono" color="amber.300" fontSize="sm">{cue.number}</Text>
                              <Text fontWeight="600" fontSize="sm" noOfLines={1}>{cue.label}</Text>
                              <Spacer />
                              <Text color="whiteAlpha.500" fontSize="xs">{formatTime(cue.startTime)}</Text>
                            </Flex>
                            <Box ml={4} mt={3} borderLeftWidth="2px" borderColor={followed ? 'purple.400' : 'whiteAlpha.200'} pl={3}>
                              {followed ? (
                                <>
                                  <Flex align="center" gap={1} color="purple.300" fontSize="xs"><ArrowDown size={12} />跟随 {followed.number} · {followed.label}</Flex>
                                  <Text mt={1} color="whiteAlpha.500" fontSize="10px">目标结束时间 {formatTime(followed.endTime)}</Text>
                                </>
                              ) : (
                                <Flex align="center" gap={1} color="whiteAlpha.500" fontSize="xs"><Pause size={12} />按前一条结束或手动 GO 触发</Flex>
                              )}
                            </Box>
                            {index < activeScene.cues.length - 1 ? <Box mt={3} pl="8px" color="whiteAlpha.300"><ArrowDown size={14} /></Box> : null}
                          </Box>
                        );
                      })}
                    </VStack>
                  ) : null}
                </TabPanel>
              </TabPanels>
            </Tabs>
          </Box>

          <Box mt={4} p={3} borderRadius="lg" borderWidth="1px" borderStyle="dashed" borderColor="whiteAlpha.200" color="whiteAlpha.500" fontSize="xs" lineHeight="1.7">
            <Text color="whiteAlpha.700" fontWeight="700" mb={1}>读屏与键盘说明</Text>
            每条提示均声明编号、名称、状态与冲突数量。拖动把手可用键盘聚焦后使用方向键排序；编辑表单均带明确标签。
          </Box>
        </Box>
      </Grid>

      <Box as="footer" maxW="1920px" mx="auto" px={5} pb={7} color="whiteAlpha.400" fontSize="xs" textAlign="center">
        所有方案与草稿保存在当前浏览器。清除站点数据会删除灯光设计台内容。
      </Box>
    </Box>
  );
}
