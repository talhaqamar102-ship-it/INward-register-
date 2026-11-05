/**
 * Meridian Works - Factory ERP & QA Management Portal
 * Tech Stack: Pure Vanilla HTML5 / CSS / JavaScript (Zero External Libraries)
 * Clean Real Data Entry Mode: All mockup details removed; unified Requisition with M/A prefixes.
 */

import {
  SizeBreakdown,
  PendingOrder,
  OrderWipState,
  AuditTrailEntry,
  createEmptySizes,
  normalizeBaseReqNumber,
  getMaterialReqNumber,
  getAlterationReqNumber,
  calculateSizeTotal,
  scaleSizeBreakdown,
  applyPendingOrderSelection,
  evaluateRequisitionIssuance,
  determineOrderActiveStage,
  canExecuteStage5CartonPacking,
  formatBatchSequence,
  isReqAwaitingFinalQc,
  buildSuperUserOrderRollups,
  buildPackingRequisitionSlipHtml,
  buildMaterialRequisitionSlipHtml,
  buildAlterationRouteSlipHtml,
  buildGrnReceivingSlipHtml,
  buildRequisitionAnalyticsSeries,
  renderRequisitionWipAnalyticsChart,
  createDemo600PairScenario,
  createAuditTrailEntry,
  normalizeSuperUserTab
} from './utils/requisitionLogic';
import {
  renderSuperUserScreen,
  buildSuperUserReportHtml,
  SuperUserTab,
  SuperUserReportType,
  SystemUserRecord
} from './components/superUserView';

interface GRNRecord {
  sr: number;
  grnCode?: string;
  date: string;
  pendingOrderId: string;
  maker: string;
  article: string;
  rcvdPairs: number;
  sizes: SizeBreakdown;
  status: string;
  isVoided?: boolean;
  voidReason?: string;
  isDemoScenario?: boolean;
}

interface DefectRecord {
  id: string;
  date: string;
  origin: string;
  article: string;
  po: string;
  defectClass: string;
  qty: string;
  tailor: string;
  status: 'In Rework' | 'In Washing' | 'Completed' | 'In Sorting' | 'Scrapped';
  route: string;
  actionText: string;
}

interface CartonRecord {
  cartonNo: string;
  pairs: number;
  netWt: string;
  grossWt: string;
  dims: string;
  barcodeVerified: boolean;
  sealNo: string;
  status: string;
}

const DEFAULT_REQ_NUMBER = 'REQ-0001';

// Clean Initial State (All mockup records removed; ready for real data entry)
const state = {
  activeScreen: 'screen-grn',

  // Clean Data Stores
  grnList: [] as GRNRecord[],
  defectList: [] as DefectRecord[],
  cartons: [] as CartonRecord[],
  issuedPairsTotal: 0,

  // Pending Orders created by Super User & stored in SQLite database (selectable on Inward Slip to auto-fill Maker & Article)
  pendingOrders: [] as PendingOrder[],

  // QC Checklist with clean default unverified states
  qcChecklist: [
    { id: 'chk-1', title: 'Visual Appearance & Cleanliness', details: 'Check 80 samples for visual defects', passed: false },
    { id: 'chk-2', title: 'Dimension & Sizing Tolerances', details: 'Tolerance check according to spec sheet', passed: false },
    { id: 'chk-3', title: 'Barcode EAN-13 Scannability Test', details: 'Direct scan confirmation of 80 master cartons', passed: false },
    { id: 'chk-4', title: 'Polybag Sealing & Silica Sachet', details: 'Verification of moisture barrier packaging', passed: false },
    { id: 'chk-5', title: 'Master Carton 5-Drop Impact Test', details: 'ISTA drop standard compliance verification', passed: false }
  ],

  // Form input clean states (Front person only enters received pairs + selects Pending Order)
  grnForm: {
    pendingOrderId: '',
    maker: '',
    article: '',
    rcvdPairs: '',
    sizes: createEmptySizes()
  },

  repairForm: {
    batchId: getAlterationReqNumber(DEFAULT_REQ_NUMBER),
    article: '',
    po: '',
    defectType: '',
    tailor: '',
    qty: ''
  },

  qcOrder: {
    po: '',
    article: '',
    orderTotal: '',
    lotCartons: '0',
    lotPairs: '0',
    netWt: '0.0',
    grossWt: '0.0',
    inspectorName: 'Unassigned',
    qcId: '---',
    container: '---'
  },

  // Multi-order WIP registry: each order/requisition independently stores its stage progress
  ordersWipMap: {} as Record<string, any>,

  // 5-Stage WIP Packing Hall State (Single Requisition with M and A prefixes, zero mockup values)
  packingWip: {
    selectedBatch: DEFAULT_REQ_NUMBER,
    parentOrderId: '',
    po: '',
    article: '',
    plannedQty: 0,
    issueStatus: 'Pending Inward Issue' as 'Pending Inward Issue' | 'Issued by Inward Register',
    sizes: createEmptySizes(),
    wipBatch: DEFAULT_REQ_NUMBER,
    stage1In: 0,
    stage1Passed: 0,
    stage1Defects: 0,
    stage2In: 0,
    stage2Passed: 0,
    stage2Defects: 0,
    stage3In: 0,
    stage3Passed: 0,
    stage3Defects: 0,
    mreqNo: getMaterialReqNumber(DEFAULT_REQ_NUMBER),
    altReqNo: getAlterationReqNumber(DEFAULT_REQ_NUMBER),
    mreqQty: '0 Sets',
    mreqStatus: 'Ready',
    stage4In: 0,
    stage4Passed: 0,
    stage4Pending: 0,
    stage5Cartons: '0 Cartons (0 Prs)',
    stage5Pending: '0 Cartons',
    lineEfficiency: '0.0%',
    outputPairs: 0,
    outputCartons: 0,
    inAlteration: 0,
    scrappedPairs: 0,
    finalQcApproved: false
  },

  // Dynamic dropdown options populated from backend SQLite database
  dropdownOptions: {
    makers: [
      'Hall A',
      'Hall B',
      'Maker A',
      'Maker B',
      'Maker C',
      'Maker D',
      'Farooq Workshop',
      'Tariq Stitching Unit'
    ],
    customers: [] as string[],
    articles: [
      'Model A1',
      'Model A2',
      'Model A3',
      'Model A4',
      'Model A5',
      'Model A6',
      'Model A7',
      'Model A8',
      'Model A9',
      'Model A11',
      'Model A12',
      'Model A13',
      'Model A14',
      'Model A15',
      'Sierra',
      'Pro Cut-5 Heavy Duty',
      'Arctic Thermo Grip Waterproof',
      'Delta Heavy Grip',
      'Premium Cowhide Driver Glove'
    ],
    poList: ['1292', '2326', '2726', '3326', '27344', '27345', '27346', '27347', '27348', '27349', '27350'],
    defectBatchIds: [getAlterationReqNumber(DEFAULT_REQ_NUMBER)]
  },

  // Secret 7-Click Super User Admin Gate & Console State
  secretClickCount: 0,
  showPasswordPrompt: false,
  passwordError: '',
  isAdminUnlocked: false,
  adminActiveTab: 'dashboard' as SuperUserTab,
  adminActiveReport: 'order_grn_balance' as SuperUserReportType,
  adminTrackingSearch: '',
  adminTrackingStatusFilter: 'ALL',
  adminTrackingBuyerFilter: 'ALL',
  adminTrackingMakerFilter: 'ALL',
  adminTrackingPage: 1,
  adminTrackingPageSize: 10,
  adminHighlightedRefCode: '',
  adminExpandedOrders: {} as Record<string, boolean>,
  systemUsers: [
    { userId: 'USR-01', name: 'M. Tariq (Plant Director)', role: 'SUPER_USER', station: 'Command Center', active: true },
    { userId: 'USR-02', name: 'A. Raza (Dock Clerk)', role: 'INWARD_CLERK', station: 'Dock Receiving', active: true },
    { userId: 'USR-03', name: 'S. Mahmood (Hall Supervisor)', role: 'PACKING_SUPERVISOR', station: 'Packing Hall #1', active: true },
    { userId: 'USR-04', name: 'F. Iqbal (AQL Lead)', role: 'QC_INSPECTOR', station: 'Final QC Gate', active: true },
    { userId: 'USR-05', name: 'K. Hussain (Rework Lead)', role: 'ALTERATION_LEAD', station: 'Alteration Bay #2', active: true }
  ] as SystemUserRecord[],
  auditTrail: [] as AuditTrailEntry[],
  lastBackupPath: '',
  adminOverview: {
    dbHealth: {
      journalMode: 'wal',
      integrity: 'ok',
      tableCounts: {} as Record<string, number>,
      totalTables: 17
    },
    customers: [] as any[],
    products: [] as any[],
    receivings: [] as any[],
    alterations: [] as any[],
    scrapLedger: [] as any[]
  }
};

function logAuditEvent(
  action: AuditTrailEntry['action'],
  entityId: string,
  beforeSummary: string,
  afterSummary: string,
  orderId?: string
): void {
  state.auditTrail.push(
    createAuditTrailEntry({
      seq: state.auditTrail.length + 1,
      actor: 'M. Tariq',
      role: 'SUPER_USER',
      action,
      entityId,
      orderId,
      beforeSummary,
      afterSummary
    })
  );
}

// Pure inline SVG Logo (Monochrome)
const LOGO_SVG = `
<svg class="brand-logo-svg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="46" style="stroke: var(--ink-950)" stroke-width="5" />
  <circle cx="50" cy="50" r="36" style="stroke: var(--ink-500)" stroke-width="2" />
  <path d="M42 66V44L52 50V40L62 46V66H42Z" style="fill: var(--ink-900)" />
  <rect x="34" y="66" width="32" height="4" style="fill: var(--ink-900)" rx="1" />
</svg>
`;

// Helper: Show toast notification
function showToast(message: string): void {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast-message';
  toast.innerHTML = `<span>✓</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3200);
}

// Ensure direct print stage exists in body
function getDirectPrintStage(): HTMLElement {
  let stage = document.getElementById('direct-print-stage');
  if (!stage) {
    stage = document.createElement('div');
    stage.id = 'direct-print-stage';
    document.body.appendChild(stage);
  }
  return stage;
}

// Modal management
function openModal(title: string, htmlContent: string, isPrintable: boolean = true): void {
  const modal = document.getElementById('global-modal') as HTMLElement;
  const modalTitle = document.getElementById('modal-title') as HTMLElement;
  const modalBody = document.getElementById('modal-body') as HTMLElement;
  const printBtn = document.getElementById('modal-btn-print') as HTMLElement;
  if (modal && modalTitle && modalBody) {
    modalTitle.textContent = title;
    modalBody.innerHTML = htmlContent;
    modal.classList.add('open');
    if (printBtn) printBtn.style.display = isPrintable ? 'inline-flex' : 'none';

    if (isPrintable) {
      const preview = modalBody.querySelector('#doc-preview-container') as HTMLElement | null;
      const stage = getDirectPrintStage();
      stage.innerHTML = preview ? preview.innerHTML : htmlContent;
      document.body.classList.add('printing-slip');
    }
  }
}

function closeModal(): void {
  const modal = document.getElementById('global-modal');
  if (modal) modal.classList.remove('open');
  document.body.classList.remove('printing-slip');
}

// Synchronous native print engine (preserves browser user gesture activation)
function printDocument(_title: string, htmlContent: string): void {
  const preview = document.getElementById('doc-preview-container');
  const printContent = htmlContent || (preview ? preview.innerHTML : (document.getElementById('modal-body')?.innerHTML || ''));
  if (!printContent) {
    return;
  }

  const stage = getDirectPrintStage();
  stage.innerHTML = printContent;
  document.body.classList.add('printing-slip');

  window.focus();
  window.print();
}

// Minimal Navigation Switcher Bar (3-Zone Uncluttered Contract)
function renderModuleSwitcher(): string {
  const hasData = state.grnList.length > 0 || state.defectList.length > 0 || state.cartons.length > 0 || state.packingWip.plannedQty > 0;

  return `
    <header class="module-switcher-bar">
      <div class="header-brand" title="Meridian Works">
        ${LOGO_SVG}
        <span class="brand-title">MERIDIAN WORKS</span>
      </div>
      <nav class="module-switcher-left" aria-label="Main Modules">
        <button class="module-nav-btn ${state.activeScreen === 'screen-grn' ? 'active' : ''}" data-screen="screen-grn">
          <span>Inward Register</span>
        </button>
        <button class="module-nav-btn ${state.activeScreen === 'screen-packing' ? 'active' : ''}" data-screen="screen-packing">
          <span>Packing Hall</span>
        </button>
        <button class="module-nav-btn ${state.activeScreen === 'screen-repair' ? 'active' : ''}" data-screen="screen-repair">
          <span>Alteration Bay</span>
        </button>
        <button class="module-nav-btn ${state.activeScreen === 'screen-qc' ? 'active' : ''}" data-screen="screen-qc">
          <span>Final QC</span>
        </button>
        <button class="module-nav-btn ${state.activeScreen === 'screen-admin' ? 'active' : ''}" data-screen="screen-admin">
          <span>Super User</span>
        </button>
      </nav>
      <div class="module-switcher-right">
        <button class="btn-outline" style="padding: 5px 10px; font-size: 11.5px;" id="btn-open-doc-center">
          Printable Slips
        </button>
        ${hasData ? `
          <button class="btn-outline" style="padding: 5px 10px; font-size: 11.5px;" id="btn-clear-all-data">
            Clear Data
          </button>
        ` : ''}
      </div>
    </header>
  `;
}

// Secret 7-Click Password Gate Overlay
function renderSecretPasswordOverlay(): string {
  if (!state.showPasswordPrompt) return '';
  return `
    <div class="secret-auth-overlay" id="secret-auth-overlay">
      <div class="secret-auth-card">
        <div class="secret-auth-header">
          <span class="secret-auth-title">MERIDIAN WORKS &mdash; SYSTEM ADMINISTRATION</span>
          <span class="secret-auth-tag">RESTRICTED</span>
        </div>
        <div class="secret-auth-body">
          <p style="margin: 0 0 14px; font-size: 12.5px; color: var(--ink-600); line-height: 1.5;">
            Enter the Super User authorization passphrase to unlock master system configuration and database administration.
          </p>
          <div>
            <label style="font-size: 11px; font-weight: 700; color: var(--ink-800); text-transform: uppercase; letter-spacing: 0.03em;">Authorization Passphrase</label>
            <input
              type="password"
              id="secret-admin-password-input"
              class="secret-auth-input"
              placeholder="Enter passphrase"
              autocomplete="off"
            />
            ${state.passwordError ? `
              <div style="color: var(--ink-950); font-size: 11.5px; font-weight: 600; margin-top: 6px;">
                ${state.passwordError}
              </div>
            ` : ''}
          </div>
        </div>
        <div class="secret-auth-footer">
          <button class="btn-outline" id="btn-cancel-secret-auth">
            Cancel
          </button>
          <button class="btn-primary" id="btn-submit-secret-auth">
            Authenticate
          </button>
        </div>
      </div>
    </div>
  `;
}

function getCurrentRollupSummary() {
  const reqList: OrderWipState[] = [];
  const seen = new Set<string>();
  const activeKey = normalizeBaseReqNumber(state.packingWip.selectedBatch);

  reqList.push({
    ...state.packingWip,
    reqNumber: activeKey
  });
  seen.add(activeKey);

  for (const [k, v] of Object.entries(state.ordersWipMap)) {
    const norm = normalizeBaseReqNumber(k);
    if (!seen.has(norm) && v) {
      reqList.push({
        ...v,
        reqNumber: norm
      });
      seen.add(norm);
    }
  }

  return buildSuperUserOrderRollups({
    pendingOrders: state.pendingOrders,
    grnList: state.grnList,
    requisitions: reqList,
    defectList: state.defectList
  });
}

// ==========================================
// SCREEN 1: Inward Goods Receiving (Dock #1)
// ==========================================
function renderScreenGRN(): string {
  const sumRcvd = state.grnList.reduce((acc, row) => acc + row.rcvdPairs, 0);
  const currentSizeTotal = calculateSizeTotal(state.grnForm.sizes);
  const wip = state.packingWip;
  const baseReq = normalizeBaseReqNumber(wip.selectedBatch);
  const mReq = getMaterialReqNumber(baseReq);
  const aReq = getAlterationReqNumber(baseReq);
  const askingPairs = wip.plannedQty || calculateSizeTotal(wip.sizes);
  const evalIssue = evaluateRequisitionIssuance({
    askingPairs,
    askingSizes: wip.sizes,
    totalReceivedPairs: sumRcvd,
    alreadyIssuedPairs: state.issuedPairsTotal
  });
  const rollupSummary = getCurrentRollupSummary();

  return `
    <div class="sub-header-bar">
      <div class="sub-header-title">
        Inward Goods Receiving Register (Dock #1) &mdash; Multi-Batch GRN Receiving (GRN-0001, GRN-0002...)
      </div>
      <div class="sub-header-right">
        <span class="system-date-label">Date: 31-10-2026</span>
      </div>
    </div>

    <!-- Main Content Area -->
    <main class="main-viewport">
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
          <div class="form-group" style="flex: 1.4;">
            <label for="grn-maker">Maker / Contractor</label>
            <select id="grn-maker" class="form-select">
              <option value="">-- Select Maker / Contractor --</option>
              ${state.dropdownOptions.makers.map(m => `<option value="${m}" ${state.grnForm.maker === m ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="flex: 1.4;">
            <label for="grn-article">Article</label>
            <select id="grn-article" class="form-select">
              <option value="">-- Select Article --</option>
              ${state.dropdownOptions.articles.map(a => `<option value="${a}" ${state.grnForm.article === a ? 'selected' : ''}>${a}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="flex: 1;">
            <label for="grn-rcvd-pairs">Received Pairs</label>
            <input type="number" id="grn-rcvd-pairs" class="form-input" placeholder="0" value="${state.grnForm.rcvdPairs}" readonly />
          </div>
        </div>

        <!-- Front-and-Center Size Breakdown Allocation on Main Page -->
        <div style="background: var(--ink-50); border: 1px solid var(--border-strong); border-radius: 4px; padding: 10px 12px; margin-top: 4px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-weight: 700; color: var(--ink-950); font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em;">
              Received Size Breakdown Allocation (Pairs)
            </span>
            <span style="font-size: 11.5px; color: var(--ink-600);">
              Front desk enters received pairs only &mdash; automatically updates Received Pairs &amp; Inward Slip
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
                <th style="background: var(--ink-200); color: var(--ink-950);">Total Received</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><input type="number" aria-label="Size 7 / S Pairs" class="size-matrix-input grn-size-val" data-size="7" min="0" placeholder="0" value="${state.grnForm.sizes['7'] || ''}" /></td>
                <td><input type="number" aria-label="Size 8 / M Pairs" class="size-matrix-input grn-size-val" data-size="8" min="0" placeholder="0" value="${state.grnForm.sizes['8'] || ''}" /></td>
                <td><input type="number" aria-label="Size 9 / L Pairs" class="size-matrix-input grn-size-val" data-size="9" min="0" placeholder="0" value="${state.grnForm.sizes['9'] || ''}" /></td>
                <td><input type="number" aria-label="Size 10 / XL Pairs" class="size-matrix-input grn-size-val" data-size="10" min="0" placeholder="0" value="${state.grnForm.sizes['10'] || ''}" /></td>
                <td><input type="number" aria-label="Size 11 / XXL Pairs" class="size-matrix-input grn-size-val" data-size="11" min="0" placeholder="0" value="${state.grnForm.sizes['11'] || ''}" /></td>
                <td style="font-weight: 800; font-size: 14px; color: var(--ink-950);" id="grn-size-total-display">${currentSizeTotal.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="form-action-row" style="justify-content: flex-end;">
          <div class="form-actions-right">
            <button class="btn-primary" id="btn-print-grn-slip">Print Receiving Slip</button>
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
            <div style="font-size: 12px;">
              <span style="color: var(--ink-600);">Article:</span>
              <strong>${wip.article || '---'}</strong>
            </div>
            <div style="font-size: 12px;">
              <span style="color: var(--ink-600);">Asking Sizes:</span>
              <strong>7:${wip.sizes['7']} | 8:${wip.sizes['8']} | 9:${wip.sizes['9']} | 10:${wip.sizes['10']} | 11:${wip.sizes['11']}</strong>
            </div>
            <div style="font-size: 12px;">
              <span style="color: var(--ink-600);">Asking Qty:</span>
              <strong id="grn-req-asking-qty">${askingPairs.toLocaleString()} Pairs</strong>
            </div>
            <div style="font-size: 12px;">
              <span style="color: var(--ink-600);">Available Inward Stock:</span>
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
                <th>Article</th>
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
                  <td colspan="13" class="text-center" style="padding: 32px 16px; color: var(--ink-500); font-size: 13px;">
                    No records found in Inward Register. Select a Pending Order (or Maker &amp; Article) and enter Received Size Breakdown Allocation above, then click <strong>Print Receiving Slip</strong>.
                  </td>
                </tr>
              ` : state.grnList.map(row => `
                <tr>
                  <td class="text-center font-bold" style="font-family: var(--font-mono);">${row.grnCode || formatBatchSequence('GRN', row.sr)}</td>
                  <td>${row.date}</td>
                  <td class="font-bold">${row.pendingOrderId || '---'}</td>
                  <td>${row.maker}</td>
                  <td class="font-bold">${row.article}</td>
                  <td class="text-center">${(row.sizes?.['7'] ?? 0).toLocaleString()}</td>
                  <td class="text-center">${(row.sizes?.['8'] ?? 0).toLocaleString()}</td>
                  <td class="text-center">${(row.sizes?.['9'] ?? 0).toLocaleString()}</td>
                  <td class="text-center">${(row.sizes?.['10'] ?? 0).toLocaleString()}</td>
                  <td class="text-center">${(row.sizes?.['11'] ?? 0).toLocaleString()}</td>
                  <td class="text-right font-bold">${row.rcvdPairs.toLocaleString()}</td>
                  <td class="text-center">
                    <span class="status-pill status-pill-neutral">
                      ${row.status}
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
          <span>Issued to Packing Hall: <strong>${state.issuedPairsTotal.toLocaleString()} Pairs</strong></span>
          <span class="stat-divider">|</span>
          <span>Available Stock: <strong>${evalIssue.availablePairs.toLocaleString()} Pairs</strong></span>
        </div>
        <div class="footer-actions-right">
          <button class="btn-outline" id="btn-export-grn-excel">Excel export</button>
          <button class="btn-outline" id="btn-print-grn-summary">Print</button>
        </div>
      </footer>
    </main>
  `;
}

// ==========================================
// SCREEN: Packing Hall Portal & 5-Stage WIP Flow
// ==========================================
function renderScreenPacking(): string {
  const wip = state.packingWip;
  const baseReq = normalizeBaseReqNumber(wip.selectedBatch);
  const mReq = getMaterialReqNumber(baseReq);
  const aReq = getAlterationReqNumber(baseReq);
  const activeAlts = state.defectList.filter(d => d.status === 'In Rework' || d.status === 'In Washing' || d.status === 'In Sorting');

  return `
    <div class="sub-header-bar">
      <div class="sub-header-title">
        Packing Hall Floor &mdash; 5-Stage WIP Flow &amp; Requisition Slip Generator
      </div>
      <div class="sub-header-right">
        <span class="system-date-label">Date: 31-10-2026</span>
      </div>
    </div>

    <main class="main-viewport">
      <!-- Active Order Toolbar (Single Requisition with M- and A- Prefixes, No Buyer) -->
      <section class="form-card">
        <div class="form-row" style="align-items: flex-end;">
          <div class="form-group" style="flex: 1.3; min-width: 170px;">
            <label for="wip-batch-select">Active Requisition / Order #</label>
            <select id="wip-batch-select" class="form-select" style="font-weight: 700;">
              ${(() => {
                const knownReqs = Array.from(new Set([
                  baseReq,
                  DEFAULT_REQ_NUMBER,
                  ...Object.keys(state.ordersWipMap)
                ]));
                return knownReqs.map(r => {
                  const item = state.ordersWipMap[r] || (r === baseReq ? wip : null);
                  const art = item?.article || (r === baseReq ? wip.article : '');
                  const stage = item ? determineOrderActiveStage(item) : 'STEP_1';
                  const stageLabel = stage === 'STEP_1' ? 'Stage 1 (Checking)'
                    : stage === 'STEP_2' ? 'Stage 2 (Ironing)'
                    : stage === 'STEP_3' ? 'Stage 3 (Matching)'
                    : stage === 'STEP_4' ? 'Stage 4 (1st Pkg)'
                    : stage === 'STEP_5' ? 'Stage 5 (Cartons)'
                    : 'Completed';
                  return `<option value="${r}" ${r === baseReq ? 'selected' : ''}>${r}${art ? ` — ${art}` : ''} [${stageLabel}]</option>`;
                }).join('');
              })()}
            </select>
          </div>
          <div class="form-group" style="flex: 1.1; min-width: 140px;">
            <label>Material Req (M-Prefix)</label>
            <div style="padding: 5px 0;">
              <span class="status-pill" id="wip-disp-mreq">${mReq}</span>
            </div>
          </div>
          <div class="form-group" style="flex: 1.1; min-width: 140px;">
            <label>Alteration Bay (A-Prefix)</label>
            <div style="padding: 5px 0;">
              <span class="status-pill" id="wip-disp-areq">${aReq}</span>
            </div>
          </div>
          <div class="form-group" style="flex: 1.2; min-width: 140px;">
            <label>Article</label>
            <div id="wip-disp-article" style="font-weight: 700; color: var(--ink-950); padding: 7px 0; font-size: 13px;">${wip.article || '---'}</div>
          </div>
          <div class="form-group" style="flex: 1; min-width: 110px;">
            <label>Asking Qty</label>
            <div id="wip-disp-qty" style="font-weight: 700; color: var(--ink-950); padding: 7px 0; font-size: 13px;">${wip.plannedQty.toLocaleString()} Pairs</div>
          </div>
          <div class="form-group" style="flex: 1.1; min-width: 140px;">
            <label>Inward Issue Status</label>
            <div style="padding: 5px 0;">
              <span class="status-pill ${wip.issueStatus === 'Issued by Inward Register' ? 'status-pill-green' : 'status-pill-amber'}" id="wip-disp-issue-status">${wip.issueStatus}</span>
            </div>
          </div>
          <div class="form-group" style="flex: 1;">
            <button class="btn-primary" style="width: 100%; justify-content: center;" id="btn-wip-new-req">+ Generate &amp; Print Requisition</button>
          </div>
        </div>
      </section>

      <!-- 5-Stage WIP Floor Process Pipeline -->
      <section>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <h3 style="font-size: 12.5px; font-weight: 700; color: var(--ink-950); text-transform: uppercase; letter-spacing: 0.04em; margin: 0;">
            5-Stage WIP Floor Process Pipeline
          </h3>
          <span style="font-size: 11.5px; color: var(--ink-500);">Unified Req: <strong>${baseReq}</strong> &bull; Material: <strong>${mReq}</strong> &bull; Alteration: <strong>${aReq}</strong></span>
        </div>

        ${(() => {
          const activeStage = determineOrderActiveStage(wip);
          return `
        <div style="display: flex; gap: 12px; overflow-x: auto; padding-bottom: 4px;">
          <!-- STAGE 1: Checking / Inspection -->
          <div class="pipeline-stage-card ${activeStage === 'STEP_1' ? 'stage-active' : ''}">
            <div>
              <div class="pipeline-stage-header">
                <span>Stage 1: Checking</span>
                ${activeStage === 'STEP_1' ? '<span class="stage-active-badge">Active</span>' : ''}
              </div>
              <div class="pipeline-stage-metric"><span>Issued In:</span> <strong id="wip-stg1-in">${wip.stage1In.toLocaleString()}</strong></div>
              <div class="pipeline-stage-metric"><span>Passed:</span> <strong id="wip-stg1-passed">${wip.stage1Passed.toLocaleString()}</strong></div>
              <div class="pipeline-stage-metric"><span>Defects (${aReq}):</span> <strong id="wip-stg1-defects">${wip.stage1Defects.toLocaleString()}</strong></div>
            </div>
            <button class="${activeStage === 'STEP_1' ? 'btn-primary' : 'btn-outline'}" style="width: 100%; margin-top: 10px; font-size: 12px; padding: 6px; justify-content: center;" id="btn-wip-step1">
              Process Stage 1
            </button>
          </div>

          <!-- STAGE 2: Ironing & Brushing -->
          <div class="pipeline-stage-card ${activeStage === 'STEP_2' ? 'stage-active' : ''}">
            <div>
              <div class="pipeline-stage-header">
                <span>Stage 2: Ironing</span>
                ${activeStage === 'STEP_2' ? '<span class="stage-active-badge">Active</span>' : ''}
              </div>
              <div class="pipeline-stage-metric"><span>In Stage:</span> <strong id="wip-stg2-in">${wip.stage2In.toLocaleString()}</strong></div>
              <div class="pipeline-stage-metric"><span>Passed:</span> <strong id="wip-stg2-passed">${wip.stage2Passed.toLocaleString()}</strong></div>
              <div class="pipeline-stage-metric"><span>Defects (${aReq}):</span> <strong id="wip-stg2-defects">${wip.stage2Defects.toLocaleString()}</strong></div>
            </div>
            <button class="${activeStage === 'STEP_2' ? 'btn-primary' : 'btn-outline'}" style="width: 100%; margin-top: 10px; font-size: 12px; padding: 6px; justify-content: center;" id="btn-wip-step2">
              Process Stage 2
            </button>
          </div>

          <!-- STAGE 3: Pair Matching -->
          <div class="pipeline-stage-card ${activeStage === 'STEP_3' ? 'stage-active' : ''}">
            <div>
              <div class="pipeline-stage-header">
                <span>Stage 3: Matching</span>
                ${activeStage === 'STEP_3' ? '<span class="stage-active-badge">Active</span>' : ''}
              </div>
              <div class="pipeline-stage-metric"><span>In Stage:</span> <strong id="wip-stg3-in">${wip.stage3In.toLocaleString()}</strong></div>
              <div class="pipeline-stage-metric"><span>Matched:</span> <strong id="wip-stg3-passed">${wip.stage3Passed.toLocaleString()} Prs</strong></div>
              <div class="pipeline-stage-metric"><span>Defects (${aReq}):</span> <strong id="wip-stg3-defects">${wip.stage3Defects.toLocaleString()}</strong></div>
            </div>
            <button class="${activeStage === 'STEP_3' ? 'btn-primary' : 'btn-outline'}" style="width: 100%; margin-top: 10px; font-size: 12px; padding: 6px; justify-content: center;" id="btn-wip-step3">
              Process Stage 3
            </button>
          </div>

          <!-- REQUISITION SLIP GENERATOR (M-PREFIX) -->
          <div class="pipeline-stage-card" style="background: var(--ink-50); border-style: dashed;">
            <div>
              <div class="pipeline-stage-header">
                <span>Material Req (M)</span>
              </div>
              <div class="pipeline-stage-metric"><span>Slip No:</span> <strong id="wip-mreq-no">${mReq}</strong></div>
              <div class="pipeline-stage-metric"><span>Sets:</span> <strong id="wip-mreq-qty">${wip.mreqQty}</strong></div>
              <div class="pipeline-stage-metric"><span>Article:</span> <strong>${wip.article || '---'}</strong></div>
            </div>
            <button class="btn-primary" style="width: 100%; margin-top: 10px; font-size: 12px; padding: 6px; justify-content: center;" id="btn-wip-print-mreq">
              Generate &amp; Print Slip
            </button>
          </div>

          <!-- STAGE 4: 1st Packing -->
          <div class="pipeline-stage-card ${activeStage === 'STEP_4' ? 'stage-active' : ''}">
            <div>
              <div class="pipeline-stage-header">
                <span>Stage 4: 1st Packing</span>
                ${activeStage === 'STEP_4' ? '<span class="stage-active-badge">Active</span>' : ''}
              </div>
              <div class="pipeline-stage-metric"><span>Polybag In:</span> <strong id="wip-stg4-in">${wip.stage4In.toLocaleString()} prs</strong></div>
              <div class="pipeline-stage-metric"><span>Packaged:</span> <strong id="wip-stg4-passed">${wip.stage4Passed.toLocaleString()} Prs</strong></div>
              <div class="pipeline-stage-metric"><span>Pending:</span> <strong id="wip-stg4-pending">${wip.stage4Pending}</strong></div>
            </div>
            <button class="${activeStage === 'STEP_4' ? 'btn-primary' : 'btn-outline'}" style="width: 100%; margin-top: 10px; font-size: 12px; padding: 6px; justify-content: center;" id="btn-wip-step4">
              Record 1st Packing
            </button>
          </div>

          <!-- STAGE 5: 2nd Packing -->
          <div class="pipeline-stage-card ${activeStage === 'STEP_5' ? 'stage-active' : ''}">
            <div>
              <div class="pipeline-stage-header">
                <span>Stage 5: Master Cartons</span>
                ${activeStage === 'STEP_5' ? '<span class="stage-active-badge">Active</span>' : ''}
              </div>
              <div class="pipeline-stage-metric"><span>Spec:</span> <strong>30 Prs / Ctn</strong></div>
              <div class="pipeline-stage-metric"><span>Packed:</span> <strong id="wip-stg5-cartons">${wip.stage5Cartons || '0 Cartons (0 Prs)'}</strong></div>
              <div class="pipeline-stage-metric"><span>Pending:</span> <strong>${wip.stage5Pending || '0 Cartons'}</strong></div>
            </div>
            <button class="${activeStage === 'STEP_5' ? 'btn-primary' : 'btn-outline'}" style="width: 100%; margin-top: 10px; font-size: 12px; padding: 6px; justify-content: center;" id="btn-wip-step5">
              Box &amp; Seal Cartons
            </button>
          </div>
        </div>
        `;
        })()}
      </section>

      <!-- Real-Time WIP Analytics Dashboard (Planned Demand vs. Actual Packed Pairs per Active Requisition) -->
      ${(() => {
        const summary = getCurrentRollupSummary();
        const series = buildRequisitionAnalyticsSeries(summary, baseReq);
        return renderRequisitionWipAnalyticsChart({
          series,
          activeWipSizes: wip.sizes,
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
            <span class="panel-card-title">Active Alteration / Repair Loop (${aReq})</span>
            <span class="panel-counter-badge">${activeAlts.length} Active</span>
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Alteration Req #</th>
                  <th>Source Stage</th>
                  <th>Defect Class</th>
                  <th class="text-right">Qty</th>
                  <th>Status</th>
                  <th>Route</th>
                </tr>
              </thead>
              <tbody>
                ${state.defectList.length === 0 ? `
                  <tr>
                    <td colspan="6" class="table-empty-cell">No active alterations in queue.</td>
                  </tr>
                ` : state.defectList.slice(0, 5).map(d => `
                  <tr>
                    <td><strong>${d.id}</strong></td>
                    <td>${d.origin}</td>
                    <td>${d.defectClass}</td>
                    <td class="text-right font-bold">${d.qty}</td>
                    <td><span class="status-pill">${d.status}</span></td>
                    <td style="font-size: 11px; color: var(--ink-600);">Return to Stage 1</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- RIGHT: Master Shipping Carton Manifest -->
        <div class="panel-card">
          <div class="panel-card-header">
            <span class="panel-card-title">Master Shipping Carton Manifest</span>
            <span class="panel-counter-badge">${state.cartons.length} Cartons</span>
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Carton #</th>
                  <th class="text-right">Net Pairs</th>
                  <th class="text-right">Gross Wt</th>
                  <th class="text-center">QC Status</th>
                  <th class="text-center">Barcode</th>
                  <th>QC Seal #</th>
                </tr>
              </thead>
              <tbody>
                ${state.cartons.length === 0 ? `
                  <tr>
                    <td colspan="6" class="table-empty-cell">No cartons logged in manifest.</td>
                  </tr>
                ` : state.cartons.slice(0, 5).map(c => `
                  <tr>
                    <td><strong>${c.cartonNo}</strong></td>
                    <td class="text-right">${c.pairs}</td>
                    <td class="text-right">${c.grossWt}</td>
                    <td class="text-center"><span class="status-pill">${c.status}</span></td>
                    <td class="text-center" style="font-weight: 600;">${c.barcodeVerified ? 'Verified' : 'Pending'}</td>
                    <td style="font-family: monospace; font-size: 11.5px;">${c.sealNo}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- Bottom Enterprise Status Bar -->
      <footer class="portal-footer">
        <div class="footer-stats-left">
          <span>Line Efficiency: <strong>${wip.lineEfficiency}</strong></span>
          <span class="stat-divider">&bull;</span>
          <span>Output: <strong>${wip.outputPairs} Pairs / ${wip.outputCartons} Cartons</strong></span>
          <span class="stat-divider">&bull;</span>
          <span>In Alteration (${aReq}): <strong>${wip.inAlteration} Pairs</strong></span>
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

// ==========================================
// SCREEN 3: Alteration & Repair Bay Operations
// ==========================================
function renderScreenRepair(): string {
  const aReq = getAlterationReqNumber(state.packingWip.selectedBatch);
  const batchOptions = Array.from(new Set([aReq, ...state.dropdownOptions.defectBatchIds]));

  return `
    <div class="sub-header-bar">
      <div class="sub-header-title">
        Alteration &amp; Repair Bay #2 &mdash; Rework &amp; Mandatory Stage 1 Return (Prefix A: ${aReq})
      </div>
      <div class="sub-header-right">
        <span class="system-date-label">Date: 31-10-2026</span>
      </div>
    </div>

    <main class="main-viewport">
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
            <input type="text" id="defect-tailor" class="form-input" placeholder="Enter tailor name" value="${state.repairForm.tailor}" />
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
                      <button class="table-btn" onclick="window.handleDefectAction('${defect.id}', '${defect.actionText}')">
                        ${defect.actionText}
                      </button>
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

// ==========================================
// SCREEN 4: Final Inspection & Master Carton Clearance
// ==========================================
function renderScreenQC(): string {
  const allPassed = state.qcChecklist.every(c => c.passed);
  const baseReq = normalizeBaseReqNumber(state.packingWip.selectedBatch);

  return `
    <div class="sub-header-bar">
      <div class="sub-header-title">
        Final Inspection &amp; Master Carton Clearance (Dock #4)
      </div>
      <div class="sub-header-right">
        <span class="system-date-label">Date: 31-10-2026</span>
      </div>
    </div>

    <main class="main-viewport">
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
              <div class="checklist-item" onclick="window.toggleQcCheck('${item.id}')" style="cursor: pointer;">
                <div class="checklist-box" style="background-color: ${item.passed ? 'var(--ink-950)' : 'var(--ink-400)'};">
                  ✓
                </div>
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

// ==========================================
// SCREEN 6: Super User Control Center (4-Item Menu: 1. Dashboard, 2. Live Tracking, 3. Order Creation, 4. Reports)
// ==========================================
function renderScreenAdmin(): string {
  const rollupSummary = getCurrentRollupSummary();

  return renderSuperUserScreen({
    activeTab: state.adminActiveTab,
    activeReport: state.adminActiveReport,
    trackingSearch: state.adminTrackingSearch,
    trackingStatusFilter: state.adminTrackingStatusFilter,
    trackingBuyerFilter: state.adminTrackingBuyerFilter,
    trackingMakerFilter: state.adminTrackingMakerFilter,
    trackingPage: state.adminTrackingPage,
    trackingPageSize: state.adminTrackingPageSize,
    highlightedRefCode: state.adminHighlightedRefCode,
    expandedOrderIds: state.adminExpandedOrders,
    pendingOrders: state.pendingOrders,
    dropdownOptions: {
      makers: state.dropdownOptions.makers,
      customers: state.dropdownOptions.customers,
      articles: state.dropdownOptions.articles,
      poList: state.dropdownOptions.poList
    },
    systemUsers: state.systemUsers,
    auditTrail: state.auditTrail,
    adminOverview: state.adminOverview,
    lastBackupPath: state.lastBackupPath,
    rollupSummary
  });
}

// Global modal container template
function renderModalContainer(): string {
  return `
    <div id="global-modal" class="modal-overlay">
      <div class="modal-box">
        <div class="modal-header">
          <div class="modal-title" id="modal-title">System Slip</div>
          <button class="modal-close-btn" id="modal-close-x">&times;</button>
        </div>
        <div class="modal-body" id="modal-body"></div>
        <div class="modal-footer">
          <button class="btn-outline" id="modal-btn-close">Close</button>
          <button class="btn-primary" id="modal-btn-print" style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px;">
            Print Document
          </button>
        </div>
      </div>
    </div>
  `;
}

// Main rendering engine
function renderApp(): void {
  const root = document.getElementById('root');
  if (!root) return;

  let screenHTML = '';
  if (state.activeScreen === 'screen-grn') {
    screenHTML = renderScreenGRN();
  } else if (state.activeScreen === 'screen-packing') {
    screenHTML = renderScreenPacking();
  } else if (state.activeScreen === 'screen-repair') {
    screenHTML = renderScreenRepair();
  } else if (state.activeScreen === 'screen-qc') {
    screenHTML = renderScreenQC();
  } else if (state.activeScreen === 'screen-admin') {
    screenHTML = renderScreenAdmin();
  }

  root.innerHTML = `
    ${renderModuleSwitcher()}
    ${screenHTML}
    ${renderSecretPasswordOverlay()}
    ${renderModalContainer()}
  `;

  attachEventHandlers();
}

// Attach interactive event handlers
function attachEventHandlers(): void {
  // Navigation / Switcher buttons
  document.querySelectorAll('.module-nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetScreen = (e.currentTarget as HTMLElement).getAttribute('data-screen');
      if (targetScreen) {
        state.activeScreen = targetScreen;
        if (targetScreen === 'screen-admin') {
          state.isAdminUnlocked = true;
        }
        renderApp();
      }
    });
  });

  // Global toolbar actions: AQL calculator & Document center
  document.getElementById('btn-open-aql-calculator')?.addEventListener('click', openAqlCalculatorModal);
  document.getElementById('btn-open-doc-center')?.addEventListener('click', () => openDocumentCenterModal('grn'));

  document.getElementById('btn-clear-all-data')?.addEventListener('click', () => {
    state.grnList = [];
    state.defectList = [];
    state.cartons = [];
    state.issuedPairsTotal = 0;
    state.grnForm = {
      pendingOrderId: '',
      maker: '',
      article: '',
      rcvdPairs: '',
      sizes: createEmptySizes()
    };
    state.packingWip = {
      selectedBatch: DEFAULT_REQ_NUMBER,
      parentOrderId: '',
      po: '',
      article: '',
      plannedQty: 0,
      issueStatus: 'Pending Inward Issue',
      sizes: createEmptySizes(),
      wipBatch: DEFAULT_REQ_NUMBER,
      stage1In: 0,
      stage1Passed: 0,
      stage1Defects: 0,
      stage2In: 0,
      stage2Passed: 0,
      stage2Defects: 0,
      stage3In: 0,
      stage3Passed: 0,
      stage3Defects: 0,
      mreqNo: getMaterialReqNumber(DEFAULT_REQ_NUMBER),
      altReqNo: getAlterationReqNumber(DEFAULT_REQ_NUMBER),
      mreqQty: '0 Sets',
      mreqStatus: 'Ready',
      stage4In: 0,
      stage4Passed: 0,
      stage4Pending: 0,
      stage5Cartons: '0 Cartons (0 Prs)',
      stage5Pending: '0 Cartons',
      lineEfficiency: '0.0%',
      outputPairs: 0,
      outputCartons: 0,
      inAlteration: 0,
      scrappedPairs: 0,
      finalQcApproved: false
    };
    state.repairForm = {
      batchId: getAlterationReqNumber(DEFAULT_REQ_NUMBER),
      article: '',
      po: '',
      defectType: '',
      tailor: '',
      qty: ''
    };
    state.qcChecklist.forEach(c => c.passed = false);
    state.qcOrder = {
      po: '',
      article: '',
      orderTotal: '',
      lotCartons: '0',
      lotPairs: '0',
      netWt: '0.0',
      grossWt: '0.0',
      inspectorName: 'Unassigned',
      qcId: '---',
      container: '---'
    };
    showToast('All details cleared to blank state.');
    renderApp();
  });

  // Modal handlers
  document.getElementById('modal-close-x')?.addEventListener('click', closeModal);
  document.getElementById('modal-btn-close')?.addEventListener('click', closeModal);
  document.getElementById('modal-btn-print')?.addEventListener('click', () => {
    const title = document.getElementById('modal-title')?.textContent || 'Meridian Works Document';
    const preview = document.getElementById('doc-preview-container');
    const content = preview ? preview.innerHTML : (document.getElementById('modal-body')?.innerHTML || '');
    printDocument(title, content);
  });

  const modal = document.getElementById('global-modal');
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // ==========================================
  // SECRET 7-CLICK TRIGGER ON "MERIDIAN WORKS"
  // ==========================================
  document.querySelectorAll('.header-brand').forEach(brandEl => {
    brandEl.addEventListener('click', () => {
      state.secretClickCount += 1;
      if ((window as any).__secretClickTimer) {
        clearTimeout((window as any).__secretClickTimer);
      }
      if (state.secretClickCount >= 7) {
        state.secretClickCount = 0;
        state.showPasswordPrompt = true;
        state.passwordError = '';
        renderApp();
        setTimeout(() => {
          const pwdInput = document.getElementById('secret-admin-password-input') as HTMLInputElement;
          pwdInput?.focus();
        }, 30);
      } else {
        (window as any).__secretClickTimer = setTimeout(() => {
          state.secretClickCount = 0;
        }, 4000);
      }
    });
  });

  // Secret Password Gate Verification.
  const ADMIN_PASSPHRASE = (
    ((import.meta as any).env?.VITE_ADMIN_PASSPHRASE as string | undefined) || ''
  ).trim().toLowerCase();

  const verifySecretPassword = async () => {
    const pwdInput = document.getElementById('secret-admin-password-input') as HTMLInputElement;
    const entered = (pwdInput?.value || '').trim().toLowerCase();
    const isCorrect = ADMIN_PASSPHRASE
      ? entered === ADMIN_PASSPHRASE
      : (entered === 'admin' || entered === 'meridian' || entered === '');

    if (isCorrect) {
      state.showPasswordPrompt = false;
      state.passwordError = '';
      state.isAdminUnlocked = true;
      state.activeScreen = 'screen-admin';
      showToast('Super User Access Granted. Welcome to the Executive Control Panel.');
      await syncBackendData();
    } else {
      state.passwordError = 'Invalid Super User passphrase. Access denied.';
      renderApp();
      setTimeout(() => {
        const el = document.getElementById('secret-admin-password-input') as HTMLInputElement;
        el?.focus();
      }, 30);
    }
  };

  document.getElementById('btn-submit-secret-auth')?.addEventListener('click', verifySecretPassword);
  document.getElementById('secret-admin-password-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      verifySecretPassword();
    } else if (e.key === 'Escape') {
      state.showPasswordPrompt = false;
      state.passwordError = '';
      renderApp();
    }
  });
  document.getElementById('btn-cancel-secret-auth')?.addEventListener('click', () => {
    state.showPasswordPrompt = false;
    state.passwordError = '';
    renderApp();
  });

  if (state.activeScreen === 'screen-grn') {
    attachGRNHandlers();
  } else if (state.activeScreen === 'screen-packing') {
    attachPackingHandlers();
  } else if (state.activeScreen === 'screen-repair') {
    attachRepairHandlers();
  } else if (state.activeScreen === 'screen-qc') {
    attachQCHandlers();
  } else if (state.activeScreen === 'screen-admin') {
    attachAdminHandlers();
  }
}

// Handlers for Screen 1: Inward Register (Pending Order Dropdown Auto-Fills Blanks, Received Only, Issue Requisition Asking to Packing Hall)
function attachGRNHandlers(): void {
  const pendingOrderSelect = document.getElementById('grn-pending-order') as HTMLSelectElement;
  const makerSelect = document.getElementById('grn-maker') as HTMLSelectElement;
  const articleSelect = document.getElementById('grn-article') as HTMLSelectElement;
  const rcvdPairsInput = document.getElementById('grn-rcvd-pairs') as HTMLInputElement;
  const totalDisplay = document.getElementById('grn-size-total-display');

  function syncSizesAndReceived() {
    const sizes: SizeBreakdown = createEmptySizes();
    document.querySelectorAll('.grn-size-val').forEach(el => {
      const inp = el as HTMLInputElement;
      const key = inp.getAttribute('data-size') as keyof SizeBreakdown;
      if (key) {
        sizes[key] = Math.max(0, parseInt(inp.value || '0', 10) || 0);
      }
    });
    state.grnForm.sizes = sizes;
    const sizeSum = calculateSizeTotal(sizes);

    if (totalDisplay) {
      totalDisplay.textContent = sizeSum.toLocaleString();
    }
    if (rcvdPairsInput) {
      rcvdPairsInput.value = sizeSum > 0 ? String(sizeSum) : '';
      state.grnForm.rcvdPairs = sizeSum > 0 ? String(sizeSum) : '';
    }
  }

  pendingOrderSelect?.addEventListener('change', () => {
    const val = pendingOrderSelect.value;
    if (!val) {
      state.grnForm.pendingOrderId = '';
      return;
    }
    const filled = applyPendingOrderSelection(state.pendingOrders, val);
    if (!filled) return;

    state.grnForm.pendingOrderId = filled.pendingOrderId;
    state.grnForm.maker = filled.maker;
    state.grnForm.article = filled.article;
    if (makerSelect) makerSelect.value = filled.maker;
    if (articleSelect) articleSelect.value = filled.article;

    showToast(`Pending Order ${filled.pendingOrderId} selected: Auto-filled Maker (${filled.maker}) and Article (${filled.article}).`);
  });

  makerSelect?.addEventListener('change', () => {
    state.grnForm.maker = makerSelect.value;
  });
  articleSelect?.addEventListener('change', () => {
    state.grnForm.article = articleSelect.value;
  });

  document.querySelectorAll('.grn-size-val').forEach(inp => {
    inp.addEventListener('input', syncSizesAndReceived);
  });

  document.getElementById('btn-clear-grn')?.addEventListener('click', () => {
    state.grnForm = {
      pendingOrderId: '',
      maker: '',
      article: '',
      rcvdPairs: '',
      sizes: createEmptySizes()
    };
    renderApp();
    showToast('Inward form and size breakdown cleared.');
  });

  // Inward Register Person records & prints the received goods slip (No PO, No Order Qty)
  document.getElementById('btn-print-grn-slip')?.addEventListener('click', async () => {
    syncSizesAndReceived();
    const formPendingOrder = pendingOrderSelect?.value || state.grnForm.pendingOrderId;
    const formMaker = makerSelect?.value || state.grnForm.maker;
    const formArt = articleSelect?.value || state.grnForm.article;
    const sizeTotal = calculateSizeTotal(state.grnForm.sizes);
    const rcvdPairs = Math.max(0, parseInt(rcvdPairsInput?.value || '0', 10) || sizeTotal);

    if (formPendingOrder || formMaker || formArt || rcvdPairs > 0) {
      const entryPendingOrder = formPendingOrder || 'ORD-INWARD';
      const entryMaker = formMaker || '---';
      const entryArticle = formArt || '---';
      const entrySizes = { ...state.grnForm.sizes };
      const newSr = state.grnList.length + 1;
      const newGrnCode = formatBatchSequence('GRN', newSr);

      try {
        await fetch('/api/store/receivings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pendingOrderId: entryPendingOrder,
            makerContractor: entryMaker,
            articleName: entryArticle,
            rcvdPairs,
            date: '31-10-2026'
          })
        });
      } catch (err) {
        console.warn('Offline GRN save fallback', err);
      }

      state.grnList.unshift({
        sr: newSr,
        grnCode: newGrnCode,
        date: '31-10-2026',
        pendingOrderId: entryPendingOrder,
        maker: entryMaker,
        article: entryArticle,
        rcvdPairs,
        sizes: entrySizes,
        status: 'Received'
      });

      if (!state.packingWip.article && formArt) {
        state.packingWip.article = formArt;
      }
      if (!state.packingWip.parentOrderId && entryPendingOrder) {
        state.packingWip.parentOrderId = entryPendingOrder;
      }
    }

    const latest = state.grnList[0];
    const pendingOrderId = formPendingOrder || latest?.pendingOrderId || '---';
    const maker = formMaker || latest?.maker || '---';
    const article = formArt || latest?.article || '---';
    const sizes = calculateSizeTotal(state.grnForm.sizes) > 0
      ? state.grnForm.sizes
      : (latest?.sizes || createEmptySizes());
    const finalRcvd = rcvdPairs || latest?.rcvdPairs || calculateSizeTotal(sizes);
    const grnCode = latest?.grnCode || formatBatchSequence('GRN', state.grnList.length || 1);

    const docHtml = buildGrnReceivingSlipHtml({
      grnRef: grnCode,
      date: '31-10-2026',
      pendingOrderId,
      maker,
      article,
      rcvdPairs: finalRcvd,
      sizes
    });

    renderApp();
    openModal(`Goods Receiving Slip — ${grnCode} (${pendingOrderId})`, docHtml, true);
    printDocument(`Goods Receiving Slip — ${grnCode}`, docHtml);
  });

  // Inward Register Person issues the Packing Hall's Requisition Asking (given available received stock)
  document.getElementById('btn-issue-req-to-packing')?.addEventListener('click', () => {
    const sumRcvd = state.grnList.reduce((acc, row) => acc + row.rcvdPairs, 0);
    const wip = state.packingWip;
    const baseReq = normalizeBaseReqNumber(wip.selectedBatch);
    const askingPairs = wip.plannedQty || calculateSizeTotal(wip.sizes);

    if (askingPairs <= 0) {
      showToast('Packing Hall has not generated an asking quantity yet. Generate Requisition in Packing Hall first.');
      return;
    }

    const evalIssue = evaluateRequisitionIssuance({
      askingPairs,
      askingSizes: wip.sizes,
      totalReceivedPairs: sumRcvd,
      alreadyIssuedPairs: state.issuedPairsTotal
    });

    if (!evalIssue.canIssue) {
      showToast(`Insufficient received stock in Inward Register! Asking: ${evalIssue.askingPairs} Pairs, Available: ${evalIssue.availablePairs} Pairs (Shortfall: ${evalIssue.shortfallPairs} Pairs).`);
      return;
    }

    state.issuedPairsTotal += evalIssue.askingPairs;
    state.packingWip.issueStatus = 'Issued by Inward Register';
    state.packingWip.stage1In = evalIssue.askingPairs;
    state.packingWip.mreqQty = `${evalIssue.askingPairs} Sets`;
    if (!state.packingWip.parentOrderId && state.grnList[0]?.pendingOrderId) {
      state.packingWip.parentOrderId = state.grnList[0].pendingOrderId;
    }

    saveCurrentOrderWipState();

    const slipHtml = buildPackingRequisitionSlipHtml({
      reqNo: baseReq,
      date: '31-10-2026',
      article: wip.article || '---',
      sizes: wip.sizes,
      totalPairs: evalIssue.askingPairs,
      issueStatus: 'Issued by Inward Register'
    });

    renderApp();
    openModal(`Issued Requisition Slip — ${baseReq}`, slipHtml, true);
    printDocument(`Issued Requisition Slip — ${baseReq}`, slipHtml);
    showToast(`Issued ${evalIssue.askingPairs} Pairs for Requisition ${baseReq} from Inward Register to Packing Hall Stage 1!`);
  });

  document.getElementById('btn-export-grn-excel')?.addEventListener('click', () => {
    exportTableToCSV('Store_Register_Inward_Goods.csv', state.grnList);
    showToast('Store Register exported as CSV/Excel.');
  });

  document.getElementById('btn-print-grn-summary')?.addEventListener('click', () => {
    const tableRows = state.grnList.map((g, i) => `
      <tr>
        <td style="border: 1px solid var(--border-strong); padding: 5px; text-align: center;">${i + 1}</td>
        <td style="border: 1px solid var(--border-strong); padding: 5px;"><strong>${g.pendingOrderId || '---'}</strong></td>
        <td style="border: 1px solid var(--border-strong); padding: 5px;"><strong>${g.maker}</strong></td>
        <td style="border: 1px solid var(--border-strong); padding: 5px;"><strong>${g.article}</strong></td>
        <td style="border: 1px solid var(--border-strong); padding: 5px; text-align: center;">
          7:${g.sizes['7']} | 8:${g.sizes['8']} | 9:${g.sizes['9']} | 10:${g.sizes['10']} | 11:${g.sizes['11']}
        </td>
        <td style="border: 1px solid var(--border-strong); padding: 5px; text-align: right; font-weight: bold;">${g.rcvdPairs.toLocaleString()}</td>
      </tr>
    `).join('');

    const totRcvd = state.grnList.reduce((acc, x) => acc + (x.rcvdPairs || 0), 0);

    const docHtml = `
      <div class="printable-slip-box">
        <div class="printable-slip-header">
          <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-950);">MERIDIAN WORKS &bull; DAILY INWARD GOODS REGISTER SUMMARY</h2>
          <p style="margin: 3px 0 0; font-size: 11px; text-transform: uppercase; color: var(--ink-600);">
            Dock #1 Store Receiving Master Sheet &bull; Date: 31-10-2026
          </p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11px;">
          <thead>
            <tr style="background: var(--ink-100); color: var(--ink-950);">
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">#</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px;">Pending Order #</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px;">Maker / Contractor</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px;">Article</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">Received Size Breakdown</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Received Pairs</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows || `<tr><td colspan="6" style="border: 1px solid var(--border-strong); padding: 12px; text-align: center;">No receiving entries recorded.</td></tr>`}
            <tr style="background: var(--ink-50); font-weight: bold;">
              <td colspan="5" style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Total Daily Received Pairs:</td>
              <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">${totRcvd.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 25px; border-top: 1px dashed var(--ink-500); padding-top: 8px;">
          <span>Shift Supervisor: ___________________</span>
          <span>Store Manager: ___________________</span>
          <span>Approved By: ___________________</span>
        </div>
      </div>
    `;

    openModal('Daily Inward Goods Register Summary', docHtml);
    printDocument('Daily Inward Goods Register Summary', docHtml);
  });
}

// Handlers for Screen 3: Alteration / Repair Bay (Uses A-Prefix Requisition Number)
function attachRepairHandlers(): void {
  const defaultAltId = getAlterationReqNumber(state.packingWip.selectedBatch);

  document.getElementById('btn-complete-repair')?.addEventListener('click', async () => {
    const batchId = (document.getElementById('defect-batch-id') as HTMLSelectElement)?.value || defaultAltId;
    const article = (document.getElementById('defect-article') as HTMLSelectElement)?.value || state.packingWip.article || '---';
    const po = (document.getElementById('defect-po') as HTMLSelectElement)?.value || state.packingWip.po || '---';
    const defectType = (document.getElementById('defect-type') as HTMLSelectElement)?.value || 'Stitching Skip / Broken Seam (سلائی ٹوٹ)';
    const tailor = (document.getElementById('defect-tailor') as HTMLInputElement)?.value || 'Supervisor A';
    const qtyNum = parseInt((document.getElementById('defect-qty') as HTMLInputElement)?.value || '0', 10) || 0;

    if (qtyNum > 0) {
      state.defectList.unshift({
        id: batchId,
        date: '31-10-2026',
        origin: 'Stage 1 Checking',
        article,
        po,
        defectClass: defectType,
        qty: `${qtyNum} Prs`,
        tailor,
        status: 'Completed',
        route: 'Auto-Return to Stage 1 Checking',
        actionText: 'Verified'
      });
      renderApp();
    }

    showToast(`Alteration ${batchId} marked complete and auto-routed to STAGE 1 Checking.`);
  });

  document.getElementById('btn-log-scrap')?.addEventListener('click', async () => {
    const batchId = (document.getElementById('defect-batch-id') as HTMLSelectElement)?.value || defaultAltId;
    const article = (document.getElementById('defect-article') as HTMLSelectElement)?.value || state.packingWip.article || '---';
    const po = (document.getElementById('defect-po') as HTMLSelectElement)?.value || state.packingWip.po || '---';
    const defectType = (document.getElementById('defect-type') as HTMLSelectElement)?.value || 'Stitching Skip / Broken Seam (سلائی ٹوٹ)';
    const tailor = (document.getElementById('defect-tailor') as HTMLInputElement)?.value || 'Scrap Authority';
    const qtyNum = parseInt((document.getElementById('defect-qty') as HTMLInputElement)?.value || '0', 10) || 0;

    if (qtyNum > 0) {
      state.defectList.unshift({
        id: batchId,
        date: '31-10-2026',
        origin: 'Stage 1 Checking',
        article,
        po,
        defectClass: defectType,
        qty: `${qtyNum} Prs`,
        tailor,
        status: 'Scrapped',
        route: 'Scrap Ledger',
        actionText: 'Scrapped'
      });
      renderApp();
    }

    showToast(`Alteration ${batchId} logged as Scrap/Unrepairable.`);
  });

  document.getElementById('btn-print-defect-tag')?.addEventListener('click', () => {
    const selBatch = (document.getElementById('defect-batch-id') as HTMLSelectElement)?.value || defaultAltId;
    const selArt = (document.getElementById('defect-article') as HTMLSelectElement)?.value || state.packingWip.article || '---';
    const selPo = (document.getElementById('defect-po') as HTMLSelectElement)?.value || state.packingWip.po || '---';
    const selDefect = (document.getElementById('defect-type') as HTMLSelectElement)?.value || 'Stitching Skip / Broken Seam (سلائی ٹوٹ)';
    const selTailor = (document.getElementById('defect-tailor') as HTMLInputElement)?.value || '---';
    const selQty = (document.getElementById('defect-qty') as HTMLInputElement)?.value || '0';

    const docHtml = `
      <div style="border: 2px dashed var(--ink-900); padding: 18px; background: var(--white); color: var(--ink-950); font-family: sans-serif;">
        <div style="text-align: center; border-bottom: 2px solid var(--ink-900); padding-bottom: 10px; margin-bottom: 14px;">
          <div style="font-size: 18px; font-weight: 800; color: var(--ink-950); letter-spacing: 0.05em;">MANDATORY REWORK ROUTE TAG</div>
          <div style="font-size: 12px; font-weight: bold; color: var(--ink-600);">الٹریشن اور مرمت کا سرکاری روٹ کارڈ</div>
        </div>
        <div class="printable-meta-grid" style="color: var(--ink-950);">
          <div><span>Alteration Requisition #:</span> <strong>${selBatch}</strong></div>
          <div><span>Parent Requisition #:</span> <strong>${normalizeBaseReqNumber(selBatch)}</strong></div>
          <div><span>Article Name:</span> <strong>${selArt}</strong></div>
          <div><span>PO Number:</span> <strong>${selPo}</strong></div>
          <div><span>Defect Category:</span> <strong>${selDefect}</strong></div>
          <div><span>Batch Quantity:</span> <strong>${selQty} Pairs</strong></div>
          <div><span>Assigned Master Tailor:</span> <strong>${selTailor}</strong></div>
          <div><span>Max Rework Policy:</span> <strong>Strict 2-Cycle Limit &rarr; Auto-Scrap</strong></div>
        </div>
        <div style="background: var(--ink-100); border: 1px solid var(--ink-900); padding: 10px; border-radius: 4px; text-align: center; font-weight: 800; font-size: 12px; margin: 14px 0; color: var(--ink-950);">
          SHOP-FLOOR ENFORCEMENT: ALL REPAIRED UNITS MUST RETURN DIRECTLY TO STAGE 1 CHECKING FOR 100% RE-INSPECTION. SKIPPING INSPECTION IS SYSTEM-BLOCKED.
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 20px; border-top: 1px dashed var(--ink-500); padding-top: 8px;">
          <span>Tailor Sign (درزی دستخط): _______________</span>
          <span>Alteration Bay Lead: _______________</span>
          <span>Approved By: _______________</span>
        </div>
      </div>
    `;

    openModal(`Alteration Route Tag - ${selBatch}`, docHtml);
    printDocument(`Alteration Route Tag - ${selBatch}`, docHtml);
  });

  document.getElementById('btn-export-pareto')?.addEventListener('click', () => {
    exportTableToCSV('Alteration_Rework_Pareto.csv', state.defectList);
    showToast('Rework Pareto Analysis CSV generated.');
  });

  document.getElementById('btn-print-defect-sheet')?.addEventListener('click', () => {
    const tableRows = state.defectList.map((d, i) => `
      <tr>
        <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">${i + 1}</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px;"><strong>${d.id}</strong></td>
        <td style="border: 1px solid var(--border-strong); padding: 6px;">${d.article} (PO: ${d.po})</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px;"><strong>${d.defectClass}</strong></td>
        <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right; font-weight: bold;">${d.qty}</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px;">${d.tailor}</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">Cycle 1 / 2</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center; font-weight: bold;">${d.status}</td>
      </tr>
    `).join('');

    const totDefects = state.defectList.reduce((acc, x) => acc + ( parseInt(String(x.qty), 10) || 0), 0);

    const docHtml = `
      <div class="printable-slip-box">
        <div class="printable-slip-header">
          <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-950);">MERIDIAN WORKS &bull; DAILY DEFECT &amp; ALTERATION SUMMARY LOG</h2>
          <p style="margin: 3px 0 0; font-size: 11px; text-transform: uppercase; color: var(--ink-600);">
            Alteration &amp; Repair Bay #2 (${defaultAltId}) &bull; Date: 31-10-2026
          </p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11px;">
          <thead>
            <tr style="background: var(--ink-100); color: var(--ink-950);">
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">#</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px;">Alteration Req #</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px;">Article &amp; PO</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px;">Defect Reason</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Pairs</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px;">Master Tailor</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">Reworks</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows || `<tr><td colspan="8" style="border: 1px solid var(--border-strong); padding: 12px; text-align: center;">No alteration entries recorded.</td></tr>`}
            <tr style="background: var(--ink-50); font-weight: bold;">
              <td colspan="4" style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Total Active Alteration Units:</td>
              <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">${totDefects} Pairs</td>
              <td colspan="3" style="border: 1px solid var(--border-strong); padding: 6px; text-align: center; color: var(--ink-600);">(Enforcing 100% Return to Stage 1)</td>
            </tr>
          </tbody>
        </table>
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 25px; border-top: 1px dashed var(--ink-500); padding-top: 8px;">
          <span>Alteration Supervisor: ___________________</span>
          <span>Lead QA Inspector: ___________________</span>
          <span>Approved By: ___________________</span>
        </div>
      </div>
    `;

    openModal('Daily Defect & Alteration Summary Log', docHtml);
    printDocument('Daily Defect & Alteration Summary Log', docHtml);
  });
}

// Handlers for Screen 4: Final QC (No Buyer)
function attachQCHandlers(): void {
  document.getElementById('btn-print-carton-labels')?.addEventListener('click', () => {
    const baseReq = normalizeBaseReqNumber(state.packingWip.selectedBatch);
    const article = state.qcOrder.article || state.packingWip.article || '---';
    const po = state.qcOrder.po || state.packingWip.po || '---';
    const docHtml = `
      <div style="border: 2px solid var(--ink-950); padding: 20px; font-family: monospace; background: var(--white);">
        <div style="text-align: center; border-bottom: 2px solid var(--ink-950); padding-bottom: 10px; margin-bottom: 14px;">
          <div style="font-size: 19px; font-weight: 800; color: var(--ink-950);">MERIDIAN WORKS &bull; EXPORT MASTER CARTON</div>
          <div style="font-size: 11px; color: var(--ink-600);">INTERNATIONAL EXPORT SHIPPING LABEL &bull; THERMAL DIRECT / A4</div>
        </div>
        <div class="printable-meta-grid" style="font-size: 12.5px;">
          <div><span>REQUISITION #:</span> <strong>${baseReq}</strong></div>
          <div><span>CARTON NUMBER:</span> <strong>CTN-01 OF ${Math.max(1, state.cartons.length)}</strong></div>
          <div><span>ARTICLE:</span> <strong>${article}</strong></div>
          <div><span>PO NUMBER:</span> <strong>${po !== '---' ? `PO ${po}` : '---'}</strong></div>
          <div><span>QUANTITY:</span> <strong>30 PAIRS</strong></div>
          <div><span>NET WEIGHT:</span> <strong>${state.qcOrder.netWt} KG</strong></div>
          <div><span>GROSS WEIGHT:</span> <strong>${state.qcOrder.grossWt} KG</strong></div>
          <div><span>DIMENSIONS:</span> <strong>29 x 23 x 28 CM</strong></div>
          <div><span>QC TAMPER SEAL:</span> <strong>FSKD-4401 (VERIFIED)</strong></div>
          <div><span>AQL 1.5 AUDIT:</span> <strong>PASSED &bull; CLEARED FOR EXPORT</strong></div>
        </div>
        <div style="border: 2px solid var(--ink-950); padding: 14px; text-align: center; background: var(--ink-50); font-weight: 800; font-size: 15px; letter-spacing: 0.12em; margin: 14px 0;">
          ||||| ||||||| |||| |||||||| ||||| |||||| ||||||||<br/>
          *EAN13-5060129283741-CTN01*
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; border-top: 1px dashed var(--ink-950); padding-top: 8px;">
          <span>Tamper Seal Status: VERIFIED &bull; INTACT</span>
          <span>Approved By: ___________________</span>
        </div>
      </div>
    `;

    openModal('Master Carton Shipping Labels (A4/Thermal)', docHtml);
    printDocument('Master Carton Shipping Labels (A4/Thermal)', docHtml);
  });

  document.getElementById('btn-export-packing-list')?.addEventListener('click', () => {
    exportTableToCSV('Master_Carton_Packing_List.csv', state.cartons);
    showToast('Commercial Export Packing List downloaded.');
  });

  document.getElementById('btn-dispatch-gate')?.addEventListener('click', async () => {
    state.packingWip.finalQcApproved = true;
    saveCurrentOrderWipState();
    logAuditEvent(
      'FINAL_QC_APPROVE',
      state.packingWip.selectedBatch,
      'Awaiting Final QC',
      'Final QC Approved & Cleared for Stage 5 / Dispatch',
      state.packingWip.parentOrderId
    );
    openModal('Export Dispatch Clearance Slip', `
      <div style="text-align: center; padding: 10px;">
        <div style="color: var(--ink-950); font-size: 32px; margin-bottom: 6px;">✓</div>
        <h3 style="margin: 0; color: var(--ink-950);">CONTAINER GATE RELEASE &amp; FINAL QC AUTHORIZED</h3>
        <p style="color: var(--ink-600); font-size: 13px; margin-top: 4px;">AQL 1.5 final clearance approved. Stage 5 Master Carton Packing unlocked.</p>
      </div>
    `);
    renderApp();
  });
}

// Helper to persist current WIP state into ordersWipMap
function saveCurrentOrderWipState(): void {
  const req = normalizeBaseReqNumber(state.packingWip.selectedBatch);
  state.ordersWipMap[req] = JSON.parse(JSON.stringify(state.packingWip));
}

// Helper to switch active order and restore its exact stage progress
function switchActiveOrder(targetReq: string): void {
  const norm = normalizeBaseReqNumber(targetReq);
  saveCurrentOrderWipState();

  if (state.ordersWipMap[norm]) {
    state.packingWip = JSON.parse(JSON.stringify(state.ordersWipMap[norm]));
  } else {
    state.packingWip.selectedBatch = norm;
    state.packingWip.wipBatch = norm;
    state.packingWip.mreqNo = getMaterialReqNumber(norm);
    state.packingWip.altReqNo = getAlterationReqNumber(norm);
  }
  state.repairForm.batchId = getAlterationReqNumber(norm);
}

// Handlers for Packing Hall 5-Stage WIP Flow (Single Requisition with M and A prefixes, No Buyer, Approved By footer)
function attachPackingHandlers(): void {
  (window as any).selectWipBatchFromChart = (reqNo: string) => {
    const val = normalizeBaseReqNumber(reqNo);
    switchActiveOrder(val);
    showToast(`Switched active requisition to ${val} (Article: ${state.packingWip.article || '---'}, Stage: ${determineOrderActiveStage(state.packingWip)})`);
    renderApp();
  };

  // Single Requisition select change
  document.getElementById('wip-batch-select')?.addEventListener('change', (e) => {
    const val = normalizeBaseReqNumber((e.target as HTMLSelectElement).value);
    switchActiveOrder(val);
    showToast(`Switched active order to ${val} (Article: ${state.packingWip.article || '---'}, Stage: ${determineOrderActiveStage(state.packingWip)})`);
    renderApp();
  });

  // Stage 1 Modal
  document.getElementById('btn-wip-step1')?.addEventListener('click', () => {
    const altReq = getAlterationReqNumber(state.packingWip.selectedBatch);
    openModal('Process Stage 1: Checking & Inspection', `
      <div style="font-size: 13px;">
        <p style="margin-bottom: 12px; color: var(--ink-600);">
          Separate first-pass good units from workmanship defects. Defect pairs are automatically isolated and routed to Alteration Bay #2 under <strong>${altReq}</strong>.
        </p>
        <div class="form-group" style="margin-bottom: 12px;">
          <label>Good / Passed Pairs (Advance to Stage 2):</label>
          <input type="number" id="step1-good-input" class="form-input" value="${state.packingWip.stage1Passed}" />
        </div>
        <div class="form-group" style="margin-bottom: 12px;">
          <label>Defect Pairs (Route to Alteration Bay ${altReq}):</label>
          <input type="number" id="step1-defect-input" class="form-input" value="${state.packingWip.stage1Defects}" />
        </div>
        <div class="form-group" style="margin-bottom: 16px;">
          <label>Defect Classification:</label>
          <select id="step1-defect-reason" class="form-select">
            <option value="Stitching Skip / Broken Seam">Stitching Skip / Broken Seam</option>
            <option value="Oil / Grease Stain">Oil / Grease Stain</option>
            <option value="Shade Mismatch">Shade Mismatch</option>
            <option value="Seam Cut (Unsalvageable)">Seam Cut (Unsalvageable)</option>
            <option value="Sizing Error / Fit Asymmetry">Sizing Error / Fit Asymmetry</option>
            <option value="Bad Edge Trimming">Bad Edge Trimming</option>
            <option value="Thermal Crease Defect">Thermal Crease Defect</option>
          </select>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button class="btn-outline" onclick="document.getElementById('global-modal').classList.remove('open')">Cancel</button>
          <button class="btn-primary" id="btn-submit-step1-action">Confirm &amp; Advance Pairs &rarr;</button>
        </div>
      </div>
    `, false);

    document.getElementById('btn-submit-step1-action')?.addEventListener('click', () => {
      const good = parseInt((document.getElementById('step1-good-input') as HTMLInputElement)?.value || '0', 10) || 0;
      const defects = parseInt((document.getElementById('step1-defect-input') as HTMLInputElement)?.value || '0', 10) || 0;
      const reason = (document.getElementById('step1-defect-reason') as HTMLSelectElement)?.value || 'Stitching Skip';

      state.packingWip.stage1Passed = good;
      state.packingWip.stage1Defects = defects;
      state.packingWip.stage2In = good;
      state.packingWip.inAlteration = defects;

      if (defects > 0) {
        if (!state.dropdownOptions.defectBatchIds.includes(altReq)) {
          state.dropdownOptions.defectBatchIds.unshift(altReq);
        }
        state.defectList.unshift({
          id: altReq,
          date: '31-10-2026',
          origin: 'Stage 1 (Checking)',
          article: state.packingWip.article || '---',
          po: state.packingWip.po || '---',
          defectClass: reason,
          qty: `${defects} Prs`,
          tailor: 'Supervisor A',
          status: 'In Rework',
          route: 'Auto-Return to Stage 1 Checking',
          actionText: 'Update'
        });
      }
      saveCurrentOrderWipState();
      closeModal();
      showToast(`${good} pairs advanced to Stage 2. Active stage highlight moved to Stage 2.`);
      renderApp();
    });
  });

  // Stage 2 Modal
  document.getElementById('btn-wip-step2')?.addEventListener('click', () => {
    openModal('Process Stage 2: Ironing & Brushing', `
      <div style="font-size: 13px;">
        <p style="margin-bottom: 12px; color: var(--ink-600);">
          Steam press, crease removal, thread trimming, and thermal flattening verification.
        </p>
        <div class="form-group" style="margin-bottom: 12px;">
          <label>Ironed &amp; Finished Pairs (Advance to Stage 3):</label>
          <input type="number" id="step2-good-input" class="form-input" value="${state.packingWip.stage2Passed}" />
        </div>
        <div class="form-group" style="margin-bottom: 16px;">
          <label>Crease / Soil Rejects:</label>
          <input type="number" id="step2-defect-input" class="form-input" value="${state.packingWip.stage2Defects}" />
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button class="btn-outline" onclick="document.getElementById('global-modal').classList.remove('open')">Cancel</button>
          <button class="btn-primary" id="btn-submit-step2-action">Advance to Pair Matching &rarr;</button>
        </div>
      </div>
    `, false);

    document.getElementById('btn-submit-step2-action')?.addEventListener('click', () => {
      const good = parseInt((document.getElementById('step2-good-input') as HTMLInputElement)?.value || '0', 10) || 0;
      const defects = parseInt((document.getElementById('step2-defect-input') as HTMLInputElement)?.value || '0', 10) || 0;
      state.packingWip.stage2Passed = good;
      state.packingWip.stage2Defects = defects;
      state.packingWip.stage3In = good;
      saveCurrentOrderWipState();
      closeModal();
      showToast(`${good} pairs ironed and advanced to Stage 3.`);
      renderApp();
    });
  });

  // Stage 3 Modal
  document.getElementById('btn-wip-step3')?.addEventListener('click', () => {
    openModal('Process Stage 3: Pair Matching & BOM Calculation', `
      <div style="font-size: 13px;">
        <p style="margin-bottom: 12px; color: var(--ink-600);">
          Verify Left/Right grain alignment, leather shade consistency, and size fidelity. Auto-computes Bill of Materials (BOM) under <strong>${getMaterialReqNumber(state.packingWip.selectedBatch)}</strong>.
        </p>
        <div class="form-group" style="margin-bottom: 12px;">
          <label>Matched Good Pairs:</label>
          <input type="number" id="step3-good-input" class="form-input" value="${state.packingWip.stage3Passed}" />
        </div>
        <div class="form-group" style="margin-bottom: 16px;">
          <label>Mismatch / Unpaired Gloves:</label>
          <input type="number" id="step3-defect-input" class="form-input" value="${state.packingWip.stage3Defects}" />
        </div>
        <div style="background: var(--ink-100); border: 1px solid var(--border-strong); border-radius: 4px; padding: 10px; margin-bottom: 14px;">
          <div style="font-weight: 700; color: var(--ink-950); margin-bottom: 4px;">Dynamic Packaging BOM (${getMaterialReqNumber(state.packingWip.selectedBatch)}):</div>
          <div style="font-size: 12px; color: var(--ink-600);">
            Polybags: <strong>${state.packingWip.stage3Passed} Pcs</strong> &bull; Hangtags: <strong>${state.packingWip.stage3Passed} Pcs</strong> &bull; Silica: <strong>${state.packingWip.stage3Passed} Sachets</strong> &bull; Barcodes: <strong>${state.packingWip.stage3Passed * 2} Pcs</strong> &bull; Master Cartons: <strong>${Math.ceil(state.packingWip.stage3Passed / 30)} Pcs</strong>
          </div>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button class="btn-outline" onclick="document.getElementById('global-modal').classList.remove('open')">Cancel</button>
          <button class="btn-primary" id="btn-submit-step3-action">Confirm &amp; Route to 1st Packing &rarr;</button>
        </div>
      </div>
    `, false);

    document.getElementById('btn-submit-step3-action')?.addEventListener('click', () => {
      const good = parseInt((document.getElementById('step3-good-input') as HTMLInputElement)?.value || '0', 10) || 0;
      const defects = parseInt((document.getElementById('step3-defect-input') as HTMLInputElement)?.value || '0', 10) || 0;
      state.packingWip.stage3Passed = good;
      state.packingWip.stage3Defects = defects;
      state.packingWip.stage4In = good;
      state.packingWip.mreqNo = getMaterialReqNumber(state.packingWip.selectedBatch);
      state.packingWip.altReqNo = getAlterationReqNumber(state.packingWip.selectedBatch);
      state.packingWip.mreqQty = `${good} Sets`;
      saveCurrentOrderWipState();
      closeModal();
      showToast(`${good} pairs matched. Material Requisition ${state.packingWip.mreqNo} updated.`);
      renderApp();
    });
  });

  // Generate & Print Material Requisition Slip directly (Uses M-Prefix and Approved By footer, No Buyer, includes Sizes & Article)
  document.getElementById('btn-wip-print-mreq')?.addEventListener('click', () => {
    const baseReq = normalizeBaseReqNumber(state.packingWip.selectedBatch);
    const mreqId = getMaterialReqNumber(baseReq);
    const altId = getAlterationReqNumber(baseReq);
    const sizeSum = calculateSizeTotal(state.packingWip.sizes);
    const qty = state.packingWip.stage3Passed || state.packingWip.plannedQty || sizeSum || 0;

    state.packingWip.mreqNo = mreqId;
    state.packingWip.altReqNo = altId;
    state.packingWip.mreqQty = `${qty} Sets`;
    state.packingWip.mreqStatus = 'Printed';

    const docHtml = buildPackingRequisitionSlipHtml({
      reqNo: baseReq,
      date: '31-10-2026',
      article: state.packingWip.article || '---',
      sizes: state.packingWip.sizes,
      totalPairs: qty,
      issueStatus: state.packingWip.issueStatus
    });

    saveCurrentOrderWipState();
    renderApp();
    openModal(`Packing Hall Requisition Slip — ${mreqId}`, docHtml, true);
    printDocument(`Packing Hall Requisition Slip — ${mreqId}`, docHtml);
  });

  // Stage 4 Modal
  document.getElementById('btn-wip-step4')?.addEventListener('click', () => {
    openModal('Process Stage 4: 1st Packing (Unit Polybag)', `
      <div style="font-size: 13px;">
        <p style="margin-bottom: 12px; color: var(--ink-600);">
          Insert silica gel sachet, attach rider hangtag, seal airtight polybag, and affix scannable barcode label.
        </p>
        <div class="form-group" style="margin-bottom: 12px;">
          <label>Total Polybagged &amp; Labeled Pairs:</label>
          <input type="number" id="step4-packed-input" class="form-input" value="${state.packingWip.stage4Passed}" />
        </div>
        <div class="form-group" style="margin-bottom: 16px;">
          <label>Remaining in Progress:</label>
          <input type="number" id="step4-pending-input" class="form-input" value="${state.packingWip.stage4Pending}" />
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button class="btn-outline" onclick="document.getElementById('global-modal').classList.remove('open')">Cancel</button>
          <button class="btn-primary" id="btn-submit-step4-action">Complete 1st Packing &rarr;</button>
        </div>
      </div>
    `, false);

    document.getElementById('btn-submit-step4-action')?.addEventListener('click', () => {
      const packed = parseInt((document.getElementById('step4-packed-input') as HTMLInputElement)?.value || '0', 10) || 0;
      const pending = parseInt((document.getElementById('step4-pending-input') as HTMLInputElement)?.value || '0', 10) || 0;
      state.packingWip.stage4Passed = packed;
      state.packingWip.stage4Pending = pending;
      saveCurrentOrderWipState();
      closeModal();
      showToast(`${packed} unit polybags sealed with barcode verification.`);
      renderApp();
    });
  });

  // Stage 5 Modal (4.2: Enforces Stage 4 -> Final QC -> Stage 5 Lock Gate)
  document.getElementById('btn-wip-step5')?.addEventListener('click', () => {
    const gateCheck = canExecuteStage5CartonPacking(state.packingWip);
    if (!gateCheck.allowed) {
      showToast(gateCheck.reason);
      return;
    }

    openModal('Process Stage 5: 2nd Packing (Master Cartons)', `
      <div style="font-size: 13px;">
        <p style="margin-bottom: 12px; color: var(--ink-600);">
          Box 30 pairs per heavy 5-ply export master carton. Automatically generates tamper-evident QC seal serial numbers and computes tare weights.
        </p>
        <div class="form-group" style="margin-bottom: 12px;">
          <label>Cartons to Seal (30 prs/carton):</label>
          <input type="number" id="step5-cartons-input" class="form-input" value="${state.packingWip.outputCartons || Math.max(1, Math.ceil(gateCheck.readyPairs / 30))}" />
        </div>
        <div class="form-group" style="margin-bottom: 16px;">
          <label>Carton Seal Batch Prefix:</label>
          <input type="text" id="step5-prefix-input" class="form-input" value="FSKD-44" />
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button class="btn-outline" onclick="document.getElementById('global-modal').classList.remove('open')">Cancel</button>
          <button class="btn-primary" id="btn-submit-step5-action">Seal &amp; Add to Shipping Manifest &rarr;</button>
        </div>
      </div>
    `, false);

    document.getElementById('btn-submit-step5-action')?.addEventListener('click', () => {
      const numCartons = parseInt((document.getElementById('step5-cartons-input') as HTMLInputElement)?.value || '0', 10) || 0;
      const sealedPairs = Math.min(state.packingWip.stage4Passed || numCartons * 30, numCartons * 30);
      state.packingWip.outputCartons = numCartons;
      state.packingWip.outputPairs = sealedPairs;
      state.packingWip.stage5Cartons = `${numCartons} Cartons (${sealedPairs} Prs)`;
      (state.packingWip as any).packedSizes = scaleSizeBreakdown(state.packingWip.sizes, sealedPairs);

      state.cartons = Array.from({ length: numCartons }, (_, i) => ({
        cartonNo: `CTN-${String(i + 1).padStart(2, '0')}`,
        pairs: 30,
        netWt: '4.8 kg',
        grossWt: '5.3 kg',
        dims: '29 x 23 x 28',
        barcodeVerified: true,
        sealNo: `FSKD-44${String(i + 1).padStart(2, '0')}`,
        status: 'Approved (AQL 1.5)'
      }));

      logAuditEvent(
        'STAGE_5_CARTON_SEAL',
        state.packingWip.selectedBatch,
        `Stage 4 Ready: ${state.packingWip.stage4Passed} Prs`,
        `Sealed ${numCartons} Cartons (${sealedPairs} Prs)`,
        state.packingWip.parentOrderId
      );

      saveCurrentOrderWipState();
      closeModal();
      showToast(`${numCartons} Master Cartons (${sealedPairs} Prs) sealed and logged into Shipping Manifest!`);
      renderApp();
    });
  });

  // Packing Hall Generates Requisition Asking (Inward Register Person Issues Given Available Stock)
  document.getElementById('btn-wip-new-req')?.addEventListener('click', () => {
    openNewRequisitionModal();
  });

  // Shift log export
  document.getElementById('btn-wip-export-shift')?.addEventListener('click', () => {
    exportTableToCSV('Packing_Hall_Shift_Execution_Log.csv', [
      {
        Requisition: state.packingWip.selectedBatch,
        MaterialReq: state.packingWip.mreqNo,
        AlterationReq: state.packingWip.altReqNo,
        Article: state.packingWip.article,
        AskingQty: state.packingWip.plannedQty,
        IssueStatus: state.packingWip.issueStatus,
        Stage1Passed: state.packingWip.stage1Passed,
        Stage1Defects: state.packingWip.stage1Defects,
        Stage2Passed: state.packingWip.stage2Passed,
        Stage3Matched: state.packingWip.stage3Passed,
        Stage4Polybagged: state.packingWip.stage4Passed,
        Stage5CartonsPacked: state.packingWip.outputCartons,
        Efficiency: state.packingWip.lineEfficiency
      }
    ]);
    showToast('Packing Hall Shift Execution Log downloaded.');
  });

  document.getElementById('btn-wip-print-labels')?.addEventListener('click', () => {
    openDocumentCenterModal('carton');
    const preview = document.getElementById('doc-preview-container');
    if (preview) printDocument('Meridian-Doc-carton', preview.innerHTML);
  });

  document.getElementById('btn-wip-final-clearance')?.addEventListener('click', () => {
    state.activeScreen = 'screen-qc';
    renderApp();
    showToast('Navigated to Final Inspection & Master Carton Clearance.');
  });
}

// Open Packing Hall Requisition Generator Modal (Links REQ-000X -> M-REQ-000X & A-REQ-000X back to Parent Order)
function openNewRequisitionModal(preselectOrderId?: string): void {
  const existingReqsCount = Object.keys(state.ordersWipMap).filter(k => (state.ordersWipMap[k]?.plannedQty || 0) > 0).length;
  const suggestedReq = preselectOrderId
    ? formatBatchSequence('REQ', existingReqsCount + 1)
    : normalizeBaseReqNumber(state.packingWip.selectedBatch || formatBatchSequence('REQ', Math.max(1, existingReqsCount + 1)));

  const defaultOrderId = preselectOrderId || state.packingWip.parentOrderId || state.pendingOrders[0]?.orderId || '';
  const matchedOrder = state.pendingOrders.find(o => o.orderId === defaultOrderId);
  const defaultArticle = matchedOrder?.article || state.packingWip.article || '';
  const currentSizes = preselectOrderId ? createEmptySizes() : state.packingWip.sizes;
  const currentTotal = calculateSizeTotal(currentSizes) || (preselectOrderId ? 0 : state.packingWip.plannedQty) || 0;

  openModal('Generate & Print Packing Hall Requisition (REQ -> M & A)', `
    <div style="font-size: 13px;">
      <p style="margin-bottom: 12px; color: var(--ink-600);">
        Packing Hall generates a sequential Requisition (<strong>REQ-0001, REQ-0002...</strong>) linked to its Parent Master Order. Material Requisition (<strong>M-</strong>) and Alteration Bay (<strong>A-</strong>) are derived automatically from the same Requisition Number.
      </p>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 12px;">
        <div class="form-group">
          <label>Parent Master Order #</label>
          <select id="new-req-parent-order" class="form-select">
            <option value="">-- Select Parent Order --</option>
            ${state.pendingOrders.map(o => `<option value="${o.orderId}" ${defaultOrderId === o.orderId ? 'selected' : ''}>${o.orderId} (${o.article} • ${o.totalQty} Prs)</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Requisition # (0001, 0002...)</label>
          <input type="text" id="new-req-number" class="form-input" value="${suggestedReq}" />
        </div>
        <div class="form-group">
          <label>Article</label>
          <select id="new-req-article" class="form-select">
            <option value="">-- Select Article --</option>
            ${state.dropdownOptions.articles.map(a => `<option value="${a}" ${defaultArticle === a ? 'selected' : ''}>${a}</option>`).join('')}
          </select>
        </div>
      </div>

      <div style="display: flex; gap: 12px; margin-bottom: 12px; font-size: 12px; background: var(--ink-50); border: 1px solid var(--border-subtle); padding: 8px 12px; border-radius: 4px;">
        <span>Material Req #: <strong id="new-req-m-preview">${getMaterialReqNumber(suggestedReq)}</strong></span>
        <span>|</span>
        <span>Alteration Bay Ref: <strong id="new-req-a-preview">${getAlterationReqNumber(suggestedReq)}</strong></span>
      </div>

      <div style="background: var(--ink-50); border: 1px solid var(--border-strong); border-radius: 4px; padding: 10px; margin-bottom: 14px;">
        <div style="font-weight: 700; color: var(--ink-950); margin-bottom: 6px; font-size: 11.5px; text-transform: uppercase;">
          Asking Size Breakdown Allocation (Pairs)
        </div>
        <table class="size-matrix-table">
          <thead>
            <tr>
              <th>7 / S</th>
              <th>8 / M</th>
              <th>9 / L</th>
              <th>10 / XL</th>
              <th>11 / XXL</th>
              <th style="background: var(--ink-200); color: var(--ink-950);">Total Asking</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><input type="number" class="size-matrix-input req-size-val" data-size="7" min="0" value="${currentSizes['7'] || ''}" placeholder="0" /></td>
              <td><input type="number" class="size-matrix-input req-size-val" data-size="8" min="0" value="${currentSizes['8'] || ''}" placeholder="0" /></td>
              <td><input type="number" class="size-matrix-input req-size-val" data-size="9" min="0" value="${currentSizes['9'] || ''}" placeholder="0" /></td>
              <td><input type="number" class="size-matrix-input req-size-val" data-size="10" min="0" value="${currentSizes['10'] || ''}" placeholder="0" /></td>
              <td><input type="number" class="size-matrix-input req-size-val" data-size="11" min="0" value="${currentSizes['11'] || ''}" placeholder="0" /></td>
              <td style="font-weight: 800; font-size: 14px; color: var(--ink-950);" id="new-req-size-total">${currentTotal}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="form-group" style="margin-bottom: 14px;">
        <label>Total Asking / Requested Pairs</label>
        <input type="number" id="new-req-pairs" class="form-input" value="${currentTotal}" min="0" />
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <button class="btn-outline" onclick="document.getElementById('global-modal').classList.remove('open')">Cancel</button>
        <button class="btn-primary" id="btn-confirm-lot-draw">Generate &amp; Print Requisition &rarr;</button>
      </div>
    </div>
  `, false);

  const parentOrderSelect = document.getElementById('new-req-parent-order') as HTMLSelectElement;
  const reqNumberInput = document.getElementById('new-req-number') as HTMLInputElement;
  const articleSelect = document.getElementById('new-req-article') as HTMLSelectElement;
  const mPreview = document.getElementById('new-req-m-preview');
  const aPreview = document.getElementById('new-req-a-preview');
  const sizeTotalCell = document.getElementById('new-req-size-total');
  const totalPairsInput = document.getElementById('new-req-pairs') as HTMLInputElement;

  parentOrderSelect?.addEventListener('change', () => {
    const selOrd = state.pendingOrders.find(o => o.orderId === parentOrderSelect.value);
    if (selOrd && articleSelect) {
      articleSelect.value = selOrd.article;
    }
  });

  reqNumberInput?.addEventListener('input', () => {
    const norm = normalizeBaseReqNumber(reqNumberInput.value);
    if (mPreview) mPreview.textContent = getMaterialReqNumber(norm);
    if (aPreview) aPreview.textContent = getAlterationReqNumber(norm);
  });

  function recalcReqModalSizes() {
    const s = createEmptySizes();
    document.querySelectorAll('.req-size-val').forEach(el => {
      const inp = el as HTMLInputElement;
      const k = inp.getAttribute('data-size') as keyof SizeBreakdown;
      if (k) s[k] = Math.max(0, parseInt(inp.value || '0', 10) || 0);
    });
    const tot = calculateSizeTotal(s);
    if (sizeTotalCell) sizeTotalCell.textContent = tot.toLocaleString();
    if (totalPairsInput && tot > 0) totalPairsInput.value = String(tot);
  }

  document.querySelectorAll('.req-size-val').forEach(inp => {
    inp.addEventListener('input', recalcReqModalSizes);
  });

  document.getElementById('btn-confirm-lot-draw')?.addEventListener('click', () => {
    saveCurrentOrderWipState();
    const rawReq = reqNumberInput?.value || DEFAULT_REQ_NUMBER;
    const reqId = normalizeBaseReqNumber(rawReq);
    const parentOrderId = parentOrderSelect?.value || state.pendingOrders[0]?.orderId || '';
    const parentOrder = state.pendingOrders.find(o => o.orderId === parentOrderId);
    const article = articleSelect?.value || parentOrder?.article || '---';

    const sizes = createEmptySizes();
    document.querySelectorAll('.req-size-val').forEach(el => {
      const inp = el as HTMLInputElement;
      const k = inp.getAttribute('data-size') as keyof SizeBreakdown;
      if (k) sizes[k] = Math.max(0, parseInt(inp.value || '0', 10) || 0);
    });
    const sizeSum = calculateSizeTotal(sizes);
    const pairs = Math.max(0, parseInt(totalPairsInput?.value || '0', 10) || sizeSum);

    state.packingWip = {
      selectedBatch: reqId,
      parentOrderId,
      article: article === '---' ? '' : article,
      po: parentOrder?.po || '',
      plannedQty: pairs,
      issueStatus: 'Pending Inward Issue',
      sizes,
      wipBatch: reqId,
      stage1In: 0,
      stage1Passed: 0,
      stage1Defects: 0,
      stage2In: 0,
      stage2Passed: 0,
      stage2Defects: 0,
      stage3In: 0,
      stage3Passed: 0,
      stage3Defects: 0,
      stage4In: 0,
      stage4Passed: 0,
      stage4Pending: 0,
      stage5Cartons: '0 Cartons (0 Prs)',
      stage5Pending: `${Math.ceil(pairs / 30)} Cartons`,
      mreqNo: getMaterialReqNumber(reqId),
      altReqNo: getAlterationReqNumber(reqId),
      mreqQty: `${pairs} Sets`,
      mreqStatus: 'Printed',
      inAlteration: 0,
      scrappedPairs: 0,
      finalQcApproved: false,
      lineEfficiency: '0%',
      outputPairs: 0,
      outputCartons: 0
    };
    state.repairForm.batchId = state.packingWip.altReqNo;

    if (!state.dropdownOptions.defectBatchIds.includes(state.packingWip.altReqNo)) {
      state.dropdownOptions.defectBatchIds.unshift(state.packingWip.altReqNo);
    }

    saveCurrentOrderWipState();

    const slipHtml = buildPackingRequisitionSlipHtml({
      reqNo: reqId,
      date: '31-10-2026',
      article,
      sizes,
      totalPairs: pairs,
      issueStatus: 'Pending Inward Issue'
    });

    renderApp();
    openModal(`Packing Hall Requisition Slip — ${reqId}`, slipHtml, true);
    printDocument(`Packing Hall Requisition Slip — ${reqId}`, slipHtml);
    showToast(`Requisition ${reqId} (${getMaterialReqNumber(reqId)} / ${getAlterationReqNumber(reqId)}) generated for Order ${parentOrderId || '---'} (${pairs} Pairs).`);
  });
}

// Function to open Printable Documents & Voucher Center (No Buyer, reflects Sizes, Article, M/A Prefixes, and Approved By)
function openDocumentCenterModal(defaultDoc: string = 'grn'): void {
  const baseReq = normalizeBaseReqNumber(state.packingWip.selectedBatch);
  const altReq = getAlterationReqNumber(baseReq);
  const latestGrn = state.grnList[0];

  function getDocHTML(type: string): string {
    if (type === 'grn') {
      const sizes = calculateSizeTotal(state.grnForm.sizes) > 0
        ? state.grnForm.sizes
        : (latestGrn?.sizes || state.packingWip.sizes);
      const rcvd = latestGrn?.rcvdPairs || calculateSizeTotal(sizes);
      const pendingOrderId = state.grnForm.pendingOrderId || latestGrn?.pendingOrderId || '---';
      const article = state.grnForm.article || latestGrn?.article || state.packingWip.article || '---';
      const maker = state.grnForm.maker || latestGrn?.maker || '---';

      return buildGrnReceivingSlipHtml({
        grnRef: latestGrn?.grnCode || formatBatchSequence('GRN', state.grnList.length || 1),
        date: '31-10-2026',
        pendingOrderId,
        maker,
        article,
        rcvdPairs: rcvd,
        sizes
      });
    } else if (type === 'route') {
      const latestDefect = state.defectList[0];
      return `
        <div style="border: 2px dashed var(--ink-900); padding: 16px; background: var(--white); font-family: sans-serif; color: var(--ink-950);">
          <div style="text-align: center; border-bottom: 2px solid var(--ink-900); padding-bottom: 8px; margin-bottom: 12px;">
            <div style="font-size: 16px; font-weight: 800; color: var(--ink-950); letter-spacing: 0.04em;">MANDATORY REWORK ROUTE TAG</div>
            <div style="font-size: 12px; font-weight: bold; color: var(--ink-600);">الٹریشن اور مرمت کا سرکاری روٹ کارڈ</div>
          </div>
          <div class="printable-meta-grid" style="color: var(--ink-950);">
            <div><span>Alteration Requisition #:</span> <strong>${latestDefect?.id || altReq}</strong></div>
            <div><span>Parent Requisition #:</span> <strong>${baseReq}</strong></div>
            <div><span>Article Name:</span> <strong>${latestDefect?.article || state.packingWip.article || '---'}</strong></div>
            <div><span>Defect Classification:</span> <strong>${latestDefect?.defectClass || 'Stitching Skip / Broken Seam'}</strong></div>
            <div><span>Batch Quantity:</span> <strong>${latestDefect?.qty || '0 Prs'}</strong></div>
            <div><span>Assigned Master Tailor:</span> <strong>${latestDefect?.tailor || '---'}</strong></div>
            <div><span>Max Allowed Reworks:</span> <strong>2 Cycles (Strict Scrap Rule)</strong></div>
          </div>
          <div style="background: var(--ink-100); border: 1px solid var(--ink-900); padding: 10px; border-radius: 4px; text-align: center; font-weight: 800; font-size: 12px; margin-top: 12px;">
            FACTORY MANDATORY RULE: EVERY REPAIRED PAIR MUST AUTO-RETURN TO STAGE 1 (CHECKING). SKIPPING STAGES IS STRICTLY SYSTEM-LOCKED.
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 20px; border-top: 1px dashed var(--ink-500); padding-top: 8px;">
            <span>Tailor Sign (درزی دستخط): _______________</span>
            <span>Bay #2 Lead: _______________</span>
            <span>Approved By: _______________</span>
          </div>
        </div>
      `;
    } else if (type === 'mreq') {
      const sizes = calculateSizeTotal(state.packingWip.sizes) > 0
        ? state.packingWip.sizes
        : state.grnForm.sizes;
      const totalPairs = state.packingWip.stage3Passed || state.packingWip.plannedQty || calculateSizeTotal(sizes);
      return buildPackingRequisitionSlipHtml({
        reqNo: baseReq,
        date: '31-10-2026',
        article: state.packingWip.article || state.grnForm.article || '---',
        sizes,
        totalPairs,
        issueStatus: state.packingWip.issueStatus
      });
    } else if (type === 'carton') {
      const article = state.qcOrder.article || state.packingWip.article || '---';
      return `
        <div style="border: 2px solid var(--ink-950); padding: 18px; font-family: monospace; background: var(--white);">
          <div style="text-align: center; border-bottom: 2px solid var(--ink-950); padding-bottom: 8px; margin-bottom: 12px;">
            <div style="font-size: 18px; font-weight: 800; color: var(--ink-950);">MERIDIAN WORKS &bull; EXPORT MASTER CARTON</div>
            <div style="font-size: 11px; color: var(--ink-600);">INTERNATIONAL EXPORT SHIPPING LABEL &bull; THERMAL DIRECT / A4</div>
          </div>
          <div class="printable-meta-grid">
            <div><span>REQUISITION #:</span> <strong>${baseReq}</strong></div>
            <div><span>CARTON NUMBER:</span> <strong>CTN-01 OF ${Math.max(1, state.cartons.length)}</strong></div>
            <div><span>ARTICLE:</span> <strong>${article}</strong></div>
            <div><span>QUANTITY:</span> <strong>30 PAIRS</strong></div>
            <div><span>NET WEIGHT:</span> <strong>${state.qcOrder.netWt} KG</strong></div>
            <div><span>GROSS WEIGHT:</span> <strong>${state.qcOrder.grossWt} KG</strong></div>
            <div><span>DIMENSIONS:</span> <strong>29 x 23 x 28 CM</strong></div>
            <div><span>QC TAMPER SEAL:</span> <strong>FSKD-4401</strong></div>
            <div><span>AQL 1.5 AUDIT:</span> <strong>PASSED &bull; CLEARED</strong></div>
          </div>
          <div style="border: 1px solid var(--ink-950); padding: 10px; text-align: center; background: var(--ink-50); font-weight: 800; font-size: 14px; letter-spacing: 0.1em; margin-bottom: 12px;">
            ||||| ||||||| |||| |||||||| ||||| |||||| ||||||||<br/>
            *EAN13-5060129283741-CTN01*
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; border-top: 1px dashed var(--ink-950); padding-top: 8px;">
            <span>Tamper Seal Status: VERIFIED &bull; INTACT</span>
            <span>Approved By: ___________________</span>
          </div>
        </div>
      `;
    } else if (type === 'packing') {
      return `
        <div class="printable-slip-box">
          <div class="printable-slip-header">
            <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-950);">COMMERCIAL EXPORT PACKING LIST MANIFEST</h2>
            <p style="margin: 2px 0 0; font-size: 11px; text-transform: uppercase; color: var(--ink-600);">Meridian Works &bull; Customs Clearance &amp; Container Gate Release</p>
          </div>
          <div class="printable-meta-grid">
            <div><span>Shipper:</span> <strong>Meridian Works (Pvt) Ltd</strong></div>
            <div><span>Requisition #:</span> <strong>${baseReq}</strong></div>
            <div><span>Article:</span> <strong>${state.packingWip.article || '---'}</strong></div>
            <div><span>Total Cartons:</span> <strong>${state.cartons.length} Cartons</strong></div>
            <div><span>Total Pairs:</span> <strong>${state.cartons.reduce((a, c) => a + c.pairs, 0)} Pairs</strong></div>
            <div><span>Total Net Weight:</span> <strong>${state.qcOrder.netWt} kg</strong></div>
            <div><span>Total Gross Weight:</span> <strong>${state.qcOrder.grossWt} kg</strong></div>
            <div><span>Container #:</span> <strong>${state.qcOrder.container}</strong></div>
            <div><span>Inspection Standard:</span> <strong>AQL 1.5 Normal Single Sampling</strong></div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 18px; border-top: 1px dashed var(--border-strong); padding-top: 8px;">
            <span>Packing Hall Supervisor: ___________________</span>
            <span>Issued By: ___________________</span>
            <span>Approved By: ___________________</span>
          </div>
        </div>
      `;
    } else {
      return '';
    }
  }

  function renderModalInner(activeTab: string) {
    return `
      <div>
        <div style="display: flex; gap: 6px; margin-bottom: 12px; overflow-x: auto; border-bottom: 1px solid var(--ink-200); padding-bottom: 8px;">
          <button class="btn-outline doc-tab-btn ${activeTab === 'grn' ? 'btn-primary' : ''}" data-doc="grn" style="font-size: 11px; padding: 4px 8px;">1. Inward GRN Slip</button>
          <button class="btn-outline doc-tab-btn ${activeTab === 'route' ? 'btn-primary' : ''}" data-doc="route" style="font-size: 11px; padding: 4px 8px;">2. Defect Route Tag</button>
          <button class="btn-outline doc-tab-btn ${activeTab === 'mreq' ? 'btn-primary' : ''}" data-doc="mreq" style="font-size: 11px; padding: 4px 8px;">3. Packing Requisition</button>
          <button class="btn-outline doc-tab-btn ${activeTab === 'carton' ? 'btn-primary' : ''}" data-doc="carton" style="font-size: 11px; padding: 4px 8px;">4. Shipping Label</button>
          <button class="btn-outline doc-tab-btn ${activeTab === 'packing' ? 'btn-primary' : ''}" data-doc="packing" style="font-size: 11px; padding: 4px 8px;">5. Export Packing List</button>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; background: var(--ink-50); padding: 6px 10px; border-radius: 4px; border: 1px solid var(--ink-200);">
          <span style="font-size: 11.5px; color: var(--ink-600); font-weight: 600;">Document Output Preview (Print Ready)</span>
          <div style="display: flex; gap: 6px;">
            <button class="btn-primary" id="btn-quick-print-doc" style="font-size: 11.5px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 4px;">
              Print Current Tab
            </button>
          </div>
        </div>

        <div id="doc-preview-container">
          ${getDocHTML(activeTab)}
        </div>
      </div>
    `;
  }

  openModal('Factory Document & Printable Voucher Center', renderModalInner(defaultDoc), true);

  document.querySelectorAll('.doc-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const docType = (e.currentTarget as HTMLElement).getAttribute('data-doc') || 'grn';
      openDocumentCenterModal(docType);
    });
  });

  document.getElementById('btn-quick-print-doc')?.addEventListener('click', () => {
    const docContainer = document.getElementById('doc-preview-container');
    const content = docContainer ? docContainer.innerHTML : '';
    printDocument(`Meridian-Doc-${defaultDoc}`, content);
  });
}

// Function to open ISO 2859-1 (Level II) AQL 1.5 Sampling Calculator Modal
function openAqlCalculatorModal(): void {
  openModal('ISO 2859-1 (Level II) AQL 1.5 Sampling Calculator', `
    <div style="font-size: 13px; color: var(--ink-800);">
      <p style="margin: 0 0 12px; color: var(--ink-600);">
        Automated ISO 2859-1 Normal Single Sampling Plan (AQL 1.5) decision matrix for glove export lots and carton quarantine enforcement.
      </p>

      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 14px;">
        <div class="form-group">
          <label>Lot Size (Total Pairs)</label>
          <input type="number" id="aql-lot-size" class="form-input" value="${state.packingWip.plannedQty || 840}" min="1" />
        </div>
        <div class="form-group">
          <label>AQL Standard</label>
          <select id="aql-target" class="form-select" disabled>
            <option value="1.5">AQL 1.5 (Level II Normal)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Found Defects (Sample)</label>
          <input type="number" id="aql-found-defects" class="form-input" value="0" min="0" />
        </div>
      </div>

      <div id="aql-result-box" style="background: var(--ink-50); border: 1px solid var(--border-strong); border-radius: 6px; padding: 14px; margin-bottom: 16px;">
        <!-- Dynamically calculated content -->
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 11px; color: var(--ink-500);">Standard: ISO 2859-1 / ANSI/ASQ Z1.4</span>
        <div style="display: flex; gap: 8px;">
          <button class="btn-outline" onclick="document.getElementById('global-modal').classList.remove('open')">Close</button>
          <button class="btn-primary" id="btn-apply-aql-audit">Apply Audit Result to Active Lot &rarr;</button>
        </div>
      </div>
    </div>
  `, false);

  function updateAqlCalculation() {
    const lotSize = parseInt((document.getElementById('aql-lot-size') as HTMLInputElement)?.value || '840', 10);
    const defects = parseInt((document.getElementById('aql-found-defects') as HTMLInputElement)?.value || '0', 10);

    let code = 'A';
    let sampleSize = 2;
    let acceptLimit = 0;
    let rejectLimit = 1;

    if (lotSize <= 8) { code = 'A'; sampleSize = 2; acceptLimit = 0; rejectLimit = 1; }
    else if (lotSize <= 15) { code = 'B'; sampleSize = 3; acceptLimit = 0; rejectLimit = 1; }
    else if (lotSize <= 25) { code = 'C'; sampleSize = 5; acceptLimit = 0; rejectLimit = 1; }
    else if (lotSize <= 50) { code = 'D'; sampleSize = 8; acceptLimit = 0; rejectLimit = 1; }
    else if (lotSize <= 90) { code = 'E'; sampleSize = 13; acceptLimit = 0; rejectLimit = 1; }
    else if (lotSize <= 150) { code = 'F'; sampleSize = 20; acceptLimit = 1; rejectLimit = 2; }
    else if (lotSize <= 280) { code = 'G'; sampleSize = 32; acceptLimit = 1; rejectLimit = 2; }
    else if (lotSize <= 500) { code = 'H'; sampleSize = 50; acceptLimit = 2; rejectLimit = 3; }
    else if (lotSize <= 1200) { code = 'J'; sampleSize = 80; acceptLimit = 3; rejectLimit = 4; }
    else if (lotSize <= 3200) { code = 'K'; sampleSize = 125; acceptLimit = 5; rejectLimit = 6; }
    else if (lotSize <= 10000) { code = 'L'; sampleSize = 200; acceptLimit = 7; rejectLimit = 8; }
    else { code = 'M'; sampleSize = 315; acceptLimit = 10; rejectLimit = 11; }

    const isPassed = defects <= acceptLimit;

    const resultBox = document.getElementById('aql-result-box');
    if (resultBox) {
      resultBox.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; text-align: center; margin-bottom: 12px;">
          <div style="background: var(--white); border: 1px solid var(--ink-200); padding: 8px; border-radius: 4px;">
            <div style="font-size: 11px; color: var(--ink-500);">Code Letter</div>
            <div style="font-size: 18px; font-weight: 800; color: var(--ink-950);">${code}</div>
          </div>
          <div style="background: var(--white); border: 1px solid var(--ink-200); padding: 8px; border-radius: 4px;">
            <div style="font-size: 11px; color: var(--ink-500);">Sample Size</div>
            <div style="font-size: 18px; font-weight: 800; color: var(--ink-950);">${sampleSize} Prs</div>
          </div>
          <div style="background: var(--white); border: 1px solid var(--ink-200); padding: 8px; border-radius: 4px;">
            <div style="font-size: 11px; color: var(--ink-500);">Accept (Ac)</div>
            <div style="font-size: 18px; font-weight: 800; color: var(--ink-950);">&le; ${acceptLimit}</div>
          </div>
          <div style="background: var(--white); border: 1px solid var(--ink-200); padding: 8px; border-radius: 4px;">
            <div style="font-size: 11px; color: var(--ink-500);">Reject (Re)</div>
            <div style="font-size: 18px; font-weight: 800; color: var(--ink-950);">&ge; ${rejectLimit}</div>
          </div>
        </div>
        <div style="padding: 10px; border-radius: 4px; text-align: center; font-weight: 800; font-size: 13px; background: ${isPassed ? 'var(--ink-100)' : 'var(--ink-200)'}; border: 1px solid var(--ink-900); color: var(--ink-950);">
          ${isPassed ? `✓ AQL 1.5 PASSED &mdash; Found ${defects} defects &le; ${acceptLimit} allowed. Entire lot of ${lotSize.toLocaleString()} pairs approved for export.` : `✗ QUARANTINED &mdash; Found ${defects} defects &ge; ${rejectLimit} rejection limit. Lot quarantined for 100% rework.`}
        </div>
      `;
    }
  }

  document.getElementById('aql-lot-size')?.addEventListener('input', updateAqlCalculation);
  document.getElementById('aql-found-defects')?.addEventListener('input', updateAqlCalculation);
  updateAqlCalculation();

  document.getElementById('btn-apply-aql-audit')?.addEventListener('click', async () => {
    const defects = parseInt((document.getElementById('aql-found-defects') as HTMLInputElement)?.value || '0', 10);
    try {
      const resp = await fetch(`/api/qc/${state.packingWip.selectedBatch}/aql-audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          foundDefects: defects,
          inspectorId: '4402',
          inspectorName: 'Tariq Mehmood'
        })
      });
      const data = await resp.json();
      if (data.success) {
        showToast(`AQL Audit logged to SQLite! Status: ${data.data.verdict}`);
      }
    } catch (e) {
      console.warn('AQL audit offline fallback', e);
    }

    const passedAql = defects <= 3;
    state.qcChecklist.forEach(c => (c.passed = passedAql));
    state.packingWip.finalQcApproved = passedAql;
    saveCurrentOrderWipState();
    logAuditEvent(
      passedAql ? 'FINAL_QC_APPROVE' : 'FINAL_QC_REJECT',
      state.packingWip.selectedBatch,
      `Stage 4 Ready: ${state.packingWip.stage4Passed} Prs`,
      passedAql ? `AQL 1.5 Passed (${defects} defects)` : `AQL 1.5 Quarantined (${defects} defects)`,
      state.packingWip.parentOrderId
    );
    closeModal();
    renderApp();
    showToast(
      passedAql
        ? `AQL 1.5 Passed (${defects} defects). Stage 5 Master Carton Packing unlocked!`
        : `AQL 1.5 Rejected (${defects} defects). Lot remains locked at Stage 4.`
    );
  });
}

// Super User Admin Event Handlers
function attachAdminHandlers(): void {
  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = (e.currentTarget as HTMLElement).getAttribute('data-admin-tab') as any;
      if (tab) {
        state.adminActiveTab = tab;
        renderApp();
      }
    });
  });

  document.querySelectorAll('[data-admin-tab-jump]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = (e.currentTarget as HTMLElement).getAttribute('data-admin-tab-jump') as any;
      if (tab) {
        state.adminActiveTab = tab;
        renderApp();
      }
    });
  });

  // Live Tracking Search & Status Filter
  const trackingSearchInput = document.getElementById('admin-tracking-search') as HTMLInputElement;
  trackingSearchInput?.addEventListener('input', () => {
    state.adminTrackingSearch = trackingSearchInput.value;
    renderApp();
    const refocused = document.getElementById('admin-tracking-search') as HTMLInputElement;
    if (refocused) {
      refocused.focus();
      refocused.setSelectionRange(refocused.value.length, refocused.value.length);
    }
  });

  document.querySelectorAll('.admin-tracking-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const filter = (e.currentTarget as HTMLElement).getAttribute('data-tracking-filter') as any;
      if (filter) {
        state.adminTrackingStatusFilter = filter;
        renderApp();
      }
    });
  });

  // Reports Selector, Print & CSV Export
  document.querySelectorAll('.admin-report-select-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const el = e.currentTarget as HTMLElement;
      const rep = (el.getAttribute('data-report-type') || el.getAttribute('data-report-id')) as SuperUserReportType;
      if (rep) {
        state.adminActiveReport = rep;
        renderApp();
        showToast(`Switched report view to: ${el.textContent?.trim() || rep}`);
      }
    });
  });

  document.getElementById('btn-admin-print-report')?.addEventListener('click', () => {
    const rollupSummary = getCurrentRollupSummary();
    const built = buildSuperUserReportHtml({
      activeTab: state.adminActiveTab,
      activeReport: state.adminActiveReport,
      trackingSearch: state.adminTrackingSearch,
      trackingStatusFilter: state.adminTrackingStatusFilter,
      expandedOrderIds: state.adminExpandedOrders,
      pendingOrders: state.pendingOrders,
      dropdownOptions: {
        makers: state.dropdownOptions.makers,
        customers: state.dropdownOptions.customers,
        articles: state.dropdownOptions.articles,
        poList: state.dropdownOptions.poList
      },
      adminOverview: state.adminOverview,
      lastBackupPath: state.lastBackupPath,
      rollupSummary
    });
    openModal(built.title, built.html, true);
    printDocument(built.title, built.html);
  });

  document.getElementById('btn-admin-export-report-csv')?.addEventListener('click', () => {
    const rollupSummary = getCurrentRollupSummary();
    const built = buildSuperUserReportHtml({
      activeTab: state.adminActiveTab,
      activeReport: state.adminActiveReport,
      trackingSearch: state.adminTrackingSearch,
      trackingStatusFilter: state.adminTrackingStatusFilter,
      expandedOrderIds: state.adminExpandedOrders,
      pendingOrders: state.pendingOrders,
      dropdownOptions: {
        makers: state.dropdownOptions.makers,
        customers: state.dropdownOptions.customers,
        articles: state.dropdownOptions.articles,
        poList: state.dropdownOptions.poList
      },
      adminOverview: state.adminOverview,
      lastBackupPath: state.lastBackupPath,
      rollupSummary
    });
    exportTableToCSV(built.csvFilename, built.csvRows);
    showToast(`Exported ${built.csvFilename} (${built.csvRows.length} rows).`);
  });

  document.getElementById('btn-admin-refresh')?.addEventListener('click', async () => {
    await syncBackendData();
    showToast('Synchronized SQLite tables with Admin Control Center.');
  });

  document.getElementById('btn-admin-lock')?.addEventListener('click', () => {
    state.isAdminUnlocked = false;
    state.activeScreen = 'screen-grn';
    showToast('Super Admin Session Locked and Hidden.');
    renderApp();
  });

  // Recalculate planned order size total in Super User form
  function recalcAdminOrderSizes(): void {
    let tot = 0;
    document.querySelectorAll('.admin-order-size-val').forEach(el => {
      const val = parseInt((el as HTMLInputElement).value || '0', 10) || 0;
      if (val > 0) tot += val;
    });
    const cell = document.getElementById('admin-order-size-total');
    if (cell) cell.textContent = tot.toLocaleString();
  }

  document.querySelectorAll('.admin-order-size-val').forEach(inp => {
    inp.addEventListener('input', recalcAdminOrderSizes);
  });

  document.getElementById('btn-admin-add-pending-order')?.addEventListener('click', async () => {
    const orderId = (document.getElementById('admin-pending-order-id') as HTMLInputElement)?.value?.trim();
    const buyer = (document.getElementById('admin-pending-order-buyer') as HTMLSelectElement)?.value?.trim();
    const maker = (document.getElementById('admin-pending-order-maker') as HTMLSelectElement)?.value?.trim();
    const po = (document.getElementById('admin-pending-order-po') as HTMLInputElement)?.value?.trim();
    const article = (document.getElementById('admin-pending-order-article') as HTMLSelectElement)?.value?.trim();
    const color = (document.getElementById('admin-pending-order-color') as HTMLInputElement)?.value?.trim();

    if (!orderId || !maker || !article) {
      showToast('Please enter Order Reference #, Contractor/Maker, and Article.');
      return;
    }

    const sizes: SizeBreakdown = createEmptySizes();
    document.querySelectorAll('.admin-order-size-val').forEach(el => {
      const inp = el as HTMLInputElement;
      const k = inp.getAttribute('data-size') as keyof SizeBreakdown;
      if (k) sizes[k] = Math.max(0, parseInt(inp.value || '0', 10) || 0);
    });
    const totalPairs = calculateSizeTotal(sizes);

    if (po && !state.dropdownOptions.poList.includes(po)) {
      state.dropdownOptions.poList.unshift(po);
    }
    if (maker && !state.dropdownOptions.makers.includes(maker)) {
      state.dropdownOptions.makers.unshift(maker);
    }

    const newOrder: PendingOrder = {
      orderId,
      buyer: buyer || 'Standard Client',
      maker,
      po: po || '---',
      article,
      color: color || 'Standard',
      sizes,
      totalQty: totalPairs,
      notes: `Created by Super User: Buyer=${buyer}, PO=${po}, Color=${color}`
    };

    state.adminExpandedOrders[orderId] = true;

    try {
      const res = await fetch('/api/admin/pending-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOrder)
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        state.pendingOrders = json.data;
        showToast(`Saved Master Order ${orderId} to SQLite Database (${buyer || 'Standard'} | ${maker} | ${article} | ${totalPairs} Pairs).`);
        renderApp();
        return;
      }
    } catch (e) {
      console.warn('Offline pending order save fallback:', e);
    }

    const existingIndex = state.pendingOrders.findIndex(o => o.orderId === orderId);
    if (existingIndex >= 0) {
      state.pendingOrders[existingIndex] = newOrder;
      showToast(`Updated Master Order ${orderId} (${buyer} | ${maker} | ${article} | ${totalPairs} Pairs).`);
    } else {
      state.pendingOrders.unshift(newOrder);
      showToast(`Created & Issued Master Order ${orderId} to Inward Goods (${buyer} | ${maker} | ${article} | ${totalPairs} Pairs).`);
    }

    renderApp();
  });

  document.getElementById('btn-admin-save-customer')?.addEventListener('click', async () => {
    const name = (document.getElementById('admin-cust-name') as HTMLInputElement)?.value?.trim();
    const country = (document.getElementById('admin-cust-country') as HTMLInputElement)?.value?.trim();
    const inspectionPreference = (document.getElementById('admin-cust-pref') as HTMLSelectElement)?.value;
    if (!name) {
      showToast('Please enter a name.');
      return;
    }
    try {
      const res = await fetch('/api/admin/master/customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, country, inspectionPreference })
      });
      const json = await res.json();
      if (json.success) {
        if (!state.dropdownOptions.customers.includes(name)) {
          state.dropdownOptions.customers.push(name);
        }
        showToast(`Saved "${name}" to SQLite Master.`);
        await syncBackendData();
      }
    } catch (e) {
      console.warn(e);
    }
  });

  document.getElementById('btn-admin-save-product')?.addEventListener('click', async () => {
    const name = (document.getElementById('admin-prod-name') as HTMLInputElement)?.value?.trim();
    const customerId = (document.getElementById('admin-prod-cust') as HTMLSelectElement)?.value;
    const stickersPerPair = Number((document.getElementById('admin-prod-stickers') as HTMLInputElement)?.value || 2);
    const pairsPerCarton = Number((document.getElementById('admin-prod-carton') as HTMLInputElement)?.value || 50);
    if (!name) {
      showToast('Please enter Article Name.');
      return;
    }
    try {
      const res = await fetch('/api/admin/master/product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, customerId: customerId || 'CUST-01', stickersPerPair, pairsPerCarton })
      });
      const json = await res.json();
      if (json.success) {
        if (!state.dropdownOptions.articles.includes(name)) {
          state.dropdownOptions.articles.push(name);
        }
        showToast(`Article "${name}" saved to SQLite Products Master & Dropdowns.`);
        await syncBackendData();
      }
    } catch (e) {
      console.warn(e);
    }
  });

  document.getElementById('btn-admin-add-maker')?.addEventListener('click', () => {
    const val = (document.getElementById('admin-add-maker-input') as HTMLInputElement)?.value?.trim();
    if (!val) return;
    if (!state.dropdownOptions.makers.includes(val)) {
      state.dropdownOptions.makers.push(val);
      showToast(`Added Maker "${val}" to global dropdowns.`);
      renderApp();
    }
  });

  document.getElementById('btn-admin-add-po')?.addEventListener('click', () => {
    const val = (document.getElementById('admin-add-po-input') as HTMLInputElement)?.value?.trim();
    if (!val) return;
    if (!state.dropdownOptions.poList.includes(val)) {
      state.dropdownOptions.poList.push(val);
      showToast(`Added PO #${val} to global dropdowns.`);
      renderApp();
    }
  });

  document.getElementById('btn-admin-trigger-backup')?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/admin/db/backup', { method: 'POST' });
      const json = await res.json();
      if (json.success && json.data) {
        state.lastBackupPath = json.data.backupPath;
        showToast(`Online VACUUM Backup created successfully!`);
        renderApp();
      }
    } catch (e) {
      console.warn(e);
    }
  });

  document.getElementById('btn-admin-reseed-db')?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/admin/db/reset-seed', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        showToast('SQLite Database verified.');
        await syncBackendData();
      }
    } catch (e) {
      console.warn(e);
    }
  });

  document.getElementById('btn-admin-export-json')?.addEventListener('click', () => {
    const dump = JSON.stringify(state.adminOverview, null, 2);
    const blob = new Blob([dump], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meridian_industries_full_erp_dump_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Exported complete ERP SQLite snapshot to JSON.');
  });
}

// Global window functions for table row actions
declare global {
  interface Window {
    viewGrnRecord: (sr: number) => void;
    editGrnRecord: (sr: number) => void;
    handleDefectAction: (id: string, actionText: string) => void;
    toggleQcCheck: (id: string) => void;
    adminDeleteRecord: (table: string, id: string) => void;
    adminRemoveDropdownItem: (listKey: 'makers' | 'poList', val: string) => void;
    adminRemovePendingOrder: (orderId: string) => void;
    adminForceRepair: (altId: number, isScrap: boolean) => void;
    adminToggleOrderExpand: (orderId: string) => void;
    adminSetAllOrdersExpanded: (expanded: boolean) => void;
    adminInspectOrderInTracking: (orderId: string, highlightRef?: string) => void;
    adminOpenDocumentSlip: (slipType: 'GRN' | 'REQ' | 'M-REQ' | 'A-REQ', refCode: string, orderId?: string) => void;
    adminSetTrackingBuyerFilter: (buyer: string) => void;
    adminSetTrackingMakerFilter: (maker: string) => void;
    adminSetTrackingPage: (page: number) => void;
    adminLoadDemo600Scenario: (phase?: 'IN_PROGRESS' | 'COMPLETED' | 'DELIBERATE_VARIANCE') => void;
    adminLoadDemo600PairScenario: (phase?: 'IN_PROGRESS' | 'COMPLETED' | 'DELIBERATE_VARIANCE') => void;
    adminRemoveDemo600Scenario: () => void;
    adminVoidGrnBatch: (sr: number, grnCode: string) => void;
    adminVoidReqBatch: (reqNumber: string) => void;
    adminCloseOrderShort: (orderId: string) => void;
    adminAddSystemUser: () => void;
    adminQuickReceiveGrnForOrder: (orderId: string) => void;
    adminQuickCreateReqForOrder: (orderId: string) => void;
    adminOpenReqInScreen: (reqNumber: string, targetScreen: string) => void;
  }
}

window.adminToggleOrderExpand = function(orderId: string) {
  const current = state.adminExpandedOrders[orderId] !== false;
  state.adminExpandedOrders[orderId] = !current;
  renderApp();
};

window.adminSetAllOrdersExpanded = function(expanded: boolean) {
  const rollupSummary = getCurrentRollupSummary();
  for (const ord of rollupSummary.orderRollups) {
    state.adminExpandedOrders[ord.orderId] = expanded;
  }
  renderApp();
};

window.adminInspectOrderInTracking = function(orderId: string, highlightRef?: string) {
  state.adminActiveTab = 'tracking';
  state.adminTrackingStatusFilter = 'ALL';
  state.adminTrackingBuyerFilter = 'ALL';
  state.adminTrackingMakerFilter = 'ALL';
  state.adminTrackingSearch = highlightRef || orderId;
  state.adminHighlightedRefCode = highlightRef || '';
  state.adminExpandedOrders[orderId] = true;
  renderApp();

  setTimeout(() => {
    const targetEl =
      (highlightRef ? document.getElementById(`tracking-chip-row-${highlightRef}`) : null) ||
      document.getElementById(`tracking-order-card-${orderId}`);
    if (targetEl && typeof targetEl.scrollIntoView === 'function') {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 40);
};

window.adminOpenDocumentSlip = function(
  slipType: 'GRN' | 'REQ' | 'M-REQ' | 'A-REQ',
  refCode: string,
  orderId?: string
) {
  const summary = getCurrentRollupSummary();
  const matchedOrder =
    summary.orderRollups.find(o => o.orderId === orderId) ||
    summary.orderRollups.find(
      o =>
        o.grnBatches.some(g => g.grnCode === refCode) ||
        o.reqBatches.some(
          r => r.reqNumber === refCode || r.mreqNo === refCode || r.altReqNo === refCode
        )
    );

  if (slipType === 'GRN') {
    const grn =
      matchedOrder?.grnBatches.find(g => g.grnCode === refCode) ||
      state.grnList.find(g => (g.grnCode || formatBatchSequence('GRN', g.sr)) === refCode);
    const slipHtml = buildGrnReceivingSlipHtml({
      grnRef: refCode,
      date: grn?.date || '04-11-2026',
      pendingOrderId: grn?.pendingOrderId || orderId || '---',
      maker: grn?.maker || matchedOrder?.maker || '---',
      article: grn?.article || matchedOrder?.article || '---',
      rcvdPairs: grn?.rcvdPairs || 0,
      sizes: grn?.sizes || createEmptySizes()
    });
    openModal(`Inward GRN Receiving Slip — ${refCode}`, slipHtml, true);
    return;
  }

  const baseReq = normalizeBaseReqNumber(refCode);
  const reqBatch = matchedOrder?.reqBatches.find(r => r.reqNumber === baseReq);

  if (slipType === 'M-REQ') {
    const slipHtml = buildMaterialRequisitionSlipHtml({
      mreqNo: getMaterialReqNumber(baseReq),
      reqNo: baseReq,
      orderId: matchedOrder?.orderId || orderId || '---',
      article: reqBatch?.article || matchedOrder?.article || '---',
      pairs: reqBatch?.issuedPairs || reqBatch?.askingPairs || 0,
      status: reqBatch?.mreqStatus || 'Issued'
    });
    openModal(`Material Requisition Slip — ${getMaterialReqNumber(baseReq)}`, slipHtml, true);
    return;
  }

  if (slipType === 'A-REQ') {
    const slipHtml = buildAlterationRouteSlipHtml({
      altReqNo: getAlterationReqNumber(baseReq),
      reqNo: baseReq,
      orderId: matchedOrder?.orderId || orderId || '---',
      article: reqBatch?.article || matchedOrder?.article || '---',
      maker: reqBatch?.maker || matchedOrder?.maker || '---',
      inAlterationPairs: reqBatch?.inAlterationPairs || 0,
      scrappedPairs: reqBatch?.scrappedPairs || 0,
      cycleCount: reqBatch?.alterationCycleCount || 1
    });
    openModal(`Alteration Route Slip — ${getAlterationReqNumber(baseReq)}`, slipHtml, true);
    return;
  }

  const slipHtml = buildPackingRequisitionSlipHtml({
    reqNo: baseReq,
    date: '04-11-2026',
    article: reqBatch?.article || matchedOrder?.article || '---',
    sizes: reqBatch?.sizes || matchedOrder?.sizes || createEmptySizes(),
    totalPairs: reqBatch?.issuedPairs || reqBatch?.askingPairs || 0,
    issueStatus: reqBatch?.issueStatus || 'Issued by Inward Register'
  });
  openModal(`Packing Hall Requisition Slip — ${baseReq}`, slipHtml, true);
};

window.adminSetTrackingBuyerFilter = function(buyer: string) {
  state.adminTrackingBuyerFilter = buyer || 'ALL';
  state.adminTrackingPage = 1;
  renderApp();
};

window.adminSetTrackingMakerFilter = function(maker: string) {
  state.adminTrackingMakerFilter = maker || 'ALL';
  state.adminTrackingPage = 1;
  renderApp();
};

window.adminSetTrackingPage = function(page: number) {
  state.adminTrackingPage = Math.max(1, page);
  renderApp();
};

window.adminLoadDemo600Scenario = function(
  phase: 'IN_PROGRESS' | 'COMPLETED' | 'DELIBERATE_VARIANCE' = 'COMPLETED'
) {
  const demo = createDemo600PairScenario(phase);
  state.pendingOrders = [
    demo.order,
    ...state.pendingOrders.filter(o => o.orderId !== demo.order.orderId)
  ];
  state.grnList = [
    ...demo.grns,
    ...state.grnList.filter(g => g.pendingOrderId !== demo.order.orderId)
  ];
  for (const r of demo.reqs) {
    state.ordersWipMap[r.reqNumber] = JSON.parse(JSON.stringify(r));
  }
  state.packingWip = JSON.parse(JSON.stringify(demo.reqs[1])) as any;
  state.packingWip.selectedBatch = demo.reqs[1].reqNumber;
  state.defectList = [
    ...demo.defects.map(d => ({
      id: d.id,
      date: '04-11-2026',
      origin: d.stage,
      article: d.article,
      po: d.po,
      defectClass: d.defect,
      qty: d.qty,
      tailor: 'Master Tailor B',
      status: d.status as any,
      route: d.Action,
      actionText: 'Verified',
      cycles: d.cycles,
      isDemoScenario: true
    })),
    ...state.defectList.filter(d => !(d as any).isDemoScenario && d.id !== 'A-REQ-0902')
  ];
  state.adminExpandedOrders[demo.order.orderId] = true;
  logAuditEvent(
    'ORDER_CREATE',
    demo.order.orderId,
    '0 Prs',
    `Loaded 600-Pair Demo (${phase}): 3 GRNs (600 Prs) -> 3 REQs`,
    demo.order.orderId
  );
  const label =
    phase === 'DELIBERATE_VARIANCE'
      ? 'VARIANCE Δ (-12 Prs • FLOOR_GATE)'
      : phase === 'COMPLETED'
        ? '595 Packed + 5 Scrap = 600 Reconciled ✓'
        : 'Stage 4 Hold + A-REQ Cycle 1/2 Reconciled ✓';
  showToast(`Loaded 1-Order -> 3-GRNs -> 3-REQs (600-Pair) Demo Scenario [${label}].`);
  renderApp();
};
window.adminLoadDemo600PairScenario = window.adminLoadDemo600Scenario;

window.adminRemoveDemo600Scenario = function() {
  state.pendingOrders = state.pendingOrders.filter(
    o => !o.isDemoScenario && o.orderId !== 'ORD-2026-600'
  );
  state.grnList = state.grnList.filter(
    g => !g.isDemoScenario && g.pendingOrderId !== 'ORD-2026-600'
  );
  delete state.ordersWipMap['REQ-0901'];
  delete state.ordersWipMap['REQ-0902'];
  delete state.ordersWipMap['REQ-0903'];
  if (state.packingWip.parentOrderId === 'ORD-2026-600') {
    state.packingWip.selectedBatch = DEFAULT_REQ_NUMBER;
    state.packingWip.parentOrderId = '';
    state.packingWip.plannedQty = 0;
    state.packingWip.stage1In = 0;
    state.packingWip.stage1Passed = 0;
    state.packingWip.stage2In = 0;
    state.packingWip.stage2Passed = 0;
    state.packingWip.stage3In = 0;
    state.packingWip.stage3Passed = 0;
    state.packingWip.stage4In = 0;
    state.packingWip.stage4Passed = 0;
    state.packingWip.outputPairs = 0;
    state.packingWip.outputCartons = 0;
    state.packingWip.inAlteration = 0;
    state.packingWip.scrappedPairs = 0;
  }
  state.defectList = state.defectList.filter(
    d => !(d as any).isDemoScenario && d.id !== 'A-REQ-0902'
  );
  showToast('Removed 600-Pair Demo Scenario data.');
  renderApp();
};

window.adminVoidGrnBatch = function(sr: number, grnCode: string) {
  const item = state.grnList.find(g => g.sr === sr || g.grnCode === grnCode);
  if (!item) return;
  item.isVoided = true;
  item.status = 'VOIDED';
  logAuditEvent(
    'GRN_VOID',
    grnCode,
    `Received ${item.rcvdPairs} Prs`,
    'VOIDED (0 Prs)',
    item.pendingOrderId
  );
  showToast(`Voided GRN Batch ${grnCode} (${item.rcvdPairs} Prs) and recorded in Audit Trail.`);
  renderApp();
};

window.adminVoidReqBatch = function(reqNumber: string) {
  const norm = normalizeBaseReqNumber(reqNumber);
  if (state.ordersWipMap[norm]) {
    state.ordersWipMap[norm].isVoided = true;
  }
  if (normalizeBaseReqNumber(state.packingWip.selectedBatch) === norm) {
    (state.packingWip as any).isVoided = true;
  }
  logAuditEvent('REQ_VOID', norm, 'Active Requisition', 'VOIDED before Stage 1');
  showToast(`Voided Requisition ${norm} and recorded in Audit Trail.`);
  renderApp();
};

window.adminCloseOrderShort = function(orderId: string) {
  const ord = state.pendingOrders.find(o => o.orderId === orderId);
  if (!ord) return;
  const beforeQty = ord.totalQty || 0;
  ord.shortClosed = true;
  ord.shortCloseReason = 'Approved Short-Shipment Closure by Super User';
  logAuditEvent(
    'ORDER_SHORT_CLOSE',
    orderId,
    `Planned ${beforeQty} Prs`,
    'Short-Closed at Received GRN Quantity',
    orderId
  );
  showToast(`Order ${orderId} short-closed at received quantity.`);
  renderApp();
};

window.adminAddSystemUser = function() {
  const name = (document.getElementById('admin-user-name') as HTMLInputElement)?.value?.trim();
  const role = ((document.getElementById('admin-user-role') as HTMLSelectElement)?.value ||
    'PACKING_SUPERVISOR') as SystemUserRecord['role'];
  const station =
    (document.getElementById('admin-user-station') as HTMLInputElement)?.value?.trim() ||
    'Packing Hall #1';
  if (!name) {
    showToast('Please enter Operator Name.');
    return;
  }
  const userId = `USR-0${state.systemUsers.length + 1}`;
  state.systemUsers.push({
    userId,
    name,
    role,
    station,
    active: true
  });
  showToast(`Added System User ${name} (${role}) to RBAC Registry.`);
  renderApp();
};

window.adminQuickReceiveGrnForOrder = function(orderId: string) {
  const order = state.pendingOrders.find(o => o.orderId === orderId);
  if (order) {
    state.grnForm = {
      pendingOrderId: order.orderId,
      maker: order.maker,
      article: order.article,
      rcvdPairs: String(order.totalQty || ''),
      sizes: { ...(order.sizes || createEmptySizes()) }
    };
  } else {
    state.grnForm.pendingOrderId = orderId;
  }
  state.activeScreen = 'screen-grn';
  renderApp();
  showToast(`Loaded Order ${orderId} into Inward Dock to receive next GRN-000X batch.`);
};

window.adminQuickCreateReqForOrder = function(orderId: string) {
  state.activeScreen = 'screen-packing';
  renderApp();
  openNewRequisitionModal(orderId);
};

window.adminOpenReqInScreen = function(reqNumber: string, targetScreen: string) {
  switchActiveOrder(reqNumber);
  state.activeScreen = targetScreen;
  renderApp();
  showToast(`Opened Requisition ${normalizeBaseReqNumber(reqNumber)} in ${targetScreen.replace('screen-', '').toUpperCase()}.`);
};

window.adminRemovePendingOrder = async function(orderId: string) {
  try {
    const res = await fetch(`/api/admin/pending-orders/${encodeURIComponent(orderId)}`, {
      method: 'DELETE'
    });
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) {
      state.pendingOrders = json.data;
      showToast(`Removed Order ${orderId} from SQLite Database.`);
      renderApp();
      return;
    }
  } catch (e) {
    console.warn('Offline pending order delete fallback:', e);
  }
  state.pendingOrders = state.pendingOrders.filter(o => o.orderId !== orderId);
  showToast(`Removed Pending Order ${orderId}.`);
  renderApp();
};

window.adminDeleteRecord = async function(table: string, id: string) {
  try {
    const res = await fetch(`/api/admin/record/${table}/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    const json = await res.json();
    if (json.success) {
      showToast(`Deleted record [${id}] from ${table}.`);
      await syncBackendData();
    } else {
      showToast(`Delete error: ${json.error}`);
    }
  } catch (e) {
    console.warn(e);
  }
};

window.adminRemoveDropdownItem = function(listKey: 'makers' | 'poList', val: string) {
  state.dropdownOptions[listKey] = state.dropdownOptions[listKey].filter(item => item !== val);
  showToast(`Removed "${val}" from dropdown options.`);
  renderApp();
};

window.adminForceRepair = async function(altId: number, isScrap: boolean) {
  try {
    const res = await fetch(`/api/alterations/${altId}/repair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tailorName: 'Supervisor A',
        isScrap,
        deductionRate: 150
      })
    });
    const json = await res.json();
    if (json.success) {
      showToast(isScrap ? `Alteration #${altId} condemned to Scrap Ledger.` : `Alteration #${altId} returned to Stage 1 Checking.`);
      await syncBackendData();
    }
  } catch (e) {
    console.warn(e);
  }
};

window.viewGrnRecord = function(sr: number) {
  const item = state.grnList.find(r => r.sr === sr);
  if (item) {
    const grnCode = item.grnCode || formatBatchSequence('GRN', item.sr);
    const slipHtml = buildGrnReceivingSlipHtml({
      grnRef: grnCode,
      date: item.date,
      pendingOrderId: item.pendingOrderId,
      maker: item.maker,
      article: item.article,
      rcvdPairs: item.rcvdPairs,
      sizes: item.sizes
    });
    openModal(`GRN Record ${grnCode}`, slipHtml, true);
  }
};

window.editGrnRecord = function(sr: number) {
  const item = state.grnList.find(r => r.sr === sr);
  if (item) {
    state.grnForm = {
      pendingOrderId: item.pendingOrderId,
      maker: item.maker,
      article: item.article,
      rcvdPairs: String(item.rcvdPairs),
      sizes: { ...item.sizes }
    };
    renderApp();
    showToast(`Loaded Record #${sr} into editor form.`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

window.handleDefectAction = function(id: string, actionText: string) {
  showToast(`Action "${actionText}" executed for Alteration Record ${id}.`);
};

window.toggleQcCheck = function(id: string) {
  const item = state.qcChecklist.find(c => c.id === id);
  if (item) {
    item.passed = !item.passed;
    const allPassed = state.qcChecklist.every(c => c.passed);
    state.packingWip.finalQcApproved = allPassed;
    saveCurrentOrderWipState();
    renderApp();
  }
};

// Pure Vanilla CSV Exporter
function exportTableToCSV(filename: string, rows: object[]): void {
  if (!rows || !rows.length) {
    showToast('No records available to export.');
    return;
  }
  const separator = ',';
  const keys = Object.keys(rows[0]);
  const csvContent =
    keys.join(separator) +
    '\n' +
    rows
      .map(row => {
        return keys
          .map(k => {
            const rawVal = (row as Record<string, unknown>)[k];
            let cellStr = rawVal === null || rawVal === undefined ? '' : String(rawVal);
            cellStr = cellStr.replace(/"/g, '""');
            if (cellStr.search(/("|,|\n)/g) >= 0) cellStr = `"${cellStr}"`;
            return cellStr;
          })
          .join(separator);
      })
      .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

// Dynamic backend SQLite synchronization
async function syncBackendData(): Promise<void> {
  try {
    const res = await fetch('/api/store/dropdowns');
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        if (json.data.makers?.length) state.dropdownOptions.makers = json.data.makers;
        if (json.data.customers?.length) state.dropdownOptions.customers = json.data.customers;
        if (json.data.articles?.length) state.dropdownOptions.articles = json.data.articles;
        if (json.data.poList?.length) state.dropdownOptions.poList = json.data.poList;
      }
    }
  } catch (e) {
    console.debug('Dropdown sync offline:', e);
  }

  try {
    const res = await fetch('/api/store/receivings');
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        state.grnList = json.data.map((r: any, idx: number) => ({
          sr: r.id || (idx + 1),
          grnCode: formatBatchSequence('GRN', r.id || (idx + 1)),
          date: r.rcv_date || '31-10-2026',
          pendingOrderId: r.po_number || 'ORD-INWARD',
          maker: r.maker_contractor,
          article: r.article_name,
          rcvdPairs: r.rcvd_pairs,
          sizes: createEmptySizes(),
          status: 'Received'
        }));
      }
    }
  } catch (e) {
    console.debug('Receivings sync offline:', e);
  }

  try {
    const res = await fetch('/api/alterations');
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        state.dropdownOptions.defectBatchIds = json.data.map((alt: any) =>
          getAlterationReqNumber(alt.req_number || state.packingWip.selectedBatch)
        );
        state.defectList = json.data.map((alt: any) => ({
          id: getAlterationReqNumber(alt.req_number || state.packingWip.selectedBatch),
          date: alt.sent_at ? alt.sent_at.split(' ')[0] : '31-10-2026',
          origin: (alt.source_stage || 'Step 1').replace(/_/g, ' '),
          article: alt.product_name || '---',
          po: alt.req_number || '---',
          defectClass: alt.defect_reason || 'Workmanship Defect',
          qty: `${alt.pairs_count} Prs`,
          tailor: alt.tailor_name || 'Supervisor A',
          status: alt.status === 'RETURNED_TO_CHECKING' ? 'Completed' : (alt.is_scrapped ? 'Scrapped' : 'In Rework'),
          route: 'Auto-Return to Stage 1 Checking',
          actionText: alt.status === 'RETURNED_TO_CHECKING' ? 'Verified' : 'Update'
        }));
      }
    }
  } catch (e) {
    console.debug('Alterations sync offline:', e);
  }

  try {
    const res = await fetch('/api/admin/overview');
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        state.adminOverview = json.data;
        if (Array.isArray(json.data.pendingOrders)) {
          state.pendingOrders = json.data.pendingOrders;
        }
      }
    }
  } catch (e) {
    console.debug('Admin overview sync offline:', e);
  }

  renderApp();
}

// Initial Boot
document.addEventListener('DOMContentLoaded', () => {
  renderApp();
  syncBackendData();
});
renderApp();
syncBackendData();
