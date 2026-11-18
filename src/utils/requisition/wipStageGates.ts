import {
  SizeBreakdown,
  DeliveryCountdownInfo,
  ContractorOrderAllocation,
  scaleSizeBreakdown
} from './sizingAndCatalog';

export type WipStage = 'STEP_1' | 'STEP_2' | 'STEP_3' | 'STEP_4' | 'STEP_5' | 'COMPLETED';

export interface OrderWipState {
  reqNumber: string;
  parentOrderId?: string;
  grnRef?: string;
  allocatedGrnRefs?: Array<{ grnCode: string; pairs: number }>;
  article: string;
  po?: string;
  maker?: string;
  buyer?: string;
  plannedQty: number;
  issueStatus: 'Pending Inward Issue' | 'Issued by Inward Register';
  sizeFormat?: string;
  sizeCodes?: string[];
  sizes: SizeBreakdown;
  packedSizes?: SizeBreakdown;
  stage1In: number;
  stage1Passed: number;
  stage1Defects: number;
  stage2In: number;
  stage2Passed: number;
  stage2Defects: number;
  stage3In: number;
  stage3Passed: number;
  stage3Defects: number;
  mreqNo: string;
  altReqNo: string;
  mreqQty: string;
  mreqStatus: string;
  stage4In: number;
  stage4Passed: number;
  stage4Pending: number;
  stage5Cartons: string;
  stage5Pending: string;
  lineEfficiency: string;
  outputPairs: number;
  outputCartons: number;
  inAlteration: number;
  scrappedPairs?: number;
  finalQcApproved?: boolean;
  alterationCycleCount?: number;
  contractorDebitPairs?: number;
  unaccountedVariancePairs?: number;
  isVoided?: boolean;
  voidReason?: string;
  isDemoScenario?: boolean;
}

export function getStartupRequisitionNumber(
  currentReqNumber: string,
  currentWip: Pick<OrderWipState, 'parentOrderId' | 'plannedQty'>,
  persistedReqNumbers: string[]
): string | null {
  if (currentWip.parentOrderId || Number(currentWip.plannedQty) > 0) return null;
  return persistedReqNumbers.includes(currentReqNumber)
    ? currentReqNumber
    : persistedReqNumbers[0] || null;
}

export function formatBatchSequence(prefix: 'GRN' | 'REQ', seqNumber: number): string {
  const safeSeq = Math.max(1, Math.floor(Number(seqNumber) || 1));
  return `${prefix}-${String(safeSeq).padStart(4, '0')}`;
}

export function isReqAwaitingFinalQc(wip: Partial<OrderWipState>): boolean {
  return (
    Number(wip.stage4Passed || 0) > 0 &&
    Number(wip.outputPairs || 0) < Number(wip.stage4Passed || 0) &&
    !wip.finalQcApproved
  );
}

/**
 * 4.2 — Stage 4 -> Final QC -> Stage 5 lock gate validator.
 * Stage 5 (Master Carton Packing) stays locked until Final QC passes at the end of Stage 4.
 */
export function canExecuteStage5CartonPacking(wip: Partial<OrderWipState>): {
  allowed: boolean;
  reason: string;
  readyPairs: number;
} {
  const s4Passed = Number(wip.stage4Passed || 0);
  const packedPairs = Number(wip.outputPairs || 0);
  const readyPairs = Math.max(0, s4Passed - packedPairs);

  if (s4Passed <= 0 || readyPairs <= 0) {
    return {
      allowed: false,
      reason: 'Stage 4 (1st Packing / Polybag) has 0 pairs ready for Stage 5 Master Carton Packing.',
      readyPairs: 0
    };
  }
  if (!wip.finalQcApproved) {
    return {
      allowed: false,
      reason: 'LOCKED: Final QC Gate (AQL 1.5) must be approved after Stage 4 before Stage 5 Master Carton Packing can execute.',
      readyPairs
    };
  }
  return {
    allowed: true,
    reason: 'Final QC approved. Ready for Stage 5 Master Carton Packing.',
    readyPairs
  };
}

export function determineOrderActiveStage(wip: Partial<OrderWipState>): WipStage {
  const issued = Math.max(Number(wip.stage1In || 0), Number(wip.plannedQty || 0));
  const packed = Number(wip.outputPairs || 0);
  const scrapped = Number(wip.scrappedPairs || 0);
  const inAlt = Math.max(0, Number(wip.inAlteration || 0) - scrapped);

  if (Number(wip.outputCartons || 0) > 0 && packed + scrapped >= issued && inAlt === 0) {
    return 'COMPLETED';
  }
  if (Number(wip.stage4Passed || 0) > 0 || Number(wip.stage4In || 0) > 0) {
    if (Number(wip.stage4Passed || 0) > 0 && wip.finalQcApproved) return 'STEP_5';
    return 'STEP_4';
  }
  if (Number(wip.stage3Passed || 0) > 0 || Number(wip.stage3In || 0) > 0) {
    if (Number(wip.stage3Passed || 0) > 0) return 'STEP_4';
    return 'STEP_3';
  }
  if (Number(wip.stage2Passed || 0) > 0 || Number(wip.stage2In || 0) > 0) {
    if (Number(wip.stage2Passed || 0) > 0) return 'STEP_3';
    return 'STEP_2';
  }
  return 'STEP_1';
}

export function isPackingAwaitingFinalQc(wip: Partial<OrderWipState>): boolean {
  const s4In = Number(wip.stage4In || 0);
  const s4Passed = Number(wip.stage4Passed || 0);
  const s4Pending = wip.stage4Pending !== undefined ? Number(wip.stage4Pending || 0) : Math.max(0, s4In - s4Passed);
  const outputPairs = Number(wip.outputPairs || 0);
  return s4Passed > 0 && s4Pending === 0 && !wip.finalQcApproved && outputPairs < s4Passed;
}

export function isStage5ReadyForCartons(wip: Partial<OrderWipState>): boolean {
  const s4Passed = Number(wip.stage4Passed || 0);
  const outputPairs = Number(wip.outputPairs || 0);
  return Boolean(wip.finalQcApproved && s4Passed > outputPairs);
}

/**
 * Returns true only when Stage 3 (Pair Matching) has completed matched pairs (> 0)
 * and no pairs remain pending in Stage 1, Stage 2, or Stage 3.
 */
export function isStage3ClearedForMaterialReq(wip: Partial<OrderWipState>): boolean {
  const s1In = Math.max(0, Number(wip.stage1In || 0));
  const s1Rem = Math.max(0, s1In - Math.max(0, Number(wip.stage1Passed || 0)) - Math.max(0, Number(wip.stage1Defects || 0)));
  const s2In = Math.max(0, Number(wip.stage2In || 0));
  const s2Rem = Math.max(0, s2In - Math.max(0, Number(wip.stage2Passed || 0)) - Math.max(0, Number(wip.stage2Defects || 0)));
  const s3In = Math.max(0, Number(wip.stage3In || 0));
  const s3Passed = Math.max(0, Number(wip.stage3Passed || 0));
  const s3Defects = Math.max(0, Number(wip.stage3Defects || 0));
  const s3Rem = Math.max(0, s3In - s3Passed - s3Defects);
  return s3Passed > 0 && s1Rem === 0 && s2Rem === 0 && s3Rem === 0;
}

/**
 * Returns true when Stage 3 is cleared and the Material Requisition has been generated/issued
 * so Stage 4 (1st Packing) can proceed.
 */
export function isMaterialRequisitionIssuedForStage4(wip: Partial<OrderWipState>): boolean {
  if (!isStage3ClearedForMaterialReq(wip)) return false;
  const status = String(wip.mreqStatus || '').trim().toUpperCase();
  return status === 'ISSUED' || status === 'PRINTED' || status === 'FULFILLED' || Number(wip.stage4Passed || 0) > 0;
}

/**
 * Rolled Throughput Yield (RTY) across evaluated Stages 1-3:
 * product of stage yields g / (g + d) for every stage with processed pairs > 0.
 */
export function computeWipRolledYieldPct(wip: Partial<OrderWipState>): string {
  const stages: Array<[number, number]> = [
    [Math.max(0, Number(wip.stage1Passed || 0)), Math.max(0, Number(wip.stage1Defects || 0))],
    [Math.max(0, Number(wip.stage2Passed || 0)), Math.max(0, Number(wip.stage2Defects || 0))],
    [Math.max(0, Number(wip.stage3Passed || 0)), Math.max(0, Number(wip.stage3Defects || 0))]
  ];
  let evaluatedStages = 0;
  let rolled = 1;
  for (const [good, defects] of stages) {
    const processed = good + defects;
    if (processed > 0) {
      evaluatedStages += 1;
      rolled *= good / processed;
    }
  }
  if (evaluatedStages === 0) return '0.0%';
  const pct = Math.min(100, Math.max(0, rolled * 100));
  return `${pct.toFixed(1)}%`;
}

/**
 * 2.5 — Explicit GRN -> REQ many-to-many allocation record.
 */
export interface GrnToReqAllocation {
  allocationId: string;
  orderId: string;
  grnCode: string;
  reqNumber: string;
  allocatedPairs: number;
  allocatedSizes: SizeBreakdown;
}

export type ReconciliationGate =
  | 'NONE'
  | 'DOCK_GATE'
  | 'FLOOR_GATE'
  | 'ORDER_ROLLUP_GATE'
  | 'ALLOCATION_GATE';

export interface ReconciliationResult {
  isReconciled: boolean;
  status: 'RECONCILED' | 'VARIANCE';
  badgeText: 'RECONCILED ✓' | 'VARIANCE Δ';
  deltaPairs: number;
  failingGate: ReconciliationGate;
  detail: string;
}

export interface SuperUserGrnBatchItem {
  grnCode: string;
  orderBatchSeq: number;
  sr: number;
  date: string;
  orderId: string;
  pendingOrderId: string;
  maker: string;
  article: string;
  rcvdPairs: number;
  allocatedPairs: number;
  unallocatedPairs: number;
  allocationStatus: 'UNALLOCATED' | 'PARTIALLY ALLOCATED' | 'FULLY ALLOCATED' | 'VOIDED';
  allocatedToReqs: Array<{ reqNumber: string; pairs: number }>;
  sizes: SizeBreakdown;
  status: string;
  isVoided?: boolean;
  voidReason?: string;
}

export type ReqLifecycleStatus =
  | 'PENDING ISSUE'
  | 'IN FLOOR WIP'
  | 'STAGE 4 DONE (HOLD FOR QC)'
  | 'QC PASSED — READY FOR STAGE 5'
  | 'CLOSED ✓'
  | 'VOIDED';

export interface SuperUserReqBatchItem {
  reqNumber: string;
  mreqNo: string;
  altReqNo: string;
  orderReqSeq: number;
  orderId: string;
  parentOrderId: string;
  article: string;
  po: string;
  maker: string;
  askingPairs: number;
  issuedPairs: number;
  issueStatus: 'Pending Inward Issue' | 'Issued by Inward Register';
  activeStage: WipStage;
  awaitingFinalQc: boolean;
  finalQcApproved: boolean;
  stage1Passed: number;
  stage2Passed: number;
  stage3Passed: number;
  stage4Passed: number;
  packedStage5Pairs: number;
  packedStage5Cartons: number;
  sizes: SizeBreakdown;
  packedSizes: SizeBreakdown;
  inAlterationPairs: number;
  alterationCycleCount: number;
  scrappedPairs: number;
  contractorDebitPairs: number;
  inFloorWipPairs: number;
  mreqStatus: string;
  reqLifecycleStatus: ReqLifecycleStatus;
  allocatedFromGrns: Array<{ grnCode: string; pairs: number }>;
  reconciliation: ReconciliationResult;
  isVoided?: boolean;
  voidReason?: string;
}

export type OrderLifecycleStatus =
  | 'AWAITING DOCK #1 RECEIVING'
  | 'RECEIVING AT DOCK #1'
  | 'IN PACKING HALL WIP'
  | 'AWAITING FINAL QC (STAGE 4)'
  | 'COMPLETED & DISPATCHED';

/**
 * 2.10 & 11.1 — OrderTraceabilityItem contract (also exposed as SuperUserOrderRollup for full compatibility).
 * Exposes all required fields from 2.10 (grnCodes, reqNumbers, mReqNumbers, aReqNumbers, dockReconciled,
 * floorReconciled, dockVariancePairs, floorVariancePairs, isFullyReconciled, reconciliationSummary) and
 * 11.1 (plannedQty, receivedGrnQty, contractorBalanceQty, dockAvailableQty, issuedReqQty, stage1To4WipQty,
 * awaitingFinalQcQty, inAlterationQty, scrappedQty, packedStage5Qty, orderLifecycleStatus).
 */
export interface OrderTraceabilityItem {
  orderId: string;
  buyer: string;
  maker: string;
  po: string;
  article: string;
  color: string;
  sizeFormat?: string;
  sizeCodes?: string[];
  sizes: SizeBreakdown;
  packedSizes: SizeBreakdown;
  plannedQty: number;
  receivedGrnQty: number;
  contractorBalanceQty: number;
  askingReqQty: number;
  issuedReqQty: number;
  issuedToFloorQty: number;
  dockAvailableQty: number;
  dockPoolQty: number;
  inFloorWipQty: number;
  stage1To4WipQty: number;
  awaitingFinalQcQty: number;
  stage4ReadyForQcQty: number;
  inAlterationQty: number;
  scrappedQty: number;
  packedStage5Qty: number;
  packedStage5Cartons: number;
  unpackedOrderBalanceQty: number;
  orderStatus: OrderLifecycleStatus;
  orderLifecycleStatus: OrderLifecycleStatus;
  shortClosed?: boolean;
  shortCloseReason?: string;
  dueDate?: string;
  createdAt?: string;
  deliveryCountdown?: DeliveryCountdownInfo;
  contractorAllocations?: ContractorOrderAllocation[];
  grnCodes: string[];
  reqNumbers: string[];
  mReqNumbers: string[];
  aReqNumbers: string[];
  dockReconciled: boolean;
  floorReconciled: boolean;
  dockVariancePairs: number;
  floorVariancePairs: number;
  isFullyReconciled: boolean;
  reconciliationSummary: string;
  grnBatches: SuperUserGrnBatchItem[];
  reqBatches: SuperUserReqBatchItem[];
  allocations: GrnToReqAllocation[];
  reconciliation: ReconciliationResult;
}

export type SuperUserOrderRollup = OrderTraceabilityItem;

export interface SuperUserDashboardSummary {
  totalOrders: number;
  completedOrders: number;
  activeOrders: number;
  totalPlannedPairs: number;
  totalReceivedGrnPairs: number;
  totalContractorBalancePairs: number;
  totalDockAvailablePairs: number;
  totalAskingReqPairs: number;
  totalIssuedReqPairs: number;
  totalFloorWipPairs: number;
  stage1WipPairs: number;
  stage2WipPairs: number;
  stage3WipPairs: number;
  stage4ReadyForQcPairs: number;
  stage5PackedPairs: number;
  stage5PackedCartons: number;
  totalAlterationPairs: number;
  totalScrappedPairs: number;
  totalGrnCount: number;
  totalReqCount: number;
  reconciledOrdersCount: number;
  varianceOrdersCount: number;
  stage4HoldReqs: SuperUserReqBatchItem[];
  activeAlterationReqs: SuperUserReqBatchItem[];
  pendingIssueReqs: SuperUserReqBatchItem[];
  unfulfilledMreqReqs: SuperUserReqBatchItem[];
  orderRollups: SuperUserOrderRollup[];
}

/**
 * 3.4 — Non-tautological Floor WIP calculation from actual stage counts.
 * Instead of blindly setting FloorWIP = Issued - Packed - Alt - Scrap (which hides loss),
 * this inspects the actual stage buckets and detects any unaccounted variance.
 */
export function computeActualStageWipPairs(params: {
  isIssued: boolean;
  issuedPairs: number;
  stage1In?: number;
  stage1Passed?: number;
  stage2In?: number;
  stage2Passed?: number;
  stage2Defects?: number;
  stage3In?: number;
  stage3Passed?: number;
  stage3Defects?: number;
  stage4In?: number;
  stage4Passed?: number;
  packedStage5Pairs: number;
  inAlterationPairs: number;
  scrappedPairs: number;
  unaccountedVariancePairs?: number;
}): {
  actualFloorWipPairs: number;
  expectedFloorWipPairs: number;
  stage1Bucket: number;
  stage2Bucket: number;
  stage3Bucket: number;
  stage4Bucket: number;
  varianceDelta: number;
} {
  if (!params.isIssued || params.issuedPairs <= 0) {
    return {
      actualFloorWipPairs: 0,
      expectedFloorWipPairs: 0,
      stage1Bucket: 0,
      stage2Bucket: 0,
      stage3Bucket: 0,
      stage4Bucket: 0,
      varianceDelta: 0
    };
  }

  const expectedFloorWipPairs = Math.max(
    0,
    params.issuedPairs - params.packedStage5Pairs - params.inAlterationPairs - params.scrappedPairs
  );

  const explicitVariance = Number(params.unaccountedVariancePairs || 0);
  const s1In = Number(params.stage1In || 0);
  const s1Pass = Number(params.stage1Passed || 0);
  const s2In = Number(params.stage2In || 0);
  const s2Pass = Number(params.stage2Passed || 0);
  const s2Defects = Number(params.stage2Defects || 0);
  const s3In = Number(params.stage3In || 0);
  const s3Pass = Number(params.stage3Passed || 0);
  const s3Defects = Number(params.stage3Defects || 0);
  const s4In = Number(params.stage4In || 0);
  const s4Pass = Number(params.stage4Passed || 0);

  // Stage buckets based on stage handoffs:
  // Stage 4 waiting for Stage 5:
  const stage4Bucket = Math.max(0, Math.max(s4In, s4Pass) - params.packedStage5Pairs);
  // Stage 3 waiting for Stage 4:
  const stage3Bucket = Math.max(0, Math.max(s3In, s3Pass) - Math.max(s4In, s4Pass) - s3Defects);
  // Stage 2 waiting for Stage 3:
  const stage2Bucket = Math.max(0, Math.max(s2In, s2Pass) - Math.max(s3In, s3Pass) - s2Defects);
  // Stage 1 remaining on floor:
  const accountedDownstream =
    stage2Bucket +
    stage3Bucket +
    stage4Bucket +
    params.packedStage5Pairs +
    params.inAlterationPairs +
    params.scrappedPairs;
  const stage1Base = s1In > 0 ? s1In : params.issuedPairs;
  const stage1Bucket = Math.max(0, stage1Base - accountedDownstream - explicitVariance);

  const actualFloorWipPairs = Math.max(
    0,
    stage1Bucket + stage2Bucket + stage3Bucket + stage4Bucket
  );
  const varianceDelta =
    actualFloorWipPairs +
    params.packedStage5Pairs +
    params.inAlterationPairs +
    params.scrappedPairs -
    params.issuedPairs;

  return {
    actualFloorWipPairs,
    expectedFloorWipPairs,
    stage1Bucket,
    stage2Bucket,
    stage3Bucket,
    stage4Bucket,
    varianceDelta
  };
}

/**
 * 3.2 & 3.5 — Per-REQ reconciliation validator.
 * Checks: Issued to REQ === Floor WIP (S1-S4) + Packed (S5) + In Alteration + Scrapped
 */
export function evaluateReqReconciliation(params: {
  reqNumber: string;
  issuedPairs: number;
  inFloorWipPairs: number;
  packedStage5Pairs: number;
  inAlterationPairs: number;
  scrappedPairs: number;
  allocatedGrnPairs?: number;
}): ReconciliationResult {
  const {
    reqNumber,
    issuedPairs,
    inFloorWipPairs,
    packedStage5Pairs,
    inAlterationPairs,
    scrappedPairs,
    allocatedGrnPairs
  } = params;

  const floorSum = inFloorWipPairs + packedStage5Pairs + inAlterationPairs + scrappedPairs;
  const floorDelta = floorSum - issuedPairs;

  if (floorDelta !== 0) {
    return {
      isReconciled: false,
      status: 'VARIANCE',
      badgeText: 'VARIANCE Δ',
      deltaPairs: floorDelta,
      failingGate: 'FLOOR_GATE',
      detail: `${reqNumber} Floor Gate Variance: Issued (${issuedPairs}) != WIP (${inFloorWipPairs}) + Packed (${packedStage5Pairs}) + Alt (${inAlterationPairs}) + Scrap (${scrappedPairs}) [Δ ${floorDelta > 0 ? '+' : ''}${floorDelta} Prs]`
    };
  }

  if (
    allocatedGrnPairs !== undefined &&
    issuedPairs > 0 &&
    allocatedGrnPairs !== issuedPairs
  ) {
    const allocDelta = allocatedGrnPairs - issuedPairs;
    return {
      isReconciled: false,
      status: 'VARIANCE',
      badgeText: 'VARIANCE Δ',
      deltaPairs: allocDelta,
      failingGate: 'ALLOCATION_GATE',
      detail: `${reqNumber} Allocation Gate Variance: Allocated from GRNs (${allocatedGrnPairs}) != Issued (${issuedPairs}) [Δ ${allocDelta > 0 ? '+' : ''}${allocDelta} Prs]`
    };
  }

  return {
    isReconciled: true,
    status: 'RECONCILED',
    badgeText: 'RECONCILED ✓',
    deltaPairs: 0,
    failingGate: 'NONE',
    detail: `${reqNumber} Reconciled: ${issuedPairs} Issued = ${inFloorWipPairs} WIP + ${packedStage5Pairs} Packed + ${inAlterationPairs} Alt + ${scrappedPairs} Scrap`
  };
}

/**
 * 3.1, 3.3, 3.4, 3.5 — Parent Order 3-gate reconciliation validator.
 * Checks:
 *  1) Dock Gate: Received === Dock Pool + Issued (and Dock Pool >= 0)
 *  2) Floor Gate: Sum(REQ Issued) === Sum(WIP + Packed + Alt + Scrap)
 *  3) Parent Rule: Planned === Contractor Balance + Dock Pool + Floor WIP + Packed + Alt + Scrap (unless over-receipt)
 */
export function evaluateOrderReconciliation(params: {
  orderId: string;
  plannedQty: number;
  receivedGrnQty: number;
  contractorBalanceQty: number;
  dockPoolQty: number;
  issuedToFloorQty: number;
  inFloorWipQty: number;
  packedStage5Qty: number;
  inAlterationQty: number;
  scrappedQty: number;
  reqReconciliations?: ReconciliationResult[];
}): ReconciliationResult {
  const {
    orderId,
    plannedQty,
    receivedGrnQty,
    contractorBalanceQty,
    dockPoolQty,
    issuedToFloorQty,
    inFloorWipQty,
    packedStage5Qty,
    inAlterationQty,
    scrappedQty,
    reqReconciliations = []
  } = params;

  // 1) Dock Rule: Received (all GRNs) = Dock Pool + Issued (all REQs) and Issued <= Received
  const dockSum = dockPoolQty + issuedToFloorQty;
  const dockDelta = dockSum - receivedGrnQty;
  if (dockDelta !== 0 || dockPoolQty < 0 || issuedToFloorQty > receivedGrnQty) {
    const delta = dockDelta !== 0 ? dockDelta : issuedToFloorQty - receivedGrnQty;
    return {
      isReconciled: false,
      status: 'VARIANCE',
      badgeText: 'VARIANCE Δ',
      deltaPairs: delta,
      failingGate: 'DOCK_GATE',
      detail: `${orderId} Dock Gate Variance: Received (${receivedGrnQty}) != Dock Pool (${dockPoolQty}) + Issued (${issuedToFloorQty}) [Δ ${delta > 0 ? '+' : ''}${delta} Prs]`
    };
  }

  // 2) Floor Rule across REQs
  const failingReq = reqReconciliations.find(r => !r.isReconciled);
  if (failingReq) {
    return failingReq;
  }

  const floorSum = inFloorWipQty + packedStage5Qty + inAlterationQty + scrappedQty;
  const floorDelta = floorSum - issuedToFloorQty;
  if (floorDelta !== 0) {
    return {
      isReconciled: false,
      status: 'VARIANCE',
      badgeText: 'VARIANCE Δ',
      deltaPairs: floorDelta,
      failingGate: 'FLOOR_GATE',
      detail: `${orderId} Floor Gate Variance: Issued (${issuedToFloorQty}) != WIP (${inFloorWipQty}) + Packed (${packedStage5Qty}) + Alt (${inAlterationQty}) + Scrap (${scrappedQty}) [Δ ${floorDelta > 0 ? '+' : ''}${floorDelta} Prs]`
    };
  }

  // 3) Parent Rule: Planned = Contractor Balance + Dock Pool + Floor WIP + Packed + Alt + Scrap
  const effectivePlanned = Math.max(plannedQty, receivedGrnQty);
  const parentSum =
    contractorBalanceQty +
    dockPoolQty +
    inFloorWipQty +
    packedStage5Qty +
    inAlterationQty +
    scrappedQty;
  const parentDelta = parentSum - effectivePlanned;
  if (parentDelta !== 0) {
    return {
      isReconciled: false,
      status: 'VARIANCE',
      badgeText: 'VARIANCE Δ',
      deltaPairs: parentDelta,
      failingGate: 'ORDER_ROLLUP_GATE',
      detail: `${orderId} Order Rollup Variance: Planned (${effectivePlanned}) != Contractor Bal (${contractorBalanceQty}) + Dock (${dockPoolQty}) + Floor/Packed/Alt/Scrap (${floorSum}) [Δ ${parentDelta > 0 ? '+' : ''}${parentDelta} Prs]`
    };
  }

  return {
    isReconciled: true,
    status: 'RECONCILED',
    badgeText: 'RECONCILED ✓',
    deltaPairs: 0,
    failingGate: 'NONE',
    detail: `${orderId} Reconciled across all 3 gates (${effectivePlanned} Planned = ${contractorBalanceQty} Contractor + ${dockPoolQty} Dock + ${inFloorWipQty} WIP + ${packedStage5Qty} Packed + ${inAlterationQty} Alt + ${scrappedQty} Scrap)`
  };
}

/**
 * 2.5 — Many-to-many GRN -> REQ Allocation Engine.
 * Supports explicit allocations AND deterministic FIFO allocation across multiple GRNs into multiple REQs.
 */
export function allocateGrnsToRequisitions(params: {
  orderId: string;
  grnBatches: Array<{
    grnCode: string;
    rcvdPairs: number;
    sizes: SizeBreakdown;
    isVoided?: boolean;
  }>;
  reqBatches: Array<{
    reqNumber: string;
    issuedPairs: number;
    sizes: SizeBreakdown;
    explicitAllocations?: Array<{ grnCode: string; pairs: number }>;
    isVoided?: boolean;
  }>;
}): {
  allocations: GrnToReqAllocation[];
  grnAllocationSummary: Map<
    string,
    {
      allocatedPairs: number;
      unallocatedPairs: number;
      allocationStatus: 'UNALLOCATED' | 'PARTIALLY ALLOCATED' | 'FULLY ALLOCATED' | 'VOIDED';
      allocatedToReqs: Array<{ reqNumber: string; pairs: number }>;
    }
  >;
  reqAllocationSummary: Map<string, Array<{ grnCode: string; pairs: number }>>;
} {
  const { orderId, grnBatches, reqBatches } = params;
  const allocations: GrnToReqAllocation[] = [];

  const grnRemaining = new Map<string, number>();
  const grnSummary = new Map<
    string,
    {
      allocatedPairs: number;
      unallocatedPairs: number;
      allocationStatus: 'UNALLOCATED' | 'PARTIALLY ALLOCATED' | 'FULLY ALLOCATED' | 'VOIDED';
      allocatedToReqs: Array<{ reqNumber: string; pairs: number }>;
    }
  >();

  for (const g of grnBatches) {
    const cap = g.isVoided ? 0 : Math.max(0, Number(g.rcvdPairs || 0));
    grnRemaining.set(g.grnCode, cap);
    grnSummary.set(g.grnCode, {
      allocatedPairs: 0,
      unallocatedPairs: cap,
      allocationStatus: g.isVoided ? 'VOIDED' : 'UNALLOCATED',
      allocatedToReqs: []
    });
  }

  const reqSummary = new Map<string, Array<{ grnCode: string; pairs: number }>>();
  let seq = 1;

  for (const r of reqBatches) {
    reqSummary.set(r.reqNumber, []);
    if (r.isVoided || r.issuedPairs <= 0) continue;

    let needed = r.issuedPairs;

    // 1. Honor explicit allocations first if provided
    if (r.explicitAllocations && r.explicitAllocations.length > 0) {
      for (const exp of r.explicitAllocations) {
        if (needed <= 0) break;
        const avail = grnRemaining.get(exp.grnCode) || 0;
        const take = Math.min(needed, avail, Math.max(0, exp.pairs));
        if (take > 0) {
          grnRemaining.set(exp.grnCode, avail - take);
          needed -= take;
          allocations.push({
            allocationId: `ALLOC-${orderId}-${seq++}`,
            orderId,
            grnCode: exp.grnCode,
            reqNumber: r.reqNumber,
            allocatedPairs: take,
            allocatedSizes: scaleSizeBreakdown(r.sizes, take)
          });
          reqSummary.get(r.reqNumber)!.push({ grnCode: exp.grnCode, pairs: take });
          const gs = grnSummary.get(exp.grnCode);
          if (gs) {
            gs.allocatedPairs += take;
            gs.unallocatedPairs = Math.max(0, (grnRemaining.get(exp.grnCode) || 0));
            gs.allocatedToReqs.push({ reqNumber: r.reqNumber, pairs: take });
          }
        }
      }
    }

    // 2. Deterministic FIFO across remaining unallocated GRNs
    for (const g of grnBatches) {
      if (needed <= 0) break;
      if (g.isVoided) continue;
      const avail = grnRemaining.get(g.grnCode) || 0;
      if (avail <= 0) continue;
      const take = Math.min(needed, avail);
      grnRemaining.set(g.grnCode, avail - take);
      needed -= take;
      allocations.push({
        allocationId: `ALLOC-${orderId}-${seq++}`,
        orderId,
        grnCode: g.grnCode,
        reqNumber: r.reqNumber,
        allocatedPairs: take,
        allocatedSizes: scaleSizeBreakdown(r.sizes, take)
      });
      reqSummary.get(r.reqNumber)!.push({ grnCode: g.grnCode, pairs: take });
      const gs = grnSummary.get(g.grnCode);
      if (gs) {
        gs.allocatedPairs += take;
        gs.unallocatedPairs = Math.max(0, (grnRemaining.get(g.grnCode) || 0));
        gs.allocatedToReqs.push({ reqNumber: r.reqNumber, pairs: take });
      }
    }
  }

  // Finalize GRN allocation statuses
  for (const g of grnBatches) {
    const gs = grnSummary.get(g.grnCode);
    if (!gs) continue;
    if (g.isVoided) {
      gs.allocationStatus = 'VOIDED';
    } else if (gs.allocatedPairs <= 0) {
      gs.allocationStatus = 'UNALLOCATED';
    } else if (gs.unallocatedPairs === 0 && gs.allocatedPairs >= g.rcvdPairs) {
      gs.allocationStatus = 'FULLY ALLOCATED';
    } else {
      gs.allocationStatus = 'PARTIALLY ALLOCATED';
    }
  }

  return {
    allocations,
    grnAllocationSummary: grnSummary,
    reqAllocationSummary: reqSummary
  };
}
