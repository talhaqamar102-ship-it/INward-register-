import {
  calculateSizeTotal,
  validateContractorAllocations,
  computeDeliveryCountdown,
  AuditTrailEntry,
  PHASED_ROLLOUT_RECORD,
  DEFAULT_MES_POLICY_CONFIG,
  escapeHtml,
  CatalogProductOption,
  filterProductsByBuyer,
  getScaleSizeCodes,
  formatSizeColumnLabel
} from '../../utils/requisitionLogic';
import type { SuperUserRenderContext } from './types';
import { renderDeliveryCountdownChip } from './shared';

export function renderOrderCreationTab(ctx: SuperUserRenderContext): string {
  const ov = ctx.adminOverview;
  const counts = ov.dbHealth.tableCounts || {};
  const totalRows = Object.values(counts).reduce((sum: number, n: any) => sum + Number(n || 0), 0);
  const auditTrail: AuditTrailEntry[] = ctx.auditTrail || [];
  const draft = ctx.orderDraft || {
    customerId: '',
    buyer: '',
    maker: '',
    po: '',
    productId: '',
    article: '',
    color: '',
    sizeFormat: 'LEGACY_7_11',
    dueDate: '',
    sizes: { '7': 0, '8': 0, '9': 0, '10': 0, '11': 0 }
  };

  const allCustomers: any[] = ov.customers || [];
  const allProducts: CatalogProductOption[] = (ov.products || []).slice().sort((a, b) => {
    const aIsLegacy = String(a.size_format || 'LEGACY_7_11') === 'LEGACY_7_11' ? 0 : 1;
    const bIsLegacy = String(b.size_format || 'LEGACY_7_11') === 'LEGACY_7_11' ? 0 : 1;
    if (aIsLegacy !== bIsLegacy) return aIsLegacy - bIsLegacy;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
  const buyerMatchedCatalog = draft.buyer
    ? filterProductsByBuyer(allProducts, allCustomers, draft.customerId || draft.buyer)
    : allProducts;
  const legacyFallbackArticles = allProducts.filter(p => (p.size_format || 'LEGACY_7_11') === 'LEGACY_7_11');
  const usingFallbackArticles = Boolean(draft.buyer) && buyerMatchedCatalog.length === 0;
  const filteredCatalog = draft.buyer
    ? (buyerMatchedCatalog.length > 0 ? buyerMatchedCatalog : (legacyFallbackArticles.length > 0 ? legacyFallbackArticles : allProducts))
    : allProducts;
  const selectedProduct =
    filteredCatalog.find(p => draft.productId && p.id === draft.productId) ||
    filteredCatalog.find(p => draft.article && p.name === draft.article) ||
    allProducts.find(p => draft.productId && p.id === draft.productId);

  const availableStandards = Array.isArray(ov.sizeStandards) ? ov.sizeStandards : [];
  const defaultScaleCode = availableStandards.some((s: any) => s.code === 'ALPHA_2XS_5XL')
    ? 'ALPHA_2XS_5XL'
    : (availableStandards.some((s: any) => s.code === 'LEGACY_7_11')
      ? 'LEGACY_7_11'
      : (availableStandards[0]?.code || 'ALPHA_2XS_5XL'));
  const rawActiveFmt = String(draft.sizeFormat && draft.sizeFormat !== 'LEGACY_7_11'
    ? draft.sizeFormat
    : (selectedProduct?.size_format || draft.sizeFormat || defaultScaleCode)).trim() || defaultScaleCode;
  const activeSizeFormat = availableStandards.length > 0 && !availableStandards.some((s: any) => s.code === rawActiveFmt)
    ? defaultScaleCode
    : rawActiveFmt;
  const activeSizeCodes = getScaleSizeCodes(ov.sizeStandards, activeSizeFormat);
  const draftTotal = calculateSizeTotal(draft.sizes);
  const splitRows = ctx.orderSplitRows || [];
  const splitActive = splitRows.length > 0;
  const splitValidation = splitActive
    ? validateContractorAllocations(draft.sizes, splitRows, activeSizeCodes)
    : null;
  const catalogColorSpec = selectedProduct ? String(selectedProduct.color_spec || selectedProduct.raw_color || '').trim() : '';

  const articleLines = ctx.orderArticleLines || [];
  const multiMode = articleLines.length > 0;
  const pickerOpen = Boolean(ctx.multiArticlePickerOpen);
  const multiSearch = String(ctx.multiArticleSearch || '').trim().toLowerCase();
  const multiGrandTotal = articleLines.reduce((sum, line) => sum + calculateSizeTotal(line.sizes), 0);

  return `
    <!-- 7.1: Super User Master Order Creation Suite (Primary View) -->
    <section class="panel-card" style="margin-bottom: 14px;">
      <div class="panel-card-header">
        <div class="panel-card-title">
          <span>1. Super User Master Order Creation &amp; Pending Orders Hub (SQLite Persistent)</span>
          <span class="panel-counter-badge">${ctx.pendingOrders.length} Database Orders</span>
        </div>
        <span class="admin-meta-caption">Parent Order Container &mdash; Receives Multiple GRNs (0001, 0002...) &amp; Multiple REQs (0001, 0002... &rarr; M &amp; A)</span>
      </div>
      <div style="padding: 14px 16px;">
        <div class="su-order-form-grid">
          <div class="form-group">
            <label for="admin-pending-order-id">Order Reference (system assigned)</label>
            <input type="text" id="admin-pending-order-id" class="form-input" placeholder="Assigned on save" readonly aria-readonly="true" />
            <small>${
              articleLines.length >= 2
                ? `Creates ${articleLines.length} linked sub-orders (ORD-YYYY-NNN-1 .. -${articleLines.length}) on save.`
                : 'Assigned by the server after save; this reference cannot be changed.'
            }</small>
          </div>

          <div class="form-group">
            <label for="admin-pending-order-buyer">Buyer / Customer</label>
            <select id="admin-pending-order-buyer" class="form-select">
              <option value="">-- Choose Buyer (${allCustomers.length || ctx.dropdownOptions.customers.length}) --</option>
              ${(allCustomers.length
                ? allCustomers.map(
                    (c: any) => `<option value="${escapeHtml(c.name)}" data-customer-id="${escapeHtml(c.id)}" ${draft.buyer === c.name ? 'selected' : ''}>${escapeHtml(c.name)}${c.country ? ` (${escapeHtml(c.country)})` : ''}</option>`
                  )
                : ctx.dropdownOptions.customers.map(c => `<option value="${escapeHtml(c)}" ${draft.buyer === c ? 'selected' : ''}>${escapeHtml(c)}</option>`)
              ).join('')}
            </select>
          </div>

          <div class="form-group">
            <label for="admin-pending-order-maker">${multiMode ? 'Default Contractor / Maker' : (splitActive ? 'Primary Contractor' : 'Contractor / Maker')} <span class="su-required-mark" aria-hidden="true">*</span></label>
            <select id="admin-pending-order-maker" class="form-select" required aria-required="true" ${!multiMode && splitActive ? 'disabled title="Contractors are assigned in the Split Allocation table below."' : ''}>
              <option value="">-- Choose Contractor --</option>
              ${ctx.dropdownOptions.makers.map(m => `<option value="${escapeHtml(m)}" ${draft.maker === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label for="admin-pending-order-po">PO Number</label>
            <input type="text" id="admin-pending-order-po" class="form-input" placeholder="e.g. 27351" list="admin-po-preset-list" value="${escapeHtml(draft.po)}" />
            <datalist id="admin-po-preset-list">
              ${ctx.dropdownOptions.poList.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('')}
            </datalist>
          </div>

          ${
            multiMode
              ? ''
              : `
          <div class="form-group">
            <label for="admin-pending-order-article">Article <span class="su-required-mark" aria-hidden="true">*</span></label>
            <select id="admin-pending-order-article" class="form-select" required aria-required="true">
              <option value="">${
                draft.buyer
                  ? (usingFallbackArticles
                      ? `-- Choose Generic Article (${filteredCatalog.length} available; 0 buyer-specific SKUs) --`
                      : `-- Choose Article (${filteredCatalog.length} for ${escapeHtml(draft.buyer)}) --`)
                  : '-- Choose Buyer First (or pick Article) --'
              }</option>
              ${allProducts.length
                ? filteredCatalog
                    .map(p => {
                      const codeBadge = p.article_code ? `${p.article_code} — ` : '';
                      const label = draft.buyer ? `${codeBadge}${p.name}` : `${codeBadge}${p.name} [${p.customer_name || p.customer_id}]`;
                      const isSel = selectedProduct ? selectedProduct.id === p.id : draft.article === p.name;
                      return `<option value="${escapeHtml(p.name)}" data-product-id="${escapeHtml(p.id)}" data-customer-id="${escapeHtml(p.customer_id)}" data-customer-name="${escapeHtml(p.customer_name || '')}" data-size-format="${escapeHtml(p.size_format || 'LEGACY_7_11')}" data-color-spec="${escapeHtml(p.color_spec || p.raw_color || '')}" ${isSel ? 'selected' : ''}>${escapeHtml(label)}</option>`;
                    })
                    .join('')
                : ctx.dropdownOptions.articles.map(a => `<option value="${escapeHtml(a)}" ${draft.article === a ? 'selected' : ''}>${escapeHtml(a)}</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label for="admin-pending-order-color">Colour / Shade</label>
            <input type="text" id="admin-pending-order-color" class="form-input" placeholder="Auto-filled from article (or enter custom)" value="${escapeHtml(draft.color)}" />
            ${catalogColorSpec ? `<small>Catalog colorway: ${escapeHtml(catalogColorSpec)}</small>` : ''}
          </div>
          `
          }

          <div class="form-group">
            <label for="admin-pending-order-due-date">Delivery Due Date</label>
            <input type="date" id="admin-pending-order-due-date" class="form-input" value="${escapeHtml(draft.dueDate)}" />
          </div>
        </div>

        <div class="su-multi-art-bar" data-testid="admin-multi-article-bar">
          <div class="su-multi-art-caption">
            <strong>Multi-article order${draft.buyer ? ` (${escapeHtml(draft.buyer)})` : ''}:</strong>
            select 2+ articles on one PO to generate linked sub-orders (<code>-1</code>, <code>-2</code>, <code>-3</code>).
          </div>
          <button type="button" class="btn-outline" id="btn-admin-toggle-multi-articles" style="padding: 5px 12px; font-size: 12px;">
            ${
              pickerOpen
                ? 'Hide article picker'
                : (multiMode
                    ? `Add / change articles (${articleLines.length} selected)`
                    : `Select multiple articles (${filteredCatalog.length})`)
            }
          </button>
        </div>

        ${
          pickerOpen
            ? `
          <div class="su-multi-art-picker" data-testid="admin-multi-article-picker">
            <div class="su-multi-art-toolbar">
              <label for="admin-multi-art-search" class="sr-only">Filter buyer articles</label>
              <input type="text" id="admin-multi-art-search" class="form-input su-multi-art-search" placeholder="Filter articles by code or name..." value="${escapeHtml(ctx.multiArticleSearch || '')}" />
              <span class="admin-meta-caption">${articleLines.length} selected &bull; ${filteredCatalog.length} in list</span>
            </div>
            <div class="su-multi-art-grid">
              ${(allProducts.length
                ? filteredCatalog
                : ctx.dropdownOptions.articles.map(a => ({ id: '', name: a, article_code: '', size_format: 'LEGACY_7_11', color_spec: '', raw_color: '', customer_id: '', customer_name: '' }))
              ).map(p => {
                const isSelected = articleLines.some(line =>
                  p.id ? line.productId === p.id : line.article === p.name
                );
                const codeBadge = p.article_code ? `${p.article_code} — ` : '';
                const fmt = String(p.size_format || 'LEGACY_7_11');
                const clr = String(p.color_spec || p.raw_color || '').trim();
                const searchKey = `${p.article_code || ''} ${p.name} ${p.customer_name || ''} ${fmt} ${clr}`.toLowerCase();
                const hiddenAttr = multiSearch && !searchKey.includes(multiSearch) ? ' hidden' : '';
                return `
                  <label class="su-multi-art-item${isSelected ? ' is-selected' : ''}" data-search="${escapeHtml(searchKey)}"${hiddenAttr}>
                    <input type="checkbox" class="admin-multi-art-check"
                      data-product-id="${escapeHtml(p.id || '')}"
                      data-article-name="${escapeHtml(p.name)}"
                      data-size-format="${escapeHtml(fmt)}"
                      data-color-spec="${escapeHtml(clr)}"
                      ${isSelected ? 'checked' : ''} />
                    <span class="su-multi-art-text">
                      <span class="su-multi-art-name">${escapeHtml(codeBadge + p.name)}</span>
                      <span class="su-multi-art-meta">${escapeHtml(fmt)}${clr ? ` &middot; ${escapeHtml(clr)}` : ''}${!draft.buyer && p.customer_name ? ` &middot; ${escapeHtml(p.customer_name)}` : ''}</span>
                    </span>
                  </label>`;
              }).join('')}
            </div>
          </div>`
            : ''
        }

        ${
          multiMode
            ? `
          <div class="su-suborder-list" data-testid="admin-suborder-list">
            ${articleLines.map((line, idx) => {
              const lineFmt = String(line.sizeFormat || 'LEGACY_7_11').trim() || 'LEGACY_7_11';
              const lineCodes = getScaleSizeCodes(ov.sizeStandards, lineFmt);
              const lineTotal = calculateSizeTotal(line.sizes);
              const lineSplitActive = line.splitRows.length > 0;
              const lineSplitCheck = lineSplitActive
                ? validateContractorAllocations(line.sizes, line.splitRows, lineCodes)
                : null;
              return `
              <div class="su-suborder-card" data-line-index="${idx}" data-testid="admin-suborder-card-${idx}">
                <div class="su-suborder-head">
                  <div class="su-suborder-title">
                    <span class="su-suborder-badge">${articleLines.length >= 2 ? `Sub-order -${idx + 1}` : 'Article 1'}</span>
                    <span class="su-suborder-name">${escapeHtml(line.article)}</span>
                    <span class="panel-counter-badge">${escapeHtml(lineFmt)} &middot; ${lineCodes.length} sizes</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <button type="button" class="btn-outline admin-line-toggle-split" data-line-index="${idx}" style="padding: 4px 10px; font-size: 11.5px;">
                      ${lineSplitActive ? 'Use Single Contractor' : '+ Split Across Contractors'}
                    </button>
                    <button type="button" class="btn-outline" data-su-action="remove-article-line" data-line-index="${idx}" style="padding: 4px 10px; font-size: 11.5px;">
                      Remove
                    </button>
                  </div>
                </div>

                <div class="su-suborder-meta">
                  <div class="form-group">
                    <label for="admin-line-maker-${idx}">Contractor / Maker <span class="su-required-mark" aria-hidden="true">*</span></label>
                    <select id="admin-line-maker-${idx}" class="form-select admin-line-maker" data-line-index="${idx}" ${lineSplitActive ? 'disabled title="Contractors assigned in split rows below"' : ''}>
                      <option value="">-- Choose Contractor --</option>
                      ${ctx.dropdownOptions.makers.map(m => `<option value="${escapeHtml(m)}" ${line.maker === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
                    </select>
                  </div>
                  <div class="form-group">
                    <label for="admin-line-color-${idx}">Colour / Shade</label>
                    <input type="text" id="admin-line-color-${idx}" class="form-input admin-line-color" data-line-index="${idx}" placeholder="Colorway" value="${escapeHtml(line.color)}" />
                  </div>
                  <div class="form-group">
                    <label for="admin-line-due-date-${idx}">Delivery Due Date</label>
                    <input type="date" id="admin-line-due-date-${idx}" class="form-input admin-line-due-date" data-line-index="${idx}" value="${escapeHtml(line.dueDate)}" />
                  </div>
                </div>

                <div class="table-responsive">
                  <table class="size-matrix-table" style="margin: 0;">
                    <thead>
                      <tr>
                        ${lineCodes.map(sz => `<th>${escapeHtml(formatSizeColumnLabel(sz, lineFmt))}</th>`).join('')}
                        <th style="background: var(--ink-200); color: var(--ink-950);">Total Pairs</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        ${lineCodes
                          .map(sz => `<td><input type="number" aria-label="Sub-order ${idx + 1} Size ${escapeHtml(formatSizeColumnLabel(sz, lineFmt))}" class="size-matrix-input admin-line-size-val" data-line-index="${idx}" data-size="${escapeHtml(sz)}" min="0" placeholder="0" value="${line.sizes?.[sz] || ''}" /></td>`)
                          .join('')}
                        <td style="font-weight: 800; font-size: 13.5px; color: var(--ink-950); text-align: center;" id="admin-line-total-${idx}">${lineTotal}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                ${
                  lineSplitActive
                    ? `
                  <div class="su-split-panel">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 6px;">
                      <span style="font-weight: 700; color: var(--ink-950); font-size: 11.5px; text-transform: uppercase;">
                        Contractor Share Split (Must Match Sub-order Sizes)
                      </span>
                      <button type="button" class="btn-outline admin-line-add-split-row" data-line-index="${idx}" style="padding: 3px 10px; font-size: 11.5px;">
                        + Add Contractor Row
                      </button>
                    </div>
                    <div class="table-responsive">
                      <table class="size-matrix-table" style="margin: 0;">
                        <thead>
                          <tr>
                            <th style="min-width: 150px;">Contractor</th>
                            ${lineCodes.map(sz => `<th>${escapeHtml(formatSizeColumnLabel(sz, lineFmt))}</th>`).join('')}
                            <th>Total</th>
                            <th>Due Date</th>
                            <th>Remove</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${line.splitRows.map((sRow, sIdx) => {
                            const sRowTotal = calculateSizeTotal(sRow.sizes);
                            return `
                            <tr>
                              <td>
                                <select class="form-select admin-line-split-maker" data-line-index="${idx}" data-split-index="${sIdx}" style="font-size: 12px;">
                                  <option value="">-- Choose Contractor --</option>
                                  ${ctx.dropdownOptions.makers.map(m => `<option value="${escapeHtml(m)}" ${sRow.maker === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
                                </select>
                              </td>
                              ${lineCodes
                                .map(sz => `<td><input type="number" class="size-matrix-input admin-line-split-size-val" data-line-index="${idx}" data-split-index="${sIdx}" data-size="${escapeHtml(sz)}" min="0" placeholder="0" value="${sRow.sizes?.[sz] || ''}" /></td>`)
                                .join('')}
                              <td class="text-center font-bold" id="admin-line-split-total-${idx}-${sIdx}">${sRowTotal.toLocaleString()}</td>
                              <td><input type="date" class="form-input admin-line-split-due-date" data-line-index="${idx}" data-split-index="${sIdx}" value="${escapeHtml(sRow.dueDate || '')}" style="font-size: 11.5px;" /></td>
                              <td class="text-center">
                                ${line.splitRows.length > 2 ? `<button type="button" class="btn-outline admin-line-remove-split-row" data-line-index="${idx}" data-split-index="${sIdx}" style="padding: 2px 8px; font-size: 11px;">&times;</button>` : '<span style="color: var(--ink-500); font-size: 11px;">Min 2</span>'}
                              </td>
                            </tr>`;
                          }).join('')}
                        </tbody>
                      </table>
                    </div>
                    <div id="admin-line-split-balance-${idx}" class="su-split-balance-bar ${lineSplitCheck?.valid ? 'is-balanced' : 'is-unbalanced'}">
                      <span>
                        Unassigned Balance:
                        ${lineCodes.map(sz => `<strong>${escapeHtml(sz)}:${lineSplitCheck?.unassignedBySize[sz] ?? 0}</strong>`).join(' | ')}
                        (<strong>${lineSplitCheck?.totalUnassigned ?? 0}</strong> Prs remaining)
                      </span>
                      <strong>${lineSplitCheck?.valid ? 'Split Matches Sub-order 100% ✓' : escapeHtml(lineSplitCheck?.error || 'Adjust contractor quantities to match sub-order totals')}</strong>
                    </div>
                  </div>`
                    : ''
                }
              </div>`;
            }).join('')}
          </div>`
            : `
        <div class="su-order-matrix-card">
          <div class="su-order-matrix-header">
            <span style="font-weight: 700; color: var(--ink-950); font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em;">
              Planned Order Size Breakdown Matrix (Pairs &bull; Scale: ${escapeHtml(activeSizeFormat)}, ${activeSizeCodes.length} Sizes)
            </span>
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              ${availableStandards.length > 0 ? `
                <label for="admin-order-size-format" style="font-size: 11.5px; font-weight: 600; color: var(--ink-700);">Size Scale:</label>
                <select id="admin-order-size-format" class="form-select" style="width: auto; min-width: 165px; padding: 4px 8px; font-size: 12px;">
                  ${availableStandards.map((s: any) => `<option value="${escapeHtml(s.code)}" ${activeSizeFormat === s.code ? 'selected' : ''}>${escapeHtml(s.rawLabel || s.code)}</option>`).join('')}
                </select>
              ` : ''}
              <button type="button" class="btn-outline" id="btn-admin-toggle-split" style="padding: 4px 10px; font-size: 11.5px;">
                ${splitActive ? 'Use Single Contractor' : '+ Split Across Contractors'}
              </button>
            </div>
          </div>
          <div class="table-responsive">
            <table class="size-matrix-table" style="margin: 0;">
              <thead>
                <tr>
                  ${activeSizeCodes.map(sz => `<th>${escapeHtml(formatSizeColumnLabel(sz, activeSizeFormat))}</th>`).join('')}
                  <th style="background: var(--ink-200); color: var(--ink-950);">Total Pairs</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  ${activeSizeCodes
                    .map(sz => `<td><input type="number" aria-label="Order Size ${escapeHtml(formatSizeColumnLabel(sz, activeSizeFormat))}" class="size-matrix-input admin-order-size-val" data-size="${escapeHtml(sz)}" min="0" placeholder="0" value="${draft.sizes?.[sz] || ''}" /></td>`)
                    .join('')}
                  <td style="font-weight: 800; font-size: 13.5px; color: var(--ink-950); text-align: center;" id="admin-order-size-total">${draftTotal}</td>
                </tr>
              </tbody>
            </table>
          </div>
          ${
            splitActive
              ? `
            <div class="su-split-panel" data-testid="admin-contractor-split-panel">
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 6px;">
                <span style="font-weight: 700; color: var(--ink-950); font-size: 11.5px; text-transform: uppercase;">
                  Contractor Share Split (Must Match Order Sizes)
                </span>
                <button type="button" class="btn-outline" id="btn-admin-add-split-row" style="padding: 3px 10px; font-size: 11.5px;">
                  + Add Contractor Row
                </button>
              </div>
              <div class="table-responsive">
                <table class="size-matrix-table" style="margin: 0;">
                  <thead>
                    <tr>
                      <th style="min-width: 150px;">Contractor</th>
                      ${activeSizeCodes.map(sz => `<th>${escapeHtml(formatSizeColumnLabel(sz, activeSizeFormat))}</th>`).join('')}
                      <th>Total</th>
                      <th>Due Date</th>
                      <th>Remove</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${splitRows.map((row, idx) => {
                      const rowTotal = calculateSizeTotal(row.sizes);
                      return `
                      <tr class="su-split-row" data-split-index="${idx}">
                        <td>
                          <select class="form-select admin-split-maker" data-split-index="${idx}" aria-label="Split Contractor ${idx + 1}" style="font-size: 12px;">
                            <option value="">-- Choose Contractor --</option>
                            ${ctx.dropdownOptions.makers.map(m => `<option value="${escapeHtml(m)}" ${row.maker === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
                          </select>
                        </td>
                        ${activeSizeCodes
                          .map(sz => `<td><input type="number" class="size-matrix-input admin-split-size-val" data-split-index="${idx}" data-size="${escapeHtml(sz)}" min="0" placeholder="0" aria-label="Contractor ${idx + 1} Size ${escapeHtml(sz)}" value="${row.sizes?.[sz] || ''}" /></td>`)
                          .join('')}
                        <td class="text-center font-bold" id="admin-split-row-total-${idx}">${rowTotal.toLocaleString()}</td>
                        <td><input type="date" class="form-input admin-split-due-date" data-split-index="${idx}" aria-label="Contractor ${idx + 1} Due Date" value="${escapeHtml(row.dueDate || '')}" style="font-size: 11.5px;" /></td>
                        <td class="text-center">
                          ${splitRows.length > 2 ? `<button type="button" class="btn-outline" data-su-action="remove-split-row" data-split-index="${idx}" style="padding: 2px 8px; font-size: 11px;">&times;</button>` : '<span style="color: var(--ink-500); font-size: 11px;">Min 2</span>'}
                        </td>
                      </tr>`;
                    }).join('')}
                  </tbody>
                </table>
              </div>
              <div id="admin-split-balance-bar" class="su-split-balance-bar ${splitValidation?.valid ? 'is-balanced' : 'is-unbalanced'}">
                <span>
                  Unassigned Balance:
                  ${activeSizeCodes.map(sz => `<strong>${escapeHtml(sz)}:${splitValidation?.unassignedBySize[sz] ?? 0}</strong>`).join(' | ')}
                  (<strong>${splitValidation?.totalUnassigned ?? 0}</strong> Prs remaining)
                </span>
                <strong>${splitValidation?.valid ? 'Split Matches Order 100% ✓' : escapeHtml(splitValidation?.error || 'Adjust contractor quantities to match order totals')}</strong>
              </div>
            </div>
          `
              : ''
          }
        </div>`
        }

        <div class="su-order-action-row">
          <span style="font-size: 12px; color: var(--su-text-secondary);">
            <span class="su-required-mark" aria-hidden="true">*</span> Required fields &bull;
            Orders are saved directly to SQLite (<code>pending_orders</code>) and populate the Inward Receiving dropdown for multiple GRN batches and Packing Hall REQs.
          </span>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            ${multiMode ? `<span id="admin-multi-total-summary" class="su-multi-total-pill">${articleLines.length} ${articleLines.length === 1 ? 'Article' : 'Sub-orders'} &middot; ${multiGrandTotal.toLocaleString()} Pairs</span>` : ''}
            <button type="button" class="btn-outline" id="btn-admin-reset-pending-order">
              Reset Form
            </button>
            <button type="button" class="btn-primary" id="btn-admin-add-pending-order" style="padding: 7px 18px;">
              ${articleLines.length >= 2 ? `Save &amp; Issue ${articleLines.length} Sub-Orders` : 'Save &amp; Issue Master Order'}
            </button>
          </div>
        </div>

        <div class="table-responsive" style="max-height: 260px; overflow-y: auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Buyer</th>
                <th>Contractor / Maker</th>
                <th>PO #</th>
                <th>Article</th>
                <th>Colour</th>
                <th class="text-center">7/S</th>
                <th class="text-center">8/M</th>
                <th class="text-center">9/L</th>
                <th class="text-center">10/XL</th>
                <th class="text-center">11/XXL</th>
                <th class="text-right">Planned Pairs</th>
                <th class="text-center">Delivery</th>
                <th class="text-center">GRNs / REQs</th>
                <th class="text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              ${
                ctx.pendingOrders.length === 0
                  ? `
                <tr><td colspan="15" class="table-empty-cell">No orders in database yet. Fill out the form above and click "Save &amp; Issue Master Order".</td></tr>
              `
                  : ctx.pendingOrders
                      .map(o => {
                        const rollup = ctx.rollupSummary.orderRollups.find(
                          r => r.orderId === o.orderId
                        );
                        const rowCountdown = rollup?.deliveryCountdown || computeDeliveryCountdown({
                          dueDate: o.dueDate,
                          createdAt: o.createdAt,
                          isCompleted: o.shortClosed
                        });
                        return `
                  <tr>
                    <td class="font-bold">${escapeHtml(o.orderId)}</td>
                    <td>${escapeHtml(o.buyer || '---')}</td>
                    <td>${escapeHtml(o.maker)}</td>
                    <td class="font-bold">${escapeHtml(o.po || '---')}</td>
                    <td class="font-bold">${escapeHtml(o.article)}</td>
                    <td>${escapeHtml(o.color || 'Standard')}</td>
                    ${
                      (o.sizeFormat || 'LEGACY_7_11') === 'LEGACY_7_11'
                        ? `
                    <td class="text-center">${o.sizes?.['7'] ?? '-'}</td>
                    <td class="text-center">${o.sizes?.['8'] ?? '-'}</td>
                    <td class="text-center">${o.sizes?.['9'] ?? '-'}</td>
                    <td class="text-center">${o.sizes?.['10'] ?? '-'}</td>
                    <td class="text-center">${o.sizes?.['11'] ?? '-'}</td>
                        `
                        : `
                    <td colspan="5" class="text-center" style="font-size: 11px;">
                      <span class="status-pill">${escapeHtml(o.sizeFormat || '')}</span>
                      ${(o.sizeCodes || Object.keys(o.sizes || {}))
                        .filter(sz => Number(o.sizes?.[sz] || 0) > 0)
                        .map(sz => `${escapeHtml(sz)}:${Number(o.sizes?.[sz] || 0)}`)
                        .join(' &middot; ') || '0'}
                    </td>
                        `
                    }
                    <td class="text-right font-bold">${(o.totalQty || calculateSizeTotal(o.sizes || {}) || 0).toLocaleString()}</td>
                    <td class="text-center">${renderDeliveryCountdownChip(rowCountdown, false)}</td>
                    <td class="text-center" style="font-size: 11px;">
                      ${rollup ? `${rollup.grnBatches.length} GRNs &middot; ${rollup.reqBatches.length} REQs` : '0 GRNs &middot; 0 REQs'}
                    </td>
                    <td class="text-center" style="white-space: nowrap;">
                      <button type="button" class="table-btn" data-su-action="inspect-order" data-order-id="${escapeHtml(o.orderId)}">Track</button>
                      <button type="button" class="table-btn" title="Remove Order" data-su-action="remove-pending-order" data-order-id="${escapeHtml(o.orderId)}">Delete</button>
                    </td>
                  </tr>
                `;
                      })
                      .join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- 7.2: Collapsible Master Registries (Buyers, Articles, Contractors/Makers, Audit Trail, SQLite WAL, Phased Rollout) -->
    ${(() => {
      const isRegOpen = (key: string, defaultOpen = false): boolean =>
        ctx.openRegistryIds && key in ctx.openRegistryIds
          ? Boolean(ctx.openRegistryIds[key])
          : defaultOpen;
      return `
    <div class="su-registries-toolbar">
      <div class="su-registries-toolbar-title">
        <span>Master Registries &amp; System Administration (Sections 2&ndash;6)</span>
        <span class="admin-meta-caption">Click any card header to expand full-width or collapse</span>
      </div>
      <div class="su-registries-toolbar-actions">
        <button type="button" class="btn-outline" style="padding: 4px 10px; font-size: 11.5px;" data-su-action="toggle-all-registries" data-expanded="true">Expand All Registries</button>
        <button type="button" class="btn-outline" style="padding: 4px 10px; font-size: 11.5px;" data-su-action="toggle-all-registries" data-expanded="false">Collapse All Registries</button>
      </div>
    </div>

    <div class="su-registries-grid">
      <!-- Collapsible Registry 2: Customer & Buyer Master -->
      <details class="su-collapsible-registry" data-registry-id="buyers" ${isRegOpen('buyers', true) ? 'open' : ''}>
        <summary>
          <span class="su-registry-summary-main">
            <span class="su-registry-step-badge">02</span>
            <span class="su-registry-title-text">2. Customer &amp; Buyer Master Registry (${ov.customers.length} Buyers)</span>
          </span>
          <span class="su-registry-summary-meta">
            <span class="admin-meta-caption">AQL Inspection Rules</span>
            <span class="su-registry-toggle-pill" aria-hidden="true">
              <span class="su-toggle-when-closed">Expand &#9662;</span>
              <span class="su-toggle-when-open">Collapse &#9652;</span>
            </span>
          </span>
        </summary>
        <div class="su-collapsible-body">
          <div class="su-customer-form-grid">
            <div class="form-group">
              <label for="admin-cust-name">Customer Name</label>
              <input type="text" id="admin-cust-name" class="form-input" placeholder="e.g. Alpine Tactical" />
            </div>
            <div class="form-group">
              <label for="admin-cust-country">Destination Country</label>
              <input type="text" id="admin-cust-country" class="form-input" placeholder="e.g. Germany" value="United Kingdom" />
            </div>
            <div class="form-group">
              <label for="admin-cust-pref">QC Inspection Protocol</label>
              <select id="admin-cust-pref" class="form-select">
                <option value="RANDOM">RANDOM (AQL 1.5)</option>
                <option value="THOROUGH">THOROUGH (100%)</option>
              </select>
            </div>
            <button type="button" class="btn-primary" id="btn-admin-save-customer">Save Buyer</button>
          </div>
          <div class="table-responsive" style="max-height: 190px; overflow-y: auto;">
            <table class="data-table">
              <thead>
                <tr><th>Customer ID</th><th>Customer Name</th><th>Country</th><th class="text-center">QC Protocol</th></tr>
              </thead>
              <tbody>
                ${ov.customers
                  .map(
                    (c: any) => `
                  <tr>
                    <td class="font-bold">${escapeHtml(c.id)}</td>
                    <td>${escapeHtml(c.name)}</td>
                    <td>${escapeHtml(c.country || '---')}</td>
                    <td class="text-center"><span class="status-pill">${escapeHtml(c.inspection_preference)}</span></td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <!-- Collapsible Registry 3: Glove Product / Article Master -->
      <details class="su-collapsible-registry" data-registry-id="articles" ${isRegOpen('articles', true) ? 'open' : ''}>
        <summary>
          <span class="su-registry-summary-main">
            <span class="su-registry-step-badge">03</span>
            <span class="su-registry-title-text">3. Glove Article &amp; Packaging BOM Master (${ov.products.length} Articles)</span>
          </span>
          <span class="su-registry-summary-meta">
            <span class="admin-meta-caption">Per-Pair Accessory Ratios</span>
            <span class="su-registry-toggle-pill" aria-hidden="true">
              <span class="su-toggle-when-closed">Expand &#9662;</span>
              <span class="su-toggle-when-open">Collapse &#9652;</span>
            </span>
          </span>
        </summary>
        <div class="su-collapsible-body">
          <div class="su-article-form-grid">
            <div class="form-group">
              <label for="admin-prod-name">Article Name</label>
              <input type="text" id="admin-prod-name" class="form-input" placeholder="e.g. Stealth Pro V2" />
            </div>
            <div class="form-group">
              <label for="admin-prod-cust">Buyer</label>
              <select id="admin-prod-cust" class="form-select">
                ${ov.customers.map((c: any) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="admin-prod-size-format">Size Scale</label>
              <select id="admin-prod-size-format" class="form-select">
                ${availableStandards.length > 0
                  ? availableStandards.map((s: any) => `<option value="${escapeHtml(s.code)}" ${s.code === 'ALPHA_2XS_5XL' ? 'selected' : ''}>${escapeHtml(s.rawLabel || s.code)}</option>`).join('')
                  : '<option value="ALPHA_2XS_5XL">2XS - 5XL (Alpha)</option><option value="NUMERIC_6_12">6 - 12 (Numeric)</option>'}
              </select>
            </div>
            <div class="form-group">
              <label for="admin-prod-stickers">Stickers/Pr</label>
              <input type="number" id="admin-prod-stickers" class="form-input" value="2" min="1" />
            </div>
            <div class="form-group">
              <label for="admin-prod-carton">Pairs/Ctn</label>
              <input type="number" id="admin-prod-carton" class="form-input" value="50" min="1" />
            </div>
            <button type="button" class="btn-primary" id="btn-admin-save-product">Save Article</button>
          </div>
          <div class="table-responsive" style="max-height: 190px; overflow-y: auto;">
            <table class="data-table">
              <thead>
                <tr><th>Product ID</th><th>Article</th><th>Buyer</th><th>Size Scale</th><th class="text-right">Polybag</th><th class="text-right">Silica</th><th class="text-right">Stickers</th><th class="text-right">Prs/Ctn</th></tr>
              </thead>
              <tbody>
                ${(() => {
                  const filteredProducts = draft.customerId || draft.buyer
                    ? filterProductsByBuyer(ov.products, allCustomers, draft.customerId || draft.buyer)
                    : ov.products;
                  const MAX_ARTICLE_ROWS = 80;
                  const visibleProducts = filteredProducts.slice(0, MAX_ARTICLE_ROWS);
                  const rowsHtml = visibleProducts
                    .map(
                      (p: any) => `
                  <tr>
                    <td class="font-bold">${escapeHtml(p.id)}</td>
                    <td class="font-bold">${escapeHtml(p.name)}</td>
                    <td>${escapeHtml(p.customer_name || p.customer_id)}</td>
                    <td><span class="status-pill">${escapeHtml(p.size_format || 'ALPHA_2XS_5XL')}</span></td>
                    <td class="text-right">${p.polybag_per_pair}</td>
                    <td class="text-right">${p.silica_gel_per_pair}</td>
                    <td class="text-right">${p.stickers_per_pair}</td>
                    <td class="text-right font-bold">${p.pairs_per_carton}</td>
                  </tr>
                `
                    )
                    .join('');
                  const moreNotice = filteredProducts.length > MAX_ARTICLE_ROWS
                    ? `<tr><td colspan="8" class="text-center" style="font-size: 11px; color: var(--su-text-muted); padding: 8px;">Showing first ${MAX_ARTICLE_ROWS} of ${filteredProducts.length} catalog articles${draft.buyer ? ` for ${escapeHtml(draft.buyer)}` : ' — select a Buyer in Section 1 to view its full SKU list'}.</td></tr>`
                    : '';
                  return rowsHtml + moreNotice;
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <!-- Collapsible Registry 4: Contractors / Makers, Halls & Stitchers & PO Dropdowns -->
      <details class="su-collapsible-registry" data-registry-id="makers_pos" ${isRegOpen('makers_pos', false) ? 'open' : ''}>
        <summary>
          <span class="su-registry-summary-main">
            <span class="su-registry-step-badge">04</span>
            <span class="su-registry-title-text">4. Contractors / Makers (${ctx.dropdownOptions.makers.length}), Halls (${(ctx.dropdownOptions.halls || []).length}) &amp; PO Registry (${ctx.dropdownOptions.poList.length})</span>
          </span>
          <span class="su-registry-summary-meta">
            <span class="admin-meta-caption">Synchronized across Dock &amp; Alteration Bay</span>
            <span class="su-registry-toggle-pill" aria-hidden="true">
              <span class="su-toggle-when-closed">Expand &#9662;</span>
              <span class="su-toggle-when-open">Collapse &#9652;</span>
            </span>
          </span>
        </summary>
        <div class="su-collapsible-body">
          <div style="margin-bottom: 12px;">
            <div style="font-size: 11.5px; font-weight: 700; color: var(--ink-600); margin-bottom: 6px; text-transform: uppercase;">Active Makers / Contractors (${ctx.dropdownOptions.makers.length})</div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <input type="text" id="admin-add-maker-input" class="form-input" style="flex: 1;" placeholder="Add Maker / Contractor (e.g. Usman Hall)" />
              <button class="btn-primary" id="btn-admin-add-maker">Add Maker</button>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${ctx.dropdownOptions.makers
                .map(
                  m => `
                <span class="admin-tag-item">
                  <span>${escapeHtml(m)}</span>
                  <button type="button" class="admin-tag-remove" title="Remove" data-su-action="remove-dropdown-item" data-list-key="makers" data-item-val="${escapeHtml(m)}">&times;</button>
                </span>
              `
                )
                .join('')}
            </div>
          </div>
          ${(() => {
            const halls = Array.isArray(ctx.dropdownOptions.halls) ? ctx.dropdownOptions.halls : [];
            return `
          <div class="su-halls-section" data-testid="su-halls-registry">
            <div class="su-halls-head">
              <span class="su-halls-title">Halls &amp; Assigned Stitchers (${halls.length})</span>
              <span class="su-halls-sub">Chain-linked to Inward Dock #1 receiving &amp; Alteration Bay tailors</span>
            </div>
            <div class="su-hall-add-row">
              <input type="text" id="admin-add-hall-input" class="form-input" placeholder="Add Hall name (e.g. Hall C (Export))" aria-label="Add Hall name" />
              <button type="button" class="btn-primary" id="btn-admin-add-hall">Add Hall</button>
            </div>
            <div class="su-hall-grid">
              ${
                halls.length === 0
                  ? `<div class="su-hall-empty">No halls configured yet. Add a Hall above and assign its Stitchers.</div>`
                  : halls
                      .map(
                        h => `
                <div class="su-hall-card" data-hall-id="${h.id}" data-hall-name="${escapeHtml(h.name)}">
                  <div class="su-hall-card-head">
                    <div class="su-hall-card-title">
                      <span class="su-hall-card-name">${escapeHtml(h.name)}</span>
                      <span class="su-hall-card-count">${h.stitchers.length} stitcher${h.stitchers.length === 1 ? '' : 's'}</span>
                    </div>
                    <button
                      type="button"
                      class="btn-outline btn-xs su-hall-delete-btn"
                      data-su-action="delete-hall"
                      data-hall-id="${h.id}"
                      data-hall-name="${escapeHtml(h.name)}"
                      data-stitcher-count="${h.stitchers.length}"
                      title="Remove ${escapeHtml(h.name)}"
                      aria-label="Remove hall ${escapeHtml(h.name)}"
                    >Remove</button>
                  </div>
                  <div class="su-hall-tags">
                    ${
                      h.stitchers.length === 0
                        ? `<span class="su-hall-empty">No stitchers assigned yet.</span>`
                        : h.stitchers
                            .map(
                              s => `
                      <span class="admin-tag-item" data-stitcher-id="${s.id}">
                        <span>${escapeHtml(s.name)}</span>
                        <button
                          type="button"
                          class="admin-tag-remove"
                          title="Remove ${escapeHtml(s.name)}"
                          aria-label="Remove stitcher ${escapeHtml(s.name)} from ${escapeHtml(h.name)}"
                          data-su-action="delete-stitcher"
                          data-stitcher-id="${s.id}"
                          data-stitcher-name="${escapeHtml(s.name)}"
                          data-hall-name="${escapeHtml(h.name)}"
                        >&times;</button>
                      </span>
                    `
                            )
                            .join('')
                    }
                  </div>
                  <div class="su-hall-stitcher-add">
                    <input
                      type="text"
                      class="form-input"
                      data-hall-stitcher-input="${h.id}"
                      placeholder="Add stitcher to ${escapeHtml(h.name)}"
                      aria-label="Add stitcher to ${escapeHtml(h.name)}"
                    />
                    <button
                      type="button"
                      class="btn-outline btn-xs"
                      data-su-action="add-stitcher"
                      data-hall-id="${h.id}"
                    >Add Stitcher</button>
                  </div>
                </div>
              `
                      )
                      .join('')
              }
            </div>
          </div>`;
          })()}
          <div style="margin-top: 14px;">
            <div style="font-size: 11.5px; font-weight: 700; color: var(--ink-600); margin-bottom: 6px; text-transform: uppercase;">Active Purchase Order Numbers (${ctx.dropdownOptions.poList.length})</div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <input type="text" id="admin-add-po-input" class="form-input" style="flex: 1;" placeholder="Add PO Number (e.g. 27401)" />
              <button class="btn-primary" id="btn-admin-add-po">Add PO #</button>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${ctx.dropdownOptions.poList
                .map(
                  po => `
                <span class="admin-tag-item">
                  <span>PO #${escapeHtml(po)}</span>
                  <button type="button" class="admin-tag-remove" title="Remove" data-su-action="remove-dropdown-item" data-list-key="poList" data-item-val="${escapeHtml(po)}">&times;</button>
                </span>
              `
                )
                .join('')}
            </div>
          </div>
        </div>
      </details>

      <!-- Collapsible Registry 5: Immutable Audit Trail -->
      <details class="su-collapsible-registry" data-registry-id="audit_trail" ${isRegOpen('audit_trail', false) ? 'open' : ''}>
        <summary>
          <span class="su-registry-summary-main">
            <span class="su-registry-step-badge">05</span>
            <span class="su-registry-title-text">5. Immutable Audit Trail Ledger (${auditTrail.length} Recorded Events)</span>
          </span>
          <span class="su-registry-summary-meta">
            <span class="admin-meta-caption">Actor &bull; Timestamp &bull; Before &rarr; After</span>
            <span class="su-registry-toggle-pill" aria-hidden="true">
              <span class="su-toggle-when-closed">Expand &#9662;</span>
              <span class="su-toggle-when-open">Collapse &#9652;</span>
            </span>
          </span>
        </summary>
        <div class="su-collapsible-body">
          <div class="table-responsive" style="max-height: 190px; overflow-y: auto;">
            <table class="data-table">
              <thead>
                <tr><th>Audit ID</th><th>Timestamp</th><th>Actor / Role</th><th>Action</th><th>Entity</th><th>Before &rarr; After</th></tr>
              </thead>
              <tbody>
                ${
                  auditTrail.length === 0
                    ? `<tr><td colspan="6" class="text-center" style="padding: 16px; color: var(--su-text-muted);">Audit trail records every Order creation, GRN receipt, Dock issue, QC gate approval, and Void operation.</td></tr>`
                    : auditTrail
                        .slice()
                        .reverse()
                        .map(
                          a => `
                  <tr>
                    <td class="font-bold" style="font-family: var(--font-mono);">${escapeHtml(a.auditId)}</td>
                    <td style="font-family: var(--font-mono); font-size: 11px;">${escapeHtml(a.timestamp)}</td>
                    <td><strong>${escapeHtml(a.actor)}</strong> <span style="font-size: 11px; color: var(--su-text-secondary);">(${escapeHtml(a.role)})</span></td>
                    <td><span class="su-badge su-badge-req">${escapeHtml(a.action)}</span></td>
                    <td class="font-bold">${escapeHtml(a.entityId)}</td>
                    <td style="font-size: 11px;">${escapeHtml(a.beforeSummary)} &rarr; <strong>${escapeHtml(a.afterSummary)}</strong></td>
                  </tr>
                `
                        )
                        .join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <!-- Collapsible Registry 6: SQLite WAL Database & Snapshot Administration -->
      <details class="su-collapsible-registry" data-registry-id="sqlite_wal" ${isRegOpen('sqlite_wal', false) ? 'open' : ''}>
        <summary>
          <span class="su-registry-summary-main">
            <span class="su-registry-step-badge">06</span>
            <span class="su-registry-title-text">6. SQLite WAL Database &amp; Snapshot Administration (${ov.dbHealth.totalTables} Tables &bull; ${totalRows} Rows)</span>
          </span>
          <span class="su-registry-summary-meta">
            <span class="admin-meta-caption">Engine: ${escapeHtml(String(ov.dbHealth.journalMode).toUpperCase())}</span>
            <span class="su-registry-toggle-pill" aria-hidden="true">
              <span class="su-toggle-when-closed">Expand &#9662;</span>
              <span class="su-toggle-when-open">Collapse &#9652;</span>
            </span>
          </span>
        </summary>
        <div class="su-collapsible-body">
          <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;">
            <button class="btn-primary" id="btn-admin-trigger-backup" style="padding: 7px 12px; font-size: 12px;">
              Execute Online VACUUM Backup
            </button>
            <button class="btn-outline" id="btn-admin-reseed-db" style="padding: 7px 12px; font-size: 12px;">
              Verify &amp; Re-Seed Master Data
            </button>
            <button class="btn-outline" id="btn-admin-export-json" style="padding: 7px 12px; font-size: 12px;">
              Export State (JSON)
            </button>
          </div>
          ${
            ctx.lastBackupPath
              ? `
            <div style="margin-bottom: 10px; padding: 8px 10px; background: var(--ink-50); border: 1px solid var(--border-strong); border-radius: 4px; font-size: 11.5px;">
              <strong>Latest Snapshot:</strong> <code>${escapeHtml(ctx.lastBackupPath)}</code>
            </div>
          `
              : ''
          }
          <div class="table-responsive" style="max-height: 140px; overflow-y: auto;">
            <table class="data-table">
              <thead>
                <tr><th>SQLite Table</th><th class="text-right">Row Count</th><th class="text-center">Integrity</th></tr>
              </thead>
              <tbody>
                ${Object.keys(counts)
                  .map(
                    tbl => `
                  <tr>
                    <td style="font-family: var(--font-mono); font-size: 11.5px; font-weight: 700;">${escapeHtml(tbl)}</td>
                    <td class="text-right font-bold">${counts[tbl]}</td>
                    <td class="text-center"><span class="status-pill">OK</span></td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <!-- Phased Rollout Record & Active MES Policy Configuration -->
      <details class="su-collapsible-registry" data-registry-id="phased_rollout" ${isRegOpen('phased_rollout', false) ? 'open' : ''}>
        <summary>
          <span class="su-registry-summary-main">
            <span class="su-registry-step-badge">POLICY</span>
            <span class="su-registry-title-text">Phased Rollout Record (Phase A &bull; Phase B &bull; Phase C) &amp; Active MES Policy Defaults</span>
          </span>
          <span class="su-registry-summary-meta">
            <span class="admin-meta-caption">R1 / 3.8 / 4.6 / 4.7 Policies</span>
            <span class="su-registry-toggle-pill" aria-hidden="true">
              <span class="su-toggle-when-closed">Expand &#9662;</span>
              <span class="su-toggle-when-open">Collapse &#9652;</span>
            </span>
          </span>
        </summary>
      <div class="su-collapsible-body">
        <div class="table-responsive" style="margin-bottom: 10px;">
          <table class="data-table">
            <thead>
              <tr><th>Phase</th><th>Milestone Title</th><th>Scope &amp; Deliverables</th><th class="text-center">Status</th></tr>
            </thead>
            <tbody>
              ${PHASED_ROLLOUT_RECORD.map(
                p => `
                <tr>
                  <td class="font-bold" style="font-family: var(--font-mono);">${p.phase}</td>
                  <td class="font-bold">${p.title}</td>
                  <td style="font-size: 11px;">${p.scope.join(' &bull; ')}</td>
                  <td class="text-center"><span class="su-badge su-badge-reconciled">${p.status} &#10003;</span></td>
                </tr>
              `
              ).join('')}
            </tbody>
          </table>
        </div>
        <div style="font-size: 11px; color: var(--su-text-secondary); font-family: var(--font-mono);">
          Active Policy Defaults: SizeSet=<strong>${DEFAULT_MES_POLICY_CONFIG.sizeScaleMode}</strong> &bull;
          OverReceiptTol=<strong>+${DEFAULT_MES_POLICY_CONFIG.overReceiptTolerancePct}%</strong> &bull;
          AQL=<strong>${DEFAULT_MES_POLICY_CONFIG.aqlInspectorRole} / ${DEFAULT_MES_POLICY_CONFIG.aqlInspectionGranularity} / ${DEFAULT_MES_POLICY_CONFIG.aqlFailurePath}</strong> &bull;
          AlterationMode=<strong>${DEFAULT_MES_POLICY_CONFIG.alterationWorkflowMode}</strong>
        </div>
      </div>
    </details>
    </div>
      `;
    })()}
  `;
}
