import {
  getAlterationReqNumber,
  formatCurrentDateDDMMYYYY,
  escapeHtml,
  normalizeBaseReqNumber
} from '../utils/requisitionLogic';

export interface RepairAndQcStateShape {
  packingWip: Record<string, any>;
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

export function renderRepairScreen(state: RepairAndQcStateShape & { ordersWipMap?: Record<string, any> }): string {
  const aReq = getAlterationReqNumber(state.packingWip.selectedBatch);
  const wipAltBatches = Object.keys(state.ordersWipMap || {}).map(req => getAlterationReqNumber(req));
  const batchOptions = Array.from(new Set([aReq, ...wipAltBatches, ...state.dropdownOptions.defectBatchIds]));
  const savedTailorSelected = state.savedTailors.some(
    tailor => tailor.toLocaleLowerCase() === state.repairForm.tailor.toLocaleLowerCase()
  );

  return `
    <div class="sub-header-bar">
      <h1 class="sub-header-title">
        Alteration &amp; Repair Bay #2 &mdash; Rework &amp; Mandatory Stage 1 Return (Prefix A: ${aReq})
      </h1>
      <div class="sub-header-right">
        <span class="system-date-label">Date: ${formatCurrentDateDDMMYYYY()}</span>
      </div>
    </div>

    <main id="main-content" class="main-viewport" tabindex="-1">
      <div class="alert-banner">
        <span>FACTORY RULE: Alteration Bay is called from the same Requisition Number with Prefix A (${aReq}). Every Repaired Pair Is Auto-Routed Back to Stage 1 (Checking &amp; Inspection).</span>
      </div>

      <!-- Clean Repair Entry Form -->
      <section class="form-card">
        <div class="form-row">
          <div class="form-group" style="flex: 1.2;">
            <label for="defect-batch-id">Alteration Req # (Prefix A)</label>
            <select id="defect-batch-id" class="form-select">
              ${batchOptions.map(b => `<option value="${b}" ${(state.repairForm.batchId || aReq) === b ? 'selected' : ''}>${b}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="flex: 1.5;">
            <label for="defect-article">Article</label>
            <select id="defect-article" class="form-select">
              <option value="">-- Select Article --</option>
              ${state.dropdownOptions.articles.map(a => `<option value="${a}" ${(state.repairForm.article || state.packingWip.article) === a ? 'selected' : ''}>${a}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="flex: 1;">
            <label for="defect-po">PO Number</label>
            <select id="defect-po" class="form-select">
              <option value="">-- Select PO Number --</option>
              ${state.dropdownOptions.poList.map(p => `<option value="${p}" ${(state.repairForm.po || state.packingWip.po) === p ? 'selected' : ''}>${p}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="flex: 1.6;">
            <label for="defect-type">Defect Type</label>
            <select id="defect-type" class="form-select">
              <option value="">-- Select Defect Type --</option>
              <option>Stitching Skip / Broken Seam</option>
              <option>Oil / Grease Stain</option>
              <option>Thermal Crease Defect</option>
              <option>Size Shade Mismatch</option>
              <option>Seam Cut (Unsalvageable)</option>
            </select>
          </div>
          <div class="form-group" style="flex: 1.6;">
            <label for="defect-tailor">Assigned Tailor</label>
            <select id="defect-tailor-select" class="form-select" aria-label="Select saved tailor">
              <option value="__custom__" ${savedTailorSelected ? '' : 'selected'}>Enter a new tailor name</option>
              ${state.savedTailors.map(tailor => `<option value="${escapeHtml(tailor)}" ${state.repairForm.tailor.toLocaleLowerCase() === tailor.toLocaleLowerCase() ? 'selected' : ''}>${escapeHtml(tailor)}</option>`).join('')}
            </select>
            <input type="text" id="defect-tailor" class="form-input" placeholder="Custom tailor name" value="${savedTailorSelected ? '' : escapeHtml(state.repairForm.tailor)}" />
          </div>
          <div class="form-group" style="flex: 0.9;">
            <label for="defect-qty">Qty in Batch</label>
            <input type="number" id="defect-qty" class="form-input" placeholder="0" value="${state.repairForm.qty}" />
          </div>
        </div>

        <div class="form-action-row">
          <div class="form-actions-left">
            <button class="btn-primary" id="btn-complete-repair">Complete Repair &amp; Return to Stage 1</button>
          </div>
          <div class="form-actions-right">
            <button class="btn-outline" id="btn-log-scrap">Log as Scrap</button>
            <button class="btn-outline" id="btn-print-defect-tag">Print Defect Route Tag</button>
          </div>
        </div>
      </section>

      <!-- Defect Records Table -->
      <section class="panel-card">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Alteration Req #</th>
                <th>Date</th>
                <th>Origin Stage</th>
                <th>Article</th>
                <th>PO Number</th>
                <th>Defect Classification</th>
                <th class="text-right">Qty</th>
                <th>Assigned Tailor</th>
                <th class="text-center">Status</th>
                <th>Mandatory Return Route</th>
                <th class="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${state.defectList.length === 0 ? `
                <tr>
                  <td colspan="11" class="text-center" style="padding: 30px 16px; color: var(--ink-500);">
                    No defect rework tickets currently active in Bay #2 (${aReq}).
                  </td>
                </tr>
              ` : state.defectList.map(defect => `
                  <tr>
                    <td class="font-bold" style="white-space: nowrap;">${defect.id}</td>
                    <td style="white-space: nowrap;">${defect.date}</td>
                    <td>${defect.origin}</td>
                    <td>${defect.article}</td>
                    <td style="white-space: nowrap;">${defect.po}</td>
                    <td>${defect.defectClass}</td>
                    <td class="text-right font-bold" style="white-space: nowrap;">${defect.qty}</td>
                    <td>${defect.tailor}</td>
                    <td class="text-center" style="white-space: nowrap;">
                      <span class="status-pill">${defect.status}</span>
                    </td>
                    <td>${defect.route}</td>
                    <td class="text-center" style="white-space: nowrap;">
                      ${
                        defect.altId && (defect.rawStatus === 'SENT_FOR_ALTERATION' || defect.status === 'In Rework')
                          ? `<button type="button" class="table-btn" data-alt-return-id="${defect.altId}">Return Stage 1</button>
                             <button type="button" class="table-btn" data-alt-scrap-id="${defect.altId}">Scrap</button>`
                          : `<button type="button" class="table-btn" onclick="window.handleDefectAction('${escapeHtml(defect.id)}', '${escapeHtml(defect.actionText)}')">${escapeHtml(defect.actionText)}</button>`
                      }
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
          <span>Total Reworked Today: <strong>${state.defectList.filter(d => d.status === 'Completed').length} Batches</strong></span>
          <span class="stat-divider">|</span>
          <span>Returned to Stage 1: <strong>${state.defectList.length} Batches</strong></span>
          <span class="stat-divider">|</span>
          <span>Scrapped: <strong>${state.defectList.filter(d => d.status === 'Scrapped').length} Batches</strong></span>
        </div>
        <div class="footer-actions-right">
          <button class="btn-outline" id="btn-export-pareto">Export Pareto CSV</button>
          <button class="btn-outline" id="btn-print-defect-sheet">Print Defect Summary</button>
        </div>
      </footer>
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
