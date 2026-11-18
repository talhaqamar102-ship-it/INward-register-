import { getSuperUserStatusBadgeClass, escapeHtml } from '../../utils/requisitionLogic';
import type { SuperUserRenderContext } from './types';
import {
  renderReconciliationBadge,
  renderDeliveryCountdownChip,
  renderDashboardVisualGraphs,
  renderOrderGrnChipsWithOverflow,
  renderOrderReqChipsWithOverflow
} from './shared';

export function renderDashboardTab(ctx: SuperUserRenderContext, totalScrapDeduction: number): string {
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
