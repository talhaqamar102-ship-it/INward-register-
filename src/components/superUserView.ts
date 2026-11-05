import {
  PendingOrder,
  calculateSizeTotal,
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
  DEFAULT_MES_POLICY_CONFIG
} from '../utils/requisitionLogic';

export type SuperUserTab = 'dashboard' | 'tracking' | 'orders' | 'creation' | 'reports';
export type SuperUserReportType =
  | 'order_grn_balance'
  | 'req_traceability'
  | 'contractor_scrap'
  | 'final_qc_dispatch';

export interface SystemUserRecord {
  userId: string;
  name: string;
  role: MesUserRole;
  station: string;
  active: boolean;
}

export interface SuperUserRenderContext {
  activeTab: SuperUserTab;
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
  auditTrail?: AuditTrailEntry[];
  adminOverview: {
    dbHealth: {
      journalMode: string;
      integrity: string;
      tableCounts: Record<string, number>;
      totalTables: number;
    };
    customers: any[];
    products: any[];
    receivings: any[];
    alterations: any[];
    scrapLedger: any[];
  };
  lastBackupPath: string;
  rollupSummary: SuperUserDashboardSummary;
}

function renderReconciliationBadge(rec: ReconciliationResult): string {
  if (rec.isReconciled) {
    return `<span class="su-badge su-badge-reconciled" title="${rec.detail.replace(/"/g, '&quot;')}">RECONCILED &#10003;</span>`;
  }
  const deltaSign = rec.deltaPairs > 0 ? `+${rec.deltaPairs}` : `${rec.deltaPairs}`;
  return `<span class="su-badge su-badge-variance" title="${rec.detail.replace(/"/g, '&quot;')}">VARIANCE &Delta; (${deltaSign} Prs &bull; ${rec.failingGate})</span>`;
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
    <div style="display: inline-flex; align-items: center; gap: 4px; font-family: var(--font-mono); font-size: 10.5px;">
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
      textColor: 'var(--su-grn-primary)',
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
      textColor: 'var(--su-mreq-primary)',
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
          <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; align-items: end; height: 185px; padding-top: 22px; border-bottom: 2px solid var(--su-axis-border);">
            ${stageBars
              .map(b => {
                const barHeightPx =
                  b.pairs > 0 ? Math.max(14, Math.round((b.pairs / maxStageVal) * 128)) : 4;
                return `
                <div
                  onclick="document.querySelector('[data-admin-tab=\\'tracking\\']')?.click()"
                  style="display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; cursor: pointer;"
                  title="${b.label}: ${b.pairs.toLocaleString()} Pairs (${b.pctOfPlan}% of Order Book)"
                >
                  <div style="font-size: 11px; font-weight: 800; color: ${b.textColor}; margin-bottom: 2px; white-space: nowrap;">
                    ${b.pairs.toLocaleString()}
                  </div>
                  <div style="font-size: 9.5px; color: var(--su-text-muted); margin-bottom: 5px;">
                    ${b.pctOfPlan}%
                  </div>
                  <div style="width: 72%; height: ${barHeightPx}px; background: ${b.fill}; border: 1.5px solid ${b.border}; border-bottom: none; border-radius: 3px 3px 0 0; transition: height 0.2s ease;"></div>
                </div>
              `;
              })
              .join('')}
          </div>
          <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; padding-top: 8px; text-align: center;">
            ${stageBars
              .map(
                b => `
              <div>
                <div style="font-family: var(--font-mono); font-size: 9.5px; font-weight: 800; color: ${b.textColor};">${b.step}</div>
                <div style="font-size: 10.5px; font-weight: 800; color: var(--su-text-primary); line-height: 1.2; margin-top: 1px;">${b.label}</div>
                <div style="font-size: 9.5px; color: var(--su-text-muted); margin-top: 2px; line-height: 1.15;">${b.sub}</div>
              </div>
            `
              )
              .join('')}
          </div>
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
                Create a Master Order in <strong>3. Order Creation</strong> or click <strong>Load 600-Pair Demo</strong> above to see its live visual node tree.
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
                    <strong style="font-size: 12.5px; color: var(--su-req-primary);">${o.orderId}</strong>
                    <span style="font-size: 11px; color: var(--su-text-secondary); margin-left: 6px;">${o.buyer} &bull; ${o.article} &bull; Plan: <strong>${o.plannedQty.toLocaleString()} Prs</strong></span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    ${renderReconciliationBadge(o.reconciliation)}
                    <button type="button" class="table-btn" style="font-size: 10.5px; padding: 2px 8px;" onclick="window.adminInspectOrderInTracking('${o.orderId.replace(/'/g, "\\'")}')">Inspect Graph &rarr;</button>
                  </div>
                </div>

                <div style="display: grid; grid-template-columns: 95px 1fr 48px; align-items: center; gap: 8px; font-size: 10.5px; margin-bottom: 4px;">
                  <span style="color: var(--su-grn-dark); font-weight: 700;">GRN Supply:</span>
                  <div style="height: 8px; background: var(--su-grn-fill-soft); border: 1px solid var(--su-grn-border); border-radius: 2px; overflow: hidden;">
                    <div style="width: ${rcvdPct}%; height: 100%; background: var(--su-grn-primary);"></div>
                  </div>
                  <span style="text-align: right; font-weight: 800; color: var(--su-grn-dark);">${rcvdPct}%</span>
                </div>

                <div style="display: grid; grid-template-columns: 95px 1fr 48px; align-items: center; gap: 8px; font-size: 10.5px; margin-bottom: 8px;">
                  <span style="color: var(--su-req-primary); font-weight: 700;">REQ Execution:</span>
                  <div style="height: 8px; background: var(--su-bg-tertiary); border: 1px solid var(--su-border); border-radius: 2px; overflow: hidden; display: flex;">
                    <div style="width: ${s5Pct}%; height: 100%; background: var(--su-complete-primary);" title="Stage 5 Packed: ${o.packedStage5Qty} Prs"></div>
                    <div style="width: ${s4Pct}%; height: 100%; background: var(--su-mreq-primary);" title="Stage 4 Hold QC: ${o.awaitingFinalQcQty} Prs"></div>
                    <div style="width: ${wipPct}%; height: 100%; background: var(--su-req-accent);" title="Stages 1-3 WIP: ${wipOnly} Prs"></div>
                    <div style="width: ${altPct}%; height: 100%; background: var(--su-areq-primary);" title="Alteration/Scrap: ${o.inAlterationQty + o.scrappedQty} Prs"></div>
                  </div>
                  <span style="text-align: right; font-weight: 800; color: var(--su-complete-primary);">${s5Pct}% S5</span>
                </div>

                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-family: var(--font-mono); font-size: 10px; background: var(--su-bg-primary); padding: 6px 8px; border-radius: 4px; border: 1px solid var(--su-border-subtle);">
                  <span style="font-weight: 800; color: var(--su-req-primary);">${o.orderId}</span>
                  <span style="color: var(--su-text-muted);">&rarr;</span>
                  ${
                    o.grnBatches.length === 0
                      ? `<span style="color: var(--su-text-muted);">[0 GRNs]</span>`
                      : o.grnBatches
                          .map(
                            g =>
                              `<button type="button" class="su-chip-btn su-badge su-badge-grn" style="font-size: 10px; padding: 1px 6px;" onclick="window.adminInspectOrderInTracking('${o.orderId.replace(/'/g, "\\'")}', '${g.grnCode}')">${g.grnCode} (${g.rcvdPairs})</button>`
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
                              `<button type="button" class="su-chip-btn su-badge su-badge-req" style="font-size: 10px; padding: 1px 6px;" onclick="window.adminInspectOrderInTracking('${o.orderId.replace(/'/g, "\\'")}', '${r.reqNumber}')">${r.reqNumber} &rarr; <span style="color: var(--su-mreq-primary);">${r.mreqNo}</span> | <span style="color: var(--su-areq-primary);">${r.altReqNo}</span> (${r.askingPairs})</button>`
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
    return `<span style="font-size: 10.5px; color: var(--su-text-muted);">0 GRNs</span>`;
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
              style="font-size: 10px; padding: 1px 6px;"
              title="${g.grnCode}: ${g.rcvdPairs} Prs (${g.allocationStatus}) — Click to inspect in Live Tracking"
              onclick="window.adminInspectOrderInTracking('${ord.orderId.replace(/'/g, "\\'")}', '${g.grnCode}')"
            >${g.grnCode} (${g.rcvdPairs})</button>
            <button
              type="button"
              class="su-chip-btn"
              style="font-size: 9.5px; padding: 1px 4px; background: var(--su-bg-primary); color: var(--su-text-secondary);"
              title="Open Printable GRN Slip (${g.grnCode})"
              onclick="window.adminOpenDocumentSlip && window.adminOpenDocumentSlip('GRN', '${g.grnCode}', '${ord.orderId.replace(/'/g, "\\'")}')"
            >Slip</button>
          </span>
        `)
        .join('')}
      ${
        sliced.overflowCount > 0
          ? `<button type="button" class="su-chip-btn su-badge su-badge-grn" style="font-size: 10px; padding: 1px 6px;" onclick="window.adminInspectOrderInTracking('${ord.orderId.replace(/'/g, "\\'")}')">+${sliced.overflowCount} more</button>`
          : ''
      }
    </div>
  `;
}

function renderOrderReqChipsWithOverflow(ord: SuperUserOrderRollup): string {
  if (ord.reqBatches.length === 0) {
    return `<span style="font-size: 10.5px; color: var(--su-text-muted);">0 REQs</span>`;
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
              style="font-size: 10px; padding: 1px 6px;"
              title="${r.reqNumber} | ${r.mreqNo} | ${r.altReqNo} (${r.issuedPairs || r.askingPairs} Prs) — Click to inspect in Live Tracking"
              onclick="window.adminInspectOrderInTracking('${ord.orderId.replace(/'/g, "\\'")}', '${r.reqNumber}')"
            >${r.reqNumber}&middot;M&middot;A (${r.issuedPairs || r.askingPairs})</button>
            <button
              type="button"
              class="su-chip-btn"
              style="font-size: 9.5px; padding: 1px 4px; background: var(--su-bg-primary); color: var(--su-text-secondary);"
              title="Open Printable REQ Slip (${r.reqNumber})"
              onclick="window.adminOpenDocumentSlip && window.adminOpenDocumentSlip('REQ', '${r.reqNumber}', '${ord.orderId.replace(/'/g, "\\'")}')"
            >Slip</button>
          </span>
        `)
        .join('')}
      ${
        sliced.overflowCount > 0
          ? `<button type="button" class="su-chip-btn su-badge su-badge-req" style="font-size: 10px; padding: 1px 6px;" onclick="window.adminInspectOrderInTracking('${ord.orderId.replace(/'/g, "\\'")}')">+${sliced.overflowCount} more</button>`
          : ''
      }
    </div>
  `;
}

function renderDashboardTab(ctx: SuperUserRenderContext, totalScrapDeduction: number): string {
  const s = ctx.rollupSummary;
  const hasDemoOrder = s.orderRollups.some(o => o.orderId === 'ORD-2026-600');

  return `
    <!-- 5.6: Flagged & Removable 600-Pair Demo Scenario Bar -->
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; padding: 8px 14px; margin-bottom: 12px; background: var(--su-bg-primary); border: 1px solid var(--su-border); border-radius: 4px;">
      <div style="font-size: 11.5px; color: var(--su-text-secondary);">
        <strong style="color: var(--su-text-primary);">Reconciliation Health:</strong>
        <span class="su-badge su-badge-reconciled" style="margin-left: 6px;">${s.reconciledOrdersCount} / ${s.totalOrders} Orders Reconciled &#10003;</span>
        ${
          s.varianceOrdersCount > 0
            ? `<span class="su-badge su-badge-variance" style="margin-left: 6px;">${s.varianceOrdersCount} Order Variance &Delta;</span>`
            : ''
        }
      </div>
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <button
          type="button"
          class="btn-outline"
          id="btn-load-demo-600-inprogress"
          style="padding: 4px 10px; font-size: 11px;"
          onclick="window.adminLoadDemo600Scenario && window.adminLoadDemo600Scenario('IN_PROGRESS')"
        >
          Load 600-Pair Demo (Step 5: S4 Hold + A-REQ Cycle 1/2)
        </button>
        <button
          type="button"
          class="btn-primary"
          id="btn-load-demo-600-complete"
          style="padding: 4px 10px; font-size: 11px;"
          onclick="window.adminLoadDemo600Scenario && window.adminLoadDemo600Scenario('COMPLETED')"
        >
          Load 600-Pair Demo (1-Order &rarr; 3-GRNs &rarr; 3-REQs Complete)
        </button>
        <button
          type="button"
          class="btn-outline"
          id="btn-load-demo-600-variance"
          style="padding: 4px 10px; font-size: 11px; color: var(--su-areq-primary); border-color: var(--su-areq-border);"
          onclick="window.adminLoadDemo600Scenario && window.adminLoadDemo600Scenario('DELIBERATE_VARIANCE')"
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
            style="padding: 4px 10px; font-size: 11px; color: var(--su-areq-primary); border-color: var(--su-areq-border);"
            onclick="window.adminRemoveDemo600Scenario && window.adminRemoveDemo600Scenario()"
          >
            Remove Demo Scenario
          </button>
        `
            : ''
        }
      </div>
    </div>

    <!-- Row 1: 4 Factory Pulse KPI Cards (5.1 & 5.5: Above the fold at 1440px desktop) -->
    <div class="admin-kpi-grid" data-testid="su-pulse-cards-grid" style="margin-bottom: 10px;">
      <div class="admin-kpi-card su-kpi-grn">
        <div class="admin-kpi-label">1. Order Book vs. Dock Receiving</div>
        <div class="admin-kpi-value" style="font-variant-numeric: tabular-nums; color: var(--su-grn-primary);">
          ${s.totalReceivedGrnPairs.toLocaleString()} / ${s.totalPlannedPairs.toLocaleString()} Prs
        </div>
        <div class="admin-kpi-sub" style="font-variant-numeric: tabular-nums;">
          ${s.totalOrders} Orders (${s.totalGrnCount} GRNs) &bull; Contractor Bal: <strong>${s.totalContractorBalancePairs.toLocaleString()} Prs</strong>
        </div>
      </div>

      <div class="admin-kpi-card su-kpi-mreq">
        <div class="admin-kpi-label">2. Dock Available Stock Pool</div>
        <div class="admin-kpi-value" style="font-variant-numeric: tabular-nums; color: var(--su-mreq-primary);">
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
          Stage 4 Hold (Awaiting QC): <strong style="color: var(--su-mreq-primary);">${s.stage4ReadyForQcPairs.toLocaleString()} Prs</strong> &bull; Packed S5: <strong style="color: var(--su-complete-primary);">${s.stage5PackedPairs.toLocaleString()} Prs</strong>
        </div>
      </div>

      <div class="admin-kpi-card su-kpi-areq">
        <div class="admin-kpi-label">4. Alteration (A-REQ) &amp; Scrap Ledger</div>
        <div class="admin-kpi-value" style="font-variant-numeric: tabular-nums; color: var(--su-areq-primary);">
          ${s.totalAlterationPairs.toLocaleString()} Rework &bull; ${s.totalScrappedPairs.toLocaleString()} Scrap
        </div>
        <div class="admin-kpi-sub" style="font-variant-numeric: tabular-nums;">
          Completed Orders: <strong style="color: var(--su-complete-primary);">${s.completedOrders}/${s.totalOrders}</strong> &bull; Debit: <strong style="color: var(--su-areq-primary);">PKR ${totalScrapDeduction.toLocaleString()}</strong>
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
                  <td class="font-bold">${req.parentOrderId}</td>
                  <td><button type="button" class="su-chip-btn su-badge su-badge-req" onclick="window.adminOpenDocumentSlip && window.adminOpenDocumentSlip('REQ', '${req.reqNumber}', '${req.parentOrderId}')">${req.reqNumber}</button></td>
                  <td><button type="button" class="su-chip-btn su-badge su-badge-mreq" onclick="window.adminOpenDocumentSlip && window.adminOpenDocumentSlip('M-REQ', '${req.mreqNo}', '${req.parentOrderId}')">${req.mreqNo}</button></td>
                  <td>${req.article}</td>
                  <td class="text-right font-bold" style="color: var(--su-mreq-primary);">${req.stage4Passed.toLocaleString()} Prs</td>
                  <td class="text-center">
                    <button type="button" class="table-btn" onclick="window.adminOpenReqInScreen('${req.reqNumber}', 'screen-qc')">Inspect in Final QC &rarr;</button>
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
                    <td><button type="button" class="su-chip-btn su-badge su-badge-areq" onclick="window.adminOpenDocumentSlip && window.adminOpenDocumentSlip('A-REQ', '${req.altReqNo}', '${req.parentOrderId}')">${req.altReqNo}</button></td>
                    <td class="font-bold">${req.parentOrderId}</td>
                    <td class="font-bold">${req.maker || '---'}</td>
                    <td><span class="su-badge su-badge-areq">Rework &bull; Cycle ${Math.min(2, Math.max(1, req.alterationCycleCount || 1))}/2</span></td>
                    <td class="text-right font-bold" style="color: var(--su-areq-primary);">${req.inAlterationPairs.toLocaleString()} Prs</td>
                    <td class="text-center">
                      <button type="button" class="table-btn" onclick="window.adminOpenReqInScreen('${req.reqNumber}', 'screen-repair')">Open Bay #2</button>
                    </td>
                  </tr>
                `
                      ),
                      ...s.unfulfilledMreqReqs.map(
                        req => `
                  <tr>
                    <td><button type="button" class="su-chip-btn su-badge su-badge-mreq" onclick="window.adminOpenDocumentSlip && window.adminOpenDocumentSlip('M-REQ', '${req.mreqNo}', '${req.parentOrderId}')">${req.mreqNo}</button></td>
                    <td class="font-bold">${req.parentOrderId}</td>
                    <td>${req.maker || '---'}</td>
                    <td><span class="su-badge su-badge-mreq">Unfulfilled M-REQ (${req.mreqStatus})</span></td>
                    <td class="text-right font-bold" style="color: var(--su-mreq-primary);">${req.issuedPairs.toLocaleString()} Prs</td>
                    <td class="text-center">
                      <button type="button" class="table-btn" onclick="window.adminOpenReqInScreen('${req.reqNumber}', 'screen-packing')">Fulfill M-REQ</button>
                    </td>
                  </tr>
                `
                      ),
                      ...s.pendingIssueReqs.map(
                        req => `
                  <tr>
                    <td><button type="button" class="su-chip-btn su-badge su-badge-req" onclick="window.adminOpenDocumentSlip && window.adminOpenDocumentSlip('REQ', '${req.reqNumber}', '${req.parentOrderId}')">${req.reqNumber}</button></td>
                    <td class="font-bold">${req.parentOrderId}</td>
                    <td>${req.maker || '---'}</td>
                    <td><span class="su-badge su-badge-grn">Awaiting Dock Issue (${req.mreqNo})</span></td>
                    <td class="text-right font-bold" style="color: var(--su-grn-primary);">${req.askingPairs.toLocaleString()} Prs</td>
                    <td class="text-center">
                      <button type="button" class="table-btn" onclick="window.adminOpenReqInScreen('${req.reqNumber}', 'screen-grn')">Issue at Dock</button>
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
              <th class="text-center">Reconciliation</th>
              <th class="text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            ${
              s.orderRollups.length === 0
                ? `
              <tr>
                <td colspan="15" class="text-center" style="padding: 28px 16px; color: var(--su-text-muted);">
                  No Master Orders created yet. Go to <strong>3. Order Creation</strong> to create a Buyer Order and issue it to Inward Receiving.
                </td>
              </tr>
            `
                : s.orderRollups
                    .map(
                      o => `
              <tr>
                <td class="font-bold">
                  <button type="button" class="su-chip-btn" style="color: var(--su-req-primary); background: var(--su-req-bg); border-color: var(--su-req-border);" onclick="window.adminInspectOrderInTracking('${o.orderId.replace(/'/g, "\\'")}')">${o.orderId}</button>
                </td>
                <td>${o.buyer}</td>
                <td>${o.maker}</td>
                <td class="font-bold">${o.po}</td>
                <td class="font-bold">${o.article}</td>
                <td class="text-right font-bold">${o.plannedQty.toLocaleString()}</td>
                <td class="text-right">
                  <div class="font-bold" style="color: var(--su-grn-primary); margin-bottom: 3px;">${o.receivedGrnQty.toLocaleString()} Prs (${o.grnBatches.length})</div>
                  ${renderOrderGrnChipsWithOverflow(o)}
                </td>
                <td class="text-right">${o.contractorBalanceQty.toLocaleString()}</td>
                <td class="text-right font-bold" style="color: var(--su-mreq-primary);">${o.dockAvailableQty.toLocaleString()}</td>
                <td class="text-right">
                  <div class="font-bold" style="color: var(--su-req-primary); margin-bottom: 3px;">${o.issuedReqQty.toLocaleString()} Prs (${o.reqBatches.length})</div>
                  ${renderOrderReqChipsWithOverflow(o)}
                </td>
                <td class="text-right">
                  ${o.inFloorWipQty.toLocaleString()} ${o.awaitingFinalQcQty > 0 ? `<span class="su-badge su-badge-mreq" style="font-size: 9.5px; padding: 0 4px;">S4:${o.awaitingFinalQcQty}</span>` : ''}
                </td>
                <td class="text-right" style="color: var(--su-areq-primary); font-weight: 700;">
                  ${o.inAlterationQty} / ${o.scrappedQty}
                </td>
                <td class="text-right font-bold" style="color: var(--su-complete-primary);">${o.packedStage5Qty.toLocaleString()}</td>
                <td class="text-center">${renderReconciliationBadge(o.reconciliation)}</td>
                <td class="text-center"><span class="${getSuperUserStatusBadgeClass(o.orderStatus)}">${o.orderStatus}</span></td>
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
  const uniqueMakers = Array.from(new Set(s.orderRollups.map(o => o.maker).filter(Boolean)));

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
    if (makerFilter !== 'ALL' && o.maker !== makerFilter) {
      return false;
    }
    if (!search) return true;
    const hay = [
      o.orderId,
      o.buyer,
      o.maker,
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

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const pagedOrders = filteredOrders.slice(startIdx, startIdx + pageSize);

  return `
    <!-- 6.1 & 6.7: Live Tracking Filter, Buyer/Contractor Dropdowns, Search & Pagination Bar -->
    <section class="panel-card" style="padding: 12px 16px; margin-bottom: 14px;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 10px;">
        <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 280px; flex-wrap: wrap;">
          <label for="admin-tracking-search" style="font-size: 11px; font-weight: 700; color: var(--su-text-primary); text-transform: uppercase; white-space: nowrap;">
            Search:
          </label>
          <input
            type="text"
            id="admin-tracking-search"
            class="form-input"
            style="max-width: 260px;"
            placeholder="Order #, PO #, GRN-0001, REQ-0001, M-REQ, A-REQ..."
            value="${ctx.trackingSearch}"
          />

          <select
            id="admin-tracking-buyer-filter"
            class="form-select"
            style="max-width: 180px; font-size: 11.5px;"
            aria-label="Filter by Buyer"
            onchange="window.adminSetTrackingBuyerFilter && window.adminSetTrackingBuyerFilter(this.value)"
          >
            <option value="ALL" ${buyerFilter === 'ALL' ? 'selected' : ''}>All Buyers (${uniqueBuyers.length})</option>
            ${uniqueBuyers.map(b => `<option value="${b}" ${buyerFilter === b ? 'selected' : ''}>${b}</option>`).join('')}
          </select>

          <select
            id="admin-tracking-maker-filter"
            class="form-select"
            style="max-width: 190px; font-size: 11.5px;"
            aria-label="Filter by Contractor"
            onchange="window.adminSetTrackingMakerFilter && window.adminSetTrackingMakerFilter(this.value)"
          >
            <option value="ALL" ${makerFilter === 'ALL' ? 'selected' : ''}>All Contractors (${uniqueMakers.length})</option>
            ${uniqueMakers.map(m => `<option value="${m}" ${makerFilter === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>

          ${
            filteredOrders.length > 0
              ? `
            <div style="display: inline-flex; align-items: center; gap: 4px;">
              <button
                type="button"
                class="btn-outline"
                style="padding: 4px 8px; font-size: 11px;"
                onclick="window.adminSetAllOrdersExpanded(true)"
              >
                Expand All
              </button>
              <button
                type="button"
                class="btn-outline"
                style="padding: 4px 8px; font-size: 11px;"
                onclick="window.adminSetAllOrdersExpanded(false)"
              >
                Collapse All
              </button>
            </div>
          `
              : ''
          }
        </div>

        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
          <button type="button" class="${statusFilter === 'ALL' ? 'btn-primary' : 'btn-outline'} admin-tracking-filter-btn" data-tracking-filter="ALL" style="padding: 5px 10px; font-size: 11px;">
            All Orders (${s.orderRollups.length})
          </button>
          <button type="button" class="${statusFilter === 'RECEIVING' ? 'btn-primary' : 'btn-outline'} admin-tracking-filter-btn" data-tracking-filter="RECEIVING" style="padding: 5px 10px; font-size: 11px;">
            Dock Receiving
          </button>
          <button type="button" class="${statusFilter === 'WIP' ? 'btn-primary' : 'btn-outline'} admin-tracking-filter-btn" data-tracking-filter="WIP" style="padding: 5px 10px; font-size: 11px;">
            In Floor WIP
          </button>
          <button type="button" class="${statusFilter === 'HOLD_QC' ? 'btn-primary' : 'btn-outline'} admin-tracking-filter-btn" data-tracking-filter="HOLD_QC" style="padding: 5px 10px; font-size: 11px;">
            Stage 4 Hold (Final QC)
          </button>
          <button type="button" class="${statusFilter === 'COMPLETED' ? 'btn-primary' : 'btn-outline'} admin-tracking-filter-btn" data-tracking-filter="COMPLETED" style="padding: 5px 10px; font-size: 11px;">
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
            <button type="button" class="btn-outline" style="padding: 2px 8px; font-size: 11px;" ${safePage <= 1 ? 'disabled' : ''} onclick="window.adminSetTrackingPage && window.adminSetTrackingPage(${safePage - 1})">&larr; Prev</button>
            <span>Page <strong>${safePage}</strong> / ${totalPages}</span>
            <button type="button" class="btn-outline" style="padding: 2px 8px; font-size: 11px;" ${safePage >= totalPages ? 'disabled' : ''} onclick="window.adminSetTrackingPage && window.adminSetTrackingPage(${safePage + 1})">Next &rarr;</button>
          </div>
        </div>
      `
          : ''
      }
    </section>

    <!-- Real-Time WIP Analytics Bar Chart (Planned Demand vs. Actual Packed Pairs per Active Requisition) -->
    ${(() => {
      const series = buildRequisitionAnalyticsSeries(s);
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
          Create a Master Order in <strong>3. Order Creation</strong>, receive partial or full GRN batches at <strong>Inward Register</strong>, and draw Packing Hall Requisitions (<code>REQ-0001</code>, <code>REQ-0002</code>...) to see the live parent-child tree here.
        </div>
        <button type="button" class="btn-primary" data-admin-tab-jump="orders">Go to 3. Order Creation &rarr;</button>
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
        <section class="su-order-card ${isExpanded ? 'expanded' : 'collapsed'}" id="tracking-order-card-${ord.orderId}" data-order-card="${ord.orderId}">
          <!-- Tier 1: Parent Master Order Header Banner (6.2) -->
          <div class="su-order-card-header">
            <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
              <button
                type="button"
                class="btn-outline"
                style="padding: 3px 8px; font-size: 11px; font-weight: 800;"
                onclick="window.adminToggleOrderExpand('${ord.orderId.replace(/'/g, "\\'")}')"
                aria-expanded="${isExpanded ? 'true' : 'false'}"
              >
                ${isExpanded ? '&#9660; Collapse' : '&#9654; Expand'}
              </button>
              <div>
                <div style="font-size: 13.5px; font-weight: 800; color: var(--su-text-primary); display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  <span style="color: var(--su-req-primary);">MASTER ORDER: ${ord.orderId}</span>
                  <span style="font-weight: 400; color: var(--su-text-muted);">|</span>
                  <span>PO #${ord.po}</span>
                  <span style="font-weight: 400; color: var(--su-text-muted);">|</span>
                  <span>${ord.article} (${ord.color})</span>
                  <span style="font-weight: 400; color: var(--su-text-muted);">|</span>
                  <span style="font-family: var(--font-mono); font-size: 11.5px; color: var(--su-text-secondary);">Plan: <strong>${ord.plannedQty.toLocaleString()} Prs</strong></span>
                  ${renderReconciliationBadge(ord.reconciliation)}
                </div>
                <div style="font-size: 11.5px; color: var(--su-text-secondary); margin-top: 2px;">
                  Buyer: <strong style="color: var(--su-text-primary);">${ord.buyer}</strong> &bull; Contractor / Maker: <strong style="color: var(--su-text-primary);">${ord.maker}</strong> &bull;
                  Planned Sizes: <strong>7:${ord.sizes['7'] || 0} | 8:${ord.sizes['8'] || 0} | 9:${ord.sizes['9'] || 0} | 10:${ord.sizes['10'] || 0} | 11:${ord.sizes['11'] || 0}</strong> &bull;
                  Packed S5 Sizes: <strong>7:${ord.packedSizes['7'] || 0} | 8:${ord.packedSizes['8'] || 0} | 9:${ord.packedSizes['9'] || 0} | 10:${ord.packedSizes['10'] || 0} | 11:${ord.packedSizes['11'] || 0}</strong>
                </div>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <!-- 6.6: Planned vs. Packed visual progress bar per Order -->
              <div style="display: flex; flex-direction: column; gap: 2px; min-width: 155px;" title="Planned: ${ord.plannedQty} Prs | Stage 5 Packed: ${ord.packedStage5Qty} Prs | Stage 4 QC Hold: ${ord.awaitingFinalQcQty} Prs | Floor WIP: ${wipOnly} Prs | Alteration/Scrap: ${ord.inAlterationQty + ord.scrappedQty} Prs">
                <div style="display: flex; justify-content: space-between; font-size: 10px; font-family: var(--font-mono); color: var(--su-text-secondary);">
                  <span>GRN:${pctReceived}%</span>
                  <strong style="color: var(--su-complete-primary);">Packed:${ord.packedStage5Qty}/${ord.plannedQty} (${pctPacked}%)</strong>
                </div>
                <div style="height: 7px; background: var(--su-border-subtle); border: 1px solid var(--su-border); border-radius: 3px; overflow: hidden; display: flex;">
                  <div style="width: ${s5Pct}%; height: 100%; background: var(--su-complete-primary);"></div>
                  <div style="width: ${s4Pct}%; height: 100%; background: var(--su-mreq-primary);"></div>
                  <div style="width: ${wipPct}%; height: 100%; background: var(--su-req-accent);"></div>
                  <div style="width: ${altPct}%; height: 100%; background: var(--su-areq-primary);"></div>
                </div>
              </div>

              <span class="${getSuperUserStatusBadgeClass(ord.orderStatus)}">${ord.orderStatus}</span>
              <button
                type="button"
                class="btn-outline"
                style="padding: 4px 10px; font-size: 11px; border-color: var(--su-grn-border); background: var(--su-grn-bg); color: var(--su-grn-dark); font-weight: 700;"
                onclick="window.adminQuickReceiveGrnForOrder('${ord.orderId.replace(/'/g, "\\'")}')"
              >
                + Receive GRN Batch (Dock)
              </button>
              <button
                type="button"
                class="btn-primary"
                style="padding: 4px 10px; font-size: 11px;"
                onclick="window.adminQuickCreateReqForOrder('${ord.orderId.replace(/'/g, "\\'")}')"
              >
                + Draw REQ Batch (Packing Hall)
              </button>
              ${
                ord.contractorBalanceQty > 0 && ord.receivedGrnQty > 0 && !ord.shortClosed
                  ? `
                <button
                  type="button"
                  class="btn-outline"
                  style="padding: 4px 8px; font-size: 10.5px;"
                  title="Close order short-shipped at ${ord.receivedGrnQty} received pairs"
                  onclick="window.adminCloseOrderShort && window.adminCloseOrderShort('${ord.orderId.replace(/'/g, "\\'")}')"
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
                <div style="color: var(--su-text-muted); font-size: 10.5px; text-transform: uppercase;">Planned Qty</div>
                <div style="font-weight: 800; font-size: 13px; color: var(--su-text-primary);">${ord.plannedQty.toLocaleString()} Prs</div>
              </div>
              <div>
                <div style="color: var(--su-grn-dark); font-size: 10.5px; text-transform: uppercase; font-weight: 700;">Rcvd (${ord.grnBatches.length} GRNs)</div>
                <div style="font-weight: 800; font-size: 13px; color: var(--su-grn-primary);">${ord.receivedGrnQty.toLocaleString()} Prs (${pctReceived}%)</div>
              </div>
              <div>
                <div style="color: var(--su-text-muted); font-size: 10.5px; text-transform: uppercase;">Contractor Bal</div>
                <div style="font-weight: 800; font-size: 13px; color: var(--su-text-primary);">${ord.contractorBalanceQty.toLocaleString()} Prs</div>
              </div>
              <div>
                <div style="color: var(--su-text-muted); font-size: 10.5px; text-transform: uppercase;">Dock Pool</div>
                <div style="font-weight: 800; font-size: 13px; color: var(--su-mreq-primary);">${ord.dockAvailableQty.toLocaleString()} Prs</div>
              </div>
              <div>
                <div style="color: var(--su-req-primary); font-size: 10.5px; text-transform: uppercase; font-weight: 700;">Issued (${ord.reqBatches.length} REQs)</div>
                <div style="font-weight: 800; font-size: 13px; color: var(--su-req-primary);">${ord.issuedReqQty.toLocaleString()} Prs</div>
              </div>
              <div>
                <div style="color: var(--su-mreq-primary); font-size: 10.5px; text-transform: uppercase; font-weight: 700;">Floor WIP / S4 Hold</div>
                <div style="font-weight: 800; font-size: 13px; color: var(--su-mreq-primary);">${ord.inFloorWipQty.toLocaleString()} Prs ${ord.awaitingFinalQcQty > 0 ? `(S4: ${ord.awaitingFinalQcQty})` : ''}</div>
              </div>
              <div>
                <div style="color: var(--su-areq-primary); font-size: 10.5px; text-transform: uppercase; font-weight: 700;">Alter (A) / Scrap</div>
                <div style="font-weight: 800; font-size: 13px; color: var(--su-areq-primary);">${ord.inAlterationQty} / ${ord.scrappedQty} Prs</div>
              </div>
              <div>
                <div style="color: var(--su-complete-dark); font-size: 10.5px; text-transform: uppercase; font-weight: 700;">Packed Stage 5</div>
                <div style="font-weight: 800; font-size: 13px; color: var(--su-complete-primary);">${ord.packedStage5Qty.toLocaleString()} Prs (${ord.packedStage5Cartons} Ctns)</div>
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
                            No GRN batches received yet for ${ord.orderId}. Click <strong>+ Receive GRN Batch</strong> above when contractor goods arrive at Dock.
                          </td>
                        </tr>
                      `
                          : ord.grnBatches
                              .map((g: SuperUserGrnBatchItem) => {
                                const isHighlighted = ctx.highlightedRefCode === g.grnCode;
                                const voidCheck = canVoidGrnBatch(g);
                                return `
                        <tr id="tracking-chip-row-${g.grnCode}" style="${isHighlighted ? 'background: var(--su-grn-bg);' : ''}">
                          <td class="font-bold">Batch #${g.orderBatchSeq}</td>
                          <td><span class="su-badge su-badge-grn" style="font-family: var(--font-mono);">${g.grnCode}</span></td>
                          <td>${g.date}</td>
                          <td class="text-center" style="font-size: 11px;">
                            ${g.sizes['7'] || 0}/${g.sizes['8'] || 0}/${g.sizes['9'] || 0}/${g.sizes['10'] || 0}/${g.sizes['11'] || 0}
                          </td>
                          <td class="text-right font-bold" style="color: var(--su-grn-dark);">${g.rcvdPairs.toLocaleString()} Prs</td>
                          <td style="font-size: 10.5px;">
                            <div><span class="${getSuperUserStatusBadgeClass(g.allocationStatus)}">${g.allocationStatus}</span></div>
                            ${
                              g.allocatedToReqs.length > 0
                                ? `<div style="font-family: var(--font-mono); color: var(--su-text-secondary); margin-top: 2px;">&rarr; ${g.allocatedToReqs.map(a => `${a.reqNumber} (${a.pairs})`).join(', ')}</div>`
                                : `<div style="color: var(--su-text-muted); margin-top: 2px;">Dock Pool: ${g.unallocatedPairs} Prs</div>`
                            }
                          </td>
                          <td class="text-center" style="white-space: nowrap;">
                            <button type="button" class="table-btn" onclick="window.adminOpenDocumentSlip && window.adminOpenDocumentSlip('GRN', '${g.grnCode}', '${ord.orderId.replace(/'/g, "\\'")}')">Slip</button>
                            ${
                              voidCheck.allowed
                                ? `<button type="button" class="table-btn" style="color: var(--su-areq-primary);" title="${voidCheck.reason}" onclick="window.adminVoidGrnBatch && window.adminVoidGrnBatch(${g.sr}, '${g.grnCode}')">Void</button>`
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
                  <span style="font-size: 11.5px; font-weight: 800; color: var(--su-req-primary); text-transform: uppercase;">
                    Execution Stream: Packing Hall Requisitions (${ord.reqBatches.length} REQs &rarr; M &amp; A)
                  </span>
                  <span style="font-size: 11px; color: var(--su-req-deep);">
                    Issued: <strong>${ord.issuedReqQty.toLocaleString()}</strong> Prs &bull; Packed S5: <strong style="color: var(--su-complete-primary);">${ord.packedStage5Qty.toLocaleString()}</strong> Prs
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
                            No Packing Requisitions drawn yet for ${ord.orderId}. Click <strong>+ Draw REQ Batch</strong> to generate <code>REQ-0001</code> (with <code>M-REQ-0001</code> &amp; <code>A-REQ-0001</code>).
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
                        <tr id="tracking-chip-row-${r.reqNumber}" style="${isHighlighted ? 'background: var(--su-req-bg);' : ''}">
                          <td style="font-family: var(--font-mono);">
                            <div>
                              <button type="button" class="su-chip-btn su-badge su-badge-req" onclick="window.adminOpenDocumentSlip && window.adminOpenDocumentSlip('REQ', '${r.reqNumber}', '${ord.orderId.replace(/'/g, "\\'")}')">#${r.orderReqSeq} &bull; ${r.reqNumber}</button>
                            </div>
                            ${
                              r.allocatedFromGrns.length > 0
                                ? `<div style="font-size: 10px; color: var(--su-grn-dark); margin-top: 2px;">From: ${r.allocatedFromGrns.map(a => `${a.grnCode}(${a.pairs})`).join(' + ')}</div>`
                                : ''
                            }
                          </td>
                          <td style="font-family: var(--font-mono); font-size: 11px;">
                            <div style="margin-bottom: 2px;">
                              <button type="button" class="su-chip-btn su-badge su-badge-mreq" style="font-size: 10px; padding: 1px 5px;" onclick="window.adminOpenDocumentSlip && window.adminOpenDocumentSlip('M-REQ', '${r.mreqNo}', '${ord.orderId.replace(/'/g, "\\'")}')">${r.mreqNo}</button>
                              <span style="color: var(--su-text-secondary); font-size: 10px;">(${r.mreqStatus})</span>
                            </div>
                            <div>
                              <button type="button" class="su-chip-btn su-badge su-badge-areq" style="font-size: 10px; padding: 1px 5px;" onclick="window.adminOpenDocumentSlip && window.adminOpenDocumentSlip('A-REQ', '${r.altReqNo}', '${ord.orderId.replace(/'/g, "\\'")}')">${r.altReqNo}</button>
                              <span style="color: var(--su-text-secondary); font-size: 10px;">(${r.inAlterationPairs} rework${r.alterationCycleCount > 0 ? ` C${r.alterationCycleCount}/2` : ''})</span>
                            </div>
                          </td>
                          <td class="text-right font-bold" style="color: var(--su-req-primary);">
                            ${r.issuedPairs > 0 ? `${r.issuedPairs.toLocaleString()} Prs` : `Ask: ${r.askingPairs.toLocaleString()}`}
                          </td>
                          <td>
                            ${renderStageMiniTrack(r.activeStage, r.awaitingFinalQc, r.reqLifecycleStatus === 'CLOSED ✓')}
                            ${
                              r.awaitingFinalQc
                                ? `<div style="margin-top: 3px;"><span class="su-badge su-badge-mreq" style="font-size: 9.5px;">[STAGE 4 DONE &mdash; AWAITING FINAL QC]</span></div>`
                                : ''
                            }
                          </td>
                          <td class="text-right" style="font-family: var(--font-mono); font-size: 11px;">
                            <span style="color: var(--su-req-accent);">WIP:${r.inFloorWipPairs}</span> | <span style="color: var(--su-areq-primary);">A:${r.inAlterationPairs}/S:${r.scrappedPairs}</span> | <span style="color: var(--su-complete-primary); font-weight: 700;">S5:${r.packedStage5Pairs}</span>
                          </td>
                          <td class="text-center">
                            <div style="margin-bottom: 3px;">${renderReconciliationBadge(r.reconciliation)}</div>
                            <span class="${getSuperUserStatusBadgeClass(r.reqLifecycleStatus)}">${r.reqLifecycleStatus}</span>
                          </td>
                          <td class="text-center" style="white-space: nowrap;">
                            <button type="button" class="table-btn" onclick="window.adminOpenReqInScreen('${r.reqNumber}', 'screen-packing')">Floor</button>
                            ${
                              voidCheck.allowed
                                ? `<button type="button" class="table-btn" style="color: var(--su-areq-primary);" title="${voidCheck.reason}" onclick="window.adminVoidReqBatch && window.adminVoidReqBatch('${r.reqNumber}')">Void</button>`
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
  const systemUsers: SystemUserRecord[] = ctx.systemUsers || [
    { userId: 'USR-01', name: 'M. Tariq (Plant Director)', role: 'SUPER_USER', station: 'Command Center', active: true },
    { userId: 'USR-02', name: 'A. Raza (Dock Clerk)', role: 'INWARD_CLERK', station: 'Dock Receiving', active: true },
    { userId: 'USR-03', name: 'S. Mahmood (Hall Supervisor)', role: 'PACKING_SUPERVISOR', station: 'Packing Hall #1', active: true },
    { userId: 'USR-04', name: 'F. Iqbal (AQL Lead)', role: 'QC_INSPECTOR', station: 'Final QC Gate', active: true },
    { userId: 'USR-05', name: 'K. Hussain (Rework Lead)', role: 'ALTERATION_LEAD', station: 'Alteration Bay #2', active: true }
  ];
  const auditTrail: AuditTrailEntry[] = ctx.auditTrail || [];

  return `
    <!-- 7.1: Super User Master Order Creation Suite (Primary View) -->
    <section class="panel-card" style="margin-bottom: 14px;">
      <div class="panel-card-header">
        <div class="panel-card-title">
          <span>3. Super User Master Order Creation &amp; Pending Orders Hub (SQLite Persistent)</span>
          <span class="panel-counter-badge">${ctx.pendingOrders.length} Database Orders</span>
        </div>
        <span class="admin-meta-caption">Parent Order Container &mdash; Receives Multiple GRNs (0001, 0002...) &amp; Multiple REQs (0001, 0002... &rarr; M &amp; A)</span>
      </div>
      <div style="padding: 14px 16px;">
        <div style="display: grid; grid-template-columns: 1fr 1.2fr 1.2fr 1fr 1.2fr 1fr; gap: 10px; margin-bottom: 12px; align-items: end;">
          <div class="form-group">
            <label for="admin-pending-order-id">Order Reference #</label>
            <input type="text" id="admin-pending-order-id" class="form-input" placeholder="e.g. ORD-2026-001" value="ORD-2026-${String(ctx.pendingOrders.length + 1).padStart(3, '0')}" />
          </div>

          <div class="form-group">
            <label for="admin-pending-order-buyer">Buyer / Customer</label>
            <select id="admin-pending-order-buyer" class="form-select">
              <option value="">-- Choose Buyer --</option>
              ${(ov.customers.length
                ? ov.customers.map(
                    (c: any) => `<option value="${c.name}">${c.name} (${c.country || 'Global'})</option>`
                  )
                : ctx.dropdownOptions.customers.map(c => `<option value="${c}">${c}</option>`)
              ).join('')}
              ${
                !ov.customers.length && !ctx.dropdownOptions.customers.length
                  ? `
                <option value="Northwind Safety Ltd">Northwind Safety Ltd (UK)</option>
                <option value="Globex Supply Co.">Globex Supply Co. (Japan)</option>
                <option value="Initech Safety Ltd">Initech Safety Ltd (France)</option>
                <option value="Umbrella Workwear GmbH">Umbrella Workwear GmbH (Germany)</option>
                <option value="Stark Protective Ltd">Stark Protective Ltd (Norway)</option>
              `
                  : ''
              }
            </select>
          </div>

          <div class="form-group">
            <label for="admin-pending-order-maker">Contractor / Maker</label>
            <select id="admin-pending-order-maker" class="form-select">
              <option value="">-- Choose Contractor --</option>
              ${ctx.dropdownOptions.makers.map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label for="admin-pending-order-po">PO Number</label>
            <input type="text" id="admin-pending-order-po" class="form-input" placeholder="e.g. 27351" list="admin-po-preset-list" />
            <datalist id="admin-po-preset-list">
              ${ctx.dropdownOptions.poList.map(p => `<option value="${p}">${p}</option>`).join('')}
            </datalist>
          </div>

          <div class="form-group">
            <label for="admin-pending-order-article">Article</label>
            <select id="admin-pending-order-article" class="form-select">
              <option value="">-- Choose Article --</option>
              ${ctx.dropdownOptions.articles.map(a => `<option value="${a}">${a}</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label for="admin-pending-order-color">Colour / Shade</label>
            <input type="text" id="admin-pending-order-color" class="form-input" placeholder="e.g. Black / Hi-Vis Yellow" />
          </div>
        </div>

        <div style="background: var(--ink-50); border: 1px solid var(--border-strong); border-radius: 4px; padding: 10px 12px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-weight: 700; color: var(--ink-950); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.03em;">
              Planned Order Size Breakdown Matrix (Pairs)
            </span>
            <span style="font-size: 11px; color: var(--ink-600);">
              Enter pairs for each size. The order total calculates automatically.
            </span>
          </div>
          <table class="size-matrix-table" style="margin: 0;">
            <thead>
              <tr>
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
                <td><input type="number" aria-label="Order Size 7 / S" class="size-matrix-input admin-order-size-val" data-size="7" min="0" placeholder="0" /></td>
                <td><input type="number" aria-label="Order Size 8 / M" class="size-matrix-input admin-order-size-val" data-size="8" min="0" placeholder="0" /></td>
                <td><input type="number" aria-label="Order Size 9 / L" class="size-matrix-input admin-order-size-val" data-size="9" min="0" placeholder="0" /></td>
                <td><input type="number" aria-label="Order Size 10 / XL" class="size-matrix-input admin-order-size-val" data-size="10" min="0" placeholder="0" /></td>
                <td><input type="number" aria-label="Order Size 11 / XXL" class="size-matrix-input admin-order-size-val" data-size="11" min="0" placeholder="0" /></td>
                <td style="font-weight: 800; font-size: 13.5px; color: var(--ink-950); text-align: center;" id="admin-order-size-total">0</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <span style="font-size: 11.5px; color: var(--ink-600);">
            Orders are saved directly to SQLite (<code>pending_orders</code>) and populate the Inward Receiving dropdown for multiple GRN batches and Packing Hall REQs.
          </span>
          <button class="btn-primary" id="btn-admin-add-pending-order" style="padding: 7px 18px;">
            Save Order to Database &amp; Issue to Inward Goods
          </button>
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
                <th class="text-center">GRNs / REQs</th>
                <th class="text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              ${
                ctx.pendingOrders.length === 0
                  ? `
                <tr><td colspan="14" class="table-empty-cell">No orders in database yet. Fill out the form above and click "Save Order to Database &amp; Issue to Inward Goods".</td></tr>
              `
                  : ctx.pendingOrders
                      .map(o => {
                        const rollup = ctx.rollupSummary.orderRollups.find(
                          r => r.orderId === o.orderId
                        );
                        return `
                  <tr>
                    <td class="font-bold">${o.orderId}</td>
                    <td>${o.buyer || '---'}</td>
                    <td>${o.maker}</td>
                    <td class="font-bold">${o.po || '---'}</td>
                    <td class="font-bold">${o.article}</td>
                    <td>${o.color || 'Standard'}</td>
                    <td class="text-center">${o.sizes?.['7'] ?? '-'}</td>
                    <td class="text-center">${o.sizes?.['8'] ?? '-'}</td>
                    <td class="text-center">${o.sizes?.['9'] ?? '-'}</td>
                    <td class="text-center">${o.sizes?.['10'] ?? '-'}</td>
                    <td class="text-center">${o.sizes?.['11'] ?? '-'}</td>
                    <td class="text-right font-bold">${(o.totalQty || calculateSizeTotal(o.sizes || {}) || 0).toLocaleString()}</td>
                    <td class="text-center" style="font-size: 11px;">
                      ${rollup ? `${rollup.grnBatches.length} GRNs &middot; ${rollup.reqBatches.length} REQs` : '0 GRNs &middot; 0 REQs'}
                    </td>
                    <td class="text-center" style="white-space: nowrap;">
                      <button type="button" class="table-btn" onclick="window.adminInspectOrderInTracking('${o.orderId.replace(/'/g, "\\'")}')">Track</button>
                      <button type="button" class="table-btn" title="Remove Order" onclick="window.adminRemovePendingOrder('${o.orderId.replace(/'/g, "\\'")}')">Delete</button>
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

    <!-- 7.2: Collapsible Master Registries (Buyers, Articles, Contractors/Makers, System Users & RBAC, Audit Trail) -->
    <div class="two-column-grid" style="margin-bottom: 14px;">
      <!-- Collapsible Registry 1: Customer & Buyer Master -->
      <details class="su-collapsible-registry" open>
        <summary>
          <span>1. Customer &amp; Buyer Master Registry (${ov.customers.length} Buyers)</span>
          <span class="admin-meta-caption">AQL Inspection Rules &bull; Click to Toggle</span>
        </summary>
        <div class="su-collapsible-body">
          <div style="display: grid; grid-template-columns: 1.1fr 1fr 1.1fr auto; gap: 8px; align-items: end; margin-bottom: 12px;">
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
            <button class="btn-primary" id="btn-admin-save-customer">Save Buyer</button>
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
                    <td class="font-bold">${c.id}</td>
                    <td>${c.name}</td>
                    <td>${c.country || '---'}</td>
                    <td class="text-center"><span class="status-pill">${c.inspection_preference}</span></td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <!-- Collapsible Registry 2: Glove Product / Article Master -->
      <details class="su-collapsible-registry" open>
        <summary>
          <span>2. Glove Article &amp; Packaging BOM Master (${ov.products.length} Articles)</span>
          <span class="admin-meta-caption">Per-Pair Accessory Ratios &bull; Click to Toggle</span>
        </summary>
        <div class="su-collapsible-body">
          <div style="display: grid; grid-template-columns: 1.2fr 1.2fr 0.7fr 0.7fr auto; gap: 8px; align-items: end; margin-bottom: 12px;">
            <div class="form-group">
              <label for="admin-prod-name">Article Name</label>
              <input type="text" id="admin-prod-name" class="form-input" placeholder="e.g. Stealth Pro V2" />
            </div>
            <div class="form-group">
              <label for="admin-prod-cust">Buyer</label>
              <select id="admin-prod-cust" class="form-select">
                ${ov.customers.map((c: any) => `<option value="${c.id}">${c.name}</option>`).join('')}
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
            <button class="btn-primary" id="btn-admin-save-product">Save Article</button>
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
                    <td class="font-bold">${p.id}</td>
                    <td class="font-bold">${p.name}</td>
                    <td>${p.customer_name || p.customer_id}</td>
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
    </div>

    <div class="two-column-grid" style="margin-bottom: 14px;">
      <!-- Collapsible Registry 3: Contractors / Makers & PO Dropdowns -->
      <details class="su-collapsible-registry">
        <summary>
          <span>3. Contractors / Makers (${ctx.dropdownOptions.makers.length}) &amp; PO Registry (${ctx.dropdownOptions.poList.length})</span>
          <span class="admin-meta-caption">Synchronized across Dock &amp; Alteration Bay</span>
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
                  <span>${m}</span>
                  <button type="button" class="admin-tag-remove" title="Remove" onclick="window.adminRemoveDropdownItem('makers', '${m.replace(/'/g, "\\'")}')">&times;</button>
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
                  <span>PO #${po}</span>
                  <button type="button" class="admin-tag-remove" title="Remove" onclick="window.adminRemoveDropdownItem('poList', '${po.replace(/'/g, "\\'")}')">&times;</button>
                </span>
              `
                )
                .join('')}
            </div>
          </div>
        </div>
      </details>

      <!-- Collapsible Registry 4: System Users & Role-Based Access Control (7.2 & 10.4) -->
      <details class="su-collapsible-registry">
        <summary>
          <span>4. System Users &amp; Role-Based Access Control (${systemUsers.length} Users)</span>
          <span class="admin-meta-caption">RBAC Enforcement Matrix</span>
        </summary>
        <div class="su-collapsible-body">
          <div style="display: grid; grid-template-columns: 1.2fr 1.1fr 1fr auto; gap: 8px; align-items: end; margin-bottom: 12px;">
            <div class="form-group">
              <label for="admin-user-name">Operator Name</label>
              <input type="text" id="admin-user-name" class="form-input" placeholder="e.g. H. Malik" />
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
              <input type="text" id="admin-user-station" class="form-input" placeholder="e.g. Dock #1" value="Packing Hall #1" />
            </div>
            <button type="button" class="btn-primary" id="btn-admin-add-system-user" onclick="window.adminAddSystemUser && window.adminAddSystemUser()">Add User</button>
          </div>
          <div class="table-responsive" style="max-height: 170px; overflow-y: auto;">
            <table class="data-table">
              <thead>
                <tr><th>User ID</th><th>Operator</th><th>RBAC Role</th><th>Station</th><th>Authorized Actions</th></tr>
              </thead>
              <tbody>
                ${systemUsers
                  .map(
                    u => `
                  <tr>
                    <td class="font-bold">${u.userId}</td>
                    <td class="font-bold">${u.name}</td>
                    <td><span class="su-badge su-badge-req">${u.role}</span></td>
                    <td>${u.station}</td>
                    <td style="font-size: 10px; font-family: var(--font-mono); color: var(--su-text-secondary);">${(ROLE_PERMISSIONS[u.role] || []).slice(0, 4).join(', ')}${(ROLE_PERMISSIONS[u.role] || []).length > 4 ? '...' : ''}</td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </div>

    <!-- Collapsible Registry 5: Immutable Audit Trail & SQLite Snapshot Administration (10.3 & 10.5) -->
    <div class="two-column-grid">
      <details class="su-collapsible-registry">
        <summary>
          <span>5. Immutable Audit Trail Ledger (${auditTrail.length} Recorded Events)</span>
          <span class="admin-meta-caption">Actor &bull; Timestamp &bull; Before &rarr; After</span>
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
                    <td class="font-bold" style="font-family: var(--font-mono);">${a.auditId}</td>
                    <td style="font-family: var(--font-mono); font-size: 10.5px;">${a.timestamp}</td>
                    <td><strong>${a.actor}</strong> <span style="font-size: 10px; color: var(--su-text-secondary);">(${a.role})</span></td>
                    <td><span class="su-badge su-badge-req">${a.action}</span></td>
                    <td class="font-bold">${a.entityId}</td>
                    <td style="font-size: 11px;">${a.beforeSummary} &rarr; <strong>${a.afterSummary}</strong></td>
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

      <details class="su-collapsible-registry">
        <summary>
          <span>6. SQLite WAL Database &amp; Snapshot Administration (${ov.dbHealth.totalTables} Tables &bull; ${totalRows} Rows)</span>
          <span class="admin-meta-caption">Engine: ${String(ov.dbHealth.journalMode).toUpperCase()}</span>
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
              <strong>Latest Snapshot:</strong> <code>${ctx.lastBackupPath}</code>
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
                    <td style="font-family: var(--font-mono); font-size: 11.5px; font-weight: 700;">${tbl}</td>
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
    </div>

    <!-- 12.2: Phased Rollout Record & Active MES Policy Configuration -->
    <details class="su-collapsible-registry" style="margin-top: 12px;">
      <summary>
        <span>7. Phased Rollout Record (Phase A &bull; Phase B &bull; Phase C) &amp; Active MES Policy Defaults</span>
        <span class="admin-meta-caption">Checklist 12.2 &bull; R1 / 3.8 / 4.6 / 4.7 Policies</span>
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
          <td style="border: 1px solid var(--border-strong); padding: 6px; font-weight: 700;">${o.orderId}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px;">${o.buyer}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px;">${o.maker}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; font-weight: 700;">${o.po}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px;">${o.article} (${o.color})</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">${o.grnBatches.map(g => `${g.grnCode}(${g.rcvdPairs})`).join(', ') || 'None'}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right; font-weight: 700;">${o.plannedQty.toLocaleString()}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right; font-weight: 700;">${o.receivedGrnQty.toLocaleString()}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right; font-weight: 700;">${o.contractorBalanceQty.toLocaleString()}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center; font-weight: 700;">${o.reconciliation.badgeText}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">${o.orderStatus}</td>
        </tr>
      `
            )
            .join('');

    const html = `
      <div class="printable-slip-box">
        <div class="printable-slip-header">
          <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-950);">MERIDIAN WORKS &bull; ORDER VS. INWARD GRN &amp; CONTRACTOR BALANCE REPORT</h2>
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
          <strong>Acceptance Criteria &amp; Worked Formula (8.6):</strong> <code>Planned (${s.totalPlannedPairs}) = Received GRNs (${s.totalReceivedGrnPairs}) + Contractor Balance (${s.totalContractorBalancePairs})</code> and <code>Received GRNs (${s.totalReceivedGrnPairs}) = Dock Pool (${s.totalDockAvailablePairs}) + Issued to REQs (${s.totalIssuedReqPairs})</code>.
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
          <td style="border: 1px solid var(--border-strong); padding: 6px; font-weight: 700;">${r.parentOrderId}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; font-family: monospace; font-weight: 700;">${r.reqNumber}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; font-family: monospace;">${r.mreqNo}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; font-family: monospace;">${r.altReqNo}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px;">${r.article}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right; font-weight: 700;">${r.issuedPairs.toLocaleString()}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">${r.inFloorWipPairs.toLocaleString()}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">${r.inAlterationPairs} / ${r.scrappedPairs}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right; font-weight: 700;">${r.packedStage5Pairs.toLocaleString()}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center; font-weight: 700;">${r.reconciliation.badgeText}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">${r.reqLifecycleStatus}</td>
        </tr>
      `
            )
            .join('');

    const html = `
      <div class="printable-slip-box">
        <div class="printable-slip-header">
          <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-950);">MERIDIAN WORKS &bull; ORDER-TO-REQUISITION (REQ / M-REQ / A-REQ) TRACEABILITY LEDGER</h2>
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
          <strong>Acceptance Criteria &amp; Worked Formula (8.6):</strong> Per-REQ Floor Gate: <code>Issued (${s.totalIssuedReqPairs}) = Floor WIP (${s.totalFloorWipPairs}) + Stage 5 Packed (${s.stage5PackedPairs}) + Active Alteration (${s.totalAlterationPairs}) + Scrapped (${s.totalScrappedPairs})</code>.
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
          <td style="border: 1px solid var(--border-strong); padding: 6px; font-weight: 700;">${o.orderId}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; font-weight: 700;">${o.maker}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px;">${o.po}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px;">${o.article}</td>
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
          <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-950);">MERIDIAN WORKS &bull; CONTRACTOR QUALITY, ALTERATION (A-REQ) &amp; SCRAP DEDUCTION STATEMENT</h2>
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
          <strong>Acceptance Criteria &amp; Worked Formula (8.6):</strong> Any pair failing Cycle 2/2 in Alteration Bay is automatically condemned to Scrap and debited at PKR 150/Pr (<code>${s.totalScrappedPairs} Scrapped Prs &times; PKR 150 = PKR ${(s.totalScrappedPairs * 150).toLocaleString()}</code>).
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
        <td style="border: 1px solid var(--border-strong); padding: 6px; font-weight: 700;">${o.orderId}</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px;">${o.buyer}</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px; font-weight: 700;">${o.po}</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px;">${o.article}</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">${o.awaitingFinalQcQty.toLocaleString()} Prs</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right; font-weight: 700;">${o.packedStage5Qty.toLocaleString()} Prs</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right; font-weight: 700;">${o.packedStage5Cartons} Ctns</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center; font-weight: 700;">${o.reconciliation.badgeText}</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">${o.orderStatus}</td>
      </tr>
    `
          )
          .join('');

  const html = `
    <div class="printable-slip-box">
      <div class="printable-slip-header">
        <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-950);">MERIDIAN WORKS &bull; FINAL QC (AQL 1.5) &amp; STAGE 5 EXPORT DISPATCH MANIFEST</h2>
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
        <strong>Acceptance Criteria &amp; Worked Formula (8.6):</strong> Stage 5 Master Carton Packing is locked until Final QC passes after Stage 4. Order closes as <code>COMPLETED &amp; DISPATCHED</code> when <code>Received &ge; Planned</code>, <code>Dock Pool = 0</code>, and <code>Stage 5 Packed + Scrapped = Issued</code>.
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
                  <strong style="color: var(--su-req-primary);">${o.orderId}</strong> <span style="color: var(--su-text-muted);">(${o.maker})</span>
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
              <div style="display: grid; grid-template-columns: 220px 1fr 170px; align-items: center; gap: 10px; font-size: 11.5px;">
                <div style="font-family: var(--font-mono); font-size: 11px;">
                  <strong style="color: var(--su-req-primary);">${r.reqNumber}</strong> <span style="color: var(--su-text-muted);">(${r.parentOrderId})</span>
                </div>
                <div style="height: 14px; background: var(--su-bg-tertiary); border: 1px solid var(--su-border); border-radius: 3px; overflow: hidden; display: flex;">
                  <div style="width: ${s5Pct}%; height: 100%; background: var(--su-complete-primary);"></div>
                  <div style="width: ${wipPct}%; height: 100%; background: var(--su-mreq-primary);"></div>
                  <div style="width: ${altPct}%; height: 100%; background: var(--su-areq-primary);"></div>
                </div>
                <div style="text-align: right; font-family: var(--font-mono); font-size: 11px;">
                  S5: <strong style="color: var(--su-complete-primary);">${r.packedStage5Pairs}</strong> | WIP: <strong style="color: var(--su-mreq-primary);">${r.inFloorWipPairs}</strong>
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
      ${built.html}
    </section>
  `;
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
  } else if (isCreationTab) {
    tabBody = renderOrderCreationTab(ctx);
  } else {
    tabBody = renderReportsTab(ctx);
  }

  return `
    <div class="superuser-command-center" data-testid="superuser-command-center">
      <!-- Sub-Header Bar -->
      <div class="sub-header-bar">
        <div class="sub-header-title">
          <span>Super User Control Center &mdash; Executive Dashboard, Live Order-to-REQ Tracking, Order Creation &amp; Reports</span>
        </div>
        <div class="sub-header-right">
          <button class="btn-outline" id="btn-admin-refresh" style="padding: 4px 10px; font-size: 11.5px;">
            Sync Database
          </button>
          <button class="btn-primary" id="btn-admin-lock" style="padding: 4px 10px; font-size: 11.5px;">
            Lock Session
          </button>
        </div>
      </div>

      <main class="main-viewport">
        <!-- 4-Item Super User Navigation Menu (1.1) -->
        <div class="admin-subnav" style="margin-bottom: 14px;">
          <div class="admin-subnav-tabs" role="tablist" aria-label="Super User Navigation">
            <button
              type="button"
              class="admin-tab-btn ${ctx.activeTab === 'dashboard' ? 'active' : ''}"
              data-admin-tab="dashboard"
            >
              1. Dashboard
            </button>
            <button
              type="button"
              class="admin-tab-btn ${ctx.activeTab === 'tracking' ? 'active' : ''}"
              data-admin-tab="tracking"
            >
              2. Live Tracking (${s.totalOrders} Orders &bull; ${s.totalGrnCount} GRNs &bull; ${s.totalReqCount} REQs)
            </button>
            <button
              type="button"
              class="admin-tab-btn ${isCreationTab ? 'active' : ''}"
              data-admin-tab="orders"
            >
              3. Order Creation (${ctx.pendingOrders.length})
            </button>
            <button
              type="button"
              class="admin-tab-btn ${ctx.activeTab === 'reports' ? 'active' : ''}"
              data-admin-tab="reports"
            >
              4. Reports
            </button>
          </div>
          <span class="admin-meta-caption" style="padding-right: 8px;">
            Hierarchy: 1 Order &rarr; Multiple GRNs (0001, 0002...) &amp; Multiple REQs (0001, 0002... &rarr; M &amp; A)
          </span>
        </div>

        ${tabBody}

        <!-- Footer Statistics Bar -->
        <footer class="portal-footer">
          <div class="footer-stats-left">
            <span>Master Orders: <strong>${s.totalOrders}</strong></span>
            <span class="stat-divider">|</span>
            <span>Planned: <strong>${s.totalPlannedPairs.toLocaleString()} Prs</strong></span>
            <span class="stat-divider">|</span>
            <span>Received (GRNs): <strong style="color: var(--su-grn-primary);">${s.totalReceivedGrnPairs.toLocaleString()} Prs</strong></span>
            <span class="stat-divider">|</span>
            <span>Issued (REQs): <strong style="color: var(--su-req-primary);">${s.totalIssuedReqPairs.toLocaleString()} Prs</strong></span>
            <span class="stat-divider">|</span>
            <span>Packed (Stage 5): <strong style="color: var(--su-complete-primary);">${s.stage5PackedPairs.toLocaleString()} Prs</strong></span>
          </div>
          <div class="footer-actions-right">
            <button class="btn-outline" onclick="document.getElementById('btn-admin-refresh')?.click()">Refresh Ledger</button>
            <button class="btn-primary" onclick="document.getElementById('btn-admin-lock')?.click()">Lock Admin Session</button>
          </div>
        </footer>
      </main>
    </div>
  `;
}
