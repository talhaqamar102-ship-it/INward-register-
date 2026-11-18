import {
  SizeBreakdown,
  formatSizeColumnLabel,
  resolveScaleKeysForBreakdown,
  inferSizeFormatFromCodes,
  formatCurrentDateDDMMYYYY,
  escapeHtml,
  normalizeBaseReqNumber,
  getMaterialReqNumber,
  getAlterationReqNumber,
  calculateSizeTotal
} from './sizingAndCatalog';

export interface PackingRequisitionSlipParams {
  reqNo: string;
  date: string;
  po?: string;
  article: string;
  sizes: SizeBreakdown;
  totalPairs?: number;
  issueStatus?: 'Pending Inward Issue' | 'Issued by Inward Register';
  sizeFormat?: string;
  sizeCodes?: string[];
}

export function buildPackingRequisitionSlipHtml(params: PackingRequisitionSlipParams): string {
  const baseReq = normalizeBaseReqNumber(params.reqNo);
  const mReq = getMaterialReqNumber(baseReq);
  const aReq = getAlterationReqNumber(baseReq);
  const sizeSum = calculateSizeTotal(params.sizes);
  const pairs = params.totalPairs !== undefined && params.totalPairs > 0 ? params.totalPairs : sizeSum;
  const article = params.article || '---';
  const dateStr = params.date || formatCurrentDateDDMMYYYY();
  const issueStatus = params.issueStatus || 'Pending Inward Issue';
  const activeCodes = resolveScaleKeysForBreakdown(params.sizes, params.sizeCodes);
  const activeFormat = inferSizeFormatFromCodes(activeCodes, params.sizeFormat);

  return `
    <div class="printable-slip-box">
      <div class="printable-slip-header">
        <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-950);">HAMMAD INDUSTRIES &bull; PACKING HALL REQUISITION SLIP</h2>
        <p style="margin: 2px 0 0; font-size: 11px; text-transform: uppercase; color: var(--ink-600);">
          Packing Floor &bull; Unified Production, Material (M) &amp; Alteration (A) Requisition
        </p>
      </div>
      <div class="printable-meta-grid">
        <div><span>Requisition #:</span> <strong>${baseReq}</strong></div>
        <div><span>Date:</span> <strong>${dateStr}</strong></div>
        <div><span>Material Req # (M):</span> <strong>${mReq}</strong></div>
        <div><span>Alteration Bay # (A):</span> <strong>${aReq}</strong></div>
        <div><span>Article:</span> <strong>${escapeHtml(article)}</strong></div>
        <div><span>Asking Quantity:</span> <strong>${pairs.toLocaleString()} Pairs</strong></div>
        <div><span>Dock Store Status:</span> <strong>${issueStatus}</strong></div>
        <div><span>Origin Station:</span> <strong>Packing Hall #1</strong></div>
      </div>

      <div style="font-weight: 700; color: var(--ink-950); margin: 8px 0 4px; font-size: 11.5px; text-transform: uppercase;">
        Article &amp; Size Breakdown Allocation (Pairs &bull; Scale: ${escapeHtml(activeFormat)})
      </div>
      <table class="size-matrix-table" style="margin-bottom: 12px;">
        <thead>
          <tr>
            <th>Article</th>
            ${activeCodes.map(sz => `<th>${escapeHtml(formatSizeColumnLabel(sz, activeFormat))}</th>`).join('')}
            <th style="background: var(--ink-200); color: var(--ink-950);">Total Pairs</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>${escapeHtml(article)}</strong></td>
            ${activeCodes.map(sz => `<td>${Number(params.sizes?.[sz] || 0).toLocaleString()} Prs</td>`).join('')}
            <td style="font-weight: 800; color: var(--ink-950);">${pairs.toLocaleString()} Pairs</td>
          </tr>
        </tbody>
      </table>

      <div style="font-weight: 700; color: var(--ink-950); margin: 8px 0 4px; font-size: 11.5px; text-transform: uppercase;">
        Material Requisition (${mReq}) &mdash; Packaging Trims &amp; Accessories
      </div>
      <table class="size-matrix-table" style="margin-bottom: 14px;">
        <thead>
          <tr>
            <th>Item Code</th>
            <th>Material Description</th>
            <th>Article</th>
            <th style="text-align: right;">Required Qty</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>ACC-POLY-STD</td>
            <td>Heavy Duty Protective Polybag (1/Pr)</td>
            <td>${article}</td>
            <td style="text-align: right; font-weight: bold;">${pairs.toLocaleString()} pcs</td>
          </tr>
          <tr>
            <td>ACC-TAG-STD</td>
            <td>Article Hangtag / Rider Card (1/Pr)</td>
            <td>${article}</td>
            <td style="text-align: right; font-weight: bold;">${pairs.toLocaleString()} pcs</td>
          </tr>
          <tr>
            <td>ACC-SILICA-2G</td>
            <td>Silica Gel Moisture Sachet 2g (1/Pr)</td>
            <td>${article}</td>
            <td style="text-align: right; font-weight: bold;">${pairs.toLocaleString()} pouches</td>
          </tr>
          <tr>
            <td>STICKER_BARCODE</td>
            <td>EAN-13 Scannable Barcode Sticker (2/Pr)</td>
            <td>${article}</td>
            <td style="text-align: right; font-weight: bold;">${(pairs * 2).toLocaleString()} pcs</td>
          </tr>
        </tbody>
      </table>

      <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 11px; margin-top: 22px; border-top: 1px dashed var(--ink-500); padding-top: 10px; white-space: nowrap;">
        <span>Packing Hall Supervisor: _____________</span>
        <span>Issued By: _____________</span>
        <span>Approved By: _____________</span>
      </div>
    </div>
  `;
}

/**
 * 1.4 — Dedicated monochrome Material Requisition Slip (M-REQ) builder.
 */
export function buildMaterialRequisitionSlipHtml(params: {
  mreqNo: string;
  reqNo: string;
  orderId: string;
  article: string;
  pairs: number;
  status: string;
  date?: string;
}): string {
  const baseReq = normalizeBaseReqNumber(params.reqNo || params.mreqNo);
  const mReq = getMaterialReqNumber(baseReq);
  const pairs = Math.max(0, Number(params.pairs || 0));
  const cartons = Math.max(1, Math.ceil(pairs / 60));
  const dateStr = params.date || formatCurrentDateDDMMYYYY();

  return `
    <div class="printable-slip-box">
      <div class="printable-slip-header">
        <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-950);">HAMMAD INDUSTRIES &bull; STAGE 4 MATERIAL REQUISITION SLIP (M-REQ)</h2>
        <p style="margin: 2px 0 0; font-size: 11px; text-transform: uppercase; color: var(--ink-600);">
          1st Packing (Polybag &amp; Trims) &bull; Official Packaging Accessories Issue Voucher
        </p>
      </div>
      <div class="printable-meta-grid">
        <div><span>Material Req #:</span> <strong>${mReq}</strong></div>
        <div><span>Parent Requisition #:</span> <strong>${baseReq}</strong></div>
        <div><span>Master Order #:</span> <strong>${params.orderId || '---'}</strong></div>
        <div><span>Article:</span> <strong>${params.article || '---'}</strong></div>
        <div><span>Target Batch Pairs:</span> <strong>${pairs.toLocaleString()} Pairs</strong></div>
        <div><span>Trim Store Status:</span> <strong>${params.status || 'Issued'} (${dateStr})</strong></div>
      </div>

      <table class="size-matrix-table" style="margin-bottom: 14px;">
        <thead>
          <tr>
            <th>Trim Code</th>
            <th>Packaging Component Description</th>
            <th>Ratio</th>
            <th style="text-align: right;">Issued Qty</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>ACC-POLY-STD</td>
            <td>Individual Polybag Sleeve</td>
            <td>1 / Pair</td>
            <td style="text-align: right; font-weight: 700;">${pairs.toLocaleString()} pcs</td>
          </tr>
          <tr>
            <td>ACC-TAG-STD</td>
            <td>Brand Hangtag + Care Instruction Card</td>
            <td>1 / Pair</td>
            <td style="text-align: right; font-weight: 700;">${pairs.toLocaleString()} pcs</td>
          </tr>
          <tr>
            <td>ACC-SILICA-2G</td>
            <td>Desiccant Silica Gel Sachet (2g)</td>
            <td>1 / Pair</td>
            <td style="text-align: right; font-weight: 700;">${pairs.toLocaleString()} pouches</td>
          </tr>
          <tr>
            <td>CTN-MASTER-60</td>
            <td>5-Ply Corrugated Master Carton (60 Prs/Box)</td>
            <td>1 / 60 Prs</td>
            <td style="text-align: right; font-weight: 700;">${cartons.toLocaleString()} boxes</td>
          </tr>
        </tbody>
      </table>

      <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 11px; margin-top: 22px; border-top: 1px dashed var(--ink-500); padding-top: 10px; white-space: nowrap;">
        <span>Stage 4 Lead Sign: _____________</span>
        <span>Trim Store Issuer: _____________</span>
        <span>Final QC Gate Sign: _____________</span>
      </div>
    </div>
  `;
}

/**
 * 1.4 — Dedicated monochrome Alteration Route Slip (A-REQ) builder.
 */
export function buildAlterationRouteSlipHtml(params: {
  altReqNo: string;
  reqNo: string;
  orderId: string;
  article: string;
  maker: string;
  inAlterationPairs: number;
  scrappedPairs: number;
  cycleCount: number;
  date?: string;
}): string {
  const baseReq = normalizeBaseReqNumber(params.reqNo || params.altReqNo);
  const aReq = getAlterationReqNumber(baseReq);
  const dateStr = params.date || formatCurrentDateDDMMYYYY();

  return `
    <div class="printable-slip-box">
      <div class="printable-slip-header">
        <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-950);">HAMMAD INDUSTRIES &bull; ALTERATION &amp; REWORK ROUTE SLIP (A-REQ)</h2>
        <p style="margin: 2px 0 0; font-size: 11px; text-transform: uppercase; color: var(--ink-600);">
          Alteration Bay &bull; 2-Cycle Rework Limit &amp; Scrap Condemnation Voucher
        </p>
      </div>
      <div class="printable-meta-grid">
        <div><span>Alteration Slip #:</span> <strong>${aReq}</strong></div>
        <div><span>Parent Requisition #:</span> <strong>${baseReq}</strong></div>
        <div><span>Master Order #:</span> <strong>${params.orderId || '---'}</strong></div>
        <div><span>Contractor / Maker:</span> <strong>${params.maker || '---'}</strong></div>
        <div><span>Article:</span> <strong>${params.article || '---'}</strong></div>
        <div><span>Date:</span> <strong>${dateStr}</strong></div>
      </div>

      <table class="size-matrix-table" style="margin-bottom: 14px;">
        <thead>
          <tr>
            <th>Alteration Ref</th>
            <th>Rework Cycle</th>
            <th style="text-align: right;">Active Rework Pairs</th>
            <th style="text-align: right;">Condemned Scrap (Debit)</th>
            <th>Routing Policy</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>${aReq}</strong></td>
            <td>Cycle ${Math.min(2, Math.max(1, params.cycleCount || 1))}/2</td>
            <td style="text-align: right; font-weight: 700;">${Number(params.inAlterationPairs || 0).toLocaleString()} Pairs</td>
            <td style="text-align: right; font-weight: 700;">${Number(params.scrappedPairs || 0).toLocaleString()} Pairs</td>
            <td>Repaired &rarr; Stage 1 Re-Inspection | Cycle 2/2 Fail &rarr; Scrap</td>
          </tr>
        </tbody>
      </table>

      <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 11px; margin-top: 22px; border-top: 1px dashed var(--ink-500); padding-top: 10px; white-space: nowrap;">
        <span>QC Inspector Sign: _____________</span>
        <span>Alteration Bay Lead: _____________</span>
        <span>Contractor Debit Ack: _____________</span>
      </div>
    </div>
  `;
}

export interface GrnSlipParams {
  grnRef?: string;
  pendingOrderId?: string;
  date: string;
  maker: string;
  article: string;
  color?: string;
  receivedFrom?: string;
  splitSummary?: string;
  rcvdPairs: number;
  sizes: SizeBreakdown;
  sizeFormat?: string;
  sizeCodes?: string[];
}

export function buildGrnReceivingSlipHtml(params: GrnSlipParams): string {
  const pendingOrderId = params.pendingOrderId || '---';
  const article = params.article || '---';
  const color = params.color || 'Standard';
  const maker = params.maker || '---';
  const receivedFrom = params.receivedFrom || maker || '---';
  const dateStr = params.date || formatCurrentDateDDMMYYYY();
  const grnRef = params.grnRef || 'GRN-2026-0001';
  const sizeTotal = calculateSizeTotal(params.sizes);
  const rcvd = params.rcvdPairs > 0 ? params.rcvdPairs : sizeTotal;
  const activeCodes = resolveScaleKeysForBreakdown(params.sizes, params.sizeCodes);
  const activeFormat = inferSizeFormatFromCodes(activeCodes, params.sizeFormat);

  return `
    <div class="printable-slip-box">
      <div class="printable-slip-header">
        <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-950);">HAMMAD INDUSTRIES &bull; INWARD GOODS RECEIVING SLIP</h2>
        <p style="margin: 2px 0 0; font-size: 11px; text-transform: uppercase; color: var(--ink-600);">
          Dock Receiving Register &bull; Official Received Goods Voucher
        </p>
      </div>
      <div class="printable-meta-grid">
        <div><span>GRN Reference:</span> <strong>${escapeHtml(grnRef)}</strong></div>
        <div><span>Receiving Date:</span> <strong>${escapeHtml(dateStr)}</strong></div>
        <div><span>Pending Order #:</span> <strong>${escapeHtml(pendingOrderId)}</strong></div>
        <div><span>Maker / Contractor:</span> <strong>${escapeHtml(maker)}</strong></div>
        ${params.splitSummary ? `<div><span>Order Split:</span> <strong>${escapeHtml(params.splitSummary)}</strong></div>` : ''}
        <div><span>Article / Model:</span> <strong>${escapeHtml(article)}</strong></div>
        <div><span>Colour / Shade:</span> <strong>${escapeHtml(color)}</strong></div>
        <div><span>Received From:</span> <strong>${escapeHtml(receivedFrom)}</strong></div>
        <div><span>Total Received:</span> <strong>${rcvd.toLocaleString()} Pairs</strong></div>
      </div>

      <div style="font-weight: 700; color: var(--ink-950); margin: 8px 0 4px; font-size: 11.5px; text-transform: uppercase;">
        Article &amp; Received Size Breakdown Allocation (Pairs &bull; Scale: ${escapeHtml(activeFormat)})
      </div>
      <table class="size-matrix-table" style="width: 100%; border-collapse: collapse; margin: 8px 0 12px; font-size: 12px;">
        <thead>
          <tr style="background: var(--ink-100); color: var(--ink-950);">
            <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Article / Colour</th>
            ${activeCodes.map(sz => `<th style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">${escapeHtml(formatSizeColumnLabel(sz, activeFormat))}</th>`).join('')}
            <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: center; background: var(--ink-200); font-weight: 800;">Total Received</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: left; font-weight: 700;">${escapeHtml(article)} (${escapeHtml(color)})</td>
            ${activeCodes.map(sz => `<td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">${Number(params.sizes?.[sz] || 0).toLocaleString()} Prs</td>`).join('')}
            <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center; font-weight: 800; color: var(--ink-950); font-size: 13px;">${rcvd.toLocaleString()} Pairs</td>
          </tr>
        </tbody>
      </table>

      <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 11px; margin-top: 24px; border-top: 1px dashed var(--ink-500); padding-top: 8px; white-space: nowrap;">
        <span>Received From: <strong>${escapeHtml(receivedFrom)}</strong></span>
        <span>Dock Receiver: _____________</span>
        <span>Store Head Sign: _____________</span>
      </div>
    </div>
  `;
}

export function buildGrnReceiveConfirmationHtml(params: {
  pendingOrderId: string;
  date: string;
  splitSummary?: string;
  batches: GrnSlipParams[];
}): string {
  const totalPairs = params.batches.reduce((sum, b) => sum + Number(b.rcvdPairs || calculateSizeTotal(b.sizes) || 0), 0);
  const dateStr = params.date || formatCurrentDateDDMMYYYY();
  const splitLabel = params.splitSummary || '';
  const grnRefs = params.batches.map(b => b.grnRef || 'GRN').join(', ');
  const senderSummary = params.batches
    .map(b => {
      const who = String(b.receivedFrom || b.maker || '---').trim();
      const makerName = String(b.maker || '').trim();
      return params.batches.length > 1 && makerName
        ? `${who} (${makerName}: ${Number(b.rcvdPairs || 0).toLocaleString()} Prs)`
        : `${who} (${makerName || 'Direct'})`;
    })
    .join(' • ');
  const slipsHtml = params.batches
    .map(b => buildGrnReceivingSlipHtml({ ...b, splitSummary: b.splitSummary || splitLabel || undefined }))
    .join('<div style="margin-top: 14px; border-top: 1px dashed var(--border-strong); padding-top: 14px;"></div>');

  return `
    <div class="grn-confirm-banner" data-testid="grn-receive-confirmation" style="background: var(--ink-50); border: 1px solid var(--border-strong); border-radius: 4px; padding: 10px 12px; margin-bottom: 12px; font-size: 12.5px; color: var(--ink-950);">
      <div style="font-weight: 800; margin-bottom: 4px;">
        Receiving Confirmed &mdash; ${escapeHtml(grnRefs)} (${escapeHtml(dateStr)})
      </div>
      <div>
        Received <strong>${totalPairs.toLocaleString()} Pairs</strong> from <strong>${escapeHtml(senderSummary)}</strong>
        for Order <strong>${escapeHtml(params.pendingOrderId || '---')}</strong>.
      </div>
      ${splitLabel ? `<div style="margin-top: 4px; font-size: 11.5px; color: var(--ink-700);">Order Split Among: <strong>${escapeHtml(splitLabel)}</strong></div>` : ''}
    </div>
    <div id="doc-preview-container">
      ${slipsHtml}
    </div>
  `;
}
