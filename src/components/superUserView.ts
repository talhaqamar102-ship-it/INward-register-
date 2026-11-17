import {
  PendingOrder,
  SizeBreakdown,
  DeliveryCountdownInfo,
  calculateSizeTotal,
  validateContractorAllocations,
  computeDeliveryCountdown,
  SuperUserDashboardSummary,
  SuperUserOrderRollup,
  SuperUserGrnBatchItem,
  SuperUserReqBatchItem,
  ReconciliationResult,
  AuditTrailEntry,
  MesUserRole,
  ROLE_PERMISSIONS,
  prioritizeAndSliceChips,
  buildRequisitionAnalyticsSeries,
  renderRequisitionWipAnalyticsChart,
  getSuperUserStatusBadgeClass,
  canVoidGrnBatch,
  canVoidRequisitionLot,
  PHASED_ROLLOUT_RECORD,
  DEFAULT_MES_POLICY_CONFIG,
  escapeHtml,
  SizeStandardOption,
  CatalogProductOption,
  filterProductsByBuyer,
  getScaleSizeCodes,
  formatSizeColumnLabel
} from '../utils/requisitionLogic';

export type SuperUserTab = 'dashboard' | 'tracking' | 'orders' | 'creation' | 'users' | 'reports';
export type SuperUserReportType =
  | 'order_grn_balance'
  | 'req_traceability'
  | 'contractor_scrap'
  | 'final_qc_dispatch';

export interface SystemUserRecord {
  userId: string;
  username: string;
  name: string;
  role: MesUserRole;
  station: string;
  active: boolean;
}

export interface SuperUserRenderContext {
  activeTab: SuperUserTab;
  adminNavCollapsed?: boolean;
  demoDrawerOpen?: boolean;
  locationSearch?: string;
  activeReport: SuperUserReportType;
  trackingSearch: string;
  trackingStatusFilter: string;
  trackingBuyerFilter?: string;
  trackingMakerFilter?: string;
  trackingPage?: number;
  trackingPageSize?: number;
  highlightedRefCode?: string;
  expandedOrderIds: Record<string, boolean>;
  pendingOrders: PendingOrder[];
  dropdownOptions: {
    makers: string[];
    customers: string[];
    articles: string[];
    poList: string[];
  };
  systemUsers?: SystemUserRecord[];
  currentUserId?: string;
  auditTrail?: AuditTrailEntry[];
  adminOverview: {
    dbHealth: {
      journalMode: string;
      integrity: string;
      tableCounts: Record<string, number>;
      totalTables: number;
    };
    customers: any[];
    products: CatalogProductOption[];
    sizeStandards?: SizeStandardOption[];
    receivings: any[];
    alterations: any[];
    scrapLedger: any[];
  };
  lastBackupPath: string;
  rollupSummary: SuperUserDashboardSummary;
  orderDraft?: {
    customerId?: string;
    buyer: string;
    maker: string;
    po: string;
    productId?: string;
    article: string;
    color: string;
    sizeFormat?: string;
    dueDate: string;
    sizes: SizeBreakdown;
  };
  orderSplitRows?: Array<{
    maker: string;
    sizes: SizeBreakdown;
    dueDate: string;
  }>;
  openRegistryIds?: Record<string, boolean>;
}

function renderReconciliationBadge(rec: ReconciliationResult): string {
  if (rec.isReconciled) {
    return `<span class="su-badge su-badge-reconciled" title="${escapeHtml(rec.detail)}">RECONCILED &#10003;</span>`;
  }
  const deltaSign = rec.deltaPairs > 0 ? `+${rec.deltaPairs}` : `${rec.deltaPairs}`;
  return `<span class="su-badge su-badge-variance" title="${escapeHtml(rec.detail)}">VARIANCE &Delta; (${deltaSign} Prs &bull; ${escapeHtml(rec.failingGate)})</span>`;
}

function renderDeliveryCountdownChip(cd?: DeliveryCountdownInfo, showTimelineBar = false): string {
  if (!cd || (!cd.hasDueDate && cd.status !== 'DELIVERED')) {
    return `<span class="su-countdown-badge" data-testid="order-countdown-badge">No Due Date</span>`;
  }
  const toneClass = cd.status === 'OVERDUE'
    ? 'is-overdue'
    : cd.status === 'DUE_SOON'
      ? 'is-soon'
      : cd.status === 'DELIVERED'
        ? 'is-delivered'
        : 'is-ontrack';
  const fillClass = cd.status === 'OVERDUE'
    ? 'is-overdue'
    : cd.status === 'DELIVERED'
      ? 'is-delivered'
      : '';
  const dueTitle = cd.dueDate ? `Delivery Due: ${cd.dueDate}` : 'Delivery Timeline';
  return `
    <span class="su-countdown-badge ${toneClass}" data-testid="order-countdown-badge" title="${escapeHtml(dueTitle)}">
      ${escapeHtml(cd.badgeText)}${cd.dueDate ? ` (${escapeHtml(cd.dueDate)})` : ''}
    </span>
    ${showTimelineBar && cd.hasDueDate ? `
      <div class="su-timeline-track" title="${escapeHtml(dueTitle)} &bull; ${cd.progressPct}% elapsed">
        <div class="su-timeline-fill ${fillClass}" style="width: ${cd.progressPct}%;"></div>
      </div>
    ` : ''}
  `;
}

function renderStageMiniTrack(activeStage: string, awaitingQc: boolean, isClosed: boolean): string {
  const stages = [
    { key: 'STEP_1', label: 'S1' },
    { key: 'STEP_2', label: 'S2' },
    { key: 'STEP_3', label: 'S3' },
    { key: 'STEP_4', label: awaitingQc ? 'S4 (Hold QC)' : 'S4' },
    { key: 'STEP_5', label: 'S5' }
  ];
  const stageOrder = ['STEP_1', 'STEP_2', 'STEP_3', 'STEP_4', 'STEP_5', 'COMPLETED'];
  const currentIdx = isClosed ? 5 : stageOrder.indexOf(activeStage);

  return `
    <div style="display: inline-flex; align-items: center; gap: 4px; font-family: var(--font-mono); font-size: 11px;">
      ${stages
        .map((s, idx) => {
          const isDone = currentIdx > idx || isClosed;
          const isCurrent = !isClosed && (currentIdx === idx || (awaitingQc && idx === 3));
          const isHoldQc = isCurrent && awaitingQc && idx === 3;
          const bg = isHoldQc
            ? 'var(--su-mreq-primary)'
            : isCurrent
              ? 'var(--su-req-primary)'
              : isDone
                ? 'var(--su-complete-bg)'
                : 'var(--su-bg-primary)';
          const color = isCurrent
            ? 'var(--su-white)'
            : isDone
              ? 'var(--su-complete-dark)'
              : 'var(--su-text-secondary)';
          const border = isHoldQc
            ? 'var(--su-mreq-dark)'
            : isCurrent
              ? 'var(--su-req-deep)'
              : isDone
                ? 'var(--su-complete-border)'
                : 'var(--su-border)';
          return `<span style="padding: 1px 5px; border: 1px solid ${border}; background: ${bg}; color: ${color}; border-radius: 3px; font-weight: ${isCurrent || isDone ? '700' : '500'}; white-space: nowrap;">${s.label}${isDone ? '&#10003;' : ''}</span>`;
        })
        .join('<span style="color: var(--su-text-muted);">&rarr;</span>')}
    </div>
  `;
}

function renderDashboardVisualGraphs(s: SuperUserDashboardSummary): string {
  const maxStageVal = Math.max(
    1,
    s.totalPlannedPairs,
    s.totalReceivedGrnPairs,
    s.totalDockAvailablePairs,
    s.stage1WipPairs + s.stage2WipPairs + s.stage3WipPairs,
    s.stage4ReadyForQcPairs,
    s.totalAlterationPairs + s.totalScrappedPairs,
    s.stage5PackedPairs
  );

  const stageBars = [
    {
      step: '01',
      label: 'Master Orders',
      sub: `${s.totalOrders} Orders`,
      pairs: s.totalPlannedPairs,
      pctOfPlan: s.totalPlannedPairs > 0 ? 100 : 0,
      fill: 'var(--su-req-deep)',
      border: 'var(--su-req-primary)',
      textColor: 'var(--su-req-deep)',
      filter: 'ALL'
    },
    {
      step: '02',
      label: 'Received GRNs',
      sub: `${s.totalGrnCount} GRN Batches`,
      pairs: s.totalReceivedGrnPairs,
      pctOfPlan:
        s.totalPlannedPairs > 0
          ? Math.round((s.totalReceivedGrnPairs / s.totalPlannedPairs) * 100)
          : 0,
      fill: 'var(--su-grn-primary)',
      border: 'var(--su-grn-dark)',
      textColor: 'var(--su-grn-dark)',
      filter: 'RECEIVING'
    },
    {
      step: '03',
      label: 'Dock Pool',
      sub: 'Unissued Stock',
      pairs: s.totalDockAvailablePairs,
      pctOfPlan:
        s.totalPlannedPairs > 0
          ? Math.round((s.totalDockAvailablePairs / s.totalPlannedPairs) * 100)
          : 0,
      fill: 'var(--su-grn-accent)',
      border: 'var(--su-grn-primary)',
      textColor: 'var(--su-grn-deep)',
      filter: 'RECEIVING'
    },
    {
      step: '04',
      label: 'Floor WIP (S1–S3)',
      sub: `S1:${s.stage1WipPairs} S2:${s.stage2WipPairs} S3:${s.stage3WipPairs}`,
      pairs: s.stage1WipPairs + s.stage2WipPairs + s.stage3WipPairs,
      pctOfPlan:
        s.totalPlannedPairs > 0
          ? Math.round(
              ((s.stage1WipPairs + s.stage2WipPairs + s.stage3WipPairs) / s.totalPlannedPairs) * 100
            )
          : 0,
      fill: 'var(--su-req-accent)',
      border: 'var(--su-req-primary)',
      textColor: 'var(--su-req-primary)',
      filter: 'WIP'
    },
    {
      step: '05',
      label: 'Stage 4 Hold (QC)',
      sub: `${s.stage4HoldReqs.length} Lots Await AQL`,
      pairs: s.stage4ReadyForQcPairs,
      pctOfPlan:
        s.totalPlannedPairs > 0
          ? Math.round((s.stage4ReadyForQcPairs / s.totalPlannedPairs) * 100)
          : 0,
      fill: 'var(--su-mreq-primary)',
      border: 'var(--su-mreq-dark)',
      textColor: 'var(--su-mreq-dark)',
      filter: 'HOLD_QC'
    },
    {
      step: '06',
      label: 'Alteration (A-REQ)',
      sub: `Rework:${s.totalAlterationPairs} Scrap:${s.totalScrappedPairs}`,
      pairs: s.totalAlterationPairs + s.totalScrappedPairs,
      pctOfPlan:
        s.totalPlannedPairs > 0
          ? Math.round(((s.totalAlterationPairs + s.totalScrappedPairs) / s.totalPlannedPairs) * 100)
          : 0,
      fill: 'var(--su-areq-primary)',
      border: 'var(--su-areq-dark)',
      textColor: 'var(--su-areq-primary)',
      filter: 'WIP'
    },
    {
      step: '07',
      label: 'Stage 5 Cartons',
      sub: `${s.stage5PackedCartons} Sealed Ctns`,
      pairs: s.stage5PackedPairs,
      pctOfPlan:
        s.totalPlannedPairs > 0
          ? Math.round((s.stage5PackedPairs / s.totalPlannedPairs) * 100)
          : 0,
      fill: 'var(--su-complete-primary)',
      border: 'var(--su-complete-dark)',
      textColor: 'var(--su-complete-dark)',
      filter: 'COMPLETED'
    }
  ];

  return `
    <div class="two-column-grid" style="margin-bottom: 14px; grid-template-columns: 1.15fr 1fr;">
      <section class="panel-card" style="margin-bottom: 0;">
        <div class="panel-card-header">
          <div class="panel-card-title">
            <span>Factory Pipeline Volume Graph (Pairs by Stage)</span>
          </div>
          <span class="admin-meta-caption">Click any stage bar to filter Live Tracking</span>
        </div>
        <div style="padding: 16px 16px 12px; font-variant-numeric: tabular-nums;">
          ${
            s.orderRollups.length === 0
              ? `
            <div class="su-empty-cta-box">
              <div style="font-size: 13px; font-weight: 800; color: var(--su-text-primary);">
                No active orders in the production pipeline yet
              </div>
              <div style="font-size: 12px; color: var(--su-text-muted); max-width: 380px;">
                Create a Master Order in <strong>Order Creation</strong> to start tracking Receiving, WIP, Alteration, and Stage 5 Carton volumes.
              </div>
              <button type="button" class="btn-primary" data-admin-tab-jump="orders">
                Create First Master Order
              </button>
            </div>
          `
              : `
          <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; align-items: end; height: 185px; padding-top: 22px; border-bottom: 2px solid var(--su-axis-border);">
            ${stageBars
              .map(b => {
                const barHeightPx =
                  b.pairs > 0 ? Math.max(14, Math.round((b.pairs / maxStageVal) * 128)) : 4;
                return `
                <button
                  type="button"
                  class="su-stage-bar-btn"
                  data-tracking-filter="${b.filter}"
                  aria-label="Filter Live Tracking by ${escapeHtml(b.label)}: ${b.pairs.toLocaleString()} Pairs (${b.pctOfPlan}% of Order Book)"
                  title="${escapeHtml(b.label)}: ${b.pairs.toLocaleString()} Pairs (${b.pctOfPlan}% of Order Book)"
                >
                  <span style="font-size: 11px; font-weight: 800; color: ${b.textColor}; margin-bottom: 2px; white-space: nowrap;">
                    ${b.pairs.toLocaleString()}
                  </span>
                  <span style="font-size: 11px; color: var(--su-text-muted); margin-bottom: 5px;">
                    ${b.pctOfPlan}%
                  </span>
                  <span style="display: block; width: 72%; height: ${barHeightPx}px; background: ${b.fill}; border: 1.5px solid ${b.border}; border-bottom: none; border-radius: 3px 3px 0 0; transition: height 0.2s ease;"></span>
                </button>
              `;
              })
              .join('')}
          </div>
          <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; padding-top: 8px; text-align: center;">
            ${stageBars
              .map(
                b => `
              <div>
                <div style="font-family: var(--font-mono); font-size: 11px; font-weight: 800; color: ${b.textColor};">${b.step}</div>
                <div style="font-size: 11px; font-weight: 800; color: var(--su-text-primary); line-height: 1.2; margin-top: 1px;">${b.label}</div>
                <div style="font-size: 11px; color: var(--su-text-muted); margin-top: 2px; line-height: 1.15;">${b.sub}</div>
              </div>
            `
              )
              .join('')}
          </div>
          `
          }
        </div>
      </section>

      <section class="panel-card" style="margin-bottom: 0;">
        <div class="panel-card-header">
          <div class="panel-card-title">
            <span>Order &rarr; GRN &rarr; REQ (M &amp; A) Visual Flow Graph</span>
          </div>
          <span class="admin-meta-caption">1 Parent Order &rarr; N GRNs &amp; N REQs</span>
        </div>
        <div style="padding: 12px 14px; max-height: 245px; overflow-y: auto; font-variant-numeric: tabular-nums;">
          ${
            s.orderRollups.length === 0
              ? `
            <div style="padding: 16px; border: 1px dashed var(--su-border); border-radius: 6px; background: var(--su-bg-primary); text-align: center;">
              <div style="font-size: 12px; font-weight: 800; color: var(--su-text-primary); margin-bottom: 8px;">
                Architecture Blueprint: 1 Order &rarr; Multiple GRNs &amp; Multiple REQs
              </div>
              <div style="display: flex; align-items: center; justify-content: center; gap: 8px; font-family: var(--font-mono); font-size: 11px; flex-wrap: wrap; margin-bottom: 8px;">
                <span class="su-badge su-badge-req">ORD-2026-001</span>
                <span style="color: var(--su-text-muted);">&rarr;</span>
                <span class="su-badge su-badge-grn">GRN-0001, 0002...</span>
                <span style="color: var(--su-text-muted);">&rarr;</span>
                <span class="su-badge su-badge-req">REQ-0001</span>
                <span class="su-badge su-badge-mreq">M-0001</span>
                <span class="su-badge su-badge-areq">A-0001</span>
              </div>
              <div style="font-size: 11px; color: var(--su-text-secondary);">
                Create a Master Order in <strong>Order Creation</strong> or open the <strong>Demo Scenario Controls</strong> drawer above to see its live visual node tree.
              </div>
            </div>
          `
              : s.orderRollups
                  .map(o => {
                    const plan = Math.max(1, o.plannedQty || o.receivedGrnQty || 1);
                    const rcvdPct = Math.min(100, Math.round((o.receivedGrnQty / plan) * 100));
                    const s5Pct = Math.min(100, Math.round((o.packedStage5Qty / plan) * 100));
                    const s4Pct = Math.min(
                      100 - s5Pct,
                      Math.round((o.awaitingFinalQcQty / plan) * 100)
                    );
                    const wipOnly = Math.max(0, o.inFloorWipQty - o.awaitingFinalQcQty);
                    const wipPct = Math.min(
                      100 - s5Pct - s4Pct,
                      Math.round((wipOnly / plan) * 100)
                    );
                    const altPct = Math.min(
                      100 - s5Pct - s4Pct - wipPct,
                      Math.round(((o.inAlterationQty + o.scrappedQty) / plan) * 100)
                    );

                    return `
              <div style="border: 1px solid var(--su-border); border-radius: 5px; padding: 10px 12px; margin-bottom: 10px; background: var(--su-white);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; gap: 6px; flex-wrap: wrap;">
                  <div>
                    <strong style="font-size: 12.5px; color: var(--su-req-primary);">${escapeHtml(o.orderId)}</strong>
                    <span style="font-size: 11px; color: var(--su-text-secondary); margin-left: 6px;">${escapeHtml(o.buyer)} &bull; ${escapeHtml(o.article)} &bull; Plan: <strong>${o.plannedQty.toLocaleString()} Prs</strong></span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    ${renderReconciliationBadge(o.reconciliation)}
                    <button type="button" class="table-btn" style="font-size: 11px; padding: 2px 8px;" data-su-action="inspect-order" data-order-id="${escapeHtml(o.orderId)}">Inspect Graph &rarr;</button>
                  </div>
                </div>

                <div style="display: grid; grid-template-columns: 95px 1fr 48px; align-items: center; gap: 8px; font-size: 11px; margin-bottom: 4px;">
                  <span style="color: var(--su-grn-dark); font-weight: 700;">GRN Supply:</span>
                  <div style="height: 8px; background: var(--su-grn-fill-soft); border: 1px solid var(--su-grn-border); border-radius: 2px; overflow: hidden;">
                    <div style="width: ${rcvdPct}%; height: 100%; background: var(--su-grn-primary);"></div>
                  </div>
                  <span style="text-align: right; font-weight: 800; color: var(--su-grn-dark);">${rcvdPct}%</span>
                </div>

                <div style="display: grid; grid-template-columns: 95px 1fr 48px; align-items: center; gap: 8px; font-size: 12px; margin-bottom: 8px;">
                  <span style="color: var(--su-req-primary); font-weight: 700;">REQ Execution:</span>
                  <div style="height: 8px; background: var(--su-bg-tertiary); border: 1px solid var(--su-border); border-radius: 2px; overflow: hidden; display: flex;">
                    <div style="width: ${s5Pct}%; height: 100%; background: var(--su-complete-primary);" title="Stage 5 Packed: ${o.packedStage5Qty} Prs"></div>
                    <div style="width: ${s4Pct}%; height: 100%; background: var(--su-mreq-primary);" title="Stage 4 Hold QC: ${o.awaitingFinalQcQty} Prs"></div>
                    <div style="width: ${wipPct}%; height: 100%; background: var(--su-req-accent);" title="Stages 1-3 WIP: ${wipOnly} Prs"></div>
                    <div style="width: ${altPct}%; height: 100%; background: var(--su-areq-primary);" title="Alteration/Scrap: ${o.inAlterationQty + o.scrappedQty} Prs"></div>
                  </div>
                  <span style="text-align: right; font-weight: 800; color: var(--su-complete-dark);">${s5Pct}% S5</span>
                </div>

                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-family: var(--font-mono); font-size: 12px; background: var(--su-bg-primary); padding: 6px 8px; border-radius: 4px; border: 1px solid var(--su-border-subtle);">
                  <span style="font-weight: 800; color: var(--su-req-primary);">${escapeHtml(o.orderId)}</span>
                  <span style="color: var(--su-text-muted);">&rarr;</span>
                  ${
                    o.grnBatches.length === 0
                      ? `<span style="color: var(--su-text-muted);">[0 GRNs]</span>`
                      : o.grnBatches
                          .map(
                            g =>
                              `<button type="button" class="su-chip-btn su-badge su-badge-grn" style="font-size: 12px; padding: 1px 6px;" data-su-action="inspect-order" data-order-id="${escapeHtml(o.orderId)}" data-ref-code="${escapeHtml(g.grnCode)}">${escapeHtml(g.grnCode)} (${g.rcvdPairs})</button>`
                          )
                          .join('')
                  }
                  <span style="color: var(--su-text-muted);">&rarr;</span>
                  ${
                    o.reqBatches.length === 0
                      ? `<span style="color: var(--su-text-muted);">[0 REQs]</span>`
                      : o.reqBatches
                          .map(
                            r =>
                              `<button type="button" class="su-chip-btn su-badge su-badge-req" style="font-size: 12px; padding: 1px 6px;" data-su-action="inspect-order" data-order-id="${escapeHtml(o.orderId)}" data-ref-code="${escapeHtml(r.reqNumber)}">${escapeHtml(r.reqNumber)} &rarr; <span style="color: var(--su-mreq-dark);">${escapeHtml(r.mreqNo)}</span> | <span style="color: var(--su-areq-primary);">${escapeHtml(r.altReqNo)}</span> (${r.askingPairs})</button>`
                          )
                          .join('')
                  }
                </div>
              </div>
            `;
                  })
                  .join('')
          }
        </div>
      </section>
    </div>
  `;
}

function renderOrderGrnChipsWithOverflow(ord: SuperUserOrderRollup): string {
  if (ord.grnBatches.length === 0) {
    return `<span style="font-size: 11px; color: var(--su-text-muted);">0 GRNs</span>`;
  }
  const scored = ord.grnBatches.map(g => ({
    item: g,
    priorityScore: g.allocationStatus === 'UNALLOCATED' ? 2 : g.allocationStatus === 'PARTIALLY ALLOCATED' ? 1 : 0,
    seq: g.orderBatchSeq
  }));
  const sliced = prioritizeAndSliceChips(scored, 3);

  return `
    <div style="display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; align-items: center;">
      ${sliced.visible
        .map(({ item: g }) => `
          <span style="display: inline-flex; align-items: center; gap: 2px;">
            <button
              type="button"
              class="su-chip-btn su-badge su-badge-grn"
              style="font-size: 11px; padding: 1px 6px;"
              title="${escapeHtml(g.grnCode)}: ${g.rcvdPairs} Prs (${escapeHtml(g.allocationStatus)}) — Click to inspect in Live Tracking"
              data-su-action="inspect-order"
              data-order-id="${escapeHtml(ord.orderId)}"
              data-ref-code="${escapeHtml(g.grnCode)}"
            >${escapeHtml(g.grnCode)} (${g.rcvdPairs})</button>
            <button
              type="button"
              class="su-chip-btn"
              style="font-size: 11px; padding: 1px 4px; background: var(--su-bg-primary); color: var(--su-text-secondary);"
              title="Open Printable GRN Slip (${escapeHtml(g.grnCode)})"
              data-su-action="open-slip"
              data-slip-type="GRN"
              data-ref-code="${escapeHtml(g.grnCode)}"
              data-order-id="${escapeHtml(ord.orderId)}"
            >Slip</button>
          </span>
        `)
        .join('')}
      ${
        sliced.overflowCount > 0
          ? `<button type="button" class="su-chip-btn su-badge su-badge-grn" style="font-size: 11px; padding: 1px 6px;" data-su-action="inspect-order" data-order-id="${escapeHtml(ord.orderId)}">+${sliced.overflowCount} more</button>`
          : ''
      }
    </div>
  `;
}

function renderOrderReqChipsWithOverflow(ord: SuperUserOrderRollup): string {
  if (ord.reqBatches.length === 0) {
    return `<span style="font-size: 11px; color: var(--su-text-muted);">0 REQs</span>`;
  }
  const scored = ord.reqBatches.map(r => ({
    item: r,
    priorityScore:
      !r.reconciliation.isReconciled
        ? 4
        : r.inAlterationPairs > 0
          ? 3
          : r.awaitingFinalQc
            ? 2
            : r.reqLifecycleStatus !== 'CLOSED ✓'
              ? 1
              : 0,
    seq: r.orderReqSeq
  }));
  const sliced = prioritizeAndSliceChips(scored, 3);

  return `
    <div style="display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; align-items: center;">
      ${sliced.visible
        .map(({ item: r }) => `
          <span style="display: inline-flex; align-items: center; gap: 2px;">
            <button
              type="button"
              class="su-chip-btn su-badge su-badge-req"
              style="font-size: 11px; padding: 1px 6px;"
              title="${escapeHtml(r.reqNumber)} | ${escapeHtml(r.mreqNo)} | ${escapeHtml(r.altReqNo)} (${r.issuedPairs || r.askingPairs} Prs) — Click to inspect in Live Tracking"
              data-su-action="inspect-order"
              data-order-id="${escapeHtml(ord.orderId)}"
              data-ref-code="${escapeHtml(r.reqNumber)}"
            >${escapeHtml(r.reqNumber)}&middot;M&middot;A (${r.issuedPairs || r.askingPairs})</button>
            <button
              type="button"
              class="su-chip-btn"
              style="font-size: 11px; padding: 1px 4px; background: var(--su-bg-primary); color: var(--su-text-secondary);"
              title="Open Printable REQ Slip (${escapeHtml(r.reqNumber)})"
              data-su-action="open-slip"
              data-slip-type="REQ"
              data-ref-code="${escapeHtml(r.reqNumber)}"
              data-order-id="${escapeHtml(ord.orderId)}"
            >Slip</button>
          </span>
        `)
        .join('')}
      ${
        sliced.overflowCount > 0
          ? `<button type="button" class="su-chip-btn su-badge su-badge-req" style="font-size: 11px; padding: 1px 6px;" data-su-action="inspect-order" data-order-id="${escapeHtml(ord.orderId)}">+${sliced.overflowCount} more</button>`
          : ''
      }
    </div>
  `;
}

function renderDashboardTab(ctx: SuperUserRenderContext, totalScrapDeduction: number): string {
  const s = ctx.rollupSummary;
  const hasDemoOrder = s.orderRollups.some(o => o.orderId === 'ORD-2026-600');
  const rawSearch = ctx.locationSearch ?? (typeof window !== 'undefined' ? window.location.search : '');
  const hasDemoParam = /(?:^|[?&])demo=1(?:&|$)/.test(rawSearch);
  const demoDrawerOpen = hasDemoOrder || Boolean(ctx.demoDrawerOpen) || hasDemoParam;

  return `
    <!-- 5.6: Flagged & Removable 600-Pair Demo Scenario Drawer -->
    <details class="su-demo-drawer"${demoDrawerOpen ? ' open' : ''}>
      <summary>
        <div>
          <strong style="color: var(--su-text-primary);">Reconciliation Health:</strong>
          <span class="su-badge su-badge-reconciled" style="margin-left: 6px;">${s.reconciledOrdersCount} / ${s.totalOrders} Orders Reconciled &#10003;</span>
          ${
            s.varianceOrdersCount > 0
              ? `<span class="su-badge su-badge-variance" style="margin-left: 6px;">${s.varianceOrdersCount} Order Variance &Delta;</span>`
              : ''
          }
        </div>
        <span class="admin-meta-caption">Demo Scenario Controls &bull; Toggle</span>
      </summary>
      <div class="su-demo-drawer-actions">
        <button
          type="button"
          class="btn-outline"
          id="btn-load-demo-600-inprogress"
          style="padding: 4px 10px; font-size: 12px;"
          data-su-action="load-demo"
          data-demo-phase="IN_PROGRESS"
        >
          Load 600-Pair Demo (Step 5: S4 Hold + A-REQ Cycle 1/2)
        </button>
        <button
          type="button"
          class="btn-primary"
          id="btn-load-demo-600-complete"
          style="padding: 4px 10px; font-size: 12px;"
          data-su-action="load-demo"
          data-demo-phase="COMPLETED"
        >
          Load 600-Pair Demo (1-Order &rarr; 3-GRNs &rarr; 3-REQs Complete)
        </button>
        <button
          type="button"
          class="btn-outline"
          id="btn-load-demo-600-variance"
          style="padding: 4px 10px; font-size: 12px; color: var(--su-areq-dark); border-color: var(--su-areq-border);"
          data-su-action="load-demo"
          data-demo-phase="DELIBERATE_VARIANCE"
        >
          Force Deliberate Variance (11.6 &Delta;)
        </button>
        ${
          hasDemoOrder
            ? `
          <button
            type="button"
            class="btn-outline"
            id="btn-remove-demo-600"
            style="padding: 4px 10px; font-size: 12px; color: var(--su-areq-dark); border-color: var(--su-areq-border);"
            data-su-action="remove-demo"
          >
            Remove Demo Scenario
          </button>
        `
            : ''
        }
      </div>
    </details>

    <!-- Row 1: 4 Factory Pulse KPI Cards (5.1 & 5.5: Above the fold at 1440px desktop) -->
    <div class="admin-kpi-grid" data-testid="su-pulse-cards-grid" style="margin-bottom: 10px;">
      <div class="admin-kpi-card su-kpi-grn">
        <div class="admin-kpi-label">1. Order Book vs. Dock Receiving</div>
        <div class="admin-kpi-value" style="font-variant-numeric: tabular-nums; color: var(--su-grn-deep);">
          ${s.totalReceivedGrnPairs.toLocaleString()} / ${s.totalPlannedPairs.toLocaleString()} Prs
        </div>
        <div class="admin-kpi-sub" style="font-variant-numeric: tabular-nums;">
          ${s.totalOrders} Orders (${s.totalGrnCount} GRNs) &bull; Contractor Bal: <strong>${s.totalContractorBalancePairs.toLocaleString()} Prs</strong>
        </div>
      </div>

      <div class="admin-kpi-card su-kpi-mreq">
        <div class="admin-kpi-label">2. Dock Available Stock Pool</div>
        <div class="admin-kpi-value" style="font-variant-numeric: tabular-nums; color: var(--su-mreq-dark);">
          ${s.totalDockAvailablePairs.toLocaleString()} Prs Ready
        </div>
        <div class="admin-kpi-sub" style="font-variant-numeric: tabular-nums;">
          Issued to Floor: <strong>${s.totalIssuedReqPairs.toLocaleString()} Prs</strong> across <strong>${s.totalReqCount} REQs</strong>
        </div>
      </div>

      <div class="admin-kpi-card su-kpi-req">
        <div class="admin-kpi-label">3. Packing Hall Floor WIP &amp; Stage 4 Gate</div>
        <div class="admin-kpi-value" style="font-variant-numeric: tabular-nums; color: var(--su-req-primary);">
          ${s.totalFloorWipPairs.toLocaleString()} Prs in WIP
        </div>
        <div class="admin-kpi-sub" style="font-variant-numeric: tabular-nums;">
          Stage 4 Hold (Awaiting QC): <strong style="color: var(--su-mreq-dark);">${s.stage4ReadyForQcPairs.toLocaleString()} Prs</strong> &bull; Packed S5: <strong style="color: var(--su-complete-dark);">${s.stage5PackedPairs.toLocaleString()} Prs</strong>
        </div>
      </div>

      <div class="admin-kpi-card su-kpi-areq">
        <div class="admin-kpi-label">4. Alteration (A-REQ) &amp; Scrap Ledger</div>
        <div class="admin-kpi-value" style="font-variant-numeric: tabular-nums; color: var(--su-areq-primary);">
          ${s.totalAlterationPairs.toLocaleString()} Rework &bull; ${s.totalScrappedPairs.toLocaleString()} Scrap
        </div>
        <div class="admin-kpi-sub" style="font-variant-numeric: tabular-nums;">
          Completed Orders: <strong style="color: var(--su-complete-dark);">${s.completedOrders}/${s.totalOrders}</strong> &bull; Debit: <strong style="color: var(--su-areq-primary);">PKR ${totalScrapDeduction.toLocaleString()}</strong>
        </div>
      </div>
    </div>

    <!-- Row 2: Exceptions Strip (5.2: Stage 4 Awaiting Final QC + Active Alterations with Contractor & Cycle Count + Unfulfilled M-REQs) -->
    <div class="two-column-grid" data-testid="su-exceptions-strip" style="margin-bottom: 10px;">
      <section class="panel-card">
        <div class="panel-card-header">
          <div class="panel-card-title">
            <span>Stage 4 Complete &mdash; Holding for Final QC (Stage 5 Gate)</span>
            <span class="su-badge su-badge-mreq">${s.stage4HoldReqs.length} Lots</span>
          </div>
          <span class="admin-meta-caption">Stage 5 Locked Until AQL 1.5 Passes</span>
        </div>
        <div class="table-responsive" style="max-height: 220px; overflow-y: auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Parent Order</th>
                <th>Requisition #</th>
                <th>Material (M)</th>
                <th>Article</th>
                <th class="text-right">Stage 4 Ready</th>
                <th class="text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              ${
                s.stage4HoldReqs.length === 0
                  ? `
                <tr>
                  <td colspan="6" class="text-center" style="padding: 20px; color: var(--su-text-muted);">
                    No requisitions currently holding at Stage 4. Lots appear here once 1st Packing finishes and await Final Checking.
                  </td>
                </tr>
              `
                  : s.stage4HoldReqs
                      .map(
                        req => `
                <tr>
                  <td class="font-bold">${escapeHtml(req.parentOrderId)}</td>
                  <td><button type="button" class="su-chip-btn su-badge su-badge-req" data-su-action="open-slip" data-slip-type="REQ" data-ref-code="${escapeHtml(req.reqNumber)}" data-order-id="${escapeHtml(req.parentOrderId)}">${escapeHtml(req.reqNumber)}</button></td>
                  <td><button type="button" class="su-chip-btn su-badge su-badge-mreq" data-su-action="open-slip" data-slip-type="M-REQ" data-ref-code="${escapeHtml(req.mreqNo)}" data-order-id="${escapeHtml(req.parentOrderId)}">${escapeHtml(req.mreqNo)}</button></td>
                  <td>${escapeHtml(req.article)}</td>
                  <td class="text-right font-bold" style="color: var(--su-mreq-dark);">${req.stage4Passed.toLocaleString()} Prs</td>
                  <td class="text-center">
                    <button type="button" class="table-btn" data-su-action="open-req-screen" data-req-number="${escapeHtml(req.reqNumber)}" data-target-screen="screen-qc">Inspect in Final QC &rarr;</button>
                  </td>
                </tr>
              `
                      )
                      .join('')
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel-card">
        <div class="panel-card-header">
          <div class="panel-card-title">
            <span>Active Alterations (A-REQ &bull; Contractor &amp; Cycle) &amp; Unfulfilled M-REQs</span>
            <span class="su-badge su-badge-areq">${s.activeAlterationReqs.length + s.pendingIssueReqs.length + s.unfulfilledMreqReqs.length} Alerts</span>
          </div>
          <span class="admin-meta-caption">Mandatory Stage 1 Return &bull; Max 2 Cycles</span>
        </div>
        <div class="table-responsive" style="max-height: 220px; overflow-y: auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Ref #</th>
                <th>Order #</th>
                <th>Contractor / Maker</th>
                <th>Exception &amp; Cycle</th>
                <th class="text-right">Pairs</th>
                <th class="text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              ${
                s.activeAlterationReqs.length === 0 &&
                s.pendingIssueReqs.length === 0 &&
                s.unfulfilledMreqReqs.length === 0
                  ? `
                <tr>
                  <td colspan="6" class="text-center" style="padding: 20px; color: var(--su-text-muted);">
                    Zero active floor bottlenecks. All issued requisitions, M-REQ trims, and alteration loops are clear.
                  </td>
                </tr>
              `
                  : [
                      ...s.activeAlterationReqs.map(
                        req => `
                  <tr>
                    <td><button type="button" class="su-chip-btn su-badge su-badge-areq" data-su-action="open-slip" data-slip-type="A-REQ" data-ref-code="${escapeHtml(req.altReqNo)}" data-order-id="${escapeHtml(req.parentOrderId)}">${escapeHtml(req.altReqNo)}</button></td>
                    <td class="font-bold">${escapeHtml(req.parentOrderId)}</td>
                    <td class="font-bold">${escapeHtml(req.maker || '---')}</td>
                    <td><span class="su-badge su-badge-areq">Rework &bull; Cycle ${Math.min(2, Math.max(1, req.alterationCycleCount || 1))}/2</span></td>
                    <td class="text-right font-bold" style="color: var(--su-areq-primary);">${req.inAlterationPairs.toLocaleString()} Prs</td>
                    <td class="text-center">
                      <button type="button" class="table-btn" data-su-action="open-req-screen" data-req-number="${escapeHtml(req.reqNumber)}" data-target-screen="screen-repair">Open Bay #2</button>
                    </td>
                  </tr>
                `
                      ),
                      ...s.unfulfilledMreqReqs.map(
                        req => `
                  <tr>
                    <td><button type="button" class="su-chip-btn su-badge su-badge-mreq" data-su-action="open-slip" data-slip-type="M-REQ" data-ref-code="${escapeHtml(req.mreqNo)}" data-order-id="${escapeHtml(req.parentOrderId)}">${escapeHtml(req.mreqNo)}</button></td>
                    <td class="font-bold">${escapeHtml(req.parentOrderId)}</td>
                    <td>${escapeHtml(req.maker || '---')}</td>
                    <td><span class="su-badge su-badge-mreq">Unfulfilled M-REQ (${escapeHtml(req.mreqStatus)})</span></td>
                    <td class="text-right font-bold" style="color: var(--su-mreq-dark);">${req.issuedPairs.toLocaleString()} Prs</td>
                    <td class="text-center">
                      <button type="button" class="table-btn" data-su-action="open-req-screen" data-req-number="${escapeHtml(req.reqNumber)}" data-target-screen="screen-packing">Fulfill M-REQ</button>
                    </td>
                  </tr>
                `
                      ),
                      ...s.pendingIssueReqs.map(
                        req => `
                  <tr>
                    <td><button type="button" class="su-chip-btn su-badge su-badge-req" data-su-action="open-slip" data-slip-type="REQ" data-ref-code="${escapeHtml(req.reqNumber)}" data-order-id="${escapeHtml(req.parentOrderId)}">${escapeHtml(req.reqNumber)}</button></td>
                    <td class="font-bold">${escapeHtml(req.parentOrderId)}</td>
                    <td>${escapeHtml(req.maker || '---')}</td>
                    <td><span class="su-badge su-badge-grn">Awaiting Dock Issue (${escapeHtml(req.mreqNo)})</span></td>
                    <td class="text-right font-bold" style="color: var(--su-grn-deep);">${req.askingPairs.toLocaleString()} Prs</td>
                    <td class="text-center">
                      <button type="button" class="table-btn" data-su-action="open-req-screen" data-req-number="${escapeHtml(req.reqNumber)}" data-target-screen="screen-grn">Issue at Dock</button>
                    </td>
                  </tr>
                `
                      )
                    ].join('')
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- Row 3: Executive Master Order Pulse Table (5.3 & 5.4 — Above the fold at 1440×900) -->
    <section class="panel-card" id="su-active-orders-pulse-section" data-testid="su-active-orders-pulse" style="margin-bottom: 10px;">
      <div class="panel-card-header">
        <div class="panel-card-title">
          <span>Active Master Orders Pulse (Parent Order &rarr; Clickable GRN &amp; REQ &middot; M &middot; A Chips)</span>
          <span class="panel-counter-badge">${s.orderRollups.length} Orders</span>
        </div>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="btn-outline" style="padding: 4px 10px; font-size: 11px;" data-admin-tab-jump="orders">+ Create New Order</button>
          <button type="button" class="btn-primary" style="padding: 4px 10px; font-size: 11px;" data-admin-tab-jump="tracking">Open Full Live Tracking &rarr;</button>
        </div>
      </div>
      <div class="table-responsive" style="max-height: 340px; overflow-y: auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Order #</th>
              <th>Buyer</th>
              <th>Contractor</th>
              <th>PO #</th>
              <th>Article</th>
              <th class="text-right">Planned</th>
              <th class="text-right">Rcvd &amp; GRN Chips</th>
              <th class="text-right">Contr. Bal</th>
              <th class="text-right">Dock Pool</th>
              <th class="text-right">Issued &amp; REQ&middot;M&middot;A Chips</th>
              <th class="text-right">WIP / S4 Hold</th>
              <th class="text-right">Alt / Scrap</th>
              <th class="text-right">Packed (S5)</th>
              <th class="text-center">Delivery Timeline</th>
              <th class="text-center">Reconciliation</th>
              <th class="text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            ${
              s.orderRollups.length === 0
                ? `
              <tr>
                <td colspan="16" class="text-center" style="padding: 28px 16px; color: var(--su-text-muted);">
                  <div style="margin-bottom: 10px;">
                    No Master Orders created yet. Go to <strong>Order Creation</strong> to create a Buyer Order and issue it to Inward Receiving.
                  </div>
                  <button type="button" class="btn-outline" data-admin-tab-jump="orders">
                    Go to Order Creation
                  </button>
                </td>
              </tr>
            `
                : s.orderRollups
                    .map(
                      o => `
              <tr>
                <td class="font-bold">
                  <button type="button" class="su-chip-btn" style="color: var(--su-req-primary); background: var(--su-req-bg); border-color: var(--su-req-border);" data-su-action="inspect-order" data-order-id="${escapeHtml(o.orderId)}">${escapeHtml(o.orderId)}</button>
                </td>
                <td>${escapeHtml(o.buyer)}</td>
                <td>${escapeHtml(o.maker)}</td>
                <td class="font-bold">${escapeHtml(o.po)}</td>
                <td class="font-bold">${escapeHtml(o.article)}</td>
                <td class="text-right font-bold">${o.plannedQty.toLocaleString()}</td>
                <td class="text-right">
                  <div class="font-bold" style="color: var(--su-grn-deep); margin-bottom: 3px;">${o.receivedGrnQty.toLocaleString()} Prs (${o.grnBatches.length})</div>
                  ${renderOrderGrnChipsWithOverflow(o)}
                </td>
                <td class="text-right">${o.contractorBalanceQty.toLocaleString()}</td>
                <td class="text-right font-bold" style="color: var(--su-mreq-dark);">${o.dockAvailableQty.toLocaleString()}</td>
                <td class="text-right">
                  <div class="font-bold" style="color: var(--su-req-primary); margin-bottom: 3px;">${o.issuedReqQty.toLocaleString()} Prs (${o.reqBatches.length})</div>
                  ${renderOrderReqChipsWithOverflow(o)}
                </td>
                <td class="text-right">
                  ${o.inFloorWipQty.toLocaleString()} ${o.awaitingFinalQcQty > 0 ? `<span class="su-badge su-badge-mreq" style="font-size: 12px; padding: 0 4px;">S4:${o.awaitingFinalQcQty}</span>` : ''}
                </td>
                <td class="text-right" style="color: var(--su-areq-primary); font-weight: 700;">
                  ${o.inAlterationQty} / ${o.scrappedQty}
                </td>
                <td class="text-right font-bold" style="color: var(--su-complete-dark);">${o.packedStage5Qty.toLocaleString()}</td>
                <td class="text-center">${renderDeliveryCountdownChip(o.deliveryCountdown, false)}</td>
                <td class="text-center">${renderReconciliationBadge(o.reconciliation)}</td>
                <td class="text-center"><span class="${getSuperUserStatusBadgeClass(o.orderStatus)}">${escapeHtml(o.orderStatus)}</span></td>
              </tr>
            `
                    )
                    .join('')
            }
          </tbody>
        </table>
      </div>
    </section>

    <!-- Row 4: Visual Bar Graph + Order -> GRN -> REQ (M & A) Node Topology Graph -->
    <div style="margin-top: 12px;">
      ${renderDashboardVisualGraphs(s)}
    </div>
  `;
}

function renderLiveTrackingTab(ctx: SuperUserRenderContext): string {
  const s = ctx.rollupSummary;
  const search = (ctx.trackingSearch || '').trim().toLowerCase();
  const statusFilter = ctx.trackingStatusFilter || 'ALL';
  const buyerFilter = (ctx.trackingBuyerFilter || 'ALL').trim();
  const makerFilter = (ctx.trackingMakerFilter || 'ALL').trim();
  const pageSize = Math.max(5, Number(ctx.trackingPageSize || 10));
  const currentPage = Math.max(1, Number(ctx.trackingPage || 1));

  const uniqueBuyers = Array.from(new Set(s.orderRollups.map(o => o.buyer).filter(Boolean)));
  const uniqueMakers = Array.from(new Set(
    s.orderRollups.flatMap(o =>
      o.contractorAllocations && o.contractorAllocations.length > 0
        ? o.contractorAllocations.map(a => a.maker)
        : [o.maker]
    ).filter(Boolean)
  ));

  const filteredOrders = s.orderRollups.filter(o => {
    if (
      statusFilter === 'RECEIVING' &&
      o.orderStatus !== 'AWAITING DOCK #1 RECEIVING' &&
      o.orderStatus !== 'RECEIVING AT DOCK #1'
    ) {
      return false;
    }
    if (statusFilter === 'WIP' && o.orderStatus !== 'IN PACKING HALL WIP') {
      return false;
    }
    if (
      statusFilter === 'HOLD_QC' &&
      o.orderStatus !== 'AWAITING FINAL QC (STAGE 4)' &&
      o.awaitingFinalQcQty === 0
    ) {
      return false;
    }
    if (statusFilter === 'COMPLETED' && o.orderStatus !== 'COMPLETED & DISPATCHED') {
      return false;
    }
    if (buyerFilter !== 'ALL' && o.buyer !== buyerFilter) {
      return false;
    }
    if (
      makerFilter !== 'ALL' &&
      o.maker !== makerFilter &&
      !(o.contractorAllocations || []).some(a => a.maker === makerFilter)
    ) {
      return false;
    }
    if (!search) return true;
    const hay = [
      o.orderId,
      o.buyer,
      o.maker,
      ...(o.contractorAllocations || []).map(a => a.maker),
      o.po,
      o.article,
      o.color,
      ...o.grnBatches.map(g => g.grnCode),
      ...o.reqBatches.flatMap(r => [r.reqNumber, r.mreqNo, r.altReqNo])
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(search);
  });

  const urgencyRank = (o: SuperUserOrderRollup): number => {
    const st = o.deliveryCountdown?.status;
    if (st === 'OVERDUE') return 0;
    if (st === 'DUE_SOON') return 1;
    if (st === 'ON_TRACK') return 2;
    if (st === 'NO_DATE') return 3;
    return 4;
  };
  const sortedOrders = [...filteredOrders].sort((a, b) => urgencyRank(a) - urgencyRank(b));
  const totalPages = Math.max(1, Math.ceil(sortedOrders.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const pagedOrders = sortedOrders.slice(startIdx, startIdx + pageSize);

  return `
    <!-- 6.1 & 6.7: Live Tracking Filter, Buyer/Contractor Dropdowns, Search & Pagination Bar -->
    <section class="panel-card" style="padding: 12px 16px; margin-bottom: 14px;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 10px;">
        <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 280px; flex-wrap: wrap;">
          <label for="admin-tracking-search" style="font-size: 12px; font-weight: 700; color: var(--su-text-primary); text-transform: uppercase; white-space: nowrap;">
            Search:
          </label>
          <input
            type="text"
            id="admin-tracking-search"
            class="form-input su-tracking-search-input"
            placeholder="Order #, PO #, GRN-0001, REQ-0001, M-REQ, A-REQ..."
            value="${escapeHtml(ctx.trackingSearch || '')}"
          />

          <select
            id="admin-tracking-buyer-filter"
            class="form-select"
            style="max-width: 190px; font-size: 12px;"
            aria-label="Filter by Buyer"
            data-su-change="tracking-buyer-filter"
            ${uniqueBuyers.length === 0 ? 'disabled' : ''}
          >
            ${
              uniqueBuyers.length === 0
                ? `<option value="ALL" selected>No Buyers yet</option>`
                : `<option value="ALL" ${buyerFilter === 'ALL' ? 'selected' : ''}>All Buyers (${uniqueBuyers.length})</option>
                   ${uniqueBuyers.map(b => `<option value="${escapeHtml(b)}" ${buyerFilter === b ? 'selected' : ''}>${escapeHtml(b)}</option>`).join('')}`
            }
          </select>

          <select
            id="admin-tracking-maker-filter"
            class="form-select"
            style="max-width: 200px; font-size: 12px;"
            aria-label="Filter by Contractor"
            data-su-change="tracking-maker-filter"
            ${uniqueMakers.length === 0 ? 'disabled' : ''}
          >
            ${
              uniqueMakers.length === 0
                ? `<option value="ALL" selected>No Contractors yet</option>`
                : `<option value="ALL" ${makerFilter === 'ALL' ? 'selected' : ''}>All Contractors (${uniqueMakers.length})</option>
                   ${uniqueMakers.map(m => `<option value="${escapeHtml(m)}" ${makerFilter === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}`
            }
          </select>

          ${
            filteredOrders.length > 0
              ? `
            <div style="display: inline-flex; align-items: center; gap: 4px;">
              <button
                type="button"
                class="btn-outline"
                style="padding: 4px 10px; font-size: 12px;"
                data-su-action="expand-all"
                data-expanded="true"
              >
                Expand All
              </button>
              <button
                type="button"
                class="btn-outline"
                style="padding: 4px 10px; font-size: 12px;"
                data-su-action="expand-all"
                data-expanded="false"
              >
                Collapse All
              </button>
            </div>
          `
              : ''
          }
        </div>

        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
          <button type="button" class="${statusFilter === 'ALL' ? 'btn-primary' : 'btn-outline'} admin-tracking-filter-btn" data-tracking-filter="ALL">
            All Orders (${s.orderRollups.length})
          </button>
          <button type="button" class="${statusFilter === 'RECEIVING' ? 'btn-primary' : 'btn-outline'} admin-tracking-filter-btn" data-tracking-filter="RECEIVING">
            Dock Receiving
          </button>
          <button type="button" class="${statusFilter === 'WIP' ? 'btn-primary' : 'btn-outline'} admin-tracking-filter-btn" data-tracking-filter="WIP">
            In Floor WIP
          </button>
          <button type="button" class="${statusFilter === 'HOLD_QC' ? 'btn-primary' : 'btn-outline'} admin-tracking-filter-btn" data-tracking-filter="HOLD_QC">
            Stage 4 Hold (Final QC)
          </button>
          <button type="button" class="${statusFilter === 'COMPLETED' ? 'btn-primary' : 'btn-outline'} admin-tracking-filter-btn" data-tracking-filter="COMPLETED">
            Completed (${s.completedOrders})
          </button>
        </div>
      </div>

      ${
        totalPages > 1
          ? `
        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px solid var(--su-border-subtle); font-size: 11px; color: var(--su-text-secondary);">
          <span>Showing orders <strong>${startIdx + 1}&ndash;${Math.min(filteredOrders.length, startIdx + pageSize)}</strong> of <strong>${filteredOrders.length}</strong></span>
          <div style="display: inline-flex; gap: 6px; align-items: center;">
            <button type="button" class="btn-outline" style="padding: 2px 8px; font-size: 11px;" ${safePage <= 1 ? 'disabled' : ''} data-su-action="tracking-page" data-page="${safePage - 1}">&larr; Prev</button>
            <span>Page <strong>${safePage}</strong> / ${totalPages}</span>
            <button type="button" class="btn-outline" style="padding: 2px 8px; font-size: 11px;" ${safePage >= totalPages ? 'disabled' : ''} data-su-action="tracking-page" data-page="${safePage + 1}">Next &rarr;</button>
          </div>
        </div>
      `
          : ''
      }
    </section>

    <!-- Real-Time WIP Analytics Bar Chart (Planned Demand vs. Actual Packed Pairs per Active Requisition) -->
    ${(() => {
      const series = buildRequisitionAnalyticsSeries(s, undefined, true);
      return renderRequisitionWipAnalyticsChart({
        series,
        mode: 'super-user'
      });
    })()}

    <!-- Hierarchical Parent Order -> Multiple GRNs & Multiple REQs Board -->
    ${
      pagedOrders.length === 0
        ? `
      <section class="panel-card" style="padding: 36px 20px; text-align: center;">
        <div style="font-size: 14px; font-weight: 700; color: var(--su-text-primary); margin-bottom: 6px;">
          No Matching Orders in Live Tracking
        </div>
        <div style="font-size: 12.5px; color: var(--su-text-secondary); margin-bottom: 14px;">
          Create a Master Order in <strong>Order Creation</strong>, receive partial or full GRN batches at <strong>Inward Register</strong>, and draw Packing Hall Requisitions to see the live parent-child tree here.
        </div>
        <button type="button" class="btn-primary" data-admin-tab-jump="orders">Go to Order Creation &rarr;</button>
      </section>
    `
        : pagedOrders
            .map((ord: SuperUserOrderRollup) => {
              const isExpanded = ctx.expandedOrderIds[ord.orderId] !== false;
              const plan = Math.max(1, ord.plannedQty || ord.receivedGrnQty || 1);
              const pctReceived =
                ord.plannedQty > 0
                  ? Math.min(100, Math.round((ord.receivedGrnQty / ord.plannedQty) * 100))
                  : 0;
              const pctPacked =
                ord.plannedQty > 0
                  ? Math.min(
                      100,
                      Math.round(((ord.packedStage5Qty + ord.scrappedQty) / ord.plannedQty) * 100)
                    )
                  : 0;
              const s5Pct = Math.min(100, Math.round((ord.packedStage5Qty / plan) * 100));
              const s4Pct = Math.min(
                100 - s5Pct,
                Math.round((ord.awaitingFinalQcQty / plan) * 100)
              );
              const wipOnly = Math.max(0, ord.inFloorWipQty - ord.awaitingFinalQcQty);
              const wipPct = Math.min(100 - s5Pct - s4Pct, Math.round((wipOnly / plan) * 100));
              const altPct = Math.min(
                100 - s5Pct - s4Pct - wipPct,
                Math.round(((ord.inAlterationQty + ord.scrappedQty) / plan) * 100)
              );

              return `
        <section class="su-order-card ${isExpanded ? 'expanded' : 'collapsed'}" id="tracking-order-card-${escapeHtml(ord.orderId)}" data-order-card="${escapeHtml(ord.orderId)}">
          <!-- Tier 1: Parent Master Order Header Banner (6.2) -->
          <div class="su-order-card-header">
            <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
              <button
                type="button"
                class="btn-outline"
                style="padding: 3px 8px; font-size: 11px; font-weight: 800;"
                data-su-action="toggle-order-expand"
                data-order-id="${escapeHtml(ord.orderId)}"
                aria-expanded="${isExpanded ? 'true' : 'false'}"
              >
                ${isExpanded ? '&#9660; Collapse' : '&#9654; Expand'}
              </button>
              <div>
                <div style="font-size: 13.5px; font-weight: 800; color: var(--su-text-primary); display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  <span style="color: var(--su-req-primary);">MASTER ORDER: ${escapeHtml(ord.orderId)}</span>
                  <span style="font-weight: 400; color: var(--su-text-muted);">|</span>
                  <span>PO #${escapeHtml(ord.po)}</span>
                  <span style="font-weight: 400; color: var(--su-text-muted);">|</span>
                  <span>${escapeHtml(ord.article)} (${escapeHtml(ord.color)})</span>
                  <span style="font-weight: 400; color: var(--su-text-muted);">|</span>
                  <span style="font-family: var(--font-mono); font-size: 11.5px; color: var(--su-text-secondary);">Plan: <strong>${ord.plannedQty.toLocaleString()} Prs</strong></span>
                  ${renderDeliveryCountdownChip(ord.deliveryCountdown, true)}
                  ${renderReconciliationBadge(ord.reconciliation)}
                </div>
                ${(() => {
                  const scaleCodes = ord.sizeCodes && ord.sizeCodes.length > 0 ? ord.sizeCodes : Object.keys(ord.sizes || {});
                  const fmtCodes = scaleCodes.length > 0 ? scaleCodes : ['7', '8', '9', '10', '11'];
                  const plannedTxt = fmtCodes.map(sz => `${escapeHtml(sz)}:${ord.sizes?.[sz] || 0}`).join(' | ');
                  const packedTxt = fmtCodes.map(sz => `${escapeHtml(sz)}:${ord.packedSizes?.[sz] || 0}`).join(' | ');
                  return `
                <div style="font-size: 11.5px; color: var(--su-text-secondary); margin-top: 2px;">
                  Buyer: <strong style="color: var(--su-text-primary);">${escapeHtml(ord.buyer)}</strong> &bull; Contractor / Maker: <strong style="color: var(--su-text-primary);">${escapeHtml(ord.maker)}</strong>${ord.sizeFormat && ord.sizeFormat !== 'LEGACY_7_11' ? ` &bull; <span class="status-pill">${escapeHtml(ord.sizeFormat)}</span>` : ''} &bull;
                  Planned Sizes: <strong>${plannedTxt}</strong> &bull;
                  Packed S5 Sizes: <strong>${packedTxt}</strong>
                </div>`;
                })()}
                ${
                  (ord.contractorAllocations || []).length > 1
                    ? `
                  <div class="su-contractor-chips" data-testid="order-contractor-splits">
                    ${(ord.contractorAllocations || []).map(a => {
                      const splitCd = a.dueDate
                        ? computeDeliveryCountdown({ dueDate: a.dueDate, createdAt: ord.createdAt, isCompleted: Number(a.remainingPairs ?? a.totalQty) === 0 })
                        : null;
                      return `
                      <span class="su-contractor-chip">
                        <strong>${escapeHtml(a.maker)}</strong>:
                        Rcvd <strong>${Number(a.receivedPairs || 0).toLocaleString()}</strong> / ${a.totalQty.toLocaleString()} Prs
                        (Bal: <strong>${Number(a.remainingPairs ?? a.totalQty).toLocaleString()}</strong>)${splitCd?.hasDueDate ? ` &bull; ${escapeHtml(splitCd.badgeText)}` : ''}
                      </span>`;
                    }).join('')}
                  </div>
                `
                    : ''
                }
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <!-- 6.6: Planned vs. Packed visual progress bar per Order -->
              <div style="display: flex; flex-direction: column; gap: 2px; min-width: 155px;" title="Planned: ${ord.plannedQty} Prs | Stage 5 Packed: ${ord.packedStage5Qty} Prs | Stage 4 QC Hold: ${ord.awaitingFinalQcQty} Prs | Floor WIP: ${wipOnly} Prs | Alteration/Scrap: ${ord.inAlterationQty + ord.scrappedQty} Prs">
                <div style="display: flex; justify-content: space-between; font-size: 12px; font-family: var(--font-mono); color: var(--su-text-secondary);">
                  <span>GRN:${pctReceived}%</span>
                  <strong style="color: var(--su-complete-dark);">Packed:${ord.packedStage5Qty}/${ord.plannedQty} (${pctPacked}%)</strong>
                </div>
                <div style="height: 7px; background: var(--su-border-subtle); border: 1px solid var(--su-border); border-radius: 3px; overflow: hidden; display: flex;">
                  <div style="width: ${s5Pct}%; height: 100%; background: var(--su-complete-primary);"></div>
                  <div style="width: ${s4Pct}%; height: 100%; background: var(--su-mreq-primary);"></div>
                  <div style="width: ${wipPct}%; height: 100%; background: var(--su-req-accent);"></div>
                  <div style="width: ${altPct}%; height: 100%; background: var(--su-areq-primary);"></div>
                </div>
              </div>

              <span class="${getSuperUserStatusBadgeClass(ord.orderStatus)}">${escapeHtml(ord.orderStatus)}</span>
              <button
                type="button"
                class="btn-outline"
                style="padding: 4px 10px; font-size: 11px; border-color: var(--su-grn-border); background: var(--su-grn-bg); color: var(--su-grn-dark); font-weight: 700;"
                data-su-action="quick-receive-grn"
                data-order-id="${escapeHtml(ord.orderId)}"
              >
                + Receive GRN Batch (Dock)
              </button>
              <button
                type="button"
                class="btn-primary"
                style="padding: 4px 10px; font-size: 11px;"
                data-su-action="quick-create-req"
                data-order-id="${escapeHtml(ord.orderId)}"
              >
                + Draw REQ Batch (Packing Hall)
              </button>
              ${
                ord.contractorBalanceQty > 0 && ord.receivedGrnQty > 0 && !ord.shortClosed
                  ? `
                <button
                  type="button"
                  class="btn-outline"
                  style="padding: 4px 8px; font-size: 11px;"
                  title="Close order short-shipped at ${ord.receivedGrnQty} received pairs"
                  data-su-action="short-close-order"
                  data-order-id="${escapeHtml(ord.orderId)}"
                >
                  Short-Close Order
                </button>
              `
                  : ''
              }
            </div>
          </div>

          ${
            isExpanded
              ? `
            <!-- Parent Order Quantitative Reconciliation Strip (3.1 - 3.5) -->
            <div class="su-order-reconcile-strip">
              <div>
                <div style="color: var(--su-text-muted); font-size: 12px; text-transform: uppercase;">Planned Qty</div>
                <div style="font-weight: 800; font-size: 13px; color: var(--su-text-primary);">${ord.plannedQty.toLocaleString()} Prs</div>
              </div>
              <div>
                <div style="color: var(--su-grn-dark); font-size: 12px; text-transform: uppercase; font-weight: 700;">Rcvd (${ord.grnBatches.length} GRNs)</div>
                <div style="font-weight: 800; font-size: 13px; color: var(--su-grn-deep);">${ord.receivedGrnQty.toLocaleString()} Prs (${pctReceived}%)</div>
              </div>
              <div>
                <div style="color: var(--su-text-muted); font-size: 12px; text-transform: uppercase;">Contractor Bal</div>
                <div style="font-weight: 800; font-size: 13px; color: var(--su-text-primary);">${ord.contractorBalanceQty.toLocaleString()} Prs</div>
              </div>
              <div>
                <div style="color: var(--su-text-muted); font-size: 12px; text-transform: uppercase;">Dock Pool</div>
                <div style="font-weight: 800; font-size: 13px; color: var(--su-mreq-dark);">${ord.dockAvailableQty.toLocaleString()} Prs</div>
              </div>
              <div>
                <div style="color: var(--su-req-primary); font-size: 12px; text-transform: uppercase; font-weight: 700;">Issued (${ord.reqBatches.length} REQs)</div>
                <div style="font-weight: 800; font-size: 13px; color: var(--su-req-primary);">${ord.issuedReqQty.toLocaleString()} Prs</div>
              </div>
              <div>
                <div style="color: var(--su-mreq-dark); font-size: 12px; text-transform: uppercase; font-weight: 700;">Floor WIP / S4 Hold</div>
                <div style="font-weight: 800; font-size: 13px; color: var(--su-mreq-dark);">${ord.inFloorWipQty.toLocaleString()} Prs ${ord.awaitingFinalQcQty > 0 ? `(S4: ${ord.awaitingFinalQcQty})` : ''}</div>
              </div>
              <div>
                <div style="color: var(--su-areq-primary); font-size: 12px; text-transform: uppercase; font-weight: 700;">Alter (A) / Scrap</div>
                <div style="font-weight: 800; font-size: 13px; color: var(--su-areq-primary);">${ord.inAlterationQty} / ${ord.scrappedQty} Prs</div>
              </div>
              <div>
                <div style="color: var(--su-complete-dark); font-size: 12px; text-transform: uppercase; font-weight: 700;">Packed Stage 5</div>
                <div style="font-weight: 800; font-size: 13px; color: var(--su-complete-dark);">${ord.packedStage5Qty.toLocaleString()} Prs (${ord.packedStage5Cartons} Ctns)</div>
              </div>
            </div>

            <!-- Tier 2 Dual Child Streams: Left = GRN Batches (6.3), Right = REQ Lots (6.4 & 6.5) -->
            <div class="two-column-grid" style="padding: 12px 16px; gap: 14px;">
              <!-- Child Stream 1: Inward Dock GRN Batches with REQ Allocation Status (6.3) -->
              <div style="border: 1px solid var(--su-grn-border); border-radius: 5px; background: var(--su-white); overflow: hidden;">
                <div style="padding: 8px 12px; background: var(--su-grn-bg); border-bottom: 1px solid var(--su-grn-border); display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-size: 11.5px; font-weight: 800; color: var(--su-grn-dark); text-transform: uppercase;">
                    Supply Stream: Inward GRN Batches (${ord.grnBatches.length})
                  </span>
                  <span style="font-size: 11px; color: var(--su-grn-deep);">
                    Rcvd: <strong>${ord.receivedGrnQty.toLocaleString()}</strong> / ${ord.plannedQty.toLocaleString()} Prs
                  </span>
                </div>
                <div class="table-responsive">
                  <table class="data-table" style="margin: 0;">
                    <thead>
                      <tr>
                        <th>Batch</th>
                        <th>GRN Code</th>
                        <th>Date</th>
                        <th class="text-center">Sizes (7/8/9/10/11)</th>
                        <th class="text-right">Rcvd</th>
                        <th>Allocated to REQs</th>
                        <th class="text-center">Slip / Void</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${
                        ord.grnBatches.length === 0
                          ? `
                        <tr>
                          <td colspan="7" class="text-center" style="padding: 16px; color: var(--su-text-muted); font-size: 12px;">
                            No GRN batches received yet for ${escapeHtml(ord.orderId)}. Click <strong>+ Receive GRN Batch</strong> above when contractor goods arrive at Dock.
                          </td>
                        </tr>
                      `
                          : ord.grnBatches
                              .map((g: SuperUserGrnBatchItem) => {
                                const isHighlighted = ctx.highlightedRefCode === g.grnCode;
                                const voidCheck = canVoidGrnBatch(g);
                                return `
                        <tr id="tracking-chip-row-${escapeHtml(g.grnCode)}" style="${isHighlighted ? 'background: var(--su-grn-bg);' : ''}">
                          <td class="font-bold">Batch #${g.orderBatchSeq}</td>
                          <td><span class="su-badge su-badge-grn" style="font-family: var(--font-mono);">${escapeHtml(g.grnCode)}</span></td>
                          <td>${escapeHtml(g.date)}</td>
                          <td class="text-center" style="font-size: 11px;">
                            ${(() => {
                              const ordCodes = ord.sizeCodes && ord.sizeCodes.length > 0 ? ord.sizeCodes : ['7', '8', '9', '10', '11'];
                              const isLegacy = (ord.sizeFormat || 'LEGACY_7_11') === 'LEGACY_7_11';
                              return isLegacy
                                ? ordCodes.map(sz => g.sizes?.[sz] || 0).join('/')
                                : ordCodes.filter(sz => Number(g.sizes?.[sz] || 0) > 0).map(sz => `${escapeHtml(sz)}:${g.sizes?.[sz] || 0}`).join(' / ') || '0';
                            })()}
                          </td>
                          <td class="text-right font-bold" style="color: var(--su-grn-dark);">${g.rcvdPairs.toLocaleString()} Prs</td>
                          <td style="font-size: 11px;">
                            <div><span class="${getSuperUserStatusBadgeClass(g.allocationStatus)}">${escapeHtml(g.allocationStatus)}</span></div>
                            ${
                              g.allocatedToReqs.length > 0
                                ? `<div style="font-family: var(--font-mono); color: var(--su-text-secondary); margin-top: 2px;">&rarr; ${g.allocatedToReqs.map(a => `${escapeHtml(a.reqNumber)} (${a.pairs})`).join(', ')}</div>`
                                : `<div style="color: var(--su-text-muted); margin-top: 2px;">Dock Pool: ${g.unallocatedPairs} Prs</div>`
                            }
                          </td>
                          <td class="text-center" style="white-space: nowrap;">
                            <button type="button" class="table-btn" data-su-action="open-slip" data-slip-type="GRN" data-ref-code="${escapeHtml(g.grnCode)}" data-order-id="${escapeHtml(ord.orderId)}">Slip</button>
                            ${
                              voidCheck.allowed
                                ? `<button type="button" class="table-btn" style="color: var(--su-areq-primary);" title="${escapeHtml(voidCheck.reason)}" data-su-action="void-grn" data-grn-sr="${g.sr}" data-grn-code="${escapeHtml(g.grnCode)}">Void</button>`
                                : ''
                            }
                          </td>
                        </tr>
                      `;
                              })
                              .join('')
                      }
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- Child Stream 2: Packing Hall Requisitions with M-REQ, A-REQ & Per-REQ Reconciliation Badge (6.4 & 6.5) -->
              <div style="border: 1px solid var(--su-req-border); border-radius: 5px; background: var(--su-white); overflow: hidden;">
                <div style="padding: 8px 12px; background: var(--su-req-bg); border-bottom: 1px solid var(--su-req-border); display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-size: 12px; font-weight: 800; color: var(--su-req-primary); text-transform: uppercase;">
                    Execution Stream: Packing Hall Requisitions (${ord.reqBatches.length} REQs &rarr; M &amp; A)
                  </span>
                  <span style="font-size: 12px; color: var(--su-req-deep);">
                    Issued: <strong>${ord.issuedReqQty.toLocaleString()}</strong> Prs &bull; Packed S5: <strong style="color: var(--su-complete-dark);">${ord.packedStage5Qty.toLocaleString()}</strong> Prs
                  </span>
                </div>
                <div class="table-responsive">
                  <table class="data-table" style="margin: 0;">
                    <thead>
                      <tr>
                        <th>REQ # &amp; Source GRNs</th>
                        <th>M-Prefix &amp; A-Prefix Slips</th>
                        <th class="text-right">Issued</th>
                        <th>5-Stage Progress</th>
                        <th class="text-right">WIP / A / S5</th>
                        <th class="text-center">Reconcile &amp; Status</th>
                        <th class="text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${
                        ord.reqBatches.length === 0
                          ? `
                        <tr>
                          <td colspan="7" class="text-center" style="padding: 16px; color: var(--su-text-muted); font-size: 12px;">
                            No Packing Requisitions drawn yet for ${escapeHtml(ord.orderId)}. Click <strong>+ Draw REQ Batch</strong> to generate <code>REQ-0001</code> (with <code>M-REQ-0001</code> &amp; <code>A-REQ-0001</code>).
                          </td>
                        </tr>
                      `
                          : ord.reqBatches
                              .map((r: SuperUserReqBatchItem) => {
                                const isHighlighted = ctx.highlightedRefCode === r.reqNumber;
                                const voidCheck = canVoidRequisitionLot({
                                  reqNumber: r.reqNumber,
                                  stage1Passed: r.stage1Passed,
                                  outputPairs: r.packedStage5Pairs
                                });
                                return `
                        <tr id="tracking-chip-row-${escapeHtml(r.reqNumber)}" style="${isHighlighted ? 'background: var(--su-req-bg);' : ''}">
                          <td style="font-family: var(--font-mono);">
                            <div>
                              <button type="button" class="su-chip-btn su-badge su-badge-req" data-su-action="open-slip" data-slip-type="REQ" data-ref-code="${escapeHtml(r.reqNumber)}" data-order-id="${escapeHtml(ord.orderId)}">#${r.orderReqSeq} &bull; ${escapeHtml(r.reqNumber)}</button>
                            </div>
                            ${
                              r.allocatedFromGrns.length > 0
                                ? `<div style="font-size: 11px; color: var(--su-grn-dark); margin-top: 2px;">From: ${r.allocatedFromGrns.map(a => `${escapeHtml(a.grnCode)}(${a.pairs})`).join(' + ')}</div>`
                                : ''
                            }
                          </td>
                          <td style="font-family: var(--font-mono); font-size: 11px;">
                            <div style="margin-bottom: 2px;">
                              <button type="button" class="su-chip-btn su-badge su-badge-mreq" style="font-size: 11px; padding: 1px 5px;" data-su-action="open-slip" data-slip-type="M-REQ" data-ref-code="${escapeHtml(r.mreqNo)}" data-order-id="${escapeHtml(ord.orderId)}">${escapeHtml(r.mreqNo)}</button>
                              <span style="color: var(--su-text-secondary); font-size: 11px;">(${escapeHtml(r.mreqStatus)})</span>
                            </div>
                            <div>
                              <button type="button" class="su-chip-btn su-badge su-badge-areq" style="font-size: 11px; padding: 1px 5px;" data-su-action="open-slip" data-slip-type="A-REQ" data-ref-code="${escapeHtml(r.altReqNo)}" data-order-id="${escapeHtml(ord.orderId)}">${escapeHtml(r.altReqNo)}</button>
                              <span style="color: var(--su-text-secondary); font-size: 11px;">(${r.inAlterationPairs} rework${r.alterationCycleCount > 0 ? ` C${r.alterationCycleCount}/2` : ''})</span>
                            </div>
                          </td>
                          <td class="text-right font-bold" style="color: var(--su-req-primary);">
                            ${r.issuedPairs > 0 ? `${r.issuedPairs.toLocaleString()} Prs` : `Ask: ${r.askingPairs.toLocaleString()}`}
                          </td>
                          <td>
                            ${renderStageMiniTrack(r.activeStage, r.awaitingFinalQc, r.reqLifecycleStatus === 'CLOSED ✓')}
                            ${
                              r.awaitingFinalQc
                                ? `<div style="margin-top: 3px;"><span class="su-badge su-badge-mreq" style="font-size: 11px;">[STAGE 4 DONE &mdash; AWAITING FINAL QC]</span></div>`
                                : ''
                            }
                          </td>
                          <td class="text-right" style="font-family: var(--font-mono); font-size: 12px;">
                            <span style="color: var(--su-req-accent);">WIP:${r.inFloorWipPairs}</span> | <span style="color: var(--su-areq-primary);">A:${r.inAlterationPairs}/S:${r.scrappedPairs}</span> | <span style="color: var(--su-complete-dark); font-weight: 700;">S5:${r.packedStage5Pairs}</span>
                          </td>
                          <td class="text-center">
                            <div style="margin-bottom: 3px;">${renderReconciliationBadge(r.reconciliation)}</div>
                            <span class="${getSuperUserStatusBadgeClass(r.reqLifecycleStatus)}">${escapeHtml(r.reqLifecycleStatus)}</span>
                          </td>
                          <td class="text-center" style="white-space: nowrap;">
                            <button type="button" class="table-btn" data-su-action="open-req-screen" data-req-number="${escapeHtml(r.reqNumber)}" data-target-screen="screen-packing">Floor</button>
                            ${
                              voidCheck.allowed
                                ? `<button type="button" class="table-btn" style="color: var(--su-areq-primary);" title="${escapeHtml(voidCheck.reason)}" data-su-action="void-req" data-req-number="${escapeHtml(r.reqNumber)}">Void</button>`
                                : ''
                            }
                          </td>
                        </tr>
                      `;
                              })
                              .join('')
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          `
              : ''
          }
        </section>
      `;
            })
            .join('')
    }
  `;
}

function renderOrderCreationTab(ctx: SuperUserRenderContext): string {
  const ov = ctx.adminOverview;
  const counts = ov.dbHealth.tableCounts || {};
  const totalRows = Object.values(counts).reduce((sum: number, n: any) => sum + Number(n || 0), 0);
  const auditTrail: AuditTrailEntry[] = ctx.auditTrail || [];
  const draft = ctx.orderDraft || {
    customerId: '',
    buyer: '',
    maker: '',
    po: '',
    productId: '',
    article: '',
    color: '',
    sizeFormat: 'LEGACY_7_11',
    dueDate: '',
    sizes: { '7': 0, '8': 0, '9': 0, '10': 0, '11': 0 }
  };

  const allCustomers: any[] = ov.customers || [];
  const allProducts: CatalogProductOption[] = (ov.products || []).slice().sort((a, b) => {
    const aIsLegacy = String(a.size_format || 'LEGACY_7_11') === 'LEGACY_7_11' ? 0 : 1;
    const bIsLegacy = String(b.size_format || 'LEGACY_7_11') === 'LEGACY_7_11' ? 0 : 1;
    if (aIsLegacy !== bIsLegacy) return aIsLegacy - bIsLegacy;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
  const buyerMatchedCatalog = draft.buyer
    ? filterProductsByBuyer(allProducts, allCustomers, draft.customerId || draft.buyer)
    : allProducts;
  const legacyFallbackArticles = allProducts.filter(p => (p.size_format || 'LEGACY_7_11') === 'LEGACY_7_11');
  const usingFallbackArticles = Boolean(draft.buyer) && buyerMatchedCatalog.length === 0;
  const filteredCatalog = draft.buyer
    ? (buyerMatchedCatalog.length > 0 ? buyerMatchedCatalog : (legacyFallbackArticles.length > 0 ? legacyFallbackArticles : allProducts))
    : allProducts;
  const selectedProduct =
    filteredCatalog.find(p => draft.productId && p.id === draft.productId) ||
    filteredCatalog.find(p => draft.article && p.name === draft.article) ||
    allProducts.find(p => draft.productId && p.id === draft.productId);

  const activeSizeFormat = String(draft.sizeFormat || selectedProduct?.size_format || 'LEGACY_7_11').trim() || 'LEGACY_7_11';
  const activeSizeCodes = getScaleSizeCodes(ov.sizeStandards, activeSizeFormat);
  const draftTotal = calculateSizeTotal(draft.sizes);
  const splitRows = ctx.orderSplitRows || [];
  const splitActive = splitRows.length > 0;
  const splitValidation = splitActive
    ? validateContractorAllocations(draft.sizes, splitRows, activeSizeCodes)
    : null;
  const catalogColorSpec = selectedProduct ? String(selectedProduct.color_spec || selectedProduct.raw_color || '').trim() : '';

  return `
    <!-- 7.1: Super User Master Order Creation Suite (Primary View) -->
    <section class="panel-card" style="margin-bottom: 14px;">
      <div class="panel-card-header">
        <div class="panel-card-title">
          <span>1. Super User Master Order Creation &amp; Pending Orders Hub (SQLite Persistent)</span>
          <span class="panel-counter-badge">${ctx.pendingOrders.length} Database Orders</span>
        </div>
        <span class="admin-meta-caption">Parent Order Container &mdash; Receives Multiple GRNs (0001, 0002...) &amp; Multiple REQs (0001, 0002... &rarr; M &amp; A)</span>
      </div>
      <div style="padding: 14px 16px;">
        <div class="su-order-form-grid">
          <div class="form-group">
            <label for="admin-pending-order-id">Order Reference (system assigned)</label>
            <input type="text" id="admin-pending-order-id" class="form-input" placeholder="Assigned on save" readonly aria-readonly="true" />
            <small>Assigned by the server after save; this reference cannot be changed.</small>
          </div>

          <div class="form-group">
            <label for="admin-pending-order-buyer">Buyer / Customer</label>
            <select id="admin-pending-order-buyer" class="form-select">
              <option value="">-- Choose Buyer (${allCustomers.length || ctx.dropdownOptions.customers.length}) --</option>
              ${(allCustomers.length
                ? allCustomers.map(
                    (c: any) => `<option value="${escapeHtml(c.name)}" data-customer-id="${escapeHtml(c.id)}" ${draft.buyer === c.name ? 'selected' : ''}>${escapeHtml(c.name)}${c.country ? ` (${escapeHtml(c.country)})` : ''}</option>`
                  )
                : ctx.dropdownOptions.customers.map(c => `<option value="${escapeHtml(c)}" ${draft.buyer === c ? 'selected' : ''}>${escapeHtml(c)}</option>`)
              ).join('')}
            </select>
          </div>

          <div class="form-group">
            <label for="admin-pending-order-maker">${splitActive ? 'Primary Contractor' : 'Contractor / Maker'} <span class="su-required-mark" aria-hidden="true">*</span></label>
            <select id="admin-pending-order-maker" class="form-select" required aria-required="true" ${splitActive ? 'disabled title="Contractors are assigned in the Split Allocation table below."' : ''}>
              <option value="">-- Choose Contractor --</option>
              ${ctx.dropdownOptions.makers.map(m => `<option value="${escapeHtml(m)}" ${draft.maker === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label for="admin-pending-order-po">PO Number</label>
            <input type="text" id="admin-pending-order-po" class="form-input" placeholder="e.g. 27351" list="admin-po-preset-list" value="${escapeHtml(draft.po)}" />
            <datalist id="admin-po-preset-list">
              ${ctx.dropdownOptions.poList.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('')}
            </datalist>
          </div>

          <div class="form-group">
            <label for="admin-pending-order-article">Article <span class="su-required-mark" aria-hidden="true">*</span></label>
            <select id="admin-pending-order-article" class="form-select" required aria-required="true">
              <option value="">${
                draft.buyer
                  ? (usingFallbackArticles
                      ? `-- Choose Generic Article (${filteredCatalog.length} available; 0 buyer-specific SKUs) --`
                      : `-- Choose Article (${filteredCatalog.length} for ${escapeHtml(draft.buyer)}) --`)
                  : '-- Choose Buyer First (or pick Article) --'
              }</option>
              ${allProducts.length
                ? filteredCatalog
                    .map(p => {
                      const codeBadge = p.article_code ? `${p.article_code} — ` : '';
                      const label = draft.buyer ? `${codeBadge}${p.name}` : `${codeBadge}${p.name} [${p.customer_name || p.customer_id}]`;
                      const isSel = selectedProduct ? selectedProduct.id === p.id : draft.article === p.name;
                      return `<option value="${escapeHtml(p.name)}" data-product-id="${escapeHtml(p.id)}" data-customer-id="${escapeHtml(p.customer_id)}" data-customer-name="${escapeHtml(p.customer_name || '')}" data-size-format="${escapeHtml(p.size_format || 'LEGACY_7_11')}" data-color-spec="${escapeHtml(p.color_spec || p.raw_color || '')}" ${isSel ? 'selected' : ''}>${escapeHtml(label)}</option>`;
                    })
                    .join('')
                : ctx.dropdownOptions.articles.map(a => `<option value="${escapeHtml(a)}" ${draft.article === a ? 'selected' : ''}>${escapeHtml(a)}</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label for="admin-pending-order-color">Colour / Shade</label>
            <input type="text" id="admin-pending-order-color" class="form-input" placeholder="Auto-filled from article (or enter custom)" value="${escapeHtml(draft.color)}" />
            ${catalogColorSpec ? `<small>Catalog colorway: ${escapeHtml(catalogColorSpec)}</small>` : ''}
          </div>

          <div class="form-group">
            <label for="admin-pending-order-due-date">Delivery Due Date</label>
            <input type="date" id="admin-pending-order-due-date" class="form-input" value="${escapeHtml(draft.dueDate)}" />
          </div>
        </div>

        <div class="su-order-matrix-card">
          <div class="su-order-matrix-header">
            <span style="font-weight: 700; color: var(--ink-950); font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em;">
              Planned Order Size Breakdown Matrix (Pairs &bull; Scale: ${escapeHtml(activeSizeFormat)}, ${activeSizeCodes.length} Sizes)
            </span>
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <span style="font-size: 12px; color: var(--ink-700);">
                Enter pairs for each size. The order total calculates automatically.
              </span>
              <button type="button" class="btn-outline" id="btn-admin-toggle-split" style="padding: 4px 10px; font-size: 11.5px;">
                ${splitActive ? 'Use Single Contractor' : '+ Split Across Contractors'}
              </button>
            </div>
          </div>
          <div class="table-responsive">
            <table class="size-matrix-table" style="margin: 0;">
              <thead>
                <tr>
                  ${activeSizeCodes.map(sz => `<th>${escapeHtml(formatSizeColumnLabel(sz, activeSizeFormat))}</th>`).join('')}
                  <th style="background: var(--ink-200); color: var(--ink-950);">Total Pairs</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  ${activeSizeCodes
                    .map(sz => `<td><input type="number" aria-label="Order Size ${escapeHtml(formatSizeColumnLabel(sz, activeSizeFormat))}" class="size-matrix-input admin-order-size-val" data-size="${escapeHtml(sz)}" min="0" placeholder="0" value="${draft.sizes?.[sz] || ''}" /></td>`)
                    .join('')}
                  <td style="font-weight: 800; font-size: 13.5px; color: var(--ink-950); text-align: center;" id="admin-order-size-total">${draftTotal}</td>
                </tr>
              </tbody>
            </table>
          </div>
          ${
            splitActive
              ? `
            <div class="su-split-panel" data-testid="admin-contractor-split-panel">
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 6px;">
                <span style="font-weight: 700; color: var(--ink-950); font-size: 11.5px; text-transform: uppercase;">
                  Contractor Share Split (Must Match Order Sizes)
                </span>
                <button type="button" class="btn-outline" id="btn-admin-add-split-row" style="padding: 3px 10px; font-size: 11.5px;">
                  + Add Contractor Row
                </button>
              </div>
              <div class="table-responsive">
                <table class="size-matrix-table" style="margin: 0;">
                  <thead>
                    <tr>
                      <th style="min-width: 150px;">Contractor</th>
                      ${activeSizeCodes.map(sz => `<th>${escapeHtml(formatSizeColumnLabel(sz, activeSizeFormat))}</th>`).join('')}
                      <th>Total</th>
                      <th>Due Date</th>
                      <th>Remove</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${splitRows.map((row, idx) => {
                      const rowTotal = calculateSizeTotal(row.sizes);
                      return `
                      <tr class="su-split-row" data-split-index="${idx}">
                        <td>
                          <select class="form-select admin-split-maker" data-split-index="${idx}" aria-label="Split Contractor ${idx + 1}" style="font-size: 12px;">
                            <option value="">-- Choose Contractor --</option>
                            ${ctx.dropdownOptions.makers.map(m => `<option value="${escapeHtml(m)}" ${row.maker === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
                          </select>
                        </td>
                        ${activeSizeCodes
                          .map(sz => `<td><input type="number" class="size-matrix-input admin-split-size-val" data-split-index="${idx}" data-size="${escapeHtml(sz)}" min="0" placeholder="0" aria-label="Contractor ${idx + 1} Size ${escapeHtml(sz)}" value="${row.sizes?.[sz] || ''}" /></td>`)
                          .join('')}
                        <td class="text-center font-bold" id="admin-split-row-total-${idx}">${rowTotal.toLocaleString()}</td>
                        <td><input type="date" class="form-input admin-split-due-date" data-split-index="${idx}" aria-label="Contractor ${idx + 1} Due Date" value="${escapeHtml(row.dueDate || '')}" style="font-size: 11.5px;" /></td>
                        <td class="text-center">
                          ${splitRows.length > 2 ? `<button type="button" class="btn-outline" data-su-action="remove-split-row" data-split-index="${idx}" style="padding: 2px 8px; font-size: 11px;">&times;</button>` : '<span style="color: var(--ink-500); font-size: 11px;">Min 2</span>'}
                        </td>
                      </tr>`;
                    }).join('')}
                  </tbody>
                </table>
              </div>
              <div id="admin-split-balance-bar" class="su-split-balance-bar ${splitValidation?.valid ? 'is-balanced' : 'is-unbalanced'}">
                <span>
                  Unassigned Balance:
                  ${activeSizeCodes.map(sz => `<strong>${escapeHtml(sz)}:${splitValidation?.unassignedBySize[sz] ?? 0}</strong>`).join(' | ')}
                  (<strong>${splitValidation?.totalUnassigned ?? 0}</strong> Prs remaining)
                </span>
                <strong>${splitValidation?.valid ? 'Split Matches Order 100% ✓' : escapeHtml(splitValidation?.error || 'Adjust contractor quantities to match order totals')}</strong>
              </div>
            </div>
          `
              : ''
          }
        </div>

        <div class="su-order-action-row">
          <span style="font-size: 12px; color: var(--su-text-secondary);">
            <span class="su-required-mark" aria-hidden="true">*</span> Required fields &bull;
            Orders are saved directly to SQLite (<code>pending_orders</code>) and populate the Inward Receiving dropdown for multiple GRN batches and Packing Hall REQs.
          </span>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <button type="button" class="btn-outline" id="btn-admin-reset-pending-order">
              Reset Form
            </button>
            <button type="button" class="btn-primary" id="btn-admin-add-pending-order" style="padding: 7px 18px;">
              Save &amp; Issue Master Order
            </button>
          </div>
        </div>

        <div class="table-responsive" style="max-height: 260px; overflow-y: auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Buyer</th>
                <th>Contractor / Maker</th>
                <th>PO #</th>
                <th>Article</th>
                <th>Colour</th>
                <th class="text-center">7/S</th>
                <th class="text-center">8/M</th>
                <th class="text-center">9/L</th>
                <th class="text-center">10/XL</th>
                <th class="text-center">11/XXL</th>
                <th class="text-right">Planned Pairs</th>
                <th class="text-center">Delivery</th>
                <th class="text-center">GRNs / REQs</th>
                <th class="text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              ${
                ctx.pendingOrders.length === 0
                  ? `
                <tr><td colspan="15" class="table-empty-cell">No orders in database yet. Fill out the form above and click "Save &amp; Issue Master Order".</td></tr>
              `
                  : ctx.pendingOrders
                      .map(o => {
                        const rollup = ctx.rollupSummary.orderRollups.find(
                          r => r.orderId === o.orderId
                        );
                        const rowCountdown = rollup?.deliveryCountdown || computeDeliveryCountdown({
                          dueDate: o.dueDate,
                          createdAt: o.createdAt,
                          isCompleted: o.shortClosed
                        });
                        return `
                  <tr>
                    <td class="font-bold">${escapeHtml(o.orderId)}</td>
                    <td>${escapeHtml(o.buyer || '---')}</td>
                    <td>${escapeHtml(o.maker)}</td>
                    <td class="font-bold">${escapeHtml(o.po || '---')}</td>
                    <td class="font-bold">${escapeHtml(o.article)}</td>
                    <td>${escapeHtml(o.color || 'Standard')}</td>
                    ${
                      (o.sizeFormat || 'LEGACY_7_11') === 'LEGACY_7_11'
                        ? `
                    <td class="text-center">${o.sizes?.['7'] ?? '-'}</td>
                    <td class="text-center">${o.sizes?.['8'] ?? '-'}</td>
                    <td class="text-center">${o.sizes?.['9'] ?? '-'}</td>
                    <td class="text-center">${o.sizes?.['10'] ?? '-'}</td>
                    <td class="text-center">${o.sizes?.['11'] ?? '-'}</td>
                        `
                        : `
                    <td colspan="5" class="text-center" style="font-size: 11px;">
                      <span class="status-pill">${escapeHtml(o.sizeFormat || '')}</span>
                      ${(o.sizeCodes || Object.keys(o.sizes || {}))
                        .filter(sz => Number(o.sizes?.[sz] || 0) > 0)
                        .map(sz => `${escapeHtml(sz)}:${Number(o.sizes?.[sz] || 0)}`)
                        .join(' &middot; ') || '0'}
                    </td>
                        `
                    }
                    <td class="text-right font-bold">${(o.totalQty || calculateSizeTotal(o.sizes || {}) || 0).toLocaleString()}</td>
                    <td class="text-center">${renderDeliveryCountdownChip(rowCountdown, false)}</td>
                    <td class="text-center" style="font-size: 11px;">
                      ${rollup ? `${rollup.grnBatches.length} GRNs &middot; ${rollup.reqBatches.length} REQs` : '0 GRNs &middot; 0 REQs'}
                    </td>
                    <td class="text-center" style="white-space: nowrap;">
                      <button type="button" class="table-btn" data-su-action="inspect-order" data-order-id="${escapeHtml(o.orderId)}">Track</button>
                      <button type="button" class="table-btn" title="Remove Order" data-su-action="remove-pending-order" data-order-id="${escapeHtml(o.orderId)}">Delete</button>
                    </td>
                  </tr>
                `;
                      })
                      .join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- 7.2: Collapsible Master Registries (Buyers, Articles, Contractors/Makers, Audit Trail, SQLite WAL, Phased Rollout) -->
    ${(() => {
      const isRegOpen = (key: string, defaultOpen = false): boolean =>
        ctx.openRegistryIds && key in ctx.openRegistryIds
          ? Boolean(ctx.openRegistryIds[key])
          : defaultOpen;
      return `
    <div class="su-registries-toolbar">
      <div class="su-registries-toolbar-title">
        <span>Master Registries &amp; System Administration (Sections 2&ndash;6)</span>
        <span class="admin-meta-caption">Click any card header to expand full-width or collapse</span>
      </div>
      <div class="su-registries-toolbar-actions">
        <button type="button" class="btn-outline" style="padding: 4px 10px; font-size: 11.5px;" data-su-action="toggle-all-registries" data-expanded="true">Expand All Registries</button>
        <button type="button" class="btn-outline" style="padding: 4px 10px; font-size: 11.5px;" data-su-action="toggle-all-registries" data-expanded="false">Collapse All Registries</button>
      </div>
    </div>

    <div class="su-registries-grid">
      <!-- Collapsible Registry 2: Customer & Buyer Master -->
      <details class="su-collapsible-registry" data-registry-id="buyers" ${isRegOpen('buyers', true) ? 'open' : ''}>
        <summary>
          <span class="su-registry-summary-main">
            <span class="su-registry-step-badge">02</span>
            <span class="su-registry-title-text">2. Customer &amp; Buyer Master Registry (${ov.customers.length} Buyers)</span>
          </span>
          <span class="su-registry-summary-meta">
            <span class="admin-meta-caption">AQL Inspection Rules</span>
            <span class="su-registry-toggle-pill" aria-hidden="true">
              <span class="su-toggle-when-closed">Expand &#9662;</span>
              <span class="su-toggle-when-open">Collapse &#9652;</span>
            </span>
          </span>
        </summary>
        <div class="su-collapsible-body">
          <div class="su-customer-form-grid">
            <div class="form-group">
              <label for="admin-cust-name">Customer Name</label>
              <input type="text" id="admin-cust-name" class="form-input" placeholder="e.g. Alpine Tactical" />
            </div>
            <div class="form-group">
              <label for="admin-cust-country">Destination Country</label>
              <input type="text" id="admin-cust-country" class="form-input" placeholder="e.g. Germany" value="United Kingdom" />
            </div>
            <div class="form-group">
              <label for="admin-cust-pref">QC Inspection Protocol</label>
              <select id="admin-cust-pref" class="form-select">
                <option value="RANDOM">RANDOM (AQL 1.5)</option>
                <option value="THOROUGH">THOROUGH (100%)</option>
              </select>
            </div>
            <button type="button" class="btn-primary" id="btn-admin-save-customer">Save Buyer</button>
          </div>
          <div class="table-responsive" style="max-height: 190px; overflow-y: auto;">
            <table class="data-table">
              <thead>
                <tr><th>Customer ID</th><th>Customer Name</th><th>Country</th><th class="text-center">QC Protocol</th></tr>
              </thead>
              <tbody>
                ${ov.customers
                  .map(
                    (c: any) => `
                  <tr>
                    <td class="font-bold">${escapeHtml(c.id)}</td>
                    <td>${escapeHtml(c.name)}</td>
                    <td>${escapeHtml(c.country || '---')}</td>
                    <td class="text-center"><span class="status-pill">${escapeHtml(c.inspection_preference)}</span></td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <!-- Collapsible Registry 3: Glove Product / Article Master -->
      <details class="su-collapsible-registry" data-registry-id="articles" ${isRegOpen('articles', true) ? 'open' : ''}>
        <summary>
          <span class="su-registry-summary-main">
            <span class="su-registry-step-badge">03</span>
            <span class="su-registry-title-text">3. Glove Article &amp; Packaging BOM Master (${ov.products.length} Articles)</span>
          </span>
          <span class="su-registry-summary-meta">
            <span class="admin-meta-caption">Per-Pair Accessory Ratios</span>
            <span class="su-registry-toggle-pill" aria-hidden="true">
              <span class="su-toggle-when-closed">Expand &#9662;</span>
              <span class="su-toggle-when-open">Collapse &#9652;</span>
            </span>
          </span>
        </summary>
        <div class="su-collapsible-body">
          <div class="su-article-form-grid">
            <div class="form-group">
              <label for="admin-prod-name">Article Name</label>
              <input type="text" id="admin-prod-name" class="form-input" placeholder="e.g. Stealth Pro V2" />
            </div>
            <div class="form-group">
              <label for="admin-prod-cust">Buyer</label>
              <select id="admin-prod-cust" class="form-select">
                ${ov.customers.map((c: any) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="admin-prod-stickers">Stickers/Pr</label>
              <input type="number" id="admin-prod-stickers" class="form-input" value="2" min="1" />
            </div>
            <div class="form-group">
              <label for="admin-prod-carton">Pairs/Ctn</label>
              <input type="number" id="admin-prod-carton" class="form-input" value="50" min="1" />
            </div>
            <button type="button" class="btn-primary" id="btn-admin-save-product">Save Article</button>
          </div>
          <div class="table-responsive" style="max-height: 190px; overflow-y: auto;">
            <table class="data-table">
              <thead>
                <tr><th>Product ID</th><th>Article</th><th>Buyer</th><th class="text-right">Polybag</th><th class="text-right">Silica</th><th class="text-right">Stickers</th><th class="text-right">Prs/Ctn</th></tr>
              </thead>
              <tbody>
                ${ov.products
                  .map(
                    (p: any) => `
                  <tr>
                    <td class="font-bold">${escapeHtml(p.id)}</td>
                    <td class="font-bold">${escapeHtml(p.name)}</td>
                    <td>${escapeHtml(p.customer_name || p.customer_id)}</td>
                    <td class="text-right">${p.polybag_per_pair}</td>
                    <td class="text-right">${p.silica_gel_per_pair}</td>
                    <td class="text-right">${p.stickers_per_pair}</td>
                    <td class="text-right font-bold">${p.pairs_per_carton}</td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <!-- Collapsible Registry 4: Contractors / Makers & PO Dropdowns -->
      <details class="su-collapsible-registry" data-registry-id="makers_pos" ${isRegOpen('makers_pos', false) ? 'open' : ''}>
        <summary>
          <span class="su-registry-summary-main">
            <span class="su-registry-step-badge">04</span>
            <span class="su-registry-title-text">4. Contractors / Makers (${ctx.dropdownOptions.makers.length}) &amp; PO Registry (${ctx.dropdownOptions.poList.length})</span>
          </span>
          <span class="su-registry-summary-meta">
            <span class="admin-meta-caption">Synchronized across Dock &amp; Alteration Bay</span>
            <span class="su-registry-toggle-pill" aria-hidden="true">
              <span class="su-toggle-when-closed">Expand &#9662;</span>
              <span class="su-toggle-when-open">Collapse &#9652;</span>
            </span>
          </span>
        </summary>
        <div class="su-collapsible-body">
          <div style="margin-bottom: 12px;">
            <div style="font-size: 11.5px; font-weight: 700; color: var(--ink-600); margin-bottom: 6px; text-transform: uppercase;">Active Makers / Contractors (${ctx.dropdownOptions.makers.length})</div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <input type="text" id="admin-add-maker-input" class="form-input" style="flex: 1;" placeholder="Add Maker / Contractor (e.g. Usman Hall)" />
              <button class="btn-primary" id="btn-admin-add-maker">Add Maker</button>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${ctx.dropdownOptions.makers
                .map(
                  m => `
                <span class="admin-tag-item">
                  <span>${escapeHtml(m)}</span>
                  <button type="button" class="admin-tag-remove" title="Remove" data-su-action="remove-dropdown-item" data-list-key="makers" data-item-val="${escapeHtml(m)}">&times;</button>
                </span>
              `
                )
                .join('')}
            </div>
          </div>
          <div>
            <div style="font-size: 11.5px; font-weight: 700; color: var(--ink-600); margin-bottom: 6px; text-transform: uppercase;">Active Purchase Order Numbers (${ctx.dropdownOptions.poList.length})</div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <input type="text" id="admin-add-po-input" class="form-input" style="flex: 1;" placeholder="Add PO Number (e.g. 27401)" />
              <button class="btn-primary" id="btn-admin-add-po">Add PO #</button>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${ctx.dropdownOptions.poList
                .map(
                  po => `
                <span class="admin-tag-item">
                  <span>PO #${escapeHtml(po)}</span>
                  <button type="button" class="admin-tag-remove" title="Remove" data-su-action="remove-dropdown-item" data-list-key="poList" data-item-val="${escapeHtml(po)}">&times;</button>
                </span>
              `
                )
                .join('')}
            </div>
          </div>
        </div>
      </details>

      <!-- Collapsible Registry 5: Immutable Audit Trail -->
      <details class="su-collapsible-registry" data-registry-id="audit_trail" ${isRegOpen('audit_trail', false) ? 'open' : ''}>
        <summary>
          <span class="su-registry-summary-main">
            <span class="su-registry-step-badge">05</span>
            <span class="su-registry-title-text">5. Immutable Audit Trail Ledger (${auditTrail.length} Recorded Events)</span>
          </span>
          <span class="su-registry-summary-meta">
            <span class="admin-meta-caption">Actor &bull; Timestamp &bull; Before &rarr; After</span>
            <span class="su-registry-toggle-pill" aria-hidden="true">
              <span class="su-toggle-when-closed">Expand &#9662;</span>
              <span class="su-toggle-when-open">Collapse &#9652;</span>
            </span>
          </span>
        </summary>
        <div class="su-collapsible-body">
          <div class="table-responsive" style="max-height: 190px; overflow-y: auto;">
            <table class="data-table">
              <thead>
                <tr><th>Audit ID</th><th>Timestamp</th><th>Actor / Role</th><th>Action</th><th>Entity</th><th>Before &rarr; After</th></tr>
              </thead>
              <tbody>
                ${
                  auditTrail.length === 0
                    ? `<tr><td colspan="6" class="text-center" style="padding: 16px; color: var(--su-text-muted);">Audit trail records every Order creation, GRN receipt, Dock issue, QC gate approval, and Void operation.</td></tr>`
                    : auditTrail
                        .slice()
                        .reverse()
                        .map(
                          a => `
                  <tr>
                    <td class="font-bold" style="font-family: var(--font-mono);">${escapeHtml(a.auditId)}</td>
                    <td style="font-family: var(--font-mono); font-size: 11px;">${escapeHtml(a.timestamp)}</td>
                    <td><strong>${escapeHtml(a.actor)}</strong> <span style="font-size: 11px; color: var(--su-text-secondary);">(${escapeHtml(a.role)})</span></td>
                    <td><span class="su-badge su-badge-req">${escapeHtml(a.action)}</span></td>
                    <td class="font-bold">${escapeHtml(a.entityId)}</td>
                    <td style="font-size: 11px;">${escapeHtml(a.beforeSummary)} &rarr; <strong>${escapeHtml(a.afterSummary)}</strong></td>
                  </tr>
                `
                        )
                        .join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <!-- Collapsible Registry 6: SQLite WAL Database & Snapshot Administration -->
      <details class="su-collapsible-registry" data-registry-id="sqlite_wal" ${isRegOpen('sqlite_wal', false) ? 'open' : ''}>
        <summary>
          <span class="su-registry-summary-main">
            <span class="su-registry-step-badge">06</span>
            <span class="su-registry-title-text">6. SQLite WAL Database &amp; Snapshot Administration (${ov.dbHealth.totalTables} Tables &bull; ${totalRows} Rows)</span>
          </span>
          <span class="su-registry-summary-meta">
            <span class="admin-meta-caption">Engine: ${escapeHtml(String(ov.dbHealth.journalMode).toUpperCase())}</span>
            <span class="su-registry-toggle-pill" aria-hidden="true">
              <span class="su-toggle-when-closed">Expand &#9662;</span>
              <span class="su-toggle-when-open">Collapse &#9652;</span>
            </span>
          </span>
        </summary>
        <div class="su-collapsible-body">
          <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;">
            <button class="btn-primary" id="btn-admin-trigger-backup" style="padding: 7px 12px; font-size: 12px;">
              Execute Online VACUUM Backup
            </button>
            <button class="btn-outline" id="btn-admin-reseed-db" style="padding: 7px 12px; font-size: 12px;">
              Verify &amp; Re-Seed Master Data
            </button>
            <button class="btn-outline" id="btn-admin-export-json" style="padding: 7px 12px; font-size: 12px;">
              Export State (JSON)
            </button>
          </div>
          ${
            ctx.lastBackupPath
              ? `
            <div style="margin-bottom: 10px; padding: 8px 10px; background: var(--ink-50); border: 1px solid var(--border-strong); border-radius: 4px; font-size: 11.5px;">
              <strong>Latest Snapshot:</strong> <code>${escapeHtml(ctx.lastBackupPath)}</code>
            </div>
          `
              : ''
          }
          <div class="table-responsive" style="max-height: 140px; overflow-y: auto;">
            <table class="data-table">
              <thead>
                <tr><th>SQLite Table</th><th class="text-right">Row Count</th><th class="text-center">Integrity</th></tr>
              </thead>
              <tbody>
                ${Object.keys(counts)
                  .map(
                    tbl => `
                  <tr>
                    <td style="font-family: var(--font-mono); font-size: 11.5px; font-weight: 700;">${escapeHtml(tbl)}</td>
                    <td class="text-right font-bold">${counts[tbl]}</td>
                    <td class="text-center"><span class="status-pill">OK</span></td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <!-- Phased Rollout Record & Active MES Policy Configuration -->
      <details class="su-collapsible-registry" data-registry-id="phased_rollout" ${isRegOpen('phased_rollout', false) ? 'open' : ''}>
        <summary>
          <span class="su-registry-summary-main">
            <span class="su-registry-step-badge">POLICY</span>
            <span class="su-registry-title-text">Phased Rollout Record (Phase A &bull; Phase B &bull; Phase C) &amp; Active MES Policy Defaults</span>
          </span>
          <span class="su-registry-summary-meta">
            <span class="admin-meta-caption">R1 / 3.8 / 4.6 / 4.7 Policies</span>
            <span class="su-registry-toggle-pill" aria-hidden="true">
              <span class="su-toggle-when-closed">Expand &#9662;</span>
              <span class="su-toggle-when-open">Collapse &#9652;</span>
            </span>
          </span>
        </summary>
      <div class="su-collapsible-body">
        <div class="table-responsive" style="margin-bottom: 10px;">
          <table class="data-table">
            <thead>
              <tr><th>Phase</th><th>Milestone Title</th><th>Scope &amp; Deliverables</th><th class="text-center">Status</th></tr>
            </thead>
            <tbody>
              ${PHASED_ROLLOUT_RECORD.map(
                p => `
                <tr>
                  <td class="font-bold" style="font-family: var(--font-mono);">${p.phase}</td>
                  <td class="font-bold">${p.title}</td>
                  <td style="font-size: 11px;">${p.scope.join(' &bull; ')}</td>
                  <td class="text-center"><span class="su-badge su-badge-reconciled">${p.status} &#10003;</span></td>
                </tr>
              `
              ).join('')}
            </tbody>
          </table>
        </div>
        <div style="font-size: 11px; color: var(--su-text-secondary); font-family: var(--font-mono);">
          Active Policy Defaults: SizeSet=<strong>${DEFAULT_MES_POLICY_CONFIG.sizeScaleMode}</strong> &bull;
          OverReceiptTol=<strong>+${DEFAULT_MES_POLICY_CONFIG.overReceiptTolerancePct}%</strong> &bull;
          AQL=<strong>${DEFAULT_MES_POLICY_CONFIG.aqlInspectorRole} / ${DEFAULT_MES_POLICY_CONFIG.aqlInspectionGranularity} / ${DEFAULT_MES_POLICY_CONFIG.aqlFailurePath}</strong> &bull;
          AlterationMode=<strong>${DEFAULT_MES_POLICY_CONFIG.alterationWorkflowMode}</strong>
        </div>
      </div>
    </details>
    </div>
      `;
    })()}
  `;
}

export function buildSuperUserReportHtml(ctx: SuperUserRenderContext): {
  title: string;
  html: string;
  csvFilename: string;
  csvRows: Record<string, unknown>[];
} {
  const s = ctx.rollupSummary;
  const ov = ctx.adminOverview;
  const reportType = ctx.activeReport || 'order_grn_balance';

  if (reportType === 'order_grn_balance') {
    const csvRows = s.orderRollups.map(o => ({
      Order_ID: o.orderId,
      Buyer: o.buyer,
      Contractor_Maker: o.maker,
      PO_Number: o.po,
      Article: o.article,
      Colour: o.color,
      Planned_Pairs: o.plannedQty,
      GRN_Batches_Count: o.grnBatches.length,
      Received_GRN_Pairs: o.receivedGrnQty,
      Contractor_Balance_Pairs: o.contractorBalanceQty,
      Dock_Available_Pool: o.dockAvailableQty,
      Reconciliation_Status: o.reconciliation.badgeText,
      Status: o.orderStatus
    }));

    const rowsHtml =
      s.orderRollups.length === 0
        ? `<tr><td colspan="11" style="border: 1px solid var(--border-strong); padding: 14px; text-align: center;">No orders recorded in database.</td></tr>`
        : s.orderRollups
            .map(
              o => `
        <tr>
          <td style="border: 1px solid var(--border-strong); padding: 6px; font-weight: 700;">${escapeHtml(o.orderId)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px;">${escapeHtml(o.buyer)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px;">${escapeHtml(o.maker)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; font-weight: 700;">${escapeHtml(o.po)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px;">${escapeHtml(o.article)} (${escapeHtml(o.color)})</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">${o.grnBatches.map(g => `${escapeHtml(g.grnCode)}(${g.rcvdPairs})`).join(', ') || 'None'}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right; font-weight: 700;">${o.plannedQty.toLocaleString()}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right; font-weight: 700;">${o.receivedGrnQty.toLocaleString()}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right; font-weight: 700;">${o.contractorBalanceQty.toLocaleString()}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center; font-weight: 700;">${escapeHtml(o.reconciliation.badgeText)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">${escapeHtml(o.orderStatus)}</td>
        </tr>
      `
            )
            .join('');

    const html = `
      <div class="printable-slip-box">
        <div class="printable-slip-header">
          <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-950);">HAMMAD INDUSTRIES &bull; ORDER VS. INWARD GRN &amp; CONTRACTOR BALANCE REPORT</h2>
          <p style="margin: 2px 0 0; font-size: 11px; text-transform: uppercase; color: var(--ink-600);">
            Super User Reconciliation Statement &bull; Parent Order to Multiple GRN Batches (0001, 0002...)
          </p>
        </div>
        <div class="printable-meta-grid">
          <div><span>Total Master Orders:</span> <strong>${s.totalOrders}</strong></div>
          <div><span>Total Planned Pairs:</span> <strong>${s.totalPlannedPairs.toLocaleString()} Pairs</strong></div>
          <div><span>Total Received (GRNs):</span> <strong>${s.totalReceivedGrnPairs.toLocaleString()} Pairs (${s.totalGrnCount} Batches)</strong></div>
          <div><span>Contractor Balance Owed:</span> <strong>${s.totalContractorBalancePairs.toLocaleString()} Pairs</strong></div>
        </div>
        <div style="font-size: 11px; padding: 6px 10px; margin-bottom: 8px; border: 1px solid var(--border-strong); background: var(--ink-50);">
          <strong>Reconciliation Rule:</strong> <code>Planned (${s.totalPlannedPairs}) = Received GRNs (${s.totalReceivedGrnPairs}) + Contractor Balance (${s.totalContractorBalancePairs})</code> and <code>Received GRNs (${s.totalReceivedGrnPairs}) = Dock Pool (${s.totalDockAvailablePairs}) + Issued to REQs (${s.totalIssuedReqPairs})</code>.
        </div>
        <table class="size-matrix-table" style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11.5px;">
          <thead>
            <tr style="background: var(--ink-100); color: var(--ink-950);">
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Order #</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Buyer</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Contractor / Maker</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">PO #</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Article &amp; Colour</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">Child GRN Batches</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Planned</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Received</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Balance</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">Reconcile</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">Order Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 22px; border-top: 1px dashed var(--ink-500); padding-top: 8px;">
          <span>Dock Store Head: ___________________</span>
          <span>Production Controller: ___________________</span>
          <span>Super User Approval: ___________________</span>
        </div>
      </div>
    `;

    return {
      title: 'Order vs. Inward GRN & Contractor Balance Report',
      html,
      csvFilename: 'Report_1_Order_vs_GRN_Balance.csv',
      csvRows
    };
  }

  if (reportType === 'req_traceability') {
    const allReqs = s.orderRollups.flatMap(o => o.reqBatches);
    const csvRows = allReqs.map(r => ({
      Parent_Order: r.parentOrderId,
      Order_Batch_Seq: `#${String(r.orderReqSeq).padStart(4, '0')}`,
      Requisition_No: r.reqNumber,
      Source_GRNs: r.allocatedFromGrns.map(a => `${a.grnCode}:${a.pairs}`).join('|'),
      Material_Req_M: r.mreqNo,
      Alteration_Ref_A: r.altReqNo,
      Article: r.article,
      PO_Number: r.po,
      Issued_Pairs: r.issuedPairs,
      Floor_WIP_Pairs: r.inFloorWipPairs,
      Stage4_Ready_For_QC: r.stage4Passed,
      In_Alteration_Pairs: r.inAlterationPairs,
      Scrapped_Pairs: r.scrappedPairs,
      Stage5_Packed_Pairs: r.packedStage5Pairs,
      Reconciliation: r.reconciliation.badgeText,
      Lifecycle_Status: r.reqLifecycleStatus
    }));

    const rowsHtml =
      allReqs.length === 0
        ? `<tr><td colspan="11" style="border: 1px solid var(--border-strong); padding: 14px; text-align: center;">No Packing Hall Requisitions (REQ) generated yet.</td></tr>`
        : allReqs
            .map(
              r => `
        <tr>
          <td style="border: 1px solid var(--border-strong); padding: 6px; font-weight: 700;">${escapeHtml(r.parentOrderId)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; font-family: monospace; font-weight: 700;">${escapeHtml(r.reqNumber)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; font-family: monospace;">${escapeHtml(r.mreqNo)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; font-family: monospace;">${escapeHtml(r.altReqNo)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px;">${escapeHtml(r.article)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right; font-weight: 700;">${r.issuedPairs.toLocaleString()}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">${r.inFloorWipPairs.toLocaleString()}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">${r.inAlterationPairs} / ${r.scrappedPairs}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right; font-weight: 700;">${r.packedStage5Pairs.toLocaleString()}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center; font-weight: 700;">${escapeHtml(r.reconciliation.badgeText)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">${escapeHtml(r.reqLifecycleStatus)}</td>
        </tr>
      `
            )
            .join('');

    const html = `
      <div class="printable-slip-box">
        <div class="printable-slip-header">
          <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-950);">HAMMAD INDUSTRIES &bull; ORDER-TO-REQUISITION (REQ / M-REQ / A-REQ) TRACEABILITY LEDGER</h2>
          <p style="margin: 2px 0 0; font-size: 11px; text-transform: uppercase; color: var(--ink-600);">
            5-Stage Packing Hall Execution &bull; Stage 4 Final QC Gate &amp; Pair Reconciliation
          </p>
        </div>
        <div class="printable-meta-grid">
          <div><span>Total Requisitions:</span> <strong>${s.totalReqCount} REQs</strong></div>
          <div><span>Total Issued to Floor:</span> <strong>${s.totalIssuedReqPairs.toLocaleString()} Pairs</strong></div>
          <div><span>Stage 4 Hold (Awaiting QC):</span> <strong>${s.stage4ReadyForQcPairs.toLocaleString()} Pairs</strong></div>
          <div><span>Stage 5 Sealed Output:</span> <strong>${s.stage5PackedPairs.toLocaleString()} Pairs (${s.stage5PackedCartons} Cartons)</strong></div>
        </div>
        <div style="font-size: 11px; padding: 6px 10px; margin-bottom: 8px; border: 1px solid var(--border-strong); background: var(--ink-50);">
          <strong>Reconciliation Rule:</strong> Per-REQ Floor Gate: <code>Issued (${s.totalIssuedReqPairs}) = Floor WIP (${s.totalFloorWipPairs}) + Stage 5 Packed (${s.stage5PackedPairs}) + Active Alteration (${s.totalAlterationPairs}) + Scrapped (${s.totalScrappedPairs})</code>.
        </div>
        <table class="size-matrix-table" style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11.5px;">
          <thead>
            <tr style="background: var(--ink-100); color: var(--ink-950);">
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Parent Order</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">REQ #</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Material (M)</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Alteration (A)</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Article</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Issued</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Floor WIP</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Alter / Scrap</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Packed (S5)</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">Reconcile</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 22px; border-top: 1px dashed var(--ink-500); padding-top: 8px;">
          <span>Packing Hall Manager: ___________________</span>
          <span>QA Lead Inspector: ___________________</span>
          <span>Super User Approval: ___________________</span>
        </div>
      </div>
    `;

    return {
      title: 'Order-to-Requisition (REQ / M-REQ / A-REQ) Traceability Ledger',
      html,
      csvFilename: 'Report_2_Order_Requisition_Traceability.csv',
      csvRows
    };
  }

  if (reportType === 'contractor_scrap') {
    const csvRows = s.orderRollups.map(o => ({
      Order_ID: o.orderId,
      Contractor_Maker: o.maker,
      PO_Number: o.po,
      Article: o.article,
      Received_Pairs: o.receivedGrnQty,
      Active_Alteration_Pairs: o.inAlterationQty,
      Condemned_Scrap_Pairs: o.scrappedQty,
      Estimated_Debit_PKR: o.scrappedQty * 150
    }));

    const totalDebit =
      ov.scrapLedger.reduce(
        (sum: number, x: any) => sum + Number(x.financial_deduction_amount || 0),
        0
      ) || s.totalScrappedPairs * 150;

    const rowsHtml =
      s.orderRollups.length === 0
        ? `<tr><td colspan="7" style="border: 1px solid var(--border-strong); padding: 14px; text-align: center;">No contractor quality or scrap entries recorded.</td></tr>`
        : s.orderRollups
            .map(
              o => `
        <tr>
          <td style="border: 1px solid var(--border-strong); padding: 6px; font-weight: 700;">${escapeHtml(o.orderId)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; font-weight: 700;">${escapeHtml(o.maker)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px;">${escapeHtml(o.po)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px;">${escapeHtml(o.article)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">${o.receivedGrnQty.toLocaleString()}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right; font-weight: 700;">${o.inAlterationQty.toLocaleString()}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right; font-weight: 700;">${o.scrappedQty.toLocaleString()} (PKR ${(o.scrappedQty * 150).toLocaleString()})</td>
        </tr>
      `
            )
            .join('');

    const html = `
      <div class="printable-slip-box">
        <div class="printable-slip-header">
          <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-950);">HAMMAD INDUSTRIES &bull; CONTRACTOR QUALITY, ALTERATION (A-REQ) &amp; SCRAP DEDUCTION STATEMENT</h2>
          <p style="margin: 2px 0 0; font-size: 11px; text-transform: uppercase; color: var(--ink-600);">
            Alteration Bay #2 Rework Audit &bull; Max 2-Cycle Condemned Scrap Financial Debit Note
          </p>
        </div>
        <div class="printable-meta-grid">
          <div><span>Active Alteration Pairs:</span> <strong>${s.totalAlterationPairs.toLocaleString()} Pairs</strong></div>
          <div><span>Total Condemned Scrap:</span> <strong>${s.totalScrappedPairs.toLocaleString()} Pairs</strong></div>
          <div><span>SQLite Alteration Batches:</span> <strong>${ov.alterations.length} Batches</strong></div>
          <div><span>Total Financial Deduction:</span> <strong>PKR ${totalDebit.toLocaleString()}</strong></div>
        </div>
        <div style="font-size: 11px; padding: 6px 10px; margin-bottom: 8px; border: 1px solid var(--border-strong); background: var(--ink-50);">
          <strong>Reconciliation Rule:</strong> Any pair failing Cycle 2/2 in Alteration Bay is automatically condemned to Scrap and debited at PKR 150/Pr (<code>${s.totalScrappedPairs} Scrapped Prs &times; PKR 150 = PKR ${(s.totalScrappedPairs * 150).toLocaleString()}</code>).
        </div>
        <table class="size-matrix-table" style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11.5px;">
          <thead>
            <tr style="background: var(--ink-100); color: var(--ink-950);">
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Order #</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Contractor / Maker</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">PO #</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Article</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Received Pairs</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Active Rework (A-REQ)</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Condemned Scrap &amp; Debit</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 22px; border-top: 1px dashed var(--ink-500); padding-top: 8px;">
          <span>Alteration Bay Lead: ___________________</span>
          <span>Accounts / Finance: ___________________</span>
          <span>Super User Approval: ___________________</span>
        </div>
      </div>
    `;

    return {
      title: 'Contractor Quality, Alteration (A-REQ) & Scrap Deduction Statement',
      html,
      csvFilename: 'Report_3_Contractor_Alteration_Scrap.csv',
      csvRows
    };
  }

  const csvRows = s.orderRollups.map(o => ({
    Order_ID: o.orderId,
    Buyer: o.buyer,
    PO_Number: o.po,
    Article: o.article,
    Planned_Pairs: o.plannedQty,
    Stage4_Awaiting_QC_Pairs: o.awaitingFinalQcQty,
    Stage5_Packed_Pairs: o.packedStage5Qty,
    Stage5_Master_Cartons: o.packedStage5Cartons,
    Scrapped_Pairs: o.scrappedQty,
    Reconciliation: o.reconciliation.badgeText,
    Dispatch_Status: o.orderStatus
  }));

  const rowsHtml =
    s.orderRollups.length === 0
      ? `<tr><td colspan="9" style="border: 1px solid var(--border-strong); padding: 14px; text-align: center;">No dispatch or Final QC records available.</td></tr>`
      : s.orderRollups
          .map(
            o => `
      <tr>
        <td style="border: 1px solid var(--border-strong); padding: 6px; font-weight: 700;">${escapeHtml(o.orderId)}</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px;">${escapeHtml(o.buyer)}</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px; font-weight: 700;">${escapeHtml(o.po)}</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px;">${escapeHtml(o.article)}</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">${o.awaitingFinalQcQty.toLocaleString()} Prs</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right; font-weight: 700;">${o.packedStage5Qty.toLocaleString()} Prs</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right; font-weight: 700;">${o.packedStage5Cartons} Ctns</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center; font-weight: 700;">${escapeHtml(o.reconciliation.badgeText)}</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">${escapeHtml(o.orderStatus)}</td>
      </tr>
    `
          )
          .join('');

  const html = `
    <div class="printable-slip-box">
      <div class="printable-slip-header">
        <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-950);">HAMMAD INDUSTRIES &bull; FINAL QC (AQL 1.5) &amp; STAGE 5 EXPORT DISPATCH MANIFEST</h2>
        <p style="margin: 2px 0 0; font-size: 11px; text-transform: uppercase; color: var(--ink-600);">
          ISO 2859-1 Level II Final Inspection Gate &bull; Master Carton Sealing &amp; Container Release
        </p>
      </div>
      <div class="printable-meta-grid">
        <div><span>Orders Completed:</span> <strong>${s.completedOrders} / ${s.totalOrders}</strong></div>
        <div><span>Stage 4 Holding for QC:</span> <strong>${s.stage4ReadyForQcPairs.toLocaleString()} Pairs</strong></div>
        <div><span>Stage 5 Sealed Pairs:</span> <strong>${s.stage5PackedPairs.toLocaleString()} Pairs</strong></div>
        <div><span>Master Export Cartons:</span> <strong>${s.stage5PackedCartons} Cartons</strong></div>
      </div>
      <div style="font-size: 11px; padding: 6px 10px; margin-bottom: 8px; border: 1px solid var(--border-strong); background: var(--ink-50);">
        <strong>Reconciliation Rule:</strong> Stage 5 Master Carton Packing is locked until Final QC passes after Stage 4. Order closes as <code>COMPLETED &amp; DISPATCHED</code> when <code>Received &ge; Planned</code>, <code>Dock Pool = 0</code>, and <code>Stage 5 Packed + Scrapped = Issued</code>.
      </div>
      <table class="size-matrix-table" style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11.5px;">
        <thead>
          <tr style="background: var(--ink-100); color: var(--ink-950);">
            <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Order #</th>
            <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Buyer</th>
            <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">PO #</th>
            <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Article</th>
            <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Stage 4 Hold (QC)</th>
            <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Stage 5 Packed</th>
            <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Master Cartons</th>
            <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">Reconcile</th>
            <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">Closure Status</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
      <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 22px; border-top: 1px dashed var(--ink-500); padding-top: 8px;">
        <span>Final QC Inspector: ___________________</span>
        <span>Dispatch Gate Officer: ___________________</span>
        <span>Super User Approval: ___________________</span>
      </div>
    </div>
  `;

  return {
    title: 'Final QC (AQL 1.5) & Stage 5 Export Dispatch Manifest',
    html,
    csvFilename: 'Report_4_Final_QC_Dispatch_Manifest.csv',
    csvRows
  };
}

function renderReportVisualChart(ctx: SuperUserRenderContext): string {
  const s = ctx.rollupSummary;
  const activeRep = ctx.activeReport || 'order_grn_balance';

  if (activeRep === 'order_grn_balance') {
    if (s.orderRollups.length === 0) return '';
    return `
      <section class="panel-card" style="padding: 12px 16px; margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <strong style="font-size: 12px; text-transform: uppercase; color: var(--su-text-primary);">Visual Graph: Order Planned vs. Received GRNs vs. Contractor Balance</strong>
          <div style="display: flex; gap: 12px; font-size: 11px; color: var(--su-text-secondary);">
            <span><span style="display: inline-block; width: 10px; height: 10px; background: var(--su-grn-primary); margin-right: 4px;"></span>Received GRNs</span>
            <span><span style="display: inline-block; width: 10px; height: 10px; background: var(--su-grn-fill-soft); border: 1px solid var(--su-grn-border); margin-right: 4px;"></span>Contractor Balance Owed</span>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; font-variant-numeric: tabular-nums;">
          ${s.orderRollups
            .map(o => {
              const plan = Math.max(1, o.plannedQty || o.receivedGrnQty || 1);
              const rcvdPct = Math.min(100, Math.round((o.receivedGrnQty / plan) * 100));
              return `
              <div style="display: grid; grid-template-columns: 180px 1fr 170px; align-items: center; gap: 10px; font-size: 11.5px;">
                <div>
                  <strong style="color: var(--su-req-primary);">${escapeHtml(o.orderId)}</strong> <span style="color: var(--su-text-muted);">(${escapeHtml(o.maker)})</span>
                </div>
                <div style="height: 14px; background: var(--su-grn-fill-soft); border: 1px solid var(--su-grn-border); border-radius: 3px; overflow: hidden; display: flex;">
                  <div style="width: ${rcvdPct}%; height: 100%; background: var(--su-grn-primary);"></div>
                </div>
                <div style="text-align: right; font-family: var(--font-mono); font-size: 11px;">
                  <strong style="color: var(--su-grn-dark);">${o.receivedGrnQty.toLocaleString()}</strong> / ${o.plannedQty.toLocaleString()} Prs (${rcvdPct}%)
                </div>
              </div>
            `;
            })
            .join('')}
        </div>
      </section>
    `;
  }

  if (activeRep === 'req_traceability') {
    const allReqs = s.orderRollups.flatMap(o => o.reqBatches);
    if (allReqs.length === 0) return '';
    return `
      <section class="panel-card" style="padding: 12px 16px; margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <strong style="font-size: 12px; text-transform: uppercase; color: var(--su-text-primary);">Visual Graph: Requisition (REQ &rarr; M &amp; A) Stage Execution Progress</strong>
          <div style="display: flex; gap: 12px; font-size: 11px; color: var(--su-text-secondary);">
            <span><span style="display: inline-block; width: 10px; height: 10px; background: var(--su-complete-primary); margin-right: 4px;"></span>Stage 5 Packed</span>
            <span><span style="display: inline-block; width: 10px; height: 10px; background: var(--su-mreq-primary); margin-right: 4px;"></span>Floor WIP / Stage 4 Hold</span>
            <span><span style="display: inline-block; width: 10px; height: 10px; background: var(--su-areq-primary); margin-right: 4px;"></span>Alteration (A) / Scrap</span>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; font-variant-numeric: tabular-nums;">
          ${allReqs
            .map(r => {
              const base = Math.max(1, r.askingPairs || r.issuedPairs || 1);
              const s5Pct = Math.min(100, Math.round((r.packedStage5Pairs / base) * 100));
              const wipPct = Math.min(100 - s5Pct, Math.round((r.inFloorWipPairs / base) * 100));
              const altPct = Math.min(
                100 - s5Pct - wipPct,
                Math.round(((r.inAlterationPairs + r.scrappedPairs) / base) * 100)
              );
              return `
              <div style="display: grid; grid-template-columns: 220px 1fr 170px; align-items: center; gap: 10px; font-size: 12px;">
                <div style="font-family: var(--font-mono); font-size: 12px;">
                  <strong style="color: var(--su-req-primary);">${escapeHtml(r.reqNumber)}</strong> <span style="color: var(--su-text-muted);">(${escapeHtml(r.parentOrderId)})</span>
                </div>
                <div style="height: 14px; background: var(--su-bg-tertiary); border: 1px solid var(--su-border); border-radius: 3px; overflow: hidden; display: flex;">
                  <div style="width: ${s5Pct}%; height: 100%; background: var(--su-complete-primary);"></div>
                  <div style="width: ${wipPct}%; height: 100%; background: var(--su-mreq-primary);"></div>
                  <div style="width: ${altPct}%; height: 100%; background: var(--su-areq-primary);"></div>
                </div>
                <div style="text-align: right; font-family: var(--font-mono); font-size: 12px;">
                  S5: <strong style="color: var(--su-complete-dark);">${r.packedStage5Pairs}</strong> | WIP: <strong style="color: var(--su-mreq-dark);">${r.inFloorWipPairs}</strong>
                </div>
              </div>
            `;
            })
            .join('')}
        </div>
      </section>
    `;
  }

  return '';
}

function renderReportsTab(ctx: SuperUserRenderContext): string {
  const activeRep = ctx.activeReport || 'order_grn_balance';
  const built = buildSuperUserReportHtml(ctx);

  return `
    <section class="panel-card" style="padding: 12px 16px; margin-bottom: 14px;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          <button
            type="button"
            class="${activeRep === 'order_grn_balance' ? 'btn-primary' : 'btn-outline'} admin-report-select-btn"
            data-report-type="order_grn_balance"
            data-report-id="order_grn_balance"
            style="padding: 6px 12px; font-size: 11.5px;"
          >
            1. Order vs. Inward GRN Balance
          </button>
          <button
            type="button"
            class="${activeRep === 'req_traceability' ? 'btn-primary' : 'btn-outline'} admin-report-select-btn"
            data-report-type="req_traceability"
            data-report-id="req_traceability"
            style="padding: 6px 12px; font-size: 11.5px;"
          >
            2. Order-to-Requisition (REQ / M / A) Ledger
          </button>
          <button
            type="button"
            class="${activeRep === 'contractor_scrap' ? 'btn-primary' : 'btn-outline'} admin-report-select-btn"
            data-report-type="contractor_scrap"
            data-report-id="contractor_scrap"
            style="padding: 6px 12px; font-size: 11.5px;"
          >
            3. Contractor Alteration &amp; Scrap Statement
          </button>
          <button
            type="button"
            class="${activeRep === 'final_qc_dispatch' ? 'btn-primary' : 'btn-outline'} admin-report-select-btn"
            data-report-type="final_qc_dispatch"
            data-report-id="final_qc_dispatch"
            style="padding: 6px 12px; font-size: 11.5px;"
          >
            4. Final QC &amp; Stage 5 Dispatch Manifest
          </button>
        </div>

        <div style="display: flex; gap: 8px;">
          <button type="button" class="btn-outline" id="btn-admin-export-report-csv" style="padding: 6px 12px; font-size: 11.5px;">
            Export Report CSV
          </button>
          <button type="button" class="btn-primary" id="btn-admin-print-report" style="padding: 6px 14px; font-size: 11.5px;">
            Print Official A4 Report
          </button>
        </div>
      </div>
    </section>

    ${renderReportVisualChart(ctx)}

    <section class="panel-card" style="padding: 16px;" id="admin-report-preview-surface">
      <div class="su-report-sheet-wrap">
        ${built.html}
      </div>
    </section>
  `;
}

function renderUsersTab(ctx: SuperUserRenderContext): string {
  const systemUsers = ctx.systemUsers || [];
  return `
    <section class="panel-card su-users-panel">
      <div class="panel-card-header">
        <div class="panel-card-title">
          <span>User Management</span>
          <span class="panel-counter-badge">${systemUsers.length} Accounts</span>
        </div>
        <span class="admin-meta-caption">Create station accounts and manage their sign-in passwords</span>
      </div>
      <div class="su-users-content">
        <div class="su-user-form-grid">
          <div class="form-group">
            <label for="admin-user-name">Operator Name</label>
            <input type="text" id="admin-user-name" class="form-input" placeholder="e.g. H. Malik" />
          </div>
          <div class="form-group">
            <label for="admin-user-username">Username</label>
            <input type="text" id="admin-user-username" class="form-input" autocomplete="off" placeholder="e.g. h.malik" />
          </div>
          <div class="form-group">
            <label for="admin-user-password">Password</label>
            <input type="password" id="admin-user-password" class="form-input" autocomplete="new-password" placeholder="At least 8 characters" />
            <span class="form-hint">This is the account's sign-in password.</span>
          </div>
          <div class="form-group">
            <label for="admin-user-role">Assigned Role</label>
            <select id="admin-user-role" class="form-select">
              <option value="SUPER_USER">SUPER_USER (All Permissions)</option>
              <option value="INWARD_CLERK">INWARD_CLERK (GRN + Dock Issue)</option>
              <option value="PACKING_SUPERVISOR">PACKING_SUPERVISOR (REQ + WIP)</option>
              <option value="QC_INSPECTOR">QC_INSPECTOR (Final QC Gate)</option>
              <option value="ALTERATION_LEAD">ALTERATION_LEAD (A-REQ + Scrap)</option>
            </select>
          </div>
          <div class="form-group">
            <label for="admin-user-station">Station</label>
            <select id="admin-user-station" class="form-select">
              <option value="Super User">Super User</option>
              <option value="Dock #1">Inward Register (Dock #1)</option>
              <option value="Packing Hall #1" selected>Packing Hall</option>
              <option value="Final QC">Final QC</option>
              <option value="Alteration Bay">Alteration Bay</option>
            </select>
          </div>
          <button type="button" class="btn-primary" id="btn-admin-add-system-user" data-su-action="add-system-user">Create Account</button>
        </div>
      </div>
    </section>
    <section class="panel-card su-users-panel">
      <div class="panel-card-header">
        <div class="panel-card-title"><span>Existing Accounts</span></div>
        <span class="admin-meta-caption">Changing a password signs that account out on all devices.</span>
      </div>
      <div class="su-users-content">
        <div class="table-responsive">
          <table class="data-table su-user-table">
            <thead>
              <tr><th>Operator</th><th>Username</th><th>Role</th><th>Station</th><th>Status</th><th>Authorized Actions</th><th>Set Sign-in Password &amp; Actions</th></tr>
            </thead>
            <tbody>
              ${systemUsers.map(user => {
                const perms = ROLE_PERMISSIONS[user.role] || [];
                const summaryPreview = perms.length > 0
                  ? `${perms.length} action${perms.length === 1 ? '' : 's'} (${escapeHtml(perms.slice(0, 2).join(', '))}${perms.length > 2 ? ', +' + (perms.length - 2) + ' more' : ''})`
                  : 'No permissions';
                const isCurrentUser = Boolean(ctx.currentUserId && user.userId === ctx.currentUserId);
                return `
                <tr>
                  <td class="font-bold">${escapeHtml(user.name)}</td>
                  <td>${escapeHtml(user.username)}</td>
                  <td><span class="su-badge su-badge-req">${escapeHtml(user.role)}</span></td>
                  <td>${escapeHtml(user.station || 'Unassigned')}</td>
                  <td>${user.active ? 'Active' : 'Disabled'}</td>
                  <td class="su-user-permissions">
                    <details class="su-perm-disclosure">
                      <summary>${summaryPreview}</summary>
                      <div class="su-perm-list">
                        ${perms.map(perm => `<span class="su-badge">${escapeHtml(perm)}</span>`).join('') || '<span>None</span>'}
                      </div>
                    </details>
                  </td>
                  <td>
                    <div class="su-user-password-control">
                      <input type="password" class="form-input" data-admin-user-password="${escapeHtml(user.userId)}"
                        autocomplete="new-password" aria-label="New sign-in password for ${escapeHtml(user.username)}"
                        placeholder="At least 8 characters" />
                      <button type="button" class="btn-outline" data-admin-reset-password="${escapeHtml(user.userId)}">Update</button>
                      <button
                        type="button"
                        class="btn-danger"
                        data-admin-delete-user="${escapeHtml(user.userId)}"
                        aria-label="Delete user ${escapeHtml(user.username)}"
                        ${isCurrentUser ? 'disabled title="Cannot delete your own active Super User account"' : ''}
                      >Delete</button>
                    </div>
                  </td>
                </tr>
              `;
              }).join('') || '<tr><td colspan="7">No station accounts have been created yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

function renderAdminNavIcon(section: 'dashboard' | 'tracking' | 'orders' | 'users' | 'reports'): string {
  switch (section) {
    case 'dashboard':
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>`;
    case 'tracking':
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`;
    case 'orders':
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`;
    case 'users':
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
    case 'reports':
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
  }
}

export function renderSuperUserScreen(ctx: SuperUserRenderContext): string {
  const ov = ctx.adminOverview;
  const s = ctx.rollupSummary;
  const totalScrapDeduction =
    ov.scrapLedger.reduce(
      (sum: number, item: any) => sum + Number(item.financial_deduction_amount || 0),
      0
    ) || s.totalScrappedPairs * 150;

  const isCreationTab = ctx.activeTab === 'orders' || ctx.activeTab === 'creation';

  let tabBody = '';
  if (ctx.activeTab === 'dashboard') {
    tabBody = renderDashboardTab(ctx, totalScrapDeduction);
  } else if (ctx.activeTab === 'tracking') {
    tabBody = renderLiveTrackingTab(ctx);
  } else if (ctx.activeTab === 'users') {
    tabBody = renderUsersTab(ctx);
  } else if (isCreationTab) {
    tabBody = renderOrderCreationTab(ctx);
  } else {
    tabBody = renderReportsTab(ctx);
  }

  return `
    <div class="superuser-command-center" data-testid="superuser-command-center">
      <!-- Sub-Header Bar -->
      <div class="sub-header-bar">
        <h1 class="sub-header-title">
          <span>Super User Control Center &mdash; Dashboard, Live Tracking, Order Creation, User Management &amp; Reports</span>
        </h1>
        <div class="sub-header-right">
          <button class="btn-outline" id="btn-admin-refresh" style="padding: 4px 10px; font-size: 12px;">
            Sync Database
          </button>
        </div>
      </div>

      <main id="main-content" class="main-viewport" tabindex="-1">
        <div class="admin-workspace-layout ${ctx.adminNavCollapsed ? 'admin-nav-collapsed' : ''}">
          <aside class="admin-sidebar" aria-label="Super User navigation">
            <div class="admin-sidebar-heading">
              <span class="admin-sidebar-label">Super User</span>
              <button type="button" class="admin-sidebar-toggle" id="btn-admin-nav-toggle"
                aria-label="${ctx.adminNavCollapsed ? 'Expand' : 'Collapse'} Super User menu"
                aria-expanded="${!ctx.adminNavCollapsed}">
                ${ctx.adminNavCollapsed ? 'Expand' : 'Collapse'}
              </button>
            </div>
            <nav class="admin-subnav-tabs" aria-label="Super User Navigation">
              <button type="button" class="admin-tab-btn ${ctx.activeTab === 'dashboard' ? 'active' : ''}"
                aria-label="Dashboard" data-admin-tab="dashboard"${ctx.activeTab === 'dashboard' ? ' aria-current="page"' : ''}${ctx.adminNavCollapsed ? ' title="Dashboard"' : ''}>
                <span class="admin-tab-heading">
                  <span class="admin-tab-icon" aria-hidden="true">${renderAdminNavIcon('dashboard')}</span>
                  <span class="admin-tab-label">Dashboard</span>
                </span>
              </button>
              <button type="button" class="admin-tab-btn ${ctx.activeTab === 'tracking' ? 'active' : ''}"
                aria-label="Live Tracking" data-admin-tab="tracking"${ctx.activeTab === 'tracking' ? ' aria-current="page"' : ''}${ctx.adminNavCollapsed ? ' title="Live Tracking"' : ''}>
                <span class="admin-tab-heading">
                  <span class="admin-tab-icon" aria-hidden="true">${renderAdminNavIcon('tracking')}</span>
                  <span class="admin-tab-label">Live Tracking</span>
                </span>
                <span class="admin-tab-count">${s.totalOrders} Orders &bull; ${s.totalGrnCount} GRNs &bull; ${s.totalReqCount} REQs</span>
              </button>
              <button type="button" class="admin-tab-btn ${isCreationTab ? 'active' : ''}"
                aria-label="Order Creation" data-admin-tab="orders"${isCreationTab ? ' aria-current="page"' : ''}${ctx.adminNavCollapsed ? ' title="Order Creation"' : ''}>
                <span class="admin-tab-heading">
                  <span class="admin-tab-icon" aria-hidden="true">${renderAdminNavIcon('orders')}</span>
                  <span class="admin-tab-label">Order Creation</span>
                </span>
                <span class="admin-tab-count">${ctx.pendingOrders.length}</span>
              </button>
              <button type="button" class="admin-tab-btn ${ctx.activeTab === 'users' ? 'active' : ''}"
                aria-label="User Management" data-admin-tab="users"${ctx.activeTab === 'users' ? ' aria-current="page"' : ''}${ctx.adminNavCollapsed ? ' title="User Management"' : ''}>
                <span class="admin-tab-heading">
                  <span class="admin-tab-icon" aria-hidden="true">${renderAdminNavIcon('users')}</span>
                  <span class="admin-tab-label">User Management</span>
                </span>
                <span class="admin-tab-count">${(ctx.systemUsers || []).length}</span>
              </button>
              <button type="button" class="admin-tab-btn ${ctx.activeTab === 'reports' ? 'active' : ''}"
                aria-label="Reports" data-admin-tab="reports"${ctx.activeTab === 'reports' ? ' aria-current="page"' : ''}${ctx.adminNavCollapsed ? ' title="Reports"' : ''}>
                <span class="admin-tab-heading">
                  <span class="admin-tab-icon" aria-hidden="true">${renderAdminNavIcon('reports')}</span>
                  <span class="admin-tab-label">Reports</span>
                </span>
              </button>
            </nav>
          </aside>

          <div class="admin-workspace">
            ${ctx.activeTab === 'users' ? '' : `<div class="admin-meta-caption admin-workspace-caption">
              Hierarchy: 1 Order &rarr; Multiple GRNs (0001, 0002...) &amp; Multiple REQs (0001, 0002... &rarr; M &amp; A)
            </div>`}
            ${tabBody}
            <footer class="portal-footer">
              <div class="footer-stats-left">
                <span>Master Orders: <strong>${s.totalOrders}</strong></span>
                <span class="stat-divider">|</span>
                <span>Planned: <strong>${s.totalPlannedPairs.toLocaleString()} Prs</strong></span>
                <span class="stat-divider">|</span>
                <span>Received (GRNs): <strong style="color: var(--su-grn-deep);">${s.totalReceivedGrnPairs.toLocaleString()} Prs</strong></span>
                <span class="stat-divider">|</span>
                <span>Issued (REQs): <strong style="color: var(--su-req-primary);">${s.totalIssuedReqPairs.toLocaleString()} Prs</strong></span>
                <span class="stat-divider">|</span>
                <span>Packed (Stage 5): <strong style="color: var(--su-complete-dark);">${s.stage5PackedPairs.toLocaleString()} Prs</strong></span>
              </div>
            </footer>
          </div>
        </div>
      </main>
    </div>
  `;
}
