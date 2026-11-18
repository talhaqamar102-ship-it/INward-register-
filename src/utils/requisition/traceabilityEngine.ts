import {
  SizeBreakdown,
  formatCurrentDateDDMMYYYY,
  STANDARD_GLOVE_SIZES,
  computeDeliveryCountdown,
  ContractorOrderAllocation,
  PendingOrder,
  createEmptySizes,
  normalizeBaseReqNumber,
  getMaterialReqNumber,
  getAlterationReqNumber,
  calculateSizeTotal,
  scaleSizeBreakdown
} from './sizingAndCatalog';
import {
  OrderWipState,
  formatBatchSequence,
  isReqAwaitingFinalQc,
  canExecuteStage5CartonPacking,
  determineOrderActiveStage,
  ReconciliationResult,
  SuperUserGrnBatchItem,
  ReqLifecycleStatus,
  SuperUserReqBatchItem,
  OrderLifecycleStatus,
  OrderTraceabilityItem,
  SuperUserOrderRollup,
  SuperUserDashboardSummary,
  computeActualStageWipPairs,
  evaluateReqReconciliation,
  evaluateOrderReconciliation,
  allocateGrnsToRequisitions
} from './wipStageGates';

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
      date: g.date || formatCurrentDateDDMMYYYY(),
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
      date: g.date || formatCurrentDateDDMMYYYY(),
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
        stage2Defects: r.stage2Defects,
        stage3In: r.stage3In,
        stage3Passed: r.stage3Passed,
        stage3Defects: r.stage3Defects,
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

    const activeOrderSizes = ord.sizeCodes && ord.sizeCodes.length > 0 ? ord.sizeCodes : STANDARD_GLOVE_SIZES;
    const orderPackedSizes = createEmptySizes(activeOrderSizes);
    for (const rb of reqBatches) {
      for (const sz of activeOrderSizes) {
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

    const rawAllocations: ContractorOrderAllocation[] =
      ord.contractorAllocations && ord.contractorAllocations.length > 0
        ? ord.contractorAllocations
        : [
            {
              maker: ord.maker,
              sizes: plannedSizes,
              totalQty: plannedQty,
              dueDate: ord.dueDate || ''
            }
          ];
    const contractorAllocations: ContractorOrderAllocation[] = rawAllocations.map(alloc => {
      const allocMaker = String(alloc.maker || '').trim();
      const allocSizes = alloc.sizes || createEmptySizes(activeOrderSizes);
      const allocTotal = Math.max(Number(alloc.totalQty || 0), calculateSizeTotal(allocSizes));
      const makerGrns = rawGrnBatches.filter(
        g =>
          rawAllocations.length === 1 ||
          String(g.maker || '').trim().toLowerCase() === allocMaker.toLowerCase()
      );
      const allocRcvdPairs = makerGrns.reduce((sum, g) => sum + Number(g.rcvdPairs || 0), 0);
      const allocRcvdSizes = createEmptySizes(activeOrderSizes);
      for (const mg of makerGrns) {
        for (const sz of activeOrderSizes) {
          allocRcvdSizes[sz] += Number(mg.sizes?.[sz] || 0);
        }
      }
      const allocRemSizes = createEmptySizes(activeOrderSizes);
      for (const sz of activeOrderSizes) {
        allocRemSizes[sz] = ord.shortClosed ? 0 : Math.max(0, Number(allocSizes[sz] || 0) - allocRcvdSizes[sz]);
      }
      return {
        maker: allocMaker,
        sizes: allocSizes,
        totalQty: allocTotal,
        dueDate: alloc.dueDate || ord.dueDate || '',
        receivedPairs: allocRcvdPairs,
        receivedSizes: allocRcvdSizes,
        remainingPairs: ord.shortClosed ? 0 : Math.max(0, allocTotal - allocRcvdPairs),
        remainingSizes: allocRemSizes
      };
    });

    orderRollups.push({
      orderId: ord.orderId,
      buyer: ord.buyer || 'Standard Client',
      maker: ord.maker || '---',
      po: ord.po || '---',
      article: ord.article || '---',
      color: ord.color || 'Standard',
      sizeFormat: ord.sizeFormat || 'LEGACY_7_11',
      sizeCodes: [...activeOrderSizes],
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
      dueDate: ord.dueDate || '',
      createdAt: ord.createdAt || '',
      deliveryCountdown: computeDeliveryCountdown({
        dueDate: ord.dueDate,
        createdAt: ord.createdAt,
        isCompleted: orderStatus === 'COMPLETED & DISPATCHED' || Boolean(ord.shortClosed)
      }),
      contractorAllocations,
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
    stage2Defects: next.stage2Defects,
    stage3In: next.stage3In,
    stage3Passed: next.stage3Passed,
    stage3Defects: next.stage3Defects,
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
