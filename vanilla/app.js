/**
 * Meridian Works - Factory ERP & QA Management Portal
 * Standalone Vanilla JavaScript (ES6) - Clean Inspection Mode
 */

const state = {
  activeScreen: 'screen-grn',
  grnList: [],
  rawGloveReqs: [],
  materialReqs: [],
  inventoryItems: [],
  inventorySearch: '',
  inventoryCategoryFilter: 'all',
  defectList: [],
  cartons: [],

  qcChecklist: [
    { id: 'chk-1', title: 'Visual Appearance & Cleanliness', details: 'Check 80 samples for visual defects', passed: false },
    { id: 'chk-2', title: 'Dimension & Sizing Tolerances', details: 'Tolerance check according to spec sheet', passed: false },
    { id: 'chk-3', title: 'Barcode EAN-13 Scannability Test', details: 'Direct scan confirmation of 80 master cartons', passed: false },
    { id: 'chk-4', title: 'Polybag Sealing & Silica Sachet', details: 'Verification of moisture barrier packaging', passed: false },
    { id: 'chk-5', title: 'Master Carton 5-Drop Impact Test', details: 'ISTA drop standard compliance verification', passed: false }
  ],

  grnForm: { maker: '', customer: '', po: '', article: '', orderQty: '', rcvdPairs: '', balance: '' },
  repairForm: { batchId: '', article: '', po: '', defectType: '', tailor: '', qty: '' },
  qcOrder: { buyer: '', po: '', article: '', orderTotal: '', lotCartons: '0', lotPairs: '0', netWt: '0.0', grossWt: '0.0', inspectorName: 'Unassigned', qcId: '---', container: '---' },

  dropdownOptions: {
    makers: [
      'Hall A',
      'Maker B',
      'Maker D',
      'Farooq Workshop',
      'Maker C',
      'Hall B',
      'Maker A',
      'Tariq Stitching Unit'
    ],
    customers: [
      'Umbrella Workwear GmbH',
      'Ansell Protective',
      'Northwind',
      'Northwind Safety Ltd',
      'Northwind Safety Gear UK',
      'Sierra',
      'Globex',
      'Globex 1',
      'Stark Protective Ltd'
    ],
    articles: [
      'Arctic Thermo Grip Waterproof',
      'Model A4',
      'Model A9',
      'Model A9 Stealth Black',
      'Model A11',
      'Model A5',
      'Model A8',
      'Model A7',
      'Delta Heavy Grip',
      'Pro Cut-5 Heavy Duty',
      'Model A13',
      'Model A12',
      'Model A3',
      'Model A6',
      'Premium Cowhide Driver Glove',
      'Model A14',
      'Model A1',
      'Sierra',
      'Model A15',
      'Model A2'
    ],
    poList: ['1292', '2326', '2726', '3326', '27344', '27345', '27346', '27347', '27348', '27349', '27350', '27351', '27352', '27353', '27354', '27355', '27356'],
    defectBatchIds: ['ALT-2026-0089', 'ALT-2026-0090', 'ALT-2026-0091', 'DEF-1082', 'DEF-1083', 'DEF-1084', 'DEF-1085', 'DEF-1079', 'ALT-1', 'ALT-2', 'ALT-3', 'ALT-4']
  }
};

const SAMPLE_DATA = {
  grnList: [
    { sr: 1, date: '31-10-2026', maker: 'Hall B', customer: 'Northwind', po: '27347', article: 'Model A9', orderQty: 3090, rcvdPairs: 942, balance: 2148, status: 'Partial' },
    { sr: 2, date: '31-10-2026', maker: 'Hall A', customer: 'Globex', po: '27348', article: 'Model A1', orderQty: 2500, rcvdPairs: 2500, balance: 0, status: 'Received' },
    { sr: 3, date: '30-10-2026', maker: 'Maker A', customer: 'Northwind', po: '27349', article: 'Ottawa', orderQty: 1800, rcvdPairs: 800, balance: 1000, status: 'Partial' }
  ],
  rawGloveReqs: [
    { id: 'REQ-2026-0042', customer: 'Northwind', po: 'PO 27347', article: 'Model A9', requested: '942 Pairs', available: '942 Pairs', status: 'Pending' }
  ],
  materialReqs: [
    { id: 'MREQ-2026-0018', linked: 'For REQ-2026-0042', items: '910 Sets (Polybags, Hangtags, Silica)', status: 'Ready' }
  ],
  inventoryItems: [
    { code: 'GLV-RAW-BRISBANE', desc: 'Model A9 Stealth Stitched Pairs', category: 'Stitched Gloves', currentStock: '2,148 Pairs', reserved: '942 Pairs', availStock: '1,206 Pairs', binLocation: 'Bin A-12', reorderLevel: '500', status: 'In Stock' },
    { code: 'GLV-RAW-Model A1', desc: 'Model A1 Stitched Gloves', category: 'Stitched Gloves', currentStock: '4,284 Pairs', reserved: '2,500 Pairs', availStock: '1,784 Pairs', binLocation: 'Bin A-08', reorderLevel: '800', status: 'In Stock' }
  ],
  defectList: [
    { id: 'DEF-1082', date: '31-10-2026', origin: 'Stage 1 (Checking)', article: 'Model A9', po: '27347', defectClass: 'Stitching Skip (Thumb)', qty: '12 Prs', tailor: 'Supervisor A', status: 'In Rework', route: 'Auto-Return to Stage 1 Checking', actionText: 'Update' }
  ],
  cartons: [
    { cartonNo: 'CTN-01', pairs: 28, netWt: '34.4 kg', grossWt: '148.8 kg', dims: '29 x 23 x 28', barcodeVerified: true, sealNo: 'FSKD-4401', status: 'Cleared' }
  ]
};

const LOGO_SVG = `
<svg class="brand-logo-svg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="46" stroke="#93c5fd" stroke-width="4" stroke-dasharray="14 6" />
  <circle cx="50" cy="50" r="38" stroke="#ffffff" stroke-width="2" />
  <path d="M42 66V44L52 50V40L62 46V66H42Z" fill="#ffffff" />
  <path d="M46 36H48V42H46V36ZM56 32H58V40H56V32ZM36 50H38V66H36V50Z" fill="#93c5fd" />
  <rect x="34" y="66" width="32" height="4" fill="#ffffff" rx="1" />
  <circle cx="50" cy="50" r="5" fill="#0a2540" />
</svg>
`;

function showToast(message) {
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
  setTimeout(() => { toast.remove(); }, 3200);
}

function openModal(title, htmlContent) {
  const modal = document.getElementById('global-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  if (modal && modalTitle && modalBody) {
    modalTitle.textContent = title;
    modalBody.innerHTML = htmlContent;
    modal.classList.add('open');
  }
}

function closeModal() {
  const modal = document.getElementById('global-modal');
  if (modal) modal.classList.remove('open');
}

function renderModuleSwitcher() {
  const hasData = state.grnList.length > 0 || state.inventoryItems.length > 0;
  return `
    <div class="module-switcher-bar">
      <div class="module-switcher-left">
        <button class="module-nav-btn ${state.activeScreen === 'screen-grn' ? 'active' : ''}" data-screen="screen-grn">
          <span>Inward Goods Register (Dock #1)</span>
        </button>
        <button class="module-nav-btn ${state.activeScreen === 'screen-store' ? 'active' : ''}" data-screen="screen-store">
          <span>Requisition & Stock Hub</span>
        </button>
        <button class="module-nav-btn ${state.activeScreen === 'screen-repair' ? 'active' : ''}" data-screen="screen-repair">
          <span>Alteration & Repair Bay #2</span>
        </button>
        <button class="module-nav-btn ${state.activeScreen === 'screen-qc' ? 'active' : ''}" data-screen="screen-qc">
          <span>Final QC & Carton Clearance</span>
        </button>
      </div>
      <div class="module-switcher-right">
        ${hasData ? `
          <button class="btn-outline" style="padding: 3px 8px; font-size: 11px; background: transparent; color: #f87171; border-color: #ef4444;" id="btn-clear-all-data">
            Clear to Blank
          </button>
        ` : `
          <button class="btn-outline" style="padding: 3px 8px; font-size: 11px; background: transparent; color: #93c5fd; border-color: #3b82f6;" id="btn-load-sample-data">
            Load Sample Template Data
          </button>
        `}
      </div>
    </div>
  `;
}

function renderScreenGRN() {
  const sumRcvd = state.grnList.reduce((acc, row) => acc + row.rcvdPairs, 0);
  const sumBalance = state.grnList.reduce((acc, row) => acc + row.balance, 0);

  return `
    <header class="portal-header">
      <div class="header-brand">
        ${LOGO_SVG}
        <div class="brand-text">
          <span class="brand-title">MERIDIAN WORKS</span>
        </div>
      </div>
      <div class="header-center-info">
        Materials Management (MM) – Inward Goods Receiving / Store Register
      </div>
      <div class="header-actions">
        <div style="font-size: 13px; font-weight: 600; color: #f1f5f9;">
          System Date <span style="margin-left: 6px;">31-10-2026</span>
        </div>
        <div class="sub-header-badge badge-dock-1" style="font-size: 13px; padding: 4px 14px;">
          Dock #1
        </div>
      </div>
    </header>

    <main class="main-viewport">
      <section class="form-card">
        <div class="form-row">
          <div class="form-group" style="flex: 1.5;">
            <label>Maker / Contractor</label>
            <select id="grn-maker" class="form-select">
              <option value="">-- Select Maker / Contractor --</option>
              ${state.dropdownOptions.makers.map(m => `<option value="${m}" ${state.grnForm.maker === m ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="flex: 1;">
            <label>Customer</label>
            <select id="grn-customer" class="form-select">
              <option value="">-- Select Customer --</option>
              ${state.dropdownOptions.customers.map(c => `<option value="${c}" ${state.grnForm.customer === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="flex: 1;">
            <label>PO Number</label>
            <select id="grn-po" class="form-select">
              <option value="">-- Select PO Number --</option>
              ${state.dropdownOptions.poList.map(p => `<option value="${p}" ${state.grnForm.po === p ? 'selected' : ''}>PO ${p}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="flex: 1.2;">
            <label>Article</label>
            <select id="grn-article" class="form-select">
              <option value="">-- Select Article --</option>
              ${state.dropdownOptions.articles.map(a => `<option value="${a}" ${state.grnForm.article === a ? 'selected' : ''}>${a}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="flex: 0.9;">
            <label>Order Qty</label>
            <input type="number" id="grn-order-qty" class="form-input" placeholder="0" value="${state.grnForm.orderQty}" />
          </div>
          <div class="form-group" style="flex: 0.9;">
            <label>Rcvd Pairs</label>
            <input type="number" id="grn-rcvd-pairs" class="form-input" placeholder="0" value="${state.grnForm.rcvdPairs}" />
          </div>
          <div class="form-group" style="flex: 0.9;">
            <label>Balance</label>
            <input type="number" id="grn-balance" class="form-input" placeholder="0" value="${state.grnForm.balance}" readonly />
          </div>
        </div>

        <div class="form-action-row" style="justify-content: flex-end;">
          <div class="form-actions-right">
            <button class="btn-primary" id="btn-post-grn">Post Goods Receipt (GRN)</button>
            <button class="btn-outline" id="btn-print-grn-slip">Print Receiving Slip</button>
            <button class="btn-outline" id="btn-clear-grn">Clear</button>
          </div>
        </div>
      </section>

      <section class="panel-card">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 50px;">SR #</th>
                <th>Date</th>
                <th>Maker / Contractor</th>
                <th>Customer</th>
                <th>PO Number</th>
                <th>Article</th>
                <th class="text-right">Order Qty</th>
                <th class="text-right">Rcvd Pairs</th>
                <th class="text-right">Balance</th>
                <th class="text-center">Status</th>
                <th class="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${state.grnList.length === 0 ? `
                <tr>
                  <td colspan="11" class="text-center" style="padding: 32px 16px; color: #64748b; font-size: 13px;">
                    No records found in Store Register. Enter details above and click <strong>Post Goods Receipt (GRN)</strong>.
                  </td>
                </tr>
              ` : state.grnList.map(row => `
                <tr>
                  <td class="text-center font-bold">${row.sr}</td>
                  <td>${row.date}</td>
                  <td>${row.maker}</td>
                  <td>${row.customer}</td>
                  <td>${row.po}</td>
                  <td>${row.article}</td>
                  <td class="text-right font-bold">${row.orderQty.toLocaleString()}</td>
                  <td class="text-right font-bold">${row.rcvdPairs.toLocaleString()}</td>
                  <td class="text-right font-bold">${row.balance.toLocaleString()}</td>
                  <td class="text-center">
                    <span class="status-pill ${row.status === 'Partial' ? 'status-pill-amber' : 'status-pill-neutral'}">
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

      <footer class="portal-footer">
        <div class="footer-stats-left">
          <span>Total Records: <strong>${state.grnList.length}</strong></span>
          <span class="stat-divider">|</span>
          <span>Sum Received: <strong>${sumRcvd.toLocaleString()} Pairs</strong></span>
          <span class="stat-divider">|</span>
          <span>Balance: <strong>${sumBalance.toLocaleString()} Pairs</strong></span>
        </div>
        <div class="footer-actions-right">
          <button class="btn-outline" id="btn-export-grn-excel">Excel export</button>
          <button class="btn-outline" id="btn-print-grn-summary">Print</button>
        </div>
      </footer>
    </main>
  `;
}

function renderScreenStore() {
  const filteredInventory = state.inventoryItems.filter(item => {
    const matchesSearch = state.inventorySearch === '' || 
      item.code.toLowerCase().includes(state.inventorySearch.toLowerCase()) ||
      item.desc.toLowerCase().includes(state.inventorySearch.toLowerCase()) ||
      item.binLocation.toLowerCase().includes(state.inventorySearch.toLowerCase());
    const matchesCategory = state.inventoryCategoryFilter === 'all' || item.category === state.inventoryCategoryFilter;
    return matchesSearch && matchesCategory;
  });

  return `
    <header class="portal-header">
      <div class="header-brand">
        ${LOGO_SVG}
        <div class="brand-text">
          <span class="brand-title">MERIDIAN</span>
          <span class="brand-subtitle">INDUSTRIES</span>
        </div>
      </div>
      <div class="header-actions">
        <div class="header-notification">
          <span>Notification</span>
          <div class="notification-bell-wrap">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
            <span class="notif-badge">${state.rawGloveReqs.length}</span>
          </div>
        </div>
        <div class="header-avatar">T</div>
      </div>
    </header>

    <div class="sub-header-bar">
      <div class="sub-header-title">
        Warehouse & Materials Management – Requisition Issuance & Stock Hub
      </div>
      <div class="sub-header-right">
        <span class="system-date-label">31-10-2026</span>
        <span style="color: #cbd5e1;">|</span>
        <span class="sub-header-badge badge-central-store">
          Central Store & Accessories Warehouse
        </span>
      </div>
    </div>

    <main class="main-viewport">
      <div class="two-column-grid">
        <section class="panel-card">
          <div class="panel-card-header">
            <span class="panel-card-title">Pending Raw Glove Requisitions (Packing Line Draw)</span>
            <span class="panel-counter-badge">${state.rawGloveReqs.length} Pending</span>
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Requisition ID</th>
                  <th>Customer</th>
                  <th>PO#</th>
                  <th>Article</th>
                  <th>Requested</th>
                  <th>Available</th>
                  <th class="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                ${state.rawGloveReqs.length === 0 ? `
                  <tr>
                    <td colspan="7" class="text-center" style="padding: 24px 16px; color: #64748b;">
                      No pending raw glove requisitions on the floor.
                    </td>
                  </tr>
                ` : state.rawGloveReqs.map(req => `
                  <tr>
                    <td class="font-bold">${req.id}</td>
                    <td>${req.customer}</td>
                    <td>${req.po}</td>
                    <td>${req.article}</td>
                    <td class="font-bold">${req.requested}</td>
                    <td class="font-bold">${req.available}</td>
                    <td class="text-center">
                      <button class="btn-primary" style="padding: 4px 10px; font-size: 11px;" onclick="window.approveGloveReq('${req.id}')">
                        Approve & Issue to Floor
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </section>

        <section class="panel-card">
          <div class="panel-card-header">
            <span class="panel-card-title">Pending Material Requisitions (1st Packing Accessories)</span>
            <span class="panel-counter-badge">${state.materialReqs.length} Pending</span>
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Requisition ID</th>
                  <th>Linked Glove Req</th>
                  <th>Items & Sets</th>
                  <th class="text-center">Status</th>
                  <th class="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                ${state.materialReqs.length === 0 ? `
                  <tr>
                    <td colspan="5" class="text-center" style="padding: 24px 16px; color: #64748b;">
                      No material requisitions currently pending.
                    </td>
                  </tr>
                ` : state.materialReqs.map(mreq => `
                  <tr>
                    <td class="font-bold">${mreq.id}</td>
                    <td>${mreq.linked}</td>
                    <td>${mreq.items}</td>
                    <td class="text-center">
                      <span class="status-pill ${mreq.status === 'Ready' ? 'status-pill-green' : 'status-pill-amber'}">
                        ${mreq.status}
                      </span>
                    </td>
                    <td class="text-center">
                      <button class="btn-success" style="padding: 4px 10px; font-size: 11px;" onclick="window.issueMaterialReq('${mreq.id}')">
                        Issue Accessories & Print Slip
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section class="panel-card">
        <div class="panel-card-header">
          <span class="panel-card-title">Live Store Inventory Master Grid</span>
          <div class="filter-toolbar">
            <span class="quick-filter-label">Quick Filter</span>
            <div class="search-input-wrap">
              <svg class="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input type="text" id="inventory-search-input" placeholder="Search by SKU, Bin..." value="${state.inventorySearch}" />
            </div>
            <select id="inventory-category-select" class="form-select" style="padding: 4px 8px; font-size: 12px;">
              <option value="all">All Categories</option>
              <option value="Stitched Gloves">Stitched Gloves</option>
              <option value="Packaging Accessory">Packaging Accessory</option>
              <option value="Brand Trims">Brand Trims</option>
              <option value="Packaging Materials">Packaging Materials</option>
            </select>
            <button class="btn-icon" id="btn-refresh-inventory" title="Refresh Table">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
            </button>
          </div>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Item Code</th>
                <th>Description</th>
                <th>Category</th>
                <th class="text-right">Current Stock</th>
                <th class="text-right">Reserved (WIP)</th>
                <th class="text-right">Available Stock</th>
                <th>Bin Location</th>
                <th class="text-right">Reorder Level</th>
                <th class="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              ${filteredInventory.length === 0 ? `
                <tr>
                  <td colspan="9" class="text-center" style="padding: 28px 16px; color: #64748b;">
                    No inventory records found.
                  </td>
                </tr>
              ` : filteredInventory.map(item => `
                <tr>
                  <td class="font-bold">${item.code}</td>
                  <td>${item.desc}</td>
                  <td>${item.category}</td>
                  <td class="text-right font-bold">${item.currentStock}</td>
                  <td class="text-right">${item.reserved}</td>
                  <td class="text-right font-bold">${item.availStock}</td>
                  <td>${item.binLocation}</td>
                  <td class="text-right font-bold">${item.reorderLevel}</td>
                  <td class="text-center">
                    <span class="status-pill status-pill-green">${item.status}</span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>

      <footer class="portal-footer">
        <div class="footer-stats-left">
          <span>Total Active SKUs: <strong>${state.inventoryItems.length}</strong></span>
          <span class="stat-divider">|</span>
          <span>Stock Value: <strong>PKR ${state.inventoryItems.length > 0 ? '18.4M' : '0.00'}</strong></span>
          <span class="stat-divider">|</span>
          <span>Pending Requisitions: <strong>${state.rawGloveReqs.length + state.materialReqs.length}</strong></span>
          <span class="stat-divider">|</span>
          <span>Low Stock Alerts: <strong>0</strong></span>
        </div>
        <div class="footer-actions-right">
          <button class="btn-outline" id="btn-export-stock-ledger">[Export Stock Ledger to Excel]</button>
          <button class="btn-outline" id="btn-print-issue-vouchers">[Print Material Issue Vouchers]</button>
          <button class="btn-dark" id="btn-stock-audit">[Physical Stock Audit]</button>
        </div>
      </footer>
    </main>
  `;
}

function renderScreenRepair() {
  return `
    <header class="portal-header">
      <div class="header-brand">
        ${LOGO_SVG}
        <div class="brand-text">
          <span class="brand-title">MERIDIAN WORKS</span>
          <span class="brand-subtitle">Quality Assurance – Alteration & Repair Bay Operations</span>
        </div>
      </div>
      <div class="header-actions">
        <div class="system-date-label" style="color: #ffffff; font-size: 13px;">31-10-2026</div>
        <span class="sub-header-badge badge-alteration-bay">
          Alteration Bay #2 (Repair & Rework Line)
        </span>
      </div>
    </header>

    <main class="main-viewport">
      <div class="alert-banner">
        <span class="alert-banner-icon">⚠️</span>
        <span>FACTORY MANDATORY RULE: Every Repaired Pair Is Auto-Routed Back to STAGE 1 (Checking & Inspection). Skipping Stages Is System-Locked.</span>
      </div>

      <section class="form-card">
        <div class="form-row">
          <div class="form-group" style="flex: 1.1;">
            <label>Defect Batch ID</label>
            <select id="defect-batch-id" class="form-select">
              <option value="">-- Select Defect Batch ID --</option>
              ${state.dropdownOptions.defectBatchIds.map(b => `<option value="${b}" ${state.repairForm.batchId === b ? 'selected' : ''}>${b}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="flex: 1.5;">
            <label>Article</label>
            <select id="defect-article" class="form-select">
              <option value="">-- Select Article --</option>
              ${state.dropdownOptions.articles.map(a => `<option value="${a}" ${state.repairForm.article === a ? 'selected' : ''}>${a}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="flex: 1;">
            <label>PO Number</label>
            <select id="defect-po" class="form-select">
              <option value="">-- Select PO Number --</option>
              ${state.dropdownOptions.poList.map(p => `<option value="${p}" ${state.repairForm.po === p ? 'selected' : ''}>${p}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="flex: 1.6;">
            <label>Defect Type</label>
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
            <label>Assigned Tailor</label>
            <input type="text" id="defect-tailor" class="form-input" placeholder="e.g. Supervisor A" value="${state.repairForm.tailor}" />
          </div>
          <div class="form-group" style="flex: 0.9;">
            <label>Qty in Batch</label>
            <input type="text" id="defect-qty" class="form-input" placeholder="e.g. 22 Pairs" value="${state.repairForm.qty}" />
          </div>
        </div>

        <div class="form-action-row">
          <div class="form-actions-left">
            <button class="btn-primary" id="btn-complete-repair">[Complete Repair & Dispatch to Stage 1 Checking]</button>
          </div>
          <div class="form-actions-right">
            <button class="btn-outline" id="btn-log-scrap">[Log as Scrap / Unrepairable]</button>
            <button class="btn-outline" id="btn-print-defect-tag">[Print Defect Route Tag]</button>
          </div>
        </div>
      </section>

      <section class="panel-card">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Defect ID</th>
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
                  <td colspan="11" class="text-center" style="padding: 30px 16px; color: #64748b;">
                    No defect rework tickets currently active in Bay #2.
                  </td>
                </tr>
              ` : state.defectList.map(defect => {
                let badgeClass = 'status-pill-amber';
                if (defect.status === 'Completed') badgeClass = 'status-pill-green';
                if (defect.status === 'In Washing') badgeClass = 'status-pill-blue';
                if (defect.status === 'Scrapped') badgeClass = 'status-pill-red';

                return `
                  <tr>
                    <td class="font-bold">${defect.id}</td>
                    <td>${defect.date}</td>
                    <td>${defect.origin}</td>
                    <td>${defect.article}</td>
                    <td>${defect.po}</td>
                    <td>${defect.defectClass}</td>
                    <td class="text-right font-bold">${defect.qty}</td>
                    <td>${defect.tailor}</td>
                    <td class="text-center">
                      <span class="status-pill ${badgeClass}">${defect.status}</span>
                    </td>
                    <td>${defect.route}</td>
                    <td class="text-center">
                      <button class="table-btn" onclick="window.handleDefectAction('${defect.id}', '${defect.actionText}')">
                        ${defect.actionText}
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </section>

      <footer class="portal-footer">
        <div class="footer-stats-left">
          <span>Total Reworked Today: <strong>${state.defectList.filter(d => d.status === 'Completed').length} Pairs</strong></span>
          <span class="stat-divider">|</span>
          <span>Returned to Step 1: <strong>${state.defectList.length} Pairs</strong></span>
          <span class="stat-divider">|</span>
          <span>Scrapped: <strong>${state.defectList.filter(d => d.status === 'Scrapped').length} Pairs</strong></span>
          <span class="stat-divider">|</span>
          <span>First-Time Repair Success Rate: <strong>${state.defectList.length > 0 ? '91.7%' : '0.0%'}</strong></span>
        </div>
        <div class="footer-actions-right">
          <button class="btn-outline" id="btn-export-pareto">Export Rework Pareto Analysis</button>
          <button class="btn-outline" id="btn-print-defect-sheet">Print Daily Defect Summary Sheet</button>
        </div>
      </footer>
    </main>
  `;
}

function renderScreenQC() {
  const allPassed = state.qcChecklist.every(c => c.passed);

  return `
    <header class="portal-header">
      <div class="header-brand">
        ${LOGO_SVG}
        <div class="brand-text">
          <span class="brand-title">MERIDIAN WORKS</span>
        </div>
      </div>
      <div class="header-center-info">
        Quality Assurance & Export Logistics – Final Inspection & Master Carton Clearance
      </div>
      <div class="header-actions">
        <div class="system-date-label" style="color: #ffffff; font-size: 13px;">31-10-2026</div>
        <span class="sub-header-badge badge-final-qc">
          Final QC Bay & Dispatch Dock #4
        </span>
      </div>
    </header>

    <main class="main-viewport">
      <section class="order-summary-card">
        <div class="order-summary-top">
          <div class="order-metadata-group">
            <span>Buyer: <strong>${state.qcOrder.buyer || 'Northwind Safety Gear UK'}</strong></span>
            <span class="stat-divider">|</span>
            <span>PO Number: <strong>${state.qcOrder.po || '27347'}</strong></span>
            <span class="stat-divider">|</span>
            <span>Article: <strong>${state.qcOrder.article || 'Model A9 Stealth Black'}</strong></span>
            <span class="stat-divider">|</span>
            <span>Order Total: <strong>${state.qcOrder.orderTotal || '3,090 Pairs'}</strong></span>
          </div>
          <div>
            <span class="badge-aql-passed" style="background-color: ${allPassed ? '#15803d' : '#475569'};">
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
          <span>Inspection Standard: <strong>AQL 1.5 Normal Single Sampling (Sample Size: 80 Pairs)</strong></span>
        </div>
      </section>

      <div class="qc-split-grid">
        <section class="panel-card">
          <div class="panel-card-header">
            <span class="panel-card-title">AQL 1.5 Inspection Checklist & Audit Log</span>
          </div>
          <div class="checklist-container">
            ${state.qcChecklist.map(item => `
              <div class="checklist-item" onclick="window.toggleQcCheck('${item.id}')" style="cursor: pointer;">
                <div class="checklist-box" style="background-color: ${item.passed ? '#15803d' : '#94a3b8'};">
                  ✓
                </div>
                <div class="checklist-content">
                  <span class="checklist-title">${item.title}</span>
                  ${item.details ? `<span class="${item.passed ? 'checklist-status-pass' : ''}" style="font-size: 12px; color: ${item.passed ? '#15803d' : '#64748b'};">${item.details} ${item.passed ? '- PASS' : ''}</span>` : ''}
                </div>
              </div>
            `).join('')}

            <div class="inspector-stamp-card">
              <div class="stamp-badge-icon" style="background-color: ${allPassed ? '#15803d' : '#94a3b8'};">✓</div>
              <div>
                <div class="stamp-text-title">${allPassed ? 'Approved by QA Inspector Tariq Mehmood' : 'Pending Final QA Inspection Sign-off'}</div>
                <div class="stamp-text-sub">(QC ID: ${allPassed ? '4402' : '---'})</div>
              </div>
            </div>
          </div>
        </section>

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
                    <td colspan="8" class="text-center" style="padding: 28px 16px; color: #64748b;">
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
          <button class="btn-outline" id="btn-print-carton-labels">Print Master Carton Shipping Labels (A4/Thermal)</button>
          <button class="btn-outline" id="btn-export-packing-list">Generate Commercial Export Packing List</button>
          <button class="btn-success" id="btn-dispatch-gate">Release & Dispatch to Container Gate</button>
        </div>
      </footer>
    </main>
  `;
}

function renderModalContainer() {
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
          <button class="btn-primary" id="modal-btn-print">Print Document</button>
        </div>
      </div>
    </div>
  `;
}

function renderApp() {
  const root = document.getElementById('root');
  if (!root) return;

  let screenHTML = '';
  if (state.activeScreen === 'screen-grn') screenHTML = renderScreenGRN();
  else if (state.activeScreen === 'screen-store') screenHTML = renderScreenStore();
  else if (state.activeScreen === 'screen-repair') screenHTML = renderScreenRepair();
  else if (state.activeScreen === 'screen-qc') screenHTML = renderScreenQC();

  root.innerHTML = `
    ${renderModuleSwitcher()}
    ${screenHTML}
    ${renderModalContainer()}
  `;

  attachEventHandlers();
}

function attachEventHandlers() {
  document.querySelectorAll('.module-nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetScreen = e.currentTarget.getAttribute('data-screen');
      if (targetScreen) {
        state.activeScreen = targetScreen;
        renderApp();
      }
    });
  });

  document.getElementById('btn-load-sample-data')?.addEventListener('click', () => {
    state.grnList = [...SAMPLE_DATA.grnList];
    state.rawGloveReqs = [...SAMPLE_DATA.rawGloveReqs];
    state.materialReqs = [...SAMPLE_DATA.materialReqs];
    state.inventoryItems = [...SAMPLE_DATA.inventoryItems];
    state.defectList = [...SAMPLE_DATA.defectList];
    state.cartons = [...SAMPLE_DATA.cartons];
    state.qcChecklist.forEach(c => c.passed = true);
    showToast('Sample template data loaded for inspection.');
    renderApp();
  });

  document.getElementById('btn-clear-all-data')?.addEventListener('click', () => {
    state.grnList = [];
    state.rawGloveReqs = [];
    state.materialReqs = [];
    state.inventoryItems = [];
    state.defectList = [];
    state.cartons = [];
    state.qcChecklist.forEach(c => c.passed = false);
    showToast('All details cleared to blank clean state.');
    renderApp();
  });

  document.getElementById('modal-close-x')?.addEventListener('click', closeModal);
  document.getElementById('modal-btn-close')?.addEventListener('click', closeModal);
  document.getElementById('modal-btn-print')?.addEventListener('click', () => { window.print(); });

  const modal = document.getElementById('global-modal');
  modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  if (state.activeScreen === 'screen-grn') attachGRNHandlers();
  else if (state.activeScreen === 'screen-store') attachStoreHandlers();
  else if (state.activeScreen === 'screen-repair') attachRepairHandlers();
  else if (state.activeScreen === 'screen-qc') attachQCHandlers();
}

function attachGRNHandlers() {
  const orderQtyInput = document.getElementById('grn-order-qty');
  const rcvdPairsInput = document.getElementById('grn-rcvd-pairs');
  const balanceInput = document.getElementById('grn-balance');

  function updateBalance() {
    const orderQty = parseInt(orderQtyInput?.value || '0', 10);
    const rcvd = parseInt(rcvdPairsInput?.value || '0', 10);
    if (balanceInput) balanceInput.value = Math.max(0, orderQty - rcvd);
  }

  orderQtyInput?.addEventListener('input', updateBalance);
  rcvdPairsInput?.addEventListener('input', updateBalance);

  document.getElementById('btn-post-grn')?.addEventListener('click', () => {
    const maker = document.getElementById('grn-maker')?.value;
    const customer = document.getElementById('grn-customer')?.value;
    const po = document.getElementById('grn-po')?.value;
    const article = document.getElementById('grn-article')?.value;
    const orderQty = parseInt(orderQtyInput?.value || '0', 10);
    const rcvdPairs = parseInt(rcvdPairsInput?.value || '0', 10);
    const balance = parseInt(balanceInput?.value || '0', 10);

    if (!maker || !po || orderQty <= 0) {
      showToast('Please provide valid Maker, PO, and Order Quantity.');
      return;
    }

    state.grnList.unshift({
      sr: state.grnList.length + 1,
      date: '31-10-2026',
      maker, customer, po, article, orderQty, rcvdPairs, balance,
      status: balance === 0 ? 'Received' : 'Partial'
    });

    showToast(`Goods Receipt (GRN) for PO #${po} successfully posted!`);
    renderApp();
  });

  document.getElementById('btn-clear-grn')?.addEventListener('click', () => {
    document.getElementById('grn-maker').value = '';
    document.getElementById('grn-customer').value = '';
    document.getElementById('grn-po').value = '';
    document.getElementById('grn-article').value = '';
    document.getElementById('grn-order-qty').value = '';
    document.getElementById('grn-rcvd-pairs').value = '';
    document.getElementById('grn-balance').value = '';
    showToast('Form cleared.');
  });

  document.getElementById('btn-print-grn-slip')?.addEventListener('click', () => {
    openModal('Goods Receiving Slip (GRN)', `
      <div style="font-family: monospace; font-size: 13px; line-height: 1.6;">
        <h2 style="margin: 0; font-size: 16px;">MERIDIAN WORKS - INWARD GOODS SLIP</h2>
        <p>Dock #1 | Date: 31-10-2026</p>
      </div>
    `);
  });

  document.getElementById('btn-export-grn-excel')?.addEventListener('click', () => {
    exportTableToCSV('Store_Register_Inward_Goods.csv', state.grnList);
    showToast('Store Register exported as CSV/Excel.');
  });

  document.getElementById('btn-print-grn-summary')?.addEventListener('click', () => { window.print(); });
}

function attachStoreHandlers() {
  const searchInput = document.getElementById('inventory-search-input');
  const categorySelect = document.getElementById('inventory-category-select');

  searchInput?.addEventListener('input', (e) => {
    state.inventorySearch = e.target.value;
    renderApp();
  });

  categorySelect?.addEventListener('change', (e) => {
    state.inventoryCategoryFilter = e.target.value;
    renderApp();
  });

  document.getElementById('btn-refresh-inventory')?.addEventListener('click', () => {
    showToast('Live Store Inventory synchronized.');
    renderApp();
  });

  document.getElementById('btn-export-stock-ledger')?.addEventListener('click', () => {
    exportTableToCSV('Store_Inventory_Master_Ledger.csv', state.inventoryItems);
    showToast('Stock Ledger exported to CSV.');
  });

  document.getElementById('btn-print-issue-vouchers')?.addEventListener('click', () => {
    openModal('Material Issue Vouchers', `<p>Material Issue Voucher ready for print.</p>`);
  });

  document.getElementById('btn-stock-audit')?.addEventListener('click', () => {
    showToast('Physical Stock Audit mode initiated.');
  });
}

function attachRepairHandlers() {
  document.getElementById('btn-complete-repair')?.addEventListener('click', () => {
    const batchId = document.getElementById('defect-batch-id')?.value;
    if (!batchId) { showToast('Please enter a Defect Batch ID.'); return; }
    showToast(`Batch ${batchId} marked complete and auto-routed to STAGE 1 Checking.`);
  });

  document.getElementById('btn-log-scrap')?.addEventListener('click', () => {
    const batchId = document.getElementById('defect-batch-id')?.value;
    if (!batchId) { showToast('Please enter a Defect Batch ID.'); return; }
    showToast(`Batch ${batchId} logged as Scrap/Unrepairable.`);
  });

  document.getElementById('btn-print-defect-tag')?.addEventListener('click', () => {
    openModal('Defect Route Tag', `<p>MANDATORY REWORK ROUTE TAG</p>`);
  });

  document.getElementById('btn-export-pareto')?.addEventListener('click', () => {
    exportTableToCSV('Alteration_Rework_Pareto.csv', state.defectList);
  });

  document.getElementById('btn-print-defect-sheet')?.addEventListener('click', () => { window.print(); });
}

function attachQCHandlers() {
  document.getElementById('btn-print-carton-labels')?.addEventListener('click', () => {
    openModal('Master Carton Shipping Labels', `<p>A4 / Thermal Direct Barcode Standard</p>`);
  });

  document.getElementById('btn-export-packing-list')?.addEventListener('click', () => {
    exportTableToCSV('Master_Carton_Packing_List.csv', state.cartons);
  });

  document.getElementById('btn-dispatch-gate')?.addEventListener('click', () => {
    openModal('Export Dispatch Clearance Slip', `<p>CONTAINER GATE RELEASE AUTHORIZED</p>`);
  });
}

window.viewGrnRecord = function(sr) {
  const item = state.grnList.find(r => r.sr === sr);
  if (item) openModal(`GRN Record #${sr}`, `<p>Record #${sr} details.</p>`);
};

window.editGrnRecord = function(sr) {
  const item = state.grnList.find(r => r.sr === sr);
  if (item) {
    const setSelectVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) {
        let found = false;
        for (let i = 0; i < el.options.length; i++) {
          if (el.options[i].value === val) {
            el.selectedIndex = i;
            found = true;
            break;
          }
        }
        if (!found) {
          const opt = document.createElement('option');
          opt.value = val;
          opt.textContent = val;
          opt.selected = true;
          el.appendChild(opt);
        }
      }
    };

    setSelectVal('grn-maker', item.maker);
    setSelectVal('grn-customer', item.customer);
    setSelectVal('grn-po', item.po);
    setSelectVal('grn-article', item.article);

    document.getElementById('grn-order-qty').value = item.orderQty;
    document.getElementById('grn-rcvd-pairs').value = item.rcvdPairs;
    document.getElementById('grn-balance').value = item.balance;
    showToast(`Loaded Record #${sr} into editor form.`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

window.approveGloveReq = function(id) { showToast(`Requisition ${id} Approved!`); };
window.issueMaterialReq = function(id) { openModal('Material Issue Slip', `<p>Issued ${id}</p>`); };
window.inspectMaterialReq = function(id) { openModal('Inspection Required', `<p>Inspect ${id}</p>`); };
window.handleDefectAction = function(id, text) { showToast(`Action ${text} for ${id}`); };

window.toggleQcCheck = function(id) {
  const item = state.qcChecklist.find(c => c.id === id);
  if (item) { item.passed = !item.passed; renderApp(); }
};

function exportTableToCSV(filename, rows) {
  if (!rows || !rows.length) { showToast('No records available to export.'); return; }
  const separator = ',';
  const keys = Object.keys(rows[0]);
  const csvContent =
    keys.join(separator) + '\n' +
    rows.map(row => keys.map(k => {
      let cellStr = row[k] === null || row[k] === undefined ? '' : String(row[k]);
      cellStr = cellStr.replace(/"/g, '""');
      if (cellStr.search(/("|,|\n)/g) >= 0) cellStr = `"${cellStr}"`;
      return cellStr;
    }).join(separator)).join('\n');

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

document.addEventListener('DOMContentLoaded', () => { renderApp(); });
renderApp();
