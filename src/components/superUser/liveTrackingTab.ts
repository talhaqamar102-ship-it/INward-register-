import {
  computeDeliveryCountdown,
  SuperUserOrderRollup,
  SuperUserGrnBatchItem,
  SuperUserReqBatchItem,
  buildRequisitionAnalyticsSeries,
  renderRequisitionWipAnalyticsChart,
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

export function renderLiveTrackingTab(ctx: SuperUserRenderContext): string {
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
