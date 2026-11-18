import {
  SizeBreakdown,
  PendingOrder,
  SuperUserDashboardSummary,
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
    article: string;
    color: string;
    sizeFormat?: string;
    sizeCodes?: readonly string[];
    receivedFrom: string;
    rcvdPairs: string;
    sizes: SizeBreakdown;
    splitRows: Array<{ maker: string; receivedFrom: string; sizes: SizeBreakdown }>;
  };
  packingWip: Record<string, any>;
  ordersWipMap: Record<string, any>;
  dropdownOptions: {
    makers: string[];
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

export function renderInwardRegisterScreen(ctx: InwardRegisterRenderContext): string {
  const {
    state,
    getOrderSizeCodes,
    getGrnRemainingCaps,
    formatGrnRemainingCaps,
    getOrderStockState,
    getTotalIssuedPairs,
    rollupSummary
  } = ctx;
  const sumRcvd = state.grnList
    .filter(row => !row.isVoided && row.status.toUpperCase() !== 'VOIDED')
    .reduce((acc, row) => acc + row.rcvdPairs, 0);
  const currentSizeTotal = calculateSizeTotal(state.grnForm.sizes);
  const selectedGrnOrder = state.pendingOrders.find(o => o.orderId === state.grnForm.pendingOrderId);
  const grnActiveFormat = selectedGrnOrder?.sizeFormat || state.grnForm.sizeFormat || 'LEGACY_7_11';
  const grnActiveCodes = getOrderSizeCodes(state.grnForm.pendingOrderId, selectedGrnOrder?.sizeCodes || state.grnForm.sizeCodes, grnActiveFormat);
  const orderAllocations = selectedGrnOrder?.contractorAllocations || [];
  const isMultiSplitMode = Boolean(selectedGrnOrder && orderAllocations.length > 1 && !state.grnForm.maker);
  const effectiveSplitRows = isMultiSplitMode
    ? orderAllocations.map(alloc => {
        const existing = state.grnForm.splitRows.find(
          r => r.maker.trim().toLowerCase() === alloc.maker.trim().toLowerCase()
        );
        return existing || { maker: alloc.maker, receivedFrom: '', sizes: createEmptySizes(grnActiveCodes) };
      })
    : [];
  const currentSplitTotal = effectiveSplitRows.reduce((sum, r) => sum + calculateSizeTotal(r.sizes), 0);
  const displayRcvdValue = isMultiSplitMode
    ? (currentSplitTotal > 0 ? String(currentSplitTotal) : '')
    : state.grnForm.rcvdPairs;
  const orderSplitSummary = formatSplitAllocationSummary(orderAllocations);
  const grnCaps = getGrnRemainingCaps(state.grnForm.pendingOrderId, state.grnForm.maker);
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

  return `
    <div class="sub-header-bar">
      <h1 class="sub-header-title">
        Inward Goods Receiving Register (Dock #1) &mdash; Multi-Batch GRN Receiving (GRN-0001, GRN-0002...)
      </h1>
      <div class="sub-header-right">
        <span class="system-date-label">Date: ${formatCurrentDateDDMMYYYY()}</span>
      </div>
    </div>

    <!-- Main Content Area -->
    <main id="main-content" class="main-viewport" tabindex="-1">
      <!-- Clean Input Form Card: Pending Order Dropdown (Super User) + Received Only (No PO, No Order Qty) -->
      <section class="form-card">
        <div class="form-row">
          <div class="form-group" style="flex: 1.8;">
            <label for="grn-pending-order">Pending Order (Super User)</label>
            <select id="grn-pending-order" class="form-select">
              <option value="">-- Select Pending Order to Auto-Fill --</option>
              ${state.pendingOrders.map(o => {
                const ordRoll = rollupSummary.orderRollups.find(r => r.orderId === o.orderId);
                const rcvdTxt = ordRoll && ordRoll.receivedGrnQty > 0
                  ? ` &bull; Rcvd: ${ordRoll.receivedGrnQty}/${ordRoll.plannedQty} Prs (Bal: ${ordRoll.contractorBalanceQty})`
                  : (o.totalQty ? ` &bull; ${o.totalQty} Prs` : '');
                return `<option value="${o.orderId}" ${state.grnForm.pendingOrderId === o.orderId ? 'selected' : ''}>${o.orderId} &mdash; ${o.maker} (${o.article})${rcvdTxt}${o.buyer ? ` [${o.buyer}]` : ''}</option>`;
              }).join('')}
            </select>
          </div>
          <div class="form-group" style="flex: 1.5;">
            <label for="grn-maker">
              Maker / Contractor ${orderAllocations.length > 1 ? `(${orderAllocations.length} Split)` : (selectedGrnOrder ? '(Locked)' : '')}
            </label>
            <select id="grn-maker" class="form-select" ${selectedGrnOrder && orderAllocations.length === 1 ? 'disabled title="Only one contractor is allocated to this order."' : ''}>
              ${
                selectedGrnOrder && orderAllocations.length > 0
                  ? `${orderAllocations.length > 1 ? `<option value="" ${!state.grnForm.maker ? 'selected' : ''}>-- All Split Contractors (${orderAllocations.length}) --</option>` : ''}${orderAllocations.map(alloc => {
                      const bal = alloc.remainingPairs ?? Math.max(0, alloc.totalQty - Number(alloc.receivedPairs || 0));
                      return `<option value="${escapeHtml(alloc.maker)}" ${state.grnForm.maker === alloc.maker ? 'selected' : ''}>${escapeHtml(alloc.maker)} (Plan: ${alloc.totalQty} | Rcvd: ${Number(alloc.receivedPairs || 0)} | Bal: ${bal} Prs)</option>`;
                    }).join('')}`
                  : `<option value="">-- Select Maker / Contractor --</option>${state.dropdownOptions.makers.map(m => `<option value="${escapeHtml(m)}" ${state.grnForm.maker === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}`
              }
            </select>
          </div>
          <div class="form-group" style="flex: 1.2;">
            <label for="grn-article">Article / Model ${state.grnForm.pendingOrderId ? '(Locked)' : ''}</label>
            <input type="text" id="grn-article" class="form-input" placeholder="Auto-locked from order" value="${escapeHtml(state.grnForm.article)}" readonly aria-readonly="true" />
          </div>
          <div class="form-group" style="flex: 1;">
            <label for="grn-color">Colour / Shade ${state.grnForm.pendingOrderId ? '(Locked)' : ''}</label>
            <input type="text" id="grn-color" class="form-input" placeholder="Locked from order" value="${escapeHtml(state.grnForm.color)}" readonly aria-readonly="true" />
          </div>
          <div class="form-group" style="${isMultiSplitMode ? 'display: none;' : 'flex: 1.3;'}">
            <label for="grn-received-from">Received From (Name) <span class="su-required-mark" aria-hidden="true">*</span></label>
            <input type="text" id="grn-received-from" class="form-input" placeholder="Person name who delivered goods" value="${escapeHtml(state.grnForm.receivedFrom)}" required aria-required="true" />
          </div>
          <div class="form-group" style="flex: 0.9;">
            <label for="grn-rcvd-pairs">Received Pairs</label>
            <input type="number" id="grn-rcvd-pairs" class="form-input" placeholder="0" value="${escapeHtml(displayRcvdValue)}" readonly aria-readonly="true" />
          </div>
        </div>

        <!-- Front-and-Center Size Breakdown Allocation on Main Page -->
        <div style="background: var(--ink-50); border: 1px solid var(--border-strong); border-radius: 4px; padding: 10px 12px; margin-top: 4px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 6px;">
            <span style="font-weight: 700; color: var(--ink-950); font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em;">
              ${isMultiSplitMode ? `Split Order Receipt Entry (Pairs &bull; Scale: ${escapeHtml(grnActiveFormat)}, ${grnActiveCodes.length} Sizes)` : `Received Size Breakdown Allocation (Pairs &bull; Scale: ${escapeHtml(grnActiveFormat)}, ${grnActiveCodes.length} Sizes)`}
            </span>
            <span style="font-size: 11.5px; color: var(--ink-600);">
              ${orderSplitSummary ? `Split among: <strong>${escapeHtml(orderSplitSummary)}</strong>` : 'Front desk enters received pairs only &mdash; automatically updates Received Pairs'}
            </span>
          </div>
          ${
            isMultiSplitMode
              ? `
          <div class="table-responsive">
            <table class="size-matrix-table" id="grn-split-entry-table" style="margin: 0;">
              <thead>
                <tr>
                  <th style="text-align: left; min-width: 145px;">Contractor</th>
                  <th style="text-align: left; min-width: 165px;">Received From <span class="su-required-mark" aria-hidden="true">*</span></th>
                  ${grnActiveCodes.map(sz => `<th>${escapeHtml(formatSizeColumnLabel(sz, grnActiveFormat))}</th>`).join('')}
                  <th style="background: var(--ink-200); color: var(--ink-950);">Row Pairs</th>
                </tr>
              </thead>
              <tbody>
                ${orderAllocations.map((alloc, idx) => {
                  const rowCaps = getGrnRemainingCaps(selectedGrnOrder!.orderId, alloc.maker);
                  const bal = rowCaps ? rowCaps.totalRemaining : Math.max(0, alloc.totalQty - Number(alloc.receivedPairs || 0));
                  const splitRow = effectiveSplitRows[idx];
                  const rowTot = calculateSizeTotal(splitRow.sizes);
                  return `
                  <tr data-split-idx="${idx}" data-maker="${escapeHtml(alloc.maker)}">
                    <td style="text-align: left; white-space: nowrap;">
                      <strong>${escapeHtml(alloc.maker)}</strong>
                      <div style="font-size: 11px; color: var(--ink-600);">Bal: ${bal.toLocaleString()} / ${alloc.totalQty.toLocaleString()} Prs</div>
                    </td>
                    <td>
                      <input type="text" class="form-input grn-split-received-from" data-split-idx="${idx}" data-maker="${escapeHtml(alloc.maker)}" placeholder="${bal <= 0 ? 'Completed' : `Delivered by (${escapeHtml(alloc.maker)})`}" aria-label="Received From for ${escapeHtml(alloc.maker)}" value="${escapeHtml(splitRow.receivedFrom)}" style="min-width: 150px;" ${bal <= 0 ? 'disabled' : ''} />
                    </td>
                    ${grnActiveCodes.map(sz => {
                      const szMax = rowCaps ? (rowCaps.sizeRemaining[sz] ?? 0) : 0;
                      return `<td><input type="number" class="size-matrix-input grn-split-size-val" data-split-idx="${idx}" data-maker="${escapeHtml(alloc.maker)}" data-size="${escapeHtml(sz)}" aria-label="${escapeHtml(alloc.maker)} Size ${escapeHtml(formatSizeColumnLabel(sz, grnActiveFormat))} Pairs" min="0" max="${szMax}" placeholder="0" value="${splitRow.sizes?.[sz] || ''}" ${bal <= 0 ? 'disabled' : ''} /></td>`;
                    }).join('')}
                    <td style="font-weight: 800; color: var(--ink-950);" id="grn-split-row-total-${idx}">${rowTot.toLocaleString()}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div id="grn-size-caps" style="font-size: 11.5px; color: var(--ink-600); margin-top: 6px;">
            Total receiving across split contractors: <strong id="grn-size-total-display">${currentSplitTotal.toLocaleString()}</strong> pairs
          </div>`
              : `
          <div class="table-responsive">
            <table class="size-matrix-table" style="margin: 0;">
              <thead>
                <tr>
                  ${grnActiveCodes.map(sz => `<th>${escapeHtml(formatSizeColumnLabel(sz, grnActiveFormat))}</th>`).join('')}
                  <th style="background: var(--ink-200); color: var(--ink-950);">Total Received</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  ${grnActiveCodes.map(sz => `<td><input type="number" aria-label="Size ${escapeHtml(formatSizeColumnLabel(sz, grnActiveFormat))} Pairs" class="size-matrix-input grn-size-val" data-size="${escapeHtml(sz)}" min="0" ${grnCaps ? `max="${grnCaps.sizeRemaining[sz] ?? 0}"` : ''} placeholder="0" value="${state.grnForm.sizes?.[sz] || ''}" /></td>`).join('')}
                  <td style="font-weight: 800; font-size: 14px; color: var(--ink-950);" id="grn-size-total-display">${currentSizeTotal.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div id="grn-size-caps" style="font-size: 11.5px; color: var(--ink-600); margin-top: 6px;">
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
            <div id="grn-delivery-timeline" style="font-size: 11.5px; color: var(--ink-800); margin-top: 4px; font-weight: 600;">
              Target Delivery: <strong>${escapeHtml(cd.dueDate)}</strong> (${escapeHtml(cd.badgeText)})
            </div>`;
          })() : ''}
        </div>

        <div class="form-action-row" style="justify-content: flex-end;">
          <div class="form-actions-right">
            <button class="btn-primary" id="btn-print-grn-slip">Receive</button>
            <button class="btn-outline" id="btn-clear-grn">Clear</button>
          </div>
        </div>
      </section>

      <!-- Packing Hall Requisition Issuance Card (Inward Register Person Issues Asking Given Available Stock) -->
      <section class="panel-card" style="padding: 12px 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div>
            <div style="font-size: 12px; font-weight: 800; color: var(--ink-950); text-transform: uppercase; letter-spacing: 0.03em;">
              Packing Hall Requisition Queue &mdash; Issue Asking Pairs (Given Available Stock)
            </div>
            <div style="font-size: 11.5px; color: var(--ink-600); margin-top: 2px;">
              Packing Hall generates Requisition <strong>${baseReq}</strong> (${mReq} / ${aReq})${wip.parentOrderId ? ` for Order <strong>${wip.parentOrderId}</strong>` : ''} &bull; Inward Register person issues the asking quantity when received stock is available.
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 6px; font-size: 12px;">
              <label for="grn-queue-req-select" style="color: var(--ink-600); font-weight: 600;">Active Queue REQ:</label>
              <select id="grn-queue-req-select" class="form-select" style="min-width: 240px; height: 32px; font-size: 12px;">
                ${activeQueueList.map((item: any) => {
                  const reqCode = normalizeBaseReqNumber(item.selectedBatch || item.reqNumber);
                  const qty = Number(item.plannedQty || calculateSizeTotal(item.sizes) || 0);
                  const ordTxt = item.parentOrderId ? ` • ${item.parentOrderId}` : '';
                  const stTxt = item.issueStatus === 'Issued by Inward Register' ? 'ISSUED' : 'PENDING';
                  return `<option value="${reqCode}" ${reqCode === baseReq ? 'selected' : ''}>${reqCode}${ordTxt} (${qty.toLocaleString()} Prs • ${stTxt})</option>`;
                }).join('')}
              </select>
            </div>
            <div style="font-size: 12px;">
              <span style="color: var(--ink-600);">Article:</span>
              <strong>${wip.article || '---'}</strong>
            </div>
            <div style="font-size: 12px;">
              <span style="color: var(--ink-600);">Asking Sizes:</span>
              <strong>${(() => {
                const wipCodes = resolveScaleKeysForBreakdown(wip.sizes, (wip as any).sizeCodes);
                return wipCodes.map(sz => `${escapeHtml(sz)}:${wip.sizes?.[sz] ?? 0}`).join(' | ');
              })()}</strong>
            </div>
            <div style="font-size: 12px;">
              <span style="color: var(--ink-600);">Asking Qty:</span>
              <strong id="grn-req-asking-qty">${askingPairs.toLocaleString()} Pairs</strong>
            </div>
            <div style="font-size: 12px;">
              <span style="color: var(--ink-600);">Available Stock${wip.parentOrderId ? ` (${wip.parentOrderId})` : ''}:</span>
              <strong id="grn-available-stock">${evalIssue.availablePairs.toLocaleString()} Pairs</strong>
            </div>
            <span class="status-pill ${wip.issueStatus === 'Issued by Inward Register' ? 'status-pill-green' : 'status-pill-amber'}" id="grn-req-issue-status">
              ${askingPairs > 0 ? wip.issueStatus : 'Awaiting Packing Hall Requisition'}
            </span>
            <button class="btn-primary" id="btn-issue-req-to-packing" ${wip.issueStatus === 'Issued by Inward Register' && askingPairs > 0 ? 'disabled' : ''}>
              ${wip.issueStatus === 'Issued by Inward Register' && askingPairs > 0 ? 'Issued to Packing Hall ✓' : 'Issue Asking to Packing Hall'}
            </button>
          </div>
        </div>
      </section>

      <!-- Store Register Master Table (No PO Number, No Order Qty) -->
      <section class="panel-card">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 90px;">GRN Code</th>
                <th>Date</th>
                <th>Parent Order #</th>
                <th>Maker / Contractor</th>
                <th>Received From</th>
                <th>Article / Colour</th>
                <th class="text-center">7/S</th>
                <th class="text-center">8/M</th>
                <th class="text-center">9/L</th>
                <th class="text-center">10/XL</th>
                <th class="text-center">11/XXL</th>
                <th class="text-right">Received Pairs</th>
                <th class="text-center">Status</th>
                <th class="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${state.grnList.length === 0 ? `
                <tr>
                  <td colspan="14" class="text-center" style="padding: 32px 16px; color: var(--ink-500); font-size: 13px;">
                    No records found in Inward Register. Select a Pending Order, enter Received From (person name) and size quantities above, then click <strong>Receive</strong>.
                  </td>
                </tr>
              ` : state.grnList.map(row => `
                <tr>
                  <td class="text-center font-bold" style="font-family: var(--font-mono);">${row.grnCode || formatBatchSequence('GRN', row.sr)}</td>
                  <td>${escapeHtml(row.date)}</td>
                  <td class="font-bold">${escapeHtml(row.pendingOrderId || '---')}</td>
                  ${(() => {
                    const splitOrder = state.pendingOrders.find(o => o.orderId === row.pendingOrderId);
                    const splitTxt = formatSplitAllocationSummary(splitOrder?.contractorAllocations);
                    return `<td><strong>${escapeHtml(row.maker)}</strong>${splitTxt ? `<div style="font-size: 11px; color: var(--ink-600);">Split: ${escapeHtml(splitTxt)}</div>` : ''}</td>`;
                  })()}
                  <td>${escapeHtml(row.receivedFrom || row.maker || '---')}</td>
                  <td class="font-bold">${escapeHtml(row.article)}${row.color ? ` <span style="font-weight: 500; color: var(--ink-600);">(${escapeHtml(row.color)})</span>` : ''}</td>
                  ${(() => {
                    const rowOrder = state.pendingOrders.find(o => o.orderId === row.pendingOrderId);
                    const rowFmt = row.sizeFormat || rowOrder?.sizeFormat || (resolveScaleKeysForBreakdown(row.sizes, row.sizeCodes).every(c => ['7', '8', '9', '10', '11'].includes(c)) ? 'LEGACY_7_11' : 'CATALOG');
                    const rowCodes = resolveScaleKeysForBreakdown(row.sizes, row.sizeCodes || rowOrder?.sizeCodes);
                    if (rowFmt === 'LEGACY_7_11') {
                      return `
                  <td class="text-center">${(row.sizes?.['7'] ?? 0).toLocaleString()}</td>
                  <td class="text-center">${(row.sizes?.['8'] ?? 0).toLocaleString()}</td>
                  <td class="text-center">${(row.sizes?.['9'] ?? 0).toLocaleString()}</td>
                  <td class="text-center">${(row.sizes?.['10'] ?? 0).toLocaleString()}</td>
                  <td class="text-center">${(row.sizes?.['11'] ?? 0).toLocaleString()}</td>`;
                    }
                    const badgeTxt = rowCodes
                      .filter(sz => Number(row.sizes?.[sz] || 0) > 0)
                      .map(sz => `${escapeHtml(sz)}:${Number(row.sizes?.[sz] || 0).toLocaleString()}`)
                      .join(' &middot; ') || '0';
                    return `<td colspan="5" class="text-center" style="font-size: 11px;"><span class="status-pill">${escapeHtml(rowFmt)}</span> ${badgeTxt}</td>`;
                  })()}
                  <td class="text-right font-bold">${row.rcvdPairs.toLocaleString()}</td>
                  <td class="text-center">
                    <span class="status-pill status-pill-neutral">
                      ${escapeHtml(row.status)}
                    </span>
                  </td>
                  <td class="text-center">
                    <span class="action-link" onclick="window.viewGrnRecord(${row.sr})">View</span> | 
                    <span class="action-link" onclick="window.editGrnRecord(${row.sr})">Edit</span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>

      <!-- Bottom Metric & Action Bar -->
      <footer class="portal-footer">
        <div class="footer-stats-left">
          <span>Total GRNs: <strong>${state.grnList.length}</strong></span>
          <span class="stat-divider">|</span>
          <span>Total Received: <strong>${sumRcvd.toLocaleString()} Pairs</strong></span>
          <span class="stat-divider">|</span>
          <span>Issued to Packing Hall: <strong>${totalIssuedPairs.toLocaleString()} Pairs</strong></span>
          <span class="stat-divider">|</span>
          <span>Available Stock${wip.parentOrderId ? ` (${wip.parentOrderId})` : ''}: <strong>${evalIssue.availablePairs.toLocaleString()} Pairs</strong></span>
        </div>
        <div class="footer-actions-right">
          <button class="btn-outline" id="btn-export-grn-excel">Excel export</button>
          <button class="btn-outline" id="btn-print-grn-summary">Print</button>
        </div>
      </footer>
    </main>
  `;
}
