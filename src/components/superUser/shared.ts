import {
  DeliveryCountdownInfo,
  SuperUserDashboardSummary,
  SuperUserOrderRollup,
  ReconciliationResult,
  prioritizeAndSliceChips,
  escapeHtml
} from '../../utils/requisitionLogic';

export function renderReconciliationBadge(rec: ReconciliationResult): string {
  if (rec.isReconciled) {
    return `<span class="su-badge su-badge-reconciled" title="${escapeHtml(rec.detail)}">RECONCILED &#10003;</span>`;
  }
  const deltaSign = rec.deltaPairs > 0 ? `+${rec.deltaPairs}` : `${rec.deltaPairs}`;
  return `<span class="su-badge su-badge-variance" title="${escapeHtml(rec.detail)}">VARIANCE &Delta; (${deltaSign} Prs &bull; ${escapeHtml(rec.failingGate)})</span>`;
}

export function renderDeliveryCountdownChip(cd?: DeliveryCountdownInfo, showTimelineBar = false): string {
  if (!cd || (!cd.hasDueDate && cd.status !== 'DELIVERED')) {
    return `<span class="su-countdown-badge" data-testid="order-countdown-badge">No Due Date</span>`;
  }
  const toneClass = cd.status === 'OVERDUE'
    ? 'is-overdue'
    : cd.status === 'DUE_SOON'
      ? 'is-soon'
      : cd.status === 'DELIVERED'
        ? 'is-delivered'
        : 'is-ontrack';
  const fillClass = cd.status === 'OVERDUE'
    ? 'is-overdue'
    : cd.status === 'DELIVERED'
      ? 'is-delivered'
      : '';
  const dueTitle = cd.dueDate ? `Delivery Due: ${cd.dueDate}` : 'Delivery Timeline';
  return `
    <span class="su-countdown-badge ${toneClass}" data-testid="order-countdown-badge" title="${escapeHtml(dueTitle)}">
      ${escapeHtml(cd.badgeText)}${cd.dueDate ? ` (${escapeHtml(cd.dueDate)})` : ''}
    </span>
    ${showTimelineBar && cd.hasDueDate ? `
      <div class="su-timeline-track" title="${escapeHtml(dueTitle)} &bull; ${cd.progressPct}% elapsed">
        <div class="su-timeline-fill ${fillClass}" style="width: ${cd.progressPct}%;"></div>
      </div>
    ` : ''}
  `;
}

export function renderStageMiniTrack(activeStage: string, awaitingQc: boolean, isClosed: boolean): string {
  const stages = [
    { key: 'STEP_1', label: 'S1' },
    { key: 'STEP_2', label: 'S2' },
    { key: 'STEP_3', label: 'S3' },
    { key: 'STEP_4', label: awaitingQc ? 'S4 (Hold QC)' : 'S4' },
    { key: 'STEP_5', label: 'S5' }
  ];
  const stageOrder = ['STEP_1', 'STEP_2', 'STEP_3', 'STEP_4', 'STEP_5', 'COMPLETED'];
  const currentIdx = isClosed ? 5 : stageOrder.indexOf(activeStage);

  return `
    <div style="display: inline-flex; align-items: center; gap: 4px; font-family: var(--font-mono); font-size: 11px;">
      ${stages
        .map((s, idx) => {
          const isDone = currentIdx > idx || isClosed;
          const isCurrent = !isClosed && (currentIdx === idx || (awaitingQc && idx === 3));
          const isHoldQc = isCurrent && awaitingQc && idx === 3;
          const bg = isHoldQc
            ? 'var(--su-mreq-primary)'
            : isCurrent
              ? 'var(--su-req-primary)'
              : isDone
                ? 'var(--su-complete-bg)'
                : 'var(--su-bg-primary)';
          const color = isCurrent
            ? 'var(--su-white)'
            : isDone
              ? 'var(--su-complete-dark)'
              : 'var(--su-text-secondary)';
          const border = isHoldQc
            ? 'var(--su-mreq-dark)'
            : isCurrent
              ? 'var(--su-req-deep)'
              : isDone
                ? 'var(--su-complete-border)'
                : 'var(--su-border)';
          return `<span style="padding: 1px 5px; border: 1px solid ${border}; background: ${bg}; color: ${color}; border-radius: 3px; font-weight: ${isCurrent || isDone ? '700' : '500'}; white-space: nowrap;">${s.label}${isDone ? '&#10003;' : ''}</span>`;
        })
        .join('<span style="color: var(--su-text-muted);">&rarr;</span>')}
    </div>
  `;
}

export function renderDashboardVisualGraphs(s: SuperUserDashboardSummary): string {
  const maxStageVal = Math.max(
    1,
    s.totalPlannedPairs,
    s.totalReceivedGrnPairs,
    s.totalDockAvailablePairs,
    s.stage1WipPairs + s.stage2WipPairs + s.stage3WipPairs,
    s.stage4ReadyForQcPairs,
    s.totalAlterationPairs + s.totalScrappedPairs,
    s.stage5PackedPairs
  );

  const stageBars = [
    {
      step: '01',
      label: 'Master Orders',
      sub: `${s.totalOrders} Orders`,
      pairs: s.totalPlannedPairs,
      pctOfPlan: s.totalPlannedPairs > 0 ? 100 : 0,
      fill: 'var(--su-req-deep)',
      border: 'var(--su-req-primary)',
      textColor: 'var(--su-req-deep)',
      filter: 'ALL'
    },
    {
      step: '02',
      label: 'Received GRNs',
      sub: `${s.totalGrnCount} GRN Batches`,
      pairs: s.totalReceivedGrnPairs,
      pctOfPlan:
        s.totalPlannedPairs > 0
          ? Math.round((s.totalReceivedGrnPairs / s.totalPlannedPairs) * 100)
          : 0,
      fill: 'var(--su-grn-primary)',
      border: 'var(--su-grn-dark)',
      textColor: 'var(--su-grn-dark)',
      filter: 'RECEIVING'
    },
    {
      step: '03',
      label: 'Dock Pool',
      sub: 'Unissued Stock',
      pairs: s.totalDockAvailablePairs,
      pctOfPlan:
        s.totalPlannedPairs > 0
          ? Math.round((s.totalDockAvailablePairs / s.totalPlannedPairs) * 100)
          : 0,
      fill: 'var(--su-grn-accent)',
      border: 'var(--su-grn-primary)',
      textColor: 'var(--su-grn-deep)',
      filter: 'RECEIVING'
    },
    {
      step: '04',
      label: 'Floor WIP (S1–S3)',
      sub: `S1:${s.stage1WipPairs} S2:${s.stage2WipPairs} S3:${s.stage3WipPairs}`,
      pairs: s.stage1WipPairs + s.stage2WipPairs + s.stage3WipPairs,
      pctOfPlan:
        s.totalPlannedPairs > 0
          ? Math.round(
              ((s.stage1WipPairs + s.stage2WipPairs + s.stage3WipPairs) / s.totalPlannedPairs) * 100
            )
          : 0,
      fill: 'var(--su-req-accent)',
      border: 'var(--su-req-primary)',
      textColor: 'var(--su-req-primary)',
      filter: 'WIP'
    },
    {
      step: '05',
      label: 'Stage 4 Hold (QC)',
      sub: `${s.stage4HoldReqs.length} Lots Await AQL`,
      pairs: s.stage4ReadyForQcPairs,
      pctOfPlan:
        s.totalPlannedPairs > 0
          ? Math.round((s.stage4ReadyForQcPairs / s.totalPlannedPairs) * 100)
          : 0,
      fill: 'var(--su-mreq-primary)',
      border: 'var(--su-mreq-dark)',
      textColor: 'var(--su-mreq-dark)',
      filter: 'HOLD_QC'
    },
    {
      step: '06',
      label: 'Alteration (A-REQ)',
      sub: `Rework:${s.totalAlterationPairs} Scrap:${s.totalScrappedPairs}`,
      pairs: s.totalAlterationPairs + s.totalScrappedPairs,
      pctOfPlan:
        s.totalPlannedPairs > 0
          ? Math.round(((s.totalAlterationPairs + s.totalScrappedPairs) / s.totalPlannedPairs) * 100)
          : 0,
      fill: 'var(--su-areq-primary)',
      border: 'var(--su-areq-dark)',
      textColor: 'var(--su-areq-primary)',
      filter: 'WIP'
    },
    {
      step: '07',
      label: 'Stage 5 Cartons',
      sub: `${s.stage5PackedCartons} Sealed Ctns`,
      pairs: s.stage5PackedPairs,
      pctOfPlan:
        s.totalPlannedPairs > 0
          ? Math.round((s.stage5PackedPairs / s.totalPlannedPairs) * 100)
          : 0,
      fill: 'var(--su-complete-primary)',
      border: 'var(--su-complete-dark)',
      textColor: 'var(--su-complete-dark)',
      filter: 'COMPLETED'
    }
  ];

  return `
    <div class="two-column-grid" style="margin-bottom: 14px; grid-template-columns: 1.15fr 1fr;">
      <section class="panel-card" style="margin-bottom: 0;">
        <div class="panel-card-header">
          <div class="panel-card-title">
            <span>Factory Pipeline Volume Graph (Pairs by Stage)</span>
          </div>
          <span class="admin-meta-caption">Click any stage bar to filter Live Tracking</span>
        </div>
        <div style="padding: 16px 16px 12px; font-variant-numeric: tabular-nums;">
          ${
            s.orderRollups.length === 0
              ? `
            <div class="su-empty-cta-box">
              <div style="font-size: 13px; font-weight: 800; color: var(--su-text-primary);">
                No active orders in the production pipeline yet
              </div>
              <div style="font-size: 12px; color: var(--su-text-muted); max-width: 380px;">
                Create a Master Order in <strong>Order Creation</strong> to start tracking Receiving, WIP, Alteration, and Stage 5 Carton volumes.
              </div>
              <button type="button" class="btn-primary" data-admin-tab-jump="orders">
                Create First Master Order
              </button>
            </div>
          `
              : `
          <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; align-items: end; height: 185px; padding-top: 22px; border-bottom: 2px solid var(--su-axis-border);">
            ${stageBars
              .map(b => {
                const barHeightPx =
                  b.pairs > 0 ? Math.max(14, Math.round((b.pairs / maxStageVal) * 128)) : 4;
                return `
                <button
                  type="button"
                  class="su-stage-bar-btn"
                  data-tracking-filter="${b.filter}"
                  aria-label="Filter Live Tracking by ${escapeHtml(b.label)}: ${b.pairs.toLocaleString()} Pairs (${b.pctOfPlan}% of Order Book)"
                  title="${escapeHtml(b.label)}: ${b.pairs.toLocaleString()} Pairs (${b.pctOfPlan}% of Order Book)"
                >
                  <span style="font-size: 11px; font-weight: 800; color: ${b.textColor}; margin-bottom: 2px; white-space: nowrap;">
                    ${b.pairs.toLocaleString()}
                  </span>
                  <span style="font-size: 11px; color: var(--su-text-muted); margin-bottom: 5px;">
                    ${b.pctOfPlan}%
                  </span>
                  <span style="display: block; width: 72%; height: ${barHeightPx}px; background: ${b.fill}; border: 1.5px solid ${b.border}; border-bottom: none; border-radius: 3px 3px 0 0; transition: height 0.2s ease;"></span>
                </button>
              `;
              })
              .join('')}
          </div>
          <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; padding-top: 8px; text-align: center;">
            ${stageBars
              .map(
                b => `
              <div>
                <div style="font-family: var(--font-mono); font-size: 11px; font-weight: 800; color: ${b.textColor};">${b.step}</div>
                <div style="font-size: 11px; font-weight: 800; color: var(--su-text-primary); line-height: 1.2; margin-top: 1px;">${b.label}</div>
                <div style="font-size: 11px; color: var(--su-text-muted); margin-top: 2px; line-height: 1.15;">${b.sub}</div>
              </div>
            `
              )
              .join('')}
          </div>
          `
          }
        </div>
      </section>

      <section class="panel-card" style="margin-bottom: 0;">
        <div class="panel-card-header">
          <div class="panel-card-title">
            <span>Order &rarr; GRN &rarr; REQ (M &amp; A) Visual Flow Graph</span>
          </div>
          <span class="admin-meta-caption">1 Parent Order &rarr; N GRNs &amp; N REQs</span>
        </div>
        <div style="padding: 12px 14px; max-height: 245px; overflow-y: auto; font-variant-numeric: tabular-nums;">
          ${
            s.orderRollups.length === 0
              ? `
            <div style="padding: 16px; border: 1px dashed var(--su-border); border-radius: 6px; background: var(--su-bg-primary); text-align: center;">
              <div style="font-size: 12px; font-weight: 800; color: var(--su-text-primary); margin-bottom: 8px;">
                Architecture Blueprint: 1 Order &rarr; Multiple GRNs &amp; Multiple REQs
              </div>
              <div style="display: flex; align-items: center; justify-content: center; gap: 8px; font-family: var(--font-mono); font-size: 11px; flex-wrap: wrap; margin-bottom: 8px;">
                <span class="su-badge su-badge-req">ORD-2026-001</span>
                <span style="color: var(--su-text-muted);">&rarr;</span>
                <span class="su-badge su-badge-grn">GRN-0001, 0002...</span>
                <span style="color: var(--su-text-muted);">&rarr;</span>
                <span class="su-badge su-badge-req">REQ-0001</span>
                <span class="su-badge su-badge-mreq">M-0001</span>
                <span class="su-badge su-badge-areq">A-0001</span>
              </div>
              <div style="font-size: 11px; color: var(--su-text-secondary);">
                Create a Master Order in <strong>Order Creation</strong> or open the <strong>Demo Scenario Controls</strong> drawer above to see its live visual node tree.
              </div>
            </div>
          `
              : s.orderRollups
                  .map(o => {
                    const plan = Math.max(1, o.plannedQty || o.receivedGrnQty || 1);
                    const rcvdPct = Math.min(100, Math.round((o.receivedGrnQty / plan) * 100));
                    const s5Pct = Math.min(100, Math.round((o.packedStage5Qty / plan) * 100));
                    const s4Pct = Math.min(
                      100 - s5Pct,
                      Math.round((o.awaitingFinalQcQty / plan) * 100)
                    );
                    const wipOnly = Math.max(0, o.inFloorWipQty - o.awaitingFinalQcQty);
                    const wipPct = Math.min(
                      100 - s5Pct - s4Pct,
                      Math.round((wipOnly / plan) * 100)
                    );
                    const altPct = Math.min(
                      100 - s5Pct - s4Pct - wipPct,
                      Math.round(((o.inAlterationQty + o.scrappedQty) / plan) * 100)
                    );

                    return `
              <div style="border: 1px solid var(--su-border); border-radius: 5px; padding: 10px 12px; margin-bottom: 10px; background: var(--su-white);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; gap: 6px; flex-wrap: wrap;">
                  <div>
                    <strong style="font-size: 12.5px; color: var(--su-req-primary);">${escapeHtml(o.orderId)}</strong>
                    <span style="font-size: 11px; color: var(--su-text-secondary); margin-left: 6px;">${escapeHtml(o.buyer)} &bull; ${escapeHtml(o.article)} &bull; Plan: <strong>${o.plannedQty.toLocaleString()} Prs</strong></span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    ${renderReconciliationBadge(o.reconciliation)}
                    <button type="button" class="table-btn" style="font-size: 11px; padding: 2px 8px;" data-su-action="inspect-order" data-order-id="${escapeHtml(o.orderId)}">Inspect Graph &rarr;</button>
                  </div>
                </div>

                <div style="display: grid; grid-template-columns: 95px 1fr 48px; align-items: center; gap: 8px; font-size: 11px; margin-bottom: 4px;">
                  <span style="color: var(--su-grn-dark); font-weight: 700;">GRN Supply:</span>
                  <div style="height: 8px; background: var(--su-grn-fill-soft); border: 1px solid var(--su-grn-border); border-radius: 2px; overflow: hidden;">
                    <div style="width: ${rcvdPct}%; height: 100%; background: var(--su-grn-primary);"></div>
                  </div>
                  <span style="text-align: right; font-weight: 800; color: var(--su-grn-dark);">${rcvdPct}%</span>
                </div>

                <div style="display: grid; grid-template-columns: 95px 1fr 48px; align-items: center; gap: 8px; font-size: 12px; margin-bottom: 8px;">
                  <span style="color: var(--su-req-primary); font-weight: 700;">REQ Execution:</span>
                  <div style="height: 8px; background: var(--su-bg-tertiary); border: 1px solid var(--su-border); border-radius: 2px; overflow: hidden; display: flex;">
                    <div style="width: ${s5Pct}%; height: 100%; background: var(--su-complete-primary);" title="Stage 5 Packed: ${o.packedStage5Qty} Prs"></div>
                    <div style="width: ${s4Pct}%; height: 100%; background: var(--su-mreq-primary);" title="Stage 4 Hold QC: ${o.awaitingFinalQcQty} Prs"></div>
                    <div style="width: ${wipPct}%; height: 100%; background: var(--su-req-accent);" title="Stages 1-3 WIP: ${wipOnly} Prs"></div>
                    <div style="width: ${altPct}%; height: 100%; background: var(--su-areq-primary);" title="Alteration/Scrap: ${o.inAlterationQty + o.scrappedQty} Prs"></div>
                  </div>
                  <span style="text-align: right; font-weight: 800; color: var(--su-complete-dark);">${s5Pct}% S5</span>
                </div>

                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-family: var(--font-mono); font-size: 12px; background: var(--su-bg-primary); padding: 6px 8px; border-radius: 4px; border: 1px solid var(--su-border-subtle);">
                  <span style="font-weight: 800; color: var(--su-req-primary);">${escapeHtml(o.orderId)}</span>
                  <span style="color: var(--su-text-muted);">&rarr;</span>
                  ${
                    o.grnBatches.length === 0
                      ? `<span style="color: var(--su-text-muted);">[0 GRNs]</span>`
                      : o.grnBatches
                          .map(
                            g =>
                              `<button type="button" class="su-chip-btn su-badge su-badge-grn" style="font-size: 12px; padding: 1px 6px;" data-su-action="inspect-order" data-order-id="${escapeHtml(o.orderId)}" data-ref-code="${escapeHtml(g.grnCode)}">${escapeHtml(g.grnCode)} (${g.rcvdPairs})</button>`
                          )
                          .join('')
                  }
                  <span style="color: var(--su-text-muted);">&rarr;</span>
                  ${
                    o.reqBatches.length === 0
                      ? `<span style="color: var(--su-text-muted);">[0 REQs]</span>`
                      : o.reqBatches
                          .map(
                            r =>
                              `<button type="button" class="su-chip-btn su-badge su-badge-req" style="font-size: 12px; padding: 1px 6px;" data-su-action="inspect-order" data-order-id="${escapeHtml(o.orderId)}" data-ref-code="${escapeHtml(r.reqNumber)}">${escapeHtml(r.reqNumber)} &rarr; <span style="color: var(--su-mreq-dark);">${escapeHtml(r.mreqNo)}</span> | <span style="color: var(--su-areq-primary);">${escapeHtml(r.altReqNo)}</span> (${r.askingPairs})</button>`
                          )
                          .join('')
                  }
                </div>
              </div>
            `;
                  })
                  .join('')
          }
        </div>
      </section>
    </div>
  `;
}

export function renderOrderGrnChipsWithOverflow(ord: SuperUserOrderRollup): string {
  if (ord.grnBatches.length === 0) {
    return `<span style="font-size: 11px; color: var(--su-text-muted);">0 GRNs</span>`;
  }
  const scored = ord.grnBatches.map(g => ({
    item: g,
    priorityScore: g.allocationStatus === 'UNALLOCATED' ? 2 : g.allocationStatus === 'PARTIALLY ALLOCATED' ? 1 : 0,
    seq: g.orderBatchSeq
  }));
  const sliced = prioritizeAndSliceChips(scored, 3);

  return `
    <div style="display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; align-items: center;">
      ${sliced.visible
        .map(({ item: g }) => `
          <span style="display: inline-flex; align-items: center; gap: 2px;">
            <button
              type="button"
              class="su-chip-btn su-badge su-badge-grn"
              style="font-size: 11px; padding: 1px 6px;"
              title="${escapeHtml(g.grnCode)}: ${g.rcvdPairs} Prs (${escapeHtml(g.allocationStatus)}) — Click to inspect in Live Tracking"
              data-su-action="inspect-order"
              data-order-id="${escapeHtml(ord.orderId)}"
              data-ref-code="${escapeHtml(g.grnCode)}"
            >${escapeHtml(g.grnCode)} (${g.rcvdPairs})</button>
            <button
              type="button"
              class="su-chip-btn"
              style="font-size: 11px; padding: 1px 4px; background: var(--su-bg-primary); color: var(--su-text-secondary);"
              title="Open Printable GRN Slip (${escapeHtml(g.grnCode)})"
              data-su-action="open-slip"
              data-slip-type="GRN"
              data-ref-code="${escapeHtml(g.grnCode)}"
              data-order-id="${escapeHtml(ord.orderId)}"
            >Slip</button>
          </span>
        `)
        .join('')}
      ${
        sliced.overflowCount > 0
          ? `<button type="button" class="su-chip-btn su-badge su-badge-grn" style="font-size: 11px; padding: 1px 6px;" data-su-action="inspect-order" data-order-id="${escapeHtml(ord.orderId)}">+${sliced.overflowCount} more</button>`
          : ''
      }
    </div>
  `;
}

export function renderOrderReqChipsWithOverflow(ord: SuperUserOrderRollup): string {
  if (ord.reqBatches.length === 0) {
    return `<span style="font-size: 11px; color: var(--su-text-muted);">0 REQs</span>`;
  }
  const scored = ord.reqBatches.map(r => ({
    item: r,
    priorityScore:
      !r.reconciliation.isReconciled
        ? 4
        : r.inAlterationPairs > 0
          ? 3
          : r.awaitingFinalQc
            ? 2
            : r.reqLifecycleStatus !== 'CLOSED ✓'
              ? 1
              : 0,
    seq: r.orderReqSeq
  }));
  const sliced = prioritizeAndSliceChips(scored, 3);

  return `
    <div style="display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; align-items: center;">
      ${sliced.visible
        .map(({ item: r }) => `
          <span style="display: inline-flex; align-items: center; gap: 2px;">
            <button
              type="button"
              class="su-chip-btn su-badge su-badge-req"
              style="font-size: 11px; padding: 1px 6px;"
              title="${escapeHtml(r.reqNumber)} | ${escapeHtml(r.mreqNo)} | ${escapeHtml(r.altReqNo)} (${r.issuedPairs || r.askingPairs} Prs) — Click to inspect in Live Tracking"
              data-su-action="inspect-order"
              data-order-id="${escapeHtml(ord.orderId)}"
              data-ref-code="${escapeHtml(r.reqNumber)}"
            >${escapeHtml(r.reqNumber)}&middot;M&middot;A (${r.issuedPairs || r.askingPairs})</button>
            <button
              type="button"
              class="su-chip-btn"
              style="font-size: 11px; padding: 1px 4px; background: var(--su-bg-primary); color: var(--su-text-secondary);"
              title="Open Printable REQ Slip (${escapeHtml(r.reqNumber)})"
              data-su-action="open-slip"
              data-slip-type="REQ"
              data-ref-code="${escapeHtml(r.reqNumber)}"
              data-order-id="${escapeHtml(ord.orderId)}"
            >Slip</button>
          </span>
        `)
        .join('')}
      ${
        sliced.overflowCount > 0
          ? `<button type="button" class="su-chip-btn su-badge su-badge-req" style="font-size: 11px; padding: 1px 6px;" data-su-action="inspect-order" data-order-id="${escapeHtml(ord.orderId)}">+${sliced.overflowCount} more</button>`
          : ''
      }
    </div>
  `;
}

export function renderAdminNavIcon(section: 'dashboard' | 'tracking' | 'orders' | 'users' | 'reports'): string {
  switch (section) {
    case 'dashboard':
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>`;
    case 'tracking':
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`;
    case 'orders':
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`;
    case 'users':
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
    case 'reports':
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
  }
}
