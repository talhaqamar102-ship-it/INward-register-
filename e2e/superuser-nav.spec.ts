import { test, expect, Page } from '@playwright/test';

const TEST_ADMIN = {
  name: 'E2E Super User',
  username: 'e2e.admin',
  password: 'Mes-E2E-Password-2026!'
};

async function authenticateAsSuperUser(page: Page, query = '') {
  // Fulfill external Google Fonts requests locally so offline/flaky DNS cannot fail or stall load
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i, route =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' })
  );
  await page.goto(`/${query}`);
  const setupHeading = page.locator('h1#auth-title');
  await expect(setupHeading).toBeVisible();

  const headingText = (await setupHeading.textContent()) || '';
  if (headingText.includes('Create the first Super User')) {
    await page.fill('#auth-name', TEST_ADMIN.name);
    await page.fill('#auth-username', TEST_ADMIN.username);
    await page.fill('#auth-password', TEST_ADMIN.password);
    await page.fill('#auth-password-confirm', TEST_ADMIN.password);
    await page.click('#auth-form button[type="submit"]');
  } else if (headingText.includes('Sign in')) {
    await page.fill('#auth-username', TEST_ADMIN.username);
    await page.fill('#auth-password', TEST_ADMIN.password);
    await page.click('#auth-form button[type="submit"]');
  }

  await expect(page.locator('[data-testid="superuser-command-center"]')).toBeVisible();
  await expect(page.locator('#root')).toHaveAttribute('data-sync-ready', 'true');
}

test.describe('Super User UI at 1440px & Core Interactive Flows', () => {
  test('1440px expanded and collapsed navigation, zero overflow, demo drawer, stage bars, order reset, and reports', async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', err => runtimeErrors.push(`pageerror: ${err.message}`));
    page.on('console', msg => {
      if (msg.type() === 'error') {
        runtimeErrors.push(`console.error: ${msg.text()}`);
      }
    });
    page.on('response', res => {
      if (res.status() >= 500) {
        runtimeErrors.push(`http ${res.status()}: ${res.url()}`);
      }
    });

    await authenticateAsSuperUser(page);

    // Verify 1440px expanded navigation layout & ARIA structure
    const layout = page.locator('.admin-workspace-layout');
    const sidebar = page.locator('.admin-sidebar');
    const workspace = page.locator('.admin-workspace');
    const toggleBtn = page.locator('#btn-admin-nav-toggle');

    await expect(layout).not.toHaveClass(/admin-nav-collapsed/);
    await expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('[role="tab"]')).toHaveCount(0);
    await expect(page.locator('.admin-tab-btn[data-admin-tab="dashboard"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.admin-tab-btn[data-admin-tab="orders"]')).not.toHaveAttribute('title', /.+/);
    await expect(page.locator('.admin-tab-btn[data-admin-tab="dashboard"] .admin-tab-label')).toBeVisible();

    const expandedSidebarBox = await sidebar.boundingBox();
    const expandedWorkspaceBox = await workspace.boundingBox();
    expect(expandedSidebarBox).not.toBeNull();
    expect(expandedWorkspaceBox).not.toBeNull();
    expect(expandedSidebarBox!.width).toBeGreaterThanOrEqual(175);
    expect(expandedSidebarBox!.x + expandedSidebarBox!.width).toBeLessThanOrEqual(expandedWorkspaceBox!.x + 1);

    const expandedOverflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));
    expect(expandedOverflow.scrollWidth).toBeLessThanOrEqual(expandedOverflow.clientWidth);

    // Collapse sidebar navigation at 1440px
    await toggleBtn.click();
    await expect(layout).toHaveClass(/admin-nav-collapsed/);
    await expect(page.locator('#btn-admin-nav-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.admin-tab-btn[data-admin-tab="orders"]')).toHaveAttribute('title', 'Order Creation');
    await expect(page.locator('.admin-tab-btn[data-admin-tab="dashboard"] .admin-tab-label')).toBeHidden();

    const collapsedSidebarBox = await sidebar.boundingBox();
    const collapsedWorkspaceBox = await workspace.boundingBox();
    expect(collapsedSidebarBox).not.toBeNull();
    expect(collapsedWorkspaceBox).not.toBeNull();
    expect(collapsedSidebarBox!.width).toBeLessThanOrEqual(72);
    expect(collapsedSidebarBox!.width).toBeGreaterThanOrEqual(56);
    expect(collapsedSidebarBox!.x + collapsedSidebarBox!.width).toBeLessThanOrEqual(collapsedWorkspaceBox!.x + 1);

    const collapsedOverflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));
    expect(collapsedOverflow.scrollWidth).toBeLessThanOrEqual(collapsedOverflow.clientWidth);

    // Re-expand sidebar navigation cleanly
    await page.locator('#btn-admin-nav-toggle').click();
    await expect(layout).not.toHaveClass(/admin-nav-collapsed/);
    await expect(page.locator('#btn-admin-nav-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.admin-tab-btn[data-admin-tab="dashboard"] .admin-tab-label')).toBeVisible();

    // Demo drawer closed by default when no demo order / no ?demo=1; zero-order CTA present
    const demoDrawer = page.locator('details.su-demo-drawer');
    await expect(demoDrawer).toBeVisible();
    await expect(demoDrawer).not.toHaveAttribute('open', '');
    await expect(page.locator('.su-empty-cta-box [data-admin-tab-jump="orders"]')).toBeVisible();

    // ?demo=1 opens demo drawer automatically and allows loading 600-pair demo scenario
    await page.goto('/?demo=1');
    await expect(page.locator('[data-testid="superuser-command-center"]')).toBeVisible();
    await expect(page.locator('details.su-demo-drawer')).toHaveAttribute('open', '');
    await page.click('#btn-load-demo-600-complete');
    await expect(page.locator('#btn-remove-demo-600')).toBeVisible();

    // Click stage-bar button to drill into filtered Live Tracking
    const completedStageBtn = page.locator('.su-stage-bar-btn[data-tracking-filter="COMPLETED"]');
    await expect(completedStageBtn).toBeVisible();
    await completedStageBtn.click();
    await expect(page.locator('[data-testid="wip-analytics-dashboard"]')).toBeVisible();
    await expect(page.locator('.admin-tracking-filter-btn[data-tracking-filter="COMPLETED"]')).toHaveClass(/btn-primary/);

    // Check Order Creation sections 1-6, required markers, and Reset Form behavior
    await page.click('.admin-tab-btn[data-admin-tab="orders"]');
    await expect(page.locator('#btn-admin-add-pending-order')).toContainText('Save & Issue Master Order');
    await expect(page.locator('#admin-pending-order-maker')).toHaveAttribute('aria-required', 'true');
    await expect(page.locator('#admin-pending-order-article')).toHaveAttribute('aria-required', 'true');
    await expect(page.locator('#screen-admin, [data-testid="superuser-command-center"]')).not.toContainText('Checklist 12.2');
    await page.fill('#admin-pending-order-po', 'PO-RESET-CHECK');
    await page.fill('.admin-order-size-val[data-size="7"]', '25');
    await expect(page.locator('#admin-order-size-total')).toHaveText('25');
    await page.click('#btn-admin-reset-pending-order');
    await expect(page.locator('#admin-pending-order-po')).toHaveValue('');
    await expect(page.locator('#admin-order-size-total')).toHaveText('0');

    // Check Reports wrapper & Reconciliation Rule across all 4 reports
    await page.click('.admin-tab-btn[data-admin-tab="reports"]');
    await expect(page.locator('.su-report-sheet-wrap')).toBeVisible();
    for (const repId of ['order_grn_balance', 'req_traceability', 'contractor_scrap', 'final_qc_dispatch']) {
      await page.click(`.admin-report-select-btn[data-report-id="${repId}"]`);
      await expect(page.locator('.su-report-sheet-wrap')).toContainText('Reconciliation Rule:');
      await expect(page.locator('.su-report-sheet-wrap')).not.toContainText('Acceptance Criteria');
    }

    // Remove demo order to leave clean empty dashboard state
    await page.click('.admin-tab-btn[data-admin-tab="dashboard"]');
    await page.click('#btn-remove-demo-600');
    await expect(page.locator('.su-empty-cta-box')).toBeVisible();

    expect(runtimeErrors).toEqual([]);
  });

  test('Phase 4.1: escapes hostile payloads across views and wires data-su-* handlers without inline events', async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', err => runtimeErrors.push(`pageerror: ${err.message}`));
    page.on('console', msg => {
      if (msg.type() === 'error') {
        runtimeErrors.push(`console.error: ${msg.text()}`);
      }
    });
    page.on('response', res => {
      if (res.status() >= 500) {
        runtimeErrors.push(`http ${res.status()}: ${res.url()}`);
      }
    });

    await page.addInitScript(() => {
      (window as any).__xssTriggered = false;
      window.alert = () => {
        (window as any).__xssTriggered = true;
      };
    });

    await authenticateAsSuperUser(page);

    const hostileBuyer = `Buyer <img src=x onerror="window.__xssTriggered=true">`;
    const hostilePo = `PO'"><img src=x onerror="window.__xssTriggered=true">`;
    const hostileColor = `<script>window.__xssTriggered=true</script>`;

    await page.click('.admin-tab-btn[data-admin-tab="orders"]');

    // Save hostile buyer in Customer & Buyer Master (persists in SQLite; synced into dropdowns)
    await page.fill('#admin-cust-name', hostileBuyer);
    await page.fill('#admin-cust-country', 'DE"><svg onload="window.__xssTriggered=true">');
    await page.click('#btn-admin-save-customer');
    await expect(page.locator('#admin-pending-order-buyer')).toContainText(hostileBuyer);

    // Create a Master Order using the hostile buyer, hostile PO, and hostile color
    await page.selectOption('#admin-pending-order-buyer', hostileBuyer);
    const makerOption = await page.locator('#admin-pending-order-maker option').nth(1).getAttribute('value');
    const articleOption = await page.locator('#admin-pending-order-article option').nth(1).getAttribute('value');
    expect(makerOption).toBeTruthy();
    expect(articleOption).toBeTruthy();
    await page.selectOption('#admin-pending-order-maker', makerOption!);
    await page.selectOption('#admin-pending-order-article', articleOption!);
    await page.fill('#admin-pending-order-po', hostilePo);
    await page.fill('#admin-pending-order-color', hostileColor);
    await page.fill('.admin-order-size-val[data-size="7"]', '40');
    await page.click('#btn-admin-add-pending-order');

    const createdOrderCard = page.locator('[data-su-action="remove-pending-order"]').first();
    await expect(createdOrderCard).toBeVisible();
    const createdOrderId = await createdOrderCard.getAttribute('data-order-id');
    expect(createdOrderId).toBeTruthy();

    // Navigate Dashboard and inspect via data-su-action="inspect-order"
    await page.click('.admin-tab-btn[data-admin-tab="dashboard"]');
    const inspectBtn = page.locator(`button[data-su-action="inspect-order"][data-order-id="${createdOrderId}"]`).first();
    await expect(inspectBtn).toBeVisible();
    await inspectBtn.click();
    const toggleExpandBtn = page.locator(`button[data-su-action="toggle-order-expand"][data-order-id="${createdOrderId}"]`);
    await expect(toggleExpandBtn).toBeVisible();

    // Exercise data-su-change buyer filter and data-su-action toggle-order-expand
    await page.selectOption('#admin-tracking-buyer-filter', hostileBuyer);
    await expect(page.locator('#main-content')).toContainText(hostileBuyer);
    await expect(page.locator('#main-content')).toContainText(hostilePo);
    await expect(page.locator('#main-content')).toContainText(hostileColor);
    await toggleExpandBtn.click();
    await page.selectOption('#admin-tracking-buyer-filter', 'ALL');

    // Check Reports view escapes hostile strings safely
    await page.click('.admin-tab-btn[data-admin-tab="reports"]');
    await expect(page.locator('.su-report-sheet-wrap')).toContainText(hostileBuyer);

    // Ensure zero hostile DOM injection or event execution anywhere
    expect(await page.evaluate(() => (window as any).__xssTriggered)).toBe(false);
    await expect(page.locator('img[src="x"]')).toHaveCount(0);

    // Verify no inline onclick/onchange attributes remain in rendered Super User DOM
    const inlineEventCount = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="superuser-command-center"]');
      if (!root) return -1;
      const all = [root, ...Array.from(root.querySelectorAll('*'))];
      return all.filter(el => Array.from(el.attributes).some(a => /^on/i.test(a.name))).length;
    });
    expect(inlineEventCount).toBe(0);

    // Clean up created hostile pending order via data-su-action="remove-pending-order" + openConfirmDialog
    await page.click('.admin-tab-btn[data-admin-tab="orders"]');
    await page.click(`button[data-su-action="remove-pending-order"][data-order-id="${createdOrderId}"]`);
    await expect(page.locator('#global-modal.open')).toBeVisible();
    await expect(page.locator('#modal-body')).toContainText(createdOrderId!);
    await page.click('#confirm-dialog-confirm');
    await expect(page.locator(`button[data-su-action="remove-pending-order"][data-order-id="${createdOrderId}"]`)).toHaveCount(0);

    expect(runtimeErrors).toEqual([]);
  });

  test('Phase 4.2: openConfirmDialog for named destructive actions, runAdminAction concurrency gate, and inline validation', async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', err => runtimeErrors.push(`pageerror: ${err.message}`));
    page.on('console', msg => {
      if (msg.type() === 'error') {
        runtimeErrors.push(`console.error: ${msg.text()}`);
      }
    });
    page.on('response', res => {
      if (res.status() >= 500) {
        runtimeErrors.push(`http ${res.status()}: ${res.url()}`);
      }
    });

    await authenticateAsSuperUser(page);

    // 1. Inline validation on Order Creation, Customer Master, Article Master, and Users
    await page.click('.admin-tab-btn[data-admin-tab="orders"]');
    await page.click('#btn-admin-add-pending-order');
    const makerSelect = page.locator('#admin-pending-order-maker');
    const articleSelect = page.locator('#admin-pending-order-article');
    await expect(makerSelect).toHaveAttribute('aria-invalid', 'true');
    await expect(articleSelect).toHaveAttribute('aria-invalid', 'true');
    await expect(makerSelect).toBeFocused();
    await expect(page.locator('#admin-pending-order-maker-error')).toHaveText('Select a Contractor / Maker.');
    await expect(page.locator('#admin-pending-order-article-error')).toHaveText('Select an Article.');

    const makerOption = await makerSelect.locator('option').nth(1).getAttribute('value');
    const articleOption = await articleSelect.locator('option').nth(1).getAttribute('value');
    await makerSelect.selectOption(makerOption!);
    await expect(makerSelect).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#admin-pending-order-maker-error')).toHaveCount(0);

    await page.click('#btn-admin-save-customer');
    await expect(page.locator('#admin-cust-name')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#admin-cust-name-error')).toHaveText('Enter a customer / buyer name.');
    await page.fill('#admin-cust-name', 'Temp Clear Check');
    await expect(page.locator('#admin-cust-name')).not.toHaveAttribute('aria-invalid', 'true');
    await page.fill('#admin-cust-name', '');

    await page.click('#btn-admin-save-product');
    await expect(page.locator('#admin-prod-name')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#admin-prod-name-error')).toHaveText('Enter an article name.');

    // User Management inline validation
    await page.click('.admin-tab-btn[data-admin-tab="users"]');
    await page.click('#btn-admin-add-system-user');
    await expect(page.locator('#admin-user-name')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#admin-user-username')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#admin-user-password')).toHaveAttribute('aria-invalid', 'true');

    const firstUserResetInput = page.locator('[data-admin-user-password]').first();
    const firstUserResetBtn = page.locator('[data-admin-reset-password]').first();
    await firstUserResetInput.fill('short');
    await firstUserResetBtn.click();
    await expect(firstUserResetInput).toHaveAttribute('aria-invalid', 'true');

    // 2. runAdminAction in-flight gating prevents double POST on rapid double-click
    await page.click('.admin-tab-btn[data-admin-tab="orders"]');
    await page.selectOption('#admin-pending-order-maker', makerOption!);
    await page.selectOption('#admin-pending-order-article', articleOption!);
    await page.fill('#admin-pending-order-po', 'PO-GATE-42');
    await page.fill('.admin-order-size-val[data-size="7"]', '80');

    let postOrderRequests = 0;
    await page.route('**/api/admin/pending-orders', async route => {
      if (route.request().method() === 'POST') {
        postOrderRequests += 1;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      await route.continue();
    });

    await page.evaluate(() => {
      const btn = document.getElementById('btn-admin-add-pending-order') as HTMLButtonElement | null;
      btn?.click();
      btn?.click();
    });
    await expect(page.locator('#btn-admin-add-pending-order')).toHaveAttribute('aria-busy', 'true');
    const createdDeleteBtn = page.locator('button[data-su-action="remove-pending-order"]').first();
    await expect(createdDeleteBtn).toBeVisible();
    expect(postOrderRequests).toBe(1);
    await page.unroute('**/api/admin/pending-orders');

    const orderId = (await createdDeleteBtn.getAttribute('data-order-id'))!;
    expect(orderId).toBeTruthy();

    // 3. openConfirmDialog: Cancel & Escape preserve Master Order
    await createdDeleteBtn.click();
    await expect(page.locator('#global-modal.open')).toBeVisible();
    await expect(page.locator('#modal-body')).toContainText(orderId);
    await page.keyboard.press('Escape');
    await expect(page.locator('#global-modal.open')).toHaveCount(0);
    await expect(page.locator(`button[data-su-action="remove-pending-order"][data-order-id="${orderId}"]`)).toBeVisible();

    // Receive partial 40/80 GRN via Inward Dock to unlock Short-Close and Void GRN confirm dialogs
    await page.click('.admin-tab-btn[data-admin-tab="tracking"]');
    await page.click(`button[data-su-action="quick-receive-grn"][data-order-id="${orderId}"]`);
    await expect(page.locator('#grn-size-total-display')).toBeVisible();
    await page.fill('.grn-size-val[data-size="7"]', '40');
    await page.click('#btn-print-grn-slip');
    await expect(page.locator('#global-modal.open')).toBeVisible();
    await page.click('#modal-btn-close');
    await page.click('#btn-return-admin');
    await page.click('.admin-tab-btn[data-admin-tab="tracking"]');

    // Short-Close Order confirmation: Cancel preserves open state; Confirm closes short
    const shortCloseBtn = page.locator(`button[data-su-action="short-close-order"][data-order-id="${orderId}"]`);
    await expect(shortCloseBtn).toBeVisible();
    await shortCloseBtn.click();
    await expect(page.locator('#global-modal.open')).toBeVisible();
    await expect(page.locator('#modal-body')).toContainText(orderId);
    await page.click('#confirm-dialog-cancel');
    await expect(page.locator('#global-modal.open')).toHaveCount(0);
    await expect(shortCloseBtn).toBeVisible();

    await shortCloseBtn.click();
    await page.click('#confirm-dialog-confirm');
    await expect(page.locator(`button[data-su-action="short-close-order"][data-order-id="${orderId}"]`)).toHaveCount(0);

    // Void GRN batch confirmation: Escape preserves + restores focus; Confirm voids GRN & logs GRN_VOID
    const voidGrnBtn = page.locator('button[data-su-action="void-grn"]').first();
    await expect(voidGrnBtn).toBeVisible();
    const grnCode = (await voidGrnBtn.getAttribute('data-grn-code'))!;
    await voidGrnBtn.click();
    await expect(page.locator('#global-modal.open')).toBeVisible();
    await expect(page.locator('#modal-body')).toContainText(grnCode);
    await page.keyboard.press('Escape');
    await expect(page.locator('#global-modal.open')).toHaveCount(0);
    await expect(voidGrnBtn).toBeVisible();
    await expect(voidGrnBtn).toBeFocused();

    await voidGrnBtn.click();
    await page.click('#confirm-dialog-confirm');
    await expect(page.locator('button[data-su-action="void-grn"]')).toHaveCount(0);
    await expect(page.locator('.admin-tab-btn[data-admin-tab="tracking"]')).toContainText('0 GRNs');

    // Void REQ confirmation (if pending unstarted REQ row exists): Cancel keeps it; Confirm voids it
    const voidReqBtn = page.locator('button[data-su-action="void-req"]').first();
    if (await voidReqBtn.count()) {
      const reqNo = (await voidReqBtn.getAttribute('data-req-number'))!;
      await voidReqBtn.click();
      await expect(page.locator('#global-modal.open')).toBeVisible();
      await expect(page.locator('#modal-body')).toContainText(reqNo);
      await page.click('#confirm-dialog-cancel');
      await expect(page.locator('#global-modal.open')).toHaveCount(0);
      await expect(voidReqBtn).toBeFocused();

      await voidReqBtn.click();
      await page.click('#confirm-dialog-confirm');
      await expect(page.locator(`button[data-su-action="void-req"][data-req-number="${reqNo}"]`)).toHaveCount(0);
    }

    // Verify GRN_VOID was recorded in Immutable Audit Trail
    await page.click('.admin-tab-btn[data-admin-tab="orders"]');
    await expect(page.locator('#main-content')).toContainText('GRN_VOID');
    await expect(page.locator('#main-content')).toContainText(grnCode);

    // Create a clean standalone order and verify Confirm Delete removes it
    await page.click('.admin-tab-btn[data-admin-tab="orders"]');
    await page.selectOption('#admin-pending-order-maker', makerOption!);
    await page.selectOption('#admin-pending-order-article', articleOption!);
    await page.fill('#admin-pending-order-po', 'PO-DELETE-42');
    await page.click('#btn-admin-add-pending-order');
    await expect(page.locator('#main-content')).toContainText('PO-DELETE-42');
    const deletableBtn = page.locator('tr', { hasText: 'PO-DELETE-42' }).locator('button[data-su-action="remove-pending-order"]');
    const deleteId = (await deletableBtn.getAttribute('data-order-id'))!;
    await deletableBtn.click();
    await expect(page.locator('#modal-body')).toContainText(deleteId);
    await page.click('#confirm-dialog-confirm');
    await expect(page.locator(`button[data-su-action="remove-pending-order"][data-order-id="${deleteId}"]`)).toHaveCount(0);

    expect(runtimeErrors).toEqual([]);
  });

  test('Phase 4.3: preserves keyboard focus and search cursor across renderApp() re-renders without breaking modals', async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', err => runtimeErrors.push(`pageerror: ${err.message}`));
    page.on('console', msg => {
      if (msg.type() === 'error') {
        runtimeErrors.push(`console.error: ${msg.text()}`);
      }
    });
    page.on('response', res => {
      if (res.status() >= 500) {
        runtimeErrors.push(`http ${res.status()}: ${res.url()}`);
      }
    });

    await authenticateAsSuperUser(page, '?demo=1');
    await page.click('#btn-load-demo-600-complete');
    await expect(page.locator('#btn-remove-demo-600')).toBeVisible();

    // 1. Toggle Super User sidebar via Enter key and keep focus on #btn-admin-nav-toggle
    const navToggle = page.locator('#btn-admin-nav-toggle');
    await navToggle.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.admin-workspace-layout')).toHaveClass(/admin-nav-collapsed/);
    await expect(page.locator('#btn-admin-nav-toggle')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.admin-workspace-layout')).not.toHaveClass(/admin-nav-collapsed/);
    await expect(page.locator('#btn-admin-nav-toggle')).toBeFocused();

    // 2. Switch tabs via keyboard Enter and preserve focus on active tab button
    const trackingTabBtn = page.locator('.admin-tab-btn[data-admin-tab="tracking"]');
    await trackingTabBtn.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#admin-tracking-search')).toBeVisible();
    await expect(trackingTabBtn).toBeFocused();

    // 3. Toggle Tracking status filter via keyboard Enter and preserve focus
    const completedFilterBtn = page.locator('.admin-tracking-filter-btn[data-tracking-filter="COMPLETED"]');
    await completedFilterBtn.focus();
    await page.keyboard.press('Enter');
    await expect(completedFilterBtn).toHaveClass(/btn-primary/);
    await expect(completedFilterBtn).toBeFocused();

    // 4. Toggle order accordion expansion via keyboard Enter and preserve focus
    const toggleOrderBtn = page.locator('button[data-su-action="toggle-order-expand"][data-order-id="ORD-2026-600"]');
    await expect(toggleOrderBtn).toBeVisible();
    await toggleOrderBtn.focus();
    const initialExpanded = await toggleOrderBtn.getAttribute('aria-expanded');
    await page.keyboard.press('Enter');
    await expect(toggleOrderBtn).toHaveAttribute('aria-expanded', initialExpanded === 'true' ? 'false' : 'true');
    await expect(toggleOrderBtn).toBeFocused();

    // 5. Type into #admin-tracking-search with caret in the middle and verify focus + caret index stay intact
    const searchInput = page.locator('#admin-tracking-search');
    await searchInput.focus();
    await page.keyboard.type('OR2026');
    await expect(searchInput).toBeFocused();
    // Move caret back 4 chars (between 'OR' and '2026') and type 'D-'
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('ArrowLeft');
    }
    await page.keyboard.type('D-');
    await expect(searchInput).toBeFocused();
    await expect(searchInput).toHaveValue('ORD-2026');
    const caretAfterEdit = await searchInput.evaluate((el: HTMLInputElement) => el.selectionStart);
    expect(caretAfterEdit).toBe(4);
    await searchInput.fill('');

    // 6. Switch Reports tab & switch report views via Enter while preserving focus
    const reportsTabBtn = page.locator('.admin-tab-btn[data-admin-tab="reports"]');
    await reportsTabBtn.focus();
    await page.keyboard.press('Enter');
    await expect(reportsTabBtn).toBeFocused();

    const scrapReportBtn = page.locator('.admin-report-select-btn[data-report-id="contractor_scrap"]');
    await scrapReportBtn.focus();
    await page.keyboard.press('Enter');
    await expect(scrapReportBtn).toBeFocused();
    await expect(page.locator('.su-report-sheet-wrap')).toContainText('Reconciliation Rule:');

    // Clean up demo state
    await page.click('.admin-tab-btn[data-admin-tab="dashboard"]');
    await page.click('#btn-remove-demo-600');

    expect(runtimeErrors).toEqual([]);
  });

  test('Phase 4.4: Customer Master and Article/BOM Master grids adapt across 1440px, 768px, and 375px without overflow or overlap', async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', err => runtimeErrors.push(`pageerror: ${err.message}`));
    page.on('console', msg => {
      if (msg.type() === 'error') {
        runtimeErrors.push(`console.error: ${msg.text()}`);
      }
    });
    page.on('response', res => {
      if (res.status() >= 500) {
        runtimeErrors.push(`http ${res.status()}: ${res.url()}`);
      }
    });

    await authenticateAsSuperUser(page);
    await page.click('.admin-tab-btn[data-admin-tab="orders"]');
    await expect(page.locator('.su-customer-form-grid')).toBeVisible();
    await expect(page.locator('.su-article-form-grid')).toBeVisible();

    for (const vp of [
      { width: 1440, height: 900 },
      { width: 768, height: 1024 },
      { width: 375, height: 812 }
    ]) {
      await page.setViewportSize(vp);

      const layoutReport = await page.evaluate(() => {
        const docOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;
        const results: Array<{
          gridSelector: string;
          clipped: boolean;
          overlapped: boolean;
          tooNarrow: boolean;
          boxes: Array<{ x: number; y: number; width: number; height: number }>;
        }> = [];

        for (const gridSelector of ['.su-customer-form-grid', '.su-article-form-grid']) {
          const grid = document.querySelector<HTMLElement>(gridSelector);
          if (!grid) throw new Error(`Missing grid ${gridSelector}`);
          const gridRect = grid.getBoundingClientRect();
          const controls = Array.from(grid.querySelectorAll<HTMLElement>('input, select, button'));
          const boxes = controls.map(el => {
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          });

          const clipped = boxes.some(b =>
            b.x < gridRect.x - 1 || b.x + b.width > gridRect.x + gridRect.width + 1
          );
          const tooNarrow = boxes.some(b => b.width < 60 || b.height < 30);

          let overlapped = false;
          for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
              const a = boxes[i];
              const b = boxes[j];
              const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
              const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
              if (overlapX > 1 && overlapY > 1) {
                overlapped = true;
              }
            }
          }

          results.push({ gridSelector, clipped, overlapped, tooNarrow, boxes });
        }

        return { docOverflow, results };
      });

      expect(layoutReport.docOverflow, `Horizontal overflow at ${vp.width}px`).toBe(false);
      for (const gridCheck of layoutReport.results) {
        expect(gridCheck.clipped, `${gridCheck.gridSelector} clipped at ${vp.width}px`).toBe(false);
        expect(gridCheck.overlapped, `${gridCheck.gridSelector} overlapped at ${vp.width}px`).toBe(false);
        expect(gridCheck.tooNarrow, `${gridCheck.gridSelector} too narrow at ${vp.width}px`).toBe(false);

        if (vp.width <= 375) {
          for (let i = 1; i < gridCheck.boxes.length; i++) {
            expect(gridCheck.boxes[i].y, `Mobile stack Y order in ${gridCheck.gridSelector}`).toBeGreaterThan(
              gridCheck.boxes[i - 1].y + 10
            );
          }
        }
      }
    }

    expect(runtimeErrors).toEqual([]);
  });

  test('Inward Register locks article & colour from order and requires Received From', async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', err => runtimeErrors.push(`pageerror: ${err.message}`));
    page.on('console', msg => {
      if (msg.type() === 'error') {
        runtimeErrors.push(`console.error: ${msg.text()}`);
      }
    });
    page.on('response', res => {
      if (res.status() >= 500) {
        runtimeErrors.push(`http ${res.status()}: ${res.url()}`);
      }
    });

    await authenticateAsSuperUser(page);
    await page.click('.admin-tab-btn[data-admin-tab="orders"]');

    const makerSelect = page.locator('#admin-pending-order-maker');
    const articleSelect = page.locator('#admin-pending-order-article');
    const makerOption = await makerSelect.locator('option').nth(1).getAttribute('value');
    const articleOption = await articleSelect.locator('option').nth(1).getAttribute('value');
    await makerSelect.selectOption(makerOption!);
    await articleSelect.selectOption(articleOption!);
    await page.fill('#admin-pending-order-po', 'PO-INWARD-LOCK');
    await page.fill('#admin-pending-order-color', 'Safety Orange');
    await page.fill('.admin-order-size-val[data-size="7"]', '60');
    await page.click('#btn-admin-add-pending-order');

    const createdDeleteBtn = page.locator('button[data-su-action="remove-pending-order"]').first();
    await expect(createdDeleteBtn).toBeVisible();
    const orderId = (await createdDeleteBtn.getAttribute('data-order-id'))!;

    // Jump to Inward Register via Quick Receive
    await page.click('.admin-tab-btn[data-admin-tab="tracking"]');
    await page.click(`button[data-su-action="quick-receive-grn"][data-order-id="${orderId}"]`);

    await expect(page.locator('#grn-article')).toHaveAttribute('readonly', '');
    await expect(page.locator('#grn-article')).toHaveValue(articleOption!);
    await expect(page.locator('#grn-color')).toHaveAttribute('readonly', '');
    await expect(page.locator('#grn-color')).toHaveValue('Safety Orange');

    // Clearing Received From blocks save and marks field invalid
    await page.fill('#grn-received-from', '');
    await page.fill('.grn-size-val[data-size="7"]', '30');
    await page.click('#btn-print-grn-slip');
    await expect(page.locator('#grn-received-from')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#global-modal.open')).toHaveCount(0);

    // Entering Received From succeeds and shows on GRN table & printable slip
    await page.fill('#grn-received-from', 'Imran Carrier');
    await page.click('#btn-print-grn-slip');
    await expect(page.locator('#global-modal.open')).toBeVisible();
    await expect(page.locator('#modal-body')).toContainText('Imran Carrier');
    await expect(page.locator('#modal-body')).toContainText('Safety Orange');
    await page.click('#modal-btn-close');

    // Clean up order via voiding the GRN first or return to admin
    await page.click('#btn-return-admin');
    expect(runtimeErrors).toEqual([]);
  });

  test('Multi-contractor order split and delivery countdown render across Super User and Inward Register', async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', err => runtimeErrors.push(`pageerror: ${err.message}`));
    page.on('console', msg => {
      if (msg.type() === 'error') {
        runtimeErrors.push(`console.error: ${msg.text()}`);
      }
    });
    page.on('response', res => {
      if (res.status() >= 500) {
        runtimeErrors.push(`http ${res.status()}: ${res.url()}`);
      }
    });

    await authenticateAsSuperUser(page);
    await page.click('.admin-tab-btn[data-admin-tab="orders"]');

    const articleSelect = page.locator('#admin-pending-order-article');
    const articleOption = await articleSelect.locator('option').nth(1).getAttribute('value');
    await articleSelect.selectOption(articleOption!);
    await page.fill('#admin-pending-order-po', 'PO-SPLIT-E2E');
    await page.fill('#admin-pending-order-color', 'Hi-Vis Green');

    const futureDate = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    await page.fill('#admin-pending-order-due-date', futureDate);
    await page.fill('.admin-order-size-val[data-size="7"]', '50');
    await page.fill('.admin-order-size-val[data-size="8"]', '50');
    await page.click('#btn-admin-toggle-split');

    await expect(page.locator('[data-testid="admin-contractor-split-panel"]')).toBeVisible();
    const maker1Select = page.locator('.admin-split-maker[data-split-index="0"]');
    const maker2Select = page.locator('.admin-split-maker[data-split-index="1"]');
    const m1Val = await maker1Select.inputValue();
    const m2Val = await maker2Select.inputValue();
    expect(m1Val).toBeTruthy();
    expect(m2Val).toBeTruthy();
    expect(m1Val).not.toBe(m2Val);

    // Split Size 7: 30/20, Size 8: 30/20 => 60 / 40
    await page.fill('.admin-split-size-val[data-split-index="0"][data-size="7"]', '30');
    await page.fill('.admin-split-size-val[data-split-index="0"][data-size="8"]', '30');
    await page.fill('.admin-split-size-val[data-split-index="1"][data-size="7"]', '20');
    await page.fill('.admin-split-size-val[data-split-index="1"][data-size="8"]', '20');
    await expect(page.locator('#admin-split-balance-bar')).toContainText('Split Matches Order 100%');

    await page.click('#btn-admin-add-pending-order');
    const createdDeleteBtn = page.locator('button[data-su-action="remove-pending-order"]').first();
    await expect(createdDeleteBtn).toBeVisible();
    const orderId = (await createdDeleteBtn.getAttribute('data-order-id'))!;

    // Verify Live Tracking displays countdown badge and split contractor chips
    await page.click('.admin-tab-btn[data-admin-tab="tracking"]');
    const orderCard = page.locator(`#tracking-order-card-${orderId}`);
    await expect(orderCard).toBeVisible();
    await expect(orderCard.locator('[data-testid="order-countdown-badge"]')).toContainText(/\d+d left/);
    await expect(orderCard.locator('[data-testid="order-contractor-splits"]')).toContainText(m1Val);
    await expect(orderCard.locator('[data-testid="order-contractor-splits"]')).toContainText(m2Val);

    // Jump to Inward Register & confirm contractor dropdown only lists the 2 split contractors and locks Article/Colour
    await page.click(`button[data-su-action="quick-receive-grn"][data-order-id="${orderId}"]`);
    await expect(page.locator('#grn-article')).toHaveAttribute('readonly', '');
    await expect(page.locator('#grn-color')).toHaveValue('Hi-Vis Green');
    await expect(page.locator('#grn-delivery-timeline')).toContainText(futureDate);
    const grnMakerOptions = await page.locator('#grn-maker option').allTextContents();
    expect(grnMakerOptions.some(t => t.includes(m1Val))).toBe(true);
    expect(grnMakerOptions.some(t => t.includes(m2Val))).toBe(true);
    expect(grnMakerOptions.length).toBe(3); // Choose prompt + 2 allocated contractors

    expect(runtimeErrors).toEqual([]);
  });

  test('User Management: centered confirmation popup with Admin password authorizes user deletion and blocks self-delete', async ({ page }) => {
    const runtimeErrors: string[] = [];
    let expectingExpected401 = false;
    page.on('pageerror', err => runtimeErrors.push(`pageerror: ${err.message}`));
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (expectingExpected401 && text.includes('status of 401')) {
          return;
        }
        runtimeErrors.push(`console.error: ${text}`);
      }
    });
    page.on('response', res => {
      if (res.status() >= 500) {
        runtimeErrors.push(`http ${res.status()}: ${res.url()}`);
      }
    });

    await authenticateAsSuperUser(page);
    await page.click('.admin-tab-btn[data-admin-tab="users"]');

    // Signed-in Super User's own Delete button is disabled (self-delete lock)
    const ownRow = page.locator('tr', { hasText: TEST_ADMIN.username });
    await expect(ownRow).toBeVisible();
    await expect(ownRow.locator('button[data-admin-delete-user]')).toBeDisabled();

    // Create a new user account to delete
    await page.fill('#admin-user-name', 'Delete Target Operator');
    await page.fill('#admin-user-username', 'delete.target.user');
    await page.fill('#admin-user-password', 'ValidPass123!');
    await page.selectOption('#admin-user-role', 'INWARD_CLERK');
    await page.click('#btn-admin-add-system-user');

    const targetRow = page.locator('tr', { hasText: 'delete.target.user' });
    await expect(targetRow).toBeVisible();
    const deleteBtn = targetRow.locator('button[data-admin-delete-user]');
    await expect(deleteBtn).toBeEnabled();

    // Zero horizontal overflow with Delete action column present
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

    // Click Delete -> opens centered confirmation popup requiring Admin password
    await deleteBtn.click();
    const modal = page.locator('#global-modal.open');
    await expect(modal).toBeVisible();
    const modalBox = await modal.locator('.modal-box').boundingBox();
    expect(modalBox).not.toBeNull();
    const modalCenterX = modalBox!.x + modalBox!.width / 2;
    const modalCenterY = modalBox!.y + modalBox!.height / 2;
    expect(Math.abs(modalCenterX - 720)).toBeLessThanOrEqual(20);
    expect(Math.abs(modalCenterY - 450)).toBeLessThanOrEqual(40);
    await expect(page.locator('#modal-body')).toContainText('delete.target.user');
    const adminPwInput = page.locator('#confirm-admin-password');
    await expect(adminPwInput).toBeVisible();
    await expect(adminPwInput).toBeFocused();

    // Blank Admin password shows inline validation error and keeps modal open
    await page.click('#confirm-dialog-confirm');
    await expect(adminPwInput).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#confirm-admin-password-error')).toContainText('Enter your Admin password');
    await expect(modal).toBeVisible();

    // Wrong Admin password keeps modal open and shows server error inline (expects 401 Unauthorized)
    await adminPwInput.fill('Wrong-Admin-Pass');
    expectingExpected401 = true;
    try {
      await Promise.all([
        page.waitForResponse(res => res.url().includes('/api/admin/users/') && res.request().method() === 'DELETE' && res.status() === 401),
        page.click('#confirm-dialog-confirm')
      ]);
      await expect(page.locator('#confirm-admin-password-error')).toHaveText('Incorrect Admin password. User was not deleted.');
    } finally {
      expectingExpected401 = false;
    }
    await expect(adminPwInput).toHaveAttribute('aria-invalid', 'true');
    await expect(modal).toBeVisible();
    await expect(targetRow).toBeVisible();

    // Correct Admin password deletes the user, closes popup, and removes row
    await adminPwInput.fill(TEST_ADMIN.password);
    await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/admin/users/') && res.request().method() === 'DELETE' && res.status() === 200),
      page.click('#confirm-dialog-confirm')
    ]);
    await expect(page.locator('#global-modal.open')).toHaveCount(0);
    await expect(page.locator('tr', { hasText: 'delete.target.user' })).toHaveCount(0);

    expect(runtimeErrors).toEqual([]);
  });
});
