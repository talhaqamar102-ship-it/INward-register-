import type { SuperUserRenderContext } from './superUser/types';
import { renderAdminNavIcon } from './superUser/shared';
import { renderDashboardTab } from './superUser/dashboardTab';
import { renderLiveTrackingTab } from './superUser/liveTrackingTab';
import { renderOrderCreationTab } from './superUser/orderCreationTab';
import { renderReportsTab } from './superUser/reportsTab';
import { renderUsersTab } from './superUser/usersTab';

export type {
  SuperUserTab,
  SuperUserReportType,
  SystemUserRecord,
  SuperUserRenderContext
} from './superUser/types';
export {
  renderReconciliationBadge,
  renderDeliveryCountdownChip,
  renderStageMiniTrack,
  renderDashboardVisualGraphs,
  renderOrderGrnChipsWithOverflow,
  renderOrderReqChipsWithOverflow,
  renderAdminNavIcon
} from './superUser/shared';
export { renderDashboardTab } from './superUser/dashboardTab';
export { renderLiveTrackingTab } from './superUser/liveTrackingTab';
export { renderOrderCreationTab } from './superUser/orderCreationTab';
export {
  buildSuperUserReportHtml,
  renderReportVisualChart,
  renderReportsTab
} from './superUser/reportsTab';
export { renderUsersTab } from './superUser/usersTab';

export function renderSuperUserScreen(ctx: SuperUserRenderContext): string {
  const ov = ctx.adminOverview;
  const s = ctx.rollupSummary;
  const totalScrapDeduction =
    ov.scrapLedger.reduce(
      (sum: number, item: any) => sum + Number(item.financial_deduction_amount || 0),
      0
    ) || s.totalScrappedPairs * 150;

  const isCreationTab = ctx.activeTab === 'orders' || ctx.activeTab === 'creation';

  let tabBody = '';
  if (ctx.activeTab === 'dashboard') {
    tabBody = renderDashboardTab(ctx, totalScrapDeduction);
  } else if (ctx.activeTab === 'tracking') {
    tabBody = renderLiveTrackingTab(ctx);
  } else if (ctx.activeTab === 'users') {
    tabBody = renderUsersTab(ctx);
  } else if (isCreationTab) {
    tabBody = renderOrderCreationTab(ctx);
  } else {
    tabBody = renderReportsTab(ctx);
  }

  return `
    <div class="superuser-command-center" data-testid="superuser-command-center">
      <!-- Sub-Header Bar -->
      <div class="sub-header-bar">
        <h1 class="sub-header-title">
          <span>Super User Control Center &mdash; Dashboard, Live Tracking, Order Creation, User Management &amp; Reports</span>
        </h1>
        <div class="sub-header-right">
          <button class="btn-outline" id="btn-admin-refresh" style="padding: 4px 10px; font-size: 12px;">
            Sync Database
          </button>
        </div>
      </div>

      <main id="main-content" class="main-viewport" tabindex="-1">
        <div class="admin-workspace-layout ${ctx.adminNavCollapsed ? 'admin-nav-collapsed' : ''}">
          <aside class="admin-sidebar" aria-label="Super User navigation">
            <div class="admin-sidebar-heading">
              <span class="admin-sidebar-label">Super User</span>
              <button type="button" class="admin-sidebar-toggle" id="btn-admin-nav-toggle"
                aria-label="${ctx.adminNavCollapsed ? 'Expand' : 'Collapse'} Super User menu"
                aria-expanded="${!ctx.adminNavCollapsed}">
                ${ctx.adminNavCollapsed ? 'Expand' : 'Collapse'}
              </button>
            </div>
            <nav class="admin-subnav-tabs" aria-label="Super User Navigation">
              <button type="button" class="admin-tab-btn ${ctx.activeTab === 'dashboard' ? 'active' : ''}"
                aria-label="Dashboard" data-admin-tab="dashboard"${ctx.activeTab === 'dashboard' ? ' aria-current="page"' : ''}${ctx.adminNavCollapsed ? ' title="Dashboard"' : ''}>
                <span class="admin-tab-heading">
                  <span class="admin-tab-icon" aria-hidden="true">${renderAdminNavIcon('dashboard')}</span>
                  <span class="admin-tab-label">Dashboard</span>
                </span>
              </button>
              <button type="button" class="admin-tab-btn ${ctx.activeTab === 'tracking' ? 'active' : ''}"
                aria-label="Live Tracking" data-admin-tab="tracking"${ctx.activeTab === 'tracking' ? ' aria-current="page"' : ''}${ctx.adminNavCollapsed ? ' title="Live Tracking"' : ''}>
                <span class="admin-tab-heading">
                  <span class="admin-tab-icon" aria-hidden="true">${renderAdminNavIcon('tracking')}</span>
                  <span class="admin-tab-label">Live Tracking</span>
                </span>
                <span class="admin-tab-count">${s.totalOrders} Orders &bull; ${s.totalGrnCount} GRNs &bull; ${s.totalReqCount} REQs</span>
              </button>
              <button type="button" class="admin-tab-btn ${isCreationTab ? 'active' : ''}"
                aria-label="Order Creation" data-admin-tab="orders"${isCreationTab ? ' aria-current="page"' : ''}${ctx.adminNavCollapsed ? ' title="Order Creation"' : ''}>
                <span class="admin-tab-heading">
                  <span class="admin-tab-icon" aria-hidden="true">${renderAdminNavIcon('orders')}</span>
                  <span class="admin-tab-label">Order Creation</span>
                </span>
                <span class="admin-tab-count">${ctx.pendingOrders.length}</span>
              </button>
              <button type="button" class="admin-tab-btn ${ctx.activeTab === 'users' ? 'active' : ''}"
                aria-label="User Management" data-admin-tab="users"${ctx.activeTab === 'users' ? ' aria-current="page"' : ''}${ctx.adminNavCollapsed ? ' title="User Management"' : ''}>
                <span class="admin-tab-heading">
                  <span class="admin-tab-icon" aria-hidden="true">${renderAdminNavIcon('users')}</span>
                  <span class="admin-tab-label">User Management</span>
                </span>
                <span class="admin-tab-count">${(ctx.systemUsers || []).length}</span>
              </button>
              <button type="button" class="admin-tab-btn ${ctx.activeTab === 'reports' ? 'active' : ''}"
                aria-label="Reports" data-admin-tab="reports"${ctx.activeTab === 'reports' ? ' aria-current="page"' : ''}${ctx.adminNavCollapsed ? ' title="Reports"' : ''}>
                <span class="admin-tab-heading">
                  <span class="admin-tab-icon" aria-hidden="true">${renderAdminNavIcon('reports')}</span>
                  <span class="admin-tab-label">Reports</span>
                </span>
              </button>
            </nav>
          </aside>

          <div class="admin-workspace">
            ${ctx.activeTab === 'users' ? '' : `<div class="admin-meta-caption admin-workspace-caption">
              Hierarchy: 1 Order &rarr; Multiple GRNs (0001, 0002...) &amp; Multiple REQs (0001, 0002... &rarr; M &amp; A)
            </div>`}
            ${tabBody}
            <footer class="portal-footer">
              <div class="footer-stats-left">
                <span>Master Orders: <strong>${s.totalOrders}</strong></span>
                <span class="stat-divider">|</span>
                <span>Planned: <strong>${s.totalPlannedPairs.toLocaleString()} Prs</strong></span>
                <span class="stat-divider">|</span>
                <span>Received (GRNs): <strong style="color: var(--su-grn-deep);">${s.totalReceivedGrnPairs.toLocaleString()} Prs</strong></span>
                <span class="stat-divider">|</span>
                <span>Issued (REQs): <strong style="color: var(--su-req-primary);">${s.totalIssuedReqPairs.toLocaleString()} Prs</strong></span>
                <span class="stat-divider">|</span>
                <span>Packed (Stage 5): <strong style="color: var(--su-complete-dark);">${s.stage5PackedPairs.toLocaleString()} Prs</strong></span>
              </div>
            </footer>
          </div>
        </div>
      </main>
    </div>
  `;
}
