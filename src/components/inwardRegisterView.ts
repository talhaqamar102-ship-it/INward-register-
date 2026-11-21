import {
  SizeBreakdown,
  PendingOrder,
  SuperUserDashboardSummary,
  HallWithStitchers,
  calculateSizeTotal,
  createEmptySizes,
  formatSplitAllocationSummary,
  normalizeBaseReqNumber,
  getMaterialReqNumber,
  getAlterationReqNumber,
  evaluateRequisitionIssuance,
  formatCurrentDateDDMMYYYY,
  escapeHtml,
  formatSizeColumnLabel,
  computeDeliveryCountdown,
  resolveScaleKeysForBreakdown,
  formatBatchSequence
} from '../utils/requisitionLogic';

export interface InwardRegisterStateShape {
  grnList: Array<Record<string, any>>;
  pendingOrders: PendingOrder[];
  grnForm: {
    pendingOrderId: string;
    maker: string;
    hallName?: string;
    stitcherName?: string;
    article: string;
    color: string;
    sizeFormat?: string;
    sizeCodes?: readonly string[];
    receivedFrom: string;
    rcvdPairs: string;
    sizes: SizeBreakdown;
    splitRows: Array<{
      maker: string;
      hallName?: string;
      stitcherName?: string;
      receivedFrom: string;
      sizes: SizeBreakdown;
    }>;
  };
  packingWip: Record<string, any>;
  ordersWipMap: Record<string, any>;
  dropdownOptions: {
    makers: string[];
    halls?: HallWithStitchers[];
    [key: string]: any;
  };
}

export interface InwardRegisterRenderContext {
  state: InwardRegisterStateShape;
  getOrderSizeCodes: (orderId?: string, explicitCodes?: readonly string[], explicitFormat?: string) => readonly string[];
  getGrnRemainingCaps: (orderId: string, maker?: string) => any;
  formatGrnRemainingCaps: (caps: any, enteredSizes: SizeBreakdown) => string;
  getOrderStockState: (orderId: string) => { totalReceived: number; totalIssued: number; availablePairs: number };
  getTotalIssuedPairs: () => number;
  rollupSummary: SuperUserDashboardSummary;
}

function formatScaleDisplayName(fmt: string): string {
  const upper = String(fmt || '').trim().toUpperCase();
  if (upper === 'LEGACY_7_11') return 'Legacy 7–11 scale';
  if (upper === 'GENRAL' || upper === 'GENERAL') return 'General scale';
  return fmt || 'Standard scale';
}

function formatCompactSizeBreakdown(
  sizes: SizeBreakdown | undefined,
  codes: readonly string[],
  rowFmt: string
): string {
  const colonFmt = rowFmt && rowFmt !== 'LEGACY_7_11';
  const parts = codes
    .filter(sz => Number(sizes?.[sz] || 0) > 0)
    .map(sz =>
      colonFmt
        ? `${escapeHtml(sz)}:${Number(sizes?.[sz] || 0).toLocaleString()}`
        : `${escapeHtml(sz)} ${Number(sizes?.[sz] || 0).toLocaleString()}`
    );
  const body = parts.length > 0 ? parts.join(' &middot; ') : '0';
  return colonFmt ? `<div class="inw-art-color">${escapeHtml(rowFmt)}</div><div>${body}</div>` : body;
}

export function renderInwardRegisterScreen(ctx: InwardRegisterRenderContext): string {
  const {
    state,
    getOrderSizeCodes,
    getGrnRemainingCaps,
    formatGrnRemainingCaps,
    getOrderStockState,
    getTotalIssuedPairs
  } = ctx;
  const sumRcvd = state.grnList
    .filter(row => !row.isVoided && row.status.toUpperCase() !== 'VOIDED')
    .reduce((acc, row) => acc + row.rcvdPairs, 0);
  const currentSizeTotal = calculateSizeTotal(state.grnForm.sizes);
  const selectedGrnOrder = state.pendingOrders.find(o => o.orderId === state.grnForm.pendingOrderId);
  const grnActiveFormat = selectedGrnOrder?.sizeFormat || state.grnForm.sizeFormat || 'LEGACY_7_11';
  const grnActiveCodes = getOrderSizeCodes(state.grnForm.pendingOrderId, selectedGrnOrder?.sizeCodes || state.grnForm.sizeCodes, grnActiveFormat);
  const orderAllocations = selectedGrnOrder?.contractorAllocations || [];
  const halls: HallWithStitchers[] = Array.isArray(state.dropdownOptions.halls) ? state.dropdownOptions.halls : [];
  const activeHallName = String(state.grnForm.hallName || '').trim();
  const activeHall = halls.find(h => h.name.trim().toLowerCase() === activeHallName.toLowerCase());
  const activeHallStitchers = activeHall?.stitchers || [];
  const hallSelected = Boolean(activeHall);
  const hallActiveWithStitchers = Boolean(activeHall && activeHallStitchers.length > 0);
  const isMultiSplitMode = Boolean(selectedGrnOrder && orderAllocations.length > 1 && !state.grnForm.maker);
  const effectiveSplitRows = isMultiSplitMode
    ? orderAllocations.map(alloc => {
        const existing = state.grnForm.splitRows.find(
          r => r.maker.trim().toLowerCase() === alloc.maker.trim().toLowerCase()
        );
        return existing || { maker: alloc.maker, hallName: '', stitcherName: '', receivedFrom: '', sizes: createEmptySizes(grnActiveCodes) };
      })
    : [];
  const currentSplitTotal = effectiveSplitRows.reduce((sum, r) => sum + calculateSizeTotal(r.sizes), 0);
  const displayRcvdValue = isMultiSplitMode
    ? (currentSplitTotal > 0 ? String(currentSplitTotal) : '')
    : state.grnForm.rcvdPairs;
  const orderSplitSummary = formatSplitAllocationSummary(orderAllocations);
  const grnCaps = getGrnRemainingCaps(state.grnForm.pendingOrderId, state.grnForm.maker);
  const singleLockedAlloc = selectedGrnOrder && orderAllocations.length === 1 ? orderAllocations[0] : null;
  const wip = state.packingWip;
  const baseReq = normalizeBaseReqNumber(wip.selectedBatch);
  const mReq = getMaterialReqNumber(baseReq);
  const aReq = getAlterationReqNumber(baseReq);
  const askingPairs = wip.plannedQty || calculateSizeTotal(wip.sizes);
  const orderStock = getOrderStockState(wip.parentOrderId || '');
  const evalIssue = evaluateRequisitionIssuance({
    askingPairs,
    askingSizes: wip.sizes,
    totalReceivedPairs: orderStock.totalReceived,
    alreadyIssuedPairs: orderStock.totalIssued
  });
  const totalIssuedPairs = getTotalIssuedPairs();
  const queueReqs = Object.values(state.ordersWipMap).filter((item: any) => item && !item.isVoided);
  const activeQueueList = queueReqs.length > 0 ? queueReqs : [wip];
  const wipCodes = resolveScaleKeysForBreakdown(wip.sizes, (wip as any).sizeCodes);
  const isReqIssued = askingPairs > 0 && wip.issueStatus === 'Issued by Inward Register';

  return `
    <div class="inw" data-testid="inward-register-screen">
      <div class="sub-header-bar">
        <h1 class="sub-header-title">Inward register &mdash; Dock #1 goods receiving &amp; packing hall issuance</h1>
        <div class="sub-header-right">
          <span class="system-date-label">Date: ${formatCurrentDateDDMMYYYY()}</span>
        </div>
      </div>

      <main id="main-content" class="inw-main" tabindex="-1">

        <!-- Card 1: Receive goods -->
        <section class="inw-card" aria-labelledby="inw-receive-title">
          <h2 id="inw-receive-title" class="inw-card-title">Receive goods</h2>
          <div class="inward-order-row">
            <div class="form-group">
              <label class="inw-label" for="grn-pending-order">Pending order</label>
              <select id="grn-pending-order" class="inw-control">
                <option value="">-- Select pending order --</option>
                ${state.pendingOrders.map(o => {
                  return `<option value="${o.orderId}" ${state.grnForm.pendingOrderId === o.orderId ? 'selected' : ''}>${escapeHtml(o.orderId)} &middot; ${escapeHtml(o.maker)} &middot; ${escapeHtml(o.article)}</option>`;
                }).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="inw-label" for="grn-maker">
                Maker ${orderAllocations.length > 1 ? `(${orderAllocations.length} split)` : ''}
              </label>
              ${
                singleLockedAlloc
                  ? `
                <select id="grn-maker" class="inw-control sr-only" tabindex="-1" disabled aria-hidden="true">
                  <option value="${escapeHtml(singleLockedAlloc.maker)}" selected>${escapeHtml(singleLockedAlloc.maker)}</option>
                </select>
                <div class="inw-static-val">${escapeHtml(singleLockedAlloc.maker)}</div>
                <div class="inw-static-sub">Plan ${singleLockedAlloc.totalQty.toLocaleString()} &middot; Received ${Number(singleLockedAlloc.receivedPairs || 0).toLocaleString()} &middot; Balance ${Math.max(0, singleLockedAlloc.remainingPairs ?? (singleLockedAlloc.totalQty - Number(singleLockedAlloc.receivedPairs || 0))).toLocaleString()}</div>
              `
                  : `
                <select id="grn-maker" class="inw-control">
                  ${
                    selectedGrnOrder && orderAllocations.length > 0
                      ? `${orderAllocations.length > 1 ? `<option value="" ${!state.grnForm.maker ? 'selected' : ''}>All split contractors (${orderAllocations.length})</option>` : ''}${orderAllocations.map(alloc => {
                          const bal = alloc.remainingPairs ?? Math.max(0, alloc.totalQty - Number(alloc.receivedPairs || 0));
                          return `<option value="${escapeHtml(alloc.maker)}" ${state.grnForm.maker === alloc.maker ? 'selected' : ''}>${escapeHtml(alloc.maker)} (Plan ${alloc.totalQty} &middot; Bal ${bal})</option>`;
                        }).join('')}`
                      : `<option value="">-- Select maker --</option>${state.dropdownOptions.makers.map(m => `<option value="${escapeHtml(m)}" ${state.grnForm.maker === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}`
                  }
                </select>
              `
              }
            </div>
            <div class="form-group">
              <label class="inw-label" for="grn-article">Article</label>
              <input type="text" id="grn-article" class="sr-only" tabindex="-1" value="${escapeHtml(state.grnForm.article)}" readonly aria-readonly="true" />
              <div class="inw-static-val">${escapeHtml(state.grnForm.article || '---')}</div>
            </div>
            <div class="form-group">
              <label class="inw-label" for="grn-color">Colour</label>
              <input type="text" id="grn-color" class="sr-only" tabindex="-1" value="${escapeHtml(state.grnForm.color)}" readonly aria-readonly="true" />
              <div class="inw-static-val">${escapeHtml(state.grnForm.color || '---')}</div>
            </div>
          </div>

          <input type="number" id="grn-rcvd-pairs" class="sr-only" tabindex="-1" value="${escapeHtml(displayRcvdValue)}" readonly aria-readonly="true" />

          <div class="inw-section" style="${isMultiSplitMode ? 'display: none;' : ''}">
            <div class="inw-section-title">Receiving from</div>
            <div class="inward-chain-bar">
              <div class="form-group">
                <label class="inw-label" for="grn-hall">Hall</label>
                <select id="grn-hall" class="inw-control">
                  <option value="" ${!hallSelected ? 'selected' : ''}>External maker (no hall)</option>
                  ${halls.map(h => `<option value="${escapeHtml(h.name)}" ${activeHall?.name === h.name ? 'selected' : ''}>${escapeHtml(h.name)} &middot; ${h.stitchers.length} stitcher${h.stitchers.length === 1 ? '' : 's'}</option>`).join('')}
                </select>
                <div class="inward-field-hint">
                  ${hallSelected
                    ? `Receiving from the <strong>${escapeHtml(activeHall!.name)}</strong> chain`
                    : 'Select a hall for stitcher tracking, or leave external'}
                </div>
              </div>
              <div class="form-group">
                <label class="inw-label" for="grn-stitcher">
                  Stitcher${hallSelected ? ' (required)' : ''}
                </label>
                <select id="grn-stitcher" class="inw-control" ${hallActiveWithStitchers ? '' : 'disabled'}>
                  ${
                    !hallSelected
                      ? `<option value="">Select a hall first</option>`
                      : !hallActiveWithStitchers
                        ? `<option value="">No stitchers in ${escapeHtml(activeHall!.name)}</option>`
                        : `<option value="">Select stitcher (${escapeHtml(activeHall!.name)})</option>${activeHallStitchers.map(s => `<option value="${escapeHtml(s.name)}" ${(state.grnForm.stitcherName || '').trim().toLowerCase() === s.name.trim().toLowerCase() ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}`
                  }
                </select>
                <div class="inward-field-hint">
                  ${hallSelected && !hallActiveWithStitchers
                    ? `Add stitchers in Super User master data, registry 04`
                    : (hallActiveWithStitchers
                        ? `Filtered to ${escapeHtml(activeHall!.name)}`
                        : 'Enabled when a hall is selected')}
                </div>
              </div>
              <div class="form-group">
                <label class="inw-label" for="grn-received-from">
                  ${hallActiveWithStitchers ? 'Received from (optional)' : 'Received from (required)'}
                </label>
                <input
                  type="text"
                  id="grn-received-from"
                  class="inw-control"
                  placeholder="${hallActiveWithStitchers ? 'Optional courier or note' : 'Person or courier name'}"
                  value="${escapeHtml(state.grnForm.receivedFrom)}"
                  ${hallActiveWithStitchers ? '' : 'required aria-required="true"'}
                />
                <div class="inward-field-hint" id="grn-note-hint">
                  ${hallActiveWithStitchers
                    ? `Defaults to <strong>${escapeHtml((state.grnForm.stitcherName || 'Stitcher') + ' (' + activeHall!.name + ')')}</strong> if blank`
                    : 'Person or carrier name for external maker deliveries'}
                </div>
              </div>
            </div>
          </div>

          <div class="inw-section">
            <div class="inw-sizes-head">
              <div class="inw-section-title">
                ${isMultiSplitMode ? `Split order receipt &middot; ${escapeHtml(formatScaleDisplayName(grnActiveFormat))}, ${grnActiveCodes.length} sizes` : `Received sizes &middot; ${escapeHtml(formatScaleDisplayName(grnActiveFormat))}, ${grnActiveCodes.length} sizes`}
              </div>
              <div class="inw-section-meta">
                ${orderSplitSummary ? `Split among ${escapeHtml(orderSplitSummary)}` : 'Enter pairs per size. The received total updates automatically.'}
              </div>
            </div>
            ${
              isMultiSplitMode
                ? `
            <div class="inw-table-scroll">
              <table class="inw-size-table" id="grn-split-entry-table">
                <thead>
                  <tr>
                    <th style="text-align: left; min-width: 175px;">Contractor</th>
                    <th style="text-align: left; min-width: 165px;">Received from</th>
                    ${grnActiveCodes.map(sz => `<th>${escapeHtml(formatSizeColumnLabel(sz, grnActiveFormat))}</th>`).join('')}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${orderAllocations.map((alloc, idx) => {
                    const rowCaps = getGrnRemainingCaps(selectedGrnOrder!.orderId, alloc.maker);
                    const bal = rowCaps ? rowCaps.totalRemaining : Math.max(0, alloc.totalQty - Number(alloc.receivedPairs || 0));
                    const splitRow = effectiveSplitRows[idx];
                    const rowTot = calculateSizeTotal(splitRow.sizes);
                    const rowHall = halls.find(h => h.name.trim().toLowerCase() === alloc.maker.trim().toLowerCase() && h.stitchers.length > 0);
                    return `
                    <tr data-split-idx="${idx}" data-maker="${escapeHtml(alloc.maker)}">
                      <td style="text-align: left;">
                        <div class="inward-split-attr">
                          <div>
                            <div class="inw-static-val">${escapeHtml(alloc.maker)}</div>
                            <div class="inw-static-sub">Bal ${bal.toLocaleString()} / ${alloc.totalQty.toLocaleString()} pairs</div>
                          </div>
                          ${rowHall ? `
                            <select class="inw-control grn-split-stitcher" data-split-idx="${idx}" data-hall-name="${escapeHtml(rowHall.name)}" aria-label="Stitcher for ${escapeHtml(alloc.maker)}" ${bal <= 0 ? 'disabled' : ''}>
                              <option value="">Select stitcher (${escapeHtml(rowHall.name)})</option>
                              ${rowHall.stitchers.map(s => `<option value="${escapeHtml(s.name)}" ${(splitRow.stitcherName || '').trim().toLowerCase() === s.name.trim().toLowerCase() ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
                            </select>
                          ` : ''}
                        </div>
                      </td>
                      <td style="text-align: left;">
                        <input type="text" class="inw-control grn-split-received-from" data-split-idx="${idx}" data-maker="${escapeHtml(alloc.maker)}" placeholder="${bal <= 0 ? 'Completed' : (rowHall ? `Optional note (${escapeHtml(rowHall.name)})` : `Delivered by (${escapeHtml(alloc.maker)})`)}" aria-label="Received From for ${escapeHtml(alloc.maker)}" value="${escapeHtml(splitRow.receivedFrom)}" style="min-width: 150px;" ${bal <= 0 ? 'disabled' : ''} />
                      </td>
                      ${grnActiveCodes.map(sz => {
                        const szMax = rowCaps ? (rowCaps.sizeRemaining[sz] ?? 0) : 0;
                        return `<td><input type="number" class="inw-size-input grn-split-size-val" data-split-idx="${idx}" data-maker="${escapeHtml(alloc.maker)}" data-size="${escapeHtml(sz)}" aria-label="${escapeHtml(alloc.maker)} Size ${escapeHtml(formatSizeColumnLabel(sz, grnActiveFormat))} Pairs" min="0" max="${szMax}" placeholder="0" value="${splitRow.sizes?.[sz] || ''}" ${bal <= 0 ? 'disabled' : ''} /></td>`;
                      }).join('')}
                      <td class="inw-size-total-val" id="grn-split-row-total-${idx}">${rowTot.toLocaleString()}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
            <div class="inw-section-meta" id="grn-size-caps" style="margin-top: 8px;">
              Total receiving across split contractors: <strong id="grn-size-total-display">${currentSplitTotal.toLocaleString()}</strong> pairs
            </div>`
                : `
            <div class="inw-table-scroll">
              <table class="inw-size-table">
                <thead>
                  <tr>
                    <th class="inw-size-row-label" aria-label="Row label"></th>
                    ${grnActiveCodes.map(sz => `<th>${escapeHtml(formatSizeColumnLabel(sz, grnActiveFormat))}</th>`).join('')}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="inw-size-row-label">Balance after entry</td>
                    ${grnActiveCodes.map(sz => {
                      const rem = grnCaps ? Math.max(0, (grnCaps.sizeRemaining[sz] ?? 0) - Number(state.grnForm.sizes?.[sz] || 0)) : null;
                      return `<td class="inw-size-bal${rem === 0 ? ' is-zero' : ''}" data-bal-size="${escapeHtml(sz)}">${rem !== null ? rem.toLocaleString() : '—'}</td>`;
                    }).join('')}
                    <td class="inw-size-bal-total" id="grn-balance-total">${grnCaps ? Math.max(0, grnCaps.totalRemaining - currentSizeTotal).toLocaleString() : '—'}</td>
                  </tr>
                  <tr>
                    <td class="inw-size-row-label">Receiving</td>
                    ${grnActiveCodes.map(sz => `<td><input type="number" aria-label="Size ${escapeHtml(formatSizeColumnLabel(sz, grnActiveFormat))} Pairs" class="inw-size-input grn-size-val" data-size="${escapeHtml(sz)}" min="0" ${grnCaps ? `max="${grnCaps.sizeRemaining[sz] ?? 0}"` : ''} placeholder="0" value="${state.grnForm.sizes?.[sz] || ''}" /></td>`).join('')}
                    <td class="inw-size-total-val" id="grn-size-total-display">${currentSizeTotal.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div id="grn-size-caps" class="sr-only">
              ${grnCaps
                ? formatGrnRemainingCaps(grnCaps, state.grnForm.sizes)
                : 'No matching pending-order size cap available; received quantities are unrestricted.'}
            </div>`
            }
            ${selectedGrnOrder?.dueDate ? (() => {
              const allocForDue = orderAllocations.find(a => a.maker.trim().toLowerCase() === state.grnForm.maker.trim().toLowerCase());
              const effectiveDue = allocForDue?.dueDate || selectedGrnOrder.dueDate;
              const cd = computeDeliveryCountdown({ dueDate: effectiveDue, createdAt: selectedGrnOrder.createdAt });
              return `
              <div id="grn-delivery-timeline" class="inw-section-meta" style="margin-top: 8px;">
                Target delivery: <strong>${escapeHtml(cd.dueDate)}</strong> (${escapeHtml(cd.badgeText)})
              </div>`;
            })() : ''}
          </div>

          <div class="inw-actions-end">
            <button type="button" class="btn-outline inw-btn" id="btn-clear-grn">Clear</button>
            <button type="button" class="inw-btn inw-btn--primary" id="btn-print-grn-slip">Receive</button>
          </div>
        </section>

        <!-- Card 2: Packing hall requisition queue -->
        <section class="inw-card" aria-labelledby="inw-queue-title">
          <div class="inw-queue-head">
            <div>
              <h2 id="inw-queue-title" class="inw-card-title">Packing hall requisition queue</h2>
              <p class="inw-card-sub">
                ${escapeHtml(baseReq)}${wip.parentOrderId ? ` for ${escapeHtml(wip.parentOrderId)}` : ''} (${escapeHtml(mReq)}, ${escapeHtml(aReq)}). Issue the asking quantity when received stock is available.
              </p>
            </div>
            <div>
              ${
                isReqIssued
                  ? `<button type="button" class="sr-only" id="btn-issue-req-to-packing" tabindex="-1" disabled>Issued to packing hall</button>`
                  : `<button type="button" class="inw-btn inw-btn--primary" id="btn-issue-req-to-packing">Issue to packing hall</button>`
              }
            </div>
          </div>

          <div class="inw-queue-picker">
            <label class="inw-label" for="grn-queue-req-select">Active requisition</label>
            <select id="grn-queue-req-select" class="inw-control">
              ${activeQueueList.map((item: any) => {
                const reqCode = normalizeBaseReqNumber(item.selectedBatch || item.reqNumber);
                const qty = Number(item.plannedQty || calculateSizeTotal(item.sizes) || 0);
                const ordTxt = item.parentOrderId ? ` &middot; ${escapeHtml(item.parentOrderId)}` : '';
                const stTxt = item.issueStatus === 'Issued by Inward Register' ? 'issued' : 'pending';
                return `<option value="${reqCode}" ${reqCode === baseReq ? 'selected' : ''}>${escapeHtml(reqCode)}${ordTxt} &middot; ${qty.toLocaleString()} pairs &middot; ${stTxt}</option>`;
              }).join('')}
            </select>
          </div>

          <div class="inw-queue-meta">
            <div>
              <div class="inw-label">Article</div>
              <div class="inw-static-val">${escapeHtml(wip.article || '---')}</div>
            </div>
            <div>
              <div class="inw-label">Asking quantity</div>
              <div class="inw-static-val" id="grn-req-asking-qty">${askingPairs.toLocaleString()} pairs</div>
            </div>
            <div>
              <div class="inw-label">Available stock${wip.parentOrderId ? ` (${escapeHtml(wip.parentOrderId)})` : ''}</div>
              <div class="inw-static-val" id="grn-available-stock">${evalIssue.availablePairs.toLocaleString()} pairs</div>
            </div>
            <div>
              <div class="inw-label">Status</div>
              ${
                isReqIssued
                  ? `<div class="inw-status-line is-ok" id="grn-req-issue-status">&#10003; Issued to packing hall</div><div class="inw-static-sub">Issued by inward register</div>`
                  : askingPairs > 0
                    ? `<div class="inw-status-line is-pending" id="grn-req-issue-status">${escapeHtml(wip.issueStatus || 'Pending inward issue')}</div>`
                    : `<div class="inw-status-line is-muted" id="grn-req-issue-status">Awaiting packing hall requisition</div>`
              }
            </div>
          </div>

          <div class="inw-asking-wrap">
            <div class="inw-table-scroll">
              <table class="inw-asking-table">
                <thead>
                  <tr>
                    <th>Asking sizes</th>
                    ${wipCodes.map(sz => `<th>${escapeHtml(sz)}</th>`).join('')}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Pairs</td>
                    ${wipCodes.map(sz => `<td>${Number(wip.sizes?.[sz] || 0).toLocaleString()}</td>`).join('')}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <!-- Card 3: Store Register Master Table -->
        <section class="inw-card inw-card--table" aria-label="Store receiving ledger">
          <div class="table-responsive">
            <table class="data-table inw-ledger-table">
              <thead>
                <tr>
                  <th>GRN</th>
                  <th>Date</th>
                  <th>Order</th>
                  <th>Maker</th>
                  <th>Received from</th>
                  <th>Article</th>
                  <th>Sizes</th>
                  <th class="text-right">Pairs</th>
                  <th>Status</th>
                  <th aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                ${state.grnList.length === 0 ? `
                  <tr>
                    <td colspan="10" class="text-center" style="padding: 32px 16px; color: var(--inw-muted); font-size: 13px;">
                      No records found in Inward Register. Select a pending order, enter sizes above, and click <strong>Receive</strong>.
                    </td>
                  </tr>
                ` : state.grnList.map(row => {
                  const grnCode = row.grnCode || formatBatchSequence('GRN', row.sr);
                  const splitOrder = state.pendingOrders.find(o => o.orderId === row.pendingOrderId);
                  const splitTxt = formatSplitAllocationSummary(splitOrder?.contractorAllocations);
                  const rowOrder = splitOrder;
                  const rowCodes = resolveScaleKeysForBreakdown(row.sizes, row.sizeCodes || rowOrder?.sizeCodes);
                  const rowFmt = row.sizeFormat || rowOrder?.sizeFormat || (rowCodes.every(c => ['7', '8', '9', '10', '11'].includes(c)) ? 'LEGACY_7_11' : 'CATALOG');
                  const isVoided = Boolean(row.isVoided) || String(row.status || '').toUpperCase() === 'VOIDED';
                  const hallSub = row.hallName
                    ? `<div class="inw-static-sub">${escapeHtml(row.hallName)}${row.stitcherName ? ` &rarr; ${escapeHtml(row.stitcherName)}` : ''}</div>`
                    : '';
                  return `
                  <tr>
                    <td><span class="su-ref ${isVoided ? 'su-ref--areq' : 'su-ref--rcv'}"><i></i><span>${escapeHtml(grnCode)}</span></span></td>
                    <td style="white-space: nowrap;">${escapeHtml(row.date)}</td>
                    <td><span class="su-ref su-ref--req"><i></i><span>${escapeHtml(row.pendingOrderId || '---')}</span></span></td>
                    <td>
                      <div class="inw-art-name">${escapeHtml(row.maker)}</div>
                      ${hallSub}
                      ${splitTxt ? `<div class="inw-static-sub">Split: ${escapeHtml(splitTxt)}</div>` : ''}
                    </td>
                    <td>
                      <div>${escapeHtml(row.receivedFrom || row.maker || '---')}</div>
                      ${row.receivingNote && row.receivingNote !== row.receivedFrom ? `<div class="inw-static-sub">Note: ${escapeHtml(row.receivingNote)}</div>` : ''}
                    </td>
                    <td>
                      <div class="inw-art-name">${escapeHtml(row.article)}</div>
                      ${row.color ? `<div class="inw-art-color">${escapeHtml(row.color)}</div>` : ''}
                    </td>
                    <td><div class="inw-sizes-inline">${formatCompactSizeBreakdown(row.sizes, rowCodes, rowFmt)}</div></td>
                    <td class="text-right" style="font-weight: 600;">${row.rcvdPairs.toLocaleString()}</td>
                    <td>
                      <span class="inw-row-status ${isVoided ? 'is-voided' : ''}"><i></i><span>${escapeHtml(isVoided ? 'Voided' : row.status || 'Received')}</span></span>
                    </td>
                    <td>
                      <div class="inw-row-actions">
                        <button type="button" class="inw-action-link" onclick="window.viewGrnRecord(${row.sr})">View</button>
                        <button type="button" class="inw-action-link" onclick="window.editGrnRecord(${row.sr})">Edit</button>
                      </div>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </section>

        <!-- Card 4: Bottom metrics & actions -->
        <footer class="inw-footer-card">
          <div class="inw-footer-metrics">
            <div class="inw-metric">
              <span class="inw-metric-label">GRNs</span>
              <span class="inw-metric-val">${state.grnList.length.toLocaleString()}</span>
            </div>
            <div class="inw-metric">
              <span class="inw-metric-label">Total received</span>
              <span class="inw-metric-val">${sumRcvd.toLocaleString()} pairs</span>
            </div>
            <div class="inw-metric">
              <span class="inw-metric-label">Issued to packing hall</span>
              <span class="inw-metric-val">${totalIssuedPairs.toLocaleString()} pairs</span>
            </div>
            <div class="inw-metric">
              <span class="inw-metric-label">Available stock${wip.parentOrderId ? ` (${escapeHtml(wip.parentOrderId)})` : ''}</span>
              <span class="inw-metric-val">${evalIssue.availablePairs.toLocaleString()} pairs</span>
            </div>
          </div>
          <div class="inw-footer-actions">
            <button type="button" class="btn-outline inw-btn" id="btn-export-grn-excel">Excel export</button>
            <button type="button" class="btn-outline inw-btn" id="btn-print-grn-summary">Print</button>
          </div>
        </footer>
      </main>
    </div>
  `;
}
