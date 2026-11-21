/**
 * Hammad Industries - Factory ERP & QA Management Portal
 * Tech Stack: Pure Vanilla HTML5 / CSS / JavaScript (Zero External Libraries)
 * Clean Real Data Entry Mode: All mockup details removed; unified Requisition with M/A prefixes.
 */

import {
  SizeBreakdown,
  PendingOrder,
  HallWithStitchers,
  STANDARD_GLOVE_SIZES,
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
  computeWipRolledYieldPct,
  isMaterialRequisitionIssuedForStage4,
  isPackingAwaitingFinalQc,
  isStage3ClearedForMaterialReq,
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
  normalizeSuperUserTab,
  getStartupRequisitionNumber,
  escapeHtml,
  ConfirmDialogHtmlOptions,
  buildConfirmDialogHtml,
  validatePendingOrderInputs,
  validateContractorAllocations,
  computeDeliveryCountdown,
  validateCustomerMasterInputs,
  validateProductMasterInputs,
  validateSystemUserInputs,
  validatePasswordResetInput,
  buildFocusRestoreSelector,
  getDefaultStationForRole,
  getScaleSizeCodes,
  formatSizeColumnLabel,
  resolveScaleKeysForBreakdown,
  buildGrnReceiveConfirmationHtml,
  formatCurrentDateDDMMYYYY,
  formatSplitAllocationSummary,
  GrnSlipParams,
  SizeStandardOption
} from './utils/requisitionLogic';
import {
  renderSuperUserScreen,
  buildSuperUserReportHtml,
  SuperUserTab,
  SuperUserReportType,
  SystemUserRecord,
  AdminOrderArticleLine
} from './components/superUserView';
import { renderPackingHallScreen } from './components/packingHallView';
import {
  showToast,
  resolvePendingConfirmDialog,
  openModal,
  closeModal,
  openConfirmDialog,
  confirmAndRunAdminAction,
  runAdminAction,
  clearFieldValidationError,
  applyFieldValidationErrors,
  printDocument,
  captureRenderFocusTarget,
  restoreRenderFocusTarget,
  RenderAppOptions,
  captureDirtyFormDrafts,
  restoreDirtyFormDrafts,
  exportTableToCSV
} from './utils/domModalsAndPrint';
import {
  screenForRole,
  stationName,
  renderAuthScreen as renderAuthViewHtml,
  renderModuleSwitcher as renderModuleSwitcherHtml,
  renderModalContainer
} from './components/authView';
import { renderInwardRegisterScreen } from './components/inwardRegisterView';
import { renderRepairScreen, renderQcScreen } from './components/repairAndQcViews';

interface GRNRecord {
  sr: number;
  grnCode?: string;
  date: string;
  pendingOrderId: string;
  maker: string;
  hallName?: string;
  stitcherName?: string;
  receivingNote?: string;
  article: string;
  color?: string;
  receivedFrom?: string;
  rcvdPairs: number;
  sizeFormat?: string;
  sizeCodes?: string[];
  sizes: SizeBreakdown;
  status: string;
  isVoided?: boolean;
  voidReason?: string;
  isDemoScenario?: boolean;
}

interface DefectRecord {
  altId?: number;
  id: string;
  reqNumber?: string;
  pairsCount?: number;
  rawStatus?: string;
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

interface GrnRemainingCaps {
  sizeRemaining: Record<string, number>;
  totalRemaining: number;
  sizeFormat: string;
  sizeCodes: string[];
}

const DEFAULT_REQ_NUMBER = 'REQ-0001';
const SAVED_TAILORS_STORAGE_KEY = 'hammad-industries-saved-tailors';

/** Build a blank REQ-0001 Packing Hall WIP state without stale order/article/size fields. */
function createEmptyPackingWipState() {
  return {
    selectedBatch: DEFAULT_REQ_NUMBER,
    parentOrderId: '',
    po: '',
    article: '',
    plannedQty: 0,
    issueStatus: 'Pending Inward Issue' as 'Pending Inward Issue' | 'Issued by Inward Register',
    sizeFormat: 'LEGACY_7_11',
    sizeCodes: [...STANDARD_GLOVE_SIZES] as string[],
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
    mreqStatus: 'Pending Stage 3',
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
}

function loadSavedTailors(): string[] {
  try {
    const stored = window.localStorage.getItem(SAVED_TAILORS_STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      console.warn('Saved tailor list is not an array; ignoring stored value.');
      return [];
    }
    return Array.from(new Set(parsed
      .filter((name): name is string => typeof name === 'string')
      .map(name => name.trim())
      .filter(Boolean)));
  } catch (error) {
    console.warn('Unable to load saved tailor names:', error);
    return [];
  }
}

// Clean Initial State (All mockup records removed; ready for real data entry)
const state = {
  activeScreen: 'screen-grn',
  authMode: 'checking' as 'checking' | 'setup' | 'login' | 'ready' | 'error',
  authError: '',
  currentUser: null as SystemUserRecord | null,
  hasCompletedInitialSync: false,
  isInitialSyncing: false,
  isManualSync: false,
  syncError: '',

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

  // Form input clean states (Front person only enters received pairs + Received From + selects Pending Order)
  grnForm: {
    pendingOrderId: '',
    maker: '',
    hallName: '',
    stitcherName: '',
    article: '',
    color: '',
    receivedFrom: '',
    rcvdPairs: '',
    sizeFormat: 'LEGACY_7_11',
    sizeCodes: undefined as string[] | undefined,
    sizes: createEmptySizes(),
    splitRows: [] as Array<{
      maker: string;
      hallName?: string;
      stitcherName?: string;
      receivedFrom: string;
      sizes: SizeBreakdown;
    }>
  },

  repairForm: {
    batchId: getAlterationReqNumber(DEFAULT_REQ_NUMBER),
    article: '',
    po: '',
    defectType: '',
    tailor: '',
    qty: ''
  },
  savedTailors: loadSavedTailors(),

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
  persistedReqNumbers: [] as string[],

  // 5-Stage WIP Packing Hall State (Single Requisition with M and A prefixes, zero mockup values)
  packingWip: createEmptyPackingWipState(),

  // Dynamic dropdown options populated from backend SQLite database
  dropdownOptions: {
    makers: [] as string[],
    customers: [] as string[],
    articles: [] as string[],
    poList: [] as string[],
    defectBatchIds: [] as string[],
    halls: [] as HallWithStitchers[]
  },

  adminNavCollapsed: false,
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
  adminOpenRegistries: {
    buyers: true,
    articles: true,
    makers_pos: false,
    audit_trail: false,
    sqlite_wal: false,
    phased_rollout: false
  } as Record<string, boolean>,
  adminOrderDraft: {
    customerId: '',
    buyer: '',
    maker: '',
    po: '',
    productId: '',
    article: '',
    color: '',
    sizeFormat: 'LEGACY_7_11',
    dueDate: '',
    sizes: createEmptySizes()
  },
  adminOrderSplitRows: [] as Array<{ maker: string; sizes: SizeBreakdown; dueDate: string }>,
  adminOrderArticleLines: [] as AdminOrderArticleLine[],
  adminMultiArticlePickerOpen: false,
  adminMultiArticleSearch: '',
  adminOrderLastDefaultMaker: '',
  adminOrderLastDefaultDueDate: '',
  systemUsers: [] as SystemUserRecord[],
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
    sizeStandards: [] as SizeStandardOption[],
    receivings: [] as any[],
    alterations: [] as any[],
    scrapLedger: [] as any[]
  }
};

function getOrderSizeCodes(orderId?: string, explicitCodes?: readonly string[], explicitFormat?: string): string[] {
  if (Array.isArray(explicitCodes) && explicitCodes.length > 0) return [...explicitCodes];
  const matched = orderId ? state.pendingOrders.find(candidate => candidate.orderId === orderId) : undefined;
  if (matched?.sizeCodes && matched.sizeCodes.length > 0) return [...matched.sizeCodes];
  const fmt = explicitFormat || matched?.sizeFormat || 'LEGACY_7_11';
  return getScaleSizeCodes(state.adminOverview.sizeStandards, fmt);
}

function getGrnRemainingCaps(orderId: string, maker?: string): GrnRemainingCaps | null {
  const order = state.pendingOrders.find(candidate => candidate.orderId === orderId);
  if (!order?.sizes) return null;
  const activeSizes = getOrderSizeCodes(orderId, order.sizeCodes, order.sizeFormat);
  const orderPlannedTotal = activeSizes.reduce((sum, size) => sum + Number(order.sizes?.[size] || 0), 0);
  if (orderPlannedTotal <= 0) return null;

  const allocs = order.contractorAllocations || [];
  const trimmedMaker = String(maker || '').trim().toLowerCase();
  const matchedAlloc = allocs.length > 0
    ? (trimmedMaker
        ? allocs.find(a => a.maker.trim().toLowerCase() === trimmedMaker)
        : (allocs.length === 1 ? allocs[0] : undefined))
    : undefined;

  const targetSizes = matchedAlloc?.sizes || order.sizes;
  const targetPlannedTotal = matchedAlloc
    ? activeSizes.reduce((sum, size) => sum + Number(matchedAlloc.sizes?.[size] || 0), 0)
    : orderPlannedTotal;

  const receivedBySize = createEmptySizes(activeSizes);
  let receivedTotal = 0;
  for (const grn of state.grnList) {
    if (grn.pendingOrderId !== orderId || grn.isVoided || grn.status.toUpperCase() === 'VOIDED') continue;
    if (matchedAlloc && String(grn.maker || '').trim().toLowerCase() !== matchedAlloc.maker.trim().toLowerCase()) {
      continue;
    }
    receivedTotal += Math.max(0, Number(grn.rcvdPairs) || 0);
    for (const size of activeSizes) {
      receivedBySize[size] += Math.max(0, Number(grn.sizes?.[size]) || 0);
    }
  }

  const sizeRemaining: Record<string, number> = {};
  for (const size of activeSizes) {
    sizeRemaining[size] = Math.max(0, Number(targetSizes[size] || 0) - receivedBySize[size]);
  }

  return {
    sizeRemaining,
    totalRemaining: Math.max(0, targetPlannedTotal - receivedTotal),
    sizeFormat: order.sizeFormat || 'LEGACY_7_11',
    sizeCodes: activeSizes
  };
}

function formatGrnRemainingCaps(caps: GrnRemainingCaps, enteredSizes: SizeBreakdown): string {
  const activeSizes = caps.sizeCodes.length > 0 ? caps.sizeCodes : [...STANDARD_GLOVE_SIZES];
  const remainingBySize = activeSizes
    .map(size => `${size}: ${Math.max(0, (caps.sizeRemaining[size] || 0) - Number(enteredSizes[size] || 0)).toLocaleString()}`)
    .join(' | ');
  const remainingTotal = Math.max(0, caps.totalRemaining - calculateSizeTotal(enteredSizes));
  return `Remaining after current entry: ${remainingBySize} | Total: ${remainingTotal.toLocaleString()} pairs`;
}

function findHallByName(name?: string): HallWithStitchers | undefined {
  const needle = String(name || '').trim().toLowerCase();
  if (!needle) return undefined;
  return (state.dropdownOptions.halls || []).find(
    h => String(h.name || '').trim().toLowerCase() === needle
  );
}

function getOrderStockState(orderId: string): {
  totalReceived: number;
  totalIssued: number;
  availablePairs: number;
  pendingReqPairs: number;
  unclaimedPairs: number;
  remainingOrderSizes: SizeBreakdown;
  remainingOrderTotal: number;
  receivedSizes: SizeBreakdown;
  unclaimedDockSizes: SizeBreakdown;
  hasServerCounts: boolean;
} {
  const order = state.pendingOrders.find(candidate => candidate.orderId === orderId);
  const activeSizes = getOrderSizeCodes(orderId, order?.sizeCodes, order?.sizeFormat);
  if (order && order.availableDockPairs !== undefined) {
    const remainingOrderSizes = { ...createEmptySizes(activeSizes), ...(order.remainingOrderSizes || order.sizes || {}) };
    const receivedSizes = { ...createEmptySizes(activeSizes), ...(order.receivedSizes || {}) };
    const requestedSizes = { ...createEmptySizes(activeSizes), ...(order.requestedSizes || {}) };
    const unclaimedDockSizes = {
      ...createEmptySizes(activeSizes),
      ...(order.unclaimedDockSizes ||
        Object.fromEntries(activeSizes.map(sz => [sz, Math.max(0, Number(receivedSizes[sz] || 0) - Number(requestedSizes[sz] || 0))])))
    };
    return {
      totalReceived: Number(order.receivedPairs || 0),
      totalIssued: Number(order.issuedPairs || 0),
      availablePairs: Math.max(0, Number(order.availableDockPairs || 0)),
      pendingReqPairs: Math.max(0, Number(order.pendingReqPairs || 0)),
      unclaimedPairs: Math.max(0, Number(order.unclaimedDockPairs ?? order.availableDockPairs ?? 0)),
      remainingOrderSizes,
      remainingOrderTotal: calculateSizeTotal(remainingOrderSizes),
      receivedSizes,
      unclaimedDockSizes,
      hasServerCounts: true
    };
  }

  let totalReceived = 0;
  const receivedSizes = createEmptySizes(activeSizes);
  for (const grn of state.grnList) {
    if (grn.isVoided || grn.status.toUpperCase() === 'VOIDED') continue;
    if (orderId && grn.pendingOrderId !== orderId) continue;
    totalReceived += Math.max(0, Number(grn.rcvdPairs) || 0);
    for (const size of activeSizes) {
      receivedSizes[size] += Math.max(0, Number(grn.sizes?.[size]) || 0);
    }
  }

  let totalIssued = 0;
  let pendingReqPairs = 0;
  const requestedSizes = createEmptySizes(activeSizes);
  const wipItems = Object.values(state.ordersWipMap);
  for (const item of wipItems) {
    if (!item || (item as any).isVoided) continue;
    if (orderId && item.parentOrderId !== orderId) continue;
    const qty = Number(item.plannedQty || calculateSizeTotal(item.sizes) || 0);
    for (const size of activeSizes) {
      requestedSizes[size] += Number(item.sizes?.[size] || 0);
    }
    if (item.issueStatus === 'Issued by Inward Register') {
      totalIssued += Number(item.stage1In || qty);
    } else {
      pendingReqPairs += qty;
    }
  }
  if (!orderId && wipItems.length === 0) {
    totalIssued = state.issuedPairsTotal;
  }

  const remainingOrderSizes = createEmptySizes(activeSizes);
  const unclaimedDockSizes = createEmptySizes(activeSizes);
  for (const size of activeSizes) {
    remainingOrderSizes[size] = Math.max(0, Number(order?.sizes?.[size] || 0) - requestedSizes[size]);
    unclaimedDockSizes[size] = Math.max(0, receivedSizes[size] - requestedSizes[size]);
  }
  const availablePairs = Math.max(0, totalReceived - totalIssued);
  const unclaimedPairs = Math.max(0, availablePairs - pendingReqPairs);

  return {
    totalReceived,
    totalIssued,
    availablePairs,
    pendingReqPairs,
    unclaimedPairs,
    remainingOrderSizes,
    remainingOrderTotal: calculateSizeTotal(remainingOrderSizes),
    receivedSizes,
    unclaimedDockSizes,
    hasServerCounts: false
  };
}

function getTotalIssuedPairs(): number {
  const wipItems = Object.values(state.ordersWipMap);
  if (wipItems.length > 0) {
    return wipItems.reduce((sum: number, item: any) => {
      if (!item || item.isVoided || item.issueStatus !== 'Issued by Inward Register') return sum;
      return sum + Number(item.stage1In || item.plannedQty || 0);
    }, 0);
  }
  return state.issuedPairsTotal;
}

function bindComplementaryStageInputs(goodInputId: string, defectInputId: string, available: number): void {
  const goodInput = document.getElementById(goodInputId) as HTMLInputElement | null;
  const defectInput = document.getElementById(defectInputId) as HTMLInputElement | null;
  if (!goodInput || !defectInput) return;

  goodInput.min = defectInput.min = '0';
  goodInput.max = defectInput.max = String(available);
  goodInput.value = String(available);
  defectInput.value = '0';

  goodInput.addEventListener('input', () => {
    const good = Math.min(available, Math.max(0, Number(goodInput.value) || 0));
    goodInput.value = String(good);
    defectInput.value = String(available - good);
  });
  defectInput.addEventListener('input', () => {
    const defects = Math.min(available, Math.max(0, Number(defectInput.value) || 0));
    defectInput.value = String(defects);
    goodInput.value = String(available - defects);
  });
}

function readComplementaryStageInputs(goodInputId: string, defectInputId: string, available: number): { good: number; defects: number } | null {
  const good = Number((document.getElementById(goodInputId) as HTMLInputElement | null)?.value);
  const defects = Number((document.getElementById(defectInputId) as HTMLInputElement | null)?.value);
  if (
    !Number.isInteger(good) || !Number.isInteger(defects) ||
    good < 0 || defects < 0 || good + defects !== available
  ) {
    showToast(`Passed and defect pairs must total the ${available} pairs available in this stage.`);
    return null;
  }
  return { good, defects };
}

function remainingStagePairs(input: number, passed: number, defects: number): number {
  return Math.max(0, Number(input || 0) - Number(passed || 0) - Number(defects || 0));
}

function saveTailorName(name: string): void {
  const trimmed = name.trim();
  if (!trimmed || state.savedTailors.some(tailor => tailor.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) return;
  state.savedTailors.push(trimmed);
  try {
    window.localStorage.setItem(SAVED_TAILORS_STORAGE_KEY, JSON.stringify(state.savedTailors));
  } catch (error) {
    console.warn('Unable to persist saved tailor name:', error);
  }
}

function recordStageDefects(origin: string, quantity: number, defectClass: string): void {
  if (quantity <= 0) return;
  const alterationReq = getAlterationReqNumber(state.packingWip.selectedBatch);
  if (!state.dropdownOptions.defectBatchIds.includes(alterationReq)) {
    state.dropdownOptions.defectBatchIds.unshift(alterationReq);
  }
  state.defectList.unshift({
    id: alterationReq,
    date: formatCurrentDateDDMMYYYY(),
    origin,
    article: state.packingWip.article || '---',
    po: state.packingWip.po || '---',
    defectClass,
    qty: `${quantity} Prs`,
    tailor: 'Supervisor A',
    status: 'In Rework',
    route: 'Auto-Return to Stage 1 Checking',
    actionText: 'Update'
  });
}

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

function renderAuthScreen(): string { return renderAuthViewHtml(state); }
function renderModuleSwitcher(): string { return renderModuleSwitcherHtml(state); }

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

function renderScreenGRN(): string {
  return renderInwardRegisterScreen({
    state,
    getOrderSizeCodes,
    getGrnRemainingCaps,
    formatGrnRemainingCaps,
    getOrderStockState,
    getTotalIssuedPairs,
    rollupSummary: getCurrentRollupSummary()
  });
}

// ==========================================
// SCREEN: Packing Hall Portal & 5-Stage WIP Flow
// ==========================================
function renderScreenPacking(): string {
  return renderPackingHallScreen({
    wip: state.packingWip as any,
    defaultReqNumber: DEFAULT_REQ_NUMBER,
    ordersWipMap: state.ordersWipMap,
    persistedReqNumbers: state.persistedReqNumbers,
    pendingOrders: state.pendingOrders,
    defectList: state.defectList,
    cartons: state.cartons,
    rollupSummary: getCurrentRollupSummary(),
    getOrderAvailableDockPairs: (orderId: string) => getOrderStockState(orderId).availablePairs,
    getOrderUnclaimedDockPairs: (orderId: string) => getOrderStockState(orderId).unclaimedPairs,
    remainingStagePairs,
    escapeHtml,
    isInitialSyncing: state.isInitialSyncing,
    isManualSync: state.isManualSync,
    syncError: state.syncError
  });
}

function renderScreenRepair(): string { return renderRepairScreen(state); }
function renderScreenQC(): string { return renderQcScreen(state); }

// ==========================================
// SCREEN 6: Super User Control Center (4-Item Menu: 1. Dashboard, 2. Live Tracking, 3. Order Creation, 4. Reports)
// ==========================================
function renderScreenAdmin(): string {
  const rollupSummary = getCurrentRollupSummary();

  return renderSuperUserScreen({
    activeTab: state.adminActiveTab,
    adminNavCollapsed: state.adminNavCollapsed,
    locationSearch: typeof window !== 'undefined' ? window.location.search : '',
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
      poList: state.dropdownOptions.poList,
      halls: state.dropdownOptions.halls
    },
    systemUsers: state.systemUsers,
    currentUserId: state.currentUser?.userId,
    auditTrail: state.auditTrail,
    adminOverview: state.adminOverview,
    lastBackupPath: state.lastBackupPath,
    rollupSummary,
    orderDraft: state.adminOrderDraft,
    orderSplitRows: state.adminOrderSplitRows,
    orderArticleLines: state.adminOrderArticleLines,
    multiArticlePickerOpen: state.adminMultiArticlePickerOpen,
    multiArticleSearch: state.adminMultiArticleSearch,
    openRegistryIds: state.adminOpenRegistries
  });
}

// Global modal container template

// Main rendering engine
function renderApp(options: RenderAppOptions = {}): void {
  const root = document.getElementById('root');
  if (!root) return;
  const focusSnapshot = captureRenderFocusTarget(root);
  const draftSnapshots = options.preserveInitialSyncDrafts ? captureDirtyFormDrafts(root) : [];
  root.dataset.syncReady = state.authMode === 'ready' && state.hasCompletedInitialSync && !state.isInitialSyncing ? 'true' : 'false';

  if (state.authMode !== 'ready' || !state.currentUser) {
    root.innerHTML = renderAuthScreen();
    attachEventHandlers();
    restoreRenderFocusTarget(root, focusSnapshot);
    return;
  }

  if (state.currentUser.role === 'INWARD_CLERK') {
    if (!['screen-grn', 'screen-repair'].includes(state.activeScreen)) {
      state.activeScreen = 'screen-grn';
    }
  } else if (state.currentUser.role !== 'SUPER_USER') {
    state.activeScreen = screenForRole(state.currentUser.role);
  } else if (!['screen-grn', 'screen-packing', 'screen-repair', 'screen-qc', 'screen-admin'].includes(state.activeScreen)) {
    state.activeScreen = 'screen-admin';
  }

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
    ${renderModalContainer()}
  `;

  attachEventHandlers();
  if (draftSnapshots.length > 0) {
    restoreDirtyFormDrafts(root, draftSnapshots);
  }
  restoreRenderFocusTarget(root, focusSnapshot);
}

async function initializeAuth(): Promise<void> {
  state.authMode = 'checking';
  renderApp();
  try {
    const response = await fetch('/api/auth/status');
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Unable to check sign-in status.');
    }

    if (result.data.user) {
      state.currentUser = result.data.user;
      state.authMode = 'ready';
      state.activeScreen = screenForRole(state.currentUser!.role);
    } else {
      state.authMode = result.data.initialized ? 'login' : 'setup';
    }
    state.authError = '';
    renderApp();
    if (state.currentUser) await syncBackendData();
  } catch (error) {
    state.authMode = 'error';
    state.authError = error instanceof Error ? error.message : 'Unable to connect to the MES server.';
    renderApp();
  }
}

async function submitAuthForm(form: HTMLFormElement): Promise<void> {
  const isSetup = state.authMode === 'setup';
  const name = (document.getElementById('auth-name') as HTMLInputElement | null)?.value.trim() || '';
  const username = (document.getElementById('auth-username') as HTMLInputElement | null)?.value.trim() || '';
  const password = (document.getElementById('auth-password') as HTMLInputElement | null)?.value || '';
  const passwordConfirm = (document.getElementById('auth-password-confirm') as HTMLInputElement | null)?.value || '';

  if (isSetup && password !== passwordConfirm) {
    state.authError = 'Passwords do not match.';
    renderApp();
    return;
  }

  const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  try {
    const response = await fetch(isSetup ? '/api/auth/bootstrap' : '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, username, password })
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Sign in failed.');
    }
    state.currentUser = result.data.user;
    state.authMode = 'ready';
    state.authError = '';
    state.activeScreen = screenForRole(state.currentUser!.role);
    renderApp();
    showToast(isSetup ? 'Initial Super User account created.' : `Signed in to ${stationName(state.currentUser!.role)}.`);
    await syncBackendData();
  } catch (error) {
    state.authError = error instanceof Error ? error.message : 'Sign in failed.';
    renderApp();
  }
}

async function lockCurrentSession(): Promise<void> {
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Unable to lock the session.');
    }
    state.currentUser = null;
    state.authMode = 'login';
    state.authError = '';
    state.hasCompletedInitialSync = false;
    state.isInitialSyncing = false;
    state.isManualSync = false;
    state.syncError = '';
    state.activeScreen = 'screen-grn';
    renderApp();
    showToast('Session locked.');
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Unable to lock the session.');
  }
}

// Attach interactive event handlers
function attachEventHandlers(): void {
  if (state.authMode !== 'ready' || !state.currentUser) {
    document.getElementById('auth-form')?.addEventListener('submit', event => {
      event.preventDefault();
      void submitAuthForm(event.currentTarget as HTMLFormElement);
    });
    document.getElementById('btn-auth-retry')?.addEventListener('click', () => void initializeAuth());
    return;
  }

  // Global toolbar actions: AQL calculator & Document center
  document.getElementById('btn-open-aql-calculator')?.addEventListener('click', openAqlCalculatorModal);
  document.getElementById('btn-open-doc-center')?.addEventListener('click', () => openDocumentCenterModal('grn'));
  document.getElementById('btn-session-lock')?.addEventListener('click', () => void lockCurrentSession());
  document.getElementById('btn-return-admin')?.addEventListener('click', () => {
    state.activeScreen = 'screen-admin';
    renderApp();
  });
  document.getElementById('btn-inward-nav-grn')?.addEventListener('click', () => {
    state.activeScreen = 'screen-grn';
    renderApp();
  });
  document.getElementById('btn-inward-nav-repair')?.addEventListener('click', () => {
    state.activeScreen = 'screen-repair';
    renderApp();
  });

  document.getElementById('btn-clear-all-data')?.addEventListener('click', () => {
    state.grnList = [];
    state.defectList = [];
    state.cartons = [];
    state.issuedPairsTotal = 0;
    state.grnForm = {
      pendingOrderId: '',
      maker: '',
      hallName: '',
      stitcherName: '',
      article: '',
      color: '',
      receivedFrom: '',
      rcvdPairs: '',
      sizeFormat: 'LEGACY_7_11',
      sizeCodes: undefined,
      sizes: createEmptySizes(),
      splitRows: []
    };
    state.packingWip = createEmptyPackingWipState();
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
    const title = document.getElementById('modal-title')?.textContent || 'Hammad Industries Document';
    const preview = document.getElementById('doc-preview-container');
    const content = preview ? preview.innerHTML : (document.getElementById('modal-body')?.innerHTML || '');
    printDocument(title, content);
  });

  const modal = document.getElementById('global-modal');
  const modalBox = modal?.querySelector<HTMLElement>('.modal-box');
  modal?.addEventListener('keydown', (event) => {
    if (!modal.classList.contains('open')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== 'Tab' || !modalBox) return;

    const focusable = Array.from(modalBox.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(element =>
      element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0
    );
    if (!focusable.length) {
      event.preventDefault();
      modalBox.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !modalBox.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !modalBox.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  });
  modal?.addEventListener('click', (e) => {
    const cancelTrigger = (e.target as HTMLElement | null)?.closest('[data-modal-cancel]');
    if (cancelTrigger || e.target === modal) closeModal();
    else if (!modal.classList.contains('open')) closeModal();
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
  const hallSelect = document.getElementById('grn-hall') as HTMLSelectElement | null;
  const stitcherSelect = document.getElementById('grn-stitcher') as HTMLSelectElement | null;
  const articleInput = document.getElementById('grn-article') as HTMLInputElement;
  const colorInput = document.getElementById('grn-color') as HTMLInputElement;
  const receivedFromInput = document.getElementById('grn-received-from') as HTMLInputElement;
  const rcvdPairsInput = document.getElementById('grn-rcvd-pairs') as HTMLInputElement;
  const totalDisplay = document.getElementById('grn-size-total-display');
  const capsDisplay = document.getElementById('grn-size-caps');

  function syncSizesAndReceived(changedInput?: HTMLInputElement) {
    const activeMaker = makerSelect?.value || state.grnForm.maker;
    const activeOrder = state.pendingOrders.find(o => o.orderId === state.grnForm.pendingOrderId);
    const activeAllocs = activeOrder?.contractorAllocations || [];
    const activeCodes = getOrderSizeCodes(
      state.grnForm.pendingOrderId,
      activeOrder?.sizeCodes || state.grnForm.sizeCodes,
      activeOrder?.sizeFormat || state.grnForm.sizeFormat
    );

    if (activeAllocs.length > 1 && !activeMaker) {
      const nextRows = activeAllocs.map((alloc, idx) => {
        const caps = getGrnRemainingCaps(state.grnForm.pendingOrderId, alloc.maker);
        const existingRow = state.grnForm.splitRows[idx];
        const rfInp = document.querySelector<HTMLInputElement>(`.grn-split-received-from[data-split-idx="${idx}"]`);
        const stitcherSel = document.querySelector<HTMLSelectElement>(`.grn-split-stitcher[data-split-idx="${idx}"]`);
        const receivedFrom = rfInp ? rfInp.value : (existingRow?.receivedFrom || '');
        const hallName = stitcherSel && stitcherSel.value
          ? (stitcherSel.getAttribute('data-hall-name') || existingRow?.hallName || '')
          : (existingRow?.hallName || '');
        const stitcherName = stitcherSel ? stitcherSel.value : (existingRow?.stitcherName || '');
        const sizes = createEmptySizes(activeCodes);
        const rowInputs = Array.from(document.querySelectorAll<HTMLInputElement>(`.grn-split-size-val[data-split-idx="${idx}"]`));
        rowInputs.forEach(inp => {
          const key = inp.getAttribute('data-size') || '';
          if (key && activeCodes.includes(key)) {
            const entered = Math.max(0, parseInt(inp.value || '0', 10) || 0);
            const cap = caps ? (caps.sizeRemaining[key] ?? 0) : Number.POSITIVE_INFINITY;
            sizes[key] = Math.min(entered, cap);
          }
        });
        if (caps && calculateSizeTotal(sizes) > caps.totalRemaining) {
          if (changedInput && Number(changedInput.getAttribute('data-split-idx')) === idx) {
            const changedSize = changedInput.getAttribute('data-size') || '';
            const otherTotal = activeCodes.reduce((s, sz) => s + (sz === changedSize ? 0 : Number(sizes[sz] || 0)), 0);
            if (changedSize) {
              sizes[changedSize] = Math.max(0, Math.min(Number(sizes[changedSize] || 0), caps.totalRemaining - otherTotal));
            }
          } else {
            let excess = calculateSizeTotal(sizes) - caps.totalRemaining;
            for (const sz of [...activeCodes].reverse()) {
              const red = Math.min(Number(sizes[sz] || 0), excess);
              sizes[sz] = Math.max(0, Number(sizes[sz] || 0) - red);
              excess -= red;
              if (excess <= 0) break;
            }
          }
        }
        rowInputs.forEach(inp => {
          const key = inp.getAttribute('data-size') || '';
          if (!key || !activeCodes.includes(key)) return;
          const otherTotal = activeCodes.reduce((s, sz) => s + (sz === key ? 0 : Number(sizes[sz] || 0)), 0);
          if (caps) {
            inp.max = String(Math.max(0, Math.min(caps.sizeRemaining[key] ?? 0, caps.totalRemaining - otherTotal)));
          } else {
            inp.removeAttribute('max');
          }
          inp.value = sizes[key] ? String(sizes[key]) : '';
        });
        const rowSum = calculateSizeTotal(sizes);
        const rowCell = document.getElementById(`grn-split-row-total-${idx}`);
        if (rowCell) rowCell.textContent = rowSum.toLocaleString();
        return { maker: alloc.maker, hallName, stitcherName, receivedFrom, sizes };
      });
      state.grnForm.splitRows = nextRows;
      const grandTotal = nextRows.reduce((s, r) => s + calculateSizeTotal(r.sizes), 0);
      if (totalDisplay) totalDisplay.textContent = grandTotal.toLocaleString();
      if (rcvdPairsInput) {
        rcvdPairsInput.value = grandTotal > 0 ? String(grandTotal) : '';
        state.grnForm.rcvdPairs = grandTotal > 0 ? String(grandTotal) : '';
      }
      return;
    }

    const caps = getGrnRemainingCaps(state.grnForm.pendingOrderId, activeMaker);
    const sizeInputs = Array.from(document.querySelectorAll<HTMLInputElement>('.grn-size-val'));
    const sizes: SizeBreakdown = createEmptySizes(activeCodes);
    sizeInputs.forEach(inp => {
      const key = inp.getAttribute('data-size') || '';
      if (key && activeCodes.includes(key)) {
        const entered = Math.max(0, parseInt(inp.value || '0', 10) || 0);
        const cap = caps ? (caps.sizeRemaining[key] ?? 0) : Number.POSITIVE_INFINITY;
        sizes[key] = Math.min(entered, cap);
      }
    });

    if (caps && calculateSizeTotal(sizes) > caps.totalRemaining) {
      if (changedInput) {
        const changedSize = changedInput.getAttribute('data-size') || '';
        const otherTotal = activeCodes.reduce(
          (sum, size) => sum + (size === changedSize ? 0 : Number(sizes[size] || 0)),
          0
        );
        if (changedSize) {
          sizes[changedSize] = Math.max(0, Math.min(
            Number(sizes[changedSize] || 0),
            caps.totalRemaining - otherTotal
          ));
        }
      } else {
        let excess = calculateSizeTotal(sizes) - caps.totalRemaining;
        for (const size of [...activeCodes].reverse()) {
          const reduction = Math.min(Number(sizes[size] || 0), excess);
          sizes[size] = Math.max(0, Number(sizes[size] || 0) - reduction);
          excess -= reduction;
          if (excess <= 0) break;
        }
      }
    }

    sizeInputs.forEach(inp => {
      const key = inp.getAttribute('data-size') || '';
      if (!key || !activeCodes.includes(key)) return;
      const otherTotal = activeCodes.reduce(
        (sum, size) => sum + (size === key ? 0 : Number(sizes[size] || 0)),
        0
      );
      if (caps) {
        inp.max = String(Math.max(0, Math.min(caps.sizeRemaining[key] ?? 0, caps.totalRemaining - otherTotal)));
      } else {
        inp.removeAttribute('max');
      }
      inp.value = sizes[key] ? String(sizes[key]) : '';
    });

    state.grnForm.sizes = sizes;
    const sizeSum = calculateSizeTotal(sizes);

    if (totalDisplay) {
      totalDisplay.textContent = sizeSum.toLocaleString();
    }
    document.querySelectorAll<HTMLElement>('[data-bal-size]').forEach(el => {
      const sz = el.getAttribute('data-bal-size') || '';
      const rem = caps ? Math.max(0, (caps.sizeRemaining[sz] ?? 0) - Number(sizes[sz] || 0)) : null;
      el.textContent = rem !== null ? rem.toLocaleString() : '—';
      el.classList.toggle('is-zero', rem === 0);
    });
    const balanceTotalEl = document.getElementById('grn-balance-total');
    if (balanceTotalEl) {
      balanceTotalEl.textContent = caps
        ? Math.max(0, caps.totalRemaining - sizeSum).toLocaleString()
        : '—';
    }
    if (capsDisplay) {
      capsDisplay.textContent = caps
        ? formatGrnRemainingCaps(caps, sizes)
        : 'No matching pending-order size cap available; received quantities are unrestricted.';
    }
    if (rcvdPairsInput) {
      rcvdPairsInput.value = sizeSum > 0 ? String(sizeSum) : '';
      state.grnForm.rcvdPairs = sizeSum > 0 ? String(sizeSum) : '';
    }
  }

  pendingOrderSelect?.addEventListener('change', () => {
    const val = pendingOrderSelect.value;
    state.grnForm.pendingOrderId = val;
    if (!val) {
      state.grnForm.maker = '';
      state.grnForm.hallName = '';
      state.grnForm.stitcherName = '';
      state.grnForm.article = '';
      state.grnForm.color = '';
      state.grnForm.receivedFrom = '';
      state.grnForm.rcvdPairs = '';
      state.grnForm.sizeFormat = 'LEGACY_7_11';
      state.grnForm.sizeCodes = undefined;
      state.grnForm.sizes = createEmptySizes();
      state.grnForm.splitRows = [];
      renderApp();
      return;
    }
    const filled = applyPendingOrderSelection(state.pendingOrders, val);
    if (!filled) {
      syncSizesAndReceived();
      return;
    }

    const activeCodes = getOrderSizeCodes(val, filled.sizeCodes, filled.sizeFormat);
    const hasSplit = Boolean(filled.contractorAllocations && filled.contractorAllocations.length > 1);
    state.grnForm.pendingOrderId = filled.pendingOrderId;
    state.grnForm.maker = hasSplit ? '' : filled.maker;
    state.grnForm.article = filled.article;
    state.grnForm.color = filled.color || 'Standard';
    state.grnForm.sizeFormat = filled.sizeFormat || 'LEGACY_7_11';
    state.grnForm.sizeCodes = activeCodes;
    state.grnForm.sizes = createEmptySizes(activeCodes);
    state.grnForm.rcvdPairs = '';
    if (hasSplit && filled.contractorAllocations) {
      state.grnForm.hallName = '';
      state.grnForm.stitcherName = '';
      state.grnForm.receivedFrom = '';
      state.grnForm.splitRows = filled.contractorAllocations.map(a => {
        const matchedHall = findHallByName(a.maker);
        return {
          maker: a.maker,
          hallName: matchedHall && matchedHall.stitchers.length > 0 ? matchedHall.name : '',
          stitcherName: '',
          receivedFrom: '',
          sizes: createEmptySizes(activeCodes)
        };
      });
    } else {
      state.grnForm.splitRows = [];
      const matchedHall = findHallByName(filled.maker);
      const hasHallStitchers = Boolean(matchedHall && matchedHall.stitchers.length > 0);
      state.grnForm.hallName = hasHallStitchers ? matchedHall!.name : '';
      state.grnForm.stitcherName = '';
      if (hasHallStitchers) {
        if (state.grnForm.receivedFrom.endsWith(' Representative')) {
          state.grnForm.receivedFrom = '';
        }
      } else if (!state.grnForm.receivedFrom?.trim() || state.grnForm.receivedFrom.endsWith(' Representative')) {
        state.grnForm.receivedFrom = filled.maker ? `${filled.maker} Representative` : '';
      }
    }

    renderApp();
    showToast(
      hasSplit
        ? `Order ${filled.pendingOrderId} split among ${filled.contractorAllocations!.map(a => a.maker).join(', ')} — enter Received From & quantities per contractor.`
        : `Order ${filled.pendingOrderId} selected: Locked Article (${filled.article}) & Colour (${state.grnForm.color}).`
    );
  });

  makerSelect?.addEventListener('change', () => {
    const activeOrder = state.pendingOrders.find(o => o.orderId === state.grnForm.pendingOrderId);
    const hasSplit = (activeOrder?.contractorAllocations?.length || 0) > 1;
    const prevHall = state.grnForm.hallName;
    state.grnForm.maker = makerSelect.value;
    const matchedHall = findHallByName(state.grnForm.maker);
    const hasHallStitchers = Boolean(matchedHall && matchedHall.stitchers.length > 0);
    state.grnForm.hallName = hasHallStitchers ? matchedHall!.name : '';
    state.grnForm.stitcherName = '';
    if (hasHallStitchers) {
      if (state.grnForm.receivedFrom.endsWith(' Representative')) {
        state.grnForm.receivedFrom = '';
      }
    } else if (!state.grnForm.receivedFrom?.trim() || state.grnForm.receivedFrom.endsWith(' Representative')) {
      state.grnForm.receivedFrom = state.grnForm.maker ? `${state.grnForm.maker} Representative` : '';
      if (receivedFromInput) receivedFromInput.value = state.grnForm.receivedFrom;
    }
    syncSizesAndReceived();
    if (hasSplit || prevHall !== state.grnForm.hallName || hasHallStitchers) {
      renderApp();
    }
  });

  hallSelect?.addEventListener('change', () => {
    syncSizesAndReceived();
    const selectedHall = findHallByName(hallSelect.value);
    state.grnForm.hallName = selectedHall ? selectedHall.name : '';
    state.grnForm.stitcherName = '';
    if (selectedHall && selectedHall.stitchers.length > 0) {
      if (state.grnForm.receivedFrom.endsWith(' Representative')) {
        state.grnForm.receivedFrom = '';
      }
      if (!state.grnForm.pendingOrderId && (!state.grnForm.maker || findHallByName(state.grnForm.maker))) {
        state.grnForm.maker = selectedHall.name;
      }
    } else if (!selectedHall && state.grnForm.maker && findHallByName(state.grnForm.maker) && !state.grnForm.pendingOrderId) {
      state.grnForm.maker = '';
    }
    renderApp();
  });

  stitcherSelect?.addEventListener('change', () => {
    state.grnForm.stitcherName = stitcherSelect.value;
    applyFieldValidationErrors([
      [stitcherSelect, ''],
      [receivedFromInput, '']
    ]);
    const noteHintEl = document.getElementById('grn-note-hint');
    const curHall = findHallByName(state.grnForm.hallName);
    if (noteHintEl && curHall && curHall.stitchers.length > 0) {
      const whoLabel = state.grnForm.stitcherName || 'Stitcher';
      noteHintEl.innerHTML = `Optional: defaults to <strong>${escapeHtml(`${whoLabel} (${curHall.name})`)}</strong> if left blank.`;
    }
  });

  receivedFromInput?.addEventListener('input', () => {
    state.grnForm.receivedFrom = receivedFromInput.value;
    const curHall = findHallByName(state.grnForm.hallName);
    const isOptional = Boolean(curHall && curHall.stitchers.length > 0);
    applyFieldValidationErrors([
      [receivedFromInput, isOptional || receivedFromInput.value.trim() ? '' : 'Enter who goods were received from.']
    ]);
  });

  document.querySelectorAll('.grn-size-val').forEach(inp => {
    inp.addEventListener('input', () => syncSizesAndReceived(inp as HTMLInputElement));
  });
  document.querySelectorAll('.grn-split-size-val').forEach(inp => {
    inp.addEventListener('input', () => syncSizesAndReceived(inp as HTMLInputElement));
  });
  document.querySelectorAll<HTMLSelectElement>('.grn-split-stitcher').forEach(sel => {
    sel.addEventListener('change', () => {
      const idx = Number(sel.getAttribute('data-split-idx'));
      const hName = sel.getAttribute('data-hall-name') || '';
      if (state.grnForm.splitRows[idx]) {
        state.grnForm.splitRows[idx].hallName = sel.value ? hName : '';
        state.grnForm.splitRows[idx].stitcherName = sel.value;
      }
      applyFieldValidationErrors([[sel, '']]);
    });
  });
  document.querySelectorAll<HTMLInputElement>('.grn-split-received-from').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx = Number(inp.getAttribute('data-split-idx'));
      if (state.grnForm.splitRows[idx]) {
        state.grnForm.splitRows[idx].receivedFrom = inp.value;
      }
      applyFieldValidationErrors([[inp, '']]);
    });
  });
  syncSizesAndReceived();

  document.getElementById('btn-clear-grn')?.addEventListener('click', () => {
    state.grnForm = {
      pendingOrderId: '',
      maker: '',
      hallName: '',
      stitcherName: '',
      article: '',
      color: '',
      receivedFrom: '',
      rcvdPairs: '',
      sizeFormat: 'LEGACY_7_11',
      sizeCodes: undefined,
      sizes: createEmptySizes(),
      splitRows: []
    };
    renderApp();
    showToast('Inward form and size breakdown cleared.');
  });

  async function persistAndRecordGrnBatch(params: {
    entryPendingOrder: string;
    selectedOrder?: PendingOrder;
    entryMaker: string;
    entryHallName?: string;
    entryStitcherName?: string;
    entryReceivingNote?: string;
    entryArticle: string;
    entryColor: string;
    entryReceivedFrom: string;
    entrySizes: SizeBreakdown;
    rcvdPairs: number;
    activeCodes: string[];
    activeFormat: string;
    rcvDate: string;
    splitSummary?: string;
  }): Promise<GrnSlipParams | null> {
    const newSr = state.grnList.length + 1;
    const newGrnCode = formatBatchSequence('GRN', newSr);
    let savedReceiving: any = null;
    try {
      const response = await fetch('/api/store/receivings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: params.entryPendingOrder,
          pendingOrderId: params.entryPendingOrder,
          customerName: params.selectedOrder?.buyer || 'Standard',
          makerContractor: params.entryMaker,
          hallName: params.entryHallName || '',
          stitcherName: params.entryStitcherName || '',
          receivingNote: params.entryReceivingNote || '',
          articleName: params.entryArticle,
          colorShade: params.entryColor,
          receivedFrom: params.entryReceivedFrom,
          strictInwardEntry: true,
          orderQty: params.selectedOrder
            ? params.activeCodes.reduce((sum, sizeCode) => sum + Number(params.selectedOrder!.sizes?.[sizeCode] || 0), 0)
            : params.rcvdPairs,
          rcvdPairs: params.rcvdPairs,
          rcvDate: params.rcvDate,
          sizes: params.activeCodes.map(sizeCode => ({
            sizeCode,
            orderPairs: Number(params.selectedOrder?.sizes?.[sizeCode] || 0),
            rcvdPairs: Number(params.entrySizes[sizeCode] || 0)
          }))
        })
      });
      const result = await response.json();
      if (!response.ok || !result.success || !result.data) {
        showToast(result.error || 'Unable to save receiving record to database.');
        return null;
      }
      savedReceiving = result.data;
    } catch (err) {
      console.error('GRN save failed:', err);
      showToast('Failed to save receiving record to backend.');
      return null;
    }

    const persistedCode = savedReceiving?.rcv_number || newGrnCode;
    const persistedDate = savedReceiving?.rcv_date || params.rcvDate;
    const persistedOrderId = savedReceiving?.order_id || params.entryPendingOrder;
    const addedPairs = Number(savedReceiving?.rcvd_pairs || params.rcvdPairs);
    const savedMaker = savedReceiving?.maker_contractor || params.entryMaker;
    const savedHallName = savedReceiving?.hall_name || params.entryHallName || '';
    const savedStitcherName = savedReceiving?.stitcher_name || params.entryStitcherName || '';
    const savedReceivingNote = savedReceiving?.receiving_note || params.entryReceivingNote || '';
    const savedArticle = savedReceiving?.article_name || params.entryArticle;
    const savedColor = savedReceiving?.color_shade || params.entryColor;
    const savedFrom = savedReceiving?.received_from || params.entryReceivedFrom;

    state.grnList.unshift({
      sr: savedReceiving?.id || newSr,
      grnCode: persistedCode,
      date: persistedDate,
      pendingOrderId: persistedOrderId,
      maker: savedMaker,
      hallName: savedHallName,
      stitcherName: savedStitcherName,
      receivingNote: savedReceivingNote,
      article: savedArticle,
      color: savedColor,
      receivedFrom: savedFrom,
      rcvdPairs: addedPairs,
      sizeFormat: params.activeFormat,
      sizeCodes: params.activeCodes,
      sizes: { ...params.entrySizes },
      status: 'Received'
    });

    if (params.selectedOrder && params.selectedOrder.availableDockPairs !== undefined) {
      params.selectedOrder.receivedPairs = Number(params.selectedOrder.receivedPairs || 0) + addedPairs;
      params.selectedOrder.availableDockPairs = Number(params.selectedOrder.availableDockPairs || 0) + addedPairs;
      params.selectedOrder.unclaimedDockPairs = Math.max(
        0,
        params.selectedOrder.availableDockPairs - Number(params.selectedOrder.pendingReqPairs || 0)
      );
      if (params.selectedOrder.receivedSizes) {
        for (const size of params.activeCodes) {
          params.selectedOrder.receivedSizes[size] =
            Number(params.selectedOrder.receivedSizes[size] || 0) + Number(params.entrySizes[size] || 0);
        }
      }
      params.selectedOrder.unclaimedDockSizes = params.selectedOrder.unclaimedDockSizes || createEmptySizes(params.activeCodes);
      for (const size of params.activeCodes) {
        params.selectedOrder.unclaimedDockSizes[size] =
          Number(params.selectedOrder.unclaimedDockSizes[size] || 0) + Number(params.entrySizes[size] || 0);
      }
      if (params.selectedOrder.contractorAllocations?.length) {
        const alloc = params.selectedOrder.contractorAllocations.find(
          a => a.maker.trim().toLowerCase() === params.entryMaker.trim().toLowerCase()
        );
        if (alloc) {
          alloc.receivedPairs = Number(alloc.receivedPairs || 0) + addedPairs;
          alloc.remainingPairs = Math.max(0, alloc.totalQty - alloc.receivedPairs);
          alloc.receivedSizes = alloc.receivedSizes || createEmptySizes(params.activeCodes);
          alloc.remainingSizes = alloc.remainingSizes || { ...alloc.sizes };
          for (const size of params.activeCodes) {
            alloc.receivedSizes[size] = Number(alloc.receivedSizes[size] || 0) + Number(params.entrySizes[size] || 0);
            alloc.remainingSizes[size] = Math.max(0, Number(alloc.sizes[size] || 0) - Number(alloc.receivedSizes[size] || 0));
          }
        }
      }
    }

    if (!state.packingWip.article && savedArticle) {
      state.packingWip.article = savedArticle;
    }
    if (!state.packingWip.parentOrderId && persistedOrderId) {
      state.packingWip.parentOrderId = persistedOrderId;
    }

    return {
      grnRef: persistedCode,
      date: persistedDate,
      pendingOrderId: persistedOrderId,
      maker: savedMaker,
      hallName: savedHallName || undefined,
      stitcherName: savedStitcherName || undefined,
      receivingNote: savedReceivingNote || undefined,
      article: savedArticle,
      color: savedColor,
      receivedFrom: savedFrom,
      splitSummary: params.splitSummary || undefined,
      rcvdPairs: addedPairs,
      sizes: { ...params.entrySizes },
      sizeFormat: params.activeFormat,
      sizeCodes: params.activeCodes
    };
  }

  // Receive button: saves GRN(s) with today's date and opens confirmation popup (Print button ready at bottom, no auto-print)
  document.getElementById('btn-print-grn-slip')?.addEventListener('click', async () => {
    syncSizesAndReceived();
    const formPendingOrder = pendingOrderSelect?.value || state.grnForm.pendingOrderId;
    const formMaker = makerSelect?.value || state.grnForm.maker;
    const formArt = articleInput?.value || state.grnForm.article;
    const formColor = colorInput?.value || state.grnForm.color || 'Standard';
    const activeOrder = state.pendingOrders.find(order => order.orderId === (formPendingOrder || 'ORD-INWARD'));
    const activeCodes = getOrderSizeCodes(
      formPendingOrder,
      activeOrder?.sizeCodes || state.grnForm.sizeCodes,
      activeOrder?.sizeFormat || state.grnForm.sizeFormat
    );
    const activeFormat = activeOrder?.sizeFormat || state.grnForm.sizeFormat || 'LEGACY_7_11';
    const splitSummary = formatSplitAllocationSummary(activeOrder?.contractorAllocations);
    const todayDate = formatCurrentDateDDMMYYYY();

    const isMultiSplitMode = Boolean(activeOrder && (activeOrder.contractorAllocations?.length || 0) > 1 && !formMaker);
    if (isMultiSplitMode && activeOrder) {
      const activeRows = state.grnForm.splitRows
        .map((row, idx) => ({ row, idx, total: calculateSizeTotal(row.sizes) }))
        .filter(item => item.total > 0);
      if (activeRows.length === 0) {
        showToast('Enter received quantities for at least one split contractor.');
        return;
      }
      const missingSenderFields: Array<[HTMLElement | null, string]> = [];
      for (const item of activeRows) {
        const rfInp = document.querySelector<HTMLElement>(`.grn-split-received-from[data-split-idx="${item.idx}"]`);
        const stitcherSel = document.querySelector<HTMLElement>(`.grn-split-stitcher[data-split-idx="${item.idx}"]`);
        const rowHall = findHallByName(item.row.maker);
        const hasHallStitchers = Boolean(rowHall && rowHall.stitchers.length > 0);
        if (hasHallStitchers) {
          if (!item.row.stitcherName?.trim()) {
            missingSenderFields.push([stitcherSel, `Select a stitcher from ${rowHall!.name}.`]);
          } else {
            applyFieldValidationErrors([[stitcherSel, ''], [rfInp, '']]);
          }
        } else if (!item.row.receivedFrom.trim()) {
          missingSenderFields.push([rfInp, `Enter who delivered goods for ${item.row.maker}.`]);
        } else {
          applyFieldValidationErrors([[rfInp, '']]);
        }
        const rowCaps = getGrnRemainingCaps(formPendingOrder, item.row.maker);
        if (rowCaps && (
          item.total > rowCaps.totalRemaining ||
          activeCodes.some(sz => Number(item.row.sizes[sz] || 0) > (rowCaps.sizeRemaining[sz] ?? 0))
        )) {
          showToast(`Received quantities exceed remaining allocation cap for ${item.row.maker}.`);
          return;
        }
      }
      if (missingSenderFields.length > 0) {
        applyFieldValidationErrors(missingSenderFields);
        showToast('Complete stitcher / received-from attribution for each contractor delivering goods.');
        return;
      }

      const savedBatches: GrnSlipParams[] = [];
      for (const item of activeRows) {
        const rowHall = findHallByName(item.row.maker);
        const hasHallStitchers = Boolean(rowHall && rowHall.stitchers.length > 0);
        const noteVal = item.row.receivedFrom.trim();
        const effectiveFrom = hasHallStitchers
          ? (noteVal || `${item.row.stitcherName} (${rowHall!.name})`)
          : noteVal;
        const saved = await persistAndRecordGrnBatch({
          entryPendingOrder: formPendingOrder,
          selectedOrder: activeOrder,
          entryMaker: item.row.maker,
          entryHallName: hasHallStitchers ? rowHall!.name : (item.row.hallName || ''),
          entryStitcherName: hasHallStitchers ? (item.row.stitcherName || '') : '',
          entryReceivingNote: hasHallStitchers ? noteVal : '',
          entryArticle: activeOrder.article || formArt || '---',
          entryColor: activeOrder.color || formColor || 'Standard',
          entryReceivedFrom: effectiveFrom,
          entrySizes: { ...item.row.sizes },
          rcvdPairs: item.total,
          activeCodes,
          activeFormat,
          rcvDate: todayDate,
          splitSummary
        });
        if (!saved) {
          if (savedBatches.length > 0) renderApp();
          return;
        }
        savedBatches.push(saved);
      }

      state.grnForm.splitRows = (activeOrder.contractorAllocations || []).map(a => {
        const matchedHall = findHallByName(a.maker);
        return {
          maker: a.maker,
          hallName: matchedHall && matchedHall.stitchers.length > 0 ? matchedHall.name : '',
          stitcherName: '',
          receivedFrom: '',
          sizes: createEmptySizes(activeCodes)
        };
      });
      state.grnForm.rcvdPairs = '';
      const confirmHtml = buildGrnReceiveConfirmationHtml({
        pendingOrderId: formPendingOrder,
        date: savedBatches[0].date,
        splitSummary,
        batches: savedBatches
      });
      renderApp();
      openModal(`Receiving Confirmed — ${savedBatches.map(b => b.grnRef).join(', ')} (${formPendingOrder})`, confirmHtml, true);
      return;
    }

    const formHall = (hallSelect?.value ?? state.grnForm.hallName ?? '').trim();
    const formStitcher = (stitcherSelect?.value ?? state.grnForm.stitcherName ?? '').trim();
    const formReceivedFrom = (receivedFromInput?.value ?? state.grnForm.receivedFrom ?? '').trim();
    const selectedHallObj = findHallByName(formHall);
    const sizeTotal = calculateSizeTotal(state.grnForm.sizes);
    const rcvdPairs = Math.max(0, parseInt(rcvdPairsInput?.value || '0', 10) || sizeTotal);
    const caps = getGrnRemainingCaps(formPendingOrder, formMaker);
    if (caps && (
      rcvdPairs > caps.totalRemaining ||
      activeCodes.some(size => Number(state.grnForm.sizes[size] || 0) > (caps.sizeRemaining[size] ?? 0))
    )) {
      showToast('Received quantities exceed the selected contractor allocation remaining size or total cap.');
      return;
    }

    if (formPendingOrder || formMaker || formHall || formArt || rcvdPairs > 0) {
      if (formPendingOrder && !formMaker) {
        applyFieldValidationErrors([[makerSelect, 'Choose the delivering contractor for this order.']]);
        showToast('Choose which allocated contractor delivered these goods.');
        return;
      }
      if (formHall) {
        if (!selectedHallObj || selectedHallObj.stitchers.length === 0) {
          applyFieldValidationErrors([[hallSelect, 'Add stitchers to this Hall in Registry 04 before receiving from it, or clear Hall.']]);
          showToast(`No stitchers are assigned to ${formHall} in Registry 04 yet.`);
          return;
        }
        if (!formStitcher) {
          applyFieldValidationErrors([[stitcherSelect, `Select which stitcher in ${selectedHallObj.name} delivered these goods.`]]);
          showToast(`Select a Stitcher from ${selectedHallObj.name}.`);
          return;
        }
      } else if (!formReceivedFrom) {
        applyFieldValidationErrors([[receivedFromInput, 'Enter the person name goods were received from.']]);
        showToast('Enter the person name in Received From.');
        return;
      }

      const effectiveReceivedFrom = selectedHallObj && formStitcher
        ? (formReceivedFrom || `${formStitcher} (${selectedHallObj.name})`)
        : formReceivedFrom;
      const effectiveReceivingNote = selectedHallObj && formStitcher ? formReceivedFrom : '';

      const saved = await persistAndRecordGrnBatch({
        entryPendingOrder: formPendingOrder || 'ORD-INWARD',
        selectedOrder: activeOrder,
        entryMaker: formMaker || selectedHallObj?.name || '---',
        entryHallName: selectedHallObj?.name || '',
        entryStitcherName: selectedHallObj ? formStitcher : '',
        entryReceivingNote: effectiveReceivingNote,
        entryArticle: activeOrder?.article || formArt || '---',
        entryColor: activeOrder?.color || formColor || 'Standard',
        entryReceivedFrom: effectiveReceivedFrom,
        entrySizes: { ...state.grnForm.sizes },
        rcvdPairs,
        activeCodes,
        activeFormat,
        rcvDate: todayDate,
        splitSummary
      });
      if (!saved) return;

      state.grnForm.sizes = createEmptySizes(activeCodes);
      state.grnForm.rcvdPairs = '';
      if (selectedHallObj) {
        state.grnForm.stitcherName = '';
        state.grnForm.receivedFrom = '';
      }
      const confirmHtml = buildGrnReceiveConfirmationHtml({
        pendingOrderId: saved.pendingOrderId || 'ORD-INWARD',
        date: saved.date,
        splitSummary,
        batches: [saved]
      });
      renderApp();
      openModal(`Receiving Confirmed — ${saved.grnRef} (${saved.pendingOrderId})`, confirmHtml, true);
      return;
    }

    const latest = state.grnList[0];
    const pendingOrderId = formPendingOrder || latest?.pendingOrderId || '---';
    const maker = formMaker || latest?.maker || '---';
    const article = latest?.article || formArt || '---';
    const color = latest?.color || formColor || 'Standard';
    const receivedFrom = formReceivedFrom || latest?.receivedFrom || maker || '---';
    const sizes = calculateSizeTotal(state.grnForm.sizes) > 0
      ? state.grnForm.sizes
      : (latest?.sizes || createEmptySizes(activeCodes));
    const finalRcvd = rcvdPairs || latest?.rcvdPairs || calculateSizeTotal(sizes);
    const grnCode = latest?.grnCode || formatBatchSequence('GRN', state.grnList.length || 1);
    const fallbackHtml = buildGrnReceiveConfirmationHtml({
      pendingOrderId,
      date: latest?.date || todayDate,
      splitSummary,
      batches: [{
        grnRef: grnCode,
        date: latest?.date || todayDate,
        pendingOrderId,
        maker,
        hallName: latest?.hallName || undefined,
        stitcherName: latest?.stitcherName || undefined,
        receivingNote: latest?.receivingNote || undefined,
        article,
        color,
        receivedFrom,
        splitSummary: splitSummary || undefined,
        rcvdPairs: finalRcvd,
        sizes,
        sizeFormat: latest?.sizeFormat || activeFormat,
        sizeCodes: latest?.sizeCodes || activeCodes
      }]
    });
    openModal(`Receiving Confirmed — ${grnCode} (${pendingOrderId})`, fallbackHtml, true);
  });

  document.getElementById('grn-queue-req-select')?.addEventListener('change', (e) => {
    const select = e.target as HTMLSelectElement;
    if (!select.value) return;
    switchActiveOrder(select.value);
    renderApp();
  });

  // Inward Register Person issues the Packing Hall's Requisition Asking (given available received stock)
  document.getElementById('btn-issue-req-to-packing')?.addEventListener('click', async () => {
    const wip = state.packingWip;
    const baseReq = normalizeBaseReqNumber(wip.selectedBatch);
    const askingPairs = wip.plannedQty || calculateSizeTotal(wip.sizes);

    if (askingPairs <= 0) {
      showToast('Packing Hall has not generated an asking quantity yet. Generate Requisition in Packing Hall first.');
      return;
    }

    const targetOrderId = wip.parentOrderId || state.grnList[0]?.pendingOrderId || '';
    const orderStock = getOrderStockState(targetOrderId);
    const evalIssue = evaluateRequisitionIssuance({
      askingPairs,
      askingSizes: wip.sizes,
      totalReceivedPairs: orderStock.totalReceived,
      alreadyIssuedPairs: orderStock.totalIssued
    });

    if (!evalIssue.canIssue) {
      showToast(`Insufficient received stock in Inward Register${targetOrderId ? ` for ${targetOrderId}` : ''}! Asking: ${evalIssue.askingPairs} Pairs, Available: ${evalIssue.availablePairs} Pairs (Shortfall: ${evalIssue.shortfallPairs} Pairs).`);
      return;
    }

    const isPersisted = isPersistedRequisition(baseReq);

    if (targetOrderId || isPersisted) {
      const endpoint = targetOrderId
        ? `/api/orders/${encodeURIComponent(targetOrderId)}/issue-req`
        : `/api/requisitions/${encodeURIComponent(baseReq)}/issue`;
      const bodyPayload = targetOrderId
        ? { reqNumber: baseReq, requestedPairs: evalIssue.askingPairs }
        : {};
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload)
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          showToast(result.error || `Unable to issue Requisition ${baseReq}.`);
          return;
        }

        const serverReq = result.data?.requisition || (result.data?.req_number ? result.data : null);
        if (serverReq) {
          applyServerRequisition(serverReq, true);
          state.persistedReqNumbers = Array.from(new Set([...state.persistedReqNumbers, baseReq]));
        } else {
          state.packingWip.issueStatus = 'Issued by Inward Register';
          state.packingWip.stage1In = evalIssue.askingPairs;
          state.packingWip.mreqQty = '0 Sets';
          if (!state.packingWip.parentOrderId && targetOrderId) {
            state.packingWip.parentOrderId = targetOrderId;
          }
          saveCurrentOrderWipState();
        }

        const matchedOrder = state.pendingOrders.find(o => o.orderId === targetOrderId);
        if (matchedOrder && matchedOrder.availableDockPairs !== undefined) {
          matchedOrder.issuedPairs = Number(matchedOrder.issuedPairs || 0) + evalIssue.askingPairs;
          const nextAvailableDock = typeof result.data?.remainingDockPoolPairs === 'number'
            ? result.data.remainingDockPoolPairs
            : Math.max(0, Number(matchedOrder.availableDockPairs || 0) - evalIssue.askingPairs);
          const nextPendingReq = Math.max(0, Number(matchedOrder.pendingReqPairs || 0) - evalIssue.askingPairs);
          matchedOrder.availableDockPairs = nextAvailableDock;
          matchedOrder.pendingReqPairs = nextPendingReq;
          matchedOrder.unclaimedDockPairs = Math.max(0, nextAvailableDock - nextPendingReq);
        }
        state.issuedPairsTotal = getTotalIssuedPairs();
      } catch (error) {
        console.error('Requisition issuance failed:', error);
        showToast(`Failed to issue Requisition ${baseReq} to backend.`);
        return;
      }
    } else {
      state.issuedPairsTotal += evalIssue.askingPairs;
      state.packingWip.issueStatus = 'Issued by Inward Register';
      state.packingWip.stage1In = evalIssue.askingPairs;
      state.packingWip.mreqQty = '0 Sets';
      saveCurrentOrderWipState();
    }

    const slipHtml = buildPackingRequisitionSlipHtml({
      reqNo: baseReq,
      date: formatCurrentDateDDMMYYYY(),
      article: state.packingWip.article || '---',
      sizes: state.packingWip.sizes,
      totalPairs: evalIssue.askingPairs,
      issueStatus: 'Issued by Inward Register',
      sizeFormat: (state.packingWip as any).sizeFormat,
      sizeCodes: (state.packingWip as any).sizeCodes
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
          ${resolveScaleKeysForBreakdown(g.sizes, g.sizeCodes).map(sz => `${escapeHtml(sz)}:${g.sizes?.[sz] ?? 0}`).join(' | ')}
        </td>
        <td style="border: 1px solid var(--border-strong); padding: 5px; text-align: right; font-weight: bold;">${g.rcvdPairs.toLocaleString()}</td>
      </tr>
    `).join('');

    const totRcvd = state.grnList.reduce((acc, x) => acc + (x.rcvdPairs || 0), 0);

    const docHtml = `
      <div class="printable-slip-box">
        <div class="printable-slip-header">
          <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-950);">HAMMAD INDUSTRIES &bull; DAILY INWARD GOODS REGISTER SUMMARY</h2>
          <p style="margin: 3px 0 0; font-size: 11px; text-transform: uppercase; color: var(--ink-600);">
            Dock #1 Store Receiving Master Sheet &bull; Date: ${formatCurrentDateDDMMYYYY()}
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
  const batchSelect = document.getElementById('defect-batch-id') as HTMLSelectElement | null;
  const articleSelect = document.getElementById('defect-article') as HTMLSelectElement | null;
  const tailorSelect = document.getElementById('defect-tailor-select') as HTMLSelectElement | null;
  const tailorInput = document.getElementById('defect-tailor') as HTMLInputElement | null;

  batchSelect?.addEventListener('change', () => {
    state.repairForm.batchId = batchSelect.value;
    state.repairForm.article = '';
    renderApp();
  });

  articleSelect?.addEventListener('change', () => {
    state.repairForm.article = articleSelect.value;
    renderApp();
  });

  document.getElementById('btn-repair-toggle-all')?.addEventListener('click', () => {
    (state.repairForm as any).showAllBatches = !(state.repairForm as any).showAllBatches;
    if (!(state.repairForm as any).showAllBatches) {
      state.repairForm.batchId = '';
    }
    renderApp();
  });

  document.getElementById('btn-repair-max-qty')?.addEventListener('click', () => {
    const btn = document.getElementById('btn-repair-max-qty');
    const qtyInput = document.getElementById('defect-qty') as HTMLInputElement | null;
    const maxVal = btn?.getAttribute('data-max-qty') || '0';
    if (qtyInput) qtyInput.value = maxVal;
  });

  const getTailor = (fallback: string): string => {
    const selected = tailorSelect?.value || '__custom__';
    const name = selected === '__custom__' ? tailorInput?.value.trim() || '' : selected;
    state.repairForm.tailor = name;
    return name || fallback;
  };
  const applyAlterationOutcome = (batchId: string, quantity: number, outcome: 'repaired' | 'scrapped'): boolean => {
    const reqNumber = normalizeBaseReqNumber(batchId);
    const wip = normalizeBaseReqNumber(state.packingWip.selectedBatch) === reqNumber
      ? state.packingWip
      : state.ordersWipMap[reqNumber] as OrderWipState | undefined;
    if (!wip) {
      showToast(`No Packing Hall WIP record is available for ${batchId}; the alteration was not closed.`);
      return false;
    }
    const availableAlteration = Math.max(0, Number(wip.inAlteration || 0) - Number(wip.scrappedPairs || 0));
    if (quantity > availableAlteration) {
      showToast(`Only ${availableAlteration} pairs are currently in alteration for ${batchId}.`);
      return false;
    }

    if (outcome === 'repaired') {
      wip.inAlteration = Math.max(0, Number(wip.inAlteration || 0) - quantity);
      wip.stage1In = Number(wip.stage1In || 0) + quantity;
    } else {
      wip.scrappedPairs = Number(wip.scrappedPairs || 0) + quantity;
    }
    if (wip === state.packingWip) {
      saveCurrentOrderWipState();
    } else {
      state.ordersWipMap[reqNumber] = JSON.parse(JSON.stringify(wip));
    }
    return true;
  };

  tailorSelect?.addEventListener('change', () => {
    state.repairForm.tailor = tailorSelect.value === '__custom__' ? (tailorInput?.value || '') : tailorSelect.value;
  });
  tailorInput?.addEventListener('input', () => {
    if (tailorSelect?.value === '__custom__') state.repairForm.tailor = tailorInput.value;
  });

  const getDefectSummaryForReq = (reqNumber: string): string => {
    const activeReasons = Array.from(new Set(
      state.defectList
        .filter(d => (d.rawStatus === 'SENT_FOR_ALTERATION' || d.status === 'In Rework') && normalizeBaseReqNumber(d.reqNumber || d.id) === reqNumber)
        .map(d => String(d.defectClass || '').trim())
        .filter(Boolean)
    ));
    return activeReasons.length > 0 ? activeReasons.join(', ') : 'Workmanship Defect';
  };

  document.getElementById('btn-assign-tailor')?.addEventListener('click', async () => {
    const batchId = (document.getElementById('defect-batch-id') as HTMLSelectElement)?.value || defaultAltId;
    const tailor = getTailor('');
    if (!tailor) {
      showToast('Select or enter a tailor name before assigning.');
      return;
    }
    const qtyNum = parseInt((document.getElementById('defect-qty') as HTMLInputElement)?.value || '0', 10) || 0;
    const targetReq = normalizeBaseReqNumber(batchId);
    const openServerRows = state.defectList.filter(
      d => d.altId && d.rawStatus === 'SENT_FOR_ALTERATION' && normalizeBaseReqNumber(d.reqNumber || d.id) === targetReq
    );
    if (openServerRows.length > 0) {
      const totalOpen = openServerRows.reduce((sum, d) => sum + Number(d.pairsCount || 0), 0);
      const assignQty = qtyNum > 0 ? qtyNum : totalOpen;
      if (assignQty <= 0 || assignQty > totalOpen) {
        showToast(`Enter an assign quantity between 1 and ${totalOpen} pairs.`);
        return;
      }
      try {
        const res = await fetch('/api/alterations/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reqNumber: targetReq, tailorName: tailor, pairsCount: assignQty })
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Unable to assign tailor.');
        }
        saveTailorName(tailor);
        await syncBackendData();
        showToast(`Assigned ${assignQty} pairs of ${batchId} to ${tailor}.`);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Unable to assign tailor.');
      }
      return;
    }
    state.defectList.forEach(d => {
      if (normalizeBaseReqNumber(d.reqNumber || d.id) === targetReq && (d.rawStatus === 'SENT_FOR_ALTERATION' || d.status === 'In Rework')) {
        d.tailor = tailor;
      }
    });
    saveTailorName(tailor);
    renderApp();
    showToast(`Assigned ${batchId} to ${tailor}.`);
  });

  const handleAlterationSubmit = async (isScrap: boolean) => {
    const batchId = (document.getElementById('defect-batch-id') as HTMLSelectElement)?.value || defaultAltId;
    const article = (document.getElementById('defect-article') as HTMLSelectElement)?.value || state.packingWip.article || '---';
    const po = (document.getElementById('defect-po') as HTMLSelectElement)?.value || state.packingWip.po || '---';
    const targetReq = normalizeBaseReqNumber(batchId);
    const defectType = getDefectSummaryForReq(targetReq);
    const tailor = getTailor(isScrap ? 'Scrap Authority' : 'Supervisor A');
    const qtyNum = parseInt((document.getElementById('defect-qty') as HTMLInputElement)?.value || '0', 10) || 0;

    if (qtyNum <= 0) {
      showToast(isScrap ? 'Enter a scrap quantity greater than zero.' : 'Enter a repair quantity greater than zero.');
      return;
    }
    const openServerRows = state.defectList.filter(
      d => d.altId && d.rawStatus === 'SENT_FOR_ALTERATION' && normalizeBaseReqNumber(d.reqNumber || d.id) === targetReq
    );

    if (openServerRows.length > 0) {
      const totalOpen = openServerRows.reduce((sum, d) => sum + Number(d.pairsCount || 0), 0);
      if (qtyNum > totalOpen) {
        showToast(`Only ${totalOpen} pairs are currently pending alteration for ${batchId}.`);
        return;
      }
      try {
        let remaining = qtyNum;
        for (const row of openServerRows) {
          if (remaining <= 0) break;
          const rowPairs = Number(row.pairsCount || 0);
          const pairsCount = Math.min(remaining, rowPairs);
          const res = await fetch(`/api/alterations/${row.altId}/repair`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tailorName: tailor,
              isScrap,
              deductionRate: 150,
              pairsCount
            })
          });
          const json = await res.json();
          if (!res.ok || !json.success) {
            throw new Error(json.error || 'Unable to save alteration outcome.');
          }
          remaining -= pairsCount;
        }
        saveTailorName(tailor);
        state.repairForm.qty = '';
        await syncBackendData();
        showToast(isScrap
          ? `Alteration ${batchId} (${qtyNum} pairs) logged as Scrap.`
          : `Alteration ${batchId} (${qtyNum} pairs) marked complete and returned to STAGE 1 Checking.`);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Unable to save alteration outcome.');
      }
      return;
    }

    if (!applyAlterationOutcome(batchId, qtyNum, isScrap ? 'scrapped' : 'repaired')) return;
    saveTailorName(tailor);
    state.defectList.unshift({
      id: batchId,
      date: formatCurrentDateDDMMYYYY(),
      origin: 'Stage 1 Checking',
      article,
      po,
      defectClass: defectType,
      qty: `${qtyNum} Prs`,
      tailor,
      status: isScrap ? 'Scrapped' : 'Completed',
      route: isScrap ? 'Scrap Ledger' : 'Auto-Return to Stage 1 Checking',
      actionText: isScrap ? 'Scrapped' : 'Verified'
    });
    renderApp();
    showToast(isScrap
      ? `Alteration ${batchId} logged as Scrap/Unrepairable.`
      : `Alteration ${batchId} marked complete and auto-routed to STAGE 1 Checking.`);
  };

  document.getElementById('btn-complete-repair')?.addEventListener('click', () => void handleAlterationSubmit(false));
  document.getElementById('btn-log-scrap')?.addEventListener('click', () => void handleAlterationSubmit(true));

  document.querySelectorAll<HTMLElement>('[data-alt-split-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const altId = Number(btn.getAttribute('data-alt-split-id') || 0);
      const totalPairs = Number(btn.getAttribute('data-alt-pairs') || 0);
      const rowTailor = btn.getAttribute('data-alt-tailor') || 'Supervisor A';
      const rowReq = btn.getAttribute('data-alt-req') || defaultAltId;
      if (!altId || totalPairs <= 0) return;

      openModal(`Split Outcome — ${escapeHtml(rowReq)}`, `
        <div style="font-size: 13px;">
          <p style="margin: 0 0 12px; color: var(--ink-700);">
            Batch with <strong>${escapeHtml(rowTailor)}</strong>: <strong>${totalPairs} Pairs</strong> pending. Enter how many pairs are returning repaired to Stage 1 and/or scrapped.
          </p>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
            <div class="form-group">
              <label for="alt-split-return">Return to Stage 1 (Repaired)</label>
              <input type="number" id="alt-split-return" class="form-input" min="0" max="${totalPairs}" value="${totalPairs}" />
            </div>
            <div class="form-group">
              <label for="alt-split-scrap">Log as Scrap (Unrepairable)</label>
              <input type="number" id="alt-split-scrap" class="form-input" min="0" max="${totalPairs}" value="0" />
            </div>
          </div>
          <div id="alt-split-summary" style="padding: 8px 10px; border: 1px solid var(--border-subtle); border-radius: 4px; background: var(--ink-50); font-size: 12px; color: var(--ink-700); margin-bottom: 14px;">
            Remaining in Rework after save: <strong>0 Pairs</strong>
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 8px;">
            <button type="button" class="btn-outline" data-modal-cancel>Cancel</button>
            <button type="button" class="btn-primary" id="btn-confirm-alt-split">Confirm Outcome</button>
          </div>
        </div>
      `, false, { hideGlobalFooter: true });

      const returnInput = document.getElementById('alt-split-return') as HTMLInputElement | null;
      const scrapInput = document.getElementById('alt-split-scrap') as HTMLInputElement | null;
      const summaryEl = document.getElementById('alt-split-summary');
      const updateSummary = () => {
        const retVal = Math.max(0, parseInt(returnInput?.value || '0', 10) || 0);
        const scrVal = Math.max(0, parseInt(scrapInput?.value || '0', 10) || 0);
        const rem = totalPairs - retVal - scrVal;
        if (summaryEl) {
          summaryEl.innerHTML = rem < 0
            ? `<span style="color: #991B1B; font-weight: 700;">Total (${retVal + scrVal}) exceeds ${totalPairs} pending pairs.</span>`
            : `Remaining in Rework after save: <strong>${rem} Pairs</strong>`;
        }
      };

      scrapInput?.addEventListener('input', () => {
        const scrVal = Math.min(totalPairs, Math.max(0, parseInt(scrapInput.value || '0', 10) || 0));
        if (returnInput) returnInput.value = String(Math.max(0, totalPairs - scrVal));
        updateSummary();
      });
      returnInput?.addEventListener('input', updateSummary);

      let splitInFlight = false;
      document.getElementById('btn-confirm-alt-split')?.addEventListener('click', async () => {
        if (splitInFlight) return;
        const retVal = Math.max(0, parseInt(returnInput?.value || '0', 10) || 0);
        const scrVal = Math.max(0, parseInt(scrapInput?.value || '0', 10) || 0);
        if (retVal + scrVal <= 0 || retVal + scrVal > totalPairs) {
          showToast(`Enter valid Return + Scrap quantities between 1 and ${totalPairs} pairs.`);
          return;
        }
        splitInFlight = true;
        const effectiveTailor = getTailor(rowTailor) || rowTailor;
        try {
          if (retVal > 0) {
            const res = await fetch(`/api/alterations/${altId}/repair`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tailorName: effectiveTailor, isScrap: false, deductionRate: 150, pairsCount: retVal })
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || 'Unable to return repaired pairs.');
          }
          if (scrVal > 0) {
            const res = await fetch(`/api/alterations/${altId}/repair`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tailorName: effectiveTailor, isScrap: true, deductionRate: 150, pairsCount: scrVal })
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || 'Unable to log scrap pairs.');
          }
          closeModal();
          saveTailorName(effectiveTailor);
          await syncBackendData();
          showToast(`Processed ${rowReq}: ${retVal} returned to Stage 1, ${scrVal} scrapped.`);
        } catch (err) {
          showToast(err instanceof Error ? err.message : 'Unable to save split outcome.');
        } finally {
          splitInFlight = false;
        }
      });
    });
  });

  document.querySelectorAll<HTMLElement>('[data-alt-row-return], [data-alt-row-scrap]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const isScrap = btn.hasAttribute('data-alt-row-scrap');
      const altId = Number(btn.getAttribute(isScrap ? 'data-alt-row-scrap' : 'data-alt-row-return') || 0);
      if (!altId) return;
      const qtyInput = document.querySelector<HTMLInputElement>(`[data-alt-qty-id="${altId}"]`);
      const maxPairs = Number(qtyInput?.getAttribute('max') || 0);
      const pairsCount = parseInt(qtyInput?.value || '0', 10) || 0;
      if (pairsCount <= 0 || (maxPairs > 0 && pairsCount > maxPairs)) {
        showToast(`Enter a valid quantity between 1 and ${maxPairs || 1} pairs.`);
        return;
      }
      const rowTailor = btn.getAttribute('data-alt-tailor') || '';
      const tailor = getTailor(rowTailor || (isScrap ? 'Scrap Authority' : 'Supervisor A'));
      try {
        const res = await fetch(`/api/alterations/${altId}/repair`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tailorName: tailor, isScrap, deductionRate: 150, pairsCount })
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Unable to update alteration record.');
        }
        saveTailorName(tailor);
        await syncBackendData();
        showToast(json.data?.message || (isScrap ? `${pairsCount} pairs logged as Scrap.` : `${pairsCount} pairs returned to STAGE 1 Checking.`));
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Unable to update alteration record.');
      }
    });
  });

  document.querySelectorAll<HTMLElement>('[data-alt-row-print]').forEach(btn => {
    btn.addEventListener('click', () => {
      const selBatch = btn.getAttribute('data-alt-req') || defaultAltId;
      const selArt = (document.getElementById('defect-article') as HTMLSelectElement | HTMLElement | null)?.textContent?.trim()
        || (document.getElementById('defect-article') as HTMLSelectElement | null)?.value
        || state.packingWip.article
        || '---';
      const selPo = (document.getElementById('defect-po') as HTMLElement | null)?.textContent?.replace(/^PO\s+/i, '').trim()
        || state.packingWip.po
        || '---';
      const selColor = (document.getElementById('defect-color') as HTMLElement | null)?.textContent?.replace(/^Colour\s+/i, '').trim()
        || '---';
      const selDefect = btn.getAttribute('data-alt-defect') || getDefectSummaryForReq(normalizeBaseReqNumber(selBatch));
      const selTailor = escapeHtml(btn.getAttribute('data-alt-tailor') || getTailor('---'));
      const altId = btn.getAttribute('data-alt-row-print') || '';
      const qtyInput = document.querySelector<HTMLInputElement>(`[data-alt-qty-id="${altId}"]`);
      const selQty = qtyInput?.value || btn.getAttribute('data-alt-pairs') || '0';

      const docHtml = `
        <div style="border: 2px dashed var(--ink-900); padding: 18px; background: var(--white); color: var(--ink-950); font-family: sans-serif;">
          <div style="text-align: center; border-bottom: 2px solid var(--ink-900); padding-bottom: 10px; margin-bottom: 14px;">
            <div style="font-size: 18px; font-weight: 800; color: var(--ink-950); letter-spacing: 0.05em;">MANDATORY REWORK ROUTE TAG</div>
            <div style="font-size: 12px; font-weight: bold; color: var(--ink-600);">الٹریشن اور مرمت کا سرکاری روٹ کارڈ</div>
          </div>
          <div class="printable-meta-grid" style="color: var(--ink-950);">
            <div><span>Alteration Requisition #:</span> <strong>${escapeHtml(selBatch)}</strong></div>
            <div><span>Parent Requisition #:</span> <strong>${escapeHtml(normalizeBaseReqNumber(selBatch))}</strong></div>
            <div><span>Article Name:</span> <strong>${escapeHtml(selArt)}</strong></div>
            <div><span>Color:</span> <strong>${escapeHtml(selColor)}</strong></div>
            <div><span>PO Number:</span> <strong>${escapeHtml(selPo)}</strong></div>
            <div><span>Defect Category:</span> <strong>${escapeHtml(selDefect)}</strong></div>
            <div><span>Batch Quantity:</span> <strong>${escapeHtml(selQty)} Pairs</strong></div>
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
  });

  document.querySelectorAll<HTMLElement>('[data-alt-return-id], [data-alt-scrap-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const isScrap = btn.hasAttribute('data-alt-scrap-id');
      const altId = Number(btn.getAttribute(isScrap ? 'data-alt-scrap-id' : 'data-alt-return-id') || 0);
      if (!altId) return;
      const tailor = getTailor(isScrap ? 'Scrap Authority' : 'Supervisor A');
      try {
        const res = await fetch(`/api/alterations/${altId}/repair`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tailorName: tailor, isScrap, deductionRate: 150 })
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Unable to update alteration record.');
        }
        saveTailorName(tailor);
        await syncBackendData();
        showToast(json.data?.message || (isScrap ? `Alteration #${altId} logged as Scrap.` : `Alteration #${altId} returned to STAGE 1 Checking.`));
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Unable to update alteration record.');
      }
    });
  });

  document.getElementById('btn-print-defect-tag')?.addEventListener('click', () => {
    const selBatch = (document.getElementById('defect-batch-id') as HTMLSelectElement)?.value || defaultAltId;
    const selArt = (document.getElementById('defect-article') as HTMLSelectElement)?.value || state.packingWip.article || '---';
    const selPo = (document.getElementById('defect-po') as HTMLSelectElement)?.value || state.packingWip.po || '---';
    const selColor = (document.getElementById('defect-color') as HTMLInputElement)?.value || '---';
    const selDefect = getDefectSummaryForReq(normalizeBaseReqNumber(selBatch));
    const selTailor = escapeHtml(getTailor('---'));
    const selQty = (document.getElementById('defect-qty') as HTMLInputElement)?.value || '0';

    const docHtml = `
      <div style="border: 2px dashed var(--ink-900); padding: 18px; background: var(--white); color: var(--ink-950); font-family: sans-serif;">
        <div style="text-align: center; border-bottom: 2px solid var(--ink-900); padding-bottom: 10px; margin-bottom: 14px;">
          <div style="font-size: 18px; font-weight: 800; color: var(--ink-950); letter-spacing: 0.05em;">MANDATORY REWORK ROUTE TAG</div>
          <div style="font-size: 12px; font-weight: bold; color: var(--ink-600);">الٹریشن اور مرمت کا سرکاری روٹ کارڈ</div>
        </div>
        <div class="printable-meta-grid" style="color: var(--ink-950);">
          <div><span>Alteration Requisition #:</span> <strong>${escapeHtml(selBatch)}</strong></div>
          <div><span>Parent Requisition #:</span> <strong>${escapeHtml(normalizeBaseReqNumber(selBatch))}</strong></div>
          <div><span>Article Name:</span> <strong>${escapeHtml(selArt)}</strong></div>
          <div><span>Color:</span> <strong>${escapeHtml(selColor)}</strong></div>
          <div><span>PO Number:</span> <strong>${escapeHtml(selPo)}</strong></div>
          <div><span>Defect Category:</span> <strong>${escapeHtml(selDefect)}</strong></div>
          <div><span>Batch Quantity:</span> <strong>${escapeHtml(selQty)} Pairs</strong></div>
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
          <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-950);">HAMMAD INDUSTRIES &bull; DAILY DEFECT &amp; ALTERATION SUMMARY LOG</h2>
          <p style="margin: 3px 0 0; font-size: 11px; text-transform: uppercase; color: var(--ink-600);">
            Alteration &amp; Repair Bay #2 (${defaultAltId}) &bull; Date: ${formatCurrentDateDDMMYYYY()}
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
          <div style="font-size: 19px; font-weight: 800; color: var(--ink-950);">HAMMAD INDUSTRIES &bull; EXPORT MASTER CARTON</div>
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

function isPersistedRequisition(reqNo: string): boolean {
  return state.persistedReqNumbers.includes(normalizeBaseReqNumber(reqNo));
}

function mapServerCartons(serverCartons: any[]): CartonRecord[] {
  if (!Array.isArray(serverCartons)) return [];
  return serverCartons.map((carton: any) => ({
    cartonNo: carton.carton_barcode || `CTN-${String(carton.carton_number || 1).padStart(2, '0')}`,
    pairs: Number(carton.pairs_count || 0),
    netWt: '4.8 kg',
    grossWt: '5.3 kg',
    dims: '29 x 23 x 28',
    barcodeVerified: true,
    sealNo: carton.carton_barcode || `SEAL-${String(carton.carton_number || 1).padStart(2, '0')}`,
    status: carton.aql_status === 'PASSED'
      ? 'Approved (AQL 1.5)'
      : carton.aql_status === 'REJECTED'
        ? 'Quarantined (AQL 1.5)'
        : (carton.status || 'PACKED')
  }));
}

function applyServerRequisition(
  requisition: any,
  forceActive = false
): typeof state.packingWip & OrderWipState {
  const mapped = mapServerRequisitionToWip(requisition);
  const reqNumber = normalizeBaseReqNumber(mapped.reqNumber);
  state.ordersWipMap[reqNumber] = mapped;
  if (
    forceActive ||
    normalizeBaseReqNumber(state.packingWip.selectedBatch) === reqNumber ||
    state.packingWip.selectedBatch === DEFAULT_REQ_NUMBER
  ) {
    state.packingWip = JSON.parse(JSON.stringify(mapped));
    state.cartons = Array.isArray((mapped as any).cartons)
      ? JSON.parse(JSON.stringify((mapped as any).cartons))
      : [];
    state.qcChecklist.forEach(c => (c.passed = Boolean(state.packingWip.finalQcApproved)));
  }
  return mapped;
}

async function postWipStageUpdate(
  reqNo: string,
  stagePath: string,
  payload: Record<string, unknown>,
  failureMessage: string
): Promise<boolean> {
  try {
    const response = await fetch(`/api/wip/${encodeURIComponent(reqNo)}/${stagePath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok || !result.success || !result.data) {
      showToast(result.error || failureMessage);
      return false;
    }
    applyServerRequisition(result.data, true);
    return true;
  } catch (error) {
    console.error(`WIP stage ${stagePath} save failed:`, error);
    showToast(failureMessage);
    return false;
  }
}

// Helper to persist current WIP state into ordersWipMap
function saveCurrentOrderWipState(): void {
  const req = normalizeBaseReqNumber(state.packingWip.selectedBatch);
  (state.packingWip as any).cartons = JSON.parse(JSON.stringify(state.cartons));
  state.ordersWipMap[req] = JSON.parse(JSON.stringify(state.packingWip));
}

function mapServerRequisitionToWip(requisition: any): typeof state.packingWip & OrderWipState {
  const reqNumber = normalizeBaseReqNumber(requisition.req_number || requisition.reqNumber);
  const order = state.pendingOrders.find(item => item.orderId === requisition.order_id);
  const wip = requisition.wip || {};
  const resolvedFormat = requisition.sizeFormat || requisition.effective_size_format || order?.sizeFormat || 'LEGACY_7_11';
  const resolvedCodes = Array.isArray(requisition.sizeCodes) && requisition.sizeCodes.length > 0
    ? requisition.sizeCodes
    : getOrderSizeCodes(requisition.order_id, order?.sizeCodes, resolvedFormat);
  const sizes = { ...createEmptySizes(resolvedCodes), ...(requisition.sizes || {}) };
  const plannedQty = Number(requisition.requested_pairs || 0);
  const stage1In = Number(wip.step1_checking_in || 0);
  const stage1Passed = Number(wip.step1_checking_good || 0);
  const stage1Defects = Number(wip.step1_checking_defects || 0);
  const stage2In = Number(wip.step2_ironing_in || 0);
  const stage2Passed = Number(wip.step2_ironing_good || 0);
  const stage2Defects = Number(wip.step2_ironing_defects || 0);
  const stage3In = Number(wip.step3_matching_in || 0);
  const stage3Passed = Number(wip.step3_matching_good || 0);
  const stage3Defects = Number(wip.step3_matching_defects || 0);
  const stage4In = stage3Passed;
  const stage4Passed = Number(wip.step4_packing_good || 0);
  const stage5Cartons = Number(wip.step5_cartons_packed || 0);
  const stage5Pairs = Number(wip.step5_pairs_packed || 0);
  const issued = ['ISSUED', 'IN_PROGRESS', 'COMPLETED', 'DISPATCHED'].includes(requisition.status);
  const alterations = Array.isArray(requisition.alterations) ? requisition.alterations : [];
  const inAlteration = alterations.reduce(
    (sum: number, alt: any) => (alt.status === 'SENT_FOR_ALTERATION' && !alt.is_scrapped ? sum + Number(alt.pairs_count || 0) : sum),
    0
  );
  const scrappedPairs = alterations.reduce(
    (sum: number, alt: any) => (alt.is_scrapped ? sum + Number(alt.pairs_count || 0) : sum),
    0
  );
  const mappedCartons = mapServerCartons(requisition.cartons);

  return {
    reqNumber,
    selectedBatch: reqNumber,
    wipBatch: reqNumber,
    parentOrderId: requisition.order_id || '',
    grnRef: '',
    article: requisition.product_name || order?.article || '',
    po: order?.po || '',
    maker: order?.maker || '',
    buyer: order?.buyer || '',
    plannedQty,
    issueStatus: issued ? 'Issued by Inward Register' : 'Pending Inward Issue',
    sizeFormat: resolvedFormat,
    sizeCodes: resolvedCodes,
    sizes,
    stage1In,
    stage1Passed,
    stage1Defects,
    stage2In,
    stage2Passed,
    stage2Defects,
    stage3In,
    stage3Passed,
    stage3Defects,
    mreqNo: getMaterialReqNumber(reqNumber),
    matReqNumber: requisition.materialReq?.mat_req_number || '',
    altReqNo: getAlterationReqNumber(reqNumber),
    mreqQty: `${stage3Passed} Sets`,
    mreqStatus: requisition.materialReq?.status || (Number(wip.step4_materials_issued || 0) === 1 ? 'ISSUED' : (stage3Passed > 0 ? 'Ready' : 'Pending Stage 3')),
    stage4In,
    stage4Passed,
    stage4Pending: Math.max(0, stage4In - stage4Passed),
    stage5Cartons: `${stage5Cartons} Cartons (${stage5Pairs} Prs)`,
    stage5Pending: `${Math.max(0, Math.ceil(stage4Passed / 30) - stage5Cartons)} Cartons`,
    lineEfficiency: computeWipRolledYieldPct({
      stage1Passed,
      stage1Defects,
      stage2Passed,
      stage2Defects,
      stage3Passed,
      stage3Defects
    }),
    outputPairs: stage5Pairs,
    outputCartons: stage5Cartons,
    inAlteration,
    scrappedPairs,
    finalQcApproved: wip.final_qc_status === 'APPROVED_DISPATCH',
    cartons: mappedCartons
  } as any;
}

function buildCurrentMaterialRequisitionSlip(): string {
  const wip = state.packingWip;
  const reqNumber = normalizeBaseReqNumber(wip.selectedBatch);
  const pairs = Math.max(0, Number(wip.stage3Passed || 0));
  const linkedOrder = state.pendingOrders.find(o => o.orderId === wip.parentOrderId);
  return buildMaterialRequisitionSlipHtml({
    mreqNo: getMaterialReqNumber(reqNumber),
    reqNo: reqNumber,
    orderId: wip.parentOrderId || '---',
    po: wip.po || linkedOrder?.po || '---',
    article: wip.article || '---',
    pairs,
    status: wip.mreqStatus || 'Ready for issue',
    date: formatCurrentDateDDMMYYYY()
  });
}

// Helper to switch active order and restore its exact stage progress
function switchActiveOrder(targetReq: string): void {
  const norm = normalizeBaseReqNumber(targetReq);
  saveCurrentOrderWipState();

  if (state.ordersWipMap[norm]) {
    state.packingWip = JSON.parse(JSON.stringify(state.ordersWipMap[norm]));
    state.cartons = Array.isArray((state.ordersWipMap[norm] as any).cartons)
      ? JSON.parse(JSON.stringify((state.ordersWipMap[norm] as any).cartons))
      : [];
  } else {
    state.packingWip.selectedBatch = norm;
    state.packingWip.wipBatch = norm;
    state.packingWip.mreqNo = getMaterialReqNumber(norm);
    state.packingWip.altReqNo = getAlterationReqNumber(norm);
    state.cartons = [];
  }
  state.qcChecklist.forEach(c => (c.passed = Boolean(state.packingWip.finalQcApproved)));
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

  document.querySelectorAll<HTMLElement>('[data-packing-action="select-wip-batch"]').forEach(el => {
    el.addEventListener('click', () => {
      const reqNumber = el.dataset.reqNumber;
      if (reqNumber) (window as any).selectWipBatchFromChart(reqNumber);
    });
  });

  document.getElementById('btn-wip-sync-retry')?.addEventListener('click', () => {
    void syncBackendData({ manual: true });
  });

  document.getElementById('btn-wip-open-qc-banner')?.addEventListener('click', () => {
    state.activeScreen = 'screen-qc';
    renderApp();
    showToast('Navigated to Final Inspection & Master Carton Clearance.');
  });

  // Single Requisition select change
  document.getElementById('wip-batch-select')?.addEventListener('change', (e) => {
    const select = e.target as HTMLSelectElement;
    if (select.value.startsWith('ORDER:')) {
      const orderId = select.value.slice('ORDER:'.length);
      select.value = normalizeBaseReqNumber(state.packingWip.selectedBatch);
      openNewRequisitionModal(orderId);
      return;
    }

    const val = normalizeBaseReqNumber(select.value);
    switchActiveOrder(val);
    showToast(`Switched active order to ${val} (Article: ${state.packingWip.article || '---'}, Stage: ${determineOrderActiveStage(state.packingWip)})`);
    renderApp();
  });

  // Stage 1 Modal
  document.getElementById('btn-wip-step1')?.addEventListener('click', () => {
    const baseReq = normalizeBaseReqNumber(state.packingWip.selectedBatch);
    const altReq = getAlterationReqNumber(state.packingWip.selectedBatch);
    const available = remainingStagePairs(
      state.packingWip.stage1In,
      state.packingWip.stage1Passed,
      state.packingWip.stage1Defects
    );
    if (available <= 0) {
      if (state.packingWip.issueStatus !== 'Issued by Inward Register' && state.packingWip.stage1In <= 0) {
        showToast(`Stage 1 locked: ${baseReq} is still Pending Inward Issue. Issue pairs in Inward Goods Receiving first.`);
      } else {
        showToast(`No pairs remaining to process in Stage 1 for ${baseReq}.`);
      }
      return;
    }
    openModal('Process Stage 1: Checking & Inspection', `
      <div style="font-size: 13px;">
        <p style="margin-bottom: 12px; color: var(--ink-600);">
          Process all ${available.toLocaleString()} available pairs. Passed and defect quantities must total the available amount; defects are routed to Alteration Bay #2 under <strong>${altReq}</strong>.
        </p>
        <div class="form-group" style="margin-bottom: 12px;">
          <label for="step1-good-input">Good / Passed Pairs (Advance to Stage 2):</label>
          <input type="number" id="step1-good-input" class="form-input" value="${available}" />
        </div>
        <div class="form-group" style="margin-bottom: 12px;">
          <label for="step1-defect-input">Defect Pairs (Route to Alteration Bay ${altReq}):</label>
          <input type="number" id="step1-defect-input" class="form-input" value="0" />
        </div>
        <div class="form-group" style="margin-bottom: 16px;">
          <label for="step1-defect-reason">Defect Classification:</label>
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
          <button type="button" class="btn-outline" data-modal-cancel>Cancel</button>
          <button type="button" class="btn-primary" id="btn-submit-step1-action">Confirm &amp; Advance Pairs &rarr;</button>
        </div>
      </div>
    `, false, { hideGlobalFooter: true });
    bindComplementaryStageInputs('step1-good-input', 'step1-defect-input', available);

    let step1InFlight = false;
    document.getElementById('btn-submit-step1-action')?.addEventListener('click', async (event) => {
      if (step1InFlight) return;
      const split = readComplementaryStageInputs('step1-good-input', 'step1-defect-input', available);
      if (!split) return;
      const submitBtn = event.currentTarget as HTMLButtonElement | null;
      step1InFlight = true;
      if (submitBtn) submitBtn.disabled = true;

      try {
        const { good, defects } = split;
        const reason = (document.getElementById('step1-defect-reason') as HTMLSelectElement)?.value || 'Stitching Skip';
        const activeReq = normalizeBaseReqNumber(state.packingWip.selectedBatch);

        if (isPersistedRequisition(activeReq)) {
          const savedOk = await postWipStageUpdate(
            activeReq,
            'step1-checking',
            { goodPairs: good, defectPairs: defects, defectReason: reason },
            'Unable to save Stage 1 checking progress.'
          );
          if (!savedOk) return;
          recordStageDefects('Stage 1 (Checking)', defects, reason);
        } else {
          state.packingWip.stage1Passed += good;
          state.packingWip.stage1Defects += defects;
          state.packingWip.stage2In += good;
          state.packingWip.inAlteration += defects;
          state.packingWip.lineEfficiency = computeWipRolledYieldPct(state.packingWip);
          recordStageDefects('Stage 1 (Checking)', defects, reason);
          saveCurrentOrderWipState();
        }
        closeModal();
        showToast(`${good} pairs advanced to Stage 2. Active stage highlight moved to Stage 2.`);
        renderApp();
      } finally {
        step1InFlight = false;
        if (submitBtn?.isConnected) submitBtn.disabled = false;
      }
    });
  });

  // Stage 2 Modal
  document.getElementById('btn-wip-step2')?.addEventListener('click', () => {
    const available = remainingStagePairs(
      state.packingWip.stage2In,
      state.packingWip.stage2Passed,
      state.packingWip.stage2Defects
    );
    if (available <= 0) {
      showToast('No pairs available in Stage 2 yet. Advance pairs from Stage 1 Checking first.');
      return;
    }
    openModal('Process Stage 2: Ironing & Brushing', `
      <div style="font-size: 13px;">
        <p style="margin-bottom: 12px; color: var(--ink-600);">
          Process all ${available.toLocaleString()} available pairs. Passed and defect quantities must total the available amount.
        </p>
        <div class="form-group" style="margin-bottom: 12px;">
          <label for="step2-good-input">Ironed &amp; Finished Pairs (Advance to Stage 3):</label>
          <input type="number" id="step2-good-input" class="form-input" value="${available}" />
        </div>
        <div class="form-group" style="margin-bottom: 16px;">
          <label for="step2-defect-input">Crease / Soil Rejects:</label>
          <input type="number" id="step2-defect-input" class="form-input" value="0" />
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button type="button" class="btn-outline" data-modal-cancel>Cancel</button>
          <button type="button" class="btn-primary" id="btn-submit-step2-action">Advance to Pair Matching &rarr;</button>
        </div>
      </div>
    `, false, { hideGlobalFooter: true });
    bindComplementaryStageInputs('step2-good-input', 'step2-defect-input', available);

    let step2InFlight = false;
    document.getElementById('btn-submit-step2-action')?.addEventListener('click', async (event) => {
      if (step2InFlight) return;
      const split = readComplementaryStageInputs('step2-good-input', 'step2-defect-input', available);
      if (!split) return;
      const submitBtn = event.currentTarget as HTMLButtonElement | null;
      step2InFlight = true;
      if (submitBtn) submitBtn.disabled = true;

      try {
        const { good, defects } = split;
        const baseReq = normalizeBaseReqNumber(state.packingWip.selectedBatch);

        if (isPersistedRequisition(baseReq)) {
          const savedOk = await postWipStageUpdate(
            baseReq,
            'step2-ironing',
            { goodPairs: good, defectPairs: defects, defectReason: 'Crease / Soil Rejects' },
            'Unable to save Stage 2 ironing progress.'
          );
          if (!savedOk) return;
          recordStageDefects('Stage 2 (Ironing)', defects, 'Crease / Soil Rejects');
        } else {
          state.packingWip.stage2Passed += good;
          state.packingWip.stage2Defects += defects;
          state.packingWip.stage3In += good;
          state.packingWip.inAlteration += defects;
          state.packingWip.lineEfficiency = computeWipRolledYieldPct(state.packingWip);
          recordStageDefects('Stage 2 (Ironing)', defects, 'Crease / Soil Rejects');
          saveCurrentOrderWipState();
        }
        closeModal();
        showToast(`${good} pairs advanced to Stage 3; ${defects} defects routed to Alteration.`);
        renderApp();
      } finally {
        step2InFlight = false;
        if (submitBtn?.isConnected) submitBtn.disabled = false;
      }
    });
  });

  // Stage 3 Modal
  document.getElementById('btn-wip-step3')?.addEventListener('click', () => {
    const available = remainingStagePairs(
      state.packingWip.stage3In,
      state.packingWip.stage3Passed,
      state.packingWip.stage3Defects
    );
    if (available <= 0) {
      showToast('No pairs available in Stage 3 yet. Advance pairs from Stage 2 Ironing first.');
      return;
    }
    openModal('Process Stage 3: Pair Matching & BOM Calculation', `
      <div style="font-size: 13px;">
        <p style="margin-bottom: 12px; color: var(--ink-600);">
          Match all ${available.toLocaleString()} available pairs. Passed and defect quantities must total the available amount. Auto-computes the BOM under <strong>${getMaterialReqNumber(state.packingWip.selectedBatch)}</strong>.
        </p>
        <div class="form-group" style="margin-bottom: 12px;">
          <label for="step3-good-input">Matched Good Pairs:</label>
          <input type="number" id="step3-good-input" class="form-input" value="${available}" />
        </div>
        <div class="form-group" style="margin-bottom: 16px;">
          <label for="step3-defect-input">Mismatch / Unpaired Gloves:</label>
          <input type="number" id="step3-defect-input" class="form-input" value="0" />
        </div>
        <div style="background: var(--ink-100); border: 1px solid var(--border-strong); border-radius: 4px; padding: 10px; margin-bottom: 14px;">
          <div style="font-weight: 700; color: var(--ink-950); margin-bottom: 4px;">Dynamic Packaging BOM (${getMaterialReqNumber(state.packingWip.selectedBatch)}):</div>
          <div style="font-size: 12px; color: var(--ink-600);">
            Polybags: <strong>${state.packingWip.stage3Passed} Pcs</strong> &bull; Hangtags: <strong>${state.packingWip.stage3Passed} Pcs</strong> &bull; Silica: <strong>${state.packingWip.stage3Passed} Sachets</strong> &bull; Barcodes: <strong>${state.packingWip.stage3Passed * 2} Pcs</strong> &bull; Master Cartons: <strong>${Math.ceil(state.packingWip.stage3Passed / 30)} Pcs</strong>
          </div>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button type="button" class="btn-outline" data-modal-cancel>Cancel</button>
          <button type="button" class="btn-primary" id="btn-submit-step3-action">Confirm &amp; Route to 1st Packing &rarr;</button>
        </div>
      </div>
    `, false, { hideGlobalFooter: true });
    bindComplementaryStageInputs('step3-good-input', 'step3-defect-input', available);

    let step3InFlight = false;
    document.getElementById('btn-submit-step3-action')?.addEventListener('click', async (event) => {
      if (step3InFlight) return;
      const split = readComplementaryStageInputs('step3-good-input', 'step3-defect-input', available);
      if (!split) return;
      const submitBtn = event.currentTarget as HTMLButtonElement | null;
      step3InFlight = true;
      if (submitBtn) submitBtn.disabled = true;

      try {
        const { good, defects } = split;
        const baseReq = normalizeBaseReqNumber(state.packingWip.selectedBatch);

        if (isPersistedRequisition(baseReq)) {
          const savedOk = await postWipStageUpdate(
            baseReq,
            'step3-matching',
            { goodPairs: good, defectPairs: defects, defectReason: 'Mismatch / Unpaired Gloves' },
            'Unable to save Stage 3 matching progress.'
          );
          if (!savedOk) return;
          recordStageDefects('Stage 3 (Matching)', defects, 'Mismatch / Unpaired Gloves');
        } else {
          state.packingWip.stage3Passed += good;
          state.packingWip.stage3Defects += defects;
          state.packingWip.stage4In += good;
          state.packingWip.inAlteration += defects;
          state.packingWip.lineEfficiency = computeWipRolledYieldPct(state.packingWip);
          recordStageDefects('Stage 3 (Matching)', defects, 'Mismatch / Unpaired Gloves');
          state.packingWip.mreqNo = getMaterialReqNumber(state.packingWip.selectedBatch);
          state.packingWip.altReqNo = getAlterationReqNumber(state.packingWip.selectedBatch);
          state.packingWip.mreqQty = `${state.packingWip.stage3Passed} Sets`;
          if (state.packingWip.mreqStatus !== 'ISSUED') {
            state.packingWip.mreqStatus = 'Ready';
          }
          saveCurrentOrderWipState();
        }
        closeModal();
        showToast(`${good} pairs matched in Stage 3. Material Requisition is now unlocked.`);
        renderApp();
      } finally {
        step3InFlight = false;
        if (submitBtn?.isConnected) submitBtn.disabled = false;
      }
    });
  });

  let mreqInFlight = false;
  document.getElementById('btn-wip-generate-mreq-slip')?.addEventListener('click', async (event) => {
    if (!isStage3ClearedForMaterialReq(state.packingWip)) {
      showToast('Material Requisition is locked until Stage 3 (Pair Matching) is cleared.');
      return;
    }
    if (mreqInFlight) return;
    const btn = event.currentTarget as HTMLButtonElement | null;
    mreqInFlight = true;
    if (btn) btn.disabled = true;

    try {
      const baseReq = normalizeBaseReqNumber(state.packingWip.selectedBatch);
      const mreqId = getMaterialReqNumber(baseReq);

      if (isPersistedRequisition(baseReq)) {
        try {
          const createResp = await fetch(`/api/wip/${encodeURIComponent(baseReq)}/material-requisition`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          });
          const createData = await createResp.json();
          if (!createResp.ok || !createData.success || !createData.data) {
            showToast(createData.error || 'Unable to generate Material Requisition.');
            return;
          }

          let matReq = createData.data;
          if (matReq.mat_req_number && matReq.status === 'PENDING') {
            const issueResp = await fetch(`/api/material-requisitions/${encodeURIComponent(matReq.mat_req_number)}/issue`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({})
            });
            const issueData = await issueResp.json();
            if (!issueResp.ok || !issueData.success || !issueData.data) {
              state.packingWip.mreqStatus = matReq.status;
              (state.packingWip as any).matReqNumber = matReq.mat_req_number;
              saveCurrentOrderWipState();
              renderApp();
              showToast(issueData.error || `Material Requisition ${matReq.mat_req_number} created, but issue failed.`);
              return;
            }
            matReq = issueData.data;
          }

          state.packingWip.mreqStatus = matReq.status || 'ISSUED';
          (state.packingWip as any).matReqNumber = matReq.mat_req_number || '';
          saveCurrentOrderWipState();
          renderApp();
        } catch (error) {
          console.error('Material Requisition persistence failed:', error);
          showToast('Failed to save or issue Material Requisition.');
          return;
        }
      } else {
        state.packingWip.mreqStatus = 'ISSUED';
        saveCurrentOrderWipState();
        renderApp();
      }

      openModal(`Material Requisition Slip — ${mreqId}`, buildCurrentMaterialRequisitionSlip(), true);
    } finally {
      mreqInFlight = false;
      if (btn?.isConnected) btn.disabled = false;
    }
  });

  document.getElementById('btn-wip-print-mreq-slip')?.addEventListener('click', () => {
    if (!isStage3ClearedForMaterialReq(state.packingWip)) {
      showToast('Material Requisition can only be printed after Stage 3 (Pair Matching) is cleared.');
      return;
    }
    const mreqId = getMaterialReqNumber(state.packingWip.selectedBatch);
    printDocument(`Material Requisition Slip — ${mreqId}`, buildCurrentMaterialRequisitionSlip());
  });

  // Stage 4 Modal
  document.getElementById('btn-wip-step4')?.addEventListener('click', () => {
    if (!isMaterialRequisitionIssuedForStage4(state.packingWip)) {
      showToast('Stage 4 locked: Clear Stage 3 and generate the Material Requisition slip first.');
      return;
    }
    const available = Math.max(0, state.packingWip.stage4In - state.packingWip.stage4Passed);
    if (available <= 0) {
      if (isPackingAwaitingFinalQc(state.packingWip)) {
        showToast('Stage 4 1st Packing is 100% complete — awaiting Final QC clearance (AQL 1.5) before Stage 5 cartons.');
      } else {
        showToast('No pairs available in Stage 4 yet. Match pairs in Stage 3 first.');
      }
      return;
    }
    openModal('Process Stage 4: 1st Packing (Unit Polybag)', `
      <div style="font-size: 13px;">
        <p style="margin-bottom: 12px; color: var(--ink-600);">
          Insert silica gel sachet, attach rider hangtag, seal airtight polybag, and affix scannable barcode label. Available to pack: <strong>${available.toLocaleString()} pairs</strong> (Cumulative packed so far: ${state.packingWip.stage4Passed.toLocaleString()} pairs).
        </p>
        <div class="form-group" style="margin-bottom: 12px;">
          <label for="step4-packed-input">Pairs to Polybag &amp; Seal (Incremental):</label>
          <input type="number" id="step4-packed-input" class="form-input" min="0" max="${available}" value="${available}" />
        </div>
        <div class="form-group" style="margin-bottom: 16px;">
          <label for="step4-pending-input">Remaining in Progress:</label>
          <input type="number" id="step4-pending-input" class="form-input" value="0" readonly />
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button type="button" class="btn-outline" data-modal-cancel>Cancel</button>
          <button type="button" class="btn-primary" id="btn-submit-step4-action">Complete 1st Packing &rarr;</button>
        </div>
      </div>
    `, false, { hideGlobalFooter: true });

    const step4Input = document.getElementById('step4-packed-input') as HTMLInputElement | null;
    const step4PendingInput = document.getElementById('step4-pending-input') as HTMLInputElement | null;
    step4Input?.addEventListener('input', () => {
      const val = parseInt(step4Input.value || '0', 10) || 0;
      if (step4PendingInput) {
        step4PendingInput.value = String(Math.max(0, available - val));
      }
    });

    let step4InFlight = false;
    document.getElementById('btn-submit-step4-action')?.addEventListener('click', async (event) => {
      if (step4InFlight) return;
      const packed = parseInt((document.getElementById('step4-packed-input') as HTMLInputElement)?.value || '0', 10) || 0;
      if (packed <= 0 || packed > available) {
        showToast(`Enter between 1 and ${available.toLocaleString()} pairs available for Stage 4 packing.`);
        return;
      }
      const submitBtn = event.currentTarget as HTMLButtonElement | null;
      step4InFlight = true;
      if (submitBtn) submitBtn.disabled = true;

      try {
        const baseReq = normalizeBaseReqNumber(state.packingWip.selectedBatch);
        if (isPersistedRequisition(baseReq)) {
          const savedOk = await postWipStageUpdate(
            baseReq,
            'step4-packing',
            { packedPairs: packed },
            'Unable to save Stage 4 packing progress.'
          );
          if (!savedOk) return;
        } else {
          state.packingWip.stage4Passed += packed;
          state.packingWip.stage4Pending = Math.max(0, state.packingWip.stage4In - state.packingWip.stage4Passed);
          saveCurrentOrderWipState();
        }
        closeModal();
        showToast(`${packed} unit polybags sealed with barcode verification.`);
        renderApp();
      } finally {
        step4InFlight = false;
        if (submitBtn?.isConnected) submitBtn.disabled = false;
      }
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
          <label for="step5-cartons-input">Cartons to Seal (30 prs/carton):</label>
          <input type="number" id="step5-cartons-input" class="form-input" value="${state.packingWip.outputCartons || Math.max(1, Math.ceil(gateCheck.readyPairs / 30))}" />
        </div>
        <div class="form-group" style="margin-bottom: 16px;">
          <label for="step5-prefix-input">Carton Seal Batch Prefix:</label>
          <input type="text" id="step5-prefix-input" class="form-input" value="FSKD-44" />
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button type="button" class="btn-outline" data-modal-cancel>Cancel</button>
          <button type="button" class="btn-primary" id="btn-submit-step5-action">Seal &amp; Add to Shipping Manifest &rarr;</button>
        </div>
      </div>
    `, false, { hideGlobalFooter: true });

    let step5InFlight = false;
    document.getElementById('btn-submit-step5-action')?.addEventListener('click', async (event) => {
      if (step5InFlight) return;
      const numCartons = parseInt((document.getElementById('step5-cartons-input') as HTMLInputElement)?.value || '0', 10) || 0;
      if (numCartons <= 0) {
        showToast('Enter at least 1 carton to seal.');
        return;
      }
      const submitBtn = event.currentTarget as HTMLButtonElement | null;
      step5InFlight = true;
      if (submitBtn) submitBtn.disabled = true;

      try {
        const baseReq = normalizeBaseReqNumber(state.packingWip.selectedBatch);
        const defaultCartons = Math.max(1, Math.ceil(gateCheck.readyPairs / 30));
        const pairsPerCarton = numCartons === defaultCartons
          ? 30
          : Math.max(1, Math.ceil(state.packingWip.stage4Passed / numCartons));

        if (isPersistedRequisition(baseReq)) {
          const savedOk = await postWipStageUpdate(
            baseReq,
            'step5-cartons-gated',
            { pairsPerCarton },
            'Unable to save Stage 5 carton packing.'
          );
          if (!savedOk) return;
          (state.packingWip as any).packedSizes = scaleSizeBreakdown(state.packingWip.sizes, state.packingWip.outputPairs);
          saveCurrentOrderWipState();
          logAuditEvent(
            'STAGE_5_CARTON_SEAL',
            baseReq,
            `Stage 4 Ready: ${state.packingWip.stage4Passed} Prs`,
            `Sealed ${state.packingWip.outputCartons} Cartons (${state.packingWip.outputPairs} Prs)`,
            state.packingWip.parentOrderId
          );
          closeModal();
          showToast(`${state.packingWip.outputCartons} Master Cartons (${state.packingWip.outputPairs} Prs) sealed and logged into Shipping Manifest!`);
          renderApp();
          return;
        }

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
      } finally {
        step5InFlight = false;
        if (submitBtn?.isConnected) submitBtn.disabled = false;
      }
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
    const baseReq = normalizeBaseReqNumber(state.packingWip.selectedBatch);
    const reqCartons = Array.isArray((state.ordersWipMap[baseReq] as any)?.cartons)
      ? (state.ordersWipMap[baseReq] as any).cartons
      : [];
    if (reqCartons.length === 0) {
      showToast(`No master cartons sealed for ${baseReq} yet. Complete Final QC and seal cartons in Stage 5 before printing labels.`);
      return;
    }
    openDocumentCenterModal('carton');
    const preview = document.getElementById('doc-preview-container');
    if (preview) printDocument('Hammad-Doc-carton', preview.innerHTML);
  });

  document.getElementById('btn-wip-final-clearance')?.addEventListener('click', () => {
    state.activeScreen = 'screen-qc';
    renderApp();
    showToast('Navigated to Final Inspection & Master Carton Clearance.');
  });
}

// Open Packing Hall Requisition Generator Modal (Links REQ-000X -> M-REQ-000X & A-REQ-000X back to Parent Order)
function openNewRequisitionModal(preselectOrderId?: string): void {
  function getOrderReqEntryCaps(orderId: string) {
    const matched = state.pendingOrders.find(o => o.orderId === orderId);
    const stock = getOrderStockState(orderId);
    const sizeFormat = matched?.sizeFormat || 'LEGACY_7_11';
    const sizeCodes = getOrderSizeCodes(orderId, matched?.sizeCodes, sizeFormat);
    const maxTotalAllowed = Math.max(0, Math.min(stock.remainingOrderTotal, stock.unclaimedPairs));
    const hasSizeGrnBreakdown = calculateSizeTotal(stock.receivedSizes) > 0;
    const perSizeMax = createEmptySizes(sizeCodes);
    for (const size of sizeCodes) {
      const remOrder = Number(stock.remainingOrderSizes[size] || 0);
      const dockSizeAvail = Math.max(0, Number(stock.unclaimedDockSizes[size] || 0));
      perSizeMax[size] = hasSizeGrnBreakdown
        ? Math.min(remOrder, dockSizeAvail)
        : Math.min(remOrder, maxTotalAllowed);
    }
    const defaultSizes = createEmptySizes(sizeCodes);
    let remainingBudget = Math.min(calculateSizeTotal(perSizeMax), maxTotalAllowed);
    for (const size of sizeCodes) {
      if (remainingBudget <= 0) break;
      const take = Math.min(perSizeMax[size], remainingBudget);
      defaultSizes[size] = take;
      remainingBudget -= take;
    }
    return { matched, stock, sizeFormat, sizeCodes, maxTotalAllowed, perSizeMax, defaultSizes };
  }

  function renderReqSizeMatrixHtml(
    sizeFormat: string,
    sizeCodes: string[],
    perSizeMax: SizeBreakdown,
    currentSizes: SizeBreakdown,
    totalVal: number,
    maxTotalAllowed: number
  ): string {
    return `
      <div style="font-weight: 700; color: var(--ink-950); margin-bottom: 6px; font-size: 11.5px; text-transform: uppercase;">
        Asking Size Breakdown Allocation (Pairs &bull; Scale: ${escapeHtml(sizeFormat)}, ${sizeCodes.length} Sizes)
      </div>
      <div class="table-responsive">
        <table class="size-matrix-table" style="margin: 0;">
          <thead>
            <tr>
              <th scope="col" aria-label="Row" style="min-width: 76px; text-align: left;"></th>
              ${sizeCodes.map(sz => `<th scope="col">${escapeHtml(formatSizeColumnLabel(sz, sizeFormat))}</th>`).join('')}
              <th scope="col" style="background: var(--ink-200); color: var(--ink-950);">Total Asking</th>
            </tr>
          </thead>
          <tbody>
            <tr data-testid="new-req-avail-row">
              <td style="text-align: left; font-size: 11.5px; color: var(--ink-600); font-weight: 600;">Available</td>
              ${sizeCodes
                .map(sz => `<td style="font-size: 12px; color: var(--ink-600); font-variant-numeric: tabular-nums;">${Number(perSizeMax[sz] || 0).toLocaleString()}</td>`)
                .join('')}
              <td style="font-size: 12px; font-weight: 700; color: var(--ink-700); font-variant-numeric: tabular-nums;">${maxTotalAllowed.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="text-align: left; font-size: 11.5px; color: var(--ink-950); font-weight: 700;">Asking</td>
              ${sizeCodes
                .map(sz => `<td><input type="number" class="size-matrix-input req-size-val" data-size="${escapeHtml(sz)}" aria-label="Asking pairs for Size ${escapeHtml(formatSizeColumnLabel(sz, sizeFormat))}" min="0" max="${perSizeMax[sz] || 0}" value="${currentSizes[sz] || ''}" placeholder="0" /></td>`)
                .join('')}
              <td style="font-weight: 800; font-size: 14px; color: var(--ink-950);" id="new-req-size-total">${totalVal}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  const dockReadyOrders = state.pendingOrders.filter(
    o => !o.shortClosed && getOrderStockState(o.orderId).unclaimedPairs > 0
  );
  const defaultOrderId =
    preselectOrderId && dockReadyOrders.some(o => o.orderId === preselectOrderId)
      ? preselectOrderId
      : state.packingWip.parentOrderId && dockReadyOrders.some(o => o.orderId === state.packingWip.parentOrderId)
        ? state.packingWip.parentOrderId
        : dockReadyOrders[0]?.orderId || '';
  const initialCaps = getOrderReqEntryCaps(defaultOrderId);
  const defaultArticle = initialCaps.matched?.article || (defaultOrderId ? state.packingWip.article : '') || '';
  const currentSizes = initialCaps.defaultSizes;
  const currentTotal = calculateSizeTotal(currentSizes);

  openModal('Create Packing Hall Requisition', `
    <div style="font-size: 13px;">
      <p style="margin-bottom: 12px; color: var(--ink-600);">
        Choose an order with received Inward Register stock and enter the pairs to draw.
      </p>
      <div class="modal-meta-grid-3">
        <div class="form-group">
          <label for="new-req-parent-order">Received Order #</label>
          <select id="new-req-parent-order" class="form-select">
            ${
              dockReadyOrders.length === 0
                ? '<option value="">-- No received dock stock available --</option>'
                : `<option value="">-- Select Order With Dock Stock --</option>${dockReadyOrders
                    .map(o => {
                      const avail = getOrderStockState(o.orderId).unclaimedPairs;
                      return `<option value="${escapeHtml(o.orderId)}" ${defaultOrderId === o.orderId ? 'selected' : ''}>${escapeHtml(o.orderId)} (${escapeHtml(o.article)} &bull; ${avail.toLocaleString()} Prs available)</option>`;
                    })
                    .join('')}`
            }
          </select>
        </div>
        <div class="form-group">
          <label for="new-req-number-preview">Requisition #</label>
          <input type="text" id="new-req-number-preview" class="form-input" value="Assigned when saved" readonly aria-readonly="true" />
        </div>
        <div class="form-group">
          <label for="new-req-article">Article</label>
          <input type="text" id="new-req-article" class="form-input" value="${escapeHtml(defaultArticle)}" readonly aria-readonly="true" />
        </div>
      </div>

      <div id="new-req-cap-summary" style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; font-size: 12px; background: var(--ink-50); border: 1px solid var(--border-strong); padding: 8px 12px; border-radius: 4px;">
      </div>

      <div id="new-req-size-matrix-container" style="background: var(--ink-50); border: 1px solid var(--border-strong); border-radius: 4px; padding: 10px; margin-bottom: 14px;">
        ${renderReqSizeMatrixHtml(initialCaps.sizeFormat, initialCaps.sizeCodes, initialCaps.perSizeMax, currentSizes, currentTotal, initialCaps.maxTotalAllowed)}
      </div>

      <div class="form-group" style="margin-bottom: 10px;">
        <label for="new-req-pairs">Total Asking / Requested Pairs</label>
        <input type="number" id="new-req-pairs" class="form-input" value="${currentTotal}" readonly aria-readonly="true" />
      </div>
      <div id="new-req-cap-warning" role="alert" aria-live="polite" style="display: none; margin-bottom: 12px; padding: 8px 10px; background: var(--ink-100); border: 1px solid var(--border-strong); border-radius: 4px; font-size: 12px; color: var(--ink-950); font-weight: 600;"></div>

      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <button type="button" class="btn-outline" data-modal-cancel>Cancel</button>
        <button type="button" class="btn-primary" id="btn-confirm-lot-draw">Save Requisition</button>
      </div>
    </div>
  `, false, { hideGlobalFooter: true });

  const parentOrderSelect = document.getElementById('new-req-parent-order') as HTMLSelectElement;
  const articleInput = document.getElementById('new-req-article') as HTMLInputElement;
  const matrixContainer = document.getElementById('new-req-size-matrix-container');
  const totalPairsInput = document.getElementById('new-req-pairs') as HTMLInputElement;
  const capSummaryEl = document.getElementById('new-req-cap-summary');
  const capWarningEl = document.getElementById('new-req-cap-warning');
  const saveReqButton = document.getElementById('btn-confirm-lot-draw') as HTMLButtonElement | null;

  let activeCaps = initialCaps;

  function renderCapSummaryAndValidation(enteredTotal: number): void {
    const { maxTotalAllowed } = activeCaps;
    if (capSummaryEl) {
      capSummaryEl.innerHTML = `
        <span>Available at Dock: <strong>${maxTotalAllowed.toLocaleString()} Prs</strong></span>
      `;
    }
    const exceeds = enteredTotal > maxTotalAllowed;
    if (capWarningEl) {
      if (maxTotalAllowed <= 0) {
        capWarningEl.style.display = 'block';
        capWarningEl.textContent = 'No unclaimed Inward Register stock available. Receive stock in Inward Goods Receiving first.';
      } else if (exceeds) {
        capWarningEl.style.display = 'block';
        capWarningEl.textContent = `Asking ${enteredTotal.toLocaleString()} pairs exceeds Available at Dock (${maxTotalAllowed.toLocaleString()} Prs).`;
      } else {
        capWarningEl.style.display = 'none';
        capWarningEl.textContent = '';
      }
    }
    if (saveReqButton) {
      saveReqButton.disabled = maxTotalAllowed <= 0 || exceeds || enteredTotal <= 0;
    }
  }

  function recalcReqModalSizes() {
    const sizes = createEmptySizes(activeCaps.sizeCodes);
    document.querySelectorAll('.req-size-val').forEach(el => {
      const input = el as HTMLInputElement;
      const size = input.getAttribute('data-size') || '';
      if (size && activeCaps.sizeCodes.includes(size)) {
        const sizeCap = Number(activeCaps.perSizeMax[size] || 0);
        const raw = Math.max(0, parseInt(input.value || '0', 10) || 0);
        const clamped = Math.min(raw, sizeCap);
        if (raw > sizeCap) {
          input.value = String(clamped);
        }
        sizes[size] = clamped;
      }
    });
    const total = calculateSizeTotal(sizes);
    const sizeTotalCell = document.getElementById('new-req-size-total');
    if (sizeTotalCell) sizeTotalCell.textContent = total.toLocaleString();
    if (totalPairsInput) totalPairsInput.value = String(total);
    renderCapSummaryAndValidation(total);
  }

  function readRequestSizes(): SizeBreakdown {
    const sizes = createEmptySizes(activeCaps.sizeCodes);
    document.querySelectorAll('.req-size-val').forEach(el => {
      const input = el as HTMLInputElement;
      const size = input.getAttribute('data-size') || '';
      if (size && activeCaps.sizeCodes.includes(size)) {
        sizes[size] = Math.max(0, parseInt(input.value || '0', 10) || 0);
      }
    });
    return sizes;
  }

  function bindReqSizeMatrixInputs(): void {
    document.querySelectorAll('.req-size-val').forEach(input => {
      input.addEventListener('input', recalcReqModalSizes);
    });
  }

  parentOrderSelect?.addEventListener('change', () => {
    activeCaps = getOrderReqEntryCaps(parentOrderSelect.value);
    if (articleInput) articleInput.value = activeCaps.matched?.article || '';
    const nextTotal = calculateSizeTotal(activeCaps.defaultSizes);
    if (matrixContainer) {
      matrixContainer.innerHTML = renderReqSizeMatrixHtml(
        activeCaps.sizeFormat,
        activeCaps.sizeCodes,
        activeCaps.perSizeMax,
        activeCaps.defaultSizes,
        nextTotal,
        activeCaps.maxTotalAllowed
      );
      bindReqSizeMatrixInputs();
    }
    recalcReqModalSizes();
  });

  bindReqSizeMatrixInputs();
  renderCapSummaryAndValidation(currentTotal);

  let createReqInFlight = false;
  document.getElementById('btn-confirm-lot-draw')?.addEventListener('click', async (event) => {
    if (createReqInFlight) return;
    const saveButton = event.currentTarget as HTMLButtonElement;
    const parentOrderId = parentOrderSelect?.value || '';
    const parentOrder = state.pendingOrders.find(order => order.orderId === parentOrderId);
    if (!parentOrder) {
      showToast('Select a received order with dock stock first.');
      return;
    }

    const sizes = readRequestSizes();
    const pairs = calculateSizeTotal(sizes);
    if (pairs <= 0) {
      showToast('Enter a quantity for at least one size.');
      return;
    }
    if (pairs > activeCaps.maxTotalAllowed) {
      showToast(`Requested ${pairs.toLocaleString()} pairs exceeds available Inward stock (${activeCaps.maxTotalAllowed.toLocaleString()} pairs).`);
      return;
    }

    createReqInFlight = true;
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(parentOrderId)}/requisitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sizes })
      });
      const result = await response.json();
      if (!response.ok || !result.success || !result.data?.reqNumber) {
        showToast(result.error || 'Requisition was not saved. Please try again.');
        return;
      }

      const saved = result.data;
      const reqNumber = normalizeBaseReqNumber(saved.reqNumber);
      const wip = applyServerRequisition(saved, true);
      state.persistedReqNumbers = Array.from(new Set([...state.persistedReqNumbers, reqNumber]));
      if (parentOrder.availableDockPairs !== undefined) {
        parentOrder.requestedPairs = Number(parentOrder.requestedPairs || 0) + pairs;
        parentOrder.pendingReqPairs = Number(parentOrder.pendingReqPairs || 0) + pairs;
        parentOrder.unclaimedDockPairs = Math.max(0, Number(parentOrder.availableDockPairs || 0) - parentOrder.pendingReqPairs);
        for (const size of activeCaps.sizeCodes) {
          const reqSz = Number(sizes[size] || 0);
          if (parentOrder.remainingOrderSizes) {
            parentOrder.remainingOrderSizes[size] = Math.max(0, Number(parentOrder.remainingOrderSizes[size] || 0) - reqSz);
          }
          if (parentOrder.requestedSizes) {
            parentOrder.requestedSizes[size] = Number(parentOrder.requestedSizes[size] || 0) + reqSz;
          }
          if (parentOrder.unclaimedDockSizes) {
            parentOrder.unclaimedDockSizes[size] = Math.max(0, Number(parentOrder.unclaimedDockSizes[size] || 0) - reqSz);
          }
        }
      }
      state.repairForm.batchId = wip.altReqNo;
      if (!state.dropdownOptions.defectBatchIds.includes(wip.altReqNo)) {
        state.dropdownOptions.defectBatchIds.unshift(wip.altReqNo);
      }

      closeModal();
      renderApp();
      showToast(`Requisition ${reqNumber} saved for Order ${parentOrderId} (${pairs.toLocaleString()} pairs). Use Print Requisition when ready.`);
    } catch (error) {
      console.error('Requisition save failed:', error);
      showToast('Requisition could not be saved. No requisition was created.');
    } finally {
      createReqInFlight = false;
      if (saveButton.isConnected) {
        saveButton.disabled = false;
        saveButton.textContent = 'Save Requisition';
      }
    }
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
      const matchedOrd = state.pendingOrders.find(o => o.orderId === pendingOrderId);
      const docSplitSummary = formatSplitAllocationSummary(matchedOrd?.contractorAllocations);

      return buildGrnReceivingSlipHtml({
        grnRef: latestGrn?.grnCode || formatBatchSequence('GRN', state.grnList.length || 1),
        date: latestGrn?.date || formatCurrentDateDDMMYYYY(),
        pendingOrderId,
        maker,
        article,
        color: latestGrn?.color || matchedOrd?.color || state.grnForm.color,
        receivedFrom: latestGrn?.receivedFrom || state.grnForm.receivedFrom || maker,
        splitSummary: docSplitSummary || undefined,
        rcvdPairs: rcvd,
        sizes,
        sizeFormat: latestGrn?.sizeFormat || matchedOrd?.sizeFormat || state.grnForm.sizeFormat,
        sizeCodes: latestGrn?.sizeCodes || matchedOrd?.sizeCodes || state.grnForm.sizeCodes
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
        date: formatCurrentDateDDMMYYYY(),
        article: state.packingWip.article || state.grnForm.article || '---',
        sizes,
        totalPairs,
        issueStatus: state.packingWip.issueStatus,
        sizeFormat: (state.packingWip as any).sizeFormat || state.grnForm.sizeFormat,
        sizeCodes: (state.packingWip as any).sizeCodes || state.grnForm.sizeCodes
      });
    } else if (type === 'carton') {
      const article = state.qcOrder.article || state.packingWip.article || '---';
      return `
        <div style="border: 2px solid var(--ink-950); padding: 18px; font-family: monospace; background: var(--white);">
          <div style="text-align: center; border-bottom: 2px solid var(--ink-950); padding-bottom: 8px; margin-bottom: 12px;">
            <div style="font-size: 18px; font-weight: 800; color: var(--ink-950);">HAMMAD INDUSTRIES &bull; EXPORT MASTER CARTON</div>
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
            <p style="margin: 2px 0 0; font-size: 11px; text-transform: uppercase; color: var(--ink-600);">Hammad Industries &bull; Customs Clearance &amp; Container Gate Release</p>
          </div>
          <div class="printable-meta-grid">
            <div><span>Shipper:</span> <strong>Hammad Industries (Pvt) Ltd</strong></div>
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
    printDocument(`Hammad-Doc-${defaultDoc}`, content);
  });
}

// Function to open ISO 2859-1 (Level II) AQL 1.5 Sampling Calculator Modal
function openAqlCalculatorModal(): void {
  openModal('ISO 2859-1 (Level II) AQL 1.5 Sampling Calculator', `
    <div style="font-size: 13px; color: var(--ink-800);">
      <p style="margin: 0 0 12px; color: var(--ink-600);">
        Automated ISO 2859-1 Normal Single Sampling Plan (AQL 1.5) decision matrix for glove export lots and carton quarantine enforcement.
      </p>

      <div class="modal-meta-grid-3" style="margin-bottom: 14px;">
        <div class="form-group">
          <label for="aql-lot-size">Lot Size (Total Pairs)</label>
          <input type="number" id="aql-lot-size" class="form-input" value="${state.packingWip.plannedQty || 840}" min="1" />
        </div>
        <div class="form-group">
          <label for="aql-target">AQL Standard</label>
          <select id="aql-target" class="form-select" disabled>
            <option value="1.5">AQL 1.5 (Level II Normal)</option>
          </select>
        </div>
        <div class="form-group">
          <label for="aql-found-defects">Found Defects (Sample)</label>
          <input type="number" id="aql-found-defects" class="form-input" value="0" min="0" />
        </div>
      </div>

      <div id="aql-result-box" style="background: var(--ink-50); border: 1px solid var(--border-strong); border-radius: 6px; padding: 14px; margin-bottom: 16px;">
        <!-- Dynamically calculated content -->
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 11px; color: var(--ink-500);">Standard: ISO 2859-1 / ANSI/ASQ Z1.4</span>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="btn-outline" data-modal-cancel>Close</button>
          <button class="btn-primary" id="btn-apply-aql-audit">Apply Audit Result to Active Lot &rarr;</button>
        </div>
      </div>
    </div>
  `, false, { hideGlobalFooter: true });

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
    const baseReq = normalizeBaseReqNumber(state.packingWip.selectedBatch);
    let passedAql = defects <= 3;

    try {
      const resp = await fetch(`/api/qc/${encodeURIComponent(baseReq)}/aql-audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          foundDefects: defects,
          inspectorId: '4402',
          inspectorName: 'Tariq Mehmood'
        })
      });
      const data = await resp.json();
      if (!resp.ok || !data.success || !data.data) {
        showToast(data.error || `AQL audit failed for ${baseReq}.`);
        return;
      }
      passedAql = Boolean(data.data.isApproved);
    } catch (error) {
      console.error('AQL audit failed:', error);
      showToast(`Failed to submit AQL audit for ${baseReq}.`);
      return;
    }

    state.qcChecklist.forEach(c => (c.passed = passedAql));
    state.packingWip.finalQcApproved = passedAql;
    saveCurrentOrderWipState();
    logAuditEvent(
      passedAql ? 'FINAL_QC_APPROVE' : 'FINAL_QC_REJECT',
      baseReq,
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

  document.getElementById('btn-admin-nav-toggle')?.addEventListener('click', () => {
    state.adminNavCollapsed = !state.adminNavCollapsed;
    renderApp();
  });

  const miniChart = document.getElementById('su-lt-mini-chart');
  const miniReadout = document.getElementById('su-lt-mini-readout');
  if (miniChart && miniReadout) {
    const defaultPct = miniReadout.getAttribute('data-default-pct') || '0';
    miniChart.querySelectorAll<HTMLElement>('.su-lt-mini-col').forEach(col => {
      const pct = col.getAttribute('data-mini-pct') || defaultPct;
      col.addEventListener('mouseenter', () => {
        miniChart.classList.add('is-hovering');
        miniReadout.innerHTML = `<span>${escapeHtml(pct)}</span><small>%</small>`;
      });
      col.addEventListener('focus', () => {
        miniChart.classList.add('is-hovering');
        miniReadout.innerHTML = `<span>${escapeHtml(pct)}</span><small>%</small>`;
      });
    });
    miniChart.addEventListener('mouseleave', () => {
      miniChart.classList.remove('is-hovering');
      miniReadout.innerHTML = `<span>${escapeHtml(defaultPct)}</span><small>%</small>`;
    });
  }

  document.querySelectorAll<HTMLButtonElement>('[data-admin-reset-password]').forEach(button => {
    button.addEventListener('click', () => {
      const userId = button.dataset.adminResetPassword;
      if (userId) void window.adminResetSystemUserPassword(userId, button);
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-admin-delete-user]').forEach(button => {
    button.addEventListener('click', () => {
      const userId = button.dataset.adminDeleteUser;
      if (userId) void window.adminDeleteSystemUser(userId, button);
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

  for (const fieldId of [
    'admin-pending-order-maker',
    'admin-pending-order-article',
    'admin-cust-name',
    'admin-prod-name',
    'admin-prod-stickers',
    'admin-prod-carton',
    'admin-user-name',
    'admin-user-username',
    'admin-user-password'
  ]) {
    const field = document.getElementById(fieldId);
    const eventType = field instanceof HTMLSelectElement ? 'change' : 'input';
    field?.addEventListener(eventType, () => clearFieldValidationError(field));
  }
  document.querySelectorAll<HTMLInputElement>('[data-admin-user-password]').forEach(input => {
    input.addEventListener('input', () => clearFieldValidationError(input));
  });

  document.querySelectorAll<HTMLElement>('[data-su-action]').forEach(el => {
    el.addEventListener('click', (e) => {
      if ((e.target as Element | null)?.closest('[data-su-action]') !== el) return;
      if (el.closest('summary')) {
        e.preventDefault();
        e.stopPropagation();
      }
      const action = el.dataset.suAction;
      switch (action) {
        case 'inspect-order': {
          const orderId = el.dataset.orderId;
          if (orderId) window.adminInspectOrderInTracking(orderId, el.dataset.refCode || undefined);
          break;
        }
        case 'open-slip': {
          const slipType = el.dataset.slipType as 'GRN' | 'REQ' | 'M-REQ' | 'A-REQ' | undefined;
          const refCode = el.dataset.refCode;
          if (slipType && refCode) void window.adminOpenDocumentSlip(slipType, refCode, el.dataset.orderId || undefined);
          break;
        }
        case 'open-req-screen': {
          const reqNumber = el.dataset.reqNumber;
          const targetScreen = el.dataset.targetScreen as 'screen-qc' | 'screen-repair' | 'screen-packing' | 'screen-grn' | undefined;
          if (reqNumber && targetScreen) window.adminOpenReqInScreen(reqNumber, targetScreen);
          break;
        }
        case 'load-demo': {
          const demoPhase = el.dataset.demoPhase as 'IN_PROGRESS' | 'COMPLETED' | 'DELIBERATE_VARIANCE' | undefined;
          if (demoPhase) void window.adminLoadDemo600Scenario(demoPhase);
          break;
        }
        case 'remove-demo':
          void window.adminRemoveDemo600Scenario();
          break;
        case 'expand-all':
          window.adminSetAllOrdersExpanded(el.dataset.expanded === 'true');
          break;
        case 'toggle-all-registries': {
          const isExp = el.dataset.expanded === 'true';
          for (const key of ['buyers', 'articles', 'makers_pos', 'audit_trail', 'sqlite_wal', 'phased_rollout']) {
            state.adminOpenRegistries[key] = isExp;
          }
          renderApp();
          break;
        }
        case 'tracking-page': {
          const page = Number(el.dataset.page);
          if (Number.isFinite(page)) window.adminSetTrackingPage(page);
          break;
        }
        case 'toggle-order-expand': {
          const orderId = el.dataset.orderId;
          if (orderId) window.adminToggleOrderExpand(orderId);
          break;
        }
        case 'quick-receive-grn': {
          const orderId = el.dataset.orderId;
          if (orderId) window.adminQuickReceiveGrnForOrder(orderId);
          break;
        }
        case 'quick-create-req': {
          const orderId = el.dataset.orderId;
          if (orderId) window.adminQuickCreateReqForOrder(orderId);
          break;
        }
        case 'short-close-order': {
          const orderId = el.dataset.orderId;
          if (orderId) void window.adminCloseOrderShort(orderId, el);
          break;
        }
        case 'void-grn': {
          const sr = Number(el.dataset.grnSr);
          const grnCode = el.dataset.grnCode;
          if (Number.isFinite(sr) && grnCode) void window.adminVoidGrnBatch(sr, grnCode, el);
          break;
        }
        case 'void-req': {
          const reqNumber = el.dataset.reqNumber;
          if (reqNumber) void window.adminVoidReqBatch(reqNumber, el);
          break;
        }
        case 'remove-pending-order': {
          const orderId = el.dataset.orderId;
          if (orderId) void window.adminRemovePendingOrder(orderId, el);
          break;
        }
        case 'remove-dropdown-item': {
          const listKey = el.dataset.listKey as 'makers' | 'poList' | undefined;
          const itemVal = el.dataset.itemVal;
          if (listKey && itemVal !== undefined) void window.adminRemoveDropdownItem(listKey, itemVal, el);
          break;
        }
        case 'remove-split-row': {
          const splitIdx = Number(el.dataset.splitIndex);
          if (Number.isInteger(splitIdx) && state.adminOrderSplitRows.length > 2) {
            syncAdminOrderDraftFromDom();
            state.adminOrderSplitRows.splice(splitIdx, 1);
            renderApp();
          }
          break;
        }
        case 'remove-article-line': {
          const lineIdx = Number(el.dataset.lineIndex);
          if (Number.isInteger(lineIdx) && state.adminOrderArticleLines[lineIdx]) {
            syncAdminOrderDraftFromDom();
            state.adminOrderArticleLines.splice(lineIdx, 1);
            renderApp();
          }
          break;
        }
        case 'add-system-user':
          void window.adminAddSystemUser(el);
          break;
        case 'add-stitcher': {
          const hallId = Number(el.dataset.hallId);
          const input = document.querySelector<HTMLInputElement>(`[data-hall-stitcher-input="${hallId}"]`);
          const stitcherName = input?.value?.trim() || '';
          if (!Number.isInteger(hallId) || hallId <= 0 || !stitcherName) {
            applyFieldValidationErrors([[input || null, stitcherName ? '' : 'Enter stitcher name.']]);
            showToast('Enter a stitcher name to add to this Hall.');
            break;
          }
          void runAdminAction(`admin:add-stitcher:${hallId}`, el, async () => {
            try {
              const res = await fetch(`/api/admin/halls/${encodeURIComponent(String(hallId))}/stitchers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: stitcherName })
              });
              const json = await res.json();
              if (!res.ok || !json.success || !json.data) {
                showToast(json.error || 'Unable to add stitcher.');
                return;
              }
              if (Array.isArray(json.data.halls)) {
                state.dropdownOptions.halls = json.data.halls;
              }
              if (input) input.value = '';
              showToast(`Added Stitcher "${stitcherName}" to ${json.data.hallName || 'Hall'}.`);
              renderApp();
              await syncBackendData();
            } catch (err) {
              console.warn('Add stitcher failed:', err);
              showToast('Failed to add stitcher.');
            }
          });
          break;
        }
        case 'delete-hall': {
          const hallId = Number(el.dataset.hallId);
          const hallName = el.dataset.hallName || 'Hall';
          const stitcherCount = Number(el.dataset.stitcherCount || 0);
          if (!Number.isInteger(hallId) || hallId <= 0) break;
          void confirmAndRunAdminAction(
            `admin:delete-hall:${hallId}`,
            el,
            {
              title: 'Confirm Remove Hall',
              message: `Remove Hall "${hallName}"?`,
              detail: stitcherCount > 0
                ? `Removes ${hallName} and its ${stitcherCount} assigned stitcher${stitcherCount === 1 ? '' : 's'} from the Hall -> Stitcher registry. Past GRN history rows keep their recorded labels.`
                : `Removes ${hallName} from the Hall registry.`,
              confirmLabel: 'Remove Hall',
              cancelLabel: 'Keep Hall',
              tone: 'danger'
            },
            async () => {
              const res = await fetch(`/api/admin/halls/${encodeURIComponent(String(hallId))}`, { method: 'DELETE' });
              const json = await res.json();
              if (!res.ok || !json.success) {
                showToast(json.error || `Unable to remove Hall "${hallName}".`);
                return;
              }
              if (Array.isArray(json.data?.halls)) {
                state.dropdownOptions.halls = json.data.halls;
              }
              state.dropdownOptions.makers = state.dropdownOptions.makers.filter(
                m => m.trim().toLowerCase() !== hallName.trim().toLowerCase()
              );
              showToast(`Removed Hall "${hallName}".`);
              renderApp();
              await syncBackendData();
            }
          );
          break;
        }
        case 'delete-stitcher': {
          const stitcherId = Number(el.dataset.stitcherId);
          const stitcherName = el.dataset.stitcherName || 'Stitcher';
          const hallName = el.dataset.hallName || 'Hall';
          if (!Number.isInteger(stitcherId) || stitcherId <= 0) break;
          void confirmAndRunAdminAction(
            `admin:delete-stitcher:${stitcherId}`,
            el,
            {
              title: 'Confirm Remove Stitcher',
              message: `Remove "${stitcherName}" from ${hallName}?`,
              detail: 'Existing GRN history rows keep this stitcher name, and future receipts will no longer list them.',
              confirmLabel: 'Remove Stitcher',
              cancelLabel: 'Keep Stitcher',
              tone: 'danger'
            },
            async () => {
              const res = await fetch(`/api/admin/stitchers/${encodeURIComponent(String(stitcherId))}`, { method: 'DELETE' });
              const json = await res.json();
              if (!res.ok || !json.success) {
                showToast(json.error || `Unable to remove Stitcher "${stitcherName}".`);
                return;
              }
              if (Array.isArray(json.data?.halls)) {
                state.dropdownOptions.halls = json.data.halls;
              }
              showToast(`Removed Stitcher "${stitcherName}" from ${hallName}.`);
              renderApp();
              await syncBackendData();
            }
          );
          break;
        }
      }
    });
  });

  document.querySelectorAll<HTMLDetailsElement>('details.su-collapsible-registry[data-registry-id]').forEach(detailsEl => {
    detailsEl.addEventListener('toggle', () => {
      const regId = detailsEl.dataset.registryId;
      if (regId) {
        state.adminOpenRegistries[regId] = detailsEl.open;
      }
    });
  });

  const adminUserRoleSelect = document.getElementById('admin-user-role') as HTMLSelectElement | null;
  const adminUserStationSelect = document.getElementById('admin-user-station') as HTMLSelectElement | null;
  adminUserStationSelect?.addEventListener('change', () => {
    adminUserStationSelect.dataset.manualOverride = 'true';
  });
  adminUserRoleSelect?.addEventListener('change', () => {
    if (adminUserStationSelect && adminUserStationSelect.dataset.manualOverride !== 'true') {
      adminUserStationSelect.value = getDefaultStationForRole(adminUserRoleSelect.value);
    }
  });

  document.querySelectorAll<HTMLElement>('[data-su-change]').forEach(el => {
    el.addEventListener('change', () => {
      const changeKey = el.dataset.suChange;
      const val = (el as HTMLSelectElement).value;
      if (changeKey === 'tracking-buyer-filter') {
        window.adminSetTrackingBuyerFilter(val);
      } else if (changeKey === 'tracking-maker-filter') {
        window.adminSetTrackingMakerFilter(val);
      }
    });
  });

  // Live Tracking Search & Status Filter
  const trackingSearchInput = document.getElementById('admin-tracking-search') as HTMLInputElement;
  trackingSearchInput?.addEventListener('input', () => {
    state.adminTrackingSearch = trackingSearchInput.value;
    renderApp();
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

  document.querySelectorAll('.su-stage-bar-btn[data-tracking-filter]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const filter = (e.currentTarget as HTMLElement).getAttribute('data-tracking-filter') as any;
      if (filter) {
        state.adminTrackingStatusFilter = filter;
        state.adminTrackingPage = 1;
        state.adminActiveTab = 'tracking';
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

  document.getElementById('btn-admin-refresh')?.addEventListener('click', (e) => {
    void runAdminAction('admin:sync-db', e.currentTarget as HTMLElement, async () => {
      await syncBackendData({ manual: true, forceCatalog: true });
      showToast('Synchronized SQLite tables with Admin Control Center.');
    });
  });

  function getActiveAdminOrderSizeCodes(): string[] {
    return getScaleSizeCodes(state.adminOverview.sizeStandards, state.adminOrderDraft.sizeFormat || 'LEGACY_7_11');
  }

  function syncAdminArticleLinesFromDom(): void {
    if (state.adminOrderArticleLines.length === 0) return;
    state.adminOrderArticleLines.forEach((line, idx) => {
      const makerEl = document.querySelector<HTMLSelectElement>(`.admin-line-maker[data-line-index="${idx}"]`);
      const colorEl = document.querySelector<HTMLInputElement>(`.admin-line-color[data-line-index="${idx}"]`);
      const dueEl = document.querySelector<HTMLInputElement>(`.admin-line-due-date[data-line-index="${idx}"]`);
      if (makerEl) line.maker = makerEl.value.trim();
      if (colorEl) line.color = colorEl.value.trim();
      if (dueEl) line.dueDate = dueEl.value.trim();
      const lineCodes = getScaleSizeCodes(state.adminOverview.sizeStandards, line.sizeFormat || 'LEGACY_7_11');
      const sizeInputs = document.querySelectorAll<HTMLInputElement>(`.admin-line-size-val[data-line-index="${idx}"]`);
      if (sizeInputs.length > 0) {
        const nextSizes = createEmptySizes(lineCodes);
        sizeInputs.forEach(inp => {
          const sz = inp.getAttribute('data-size') || '';
          if (sz && lineCodes.includes(sz)) {
            nextSizes[sz] = Math.max(0, parseInt(inp.value || '0', 10) || 0);
          }
        });
        line.sizes = nextSizes;
      }
      if (line.splitRows.length > 0) {
        line.splitRows.forEach((sRow, sIdx) => {
          const sMaker = document.querySelector<HTMLSelectElement>(
            `.admin-line-split-maker[data-line-index="${idx}"][data-split-index="${sIdx}"]`
          );
          const sDue = document.querySelector<HTMLInputElement>(
            `.admin-line-split-due-date[data-line-index="${idx}"][data-split-index="${sIdx}"]`
          );
          if (sMaker) sRow.maker = sMaker.value.trim();
          if (sDue) sRow.dueDate = sDue.value.trim();
          const sInputs = document.querySelectorAll<HTMLInputElement>(
            `.admin-line-split-size-val[data-line-index="${idx}"][data-split-index="${sIdx}"]`
          );
          if (sInputs.length > 0) {
            const nextSplitSizes = createEmptySizes(lineCodes);
            sInputs.forEach(inp => {
              const sz = inp.getAttribute('data-size') || '';
              if (sz && lineCodes.includes(sz)) {
                nextSplitSizes[sz] = Math.max(0, parseInt(inp.value || '0', 10) || 0);
              }
            });
            sRow.sizes = nextSplitSizes;
          }
        });
      }
    });
  }

  function syncAdminOrderDraftFromDom(): void {
    const buyerEl = document.getElementById('admin-pending-order-buyer') as HTMLSelectElement | null;
    const articleEl = document.getElementById('admin-pending-order-article') as HTMLSelectElement | null;
    const colorEl = document.getElementById('admin-pending-order-color') as HTMLInputElement | null;
    const buyerOpt = buyerEl?.selectedOptions?.[0];
    state.adminOrderDraft.buyer = buyerEl?.value?.trim() || '';
    state.adminOrderDraft.customerId = buyerOpt?.getAttribute('data-customer-id') || '';
    state.adminOrderDraft.maker = (document.getElementById('admin-pending-order-maker') as HTMLSelectElement)?.value?.trim() || '';
    state.adminOrderDraft.po = (document.getElementById('admin-pending-order-po') as HTMLInputElement)?.value?.trim() || '';
    state.adminOrderDraft.dueDate = (document.getElementById('admin-pending-order-due-date') as HTMLInputElement)?.value?.trim() || '';
    const sizeFmtEl = document.getElementById('admin-order-size-format') as HTMLSelectElement | null;
    if (articleEl) {
      const articleOpt = articleEl.selectedOptions?.[0];
      state.adminOrderDraft.productId = articleOpt?.getAttribute('data-product-id') || '';
      state.adminOrderDraft.article = articleEl.value?.trim() || '';
      state.adminOrderDraft.sizeFormat = sizeFmtEl?.value
        || (articleEl.value ? (articleOpt?.getAttribute('data-size-format') || 'ALPHA_2XS_5XL') : 'ALPHA_2XS_5XL');
    } else if (sizeFmtEl?.value) {
      state.adminOrderDraft.sizeFormat = sizeFmtEl.value;
    }
    if (colorEl) {
      state.adminOrderDraft.color = colorEl.value?.trim() || '';
    }
    const orderSizeInputs = document.querySelectorAll('.admin-order-size-val');
    if (orderSizeInputs.length > 0) {
      const activeCodes = getActiveAdminOrderSizeCodes();
      const sizes = createEmptySizes(activeCodes);
      orderSizeInputs.forEach(el => {
        const inp = el as HTMLInputElement;
        const k = inp.getAttribute('data-size');
        if (k && activeCodes.includes(k)) {
          sizes[k] = Math.max(0, parseInt(inp.value || '0', 10) || 0);
        }
      });
      state.adminOrderDraft.sizes = sizes;
    }
    syncAdminArticleLinesFromDom();
  }

  function updateAdminSplitBalanceDom(): void {
    if (state.adminOrderSplitRows.length === 0) return;
    state.adminOrderSplitRows.forEach((row, idx) => {
      const rowTotalCell = document.getElementById(`admin-split-row-total-${idx}`);
      if (rowTotalCell) rowTotalCell.textContent = calculateSizeTotal(row.sizes).toLocaleString();
    });
    const balanceBar = document.getElementById('admin-split-balance-bar');
    if (balanceBar) {
      const activeCodes = getActiveAdminOrderSizeCodes();
      const check = validateContractorAllocations(state.adminOrderDraft.sizes, state.adminOrderSplitRows, activeCodes);
      balanceBar.className = `su-split-balance-bar ${check.valid ? 'is-balanced' : 'is-unbalanced'}`;
      balanceBar.innerHTML = `
        <span>
          Unassigned Balance:
          ${activeCodes.map(sz => `<strong>${escapeHtml(sz)}:${check.unassignedBySize[sz] ?? 0}</strong>`).join(' | ')}
          (<strong>${check.totalUnassigned}</strong> Prs remaining)
        </span>
        <strong>${check.valid ? 'Split Matches Order 100% ✓' : escapeHtml(check.error || 'Adjust contractor quantities to match order totals')}</strong>
      `;
    }
  }

  function updateAdminLineSplitBalanceDom(lineIdx: number): void {
    const line = state.adminOrderArticleLines[lineIdx];
    if (!line || line.splitRows.length === 0) return;
    const lineCodes = getScaleSizeCodes(state.adminOverview.sizeStandards, line.sizeFormat || 'LEGACY_7_11');
    line.splitRows.forEach((sRow, sIdx) => {
      const rowTotalCell = document.getElementById(`admin-line-split-total-${lineIdx}-${sIdx}`);
      if (rowTotalCell) rowTotalCell.textContent = calculateSizeTotal(sRow.sizes).toLocaleString();
    });
    const balanceBar = document.getElementById(`admin-line-split-balance-${lineIdx}`);
    if (balanceBar) {
      const check = validateContractorAllocations(line.sizes, line.splitRows, lineCodes);
      balanceBar.className = `su-split-balance-bar ${check.valid ? 'is-balanced' : 'is-unbalanced'}`;
      balanceBar.innerHTML = `
        <span>
          Unassigned Balance:
          ${lineCodes.map(sz => `<strong>${escapeHtml(sz)}:${check.unassignedBySize[sz] ?? 0}</strong>`).join(' | ')}
          (<strong>${check.totalUnassigned}</strong> Prs remaining)
        </span>
        <strong>${check.valid ? 'Split Matches Sub-order 100% ✓' : escapeHtml(check.error || 'Adjust contractor quantities to match sub-order totals')}</strong>
      `;
    }
  }

  function updateAdminMultiTotalDom(lineIdx?: number): void {
    if (lineIdx !== undefined && state.adminOrderArticleLines[lineIdx]) {
      const lineTotalCell = document.getElementById(`admin-line-total-${lineIdx}`);
      if (lineTotalCell) {
        lineTotalCell.textContent = calculateSizeTotal(state.adminOrderArticleLines[lineIdx].sizes).toLocaleString();
      }
      updateAdminLineSplitBalanceDom(lineIdx);
    }
    const summaryEl = document.getElementById('admin-multi-total-summary');
    if (summaryEl) {
      const nLines = state.adminOrderArticleLines.length;
      const grand = state.adminOrderArticleLines.reduce((sum, l) => sum + calculateSizeTotal(l.sizes), 0);
      summaryEl.textContent = `${nLines} ${nLines === 1 ? 'Article' : 'Sub-orders'} · ${grand.toLocaleString()} Pairs`;
    }
  }

  // Recalculate planned order size total in Super User form
  function recalcAdminOrderSizes(): void {
    syncAdminOrderDraftFromDom();
    const tot = calculateSizeTotal(state.adminOrderDraft.sizes);
    const cell = document.getElementById('admin-order-size-total');
    if (cell) cell.textContent = tot.toLocaleString();
    updateAdminSplitBalanceDom();
  }

  document.querySelectorAll('.admin-order-size-val').forEach(inp => {
    inp.addEventListener('input', recalcAdminOrderSizes);
  });

  document.getElementById('admin-pending-order-buyer')?.addEventListener('change', () => {
    const prevFormat = state.adminOrderDraft.sizeFormat || 'LEGACY_7_11';
    syncAdminOrderDraftFromDom();
    const buyerEl = document.getElementById('admin-pending-order-buyer') as HTMLSelectElement | null;
    const buyerOpt = buyerEl?.selectedOptions?.[0];
    state.adminOrderDraft.buyer = buyerEl?.value?.trim() || '';
    state.adminOrderDraft.customerId = buyerOpt?.getAttribute('data-customer-id') || '';
    state.adminOrderDraft.productId = '';
    state.adminOrderDraft.article = '';
    state.adminOrderDraft.color = '';
    state.adminOrderDraft.sizeFormat = 'LEGACY_7_11';
    state.adminOrderArticleLines = [];
    state.adminMultiArticleSearch = '';
    if (prevFormat !== 'LEGACY_7_11') {
      const legacyCodes = getScaleSizeCodes(state.adminOverview.sizeStandards, 'LEGACY_7_11');
      state.adminOrderDraft.sizes = createEmptySizes(legacyCodes);
      state.adminOrderSplitRows = state.adminOrderSplitRows.map(r => ({
        ...r,
        sizes: createEmptySizes(legacyCodes)
      }));
    }
    renderApp();
    (document.getElementById('admin-pending-order-buyer') as HTMLSelectElement | null)?.focus();
  });

  document.getElementById('admin-pending-order-article')?.addEventListener('change', () => {
    const prevFormat = state.adminOrderDraft.sizeFormat || 'LEGACY_7_11';
    syncAdminOrderDraftFromDom();
    const articleEl = document.getElementById('admin-pending-order-article') as HTMLSelectElement | null;
    const opt = articleEl?.selectedOptions?.[0];
    const optProductId = opt?.getAttribute('data-product-id') || '';
    const optCustomerId = opt?.getAttribute('data-customer-id') || '';
    const optCustomerName = opt?.getAttribute('data-customer-name') || '';
    const nextFormat = articleEl?.value ? (opt?.getAttribute('data-size-format') || 'LEGACY_7_11') : 'LEGACY_7_11';
    const optColorSpec = opt?.getAttribute('data-color-spec') || '';

    state.adminOrderDraft.productId = optProductId;
    state.adminOrderDraft.article = articleEl?.value?.trim() || '';
    if (!state.adminOrderDraft.buyer && optCustomerName) {
      state.adminOrderDraft.buyer = optCustomerName;
      state.adminOrderDraft.customerId = optCustomerId;
    }
    state.adminOrderDraft.color = optColorSpec;
    state.adminOrderDraft.sizeFormat = nextFormat;
    if (nextFormat !== prevFormat) {
      const nextCodes = getScaleSizeCodes(state.adminOverview.sizeStandards, nextFormat);
      state.adminOrderDraft.sizes = createEmptySizes(nextCodes);
      state.adminOrderSplitRows = state.adminOrderSplitRows.map(r => ({
        ...r,
        sizes: createEmptySizes(nextCodes)
      }));
    }
    renderApp();
    (document.getElementById('admin-pending-order-article') as HTMLSelectElement | null)?.focus();
  });

  document.getElementById('admin-pending-order-maker')?.addEventListener('change', () => {
    const prevDefaultMaker = state.adminOrderLastDefaultMaker;
    syncAdminOrderDraftFromDom();
    const nextMaker = state.adminOrderDraft.maker;
    let changedLines = false;
    if (state.adminOrderArticleLines.length > 0) {
      for (const line of state.adminOrderArticleLines) {
        if (line.splitRows.length === 0 && (!line.maker || line.maker === prevDefaultMaker)) {
          line.maker = nextMaker;
          changedLines = true;
        }
      }
    }
    state.adminOrderLastDefaultMaker = nextMaker;
    if (changedLines) {
      renderApp();
      (document.getElementById('admin-pending-order-maker') as HTMLSelectElement | null)?.focus();
    }
  });

  document.getElementById('admin-pending-order-due-date')?.addEventListener('change', () => {
    const prevDue = state.adminOrderLastDefaultDueDate;
    syncAdminOrderDraftFromDom();
    const nextDue = state.adminOrderDraft.dueDate;
    let changedLines = false;
    if (state.adminOrderArticleLines.length > 0) {
      for (const line of state.adminOrderArticleLines) {
        if (!line.dueDate || line.dueDate === prevDue) {
          line.dueDate = nextDue;
          changedLines = true;
        }
      }
    }
    state.adminOrderLastDefaultDueDate = nextDue;
    if (changedLines) {
      renderApp();
      (document.getElementById('admin-pending-order-due-date') as HTMLInputElement | null)?.focus();
    }
  });

  for (const fieldId of [
    'admin-pending-order-po',
    'admin-pending-order-color'
  ]) {
    document.getElementById(fieldId)?.addEventListener('change', syncAdminOrderDraftFromDom);
  }

  document.getElementById('btn-admin-toggle-multi-articles')?.addEventListener('click', () => {
    syncAdminOrderDraftFromDom();
    const opening = !state.adminMultiArticlePickerOpen;
    state.adminMultiArticlePickerOpen = opening;
    state.adminOrderLastDefaultMaker = state.adminOrderDraft.maker;
    state.adminOrderLastDefaultDueDate = state.adminOrderDraft.dueDate;
    if (opening && state.adminOrderArticleLines.length === 0 && state.adminOrderDraft.article) {
      const fmt = state.adminOrderDraft.sizeFormat || 'LEGACY_7_11';
      state.adminOrderArticleLines.push({
        lineId: state.adminOrderDraft.productId || state.adminOrderDraft.article,
        productId: state.adminOrderDraft.productId || '',
        article: state.adminOrderDraft.article,
        color: state.adminOrderDraft.color || '',
        sizeFormat: fmt,
        maker: state.adminOrderDraft.maker || '',
        dueDate: state.adminOrderDraft.dueDate || '',
        sizes: { ...state.adminOrderDraft.sizes },
        splitRows: state.adminOrderSplitRows.map(r => ({
          maker: r.maker,
          sizes: { ...r.sizes },
          dueDate: r.dueDate
        }))
      });
      state.adminOrderSplitRows = [];
    }
    renderApp();
  });

  document.getElementById('admin-multi-art-search')?.addEventListener('input', (ev) => {
    const query = (ev.currentTarget as HTMLInputElement).value;
    state.adminMultiArticleSearch = query;
    const needle = query.trim().toLowerCase();
    document.querySelectorAll<HTMLElement>('.su-multi-art-item').forEach(item => {
      const hay = item.getAttribute('data-search') || '';
      item.hidden = Boolean(needle && !hay.includes(needle));
    });
  });

  document.querySelectorAll<HTMLInputElement>('.admin-multi-art-check').forEach(cb => {
    cb.addEventListener('change', () => {
      syncAdminOrderDraftFromDom();
      const productId = cb.getAttribute('data-product-id') || '';
      const article = cb.getAttribute('data-article-name') || '';
      const sizeFormat = cb.getAttribute('data-size-format') || 'LEGACY_7_11';
      const colorSpec = cb.getAttribute('data-color-spec') || '';
      const matchFn = (l: AdminOrderArticleLine) => (productId ? l.productId === productId : l.article === article);

      if (cb.checked) {
        if (!state.adminOrderArticleLines.some(matchFn)) {
          const lineCodes = getScaleSizeCodes(state.adminOverview.sizeStandards, sizeFormat);
          state.adminOrderArticleLines.push({
            lineId: productId || article,
            productId,
            article,
            color: colorSpec,
            sizeFormat,
            maker: state.adminOrderDraft.maker || '',
            dueDate: state.adminOrderDraft.dueDate || '',
            sizes: createEmptySizes(lineCodes),
            splitRows: []
          });
        }
      } else {
        state.adminOrderArticleLines = state.adminOrderArticleLines.filter(l => !matchFn(l));
      }
      state.adminOrderLastDefaultMaker = state.adminOrderDraft.maker;
      state.adminOrderLastDefaultDueDate = state.adminOrderDraft.dueDate;
      renderApp();
      const escapedArt = article.replace(/"/g, '\\"');
      document.querySelector<HTMLInputElement>(`.admin-multi-art-check[data-article-name="${escapedArt}"]`)?.focus();
    });
  });

  document.querySelectorAll<HTMLSelectElement>('.admin-line-maker').forEach(sel => {
    sel.addEventListener('change', () => {
      const idx = Number(sel.getAttribute('data-line-index'));
      if (state.adminOrderArticleLines[idx]) {
        state.adminOrderArticleLines[idx].maker = sel.value.trim();
        clearFieldValidationError(sel);
      }
    });
  });

  document.querySelectorAll<HTMLInputElement>('.admin-line-color').forEach(inp => {
    inp.addEventListener('change', () => {
      const idx = Number(inp.getAttribute('data-line-index'));
      if (state.adminOrderArticleLines[idx]) {
        state.adminOrderArticleLines[idx].color = inp.value.trim();
      }
    });
  });

  document.querySelectorAll<HTMLInputElement>('.admin-line-due-date').forEach(inp => {
    inp.addEventListener('change', () => {
      const idx = Number(inp.getAttribute('data-line-index'));
      if (state.adminOrderArticleLines[idx]) {
        state.adminOrderArticleLines[idx].dueDate = inp.value.trim();
      }
    });
  });

  document.querySelectorAll<HTMLInputElement>('.admin-line-size-val').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx = Number(inp.getAttribute('data-line-index'));
      const sz = inp.getAttribute('data-size') || '';
      const line = state.adminOrderArticleLines[idx];
      if (line && sz) {
        line.sizes[sz] = Math.max(0, parseInt(inp.value || '0', 10) || 0);
        updateAdminMultiTotalDom(idx);
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>('.admin-line-toggle-split').forEach(btn => {
    btn.addEventListener('click', () => {
      syncAdminOrderDraftFromDom();
      const idx = Number(btn.getAttribute('data-line-index'));
      const line = state.adminOrderArticleLines[idx];
      if (!line) return;
      const lineCodes = getScaleSizeCodes(state.adminOverview.sizeStandards, line.sizeFormat || 'LEGACY_7_11');
      if (line.splitRows.length > 0) {
        line.splitRows = [];
      } else {
        const firstMaker = line.maker || state.adminOrderDraft.maker || state.dropdownOptions.makers[0] || '';
        const secondMaker = state.dropdownOptions.makers.find(m => m !== firstMaker) || '';
        line.splitRows = [
          { maker: firstMaker, sizes: { ...line.sizes }, dueDate: line.dueDate || state.adminOrderDraft.dueDate },
          { maker: secondMaker, sizes: createEmptySizes(lineCodes), dueDate: line.dueDate || state.adminOrderDraft.dueDate }
        ];
      }
      renderApp();
    });
  });

  document.querySelectorAll<HTMLButtonElement>('.admin-line-add-split-row').forEach(btn => {
    btn.addEventListener('click', () => {
      syncAdminOrderDraftFromDom();
      const idx = Number(btn.getAttribute('data-line-index'));
      const line = state.adminOrderArticleLines[idx];
      if (!line) return;
      const lineCodes = getScaleSizeCodes(state.adminOverview.sizeStandards, line.sizeFormat || 'LEGACY_7_11');
      const used = new Set(line.splitRows.map(r => r.maker));
      const nextMaker = state.dropdownOptions.makers.find(m => !used.has(m)) || '';
      line.splitRows.push({
        maker: nextMaker,
        sizes: createEmptySizes(lineCodes),
        dueDate: line.dueDate || state.adminOrderDraft.dueDate
      });
      renderApp();
    });
  });

  document.querySelectorAll<HTMLButtonElement>('.admin-line-remove-split-row').forEach(btn => {
    btn.addEventListener('click', () => {
      syncAdminOrderDraftFromDom();
      const idx = Number(btn.getAttribute('data-line-index'));
      const sIdx = Number(btn.getAttribute('data-split-index'));
      const line = state.adminOrderArticleLines[idx];
      if (line && Number.isInteger(sIdx) && line.splitRows.length > 2) {
        line.splitRows.splice(sIdx, 1);
        renderApp();
      }
    });
  });

  document.querySelectorAll<HTMLSelectElement>('.admin-line-split-maker').forEach(sel => {
    sel.addEventListener('change', () => {
      const idx = Number(sel.getAttribute('data-line-index'));
      const sIdx = Number(sel.getAttribute('data-split-index'));
      const line = state.adminOrderArticleLines[idx];
      if (line?.splitRows[sIdx]) {
        line.splitRows[sIdx].maker = sel.value.trim();
        updateAdminLineSplitBalanceDom(idx);
      }
    });
  });

  document.querySelectorAll<HTMLInputElement>('.admin-line-split-size-val').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx = Number(inp.getAttribute('data-line-index'));
      const sIdx = Number(inp.getAttribute('data-split-index'));
      const sz = inp.getAttribute('data-size') || '';
      const line = state.adminOrderArticleLines[idx];
      if (line?.splitRows[sIdx] && sz) {
        line.splitRows[sIdx].sizes[sz] = Math.max(0, parseInt(inp.value || '0', 10) || 0);
        updateAdminLineSplitBalanceDom(idx);
      }
    });
  });

  document.querySelectorAll<HTMLInputElement>('.admin-line-split-due-date').forEach(inp => {
    inp.addEventListener('change', () => {
      const idx = Number(inp.getAttribute('data-line-index'));
      const sIdx = Number(inp.getAttribute('data-split-index'));
      const line = state.adminOrderArticleLines[idx];
      if (line?.splitRows[sIdx]) {
        line.splitRows[sIdx].dueDate = inp.value.trim();
      }
    });
  });

  document.getElementById('btn-admin-toggle-split')?.addEventListener('click', () => {
    syncAdminOrderDraftFromDom();
    const activeCodes = getActiveAdminOrderSizeCodes();
    if (state.adminOrderSplitRows.length > 0) {
      state.adminOrderSplitRows = [];
    } else {
      const firstMaker = state.adminOrderDraft.maker || state.dropdownOptions.makers[0] || '';
      const secondMaker = state.dropdownOptions.makers.find(m => m !== firstMaker) || '';
      state.adminOrderSplitRows = [
        { maker: firstMaker, sizes: { ...state.adminOrderDraft.sizes }, dueDate: state.adminOrderDraft.dueDate },
        { maker: secondMaker, sizes: createEmptySizes(activeCodes), dueDate: state.adminOrderDraft.dueDate }
      ];
    }
    renderApp();
  });

  document.getElementById('btn-admin-add-split-row')?.addEventListener('click', () => {
    syncAdminOrderDraftFromDom();
    const activeCodes = getActiveAdminOrderSizeCodes();
    const used = new Set(state.adminOrderSplitRows.map(r => r.maker));
    const nextMaker = state.dropdownOptions.makers.find(m => !used.has(m)) || '';
    state.adminOrderSplitRows.push({
      maker: nextMaker,
      sizes: createEmptySizes(activeCodes),
      dueDate: state.adminOrderDraft.dueDate
    });
    renderApp();
  });

  document.querySelectorAll<HTMLSelectElement>('.admin-split-maker').forEach(sel => {
    sel.addEventListener('change', () => {
      const idx = Number(sel.getAttribute('data-split-index'));
      if (state.adminOrderSplitRows[idx]) {
        state.adminOrderSplitRows[idx].maker = sel.value;
        updateAdminSplitBalanceDom();
      }
    });
  });

  document.querySelectorAll<HTMLInputElement>('.admin-split-size-val').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx = Number(inp.getAttribute('data-split-index'));
      const sz = inp.getAttribute('data-size');
      if (state.adminOrderSplitRows[idx] && sz) {
        state.adminOrderSplitRows[idx].sizes[sz] = Math.max(0, parseInt(inp.value || '0', 10) || 0);
        updateAdminSplitBalanceDom();
      }
    });
  });

  document.querySelectorAll<HTMLInputElement>('.admin-split-due-date').forEach(inp => {
    inp.addEventListener('change', () => {
      const idx = Number(inp.getAttribute('data-split-index'));
      if (state.adminOrderSplitRows[idx]) {
        state.adminOrderSplitRows[idx].dueDate = inp.value;
      }
    });
  });

  document.getElementById('btn-admin-reset-pending-order')?.addEventListener('click', () => {
    const hadSplit = state.adminOrderSplitRows.length > 0;
    const hadMulti = state.adminOrderArticleLines.length > 0 || state.adminMultiArticlePickerOpen;
    const hadCatalogState =
      Boolean(state.adminOrderDraft.buyer) ||
      (state.adminOrderDraft.sizeFormat || 'LEGACY_7_11') !== 'LEGACY_7_11';
    state.adminOrderDraft = {
      customerId: '',
      buyer: '',
      maker: '',
      po: '',
      productId: '',
      article: '',
      color: '',
      sizeFormat: 'LEGACY_7_11',
      dueDate: '',
      sizes: createEmptySizes()
    };
    state.adminOrderSplitRows = [];
    state.adminOrderArticleLines = [];
    state.adminMultiArticlePickerOpen = false;
    state.adminMultiArticleSearch = '';
    state.adminOrderLastDefaultMaker = '';
    state.adminOrderLastDefaultDueDate = '';
    for (const id of [
      'admin-pending-order-buyer',
      'admin-pending-order-maker',
      'admin-pending-order-po',
      'admin-pending-order-article',
      'admin-pending-order-color',
      'admin-pending-order-due-date'
    ]) {
      const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
      if (el) {
        el.value = '';
        clearFieldValidationError(el);
      }
    }
    document.querySelectorAll('.admin-order-size-val').forEach(el => {
      (el as HTMLInputElement).value = '';
    });
    const cell = document.getElementById('admin-order-size-total');
    if (cell) cell.textContent = '0';
    if (hadSplit || hadMulti || hadCatalogState) renderApp();
  });

  document.getElementById('btn-admin-add-pending-order')?.addEventListener('click', (e) => {
    syncAdminOrderDraftFromDom();
    const makerEl = document.getElementById('admin-pending-order-maker') as HTMLSelectElement | null;
    const articleEl = document.getElementById('admin-pending-order-article') as HTMLSelectElement | null;
    const buyer = state.adminOrderDraft.buyer;
    const po = state.adminOrderDraft.po;
    const dueDate = state.adminOrderDraft.dueDate;

    if (state.adminOrderArticleLines.length > 0) {
      const lines = state.adminOrderArticleLines;
      for (let idx = 0; idx < lines.length; idx += 1) {
        const line = lines[idx];
        const lineCodes = getScaleSizeCodes(state.adminOverview.sizeStandards, line.sizeFormat || 'LEGACY_7_11');
        if (line.splitRows.length > 0) {
          const splitCheck = validateContractorAllocations(line.sizes, line.splitRows, lineCodes);
          if (!splitCheck.valid) {
            showToast(`Sub-order ${idx + 1} (${line.article}): ${splitCheck.error || 'Split must equal article size totals.'}`);
            return;
          }
        } else {
          const effectiveMaker = (line.maker || state.adminOrderDraft.maker || '').trim();
          const lineMakerEl = document.querySelector<HTMLSelectElement>(`.admin-line-maker[data-line-index="${idx}"]`);
          const errs = validatePendingOrderInputs({ maker: effectiveMaker, article: line.article });
          if (applyFieldValidationErrors([[lineMakerEl || makerEl, errs.maker]])) {
            showToast(`Select Contractor / Maker for Sub-order ${idx + 1} (${line.article}).`);
            return;
          }
        }
      }

      const items = lines.map(line => {
        const lineSplit = line.splitRows.length > 0;
        const effectiveMaker = lineSplit
          ? line.splitRows.map(r => r.maker.trim()).filter(Boolean).join(', ')
          : (line.maker || state.adminOrderDraft.maker || '').trim();
        const linePairs = calculateSizeTotal(line.sizes);
        return {
          productId: line.productId || undefined,
          article: line.article,
          color: line.color || 'Standard',
          sizeFormat: line.sizeFormat || 'LEGACY_7_11',
          dueDate: line.dueDate || dueDate || '',
          maker: effectiveMaker,
          sizes: { ...line.sizes },
          totalQty: linePairs,
          allocations: lineSplit
            ? line.splitRows.map(r => ({
                maker: r.maker.trim(),
                sizes: { ...r.sizes },
                dueDate: r.dueDate || line.dueDate || dueDate || ''
              }))
            : undefined,
          notes: `Created by Super User: Buyer=${buyer}, PO=${po}, Color=${line.color || 'Standard'}, Scale=${line.sizeFormat || 'LEGACY_7_11'}`
        };
      });

      const batchPayload = {
        customerId: state.adminOrderDraft.customerId || undefined,
        buyer: buyer || 'Standard Client',
        maker: state.adminOrderDraft.maker || undefined,
        po: po || '---',
        dueDate,
        items
      };

      void runAdminAction('admin:create-pending-order', e.currentTarget as HTMLElement, async () => {
        try {
          const res = await fetch('/api/admin/pending-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(batchPayload)
          });
          const json = await res.json();
          if (!res.ok || !json.success || typeof json.data?.orderId !== 'string' || !Array.isArray(json.data.orders)) {
            showToast(json.error || 'Orders were not saved. Please try again.');
            return;
          }

          const createdIds: string[] = Array.isArray(json.data.orderIds) ? json.data.orderIds : [json.data.orderId];
          const baseOrderId: string = json.data.baseOrderId || json.data.orderId;
          state.pendingOrders = json.data.orders;
          for (const cid of createdIds) {
            state.adminExpandedOrders[cid] = true;
          }
          if (po && !state.dropdownOptions.poList.includes(po)) {
            state.dropdownOptions.poList.unshift(po);
          }
          for (const it of items) {
            if (!it.allocations && it.maker && !state.dropdownOptions.makers.includes(it.maker)) {
              state.dropdownOptions.makers.unshift(it.maker);
            }
          }
          const grandPairs = items.reduce((s, it) => s + Number(it.totalQty || 0), 0);
          state.adminOrderDraft = {
            customerId: '',
            buyer: '',
            maker: '',
            po: '',
            productId: '',
            article: '',
            color: '',
            sizeFormat: 'LEGACY_7_11',
            dueDate: '',
            sizes: createEmptySizes()
          };
          state.adminOrderSplitRows = [];
          state.adminOrderArticleLines = [];
          state.adminMultiArticlePickerOpen = false;
          state.adminMultiArticleSearch = '';
          state.adminOrderLastDefaultMaker = '';
          state.adminOrderLastDefaultDueDate = '';
          showToast(
            createdIds.length >= 2
              ? `Saved ${createdIds.length} linked sub-orders under ${baseOrderId} (${createdIds.join(', ')} · ${grandPairs.toLocaleString()} Pairs).`
              : `Saved Master Order ${createdIds[0]} (${buyer || 'Standard'} | ${items[0].article} | ${grandPairs.toLocaleString()} Pairs).`
          );
          renderApp();
        } catch (error) {
          console.error('Multi-article order creation failed:', error);
          showToast('Order could not be saved. No order was created.');
        }
      });
      return;
    }

    const splitActive = state.adminOrderSplitRows.length > 0;
    const maker = splitActive
      ? state.adminOrderSplitRows.map(r => r.maker.trim()).filter(Boolean).join(', ')
      : state.adminOrderDraft.maker;
    const article = state.adminOrderDraft.article;
    const color = state.adminOrderDraft.color;
    const sizes: SizeBreakdown = { ...state.adminOrderDraft.sizes };
    const totalPairs = calculateSizeTotal(sizes);

    if (splitActive) {
      const artErrors = validatePendingOrderInputs({ maker: 'split', article });
      if (applyFieldValidationErrors([[articleEl, artErrors.article]])) {
        showToast('Select the required Article.');
        return;
      }
      const splitCheck = validateContractorAllocations(sizes, state.adminOrderSplitRows, getActiveAdminOrderSizeCodes());
      if (!splitCheck.valid) {
        showToast(splitCheck.error || 'Contractor split quantities must equal the order size totals.');
        return;
      }
    } else {
      const errors = validatePendingOrderInputs({ maker, article });
      if (applyFieldValidationErrors([[makerEl, errors.maker], [articleEl, errors.article]])) {
        showToast('Select the required Contractor / Maker and Article.');
        return;
      }
    }

    const newOrder = {
      customerId: state.adminOrderDraft.customerId || undefined,
      buyer: buyer || 'Standard Client',
      maker,
      po: po || '---',
      productId: state.adminOrderDraft.productId || undefined,
      article,
      color: color || 'Standard',
      sizeFormat: state.adminOrderDraft.sizeFormat || 'LEGACY_7_11',
      dueDate,
      sizes,
      totalQty: totalPairs,
      allocations: splitActive
        ? state.adminOrderSplitRows.map(r => ({
            maker: r.maker.trim(),
            sizes: { ...r.sizes },
            dueDate: r.dueDate || dueDate || ''
          }))
        : undefined,
      notes: `Created by Super User: Buyer=${buyer}, PO=${po}, Color=${color}, Scale=${state.adminOrderDraft.sizeFormat || 'LEGACY_7_11'}`
    };

    void runAdminAction('admin:create-pending-order', e.currentTarget as HTMLElement, async () => {
      try {
        const res = await fetch('/api/admin/pending-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newOrder)
        });
        const json = await res.json();
        if (!res.ok || !json.success || typeof json.data?.orderId !== 'string' || !Array.isArray(json.data.orders)) {
          showToast(json.error || 'Order was not saved. Please try again.');
          return;
        }

        const { orderId, orders } = json.data;
        state.pendingOrders = orders;
        state.adminExpandedOrders[orderId] = true;
        state.adminOrderDraft = {
          customerId: '',
          buyer: '',
          maker: '',
          po: '',
          productId: '',
          article: '',
          color: '',
          sizeFormat: 'LEGACY_7_11',
          dueDate: '',
          sizes: createEmptySizes()
        };
        state.adminOrderSplitRows = [];
        if (po && !state.dropdownOptions.poList.includes(po)) {
          state.dropdownOptions.poList.unshift(po);
        }
        if (maker && !splitActive && !state.dropdownOptions.makers.includes(maker)) {
          state.dropdownOptions.makers.unshift(maker);
        }
        showToast(`Saved Master Order ${orderId} (${buyer || 'Standard'} | ${maker} | ${article} | ${totalPairs} Pairs).`);
        renderApp();
      } catch (error) {
        console.error('Order creation failed:', error);
        showToast('Order could not be saved. No order was created.');
      }
    });
  });

  document.getElementById('btn-admin-save-customer')?.addEventListener('click', (e) => {
    const nameEl = document.getElementById('admin-cust-name') as HTMLInputElement | null;
    const name = nameEl?.value?.trim() || '';
    const country = (document.getElementById('admin-cust-country') as HTMLInputElement)?.value?.trim();
    const inspectionPreference = (document.getElementById('admin-cust-pref') as HTMLSelectElement)?.value;

    const errors = validateCustomerMasterInputs({ name });
    if (applyFieldValidationErrors([[nameEl, errors.name]])) {
      showToast('Enter a customer / buyer name.');
      return;
    }

    void runAdminAction('admin:save-customer', e.currentTarget as HTMLElement, async () => {
      try {
        const res = await fetch('/api/admin/master/customer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, country, inspectionPreference })
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          applyFieldValidationErrors([[nameEl, json.error || 'Buyer could not be saved.']]);
          showToast(json.error || 'Buyer could not be saved.');
          return;
        }
        if (!state.dropdownOptions.customers.includes(name)) {
          state.dropdownOptions.customers.push(name);
        }
        if (Array.isArray(json.data)) {
          state.adminOverview.customers = json.data;
        }
        showToast(`Saved "${name}" to SQLite Master.`);
        await syncBackendData();
      } catch (err) {
        console.warn(err);
        showToast('Buyer could not be saved.');
      }
    });
  });

  document.getElementById('admin-order-size-format')?.addEventListener('change', (ev) => {
    syncAdminOrderDraftFromDom();
    const nextFmt = (ev.currentTarget as HTMLSelectElement)?.value || 'ALPHA_2XS_5XL';
    state.adminOrderDraft.sizeFormat = nextFmt;
    state.adminOrderDraft.sizes = createEmptySizes(getScaleSizeCodes(state.adminOverview.sizeStandards, nextFmt));
    renderApp();
  });

  document.getElementById('btn-admin-save-product')?.addEventListener('click', (e) => {
    const nameEl = document.getElementById('admin-prod-name') as HTMLInputElement | null;
    const stickersEl = document.getElementById('admin-prod-stickers') as HTMLInputElement | null;
    const cartonEl = document.getElementById('admin-prod-carton') as HTMLInputElement | null;
    const sizeFmtEl = document.getElementById('admin-prod-size-format') as HTMLSelectElement | null;
    const name = nameEl?.value?.trim() || '';
    const customerId = (document.getElementById('admin-prod-cust') as HTMLSelectElement)?.value;
    const sizeFormat = sizeFmtEl?.value || 'ALPHA_2XS_5XL';
    const stickersPerPair = Number(stickersEl?.value || 2);
    const pairsPerCarton = Number(cartonEl?.value || 50);

    const errors = validateProductMasterInputs({ name, stickersPerPair, pairsPerCarton });
    if (applyFieldValidationErrors([
      [nameEl, errors.name],
      [stickersEl, errors.stickersPerPair],
      [cartonEl, errors.pairsPerCarton]
    ])) {
      showToast('Review highlighted Article & BOM Master fields.');
      return;
    }

    void runAdminAction('admin:save-product', e.currentTarget as HTMLElement, async () => {
      try {
        const res = await fetch('/api/admin/master/product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, customerId: customerId || 'CUST-01', sizeFormat, stickersPerPair, pairsPerCarton })
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          applyFieldValidationErrors([[nameEl, json.error || 'Article could not be saved.']]);
          showToast(json.error || 'Article could not be saved.');
          return;
        }
        if (!state.dropdownOptions.articles.includes(name)) {
          state.dropdownOptions.articles.push(name);
        }
        if (Array.isArray(json.data)) {
          state.adminOverview.products = json.data;
        }
        showToast(`Article "${name}" saved to SQLite Products Master & Dropdowns.`);
        await syncBackendData();
      } catch (err) {
        console.warn(err);
        showToast('Article could not be saved.');
      }
    });
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

  document.getElementById('admin-add-hall-input')?.addEventListener('input', (e) => {
    clearFieldValidationError(e.currentTarget as HTMLInputElement);
  });

  document.querySelectorAll<HTMLInputElement>('[data-hall-stitcher-input]').forEach(inp => {
    inp.addEventListener('input', () => clearFieldValidationError(inp));
  });

  document.getElementById('btn-admin-add-hall')?.addEventListener('click', (e) => {
    const input = document.getElementById('admin-add-hall-input') as HTMLInputElement | null;
    const val = input?.value?.trim() || '';
    if (!val) {
      applyFieldValidationErrors([[input, 'Enter a Hall name.']]);
      showToast('Enter a Hall name to register.');
      return;
    }
    void runAdminAction('admin:add-hall', e.currentTarget as HTMLElement, async () => {
      try {
        const res = await fetch('/api/admin/halls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: val })
        });
        const json = await res.json();
        if (!res.ok || !json.success || !json.data) {
          showToast(json.error || 'Unable to add Hall.');
          return;
        }
        if (Array.isArray(json.data.halls)) {
          state.dropdownOptions.halls = json.data.halls;
        }
        if (!state.dropdownOptions.makers.some(m => m.trim().toLowerCase() === val.toLowerCase())) {
          state.dropdownOptions.makers.push(json.data.name || val);
        }
        if (input) input.value = '';
        showToast(`Added Hall "${json.data.name || val}" to SQLite Halls Registry.`);
        renderApp();
        await syncBackendData();
      } catch (err) {
        console.warn('Add hall failed:', err);
        showToast('Failed to add Hall.');
      }
    });
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

  document.getElementById('btn-admin-trigger-backup')?.addEventListener('click', (e) => {
    void runAdminAction('admin:backup-db', e.currentTarget as HTMLElement, async () => {
      try {
        const res = await fetch('/api/admin/db/backup', { method: 'POST' });
        const json = await res.json();
        if (res.ok && json.success && json.data) {
          state.lastBackupPath = json.data.backupPath;
          showToast(`Online VACUUM Backup created successfully!`);
          renderApp();
        } else {
          showToast(json.error || 'Backup could not be completed.');
        }
      } catch (err) {
        console.warn(err);
        showToast('Backup could not be completed.');
      }
    });
  });

  document.getElementById('btn-admin-reseed-db')?.addEventListener('click', (e) => {
    void runAdminAction('admin:reseed-db', e.currentTarget as HTMLElement, async () => {
      try {
        const res = await fetch('/api/admin/db/reset-seed', { method: 'POST' });
        const json = await res.json();
        if (res.ok && json.success) {
          showToast('SQLite Database verified.');
          await syncBackendData({ forceCatalog: true });
        } else {
          showToast(json.error || 'Database verification failed.');
        }
      } catch (err) {
        console.warn(err);
        showToast('Database verification failed.');
      }
    });
  });

  document.getElementById('btn-admin-export-json')?.addEventListener('click', () => {
    const dump = JSON.stringify(state.adminOverview, null, 2);
    const blob = new Blob([dump], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hammad_industries_full_erp_dump_${Date.now()}.json`;
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
    adminRemoveDropdownItem: (listKey: 'makers' | 'poList', val: string, triggerEl?: HTMLElement | null) => void;
    adminRemovePendingOrder: (orderId: string, triggerEl?: HTMLElement | null) => void;
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
    adminVoidGrnBatch: (sr: number, grnCode: string, triggerEl?: HTMLElement | null) => void;
    adminVoidReqBatch: (reqNumber: string, triggerEl?: HTMLElement | null) => void;
    adminCloseOrderShort: (orderId: string, triggerEl?: HTMLElement | null) => void;
    adminAddSystemUser: (triggerEl?: HTMLElement | null) => void;
    adminResetSystemUserPassword: (userId: string, triggerEl?: HTMLElement | null) => void;
    adminDeleteSystemUser: (userId: string, triggerEl?: HTMLElement | null) => Promise<void>;
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
  for (const ord of state.pendingOrders) {
    if (ord.orderId.startsWith(`${orderId}-`)) {
      state.adminExpandedOrders[ord.orderId] = true;
    }
  }
  renderApp();

  setTimeout(() => {
    const targetEl =
      (highlightRef ? document.getElementById(`tracking-chip-row-${highlightRef}`) : null) ||
      document.getElementById(`tracking-order-card-${orderId}`) ||
      document.querySelector(`[id^="tracking-order-card-${orderId}-"]`);
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
    const linkedPending = state.pendingOrders.find(o => o.orderId === (grn?.pendingOrderId || orderId));
    const slipHtml = buildGrnReceivingSlipHtml({
      grnRef: refCode,
      date: grn?.date || formatCurrentDateDDMMYYYY(),
      pendingOrderId: grn?.pendingOrderId || orderId || '---',
      maker: grn?.maker || matchedOrder?.maker || '---',
      hallName: grn?.hallName || undefined,
      stitcherName: grn?.stitcherName || undefined,
      receivingNote: grn?.receivingNote || undefined,
      article: grn?.article || matchedOrder?.article || '---',
      receivedFrom: grn?.receivedFrom || undefined,
      splitSummary: formatSplitAllocationSummary(linkedPending?.contractorAllocations || matchedOrder?.contractorAllocations) || undefined,
      rcvdPairs: grn?.rcvdPairs || 0,
      sizes: grn?.sizes || createEmptySizes(matchedOrder?.sizeCodes),
      sizeFormat: (grn as any)?.sizeFormat || matchedOrder?.sizeFormat,
      sizeCodes: (grn as any)?.sizeCodes || matchedOrder?.sizeCodes
    });
    openModal(`Inward GRN Receiving Slip — ${refCode}`, slipHtml, true);
    return;
  }

  const baseReq = normalizeBaseReqNumber(refCode);
  const reqBatch = matchedOrder?.reqBatches.find(r => r.reqNumber === baseReq);

  if (slipType === 'M-REQ') {
    const linkedPending = state.pendingOrders.find(o => o.orderId === (matchedOrder?.orderId || orderId));
    const slipHtml = buildMaterialRequisitionSlipHtml({
      mreqNo: getMaterialReqNumber(baseReq),
      reqNo: baseReq,
      orderId: matchedOrder?.orderId || orderId || '---',
      po: (reqBatch as any)?.po || matchedOrder?.po || linkedPending?.po || '---',
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
    date: formatCurrentDateDDMMYYYY(),
    article: reqBatch?.article || matchedOrder?.article || '---',
    sizes: reqBatch?.sizes || matchedOrder?.sizes || createEmptySizes(matchedOrder?.sizeCodes),
    totalPairs: reqBatch?.issuedPairs || reqBatch?.askingPairs || 0,
    issueStatus: reqBatch?.issueStatus || 'Issued by Inward Register',
    sizeFormat: matchedOrder?.sizeFormat,
    sizeCodes: matchedOrder?.sizeCodes
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
  for (const [k, v] of Object.entries(state.ordersWipMap)) {
    if ((v as any)?.isDemoScenario || v?.parentOrderId === 'ORD-2026-600') {
      delete state.ordersWipMap[k];
    }
  }
  delete state.adminExpandedOrders['ORD-2026-600'];
  const activeWip = state.packingWip as any;
  if (
    activeWip.parentOrderId === 'ORD-2026-600' ||
    activeWip.isDemoScenario ||
    ['REQ-0901', 'REQ-0902', 'REQ-0903'].includes(activeWip.selectedBatch)
  ) {
    state.packingWip = createEmptyPackingWipState();
  }
  state.defectList = state.defectList.filter(
    d => !(d as any).isDemoScenario && d.id !== 'A-REQ-0902'
  );
  showToast('Removed 600-Pair Demo Scenario data.');
  renderApp();
};

window.adminVoidGrnBatch = function(sr: number, grnCode: string, triggerEl?: HTMLElement | null) {
  const item = state.grnList.find(g => g.sr === sr || g.grnCode === grnCode);
  if (!item) return;
  void confirmAndRunAdminAction(
    `admin:void-grn:${grnCode}`,
    triggerEl,
    {
      title: 'Confirm Void GRN Batch',
      message: `Void GRN batch ${grnCode} (${item.rcvdPairs} Prs)?`,
      detail: `Removes ${grnCode} from available Dock stock for Order ${item.pendingOrderId} and records the void in the audit trail.`,
      confirmLabel: 'Void GRN Batch',
      cancelLabel: 'Keep Batch',
      tone: 'danger'
    },
    async () => {
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
    }
  );
};

window.adminVoidReqBatch = function(reqNumber: string, triggerEl?: HTMLElement | null) {
  const norm = normalizeBaseReqNumber(reqNumber);
  void confirmAndRunAdminAction(
    `admin:void-req:${norm}`,
    triggerEl,
    {
      title: 'Confirm Void Requisition',
      message: `Void Requisition ${norm}?`,
      detail: 'Marks this Requisition VOIDED before Stage 1 inspection and records the change in the audit trail.',
      confirmLabel: 'Void Requisition',
      cancelLabel: 'Keep Requisition',
      tone: 'danger'
    },
    async () => {
      if (state.ordersWipMap[norm]) {
        state.ordersWipMap[norm].isVoided = true;
      }
      if (normalizeBaseReqNumber(state.packingWip.selectedBatch) === norm) {
        (state.packingWip as any).isVoided = true;
      }
      logAuditEvent('REQ_VOID', norm, 'Active Requisition', 'VOIDED before Stage 1');
      showToast(`Voided Requisition ${norm} and recorded in Audit Trail.`);
      renderApp();
    }
  );
};

window.adminCloseOrderShort = function(orderId: string, triggerEl?: HTMLElement | null) {
  const ord = state.pendingOrders.find(o => o.orderId === orderId);
  if (!ord) return;
  const beforeQty = ord.totalQty || 0;
  void confirmAndRunAdminAction(
    `admin:short-close:${orderId}`,
    triggerEl,
    {
      title: 'Confirm Short-Close Order',
      message: `Short-close Master Order ${orderId}?`,
      detail: `Closes open contractor balance on ${orderId} at received GRN quantity (Planned: ${beforeQty} Prs) and records closure in the audit trail.`,
      confirmLabel: 'Short-Close Order',
      cancelLabel: 'Keep Open',
      tone: 'danger'
    },
    async () => {
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
    }
  );
};

window.adminAddSystemUser = async function(triggerEl?: HTMLElement | null) {
  const nameEl = document.getElementById('admin-user-name') as HTMLInputElement | null;
  const usernameEl = document.getElementById('admin-user-username') as HTMLInputElement | null;
  const passwordEl = document.getElementById('admin-user-password') as HTMLInputElement | null;
  const name = nameEl?.value?.trim() || '';
  const username = usernameEl?.value?.trim() || '';
  const password = passwordEl?.value || '';
  const role = ((document.getElementById('admin-user-role') as HTMLSelectElement)?.value ||
    'PACKING_SUPERVISOR') as SystemUserRecord['role'];
  const station =
    (document.getElementById('admin-user-station') as HTMLInputElement)?.value?.trim() ||
    getDefaultStationForRole(role);
  const errors = validateSystemUserInputs({ name, username, password });
  if (applyFieldValidationErrors([
    [nameEl, errors.name],
    [usernameEl, errors.username],
    [passwordEl, errors.password]
  ])) {
    showToast('Review highlighted operator account fields.');
    return;
  }
  await runAdminAction('admin:add-system-user', triggerEl, async () => {
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username, password, role, station })
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Unable to create the account.');
      }

      const usersResponse = await fetch('/api/admin/users');
      const usersResult = await usersResponse.json();
      if (!usersResponse.ok || !usersResult.success || !Array.isArray(usersResult.data)) {
        throw new Error(usersResult.error || 'Account was created, but the account list could not be refreshed.');
      }
      state.systemUsers = usersResult.data;
      showToast(`Created ${role} account for ${name}.`);
      renderApp();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unable to create the account.';
      applyFieldValidationErrors([[usernameEl, msg]]);
      showToast(msg);
    }
  });
};

window.adminResetSystemUserPassword = async function(userId: string, triggerEl?: HTMLElement | null) {
  const passwordInput = Array.from(
    document.querySelectorAll<HTMLInputElement>('[data-admin-user-password]')
  ).find(input => input.dataset.adminUserPassword === userId) || null;
  const password = passwordInput?.value || '';
  const pwError = validatePasswordResetInput(password);
  if (applyFieldValidationErrors([[passwordInput, pwError || undefined]])) {
    showToast(pwError || 'Password must be at least 8 characters.');
    return;
  }
  const targetUser = state.systemUsers.find(u => u.userId === userId);
  const accountLabel = targetUser ? `${targetUser.name} (@${targetUser.username})` : userId;
  await confirmAndRunAdminAction(
    `admin:reset-password:${userId}`,
    triggerEl,
    {
      title: 'Confirm Password Reset',
      message: `Update sign-in password for ${accountLabel}?`,
      detail: 'Changing a password signs this account out immediately on all devices.',
      confirmLabel: 'Update Password',
      cancelLabel: 'Cancel',
      tone: 'danger'
    },
    async () => {
      try {
        const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/password`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Unable to update the account password.');
        }
        if (state.currentUser?.userId === userId) {
          await lockCurrentSession();
          showToast('Password updated. Sign in again with the new password.');
          return;
        }
        showToast('Password updated. The account has been signed out on all devices.');
        renderApp();
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unable to update the account password.';
        applyFieldValidationErrors([[passwordInput, msg]]);
        showToast(msg);
      }
    }
  );
};

window.adminDeleteSystemUser = async function(userId: string, triggerEl?: HTMLElement | null) {
  const targetUser = state.systemUsers.find(u => u.userId === userId);
  if (state.currentUser?.userId === userId) {
    showToast('You cannot delete your own active Super User account.');
    return;
  }

  resolvePendingConfirmDialog(false);
  const accountLabel = targetUser
    ? `${targetUser.name} (@${targetUser.username} • ${targetUser.role})`
    : userId;
  const html = buildConfirmDialogHtml({
    message: `Delete user account ${accountLabel}?`,
    detail: 'This permanently deletes the account and revokes all of its active sessions. Enter your Admin password to authorize deletion.',
    confirmLabel: 'Delete User',
    cancelLabel: 'Cancel',
    tone: 'danger',
    passwordField: {
      id: 'confirm-admin-password',
      label: 'Admin Password',
      placeholder: 'Enter your Super User password',
      hint: 'Required to authorize permanent account deletion.'
    }
  });
  openModal('Confirm Delete User Account', html, false, {
    hideGlobalFooter: true,
    returnFocusTarget: triggerEl instanceof HTMLElement ? triggerEl : undefined
  });

  const pwInput = document.getElementById('confirm-admin-password') as HTMLInputElement | null;
  const confirmBtn = document.getElementById('confirm-dialog-confirm') as HTMLButtonElement | null;
  pwInput?.addEventListener('input', () => clearFieldValidationError(pwInput));
  pwInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmBtn?.click();
    }
  });

  confirmBtn?.addEventListener('click', () => {
    const adminPassword = pwInput?.value || '';
    if (!adminPassword) {
      applyFieldValidationErrors([[pwInput, 'Enter your Admin password to confirm user deletion.']]);
      showToast('Enter your Admin password to confirm user deletion.');
      return;
    }

    void runAdminAction(`admin:delete-user:${userId}`, confirmBtn, async () => {
      try {
        const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminPassword })
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Incorrect Admin password. User was not deleted.');
        }
        state.systemUsers = Array.isArray(result.data?.users)
          ? result.data.users
          : state.systemUsers.filter(u => u.userId !== userId);
        logAuditEvent(
          'USER_DELETE',
          targetUser?.username || userId,
          targetUser?.role || 'USER',
          'Deleted by Super User'
        );
        closeModal();
        showToast(`Deleted user account ${targetUser ? targetUser.name : userId}.`);
        renderApp();
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unable to delete user account.';
        applyFieldValidationErrors([[pwInput, msg]]);
        showToast(msg);
      }
    });
  });
};

window.adminQuickReceiveGrnForOrder = function(orderId: string) {
  const order = state.pendingOrders.find(o => o.orderId === orderId);
  if (order) {
    const allocs = order.contractorAllocations || [];
    const scaleCodes = getOrderSizeCodes(order.orderId, order.sizeCodes, order.sizeFormat);
    const hasSplit = allocs.length > 1;
    if (hasSplit) {
      state.grnForm = {
        pendingOrderId: order.orderId,
        maker: '',
        hallName: '',
        stitcherName: '',
        article: order.article,
        color: order.color || 'Standard',
        receivedFrom: '',
        rcvdPairs: '',
        sizeFormat: order.sizeFormat || 'LEGACY_7_11',
        sizeCodes: scaleCodes,
        sizes: createEmptySizes(scaleCodes),
        splitRows: allocs.map(a => {
          const matchedHall = findHallByName(a.maker);
          return {
            maker: a.maker,
            hallName: matchedHall && matchedHall.stitchers.length > 0 ? matchedHall.name : '',
            stitcherName: '',
            receivedFrom: '',
            sizes: createEmptySizes(scaleCodes)
          };
        })
      };
    } else {
      const activeAlloc = allocs.length === 1 ? allocs[0] : null;
      const defaultMaker = activeAlloc ? activeAlloc.maker : order.maker;
      const defaultSizes = activeAlloc ? (activeAlloc.remainingSizes || activeAlloc.sizes) : (order.sizes || createEmptySizes(scaleCodes));
      const matchedHall = findHallByName(defaultMaker);
      const hasHallStitchers = Boolean(matchedHall && matchedHall.stitchers.length > 0);
      state.grnForm = {
        pendingOrderId: order.orderId,
        maker: defaultMaker,
        hallName: hasHallStitchers ? matchedHall!.name : '',
        stitcherName: '',
        article: order.article,
        color: order.color || 'Standard',
        receivedFrom: hasHallStitchers ? '' : (defaultMaker ? `${defaultMaker} Representative` : ''),
        rcvdPairs: String(calculateSizeTotal(defaultSizes) || order.totalQty || ''),
        sizeFormat: order.sizeFormat || 'LEGACY_7_11',
        sizeCodes: scaleCodes,
        sizes: { ...defaultSizes },
        splitRows: []
      };
    }
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

window.adminRemovePendingOrder = async function(orderId: string, triggerEl?: HTMLElement | null) {
  await confirmAndRunAdminAction(
    `admin:remove-order:${orderId}`,
    triggerEl,
    {
      title: 'Confirm Delete Master Order',
      message: `Delete Master Order ${orderId}?`,
      detail: 'Removes this Master Order permanently from the SQLite database.',
      confirmLabel: 'Delete Order',
      cancelLabel: 'Keep Order',
      tone: 'danger'
    },
    async () => {
      try {
        const res = await fetch(`/api/admin/pending-orders/${encodeURIComponent(orderId)}`, {
          method: 'DELETE'
        });
        const json = await res.json();
        if (!res.ok || !json.success || !Array.isArray(json.data)) {
          showToast(json.error || `Order ${orderId} could not be deleted.`);
          return;
        }
        state.pendingOrders = json.data;
        showToast(`Removed Order ${orderId} from SQLite Database.`);
        renderApp();
      } catch (error) {
        console.error('Order deletion failed:', error);
        showToast(`Order ${orderId} could not be deleted. No local data was removed.`);
      }
    }
  );
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

window.adminRemoveDropdownItem = async function(
  listKey: 'makers' | 'poList',
  val: string,
  triggerEl?: HTMLElement | null
) {
  const listLabel = listKey === 'makers' ? 'Contractors / Makers' : 'Purchase Order #';
  await confirmAndRunAdminAction(
    `admin:remove-dropdown:${listKey}:${val}`,
    triggerEl,
    {
      title: 'Confirm Remove Registry Item',
      message: `Remove "${val}" from ${listLabel}?`,
      detail: 'Future forms will no longer suggest this entry in global dropdowns.',
      confirmLabel: 'Remove Entry',
      cancelLabel: 'Keep Entry',
      tone: 'danger'
    },
    async () => {
      state.dropdownOptions[listKey] = state.dropdownOptions[listKey].filter(item => item !== val);
      showToast(`Removed "${val}" from dropdown options.`);
      renderApp();
    }
  );
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
    const linkedOrder = state.pendingOrders.find(o => o.orderId === item.pendingOrderId);
    const slipHtml = buildGrnReceivingSlipHtml({
      grnRef: grnCode,
      date: item.date,
      pendingOrderId: item.pendingOrderId,
      maker: item.maker,
      hallName: item.hallName || undefined,
      stitcherName: item.stitcherName || undefined,
      receivingNote: item.receivingNote || undefined,
      article: item.article,
      color: item.color,
      receivedFrom: item.receivedFrom,
      splitSummary: formatSplitAllocationSummary(linkedOrder?.contractorAllocations) || undefined,
      rcvdPairs: item.rcvdPairs,
      sizes: item.sizes,
      sizeFormat: item.sizeFormat || linkedOrder?.sizeFormat,
      sizeCodes: item.sizeCodes || linkedOrder?.sizeCodes
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
      hallName: item.hallName || '',
      stitcherName: item.stitcherName || '',
      article: item.article,
      color: item.color || 'Standard',
      receivedFrom: item.receivingNote || item.receivedFrom || item.maker || '',
      rcvdPairs: String(item.rcvdPairs),
      sizeFormat: item.sizeFormat || 'LEGACY_7_11',
      sizeCodes: item.sizeCodes,
      sizes: { ...item.sizes },
      splitRows: []
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


function applyDropdownsPayload(data: any): void {
  if (!data) return;
  if (Array.isArray(data.makers)) state.dropdownOptions.makers = data.makers;
  if (Array.isArray(data.customers)) state.dropdownOptions.customers = data.customers;
  if (Array.isArray(data.articles)) state.dropdownOptions.articles = data.articles;
  if (Array.isArray(data.poList)) state.dropdownOptions.poList = data.poList;
  if (Array.isArray(data.halls)) state.dropdownOptions.halls = data.halls;
  if (Array.isArray(data.sizeStandards) && data.sizeStandards.length > 0) {
    state.adminOverview.sizeStandards = data.sizeStandards;
  }
}

function applyReceivingsPayload(rows: any[]): void {
  if (!Array.isArray(rows) || rows.length === 0) return;
  state.grnList = rows.map((r: any, idx: number) => {
    const rawSizeRows = Array.isArray(r.sizes) ? r.sizes : [];
    const derivedCodes = rawSizeRows
      .map((sr: any) => String(sr.size_code || '').trim())
      .filter(Boolean);
    const activeCodes = derivedCodes.length > 0 ? derivedCodes : [...STANDARD_GLOVE_SIZES];
    const sizes = createEmptySizes(activeCodes);
    for (const sizeRow of rawSizeRows) {
      const sizeCode = String(sizeRow.size_code || '').trim();
      if (sizeCode) {
        sizes[sizeCode] = Number(sizeRow.rcvd_pairs) || 0;
      }
    }
    const isVoided = Boolean(r.is_voided);
    return {
      sr: r.id || (idx + 1),
      grnCode: r.rcv_number || formatBatchSequence('GRN', r.id || (idx + 1)),
      date: r.rcv_date || formatCurrentDateDDMMYYYY(),
      pendingOrderId: r.order_id || r.po_number || 'ORD-INWARD',
      maker: r.maker_contractor,
      hallName: r.hall_name || '',
      stitcherName: r.stitcher_name || '',
      receivingNote: r.receiving_note || '',
      article: r.article_name,
      color: r.color_shade || 'Standard',
      receivedFrom: r.received_from || r.maker_contractor || '',
      rcvdPairs: Number(r.rcvd_pairs) || 0,
      sizeFormat: activeCodes.every((c: string) => ['7', '8', '9', '10', '11'].includes(c)) ? 'LEGACY_7_11' : 'CATALOG',
      sizeCodes: activeCodes,
      sizes,
      status: isVoided ? 'VOIDED' : 'Received',
      isVoided,
      voidReason: r.void_reason || undefined
    };
  });
}

function applyAlterationsPayload(rows: any[]): void {
  if (!Array.isArray(rows) || rows.length === 0) return;
  state.dropdownOptions.defectBatchIds = Array.from(new Set(rows.map((alt: any) =>
    getAlterationReqNumber(alt.req_number || state.packingWip.selectedBatch)
  )));
  state.defectList = rows.map((alt: any) => ({
    altId: Number(alt.id) || undefined,
    id: getAlterationReqNumber(alt.req_number || state.packingWip.selectedBatch),
    reqNumber: alt.req_number || undefined,
    pairsCount: Number(alt.pairs_count || 0),
    rawStatus: alt.status || undefined,
    date: alt.sent_at ? alt.sent_at.split(' ')[0] : formatCurrentDateDDMMYYYY(),
    origin: (alt.source_stage || 'Step 1').replace(/_/g, ' '),
    article: alt.product_name || '---',
    po: alt.req_number || '---',
    defectClass: alt.defect_reason || 'Workmanship Defect',
    qty: `${alt.pairs_count} Prs`,
    tailor: alt.tailor_name || 'Supervisor A',
    status: alt.is_scrapped ? 'Scrapped' : (alt.status === 'RETURNED_TO_CHECKING' ? 'Completed' : 'In Rework'),
    route: 'Auto-Return to Stage 1 Checking',
    actionText: alt.status === 'RETURNED_TO_CHECKING' ? 'Verified' : 'Update'
  }));
}

// Dynamic backend SQLite synchronization (parallel fetch + catalog caching)
async function syncBackendData(options: { manual?: boolean; forceCatalog?: boolean } = {}): Promise<void> {
  const isInitial = !state.hasCompletedInitialSync;
  const isManual = Boolean(options.manual);
  const role = state.currentUser?.role || '';
  const syncFailures: string[] = [];

  if (isInitial) state.isInitialSyncing = true;
  if (isManual) state.isManualSync = true;
  if (isInitial || isManual) {
    state.syncError = '';
    renderApp({ preserveInitialSyncDrafts: isInitial });
  }

  try {
    const needCatalog = Boolean(options.forceCatalog)
      || state.adminOverview.products.length === 0
      || state.adminOverview.customers.length === 0;
    const prevCatalog = {
      customers: state.adminOverview.customers,
      products: state.adminOverview.products,
      sizeStandards: state.adminOverview.sizeStandards
    };

    const syncTasks: Array<Promise<void>> = [];

    if (role !== 'SUPER_USER' && role !== 'INWARD_CLERK' && state.adminOverview.sizeStandards.length === 0) {
      syncTasks.push((async () => {
        try {
          const ssRes = await fetch('/api/size-standards');
          if (ssRes.ok) {
            const ssJson = await ssRes.json();
            if (ssJson.success && Array.isArray(ssJson.data)) {
              state.adminOverview.sizeStandards = ssJson.data;
            }
          }
        } catch (e) {
          console.debug('Size standards sync offline:', e);
        }
      })());
    }

    if (role === 'INWARD_CLERK' || role === 'ALTERATION_LEAD') {
      syncTasks.push((async () => {
        try {
          const res = await fetch('/api/store/dropdowns');
          if (res.ok) {
            const json = await res.json();
            if (json.success && json.data) applyDropdownsPayload(json.data);
          } else if (res.status !== 403) {
            syncFailures.push('dropdowns');
          }
        } catch (e) {
          console.debug('Dropdown sync offline:', e);
          syncFailures.push('dropdowns');
        }
      })());
    }

    if (role === 'INWARD_CLERK') {
      syncTasks.push((async () => {
        try {
          const res = await fetch('/api/store/receivings');
          if (res.ok) {
            const json = await res.json();
            if (json.success && Array.isArray(json.data)) applyReceivingsPayload(json.data);
          } else if (res.status !== 403) {
            syncFailures.push('receivings');
          }
        } catch (e) {
          console.debug('Receivings sync offline:', e);
          syncFailures.push('receivings');
        }
      })());
    }

    if (role === 'ALTERATION_LEAD' || role === 'INWARD_CLERK') {
      syncTasks.push((async () => {
        try {
          const res = await fetch('/api/alterations');
          if (res.ok) {
            const json = await res.json();
            if (json.success && Array.isArray(json.data)) applyAlterationsPayload(json.data);
          } else if (res.status !== 403) {
            syncFailures.push('alterations');
          }
        } catch (e) {
          console.debug('Alterations sync offline:', e);
          syncFailures.push('alterations');
        }
      })());
    }

    if (role === 'SUPER_USER') {
      syncTasks.push((async () => {
        try {
          const usersResponse = await fetch('/api/admin/users');
          const usersResult = await usersResponse.json();
          if (!usersResponse.ok || !usersResult.success || !Array.isArray(usersResult.data)) {
            throw new Error(usersResult.error || 'Unable to load system users.');
          }
          state.systemUsers = usersResult.data;
        } catch (e) {
          console.warn('MES user list sync failed:', e);
          syncFailures.push('orders');
        }
      })());

      syncTasks.push((async () => {
        try {
          const overviewUrl = needCatalog ? '/api/admin/overview' : '/api/admin/overview?includeCatalog=0';
          const res = await fetch(overviewUrl);
          if (res.ok) {
            const json = await res.json();
            if (json.success && json.data) {
              const overview = json.data;
              state.adminOverview = {
                ...overview,
                customers: Array.isArray(overview.customers) ? overview.customers : prevCatalog.customers,
                products: Array.isArray(overview.products) ? overview.products : prevCatalog.products,
                sizeStandards: Array.isArray(overview.sizeStandards) ? overview.sizeStandards : prevCatalog.sizeStandards
              };
              if (Array.isArray(overview.pendingOrders)) {
                state.pendingOrders = overview.pendingOrders;
              }
              if (overview.dropdowns) applyDropdownsPayload(overview.dropdowns);
              if (Array.isArray(overview.receivings)) applyReceivingsPayload(overview.receivings);
              if (Array.isArray(overview.alterations)) applyAlterationsPayload(overview.alterations);
            }
          } else {
            syncFailures.push('admin overview');
          }
        } catch (e) {
          console.warn('MES overview sync failed:', e);
          syncFailures.push('orders');
        }
      })());
    } else if (role === 'INWARD_CLERK' || role === 'PACKING_SUPERVISOR') {
      syncTasks.push((async () => {
        try {
          const pendingResponse = await fetch('/api/admin/pending-orders');
          const pendingResult = await pendingResponse.json();
          if (!pendingResponse.ok || !pendingResult.success || !Array.isArray(pendingResult.data)) {
            throw new Error(pendingResult.error || 'Unable to load pending orders.');
          }
          state.pendingOrders = pendingResult.data;
        } catch (e) {
          console.warn('MES pending orders sync failed:', e);
          syncFailures.push('orders');
        }
      })());
    }

    if (['SUPER_USER', 'INWARD_CLERK', 'PACKING_SUPERVISOR'].includes(role)) {
      syncTasks.push((async () => {
        try {
          const response = await fetch('/api/requisitions');
          const result = await response.json();
          if (!response.ok || !result.success || !Array.isArray(result.data)) {
            throw new Error(result.error || 'Unable to load requisitions.');
          }

          const linkedRequisitions = result.data.filter((requisition: any) =>
            requisition.order_id && Number(requisition.is_voided || 0) === 0
          );
          state.persistedReqNumbers = linkedRequisitions.map((requisition: any) =>
            normalizeBaseReqNumber(requisition.req_number)
          );
          for (const requisition of linkedRequisitions) {
            const reqNumber = normalizeBaseReqNumber(requisition.req_number);
            state.ordersWipMap[reqNumber] = mapServerRequisitionToWip(requisition);
          }
          state.issuedPairsTotal = getTotalIssuedPairs();

          const selectedReq = normalizeBaseReqNumber(state.packingWip.selectedBatch);
          const startupReqNumber = getStartupRequisitionNumber(
            selectedReq,
            state.packingWip,
            state.persistedReqNumbers
          );
          if (startupReqNumber && state.ordersWipMap[startupReqNumber]) {
            state.packingWip = JSON.parse(JSON.stringify(state.ordersWipMap[startupReqNumber]));
            state.cartons = Array.isArray((state.ordersWipMap[startupReqNumber] as any).cartons)
              ? JSON.parse(JSON.stringify((state.ordersWipMap[startupReqNumber] as any).cartons))
              : [];
            state.qcChecklist.forEach(c => (c.passed = Boolean(state.packingWip.finalQcApproved)));
          }
        } catch (error) {
          console.warn('Requisition sync failed:', error);
          syncFailures.push('requisitions');
        }
      })());
    }

    await Promise.all(syncTasks);

    if (state.grnList.length > 0 && state.pendingOrders.length > 0) {
      state.grnList = state.grnList.map(grn => {
        const linked = state.pendingOrders.find(o => o.orderId === grn.pendingOrderId);
        if (!linked) return grn;
        const sizeFormat = linked.sizeFormat || grn.sizeFormat || 'LEGACY_7_11';
        const sizeCodes = linked.sizeCodes?.length ? linked.sizeCodes : grn.sizeCodes;
        return {
          ...grn,
          sizeFormat,
          sizeCodes
        };
      });
    }

    state.syncError = syncFailures.length > 0
      ? `Unable to synchronize server data (${Array.from(new Set(syncFailures)).join(', ')}). Check your connection and retry.`
      : '';
  } finally {
    state.hasCompletedInitialSync = true;
    state.isInitialSyncing = false;
    state.isManualSync = false;
    renderApp({ preserveInitialSyncDrafts: isInitial });
  }
}

// Initial Boot
void initializeAuth();
