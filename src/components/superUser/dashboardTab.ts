// Super User dashboard, aligned to the Live Tracking pass.
// Same data, ids, data-testid and data-su-action / data-admin-tab-jump hooks as before.
// Styling lives in su-dashboard.css (scoped under .su-db, built on the app's own --su-* tokens
// and btn-* / panel-card / admin-kpi-* components).
// Based on unslop by Damir Sokolovsky (@heydamir), CC BY 4.0, https://github.com/heydamir/unslop
import { getSuperUserStatusBadgeClass, escapeHtml } from '../../utils/requisitionLogic';
import type { SuperUserRenderContext } from './types';
import {
  renderReconciliationBadge,
  renderDeliveryCountdownChip,
  renderDashboardVisualGraphs,
  renderOrderGrnChipsWithOverflow,
  renderOrderReqChipsWithOverflow
} from './shared';

/* ---------- helpers ---------- */

// One number format everywhere (en-US so grouping never changes with browser locale)
const n = (v: unknown): string => Number(v || 0).toLocaleString('en-US');

// Slip tag: reference code with a small type dot. Same look as the Live Tracking tab.
// TODO: hoist into shared.ts and use it inside renderOrderGrnChipsWithOverflow / renderOrderReqChipsWithOverflow too.
type RefKind = 'grn' | 'req' | 'mreq' | 'areq';
const refTag = (kind: RefKind, code: string, attrs: string): string =>
  `<button type="button" class="su-db-ref su-db-ref--${kind} su-chip-btn" ${attrs}><i></i>${escapeHtml(code)}</button>`;
const slip = (kind: RefKind, type: string, code: string, orderId: string): string =>
  refTag(
    kind,
    code,
    `data-su-action="open-slip" data-slip-type="${type}" data-ref-code="${escapeHtml(code)}" data-order-id="${escapeHtml(orderId)}"`
  );

// KPI card: label, one big figure with its unit, then short supporting lines
const kpi = (label: string, value: string, unit: string, lines: string[], valueClass = ''): string => `
  <div class="admin-kpi-card">
    <div class="admin-kpi-label">${label}</div>
    <div class="admin-kpi-value ${valueClass}">${value}${unit ? `<small>${unit}</small>` : ''}</div>
    <div class="admin-kpi-sub">${lines.map(l => `<div>${l}</div>`).join('')}</div>
  </div>`;

// One row shape for both exception tables
const exceptionRow = (cells: { ref: string; orderId: string; maker?: string; badge: string; pairs: number; action: string }): string => `
  <tr>
    <td>${cells.ref}</td>
    <td class="mono">${escapeHtml(cells.orderId)}</td>
    <td>${cells.maker !== undefined ? escapeHtml(cells.maker || '') : ''}</td>
    <td>${cells.badge}</td>
    <td class="text-right num">${n(cells.pairs)}</td>
    <td class="text-center">${cells.action}</td>
  </tr>`;

const jumpBtn = (screen: string, req: string, label: string): string =>
  `<button type="button" class="table-btn su-db-link" data-su-action="open-req-screen" data-req-number="${escapeHtml(req)}" data-target-screen="${screen}">${label}</button>`;

/* ---------- render ---------- */

export function renderDashboardTab(ctx: SuperUserRenderContext, totalScrapDeduction: number): string {
  const s = ctx.rollupSummary;
  const hasDemoOrder = s.orderRollups.some(o => o.orderId === 'ORD-2026-600');
  const rawSearch = ctx.locationSearch ?? (typeof window !== 'undefined' ? window.location.search : '');
  const hasDemoParam = /(?:^|[?&])demo=1(?:&|$)/.test(rawSearch);
  const demoDrawerOpen = hasDemoOrder || Boolean(ctx.demoDrawerOpen) || hasDemoParam;

  // Demo scenario drawer + reconciliation health (flagged, removable 600-pair demo)
  const demoDrawer = `
    <details class="su-demo-drawer"${demoDrawerOpen ? ' open' : ''}>
      <summary>
        <div class="su-db-health">
          <strong>Reconciliation health</strong>
          <span class="su-badge su-badge-reconciled">${n(s.reconciledOrdersCount)} of ${n(s.totalOrders)} orders reconciled</span>
          ${s.varianceOrdersCount > 0 ? `<span class="su-badge su-badge-variance">${n(s.varianceOrdersCount)} with variance</span>` : ''}
        </div>
        <span class="admin-meta-caption">Demo scenarios</span>
      </summary>
      <div class="su-demo-drawer-actions">
        <button type="button" class="btn-outline su-db-btn" id="btn-load-demo-600-inprogress" data-su-action="load-demo" data-demo-phase="IN_PROGRESS">
          Load 600-pair demo: stage 4 hold, A-REQ cycle 1 of 2
        </button>
        <button type="button" class="btn-primary su-db-btn" id="btn-load-demo-600-complete" data-su-action="load-demo" data-demo-phase="COMPLETED">
          Load 600-pair demo: 1 order, 3 GRNs, 3 REQs complete
        </button>
        <button type="button" class="btn-outline su-db-btn su-db-btn--danger" id="btn-load-demo-600-variance" data-su-action="load-demo" data-demo-phase="DELIBERATE_VARIANCE">
          Force deliberate variance (11.6)
        </button>
        ${
          hasDemoOrder
            ? `<button type="button" class="btn-outline su-db-btn su-db-btn--danger" id="btn-remove-demo-600" data-su-action="remove-demo">Remove demo scenario</button>`
            : ''
        }
      </div>
    </details>`;

  // Factory pulse: four cards, figure + unit + supporting lines. Color only where something is wrong.
  const kpis = `
    <div class="admin-kpi-grid" data-testid="su-pulse-cards-grid">
      ${kpi('Order book received', n(s.totalReceivedGrnPairs), `of ${n(s.totalPlannedPairs)} pairs`, [
        `${n(s.totalOrders)} orders, ${n(s.totalGrnCount)} GRNs`,
        `Contractor balance <strong>${n(s.totalContractorBalancePairs)}</strong> pairs`
      ])}
      ${kpi('Dock Available', n(s.totalDockAvailablePairs), 'pairs ready', [
        `Issued to floor <strong>${n(s.totalIssuedReqPairs)}</strong> pairs across <strong>${n(s.totalReqCount)}</strong> REQs`
      ])}
      ${kpi('Floor WIP', n(s.totalFloorWipPairs), 'pairs in WIP', [
        `Stage 4 hold, awaiting QC <strong>${n(s.stage4ReadyForQcPairs)}</strong>`,
        `Packed, stage 5 <strong>${n(s.stage5PackedPairs)}</strong>`
      ])}
      ${kpi(
        'Alteration and scrap',
        n(s.totalAlterationPairs),
        'pairs in rework',
        [
          `Scrap <strong>${n(s.totalScrappedPairs)}</strong> pairs, debit <strong>PKR ${n(totalScrapDeduction)}</strong>`,
          `Orders completed <strong>${n(s.completedOrders)} of ${n(s.totalOrders)}</strong>`
        ],
        s.totalAlterationPairs > 0 ? 'su-db-neg' : ''
      )}
    </div>`;

  // Exceptions: stage 4 hold (left), floor exceptions (right)
  const stage4Rows =
    s.stage4HoldReqs.length === 0
      ? `<tr><td colspan="6" class="su-db-empty">Nothing waiting for final QC. Lots appear here when stage 4 finishes.</td></tr>`
      : s.stage4HoldReqs
          .map(
            req => `
        <tr>
          <td class="mono">${escapeHtml(req.parentOrderId)}</td>
          <td>${slip('req', 'REQ', req.reqNumber, req.parentOrderId)}</td>
          <td>${slip('mreq', 'M-REQ', req.mreqNo, req.parentOrderId)}</td>
          <td>${escapeHtml(req.article)}</td>
          <td class="text-right num">${n(req.stage4Passed)}</td>
          <td class="text-center">${jumpBtn('screen-qc', req.reqNumber, 'Inspect in final QC')}</td>
        </tr>`
          )
          .join('');

  const noExceptions =
    s.activeAlterationReqs.length === 0 && s.pendingIssueReqs.length === 0 && s.unfulfilledMreqReqs.length === 0;

  const exceptionRows = noExceptions
    ? `<tr><td colspan="6" class="su-db-empty">No open exceptions. Issued requisitions, M-REQs and alteration loops are clear.</td></tr>`
    : [
        ...s.activeAlterationReqs.map(req =>
          exceptionRow({
            ref: slip('areq', 'A-REQ', req.altReqNo, req.parentOrderId),
            orderId: req.parentOrderId,
            maker: req.maker || '',
            badge: `<span class="su-badge su-badge-areq">Rework, cycle ${Math.min(2, Math.max(1, req.alterationCycleCount || 1))} of 2</span>`,
            pairs: req.inAlterationPairs,
            action: jumpBtn('screen-repair', req.reqNumber, 'Open bay 2')
          })
        ),
        ...s.unfulfilledMreqReqs.map(req =>
          exceptionRow({
            ref: slip('mreq', 'M-REQ', req.mreqNo, req.parentOrderId),
            orderId: req.parentOrderId,
            maker: req.maker || '',
            badge: `<span class="su-badge su-badge-mreq">Unfulfilled M-REQ (${escapeHtml(req.mreqStatus)})</span>`,
            pairs: req.issuedPairs,
            action: jumpBtn('screen-packing', req.reqNumber, 'Fulfill M-REQ')
          })
        ),
        ...s.pendingIssueReqs.map(req =>
          exceptionRow({
            ref: slip('req', 'REQ', req.reqNumber, req.parentOrderId),
            orderId: req.parentOrderId,
            maker: req.maker || '',
            badge: `<span class="su-badge su-badge-grn">Awaiting dock issue (${escapeHtml(req.mreqNo)})</span>`,
            pairs: req.askingPairs,
            action: jumpBtn('screen-grn', req.reqNumber, 'Issue at dock')
          })
        )
      ].join('');

  const exceptionCount = s.activeAlterationReqs.length + s.pendingIssueReqs.length + s.unfulfilledMreqReqs.length;

  const exceptions = `
    <div class="two-column-grid" data-testid="su-exceptions-strip">
      <section class="panel-card">
        <div class="panel-card-header">
          <div class="panel-card-title">
            <span>Holding for final QC</span>
            <span class="panel-counter-badge">${n(s.stage4HoldReqs.length)} lots</span>
          </div>
          <span class="admin-meta-caption">Stage 5 opens after AQL 1.5 passes</span>
        </div>
        <div class="table-responsive su-db-scroll su-db-scroll--short" tabindex="0" role="region" aria-label="Lots holding for final QC">
          <table class="data-table">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Requisition</th>
                <th scope="col">M-REQ</th>
                <th scope="col">Article</th>
                <th scope="col" class="text-right">Pairs ready</th>
                <th scope="col" class="text-center"><span class="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>${stage4Rows}</tbody>
          </table>
        </div>
      </section>

      <section class="panel-card">
        <div class="panel-card-header">
          <div class="panel-card-title">
            <span>Floor exceptions</span>
            <span class="panel-counter-badge">${n(exceptionCount)} open</span>
          </div>
          <span class="admin-meta-caption">Alterations return to stage 1, max 2 cycles</span>
        </div>
        <div class="table-responsive su-db-scroll su-db-scroll--short" tabindex="0" role="region" aria-label="Open floor exceptions">
          <table class="data-table">
            <thead>
              <tr>
                <th scope="col">Reference</th>
                <th scope="col">Order</th>
                <th scope="col">Contractor</th>
                <th scope="col">Exception</th>
                <th scope="col" class="text-right">Pairs</th>
                <th scope="col" class="text-center"><span class="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>${exceptionRows}</tbody>
          </table>
        </div>
      </section>
    </div>`;

  // Active orders: 16 columns folded to 11. Nothing dropped: PO sits under the order,
  // contractor balance under planned, dock pool under received, stage 4 hold under floor.
  const orderRows =
    s.orderRollups.length === 0
      ? `
    <tr>
      <td colspan="11" class="su-db-empty su-db-empty--tall">
        <div>No master orders yet. Create a buyer order in Order Creation and issue it to inward receiving.</div>
        <button type="button" class="btn-outline su-db-btn" data-admin-tab-jump="orders">Go to order creation</button>
      </td>
    </tr>`
      : s.orderRollups
          .map(
            o => `
    <tr>
      <td>
        <button type="button" class="su-db-ref su-db-ref--req su-chip-btn" data-su-action="inspect-order" data-order-id="${escapeHtml(o.orderId)}"><i></i>${escapeHtml(o.orderId)}</button>
        ${o.po ? `<div class="su-db-sub">PO ${escapeHtml(o.po)}</div>` : ''}
      </td>
      <td>
        <div>${escapeHtml(o.buyer || '')}</div>
        ${o.maker ? `<div class="su-db-sub">${escapeHtml(o.maker)}</div>` : ''}
      </td>
      <td>${escapeHtml(o.article)}</td>
      <td class="text-right num">
        <div>${n(o.plannedQty)}</div>
        <div class="su-db-sub">Balance ${n(o.contractorBalanceQty)}</div>
      </td>
      <td class="text-right num">
        <div>${n(o.receivedGrnQty)} <span class="su-db-sub">(${n(o.grnBatches.length)} ${o.grnBatches.length === 1 ? 'GRN' : 'GRNs'})</span></div>
        <div class="su-db-sub">Dock pool ${n(o.dockAvailableQty)}</div>
        ${o.grnBatches.length > 0 ? renderOrderGrnChipsWithOverflow(o) : ''}
      </td>
      <td class="text-right num">
        <div>${n(o.issuedReqQty)} <span class="su-db-sub">(${n(o.reqBatches.length)} ${o.reqBatches.length === 1 ? 'REQ' : 'REQs'})</span></div>
        ${o.reqBatches.length > 0 ? renderOrderReqChipsWithOverflow(o) : ''}
      </td>
      <td class="text-right num">
        <div>${n(o.inFloorWipQty)}</div>
        ${o.awaitingFinalQcQty > 0 ? `<div class="su-db-sub">${n(o.awaitingFinalQcQty)} at stage 4</div>` : ''}
      </td>
      <td class="text-right num ${o.inAlterationQty > 0 || o.scrappedQty > 0 ? 'su-db-neg' : ''}">${n(o.inAlterationQty)} / ${n(o.scrappedQty)}</td>
      <td class="text-right num su-db-ok">${n(o.packedStage5Qty)}</td>
      <td class="text-center">${renderDeliveryCountdownChip(o.deliveryCountdown, false)}</td>
      <td class="text-center">
        <div><span class="${getSuperUserStatusBadgeClass(o.orderStatus)}">${escapeHtml(o.orderStatus)}</span></div>
        <div class="su-db-stack">${renderReconciliationBadge(o.reconciliation)}</div>
      </td>
    </tr>`
          )
          .join('');

  const pulse = `
    <section class="panel-card" id="su-active-orders-pulse-section" data-testid="su-active-orders-pulse">
      <div class="panel-card-header">
        <div class="panel-card-title">
          <span>Active orders</span>
          <span class="panel-counter-badge">${n(s.orderRollups.length)} orders</span>
        </div>
        <div class="su-db-actions">
          <button type="button" class="btn-outline su-db-btn" data-admin-tab-jump="orders">New order</button>
          <button type="button" class="btn-primary su-db-btn" data-admin-tab-jump="tracking">Open live tracking</button>
        </div>
      </div>
      <div class="table-responsive su-db-scroll su-db-scroll--tall" tabindex="0" role="region" aria-label="Active orders">
        <table class="data-table">
          <thead>
            <tr>
              <th scope="col">Order</th>
              <th scope="col">Buyer / contractor</th>
              <th scope="col">Article</th>
              <th scope="col" class="text-right">Planned</th>
              <th scope="col" class="text-right">Received</th>
              <th scope="col" class="text-right">Issued</th>
              <th scope="col" class="text-right">Floor WIP</th>
              <th scope="col" class="text-right">Alt / scrap</th>
              <th scope="col" class="text-right">Packed</th>
              <th scope="col" class="text-center">Delivery</th>
              <th scope="col" class="text-center">Status</th>
            </tr>
          </thead>
          <tbody>${orderRows}</tbody>
        </table>
      </div>
    </section>`;

  // Bar graph + order > GRN > REQ topology (own helper, unchanged)
  return `<div class="su-db">${demoDrawer}${kpis}${exceptions}${pulse}<div>${renderDashboardVisualGraphs(s)}</div></div>`;
}
