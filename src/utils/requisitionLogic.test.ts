import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
  isMaterialRequisitionIssuedForStage4,
  isPackingAwaitingFinalQc,
  isStage3ClearedForMaterialReq,
  isStage5ReadyForCartons,
  computeWipRolledYieldPct,
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
  filterProductsByBuyer,
  getScaleSizeCodes,
  formatSizeColumnLabel,
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
  buildConfirmDialogHtml,
  validatePendingOrderInputs,
  validateContractorAllocations,
  computeDeliveryCountdown,
  validateCustomerMasterInputs,
  validateProductMasterInputs,
  validateSystemUserInputs,
  validatePasswordResetInput,
  buildFocusRestoreSelector,
  getDefaultStationForRole,
  createEmptySizes,
  getStartupRequisitionNumber,
  formatCurrentDateDDMMYYYY,
  formatSplitAllocationSummary,
  buildGrnReceiveConfirmationHtml,
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

test('1.2: normalizeSuperUserTab redirects legacy tab IDs to canonical views', () => {
  assert.equal(normalizeSuperUserTab('dashboard'), 'dashboard');
  assert.equal(normalizeSuperUserTab('traceability'), 'tracking');
  assert.equal(normalizeSuperUserTab('ledger'), 'tracking');
  assert.equal(normalizeSuperUserTab('orders'), 'creation');
  assert.equal(normalizeSuperUserTab('admin'), 'creation');
  assert.equal(normalizeSuperUserTab('user-management'), 'users');
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

test('startup restores a saved active requisition even when it matches the default REQ number', () => {
  const persistedReqNumbers = ['REQ-0001', 'REQ-0002'];
  assert.equal(
    getStartupRequisitionNumber('REQ-0001', { plannedQty: 0 }, persistedReqNumbers),
    'REQ-0001'
  );
  assert.equal(
    getStartupRequisitionNumber('REQ-DEFAULT', { plannedQty: 0 }, persistedReqNumbers),
    'REQ-0001'
  );
  assert.equal(
    getStartupRequisitionNumber(
      'REQ-0001',
      { plannedQty: 100, parentOrderId: 'ORD-2026-001' },
      persistedReqNumbers
    ),
    null
  );
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
    po: 'PO-27351',
    article: 'Model A9',
    pairs: 300,
    status: 'Issued'
  });
  assert.ok(mreqHtml.includes('M-REQ-0001'));
  assert.ok(mreqHtml.includes('PO Number:'));
  assert.ok(mreqHtml.includes('PO-27351'));
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

  const stageDefects = computeActualStageWipPairs({
    isIssued: true,
    issuedPairs: 1000,
    stage1In: 1000,
    stage1Passed: 900,
    stage2In: 900,
    stage2Passed: 850,
    stage2Defects: 50,
    stage3In: 850,
    stage3Passed: 800,
    stage3Defects: 50,
    stage4In: 800,
    stage4Passed: 800,
    packedStage5Pairs: 0,
    inAlterationPairs: 200,
    scrappedPairs: 0
  });
  assert.equal(stageDefects.stage2Bucket, 0, 'Stage 2 defects must not be double-counted as floor WIP');
  assert.equal(stageDefects.stage3Bucket, 0, 'Stage 3 defects must not be double-counted as floor WIP');
  assert.equal(stageDefects.actualFloorWipPairs, 800);
  assert.equal(stageDefects.varianceDelta, 0);

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
  assert.equal(canRolePerformAction('INWARD_CLERK', 'ALTERATION_CYCLE_UPDATE'), true);
  assert.equal(canRolePerformAction('INWARD_CLERK', 'SCRAP_CONDEMN'), true);
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
  assert.equal(packingHallHtml.includes('var(--border-default)'), false);
  assert.equal(packingHallHtml.includes('var(--ink-900)'), true);
  assert.equal(superUserHtml.includes('var(--su-complete-primary)'), true);
  assert.equal(superUserHtml.includes('var(--border-default)'), false);

  // Proportional bar height & accessible chart structure test (7,116 vs 887 on shared 140px plot track)
  const mixedScaleChart = renderRequisitionWipAnalyticsChart({
    series: [
      {
        reqNumber: 'REQ-2026-0001',
        parentOrderId: 'ORD-2026-001',
        article: 'Model A1',
        mreqNo: 'M-REQ-2026-0001',
        altReqNo: 'A-REQ-2026-0001',
        plannedDemandPairs: 887,
        issuedFloorPairs: 887,
        stage1To3WipPairs: 0,
        stage4FirstPackedPairs: 820,
        actualPackedPairs: 0,
        alterationAndScrapPairs: 67,
        unpackedBalancePairs: 887,
        packedCompletionPct: 0,
        firstPackedPct: 92,
        activeStage: 'STEP_4',
        reqLifecycleStatus: 'AWAITING QC',
        isSelected: true
      },
      {
        reqNumber: 'REQ-2026-0002',
        parentOrderId: 'ORD-2026-002',
        article: 'Model A2',
        mreqNo: 'M-REQ-2026-0002',
        altReqNo: 'A-REQ-2026-0002',
        plannedDemandPairs: 7116,
        issuedFloorPairs: 0,
        stage1To3WipPairs: 0,
        stage4FirstPackedPairs: 0,
        actualPackedPairs: 0,
        alterationAndScrapPairs: 0,
        unpackedBalancePairs: 7116,
        packedCompletionPct: 0,
        firstPackedPct: 0,
        activeStage: 'STEP_1',
        reqLifecycleStatus: 'PENDING ISSUE',
        isSelected: false
      }
    ],
    activeReqNumber: 'REQ-2026-0001',
    mode: 'packing-hall'
  });

  assert.ok(mixedScaleChart.includes('data-testid="wip-chart-plot"'));
  assert.ok(mixedScaleChart.includes('height: 140px;'));
  assert.ok(mixedScaleChart.includes('data-series="planned" data-value="7116"') && mixedScaleChart.includes('height: 140px;'), 'max value 7116 must fill full 140px plot height');
  assert.match(mixedScaleChart, /data-series="planned" data-value="7116"[^>]*style="[^"]*height:\s*140px/);
  assert.match(mixedScaleChart, /data-series="planned" data-value="887"[^>]*style="[^"]*height:\s*17px/);
  assert.ok(mixedScaleChart.includes('role="img"'), 'bars must declare role="img"');
  assert.ok(mixedScaleChart.includes('<table class="sr-only">'), 'chart must expose a screen-reader data table');

  // Verify zero raw hex color codes in superUserView.ts (+ src/components/superUser/*.ts), requisitionLogic.ts (+ src/utils/requisition/*.ts), and packingHallView.ts
  const suViewPath = path.resolve(process.cwd(), 'src/components/superUserView.ts');
  const suDirPath = path.resolve(process.cwd(), 'src/components/superUser');
  const reqLogicPath = path.resolve(process.cwd(), 'src/utils/requisitionLogic.ts');
  const reqDirPath = path.resolve(process.cwd(), 'src/utils/requisition');
  const packingViewPath = path.resolve(process.cwd(), 'src/components/packingHallView.ts');
  const suModuleFiles = fs.existsSync(suDirPath)
    ? fs.readdirSync(suDirPath).filter(f => f.endsWith('.ts')).map(f => fs.readFileSync(path.join(suDirPath, f), 'utf8'))
    : [];
  const reqModuleFiles = fs.existsSync(reqDirPath)
    ? fs.readdirSync(reqDirPath).filter(f => f.endsWith('.ts')).map(f => fs.readFileSync(path.join(reqDirPath, f), 'utf8'))
    : [];
  const suViewSrc = [fs.readFileSync(suViewPath, 'utf8'), ...suModuleFiles].join('\n');
  const reqLogicSrc = [fs.readFileSync(reqLogicPath, 'utf8'), ...reqModuleFiles].join('\n');
  const packingViewSrc = fs.readFileSync(packingViewPath, 'utf8');

  const hexRegex = /(?<!&)#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})\b/g;
  assert.deepEqual(suViewSrc.match(hexRegex) || [], [], 'superUserView.ts must contain zero raw hex color literals');
  assert.deepEqual(reqLogicSrc.match(hexRegex) || [], [], 'requisitionLogic.ts must contain zero raw hex color literals');
  assert.deepEqual(packingViewSrc.match(hexRegex) || [], [], 'packingHallView.ts must contain zero raw hex color literals');
  assert.equal(packingViewSrc.includes('--su-'), false, 'packingHallView.ts must remain strictly monochrome without --su-* tokens');
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

test('5.1-8.5, 6.6, 9.6, 12.2: Super User 5-view DOM rendering, <150ms Tier-1->Tier-2 expansion latency, WCAG >=4.5:1 contrast, and Phased Rollout Record', () => {
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
  assert.ok(v1Html.includes('aria-label="Super User Navigation"'), 'Super User navigation uses accessible landmark nav');
  assert.ok(!v1Html.includes('role="tab"'), 'Super User sidebar avoids fragile tablist ARIA');
  assert.ok(!v1Html.includes('data-short-label='), 'Collapsed sidebar uses icons instead of single-letter badges');
  assert.ok(v1Html.includes('aria-label="Dashboard" data-admin-tab="dashboard" aria-current="page"'), 'Active nav item exposes aria-current="page"');
  assert.ok(!v1Html.includes('title="Order Creation"'), 'Expanded nav omits redundant title tooltips');
  assert.ok(!v1Html.includes('id="btn-admin-lock"') && !v1Html.includes('Lock Admin Session'), 'Duplicate lock buttons removed');
  const v1CollapsedHtml = renderSuperUserScreen({ ...baseCtx, activeTab: 'dashboard', adminNavCollapsed: true });
  assert.ok(v1CollapsedHtml.includes('aria-label="Dashboard"'), 'Collapsed Super User navigation keeps accessible button names');
  assert.ok(v1CollapsedHtml.includes('title="Order Creation"'), 'Collapsed nav shows title tooltips on hover');
  assert.ok(v1Html.includes('id="btn-load-demo-600-inprogress"'), 'Demo in-progress button present');
  assert.ok(v1Html.includes('id="btn-load-demo-600-complete"'), 'Demo complete button present');
  assert.ok(v1Html.includes('id="btn-load-demo-600-variance"'), '11.6 Deliberate Variance button present');
  assert.ok(v1Html.includes('id="btn-remove-demo-600"'), 'Remove demo button present when demo order loaded');
  assert.match(v1Html, /<details class="su-demo-drawer" open>/, 'Demo drawer opens automatically when demo order is loaded');
  assert.ok(v1Html.includes('class="su-stage-bar-btn"'), 'Dashboard stage bars render semantic buttons when orders exist');
  for (const expectedFilter of ['ALL', 'RECEIVING', 'WIP', 'HOLD_QC', 'COMPLETED']) {
    assert.match(
      v1Html,
      new RegExp(`<button[^>]*class="su-stage-bar-btn"[^>]*data-tracking-filter="${expectedFilter}"`, 's'),
      `Stage bar button includes data-tracking-filter="${expectedFilter}"`
    );
  }
  assert.ok(!v1Html.includes("document.querySelector('[data-admin-tab"), 'Stage bars no longer use inline onclick tab querySelector');
  const emptySummary = buildSuperUserOrderRollups({ pendingOrders: [], grnList: [], requisitions: [], defectList: [] });
  assert.equal(buildRequisitionAnalyticsSeries(emptySummary).length, 1, 'Default buildRequisitionAnalyticsSeries keeps fallback point for Packing Hall');
  assert.equal(buildRequisitionAnalyticsSeries(emptySummary)[0].reqNumber, 'REQ-0001');
  assert.deepEqual(buildRequisitionAnalyticsSeries(emptySummary, undefined, true), [], 'allowEmpty=true returns empty series when no requisitions exist');
  const v2EmptyHtml = renderSuperUserScreen({ ...baseCtx, activeTab: 'tracking', pendingOrders: [], rollupSummary: emptySummary });
  const wipChartStart = v2EmptyHtml.indexOf('data-testid="wip-analytics-dashboard"');
  const wipChartEnd = v2EmptyHtml.indexOf('</section>', wipChartStart);
  const v2EmptyChartHtml = v2EmptyHtml.slice(wipChartStart, wipChartEnd);
  assert.ok(wipChartStart !== -1 && wipChartEnd > wipChartStart, 'WIP analytics panel renders when empty');
  assert.ok(v2EmptyChartHtml.includes('0 Active REQs'), 'Empty Live Tracking shows 0 Active REQs in WIP Analytics');
  assert.ok(v2EmptyChartHtml.includes('No active Packing Hall requisitions yet'), 'Empty Live Tracking renders empty-state message in WIP Analytics');
  assert.ok(!v2EmptyChartHtml.includes('REQ-0001') && !v2EmptyHtml.includes('Awaiting Req') && !v2EmptyHtml.includes('ORD-PENDING'), 'Empty Live Tracking does not fabricate a fake REQ-0001 chart entry');
  assert.ok(v2EmptyHtml.includes('class="form-input su-tracking-search-input"'), 'Widened Live Tracking search input class applied');
  assert.match(v2EmptyHtml, /id="admin-tracking-buyer-filter"[^>]*disabled/s, 'Empty Buyer filter select is disabled');
  assert.ok(v2EmptyHtml.includes('No Buyers yet'), 'Empty Buyer filter displays "No Buyers yet"');
  assert.match(v2EmptyHtml, /id="admin-tracking-maker-filter"[^>]*disabled/s, 'Empty Contractor filter select is disabled');
  assert.ok(v2EmptyHtml.includes('No Contractors yet'), 'Empty Contractor filter displays "No Contractors yet"');
  const v1ClosedDemoHtml = renderSuperUserScreen({ ...baseCtx, activeTab: 'dashboard', pendingOrders: [], rollupSummary: emptySummary, locationSearch: '' });
  assert.match(v1ClosedDemoHtml, /<details class="su-demo-drawer">/, 'Demo drawer is collapsed by default without demo order or ?demo=1');
  assert.ok(v1ClosedDemoHtml.includes('class="su-empty-cta-box"'), 'Dashboard renders empty state box when zero orders exist');
  assert.ok(v1ClosedDemoHtml.includes('data-admin-tab-jump="orders"'), 'Dashboard zero-order empty state includes Order Creation CTA');
  assert.ok(!v1ClosedDemoHtml.includes('class="su-stage-bar-btn"'), 'Dashboard omits stage bar chart when zero orders exist');
  const v1QueryDemoHtml = renderSuperUserScreen({ ...baseCtx, activeTab: 'dashboard', pendingOrders: [], rollupSummary: emptySummary, locationSearch: '?demo=1' });
  assert.match(v1QueryDemoHtml, /<details class="su-demo-drawer" open>/, 'Demo drawer opens when ?demo=1 is present');
  assert.ok(v1QueryDemoHtml.includes('id="btn-load-demo-600-inprogress"') && v1QueryDemoHtml.includes('id="btn-load-demo-600-complete"') && v1QueryDemoHtml.includes('id="btn-load-demo-600-variance"'));
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

  // View 3: Order & Batch Creation + Phased Rollout Record
  const v3Html = renderSuperUserScreen({ ...baseCtx, activeTab: 'creation' });
  assert.ok(v3Html.includes('1. Super User Master Order Creation'));
  assert.ok(v3Html.includes('2. Customer &amp; Buyer Master Registry'));
  assert.ok(v3Html.includes('3. Glove Article &amp; Packaging BOM Master'));
  assert.ok(v3Html.includes('4. Contractors / Makers'));
  assert.ok(v3Html.includes('5. Immutable Audit Trail Ledger'));
  assert.ok(v3Html.includes('6. SQLite WAL Database &amp; Snapshot Administration'));
  assert.match(v3Html, /id="admin-pending-order-id"[^>]*placeholder="Assigned on save"[^>]*readonly/);
  assert.match(v3Html, /id="admin-pending-order-maker"[^>]*required aria-required="true"/);
  assert.match(v3Html, /id="admin-pending-order-article"[^>]*required aria-required="true"/);
  assert.ok(v3Html.includes('class="su-required-mark"'));
  assert.ok(v3Html.includes('Save &amp; Issue Master Order'));
  assert.ok(v3Html.includes('id="btn-admin-reset-pending-order"'));
  assert.ok(v3Html.includes('Reset Form'));
  assert.ok(v3Html.includes('Phased Rollout Record (Phase A'));
  assert.ok(!v3Html.includes('7. Phased Rollout Record'));
  assert.ok(!v3Html.includes('Checklist 12.2'));
  assert.ok(!v3Html.includes('System Users &amp; Role-Based Access Control'));
  assert.equal(PHASED_ROLLOUT_RECORD.length, 3);
  assert.equal(PHASED_ROLLOUT_RECORD[0].phase, 'Phase A');
  assert.equal(PHASED_ROLLOUT_RECORD[1].phase, 'Phase B');
  assert.equal(PHASED_ROLLOUT_RECORD[2].phase, 'Phase C');

  const usersHtml = renderSuperUserScreen({
    ...baseCtx,
    activeTab: 'users',
    systemUsers: [{
      userId: 'USR-TEST-001',
      username: 'operator.test',
      name: 'Test Operator',
      role: 'INWARD_CLERK',
      station: 'Dock #1',
      active: true
    }]
  });
  assert.ok(usersHtml.includes('data-admin-tab="users"'));
  assert.ok(usersHtml.includes('aria-label="New sign-in password for operator.test"'));
  assert.ok(usersHtml.includes('data-admin-reset-password="USR-TEST-001"'));
  assert.ok(usersHtml.includes('<select id="admin-user-station" class="form-select">'));
  assert.ok(usersHtml.includes('<option value="Dock #1">Inward Register (Dock #1)</option>'));
  assert.ok(usersHtml.includes('<option value="Packing Hall #1" selected>Packing Hall</option>'));
  assert.ok(usersHtml.includes('class="su-perm-disclosure"'), 'Users table uses disclosure toggle instead of truncating Authorized Actions');
  assert.equal(getDefaultStationForRole('SUPER_USER'), 'Super User');
  assert.equal(getDefaultStationForRole('INWARD_CLERK'), 'Dock #1');
  assert.equal(getDefaultStationForRole('PACKING_SUPERVISOR'), 'Packing Hall #1');
  assert.equal(getDefaultStationForRole('QC_INSPECTOR'), 'Final QC');
  assert.equal(getDefaultStationForRole('ALTERATION_LEAD'), 'Alteration Bay');
  const unassignedStationHtml = renderSuperUserScreen({
    ...baseCtx,
    activeTab: 'users',
    systemUsers: [{
      userId: 'USR-TEST-002',
      username: 'operator.blank',
      name: 'Blank Station User',
      role: 'QC_INSPECTOR',
      station: '',
      active: true
    }]
  });
  assert.ok(unassignedStationHtml.includes('<td>Unassigned</td>'), 'Blank user station renders Unassigned fallback');

  // View 4: Analytics & Printable Slips
  const v4Html = renderSuperUserScreen({ ...baseCtx, activeTab: 'reports' });
  assert.ok(v4Html.includes('Export Report CSV'));
  assert.ok(v4Html.includes('class="su-report-sheet-wrap"'), 'Report preview uses .su-report-sheet-wrap');
  for (const activeReport of ['order_grn_balance', 'req_traceability', 'contractor_scrap', 'final_qc_dispatch'] as const) {
    const repHtml = renderSuperUserScreen({ ...baseCtx, activeTab: 'reports', activeReport });
    assert.ok(repHtml.includes('<strong>Reconciliation Rule:</strong>'), `${activeReport} shows Reconciliation Rule banner`);
    assert.ok(!repHtml.includes('Acceptance Criteria'), `${activeReport} removes legacy Acceptance Criteria label`);
  }

  // 9.6 WCAG AA contrast check (>= 4.5:1) for all Super User semantic badge pairs in src/style.css (+ src/styles/*.css)
  const stylesDir = path.resolve(process.cwd(), 'src/styles');
  const stylePartialFiles = fs.existsSync(stylesDir)
    ? fs.readdirSync(stylesDir).filter(f => f.endsWith('.css')).map(f => fs.readFileSync(path.join(stylesDir, f), 'utf8'))
    : [];
  const styleSrc = [fs.readFileSync(path.resolve(process.cwd(), 'src/style.css'), 'utf8'), ...stylePartialFiles].join('\n');
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

  const rootMatch = styleSrc.match(/:root\s*\{([^}]*)\}/);
  assert.ok(rootMatch, ':root CSS token block present in src/style.css');
  const suMatch = styleSrc.match(/\.superuser-command-center\s*\{([^}]*)\}/);
  assert.ok(suMatch, '.superuser-command-center token block present in src/style.css');

  const cssVars: Record<string, string> = {};
  for (const block of [rootMatch![1], suMatch![1]]) {
    for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
      cssVars[m[1]] = m[2].trim();
    }
  }
  const resolveToken = (name: string, depth = 0): string => {
    assert.ok(depth < 8, `Circular CSS variable reference for --${name}`);
    const raw = cssVars[name];
    assert.ok(raw, `Expected CSS variable --${name} in src/style.css`);
    const ref = raw.match(/^var\(--([a-z0-9-]+)\)$/i);
    if (ref) return resolveToken(ref[1], depth + 1);
    assert.match(raw, /^#[0-9a-fA-F]{6}$/, `Token --${name} resolves to 6-digit hex (got ${raw})`);
    return raw;
  };

  const badgeTokenPairs = [
    { name: 'su-complete', fg: 'su-complete-dark', bg: 'su-complete-bg' },
    { name: 'su-req', fg: 'su-req-primary', bg: 'su-req-bg' },
    { name: 'su-grn', fg: 'su-grn-deep', bg: 'su-grn-bg' },
    { name: 'su-areq', fg: 'su-areq-dark', bg: 'su-areq-bg' },
    { name: 'su-mreq', fg: 'su-mreq-dark', bg: 'su-mreq-bg' }
  ];
  for (const pair of badgeTokenPairs) {
    const ratio = contrastRatio(resolveToken(pair.fg), resolveToken(pair.bg));
    assert.ok(ratio >= 4.5, `9.6 WCAG AA contrast for ${pair.name} is ${ratio.toFixed(2)}:1 (must be >= 4.5:1)`);
  }
  assert.match(
    styleSrc,
    /\.superuser-command-center\s+\.su-badge-areq,\s*\.superuser-command-center\s+\.su-badge-variance\s*\{[^}]*color:\s*var\(--su-areq-dark\)/s,
    'Alert/variance badges use high-contrast --su-areq-dark text token'
  );

  assert.match(styleSrc, /--text-muted:\s*var\(--ink-600\)/, 'Muted text uses the higher-contrast neutral token');
  assert.match(styleSrc, /--su-text-muted:\s*var\(--ink-600\)/, 'Super User muted text shares the base neutral token');
  const suMutedHex = resolveToken('su-text-muted');
  assert.equal(suMutedHex, resolveToken('ink-600'), '--su-text-muted resolves to --ink-600');
  for (const bgToken of ['su-bg-primary', 'su-bg-secondary', 'su-bg-tertiary']) {
    const bgHex = resolveToken(bgToken);
    const ratio = contrastRatio(suMutedHex, bgHex);
    assert.ok(ratio >= 4.5, `Muted text (--su-text-muted=${suMutedHex}) on --${bgToken}=${bgHex} contrast is ${ratio.toFixed(2)}:1 (>= 4.5:1)`);
  }
  assert.match(
    styleSrc,
    /\.superuser-command-center\s+\.admin-tracking-filter-btn\s*\{[^}]*font-size:\s*12px/s,
    'Tracking filter buttons meet the 12px minimum readable size'
  );
  assert.ok(!v2CollapsedHtml.includes('admin-tracking-filter-btn" data-tracking-filter="ALL" style='), 'Tracking filter buttons avoid inline 11px styling');
  assert.match(styleSrc, /:where\(button, a, \[tabindex\], input, select, textarea\):focus-visible/, 'Interactive controls have a visible keyboard focus style');
  assert.match(styleSrc, /@media \(pointer: coarse\)/, 'Coarse-pointer targets receive larger hit areas');
  assert.match(styleSrc, /@media \(prefers-reduced-motion: reduce\)/, 'Motion respects the reduced-motion preference');
  assert.match(styleSrc, /\.status-pill-amber\s*\{[^}]*border-style:\s*dashed/s, 'Amber status is distinguishable by shape');
  assert.match(styleSrc, /\.status-pill-red\s*\{[^}]*border:\s*2px solid/s, 'Red status is distinguishable by border weight');

  const mainSrc = [
    'src/main.ts',
    'src/utils/domModalsAndPrint.ts',
    'src/components/authView.ts',
    'src/components/inwardRegisterView.ts',
    'src/components/repairAndQcViews.ts'
  ]
    .filter(rel => fs.existsSync(path.resolve(process.cwd(), rel)))
    .map(rel => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8'))
    .join('\n');
  assert.match(mainSrc, /setAttribute\('role', 'status'\)/, 'Toast content is exposed as a status message');
  assert.match(mainSrc, /role="dialog" aria-modal="true"/, 'Modal declares dialog semantics');
  assert.match(mainSrc, /event\.key === 'Escape'/, 'Modal closes from the Escape key');
  assert.match(mainSrc, /modalReturnFocusElement\.focus\(\)/, 'Closing a modal returns focus to its opener');
  assert.match(mainSrc, /class="checklist-box" aria-label=/, 'QC checklist controls have accessible names');
});

test('10.1, 10.2, 10.3, 10.4, 4.2 (Server-Side SQLite): transactional Dock issuance, RBAC 403, Stage 5 AQL gate, Void/Short-Close, and immutable audit_trail triggers', async () => {
  const dbMod: any = await import('../db.js');
  const svcMod: any = await import('../services/packingService.js');
  const db = dbMod.db || dbMod.default;
  const PackingService = svcMod.PackingService;

  dbMod.initDatabase();
  dbMod.seedDemoSheet();
  const fixtureSuffix = randomUUID();
  const grn1 = `GRN-SQL-${fixtureSuffix}-1`;
  const grn2 = `GRN-SQL-${fixtureSuffix}-2`;
  const req1 = `REQ-SQL-${fixtureSuffix}-1`;
  const req2 = `REQ-SQL-${fixtureSuffix}-2`;

  // 10.4 Server-side RBAC enforcement returns HTTP 403 for unauthorized role
  assert.throws(
    () => PackingService.enforceRolePermission('INWARD_CLERK', 'ORDER_CREATE'),
    (err: any) => err.statusCode === 403 && /RBAC Forbidden/.test(err.message)
  );

  // Create a parent order (600 pairs) and receive two GRNs totaling 450 Dock Pool pairs.
  const createdOrder = PackingService.createPendingOrderAdmin({
    buyer: 'Test Buyer',
    maker: 'Hall A',
    po: 'PO-SQL-600',
    article: 'Model SQL',
    totalQty: 600,
    sizes: { '7': 60, '8': 150, '9': 180, '10': 150, '11': 60 }
  });
  const orderId = createdOrder.orderId;

  PackingService.createReceiving({
    rcvNumber: grn1,
    rcvDate: '2026-11-04',
    orderId,
    makerContractor: 'Hall A',
    articleName: 'Model SQL',
    rcvdPairs: 250
  });
  PackingService.createReceiving({
    rcvNumber: grn2,
    rcvDate: '2026-11-04',
    orderId,
    makerContractor: 'Hall A',
    articleName: 'Model SQL',
    rcvdPairs: 200
  });

  // 10.1 Transactional Dock Pool issuance: issue 300 pairs across both GRNs.
  const issue1 = PackingService.issueOrderRequisitionTransactional({
    orderId,
    reqNumber: req1,
    requestedPairs: 300,
    actor: 'Clerk A',
    role: 'INWARD_CLERK'
  });
  assert.equal(issue1.issuedPairs, 300);
  assert.equal(issue1.remainingDockPoolPairs, 150);
  assert.equal(issue1.allocations.length, 2);

  // Attempting to issue another 200 pairs before another GRN arrives MUST FAIL.
  assert.throws(
    () =>
      PackingService.issueOrderRequisitionTransactional({
        orderId,
        reqNumber: req2,
        requestedPairs: 200,
        actor: 'Clerk B',
        role: 'INWARD_CLERK'
      }),
    (err: any) => /Insufficient Dock Pool balance/.test(err.message)
  );

  // 4.2 Server-side Stage 5 Gate: confirm Stage 5 is locked before AQL 1.5 Pass.
  PackingService.overrideWipAdmin(req1, { step4Good: 300, finalQcStatus: 'PENDING' });
  assert.throws(
    () =>
      PackingService.executeStep5SecondPacking(
        req1,
        50,
        { enforcePreStage5AqlGate: true }
      ),
    (err: any) => /LOCKED: Stage 5 Master Carton Packing/.test(err.message)
  );

  // 10.2 Void guard: an allocated GRN cannot be voided.
  assert.throws(
    () => PackingService.voidReceivingGrn(grn1, { reason: 'Duplicate entry', role: 'SUPER_USER' }),
    (err: any) => /Cannot void GRN/.test(err.message)
  );

  // 10.2 Void guard: a not-yet-started requisition can be voided.
  const voidReq = PackingService.voidGloveRequisition(req1, {
    reason: 'Issued to wrong hall',
    actor: 'M. Tariq',
    role: 'SUPER_USER'
  });
  assert.equal(voidReq.is_voided, 1);
  assert.equal(voidReq.void_reason, 'Issued to wrong hall');

  // 3.8 Short-close order with mandatory reason
  const sc = PackingService.shortClosePendingOrder(orderId, {
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

  db.prepare(`DELETE FROM grn_req_allocations WHERE order_id = ?`).run(orderId);
  db.prepare(`DELETE FROM store_receivings WHERE order_id = ? OR rcv_number IN (?, ?)`).run(orderId, grn1, grn2);
  db.prepare(`DELETE FROM packing_wip WHERE req_number IN (?, ?)`).run(req1, req2);
  db.prepare(`DELETE FROM glove_requisitions WHERE req_number IN (?, ?)`).run(req1, req2);
  db.prepare(`DELETE FROM pending_orders WHERE order_id = ?`).run(orderId);
});

test('Final QC readiness & Rolled Throughput Yield helpers handle all edge cases cleanly', () => {
  // Pending > 0 is NOT awaiting Final QC yet
  assert.equal(
    isPackingAwaitingFinalQc({ stage4In: 820, stage4Passed: 400, stage4Pending: 420, finalQcApproved: false, outputPairs: 0 }),
    false
  );
  // 100% Stage 4 done, Final QC unapproved, 0 output -> awaiting Final QC
  assert.equal(
    isPackingAwaitingFinalQc({ stage4In: 820, stage4Passed: 820, stage4Pending: 0, finalQcApproved: false, outputPairs: 0 }),
    true
  );
  // Approved Final QC -> NOT awaiting Final QC, IS ready for Stage 5 cartons
  assert.equal(
    isPackingAwaitingFinalQc({ stage4In: 820, stage4Passed: 820, stage4Pending: 0, finalQcApproved: true, outputPairs: 0 }),
    false
  );
  assert.equal(
    isStage5ReadyForCartons({ stage4In: 820, stage4Passed: 820, stage4Pending: 0, finalQcApproved: true, outputPairs: 0 }),
    true
  );
  // Fully packed Stage 5 -> neither awaiting QC nor waiting for Stage 5
  assert.equal(
    isPackingAwaitingFinalQc({ stage4In: 820, stage4Passed: 820, stage4Pending: 0, finalQcApproved: true, outputPairs: 820 }),
    false
  );
  assert.equal(
    isStage5ReadyForCartons({ stage4In: 820, stage4Passed: 820, stage4Pending: 0, finalQcApproved: true, outputPairs: 820 }),
    false
  );

  // Rolled Throughput Yield (RTY): all zeros -> 0.0%
  assert.equal(computeWipRolledYieldPct({ stage1Passed: 0, stage1Defects: 0, stage2Passed: 0, stage2Defects: 0, stage3Passed: 0, stage3Defects: 0 }), '0.0%');
  // Stage 1 only -> 850 / 887 = 95.8%
  assert.equal(computeWipRolledYieldPct({ stage1Passed: 850, stage1Defects: 37, stage2Passed: 0, stage2Defects: 0, stage3Passed: 0, stage3Defects: 0 }), '95.8%');
  // Hand-verified REQ-2026-0001 across Stages 1-3 -> (850/887)*(840/850)*(820/840) = 92.4%
  assert.equal(
    computeWipRolledYieldPct({
      stage1Passed: 850, stage1Defects: 37,
      stage2Passed: 840, stage2Defects: 10,
      stage3Passed: 820, stage3Defects: 20
    }),
    '92.4%'
  );
  // Perfect yield clamps at 100.0%
  assert.equal(
    computeWipRolledYieldPct({ stage1Passed: 100, stage1Defects: 0, stage2Passed: 100, stage2Defects: 0, stage3Passed: 100, stage3Defects: 0 }),
    '100.0%'
  );
});

test('Monochrome Print Guard: @media print and .printable-slip-box contain zero --su-* tokens or non-monochrome hex colors', () => {
  const cssPath = path.resolve(process.cwd(), 'src/style.css');
  const stylesDir = path.resolve(process.cwd(), 'src/styles');
  const cssPartials = fs.existsSync(stylesDir)
    ? fs.readdirSync(stylesDir).filter(f => f.endsWith('.css')).map(f => fs.readFileSync(path.join(stylesDir, f), 'utf8'))
    : [];
  const css = [fs.readFileSync(cssPath, 'utf8'), ...cssPartials].join('\n');

  function extractBlocks(input: string, header: RegExp): string[] {
    const out: string[] = [];
    const re = new RegExp(header.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(input))) {
      let i = input.indexOf('{', m.index);
      if (i === -1) continue;
      let depth = 1;
      const start = i + 1;
      while (depth && ++i < input.length) {
        depth += input[i] === '{' ? 1 : input[i] === '}' ? -1 : 0;
      }
      out.push(input.slice(start, i));
    }
    return out;
  }

  const blocks = [
    ...extractBlocks(css, /@media\s+print/),
    ...extractBlocks(css, /\.printable-slip-box[^{]*/)
  ];
  assert.ok(blocks.length >= 2, 'Expected @media print and .printable-slip-box blocks in src/style.css');

  const allowedMonochromeHex = new Set(['#000', '#000000', '#fff', '#ffffff']);
  for (const block of blocks) {
    assert.equal(
      /--su-/.test(block),
      false,
      `Print block must not reference --su-* tokens: ${block.slice(0, 120)}`
    );
    const hexes = block.match(/#[0-9A-Fa-f]{3,8}\b/g) || [];
    for (const hex of hexes) {
      assert.ok(
        allowedMonochromeHex.has(hex.toLowerCase()),
        `Non-monochrome hex color ${hex} found inside print block`
      );
    }
  }
});

test('Phase 4.1: Super User view escapes hostile payloads and replaces inline handlers with data-* attributes', () => {
  const xssOrderId = `ORD-X'"><img src=x onerror=alert(1)>`;
  const xssBuyer = `<script>window.__xss=1</script>' onclick="alert(2)`;
  const xssMaker = `Maker" onmouseover="alert(3)<svg onload=alert(4)>`;
  const xssPo = `PO'"><script>alert(5)</script>`;
  const xssArticle = `Art<img src=x onerror=alert(6)>'&"`;
  const xssColor = `<iframe src=javascript:alert(7)>`;
  const xssGrn = `GRN-01'"><svg onload=alert(8)>`;
  const xssSearch = `"><img src=x onerror=alert(9)>`;

  const hostileOrder: PendingOrder = {
    orderId: xssOrderId,
    buyer: xssBuyer,
    maker: xssMaker,
    po: xssPo,
    article: xssArticle,
    color: xssColor,
    sizes: { '7': 100, '8': 0, '9': 0, '10': 0, '11': 0 },
    totalQty: 100
  };
  const hostileGrn = {
    sr: 1,
    grnCode: xssGrn,
    date: '04-11-2026<script>',
    pendingOrderId: xssOrderId,
    maker: xssMaker,
    article: xssArticle,
    rcvdPairs: 100,
    sizes: { '7': 100, '8': 0, '9': 0, '10': 0, '11': 0 },
    status: 'COMPLETE'
  };
  const hostileReq: OrderWipState = {
    reqNumber: 'REQ-0777',
    parentOrderId: xssOrderId,
    allocatedGrnRefs: [{ grnCode: xssGrn, pairs: 100 }],
    article: xssArticle,
    po: xssPo,
    maker: xssMaker,
    buyer: xssBuyer,
    plannedQty: 100,
    issueStatus: 'Issued by Inward Register',
    sizes: { '7': 100, '8': 0, '9': 0, '10': 0, '11': 0 },
    stage1In: 100,
    stage1Passed: 90,
    stage1Defects: 10,
    stage2In: 90,
    stage2Passed: 90,
    stage2Defects: 0,
    stage3In: 90,
    stage3Passed: 90,
    stage3Defects: 0,
    mreqNo: 'M-REQ-0777',
    altReqNo: 'A-REQ-0777',
    mreqQty: '90 Sets',
    mreqStatus: 'Ready',
    stage4In: 90,
    stage4Passed: 90,
    stage4Pending: 0,
    stage5Cartons: '0 Cartons',
    stage5Pending: '2 Cartons',
    lineEfficiency: '90.0%',
    outputPairs: 0,
    outputCartons: 0,
    inAlteration: 10,
    scrappedPairs: 0,
    finalQcApproved: false,
    alterationCycleCount: 1
  };

  const hostileSummary = buildSuperUserOrderRollups({
    pendingOrders: [hostileOrder],
    grnList: [hostileGrn],
    requisitions: [hostileReq],
    defectList: []
  });

  const hostileCtx: SuperUserRenderContext = {
    activeTab: 'dashboard',
    activeReport: 'order_grn_balance',
    trackingSearch: xssSearch,
    trackingStatusFilter: 'ALL',
    trackingBuyerFilter: xssBuyer,
    trackingMakerFilter: xssMaker,
    trackingPage: 1,
    trackingPageSize: 15,
    expandedOrderIds: { [xssOrderId]: true },
    pendingOrders: [hostileOrder],
    dropdownOptions: {
      makers: [xssMaker],
      customers: [xssBuyer],
      articles: [xssArticle],
      poList: [xssPo]
    },
    systemUsers: [
      {
        userId: 'USR-XSS',
        username: `op'"><script>alert(1)</script>`,
        name: `Operator <img src=x onerror=alert(1)>`,
        role: 'INWARD_CLERK',
        station: `Dock "<svg onload=alert(1)>`,
        active: true
      }
    ],
    auditTrail: [
      createAuditTrailEntry({
        seq: 1,
        actor: `Admin <script>alert(1)</script>`,
        role: 'SUPER_USER',
        action: 'ORDER_CREATE',
        entityId: xssOrderId,
        beforeSummary: `<img src=x onerror=alert(1)>`,
        afterSummary: `Done '"><script>alert(1)</script>`
      })
    ],
    adminOverview: {
      dbHealth: {
        journalMode: `wal<script>`,
        integrity: 'ok',
        tableCounts: { 'pending_orders<img src=x>': 1 },
        totalTables: 1
      },
      customers: [
        {
          id: `C-1'"><script>`,
          name: xssBuyer,
          country: `SE"><img src=x>`,
          inspection_preference: `RANDOM<script>`
        }
      ],
      products: [
        {
          id: `P-1'"><svg onload=1>`,
          name: xssArticle,
          customer_id: 'C-1',
          customer_name: xssBuyer,
          polybag_per_pair: 1,
          silica_gel_per_pair: 1,
          stickers_per_pair: 2,
          pairs_per_carton: 50
        }
      ],
      receivings: [],
      alterations: [],
      scrapLedger: []
    },
    lastBackupPath: `/tmp/"><script>alert(1)</script>`,
    highlightedRefCode: xssGrn,
    rollupSummary: hostileSummary
  };

  const views: Array<{ label: string; html: string }> = [
    { label: 'dashboard', html: renderSuperUserScreen({ ...hostileCtx, activeTab: 'dashboard' }) },
    { label: 'tracking', html: renderSuperUserScreen({ ...hostileCtx, activeTab: 'tracking', trackingBuyerFilter: 'ALL', trackingMakerFilter: 'ALL', trackingSearch: '' }) },
    { label: 'tracking-search-input', html: renderSuperUserScreen({ ...hostileCtx, activeTab: 'tracking' }) },
    { label: 'orders', html: renderSuperUserScreen({ ...hostileCtx, activeTab: 'orders' }) },
    { label: 'users', html: renderSuperUserScreen({ ...hostileCtx, activeTab: 'users' }) },
    ...(['order_grn_balance', 'req_traceability', 'contractor_scrap', 'final_qc_dispatch'] as const).map(activeReport => ({
      label: `report-${activeReport}`,
      html: renderSuperUserScreen({ ...hostileCtx, activeTab: 'reports', activeReport })
    }))
  ];

  for (const view of views) {
    assert.doesNotMatch(
      view.html,
      /<script|<img\b|<iframe|<svg[^>]*onload/i,
      `${view.label} must escape hostile HTML tags`
    );

    const tagRegex = /<([a-zA-Z][a-zA-Z0-9:-]*)(\s+(?:[^"'<>]|"[^"]*"|'[^']*')*)?\s*\/?>/g;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = tagRegex.exec(view.html)) !== null) {
      const tagName = tagMatch[1].toLowerCase();
      const attrString = tagMatch[2] || '';
      const attrRegex = /([a-zA-Z_:][a-zA-Z0-9_.:-]*)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;
      let attrMatch: RegExpExecArray | null;
      while ((attrMatch = attrRegex.exec(attrString)) !== null) {
        const attrName = attrMatch[1].toLowerCase();
        assert.ok(
          !attrName.startsWith('on'),
          `${view.label} rendered disallowed event attribute "${attrName}" on <${tagName}>: ${tagMatch[0]}`
        );
      }
    }
  }

  // Also verify with benign data that zero literal "on*=" substrings appear anywhere
  const cleanHtml = renderSuperUserScreen({
    ...hostileCtx,
    activeTab: 'dashboard',
    trackingSearch: '',
    trackingBuyerFilter: 'ALL',
    trackingMakerFilter: 'ALL',
    expandedOrderIds: {},
    pendingOrders: [],
    dropdownOptions: { makers: [], customers: [], articles: [], poList: [] },
    systemUsers: [],
    auditTrail: [],
    lastBackupPath: '',
    highlightedRefCode: undefined,
    rollupSummary: buildSuperUserOrderRollups({ pendingOrders: [], grnList: [], requisitions: [], defectList: [] })
  });
  assert.doesNotMatch(
    cleanHtml,
    /\son(?:click|change|input|submit|error|load|mouseover)\s*=/i,
    'clean rendered HTML must not emit inline event attributes'
  );

  const dashHtml = views[0].html;
  assert.ok(dashHtml.includes('data-su-action="inspect-order"'), 'Uses data-su-action for order inspection');
  assert.ok(dashHtml.includes('&lt;script&gt;window.__xss=1&lt;/script&gt;'), 'Escapes hostile buyer script text');
});

test('Phase 4.2: confirm dialog HTML escapes hostile payloads and form validators enforce inline field rules', () => {
  const html = buildConfirmDialogHtml({
    message: `Delete Master Order ORD-X'"><img src=x onerror=alert(1)>?`,
    detail: `Removes <script>alert(2)</script> permanently.`,
    confirmLabel: 'Delete Order',
    cancelLabel: 'Keep Order',
    tone: 'danger'
  });

  assert.doesNotMatch(html, /<script|<img\b/i, 'Confirm dialog must escape hostile HTML payloads');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'Escapes hostile entity ID in confirm message');
  assert.ok(html.includes('&lt;script&gt;alert(2)&lt;/script&gt;'), 'Escapes hostile detail text');
  assert.ok(html.includes('id="confirm-dialog-cancel"'), 'Includes explicit Cancel button');
  assert.ok(html.includes('data-modal-cancel'), 'Cancel button binds data-modal-cancel');
  assert.ok(html.includes('id="confirm-dialog-confirm"'), 'Includes explicit Confirm button');
  assert.ok(html.includes('btn-danger'), 'Danger tone applies btn-danger class');

  const pwDialogHtml = buildConfirmDialogHtml({
    message: `Delete user <img src=x onerror=alert(1)>?`,
    detail: 'Permanent delete.',
    confirmLabel: 'Delete User',
    cancelLabel: 'Cancel',
    tone: 'danger',
    passwordField: {
      id: 'confirm-admin-password',
      label: 'Admin Password "test"',
      placeholder: 'Enter Admin <password>',
      hint: 'Required to authorize deletion.'
    }
  });
  assert.doesNotMatch(pwDialogHtml, /<img\b/i, 'Password confirm dialog escapes message HTML');
  assert.ok(pwDialogHtml.includes('id="confirm-admin-password"'), 'Renders expected password field ID');
  assert.ok(pwDialogHtml.includes('type="password"'), 'Renders password input type');
  assert.ok(pwDialogHtml.includes('aria-required="true"'), 'Marks admin password input as aria-required');
  assert.ok(pwDialogHtml.includes('Admin Password &quot;test&quot;'), 'Escapes password label');
  assert.ok(pwDialogHtml.includes('Enter Admin &lt;password&gt;'), 'Escapes password placeholder');

  assert.deepEqual(validatePendingOrderInputs({ maker: '', article: '' }), {
    maker: 'Select a Contractor / Maker.',
    article: 'Select an Article.'
  });
  assert.deepEqual(validatePendingOrderInputs({ maker: 'Hall B', article: 'Model A1' }), {});

  assert.deepEqual(validateCustomerMasterInputs({ name: '   ' }), {
    name: 'Enter a customer / buyer name.'
  });
  assert.deepEqual(validateCustomerMasterInputs({ name: 'Alpine Safety' }), {});

  assert.deepEqual(
    validateProductMasterInputs({ name: '', stickersPerPair: 0, pairsPerCarton: 0 }),
    {
      name: 'Enter an article name.',
      stickersPerPair: 'Enter at least 1 sticker per pair.',
      pairsPerCarton: 'Enter at least 1 pair per carton.'
    }
  );
  assert.deepEqual(
    validateProductMasterInputs({ name: 'Model A1', stickersPerPair: 2, pairsPerCarton: 50 }),
    {}
  );

  assert.deepEqual(
    validateSystemUserInputs({ name: '', username: '', password: '123' }),
    {
      name: 'Enter the operator name.',
      username: 'Enter a sign-in username.',
      password: 'Password must be at least 8 characters.'
    }
  );
  assert.deepEqual(
    validateSystemUserInputs({ name: 'H. Malik', username: 'h.malik', password: 'Password1!' }),
    {}
  );

  assert.equal(validatePasswordResetInput('short'), 'Password must be at least 8 characters.');
  assert.equal(validatePasswordResetInput('ValidPass123!'), null);
});

test('Phase 4.3: buildFocusRestoreSelector derives stable escaped selectors for interactive controls across renderApp()', () => {
  assert.equal(
    buildFocusRestoreSelector({ id: 'btn-admin-nav-toggle', dataset: {} }),
    '#btn-admin-nav-toggle'
  );
  assert.equal(
    buildFocusRestoreSelector({ dataset: { adminTab: 'tracking' } }),
    '[data-admin-tab="tracking"]'
  );
  assert.equal(
    buildFocusRestoreSelector({
      dataset: { suAction: 'toggle-order-expand', orderId: `ORD-X'"><img src=x>` }
    }),
    `[data-su-action="toggle-order-expand"][data-order-id="ORD-X'\\"><img src=x>"]`
  );
  assert.equal(
    buildFocusRestoreSelector({
      classList: ['admin-tracking-filter-btn', 'btn-outline'],
      dataset: { trackingFilter: 'COMPLETED' }
    }),
    '.admin-tracking-filter-btn[data-tracking-filter="COMPLETED"]'
  );
  assert.equal(
    buildFocusRestoreSelector({
      dataset: { suAction: 'tracking-page', page: '2' }
    }),
    '[data-su-action="tracking-page"][data-page="2"]'
  );
  assert.equal(
    buildFocusRestoreSelector({
      dataset: { reportId: 'contractor_scrap' }
    }),
    '[data-report-id="contractor_scrap"]'
  );
  assert.equal(
    buildFocusRestoreSelector({
      dataset: { screen: 'screen-admin' }
    }),
    '.module-nav-btn[data-screen="screen-admin"]'
  );
  assert.equal(buildFocusRestoreSelector({ dataset: {} }), null);
});

test('Phase 4.4: Customer Master and Article/BOM Master forms use responsive CSS grid classes instead of hardcoded inline column ratios', () => {
  const stylesDir = path.join(process.cwd(), 'src', 'styles');
  const stylePartials = fs.existsSync(stylesDir)
    ? fs.readdirSync(stylesDir).filter(f => f.endsWith('.css')).map(f => fs.readFileSync(path.join(stylesDir, f), 'utf8'))
    : [];
  const styleCss = [fs.readFileSync(path.join(process.cwd(), 'src', 'style.css'), 'utf8'), ...stylePartials].join('\n');
  assert.match(styleCss, /\.su-customer-form-grid[\s\S]*grid-template-columns:/);
  assert.match(styleCss, /\.su-article-form-grid[\s\S]*grid-template-columns:/);

  const html = renderSuperUserScreen({
    activeTab: 'orders',
    activeReport: 'order_grn_balance',
    trackingSearch: '',
    trackingStatusFilter: 'ALL',
    expandedOrderIds: {},
    pendingOrders: [],
    dropdownOptions: { makers: ['Hall B'], customers: ['Northwind Safety Ltd'], articles: ['Model A1'], poList: [] },
    systemUsers: [],
    auditTrail: [],
    adminOverview: {
      dbHealth: { journalMode: 'wal', integrity: 'ok', tableCounts: {}, totalTables: 0 },
      customers: [{ id: 'CUST-1', name: 'Northwind Safety Ltd', country: 'UK', inspection_preference: 'RANDOM' }],
      products: [{ id: 'PROD-1', name: 'Model A1', customer_id: 'CUST-1', customer_name: 'Northwind Safety Ltd', polybag_per_pair: 1, silica_gel_per_pair: 1, stickers_per_pair: 2, pairs_per_carton: 50 }],
      receivings: [],
      alterations: [],
      scrapLedger: []
    },
    lastBackupPath: '',
    rollupSummary: buildSuperUserOrderRollups({ pendingOrders: [], grnList: [], requisitions: [], defectList: [] })
  });

  assert.ok(html.includes('class="su-customer-form-grid"'), 'Customer Master form uses .su-customer-form-grid');
  assert.ok(html.includes('class="su-article-form-grid"'), 'Article & BOM Master form uses .su-article-form-grid');
  assert.doesNotMatch(
    html,
    /grid-template-columns:\s*(?:1\.1fr|1\.2fr)/,
    'Master forms must not use brittle fixed inline fr track lists'
  );
});

test('Multi-contractor order split validation & per-contractor rollup tracking', () => {
  const orderSizes = { '7': 40, '8': 50, '9': 60, '10': 30, '11': 20 };

  const valid = validateContractorAllocations(orderSizes, [
    { maker: 'Hall A', sizes: { '7': 25, '8': 30, '9': 40, '10': 15, '11': 10 } },
    { maker: 'Hall B', sizes: { '7': 15, '8': 20, '9': 20, '10': 15, '11': 10 } }
  ]);
  assert.equal(valid.valid, true);
  assert.equal(valid.totalUnassigned, 0);

  const dup = validateContractorAllocations(orderSizes, [
    { maker: 'Hall A', sizes: { '7': 20, '8': 25, '9': 30, '10': 15, '11': 10 } },
    { maker: 'hall a', sizes: { '7': 20, '8': 25, '9': 30, '10': 15, '11': 10 } }
  ]);
  assert.equal(dup.valid, false);
  assert.match(dup.error || '', /Duplicate contractor/);

  const mismatch = validateContractorAllocations(orderSizes, [
    { maker: 'Hall A', sizes: { '7': 20, '8': 30, '9': 40, '10': 15, '11': 10 } },
    { maker: 'Hall B', sizes: { '7': 15, '8': 20, '9': 20, '10': 15, '11': 10 } }
  ]);
  assert.equal(mismatch.valid, false);
  assert.equal(mismatch.unassignedBySize['7'], 5);
  assert.equal(mismatch.totalUnassigned, 5);

  const rollupSummary = buildOrderTraceability({
    pendingOrders: [{
      orderId: 'ORD-SPLIT-1',
      buyer: 'Globex Supply Co.',
      maker: 'Hall A, Hall B',
      po: 'PO-SPLIT-1',
      article: 'Model A1',
      sizes: orderSizes,
      totalQty: 200,
      contractorAllocations: [
        { maker: 'Hall A', sizes: { '7': 25, '8': 30, '9': 40, '10': 15, '11': 10 }, totalQty: 120 },
        { maker: 'Hall B', sizes: { '7': 15, '8': 20, '9': 20, '10': 15, '11': 10 }, totalQty: 80 }
      ]
    }],
    grnList: [
      { sr: 1, grnCode: 'RCV-2026-9001', date: '2026-11-16', pendingOrderId: 'ORD-SPLIT-1', maker: 'Hall A', article: 'Model A1', rcvdPairs: 90, sizes: { '7': 25, '8': 30, '9': 35, '10': 0, '11': 0 } },
      { sr: 2, grnCode: 'RCV-2026-9002', date: '2026-11-16', pendingOrderId: 'ORD-SPLIT-1', maker: 'Hall B', article: 'Model A1', rcvdPairs: 80, sizes: { '7': 15, '8': 20, '9': 20, '10': 15, '11': 10 } }
    ],
    requisitions: [],
    defectList: []
  });

  const ord = rollupSummary.orderRollups[0];
  assert.equal(ord.contractorAllocations?.length, 2);
  assert.equal(ord.contractorAllocations?.[0].receivedPairs, 90);
  assert.equal(ord.contractorAllocations?.[0].remainingPairs, 30);
  assert.equal(ord.contractorAllocations?.[1].receivedPairs, 80);
  assert.equal(ord.contractorAllocations?.[1].remainingPairs, 0);
});

test('Delivery countdown handles NO_DATE, OVERDUE, Due Today, DUE_SOON, ON_TRACK, and DELIVERED', () => {
  assert.equal(computeDeliveryCountdown({ dueDate: '', nowIso: '2026-11-16' }).status, 'NO_DATE');
  assert.equal(computeDeliveryCountdown({ dueDate: '2026-11-12', nowIso: '2026-11-16' }).badgeText, 'Overdue by 4d');
  assert.equal(computeDeliveryCountdown({ dueDate: '2026-11-12', nowIso: '2026-11-16' }).status, 'OVERDUE');
  assert.equal(computeDeliveryCountdown({ dueDate: '2026-11-16', nowIso: '2026-11-16' }).badgeText, 'Due Today');
  assert.equal(computeDeliveryCountdown({ dueDate: '2026-11-20', nowIso: '2026-11-16' }).status, 'DUE_SOON');
  assert.equal(computeDeliveryCountdown({ dueDate: '2026-11-20', nowIso: '2026-11-16' }).badgeText, '4d left');
  assert.equal(computeDeliveryCountdown({ dueDate: '2026-11-30', createdAt: '2026-11-01', nowIso: '2026-11-16' }).status, 'ON_TRACK');
  assert.equal(computeDeliveryCountdown({ dueDate: '2026-11-30', createdAt: '2026-11-01', nowIso: '2026-11-16' }).badgeText, '14d left');
  assert.equal(computeDeliveryCountdown({ dueDate: '2026-11-10', isCompleted: true, nowIso: '2026-11-16' }).status, 'DELIVERED');
});

test('Material Requisition and Stage 4 unlock only stage-by-stage after Stage 3 Pair Matching is cleared', () => {
  // Pending / Stage 1 in progress: Material Requisition locked
  assert.equal(
    isStage3ClearedForMaterialReq({ stage1In: 100, stage1Passed: 0, stage2In: 0, stage2Passed: 0, stage3In: 0, stage3Passed: 0 }),
    false
  );
  // Stage 1 done, Stage 2 still has pending pairs: Material Requisition locked
  assert.equal(
    isStage3ClearedForMaterialReq({ stage1In: 100, stage1Passed: 100, stage2In: 100, stage2Passed: 60, stage3In: 60, stage3Passed: 60 }),
    false
  );
  // Partial Stage 3 matching (remaining in Stage 3): Material Requisition locked
  assert.equal(
    isStage3ClearedForMaterialReq({ stage1In: 100, stage1Passed: 100, stage2In: 100, stage2Passed: 100, stage3In: 100, stage3Passed: 80, stage3Defects: 0 }),
    false
  );
  // Stage 1, Stage 2, and Stage 3 all cleared with matched pairs > 0: Material Requisition unlocks, Stage 4 stays locked until issued
  const unlockedForMatReq = {
    stage1In: 100,
    stage1Passed: 100,
    stage2In: 100,
    stage2Passed: 95,
    stage2Defects: 5,
    stage3In: 95,
    stage3Passed: 95,
    stage3Defects: 0,
    mreqStatus: 'Ready'
  };
  assert.equal(isStage3ClearedForMaterialReq(unlockedForMatReq), true);
  assert.equal(isMaterialRequisitionIssuedForStage4(unlockedForMatReq), false);

  // Once Material Requisition is issued/printed, Stage 4 unlocks
  assert.equal(
    isMaterialRequisitionIssuedForStage4({ ...unlockedForMatReq, mreqStatus: 'ISSUED' }),
    true
  );
  assert.equal(
    isMaterialRequisitionIssuedForStage4({ ...unlockedForMatReq, mreqStatus: 'Printed' }),
    true
  );
});

test('Slice 2: Dynamic sizing helpers and Buyer -> Article -> Color -> Sizes Order Creation cascade', () => {
  assert.equal(calculateSizeTotal({ XS: 60, S: 120, M: 240, L: 300, XL: 180, '2XL': 80 }), 980);
  assert.deepEqual(createEmptySizes(['2XS', 'XS', 'S']), { '2XS': 0, XS: 0, S: 0 });
  assert.equal(formatSizeColumnLabel('7', 'LEGACY_7_11'), '7 / S');
  assert.equal(formatSizeColumnLabel('XS', 'GENRAL'), 'XS');

  const sizeStandards = [
    { code: 'LEGACY_7_11', rawLabel: 'LEGACY_7_11', sizes: ['7', '8', '9', '10', '11'], isLegacy: true },
    { code: 'GENRAL', rawLabel: 'GENRAL', sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'], isLegacy: false },
    { code: 'IXS MEN', rawLabel: 'IXS MEN', sizes: ['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'], isLegacy: false }
  ];
  assert.deepEqual(getScaleSizeCodes(sizeStandards, 'IXS MEN'), ['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL']);

  const customers = [
    { id: 'BUY-0004', name: 'BERIK' },
    { id: 'BUY-0020', name: 'OXFORD' }
  ];
  const products = [
    { id: 'CAT-0040', name: 'G-175102-BK 132 RED', customer_id: 'BUY-0004', customer_name: 'BERIK', article_code: 'Zoldar', color_spec: 'Black,Red,White', size_format: 'IXS MEN' },
    { id: 'CAT-0450', name: 'BRISBANE AIR MS TECH GREY/BLACK', customer_id: 'BUY-0020', customer_name: 'OXFORD', article_code: '', color_spec: 'GREY,Black', size_format: 'GENRAL' }
  ];
  const oxfordArticles = filterProductsByBuyer(products, customers, 'OXFORD');
  assert.equal(oxfordArticles.length, 1);
  assert.equal(oxfordArticles[0].name, 'BRISBANE AIR MS TECH GREY/BLACK');

  const splitCheck = validateContractorAllocations(
    { '2XS': 10, XS: 20, S: 0, M: 0, L: 0, XL: 0, '2XL': 0, '3XL': 0, '4XL': 0, '5XL': 0 },
    [
      { maker: 'Hall A', sizes: { '2XS': 6, XS: 10 } },
      { maker: 'Hall B', sizes: { '2XS': 4, XS: 10 } }
    ],
    ['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL']
  );
  assert.equal(splitCheck.valid, true);
  assert.equal(splitCheck.totalUnassigned, 0);

  const cascadeHtml = renderSuperUserScreen({
    activeTab: 'creation',
    activeReport: 'order_grn_balance',
    trackingSearch: '',
    trackingStatusFilter: 'ALL',
    expandedOrderIds: {},
    pendingOrders: [{
      orderId: 'ORD-2026-999',
      buyer: 'BERIK',
      maker: 'Hall A',
      po: 'PO-999',
      article: 'G-175102-BK 132 RED',
      color: 'Black,Red,White',
      sizeFormat: 'IXS MEN',
      sizeCodes: ['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'],
      sizes: { '2XS': 10, XS: 20, S: 0, M: 0, L: 0, XL: 0, '2XL': 0, '3XL': 0, '4XL': 0, '5XL': 0 },
      totalQty: 30
    }],
    dropdownOptions: { makers: ['Hall A'], customers: ['BERIK', 'OXFORD'], articles: products.map(p => p.name), poList: [] },
    adminOverview: {
      dbHealth: { journalMode: 'wal', integrity: 'ok', tableCounts: {}, totalTables: 0 },
      customers,
      products,
      sizeStandards,
      receivings: [],
      alterations: [],
      scrapLedger: []
    },
    lastBackupPath: '',
    rollupSummary: buildSuperUserOrderRollups({ pendingOrders: [], grnList: [], requisitions: [], defectList: [] }),
    orderDraft: {
      buyer: 'BERIK',
      maker: 'Hall A',
      po: '',
      article: 'G-175102-BK 132 RED',
      color: 'Black,Red,White',
      sizeFormat: 'IXS MEN',
      dueDate: '',
      sizes: { '2XS': 10, XS: 20 }
    }
  });

  const articleSelectMatch = cascadeHtml.match(/<select id="admin-pending-order-article"[\s\S]*?<\/select>/);
  assert.ok(articleSelectMatch, 'Renders #admin-pending-order-article select element');
  const articleSelectHtml = articleSelectMatch[0];
  assert.ok(articleSelectHtml.includes('G-175102-BK 132 RED'), 'Selected buyer BERIK renders its article');
  assert.ok(!articleSelectHtml.includes('BRISBANE AIR MS TECH GREY/BLACK'), 'Selecting BERIK excludes OXFORD articles from #admin-pending-order-article');
  assert.ok(cascadeHtml.includes('Scale: IXS MEN, 10 Sizes'), 'Displays active IXS MEN scale header');
  assert.ok(cascadeHtml.includes('Catalog colorway: Black,Red,White'), 'Displays combined catalog colorway caption');
  assert.ok(cascadeHtml.includes('data-size="2XS"'), 'Renders 2XS input for IXS MEN');
  assert.ok(cascadeHtml.includes('data-size="5XL"'), 'Renders 5XL input for IXS MEN');
  assert.ok(!cascadeHtml.includes('data-size="7"'), 'Does not render legacy size 7 for IXS MEN');
});

test('Slice 3: Dynamic multi-scale rollups, monochrome GRN/REQ slips, and WIP analytics preserve catalog sizes', () => {
  const ixsCodes = ['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
  const ixsSizes = { '2XS': 10, XS: 20, S: 0, M: 30, L: 0, XL: 0, '2XL': 0, '3XL': 0, '4XL': 0, '5XL': 0 };

  // scaleSizeBreakdown preserves non-legacy keys cleanly without leaking 7..11
  const scaled = scaleSizeBreakdown(ixsSizes, 30);
  assert.equal(calculateSizeTotal(scaled), 30);
  assert.equal(scaled['2XS'], 5);
  assert.equal(scaled.XS, 10);
  assert.equal(scaled.M, 15);
  assert.equal(scaled['7'], undefined);

  // Printable GRN & REQ slips render all 10 IXS MEN columns dynamically in monochrome (zero Buyer leakage)
  const grnSlip = buildGrnReceivingSlipHtml({
    grnRef: 'GRN-2026-0099',
    pendingOrderId: 'ORD-2026-099',
    date: '31-10-2026',
    maker: 'Hall A',
    article: 'G-175102-BK 132 RED',
    color: 'Black,Red,White',
    receivedFrom: 'Hall A Carrier',
    rcvdPairs: 60,
    sizes: ixsSizes,
    sizeFormat: 'IXS MEN',
    sizeCodes: ixsCodes
  });
  assert.ok(grnSlip.includes('>2XS<'), 'GRN slip renders IXS MEN 2XS column');
  assert.ok(grnSlip.includes('>5XL<'), 'GRN slip renders IXS MEN 5XL column');
  assert.ok(grnSlip.includes('30 Prs'), 'GRN slip renders 30 Prs for M');
  assert.ok(!grnSlip.includes('7 / S'), 'GRN slip does not hardcode legacy 7 / S for IXS MEN');
  assert.ok(!grnSlip.includes('BERIK'), 'GRN shop-floor slip hides buyer name');

  const reqSlip = buildPackingRequisitionSlipHtml({
    reqNo: 'REQ-0099',
    date: '31-10-2026',
    article: 'G-175102-BK 132 RED',
    sizes: ixsSizes,
    totalPairs: 60,
    issueStatus: 'Issued by Inward Register',
    sizeFormat: 'IXS MEN',
    sizeCodes: ixsCodes
  });
  assert.ok(reqSlip.includes('>2XS<'), 'REQ slip renders IXS MEN 2XS column');
  assert.ok(reqSlip.includes('>5XL<'), 'REQ slip renders IXS MEN 5XL column');
  assert.ok(!reqSlip.includes('7 / S'), 'REQ shop-floor slip does not hardcode legacy 7 / S for IXS MEN');

  // Rollup & WIP analytics chart render non-legacy scales
  const rollup = buildSuperUserOrderRollups({
    pendingOrders: [{
      orderId: 'ORD-2026-099',
      buyer: 'BERIK',
      maker: 'Hall A',
      po: 'PO-IXS',
      article: 'G-175102-BK 132 RED',
      color: 'Black,Red,White',
      sizeFormat: 'IXS MEN',
      sizeCodes: ixsCodes,
      sizes: ixsSizes,
      totalQty: 60
    }],
    grnList: [{
      sr: 1,
      grnCode: 'GRN-0099',
      date: '31-10-2026',
      pendingOrderId: 'ORD-2026-099',
      maker: 'Hall A',
      article: 'G-175102-BK 132 RED',
      rcvdPairs: 60,
      sizes: ixsSizes,
      status: 'Received'
    }],
    requisitions: [{
      reqNumber: 'REQ-0099',
      parentOrderId: 'ORD-2026-099',
      article: 'G-175102-BK 132 RED',
      plannedQty: 60,
      issueStatus: 'Issued by Inward Register',
      sizeFormat: 'IXS MEN',
      sizeCodes: ixsCodes,
      sizes: ixsSizes,
      stage1In: 60,
      stage1Passed: 60,
      stage1Defects: 0,
      stage2In: 60,
      stage2Passed: 60,
      stage2Defects: 0,
      stage3In: 60,
      stage3Passed: 60,
      stage3Defects: 0,
      mreqNo: 'M-REQ-0099',
      altReqNo: 'A-REQ-0099',
      mreqQty: '60 Sets',
      mreqStatus: 'ISSUED',
      stage4In: 60,
      stage4Passed: 60,
      stage4Pending: 0,
      stage5Cartons: '2 Cartons (60 Prs)',
      stage5Pending: '0 Cartons',
      lineEfficiency: '100.0%',
      outputPairs: 60,
      outputCartons: 2,
      inAlteration: 0,
      finalQcApproved: true
    }],
    defectList: []
  });
  assert.equal(rollup.orderRollups[0].sizeFormat, 'IXS MEN');
  assert.equal(rollup.orderRollups[0].packedSizes.M, 30);
  assert.equal(rollup.orderRollups[0].packedSizes['7'], undefined);

  const suTrackingHtml = renderSuperUserScreen({
    activeTab: 'tracking',
    activeReport: 'order_grn_balance',
    trackingSearch: '',
    trackingStatusFilter: 'ALL',
    expandedOrderIds: { 'ORD-2026-099': true },
    pendingOrders: [],
    dropdownOptions: { makers: ['Hall A'], customers: ['BERIK'], articles: [], poList: [] },
    adminOverview: {
      dbHealth: { journalMode: 'wal', integrity: 'ok', tableCounts: {}, totalTables: 0 },
      customers: [],
      products: [],
      sizeStandards: [],
      receivings: [],
      alterations: [],
      scrapLedger: []
    },
    lastBackupPath: '',
    rollupSummary: rollup
  });
  assert.ok(suTrackingHtml.includes('2XS:10'), 'Live tracking displays dynamic Planned Sizes for IXS MEN');
  assert.ok(!suTrackingHtml.includes('7:0 | 8:0 | 9:0 | 10:0 | 11:0'), 'Live tracking hides legacy 7..11 for IXS MEN');
});

test('Receiving Hall fixes: live DD-MM-YYYY date, Option B split confirmation popup & slip split summary', () => {
  const fixedNow = new Date(2026, 10, 18, 9, 30, 0); // 18-11-2026 local
  assert.equal(formatCurrentDateDDMMYYYY(fixedNow), '18-11-2026');

  const splitSummary = formatSplitAllocationSummary([
    { maker: 'Hall A', sizes: { '7': 60 }, totalQty: 60 },
    { maker: 'Hall B', sizes: { '8': 40 }, totalQty: 40 }
  ]);
  assert.equal(splitSummary, 'Hall A (60 Prs), Hall B (40 Prs)');
  assert.equal(formatSplitAllocationSummary([{ maker: 'Hall A', sizes: { '7': 60 }, totalQty: 60 }]), '');

  const confirmHtml = buildGrnReceiveConfirmationHtml({
    pendingOrderId: 'ORD-2026-105',
    date: '18-11-2026',
    splitSummary,
    batches: [
      {
        grnRef: 'GRN-2026-0010',
        date: '18-11-2026',
        pendingOrderId: 'ORD-2026-105',
        maker: 'Hall A',
        article: 'Model A1',
        color: 'Black',
        receivedFrom: 'Tariq Carrier',
        rcvdPairs: 30,
        sizes: { '7': 30, '8': 0, '9': 0, '10': 0, '11': 0 }
      },
      {
        grnRef: 'GRN-2026-0011',
        date: '18-11-2026',
        pendingOrderId: 'ORD-2026-105',
        maker: 'Hall B',
        article: 'Model A1',
        color: 'Black',
        receivedFrom: 'Imran Carrier',
        rcvdPairs: 20,
        sizes: { '7': 0, '8': 20, '9': 0, '10': 0, '11': 0 }
      }
    ]
  });
  assert.ok(confirmHtml.includes('data-testid="grn-receive-confirmation"'), 'Renders receive confirmation summary card');
  assert.ok(confirmHtml.includes('50 Pairs'), 'Shows combined total pairs received');
  assert.ok(confirmHtml.includes('Tariq Carrier'), 'Shows first received-from carrier');
  assert.ok(confirmHtml.includes('Imran Carrier'), 'Shows second received-from carrier');
  assert.ok(confirmHtml.includes('Hall A (60 Prs), Hall B (40 Prs)'), 'Displays all contractors order is split among');
  assert.ok(confirmHtml.includes('18-11-2026'), 'Shows saved date instead of hardcoded 31-10-2026');
  assert.ok(confirmHtml.includes('id="doc-preview-container"'), 'Wraps printable slip(s) inside #doc-preview-container for modal Print button');
});
