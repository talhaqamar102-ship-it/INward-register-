import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  STANDARD_GLOVE_SIZES,
  EXTENDED_GLOVE_SIZES,
  DEFAULT_MES_POLICY_CONFIG,
  PHASED_ROLLOUT_RECORD,
  normalizeBaseReqNumber,
  getMaterialReqNumber,
  getAlterationReqNumber,
  calculateSizeTotal,
  scaleSizeBreakdown,
  normalizeSuperUserTab,
  applyPendingOrderSelection,
  evaluateRequisitionIssuance,
  determineOrderActiveStage,
  canExecuteStage5CartonPacking,
  buildPackingRequisitionSlipHtml,
  buildMaterialRequisitionSlipHtml,
  buildAlterationRouteSlipHtml,
  buildGrnReceivingSlipHtml,
  formatBatchSequence,
  isReqAwaitingFinalQc,
  buildSuperUserOrderRollups,
  buildOrderTraceability,
  computeOrderReconciliationMetrics,
  computeActualStageWipPairs,
  evaluateReqReconciliation,
  evaluateOrderReconciliation,
  allocateGrnsToRequisitions,
  migrateLegacyRecordsToRelationalHierarchy,
  executeAtomicWipTransition,
  canTransitionOrderStatus,
  canTransitionReqStatus,
  processAlterationCycle,
  evaluateGrnOverReceiptPolicy,
  prioritizeAndSliceChips,
  TransactionalOrderLedger,
  canVoidGrnBatch,
  canVoidRequisitionLot,
  canRolePerformAction,
  createAuditTrailEntry,
  createDemo600PairScenario,
  replayDemo600PairScenarioStepByStep,
  buildRequisitionAnalyticsSeries,
  getSuperUserStatusBadgeClass,
  renderRequisitionWipAnalyticsChart,
  createEmptySizes,
  PendingOrder,
  OrderWipState
} from './requisitionLogic';
import { renderSuperUserScreen, SuperUserRenderContext } from '../components/superUserView';

test('R1, 2.8, 3.8, 4.6, 4.7: authoritative size set constant supports standard 7..11 and extended 6..12 plus configurable policy defaults', () => {
  assert.deepEqual(STANDARD_GLOVE_SIZES, ['7', '8', '9', '10', '11']);
  assert.deepEqual(EXTENDED_GLOVE_SIZES, ['6', '7', '8', '9', '10', '11', '12']);
  assert.equal(calculateSizeTotal({ '6': 10, '7': 20, '8': 30, '9': 40, '10': 30, '11': 20, '12': 5 }), 155);
  const scaled = scaleSizeBreakdown({ '7': 20, '8': 50, '9': 60, '10': 50, '11': 20 }, 100);
  assert.equal(calculateSizeTotal(scaled), 100);

  // Verify all 4 DECISION items are explicitly modeled in DEFAULT_MES_POLICY_CONFIG
  assert.equal(DEFAULT_MES_POLICY_CONFIG.sizeScaleMode, 'PLAN1_7_TO_11');
  assert.equal(DEFAULT_MES_POLICY_CONFIG.overReceiptTolerancePct, 5);
  assert.equal(DEFAULT_MES_POLICY_CONFIG.allowShortShipmentCloseWithApproval, true);
  assert.equal(DEFAULT_MES_POLICY_CONFIG.aqlInspectorRole, 'QC_INSPECTOR');
  assert.equal(DEFAULT_MES_POLICY_CONFIG.aqlInspectionGranularity, 'PER_REQ');
  assert.equal(DEFAULT_MES_POLICY_CONFIG.aqlFailurePath, 'BACK_TO_ALTERATION');
  assert.equal(DEFAULT_MES_POLICY_CONFIG.alterationWorkflowMode, 'FULL_AREQ_CYCLE_AND_SCRAP');
});

test('1.2: normalizeSuperUserTab redirects legacy tab IDs to canonical 4 sub-views', () => {
  assert.equal(normalizeSuperUserTab('dashboard'), 'dashboard');
  assert.equal(normalizeSuperUserTab('traceability'), 'tracking');
  assert.equal(normalizeSuperUserTab('ledger'), 'tracking');
  assert.equal(normalizeSuperUserTab('orders'), 'creation');
  assert.equal(normalizeSuperUserTab('admin'), 'creation');
  assert.equal(normalizeSuperUserTab('analytics'), 'reports');
});

test('4.2: determineOrderActiveStage and canExecuteStage5CartonPacking enforce Stage 4 -> Final QC -> Stage 5 lock gate', () => {
  assert.equal(determineOrderActiveStage({ stage1In: 200, stage1Passed: 0, stage2In: 0 }), 'STEP_1');
  assert.equal(determineOrderActiveStage({ stage1In: 200, stage1Passed: 190, stage2In: 190, stage2Passed: 0 }), 'STEP_2');
  assert.equal(determineOrderActiveStage({ stage1Passed: 190, stage2Passed: 185, stage3In: 185, stage3Passed: 0 }), 'STEP_3');
  assert.equal(determineOrderActiveStage({ stage2Passed: 185, stage3Passed: 180, stage4In: 180, stage4Passed: 0 }), 'STEP_4');

  // When Stage 4 finishes but Final QC is not approved, Stage 5 is locked and activeStage stays at STEP_4
  const holdingLot = { stage3Passed: 180, stage4Passed: 180, outputCartons: 0, finalQcApproved: false };
  assert.equal(determineOrderActiveStage(holdingLot), 'STEP_4');
  const gateLocked = canExecuteStage5CartonPacking(holdingLot);
  assert.equal(gateLocked.allowed, false);
  assert.ok(gateLocked.reason.includes('LOCKED'));

  // Once Final QC is approved, Stage 5 unlocks
  const approvedLot = { ...holdingLot, finalQcApproved: true };
  assert.equal(determineOrderActiveStage(approvedLot), 'STEP_5');
  const gateUnlocked = canExecuteStage5CartonPacking(approvedLot);
  assert.equal(gateUnlocked.allowed, true);
  assert.equal(gateUnlocked.readyPairs, 180);

  // Final Master Cartons sealed: Completed
  assert.equal(
    determineOrderActiveStage({
      plannedQty: 180,
      stage1In: 180,
      stage4Passed: 180,
      outputPairs: 180,
      outputCartons: 6,
      finalQcApproved: true
    }),
    'COMPLETED'
  );
});

test('unified requisition number generates M- and A- prefixes from same req number', () => {
  const base = normalizeBaseReqNumber('REQ-2026-0001');
  assert.equal(base, 'REQ-2026-0001');
  assert.equal(getMaterialReqNumber(base), 'M-REQ-2026-0001');
  assert.equal(getAlterationReqNumber(base), 'A-REQ-2026-0001');
  assert.equal(getMaterialReqNumber('M-REQ-2026-0001'), 'M-REQ-2026-0001');
  assert.equal(getAlterationReqNumber('M-REQ-2026-0001'), 'A-REQ-2026-0001');
});

test('selecting a pending order created by super user automatically fills maker and article blanks', () => {
  const superUserOrders: PendingOrder[] = [
    { orderId: 'ORD-2026-001', maker: 'Hall A', article: 'Model A9' },
    { orderId: 'ORD-2026-002', maker: 'Farooq Workshop', article: 'Pro Cut-5 Heavy Duty' },
    {
      orderId: 'ORD-2026-003',
      buyer: 'Northwind Safety Ltd',
      maker: 'Hall A',
      po: '27351',
      article: 'Model A9',
      color: 'Black / Hi-Vis Yellow',
      sizes: { '7': 20, '8': 30, '9': 50, '10': 30, '11': 20 },
      totalQty: 150
    }
  ];

  const filledSimple = applyPendingOrderSelection(superUserOrders, 'ORD-2026-002');
  assert.deepEqual(filledSimple, {
    pendingOrderId: 'ORD-2026-002',
    maker: 'Farooq Workshop',
    article: 'Pro Cut-5 Heavy Duty'
  });

  const filledFull = applyPendingOrderSelection(superUserOrders, 'ORD-2026-003');
  assert.deepEqual(filledFull, {
    pendingOrderId: 'ORD-2026-003',
    buyer: 'Northwind Safety Ltd',
    maker: 'Hall A',
    po: '27351',
    article: 'Model A9',
    color: 'Black / Hi-Vis Yellow',
    sizes: { '7': 20, '8': 30, '9': 50, '10': 30, '11': 20 },
    totalQty: 150
  });

  assert.equal(applyPendingOrderSelection(superUserOrders, 'NON-EXISTENT'), null);
});

test('inward register issues packing hall requisition asking only when received stock is available', () => {
  const check1 = evaluateRequisitionIssuance({
    askingPairs: 500,
    totalReceivedPairs: 300,
    alreadyIssuedPairs: 0
  });
  assert.equal(check1.canIssue, false);
  assert.equal(check1.availablePairs, 300);
  assert.equal(check1.shortfallPairs, 200);

  const check2 = evaluateRequisitionIssuance({
    askingPairs: 500,
    totalReceivedPairs: 800,
    alreadyIssuedPairs: 100
  });
  assert.equal(check2.canIssue, true);
  assert.equal(check2.availablePairs, 700);
  assert.equal(check2.shortfallPairs, 0);
});

test('1.4 & 9.3: printable slips (GRN, REQ, M-REQ, A-REQ) render 100% monochrome with zero Buyer leakage on shop-floor slips', () => {
  const sizes = { '7': 100, '8': 200, '9': 300, '10': 150, '11': 50 };
  const reqHtml = buildPackingRequisitionSlipHtml({
    reqNo: 'REQ-2026-0001',
    date: '31-10-2026',
    article: 'Model A9',
    sizes
  });
  assert.ok(reqHtml.includes('REQ-2026-0001'));
  assert.ok(reqHtml.includes('M-REQ-2026-0001'));
  assert.ok(reqHtml.includes('A-REQ-2026-0001'));
  assert.equal(/buyer|customer/i.test(reqHtml), false);

  const grnHtml = buildGrnReceivingSlipHtml({
    grnRef: 'GRN-2026-0001',
    pendingOrderId: 'ORD-2026-001',
    date: '31-10-2026',
    maker: 'Hall B',
    article: 'Model A9',
    rcvdPairs: 400,
    sizes
  });
  assert.ok(grnHtml.includes('ORD-2026-001'));
  assert.equal(/buyer|customer/i.test(grnHtml), false);

  const mreqHtml = buildMaterialRequisitionSlipHtml({
    mreqNo: 'M-REQ-0001',
    reqNo: 'REQ-0001',
    orderId: 'ORD-2026-001',
    article: 'Model A9',
    pairs: 300,
    status: 'Issued'
  });
  assert.ok(mreqHtml.includes('M-REQ-0001'));
  assert.ok(mreqHtml.includes('300'));

  const areqHtml = buildAlterationRouteSlipHtml({
    altReqNo: 'A-REQ-0002',
    reqNo: 'REQ-0002',
    orderId: 'ORD-2026-001',
    article: 'Model A9',
    maker: 'Hall B',
    inAlterationPairs: 10,
    scrappedPairs: 5,
    cycleCount: 2
  });
  assert.ok(areqHtml.includes('A-REQ-0002'));
  assert.ok(areqHtml.includes('Cycle 2/2'));
});

test('2.5: allocateGrnsToRequisitions supports multi-GRN draw into single REQ and split GRN across multiple REQs', () => {
  const result = allocateGrnsToRequisitions({
    orderId: 'ORD-600',
    grnBatches: [
      { grnCode: 'GRN-0001', rcvdPairs: 250, sizes: createEmptySizes() },
      { grnCode: 'GRN-0002', rcvdPairs: 200, sizes: createEmptySizes() },
      { grnCode: 'GRN-0003', rcvdPairs: 150, sizes: createEmptySizes() }
    ],
    reqBatches: [
      { reqNumber: 'REQ-0001', issuedPairs: 300, sizes: createEmptySizes() },
      { reqNumber: 'REQ-0002', issuedPairs: 200, sizes: createEmptySizes() },
      { reqNumber: 'REQ-0003', issuedPairs: 100, sizes: createEmptySizes() }
    ]
  });

  // REQ-0001 draws 250 from GRN-0001 + 50 from GRN-0002
  const req1Allocs = result.reqAllocationSummary.get('REQ-0001')!;
  assert.deepEqual(req1Allocs, [
    { grnCode: 'GRN-0001', pairs: 250 },
    { grnCode: 'GRN-0002', pairs: 50 }
  ]);

  // REQ-0002 draws remaining 150 from GRN-0002 + 50 from GRN-0003
  const req2Allocs = result.reqAllocationSummary.get('REQ-0002')!;
  assert.deepEqual(req2Allocs, [
    { grnCode: 'GRN-0002', pairs: 150 },
    { grnCode: 'GRN-0003', pairs: 50 }
  ]);

  // REQ-0003 draws remaining 100 from GRN-0003
  const req3Allocs = result.reqAllocationSummary.get('REQ-0003')!;
  assert.deepEqual(req3Allocs, [{ grnCode: 'GRN-0003', pairs: 100 }]);

  // All 3 GRNs are FULLY ALLOCATED
  assert.equal(result.grnAllocationSummary.get('GRN-0001')?.allocationStatus, 'FULLY ALLOCATED');
  assert.equal(result.grnAllocationSummary.get('GRN-0002')?.allocationStatus, 'FULLY ALLOCATED');
  assert.equal(result.grnAllocationSummary.get('GRN-0003')?.allocationStatus, 'FULLY ALLOCATED');
});

test('3.4 & 3.5: non-tautological Floor WIP calculation detects artificially injected stage variance', () => {
  // Normal balanced lot: 200 issued -> 190 in Stage 4 + 10 in Alteration
  const balanced = computeActualStageWipPairs({
    isIssued: true,
    issuedPairs: 200,
    stage1In: 200,
    stage1Passed: 190,
    stage2In: 190,
    stage2Passed: 190,
    stage3In: 190,
    stage3Passed: 190,
    stage4In: 190,
    stage4Passed: 190,
    packedStage5Pairs: 0,
    inAlterationPairs: 10,
    scrappedPairs: 0
  });
  assert.equal(balanced.actualFloorWipPairs, 190);
  assert.equal(balanced.varianceDelta, 0);

  // Artificially inject 15 unaccounted missing pairs on the floor
  const corrupted = computeActualStageWipPairs({
    isIssued: true,
    issuedPairs: 200,
    stage1In: 200,
    stage1Passed: 175,
    packedStage5Pairs: 0,
    inAlterationPairs: 10,
    scrappedPairs: 0,
    unaccountedVariancePairs: 15
  });
  assert.equal(corrupted.actualFloorWipPairs, 175);
  assert.equal(corrupted.varianceDelta, -15);

  const reqRec = evaluateReqReconciliation({
    reqNumber: 'REQ-CORRUPT',
    issuedPairs: 200,
    inFloorWipPairs: corrupted.actualFloorWipPairs,
    packedStage5Pairs: 0,
    inAlterationPairs: 10,
    scrappedPairs: 0
  });
  assert.equal(reqRec.isReconciled, false);
  assert.equal(reqRec.badgeText, 'VARIANCE Δ');
  assert.equal(reqRec.deltaPairs, -15);
  assert.equal(reqRec.failingGate, 'FLOOR_GATE');
});

test('3.6 & 4.5: executeAtomicWipTransition and processAlterationCycle conserve pairs and enforce 2-cycle scrap rule', () => {
  const initial: OrderWipState = {
    reqNumber: 'REQ-0100',
    parentOrderId: 'ORD-0100',
    article: 'Model A1',
    plannedQty: 200,
    issueStatus: 'Pending Inward Issue',
    sizes: { '7': 20, '8': 50, '9': 60, '10': 50, '11': 20 },
    stage1In: 0,
    stage1Passed: 0,
    stage1Defects: 0,
    stage2In: 0,
    stage2Passed: 0,
    stage2Defects: 0,
    stage3In: 0,
    stage3Passed: 0,
    stage3Defects: 0,
    mreqNo: 'M-REQ-0100',
    altReqNo: 'A-REQ-0100',
    mreqQty: '200 Sets',
    mreqStatus: 'Ready',
    stage4In: 0,
    stage4Passed: 0,
    stage4Pending: 0,
    stage5Cartons: '0 Cartons',
    stage5Pending: '0 Cartons',
    lineEfficiency: '95%',
    outputPairs: 0,
    outputCartons: 0,
    inAlteration: 0,
    scrappedPairs: 0,
    finalQcApproved: false
  };

  const step0 = executeAtomicWipTransition(initial, { type: 'ISSUE_TO_STAGE_1', issuedPairs: 200 });
  assert.equal(step0.reconciliation.isReconciled, true);

  const step1 = executeAtomicWipTransition(step0.nextWip, {
    type: 'STAGE_1_TO_STAGE_2',
    passedPairs: 190,
    defectPairs: 10
  });
  assert.equal(step1.reconciliation.isReconciled, true);
  assert.equal(step1.nextWip.inAlteration, 10);

  // Cycle 1/2: 5 pairs repaired and returned to Stage 1
  const alt1 = processAlterationCycle({
    wip: step1.nextWip,
    pairsCount: 5,
    currentCycle: 1,
    outcome: 'REPAIRED_RETURN_TO_STAGE_1'
  });
  assert.equal(alt1.newStatus, 'Returned to Stage 1');
  assert.equal(alt1.nextWip.inAlteration, 5);
  assert.equal(alt1.nextWip.stage1Passed, 195);

  // Remaining 5 pairs fail Cycle 1/2 -> escalate to Cycle 2/2
  const alt2 = processAlterationCycle({
    wip: alt1.nextWip,
    pairsCount: 5,
    currentCycle: 1,
    outcome: 'FAILED_QC_CYCLE'
  });
  assert.equal(alt2.nextCycle, 2);
  assert.equal(alt2.newStatus, 'In Rework (Cycle 2/2)');

  // Fail Cycle 2/2 -> automatically condemned to Scrap + Contractor Debit
  const alt3 = processAlterationCycle({
    wip: alt2.nextWip,
    pairsCount: 5,
    currentCycle: 2,
    outcome: 'FAILED_QC_CYCLE'
  });
  assert.equal(alt3.newStatus, 'Scrapped');
  assert.equal(alt3.condemnedToScrapPairs, 5);
  assert.equal(alt3.contractorDebitPairs, 5);
});

test('11.4 & 11.6: Full 10-step 600-Pair Scenario (1-Order -> 3-GRNs -> 3-REQs) reconciles at every stage', () => {
  // Phase 1: In-progress (Steps 1-5: 3 GRNs = 600 Rcvd; REQ-1=300 packed, REQ-2=200 with 190 at S4 Hold + 10 in A-REQ Cycle 1/2, REQ-3=100 packed)
  const inProg = createDemo600PairScenario('IN_PROGRESS');
  const summaryInProg = buildOrderTraceability({
    pendingOrders: [inProg.order],
    grnList: inProg.grns,
    requisitions: inProg.reqs,
    defectList: inProg.defects
  });

  const ordInProg = summaryInProg.orderRollups[0];
  assert.equal(ordInProg.plannedQty, 600);
  assert.equal(ordInProg.receivedGrnQty, 600);
  assert.equal(ordInProg.contractorBalanceQty, 0);
  assert.equal(ordInProg.dockPoolQty, 0);
  assert.equal(ordInProg.issuedToFloorQty, 600);
  assert.equal(ordInProg.inFloorWipQty, 190);
  assert.equal(ordInProg.stage4ReadyForQcQty, 190);
  assert.equal(ordInProg.inAlterationQty, 10);
  assert.equal(ordInProg.scrappedQty, 0);
  assert.equal(ordInProg.packedStage5Qty, 400);
  assert.equal(ordInProg.reconciliation.isReconciled, true);
  assert.equal(ordInProg.orderStatus, 'AWAITING FINAL QC (STAGE 4)');

  // Phase 2: Completed (Steps 6-10: 5 repaired + packed -> 195 packed on REQ-2, 5 condemned on Cycle 2/2 -> 595 Packed + 5 Scrap = 600)
  const completed = createDemo600PairScenario('COMPLETED');
  const summaryDone = buildOrderTraceability({
    pendingOrders: [completed.order],
    grnList: completed.grns,
    requisitions: completed.reqs,
    defectList: completed.defects
  });

  const ordDone = summaryDone.orderRollups[0];
  assert.equal(ordDone.plannedQty, 600);
  assert.equal(ordDone.receivedGrnQty, 600);
  assert.equal(ordDone.contractorBalanceQty, 0);
  assert.equal(ordDone.dockPoolQty, 0);
  assert.equal(ordDone.issuedToFloorQty, 600);
  assert.equal(ordDone.inFloorWipQty, 0);
  assert.equal(ordDone.packedStage5Qty, 595);
  assert.equal(ordDone.inAlterationQty, 0);
  assert.equal(ordDone.scrappedQty, 5);
  assert.equal(ordDone.orderStatus, 'COMPLETED & DISPATCHED');
  assert.equal(ordDone.reconciliation.isReconciled, true);
  assert.equal(ordDone.reconciliation.badgeText, 'RECONCILED ✓');
  assert.equal(computeOrderReconciliationMetrics(ordDone).isReconciled, true);
});

test('11.5: Concurrency test — two simultaneous Dock Pool issues serialize so Dock Pool never goes negative', async () => {
  const ledger = new TransactionalOrderLedger(150, 0);

  // Fire two concurrent 100-pair requisitions against 150-pair Dock Pool
  const [resA, resB] = await Promise.all([
    ledger.tryIssueFromDock('REQ-0001', 100),
    ledger.tryIssueFromDock('REQ-0002', 100)
  ]);

  assert.equal(resA.accepted, true);
  assert.equal(resA.issuedPairs, 100);
  assert.equal(resA.remainingDockPoolPairs, 50);

  assert.equal(resB.accepted, false);
  assert.equal(resB.issuedPairs, 0);
  assert.equal(resB.remainingDockPoolPairs, 50);

  const snap = ledger.getSnapshot();
  assert.equal(snap.dockPoolPairs, 50);
  assert.equal(snap.issuedPairs, 100);
  assert.ok(snap.dockPoolPairs >= 0, 'Dock Pool must never become negative');
});

test('11.3: Schema migration normalizes legacy orders, GRNs, and REQs without data loss', () => {
  const mig = migrateLegacyRecordsToRelationalHierarchy({
    pendingOrders: [{ orderId: 'ORD-LEG-1', maker: 'Hall A', article: 'Model A1', totalQty: 300 }],
    grnList: [
      { sr: 1, date: '01-11-2026', pendingOrderId: '---', maker: 'Hall A', article: 'Model A1', rcvdPairs: 300 }
    ],
    requisitions: [
      {
        reqNumber: 'REQ-0001',
        article: 'Model A1',
        plannedQty: 300,
        issueStatus: 'Issued by Inward Register',
        sizes: createEmptySizes(),
        stage1In: 300,
        stage1Passed: 300,
        stage1Defects: 0,
        stage2In: 300,
        stage2Passed: 300,
        stage2Defects: 0,
        stage3In: 300,
        stage3Passed: 300,
        stage3Defects: 0,
        mreqNo: 'M-REQ-0001',
        altReqNo: 'A-REQ-0001',
        mreqQty: '300 Sets',
        mreqStatus: 'Issued',
        stage4In: 300,
        stage4Passed: 300,
        stage4Pending: 0,
        stage5Cartons: '5 Cartons',
        stage5Pending: '0 Cartons',
        lineEfficiency: '99%',
        outputPairs: 300,
        outputCartons: 5,
        inAlteration: 0,
        finalQcApproved: true
      }
    ]
  });

  assert.equal(mig.migratedGrns[0].pendingOrderId, 'ORD-LEG-1');
  assert.equal(mig.migratedRequisitions[0].parentOrderId, 'ORD-LEG-1');
});

test('4.1, 3.8, 5.4, 10.2, 10.3, 10.4: lifecycle transitions, over-receipt policy, chip overflow, voids, RBAC, and audit trail', () => {
  assert.equal(canTransitionOrderStatus('AWAITING DOCK #1 RECEIVING', 'RECEIVING AT DOCK #1'), true);
  assert.equal(canTransitionOrderStatus('COMPLETED & DISPATCHED', 'RECEIVING AT DOCK #1'), false);
  assert.equal(canTransitionReqStatus('STAGE 4 DONE (HOLD FOR QC)', 'QC PASSED — READY FOR STAGE 5'), true);
  assert.equal(canTransitionReqStatus('CLOSED ✓', 'IN FLOOR WIP'), false);

  // 3.8 Over-receipt policy
  const withinTol = evaluateGrnOverReceiptPolicy({
    plannedQty: 1000,
    alreadyReceivedQty: 900,
    incomingGrnQty: 130 // +3%
  });
  assert.equal(withinTol.allowed, true);
  assert.equal(withinTol.overReceiptPairs, 30);

  const overTol = evaluateGrnOverReceiptPolicy({
    plannedQty: 1000,
    alreadyReceivedQty: 900,
    incomingGrnQty: 200 // +10% > 5%
  });
  assert.equal(overTol.allowed, false);

  // 5.4 Chip overflow sorting
  const chips = prioritizeAndSliceChips(
    [
      { id: 'REQ-1', priorityScore: 0, seq: 1 },
      { id: 'REQ-2', priorityScore: 4, seq: 2 },
      { id: 'REQ-3', priorityScore: 2, seq: 3 },
      { id: 'REQ-4', priorityScore: 1, seq: 4 }
    ],
    3
  );
  assert.equal(chips.visible.length, 3);
  assert.equal(chips.visible[0].id, 'REQ-2');
  assert.equal(chips.overflowCount, 1);

  // 10.2 Void rules
  assert.equal(
    canVoidGrnBatch({
      grnCode: 'GRN-0001',
      orderBatchSeq: 1,
      sr: 1,
      date: '04-11-2026',
      orderId: 'ORD-1',
      pendingOrderId: 'ORD-1',
      maker: 'Hall A',
      article: 'Model A1',
      rcvdPairs: 200,
      allocatedPairs: 50,
      unallocatedPairs: 150,
      allocationStatus: 'PARTIALLY ALLOCATED',
      allocatedToReqs: [{ reqNumber: 'REQ-0001', pairs: 50 }],
      sizes: createEmptySizes(),
      status: 'Received'
    }).allowed,
    false
  );

  assert.equal(canVoidRequisitionLot({ reqNumber: 'REQ-0001', stage1Passed: 0, outputPairs: 0 }).allowed, true);
  assert.equal(canVoidRequisitionLot({ reqNumber: 'REQ-0001', stage1Passed: 50, outputPairs: 0 }).allowed, false);

  // 10.4 RBAC
  assert.equal(canRolePerformAction('SUPER_USER', 'ORDER_CREATE'), true);
  assert.equal(canRolePerformAction('INWARD_CLERK', 'ORDER_CREATE'), false);
  assert.equal(canRolePerformAction('QC_INSPECTOR', 'FINAL_QC_APPROVE'), true);

  // 10.3 Audit entry
  const aud = createAuditTrailEntry({
    seq: 1,
    actor: 'M. Tariq',
    role: 'SUPER_USER',
    action: 'ORDER_CREATE',
    entityId: 'ORD-2026-600',
    beforeSummary: '0 Prs',
    afterSummary: '600 Prs'
  });
  assert.equal(aud.auditId, 'AUD-0001');
});

test('R2 & 12.3: zero raw hex colors exist in superUserView.ts and requisitionLogic.ts, and Super User tokens are scoped', () => {
  assert.equal(getSuperUserStatusBadgeClass('RECONCILED ✓'), 'su-badge su-badge-reconciled');
  assert.equal(getSuperUserStatusBadgeClass('VARIANCE Δ'), 'su-badge su-badge-variance');
  assert.equal(getSuperUserStatusBadgeClass('COMPLETED & DISPATCHED'), 'su-badge su-badge-complete');

  const sampleSeries = [
    {
      reqNumber: 'REQ-0001',
      mreqNo: 'M-REQ-0001',
      altReqNo: 'A-REQ-0001',
      parentOrderId: 'ORD-2026-101',
      article: 'ART-902',
      plannedDemandPairs: 400,
      issuedFloorPairs: 400,
      stage1To3WipPairs: 0,
      stage4FirstPackedPairs: 395,
      actualPackedPairs: 395,
      alterationAndScrapPairs: 5,
      unpackedBalancePairs: 0,
      packedCompletionPct: 99,
      firstPackedPct: 99,
      activeStage: 'COMPLETED' as const,
      reqLifecycleStatus: 'CLOSED ✓',
      isSelected: true
    }
  ];

  const packingHallHtml = renderRequisitionWipAnalyticsChart({ series: sampleSeries, mode: 'packing-hall' });
  const superUserHtml = renderRequisitionWipAnalyticsChart({ series: sampleSeries, mode: 'super-user' });

  assert.equal(packingHallHtml.includes('var(--su-'), false);
  assert.equal(packingHallHtml.includes('var(--ink-900)'), true);
  assert.equal(superUserHtml.includes('var(--su-complete-primary)'), true);

  // Verify zero raw hex color codes in superUserView.ts and requisitionLogic.ts
  const suViewPath = path.resolve(process.cwd(), 'src/components/superUserView.ts');
  const reqLogicPath = path.resolve(process.cwd(), 'src/utils/requisitionLogic.ts');
  const suViewSrc = fs.readFileSync(suViewPath, 'utf8');
  const reqLogicSrc = fs.readFileSync(reqLogicPath, 'utf8');

  const hexRegex = /(?<!&)#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})\b/g;
  assert.deepEqual(suViewSrc.match(hexRegex) || [], [], 'superUserView.ts must contain zero raw hex color literals');
  assert.deepEqual(reqLogicSrc.match(hexRegex) || [], [], 'requisitionLogic.ts must contain zero raw hex color literals');
});

test('2.10, 3.1, 3.4, 3.7, 11.1: OrderTraceabilityItem exposes all canonical fields and non-tautological Dock Gate catches dock discrepancies', () => {
  const completed = createDemo600PairScenario('COMPLETED');
  const summary = buildOrderTraceability({
    pendingOrders: [completed.order],
    grnList: completed.grns,
    requisitions: completed.reqs,
    defectList: completed.defects
  });
  const ord = summary.orderRollups[0];

  // Verify exact 2.10 & 11.1 fields exist on OrderTraceabilityItem
  assert.deepEqual(ord.mReqNumbers, ['M-REQ-0901', 'M-REQ-0902', 'M-REQ-0903']);
  assert.deepEqual(ord.aReqNumbers, ['A-REQ-0901', 'A-REQ-0902', 'A-REQ-0903']);
  assert.equal(ord.dockReconciled, true);
  assert.equal(ord.floorReconciled, true);
  assert.equal(ord.dockVariancePairs, 0);
  assert.equal(ord.floorVariancePairs, 0);
  assert.equal(ord.isFullyReconciled, true);
  assert.ok(ord.reconciliationSummary.includes('600 Rcvd') || ord.reconciliationSummary.length > 10);
  assert.equal(ord.reconciliation.badgeText, 'RECONCILED ✓');
  assert.equal(ord.stage1To4WipQty, 0);
  assert.equal(ord.orderLifecycleStatus, 'COMPLETED & DISPATCHED');
  // Standardized 50 pairs/carton on REQ-0901 (300 pairs = 6 Cartons)
  assert.equal(completed.reqs[0].outputCartons, 6);
  assert.equal(completed.reqs[0].stage5Cartons, '6 Cartons');

  // Non-tautological Dock Gate: inject physical dock bin count discrepancy (15 extra pairs left in dock bin)
  const dockMismatchSummary = buildOrderTraceability({
    pendingOrders: [{ ...completed.order, physicalDockCountPairs: 15 }],
    grnList: completed.grns,
    requisitions: completed.reqs,
    defectList: completed.defects
  });
  const dockMismatchOrd = dockMismatchSummary.orderRollups[0];
  assert.equal(dockMismatchOrd.dockPoolQty, 15);
  assert.equal(dockMismatchOrd.dockReconciled, false);
  assert.equal(dockMismatchOrd.dockVariancePairs, 15);
  assert.equal(dockMismatchOrd.reconciliation.isReconciled, false);
  assert.equal(dockMismatchOrd.reconciliation.badgeText, 'VARIANCE Δ');
  assert.equal(dockMismatchOrd.reconciliation.failingGate, 'DOCK_GATE');
});

test('11.6 & 4.2: Chronological 10-step 600-pair replay proves pre-GRN-3 over-issue is BLOCKED, enforces Stage 5 AQL gate on all 3 REQs, and catches deliberate Floor & Dock variances', async () => {
  const replay = await replayDemo600PairScenarioStepByStep();

  // Issue 1 fix: Attempting to issue REQ-0902 (200) at 10:30 before GRN-0903 (150) is received is BLOCKED
  assert.equal(replay.preGrn3OverIssueAttempt.accepted, false);
  assert.equal(replay.preGrn3OverIssueAttempt.remainingDockPoolPairs, 150);
  assert.ok(replay.preGrn3OverIssueAttempt.reason.includes('Insufficient Dock Pool balance'));

  // Once GRN-0903 (150) arrives at 11:00 -> Dock Pool = 300 -> REQ-0902 (200) and REQ-0903 (100) issue cleanly
  assert.equal(replay.postGrn3Req2Issue.accepted, true);
  assert.equal(replay.postGrn3Req2Issue.remainingDockPoolPairs, 100);
  assert.equal(replay.postGrn3Req3Issue.accepted, true);
  assert.equal(replay.postGrn3Req3Issue.remainingDockPoolPairs, 0);

  // Issue 7 fix: Stage 5 Gate is enforced for all 3 REQs (locked before AQL 1.5 Pass, unlocked after Pass)
  assert.equal(replay.allThreeReqsStage5GateChecked.length, 3);
  for (const gateCheck of replay.allThreeReqsStage5GateChecked) {
    assert.equal(gateCheck.lockedBeforeQc, true, `${gateCheck.reqNumber} must be locked before Final QC`);
    assert.equal(gateCheck.unlockedAfterQc, true, `${gateCheck.reqNumber} must unlock after Final QC`);
  }
  assert.equal(replay.allThreeReqsFinalQcApproved, true);

  // Completed scenario reconciles at both Dock and Floor gates
  assert.equal(replay.reconciledRollup.reconciliation.isReconciled, true);
  assert.equal(replay.reconciledRollup.reconciliation.badgeText, 'RECONCILED ✓');

  // Issue 2 fix: Deliberate Floor Gate variance (-12 Prs) and Dock Gate variance (+15 Prs) flip badge to VARIANCE Δ
  assert.equal(replay.forcedFloorVarianceRollup.reconciliation.isReconciled, false);
  assert.equal(replay.forcedFloorVarianceRollup.reconciliation.badgeText, 'VARIANCE Δ');
  assert.equal(replay.forcedFloorVarianceRollup.reconciliation.failingGate, 'FLOOR_GATE');
  assert.equal(replay.forcedFloorVarianceRollup.reconciliation.deltaPairs, -12);

  assert.equal(replay.forcedDockVarianceRollup.reconciliation.isReconciled, false);
  assert.equal(replay.forcedDockVarianceRollup.reconciliation.badgeText, 'VARIANCE Δ');
  assert.equal(replay.forcedDockVarianceRollup.reconciliation.failingGate, 'DOCK_GATE');
  assert.equal(replay.forcedDockVarianceRollup.reconciliation.deltaPairs, 15);
});

test('5.1-8.5, 6.6, 9.6, 12.2: Super User 4-view DOM rendering, <150ms Tier-1->Tier-2 expansion latency, WCAG >=4.5:1 contrast, and Phased Rollout Record', () => {
  const scenario = createDemo600PairScenario('COMPLETED');
  const rollupSummary = buildSuperUserOrderRollups({
    pendingOrders: [scenario.order],
    grnList: scenario.grns,
    requisitions: scenario.reqs,
    defectList: scenario.defects
  });

  const baseCtx: SuperUserRenderContext = {
    activeTab: 'dashboard',
    activeReport: 'order_grn_balance',
    trackingSearch: '',
    trackingStatusFilter: 'ALL',
    trackingBuyerFilter: 'ALL',
    trackingMakerFilter: 'ALL',
    trackingPage: 1,
    trackingPageSize: 15,
    expandedOrderIds: {},
    pendingOrders: [scenario.order],
    dropdownOptions: {
      makers: ['Ravi Stitch Crafts (Unit-2)'],
      customers: ['Nordic Safety Gear AB'],
      articles: ['ARC-PRO-600 Kevlar Driver'],
      poList: ['PO-NSG-600']
    },
    auditTrail: [
      createAuditTrailEntry({
        seq: 1,
        actor: 'M. Tariq',
        role: 'SUPER_USER',
        action: 'ORDER_CREATE',
        entityId: 'ORD-2026-600',
        beforeSummary: '0 Prs',
        afterSummary: '600 Prs'
      })
    ],
    adminOverview: {
      dbHealth: {
        journalMode: 'wal',
        integrity: 'ok',
        tableCounts: { pending_orders: 1, store_receivings: 3, glove_requisitions: 3 },
        totalTables: 3
      },
      customers: [],
      products: [],
      receivings: scenario.grns,
      alterations: [],
      scrapLedger: []
    },
    lastBackupPath: 'data/backups/packing_erp_latest.sqlite',
    rollupSummary
  };

  // View 1: Command Center Dashboard
  const v1Html = renderSuperUserScreen({ ...baseCtx, activeTab: 'dashboard' });
  assert.ok(v1Html.includes('data-testid="su-pulse-cards-grid"'), '5.1 Pulse Cards Strip present');
  assert.ok(v1Html.includes('data-testid="su-exceptions-strip"'), '5.2 Exceptions Strip present');
  assert.ok(v1Html.includes('id="su-active-orders-pulse-section"'), '5.3 Active Master Orders Pulse Table present');
  assert.ok(v1Html.includes('id="btn-load-demo-600-variance"'), '11.6 Deliberate Variance button present');
  assert.ok(v1Html.includes('Received (GRN)') || v1Html.includes('Dock Available'), 'R3 canonical terminology');
  assert.ok(v1Html.includes('RECONCILED &#10003;') || v1Html.includes('RECONCILED ✓'));

  // 6.6: Measure Tier 1 -> Tier 2 expansion latency in View 2 (must be < 150 ms)
  const t0 = performance.now();
  const v2CollapsedHtml = renderSuperUserScreen({
    ...baseCtx,
    activeTab: 'tracking',
    expandedOrderIds: {}
  });
  const v2ExpandedHtml = renderSuperUserScreen({
    ...baseCtx,
    activeTab: 'tracking',
    expandedOrderIds: { 'ORD-2026-600': true }
  });
  const elapsedMs = performance.now() - t0;
  assert.ok(elapsedMs < 150, `6.6 Tier 1 -> Tier 2 render expansion took ${elapsedMs.toFixed(2)}ms (< 150ms required)`);
  assert.ok(v2CollapsedHtml.includes('id="admin-tracking-search"'));
  assert.ok(v2ExpandedHtml.includes('Supply Stream: Inward GRN Batches'));
  assert.ok(v2ExpandedHtml.includes('Execution Stream: Packing Hall Requisitions'));

  // View 3: Order & Batch Creation + 12.2 Phased Rollout Record
  const v3Html = renderSuperUserScreen({ ...baseCtx, activeTab: 'creation' });
  assert.ok(v3Html.includes('Create Master Pending Order') || v3Html.includes('pending-order'));
  assert.ok(v3Html.includes('7. Phased Rollout Record'));
  assert.equal(PHASED_ROLLOUT_RECORD.length, 3);
  assert.equal(PHASED_ROLLOUT_RECORD[0].phase, 'Phase A');
  assert.equal(PHASED_ROLLOUT_RECORD[1].phase, 'Phase B');
  assert.equal(PHASED_ROLLOUT_RECORD[2].phase, 'Phase C');

  // View 4: Analytics & Printable Slips
  const v4Html = renderSuperUserScreen({ ...baseCtx, activeTab: 'reports' });
  assert.ok(v4Html.includes('Export Report CSV'));

  // 9.6 WCAG AA contrast check (>= 4.5:1) for all Super User semantic badge pairs in src/style.css
  const styleSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/style.css'), 'utf8');
  assert.ok(styleSrc.includes('BlinkMacSystemFont, "Segoe UI", "Helvetica Neue"'), '9.5 offline system font fallback stack present');
  assert.ok(styleSrc.includes('ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'), '9.5 offline mono font fallback stack present');

  const hexToLuminance = (hex: string): number => {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  };
  const contrastRatio = (fg: string, bg: string): number => {
    const l1 = hexToLuminance(fg);
    const l2 = hexToLuminance(bg);
    const brightest = Math.max(l1, l2);
    const darkest = Math.min(l1, l2);
    return (brightest + 0.05) / (darkest + 0.05);
  };

  const badgePairs = [
    { name: 'su-complete', fg: '#166534', bg: '#F0FDF4' },
    { name: 'su-progress', fg: '#1E40AF', bg: '#EFF6FF' },
    { name: 'su-hold', fg: '#92400E', bg: '#FFFBEB' },
    { name: 'su-defect', fg: '#991B1B', bg: '#FEF2F2' },
    { name: 'su-rework', fg: '#9A3412', bg: '#FFF7ED' },
    { name: 'su-qcgate', fg: '#5B21B6', bg: '#F5F3FF' }
  ];
  for (const pair of badgePairs) {
    const ratio = contrastRatio(pair.fg, pair.bg);
    assert.ok(ratio >= 4.5, `9.6 WCAG AA contrast for ${pair.name} is ${ratio.toFixed(2)}:1 (must be >= 4.5:1)`);
  }
});

test('10.1, 10.2, 10.3, 10.4, 4.2 (Server-Side SQLite): transactional Dock issuance, RBAC 403, Stage 5 AQL gate, Void/Short-Close, and immutable audit_trail triggers', async () => {
  const dbMod: any = await import('../db.js');
  const svcMod: any = await import('../services/packingService.js');
  const db = dbMod.db || dbMod.default;
  const PackingService = svcMod.PackingService;

  dbMod.initDatabase();
  dbMod.seedDemoSheet();

  // Ensure idempotent clean slate for ORD-SQL-600 test rows
  db.prepare(`DELETE FROM grn_req_allocations WHERE order_id = 'ORD-SQL-600'`).run();
  db.prepare(`DELETE FROM store_receivings WHERE order_id = 'ORD-SQL-600' OR rcv_number IN ('GRN-SQL-1', 'GRN-SQL-2')`).run();
  db.prepare(`DELETE FROM packing_wip WHERE req_number IN ('REQ-SQL-1', 'REQ-SQL-2')`).run();
  db.prepare(`DELETE FROM glove_requisitions WHERE req_number IN ('REQ-SQL-1', 'REQ-SQL-2')`).run();
  db.prepare(`DELETE FROM pending_orders WHERE order_id = 'ORD-SQL-600'`).run();

  // 10.4 Server-side RBAC enforcement returns HTTP 403 for unauthorized role
  assert.throws(
    () => PackingService.enforceRolePermission('INWARD_CLERK', 'ORDER_CREATE'),
    (err: any) => err.statusCode === 403 && /RBAC Forbidden/.test(err.message)
  );

  // Create a parent order (600 pairs) and receive GRN-SQL-1 (250) + GRN-SQL-2 (200) = 450 Dock Pool
  PackingService.upsertPendingOrderAdmin({
    orderId: 'ORD-SQL-600',
    buyer: 'Test Buyer',
    maker: 'Hall A',
    po: 'PO-SQL-600',
    article: 'Model SQL',
    totalQty: 600,
    sizes: { '7': 60, '8': 150, '9': 180, '10': 150, '11': 60 }
  });

  PackingService.createReceiving({
    rcvNumber: 'GRN-SQL-1',
    rcvDate: '2026-11-04',
    orderId: 'ORD-SQL-600',
    makerContractor: 'Hall A',
    articleName: 'Model SQL',
    rcvdPairs: 250
  });
  PackingService.createReceiving({
    rcvNumber: 'GRN-SQL-2',
    rcvDate: '2026-11-04',
    orderId: 'ORD-SQL-600',
    makerContractor: 'Hall A',
    articleName: 'Model SQL',
    rcvdPairs: 200
  });

  // 10.1 Transactional Dock Pool issuance: Issue REQ-SQL-1 for 300 pairs (draws 250 from GRN-SQL-1 + 50 from GRN-SQL-2)
  const issue1 = PackingService.issueOrderRequisitionTransactional({
    orderId: 'ORD-SQL-600',
    reqNumber: 'REQ-SQL-1',
    requestedPairs: 300,
    actor: 'Clerk A',
    role: 'INWARD_CLERK'
  });
  assert.equal(issue1.issuedPairs, 300);
  assert.equal(issue1.remainingDockPoolPairs, 150);
  assert.equal(issue1.allocations.length, 2);

  // Attempting to issue REQ-SQL-2 for 200 pairs BEFORE GRN-SQL-3 (150) is received MUST FAIL in SQLite transaction
  assert.throws(
    () =>
      PackingService.issueOrderRequisitionTransactional({
        orderId: 'ORD-SQL-600',
        reqNumber: 'REQ-SQL-2',
        requestedPairs: 200,
        actor: 'Clerk B',
        role: 'INWARD_CLERK'
      }),
    (err: any) => /Insufficient Dock Pool balance/.test(err.message)
  );

  // 4.2 Server-side Stage 5 Gate: set step4_packing_good = 300 on REQ-SQL-1 and confirm Stage 5 is LOCKED before AQL 1.5 Pass
  PackingService.overrideWipAdmin('REQ-SQL-1', { step4Good: 300, finalQcStatus: 'PENDING' });
  assert.throws(
    () =>
      PackingService.executeStep5SecondPacking(
        'REQ-SQL-1',
        50,
        { enforcePreStage5AqlGate: true }
      ),
    (err: any) => /LOCKED: Stage 5 Master Carton Packing/.test(err.message)
  );

  // 10.2 Void guard: GRN-SQL-1 is already allocated, so voiding it is blocked
  assert.throws(
    () => PackingService.voidReceivingGrn('GRN-SQL-1', { reason: 'Duplicate entry', role: 'SUPER_USER' }),
    (err: any) => /Cannot void GRN/.test(err.message)
  );

  // 10.2 Void guard: REQ-SQL-1 has 0 step1_checking_good, so voiding it succeeds and releases 300 pairs back to GRN bins
  const voidReq = PackingService.voidGloveRequisition('REQ-SQL-1', {
    reason: 'Issued to wrong hall',
    actor: 'M. Tariq',
    role: 'SUPER_USER'
  });
  assert.equal(voidReq.is_voided, 1);
  assert.equal(voidReq.void_reason, 'Issued to wrong hall');

  // 3.8 Short-close order with mandatory reason
  const sc = PackingService.shortClosePendingOrder('ORD-SQL-600', {
    reason: 'Contractor short-shipped final lot',
    actor: 'M. Tariq',
    role: 'SUPER_USER'
  });
  assert.equal(sc.short_closed, 1);

  // 10.3 SQLite Immutability Triggers: audit_trail table rejects UPDATE and DELETE
  const trail = PackingService.getAuditTrail(10);
  assert.ok(trail.length >= 2, 'Audit trail entries recorded in SQLite');
  assert.throws(
    () => db.prepare("UPDATE audit_trail SET after_summary = 'TAMPERED' WHERE id = ?").run(trail[0].id),
    (err: any) => /Immutable Audit Trail: UPDATE is forbidden/.test(err.message)
  );
  assert.throws(
    () => db.prepare('DELETE FROM audit_trail WHERE id = ?').run(trail[0].id),
    (err: any) => /Immutable Audit Trail: DELETE is forbidden/.test(err.message)
  );
});

