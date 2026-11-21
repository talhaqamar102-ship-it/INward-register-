export type SizeBreakdown = Record<string, number>;

export interface SizeStandardOption {
  code: string;
  rawLabel: string;
  sizes: string[];
  isLegacy?: boolean;
}

export interface CatalogProductOption {
  id: string;
  name: string;
  raw_name?: string;
  article_code?: string;
  raw_color?: string;
  color_spec?: string;
  size_format?: string;
  customer_id: string;
  customer_name?: string;
  polybag_per_pair?: number;
  silica_gel_per_pair?: number;
  stickers_per_pair?: number;
  pairs_per_carton?: number;
}

const LEGACY_SIZE_LABELS_MAP: Record<string, string> = {
  '7': '7 / S',
  '8': '8 / M',
  '9': '9 / L',
  '10': '10 / XL',
  '11': '11 / XXL'
};

export function formatSizeColumnLabel(code: string, sizeFormat = 'LEGACY_7_11'): string {
  if (!sizeFormat || sizeFormat === 'LEGACY_7_11') {
    return LEGACY_SIZE_LABELS_MAP[code] || code;
  }
  return code;
}

export function getScaleSizeCodes(sizeStandards: SizeStandardOption[] | undefined, sizeFormat = 'ALPHA_2XS_5XL'): string[] {
  const target = String(sizeFormat || 'ALPHA_2XS_5XL').trim() || 'ALPHA_2XS_5XL';
  const matched = (sizeStandards || []).find(s => s.code === target);
  if (matched && Array.isArray(matched.sizes) && matched.sizes.length > 0) {
    return matched.sizes;
  }
  if (target === 'ALPHA_2XS_5XL') {
    return ['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
  }
  if (target === 'NUMERIC_6_12') {
    return ['6', '7', '8', '9', '10', '11', '12'];
  }
  return ['7', '8', '9', '10', '11'];
}

export function resolveScaleKeysForBreakdown(
  sizes?: Partial<SizeBreakdown> | null,
  explicitCodes?: readonly string[]
): string[] {
  if (Array.isArray(explicitCodes) && explicitCodes.length > 0) {
    return [...explicitCodes];
  }
  const keys = sizes ? Object.keys(sizes) : [];
  if (keys.length > 0 && keys.some(k => !['7', '8', '9', '10', '11'].includes(k))) {
    return keys;
  }
  return ['7', '8', '9', '10', '11'];
}

export function inferSizeFormatFromCodes(codes: readonly string[], explicitFormat?: string): string {
  if (explicitFormat && String(explicitFormat).trim()) return String(explicitFormat).trim();
  return codes.every(c => ['7', '8', '9', '10', '11'].includes(c)) ? 'LEGACY_7_11' : 'CATALOG';
}

export function formatCurrentDateDDMMYYYY(now: Date = new Date()): string {
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

export function formatSplitAllocationSummary(
  allocations?: Array<{ maker: string; totalQty: number; sizes?: SizeBreakdown }> | null
): string {
  if (!Array.isArray(allocations) || allocations.length <= 1) return '';
  return allocations
    .map(a => `${String(a.maker || '').trim()} (${Number(a.totalQty || 0).toLocaleString()} Prs)`)
    .filter(Boolean)
    .join(', ');
}

export function filterProductsByBuyer<T extends { customer_id?: string; customer_name?: string; name?: string }>(
  products: T[],
  customers: Array<{ id: string; name: string }>,
  buyerValue: string
): T[] {
  const raw = String(buyerValue || '').trim();
  if (!raw) return products;
  const lowered = raw.toLowerCase();
  const matchedCust = customers.find(
    c => c.id.toLowerCase() === lowered || c.name.trim().toLowerCase() === lowered
  );
  return products.filter(p => {
    if (matchedCust && p.customer_id === matchedCust.id) return true;
    return String(p.customer_name || '').trim().toLowerCase() === lowered;
  });
}

/**
 * R1 (DECISION) — Single authoritative size set constants used across Order, GRN, REQ, Stage 5, and tests.
 * - Plan 1 size set: 7/S .. 11/XXL (`STANDARD_SIZE_KEYS` / `STANDARD_GLOVE_SIZES`)
 * - Plan 2 size set: 6 .. 12 (`EXTENDED_SIZE_KEYS` / `EXTENDED_GLOVE_SIZES`)
 */
export const STANDARD_GLOVE_SIZES = ['7', '8', '9', '10', '11'] as const;
export const EXTENDED_GLOVE_SIZES = ['6', '7', '8', '9', '10', '11', '12'] as const;
export const STANDARD_SIZE_KEYS = STANDARD_GLOVE_SIZES;
export const EXTENDED_SIZE_KEYS = EXTENDED_GLOVE_SIZES;

export function getActiveGloveSizes(includeExtended = false): readonly string[] {
  return includeExtended ? EXTENDED_GLOVE_SIZES : STANDARD_GLOVE_SIZES;
}

/** Escape arbitrary text before interpolating into HTML text or double-quoted attributes. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char] || char);
}

export const SIZE_LABELS: Array<{ key: '7' | '8' | '9' | '10' | '11'; label: string }> = [
  { key: '7', label: '7 / S' },
  { key: '8', label: '8 / M' },
  { key: '9', label: '9 / L' },
  { key: '10', label: '10 / XL' },
  { key: '11', label: '11 / XXL' }
];

export interface DeliveryCountdownInfo {
  dueDate: string;
  hasDueDate: boolean;
  daysRemaining: number | null;
  status: 'NO_DATE' | 'DELIVERED' | 'OVERDUE' | 'DUE_SOON' | 'ON_TRACK';
  badgeText: string;
  progressPct: number;
}

function parseUtcDateMidnightMs(dateInput?: string | null): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateInput || '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const ms = Date.UTC(year, month, day);
  return Number.isFinite(ms) ? ms : null;
}

export function computeDeliveryCountdown(params: {
  dueDate?: string;
  createdAt?: string;
  isCompleted?: boolean;
  nowIso?: string;
}): DeliveryCountdownInfo {
  const rawDue = String(params.dueDate || '').trim();
  const dueMs = parseUtcDateMidnightMs(rawDue);
  if (dueMs === null) {
    return {
      dueDate: '',
      hasDueDate: false,
      daysRemaining: null,
      status: params.isCompleted ? 'DELIVERED' : 'NO_DATE',
      badgeText: params.isCompleted ? 'Delivered ✓' : 'No Due Date',
      progressPct: params.isCompleted ? 100 : 0
    };
  }
  const normalizedDue = rawDue.slice(0, 10);
  if (params.isCompleted) {
    return {
      dueDate: normalizedDue,
      hasDueDate: true,
      daysRemaining: 0,
      status: 'DELIVERED',
      badgeText: 'Delivered ✓',
      progressPct: 100
    };
  }

  const nowStr = params.nowIso || new Date().toISOString().slice(0, 10);
  const todayMs = parseUtcDateMidnightMs(nowStr) ?? Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const daysRemaining = Math.round((dueMs - todayMs) / 86400000);

  let progressPct = 50;
  const createdMs = parseUtcDateMidnightMs(params.createdAt);
  if (createdMs !== null && dueMs > createdMs) {
    const rawPct = Math.round(((todayMs - createdMs) / (dueMs - createdMs)) * 100);
    progressPct = Math.max(8, Math.min(95, rawPct));
  } else {
    const fallbackPct = Math.round(((14 - Math.max(0, Math.min(14, daysRemaining))) / 14) * 100);
    progressPct = Math.max(8, Math.min(95, fallbackPct));
  }

  if (daysRemaining < 0) {
    return {
      dueDate: normalizedDue,
      hasDueDate: true,
      daysRemaining,
      status: 'OVERDUE',
      badgeText: `Overdue by ${Math.abs(daysRemaining)}d`,
      progressPct: 100
    };
  }
  if (daysRemaining === 0) {
    return {
      dueDate: normalizedDue,
      hasDueDate: true,
      daysRemaining: 0,
      status: 'DUE_SOON',
      badgeText: 'Due Today',
      progressPct: 95
    };
  }
  if (daysRemaining <= 7) {
    return {
      dueDate: normalizedDue,
      hasDueDate: true,
      daysRemaining,
      status: 'DUE_SOON',
      badgeText: `${daysRemaining}d left`,
      progressPct
    };
  }
  return {
    dueDate: normalizedDue,
    hasDueDate: true,
    daysRemaining,
    status: 'ON_TRACK',
    badgeText: `${daysRemaining}d left`,
    progressPct
  };
}

export interface ContractorOrderAllocation {
  maker: string;
  sizes: SizeBreakdown;
  totalQty: number;
  dueDate?: string;
  receivedPairs?: number;
  receivedSizes?: SizeBreakdown;
  remainingPairs?: number;
  remainingSizes?: SizeBreakdown;
}

export interface PendingOrder {
  orderId: string;
  customerId?: string;
  buyer?: string;
  maker: string;
  po?: string;
  productId?: string;
  article: string;
  color?: string;
  sizeFormat?: string;
  sizeCodes?: string[];
  dueDate?: string;
  createdAt?: string;
  sizes?: SizeBreakdown;
  totalQty?: number;
  notes?: string;
  shortClosed?: boolean;
  shortCloseReason?: string;
  /** Independent physical/bin count at Dock #1 (when recorded, used directly instead of sum of GRN unallocated bins) */
  physicalDockCountPairs?: number;
  isDemoScenario?: boolean;
  receivedPairs?: number;
  issuedPairs?: number;
  requestedPairs?: number;
  pendingReqPairs?: number;
  availableDockPairs?: number;
  unclaimedDockPairs?: number;
  remainingOrderSizes?: SizeBreakdown;
  requestedSizes?: SizeBreakdown;
  unclaimedDockSizes?: SizeBreakdown;
  receivedSizes?: SizeBreakdown;
  contractorAllocations?: ContractorOrderAllocation[];
}

export function validateContractorAllocations(
  orderSizes: SizeBreakdown,
  allocations: Array<{ maker: string; sizes: SizeBreakdown; dueDate?: string }>,
  sizeCodes: readonly string[] = STANDARD_GLOVE_SIZES
): {
  valid: boolean;
  error?: string;
  unassignedBySize: SizeBreakdown;
  totalUnassigned: number;
} {
  const activeCodes = sizeCodes.length > 0 ? sizeCodes : STANDARD_GLOVE_SIZES;
  const orderTotal = activeCodes.reduce((sum, sz) => sum + Math.max(0, Number(orderSizes[sz] || 0)), 0);
  const sumBySize = createEmptySizes(activeCodes);
  const seenMakers = new Set<string>();

  if (!Array.isArray(allocations) || allocations.length === 0) {
    return {
      valid: false,
      error: 'Add at least one contractor allocation.',
      unassignedBySize: Object.fromEntries(activeCodes.map(sz => [sz, Number(orderSizes[sz] || 0)])),
      totalUnassigned: orderTotal
    };
  }

  let firstError: string | undefined;
  for (let i = 0; i < allocations.length; i++) {
    const row = allocations[i];
    const maker = String(row?.maker || '').trim();
    if (!maker && !firstError) {
      firstError = `Row ${i + 1}: Select a Contractor / Maker.`;
    }
    const makerKey = maker.toLowerCase();
    if (maker && seenMakers.has(makerKey) && !firstError) {
      firstError = `Duplicate contractor "${maker}" in split allocation.`;
    }
    if (maker) seenMakers.add(makerKey);

    let rowTotal = 0;
    for (const sz of activeCodes) {
      const val = Number(row?.sizes?.[sz] || 0);
      if ((!Number.isFinite(val) || val < 0) && !firstError) {
        firstError = `Contractor "${maker || `#${i + 1}`}": size ${sz} quantity cannot be negative.`;
      }
      const cleanVal = Math.max(0, val);
      sumBySize[sz] += cleanVal;
      rowTotal += cleanVal;
    }
    if (orderTotal > 0 && rowTotal <= 0 && !firstError) {
      firstError = `Contractor "${maker || `#${i + 1}`}" must have at least 1 pair assigned.`;
    }
  }

  const unassignedBySize = createEmptySizes(activeCodes);
  let totalUnassigned = 0;
  for (const sz of activeCodes) {
    unassignedBySize[sz] = Math.max(0, Number(orderSizes[sz] || 0)) - sumBySize[sz];
    totalUnassigned += unassignedBySize[sz];
  }

  if (!firstError) {
    const mismatchSize = activeCodes.find(sz => unassignedBySize[sz] !== 0);
    if (mismatchSize) {
      const diff = unassignedBySize[mismatchSize];
      firstError = diff > 0
        ? `Size ${mismatchSize} still has ${diff} unassigned pairs across contractors.`
        : `Size ${mismatchSize} is over-allocated by ${Math.abs(diff)} pairs.`;
    }
  }

  return {
    valid: !firstError,
    error: firstError,
    unassignedBySize,
    totalUnassigned
  };
}

export function createEmptySizes(sizeCodes: readonly string[] = STANDARD_GLOVE_SIZES): SizeBreakdown {
  return Object.fromEntries(sizeCodes.map(c => [c, 0]));
}

export function normalizeBaseReqNumber(reqNo: string): string {
  const trimmed = (reqNo || '').trim().replace(/^[MA]-/i, '');
  return trimmed || 'REQ-2026-0001';
}

export function getMaterialReqNumber(reqNo: string): string {
  return `M-${normalizeBaseReqNumber(reqNo)}`;
}

export function getAlterationReqNumber(reqNo: string): string {
  return `A-${normalizeBaseReqNumber(reqNo)}`;
}

export function calculateSizeTotal(sizes?: Partial<SizeBreakdown> | null): number {
  if (!sizes) return 0;
  return Object.values(sizes).reduce<number>((sum, rawVal) => {
    const val = Number(rawVal || 0);
    return sum + (Number.isFinite(val) && val > 0 ? val : 0);
  }, 0);
}

export function scaleSizeBreakdown(sizes: SizeBreakdown, targetTotal: number): SizeBreakdown {
  const keys = resolveScaleKeysForBreakdown(sizes);
  const baseTotal = calculateSizeTotal(sizes);
  if (targetTotal <= 0) return createEmptySizes(keys);
  if (baseTotal <= 0) {
    const perSize = Math.floor(targetTotal / keys.length);
    const rem = targetTotal - perSize * keys.length;
    const remKey = keys.includes('9') ? '9' : keys[Math.floor(keys.length / 2)];
    const even: SizeBreakdown = {};
    for (const k of keys) {
      even[k] = perSize + (k === remKey ? rem : 0);
    }
    return even;
  }
  const ratio = targetTotal / baseTotal;
  const scaled: SizeBreakdown = {};
  for (const k of keys) {
    scaled[k] = Math.floor(Math.max(0, Number(sizes[k] || 0)) * ratio);
  }
  const currentSum = calculateSizeTotal(scaled);
  const diff = targetTotal - currentSum;
  if (diff !== 0) {
    const adjKey = keys.includes('9')
      ? '9'
      : keys.reduce((best, k) => (Number(sizes[k] || 0) >= Number(sizes[best] || 0) ? k : best), keys[0]);
    scaled[adjKey] = Math.max(0, Number(scaled[adjKey] || 0) + diff);
  }
  return scaled;
}

/**
 * 1.2 — Legacy sub-tab normalizer: redirects any legacy tab ID to a canonical view.
 */
export type CanonicalSuperUserTab = 'dashboard' | 'tracking' | 'creation' | 'users' | 'reports';

export function normalizeSuperUserTab(tabId?: string | null): CanonicalSuperUserTab {
  const raw = (tabId || '').trim().toLowerCase();
  if (raw === 'tracking' || raw === 'traceability' || raw === 'ledger' || raw === 'live') {
    return 'tracking';
  }
  if (raw === 'creation' || raw === 'orders' || raw === 'admin' || raw === 'registry' || raw === 'master') {
    return 'creation';
  }
  if (raw === 'users' || raw === 'user-management' || raw === 'accounts') {
    return 'users';
  }
  if (raw === 'reports' || raw === 'analytics' || raw === 'print' || raw === 'export') {
    return 'reports';
  }
  return 'dashboard';
}
