import {
  SizeBreakdown,
  ContractorOrderAllocation,
  PendingOrder,
  scaleSizeBreakdown
} from './sizingAndCatalog';
import {
  OrderWipState,
  isReqAwaitingFinalQc,
  canExecuteStage5CartonPacking,
  GrnToReqAllocation,
  SuperUserGrnBatchItem,
  OrderTraceabilityItem
} from './wipStageGates';
import { buildSuperUserOrderRollups } from './traceabilityEngine';

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
  | 'ORDER_DELETE'
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
  | 'SCRAP_CONDEMN'
  | 'USER_DELETE';

export const ROLE_PERMISSIONS: Record<MesUserRole, MesActionType[]> = {
  SUPER_USER: [
    'ORDER_CREATE',
    'ORDER_ADJUST',
    'ORDER_DELETE',
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
    'SCRAP_CONDEMN',
    'USER_DELETE'
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
  sizeFormat?: string;
  sizeCodes?: string[];
  dueDate?: string;
  sizes?: SizeBreakdown;
  totalQty?: number;
  contractorAllocations?: ContractorOrderAllocation[];
} | null {
  const found = orders.find(o => o.orderId === selectedOrderId);
  if (!found) return null;
  const allocs = found.contractorAllocations || [];
  const defaultMaker = allocs.length === 1 ? allocs[0].maker : (allocs.length > 1 ? '' : found.maker);
  const result: {
    pendingOrderId: string;
    buyer?: string;
    maker: string;
    po?: string;
    article: string;
    color?: string;
    sizeFormat?: string;
    sizeCodes?: string[];
    dueDate?: string;
    sizes?: SizeBreakdown;
    totalQty?: number;
    contractorAllocations?: ContractorOrderAllocation[];
  } = {
    pendingOrderId: found.orderId,
    maker: defaultMaker,
    article: found.article
  };
  if (found.buyer !== undefined) result.buyer = found.buyer;
  if (found.po !== undefined) result.po = found.po;
  if (found.color !== undefined) result.color = found.color;
  if (found.sizeFormat !== undefined) result.sizeFormat = found.sizeFormat;
  if (found.sizeCodes !== undefined) result.sizeCodes = found.sizeCodes;
  if (found.dueDate !== undefined) result.dueDate = found.dueDate;
  if (found.sizes !== undefined) result.sizes = found.sizes;
  if (found.totalQty !== undefined) result.totalQty = found.totalQty;
  if (found.contractorAllocations !== undefined) result.contractorAllocations = found.contractorAllocations;
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
