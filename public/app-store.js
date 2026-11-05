// =========================================================================
// MERIDIAN — STORE KEEPER & STORE MANAGER PORTAL ENGINE
// Covers:
// 1. Inward Contractor Shipments & Receiving Entry (Shipment Record)
// 2. Glove Requisitions & Floor Issuance
// 3. Packaging Materials Store (MREQ Issuance)
// 4. Dual Raw & Accessories Inventory Balances
// =========================================================================

function showToast(message, isError = false) {
  const toast = document.getElementById('toastAlert');
  const icon = document.getElementById('toastIcon');
  const msg = document.getElementById('toastMessage');
  if (!toast || !msg) return;

  toast.className = `toast-alert show ${isError ? 'toast-error' : 'toast-success'}`;
  if (icon) icon.innerHTML = isError ? '⚠️' : '✅';
  msg.textContent = message;

  setTimeout(() => {
    toast.classList.remove('show');
  }, 4500);
}

function switchStoreTab(tab) {
  const tabs = ['receivings', 'gloves', 'materials'];
  tabs.forEach(t => {
    const cap = t.charAt(0).toUpperCase() + t.slice(1);
    const btn = document.getElementById('btnTab' + cap);
    const content = document.getElementById('tab' + cap);
    if (btn) btn.classList.remove('active');
    if (content) content.classList.add('hidden');
  });

  const activeCap = tab.charAt(0).toUpperCase() + tab.slice(1);
  const activeBtn = document.getElementById('btnTab' + activeCap);
  const activeContent = document.getElementById('tab' + activeCap);
  if (activeBtn) activeBtn.classList.add('active');
  if (activeContent) activeContent.classList.remove('hidden');
}

// --- MASTER STORE DATA LOADER ---
async function loadStoreData() {
  await Promise.all([
    loadReceivingsTable(),
    loadReceivingDropdowns(),
    loadGloveRequisitions(),
    loadGloveInventory(),
    loadMaterialRequisitions(),
    loadMaterialInventory()
  ]);
}

// =========================================================================
// 1. STORE MANAGER INWARD RECEIVINGS (Shipment Record)
// =========================================================================
let cachedReceivings = [];

async function loadReceivingsTable(filters = {}) {
  try {
    const params = new URLSearchParams();
    if (filters.customer) params.append('customer', filters.customer);
    if (filters.maker) params.append('maker', filters.maker);
    if (filters.search) params.append('search', filters.search);
    if (filters.date) params.append('date', filters.date);

    const res = await fetch(`/api/store/receivings?${params.toString()}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    cachedReceivings = json.data || [];
    renderReceivingsTable(cachedReceivings);
  } catch (err) {
    console.error('Failed to load receivings:', err);
  }
}

function renderReceivingsTable(records) {
  const bodies = [
    document.getElementById('receivingsTableBody'),
    document.getElementById('hubReceivingsTableBody')
  ].filter(Boolean);

  if (bodies.length === 0) return;

  // KPI calculations
  const totalShipments = records.length;
  const totalDemanded = records.reduce((acc, r) => acc + (Number(r.order_qty) || 0), 0);
  const totalReceived = records.reduce((acc, r) => acc + (Number(r.rcvd_pairs) || 0), 0);
  const totalBalance = records.reduce((acc, r) => acc + (Number(r.balance_qty) || 0), 0);

  const kpiShipments = document.getElementById('kpiReceivingsCount');
  const kpiDemanded = document.getElementById('kpiTotalDemanded');
  const kpiReceived = document.getElementById('kpiTotalReceived');
  const kpiBalance = document.getElementById('kpiTotalBalance');

  if (kpiShipments) kpiShipments.textContent = `${totalShipments} Lots`;
  if (kpiDemanded) kpiDemanded.textContent = totalDemanded.toLocaleString();
  if (kpiReceived) kpiReceived.textContent = totalReceived.toLocaleString();
  if (kpiBalance) kpiBalance.textContent = totalBalance.toLocaleString();

  // Footer totals for Picture 1 table
  const regTotal = document.getElementById('regTotalRecords');
  const regRcvd = document.getElementById('regSumReceived');
  const regBal = document.getElementById('regSumBalance');
  if (regTotal) regTotal.textContent = totalShipments;
  if (regRcvd) regRcvd.textContent = `${totalReceived.toLocaleString()} Pairs`;
  if (regBal) regBal.textContent = `${totalBalance.toLocaleString()} Pairs`;

  if (records.length === 0) {
    bodies.forEach(b => {
      b.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#64748b;padding:1.5rem;">No inward receiving records match your criteria.</td></tr>';
    });
    return;
  }

  const html = records.map((r, idx) => {
    const hasBalance = r.balance_qty > 0;
    const statusTag = hasBalance
      ? `<span class="erp-tag erp-tag-partial">Partial</span>`
      : `<span class="erp-tag erp-tag-complete">Received</span>`;

    return `
      <tr>
        <td style="text-align:center;font-weight:700;color:#64748b;">${idx + 1}</td>
        <td><span style="color:#334155;font-size:12px;">${r.rcv_date}</span></td>
        <td>
          <span class="urdu-text" style="font-weight:700;color:#0f172a;">${r.maker_contractor}</span>
        </td>
        <td><strong>${r.customer_name}</strong></td>
        <td><code style="background:#f1f5f9;padding:2px 6px;border-radius:3px;font-weight:700;color:#1e293b;">${r.po_number}</code></td>
        <td><strong>${r.article_name}</strong></td>
        <td style="text-align:right;"><span style="font-family:var(--font-mono);font-weight:600;">${r.order_qty.toLocaleString()}</span></td>
        <td style="text-align:right;"><strong style="font-family:var(--font-mono);color:#047857;">${r.rcvd_pairs.toLocaleString()}</strong></td>
        <td style="text-align:right;"><span style="font-family:var(--font-mono);font-weight:700;color:${hasBalance ? '#b45309' : '#047857'};">${r.balance_qty.toLocaleString()}</span></td>
        <td style="text-align:center;">${statusTag}</td>
        <td style="text-align:center;font-size:11px;">
          <a href="#" style="color:#2563eb;text-decoration:none;font-weight:600;">View</a> | 
          <a href="#" style="color:#2563eb;text-decoration:none;font-weight:600;">Edit</a>
        </td>
      </tr>
    `;
  }).join('');

  bodies.forEach(b => {
    b.innerHTML = html;
  });
}

async function loadReceivingDropdowns() {
  try {
    const res = await fetch('/api/store/dropdowns');
    const json = await res.json();
    if (!json.success || !json.data) return;

    const { makers, customers, articles, poList } = json.data;

    // Populate Makers
    const makerSelects = [document.getElementById('rcvMaker'), document.getElementById('hubRcvMaker')].filter(Boolean);
    makerSelects.forEach(sel => {
      sel.innerHTML = '<option value="">-- Choose Maker / Contractor --</option>';
      makers.forEach(m => {
        sel.innerHTML += `<option value="${m}">${m}</option>`;
      });
      sel.innerHTML += '<option value="__NEW__">+ Other / Enter New Contractor...</option>';
    });

    // Populate Filter Maker
    const filterMakers = [document.getElementById('filterMaker'), document.getElementById('hubFilterMaker')].filter(Boolean);
    filterMakers.forEach(sel => {
      sel.innerHTML = '<option value="">All Makers / Contractors</option>';
      makers.forEach(m => {
        sel.innerHTML += `<option value="${m}">${m}</option>`;
      });
    });

    // Populate Customers
    const customerSelects = [document.getElementById('rcvCustomer'), document.getElementById('hubRcvCustomer')].filter(Boolean);
    customerSelects.forEach(sel => {
      sel.innerHTML = '<option value="">-- Choose Customer --</option>';
      customers.forEach(c => {
        sel.innerHTML += `<option value="${c}">${c}</option>`;
      });
    });

    // Populate Filter Customer
    const filterCustomers = [document.getElementById('filterCustomer'), document.getElementById('hubFilterCustomer')].filter(Boolean);
    filterCustomers.forEach(sel => {
      sel.innerHTML = '<option value="">All Customers</option>';
      customers.forEach(c => {
        sel.innerHTML += `<option value="${c}">${c}</option>`;
      });
    });

    // Populate Articles
    const articleSelects = [document.getElementById('rcvArticle'), document.getElementById('hubRcvArticle')].filter(Boolean);
    articleSelects.forEach(sel => {
      sel.innerHTML = '<option value="">-- Choose Article / Model --</option>';
      articles.forEach(a => {
        sel.innerHTML += `<option value="${a}">${a}</option>`;
      });
    });

    // Populate PO Datalist
    const poDatalists = [document.getElementById('poListOptions'), document.getElementById('hubPoListOptions')].filter(Boolean);
    poDatalists.forEach(dl => {
      dl.innerHTML = '';
      poList.forEach(po => {
        dl.innerHTML += `<option value="${po}"></option>`;
      });
    });

  } catch (err) {
    console.error('Failed to load dropdowns:', err);
  }
}

function onMakerChanged(prefix = '') {
  const sel = document.getElementById(prefix + 'rcvMaker');
  const customField = document.getElementById(prefix + 'rcvMakerCustomWrap');
  if (sel && customField) {
    if (sel.value === '__NEW__') {
      customField.classList.remove('hidden');
    } else {
      customField.classList.add('hidden');
    }
  }
}

function calculateBalance(prefix = '') {
  const orderEl = document.getElementById(prefix + 'rcvOrderQty');
  const rcvdEl = document.getElementById(prefix + 'rcvPairs');
  const dispEl = document.getElementById(prefix + 'balanceDisplay');
  const balInput = document.getElementById(prefix + 'rcvBalance');

  const orderNum = Number(orderEl ? orderEl.value : 0) || 0;
  const rcvdNum = Number(rcvdEl ? rcvdEl.value : 0) || 0;
  const balance = Math.max(0, orderNum - rcvdNum);

  if (balInput) {
    balInput.value = (orderNum === 0 && rcvdNum === 0) ? '-' : balance.toLocaleString();
  }

  if (!dispEl) return;

  if (orderNum === 0 && rcvdNum === 0) {
    dispEl.className = 'balance-box';
    dispEl.innerHTML = `<span style="font-size:10px;text-transform:uppercase;color:var(--text-muted);">Balance</span><strong class="balance-num">-</strong>`;
    return;
  }

  if (balance === 0) {
    dispEl.className = 'balance-box complete';
    dispEl.innerHTML = `<span style="font-size:10px;text-transform:uppercase;">Balance</span><strong class="balance-num">0 (Complete)</strong>`;
  } else {
    dispEl.className = 'balance-box pending';
    dispEl.innerHTML = `<span style="font-size:10px;text-transform:uppercase;">Pending</span><strong class="balance-num">${balance.toLocaleString()} Pairs</strong>`;
  }
}

async function submitStoreReceiving(prefix = '') {
  try {
    const dateEl = document.getElementById(prefix + 'rcvDate');
    const makerSel = document.getElementById(prefix + 'rcvMaker');
    const makerCustom = document.getElementById(prefix + 'rcvMakerCustom');
    const custSel = document.getElementById(prefix + 'rcvCustomer');
    const poEl = document.getElementById(prefix + 'rcvPO');
    const artSel = document.getElementById(prefix + 'rcvArticle');
    const orderEl = document.getElementById(prefix + 'rcvOrderQty');
    const pairsEl = document.getElementById(prefix + 'rcvPairs');

    const rcvDate = dateEl ? dateEl.value : '';
    let makerContractor = makerSel ? makerSel.value : '';
    if (makerContractor === '__NEW__' && makerCustom && makerCustom.value.trim()) {
      makerContractor = makerCustom.value.trim();
    }
    const customerName = custSel ? custSel.value : '';
    const poNumber = poEl ? poEl.value.trim() : '';
    const articleName = artSel ? artSel.value : '';
    const orderQty = Number(orderEl ? orderEl.value : 0);
    const rcvdPairs = Number(pairsEl ? pairsEl.value : 0);

    if (!makerContractor || makerContractor === '__NEW__') {
      alert('Please select or enter the Maker / Contractor.');
      return;
    }
    if (!customerName) {
      alert('Please select the Target Customer.');
      return;
    }
    if (!poNumber) {
      alert('Please enter or select a Purchase Order (PO) number.');
      return;
    }
    if (!articleName) {
      alert('Please select the Article / Glove Style.');
      return;
    }
    if (rcvdPairs <= 0) {
      alert('Received pairs must be at least 1.');
      return;
    }

    const payload = {
      rcvDate: rcvDate || new Date().toISOString().slice(0, 10),
      makerContractor,
      customerName,
      poNumber,
      articleName,
      orderQty,
      rcvdPairs
    };

    const res = await fetch('/api/store/receivings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    showToast(`✓ Received ${rcvdPairs} pairs of ${articleName} from ${makerContractor}! Added to raw stock.`);

    // Reset inputs
    if (orderEl) orderEl.value = '';
    if (pairsEl) pairsEl.value = '';
    calculateBalance(prefix);

    // Refresh tables and inventory
    await Promise.all([
      loadReceivingsTable(),
      loadReceivingDropdowns(),
      loadGloveInventory()
    ]);

  } catch (err) {
    showToast('Failed to record receiving: ' + err.message, true);
  }
}

function onReceivingsFilterChanged() {
  const cust = (document.getElementById('filterCustomer') || document.getElementById('hubFilterCustomer') || {}).value;
  const maker = (document.getElementById('filterMaker') || document.getElementById('hubFilterMaker') || {}).value;
  const search = (document.getElementById('searchReceivings') || document.getElementById('hubSearchReceivings') || {}).value;

  loadReceivingsTable({
    customer: cust || '',
    maker: maker || '',
    search: search || ''
  });
}

function openPrintReceivingModal() {
  const modal = document.getElementById('modalPrintReceiving');
  if (!modal) return;

  const tableBody = document.getElementById('slipReceivingTableBody');
  const printDate = document.getElementById('slipReceivingDate');
  if (printDate) printDate.textContent = new Date().toLocaleDateString();

  if (tableBody) {
    tableBody.innerHTML = cachedReceivings.map((r, idx) => `
      <tr>
        <td style="text-align:center;padding:6px;border:1px solid #cbd5e1;">${idx + 1}</td>
        <td style="padding:6px;border:1px solid #cbd5e1;" class="urdu-text"><strong>${r.maker_contractor}</strong></td>
        <td style="padding:6px;border:1px solid #cbd5e1;">${r.customer_name}</td>
        <td style="padding:6px;border:1px solid #cbd5e1;">${r.po_number}</td>
        <td style="padding:6px;border:1px solid #cbd5e1;"><strong>${r.article_name}</strong></td>
        <td style="text-align:right;padding:6px;border:1px solid #cbd5e1;">${r.order_qty.toLocaleString()}</td>
        <td style="text-align:right;padding:6px;border:1px solid #cbd5e1;"><strong>${r.rcvd_pairs.toLocaleString()}</strong></td>
        <td style="text-align:right;padding:6px;border:1px solid #cbd5e1;font-weight:700;">${r.balance_qty.toLocaleString()}</td>
      </tr>
    `).join('');
  }

  modal.classList.remove('hidden');
}

function closePrintReceivingModal() {
  const modal = document.getElementById('modalPrintReceiving');
  if (modal) modal.classList.add('hidden');
}

function executePrintReceivingSheet() {
  window.focus();
  window.print();
}

// =========================================================================
// 2. GLOVE REQUISITIONS (Packing Hall Requisitions & Issuance)
// =========================================================================
async function loadGloveRequisitions() {
  try {
    const res = await fetch('/api/requisitions');
    const json = await res.json();
    const tbody = document.getElementById('requisitionsTableBody');
    const kpiEl = document.getElementById('kpiPendingReqs');

    if (!json.success || json.data.length === 0) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:1.5rem;">No requisitions submitted yet.</td></tr>';
      if (kpiEl) kpiEl.textContent = '0';
      return;
    }

    const pendingCount = json.data.filter(r => r.status === 'PENDING').length;
    if (kpiEl) kpiEl.textContent = String(pendingCount);

    if (tbody) {
      tbody.innerHTML = json.data.map(r => {
        const isPending = r.status === 'PENDING';
        const statusBadge = isPending 
          ? `<span class="badge badge-pending">Waiting Issuance</span>`
          : `<span class="badge badge-success">${r.status}</span>`;

        const actionBtn = isPending
          ? `<button class="btn btn-primary btn-sm" onclick="issueGloveReq('${r.req_number}', ${r.requested_pairs})">
               Approve &amp; Issue Pairs
             </button>`
          : `<span style="color:var(--emerald-600);font-weight:700;font-size:0.85rem;">✓ Dispatched (${r.issued_pairs} pairs)</span>`;

        return `
          <tr>
            <td><strong style="color:var(--primary-500);font-family:var(--font-mono);">${r.req_number}</strong></td>
            <td><strong>${r.customer_name}</strong></td>
            <td>${r.product_name}</td>
            <td><strong style="font-size:1.05rem;font-family:var(--font-mono);">${r.requested_pairs}</strong> pairs</td>
            <td>${statusBadge}</td>
            <td style="color:var(--text-muted);font-size:0.8rem;">${new Date(r.created_at).toLocaleString()}</td>
            <td>${actionBtn}</td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    showToast('Failed to load requisitions: ' + err.message, true);
  }
}

async function issueGloveReq(reqNo, pairs) {
  try {
    const res = await fetch(`/api/requisitions/${reqNo}/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    showToast(`Approved & issued ${pairs} pairs for Requisition ${reqNo}! Stock transferred to Packing Hall.`);
    await loadStoreData();
    if (typeof loadRequisitionsDropdown === 'function') {
      await loadRequisitionsDropdown(reqNo);
    }
  } catch (err) {
    showToast(err.message, true);
  }
}

// =========================================================================
// 3. RAW GLOVE INVENTORY ON HAND
// =========================================================================
async function loadGloveInventory() {
  try {
    const res = await fetch('/api/inventory/gloves');
    const json = await res.json();
    const tbody = document.getElementById('gloveStockTableBody');
    const kpiEl = document.getElementById('kpiGlovePairs');

    if (!json.success || json.data.length === 0) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.5rem;">No inventory records found.</td></tr>';
      if (kpiEl) kpiEl.textContent = '0';
      return;
    }

    const totalPairs = json.data.reduce((acc, g) => acc + (g.available_pairs || 0), 0);
    if (kpiEl) kpiEl.textContent = totalPairs.toLocaleString();

    if (tbody) {
      tbody.innerHTML = json.data.map(g => `
        <tr>
          <td><code style="color:var(--text-muted);">${g.id}</code></td>
          <td><strong>${g.customer_name}</strong> <span style="color:var(--text-muted);font-size:0.8rem;">(${g.country || 'Global'})</span></td>
          <td>${g.product_name}</td>
          <td><span class="badge ${g.inspection_preference === 'THOROUGH' ? 'badge-info' : 'badge-pending'}">${g.inspection_preference}</span></td>
          <td><strong style="font-size:1.1rem;font-family:var(--font-mono);color:${g.available_pairs > 300 ? 'var(--emerald-600)' : 'var(--rose-600)'};">${g.available_pairs.toLocaleString()}</strong> pairs</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error(err);
  }
}

// =========================================================================
// 4. PACKING MATERIALS STORE (MREQ Issuance & Inventory)
// =========================================================================
async function loadMaterialRequisitions() {
  try {
    const res = await fetch('/api/material-requisitions');
    const json = await res.json();
    const tbody = document.getElementById('materialReqTableBody');
    const kpiEl = document.getElementById('kpiPendingMreqs');

    if (!json.success || json.data.length === 0) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:1.5rem;">No material requisitions waiting in queue.</td></tr>';
      if (kpiEl) kpiEl.textContent = '0';
      return;
    }

    const pendingMreq = json.data.filter(m => m.status === 'PENDING').length;
    if (kpiEl) kpiEl.textContent = String(pendingMreq);

    if (tbody) {
      tbody.innerHTML = json.data.map(m => {
        const isPending = m.status === 'PENDING';
        const actionBtn = isPending
          ? `<button class="btn btn-warning btn-sm" onclick="issueMaterialReq('${m.mat_req_number}')">
               Dispatch Accessories
             </button>`
          : `<span style="color:var(--emerald-600);font-weight:700;font-size:0.85rem;">✓ Dispatched</span>`;

        return `
          <tr>
            <td><strong style="color:var(--amber-600);font-family:var(--font-mono);">${m.mat_req_number}</strong></td>
            <td><strong style="color:var(--primary-500);font-family:var(--font-mono);">${m.req_number}</strong></td>
            <td>${m.customer_name} &bull; ${m.product_name}</td>
            <td><strong style="font-family:var(--font-mono);">${m.pairs_count}</strong> pairs</td>
            <td>${m.polybags_requested} pcs</td>
            <td>${m.silica_gel_requested} pouches</td>
            <td>${m.stickers_requested} stk</td>
            <td><span class="badge ${isPending ? 'badge-pending' : 'badge-success'}">${m.status}</span></td>
            <td>${actionBtn}</td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error(err);
  }
}

async function issueMaterialReq(matReqNo) {
  try {
    const res = await fetch(`/api/material-requisitions/${matReqNo}/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    showToast(`Packaging accessories successfully dispatched for ${matReqNo}. Step 4 unblocked!`);
    await loadStoreData();
    if (typeof loadActiveBatchDetails === 'function') {
      await loadActiveBatchDetails();
    }
  } catch (err) {
    showToast(err.message, true);
  }
}

async function loadMaterialInventory() {
  try {
    const res = await fetch('/api/inventory/materials');
    const json = await res.json();
    const tbody = document.getElementById('materialStockTableBody');
    if (!tbody || !json.success || json.data.length === 0) return;

    tbody.innerHTML = json.data.map(m => `
      <tr>
        <td><code>${m.material_code}</code></td>
        <td><strong>${m.material_name}</strong></td>
        <td><strong style="font-size:1.1rem;font-family:var(--font-mono);color:var(--primary-500);">${m.available_qty.toLocaleString()}</strong></td>
        <td>${m.unit}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

window.addEventListener('DOMContentLoaded', loadStoreData);
