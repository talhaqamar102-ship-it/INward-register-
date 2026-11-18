import {
  SizeBreakdown,
  formatSizeColumnLabel,
  resolveScaleKeysForBreakdown,
  inferSizeFormatFromCodes,
  escapeHtml,
  normalizeBaseReqNumber,
  getMaterialReqNumber,
  getAlterationReqNumber,
  calculateSizeTotal
} from './sizingAndCatalog';
import {
  WipStage,
  SuperUserReqBatchItem,
  SuperUserDashboardSummary
} from './wipStageGates';

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
  selectedReqNumber?: string,
  allowEmpty: boolean = false
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
    if (allowEmpty) return [];
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
  activeSizeFormat?: string;
  activeSizeCodes?: string[];
  activeReqNumber?: string;
  activePlannedQty?: number;
  activeStage4Packed?: number;
  activeStage5Packed?: number;
  mode: 'packing-hall' | 'super-user';
}): string {
  const {
    series,
    activeWipSizes,
    activeSizeFormat,
    activeSizeCodes,
    activeReqNumber,
    activePlannedQty = 0,
    activeStage4Packed = 0,
    activeStage5Packed = 0,
    mode
  } = params;
  const isSu = mode === 'super-user';

  if (series.length === 0) {
    return `
      <section class="panel-card" data-testid="wip-analytics-dashboard" style="margin-bottom: 14px; border: 1px solid ${isSu ? 'var(--su-border)' : 'var(--border-strong)'};">
        <div class="panel-card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <h2 class="panel-card-title" style="margin: 0; font-size: 12.5px;">
            Real-Time WIP Analytics &mdash; Planned Demand vs. Actual Packed Pairs (Per Active Requisition)
          </h2>
          <span style="font-size: 12px; color: ${isSu ? 'var(--su-text-muted)' : 'var(--ink-600)'}; font-family: var(--font-mono);">
            0 Active REQs
          </span>
        </div>
        <div${isSu ? ' class="su-empty-cta-box"' : ''} style="margin: 14px 16px;${isSu ? '' : ' padding: 24px 16px; border: 1px dashed var(--border-strong); border-radius: 6px; text-align: center;'}">
          <div style="font-size: 13px; font-weight: 800; color: ${isSu ? 'var(--su-text-primary)' : 'var(--ink-950)'};">
            No active Packing Hall requisitions yet
          </div>
          <div style="font-size: 12px; color: ${isSu ? 'var(--su-text-muted)' : 'var(--ink-600)'};">
            Issue a Packing Hall Requisition against a received GRN batch to populate per-REQ Planned vs. Packed analytics.
          </div>
        </div>
      </section>
    `;
  }

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

  const sizeKeys = resolveScaleKeysForBreakdown(activeWipSizes, activeSizeCodes);
  const sizeChartFormat = inferSizeFormatFromCodes(sizeKeys, activeSizeFormat);

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
  const PLOT_HEIGHT_PX = 140;
  const calcBarHeight = (value: number, minNonZeroPx: number = 4, zeroHeightPx: number = 2): number => {
    if (value <= 0) return zeroHeightPx;
    return Math.max(minNonZeroPx, Math.min(PLOT_HEIGHT_PX, Math.round((value / maxChartVal) * PLOT_HEIGHT_PX)));
  };

  return `
    <section class="panel-card" data-testid="wip-analytics-dashboard" style="margin-bottom: 14px; border: 1px solid ${isSu ? 'var(--su-border)' : 'var(--border-strong)'};">
      <div class="panel-card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <h2 class="panel-card-title" style="margin: 0; font-size: 12.5px;">
            Real-Time WIP Analytics &mdash; Planned Demand vs. Actual Packed Pairs (Per Active Requisition)
          </h2>
          <span style="font-size: ${isSu ? '12px' : '11px'}; color: ${isSu ? 'var(--su-text-secondary)' : 'var(--ink-600)'}; font-family: var(--font-mono);">
            ${series.length} Active REQ${series.length === 1 ? '' : 's'} &bull; Demand: <strong>${totalDemand.toLocaleString()} Prs</strong> &bull; Packed S5: <strong style="color: ${isSu ? 'var(--su-complete-dark)' : 'inherit'};">${totalActualPacked.toLocaleString()} Prs (${overallCompletionPct}%)</strong>
          </span>
        </div>

        <div style="display: flex; align-items: center; gap: 12px; font-size: ${isSu ? '12px' : '11px'}; color: ${isSu ? 'var(--su-text-primary)' : 'var(--ink-800)'}; flex-wrap: wrap;">
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
            ${isSu ? '1st Packed (M-REQ / S4 QC)' : '1st Packed (Stage 4)'}
          </span>
          <span style="display: inline-flex; align-items: center; gap: 5px;">
            <span style="width: 10px; height: 10px; background: ${s5Fill}; border: 1.5px solid ${s5Border}; display: inline-block;"></span>
            Actual Packed (Stage 5)
          </span>
          <span style="display: inline-flex; align-items: center; gap: 5px;">
            <span style="width: 10px; height: 10px; background: ${altFill}; border: 1px solid ${altBorder}; display: inline-block;"></span>
            ${isSu ? 'Alteration / Scrap (A-REQ)' : 'Alteration / Scrap'}
          </span>
        </div>
      </div>

      <div style="padding: 14px 16px; font-variant-numeric: tabular-nums;">
        <div class="wip-analytics-kpis" style="padding: 8px 12px; background: ${isSu ? 'var(--su-bg-primary)' : 'var(--ink-50)'}; border: 1px solid ${isSu ? 'var(--su-border)' : 'var(--border-subtle)'}; border-radius: 4px; font-size: ${isSu ? '12px' : '11.5px'};">
          <div>
            <div style="font-size: ${isSu ? '12px' : '10.5px'}; text-transform: uppercase; color: ${isSu ? 'var(--su-text-secondary)' : 'var(--ink-500)'}; font-weight: 700;">Planned Demand (All REQs)</div>
            <div style="font-size: 14px; font-weight: 800; color: ${isSu ? 'var(--su-req-primary)' : 'var(--ink-950)'};">${totalDemand.toLocaleString()} Pairs</div>
          </div>
          <div>
            <div style="font-size: ${isSu ? '12px' : '10.5px'}; text-transform: uppercase; color: ${isSu ? 'var(--su-text-secondary)' : 'var(--ink-500)'}; font-weight: 700;">Issued from Dock</div>
            <div style="font-size: 14px; font-weight: 800; color: ${isSu ? 'var(--su-req-accent)' : 'var(--ink-900)'};">${totalIssued.toLocaleString()} Pairs</div>
          </div>
          <div>
            <div style="font-size: ${isSu ? '12px' : '10.5px'}; text-transform: uppercase; color: ${isSu ? 'var(--su-text-secondary)' : 'var(--ink-500)'}; font-weight: 700;">${isSu ? 'Stage 4 1st Packed (M-REQ)' : 'Stage 4 1st Packed'}</div>
            <div style="font-size: 14px; font-weight: 800; color: ${isSu ? 'var(--su-mreq-dark)' : 'var(--ink-900)'};">${totalStage4.toLocaleString()} Pairs</div>
          </div>
          <div>
            <div style="font-size: ${isSu ? '12px' : '10.5px'}; text-transform: uppercase; color: ${isSu ? 'var(--su-text-secondary)' : 'var(--ink-500)'}; font-weight: 700;">Actual Packed (Stage 5)</div>
            <div style="font-size: 14px; font-weight: 800; color: ${isSu ? 'var(--su-complete-dark)' : 'var(--ink-950)'};">${totalActualPacked.toLocaleString()} Pairs (${overallCompletionPct}%)</div>
          </div>
          <div>
            <div style="font-size: ${isSu ? '12px' : '10.5px'}; text-transform: uppercase; color: ${isSu ? 'var(--su-text-secondary)' : 'var(--ink-500)'}; font-weight: 700;">${isSu ? 'Alteration / Scrap (A-REQ)' : 'Alteration / Scrap'}</div>
            <div style="font-size: 14px; font-weight: 800; color: ${isSu ? 'var(--su-areq-primary)' : 'var(--ink-900)'};">${totalAlteration.toLocaleString()} Pairs</div>
          </div>
        </div>

        <div class="${mode === 'packing-hall' ? 'wip-analytics-split' : ''}">
          <div style="border: 1px solid ${isSu ? 'var(--su-border)' : 'var(--border-subtle)'}; border-radius: 4px; padding: 12px 14px; background: var(--white);">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 10px;">
              <span style="font-size: 11.5px; font-weight: 800; color: ${isSu ? 'var(--su-text-primary)' : 'var(--ink-950)'}; text-transform: uppercase;">
                ${isSu ? 'Grouped Bar Comparison by Requisition (REQ &rarr; M-REQ / A-REQ / S5)' : 'Grouped Bar Comparison by Requisition'}
              </span>
              <span style="font-size: 11px; color: ${isSu ? 'var(--su-text-secondary)' : 'var(--ink-500)'};">
                ${mode === 'packing-hall' ? 'Click any requisition bar group to switch active floor batch' : 'Click any requisition bar group to open in Packing Hall'}
              </span>
            </div>

            <div style="display: grid; grid-template-columns: 52px 1fr; gap: 8px; align-items: stretch;">
              <div aria-hidden="true" style="display: flex; flex-direction: column; justify-content: space-between; height: ${PLOT_HEIGHT_PX}px; font-family: var(--font-mono); font-size: 10.5px; line-height: 1; color: var(--ink-500); text-align: right;">
                <span>${tick100.toLocaleString()}</span>
                <span>${tick75.toLocaleString()}</span>
                <span>${tick50.toLocaleString()}</span>
                <span>${tick25.toLocaleString()}</span>
                <span>0</span>
              </div>

              <div data-testid="wip-chart-plot" style="position: relative; height: ${PLOT_HEIGHT_PX}px; border-left: 1.5px solid ${isSu ? 'var(--su-axis-border)' : 'var(--ink-900)'}; border-bottom: 2px solid ${isSu ? 'var(--su-axis-border)' : 'var(--ink-900)'}; background: linear-gradient(to bottom, var(--border-subtle) 1px, transparent 1px) 0 0 / 100% 25%; display: flex; align-items: flex-end; gap: 14px; padding: 0 12px; overflow-x: auto;">
                ${series
                  .map(pt => {
                    const hPlan = calcBarHeight(pt.plannedDemandPairs);
                    const hIssued = calcBarHeight(pt.issuedFloorPairs);
                    const hS4 = calcBarHeight(pt.stage4FirstPackedPairs);
                    const hActual = calcBarHeight(pt.actualPackedPairs);
                    const hAlt = pt.alterationAndScrapPairs > 0 ? calcBarHeight(pt.alterationAndScrapPairs, 4, 0) : 0;

                    const safeReq = escapeHtml(pt.reqNumber);
                    const safeArticle = escapeHtml(pt.article);
                    const safeMreq = escapeHtml(pt.mreqNo);
                    const safeAltReq = escapeHtml(pt.altReqNo);
                    const actionAttrs =
                      mode === 'packing-hall'
                        ? `data-packing-action="select-wip-batch" data-req-number="${safeReq}"`
                        : `data-su-action="open-req-screen" data-target-screen="screen-packing" data-req-number="${safeReq}"`;

                    return `
                    <button
                      type="button"
                      class="wip-chart-req-group"
                      ${actionAttrs}
                      aria-label="${safeReq} (${safeArticle}): Planned ${pt.plannedDemandPairs.toLocaleString()} pairs, Issued ${pt.issuedFloorPairs.toLocaleString()}, 1st Packed ${pt.stage4FirstPackedPairs.toLocaleString()}, Stage 5 Packed ${pt.actualPackedPairs.toLocaleString()} (${pt.packedCompletionPct}%), Alteration ${pt.alterationAndScrapPairs.toLocaleString()}"
                      title="${safeReq} (${safeArticle}) | Planned Demand: ${pt.plannedDemandPairs.toLocaleString()} Prs | Issued: ${pt.issuedFloorPairs.toLocaleString()} Prs | 1st Packed (${safeMreq}): ${pt.stage4FirstPackedPairs.toLocaleString()} Prs | Actual Stage 5 Packed: ${pt.actualPackedPairs.toLocaleString()} Prs (${pt.packedCompletionPct}%) | Alteration (${safeAltReq}): ${pt.alterationAndScrapPairs} Prs"
                      style="flex: 1; min-width: 118px; height: ${PLOT_HEIGHT_PX}px; display: flex; align-items: flex-end; justify-content: center; background: ${pt.isSelected ? (isSu ? 'var(--su-req-bg)' : 'var(--ink-50)') : 'transparent'}; border: ${pt.isSelected ? (isSu ? '1px dashed var(--su-req-primary)' : '1px dashed var(--ink-900)') : '1px solid transparent'}; border-bottom: none; border-radius: 4px 4px 0 0; padding: 0 6px; cursor: pointer;"
                    >
                      <div style="display: flex; align-items: flex-end; justify-content: center; gap: 4px; width: 100%; height: ${PLOT_HEIGHT_PX}px;">
                        <div role="img" data-series="planned" data-value="${pt.plannedDemandPairs}" aria-label="Planned Demand: ${pt.plannedDemandPairs.toLocaleString()} pairs" title="Planned Demand (${safeReq}): ${pt.plannedDemandPairs.toLocaleString()} pairs" style="width: 16px; height: ${hPlan}px; background: ${planFill}; border: 1.5px solid ${planBorder}; border-bottom: none; border-radius: 2px 2px 0 0;"></div>
                        <div role="img" data-series="issued" data-value="${pt.issuedFloorPairs}" aria-label="Issued Floor WIP: ${pt.issuedFloorPairs.toLocaleString()} pairs" title="Issued Floor WIP: ${pt.issuedFloorPairs.toLocaleString()} pairs" style="width: 16px; height: ${hIssued}px; background: ${issuedFill}; border: 1.5px solid ${issuedBorder}; border-bottom: none; border-radius: 2px 2px 0 0;"></div>
                        <div role="img" data-series="stage4" data-value="${pt.stage4FirstPackedPairs}" aria-label="Stage 4 1st Packed: ${pt.stage4FirstPackedPairs.toLocaleString()} pairs" title="Stage 4 1st Packed (${safeMreq}): ${pt.stage4FirstPackedPairs.toLocaleString()} pairs" style="width: 16px; height: ${hS4}px; background: ${s4Fill}; border: 1.5px solid ${s4Border}; border-bottom: none; border-radius: 2px 2px 0 0;"></div>
                        <div role="img" data-series="stage5" data-value="${pt.actualPackedPairs}" aria-label="Actual Stage 5 Packed: ${pt.actualPackedPairs.toLocaleString()} pairs" title="Actual Stage 5 Packed: ${pt.actualPackedPairs.toLocaleString()} pairs" style="width: 16px; height: ${hActual}px; background: ${s5Fill}; border: 1.5px solid ${s5Border}; border-bottom: none; border-radius: 2px 2px 0 0;"></div>
                        ${
                          hAlt > 0
                            ? `
                        <div role="img" data-series="alteration" data-value="${pt.alterationAndScrapPairs}" aria-label="Alteration and Scrap: ${pt.alterationAndScrapPairs.toLocaleString()} pairs" title="Alteration / Scrap (${safeAltReq}): ${pt.alterationAndScrapPairs.toLocaleString()} pairs" style="width: 12px; height: ${hAlt}px; background: ${altFill}; border: 1px solid ${altBorder}; border-bottom: none; border-radius: 2px 2px 0 0;"></div>
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

            <div style="display: grid; grid-template-columns: 52px 1fr; gap: 8px; margin-top: 6px;">
              <div></div>
              <div style="display: flex; gap: 14px; padding: 0 12px; overflow-x: auto;">
                ${series
                  .map(
                    pt => `
                  <div style="flex: 1; min-width: 118px; text-align: center;">
                    <div style="font-family: var(--font-mono); font-size: 11px; font-weight: 800; color: ${isSu ? 'var(--su-req-primary)' : 'var(--ink-950)'};">
                      ${escapeHtml(pt.reqNumber)} ${pt.isSelected ? '&#9679;' : ''}
                    </div>
                    <div style="font-family: var(--font-mono); font-size: ${isSu ? '12px' : '10.5px'}; font-weight: 700; color: ${isSu ? 'var(--su-text-primary)' : 'var(--ink-800)'}; white-space: nowrap;">
                      ${pt.actualPackedPairs.toLocaleString()} / ${pt.plannedDemandPairs.toLocaleString()} (${pt.packedCompletionPct}%)
                    </div>
                    <div style="font-size: ${isSu ? '12px' : '10.5px'}; color: var(--ink-700); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                      ${escapeHtml(pt.article)} (${escapeHtml(pt.parentOrderId)})
                    </div>
                    ${isSu ? `
                    <div style="font-family: var(--font-mono); font-size: 12px; color: var(--su-text-secondary);">
                      <span style="color: var(--su-mreq-dark);">${escapeHtml(pt.mreqNo)}</span> &bull; <span style="color: var(--su-areq-primary);">${escapeHtml(pt.altReqNo)}</span>
                    </div>
                    ` : ''}
                  </div>
                `
                  )
                  .join('')}
              </div>
            </div>

            <table class="sr-only">
              <caption>WIP Requisition Comparison Summary</caption>
              <thead>
                <tr>
                  <th scope="col">Requisition</th>
                  <th scope="col">Article</th>
                  <th scope="col">Planned Demand</th>
                  <th scope="col">Issued Floor WIP</th>
                  <th scope="col">Stage 4 1st Packed</th>
                  <th scope="col">Actual Stage 5 Packed</th>
                  <th scope="col">Alteration or Scrap</th>
                </tr>
              </thead>
              <tbody>
                ${series
                  .map(
                    pt => `
                <tr>
                  <th scope="row">${escapeHtml(pt.reqNumber)}</th>
                  <td>${escapeHtml(pt.article)} (${escapeHtml(pt.parentOrderId)})</td>
                  <td>${pt.plannedDemandPairs}</td>
                  <td>${pt.issuedFloorPairs}</td>
                  <td>${pt.stage4FirstPackedPairs}</td>
                  <td>${pt.actualPackedPairs} (${pt.packedCompletionPct}%)</td>
                  <td>${pt.alterationAndScrapPairs}</td>
                </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
          </div>

          ${
            mode === 'packing-hall'
              ? `
          <div style="border: 1px solid var(--border-subtle); border-radius: 4px; padding: 12px 14px; background: var(--white); display: flex; flex-direction: column; justify-content: space-between;">
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
                      <strong style="color: var(--ink-900);">Size ${escapeHtml(formatSizeColumnLabel(sz, sizeChartFormat))}</strong>
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

export interface ConfirmDialogPasswordFieldOptions {
  id?: string;
  label: string;
  placeholder?: string;
  hint?: string;
}

export interface ConfirmDialogHtmlOptions {
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning';
  passwordField?: ConfirmDialogPasswordFieldOptions;
}

/** Builds escaped confirmation dialog body markup for #global-modal. */
export function buildConfirmDialogHtml(options: ConfirmDialogHtmlOptions): string {
  const confirmClass = options.tone === 'danger' ? 'btn-danger' : 'btn-primary';
  const detailBlock = options.detail
    ? `<p class="su-confirm-detail">${escapeHtml(options.detail)}</p>`
    : '';
  const pwFieldId = options.passwordField?.id || 'confirm-admin-password';
  const passwordBlock = options.passwordField
    ? `
      <div class="form-group su-confirm-password-group">
        <label for="${escapeHtml(pwFieldId)}">${escapeHtml(options.passwordField.label)} <span class="su-required-mark" aria-hidden="true">*</span></label>
        <input
          type="password"
          id="${escapeHtml(pwFieldId)}"
          class="form-input"
          autocomplete="current-password"
          aria-required="true"
          placeholder="${escapeHtml(options.passwordField.placeholder || 'Enter Admin password')}"
        />
        ${options.passwordField.hint ? `<span class="form-hint">${escapeHtml(options.passwordField.hint)}</span>` : ''}
      </div>
    `
    : '';
  return `
    <div class="su-confirm-dialog">
      <p class="su-confirm-message">${escapeHtml(options.message)}</p>
      ${detailBlock}
      ${passwordBlock}
      <div class="su-confirm-actions">
        <button type="button" class="btn-outline" id="confirm-dialog-cancel" data-modal-cancel>${escapeHtml(options.cancelLabel || 'Cancel')}</button>
        <button type="button" class="${confirmClass}" id="confirm-dialog-confirm">${escapeHtml(options.confirmLabel || 'Confirm')}</button>
      </div>
    </div>
  `;
}

export function validatePendingOrderInputs(input: {
  maker?: string;
  article?: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!String(input.maker || '').trim()) {
    errors.maker = 'Select a Contractor / Maker.';
  }
  if (!String(input.article || '').trim()) {
    errors.article = 'Select an Article.';
  }
  return errors;
}

export function validateCustomerMasterInputs(input: {
  name?: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!String(input.name || '').trim()) {
    errors.name = 'Enter a customer / buyer name.';
  }
  return errors;
}

export function validateProductMasterInputs(input: {
  name?: string;
  stickersPerPair?: number;
  pairsPerCarton?: number;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!String(input.name || '').trim()) {
    errors.name = 'Enter an article name.';
  }
  if (!Number.isFinite(Number(input.stickersPerPair)) || Number(input.stickersPerPair) < 1) {
    errors.stickersPerPair = 'Enter at least 1 sticker per pair.';
  }
  if (!Number.isFinite(Number(input.pairsPerCarton)) || Number(input.pairsPerCarton) < 1) {
    errors.pairsPerCarton = 'Enter at least 1 pair per carton.';
  }
  return errors;
}

export function validateSystemUserInputs(input: {
  name?: string;
  username?: string;
  password?: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!String(input.name || '').trim()) {
    errors.name = 'Enter the operator name.';
  }
  if (!String(input.username || '').trim()) {
    errors.username = 'Enter a sign-in username.';
  }
  const pwError = validatePasswordResetInput(input.password);
  if (pwError) {
    errors.password = pwError;
  }
  return errors;
}

export function validatePasswordResetInput(password?: string): string | null {
  return String(password || '').length >= 8 ? null : 'Password must be at least 8 characters.';
}

export interface FocusSelectorTargetInput {
  id?: string;
  classList?: Iterable<string> | ArrayLike<string>;
  dataset?: Record<string, string | undefined>;
}

const SU_ACTION_DISCRIMINATOR_KEYS: ReadonlyArray<readonly [keyof Record<string, string>, string]> = [
  ['orderId', 'data-order-id'],
  ['reqNumber', 'data-req-number'],
  ['grnCode', 'data-grn-code'],
  ['grnSr', 'data-grn-sr'],
  ['slipType', 'data-slip-type'],
  ['refCode', 'data-ref-code'],
  ['targetScreen', 'data-target-screen'],
  ['demoPhase', 'data-demo-phase'],
  ['expanded', 'data-expanded'],
  ['page', 'data-page'],
  ['listKey', 'data-list-key'],
  ['itemVal', 'data-item-val']
];

function escapeCssAttrValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\d ')
    .replace(/\n/g, '\\a ');
}

function escapeCssIdSelector(id: string): string {
  if (typeof globalThis.CSS !== 'undefined' && typeof globalThis.CSS.escape === 'function') {
    return `#${globalThis.CSS.escape(id)}`;
  }
  return `#${id.replace(/([^a-zA-Z0-9_-])/g, '\\$1')}`;
}

/** Derives a stable selector for restoring keyboard focus across full-root re-renders. */
export function buildFocusRestoreSelector(target: FocusSelectorTargetInput): string | null {
  if (target.id) {
    return escapeCssIdSelector(target.id);
  }
  const dataset = target.dataset || {};
  const classes = target.classList ? Array.from(target.classList) : [];

  if (dataset.suAction) {
    let sel = `[data-su-action="${escapeCssAttrValue(dataset.suAction)}"]`;
    for (const [dataKey, attrName] of SU_ACTION_DISCRIMINATOR_KEYS) {
      const val = dataset[dataKey];
      if (val !== undefined) {
        sel += `[${attrName}="${escapeCssAttrValue(val)}"]`;
      }
    }
    return sel;
  }
  if (dataset.adminTab) {
    return `[data-admin-tab="${escapeCssAttrValue(dataset.adminTab)}"]`;
  }
  if (dataset.trackingFilter) {
    const scopeClass = classes.includes('su-stage-bar-btn')
      ? '.su-stage-bar-btn'
      : classes.includes('admin-tracking-filter-btn')
        ? '.admin-tracking-filter-btn'
        : '';
    return `${scopeClass}[data-tracking-filter="${escapeCssAttrValue(dataset.trackingFilter)}"]`;
  }
  if (dataset.reportId) {
    return `[data-report-id="${escapeCssAttrValue(dataset.reportId)}"]`;
  }
  if (dataset.screen) {
    return `.module-nav-btn[data-screen="${escapeCssAttrValue(dataset.screen)}"]`;
  }
  if (dataset.adminResetPassword) {
    return `[data-admin-reset-password="${escapeCssAttrValue(dataset.adminResetPassword)}"]`;
  }
  if (dataset.adminUserPassword) {
    return `[data-admin-user-password="${escapeCssAttrValue(dataset.adminUserPassword)}"]`;
  }
  if (dataset.packingAction) {
    const reqSuffix = dataset.reqNumber ? `[data-req-number="${escapeCssAttrValue(dataset.reqNumber)}"]` : '';
    return `[data-packing-action="${escapeCssAttrValue(dataset.packingAction)}"]${reqSuffix}`;
  }
  if (dataset.size && (classes.includes('admin-order-size-val') || classes.includes('grn-size-val'))) {
    const sizeClass = classes.includes('admin-order-size-val') ? '.admin-order-size-val' : '.grn-size-val';
    return `${sizeClass}[data-size="${escapeCssAttrValue(dataset.size)}"]`;
  }
  return null;
}

/** Suggests the default station assignment for a given MES role. */
export function getDefaultStationForRole(role: string): string {
  switch (role) {
    case 'SUPER_USER':
      return 'Super User';
    case 'INWARD_CLERK':
      return 'Dock #1';
    case 'PACKING_SUPERVISOR':
      return 'Packing Hall #1';
    case 'QC_INSPECTOR':
      return 'Final QC';
    case 'ALTERATION_LEAD':
      return 'Alteration Bay';
    default:
      return 'Packing Hall #1';
  }
}

