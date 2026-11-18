import { escapeHtml } from '../../utils/requisitionLogic';
import type { SuperUserRenderContext } from './types';

export function buildSuperUserReportHtml(ctx: SuperUserRenderContext): {
  title: string;
  html: string;
  csvFilename: string;
  csvRows: Record<string, unknown>[];
} {
  const s = ctx.rollupSummary;
  const ov = ctx.adminOverview;
  const reportType = ctx.activeReport || 'order_grn_balance';

  if (reportType === 'order_grn_balance') {
    const csvRows = s.orderRollups.map(o => ({
      Order_ID: o.orderId,
      Buyer: o.buyer,
      Contractor_Maker: o.maker,
      PO_Number: o.po,
      Article: o.article,
      Colour: o.color,
      Planned_Pairs: o.plannedQty,
      GRN_Batches_Count: o.grnBatches.length,
      Received_GRN_Pairs: o.receivedGrnQty,
      Contractor_Balance_Pairs: o.contractorBalanceQty,
      Dock_Available_Pool: o.dockAvailableQty,
      Reconciliation_Status: o.reconciliation.badgeText,
      Status: o.orderStatus
    }));

    const rowsHtml =
      s.orderRollups.length === 0
        ? `<tr><td colspan="11" style="border: 1px solid var(--border-strong); padding: 14px; text-align: center;">No orders recorded in database.</td></tr>`
        : s.orderRollups
            .map(
              o => `
        <tr>
          <td style="border: 1px solid var(--border-strong); padding: 6px; font-weight: 700;">${escapeHtml(o.orderId)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px;">${escapeHtml(o.buyer)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px;">${escapeHtml(o.maker)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; font-weight: 700;">${escapeHtml(o.po)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px;">${escapeHtml(o.article)} (${escapeHtml(o.color)})</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">${o.grnBatches.map(g => `${escapeHtml(g.grnCode)}(${g.rcvdPairs})`).join(', ') || 'None'}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right; font-weight: 700;">${o.plannedQty.toLocaleString()}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right; font-weight: 700;">${o.receivedGrnQty.toLocaleString()}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right; font-weight: 700;">${o.contractorBalanceQty.toLocaleString()}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center; font-weight: 700;">${escapeHtml(o.reconciliation.badgeText)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">${escapeHtml(o.orderStatus)}</td>
        </tr>
      `
            )
            .join('');

    const html = `
      <div class="printable-slip-box">
        <div class="printable-slip-header">
          <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-950);">HAMMAD INDUSTRIES &bull; ORDER VS. INWARD GRN &amp; CONTRACTOR BALANCE REPORT</h2>
          <p style="margin: 2px 0 0; font-size: 11px; text-transform: uppercase; color: var(--ink-600);">
            Super User Reconciliation Statement &bull; Parent Order to Multiple GRN Batches (0001, 0002...)
          </p>
        </div>
        <div class="printable-meta-grid">
          <div><span>Total Master Orders:</span> <strong>${s.totalOrders}</strong></div>
          <div><span>Total Planned Pairs:</span> <strong>${s.totalPlannedPairs.toLocaleString()} Pairs</strong></div>
          <div><span>Total Received (GRNs):</span> <strong>${s.totalReceivedGrnPairs.toLocaleString()} Pairs (${s.totalGrnCount} Batches)</strong></div>
          <div><span>Contractor Balance Owed:</span> <strong>${s.totalContractorBalancePairs.toLocaleString()} Pairs</strong></div>
        </div>
        <div style="font-size: 11px; padding: 6px 10px; margin-bottom: 8px; border: 1px solid var(--border-strong); background: var(--ink-50);">
          <strong>Reconciliation Rule:</strong> <code>Planned (${s.totalPlannedPairs}) = Received GRNs (${s.totalReceivedGrnPairs}) + Contractor Balance (${s.totalContractorBalancePairs})</code> and <code>Received GRNs (${s.totalReceivedGrnPairs}) = Dock Pool (${s.totalDockAvailablePairs}) + Issued to REQs (${s.totalIssuedReqPairs})</code>.
        </div>
        <table class="size-matrix-table" style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11.5px;">
          <thead>
            <tr style="background: var(--ink-100); color: var(--ink-950);">
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Order #</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Buyer</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Contractor / Maker</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">PO #</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Article &amp; Colour</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">Child GRN Batches</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Planned</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Received</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Balance</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">Reconcile</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">Order Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 22px; border-top: 1px dashed var(--ink-500); padding-top: 8px;">
          <span>Dock Store Head: ___________________</span>
          <span>Production Controller: ___________________</span>
          <span>Super User Approval: ___________________</span>
        </div>
      </div>
    `;

    return {
      title: 'Order vs. Inward GRN & Contractor Balance Report',
      html,
      csvFilename: 'Report_1_Order_vs_GRN_Balance.csv',
      csvRows
    };
  }

  if (reportType === 'req_traceability') {
    const allReqs = s.orderRollups.flatMap(o => o.reqBatches);
    const csvRows = allReqs.map(r => ({
      Parent_Order: r.parentOrderId,
      Order_Batch_Seq: `#${String(r.orderReqSeq).padStart(4, '0')}`,
      Requisition_No: r.reqNumber,
      Source_GRNs: r.allocatedFromGrns.map(a => `${a.grnCode}:${a.pairs}`).join('|'),
      Material_Req_M: r.mreqNo,
      Alteration_Ref_A: r.altReqNo,
      Article: r.article,
      PO_Number: r.po,
      Issued_Pairs: r.issuedPairs,
      Floor_WIP_Pairs: r.inFloorWipPairs,
      Stage4_Ready_For_QC: r.stage4Passed,
      In_Alteration_Pairs: r.inAlterationPairs,
      Scrapped_Pairs: r.scrappedPairs,
      Stage5_Packed_Pairs: r.packedStage5Pairs,
      Reconciliation: r.reconciliation.badgeText,
      Lifecycle_Status: r.reqLifecycleStatus
    }));

    const rowsHtml =
      allReqs.length === 0
        ? `<tr><td colspan="11" style="border: 1px solid var(--border-strong); padding: 14px; text-align: center;">No Packing Hall Requisitions (REQ) generated yet.</td></tr>`
        : allReqs
            .map(
              r => `
        <tr>
          <td style="border: 1px solid var(--border-strong); padding: 6px; font-weight: 700;">${escapeHtml(r.parentOrderId)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; font-family: monospace; font-weight: 700;">${escapeHtml(r.reqNumber)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; font-family: monospace;">${escapeHtml(r.mreqNo)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; font-family: monospace;">${escapeHtml(r.altReqNo)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px;">${escapeHtml(r.article)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right; font-weight: 700;">${r.issuedPairs.toLocaleString()}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">${r.inFloorWipPairs.toLocaleString()}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">${r.inAlterationPairs} / ${r.scrappedPairs}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right; font-weight: 700;">${r.packedStage5Pairs.toLocaleString()}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center; font-weight: 700;">${escapeHtml(r.reconciliation.badgeText)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">${escapeHtml(r.reqLifecycleStatus)}</td>
        </tr>
      `
            )
            .join('');

    const html = `
      <div class="printable-slip-box">
        <div class="printable-slip-header">
          <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-950);">HAMMAD INDUSTRIES &bull; ORDER-TO-REQUISITION (REQ / M-REQ / A-REQ) TRACEABILITY LEDGER</h2>
          <p style="margin: 2px 0 0; font-size: 11px; text-transform: uppercase; color: var(--ink-600);">
            5-Stage Packing Hall Execution &bull; Stage 4 Final QC Gate &amp; Pair Reconciliation
          </p>
        </div>
        <div class="printable-meta-grid">
          <div><span>Total Requisitions:</span> <strong>${s.totalReqCount} REQs</strong></div>
          <div><span>Total Issued to Floor:</span> <strong>${s.totalIssuedReqPairs.toLocaleString()} Pairs</strong></div>
          <div><span>Stage 4 Hold (Awaiting QC):</span> <strong>${s.stage4ReadyForQcPairs.toLocaleString()} Pairs</strong></div>
          <div><span>Stage 5 Sealed Output:</span> <strong>${s.stage5PackedPairs.toLocaleString()} Pairs (${s.stage5PackedCartons} Cartons)</strong></div>
        </div>
        <div style="font-size: 11px; padding: 6px 10px; margin-bottom: 8px; border: 1px solid var(--border-strong); background: var(--ink-50);">
          <strong>Reconciliation Rule:</strong> Per-REQ Floor Gate: <code>Issued (${s.totalIssuedReqPairs}) = Floor WIP (${s.totalFloorWipPairs}) + Stage 5 Packed (${s.stage5PackedPairs}) + Active Alteration (${s.totalAlterationPairs}) + Scrapped (${s.totalScrappedPairs})</code>.
        </div>
        <table class="size-matrix-table" style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11.5px;">
          <thead>
            <tr style="background: var(--ink-100); color: var(--ink-950);">
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Parent Order</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">REQ #</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Material (M)</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Alteration (A)</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Article</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Issued</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Floor WIP</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Alter / Scrap</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Packed (S5)</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">Reconcile</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 22px; border-top: 1px dashed var(--ink-500); padding-top: 8px;">
          <span>Packing Hall Manager: ___________________</span>
          <span>QA Lead Inspector: ___________________</span>
          <span>Super User Approval: ___________________</span>
        </div>
      </div>
    `;

    return {
      title: 'Order-to-Requisition (REQ / M-REQ / A-REQ) Traceability Ledger',
      html,
      csvFilename: 'Report_2_Order_Requisition_Traceability.csv',
      csvRows
    };
  }

  if (reportType === 'contractor_scrap') {
    const csvRows = s.orderRollups.map(o => ({
      Order_ID: o.orderId,
      Contractor_Maker: o.maker,
      PO_Number: o.po,
      Article: o.article,
      Received_Pairs: o.receivedGrnQty,
      Active_Alteration_Pairs: o.inAlterationQty,
      Condemned_Scrap_Pairs: o.scrappedQty,
      Estimated_Debit_PKR: o.scrappedQty * 150
    }));

    const totalDebit =
      ov.scrapLedger.reduce(
        (sum: number, x: any) => sum + Number(x.financial_deduction_amount || 0),
        0
      ) || s.totalScrappedPairs * 150;

    const rowsHtml =
      s.orderRollups.length === 0
        ? `<tr><td colspan="7" style="border: 1px solid var(--border-strong); padding: 14px; text-align: center;">No contractor quality or scrap entries recorded.</td></tr>`
        : s.orderRollups
            .map(
              o => `
        <tr>
          <td style="border: 1px solid var(--border-strong); padding: 6px; font-weight: 700;">${escapeHtml(o.orderId)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; font-weight: 700;">${escapeHtml(o.maker)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px;">${escapeHtml(o.po)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px;">${escapeHtml(o.article)}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">${o.receivedGrnQty.toLocaleString()}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right; font-weight: 700;">${o.inAlterationQty.toLocaleString()}</td>
          <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right; font-weight: 700;">${o.scrappedQty.toLocaleString()} (PKR ${(o.scrappedQty * 150).toLocaleString()})</td>
        </tr>
      `
            )
            .join('');

    const html = `
      <div class="printable-slip-box">
        <div class="printable-slip-header">
          <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-950);">HAMMAD INDUSTRIES &bull; CONTRACTOR QUALITY, ALTERATION (A-REQ) &amp; SCRAP DEDUCTION STATEMENT</h2>
          <p style="margin: 2px 0 0; font-size: 11px; text-transform: uppercase; color: var(--ink-600);">
            Alteration Bay #2 Rework Audit &bull; Max 2-Cycle Condemned Scrap Financial Debit Note
          </p>
        </div>
        <div class="printable-meta-grid">
          <div><span>Active Alteration Pairs:</span> <strong>${s.totalAlterationPairs.toLocaleString()} Pairs</strong></div>
          <div><span>Total Condemned Scrap:</span> <strong>${s.totalScrappedPairs.toLocaleString()} Pairs</strong></div>
          <div><span>SQLite Alteration Batches:</span> <strong>${ov.alterations.length} Batches</strong></div>
          <div><span>Total Financial Deduction:</span> <strong>PKR ${totalDebit.toLocaleString()}</strong></div>
        </div>
        <div style="font-size: 11px; padding: 6px 10px; margin-bottom: 8px; border: 1px solid var(--border-strong); background: var(--ink-50);">
          <strong>Reconciliation Rule:</strong> Any pair failing Cycle 2/2 in Alteration Bay is automatically condemned to Scrap and debited at PKR 150/Pr (<code>${s.totalScrappedPairs} Scrapped Prs &times; PKR 150 = PKR ${(s.totalScrappedPairs * 150).toLocaleString()}</code>).
        </div>
        <table class="size-matrix-table" style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11.5px;">
          <thead>
            <tr style="background: var(--ink-100); color: var(--ink-950);">
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Order #</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Contractor / Maker</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">PO #</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Article</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Received Pairs</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Active Rework (A-REQ)</th>
              <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Condemned Scrap &amp; Debit</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 22px; border-top: 1px dashed var(--ink-500); padding-top: 8px;">
          <span>Alteration Bay Lead: ___________________</span>
          <span>Accounts / Finance: ___________________</span>
          <span>Super User Approval: ___________________</span>
        </div>
      </div>
    `;

    return {
      title: 'Contractor Quality, Alteration (A-REQ) & Scrap Deduction Statement',
      html,
      csvFilename: 'Report_3_Contractor_Alteration_Scrap.csv',
      csvRows
    };
  }

  const csvRows = s.orderRollups.map(o => ({
    Order_ID: o.orderId,
    Buyer: o.buyer,
    PO_Number: o.po,
    Article: o.article,
    Planned_Pairs: o.plannedQty,
    Stage4_Awaiting_QC_Pairs: o.awaitingFinalQcQty,
    Stage5_Packed_Pairs: o.packedStage5Qty,
    Stage5_Master_Cartons: o.packedStage5Cartons,
    Scrapped_Pairs: o.scrappedQty,
    Reconciliation: o.reconciliation.badgeText,
    Dispatch_Status: o.orderStatus
  }));

  const rowsHtml =
    s.orderRollups.length === 0
      ? `<tr><td colspan="9" style="border: 1px solid var(--border-strong); padding: 14px; text-align: center;">No dispatch or Final QC records available.</td></tr>`
      : s.orderRollups
          .map(
            o => `
      <tr>
        <td style="border: 1px solid var(--border-strong); padding: 6px; font-weight: 700;">${escapeHtml(o.orderId)}</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px;">${escapeHtml(o.buyer)}</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px; font-weight: 700;">${escapeHtml(o.po)}</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px;">${escapeHtml(o.article)}</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">${o.awaitingFinalQcQty.toLocaleString()} Prs</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right; font-weight: 700;">${o.packedStage5Qty.toLocaleString()} Prs</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: right; font-weight: 700;">${o.packedStage5Cartons} Ctns</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center; font-weight: 700;">${escapeHtml(o.reconciliation.badgeText)}</td>
        <td style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">${escapeHtml(o.orderStatus)}</td>
      </tr>
    `
          )
          .join('');

  const html = `
    <div class="printable-slip-box">
      <div class="printable-slip-header">
        <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-950);">HAMMAD INDUSTRIES &bull; FINAL QC (AQL 1.5) &amp; STAGE 5 EXPORT DISPATCH MANIFEST</h2>
        <p style="margin: 2px 0 0; font-size: 11px; text-transform: uppercase; color: var(--ink-600);">
          ISO 2859-1 Level II Final Inspection Gate &bull; Master Carton Sealing &amp; Container Release
        </p>
      </div>
      <div class="printable-meta-grid">
        <div><span>Orders Completed:</span> <strong>${s.completedOrders} / ${s.totalOrders}</strong></div>
        <div><span>Stage 4 Holding for QC:</span> <strong>${s.stage4ReadyForQcPairs.toLocaleString()} Pairs</strong></div>
        <div><span>Stage 5 Sealed Pairs:</span> <strong>${s.stage5PackedPairs.toLocaleString()} Pairs</strong></div>
        <div><span>Master Export Cartons:</span> <strong>${s.stage5PackedCartons} Cartons</strong></div>
      </div>
      <div style="font-size: 11px; padding: 6px 10px; margin-bottom: 8px; border: 1px solid var(--border-strong); background: var(--ink-50);">
        <strong>Reconciliation Rule:</strong> Stage 5 Master Carton Packing is locked until Final QC passes after Stage 4. Order closes as <code>COMPLETED &amp; DISPATCHED</code> when <code>Received &ge; Planned</code>, <code>Dock Pool = 0</code>, and <code>Stage 5 Packed + Scrapped = Issued</code>.
      </div>
      <table class="size-matrix-table" style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11.5px;">
        <thead>
          <tr style="background: var(--ink-100); color: var(--ink-950);">
            <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Order #</th>
            <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Buyer</th>
            <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">PO #</th>
            <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: left;">Article</th>
            <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Stage 4 Hold (QC)</th>
            <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Stage 5 Packed</th>
            <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: right;">Master Cartons</th>
            <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">Reconcile</th>
            <th style="border: 1px solid var(--border-strong); padding: 6px; text-align: center;">Closure Status</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
      <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 22px; border-top: 1px dashed var(--ink-500); padding-top: 8px;">
        <span>Final QC Inspector: ___________________</span>
        <span>Dispatch Gate Officer: ___________________</span>
        <span>Super User Approval: ___________________</span>
      </div>
    </div>
  `;

  return {
    title: 'Final QC (AQL 1.5) & Stage 5 Export Dispatch Manifest',
    html,
    csvFilename: 'Report_4_Final_QC_Dispatch_Manifest.csv',
    csvRows
  };
}

export function renderReportVisualChart(ctx: SuperUserRenderContext): string {
  const s = ctx.rollupSummary;
  const activeRep = ctx.activeReport || 'order_grn_balance';

  if (activeRep === 'order_grn_balance') {
    if (s.orderRollups.length === 0) return '';
    return `
      <section class="panel-card" style="padding: 12px 16px; margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <strong style="font-size: 12px; text-transform: uppercase; color: var(--su-text-primary);">Visual Graph: Order Planned vs. Received GRNs vs. Contractor Balance</strong>
          <div style="display: flex; gap: 12px; font-size: 11px; color: var(--su-text-secondary);">
            <span><span style="display: inline-block; width: 10px; height: 10px; background: var(--su-grn-primary); margin-right: 4px;"></span>Received GRNs</span>
            <span><span style="display: inline-block; width: 10px; height: 10px; background: var(--su-grn-fill-soft); border: 1px solid var(--su-grn-border); margin-right: 4px;"></span>Contractor Balance Owed</span>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; font-variant-numeric: tabular-nums;">
          ${s.orderRollups
            .map(o => {
              const plan = Math.max(1, o.plannedQty || o.receivedGrnQty || 1);
              const rcvdPct = Math.min(100, Math.round((o.receivedGrnQty / plan) * 100));
              return `
              <div style="display: grid; grid-template-columns: 180px 1fr 170px; align-items: center; gap: 10px; font-size: 11.5px;">
                <div>
                  <strong style="color: var(--su-req-primary);">${escapeHtml(o.orderId)}</strong> <span style="color: var(--su-text-muted);">(${escapeHtml(o.maker)})</span>
                </div>
                <div style="height: 14px; background: var(--su-grn-fill-soft); border: 1px solid var(--su-grn-border); border-radius: 3px; overflow: hidden; display: flex;">
                  <div style="width: ${rcvdPct}%; height: 100%; background: var(--su-grn-primary);"></div>
                </div>
                <div style="text-align: right; font-family: var(--font-mono); font-size: 11px;">
                  <strong style="color: var(--su-grn-dark);">${o.receivedGrnQty.toLocaleString()}</strong> / ${o.plannedQty.toLocaleString()} Prs (${rcvdPct}%)
                </div>
              </div>
            `;
            })
            .join('')}
        </div>
      </section>
    `;
  }

  if (activeRep === 'req_traceability') {
    const allReqs = s.orderRollups.flatMap(o => o.reqBatches);
    if (allReqs.length === 0) return '';
    return `
      <section class="panel-card" style="padding: 12px 16px; margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <strong style="font-size: 12px; text-transform: uppercase; color: var(--su-text-primary);">Visual Graph: Requisition (REQ &rarr; M &amp; A) Stage Execution Progress</strong>
          <div style="display: flex; gap: 12px; font-size: 11px; color: var(--su-text-secondary);">
            <span><span style="display: inline-block; width: 10px; height: 10px; background: var(--su-complete-primary); margin-right: 4px;"></span>Stage 5 Packed</span>
            <span><span style="display: inline-block; width: 10px; height: 10px; background: var(--su-mreq-primary); margin-right: 4px;"></span>Floor WIP / Stage 4 Hold</span>
            <span><span style="display: inline-block; width: 10px; height: 10px; background: var(--su-areq-primary); margin-right: 4px;"></span>Alteration (A) / Scrap</span>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; font-variant-numeric: tabular-nums;">
          ${allReqs
            .map(r => {
              const base = Math.max(1, r.askingPairs || r.issuedPairs || 1);
              const s5Pct = Math.min(100, Math.round((r.packedStage5Pairs / base) * 100));
              const wipPct = Math.min(100 - s5Pct, Math.round((r.inFloorWipPairs / base) * 100));
              const altPct = Math.min(
                100 - s5Pct - wipPct,
                Math.round(((r.inAlterationPairs + r.scrappedPairs) / base) * 100)
              );
              return `
              <div style="display: grid; grid-template-columns: 220px 1fr 170px; align-items: center; gap: 10px; font-size: 12px;">
                <div style="font-family: var(--font-mono); font-size: 12px;">
                  <strong style="color: var(--su-req-primary);">${escapeHtml(r.reqNumber)}</strong> <span style="color: var(--su-text-muted);">(${escapeHtml(r.parentOrderId)})</span>
                </div>
                <div style="height: 14px; background: var(--su-bg-tertiary); border: 1px solid var(--su-border); border-radius: 3px; overflow: hidden; display: flex;">
                  <div style="width: ${s5Pct}%; height: 100%; background: var(--su-complete-primary);"></div>
                  <div style="width: ${wipPct}%; height: 100%; background: var(--su-mreq-primary);"></div>
                  <div style="width: ${altPct}%; height: 100%; background: var(--su-areq-primary);"></div>
                </div>
                <div style="text-align: right; font-family: var(--font-mono); font-size: 12px;">
                  S5: <strong style="color: var(--su-complete-dark);">${r.packedStage5Pairs}</strong> | WIP: <strong style="color: var(--su-mreq-dark);">${r.inFloorWipPairs}</strong>
                </div>
              </div>
            `;
            })
            .join('')}
        </div>
      </section>
    `;
  }

  return '';
}

export function renderReportsTab(ctx: SuperUserRenderContext): string {
  const activeRep = ctx.activeReport || 'order_grn_balance';
  const built = buildSuperUserReportHtml(ctx);

  return `
    <section class="panel-card" style="padding: 12px 16px; margin-bottom: 14px;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          <button
            type="button"
            class="${activeRep === 'order_grn_balance' ? 'btn-primary' : 'btn-outline'} admin-report-select-btn"
            data-report-type="order_grn_balance"
            data-report-id="order_grn_balance"
            style="padding: 6px 12px; font-size: 11.5px;"
          >
            1. Order vs. Inward GRN Balance
          </button>
          <button
            type="button"
            class="${activeRep === 'req_traceability' ? 'btn-primary' : 'btn-outline'} admin-report-select-btn"
            data-report-type="req_traceability"
            data-report-id="req_traceability"
            style="padding: 6px 12px; font-size: 11.5px;"
          >
            2. Order-to-Requisition (REQ / M / A) Ledger
          </button>
          <button
            type="button"
            class="${activeRep === 'contractor_scrap' ? 'btn-primary' : 'btn-outline'} admin-report-select-btn"
            data-report-type="contractor_scrap"
            data-report-id="contractor_scrap"
            style="padding: 6px 12px; font-size: 11.5px;"
          >
            3. Contractor Alteration &amp; Scrap Statement
          </button>
          <button
            type="button"
            class="${activeRep === 'final_qc_dispatch' ? 'btn-primary' : 'btn-outline'} admin-report-select-btn"
            data-report-type="final_qc_dispatch"
            data-report-id="final_qc_dispatch"
            style="padding: 6px 12px; font-size: 11.5px;"
          >
            4. Final QC &amp; Stage 5 Dispatch Manifest
          </button>
        </div>

        <div style="display: flex; gap: 8px;">
          <button type="button" class="btn-outline" id="btn-admin-export-report-csv" style="padding: 6px 12px; font-size: 11.5px;">
            Export Report CSV
          </button>
          <button type="button" class="btn-primary" id="btn-admin-print-report" style="padding: 6px 14px; font-size: 11.5px;">
            Print Official A4 Report
          </button>
        </div>
      </div>
    </section>

    ${renderReportVisualChart(ctx)}

    <section class="panel-card" style="padding: 16px;" id="admin-report-preview-surface">
      <div class="su-report-sheet-wrap">
        ${built.html}
      </div>
    </section>
  `;
}
