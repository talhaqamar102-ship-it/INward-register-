export interface SizeBreakdown {
  '6'?: number;
  '7': number;
  '8': number;
  '9': number;
  '10': number;
  '11': number;
  '12'?: number;
}

/**
 * R1 (DECISION) — Single authoritative size set constants used across Order, GRN, REQ, Stage 5, and tests.
 * - Plan 1 size set: 7/S .. 11/XXL (`STANDARD_SIZE_KEYS` / `STANDARD_GLOVE_SIZES`)
 * - Plan 2 size set: 6 .. 12 (`EXTENDED_SIZE_KEYS` / `EXTENDED_GLOVE_SIZES`)
 */
export const STANDARD_GLOVE_SIZES = ['7', '8', '9', '10', '11'] as const;
export const EXTENDED_GLOVE_SIZES = ['6', '7', '8', '9', '10', '11', '12'] as const;
export const STANDARD_SIZE_KEYS = STANDARD_GLOVE_SIZES;
export const EXTENDED_SIZE_KEYS = EXTENDED_GLOVE_SIZES;

export function getActiveGloveSizes(includeExtended = false): readonly string[] {
  return includeExtended ? EXTENDED_GLOVE_SIZES : STANDARD_GLOVE_SIZES;
}

export const SIZE_LABELS: Array<{ key: '7' | '8' | '9' | '10' | '11'; label: string }> = [
  { key: '7', label: '7 / S' },
  { key: '8', label: '8 / M' },
  { key: '9', label: '9 / L' },
  { key: '10', label: '10 / XL' },
  { key: '11', label: '11 / XXL' }
];

export interface PendingOrder {
  orderId: string;
  buyer?: string;
  maker: string;
  po?: string;
  article: string;
  color?: string;
  sizes?: SizeBreakdown;
  totalQty?: number;
  notes?: string;
  shortClosed?: boolean;
  shortCloseReason?: string;
  /** Independent physical/bin count at Dock #1 (when recorded, used directly instead of sum of GRN unallocated bins) */
  physicalDockCountPairs?: number;
  isDemoScenario?: boolean;
}

export function createEmptySizes(): SizeBreakdown {
  return { '7': 0, '8': 0, '9': 0, '10': 0, '11': 0 };
}

export function normalizeBaseReqNumber(reqNo: string): string {
  const trimmed = (reqNo || '').trim().replace(/^[MA]-/i, '');
  return trimmed || 'REQ-2026-0001';
}

export function getMaterialReqNumber(reqNo: string): string {
  return `M-${normalizeBaseReqNumber(reqNo)}`;
}

export function getAlterationReqNumber(reqNo: string): string {
  return `A-${normalizeBaseReqNumber(reqNo)}`;
}

export function calculateSizeTotal(sizes?: Partial<SizeBreakdown> | null): number {
  if (!sizes) return 0;
  return EXTENDED_GLOVE_SIZES.reduce((sum, key) => {
    const val = Number(sizes[key] || 0);
    return sum + (Number.isFinite(val) && val > 0 ? val : 0);
  }, 0);
}

export function scaleSizeBreakdown(sizes: SizeBreakdown, targetTotal: number): SizeBreakdown {
  const baseTotal = calculateSizeTotal(sizes);
  if (targetTotal <= 0) return createEmptySizes();
  if (baseTotal <= 0) {
    const perSize = Math.floor(targetTotal / 5);
    const rem = targetTotal - perSize * 5;
    return {
      '7': perSize,
      '8': perSize,
      '9': perSize + rem,
      '10': perSize,
      '11': perSize
    };
  }
  const ratio = targetTotal / baseTotal;
  const scaled: SizeBreakdown = {
    '7': Math.floor(Number(sizes['7'] || 0) * ratio),
    '8': Math.floor(Number(sizes['8'] || 0) * ratio),
    '9': Math.floor(Number(sizes['9'] || 0) * ratio),
    '10': Math.floor(Number(sizes['10'] || 0) * ratio),
    '11': Math.floor(Number(sizes['11'] || 0) * ratio)
  };
  const currentSum = calculateSizeTotal(scaled);
  const diff = targetTotal - currentSum;
  if (diff !== 0) {
    scaled['9'] = Math.max(0, scaled['9'] + diff);
  }
  return scaled;
}

/**
 * 1.2 — Legacy sub-tab normalizer: redirects any legacy tab ID to the 4 canonical views.
 */
export type CanonicalSuperUserTab = 'dashboard' | 'tracking' | 'creation' | 'reports';

export function normalizeSuperUserTab(tabId?: string | null): CanonicalSuperUserTab {
  const raw = (tabId || '').trim().toLowerCase();
  if (raw === 'tracking' || raw === 'traceability' || raw === 'ledger' || raw === 'live') {
    return 'tracking';
  }
  if (raw === 'creation' || raw === 'orders' || raw === 'admin' || raw === 'registry' || raw === 'master') {
    return 'creation';
  }
  if (raw === 'reports' || raw === 'analytics' || raw === 'print' || raw === 'export') {
    return 'reports';
  }
  return 'dashboard';
}

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
  stage3In?: number;
  stage3Passed?: number;
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
  const s3In = Number(params.stage3In || 0);
  const s3Pass = Number(params.stage3Passed || 0);
  const s4In = Number(params.stage4In || 0);
  const s4Pass = Number(params.stage4Passed || 0);

  // Stage buckets based on stage handoffs:
  // Stage 4 waiting for Stage 5:
  const stage4Bucket = Math.max(0, Math.max(s4In, s4Pass) - params.packedStage5Pairs);
  // Stage 3 waiting for Stage 4:
  const stage3Bucket = Math.max(0, Math.max(s3In, s3Pass) - Math.max(s4In, s4Pass));
  // Stage 2 waiting for Stage 3:
  const stage2Bucket = Math.max(0, Math.max(s2In, s2Pass) - Math.max(s3In, s3Pass));
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

/**
 * 2.9 — Schema Migration helper for existing pending orders and historical GRN/REQ records.
 * Normalizes legacy records lacking explicit orderId, grnCode, or relational foreign keys.
 */
export function migrateLegacyRecordsToRelationalHierarchy(params: {
  pendingOrders: PendingOrder[];
  grnList: Array<{
    sr: number;
    grnCode?: string;
    date: string;
    pendingOrderId?: string;
    maker: string;
    article: string;
    rcvdPairs: number;
    sizes?: SizeBreakdown;
    status?: string;
  }>;
  requisitions: OrderWipState[];
}): {
  migratedOrders: PendingOrder[];
  migratedGrns: Array<{
    sr: number;
    grnCode: string;
    date: string;
    pendingOrderId: string;
    maker: string;
    article: string;
    rcvdPairs: number;
    sizes: SizeBreakdown;
    status: string;
  }>;
  migratedRequisitions: OrderWipState[];
  migrationReport: {
    synthesizedOrdersCount: number;
    linkedGrnsCount: number;
    linkedReqsCount: number;
  };
} {
  const migratedOrders: PendingOrder[] = params.pendingOrders.map(o => ({
    ...o,
    sizes: o.sizes ? { ...createEmptySizes(), ...o.sizes } : createEmptySizes(),
    totalQty: Math.max(Number(o.totalQty || 0), calculateSizeTotal(o.sizes))
  }));

  const orderMap = new Map<string, PendingOrder>();
  for (const o of migratedOrders) {
    orderMap.set(o.orderId, o);
  }

  let synthesizedOrdersCount = 0;
  let linkedGrnsCount = 0;
  let linkedReqsCount = 0;

  const migratedGrns = params.grnList.map((g, idx) => {
    const grnCode = g.grnCode || formatBatchSequence('GRN', g.sr || idx + 1);
    let targetOrderId = (g.pendingOrderId || '').trim();
    if (!targetOrderId || targetOrderId === '---' || targetOrderId === 'ORD-INWARD') {
      const byArticle = migratedOrders.find(
        o => o.article.toLowerCase() === (g.article || '').toLowerCase()
      );
      if (byArticle) {
        targetOrderId = byArticle.orderId;
      } else {
        targetOrderId = `ORD-MIG-${String(idx + 1).padStart(3, '0')}`;
        if (!orderMap.has(targetOrderId)) {
          const synth: PendingOrder = {
            orderId: targetOrderId,
            buyer: 'Migrated Legacy Buyer',
            maker: g.maker || '---',
            po: targetOrderId,
            article: g.article || '---',
            color: 'Standard',
            sizes: g.sizes || createEmptySizes(),
            totalQty: Number(g.rcvdPairs || 0)
          };
          orderMap.set(targetOrderId, synth);
          migratedOrders.push(synth);
          synthesizedOrdersCount += 1;
        }
      }
    }
    linkedGrnsCount += 1;
    return {
      sr: g.sr || idx + 1,
      grnCode,
      date: g.date || '31-10-2026',
      pendingOrderId: targetOrderId,
      maker: g.maker || '---',
      article: g.article || '---',
      rcvdPairs: Number(g.rcvdPairs || 0),
      sizes: g.sizes ? { ...createEmptySizes(), ...g.sizes } : createEmptySizes(),
      status: g.status || 'Received'
    };
  });

  const migratedRequisitions = params.requisitions.map((r, idx) => {
    const normReq = normalizeBaseReqNumber(r.reqNumber || formatBatchSequence('REQ', idx + 1));
    let parentId = (r.parentOrderId || '').trim();
    if (!parentId || !orderMap.has(parentId)) {
      const byPo = migratedOrders.find(o => r.po && (o.po === r.po || o.orderId === r.po));
      const byArticle = migratedOrders.find(
        o => r.article && o.article.toLowerCase() === r.article.toLowerCase()
      );
      parentId = byPo?.orderId || byArticle?.orderId || migratedOrders[0]?.orderId || 'ORD-MIG-001';
    }
    linkedReqsCount += 1;
    return {
      ...r,
      reqNumber: normReq,
      mreqNo: getMaterialReqNumber(normReq),
      altReqNo: getAlterationReqNumber(normReq),
      parentOrderId: parentId,
      sizes: r.sizes ? { ...createEmptySizes(), ...r.sizes } : createEmptySizes(),
      packedSizes: r.packedSizes || scaleSizeBreakdown(r.sizes || createEmptySizes(), Number(r.outputPairs || 0))
    };
  });

  return {
    migratedOrders,
    migratedGrns,
    migratedRequisitions,
    migrationReport: {
      synthesizedOrdersCount,
      linkedGrnsCount,
      linkedReqsCount
    }
  };
}

export function buildSuperUserOrderRollups(params: {
  pendingOrders: PendingOrder[];
  grnList: Array<{
    sr: number;
    grnCode?: string;
    date: string;
    pendingOrderId: string;
    maker: string;
    article: string;
    rcvdPairs: number;
    sizes?: SizeBreakdown;
    status?: string;
    isVoided?: boolean;
    voidReason?: string;
  }>;
  requisitions: OrderWipState[];
  defectList?: Array<{
    id: string;
    article?: string;
    po?: string;
    qty: string | number;
    status: string;
    cycles?: number;
  }>;
}): SuperUserDashboardSummary {
  const { pendingOrders = [], grnList = [], requisitions = [], defectList = [] } = params;

  const orderMap = new Map<string, PendingOrder>();
  for (const ord of pendingOrders) {
    orderMap.set(ord.orderId, ord);
  }

  for (const g of grnList) {
    const oid = (g.pendingOrderId || '').trim();
    if (oid && oid !== '---' && !orderMap.has(oid)) {
      orderMap.set(oid, {
        orderId: oid,
        buyer: 'Standard Buyer',
        maker: g.maker || '---',
        po: oid,
        article: g.article || '---',
        color: 'Standard',
        sizes: g.sizes || createEmptySizes(),
        totalQty: g.rcvdPairs || 0
      });
    }
  }

  // Deduplicate requisitions by normalized base req number
  const reqMap = new Map<string, OrderWipState>();
  for (const r of requisitions) {
    const norm = normalizeBaseReqNumber(r.reqNumber);
    const hasActivity =
      Number(r.plannedQty || 0) > 0 ||
      Number(r.stage1In || 0) > 0 ||
      Number(r.outputPairs || 0) > 0 ||
      Boolean(r.article && r.article !== '---');
    if (hasActivity || !reqMap.has(norm)) {
      reqMap.set(norm, { ...r, reqNumber: norm });
    }
  }

  const activeReqs = Array.from(reqMap.values()).filter(
    r =>
      !r.isVoided &&
      (Number(r.plannedQty || 0) > 0 ||
        Number(r.stage1In || 0) > 0 ||
        Number(r.outputPairs || 0) > 0 ||
        Boolean(r.article && r.article.trim() !== '' && r.article !== '---'))
  );

  for (const r of activeReqs) {
    let matchedOrderId = r.parentOrderId || '';
    if (!matchedOrderId || !orderMap.has(matchedOrderId)) {
      const byPo = Array.from(orderMap.values()).find(
        o => r.po && r.po !== '---' && (o.po === r.po || o.orderId === r.po)
      );
      const byArticle = Array.from(orderMap.values()).find(
        o => r.article && o.article.toLowerCase() === r.article.toLowerCase()
      );
      const fallbackFirst = Array.from(orderMap.values())[0];
      matchedOrderId = byPo?.orderId || byArticle?.orderId || fallbackFirst?.orderId || 'ORD-UNASSIGNED';
      if (!orderMap.has(matchedOrderId)) {
        orderMap.set(matchedOrderId, {
          orderId: matchedOrderId,
          buyer: r.buyer || 'Direct Floor Order',
          maker: r.maker || '---',
          po: r.po || '---',
          article: r.article || '---',
          color: 'Standard',
          sizes: r.sizes || createEmptySizes(),
          totalQty: Number(r.plannedQty || 0)
        });
      }
      r.parentOrderId = matchedOrderId;
    }
  }

  const sortedGrns = [...grnList]
    .filter(g => !g.isVoided && g.status !== 'VOIDED')
    .sort((a, b) => Number(a.sr || 0) - Number(b.sr || 0));

  const orderRollups: SuperUserOrderRollup[] = [];
  let stage1WipTotal = 0;
  let stage2WipTotal = 0;
  let stage3WipTotal = 0;

  for (const ord of orderMap.values()) {
    const plannedSizes = ord.sizes || createEmptySizes();
    const plannedQty = Math.max(Number(ord.totalQty || 0), calculateSizeTotal(plannedSizes));

    const matchingGrns = sortedGrns.filter(g => {
      if (g.pendingOrderId && g.pendingOrderId === ord.orderId) return true;
      if (ord.po && ord.po !== '---' && g.pendingOrderId === ord.po) return true;
      if (
        (!g.pendingOrderId || g.pendingOrderId === 'ORD-INWARD' || g.pendingOrderId === '---') &&
        g.article === ord.article &&
        g.maker === ord.maker
      ) {
        return true;
      }
      return false;
    });

    const rawGrnBatches = matchingGrns.map((g, idx) => ({
      grnCode: g.grnCode || formatBatchSequence('GRN', g.sr || idx + 1),
      orderBatchSeq: idx + 1,
      sr: g.sr || idx + 1,
      date: g.date || '31-10-2026',
      orderId: ord.orderId,
      pendingOrderId: ord.orderId,
      maker: g.maker || ord.maker,
      article: g.article || ord.article,
      rcvdPairs: Number(g.rcvdPairs || 0),
      sizes: g.sizes || createEmptySizes(),
      status: g.status || 'Received',
      isVoided: Boolean(g.isVoided)
    }));

    const receivedGrnQty = rawGrnBatches.reduce((sum, b) => sum + b.rcvdPairs, 0);
    const effectivePlannedQty = ord.shortClosed ? receivedGrnQty : Math.max(plannedQty, receivedGrnQty);
    const contractorBalanceQty = ord.shortClosed ? 0 : Math.max(0, plannedQty - receivedGrnQty);

    const matchingReqs = activeReqs.filter(r => r.parentOrderId === ord.orderId);

    // Prepare preliminary REQ objects for GRN -> REQ allocation engine
    const prelimReqs = matchingReqs.map(r => {
      const baseReq = normalizeBaseReqNumber(r.reqNumber);
      const askingPairs = Math.max(Number(r.plannedQty || 0), calculateSizeTotal(r.sizes || {}));
      const isIssued = r.issueStatus === 'Issued by Inward Register' || Number(r.stage1In || 0) > 0;
      const issuedPairs = isIssued ? Math.max(Number(r.stage1In || 0), askingPairs) : 0;
      const explicitAllocations =
        r.allocatedGrnRefs && r.allocatedGrnRefs.length > 0
          ? r.allocatedGrnRefs
          : r.grnRef
            ? [{ grnCode: r.grnRef, pairs: issuedPairs }]
            : undefined;
      return {
        reqNumber: baseReq,
        issuedPairs,
        sizes: r.sizes || createEmptySizes(),
        explicitAllocations,
        isVoided: Boolean(r.isVoided)
      };
    });

    const allocationResult = allocateGrnsToRequisitions({
      orderId: ord.orderId,
      grnBatches: rawGrnBatches,
      reqBatches: prelimReqs
    });

    const grnBatches: SuperUserGrnBatchItem[] = rawGrnBatches.map(g => {
      const summary = allocationResult.grnAllocationSummary.get(g.grnCode);
      return {
        ...g,
        allocatedPairs: summary?.allocatedPairs ?? 0,
        unallocatedPairs: summary?.unallocatedPairs ?? g.rcvdPairs,
        allocationStatus: summary?.allocationStatus ?? 'UNALLOCATED',
        allocatedToReqs: summary?.allocatedToReqs ?? []
      };
    });

    const reqBatches: SuperUserReqBatchItem[] = matchingReqs.map((r, idx) => {
      const baseReq = normalizeBaseReqNumber(r.reqNumber);
      const mreqNo = getMaterialReqNumber(baseReq);
      const altReqNo = getAlterationReqNumber(baseReq);
      const reqSizes = r.sizes || createEmptySizes();
      const askingPairs = Math.max(Number(r.plannedQty || 0), calculateSizeTotal(reqSizes));
      const isIssued = r.issueStatus === 'Issued by Inward Register' || Number(r.stage1In || 0) > 0;
      const issuedPairs = isIssued ? Math.max(Number(r.stage1In || 0), askingPairs) : 0;

      const relatedDefects = defectList.filter(d => normalizeBaseReqNumber(d.id) === baseReq);
      const defectListScrap = relatedDefects
        .filter(d => d.status === 'Scrapped')
        .reduce((sum, d) => sum + (parseInt(String(d.qty), 10) || 0), 0);
      const defectListActive = relatedDefects
        .filter(d => d.status !== 'Completed' && d.status !== 'Scrapped')
        .reduce((sum, d) => sum + (parseInt(String(d.qty), 10) || 0), 0);
      const maxDefectCycle = relatedDefects.reduce((max, d) => Math.max(max, Number(d.cycles || 1)), 0);

      const scrappedPairs = Math.max(Number(r.scrappedPairs || 0), defectListScrap);
      const inAlterationPairs =
        relatedDefects.length > 0
          ? defectListActive
          : Math.max(0, Number(r.inAlteration || 0) - scrappedPairs);
      const alterationCycleCount = Math.max(
        Number(r.alterationCycleCount || 0),
        maxDefectCycle,
        inAlterationPairs > 0 ? 1 : 0
      );

      const packedStage5Pairs = Number(r.outputPairs || 0);
      const packedStage5Cartons = Number(r.outputCartons || 0);
      const packedSizes =
        r.packedSizes && calculateSizeTotal(r.packedSizes) > 0
          ? r.packedSizes
          : scaleSizeBreakdown(reqSizes, packedStage5Pairs);

      const activeStage = determineOrderActiveStage(r);
      const awaitingFinalQc = isReqAwaitingFinalQc(r);

      // 3.4 — Compute Floor WIP from actual stage buckets (non-tautological)
      const stageCalc = computeActualStageWipPairs({
        isIssued,
        issuedPairs,
        stage1In: r.stage1In,
        stage1Passed: r.stage1Passed,
        stage2In: r.stage2In,
        stage2Passed: r.stage2Passed,
        stage3In: r.stage3In,
        stage3Passed: r.stage3Passed,
        stage4In: r.stage4In,
        stage4Passed: r.stage4Passed,
        packedStage5Pairs,
        inAlterationPairs,
        scrappedPairs,
        unaccountedVariancePairs: r.unaccountedVariancePairs
      });

      const inFloorWipPairs = stageCalc.actualFloorWipPairs;

      if (isIssued && packedStage5Pairs < issuedPairs) {
        if (activeStage === 'STEP_1') stage1WipTotal += inFloorWipPairs;
        else if (activeStage === 'STEP_2') stage2WipTotal += inFloorWipPairs;
        else if (activeStage === 'STEP_3' || activeStage === 'STEP_4') stage3WipTotal += inFloorWipPairs;
      }

      const allocatedFromGrns = allocationResult.reqAllocationSummary.get(baseReq) || [];
      const allocatedGrnSum = allocatedFromGrns.reduce((s, a) => s + a.pairs, 0);

      const reqReconciliation = evaluateReqReconciliation({
        reqNumber: baseReq,
        issuedPairs,
        inFloorWipPairs,
        packedStage5Pairs,
        inAlterationPairs,
        scrappedPairs,
        allocatedGrnPairs: receivedGrnQty > 0 && isIssued ? allocatedGrnSum : undefined
      });

      let reqLifecycleStatus: ReqLifecycleStatus = 'PENDING ISSUE';
      if (r.isVoided) {
        reqLifecycleStatus = 'VOIDED';
      } else if (
        isIssued &&
        issuedPairs > 0 &&
        packedStage5Pairs + scrappedPairs >= issuedPairs &&
        inAlterationPairs === 0
      ) {
        reqLifecycleStatus = 'CLOSED ✓';
      } else if (awaitingFinalQc) {
        reqLifecycleStatus = 'STAGE 4 DONE (HOLD FOR QC)';
      } else if (r.finalQcApproved && packedStage5Pairs < Number(r.stage4Passed || 0)) {
        reqLifecycleStatus = 'QC PASSED — READY FOR STAGE 5';
      } else if (isIssued) {
        reqLifecycleStatus = 'IN FLOOR WIP';
      }

      return {
        reqNumber: baseReq,
        mreqNo,
        altReqNo,
        orderReqSeq: idx + 1,
        orderId: ord.orderId,
        parentOrderId: ord.orderId,
        article: r.article || ord.article,
        po: r.po || ord.po || '---',
        maker: r.maker || ord.maker || '---',
        askingPairs,
        issuedPairs,
        issueStatus: isIssued ? 'Issued by Inward Register' : 'Pending Inward Issue',
        activeStage,
        awaitingFinalQc,
        finalQcApproved: Boolean(r.finalQcApproved),
        stage1Passed: Number(r.stage1Passed || 0),
        stage2Passed: Number(r.stage2Passed || 0),
        stage3Passed: Number(r.stage3Passed || 0),
        stage4Passed: Number(r.stage4Passed || 0),
        packedStage5Pairs,
        packedStage5Cartons,
        sizes: reqSizes,
        packedSizes,
        inAlterationPairs,
        alterationCycleCount,
        scrappedPairs,
        contractorDebitPairs: Number(r.contractorDebitPairs || scrappedPairs),
        inFloorWipPairs,
        mreqStatus: r.mreqStatus || (isIssued ? 'Issued' : 'Ready'),
        reqLifecycleStatus,
        allocatedFromGrns,
        reconciliation: reqReconciliation
      };
    });

    const askingReqQty = reqBatches.reduce((s, b) => s + b.askingPairs, 0);
    const issuedReqQty = reqBatches.reduce((s, b) => s + b.issuedPairs, 0);
    // 3.1 & 3.4 — Non-tautological Dock Available Buffer:
    // Derived from the independent GRN unallocated dock bin ledger (or physicalDockCountPairs if recorded on the Order),
    // NOT from subtracting (receivedGrnQty - issuedReqQty). If an over-issue or dock bin loss occurs,
    // dockAvailableQty + issuedReqQty !== receivedGrnQty and DOCK_GATE flags the exact variance delta.
    const grnBinUnallocatedSum = grnBatches.reduce((s, g) => s + g.unallocatedPairs, 0);
    const dockAvailableQty =
      ord.physicalDockCountPairs !== undefined
        ? Math.max(0, Number(ord.physicalDockCountPairs))
        : grnBinUnallocatedSum;
    const inFloorWipQty = reqBatches.reduce((s, b) => s + b.inFloorWipPairs, 0);
    const awaitingFinalQcQty = reqBatches
      .filter(b => b.awaitingFinalQc)
      .reduce((s, b) => s + Math.max(0, b.stage4Passed - b.packedStage5Pairs), 0);
    const inAlterationQty = reqBatches.reduce((s, b) => s + b.inAlterationPairs, 0);
    const scrappedQty = reqBatches.reduce((s, b) => s + b.scrappedPairs, 0);
    const packedStage5Qty = reqBatches.reduce((s, b) => s + b.packedStage5Pairs, 0);
    const packedStage5Cartons = reqBatches.reduce((s, b) => s + b.packedStage5Cartons, 0);
    const unpackedOrderBalanceQty = Math.max(0, effectivePlannedQty - packedStage5Qty - scrappedQty);

    const orderPackedSizes = createEmptySizes();
    for (const rb of reqBatches) {
      for (const sz of STANDARD_GLOVE_SIZES) {
        orderPackedSizes[sz] += Number(rb.packedSizes[sz] || 0);
      }
    }

    const dockVariancePairs = dockAvailableQty + issuedReqQty - receivedGrnQty;
    const dockReconciled = dockVariancePairs === 0 && dockAvailableQty >= 0 && issuedReqQty <= receivedGrnQty;
    const floorVariancePairs =
      inFloorWipQty + packedStage5Qty + inAlterationQty + scrappedQty - issuedReqQty;
    const floorReconciled =
      floorVariancePairs === 0 && reqBatches.every(b => b.reconciliation.isReconciled);

    const orderReconciliation = evaluateOrderReconciliation({
      orderId: ord.orderId,
      plannedQty: effectivePlannedQty,
      receivedGrnQty,
      contractorBalanceQty,
      dockPoolQty: dockAvailableQty,
      issuedToFloorQty: issuedReqQty,
      inFloorWipQty,
      packedStage5Qty,
      inAlterationQty,
      scrappedQty,
      reqReconciliations: reqBatches.map(b => b.reconciliation)
    });

    let orderStatus: OrderLifecycleStatus = 'AWAITING DOCK #1 RECEIVING';
    if (
      effectivePlannedQty > 0 &&
      receivedGrnQty >= effectivePlannedQty &&
      issuedReqQty >= receivedGrnQty &&
      issuedReqQty > 0 &&
      packedStage5Qty + scrappedQty >= issuedReqQty &&
      inAlterationQty === 0
    ) {
      orderStatus = 'COMPLETED & DISPATCHED';
    } else if (awaitingFinalQcQty > 0) {
      orderStatus = 'AWAITING FINAL QC (STAGE 4)';
    } else if (reqBatches.length > 0 && (issuedReqQty > 0 || askingReqQty > 0)) {
      orderStatus = 'IN PACKING HALL WIP';
    } else if (receivedGrnQty > 0) {
      orderStatus = 'RECEIVING AT DOCK #1';
    }

    orderRollups.push({
      orderId: ord.orderId,
      buyer: ord.buyer || 'Standard Client',
      maker: ord.maker || '---',
      po: ord.po || '---',
      article: ord.article || '---',
      color: ord.color || 'Standard',
      sizes: plannedSizes,
      packedSizes: orderPackedSizes,
      plannedQty,
      receivedGrnQty,
      contractorBalanceQty,
      askingReqQty,
      issuedReqQty,
      issuedToFloorQty: issuedReqQty,
      dockAvailableQty,
      dockPoolQty: dockAvailableQty,
      inFloorWipQty,
      stage1To4WipQty: inFloorWipQty,
      awaitingFinalQcQty,
      stage4ReadyForQcQty: awaitingFinalQcQty,
      inAlterationQty,
      scrappedQty,
      packedStage5Qty,
      packedStage5Cartons,
      unpackedOrderBalanceQty,
      orderStatus,
      orderLifecycleStatus: orderStatus,
      shortClosed: ord.shortClosed,
      shortCloseReason: ord.shortCloseReason,
      grnCodes: grnBatches.map(g => g.grnCode),
      reqNumbers: reqBatches.map(r => r.reqNumber),
      mReqNumbers: reqBatches.map(r => r.mreqNo),
      aReqNumbers: reqBatches.map(r => r.altReqNo),
      dockReconciled,
      floorReconciled,
      dockVariancePairs,
      floorVariancePairs,
      isFullyReconciled: orderReconciliation.isReconciled,
      reconciliationSummary: orderReconciliation.detail,
      grnBatches,
      reqBatches,
      allocations: allocationResult.allocations,
      reconciliation: orderReconciliation
    });
  }

  const allReqBatches = orderRollups.flatMap(o => o.reqBatches);
  const totalOrders = orderRollups.length;
  const completedOrders = orderRollups.filter(o => o.orderStatus === 'COMPLETED & DISPATCHED').length;
  const activeOrders = totalOrders - completedOrders;
  const reconciledOrdersCount = orderRollups.filter(o => o.reconciliation.isReconciled).length;
  const varianceOrdersCount = totalOrders - reconciledOrdersCount;

  return {
    totalOrders,
    completedOrders,
    activeOrders,
    totalPlannedPairs: orderRollups.reduce((s, o) => s + o.plannedQty, 0),
    totalReceivedGrnPairs: orderRollups.reduce((s, o) => s + o.receivedGrnQty, 0),
    totalContractorBalancePairs: orderRollups.reduce((s, o) => s + o.contractorBalanceQty, 0),
    totalDockAvailablePairs: orderRollups.reduce((s, o) => s + o.dockAvailableQty, 0),
    totalAskingReqPairs: orderRollups.reduce((s, o) => s + o.askingReqQty, 0),
    totalIssuedReqPairs: orderRollups.reduce((s, o) => s + o.issuedReqQty, 0),
    totalFloorWipPairs: orderRollups.reduce((s, o) => s + o.inFloorWipQty, 0),
    stage1WipPairs: stage1WipTotal,
    stage2WipPairs: stage2WipTotal,
    stage3WipPairs: stage3WipTotal,
    stage4ReadyForQcPairs: orderRollups.reduce((s, o) => s + o.awaitingFinalQcQty, 0),
    stage5PackedPairs: orderRollups.reduce((s, o) => s + o.packedStage5Qty, 0),
    stage5PackedCartons: orderRollups.reduce((s, o) => s + o.packedStage5Cartons, 0),
    totalAlterationPairs: orderRollups.reduce((s, o) => s + o.inAlterationQty, 0),
    totalScrappedPairs: orderRollups.reduce((s, o) => s + o.scrappedQty, 0),
    totalGrnCount: orderRollups.reduce((s, o) => s + o.grnBatches.length, 0),
    totalReqCount: allReqBatches.length,
    reconciledOrdersCount,
    varianceOrdersCount,
    stage4HoldReqs: allReqBatches.filter(r => r.awaitingFinalQc),
    activeAlterationReqs: allReqBatches.filter(r => r.inAlterationPairs > 0),
    pendingIssueReqs: allReqBatches.filter(r => r.issueStatus === 'Pending Inward Issue' && r.askingPairs > 0),
    unfulfilledMreqReqs: allReqBatches.filter(
      r => r.issuedPairs > 0 && r.mreqStatus !== 'Issued' && r.mreqStatus !== 'Fulfilled' && r.packedStage5Pairs < r.issuedPairs
    ),
    orderRollups
  };
}

/**
 * 11.1 — Unit-testable helper aliases: computeOrderReconciliationMetrics & buildOrderTraceability.
 */
export const buildOrderTraceability = buildSuperUserOrderRollups;

export function computeOrderReconciliationMetrics(rollup: OrderTraceabilityItem): ReconciliationResult {
  return evaluateOrderReconciliation({
    orderId: rollup.orderId,
    plannedQty: rollup.plannedQty,
    receivedGrnQty: rollup.receivedGrnQty,
    contractorBalanceQty: rollup.contractorBalanceQty,
    dockPoolQty: rollup.dockPoolQty,
    issuedToFloorQty: rollup.issuedToFloorQty,
    inFloorWipQty: rollup.inFloorWipQty,
    packedStage5Qty: rollup.packedStage5Qty,
    inAlterationQty: rollup.inAlterationQty,
    scrappedQty: rollup.scrappedQty,
    reqReconciliations: rollup.reqBatches.map(r => r.reconciliation)
  });
}

/**
 * 3.6 — Atomic stage transition helper.
 * Updates source and destination stage counts in a single operation and asserts pair conservation.
 */
export function executeAtomicWipTransition(
  wip: OrderWipState,
  transition:
    | { type: 'ISSUE_TO_STAGE_1'; issuedPairs: number }
    | { type: 'STAGE_1_TO_STAGE_2'; passedPairs: number; defectPairs: number }
    | { type: 'STAGE_2_TO_STAGE_3'; passedPairs: number; defectPairs: number }
    | { type: 'STAGE_3_TO_STAGE_4'; passedPairs: number; defectPairs: number }
    | { type: 'STAGE_4_COMPLETE'; passedPairs: number }
    | { type: 'APPROVE_FINAL_QC'; approved: boolean }
    | { type: 'STAGE_5_SEAL_CARTONS'; packedPairs: number; cartonsCount: number }
): {
  nextWip: OrderWipState;
  reconciliation: ReconciliationResult;
} {
  const next: OrderWipState = {
    ...wip,
    sizes: { ...wip.sizes },
    packedSizes: wip.packedSizes ? { ...wip.packedSizes } : createEmptySizes()
  };

  if (transition.type === 'ISSUE_TO_STAGE_1') {
    const qty = Math.max(0, transition.issuedPairs);
    next.issueStatus = 'Issued by Inward Register';
    next.plannedQty = Math.max(next.plannedQty, qty);
    next.stage1In = qty;
  } else if (transition.type === 'STAGE_1_TO_STAGE_2') {
    const passed = Math.max(0, transition.passedPairs);
    const defects = Math.max(0, transition.defectPairs);
    next.stage1Passed = passed;
    next.stage1Defects = defects;
    next.stage2In = passed;
    next.inAlteration = Math.max(0, Number(next.inAlteration || 0) + defects);
  } else if (transition.type === 'STAGE_2_TO_STAGE_3') {
    const passed = Math.max(0, transition.passedPairs);
    const defects = Math.max(0, transition.defectPairs);
    next.stage2Passed = passed;
    next.stage2Defects = defects;
    next.stage3In = passed;
    next.inAlteration = Math.max(0, Number(next.inAlteration || 0) + defects);
  } else if (transition.type === 'STAGE_3_TO_STAGE_4') {
    const passed = Math.max(0, transition.passedPairs);
    const defects = Math.max(0, transition.defectPairs);
    next.stage3Passed = passed;
    next.stage3Defects = defects;
    next.stage4In = passed;
    next.stage4Pending = passed;
    next.mreqStatus = 'Printed';
    next.inAlteration = Math.max(0, Number(next.inAlteration || 0) + defects);
  } else if (transition.type === 'STAGE_4_COMPLETE') {
    const passed = Math.max(0, transition.passedPairs);
    next.stage4Passed = passed;
    next.stage4Pending = 0;
    next.mreqStatus = 'Issued';
  } else if (transition.type === 'APPROVE_FINAL_QC') {
    next.finalQcApproved = transition.approved;
  } else if (transition.type === 'STAGE_5_SEAL_CARTONS') {
    const gate = canExecuteStage5CartonPacking(next);
    if (!gate.allowed) {
      throw new Error(gate.reason);
    }
    const packed = Math.max(0, transition.packedPairs);
    const cartons = Math.max(1, transition.cartonsCount);
    next.outputPairs = packed;
    next.outputCartons = cartons;
    next.stage5Cartons = `${cartons} Master Boxes`;
    next.stage5Pending = '0 Cartons';
    next.packedSizes = scaleSizeBreakdown(next.sizes, packed);
  }

  const isIssued = next.issueStatus === 'Issued by Inward Register' || Number(next.stage1In || 0) > 0;
  const issuedPairs = isIssued ? Math.max(Number(next.stage1In || 0), Number(next.plannedQty || 0)) : 0;
  const scrappedPairs = Number(next.scrappedPairs || 0);
  const inAlterationPairs = Math.max(0, Number(next.inAlteration || 0) - scrappedPairs);
  const packedStage5Pairs = Number(next.outputPairs || 0);

  const stageCalc = computeActualStageWipPairs({
    isIssued,
    issuedPairs,
    stage1In: next.stage1In,
    stage1Passed: next.stage1Passed,
    stage2In: next.stage2In,
    stage2Passed: next.stage2Passed,
    stage3In: next.stage3In,
    stage3Passed: next.stage3Passed,
    stage4In: next.stage4In,
    stage4Passed: next.stage4Passed,
    packedStage5Pairs,
    inAlterationPairs,
    scrappedPairs,
    unaccountedVariancePairs: next.unaccountedVariancePairs
  });

  const reconciliation = evaluateReqReconciliation({
    reqNumber: next.reqNumber,
    issuedPairs,
    inFloorWipPairs: stageCalc.actualFloorWipPairs,
    packedStage5Pairs,
    inAlterationPairs,
    scrappedPairs
  });

  return { nextWip: next, reconciliation };
}

/**
 * 4.1 — Documented Order & REQ Lifecycle Transition Tables and validation helpers.
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderLifecycleStatus, OrderLifecycleStatus[]> = {
  'AWAITING DOCK #1 RECEIVING': ['RECEIVING AT DOCK #1', 'IN PACKING HALL WIP'],
  'RECEIVING AT DOCK #1': ['IN PACKING HALL WIP', 'AWAITING FINAL QC (STAGE 4)', 'COMPLETED & DISPATCHED'],
  'IN PACKING HALL WIP': ['AWAITING FINAL QC (STAGE 4)', 'COMPLETED & DISPATCHED'],
  'AWAITING FINAL QC (STAGE 4)': ['IN PACKING HALL WIP', 'COMPLETED & DISPATCHED'],
  'COMPLETED & DISPATCHED': []
};

export const REQ_STATUS_TRANSITIONS: Record<ReqLifecycleStatus, ReqLifecycleStatus[]> = {
  'PENDING ISSUE': ['IN FLOOR WIP', 'VOIDED'],
  'IN FLOOR WIP': ['STAGE 4 DONE (HOLD FOR QC)', 'QC PASSED — READY FOR STAGE 5', 'CLOSED ✓', 'VOIDED'],
  'STAGE 4 DONE (HOLD FOR QC)': ['QC PASSED — READY FOR STAGE 5', 'IN FLOOR WIP'],
  'QC PASSED — READY FOR STAGE 5': ['CLOSED ✓', 'IN FLOOR WIP'],
  'CLOSED ✓': [],
  'VOIDED': []
};

export function canTransitionOrderStatus(from: OrderLifecycleStatus, to: OrderLifecycleStatus): boolean {
  if (from === to) return true;
  return (ORDER_STATUS_TRANSITIONS[from] || []).includes(to);
}

export function canTransitionReqStatus(from: ReqLifecycleStatus, to: ReqLifecycleStatus): boolean {
  if (from === to) return true;
  return (REQ_STATUS_TRANSITIONS[from] || []).includes(to);
}

/**
 * 4.5 — 2-Cycle Alteration Loop handler (A-REQ).
 * - Cycle 1/2 pass -> returns repaired pairs to Stage 1 for re-inspection.
 * - Cycle 1/2 fail -> increments to Cycle 2/2.
 * - Cycle 2/2 fail (or explicit condemn) -> condemns pairs to Scrap and records contractor debit.
 */
export function processAlterationCycle(params: {
  wip: OrderWipState;
  pairsCount: number;
  currentCycle: 1 | 2;
  outcome: 'REPAIRED_RETURN_TO_STAGE_1' | 'FAILED_QC_CYCLE';
}): {
  nextWip: OrderWipState;
  nextCycle: 1 | 2;
  newStatus: 'Returned to Stage 1' | 'In Rework (Cycle 2/2)' | 'Scrapped';
  condemnedToScrapPairs: number;
  contractorDebitPairs: number;
} {
  const qty = Math.max(0, params.pairsCount);
  const next: OrderWipState = { ...params.wip };

  if (params.outcome === 'REPAIRED_RETURN_TO_STAGE_1') {
    next.inAlteration = Math.max(0, Number(next.inAlteration || 0) - qty);
    // Repaired pairs re-enter Stage 1 passed -> Stage 2 stream
    next.stage1Passed = Number(next.stage1Passed || 0) + qty;
    next.stage2In = Number(next.stage2In || 0) + qty;
    next.alterationCycleCount = params.currentCycle;
    return {
      nextWip: next,
      nextCycle: params.currentCycle,
      newStatus: 'Returned to Stage 1',
      condemnedToScrapPairs: 0,
      contractorDebitPairs: Number(next.contractorDebitPairs || 0)
    };
  }

  // Failed QC cycle
  if (params.currentCycle === 1) {
    next.alterationCycleCount = 2;
    return {
      nextWip: next,
      nextCycle: 2,
      newStatus: 'In Rework (Cycle 2/2)',
      condemnedToScrapPairs: 0,
      contractorDebitPairs: Number(next.contractorDebitPairs || 0)
    };
  }

  // Cycle 2/2 failed -> automatically condemned to Scrap + contractor debit
  next.scrappedPairs = Number(next.scrappedPairs || 0) + qty;
  next.contractorDebitPairs = Number(next.contractorDebitPairs || 0) + qty;
  next.alterationCycleCount = 2;
  return {
    nextWip: next,
    nextCycle: 2,
    newStatus: 'Scrapped',
    condemnedToScrapPairs: qty,
    contractorDebitPairs: next.contractorDebitPairs
  };
}

/**
 * R1, 3.8, 4.6, 4.7 — Configurable Policies for the 4 Open DECISION items.
 * All 4 DECISION items are explicitly represented here with safe industrial defaults
 * while awaiting user sign-off.
 */
export interface MesPolicyConfig {
  /** R1: Factory size set ('PLAN1_7_TO_11' for 7/S..11/XXL vs 'PLAN2_6_TO_12' for 6..12) */
  sizeScaleMode: 'PLAN1_7_TO_11' | 'PLAN2_6_TO_12';
  /** 3.8: Over-receipt & under-delivery tolerance percentage (default 5%, hard block over 5% unless Super User override) */
  overReceiptTolerancePct: number;
  underDeliveryTolerancePct: number;
  allowShortShipmentCloseWithApproval: boolean;
  /** 4.6: AQL 1.5 gate details — who records the result, per REQ or per lot, and the failure path */
  aqlInspectorRole: 'QC_INSPECTOR' | 'SUPER_USER';
  aqlInspectionGranularity: 'PER_REQ' | 'PER_MASTER_LOT';
  aqlFailurePath: 'RE_INSPECT' | 'THOROUGH_100_PCT_CHECK' | 'BACK_TO_ALTERATION';
  stage5RejectionPolicy: 'ROUTE_TO_AREQ_ALTERATION' | 'UNSEAL_TO_STAGE_4';
  /** 4.7: Full A-REQ 2-cycle/scrap workflow vs lighter flag-and-count approach */
  alterationWorkflowMode: 'FULL_AREQ_CYCLE_AND_SCRAP' | 'LIGHT_FLAG_AND_COUNT';
  scrapReplenishmentPolicy: 'INCREASE_CONTRACTOR_BALANCE' | 'SHORT_SHIP_AGAINST_PLANNED';
}

export const DEFAULT_MES_POLICY_CONFIG: MesPolicyConfig = {
  sizeScaleMode: 'PLAN1_7_TO_11',
  overReceiptTolerancePct: 5,
  underDeliveryTolerancePct: 2,
  allowShortShipmentCloseWithApproval: true,
  aqlInspectorRole: 'QC_INSPECTOR',
  aqlInspectionGranularity: 'PER_REQ',
  aqlFailurePath: 'BACK_TO_ALTERATION',
  stage5RejectionPolicy: 'ROUTE_TO_AREQ_ALTERATION',
  alterationWorkflowMode: 'FULL_AREQ_CYCLE_AND_SCRAP',
  scrapReplenishmentPolicy: 'SHORT_SHIP_AGAINST_PLANNED'
};

export function evaluateGrnOverReceiptPolicy(params: {
  plannedQty: number;
  alreadyReceivedQty: number;
  incomingGrnQty: number;
  policy?: MesPolicyConfig;
  superUserOverride?: boolean;
}): {
  allowed: boolean;
  overReceiptPairs: number;
  overReceiptPct: number;
  requiresSuperUserApproval: boolean;
  message: string;
} {
  const policy = params.policy || DEFAULT_MES_POLICY_CONFIG;
  const totalAfter = params.alreadyReceivedQty + params.incomingGrnQty;
  const overReceiptPairs = Math.max(0, totalAfter - params.plannedQty);
  const overReceiptPct =
    params.plannedQty > 0 ? Math.round((overReceiptPairs / params.plannedQty) * 1000) / 10 : 0;

  if (overReceiptPairs === 0) {
    return {
      allowed: true,
      overReceiptPairs: 0,
      overReceiptPct: 0,
      requiresSuperUserApproval: false,
      message: 'Within planned order quantity.'
    };
  }

  if (overReceiptPct <= policy.overReceiptTolerancePct || params.superUserOverride) {
    return {
      allowed: true,
      overReceiptPairs,
      overReceiptPct,
      requiresSuperUserApproval: overReceiptPct > 0,
      message: `Over-receipt of +${overReceiptPairs} pairs (+${overReceiptPct}%) accepted within tolerance/override.`
    };
  }

  return {
    allowed: false,
    overReceiptPairs,
    overReceiptPct,
    requiresSuperUserApproval: true,
    message: `Over-receipt of +${overReceiptPairs} pairs (+${overReceiptPct}%) exceeds ${policy.overReceiptTolerancePct}% tolerance. Requires Super User override.`
  };
}

/**
 * 5.4 — Chip overflow helper: sorts chips with variances/holds first, then most recent,
 * showing up to maxVisible (default 3) + "+N more" count.
 */
export function prioritizeAndSliceChips<T extends { priorityScore?: number; seq?: number }>(
  items: T[],
  maxVisible = 3
): {
  visible: T[];
  hidden: T[];
  overflowCount: number;
} {
  const sorted = [...items].sort((a, b) => {
    const pa = Number(a.priorityScore || 0);
    const pb = Number(b.priorityScore || 0);
    if (pb !== pa) return pb - pa;
    return Number(b.seq || 0) - Number(a.seq || 0);
  });
  const visible = sorted.slice(0, maxVisible);
  const hidden = sorted.slice(maxVisible);
  return {
    visible,
    hidden,
    overflowCount: hidden.length
  };
}

/**
 * 10.1 & 11.5 — Serialized Transactional Order Ledger preventing concurrent double-draws from Dock Pool.
 */
export class TransactionalOrderLedger {
  private lockPromise: Promise<void> = Promise.resolve();
  private dockPoolPairs: number;
  private issuedPairs: number;

  constructor(initialReceivedPairs: number, initialIssuedPairs = 0) {
    this.dockPoolPairs = Math.max(0, initialReceivedPairs - initialIssuedPairs);
    this.issuedPairs = Math.max(0, initialIssuedPairs);
  }

  private async withLock<T>(fn: () => Promise<T> | T): Promise<T> {
    const prev = this.lockPromise;
    let release!: () => void;
    this.lockPromise = new Promise<void>(resolve => {
      release = resolve;
    });
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  public async tryIssueFromDock(reqNumber: string, askingPairs: number): Promise<{
    accepted: boolean;
    reqNumber: string;
    issuedPairs: number;
    remainingDockPoolPairs: number;
    reason: string;
  }> {
    return this.withLock(async () => {
      await Promise.resolve();
      if (askingPairs <= 0) {
        return {
          accepted: false,
          reqNumber,
          issuedPairs: 0,
          remainingDockPoolPairs: this.dockPoolPairs,
          reason: 'Asking quantity must be greater than zero.'
        };
      }
      if (askingPairs > this.dockPoolPairs) {
        return {
          accepted: false,
          reqNumber,
          issuedPairs: 0,
          remainingDockPoolPairs: this.dockPoolPairs,
          reason: `Insufficient Dock Pool balance (${this.dockPoolPairs} Prs available, ${askingPairs} Prs requested).`
        };
      }
      this.dockPoolPairs -= askingPairs;
      this.issuedPairs += askingPairs;
      return {
        accepted: true,
        reqNumber,
        issuedPairs: askingPairs,
        remainingDockPoolPairs: this.dockPoolPairs,
        reason: `Issued ${askingPairs} pairs to ${reqNumber}.`
      };
    });
  }

  public getSnapshot(): { dockPoolPairs: number; issuedPairs: number } {
    return {
      dockPoolPairs: this.dockPoolPairs,
      issuedPairs: this.issuedPairs
    };
  }
}

/**
 * 10.2 — Voids and Adjustments rules:
 * - Void a GRN only if none of its pairs have been issued to a REQ.
 * - Void a REQ only before Stage 1 begins (stage1Passed === 0 && outputPairs === 0).
 */
export function canVoidGrnBatch(grn: SuperUserGrnBatchItem): { allowed: boolean; reason: string } {
  if (grn.isVoided) {
    return { allowed: false, reason: `${grn.grnCode} is already voided.` };
  }
  if (grn.allocatedPairs > 0) {
    return {
      allowed: false,
      reason: `Cannot void ${grn.grnCode}: ${grn.allocatedPairs} pairs have already been allocated/issued to Packing Hall REQs (${grn.allocatedToReqs.map(a => a.reqNumber).join(', ')}).`
    };
  }
  return { allowed: true, reason: `${grn.grnCode} has 0 issued pairs and can be safely voided.` };
}

export function canVoidRequisitionLot(wip: Partial<OrderWipState>): { allowed: boolean; reason: string } {
  if (wip.isVoided) {
    return { allowed: false, reason: `${wip.reqNumber} is already voided.` };
  }
  if (
    Number(wip.stage1Passed || 0) > 0 ||
    Number(wip.stage2In || 0) > 0 ||
    Number(wip.outputPairs || 0) > 0
  ) {
    return {
      allowed: false,
      reason: `Cannot void ${wip.reqNumber}: Stage 1 inspection has already begun (${wip.stage1Passed || 0} pairs passed).`
    };
  }
  return {
    allowed: true,
    reason: `${wip.reqNumber} has not started Stage 1 processing and can be voided.`
  };
}

/**
 * 10.3 & 10.4 — Immutable Audit Trail & RBAC Role Permissions Matrix.
 */
export type MesUserRole =
  | 'SUPER_USER'
  | 'INWARD_CLERK'
  | 'PACKING_SUPERVISOR'
  | 'QC_INSPECTOR'
  | 'ALTERATION_LEAD';

export type MesActionType =
  | 'ORDER_CREATE'
  | 'ORDER_ADJUST'
  | 'ORDER_SHORT_CLOSE'
  | 'GRN_RECEIVE'
  | 'GRN_VOID'
  | 'REQ_CREATE'
  | 'REQ_ISSUE'
  | 'REQ_VOID'
  | 'WIP_STAGE_ADVANCE'
  | 'FINAL_QC_APPROVE'
  | 'FINAL_QC_REJECT'
  | 'STAGE_5_CARTON_SEAL'
  | 'ALTERATION_CYCLE_UPDATE'
  | 'SCRAP_CONDEMN';

export const ROLE_PERMISSIONS: Record<MesUserRole, MesActionType[]> = {
  SUPER_USER: [
    'ORDER_CREATE',
    'ORDER_ADJUST',
    'ORDER_SHORT_CLOSE',
    'GRN_RECEIVE',
    'GRN_VOID',
    'REQ_CREATE',
    'REQ_ISSUE',
    'REQ_VOID',
    'WIP_STAGE_ADVANCE',
    'FINAL_QC_APPROVE',
    'FINAL_QC_REJECT',
    'STAGE_5_CARTON_SEAL',
    'ALTERATION_CYCLE_UPDATE',
    'SCRAP_CONDEMN'
  ],
  INWARD_CLERK: ['GRN_RECEIVE', 'REQ_ISSUE'],
  PACKING_SUPERVISOR: ['REQ_CREATE', 'WIP_STAGE_ADVANCE', 'STAGE_5_CARTON_SEAL'],
  QC_INSPECTOR: ['FINAL_QC_APPROVE', 'FINAL_QC_REJECT', 'WIP_STAGE_ADVANCE'],
  ALTERATION_LEAD: ['ALTERATION_CYCLE_UPDATE', 'SCRAP_CONDEMN']
};

export function canRolePerformAction(role: MesUserRole, action: MesActionType): boolean {
  return (ROLE_PERMISSIONS[role] || []).includes(action);
}

export interface AuditTrailEntry {
  auditId: string;
  timestamp: string;
  actor: string;
  role: MesUserRole;
  action: MesActionType;
  entityId: string;
  orderId?: string;
  beforeSummary: string;
  afterSummary: string;
  reason?: string;
}

export function createAuditTrailEntry(params: {
  seq: number;
  actor: string;
  role: MesUserRole;
  action: MesActionType;
  entityId: string;
  orderId?: string;
  beforeSummary: string;
  afterSummary: string;
  reason?: string;
  timestamp?: string;
}): AuditTrailEntry {
  return {
    auditId: `AUD-${String(params.seq).padStart(4, '0')}`,
    timestamp: params.timestamp || new Date().toISOString().replace('T', ' ').slice(0, 19),
    actor: params.actor,
    role: params.role,
    action: params.action,
    entityId: params.entityId,
    orderId: params.orderId,
    beforeSummary: params.beforeSummary,
    afterSummary: params.afterSummary,
    reason: params.reason
  };
}

/**
 * 5.6 & 11.6 — Flagged & Removable 600-Pair Demo Scenario Builder ("1-Order -> 3-GRNs -> 3-REQs").
 * Supports three phases:
 *  - 'IN_PROGRESS': REQ-0901 at Stage 4 Complete (Awaiting Final QC), REQ-0902 in Alteration (Cycle 1/2), REQ-0903 at Stage 2, both gates RECONCILED ✓
 *  - 'COMPLETED': All 3 REQs (REQ-0901, REQ-0902, REQ-0903) pass Final QC (AQL 1.5) and seal Stage 5 Master Cartons (300 + 195 + 100 = 595 packed in 6 + 4 + 2 = 12 cartons @ 50 prs/ctn + 5 scrapped = 600), COMPLETED & DISPATCHED & RECONCILED ✓
 *  - 'DELIBERATE_VARIANCE': Injects a deliberate 12-pair Stage 1 floor bin corruption on REQ-0902 to verify VARIANCE Δ (-12 Prs • FLOOR_GATE)
 */
export function createDemo600PairScenario(
  phase: 'IN_PROGRESS' | 'COMPLETED' | 'DELIBERATE_VARIANCE' = 'COMPLETED'
): {
  order: PendingOrder;
  grns: Array<{
    sr: number;
    grnCode: string;
    date: string;
    pendingOrderId: string;
    maker: string;
    article: string;
    rcvdPairs: number;
    sizes: SizeBreakdown;
    status: string;
    isDemoScenario: boolean;
  }>;
  reqs: OrderWipState[];
  defects: Array<{
    id: string;
    article: string;
    po: string;
    stage: string;
    defect: string;
    qty: string;
    Action: string;
    cycles: number;
    status: string;
    isDemoScenario: boolean;
  }>;
} {
  const orderId = 'ORD-2026-600';
  const article = 'ARC-PRO-600 Kevlar Driver';
  const maker = 'Ravi Stitch Crafts (Unit-2)';
  const buyer = 'Nordic Safety Gear AB';
  const po = 'PO-NSG-600';

  const order: PendingOrder = {
    orderId,
    buyer,
    maker,
    po,
    article,
    color: 'Hi-Vis Yellow / Slate',
    sizes: { '7': 60, '8': 150, '9': 180, '10': 150, '11': 60 },
    totalQty: 600,
    notes: '11.6 Verification: 1-Order -> 3-GRNs -> 3-REQs (600 Pairs)',
    isDemoScenario: true
  };

  const grns = [
    {
      sr: 901,
      grnCode: 'GRN-0901',
      date: '04-11-2026 08:30',
      pendingOrderId: orderId,
      maker,
      article,
      rcvdPairs: 250,
      sizes: { '7': 25, '8': 60, '9': 75, '10': 65, '11': 25 },
      status: 'Received',
      isDemoScenario: true
    },
    {
      sr: 902,
      grnCode: 'GRN-0902',
      date: '04-11-2026 10:15',
      pendingOrderId: orderId,
      maker,
      article,
      rcvdPairs: 200,
      sizes: { '7': 20, '8': 50, '9': 60, '10': 50, '11': 20 },
      status: 'Received',
      isDemoScenario: true
    },
    {
      sr: 903,
      grnCode: 'GRN-0903',
      date: '04-11-2026 11:00',
      pendingOrderId: orderId,
      maker,
      article,
      rcvdPairs: 150,
      sizes: { '7': 15, '8': 40, '9': 45, '10': 35, '11': 15 },
      status: 'Received',
      isDemoScenario: true
    }
  ];

  const req1Sizes: SizeBreakdown = { '7': 30, '8': 75, '9': 90, '10': 75, '11': 30 };
  const req2Sizes: SizeBreakdown = { '7': 20, '8': 50, '9': 60, '10': 50, '11': 20 };
  const req3Sizes: SizeBreakdown = { '7': 10, '8': 25, '9': 30, '10': 25, '11': 10 };

  const req1: OrderWipState = {
    reqNumber: 'REQ-0901',
    parentOrderId: orderId,
    allocatedGrnRefs: [
      { grnCode: 'GRN-0901', pairs: 250 },
      { grnCode: 'GRN-0902', pairs: 50 }
    ],
    article,
    po,
    maker,
    buyer,
    plannedQty: 300,
    issueStatus: 'Issued by Inward Register',
    sizes: req1Sizes,
    packedSizes: req1Sizes,
    stage1In: 300,
    stage1Passed: 300,
    stage1Defects: 0,
    stage2In: 300,
    stage2Passed: 300,
    stage2Defects: 0,
    stage3In: 300,
    stage3Passed: 300,
    stage3Defects: 0,
    mreqNo: 'M-REQ-0901',
    altReqNo: 'A-REQ-0901',
    mreqQty: '300 Sets',
    mreqStatus: 'Issued',
    stage4In: 300,
    stage4Passed: 300,
    stage4Pending: 0,
    stage5Cartons: '6 Cartons',
    stage5Pending: '0 Cartons',
    lineEfficiency: '98.5%',
    outputPairs: 300,
    outputCartons: 6,
    inAlteration: 0,
    scrappedPairs: 0,
    finalQcApproved: true,
    alterationCycleCount: 0,
    isDemoScenario: true
  };

  const req2: OrderWipState =
    phase === 'IN_PROGRESS'
      ? {
          reqNumber: 'REQ-0902',
          parentOrderId: orderId,
          allocatedGrnRefs: [
            { grnCode: 'GRN-0902', pairs: 150 },
            { grnCode: 'GRN-0903', pairs: 50 }
          ],
          article,
          po,
          maker,
          buyer,
          plannedQty: 200,
          issueStatus: 'Issued by Inward Register',
          sizes: req2Sizes,
          packedSizes: scaleSizeBreakdown(req2Sizes, 0),
          stage1In: 200,
          stage1Passed: 190,
          stage1Defects: 10,
          stage2In: 190,
          stage2Passed: 190,
          stage2Defects: 0,
          stage3In: 190,
          stage3Passed: 190,
          stage3Defects: 0,
          mreqNo: 'M-REQ-0902',
          altReqNo: 'A-REQ-0902',
          mreqQty: '190 Sets',
          mreqStatus: 'Issued',
          stage4In: 190,
          stage4Passed: 190,
          stage4Pending: 0,
          stage5Cartons: '0 Cartons',
          stage5Pending: '4 Cartons',
          lineEfficiency: '95.0%',
          outputPairs: 0,
          outputCartons: 0,
          inAlteration: 10,
          scrappedPairs: 0,
          contractorDebitPairs: 0,
          finalQcApproved: false,
          alterationCycleCount: 1,
          isDemoScenario: true
        }
      : {
          reqNumber: 'REQ-0902',
          parentOrderId: orderId,
          allocatedGrnRefs: [
            { grnCode: 'GRN-0902', pairs: 150 },
            { grnCode: 'GRN-0903', pairs: 50 }
          ],
          article,
          po,
          maker,
          buyer,
          plannedQty: 200,
          issueStatus: 'Issued by Inward Register',
          sizes: req2Sizes,
          packedSizes: scaleSizeBreakdown(req2Sizes, phase === 'DELIBERATE_VARIANCE' ? 0 : 195),
          stage1In: 200,
          stage1Passed: phase === 'DELIBERATE_VARIANCE' ? 183 : 195,
          stage1Defects: 5,
          stage2In: phase === 'DELIBERATE_VARIANCE' ? 183 : 195,
          stage2Passed: phase === 'DELIBERATE_VARIANCE' ? 183 : 195,
          stage2Defects: 0,
          stage3In: phase === 'DELIBERATE_VARIANCE' ? 183 : 195,
          stage3Passed: phase === 'DELIBERATE_VARIANCE' ? 183 : 195,
          stage3Defects: 0,
          mreqNo: 'M-REQ-0902',
          altReqNo: 'A-REQ-0902',
          mreqQty: '195 Sets',
          mreqStatus: 'Issued',
          stage4In: phase === 'DELIBERATE_VARIANCE' ? 183 : 195,
          stage4Passed: phase === 'DELIBERATE_VARIANCE' ? 183 : 195,
          stage4Pending: 0,
          stage5Cartons: phase === 'DELIBERATE_VARIANCE' ? '0 Cartons' : '4 Cartons',
          stage5Pending: phase === 'DELIBERATE_VARIANCE' ? '4 Cartons' : '0 Cartons',
          lineEfficiency: '97.5%',
          outputPairs: phase === 'DELIBERATE_VARIANCE' ? 0 : 195,
          outputCartons: phase === 'DELIBERATE_VARIANCE' ? 0 : 4,
          inAlteration: 0,
          scrappedPairs: 5,
          contractorDebitPairs: 5,
          unaccountedVariancePairs: phase === 'DELIBERATE_VARIANCE' ? 12 : 0,
          finalQcApproved: phase !== 'DELIBERATE_VARIANCE',
          alterationCycleCount: 2,
          isDemoScenario: true
        };

  const req3: OrderWipState = {
    reqNumber: 'REQ-0903',
    parentOrderId: orderId,
    allocatedGrnRefs: [{ grnCode: 'GRN-0903', pairs: 100 }],
    article,
    po,
    maker,
    buyer,
    plannedQty: 100,
    issueStatus: 'Issued by Inward Register',
    sizes: req3Sizes,
    packedSizes: req3Sizes,
    stage1In: 100,
    stage1Passed: 100,
    stage1Defects: 0,
    stage2In: 100,
    stage2Passed: 100,
    stage2Defects: 0,
    stage3In: 100,
    stage3Passed: 100,
    stage3Defects: 0,
    mreqNo: 'M-REQ-0903',
    altReqNo: 'A-REQ-0903',
    mreqQty: '100 Sets',
    mreqStatus: 'Issued',
    stage4In: 100,
    stage4Passed: 100,
    stage4Pending: 0,
    stage5Cartons: '2 Cartons',
    stage5Pending: '0 Cartons',
    lineEfficiency: '99.0%',
    outputPairs: 100,
    outputCartons: 2,
    inAlteration: 0,
    scrappedPairs: 0,
    finalQcApproved: true,
    alterationCycleCount: 0,
    isDemoScenario: true
  };

  const defects =
    phase === 'IN_PROGRESS'
      ? [
          {
            id: 'A-REQ-0902',
            article,
            po,
            stage: 'Stage 1 Cuff QC',
            defect: 'Open Cuff Seam (10 Prs In Rework Cycle 1/2)',
            qty: '10 Prs',
            Action: 'Re-Stitching',
            cycles: 1,
            status: 'In Rework',
            isDemoScenario: true
          }
        ]
      : [
          {
            id: 'A-REQ-0902',
            article,
            po,
            stage: 'Stage 1 Cuff QC',
            defect: 'Condemned after Cycle 2/2 (5 Prs)',
            qty: '5 Prs',
            Action: 'Condemned to Scrap',
            cycles: 2,
            status: 'Scrapped',
            isDemoScenario: true
          }
        ];

  return {
    order,
    grns,
    reqs: [req1, req2, req3],
    defects
  };
}

/**
 * 11.6 — Chronological step-by-step replay of the 600-pair manual scenario.
 * Verifies:
 *  1) Attempting to issue REQ-0902 (200 prs) before GRN-0903 (150 prs) is received is BLOCKED (Issued <= Received).
 *  2) Receiving GRN-0903 (150 prs) brings Dock Available to 300 prs, allowing REQ-0902 (200) and REQ-0903 (100).
 *  3) Pushing REQ-0901, REQ-0902, REQ-0903 to Stage 4 locks Stage 5 until Final QC (AQL 1.5) approves each lot.
 *  4) Alteration (5 repaired) and Scrap (5 condemned on Cycle 2/2) reconcile at both Dock and Floor gates (RECONCILED ✓).
 *  5) Forcing a deliberate variance on either Floor Gate (-12 prs) or Dock Gate (-15 prs) flips status to VARIANCE Δ with exact delta.
 */
export async function replayDemo600PairScenarioStepByStep(): Promise<{
  preGrn3OverIssueAttempt: { accepted: boolean; remainingDockPoolPairs: number; reason: string };
  postGrn3Req2Issue: { accepted: boolean; remainingDockPoolPairs: number };
  postGrn3Req3Issue: { accepted: boolean; remainingDockPoolPairs: number };
  stage4HoldBeforeQcGate: { allowed: boolean; awaitingFinalQc: boolean; reason: string };
  allThreeReqsStage5GateChecked: Array<{ reqNumber: string; lockedBeforeQc: boolean; unlockedAfterQc: boolean }>;
  allThreeReqsFinalQcApproved: boolean;
  reconciledRollup: OrderTraceabilityItem;
  forcedFloorVarianceRollup: OrderTraceabilityItem;
  forcedDockVarianceRollup: OrderTraceabilityItem;
}> {
  // Step 1 & 2: Order ORD-2026-600 (600 prs); Receive GRN-0901 (250) + GRN-0902 (200) = 450 Received
  const ledger = new TransactionalOrderLedger(450, 0);

  // Step 3: Issue REQ-0901 (300 prs) -> 150 prs left in Dock Pool
  const req1Issue = await ledger.tryIssueFromDock('REQ-0901', 300);
  if (!req1Issue.accepted) {
    throw new Error('REQ-0901 should issue 300 pairs from 450 received');
  }

  // Step 4: Try to issue REQ-0902 (200 prs) BEFORE GRN-0903 (150 prs) is received -> MUST BE BLOCKED
  const preGrn3OverIssueAttempt = await ledger.tryIssueFromDock('REQ-0902', 200);

  // Step 5: Receive GRN-0903 (150 prs) -> Dock Pool increases from 150 to 300 (Total Received = 600, Issued = 300)
  const ledgerAfterGrn3 = new TransactionalOrderLedger(600, 300);
  const postGrn3Req2Issue = await ledgerAfterGrn3.tryIssueFromDock('REQ-0902', 200);
  const postGrn3Req3Issue = await ledgerAfterGrn3.tryIssueFromDock('REQ-0903', 100);

  // Step 6: Verify Stage 4 -> Final QC -> Stage 5 gate on ALL 3 REQs (REQ-0901, REQ-0902, REQ-0903) before QC approval
  const completedScenario = createDemo600PairScenario('COMPLETED');
  const allThreeReqsStage5GateChecked = completedScenario.reqs.map(r => {
    const beforeQcLot: OrderWipState = { ...r, outputPairs: 0, outputCartons: 0, finalQcApproved: false };
    const afterQcLot: OrderWipState = { ...r, outputPairs: 0, outputCartons: 0, finalQcApproved: true };
    return {
      reqNumber: r.reqNumber,
      lockedBeforeQc: canExecuteStage5CartonPacking(beforeQcLot).allowed === false && isReqAwaitingFinalQc(beforeQcLot),
      unlockedAfterQc: canExecuteStage5CartonPacking(afterQcLot).allowed === true
    };
  });

  const req1AtStage4Hold: OrderWipState = {
    ...completedScenario.reqs[0],
    outputPairs: 0,
    outputCartons: 0,
    finalQcApproved: false
  };
  const stage4HoldBeforeQcGate = {
    ...canExecuteStage5CartonPacking(req1AtStage4Hold),
    awaitingFinalQc: isReqAwaitingFinalQc(req1AtStage4Hold)
  };

  // Step 7: Approve Final QC on all 3 REQs (REQ-0901, REQ-0902, REQ-0903) and seal Stage 5 cartons
  const allThreeReqsFinalQcApproved = allThreeReqsStage5GateChecked.every(
    c => c.lockedBeforeQc && c.unlockedAfterQc
  );
  const reconciledSummary = buildSuperUserOrderRollups({
    pendingOrders: [completedScenario.order],
    grnList: completedScenario.grns,
    requisitions: completedScenario.reqs,
    defectList: completedScenario.defects
  });
  const reconciledRollup = reconciledSummary.orderRollups[0];

  // Step 8A: Force deliberate Floor Gate variance (-12 pairs on REQ-0902)
  const varianceScenario = createDemo600PairScenario('DELIBERATE_VARIANCE');
  const floorVarianceSummary = buildSuperUserOrderRollups({
    pendingOrders: [varianceScenario.order],
    grnList: varianceScenario.grns,
    requisitions: varianceScenario.reqs,
    defectList: varianceScenario.defects
  });
  const forcedFloorVarianceRollup = floorVarianceSummary.orderRollups[0];

  // Step 8B: Force deliberate Dock Gate variance (-15 pairs physical dock count discrepancy)
  const dockVarianceSummary = buildSuperUserOrderRollups({
    pendingOrders: [{ ...completedScenario.order, physicalDockCountPairs: 15 }],
    grnList: completedScenario.grns,
    requisitions: completedScenario.reqs,
    defectList: completedScenario.defects
  });
  const forcedDockVarianceRollup = dockVarianceSummary.orderRollups[0];

  return {
    preGrn3OverIssueAttempt,
    postGrn3Req2Issue,
    postGrn3Req3Issue,
    stage4HoldBeforeQcGate,
    allThreeReqsStage5GateChecked,
    allThreeReqsFinalQcApproved,
    reconciledRollup,
    forcedFloorVarianceRollup,
    forcedDockVarianceRollup
  };
}

/**
 * 12.2 — Phased Rollout Record (Phase A, Phase B, Phase C).
 */
export interface PhasedRolloutMilestone {
  phase: 'Phase A' | 'Phase B' | 'Phase C';
  title: string;
  scope: string[];
  status: 'COMPLETED';
  verificationSuites: string[];
}

export const PHASED_ROLLOUT_RECORD: PhasedRolloutMilestone[] = [
  {
    phase: 'Phase A',
    title: 'Relational Order → GRN → REQ Hierarchy, FIFO Allocations, Dashboard & Reconciliation Engine',
    scope: [
      'Order (1) → GRN (N) → REQ (M) relational hierarchy & GrnToReqAllocation join table (2.1–2.10)',
      'Non-tautological Dock Gate & Floor Gate conservation equations (3.1–3.7)',
      'Super User View 1 Executive Dashboard with 4 Pulse Cards, Exceptions Strip & Chip Overflow (5.1–5.6)'
    ],
    status: 'COMPLETED',
    verificationSuites: ['src/utils/requisitionLogic.test.ts (Tests 1–4, 7–9)', 'test/db-reliability.test.js']
  },
  {
    phase: 'Phase B',
    title: 'Live Tracking (Tier 1 & Tier 2), Lifecycle State Machine & Stage 4 → AQL 1.5 → Stage 5 Gate',
    scope: [
      'Order & REQ status transition state machines and atomic stage transitions (4.1, 3.6)',
      'Stage 4 Complete (Awaiting Final QC) hard lock before Stage 5 Master Carton sealing (4.2, 4.3, 4.4)',
      'Super User View 2 Live Tracking with <150ms expansion, filters, pagination & per-REQ reconciliation (6.1–6.7)'
    ],
    status: 'COMPLETED',
    verificationSuites: ['src/utils/requisitionLogic.test.ts (Tests 5, 10, 12, 16)', 'test/mes-server-integrity.test.js']
  },
  {
    phase: 'Phase C',
    title: '2-Cycle Alteration Loop (A-REQ), Scrap Condemnation, View 4 Official Reports & Monochrome Print',
    scope: [
      '2-cycle rework loop returning to Stage 1 Checking and auto-condemning to Scrap on Cycle 2/2 failure (4.5)',
      'View 4 Reconciliation, Traceability, Contractor Scrap & AQL Dispatch Reports with CSV & A4 Print (8.1–8.6)',
      'Scoped .superuser-command-center tokens, 100% monochrome shop-floor/slips, SQLite RBAC & immutable audit trail (9.1–10.5)'
    ],
    status: 'COMPLETED',
    verificationSuites: ['src/utils/requisitionLogic.test.ts (Tests 11, 13–17)', 'test/enterprise-gaps.test.js', 'test/mes-server-integrity.test.js']
  }
];

export function applyPendingOrderSelection(
  orders: PendingOrder[],
  selectedOrderId: string
): {
  pendingOrderId: string;
  buyer?: string;
  maker: string;
  po?: string;
  article: string;
  color?: string;
  sizes?: SizeBreakdown;
  totalQty?: number;
} | null {
  const found = orders.find(o => o.orderId === selectedOrderId);
  if (!found) return null;
  const result: {
    pendingOrderId: string;
    buyer?: string;
    maker: string;
    po?: string;
    article: string;
    color?: string;
    sizes?: SizeBreakdown;
    totalQty?: number;
  } = {
    pendingOrderId: found.orderId,
    maker: found.maker,
    article: found.article
  };
  if (found.buyer !== undefined) result.buyer = found.buyer;
  if (found.po !== undefined) result.po = found.po;
  if (found.color !== undefined) result.color = found.color;
  if (found.sizes !== undefined) result.sizes = found.sizes;
  if (found.totalQty !== undefined) result.totalQty = found.totalQty;
  return result;
}

export function evaluateRequisitionIssuance(params: {
  askingPairs: number;
  askingSizes?: Partial<SizeBreakdown>;
  totalReceivedPairs: number;
  alreadyIssuedPairs: number;
}): {
  availablePairs: number;
  askingPairs: number;
  shortfallPairs: number;
  canIssue: boolean;
} {
  const availablePairs = Math.max(
    0,
    Number(params.totalReceivedPairs || 0) - Number(params.alreadyIssuedPairs || 0)
  );
  const askingPairs = Math.max(0, Number(params.askingPairs || 0));
  const shortfallPairs = Math.max(0, askingPairs - availablePairs);
  const canIssue = askingPairs > 0 && availablePairs >= askingPairs;
  return {
    availablePairs,
    askingPairs,
    shortfallPairs,
    canIssue
  };
}

export interface PackingRequisitionSlipParams {
  reqNo: string;
  date: string;
  po?: string;
  article: string;
  sizes: SizeBreakdown;
  totalPairs?: number;
  issueStatus?: 'Pending Inward Issue' | 'Issued by Inward Register';
}

export function buildPackingRequisitionSlipHtml(params: PackingRequisitionSlipParams): string {
  const baseReq = normalizeBaseReqNumber(params.reqNo);
  const mReq = getMaterialReqNumber(baseReq);
  const aReq = getAlterationReqNumber(baseReq);
  const sizeSum = calculateSizeTotal(params.sizes);
  const pairs = params.totalPairs !== undefined && params.totalPairs > 0 ? params.totalPairs : sizeSum;
  const article = params.article || '---';
  const dateStr = params.date || '31-10-2026';
  const issueStatus = params.issueStatus || 'Pending Inward Issue';

  return `
    <div class="printable-slip-box">
      <div class="printable-slip-header">
        <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-950);">MERIDIAN WORKS &bull; PACKING HALL REQUISITION SLIP</h2>
        <p style="margin: 2px 0 0; font-size: 11px; text-transform: uppercase; color: var(--ink-600);">
          Packing Floor &bull; Unified Production, Material (M) &amp; Alteration (A) Requisition
        </p>
      </div>
      <div class="printable-meta-grid">
        <div><span>Requisition #:</span> <strong>${baseReq}</strong></div>
        <div><span>Date:</span> <strong>${dateStr}</strong></div>
        <div><span>Material Req # (M):</span> <strong>${mReq}</strong></div>
        <div><span>Alteration Bay # (A):</span> <strong>${aReq}</strong></div>
        <div><span>Article:</span> <strong>${article}</strong></div>
        <div><span>Asking Quantity:</span> <strong>${pairs.toLocaleString()} Pairs</strong></div>
        <div><span>Dock Store Status:</span> <strong>${issueStatus}</strong></div>
        <div><span>Origin Station:</span> <strong>Packing Hall #1</strong></div>
      </div>

      <div style="font-weight: 700; color: var(--ink-950); margin: 8px 0 4px; font-size: 11.5px; text-transform: uppercase;">
        Article &amp; Size Breakdown Allocation (Pairs)
      </div>
      <table class="size-matrix-table" style="margin-bottom: 12px;">
        <thead>
          <tr>
            <th>Article</th>
            <th>7 / S</th>
            <th>8 / M</th>
            <th>9 / L</th>
            <th>10 / XL</th>
            <th>11 / XXL</th>
            <th style="background: var(--ink-200); color: var(--ink-950);">Total Pairs</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>${article}</strong></td>
            <td>${Number(params.sizes['7'] || 0).toLocaleString()} Prs</td>
            <td>${Number(params.sizes['8'] || 0).toLocaleString()} Prs</td>
            <td>${Number(params.sizes['9'] || 0).toLocaleString()} Prs</td>
            <td>${Number(params.sizes['10'] || 0).toLocaleString()} Prs</td>
            <td>${Number(params.sizes['11'] || 0).toLocaleString()} Prs</td>
            <td style="font-weight: 800; color: var(--ink-950);">${pairs.toLocaleString()} Pairs</td>
          </tr>
        </tbody>
      </table>

      <div style="font-weight: 700; color: var(--ink-950); margin: 8px 0 4px; font-size: 11.5px; text-transform: uppercase;">
        Material Requisition (${mReq}) &mdash; Packaging Trims &amp; Accessories
      </div>
      <table class="size-matrix-table" style="margin-bottom: 14px;">
        <thead>
          <tr>
            <th>Item Code</th>
            <th>Material Description</th>
            <th>Article</th>
            <th style="text-align: right;">Required Qty</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>ACC-POLY-STD</td>
            <td>Heavy Duty Protective Polybag (1/Pr)</td>
            <td>${article}</td>
            <td style="text-align: right; font-weight: bold;">${pairs.toLocaleString()} pcs</td>
          </tr>
          <tr>
            <td>ACC-TAG-STD</td>
            <td>Article Hangtag / Rider Card (1/Pr)</td>
            <td>${article}</td>
            <td style="text-align: right; font-weight: bold;">${pairs.toLocaleString()} pcs</td>
          </tr>
          <tr>
            <td>ACC-SILICA-2G</td>
            <td>Silica Gel Moisture Sachet 2g (1/Pr)</td>
            <td>${article}</td>
            <td style="text-align: right; font-weight: bold;">${pairs.toLocaleString()} pouches</td>
          </tr>
          <tr>
            <td>STICKER_BARCODE</td>
            <td>EAN-13 Scannable Barcode Sticker (2/Pr)</td>
            <td>${article}</td>
            <td style="text-align: right; font-weight: bold;">${(pairs * 2).toLocaleString()} pcs</td>
          </tr>
        </tbody>
      </table>

      <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 11px; margin-top: 22px; border-top: 1px dashed var(--ink-500); padding-top: 10px; white-space: nowrap;">
        <span>Packing Hall Supervisor: _____________</span>
        <span>Issued By: _____________</span>
        <span>Approved By: _____________</span>
      </div>
    </div>
  `;
}

/**
 * 1.4 — Dedicated monochrome Material Requisition Slip (M-REQ) builder.
 */
export function buildMaterialRequisitionSlipHtml(params: {
  mreqNo: string;
  reqNo: string;
  orderId: string;
  article: string;
  pairs: number;
  status: string;
  date?: string;
}): string {
  const baseReq = normalizeBaseReqNumber(params.reqNo || params.mreqNo);
  const mReq = getMaterialReqNumber(baseReq);
  const pairs = Math.max(0, Number(params.pairs || 0));
  const cartons = Math.max(1, Math.ceil(pairs / 60));
  const dateStr = params.date || '04-11-2026';

  return `
    <div class="printable-slip-box">
      <div class="printable-slip-header">
        <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-950);">MERIDIAN WORKS &bull; STAGE 4 MATERIAL REQUISITION SLIP (M-REQ)</h2>
        <p style="margin: 2px 0 0; font-size: 11px; text-transform: uppercase; color: var(--ink-600);">
          1st Packing (Polybag &amp; Trims) &bull; Official Packaging Accessories Issue Voucher
        </p>
      </div>
      <div class="printable-meta-grid">
        <div><span>Material Req #:</span> <strong>${mReq}</strong></div>
        <div><span>Parent Requisition #:</span> <strong>${baseReq}</strong></div>
        <div><span>Master Order #:</span> <strong>${params.orderId || '---'}</strong></div>
        <div><span>Article:</span> <strong>${params.article || '---'}</strong></div>
        <div><span>Target Batch Pairs:</span> <strong>${pairs.toLocaleString()} Pairs</strong></div>
        <div><span>Trim Store Status:</span> <strong>${params.status || 'Issued'} (${dateStr})</strong></div>
      </div>

      <table class="size-matrix-table" style="margin-bottom: 14px;">
        <thead>
          <tr>
            <th>Trim Code</th>
            <th>Packaging Component Description</th>
            <th>Ratio</th>
            <th style="text-align: right;">Issued Qty</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>ACC-POLY-STD</td>
            <td>Individual Polybag Sleeve</td>
            <td>1 / Pair</td>
            <td style="text-align: right; font-weight: 700;">${pairs.toLocaleString()} pcs</td>
          </tr>
          <tr>
            <td>ACC-TAG-STD</td>
            <td>Brand Hangtag + Care Instruction Card</td>
            <td>1 / Pair</td>
            <td style="text-align: right; font-weight: 700;">${pairs.toLocaleString()} pcs</td>
          </tr>
          <tr>
            <td>ACC-SILICA-2G</td>
            <td>Desiccant Silica Gel Sachet (2g)</td>
            <td>1 / Pair</td>
            <td style="text-align: right; font-weight: 700;">${pairs.toLocaleString()} pouches</td>
          </tr>
          <tr>
            <td>CTN-MASTER-60</td>
            <td>5-Ply Corrugated Master Carton (60 Prs/Box)</td>
            <td>1 / 60 Prs</td>
            <td style="text-align: right; font-weight: 700;">${cartons.toLocaleString()} boxes</td>
          </tr>
        </tbody>
      </table>

      <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 11px; margin-top: 22px; border-top: 1px dashed var(--ink-500); padding-top: 10px; white-space: nowrap;">
        <span>Stage 4 Lead Sign: _____________</span>
        <span>Trim Store Issuer: _____________</span>
        <span>Final QC Gate Sign: _____________</span>
      </div>
    </div>
  `;
}

/**
 * 1.4 — Dedicated monochrome Alteration Route Slip (A-REQ) builder.
 */
export function buildAlterationRouteSlipHtml(params: {
  altReqNo: string;
  reqNo: string;
  orderId: string;
  article: string;
  maker: string;
  inAlterationPairs: number;
  scrappedPairs: number;
  cycleCount: number;
  date?: string;
}): string {
  const baseReq = normalizeBaseReqNumber(params.reqNo || params.altReqNo);
  const aReq = getAlterationReqNumber(baseReq);
  const dateStr = params.date || '04-11-2026';

  return `
    <div class="printable-slip-box">
      <div class="printable-slip-header">
        <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-950);">MERIDIAN WORKS &bull; ALTERATION &amp; REWORK ROUTE SLIP (A-REQ)</h2>
        <p style="margin: 2px 0 0; font-size: 11px; text-transform: uppercase; color: var(--ink-600);">
          Alteration Bay &bull; 2-Cycle Rework Limit &amp; Scrap Condemnation Voucher
        </p>
      </div>
      <div class="printable-meta-grid">
        <div><span>Alteration Slip #:</span> <strong>${aReq}</strong></div>
        <div><span>Parent Requisition #:</span> <strong>${baseReq}</strong></div>
        <div><span>Master Order #:</span> <strong>${params.orderId || '---'}</strong></div>
        <div><span>Contractor / Maker:</span> <strong>${params.maker || '---'}</strong></div>
        <div><span>Article:</span> <strong>${params.article || '---'}</strong></div>
        <div><span>Date:</span> <strong>${dateStr}</strong></div>
      </div>

      <table class="size-matrix-table" style="margin-bottom: 14px;">
        <thead>
          <tr>
            <th>Alteration Ref</th>
            <th>Rework Cycle</th>
            <th style="text-align: right;">Active Rework Pairs</th>
            <th style="text-align: right;">Condemned Scrap (Debit)</th>
            <th>Routing Policy</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>${aReq}</strong></td>
            <td>Cycle ${Math.min(2, Math.max(1, params.cycleCount || 1))}/2</td>
            <td style="text-align: right; font-weight: 700;">${Number(params.inAlterationPairs || 0).toLocaleString()} Pairs</td>
            <td style="text-align: right; font-weight: 700;">${Number(params.scrappedPairs || 0).toLocaleString()} Pairs</td>
            <td>Repaired &rarr; Stage 1 Re-Inspection | Cycle 2/2 Fail &rarr; Scrap</td>
          </tr>
        </tbody>
      </table>

      <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 11px; margin-top: 22px; border-top: 1px dashed var(--ink-500); padding-top: 10px; white-space: nowrap;">
        <span>QC Inspector Sign: _____________</span>
        <span>Alteration Bay Lead: _____________</span>
        <span>Contractor Debit Ack: _____________</span>
      </div>
    </div>
  `;
}

export interface GrnSlipParams {
  grnRef?: string;
  pendingOrderId?: string;
  date: string;
  maker: string;
  article: string;
  rcvdPairs: number;
  sizes: SizeBreakdown;
}

export function buildGrnReceivingSlipHtml(params: GrnSlipParams): string {
  const pendingOrderId = params.pendingOrderId || '---';
  const article = params.article || '---';
  const maker = params.maker || '---';
  const dateStr = params.date || '31-10-2026';
  const grnRef = params.grnRef || 'GRN-2026-0001';
  const sizeTotal = calculateSizeTotal(params.sizes);
  const rcvd = params.rcvdPairs > 0 ? params.rcvdPairs : sizeTotal;

  return `
    <div class="printable-slip-box">
      <div class="printable-slip-header">
        <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-950);">MERIDIAN WORKS &bull; INWARD GOODS RECEIVING SLIP</h2>
        <p style="margin: 2px 0 0; font-size: 11px; text-transform: uppercase; color: var(--ink-600);">
          Dock Receiving Register &bull; Official Received Goods Voucher
        </p>
      </div>
      <div class="printable-meta-grid">
        <div><span>GRN Reference:</span> <strong>${grnRef}</strong></div>
        <div><span>Receiving Date:</span> <strong>${dateStr}</strong></div>
        <div><span>Pending Order #:</span> <strong>${pendingOrderId}</strong></div>
        <div><span>Maker / Contractor:</span> <strong>${maker}</strong></div>
        <div><span>Article / Product:</span> <strong>${article}</strong></div>
        <div><span>Total Received:</span> <strong>${rcvd.toLocaleString()} Pairs</strong></div>
      </div>

      <div style="font-weight: 700; color: var(--ink-950); margin: 8px 0 4px; font-size: 11.5px; text-transform: uppercase;">
        Article &amp; Received Size Breakdown Allocation (Pairs)
      </div>
      <table class="size-matrix-table" style="width: 100%; border-collapse: collapse; margin: 8px 0 12px; font-size: 12px;">
        <thead>
          <tr style="background: var(--ink-100); color: var(--ink-950);">
            <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Article</th>
            <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">7 / S</th>
            <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">8 / M</th>
            <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">9 / L</th>
            <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">10 / XL</th>
            <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">11 / XXL</th>
            <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: center; background: var(--ink-200); font-weight: 800;">Total Received</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: left; font-weight: 700;">${article}</td>
            <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">${Number(params.sizes['7'] || 0).toLocaleString()} Prs</td>
            <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">${Number(params.sizes['8'] || 0).toLocaleString()} Prs</td>
            <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">${Number(params.sizes['9'] || 0).toLocaleString()} Prs</td>
            <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">${Number(params.sizes['10'] || 0).toLocaleString()} Prs</td>
            <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">${Number(params.sizes['11'] || 0).toLocaleString()} Prs</td>
            <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center; font-weight: 800; color: var(--ink-950); font-size: 13px;">${rcvd.toLocaleString()} Pairs</td>
          </tr>
        </tbody>
      </table>

      <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 11px; margin-top: 24px; border-top: 1px dashed var(--ink-500); padding-top: 8px; white-space: nowrap;">
        <span>Contractor Agent Sign: _____________</span>
        <span>Dock Receiver: _____________</span>
        <span>Store Head Sign: _____________</span>
      </div>
    </div>
  `;
}

export interface RequisitionAnalyticsPoint {
  reqNumber: string;
  mreqNo: string;
  altReqNo: string;
  parentOrderId: string;
  article: string;
  plannedDemandPairs: number;
  issuedFloorPairs: number;
  stage1To3WipPairs: number;
  stage4FirstPackedPairs: number;
  actualPackedPairs: number;
  alterationAndScrapPairs: number;
  unpackedBalancePairs: number;
  packedCompletionPct: number;
  firstPackedPct: number;
  activeStage: WipStage;
  reqLifecycleStatus: string;
  isSelected: boolean;
}

export function buildRequisitionAnalyticsSeries(
  summary: SuperUserDashboardSummary,
  selectedReqNumber?: string
): RequisitionAnalyticsPoint[] {
  const normSelected = selectedReqNumber ? normalizeBaseReqNumber(selectedReqNumber) : '';
  const allReqs: SuperUserReqBatchItem[] = [];
  const seen = new Set<string>();

  for (const ord of summary.orderRollups) {
    for (const r of ord.reqBatches) {
      if (!seen.has(r.reqNumber)) {
        seen.add(r.reqNumber);
        allReqs.push(r);
      }
    }
  }

  if (allReqs.length === 0) {
    const fallbackReq = normSelected || 'REQ-0001';
    return [
      {
        reqNumber: fallbackReq,
        mreqNo: getMaterialReqNumber(fallbackReq),
        altReqNo: getAlterationReqNumber(fallbackReq),
        parentOrderId: summary.orderRollups[0]?.orderId || 'ORD-PENDING',
        article: summary.orderRollups[0]?.article || 'Awaiting Req',
        plannedDemandPairs: 0,
        issuedFloorPairs: 0,
        stage1To3WipPairs: 0,
        stage4FirstPackedPairs: 0,
        actualPackedPairs: 0,
        alterationAndScrapPairs: 0,
        unpackedBalancePairs: 0,
        packedCompletionPct: 0,
        firstPackedPct: 0,
        activeStage: 'STEP_1',
        reqLifecycleStatus: 'PENDING ISSUE',
        isSelected: true
      }
    ];
  }

  return allReqs.map(r => {
    const plannedDemandPairs = Math.max(0, Number(r.askingPairs || r.issuedPairs || 0));
    const issuedFloorPairs = Math.max(0, Number(r.issuedPairs || 0));
    const stage4FirstPackedPairs = Math.max(0, Number(r.stage4Passed || 0));
    const actualPackedPairs = Math.max(0, Number(r.packedStage5Pairs || 0));
    const alterationAndScrapPairs = Math.max(
      0,
      Number(r.inAlterationPairs || 0) + Number(r.scrappedPairs || 0)
    );
    const stage1To3WipPairs = Math.max(
      0,
      Number(r.inFloorWipPairs || 0) - Math.max(0, stage4FirstPackedPairs - actualPackedPairs)
    );
    const baseline = Math.max(1, plannedDemandPairs || issuedFloorPairs || 1);
    const packedCompletionPct =
      plannedDemandPairs > 0 || issuedFloorPairs > 0
        ? Math.min(100, Math.round((actualPackedPairs / baseline) * 100))
        : 0;
    const firstPackedPct =
      plannedDemandPairs > 0 || issuedFloorPairs > 0
        ? Math.min(100, Math.round((stage4FirstPackedPairs / baseline) * 100))
        : 0;
    const unpackedBalancePairs = Math.max(
      0,
      Math.max(plannedDemandPairs, issuedFloorPairs) - actualPackedPairs - Number(r.scrappedPairs || 0)
    );

    return {
      reqNumber: r.reqNumber,
      mreqNo: r.mreqNo,
      altReqNo: r.altReqNo,
      parentOrderId: r.parentOrderId || 'UNLINKED',
      article: r.article || '---',
      plannedDemandPairs,
      issuedFloorPairs,
      stage1To3WipPairs,
      stage4FirstPackedPairs,
      actualPackedPairs,
      alterationAndScrapPairs,
      unpackedBalancePairs,
      packedCompletionPct,
      firstPackedPct,
      activeStage: r.activeStage,
      reqLifecycleStatus: r.reqLifecycleStatus,
      isSelected: normSelected === r.reqNumber
    };
  });
}

export function getSuperUserStatusBadgeClass(status: string): string {
  const s = (status || '').toUpperCase();
  if (s.includes('RECONCILED')) {
    return 'su-badge su-badge-reconciled';
  }
  if (s.includes('VARIANCE')) {
    return 'su-badge su-badge-variance';
  }
  if (
    s.includes('COMPLETED') ||
    s.includes('CLOSED') ||
    s.includes('DISPATCHED') ||
    s === 'OK' ||
    s === 'ISSUED' ||
    s === 'FULLY ALLOCATED'
  ) {
    return 'su-badge su-badge-complete';
  }
  if (
    s.includes('STAGE 4') ||
    s.includes('HOLD FOR QC') ||
    s.includes('FINAL QC') ||
    s.includes('M-REQ') ||
    s === 'PRINTED'
  ) {
    return 'su-badge su-badge-mreq';
  }
  if (
    s.includes('ALTERATION') ||
    s.includes('REWORK') ||
    s.includes('SCRAP') ||
    s.includes('A-REQ') ||
    s.includes('VOID')
  ) {
    return 'su-badge su-badge-areq';
  }
  if (
    s.includes('RECEIVING') ||
    s.includes('AWAITING DOCK') ||
    s.includes('PENDING') ||
    s.includes('GRN') ||
    s.includes('ALLOCATED')
  ) {
    return 'su-badge su-badge-grn';
  }
  return 'su-badge su-badge-req';
}

/**
 * R2 & 6.6 — Zero raw hex colors in chart rendering; uses scoped var(--su-...) tokens in Super User mode
 * and var(--ink-...) tokens in Packing Hall mode.
 */
export function renderRequisitionWipAnalyticsChart(params: {
  series: RequisitionAnalyticsPoint[];
  activeWipSizes?: SizeBreakdown;
  activeReqNumber?: string;
  activePlannedQty?: number;
  activeStage4Packed?: number;
  activeStage5Packed?: number;
  mode: 'packing-hall' | 'super-user';
}): string {
  const {
    series,
    activeWipSizes,
    activeReqNumber,
    activePlannedQty = 0,
    activeStage4Packed = 0,
    activeStage5Packed = 0,
    mode
  } = params;
  const isSu = mode === 'super-user';

  const totalDemand = series.reduce((acc, p) => acc + p.plannedDemandPairs, 0);
  const totalIssued = series.reduce((acc, p) => acc + p.issuedFloorPairs, 0);
  const totalStage4 = series.reduce((acc, p) => acc + p.stage4FirstPackedPairs, 0);
  const totalActualPacked = series.reduce((acc, p) => acc + p.actualPackedPairs, 0);
  const totalAlteration = series.reduce((acc, p) => acc + p.alterationAndScrapPairs, 0);
  const overallCompletionPct =
    totalDemand > 0 ? Math.min(100, Math.round((totalActualPacked / totalDemand) * 100)) : 0;

  const maxChartVal = Math.max(
    100,
    ...series.map(p =>
      Math.max(
        p.plannedDemandPairs,
        p.issuedFloorPairs,
        p.stage4FirstPackedPairs,
        p.actualPackedPairs,
        p.alterationAndScrapPairs
      )
    )
  );

  const tick100 = maxChartVal;
  const tick75 = Math.round(maxChartVal * 0.75);
  const tick50 = Math.round(maxChartVal * 0.5);
  const tick25 = Math.round(maxChartVal * 0.25);

  const sizeKeys: Array<'7' | '8' | '9' | '10' | '11'> = ['7', '8', '9', '10', '11'];
  const sizeLabels: Record<'7' | '8' | '9' | '10' | '11', string> = {
    '7': 'Size 7 / S',
    '8': 'Size 8 / M',
    '9': 'Size 9 / L',
    '10': 'Size 10 / XL',
    '11': 'Size 11 / XXL'
  };

  const sizeTotal = activeWipSizes ? calculateSizeTotal(activeWipSizes) : 0;
  const effectiveDemand = Math.max(activePlannedQty, sizeTotal);
  const s4Ratio = effectiveDemand > 0 ? Math.min(1, activeStage4Packed / effectiveDemand) : 0;
  const s5Ratio = effectiveDemand > 0 ? Math.min(1, activeStage5Packed / effectiveDemand) : 0;

  const planFill = isSu ? 'var(--su-req-fill-soft)' : 'var(--ink-300)';
  const planBorder = isSu ? 'var(--su-req-primary)' : 'var(--ink-900)';
  const issuedFill = isSu ? 'var(--su-req-accent)' : 'var(--ink-500)';
  const issuedBorder = isSu ? 'var(--su-req-deep)' : 'var(--ink-900)';
  const s4Fill = isSu ? 'var(--su-mreq-primary)' : 'var(--ink-700)';
  const s4Border = isSu ? 'var(--su-mreq-dark)' : 'var(--ink-950)';
  const s5Fill = isSu ? 'var(--su-complete-primary)' : 'var(--ink-950)';
  const s5Border = isSu ? 'var(--su-complete-dark)' : 'var(--ink-950)';
  const altFill = isSu
    ? 'repeating-linear-gradient(45deg, var(--su-areq-fill-soft), var(--su-areq-fill-soft) 2px, var(--su-areq-primary) 2px, var(--su-areq-primary) 4px)'
    : 'repeating-linear-gradient(45deg, var(--ink-200), var(--ink-200) 2px, var(--ink-700) 2px, var(--ink-700) 4px)';
  const altBorder = isSu ? 'var(--su-areq-dark)' : 'var(--ink-900)';

  return `
    <section class="panel-card" data-testid="wip-analytics-dashboard" style="margin-bottom: 14px; border: 1px solid ${isSu ? 'var(--su-border)' : 'var(--border-strong)'};">
      <div class="panel-card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <span class="panel-card-title">
            Real-Time WIP Analytics &mdash; Planned Demand vs. Actual Packed Pairs (Per Active Requisition)
          </span>
          <span style="font-size: 11px; color: ${isSu ? 'var(--su-text-secondary)' : 'var(--ink-600)'}; font-family: var(--font-mono);">
            ${series.length} Active REQ${series.length === 1 ? '' : 's'} &bull; Demand: <strong>${totalDemand.toLocaleString()} Prs</strong> &bull; Packed S5: <strong style="color: ${isSu ? 'var(--su-complete-primary)' : 'inherit'};">${totalActualPacked.toLocaleString()} Prs (${overallCompletionPct}%)</strong>
          </span>
        </div>

        <div style="display: flex; align-items: center; gap: 12px; font-size: 11px; color: ${isSu ? 'var(--su-text-primary)' : 'var(--ink-800)'}; flex-wrap: wrap;">
          <span style="display: inline-flex; align-items: center; gap: 5px;">
            <span style="width: 10px; height: 10px; background: ${planFill}; border: 1.5px solid ${planBorder}; display: inline-block;"></span>
            Planned Demand (REQ)
          </span>
          <span style="display: inline-flex; align-items: center; gap: 5px;">
            <span style="width: 10px; height: 10px; background: ${issuedFill}; border: 1.5px solid ${issuedBorder}; display: inline-block;"></span>
            Issued Floor WIP
          </span>
          <span style="display: inline-flex; align-items: center; gap: 5px;">
            <span style="width: 10px; height: 10px; background: ${s4Fill}; border: 1.5px solid ${s4Border}; display: inline-block;"></span>
            1st Packed (M-REQ / S4 QC)
          </span>
          <span style="display: inline-flex; align-items: center; gap: 5px;">
            <span style="width: 10px; height: 10px; background: ${s5Fill}; border: 1.5px solid ${s5Border}; display: inline-block;"></span>
            Actual Packed (Stage 5)
          </span>
          <span style="display: inline-flex; align-items: center; gap: 5px;">
            <span style="width: 10px; height: 10px; background: ${altFill}; border: 1px solid ${altBorder}; display: inline-block;"></span>
            Alteration / Scrap (A-REQ)
          </span>
        </div>
      </div>

      <div style="padding: 14px 16px; font-variant-numeric: tabular-nums;">
        <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 14px; padding: 8px 12px; background: ${isSu ? 'var(--su-bg-primary)' : 'var(--ink-50)'}; border: 1px solid ${isSu ? 'var(--su-border)' : 'var(--border-default)'}; border-radius: 4px; font-size: 11.5px;">
          <div>
            <div style="font-size: 10px; text-transform: uppercase; color: ${isSu ? 'var(--su-text-secondary)' : 'var(--ink-500)'}; font-weight: 700;">Planned Demand (All REQs)</div>
            <div style="font-size: 14px; font-weight: 800; color: ${isSu ? 'var(--su-req-primary)' : 'var(--ink-950)'};">${totalDemand.toLocaleString()} Pairs</div>
          </div>
          <div>
            <div style="font-size: 10px; text-transform: uppercase; color: ${isSu ? 'var(--su-text-secondary)' : 'var(--ink-500)'}; font-weight: 700;">Issued from Dock</div>
            <div style="font-size: 14px; font-weight: 800; color: ${isSu ? 'var(--su-req-accent)' : 'var(--ink-900)'};">${totalIssued.toLocaleString()} Pairs</div>
          </div>
          <div>
            <div style="font-size: 10px; text-transform: uppercase; color: ${isSu ? 'var(--su-text-secondary)' : 'var(--ink-500)'}; font-weight: 700;">Stage 4 1st Packed (M-REQ)</div>
            <div style="font-size: 14px; font-weight: 800; color: ${isSu ? 'var(--su-mreq-primary)' : 'var(--ink-900)'};">${totalStage4.toLocaleString()} Pairs</div>
          </div>
          <div>
            <div style="font-size: 10px; text-transform: uppercase; color: ${isSu ? 'var(--su-text-secondary)' : 'var(--ink-500)'}; font-weight: 700;">Actual Packed (Stage 5)</div>
            <div style="font-size: 14px; font-weight: 800; color: ${isSu ? 'var(--su-complete-primary)' : 'var(--ink-950)'};">${totalActualPacked.toLocaleString()} Pairs (${overallCompletionPct}%)</div>
          </div>
          <div>
            <div style="font-size: 10px; text-transform: uppercase; color: ${isSu ? 'var(--su-text-secondary)' : 'var(--ink-500)'}; font-weight: 700;">Alteration / Scrap (A-REQ)</div>
            <div style="font-size: 14px; font-weight: 800; color: ${isSu ? 'var(--su-areq-primary)' : 'var(--ink-900)'};">${totalAlteration.toLocaleString()} Pairs</div>
          </div>
        </div>

        <div class="${mode === 'packing-hall' ? 'two-column-grid' : ''}" style="${mode === 'packing-hall' ? 'grid-template-columns: 1.45fr 1fr; gap: 16px;' : ''}">
          <div style="border: 1px solid ${isSu ? 'var(--su-border)' : 'var(--border-default)'}; border-radius: 4px; padding: 12px 14px; background: var(--white);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-size: 11.5px; font-weight: 800; color: ${isSu ? 'var(--su-text-primary)' : 'var(--ink-950)'}; text-transform: uppercase;">
                Grouped Bar Comparison by Requisition (REQ &rarr; M-REQ / A-REQ / S5)
              </span>
              <span style="font-size: 10.5px; color: ${isSu ? 'var(--su-text-secondary)' : 'var(--ink-500)'};">
                ${mode === 'packing-hall' ? 'Click any requisition bar group to switch active floor batch' : 'Click any requisition bar group to open in Packing Hall'}
              </span>
            </div>

            <div style="display: grid; grid-template-columns: 46px 1fr; gap: 8px; align-items: stretch;">
              <div style="display: flex; flex-direction: column; justify-content: space-between; height: 176px; padding-bottom: 2px; font-family: var(--font-mono); font-size: 10px; color: var(--ink-500); text-align: right;">
                <span>${tick100.toLocaleString()}</span>
                <span>${tick75.toLocaleString()}</span>
                <span>${tick50.toLocaleString()}</span>
                <span>${tick25.toLocaleString()}</span>
                <span>0</span>
              </div>

              <div style="position: relative; height: 176px; border-left: 1.5px solid ${isSu ? 'var(--su-axis-border)' : 'var(--ink-900)'}; border-bottom: 2px solid ${isSu ? 'var(--su-axis-border)' : 'var(--ink-900)'}; background: linear-gradient(to bottom, var(--border-subtle) 1px, transparent 1px) 0 0 / 100% 25%; display: flex; align-items: flex-end; gap: 14px; padding: 10px 12px 0 12px; overflow-x: auto;">
                ${series
                  .map(pt => {
                    const hPlan =
                      pt.plannedDemandPairs > 0
                        ? Math.max(8, Math.round((pt.plannedDemandPairs / maxChartVal) * 116))
                        : 3;
                    const hIssued =
                      pt.issuedFloorPairs > 0
                        ? Math.max(8, Math.round((pt.issuedFloorPairs / maxChartVal) * 116))
                        : 3;
                    const hS4 =
                      pt.stage4FirstPackedPairs > 0
                        ? Math.max(8, Math.round((pt.stage4FirstPackedPairs / maxChartVal) * 116))
                        : 3;
                    const hActual =
                      pt.actualPackedPairs > 0
                        ? Math.max(8, Math.round((pt.actualPackedPairs / maxChartVal) * 116))
                        : 3;
                    const hAlt =
                      pt.alterationAndScrapPairs > 0
                        ? Math.max(6, Math.round((pt.alterationAndScrapPairs / maxChartVal) * 116))
                        : 0;

                    const clickHandler =
                      mode === 'packing-hall'
                        ? `window.selectWipBatchFromChart && window.selectWipBatchFromChart('${pt.reqNumber.replace(/'/g, "\\'")}')`
                        : `window.adminOpenReqInScreen && window.adminOpenReqInScreen('${pt.reqNumber.replace(/'/g, "\\'")}', 'screen-packing')`;

                    return `
                    <button
                      type="button"
                      class="wip-chart-req-group"
                      data-req-number="${pt.reqNumber}"
                      onclick="${clickHandler}"
                      title="${pt.reqNumber} (${pt.article}) | Planned Demand: ${pt.plannedDemandPairs.toLocaleString()} Prs | Issued: ${pt.issuedFloorPairs.toLocaleString()} Prs | 1st Packed (${pt.mreqNo}): ${pt.stage4FirstPackedPairs.toLocaleString()} Prs | Actual Stage 5 Packed: ${pt.actualPackedPairs.toLocaleString()} Prs (${pt.packedCompletionPct}%) | Alteration (${pt.altReqNo}): ${pt.alterationAndScrapPairs} Prs"
                      style="flex: 1; min-width: 118px; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; background: ${pt.isSelected ? (isSu ? 'var(--su-req-bg)' : 'rgba(15, 23, 42, 0.04)') : 'transparent'}; border: ${pt.isSelected ? (isSu ? '1px dashed var(--su-req-primary)' : '1px dashed var(--ink-900)') : '1px solid transparent'}; border-bottom: none; border-radius: 4px 4px 0 0; padding: 8px 6px 0; cursor: pointer;"
                    >
                      <div style="font-size: 9.5px; font-weight: 800; color: ${isSu ? 'var(--su-text-primary)' : 'var(--ink-900)'}; margin-bottom: 4px; font-family: var(--font-mono); white-space: nowrap;">
                        ${pt.actualPackedPairs.toLocaleString()} / ${pt.plannedDemandPairs.toLocaleString()} (${pt.packedCompletionPct}%)
                      </div>
                      <div style="display: flex; align-items: flex-end; justify-content: center; gap: 4px; width: 100%; height: 132px;">
                        <div style="display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%;">
                          <span style="font-size: 8.5px; color: ${isSu ? 'var(--su-req-primary)' : 'var(--ink-600)'}; font-family: var(--font-mono); margin-bottom: 1px;">${pt.plannedDemandPairs}</span>
                          <div style="width: 16px; height: ${hPlan}px; background: ${planFill}; border: 1.5px solid ${planBorder}; border-bottom: none; border-radius: 2px 2px 0 0;"></div>
                        </div>
                        <div style="display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%;">
                          <span style="font-size: 8.5px; color: ${isSu ? 'var(--su-req-accent)' : 'var(--ink-700)'}; font-family: var(--font-mono); margin-bottom: 1px;">${pt.issuedFloorPairs}</span>
                          <div style="width: 16px; height: ${hIssued}px; background: ${issuedFill}; border: 1.5px solid ${issuedBorder}; border-bottom: none; border-radius: 2px 2px 0 0;"></div>
                        </div>
                        <div style="display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%;">
                          <span style="font-size: 8.5px; color: ${isSu ? 'var(--su-mreq-primary)' : 'var(--ink-800)'}; font-family: var(--font-mono); margin-bottom: 1px;">${pt.stage4FirstPackedPairs}</span>
                          <div style="width: 16px; height: ${hS4}px; background: ${s4Fill}; border: 1.5px solid ${s4Border}; border-bottom: none; border-radius: 2px 2px 0 0;"></div>
                        </div>
                        <div style="display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%;">
                          <span style="font-size: 8.5px; font-weight: 800; color: ${isSu ? 'var(--su-complete-primary)' : 'var(--ink-950)'}; font-family: var(--font-mono); margin-bottom: 1px;">${pt.actualPackedPairs}</span>
                          <div style="width: 16px; height: ${hActual}px; background: ${s5Fill}; border: 1.5px solid ${s5Border}; border-bottom: none; border-radius: 2px 2px 0 0;"></div>
                        </div>
                        ${
                          hAlt > 0
                            ? `
                        <div style="display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%;">
                          <span style="font-size: 8.5px; color: ${isSu ? 'var(--su-areq-primary)' : 'var(--ink-700)'}; font-family: var(--font-mono); margin-bottom: 1px;">${pt.alterationAndScrapPairs}</span>
                          <div style="width: 12px; height: ${hAlt}px; background: ${altFill}; border: 1px solid ${altBorder}; border-bottom: none; border-radius: 2px 2px 0 0;"></div>
                        </div>
                        `
                            : ''
                        }
                      </div>
                    </button>
                  `;
                  })
                  .join('')}
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 46px 1fr; gap: 8px; margin-top: 6px;">
              <div></div>
              <div style="display: flex; gap: 14px; padding: 0 12px; overflow-x: auto;">
                ${series
                  .map(
                    pt => `
                  <div style="flex: 1; min-width: 118px; text-align: center;">
                    <div style="font-family: var(--font-mono); font-size: 11px; font-weight: 800; color: ${isSu ? 'var(--su-req-primary)' : 'var(--ink-950)'};">
                      ${pt.reqNumber} ${pt.isSelected ? '&#9679;' : ''}
                    </div>
                    <div style="font-size: 10px; color: var(--ink-700); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                      ${pt.article} (${pt.parentOrderId})
                    </div>
                    <div style="font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-500);">
                      <span style="color: ${isSu ? 'var(--su-mreq-primary)' : 'inherit'};">${pt.mreqNo}</span> &bull; <span style="color: ${isSu ? 'var(--su-areq-primary)' : 'inherit'};">${pt.altReqNo}</span>
                    </div>
                  </div>
                `
                  )
                  .join('')}
              </div>
            </div>
          </div>

          ${
            mode === 'packing-hall'
              ? `
          <div style="border: 1px solid var(--border-default); border-radius: 4px; padding: 12px 14px; background: var(--white); display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span style="font-size: 11.5px; font-weight: 800; color: var(--ink-950); text-transform: uppercase;">
                  ${activeReqNumber || 'REQ-0001'} Size-Curve Demand vs. Packed
                </span>
                <span style="font-family: var(--font-mono); font-size: 10.5px; color: var(--ink-600);">
                  Total: <strong>${effectiveDemand.toLocaleString()} Prs</strong>
                </span>
              </div>

              ${sizeKeys
                .map(sz => {
                  const szDemand = activeWipSizes ? Number(activeWipSizes[sz] || 0) : 0;
                  const estS4 = Math.round(szDemand * s4Ratio);
                  const estS5 = Math.round(szDemand * s5Ratio);
                  const maxSz = Math.max(1, szDemand, 1);
                  const s4Pct = szDemand > 0 ? Math.min(100, Math.round((estS4 / maxSz) * 100)) : 0;
                  const s5Pct = szDemand > 0 ? Math.min(100, Math.round((estS5 / maxSz) * 100)) : 0;

                  return `
                  <div style="margin-bottom: 9px;">
                    <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 3px;">
                      <strong style="color: var(--ink-900);">${sizeLabels[sz]}</strong>
                      <span style="font-family: var(--font-mono); color: var(--ink-700);">
                        Demand: <strong>${szDemand}</strong> | 1st Pkg: <strong>${estS4}</strong> | Packed S5: <strong>${estS5}</strong>
                      </span>
                    </div>
                    <div style="height: 10px; background: var(--ink-100); border: 1px solid var(--border-strong); border-radius: 2px; position: relative; overflow: hidden;">
                      <div style="position: absolute; left: 0; top: 0; bottom: 0; width: ${s4Pct}%; background: var(--ink-500);" title="Stage 4 1st Packed: ${estS4} Pairs"></div>
                      <div style="position: absolute; left: 0; top: 0; bottom: 0; width: ${s5Pct}%; background: var(--ink-950);" title="Stage 5 Actual Packed: ${estS5} Pairs"></div>
                    </div>
                  </div>
                `;
                })
                .join('')}
            </div>

            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border-strong); display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--ink-700);">
              <span>Unpacked Balance (${activeReqNumber || 'REQ-0001'}):</span>
              <strong style="font-size: 12.5px; color: var(--ink-950); font-family: var(--font-mono);">
                ${Math.max(0, effectiveDemand - activeStage5Packed).toLocaleString()} Pairs Remaining
              </strong>
            </div>
          </div>
          `
              : ''
          }
        </div>
      </div>
    </section>
  `;
}
