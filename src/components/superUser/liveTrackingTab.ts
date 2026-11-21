// Live Tracking tab, unslopped. Same data, handlers, ids and data-* hooks as before.
// Styling lives in su-live-tracking.css (scoped under .su-lt, built on the app's own --su-* tokens and btn-* / panel-card components).
// Based on unslop by Damir Sokolovsky (@heydamir), CC BY 4.0, https://github.com/heydamir/unslop
import {
  computeDeliveryCountdown,
  SuperUserOrderRollup,
  SuperUserGrnBatchItem,
  SuperUserReqBatchItem,
  buildRequisitionAnalyticsSeries,
  RequisitionAnalyticsPoint,
  getSuperUserStatusBadgeClass,
  canVoidGrnBatch,
  canVoidRequisitionLot,
  escapeHtml
} from '../../utils/requisitionLogic';
import type { SuperUserRenderContext } from './types';
import {
  renderReconciliationBadge,
  renderDeliveryCountdownChip,
  renderStageMiniTrack
} from './shared';

/* ---------- helpers ---------- */

// One number format everywhere (en-US so grouping never changes with browser locale)
const n = (v: unknown): string => Number(v || 0).toLocaleString('en-US');

// Line icons, 16px, stroke 1.5, inherit text color (lucide paths)
const icon = (path: string, cls = ''): string =>
  `<svg class="su-lt-ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
const ICON_CHEVRON = '<path d="m6 9 6 6 6-6"/>';
const ICON_PLUS = '<path d="M5 12h14M12 5v14"/>';

// Slip tag: reference code with a small type dot. Same component for GRN / REQ / M-REQ / A-REQ.
type RefKind = 'grn' | 'req' | 'mreq' | 'areq';
const refTag = (kind: RefKind, code: string, attrs = ''): string => {
  const tag = attrs ? 'button type="button"' : 'span';
  const close = attrs ? 'button' : 'span';
  return `<${tag} class="su-lt-ref su-lt-ref--${kind}${attrs ? ' su-chip-btn' : ''}" ${attrs}><i></i>${escapeHtml(code)}</${close}>`;
};

type StatusFilter = 'ALL' | 'RECEIVING' | 'WIP' | 'HOLD_QC' | 'COMPLETED';

const matchesStatus = (o: SuperUserOrderRollup, f: string): boolean => {
  switch (f) {
    case 'RECEIVING':
      return o.orderStatus === 'AWAITING DOCK #1 RECEIVING' || o.orderStatus === 'RECEIVING AT DOCK #1';
    case 'WIP':
      return o.orderStatus === 'IN PACKING HALL WIP';
    case 'HOLD_QC':
      return o.orderStatus === 'AWAITING FINAL QC (STAGE 4)' || o.awaitingFinalQcQty > 0;
    case 'COMPLETED':
      return o.orderStatus === 'COMPLETED & DISPATCHED';
    default:
      return true;
  }
};

const stat = (label: string, value: string, mod = '', sub = ''): string =>
  `<div class="${mod}"><dt>${label}</dt><dd>${value}${sub ? `<small>${sub}</small>` : ''}</dd></div>`;

/* ---------- render ---------- */

function renderLiveTrackingMiniChart(series: RequisitionAnalyticsPoint[]): string {
  const totalDemand = series.reduce((sum, item) => sum + Number(item.plannedDemandPairs || 0), 0);
  const totalIssued = series.reduce((sum, item) => sum + Number(item.issuedFloorPairs || 0), 0);
  const totalStage4 = series.reduce((sum, item) => sum + Number(item.stage4FirstPackedPairs || 0), 0);
  const totalPacked = series.reduce((sum, item) => sum + Number(item.actualPackedPairs || 0), 0);
  const totalAltScrap = series.reduce((sum, item) => sum + Number(item.alterationAndScrapPairs || 0), 0);
  const overallPct = totalDemand > 0 ? Math.round((totalPacked / totalDemand) * 100) : 0;

  if (series.length === 0) {
    return `
      <section class="su-lt-mini" data-testid="wip-analytics-dashboard">
        <div class="su-lt-mini-head">
          <div class="su-lt-mini-title-wrap">
            <span class="su-lt-mini-dot" aria-hidden="true"></span>
            <span class="su-lt-mini-title">WIP Activity</span>
            <span class="su-lt-mini-sub">0 Active REQs</span>
          </div>
          <div class="su-lt-mini-readout" id="su-lt-mini-readout" data-default-pct="0">0<small>%</small></div>
        </div>
        <div style="font-size: 12.5px; color: var(--su-text-muted); padding: 8px 0;">
          No active Packing Hall requisitions yet. Draw a requisition from dock stock to see activity bars.
        </div>
      </section>
    `;
  }

  const maxVol = Math.max(
    1,
    ...series.map(item => Math.max(item.issuedFloorPairs, item.plannedDemandPairs, item.actualPackedPairs))
  );

  return `
    <section class="su-lt-mini" id="su-lt-mini-chart" data-testid="wip-analytics-dashboard">
      <div class="su-lt-mini-head">
        <div class="su-lt-mini-title-wrap">
          <span class="su-lt-mini-dot" aria-hidden="true"></span>
          <span class="su-lt-mini-title">WIP Activity</span>
          <span class="su-lt-mini-sub">${series.length} ${series.length === 1 ? 'active REQ' : 'active REQs'} &middot; Click bar to open Packing Hall</span>
        </div>
        <div class="su-lt-mini-readout" id="su-lt-mini-readout" data-default-pct="${overallPct}">
          <span>${overallPct}</span><small>%</small>
        </div>
      </div>

      <div class="su-lt-mini-bars" role="list" aria-label="Requisition WIP activity bars">
        ${series.map(item => {
          const vol = Math.max(item.issuedFloorPairs, item.plannedDemandPairs, item.actualPackedPairs);
          const heightPx = Math.max(14, Math.round((vol / maxVol) * 76));
          const pct = Math.max(0, Math.min(100, Math.round(item.packedCompletionPct || 0)));
          const shortLabel = item.reqNumber.replace(/^REQ-\d{4}-/, '');
          return `
            <button
              type="button"
              role="listitem"
              class="su-lt-mini-col"
              data-su-action="open-req-screen"
              data-req-number="${escapeHtml(item.reqNumber)}"
              data-target-screen="screen-packing"
              data-mini-pct="${pct}"
              data-mini-req="${escapeHtml(item.reqNumber)}"
              title="${escapeHtml(item.reqNumber)} (${escapeHtml(item.article)}) — ${pct}% packed"
            >
              <span class="su-lt-mini-tip">${escapeHtml(item.reqNumber)} &middot; ${pct}% (${n(item.actualPackedPairs)}/${n(item.plannedDemandPairs)})</span>
              <span class="su-lt-mini-bar" style="height: ${heightPx}px;">
                ${pct > 0 ? `<span class="su-lt-mini-bar-packed" style="height: ${pct}%;"></span>` : ''}
              </span>
              <span class="su-lt-mini-label">${escapeHtml(shortLabel)}</span>
            </button>
          `;
        }).join('')}
      </div>

      <div class="su-lt-mini-kpis">
        <span>Planned <strong>${n(totalDemand)}</strong></span>
        <span>Issued <strong>${n(totalIssued)}</strong></span>
        <span>Stage 4 <strong>${n(totalStage4)}</strong></span>
        <span>Packed <strong>${n(totalPacked)}</strong></span>
        <span>Alt / scrap <strong>${n(totalAltScrap)}</strong></span>
      </div>
    </section>
  `;
}

export function renderLiveTrackingTab(ctx: SuperUserRenderContext): string {
  const s = ctx.rollupSummary;
  const search = (ctx.trackingSearch || '').trim().toLowerCase();
  const statusFilter = (ctx.trackingStatusFilter || 'ALL') as StatusFilter;
  const buyerFilter = (ctx.trackingBuyerFilter || 'ALL').trim();
  const makerFilter = (ctx.trackingMakerFilter || 'ALL').trim();
  const pageSize = Math.max(5, Number(ctx.trackingPageSize || 10));
  const currentPage = Math.max(1, Number(ctx.trackingPage || 1));

  const uniqueBuyers = Array.from(new Set(s.orderRollups.map(o => o.buyer).filter(Boolean)));
  const uniqueMakers = Array.from(
    new Set(
      s.orderRollups
        .flatMap(o =>
          o.contractorAllocations && o.contractorAllocations.length > 0
            ? o.contractorAllocations.map(a => a.maker)
            : [o.maker]
        )
        .filter(Boolean)
    )
  );

  const filteredOrders = s.orderRollups.filter(o => {
    if (!matchesStatus(o, statusFilter)) return false;
    if (buyerFilter !== 'ALL' && o.buyer !== buyerFilter) return false;
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
      ...o.grnBatches.flatMap(g => [
        g.grnCode,
        g.hallName || '',
        g.stitcherName || '',
        g.receivedFrom || '',
        g.receivingNote || ''
      ]),
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

  // Status tabs: every tab shows its count (was: only two of five)
  const filterTabs: Array<[StatusFilter, string]> = [
    ['ALL', 'All'],
    ['RECEIVING', 'Dock receiving'],
    ['WIP', 'In floor WIP'],
    ['HOLD_QC', 'Final QC hold'],
    ['COMPLETED', 'Completed']
  ];
  const tabCount = (f: StatusFilter) => s.orderRollups.filter(o => matchesStatus(o, f)).length;

  const toolbar = `
    <section class="panel-card su-lt-toolbar" aria-label="Live tracking filters">
      <div class="su-lt-row">
        <label for="admin-tracking-search" class="sr-only">Search orders</label>
        <input
          type="text"
          id="admin-tracking-search"
          class="form-input su-tracking-search-input"
          placeholder="Search order, PO, GRN, REQ"
          value="${escapeHtml(ctx.trackingSearch || '')}"
        />
        <select
          id="admin-tracking-buyer-filter"
          class="form-select"
          aria-label="Filter by buyer"
          data-su-change="tracking-buyer-filter"
          ${uniqueBuyers.length === 0 ? 'disabled' : ''}
        >
          ${
            uniqueBuyers.length === 0
              ? `<option value="ALL" selected>No Buyers yet</option>`
              : `<option value="ALL" ${buyerFilter === 'ALL' ? 'selected' : ''}>All buyers</option>` +
                uniqueBuyers.map(b => `<option value="${escapeHtml(b)}" ${buyerFilter === b ? 'selected' : ''}>${escapeHtml(b)}</option>`).join('')
          }
        </select>
        <select
          id="admin-tracking-maker-filter"
          class="form-select"
          aria-label="Filter by contractor"
          data-su-change="tracking-maker-filter"
          ${uniqueMakers.length === 0 ? 'disabled' : ''}
        >
          ${
            uniqueMakers.length === 0
              ? `<option value="ALL" selected>No Contractors yet</option>`
              : `<option value="ALL" ${makerFilter === 'ALL' ? 'selected' : ''}>All contractors</option>` +
                uniqueMakers.map(m => `<option value="${escapeHtml(m)}" ${makerFilter === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')
          }
        </select>
      </div>

      <div class="su-lt-row">
        <div class="su-lt-tabs" role="group" aria-label="Order status">
          ${filterTabs
            .map(
              ([key, label]) => `
            <button type="button" class="${statusFilter === key ? 'btn-primary' : 'btn-outline'} su-lt-btn admin-tracking-filter-btn" aria-pressed="${statusFilter === key}" data-tracking-filter="${key}">
              ${label}<span class="count">${n(tabCount(key))}</span>
            </button>`
            )
            .join('')}
        </div>
        <span class="su-lt-spacer"></span>
        <span class="su-lt-hint">Sorted by delivery urgency</span>
        ${
          filteredOrders.length > 0
            ? `
          <button type="button" class="su-lt-btn su-lt-btn--ghost" data-su-action="expand-all" data-expanded="true">Expand all</button>
          <button type="button" class="su-lt-btn su-lt-btn--ghost" data-su-action="expand-all" data-expanded="false">Collapse all</button>`
            : ''
        }
      </div>

      ${
        totalPages > 1
          ? `
        <div class="su-lt-pager">
          <span>Orders <strong class="num">${n(startIdx + 1)}&ndash;${n(Math.min(sortedOrders.length, startIdx + pageSize))}</strong> of <strong class="num">${n(sortedOrders.length)}</strong></span>
          <div class="su-lt-row">
            <button type="button" class="btn-outline su-lt-btn" ${safePage <= 1 ? 'disabled' : ''} data-su-action="tracking-page" data-page="${safePage - 1}">Previous</button>
            <span class="num">Page ${safePage} of ${totalPages}</span>
            <button type="button" class="btn-outline su-lt-btn" ${safePage >= totalPages ? 'disabled' : ''} data-su-action="tracking-page" data-page="${safePage + 1}">Next</button>
          </div>
        </div>`
          : ''
      }
    </section>`;

  const chart = (() => {
    const series = buildRequisitionAnalyticsSeries(s, undefined, true);
    return `<div class="su-lt-chart">${renderLiveTrackingMiniChart(series)}</div>`;
  })();

  const emptyState =
    s.orderRollups.length === 0
      ? `
      <section class="panel-card su-lt-empty">
        <h3>No orders in live tracking</h3>
        <p>Create a master order, receive GRN batches at the dock, then draw requisitions for the packing hall. Each order appears here with its GRNs and requisitions.</p>
        <button type="button" class="btn-primary su-lt-btn" data-admin-tab-jump="orders">Go to order creation</button>
      </section>`
      : `
      <section class="panel-card su-lt-empty">
        <h3>No orders match these filters</h3>
        <p>Change the status, buyer or contractor, or clear the search.</p>
      </section>`;

  const orderCards = pagedOrders
    .map((ord: SuperUserOrderRollup) => {
      const isExpanded = ctx.expandedOrderIds[ord.orderId] !== false;
      const plan = Math.max(1, ord.plannedQty || ord.receivedGrnQty || 1);
      const pctReceived = ord.plannedQty > 0 ? Math.min(100, Math.round((ord.receivedGrnQty / ord.plannedQty) * 100)) : 0;
      const pctPacked =
        ord.plannedQty > 0
          ? Math.min(100, Math.round(((ord.packedStage5Qty + ord.scrappedQty) / ord.plannedQty) * 100))
          : 0;
      const s5Pct = Math.min(100, Math.round((ord.packedStage5Qty / plan) * 100));
      const s4Pct = Math.min(100 - s5Pct, Math.round((ord.awaitingFinalQcQty / plan) * 100));
      const wipOnly = Math.max(0, ord.inFloorWipQty - ord.awaitingFinalQcQty);
      const wipPct = Math.min(100 - s5Pct - s4Pct, Math.round((wipOnly / plan) * 100));
      const altPct = Math.min(100 - s5Pct - s4Pct - wipPct, Math.round(((ord.inAlterationQty + ord.scrappedQty) / plan) * 100));

      const sizeCodes =
        ord.sizeCodes && ord.sizeCodes.length > 0
          ? ord.sizeCodes
          : Object.keys(ord.sizes || {}).length > 0
            ? Object.keys(ord.sizes || {})
            : ['7', '8', '9', '10', '11'];
      const isLegacy = (ord.sizeFormat || 'LEGACY_7_11') === 'LEGACY_7_11';
      // Table header now reflects the real size scale instead of a hardcoded 7/8/9/10/11
      const sizeHeader = isLegacy ? sizeCodes.join(' / ') : 'Sizes';

      const progressTitle = `Planned ${n(ord.plannedQty)} | Packed ${n(ord.packedStage5Qty)} | Final QC hold ${n(ord.awaitingFinalQcQty)} | Floor WIP ${n(wipOnly)} | Alteration and scrap ${n(ord.inAlterationQty + ord.scrappedQty)} (pairs)`;

      const splits =
        (ord.contractorAllocations || []).length > 1
          ? `
        <div class="su-lt-splits" data-testid="order-contractor-splits">
          ${(ord.contractorAllocations || [])
            .map(a => {
              const splitCd = a.dueDate
                ? computeDeliveryCountdown({
                    dueDate: a.dueDate,
                    createdAt: ord.createdAt,
                    isCompleted: Number(a.remainingPairs ?? a.totalQty) === 0
                  })
                : null;
              return `<span class="su-lt-split su-contractor-chip"><strong>${escapeHtml(a.maker)}</strong> ${n(a.receivedPairs)} of ${n(a.totalQty)} received, ${n(a.remainingPairs ?? a.totalQty)} left${splitCd?.hasDueDate ? ` &middot; ${escapeHtml(splitCd.badgeText)}` : ''}</span>`;
            })
            .join('')}
        </div>`
          : '';

      const header = `
        <div class="su-lt-head">
          <button
            type="button"
            class="btn-outline su-lt-btn su-lt-btn--icon"
            data-su-action="toggle-order-expand"
            data-order-id="${escapeHtml(ord.orderId)}"
            aria-expanded="${isExpanded ? 'true' : 'false'}"
            aria-label="${isExpanded ? 'Collapse' : 'Expand'} order ${escapeHtml(ord.orderId)}"
          >${icon(ICON_CHEVRON, 'su-lt-chevron')}</button>

          <div>
            <div class="su-lt-title">
              <span class="order-id">${escapeHtml(ord.orderId)}</span>
              <span>${escapeHtml(ord.article)} <span class="muted">${escapeHtml(ord.color)}</span></span>
              ${renderReconciliationBadge(ord.reconciliation)}
            </div>
            <div class="su-lt-meta">
              ${[
                ord.po ? `<span>PO <strong class="mono">${escapeHtml(ord.po)}</strong></span>` : '',
                ord.buyer ? `<span>${escapeHtml(ord.buyer)}</span>` : '',
                ord.maker ? `<span>${escapeHtml(ord.maker)}</span>` : '',
                `<span class="num"><strong>${n(ord.plannedQty)}</strong> pairs planned</span>`,
                ord.sizeFormat && ord.sizeFormat !== 'LEGACY_7_11' ? `<span>${escapeHtml(ord.sizeFormat)}</span>` : ''
              ]
                .filter(Boolean)
                .join('<span class="sep">/</span>')}
            </div>
            <div class="su-lt-countdown">${renderDeliveryCountdownChip(ord.deliveryCountdown, true)}</div>
            ${splits}
          </div>

          <div class="su-lt-side">
            <span class="${getSuperUserStatusBadgeClass(ord.orderStatus)}">${escapeHtml(ord.orderStatus)}</span>
            <div class="su-lt-progress" title="${progressTitle}">
              <div class="su-lt-progress-label">
                <span>Received ${pctReceived}%</span>
                <span><strong>${n(ord.packedStage5Qty)}</strong> of ${n(ord.plannedQty)} packed (${pctPacked}%)</span>
              </div>
              <div class="su-lt-bar" role="img" aria-label="${progressTitle}">
                <div class="su-lt-seg-s5" style="width:${s5Pct}%"></div>
                <div class="su-lt-seg-s4" style="width:${s4Pct}%"></div>
                <div class="su-lt-seg-wip" style="width:${wipPct}%"></div>
                <div class="su-lt-seg-alt" style="width:${altPct}%"></div>
              </div>
            </div>
            <div class="su-lt-actions">
              ${
                ord.contractorBalanceQty > 0 && ord.receivedGrnQty > 0 && !ord.shortClosed
                  ? `<button type="button" class="su-lt-btn su-lt-btn--ghost" title="Close order short-shipped at ${n(ord.receivedGrnQty)} received pairs" data-su-action="short-close-order" data-order-id="${escapeHtml(ord.orderId)}">Short-close</button>`
                  : ''
              }
              <button type="button" class="btn-outline su-lt-btn" data-su-action="quick-receive-grn" data-order-id="${escapeHtml(ord.orderId)}">${icon(ICON_PLUS)} Receive GRN</button>
              <button type="button" class="btn-primary su-lt-btn" data-su-action="quick-create-req" data-order-id="${escapeHtml(ord.orderId)}">${icon(ICON_PLUS)} New requisition</button>
            </div>
          </div>
        </div>`;

      const stats = `
        <dl class="su-lt-stats">
          ${stat('Planned', n(ord.plannedQty), 'lead', 'pairs')}
          ${stat(`Received, ${ord.grnBatches.length} GRN${ord.grnBatches.length === 1 ? '' : 's'}`, n(ord.receivedGrnQty), 'lead', `${pctReceived}%`)}
          ${stat(`Issued, ${ord.reqBatches.length} REQ${ord.reqBatches.length === 1 ? '' : 's'}`, n(ord.issuedReqQty), 'lead', 'pairs')}
          ${stat('Packed, stage 5', n(ord.packedStage5Qty), 'lead packed', `${n(ord.packedStage5Cartons)} cartons`)}
          ${stat('Contractor balance', n(ord.contractorBalanceQty))}
          ${stat('Dock pool', n(ord.dockAvailableQty))}
          ${stat('Floor WIP', n(ord.inFloorWipQty), '', ord.awaitingFinalQcQty > 0 ? `${n(ord.awaitingFinalQcQty)} at stage 4` : '')}
          ${stat('Alteration / scrap', `${n(ord.inAlterationQty)} / ${n(ord.scrappedQty)}`)}
        </dl>`;

      // Planned vs packed per size, moved out of the header so the header stays scannable
      const sizeTable = `
        <div class="su-lt-sizes">
          <table>
            <thead><tr><th scope="col">Size</th>${sizeCodes.map(sz => `<th scope="col">${escapeHtml(sz)}</th>`).join('')}</tr></thead>
            <tbody>
              <tr><td>Planned</td>${sizeCodes.map(sz => `<td>${n(ord.sizes?.[sz])}</td>`).join('')}</tr>
              <tr><td>Packed</td>${sizeCodes.map(sz => `<td>${n(ord.packedSizes?.[sz])}</td>`).join('')}</tr>
            </tbody>
          </table>
        </div>`;

      const grnRows =
        ord.grnBatches.length === 0
          ? `<tr><td colspan="6" class="su-lt-empty-row">No GRN batches yet. Use Receive GRN when contractor goods arrive at the dock.</td></tr>`
          : ord.grnBatches
              .map((g: SuperUserGrnBatchItem) => {
                const voidCheck = canVoidGrnBatch(g);
                const sizeTxt = isLegacy
                  ? sizeCodes.map(sz => n(g.sizes?.[sz])).join(' / ')
                  : sizeCodes.filter(sz => Number(g.sizes?.[sz] || 0) > 0).map(sz => `${escapeHtml(sz)}:${n(g.sizes?.[sz])}`).join(' / ') || '0';
                const sourceTxt = g.hallName && g.stitcherName
                  ? `${escapeHtml(g.hallName)} &rarr; ${escapeHtml(g.stitcherName)}`
                  : (g.receivedFrom && g.receivedFrom !== g.maker ? escapeHtml(g.receivedFrom) : '');
                return `
          <tr id="tracking-chip-row-${escapeHtml(g.grnCode)}" class="${ctx.highlightedRefCode === g.grnCode ? 'is-highlighted' : ''}">
            <td>${refTag('grn', g.grnCode)}<div class="su-lt-sub">Batch ${g.orderBatchSeq}${sourceTxt ? ` &middot; ${sourceTxt}` : ''}</div></td>
            <td class="muted">${escapeHtml(g.date)}</td>
            <td class="mono">${sizeTxt}</td>
            <td class="text-right num"><strong>${n(g.rcvdPairs)}</strong></td>
            <td>
              <span class="${getSuperUserStatusBadgeClass(g.allocationStatus)}">${escapeHtml(g.allocationStatus)}</span>
              ${
                g.allocatedToReqs.length > 0
                  ? `<div class="su-lt-sub">${g.allocatedToReqs.map(a => `${escapeHtml(a.reqNumber)} (${n(a.pairs)})`).join(', ')}</div>`
                  : `<div class="su-lt-sub">${n(g.unallocatedPairs)} in dock pool</div>`
              }
            </td>
            <td class="text-center" style="white-space:nowrap">
              <button type="button" class="table-btn su-lt-link" data-su-action="open-slip" data-slip-type="GRN" data-ref-code="${escapeHtml(g.grnCode)}" data-order-id="${escapeHtml(ord.orderId)}">Slip</button>
              ${voidCheck.allowed ? `<button type="button" class="table-btn su-lt-link su-lt-link--danger" title="${escapeHtml(voidCheck.reason)}" data-su-action="void-grn" data-grn-sr="${g.sr}" data-grn-code="${escapeHtml(g.grnCode)}">Void</button>` : ''}
            </td>
          </tr>`;
              })
              .join('');

      const reqRows =
        ord.reqBatches.length === 0
          ? `<tr><td colspan="6" class="su-lt-empty-row">No requisitions yet. Use New requisition to draw REQ-0001 with its M-REQ and A-REQ slips.</td></tr>`
          : ord.reqBatches
              .map((r: SuperUserReqBatchItem) => {
                const voidCheck = canVoidRequisitionLot({
                  reqNumber: r.reqNumber,
                  stage1Passed: r.stage1Passed,
                  outputPairs: r.packedStage5Pairs
                });
                const slip = (kind: RefKind, type: string, code: string) =>
                  refTag(kind, code, `data-su-action="open-slip" data-slip-type="${type}" data-ref-code="${escapeHtml(code)}" data-order-id="${escapeHtml(ord.orderId)}"`);
                return `
          <tr id="tracking-chip-row-${escapeHtml(r.reqNumber)}" class="${ctx.highlightedRefCode === r.reqNumber ? 'is-highlighted' : ''}">
            <td>
              ${slip('req', 'REQ', r.reqNumber)}
              <div class="su-lt-sub">#${r.orderReqSeq}${r.allocatedFromGrns.length > 0 ? ` from ${r.allocatedFromGrns.map(a => `${escapeHtml(a.grnCode)} (${n(a.pairs)})`).join(' + ')}` : ''}</div>
            </td>
            <td>
              <div>${slip('mreq', 'M-REQ', r.mreqNo)} <span class="muted">${escapeHtml(r.mreqStatus)}</span></div>
              <div style="margin-top:4px">${slip('areq', 'A-REQ', r.altReqNo)} <span class="muted">${n(r.inAlterationPairs)} rework${r.alterationCycleCount > 0 ? `, cycle ${r.alterationCycleCount} of 2` : ''}</span></div>
            </td>
            <td class="text-right num"><strong>${r.issuedPairs > 0 ? n(r.issuedPairs) : `<span class="muted">Asked ${n(r.askingPairs)}</span>`}</strong></td>
            <td>
              ${renderStageMiniTrack(r.activeStage, r.awaitingFinalQc, r.reqLifecycleStatus === 'CLOSED ✓')}
              ${r.awaitingFinalQc ? `<div class="su-lt-sub">Stage 4 done, awaiting final QC</div>` : ''}
              <div class="su-lt-figs" style="justify-content:flex-start;margin-top:8px">
                <span>WIP<b>${n(r.inFloorWipPairs)}</b></span>
                <span class="${r.inAlterationPairs > 0 ? 'neg' : ''}">Alt<b>${n(r.inAlterationPairs)}</b></span>
                <span class="${r.scrappedPairs > 0 ? 'neg' : ''}">Scrap<b>${n(r.scrappedPairs)}</b></span>
                <span class="s5">Packed<b>${n(r.packedStage5Pairs)}</b></span>
              </div>
            </td>
            <td class="text-center">
              <div style="margin-bottom:4px">${renderReconciliationBadge(r.reconciliation)}</div>
              <span class="${getSuperUserStatusBadgeClass(r.reqLifecycleStatus)}">${escapeHtml(r.reqLifecycleStatus)}</span>
            </td>
            <td class="text-center" style="white-space:nowrap">
              <button type="button" class="table-btn su-lt-link" data-su-action="open-req-screen" data-req-number="${escapeHtml(r.reqNumber)}" data-target-screen="screen-packing">Floor</button>
              ${voidCheck.allowed ? `<button type="button" class="table-btn su-lt-link su-lt-link--danger" title="${escapeHtml(voidCheck.reason)}" data-su-action="void-req" data-req-number="${escapeHtml(r.reqNumber)}">Void</button>` : ''}
            </td>
          </tr>`;
              })
              .join('');

      const body = `
        ${stats}
        ${sizeTable}
        <div class="su-lt-body">
          <div class="su-lt-panel">
            <div class="su-lt-panel-head">
              <h3>Supply Stream: Inward GRN Batches (${ord.grnBatches.length})</h3>
              <span>${n(ord.receivedGrnQty)} of ${n(ord.plannedQty)} pairs received</span>
            </div>
            <div class="table-responsive">
              <table class="data-table">
                <thead><tr>
                  <th scope="col">GRN</th><th scope="col">Date</th><th scope="col">${escapeHtml(sizeHeader)}</th>
                  <th scope="col" class="text-right">Pairs</th><th scope="col">Allocation</th><th scope="col" class="text-center"><span class="sr-only">Actions</span></th>
                </tr></thead>
                <tbody>${grnRows}</tbody>
              </table>
            </div>
          </div>

          <div class="su-lt-panel">
            <div class="su-lt-panel-head">
              <h3>Execution Stream: Packing Hall Requisitions (${ord.reqBatches.length})</h3>
              <span>${n(ord.issuedReqQty)} issued, ${n(ord.packedStage5Qty)} packed</span>
            </div>
            <div class="table-responsive">
              <table class="data-table">
                <thead><tr>
                  <th scope="col">REQ</th><th scope="col">M-REQ and A-REQ</th><th scope="col" class="text-right">Pairs</th>
                  <th scope="col">Progress</th><th scope="col" class="text-center">Status</th><th scope="col" class="text-center"><span class="sr-only">Actions</span></th>
                </tr></thead>
                <tbody>${reqRows}</tbody>
              </table>
            </div>
          </div>
        </div>`;

      return `
      <section class="su-order-card su-lt-card ${isExpanded ? 'expanded' : 'collapsed'}" id="tracking-order-card-${escapeHtml(ord.orderId)}" data-order-card="${escapeHtml(ord.orderId)}">
        ${header}
        ${isExpanded ? body : ''}
      </section>`;
    })
    .join('');

  return `<div class="su-lt">${toolbar}${chart}${pagedOrders.length === 0 ? emptyState : orderCards}</div>`;
}
