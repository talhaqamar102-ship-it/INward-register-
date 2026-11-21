import type {
  HallWithStitchers,
  PendingOrder,
  SizeBreakdown,
  SuperUserDashboardSummary,
  AuditTrailEntry,
  MesUserRole,
  SizeStandardOption,
  CatalogProductOption
} from '../../utils/requisitionLogic';

export type SuperUserTab = 'dashboard' | 'tracking' | 'orders' | 'creation' | 'users' | 'reports';
export type SuperUserReportType =
  | 'order_grn_balance'
  | 'req_traceability'
  | 'contractor_scrap'
  | 'final_qc_dispatch';

export interface SystemUserRecord {
  userId: string;
  username: string;
  name: string;
  role: MesUserRole;
  station: string;
  active: boolean;
}

export interface AdminOrderArticleLine {
  lineId: string;
  productId: string;
  article: string;
  color: string;
  sizeFormat: string;
  maker: string;
  dueDate: string;
  sizes: SizeBreakdown;
  splitRows: Array<{
    maker: string;
    sizes: SizeBreakdown;
    dueDate: string;
  }>;
}

export interface SuperUserRenderContext {
  activeTab: SuperUserTab;
  adminNavCollapsed?: boolean;
  demoDrawerOpen?: boolean;
  locationSearch?: string;
  activeReport: SuperUserReportType;
  trackingSearch: string;
  trackingStatusFilter: string;
  trackingBuyerFilter?: string;
  trackingMakerFilter?: string;
  trackingPage?: number;
  trackingPageSize?: number;
  highlightedRefCode?: string;
  expandedOrderIds: Record<string, boolean>;
  pendingOrders: PendingOrder[];
  dropdownOptions: {
    makers: string[];
    customers: string[];
    articles: string[];
    poList: string[];
    halls?: HallWithStitchers[];
  };
  systemUsers?: SystemUserRecord[];
  currentUserId?: string;
  auditTrail?: AuditTrailEntry[];
  adminOverview: {
    dbHealth: {
      journalMode: string;
      integrity: string;
      tableCounts: Record<string, number>;
      totalTables: number;
    };
    customers: any[];
    products: CatalogProductOption[];
    sizeStandards?: SizeStandardOption[];
    receivings: any[];
    alterations: any[];
    scrapLedger: any[];
  };
  lastBackupPath: string;
  rollupSummary: SuperUserDashboardSummary;
  orderDraft?: {
    customerId?: string;
    buyer: string;
    maker: string;
    po: string;
    productId?: string;
    article: string;
    color: string;
    sizeFormat?: string;
    dueDate: string;
    sizes: SizeBreakdown;
  };
  orderSplitRows?: Array<{
    maker: string;
    sizes: SizeBreakdown;
    dueDate: string;
  }>;
  orderArticleLines?: AdminOrderArticleLine[];
  multiArticlePickerOpen?: boolean;
  multiArticleSearch?: string;
  openRegistryIds?: Record<string, boolean>;
}
