import {
  OrderWipState,
  PendingOrder,
  buildRequisitionAnalyticsSeries,
  determineOrderActiveStage,
  getAlterationReqNumber,
  isMaterialRequisitionIssuedForStage4,
  isPackingAwaitingFinalQc,
  isStage3ClearedForMaterialReq,
  isStage5ReadyForCartons,
  normalizeBaseReqNumber,
  renderRequisitionWipAnalyticsChart,
  formatCurrentDateDDMMYYYY
} from '../utils/requisitionLogic';

export type RollupSummaryParam = Parameters<typeof buildRequisitionAnalyticsSeries>[0];

export interface PackingHallDefectRow {
  id: string;
  origin: string;
  defectClass: string;
  qty: string;
  status: string;
}

export interface PackingHallCartonRow {
  cartonNo: string;
  pairs: number;
  grossWt: string;
  status: string;
  barcodeVerified: boolean;
  sealNo: string;
}

export interface PackingHallViewParams {
  wip: OrderWipState & {
    selectedBatch: string;
    mreqQty: string;
    stage5Pending?: string;
    lineEfficiency: string;
    outputPairs: number;
    outputCartons: number;
    inAlteration: number;
  };
  defaultReqNumber: string;
  ordersWipMap: Record<string, any>;
  persistedReqNumbers: string[];
  pendingOrders: PendingOrder[];
  defectList: PackingHallDefectRow[];
  cartons: PackingHallCartonRow[];
  rollupSummary: RollupSummaryParam;
  getOrderAvailableDockPairs: (orderId: string) => number;
  remainingStagePairs: (input: number, passed: number, defects: number) => number;
  escapeHtml: (value: string) => string;
  isInitialSyncing?: boolean;
  isManualSync?: boolean;
  syncError?: string;
}

export function renderPackingHallScreen(params: PackingHallViewParams): string {
  const {
    wip,
    defaultReqNumber,
    ordersWipMap,
    persistedReqNumbers,
    pendingOrders,
    defectList,
    cartons,
    rollupSummary,
    getOrderAvailableDockPairs,
    remainingStagePairs,
    escapeHtml,
    isInitialSyncing = false,
    isManualSync = false,
    syncError = ''
  } = params;

  const baseReq = normalizeBaseReqNumber(wip.selectedBatch);
  const aReq = getAlterationReqNumber(baseReq);
  const scopedDefects = defectList.filter(d => d.id === aReq || d.id === baseReq);
  const activeAlts = scopedDefects.filter(d => d.status === 'In Rework' || d.status === 'In Washing' || d.status === 'In Sorting');
  const awaitingFinalQc = isPackingAwaitingFinalQc(wip);
  const stage5Ready = isStage5ReadyForCartons(wip);
  const awaitingInwardIssue = wip.issueStatus !== 'Issued by Inward Register' && wip.stage1In <= 0;
  const stage3Cleared = isStage3ClearedForMaterialReq(wip);
  const mreqIssuedForStage4 = isMaterialRequisitionIssuedForStage4(wip);
  const parentRollup = wip.parentOrderId
    ? rollupSummary.orderRollups.find(o => o.orderId === wip.parentOrderId)
    : undefined;
  const countdown = parentRollup?.deliveryCountdown;

  return `
    <div class="sub-header-bar">
      <h1 class="sub-header-title">
        Packing Hall Floor &mdash; 5-Stage WIP Flow &amp; Requisition Slip Generator
      </h1>
      <div class="sub-header-right">
        <span class="system-date-label">Date: ${formatCurrentDateDDMMYYYY()}</span>
      </div>
    </div>

    <main id="main-content" class="main-viewport" tabindex="-1">
      ${syncError ? `
        <div class="packing-sync-banner is-error" role="alert" data-testid="packing-sync-error">
          <span>${escapeHtml(syncError)}</span>
          <button type="button" class="btn-outline" id="btn-wip-sync-retry">Retry Sync</button>
        </div>
      ` : (isInitialSyncing || isManualSync ? `
        <div class="packing-sync-banner" role="status" aria-live="polite" data-testid="packing-sync-loading">
          <span>Synchronizing Packing Hall data with MES server&hellip;</span>
        </div>
      ` : '')}

      <!-- Active Order Toolbar (Single Requisition with M- and A- Prefixes, No Buyer) -->
      <section class="form-card">
        <div class="packing-toolbar-grid">
          <div class="form-group" style="flex: 1.4; min-width: 190px;">
            <label for="wip-batch-select">Active Requisition / Order #</label>
            <select id="wip-batch-select" class="form-select" style="font-weight: 700;">
              ${(() => {
                const knownReqs = Array.from(new Set([
                  baseReq,
                  defaultReqNumber,
                  ...Object.keys(ordersWipMap)
                ]));
                return knownReqs.map(r => {
                  const item = ordersWipMap[r] || (r === baseReq ? wip : null);
                  const art = item?.article || (r === baseReq ? wip.article : '');
                  const stage = item ? determineOrderActiveStage(item) : 'STEP_1';
                  const isEmptyPlaceholder =
                    r === defaultReqNumber &&
                    !persistedReqNumbers.includes(r) &&
                    !item?.parentOrderId &&
                    Number(item?.plannedQty || 0) === 0;
                  const stageLabel = isPackingAwaitingFinalQc(item || {})
                    ? 'Awaiting Final QC'
                    : stage === 'STEP_1' ? 'Stage 1 (Checking)'
                    : stage === 'STEP_2' ? 'Stage 2 (Ironing)'
                    : stage === 'STEP_3' ? 'Stage 3 (Matching)'
                    : stage === 'STEP_4' ? 'Stage 4 (1st Pkg)'
                    : stage === 'STEP_5' ? 'Stage 5 (Cartons)'
                    : 'Completed';
                  const label = isEmptyPlaceholder
                    ? 'No active requisition — choose a master order below'
                    : `${r}${art ? ` — ${art}` : ''} [${stageLabel}]`;
                  return `<option value="${escapeHtml(r)}" ${r === baseReq ? 'selected' : ''}>${escapeHtml(label)}</option>`;
                }).join('') + (pendingOrders.length > 0
                  ? `<optgroup label="Master Orders — create requisition">${pendingOrders.map(order =>
                    `<option value="ORDER:${escapeHtml(order.orderId)}">Load ${escapeHtml(order.orderId)} — ${escapeHtml(order.article)} (${Number(order.totalQty || 0).toLocaleString()} pairs)</option>`
                  ).join('')}</optgroup>`
                  : '');
              })()}
            </select>
          </div>
          <div class="form-group" style="flex: 1; min-width: 110px;">
            <span class="field-label" style="font-size: 11px; font-weight: 700; color: var(--ink-500); text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 4px; display: block;">Article</span>
            <div id="wip-disp-article" style="font-weight: 700; color: var(--ink-950); padding: 7px 0; font-size: 13px;">${wip.article || '---'}</div>
          </div>
          <div class="form-group" style="flex: 0.9; min-width: 100px;">
            <span class="field-label" style="font-size: 11px; font-weight: 700; color: var(--ink-500); text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 4px; display: block;">Asking Qty</span>
            <div id="wip-disp-qty" style="font-weight: 700; color: var(--ink-950); padding: 7px 0; font-size: 13px;">${wip.plannedQty.toLocaleString()} Pairs</div>
          </div>
          <div class="form-group" style="flex: 1.1; min-width: 140px;">
            <span class="field-label" style="font-size: 11px; font-weight: 700; color: var(--ink-500); text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 4px; display: block;">Inward Issue Status</span>
            <div style="padding: 5px 0;">
              <span class="status-pill ${wip.issueStatus === 'Issued by Inward Register' ? 'status-pill-green' : 'status-pill-amber'}" id="wip-disp-issue-status">${wip.issueStatus}</span>
            </div>
          </div>
          ${countdown?.hasDueDate ? `
          <div class="form-group" style="flex: 0.9; min-width: 120px;">
            <span class="field-label" style="font-size: 11px; font-weight: 700; color: var(--ink-500); text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 4px; display: block;">Delivery Timeline</span>
            <div style="padding: 5px 0;">
              <span class="status-pill" id="wip-disp-countdown" title="Due Date: ${escapeHtml(countdown.dueDate)}">${escapeHtml(countdown.badgeText)}</span>
            </div>
          </div>
          ` : ''}
          <div class="packing-toolbar-actions">
            <button type="button" class="btn-primary" id="btn-wip-new-req" ${pendingOrders.length === 0 ? 'disabled title="A pending master order is needed first."' : ''}>+ Generate Requisition</button>
          </div>
        </div>
      </section>

      <!-- 5-Stage WIP Floor Process Pipeline -->
      <section>
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
          <h2 style="font-size: 12.5px; font-weight: 700; color: var(--ink-950); text-transform: uppercase; letter-spacing: 0.04em; margin: 0;">
            5-Stage WIP Floor Process Pipeline
          </h2>
          <span style="font-size: 11.5px; color: var(--ink-500);">Active Requisition: <strong>${baseReq}</strong></span>
        </div>

        ${awaitingInwardIssue ? `
          <div style="margin-bottom: 10px; padding: 8px 12px; background: var(--ink-50); border: 1px solid var(--border-strong); border-radius: 4px; font-size: 12px; color: var(--ink-900);">
            <strong>Pending Inward Issue:</strong> <strong>${baseReq}</strong> (${wip.plannedQty.toLocaleString()} Prs requested) has <strong>0 pairs</strong> issued from Inward Goods Receiving yet${wip.parentOrderId ? ` (${wip.parentOrderId} Dock Available: ${getOrderAvailableDockPairs(wip.parentOrderId).toLocaleString()} Prs)` : ''}. Issue this requisition in Inward Goods Receiving before starting Stage 1.
          </div>
        ` : ''}

        ${awaitingFinalQc ? `
          <div class="packing-qc-notice" data-testid="wip-awaiting-qc-banner">
            <div>
              <strong>Stage 4 Complete &mdash; Awaiting Final QC (AQL 1.5 Inspection):</strong>
              All <strong>${wip.stage4Passed.toLocaleString()}</strong> pairs in <strong>${baseReq}</strong> are polybagged. Complete Final Inspection &amp; Master Carton Clearance before sealing cartons in Stage 5.
            </div>
            <button type="button" class="btn-primary" id="btn-wip-open-qc-banner">Go to Final Inspection &rarr;</button>
          </div>
        ` : ''}

        ${(() => {
          const activeStage = determineOrderActiveStage(wip);
          const stage1Rem = remainingStagePairs(wip.stage1In, wip.stage1Passed, wip.stage1Defects);
          const stage2Rem = remainingStagePairs(wip.stage2In, wip.stage2Passed, wip.stage2Defects);
          const stage3Rem = remainingStagePairs(wip.stage3In, wip.stage3Passed, wip.stage3Defects);
          return `
        <div class="packing-pipeline-grid">
          <!-- STAGE 1: Checking / Inspection -->
          <div class="pipeline-stage-card ${activeStage === 'STEP_1' ? 'stage-active' : ''}">
            <div>
              <div class="pipeline-stage-header">
                <span>Stage 1: Checking</span>
                ${activeStage === 'STEP_1' ? '<span class="stage-active-badge">Active</span>' : ''}
              </div>
              <div class="pipeline-stage-metric"><span>Available In:</span> <strong id="wip-stg1-in">${stage1Rem.toLocaleString()}</strong></div>
              <div class="pipeline-stage-metric"><span>Passed:</span> <strong id="wip-stg1-passed">${wip.stage1Passed.toLocaleString()}</strong></div>
              <div class="pipeline-stage-metric"><span>Defects:</span> <strong id="wip-stg1-defects">${wip.stage1Defects.toLocaleString()}</strong></div>
            </div>
            <button type="button" class="${activeStage === 'STEP_1' ? 'btn-primary' : 'btn-outline'}" style="width: 100%; margin-top: 10px; font-size: 12px; padding: 6px; justify-content: center;" id="btn-wip-step1" ${awaitingInwardIssue || stage1Rem <= 0 ? 'disabled' : ''}>
              ${stage1Rem <= 0 && wip.stage1Passed > 0 ? 'Stage 1 Complete' : 'Process Stage 1'}
            </button>
          </div>

          <!-- STAGE 2: Ironing & Brushing -->
          <div class="pipeline-stage-card ${activeStage === 'STEP_2' ? 'stage-active' : ''}">
            <div>
              <div class="pipeline-stage-header">
                <span>Stage 2: Ironing</span>
                ${activeStage === 'STEP_2' ? '<span class="stage-active-badge">Active</span>' : ''}
              </div>
              <div class="pipeline-stage-metric"><span>Available In:</span> <strong id="wip-stg2-in">${stage2Rem.toLocaleString()}</strong></div>
              <div class="pipeline-stage-metric"><span>Passed:</span> <strong id="wip-stg2-passed">${wip.stage2Passed.toLocaleString()}</strong></div>
              <div class="pipeline-stage-metric"><span>Defects:</span> <strong id="wip-stg2-defects">${wip.stage2Defects.toLocaleString()}</strong></div>
            </div>
            <button type="button" class="${activeStage === 'STEP_2' ? 'btn-primary' : 'btn-outline'}" style="width: 100%; margin-top: 10px; font-size: 12px; padding: 6px; justify-content: center;" id="btn-wip-step2" ${stage2Rem <= 0 ? 'disabled' : ''}>
              ${stage2Rem <= 0 && wip.stage2Passed > 0 ? 'Stage 2 Complete' : 'Process Stage 2'}
            </button>
          </div>

          <!-- STAGE 3: Pair Matching -->
          <div class="pipeline-stage-card ${activeStage === 'STEP_3' ? 'stage-active' : ''}">
            <div>
              <div class="pipeline-stage-header">
                <span>Stage 3: Matching</span>
                ${activeStage === 'STEP_3' ? '<span class="stage-active-badge">Active</span>' : ''}
              </div>
              <div class="pipeline-stage-metric"><span>Available In:</span> <strong id="wip-stg3-in">${stage3Rem.toLocaleString()}</strong></div>
              <div class="pipeline-stage-metric"><span>Matched:</span> <strong id="wip-stg3-passed">${wip.stage3Passed.toLocaleString()} Prs</strong></div>
              <div class="pipeline-stage-metric"><span>Defects:</span> <strong id="wip-stg3-defects">${wip.stage3Defects.toLocaleString()}</strong></div>
            </div>
            <button type="button" class="${activeStage === 'STEP_3' ? 'btn-primary' : 'btn-outline'}" style="width: 100%; margin-top: 10px; font-size: 12px; padding: 6px; justify-content: center;" id="btn-wip-step3" ${stage3Rem <= 0 ? 'disabled' : ''}>
              ${stage3Rem <= 0 && wip.stage3Passed > 0 ? 'Stage 3 Complete' : 'Process Stage 3'}
            </button>
          </div>

          <!-- MATERIAL REQUISITION SLIP GENERATOR (STAGE-3 GATED) -->
          <div class="pipeline-stage-card ${stage3Cleared && !mreqIssuedForStage4 ? 'stage-active' : ''}" style="background: var(--ink-50); border-style: dashed;">
            <div>
              <div class="pipeline-stage-header">
                <span>Material Requisition</span>
                ${!stage3Cleared
                  ? '<span class="status-pill" style="font-size: 10.5px;">Clear Stage 3</span>'
                  : (mreqIssuedForStage4 ? '<span class="status-pill" style="font-size: 10.5px;">Issued</span>' : '<span class="stage-active-badge">Ready</span>')}
              </div>
              <div class="pipeline-stage-metric"><span>Requisition:</span> <strong id="wip-mreq-no">${baseReq}</strong></div>
              <div class="pipeline-stage-metric"><span>Sets:</span> <strong id="wip-mreq-qty">${wip.stage3Passed.toLocaleString()} Sets</strong></div>
              <div class="pipeline-stage-metric"><span>Article:</span> <strong>${wip.article || '---'}</strong></div>
            </div>
            <div style="display: flex; gap: 8px; margin-top: 10px;">
              <button type="button" class="btn-outline" style="flex: 1; justify-content: center;" id="btn-wip-generate-mreq-slip" ${stage3Cleared ? '' : 'disabled title="Complete Stage 3 (Pair Matching) first."'}>Generate Slip</button>
              <button type="button" class="btn-primary" style="flex: 1; justify-content: center;" id="btn-wip-print-mreq-slip" ${stage3Cleared ? '' : 'disabled title="Complete Stage 3 (Pair Matching) first."'}>Print Slip</button>
            </div>
          </div>

          <!-- STAGE 4: 1st Packing -->
          <div class="pipeline-stage-card ${activeStage === 'STEP_4' && mreqIssuedForStage4 ? 'stage-active' : ''}">
            <div>
              <div class="pipeline-stage-header">
                <span>Stage 4: 1st Packing</span>
                ${awaitingFinalQc
                  ? '<span class="stage-active-badge">Awaiting QC</span>'
                  : (!mreqIssuedForStage4
                    ? '<span class="status-pill" style="font-size: 10.5px;">Await Mat. Req</span>'
                    : (activeStage === 'STEP_4' ? '<span class="stage-active-badge">Active</span>' : ''))}
              </div>
              <div class="pipeline-stage-metric"><span>Polybag In:</span> <strong id="wip-stg4-in">${wip.stage4In.toLocaleString()} prs</strong></div>
              <div class="pipeline-stage-metric"><span>Packaged:</span> <strong id="wip-stg4-passed">${wip.stage4Passed.toLocaleString()} Prs</strong></div>
              <div class="pipeline-stage-metric"><span>Pending:</span> <strong id="wip-stg4-pending">${wip.stage4Pending}</strong></div>
            </div>
            <button type="button" class="${activeStage === 'STEP_4' && mreqIssuedForStage4 && !awaitingFinalQc ? 'btn-primary' : 'btn-outline'}" style="width: 100%; margin-top: 10px; font-size: 12px; padding: 6px; justify-content: center;" id="btn-wip-step4" ${!mreqIssuedForStage4 || awaitingFinalQc || wip.stage4Pending <= 0 ? 'disabled' : ''}>
              ${awaitingFinalQc || stage5Ready || (wip.stage4Passed > 0 && wip.stage4Pending === 0) ? '1st Packing Complete' : 'Record 1st Packing'}
            </button>
          </div>

          <!-- STAGE 5: 2nd Packing -->
          <div class="pipeline-stage-card ${activeStage === 'STEP_5' ? 'stage-active' : ''}">
            <div>
              <div class="pipeline-stage-header">
                <span>Stage 5: Master Cartons</span>
                ${awaitingFinalQc
                  ? '<span class="status-pill" style="font-size: 10.5px;">Locked (Await AQL 1.5)</span>'
                  : (activeStage === 'STEP_5' ? '<span class="stage-active-badge">Active</span>' : '')}
              </div>
              <div class="pipeline-stage-metric"><span>Spec:</span> <strong>30 Prs / Ctn</strong></div>
              <div class="pipeline-stage-metric"><span>Packed:</span> <strong id="wip-stg5-cartons">${wip.stage5Cartons || '0 Cartons (0 Prs)'}</strong></div>
              <div class="pipeline-stage-metric"><span>Pending:</span> <strong>${wip.stage5Pending || '0 Cartons'}</strong></div>
            </div>
            <button type="button" class="${activeStage === 'STEP_5' ? 'btn-primary' : 'btn-outline'}" style="width: 100%; margin-top: 10px; font-size: 12px; padding: 6px; justify-content: center;" id="btn-wip-step5">
              Box &amp; Seal Cartons
            </button>
          </div>
        </div>
        `;
        })()}
      </section>

      <!-- Real-Time WIP Analytics Dashboard (Planned Demand vs. Actual Packed Pairs per Active Requisition) -->
      ${(() => {
        const series = buildRequisitionAnalyticsSeries(rollupSummary, baseReq);
        return renderRequisitionWipAnalyticsChart({
          series,
          activeWipSizes: wip.sizes,
          activeSizeFormat: (wip as any).sizeFormat,
          activeSizeCodes: (wip as any).sizeCodes,
          activeReqNumber: baseReq,
          activePlannedQty: wip.plannedQty,
          activeStage4Packed: wip.stage4Passed,
          activeStage5Packed: wip.outputPairs,
          mode: 'packing-hall'
        });
      })()}

      <!-- Split Enterprise Data Grids -->
      <section class="two-column-grid">
        <!-- LEFT: Active Alteration / Rework Loop -->
        <div class="panel-card">
          <div class="panel-card-header">
            <h2 class="panel-card-title" style="margin: 0;">Active Alteration / Repair Loop</h2>
            <span class="panel-counter-badge">${activeAlts.length} Active</span>
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th scope="col">Requisition #</th>
                  <th scope="col">Source Stage</th>
                  <th scope="col">Defect Class</th>
                  <th scope="col" class="text-right">Qty</th>
                  <th scope="col">Status</th>
                  <th scope="col">Route</th>
                </tr>
              </thead>
              <tbody>
                ${scopedDefects.length === 0 ? `
                  <tr>
                    <td colspan="6" class="table-empty-cell">No active alterations in queue for ${baseReq}.</td>
                  </tr>
                ` : scopedDefects.slice(0, 5).map(d => `
                  <tr>
                    <td><strong>${d.id}</strong></td>
                    <td>${d.origin}</td>
                    <td>${d.defectClass}</td>
                    <td class="text-right font-bold">${d.qty}</td>
                    <td><span class="status-pill">${d.status}</span></td>
                    <td style="font-size: 11px; color: var(--ink-600);">Return to Stage 1</td>
                  </tr>
                `).join('') + (scopedDefects.length > 5 ? `
                  <tr>
                    <td colspan="6" class="table-empty-cell" style="padding: 8px 12px; font-size: 11.5px;">
                      Showing 5 of ${scopedDefects.length} tickets for ${aReq} (+${scopedDefects.length - 5} more in Alteration Bay #2).
                    </td>
                  </tr>
                ` : '')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- RIGHT: Master Shipping Carton Manifest -->
        <div class="panel-card">
          <div class="panel-card-header">
            <h2 class="panel-card-title" style="margin: 0;">Master Shipping Carton Manifest</h2>
            <span class="panel-counter-badge">${cartons.length} Cartons</span>
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th scope="col">Carton #</th>
                  <th scope="col" class="text-right">Net Pairs</th>
                  <th scope="col" class="text-right">Gross Wt</th>
                  <th scope="col" class="text-center">QC Status</th>
                  <th scope="col" class="text-center">Barcode</th>
                  <th scope="col">QC Seal #</th>
                </tr>
              </thead>
              <tbody>
                ${cartons.length === 0 ? `
                  <tr>
                    <td colspan="6" class="table-empty-cell">No cartons logged in manifest.</td>
                  </tr>
                ` : cartons.slice(0, 5).map(c => `
                  <tr>
                    <td><strong>${c.cartonNo}</strong></td>
                    <td class="text-right">${c.pairs}</td>
                    <td class="text-right">${c.grossWt}</td>
                    <td class="text-center"><span class="status-pill">${c.status}</span></td>
                    <td class="text-center" style="font-weight: 600;">${c.barcodeVerified ? 'Verified' : 'Pending'}</td>
                    <td style="font-family: monospace; font-size: 11.5px;">${c.sealNo}</td>
                  </tr>
                `).join('') + (cartons.length > 5 ? `
                  <tr>
                    <td colspan="6" class="table-empty-cell" style="padding: 8px 12px; font-size: 11.5px;">
                      Showing 5 of ${cartons.length} sealed cartons (+${cartons.length - 5} more in manifest).
                    </td>
                  </tr>
                ` : '')}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- Bottom Enterprise Status Bar -->
      <footer class="portal-footer">
        <div class="footer-stats-left">
          <span>Rolled Yield (RTY): <strong>${escapeHtml(wip.lineEfficiency)}</strong></span>
          <span class="stat-divider">&bull;</span>
          <span>Output: <strong>${wip.outputPairs} Pairs / ${wip.outputCartons} Cartons</strong></span>
          <span class="stat-divider">&bull;</span>
          <span>In Alteration: <strong>${wip.inAlteration} Pairs</strong></span>
        </div>
        <div class="footer-actions-right">
          <button class="btn-outline" id="btn-wip-export-shift">Export Shift Log</button>
          <button class="btn-outline" id="btn-wip-print-labels">Print Carton Labels</button>
          <button class="btn-primary" id="btn-wip-final-clearance">Final Dispatch Clearance</button>
        </div>
      </footer>
    </main>
  `;
}
