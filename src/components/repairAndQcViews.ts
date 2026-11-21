import {
  getAlterationReqNumber,
  formatCurrentDateDDMMYYYY,
  escapeHtml,
  normalizeBaseReqNumber
} from '../utils/requisitionLogic';

export interface RepairAndQcStateShape {
  packingWip: Record<string, any>;
  pendingOrders?: Array<Record<string, any>>;
  dropdownOptions: {
    defectBatchIds: string[];
    articles: string[];
    poList: string[];
    [key: string]: any;
  };
  savedTailors: string[];
  repairForm: Record<string, any>;
  defectList: Array<Record<string, any>>;
  qcChecklist: Array<Record<string, any>>;
  qcOrder: Record<string, any>;
  cartons: Array<Record<string, any>>;
}

function resolveAlterationSelectionContext(
  state: RepairAndQcStateShape & { ordersWipMap?: Record<string, any> }
) {
  const showHistory = Boolean(state.repairForm?.showAllBatches);
  const defaultAReq = getAlterationReqNumber(state.packingWip.selectedBatch);
  const defectBatchIdsFromList = (state.defectList || []).map(d =>
    getAlterationReqNumber(d.reqNumber || d.id)
  );
  const wipAltBatches = Object.keys(state.ordersWipMap || {}).map(req => getAlterationReqNumber(req));
  const historyBatchOptions = Array.from(
    new Set([
      ...defectBatchIdsFromList,
      ...wipAltBatches,
      defaultAReq,
      ...(state.dropdownOptions?.defectBatchIds || [])
    ].filter(Boolean))
  );

  const hasPendingPairs = (altReqId: string): boolean => {
    const base = normalizeBaseReqNumber(altReqId);
    const matchingDefects = (state.defectList || []).filter(
      d => getAlterationReqNumber(d.reqNumber || d.id) === altReqId || normalizeBaseReqNumber(d.reqNumber || d.id) === base
    );
    if (matchingDefects.length > 0) {
      return matchingDefects.some(
        d => d.rawStatus === 'SENT_FOR_ALTERATION' || d.status === 'In Rework'
      );
    }
    const wipEntry = normalizeBaseReqNumber(state.packingWip?.selectedBatch) === base
      ? state.packingWip
      : state.ordersWipMap?.[base];
    return Math.max(0, Number(wipEntry?.inAlteration || 0) - Number(wipEntry?.scrappedPairs || 0)) > 0;
  };

  const activeBatchOptions = historyBatchOptions.filter(hasPendingPairs);
  const batchOptions = showHistory ? historyBatchOptions : activeBatchOptions;

  const preferredDefault = batchOptions[0] || '';
  const requestedBatch = String(state.repairForm?.batchId || '').trim();
  const selectedBatchId = batchOptions.includes(requestedBatch) ? requestedBatch : preferredDefault;
  const baseReq = normalizeBaseReqNumber(selectedBatchId);

  const batchDefects = (state.defectList || []).filter(
    d => getAlterationReqNumber(d.reqNumber || d.id) === selectedBatchId
      || normalizeBaseReqNumber(d.reqNumber || d.id) === baseReq
  );

  const wip = normalizeBaseReqNumber(state.packingWip?.selectedBatch) === baseReq
    ? state.packingWip
    : state.ordersWipMap?.[baseReq];
  const order = (state.pendingOrders || []).find(
    o => o.orderId && wip?.parentOrderId && o.orderId === wip.parentOrderId
  );

  const reqArticles: string[] = [];
  const pushArticle = (val: unknown) => {
    const clean = String(val || '').trim();
    if (clean && clean !== '---' && !reqArticles.includes(clean)) {
      reqArticles.push(clean);
    }
  };
  batchDefects.forEach(d => pushArticle(d.article));
  pushArticle(wip?.article);
  pushArticle(order?.article);

  const requestedArticle = String(state.repairForm?.article || '').trim();
  const selectedArticle = reqArticles.length === 1
    ? reqArticles[0]
    : (reqArticles.includes(requestedArticle) ? requestedArticle : (reqArticles[0] || ''));
  const articleLocked = reqArticles.length <= 1;

  const lockedPo = String(
    wip?.po
    || order?.po
    || batchDefects.find(d => d.po && d.po !== '---')?.po
    || baseReq
    || '---'
  ).trim();

  const matchingOrderForArticle = (state.pendingOrders || []).find(
    o => (o.orderId === wip?.parentOrderId || (o.po && o.po === lockedPo))
      && (!selectedArticle || o.article === selectedArticle)
  ) || order;
  const lockedColor = String(
    matchingOrderForArticle?.color
    || matchingOrderForArticle?.colour
    || wip?.color
    || batchDefects.find(d => d.color && d.color !== '---')?.color
    || 'Standard'
  ).trim();

  const openBatchDefects = batchDefects.filter(
    d => d.rawStatus === 'SENT_FOR_ALTERATION' || d.status === 'In Rework'
  );
  const openForArticle = reqArticles.length > 1 && selectedArticle
    ? openBatchDefects.filter(d => String(d.article || '').trim() === selectedArticle)
    : openBatchDefects;
  const defectQtySource = openForArticle.length > 0 ? openForArticle : openBatchDefects;
  const openDefectPairs = defectQtySource.reduce(
    (sum, d) => sum + (Number(d.pairsCount) || parseInt(String(d.qty || '0'), 10) || 0),
    0
  );
  const wipPendingPairs = Math.max(0, Number(wip?.inAlteration || 0) - Number(wip?.scrappedPairs || 0));
  const lockedQty = openDefectPairs > 0 ? openDefectPairs : wipPendingPairs;

  const defectReasonMap = new Map<string, number>();
  for (const d of defectQtySource) {
    const reason = String(d.defectClass || 'Workmanship Defect').trim();
    const prs = Number(d.pairsCount) || parseInt(String(d.qty || '0'), 10) || 0;
    defectReasonMap.set(reason, (defectReasonMap.get(reason) || 0) + prs);
  }
  const defectSummary = Array.from(defectReasonMap.entries()).map(([reason, prs]) => `${reason} (${prs})`);

  return {
    batchOptions,
    activeBatchOptions,
    historyBatchOptions,
    hasPendingPairs,
    selectedBatchId,
    baseReq,
    batchDefects,
    reqArticles,
    selectedArticle,
    articleLocked,
    lockedPo,
    lockedColor,
    lockedQty,
    defectSummary
  };
}

export function renderRepairScreen(state: RepairAndQcStateShape & { ordersWipMap?: Record<string, any> }): string {
  const ctx = resolveAlterationSelectionContext(state);
  const showHistory = Boolean(state.repairForm?.showAllBatches);
  const aReq = ctx.selectedBatchId || (showHistory ? getAlterationReqNumber(state.packingWip.selectedBatch) : 'No active requisition');
  const isCleared = Boolean(ctx.selectedBatchId) && ctx.lockedQty <= 0 && ctx.batchDefects.length > 0;
  const visibleDefects = showHistory ? state.defectList : ctx.batchDefects;
  const historyTotalCount = (state.defectList || []).filter(
    d => !(d.rawStatus === 'SENT_FOR_ALTERATION' || d.status === 'In Rework')
  ).length;
  const historyClockSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>`;
  const halls = Array.isArray(state.dropdownOptions?.halls) ? state.dropdownOptions.halls : [];
  const hallStitcherNames: string[] = [];
  for (const h of halls) {
    for (const s of (h.stitchers || [])) {
      const name = String(s.name || '').trim();
      if (name && !hallStitcherNames.some(existing => existing.toLowerCase() === name.toLowerCase())) {
        hallStitcherNames.push(name);
      }
    }
  }
  const extraSavedTailors = (state.savedTailors || []).filter(
    t => !hallStitcherNames.some(hs => hs.toLowerCase() === String(t || '').trim().toLowerCase())
  );
  const allTailorOptions = [...hallStitcherNames, ...extraSavedTailors];
  const savedTailorSelected = allTailorOptions.some(
    tailor => tailor.toLocaleLowerCase() === String(state.repairForm.tailor || '').toLocaleLowerCase()
  );

  const activeBenchDefects = visibleDefects.filter(
    d => d.rawStatus === 'SENT_FOR_ALTERATION' || d.status === 'In Rework'
  );
  const completedDefects = visibleDefects.filter(
    d => !(d.rawStatus === 'SENT_FOR_ALTERATION' || d.status === 'In Rework')
  );
  const rowPairs = (d: Record<string, any>): number =>
    Number(d.pairsCount) || parseInt(String(d.qty || '0'), 10) || 0;
  const activeBenchPairs = activeBenchDefects.reduce((sum, d) => sum + rowPairs(d), 0);
  const completedPairs = completedDefects.reduce((sum, d) => sum + rowPairs(d), 0);
  const totalLoggedPairs = ctx.batchDefects.reduce((sum, d) => sum + rowPairs(d), 0) || ctx.lockedQty;
  const totalScopePairs = visibleDefects.reduce((sum, d) => sum + rowPairs(d), 0);

  // Pareto breakdown across visible scope
  const paretoMap = new Map<string, { pairs: number; statusLabel: string; tailor: string }>();
  for (const d of visibleDefects) {
    const reason = String(d.defectClass || 'Workmanship Defect').trim();
    const prs = rowPairs(d);
    const isActive = d.rawStatus === 'SENT_FOR_ALTERATION' || d.status === 'In Rework';
    const existing = paretoMap.get(reason);
    if (existing) {
      existing.pairs += prs;
      if (isActive) {
        existing.statusLabel = 'In rework';
        existing.tailor = String(d.tailor || existing.tailor);
      }
    } else {
      paretoMap.set(reason, {
        pairs: prs,
        statusLabel: isActive ? 'In rework' : (d.status === 'Scrapped' ? 'Scrapped' : 'Returned to stage 1'),
        tailor: String(d.tailor || 'Supervisor A')
      });
    }
  }
  const paretoEntries = Array.from(paretoMap.entries())
    .sort((a, b) => b[1].pairs - a[1].pairs);

  const totalCompletedToday = (state.defectList || []).filter(d => d.status === 'Completed').length;
  const totalScrappedToday = (state.defectList || []).filter(d => d.status === 'Scrapped').length;
  const totalReworkedToday = totalCompletedToday + totalScrappedToday;

  const poLabel = ctx.lockedPo && ctx.lockedPo !== '---' ? ctx.lockedPo : 'not set';
  const colorLabel = ctx.lockedColor && ctx.lockedColor !== '---' ? ctx.lockedColor : 'not set';

  return `
    <main id="main-content" class="main-viewport" tabindex="-1">
      <div class="rep-shell">
        <!-- Header + Requisition Picker -->
        <header class="rep-header">
          <div>
            <div class="rep-title-row">
              <h1 class="rep-title">Alteration and repair bay 2</h1>
              <span class="rep-req-pill ${isCleared || (!ctx.selectedBatchId && !showHistory) ? 'is-cleared' : ''}">
                <span class="rep-req-dot ${isCleared || (!ctx.selectedBatchId && !showHistory) ? 'is-cleared' : ''}" aria-hidden="true"></span>
                ${isCleared ? `${escapeHtml(aReq)} &middot; Cleared` : (!ctx.selectedBatchId && !showHistory ? 'All active cleared' : escapeHtml(aReq))}
              </span>
            </div>
            <div class="rep-subtitle" id="defect-req-meta">
              ${ctx.articleLocked
                ? `<span id="defect-article" class="rep-locked-chip" data-locked="true" title="Locked to selected requisition">${escapeHtml(ctx.selectedArticle || 'No article')}</span>`
                : `<select id="defect-article" class="rep-inline-article-select" aria-label="Requisition article">${ctx.reqArticles.map(a => `<option value="${escapeHtml(a)}" ${ctx.selectedArticle === a ? 'selected' : ''}>${escapeHtml(a)}</option>`).join('')}</select>`}
              <span id="defect-po" class="rep-locked-chip" data-locked="true" title="Locked to selected requisition">PO ${escapeHtml(poLabel)}</span>
              <span id="defect-color" class="rep-locked-chip" data-locked="true" title="Locked to selected requisition">Colour ${escapeHtml(colorLabel)}</span>
              <span>&middot;</span>
              <span>${totalLoggedPairs} pairs logged by packing hall</span>
              <span>&middot;</span>
              <span>${formatCurrentDateDDMMYYYY()}</span>
            </div>
          </div>
          <div class="rep-header-controls">
            <button type="button" class="rep-history-btn ${showHistory ? 'is-active' : ''}" id="btn-repair-toggle-all" title="${showHistory ? 'Return to active requisitions only' : 'View previous completed & scrapped history'}">
              ${historyClockSvg}
              <span>${showHistory ? `Active (${ctx.activeBatchOptions.length})` : `History (${historyTotalCount})`}</span>
            </button>
            <div class="rep-req-picker">
              <label for="defect-batch-id">${showHistory ? 'All Requisitions' : 'Active Requisition'}</label>
              <select id="defect-batch-id">
                ${ctx.batchOptions.length === 0
                  ? '<option value="">-- All active cleared --</option>'
                  : ctx.batchOptions.map(b => {
                      const pending = ctx.hasPendingPairs(b);
                      const label = showHistory && !pending ? `${b} (Done)` : b;
                      return `<option value="${escapeHtml(b)}" ${ctx.selectedBatchId === b ? 'selected' : ''}>${escapeHtml(label)}</option>`;
                    }).join('')}
              </select>
            </div>
          </div>
        </header>

        <!-- Single-Floor Tailor Assignment Bar -->
        <section class="rep-card">
          <div class="rep-assign-bar">
            <div class="rep-field">
              <label for="defect-tailor-select">Tailor</label>
              <div class="rep-tailor-wrap">
                <select id="defect-tailor-select" aria-label="Select saved tailor">
                  <option value="__custom__" ${savedTailorSelected ? '' : 'selected'}>Custom tailor</option>
                  ${halls
                    .filter(h => Array.isArray(h.stitchers) && h.stitchers.length > 0)
                    .map(h => `
                      <optgroup label="${escapeHtml(h.name)} Stitchers">
                        ${h.stitchers.map((s: any) => `<option value="${escapeHtml(s.name)}" ${String(state.repairForm.tailor || '').toLocaleLowerCase() === String(s.name || '').toLocaleLowerCase() ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
                      </optgroup>
                    `).join('')}
                  ${extraSavedTailors.length > 0 ? `
                    <optgroup label="Saved Tailors">
                      ${extraSavedTailors.map(tailor => `<option value="${escapeHtml(tailor)}" ${String(state.repairForm.tailor || '').toLocaleLowerCase() === tailor.toLocaleLowerCase() ? 'selected' : ''}>${escapeHtml(tailor)}</option>`).join('')}
                    </optgroup>
                  ` : ''}
                </select>
                <input type="text" id="defect-tailor" placeholder="Custom tailor name" value="${savedTailorSelected ? '' : escapeHtml(state.repairForm.tailor)}" />
              </div>
            </div>

            <div class="rep-field">
              <label for="defect-qty">Pairs</label>
              <div class="rep-pairs-wrap">
                <input type="number" id="defect-qty" min="1" max="${ctx.lockedQty}" value="${ctx.lockedQty}" ${ctx.lockedQty <= 0 ? 'disabled' : ''} />
                <button type="button" class="rep-max-btn" id="btn-repair-max-qty" data-max-qty="${ctx.lockedQty}" ${ctx.lockedQty <= 0 ? 'disabled' : ''}>Max</button>
              </div>
            </div>

            <button type="button" class="rep-assign-cta" id="btn-assign-tailor" ${ctx.lockedQty <= 0 ? 'disabled' : ''}>Assign tailor</button>
            <span class="rep-pending-note">${ctx.lockedQty} pairs pending</span>
          </div>
        </section>

        <!-- Side-by-Side Single Floor: In Rework (Left) | Returned and Scrap (Right) -->
        <div class="rep-split-grid">
          <section class="rep-card" id="repair-active-bench-panel">
            <div class="rep-card-head">
              <div>
                <span class="rep-card-title">In rework</span>
                <span class="rep-card-meta">${activeBenchDefects.length} ${activeBenchDefects.length === 1 ? 'batch' : 'batches'} &middot; ${activeBenchPairs} pairs</span>
              </div>
              <span class="rep-card-note">Returned pairs go to stage 1, checking and inspection</span>
            </div>
            <div class="table-responsive">
              <table class="rep-table">
                <thead>
                  <tr>
                    <th>Tailor</th>
                    <th>Defect</th>
                    <th>Pairs</th>
                    <th style="text-align: right;">Process</th>
                  </tr>
                </thead>
                <tbody>
                  ${activeBenchDefects.length === 0 ? `
                    <tr>
                      <td colspan="4" style="text-align: center; padding: 24px 14px; color: var(--ink-500);">
                        No pairs currently in rework${showHistory ? '' : (ctx.selectedBatchId ? ` for ${escapeHtml(aReq)}` : ' — all active requisitions cleared')}.
                      </td>
                    </tr>
                  ` : activeBenchDefects.map(defect => {
                    const prs = rowPairs(defect);
                    return `
                      <tr>
                        <td style="font-weight: 500; white-space: nowrap;">${escapeHtml(defect.tailor || 'Unassigned')}</td>
                        <td>
                          <span>${escapeHtml(defect.defectClass)}</span>
                          <span class="rep-subline">${escapeHtml(defect.origin)}${showHistory ? ` &middot; ${escapeHtml(defect.id)}` : ''}</span>
                        </td>
                        <td style="font-weight: 600; white-space: nowrap;">${prs}</td>
                        <td style="text-align: right; white-space: nowrap;">
                          ${defect.altId
                            ? `<div class="rep-row-actions">
                                <input type="number" class="rep-row-qty" data-alt-qty-id="${defect.altId}" min="1" max="${prs}" value="${prs}" aria-label="Pairs to process for ${escapeHtml(defect.defectClass)}" />
                                <button type="button" class="rep-row-return" data-alt-row-return="${defect.altId}" data-alt-tailor="${escapeHtml(defect.tailor || 'Supervisor A')}" data-alt-req="${escapeHtml(defect.id)}">Return</button>
                                <button type="button" class="rep-row-scrap" data-alt-row-scrap="${defect.altId}" data-alt-tailor="${escapeHtml(defect.tailor || 'Scrap Authority')}" data-alt-req="${escapeHtml(defect.id)}">Scrap</button>
                                <button type="button" class="rep-row-print" data-alt-row-print="${defect.altId}" data-alt-tailor="${escapeHtml(defect.tailor || 'Supervisor A')}" data-alt-req="${escapeHtml(defect.id)}" data-alt-defect="${escapeHtml(defect.defectClass)}" data-alt-pairs="${prs}" title="Print Defect Route Tag" aria-label="Print Defect Route Tag">&#128424;</button>
                              </div>`
                            : `<span style="font-size: 11.5px; color: var(--ink-500);">Pending</span>`}
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </section>

          <section class="rep-card" id="repair-completed-ledger-panel">
            <div class="rep-card-head">
              <div>
                <span class="rep-card-title">Returned and scrap</span>
                <span class="rep-card-meta">${completedDefects.length} ${completedDefects.length === 1 ? 'record' : 'records'} &middot; ${completedPairs} pairs</span>
              </div>
            </div>
            <div class="table-responsive">
              <table class="rep-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Defect</th>
                    <th>Pairs</th>
                    <th>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  ${completedDefects.length === 0 ? `
                    <tr>
                      <td colspan="4" style="text-align: center; padding: 24px 14px; color: var(--ink-500);">
                        No returned or scrapped records yet.
                      </td>
                    </tr>
                  ` : completedDefects.map(defect => {
                    const prs = rowPairs(defect);
                    const isScrapped = defect.status === 'Scrapped';
                    return `
                      <tr>
                        <td style="white-space: nowrap;">${escapeHtml(defect.date)}</td>
                        <td>
                          <span>${escapeHtml(defect.defectClass)}</span>
                          ${showHistory ? `<span class="rep-subline">${escapeHtml(defect.id)}</span>` : ''}
                        </td>
                        <td style="font-weight: 600; white-space: nowrap;">${prs}</td>
                        <td>
                          <span>
                            <span class="${isScrapped ? 'rep-outcome-scrap' : 'rep-outcome-ok'}">${isScrapped ? '&times;' : '&#10003;'}</span>
                            ${isScrapped ? 'Scrapped' : 'Returned to stage 1'}
                          </span>
                          <span class="rep-subline">${escapeHtml(defect.tailor)} &middot; ${isScrapped ? 'Contractor debit' : 'Verified'}</span>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <!-- Defect Types Breakdown Card -->
        <section class="rep-card">
          <div class="rep-pareto-head">
            <div>
              <span class="rep-card-title">Defect types</span>
              <span class="rep-card-meta">share of ${totalScopePairs} pairs</span>
            </div>
            <div class="rep-pareto-actions">
              <button type="button" class="btn-outline" id="btn-export-pareto">Export Pareto CSV</button>
              <button type="button" class="btn-outline" id="btn-print-defect-sheet">Print defect summary</button>
            </div>
          </div>
          ${paretoEntries.length === 0 ? `
            <p style="margin: 0; padding: 0 16px 16px; font-size: 12.5px; color: var(--ink-500);">No defect distribution to display.</p>
          ` : `
            <div class="rep-pareto-grid">
              ${paretoEntries.slice(0, 6).map(([reason, info], idx) => {
                const pct = totalScopePairs > 0 ? Math.round((info.pairs / totalScopePairs) * 100) : 0;
                return `
                  <div class="rep-pareto-item ${idx === 0 ? 'is-lead' : ''}">
                    <div class="rep-pareto-top">
                      <span style="font-weight: 500;">${escapeHtml(reason)}</span>
                      <span style="font-weight: 600;">${info.pairs}</span>
                    </div>
                    <div class="rep-pareto-track">
                      <div class="rep-pareto-fill" style="width: ${pct}%;"></div>
                    </div>
                    <div class="rep-pareto-sub">
                      <span>${escapeHtml(info.statusLabel)} &middot; ${escapeHtml(info.tailor)}</span>
                      <span>${pct}%</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </section>

        <!-- Quiet Footer Line -->
        <footer class="rep-footer-line">
          Today in the bay: ${totalReworkedToday} batches reworked &middot; ${totalCompletedToday} returned to stage 1 &middot; ${totalScrappedToday} scrapped
        </footer>
      </div>
    </main>
  `;
}

export function renderQcScreen(state: RepairAndQcStateShape): string {
  const allPassed = state.qcChecklist.every(c => c.passed);
  const baseReq = normalizeBaseReqNumber(state.packingWip.selectedBatch);

  return `
    <div class="sub-header-bar">
      <h1 class="sub-header-title">
        Final Inspection &amp; Master Carton Clearance (Dock #4)
      </h1>
      <div class="sub-header-right">
        <span class="system-date-label">Date: ${formatCurrentDateDDMMYYYY()}</span>
      </div>
    </div>

    <main id="main-content" class="main-viewport" tabindex="-1">
      <!-- Order Summary Card (No Buyer, No Mockup Fallbacks) -->
      <section class="order-summary-card">
        <div class="order-summary-top">
          <div class="order-metadata-group">
            <span>Requisition #: <strong>${baseReq}</strong></span>
            <span class="stat-divider">|</span>
            <span>PO Number: <strong>${state.qcOrder.po || state.packingWip.po || '---'}</strong></span>
            <span class="stat-divider">|</span>
            <span>Article: <strong>${state.qcOrder.article || state.packingWip.article || '---'}</strong></span>
            <span class="stat-divider">|</span>
            <span>Order Total: <strong>${state.qcOrder.orderTotal || (state.packingWip.plannedQty ? `${state.packingWip.plannedQty.toLocaleString()} Pairs` : '0 Pairs')}</strong></span>
          </div>
          <div>
            <span class="badge-aql-passed" style="background-color: ${allPassed ? 'var(--ink-950)' : 'var(--ink-500)'};">
              ${allPassed ? 'AQL PASSED - APPROVED FOR EXPORT' : 'INSPECTION PENDING'}
            </span>
          </div>
        </div>
        <div class="order-summary-bottom">
          <span>This Lot: <strong>${state.cartons.length} Cartons</strong></span>
          <span class="stat-divider">|</span>
          <span>Net Weight: <strong>${state.qcOrder.netWt} kg</strong></span>
          <span class="stat-divider">|</span>
          <span>Gross Weight: <strong>${state.qcOrder.grossWt} kg</strong></span>
          <span class="stat-divider">|</span>
          <span>Standard: <strong>AQL 1.5 Normal Single Sampling (Sample Size: 80 Pairs)</strong></span>
        </div>
      </section>

      <!-- 2-Column Split: Checklist Left, Master Manifest Right -->
      <div class="qc-split-grid">
        <!-- Checklist -->
        <section class="panel-card">
          <div class="panel-card-header">
            <span class="panel-card-title">AQL 1.5 Inspection Checklist</span>
          </div>
          <div class="checklist-container">
            ${state.qcChecklist.map(item => `
              <div class="checklist-item">
                <button type="button" class="checklist-box" aria-label="${escapeHtml(item.title)}"
                  aria-pressed="${item.passed}" onclick="window.toggleQcCheck('${item.id}')"
                  style="background-color: ${item.passed ? 'var(--ink-950)' : 'var(--ink-400)'};">
                  ✓
                </button>
                <div class="checklist-content">
                  <span class="checklist-title">${item.title}</span>
                  ${item.details ? `<span class="${item.passed ? 'checklist-status-pass' : ''}" style="font-size: 11.5px; color: ${item.passed ? 'var(--ink-950)' : 'var(--ink-500)'};">${item.details} ${item.passed ? '— PASS' : ''}</span>` : ''}
                </div>
              </div>
            `).join('')}

            <div class="inspector-stamp-card">
              <div class="stamp-badge-icon" style="background-color: ${allPassed ? 'var(--ink-950)' : 'var(--ink-400)'};">✓</div>
              <div>
                <div class="stamp-text-title">${allPassed ? 'Approved by QA Inspector Tariq Mehmood' : 'Pending Final QA Inspection Sign-off'}</div>
                <div class="stamp-text-sub">(QC ID: ${allPassed ? '4402' : '---'})</div>
              </div>
            </div>
          </div>
        </section>

        <!-- Manifest Table -->
        <section class="panel-card">
          <div class="panel-card-header">
            <span class="panel-card-title">Master Shipping Carton Manifest</span>
          </div>
          <div class="table-responsive" style="max-height: 380px; overflow-y: auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Carton #</th>
                  <th class="text-right">Pairs / Ctn</th>
                  <th class="text-right">Net Wt</th>
                  <th class="text-right">Gross Wt</th>
                  <th>Dimensions (cm)</th>
                  <th class="text-center">Barcode Verified</th>
                  <th>QC Seal #</th>
                  <th class="text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                ${state.cartons.length === 0 ? `
                  <tr>
                    <td colspan="8" class="text-center" style="padding: 28px 16px; color: var(--ink-500);">
                      No cartons loaded in manifest.
                    </td>
                  </tr>
                ` : state.cartons.map(c => `
                  <tr>
                    <td class="font-bold">${c.cartonNo}</td>
                    <td class="text-right font-bold">${c.pairs}</td>
                    <td class="text-right font-bold">${c.netWt}</td>
                    <td class="text-right font-bold">${c.grossWt}</td>
                    <td>${c.dims}</td>
                    <td class="text-center">
                      <span class="status-pill status-pill-green">Verified ✓</span>
                    </td>
                    <td class="font-bold">${c.sealNo}</td>
                    <td class="text-center">
                      <span class="status-pill status-pill-green">${c.status}</span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <!-- Bottom Dispatch Footer -->
      <footer class="portal-footer">
        <div class="footer-stats-left">
          <span>Manifest Cleared: <strong>${state.cartons.length} of ${state.cartons.length} Cartons</strong></span>
          <span class="stat-divider">|</span>
          <span>Total Pairs: <strong>${state.cartons.reduce((acc, c) => acc + c.pairs, 0)}</strong></span>
          <span class="stat-divider">|</span>
          <span>Total Volume: <strong>${state.cartons.length > 0 ? '2.35 CBM' : '0.00 CBM'}</strong></span>
          <span class="stat-divider">|</span>
          <span>Container: <strong>${state.qcOrder.container}</strong></span>
        </div>
        <div class="footer-actions-right">
          <button class="btn-outline" id="btn-open-aql-calculator">AQL 1.5 Calculator</button>
          <button class="btn-outline" id="btn-print-carton-labels">Print Carton Labels</button>
          <button class="btn-outline" id="btn-export-packing-list">Export Packing List</button>
          <button class="btn-primary" id="btn-dispatch-gate">Release &amp; Dispatch</button>
        </div>
      </footer>
    </main>
  `;
}
