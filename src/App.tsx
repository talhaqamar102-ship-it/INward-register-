/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface ReceivingSize {
  size_code: string;
  order_pairs: number;
  rcvd_pairs: number;
  balance_pairs: number;
}

interface ReceivingRecord {
  rcv_number: string;
  rcv_date: string;
  maker_contractor: string;
  customer_name: string;
  po_number: string;
  article_name: string;
  order_qty: number;
  rcvd_pairs: number;
  balance_qty: number;
  status: string;
  challan_no: string;
  gate_pass_no: string;
  vehicle_no: string;
  sizes: ReceivingSize[];
}

interface Dropdowns {
  makers: string[];
  customers: string[];
  articles: string[];
  poList: string[];
}

interface ReceivingForm {
  rcvDate: string;
  makerContractor: string;
  customerName: string;
  poNumber: string;
  articleName: string;
  orderQty: string;
  rcvdPairs: string;
  challanNo: string;
  gatePassNo: string;
  vehicleNo: string;
}

const emptyForm: ReceivingForm = {
  rcvDate: '',
  makerContractor: '',
  customerName: '',
  poNumber: '',
  articleName: '',
  orderQty: '',
  rcvdPairs: '',
  challanNo: '',
  gatePassNo: '',
  vehicleNo: '',
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  const body = await res.json();
  if (!body.success) throw new Error(body.error || 'Request failed');
  return body.data as T;
}

const fmt = (n: number) => Number(n).toLocaleString();

// GRN printable slip built exclusively from the saved record (no fabricated data)
function buildGrnSlipHtml(rec: ReceivingRecord): string {
  const status = rec.status === 'COMPLETE' ? 'RECEIVED' : rec.status;
  const sizeHeader = rec.sizes.map(s => `<th style="border:1px solid var(--border-strong); padding:6px; text-align:center;">${s.size_code}</th>`).join('');
  const sizeRow = rec.sizes.map(s => `<td style="border:1px solid var(--border-strong); padding:6px; text-align:center;">${Number(s.rcvd_pairs).toLocaleString()} Prs</td>`).join('');
  const hasSizes = rec.sizes.length > 0;
  const sizeTable = hasSizes ? `
    <table style="width:100%; border-collapse: collapse; margin:12px 0; font-size:12px;">
      <thead>
        <tr style="background: var(--ink-100); color: var(--ink-950);">
          ${sizeHeader}
          <th style="border:1px solid var(--border-strong); padding:6px; text-align:center; background: var(--ink-200); font-weight:800;">Total Received</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          ${sizeRow}
          <td style="border:1px solid var(--border-strong); padding:6px; text-align:center; font-weight:800; color: var(--ink-950); font-size:13px;">${fmt(rec.rcvd_pairs)} Pairs</td>
        </tr>
      </tbody>
    </table>` : '';

  return `
    <div class="printable-slip-box">
      <div class="printable-slip-header">
        <h2 style="margin:0; font-size:16px; font-weight:800; color: var(--ink-950);">MERIDIAN WORKS &bull; GOODS RECEIVING NOTE (GRN)</h2>
        <p style="margin:2px 0 0; font-size:11px; text-transform:uppercase; color: var(--ink-600);">
          Dock #1 Inward Store Register &bull; Official Inward Goods Slip
        </p>
      </div>
      <div class="printable-meta-grid">
        <div><span>GRN Reference:</span> <strong>${rec.rcv_number}</strong></div>
        <div><span>Receiving Date:</span> <strong>${rec.rcv_date}</strong></div>
        <div><span>Maker / Contractor:</span> <strong>${rec.maker_contractor}</strong></div>
        <div><span>Customer / Buyer:</span> <strong>${rec.customer_name}</strong></div>
        <div><span>Purchase Order #:</span> <strong>${rec.po_number}</strong></div>
        <div><span>Article / Product:</span> <strong>${rec.article_name}</strong></div>
        <div><span>Order Quantity:</span> <strong>${fmt(rec.order_qty)} Pairs</strong></div>
        <div><span>Received Quantity:</span> <strong>${fmt(rec.rcvd_pairs)} Pairs</strong></div>
        <div><span>Balance Remaining:</span> <strong>${fmt(rec.balance_qty)} Pairs</strong></div>
        <div><span>Status:</span> <strong>${status}</strong></div>
        ${rec.challan_no ? `<div><span>Challan #:</span> <strong>${rec.challan_no}</strong></div>` : ''}
        ${rec.gate_pass_no ? `<div><span>Gate Pass #:</span> <strong>${rec.gate_pass_no}</strong></div>` : ''}
        ${rec.vehicle_no ? `<div><span>Vehicle Registration:</span> <strong>${rec.vehicle_no}</strong></div>` : ''}
      </div>
      ${sizeTable}
      <div style="display:flex; justify-content:space-between; font-size:11px; margin-top:24px; border-top:1px dashed var(--ink-500); padding-top:8px;">
        <span>Contractor Agent Sign: ___________________</span>
        <span>Dock #1 Receiver: ___________________</span>
        <span>Store Head Sign: ___________________</span>
      </div>
    </div>
  `;
}

export default function App() {
  const [screen, setScreen] = React.useState<'grn' | 'wip' | 'admin'>('grn');
  const [dropdowns, setDropdowns] = React.useState<Dropdowns>({ makers: [], customers: [], articles: [], poList: [] });
  const [receivings, setReceivings] = React.useState<ReceivingRecord[]>([]);
  const [form, setForm] = React.useState<ReceivingForm>(emptyForm);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  // Print slip for the most recently saved GRN record (in flight while the notice shows)
  const pendingPrintRef = React.useRef<ReceivingRecord | null>(null);

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    try {
      const [dd, list] = await Promise.all([
        api<Dropdowns>('/store/dropdowns'),
        api<ReceivingRecord[]>('/store/receivings'),
      ]);
      setDropdowns(dd);
      setReceivings(list);
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Core real print engine: fills #direct-print-stage, adds body.printing-slip, calls window.print()
  const printRecord = React.useCallback((rec: ReceivingRecord) => {
    if (!rec) return;
    let stage = document.getElementById('direct-print-stage') as HTMLElement | null;
    if (!stage) {
      stage = document.createElement('div');
      stage.id = 'direct-print-stage';
      document.body.appendChild(stage);
    }
    stage.innerHTML = buildGrnSlipHtml(rec);
    document.body.classList.add('printing-slip');
    window.focus();
    window.print();
    document.body.classList.remove('printing-slip');
  }, []);

  // Print the record that was just created by the form submit
  React.useEffect(() => {
    if (notice && pendingPrintRef.current) {
      const rec = pendingPrintRef.current;
      pendingPrintRef.current = null;
      // Defer so the UI repaint shows the saved state before the print dialog opens
      const t = window.setTimeout(() => printRecord(rec), 250);
      return () => window.clearTimeout(t);
    }
  }, [notice, printRecord]);

  const setField = (name: keyof ReceivingForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [name]: e.target.value }));
  };

  const balanceQty = Math.max(0, Number(form.orderQty || 0) - Number(form.rcvdPairs || 0));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const created = await api<ReceivingRecord>('/store/receivings', {
        method: 'POST',
        body: JSON.stringify({
          rcvDate: form.rcvDate || undefined,
          makerContractor: form.makerContractor.trim(),
          customerName: form.customerName.trim(),
          poNumber: form.poNumber.trim(),
          articleName: form.articleName.trim(),
          orderQty: Number(form.orderQty || 0),
          rcvdPairs: Number(form.rcvdPairs || 0),
          challanNo: form.challanNo.trim(),
          gatePassNo: form.gatePassNo.trim(),
          vehicleNo: form.vehicleNo.trim(),
        }),
      });
      setReceivings(prev => [...prev, created]);
      setForm(emptyForm);
      pendingPrintRef.current = created;
      setNotice(`Receiving ${created.rcv_number} recorded — printing slip…`);
      setDropdowns(await api<Dropdowns>('/store/dropdowns'));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const GRNScreen = () => (
    <div className="main-viewport">
      <section className="panel-card">
        <div className="panel-card-header">
          <div className="panel-card-title">
            <span>Inward Receiving Entry</span>
          </div>
          {notice ? <span className="panel-counter-badge">{notice}</span> : null}
        </div>
        <form className="form-card" onSubmit={submit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="grn-date">Receiving Date</label>
              <input id="grn-date" className="form-input" type="date" value={form.rcvDate} onChange={setField('rcvDate')} />
            </div>
            <div className="form-group">
              <label htmlFor="grn-maker">Maker / Contractor</label>
              <input id="grn-maker" className="form-input" list="dl-makers" placeholder="Select or type" value={form.makerContractor} onChange={setField('makerContractor')} required />
              <datalist id="dl-makers">
                {dropdowns.makers.map(m => <option key={m} value={m} />)}
              </datalist>
            </div>
            <div className="form-group">
              <label htmlFor="grn-customer">Customer</label>
              <input id="grn-customer" className="form-input" list="dl-customers" placeholder="Select or type" value={form.customerName} onChange={setField('customerName')} required />
              <datalist id="dl-customers">
                {dropdowns.customers.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div className="form-group">
              <label htmlFor="grn-po">PO Number</label>
              <input id="grn-po" className="form-input" list="dl-pos" placeholder="Select or type" value={form.poNumber} onChange={setField('poNumber')} required />
              <datalist id="dl-pos">
                {dropdowns.poList.map(p => <option key={p} value={p} />)}
              </datalist>
            </div>
            <div className="form-group">
              <label htmlFor="grn-article">Article</label>
              <input id="grn-article" className="form-input" list="dl-articles" placeholder="Select or type" value={form.articleName} onChange={setField('articleName')} required />
              <datalist id="dl-articles">
                {dropdowns.articles.map(a => <option key={a} value={a} />)}
              </datalist>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="grn-order">Order Qty (Pairs)</label>
              <input id="grn-order" className="form-input" type="number" min="0" placeholder="0" value={form.orderQty} onChange={setField('orderQty')} />
            </div>
            <div className="form-group">
              <label htmlFor="grn-rcvd">Received Pairs</label>
              <input id="grn-rcvd" className="form-input" type="number" min="1" placeholder="0" value={form.rcvdPairs} onChange={setField('rcvdPairs')} required />
            </div>
            <div className="form-group">
              <label htmlFor="grn-balance">Balance</label>
              <input id="grn-balance" className="form-input" value={fmt(balanceQty)} readOnly disabled />
            </div>
            <div className="form-group">
              <label htmlFor="grn-challan">Challan #</label>
              <input id="grn-challan" className="form-input" placeholder="Optional" value={form.challanNo} onChange={setField('challanNo')} />
            </div>
            <div className="form-group">
              <label htmlFor="grn-gatepass">Gate Pass #</label>
              <input id="grn-gatepass" className="form-input" placeholder="Optional" value={form.gatePassNo} onChange={setField('gatePassNo')} />
            </div>
            <div className="form-group">
              <label htmlFor="grn-vehicle">Vehicle #</label>
              <input id="grn-vehicle" className="form-input" placeholder="Optional" value={form.vehicleNo} onChange={setField('vehicleNo')} />
            </div>
          </div>
          <div className="form-action-row">
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              Balance determines COMPLETE / PARTIAL status automatically.
            </span>
            <div className="form-actions-right">
              <button type="button" className="btn-outline" onClick={() => { setForm(emptyForm); setError(''); setNotice(''); }}>
                Clear
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save Receiving'}
              </button>
            </div>
          </div>
        </form>
      </section>

      <section className="panel-card">
        <div className="panel-card-header">
          <div className="panel-card-title">
            <span>Inward Goods Register</span>
            <span className="panel-counter-badge">{receivings.length} Records</span>
          </div>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>RCV #</th>
                <th>Date</th>
                <th>Maker / Contractor</th>
                <th>Customer</th>
                <th>PO #</th>
                <th>Article</th>
                <th className="text-right">Order Qty</th>
                <th className="text-right">Received</th>
                <th className="text-right">Balance</th>
                <th className="text-center">Status</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="table-empty-cell">Loading…</td></tr>
              ) : receivings.length === 0 ? (
                <tr><td colSpan={11} className="table-empty-cell">No receiving records yet. Save the first inward entry above.</td></tr>
              ) : receivings.map(r => (
                <tr key={r.rcv_number}>
                  <td className="font-bold">{r.rcv_number}</td>
                  <td>{r.rcv_date}</td>
                  <td>{r.maker_contractor}</td>
                  <td>{r.customer_name}</td>
                  <td className="font-bold">{r.po_number}</td>
                  <td>{r.article_name}</td>
                  <td className="text-right">{fmt(r.order_qty)}</td>
                  <td className="text-right font-bold">{fmt(r.rcvd_pairs)}</td>
                  <td className="text-right font-bold">{fmt(r.balance_qty)}</td>
                  <td className="text-center">
                    <span className={`status-pill${r.status === 'COMPLETE' ? ' status-pill-green' : ''}`}>{r.status}</span>
                  </td>
                  <td className="text-center">
                    <button type="button" className="table-btn" onClick={() => printRecord(r)}>Print</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  const WIPScreen = () => (
    <div className="main-viewport">
      <section className="panel-card">
        <div className="panel-card-header">
          <div className="panel-card-title">
            <span>5-Stage WIP Packing Hall</span>
          </div>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Req #</th>
                <th>Customer</th>
                <th>Product</th>
                <th className="text-right">Requested Pairs</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={5} className="table-empty-cell">Open a requisition from the register to begin stage tracking.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  const AdminScreen = () => (
    <div className="main-viewport">
      <section className="panel-card">
        <div className="panel-card-header">
          <div className="panel-card-title">
            <span>Admin Control Panel</span>
          </div>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Master</th>
                <th>Endpoint</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={3} className="table-empty-cell">Admin operations are restricted to super users.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  return (
    <>
      <header className="module-switcher-bar">
        <div className="module-switcher-left">
          <span className="module-switcher-label">Meridian Works MES</span>
          <button className={`module-nav-btn${screen === 'grn' ? ' active' : ''}`} onClick={() => setScreen('grn')}>Inward Receiving</button>
          <button className={`module-nav-btn${screen === 'wip' ? ' active' : ''}`} onClick={() => setScreen('wip')}>Packing Hall</button>
          <button className={`module-nav-btn${screen === 'admin' ? ' active' : ''}`} onClick={() => setScreen('admin')}>Admin</button>
        </div>
        <div className="module-switcher-right">
          <span className="view-badge">Live</span>
        </div>
      </header>
      {error ? (
        <div className="main-viewport" style={{ paddingTop: 12 }}>
          <div className="alert-banner">
            <span className="alert-banner-icon">!</span>
            <span>{error}</span>
            <button type="button" className="btn-outline" onClick={loadAll}>Retry</button>
          </div>
        </div>
      ) : null}
      {screen === 'grn' ? <GRNScreen /> : screen === 'wip' ? <WIPScreen /> : <AdminScreen />}
    </>
  );
}
