import {
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  Heading,
  Input,
  NumberInput,
  NumberInputField,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Spacer,
  Tag,
  Text,
  Textarea,
  VStack
} from '@chakra-ui/react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Lock,
  RefreshCw,
  Undo2,
  XCircle
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  buildOrderFields,
  changeOrderStatusMeta,
  changeableFields,
  driftedFields,
  findOrderTarget,
  formatFieldValue,
  validateOrderFields,
  type FieldDraft
} from './changeOrders';
import { roleLabels } from './data';
import type { Cue, FieldChangeOrder, Scene, UserRole, Workspace } from './types';

interface SubmitDialogProps {
  isOpen: boolean;
  onClose: () => void;
  cue: Cue | undefined;
  scene: Scene | undefined;
  role: UserRole;
  /** 冲突重提时传入原变更单 */
  order?: FieldChangeOrder;
  /** 从检查器编辑表单带入的申请值（编程执行调整受控参数时） */
  initialDraft?: FieldDraft;
  onSubmit: (fields: ReturnType<typeof buildOrderFields>, reason: string) => void;
}

function blankDraft(cue: Cue | undefined, order?: FieldChangeOrder, initial?: FieldDraft): FieldDraft {
  if (initial) return structuredClone(initial);
  return Object.fromEntries(
    changeableFields.map((meta) => {
      const existing = order?.fields.find((item) => item.field === meta.field);
      const source = existing ? existing.proposed : cue?.[meta.field] ?? '';
      return [meta.field, { checked: existing?.checked ?? false, value: String(source) }];
    })
  ) as FieldDraft;
}

export function ChangeOrderDialog({ isOpen, onClose, cue, scene, role, order, initialDraft, onSubmit }: SubmitDialogProps) {
  const [draft, setDraft] = useState<FieldDraft>(() => blankDraft(cue, order, initialDraft));
  const [reason, setReason] = useState(order?.reason ?? '');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setDraft(blankDraft(cue, order, initialDraft));
      setReason(order?.reason ?? '');
      setError('');
    }
  }, [isOpen, cue?.id, order?.id]);

  const frozen = Boolean(scene?.frozen);

  const currentBaseline = useMemo(() => {
    if (!cue || !order) return undefined;
    return order.fields
      .filter((item) => item.checked)
      .map((item) => ({
        field: item.field,
        current: cue[item.field] as string | number,
        baseline: item.baseline,
        drifted: !Object.is(cue[item.field], item.baseline)
      }));
  }, [cue, order]);

  function toggleField(field: keyof FieldDraft) {
    setDraft((current) => ({ ...current, [field]: { ...current[field], checked: !current[field].checked } }));
  }

  function setValue(field: keyof FieldDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: { ...current[field], value } }));
  }

  function handleSubmit() {
    if (!cue || frozen) return;
    const fields = buildOrderFields(cue, draft);
    const validation = validateOrderFields(fields);
    if (validation) {
      setError(validation);
      return;
    }
    if (!reason.trim()) {
      setError('请填写现场调整原因，便于设计追溯参数来源');
      return;
    }
    onSubmit(fields, reason);
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" isCentered>
      <ModalOverlay />
      <ModalContent bg="gray.900" borderColor="whiteAlpha.200">
        <ModalHeader>
          {order ? '冲突重提 · 字段变更单' : '新建字段变更单'}
          {cue ? (
            <Text fontSize="xs" color="whiteAlpha.500" fontWeight="400" mt={1}>
              {cue.number} {cue.label} · {scene?.name ?? ''}，由{roleLabels[role]}提交，灯光设计同意后仅合入勾选字段
            </Text>
          ) : null}
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {frozen ? (
            <Alert status="error" borderRadius="lg" mb={3}>
              <AlertIcon as={Lock} />
              <AlertDescription fontSize="sm">该场次已冻结，不能提交字段变更单；请先由灯光设计或舞台监督解冻。</AlertDescription>
            </Alert>
          ) : null}

          {currentBaseline?.some((item) => item.drifted) ? (
            <Alert status="warning" borderRadius="lg" mb={3}>
              <AlertIcon as={AlertTriangle} />
              <AlertDescription fontSize="sm">
                提交后下列字段又被修改，提示上的新值会保留：
                {currentBaseline.filter((item) => item.drifted).map((item) => {
                  const meta = changeableFields.find((m) => m.field === item.field);
                  return ` ${meta?.label}（现值 ${formatFieldValue(item.field, item.current)}）`;
                })}
                。重提后将以现值作为新的比对基准。
              </AlertDescription>
            </Alert>
          ) : null}

          <VStack align="stretch" spacing={3}>
            <Text color="whiteAlpha.600" fontSize="xs">勾选本次要申请调整的参数，未勾选的字段合入时照旧保留。</Text>
            {changeableFields.map((meta) => {
              const item = draft[meta.field];
              const baseline = cue?.[meta.field] as string | number | undefined;
              return (
                <Flex
                  key={meta.field}
                  p={3}
                  borderRadius="lg"
                  borderWidth="1px"
                  borderColor={item.checked ? 'amber.500' : 'whiteAlpha.100'}
                  bg={item.checked ? 'amber.900' : 'blackAlpha.200'}
                  align="center"
                  gap={3}
                >
                  <Checkbox
                    aria-label={`勾选调整${meta.label}`}
                    isChecked={item.checked}
                    isDisabled={frozen}
                    onChange={() => toggleField(meta.field)}
                    colorScheme="amber"
                  />
                  <Box w="64px">
                    <Badge colorScheme="whiteAlpha">{meta.group}</Badge>
                    <Text fontWeight="650" fontSize="sm">{meta.label}</Text>
                  </Box>
                  <Box w="96px" fontSize="xs" color="whiteAlpha.500">
                    现值
                    <Text fontFamily="mono" color="whiteAlpha.700">{formatFieldValue(meta.field, baseline)}</Text>
                  </Box>
                  <Box flex="1">
                    {meta.kind === 'text' ? (
                      <Input
                        aria-label={`${meta.label}申请值`}
                        size="sm"
                        value={item.value}
                        isDisabled={!item.checked || frozen}
                        onChange={(event) => setValue(meta.field, event.target.value)}
                      />
                    ) : (
                      <NumberInput
                        size="sm"
                        min={meta.field === 'brightness' ? 0 : 0}
                        max={meta.field === 'brightness' ? 100 : undefined}
                        step={meta.kind === 'percent' ? 1 : 0.5}
                        value={item.value}
                        isDisabled={!item.checked || frozen}
                        onChange={(value) => setValue(meta.field, value)}
                      >
                        <NumberInputField aria-label={`${meta.label}申请值`} />
                      </NumberInput>
                    )}
                  </Box>
                  <Text w="28px" color="whiteAlpha.500" fontSize="xs">{meta.unit ?? '文本'}</Text>
                </Flex>
              );
            })}

            <FormControl>
              <FormLabel htmlFor="co-reason" fontSize="sm">现场调整原因</FormLabel>
              <Textarea
                id="co-reason"
                value={reason}
                isDisabled={frozen}
                onChange={(event) => setReason(event.target.value)}
                minH="84px"
                placeholder="例如：联排时该通道实测偏暗、渐变跟不上演员调度，需现场修正。"
              />
            </FormControl>

            {error ? (
              <Alert status="error" borderRadius="lg">
                <AlertIcon />
                <AlertDescription fontSize="sm">{error}</AlertDescription>
              </Alert>
            ) : null}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Spacer />
          <Button
            colorScheme="amber"
            isDisabled={frozen}
            leftIcon={order ? <RefreshCw size={15} /> : <ClipboardList size={15} />}
            onClick={handleSubmit}
          >
            {order ? '重新提交审批' : '提交变更单'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

interface OrderListProps {
  workspace: Workspace;
  activePlanId: string;
  hasSelectedCue: boolean;
  role: UserRole;
  onSubmitNew: () => void;
  onSelectCue: (sceneId: string, cueId: string) => void;
  onApprove: (order: FieldChangeOrder) => void;
  onReject: (order: FieldChangeOrder) => void;
  onResubmit: (order: FieldChangeOrder) => void;
  onWithdraw: (order: FieldChangeOrder) => void;
}

export function ChangeOrderPanel({
  workspace,
  activePlanId,
  hasSelectedCue,
  role,
  onSubmitNew,
  onSelectCue,
  onApprove,
  onReject,
  onResubmit,
  onWithdraw
}: OrderListProps) {
  const resolvedRank = (status: FieldChangeOrder['status']) =>
    status === 'pending' ? 0 : status === 'conflict' ? 1 : 2;
  const orders = workspace.changeOrders
    .filter((order) => order.planId === activePlanId)
    .sort(
      (a, b) =>
        resolvedRank(a.status) - resolvedRank(b.status) ||
        b.submittedAt.localeCompare(a.submittedAt)
    );

  const pendingCount = orders.filter((order) => order.status === 'pending').length;
  const conflictCount = orders.filter((order) => order.status === 'conflict').length;
  const canSubmit = role === 'programmer' || role === 'designer';
  const canApprove = role === 'designer';

  return (
    <VStack align="stretch" spacing={3}>
      <Flex align="center" gap={2} wrap="wrap">
        <Heading size="sm">字段变更单</Heading>
        <Spacer />
        <Tag size="sm" colorScheme={pendingCount ? 'amber' : 'green'}>{pendingCount} 待审批</Tag>
        <Tag size="sm" colorScheme={conflictCount ? 'orange' : 'whiteAlpha'}>{conflictCount} 冲突</Tag>
      </Flex>
      <Text color="whiteAlpha.500" fontSize="11px" lineHeight="1.7">
        现场勾选通道、亮度或渐变参数并写明原因；灯光设计同意后仅合入勾选项，未勾选字段照旧。冻结场次不能提交或批准。
      </Text>
      <Button
        size="sm"
        colorScheme="amber"
        variant="outline"
        leftIcon={<ClipboardList size={15} />}
        isDisabled={!canSubmit || !hasSelectedCue}
        onClick={onSubmitNew}
      >
        为当前选中提示新建变更单
      </Button>
      {!canSubmit ? (
        <Text fontSize="10px" color="whiteAlpha.400">{roleLabels[role]}不能提交变更单，仅可查看审批记录。</Text>
      ) : null}

      {!orders.length ? (
        <Flex minH="120px" align="center" justify="center" color="whiteAlpha.500" fontSize="sm" textAlign="center">
          当前方案暂无变更单，联排调整可在此发起审批。
        </Flex>
      ) : null}

      {orders.map((order) => {
        const { cue, scene } = findOrderTarget(workspace, order);
        const meta = changeOrderStatusMeta[order.status];
        const drift = order.status === 'conflict' ? driftedFields(workspace, order) : order.conflictFields ?? [];
        const frozen = Boolean(scene?.frozen);
        const isMine = order.submitterRole === role;
        return (
          <Box
            key={order.id}
            p={3}
            borderRadius="lg"
            borderWidth="1px"
            borderColor={
              order.status === 'conflict' ? 'orange.600'
              : order.status === 'approved' ? 'green.700'
              : order.status === 'rejected' ? 'red.800'
              : 'amber.600'
            }
            bg="blackAlpha.300"
          >
            <Flex align="center" gap={2}>
              <Box
                as="button"
                type="button"
                fontFamily="mono"
                color="amber.300"
                fontSize="sm"
                textAlign="left"
                _hover={{ textDecoration: 'underline' }}
                onClick={() => cue && onSelectCue(order.sceneId, order.cueId)}
                title="定位到该提示"
              >
                {cue ? cue.number : order.cueNumber}
              </Box>
              <Text fontSize="sm" fontWeight="650" noOfLines={1} flex="1">{cue?.label ?? order.cueLabel}</Text>
              <Tag size="sm" colorScheme={meta.color as 'amber'}>{meta.label}</Tag>
            </Flex>
            <Text color="whiteAlpha.500" fontSize="10px" mt={1}>
              {scene?.name ?? order.sceneName}{frozen ? ' · 场次已冻结' : ''} · {roleLabels[order.submitterRole]}提交 · {new Date(order.submittedAt).toLocaleString('zh-CN', { hour12: false })}
            </Text>

            <VStack align="stretch" spacing={1} mt={2}>
              {order.fields.filter((item) => item.checked).map((item) => {
                const fieldMetaEntry = changeableFields.find((m) => m.field === item.field);
                const live = cue?.[item.field] as string | number | undefined;
                const isDrift = drift.includes(item.field);
                return (
                  <Flex key={item.field} fontSize="xs" align="center" gap={2} color={isDrift ? 'orange.200' : 'whiteAlpha.700'}>
                    <Text w="44px">{fieldMetaEntry?.label}</Text>
                    <Text as="span" textDecoration="line-through" color="whiteAlpha.400" fontFamily="mono">
                      {formatFieldValue(item.field, item.baseline)}
                    </Text>
                    <Text>→</Text>
                    <Text fontFamily="mono" fontWeight="700">{formatFieldValue(item.field, item.proposed)}</Text>
                    {isDrift ? (
                      <Tag size="sm" colorScheme="orange">
                        现值 {formatFieldValue(item.field, live)}（保留）
                      </Tag>
                    ) : null}
                  </Flex>
                );
              })}
            </VStack>

            <Box mt={2} p={2} borderRadius="md" bg="whiteAlpha.50" fontSize="11px" color="whiteAlpha.600">
              原因：{order.reason || '（未填写）'}
            </Box>

            {order.reviewNote ? (
              <Box mt={1} p={2} borderRadius="md" bg="whiteAlpha.50" fontSize="11px" color="whiteAlpha.600">
                设计批复：{order.reviewNote}{order.reviewerRole ? `（${roleLabels[order.reviewerRole]}）` : ''}
              </Box>
            ) : null}

            {order.status === 'pending' || order.status === 'conflict' ? (
              <HStack mt={3} wrap="wrap">
                {order.status === 'conflict' && isMine ? (
                  <Button size="xs" colorScheme="orange" leftIcon={<RefreshCw size={13} />} isDisabled={frozen} onClick={() => onResubmit(order)}>
                    保留变更并重提
                  </Button>
                ) : null}
                {order.status === 'pending' && canApprove ? (
                  <>
                    <Button size="xs" colorScheme="green" leftIcon={<CheckCircle2 size={13} />} isDisabled={frozen} onClick={() => onApprove(order)}>
                      {frozen ? '冻结场次不可批准' : '同意并合入勾选项'}
                    </Button>
                    <Button size="xs" colorScheme="red" variant="outline" leftIcon={<XCircle size={13} />} isDisabled={frozen} onClick={() => onReject(order)}>
                      退回
                    </Button>
                  </>
                ) : null}
                {order.status === 'conflict' && canApprove ? (
                  <Tag size="sm" colorScheme="orange" variant="outline">等待提交方按现值重提</Tag>
                ) : null}
                {isMine ? (
                  <Button size="xs" variant="ghost" leftIcon={<Undo2 size={13} />} onClick={() => onWithdraw(order)}>
                    撤回
                  </Button>
                ) : null}
              </HStack>
            ) : null}
          </Box>
        );
      })}
    </VStack>
  );
}
