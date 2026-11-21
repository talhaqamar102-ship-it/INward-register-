import {
  DeliveryCountdownInfo,
  SuperUserDashboardSummary,
  SuperUserOrderRollup,
  ReconciliationResult,
  OrderFlowTreeGroup,
  groupOrderRollupsForTree,
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

/* ---------- shared helpers (Dashboard + Live Tracking) ---------- */

const n = (v: unknown): string => Number(v || 0).toLocaleString('en-US');

export type RefKind = 'grn' | 'req' | 'mreq' | 'areq';

// Slip tag: reference code with a small type dot. With attrs it is a <button>, without it a plain <span>.
// `label` is escaped here; `meta` is trusted HTML (escape it at the call site).
export function renderRefTag(kind: RefKind, label: string, attrs = '', meta = ''): string {
  const tag = attrs ? 'button' : 'span';
  const btn = attrs ? ' type="button"' : '';
  const chip = attrs ? ' su-chip-btn' : '';
  return `<${tag}${btn} class="su-ref su-ref--${kind}${chip}" ${attrs}><i></i><span>${escapeHtml(label)}</span>${meta ? `<span class="su-ref-meta">${meta}</span>` : ''}</${tag}>`;
}

const ARROW = '<svg class="su-vg-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

export function renderDashboardVisualGraphs(s: SuperUserDashboardSummary): string {
  const floorWip = s.stage1WipPairs + s.stage2WipPairs + s.stage3WipPairs;
  const maxStageVal = Math.max(
    1,
    s.totalPlannedPairs,
    s.totalReceivedGrnPairs,
    s.totalDockAvailablePairs,
    floorWip,
    s.stage4ReadyForQcPairs,
    s.totalAlterationPairs + s.totalScrappedPairs,
    s.stage5PackedPairs
  );
  const pctOfPlan = (v: number): number => (s.totalPlannedPairs > 0 ? Math.round((v / s.totalPlannedPairs) * 100) : 0);

  const stageBars = [
    { step: '01', key: 'orders',   label: 'Master orders',      sub: `${n(s.totalOrders)} orders`,                                             pairs: s.totalPlannedPairs,                           pct: s.totalPlannedPairs > 0 ? 100 : 0,                               filter: 'ALL' },
    { step: '02', key: 'received', label: 'Received GRNs',      sub: `${n(s.totalGrnCount)} GRN batches`,                                      pairs: s.totalReceivedGrnPairs,                       pct: pctOfPlan(s.totalReceivedGrnPairs),                              filter: 'RECEIVING' },
    { step: '03', key: 'dock',     label: 'Dock pool',          sub: 'Unissued stock',                                                         pairs: s.totalDockAvailablePairs,                     pct: pctOfPlan(s.totalDockAvailablePairs),                            filter: 'RECEIVING' },
    { step: '04', key: 'wip',      label: 'Floor WIP (S1–S3)',  sub: `S1 ${n(s.stage1WipPairs)} · S2 ${n(s.stage2WipPairs)} · S3 ${n(s.stage3WipPairs)}`, pairs: floorWip,                          pct: pctOfPlan(floorWip),                                             filter: 'WIP' },
    { step: '05', key: 'hold',     label: 'Stage 4 hold (QC)',  sub: `${n(s.stage4HoldReqs.length)} lots await AQL`,                           pairs: s.stage4ReadyForQcPairs,                       pct: pctOfPlan(s.stage4ReadyForQcPairs),                              filter: 'HOLD_QC' },
    { step: '06', key: 'alt',      label: 'Alteration (A-REQ)', sub: `Rework ${n(s.totalAlterationPairs)} · Scrap ${n(s.totalScrappedPairs)}`, pairs: s.totalAlterationPairs + s.totalScrappedPairs, pct: pctOfPlan(s.totalAlterationPairs + s.totalScrappedPairs),        filter: 'WIP' },
    { step: '07', key: 'packed',   label: 'Stage 5 cartons',    sub: `${n(s.stage5PackedCartons)} sealed cartons`,                             pairs: s.stage5PackedPairs,                           pct: pctOfPlan(s.stage5PackedPairs),                                  filter: 'COMPLETED' }
  ];

  const emptyChart = `
    <div class="su-empty-cta-box">
      <div class="su-vg-empty-title">No active orders in the production pipeline yet</div>
      <div class="su-vg-empty-text">Create a master order in <strong>Order Creation</strong> to start tracking receiving, WIP, alteration and stage 5 carton volumes.</div>
      <button type="button" class="btn-primary" data-admin-tab-jump="orders">Create first order</button>
    </div>`;

  const chart = `
    <div class="su-vg-scroll" tabindex="0" role="region" aria-label="Pairs by stage">
      <div class="su-vg-cols">
        ${stageBars
          .map(b => {
            const h = b.pairs > 0 ? Math.max(14, Math.round((b.pairs / maxStageVal) * 128)) : 4;
            const desc = `${b.label}: ${n(b.pairs)} Pairs (${b.pct}% of Order Book)`;
            return `
        <button type="button" class="su-stage-bar-btn" data-tracking-filter="${b.filter}" aria-label="Filter Live Tracking by ${escapeHtml(desc)}" title="${escapeHtml(desc)}">
          <span class="su-vg-val">${n(b.pairs)}</span>
          <span class="su-vg-pct">${b.pct}%</span>
          <span class="su-vg-bar su-vg-bar--${b.key}" style="height:${h}px"></span>
        </button>`;
          })
          .join('')}
      </div>
      <div class="su-vg-labels">
        ${stageBars
          .map(
            b => `
        <div>
          <div class="su-vg-step">${b.step}</div>
          <div class="su-vg-label">${escapeHtml(b.label)}</div>
          <div class="su-vg-sub">${b.sub}</div>
        </div>`
          )
          .join('')}
      </div>
    </div>`;

  const emptyFlow = `
    <div class="su-vg-blueprint">
      <div class="su-vg-empty-title">One order, many GRNs and REQs</div>
      <div class="su-vg-chain su-vg-chain--center">
        ${renderRefTag('req', 'ORD-2026-001')}${ARROW}${renderRefTag('grn', 'GRN-0001, 0002')}${ARROW}${renderRefTag('req', 'REQ-0001')}${renderRefTag('mreq', 'M-0001')}${renderRefTag('areq', 'A-0001')}
      </div>
      <div class="su-vg-empty-text">Create a master order in <strong>Order Creation</strong>, or open the <strong>Demo scenarios</strong> drawer above, to see the live flow.</div>
    </div>`;

  const inspect = (orderId: string, ref?: string) =>
    `data-su-action="inspect-order" data-order-id="${escapeHtml(orderId)}"${ref ? ` data-ref-code="${escapeHtml(ref)}"` : ''}`;
  const openSlipAttrs = (type: 'GRN' | 'REQ' | 'M-REQ' | 'A-REQ', code: string, orderId: string) =>
    `data-su-action="open-slip" data-slip-type="${type}" data-ref-code="${escapeHtml(code)}" data-order-id="${escapeHtml(orderId)}"`;

  const renderOrderFlowChain = (o: SuperUserOrderRollup): string => `
    <div class="su-vg-chain">
      ${renderRefTag('req', o.orderId, inspect(o.orderId))}${ARROW}
      ${
        o.grnBatches.length === 0
          ? `<span class="su-ref-none">No GRNs</span>`
          : o.grnBatches.map(g => renderRefTag('grn', `${g.grnCode} (${n(g.rcvdPairs)})`, inspect(o.orderId, g.grnCode))).join('')
      }
      ${ARROW}
      ${
        o.reqBatches.length === 0
          ? `<span class="su-ref-none">No REQs</span>`
          : o.reqBatches
              .map(r => [
                renderRefTag('req', `${r.reqNumber} (${n(r.askingPairs)})`, inspect(o.orderId, r.reqNumber)),
                renderRefTag('mreq', r.mreqNo, openSlipAttrs('M-REQ', r.mreqNo, o.orderId)),
                renderRefTag('areq', r.altReqNo, openSlipAttrs('A-REQ', r.altReqNo, o.orderId))
              ].join(''))
              .join('')
      }
    </div>`;

  const orderCard = (o: SuperUserOrderRollup): string => {
    const plan = Math.max(1, o.plannedQty || o.receivedGrnQty || 1);
    const rcvdPct = Math.min(100, Math.round((o.receivedGrnQty / plan) * 100));
    const s5Pct = Math.min(100, Math.round((o.packedStage5Qty / plan) * 100));
    const s4Pct = Math.min(100 - s5Pct, Math.round((o.awaitingFinalQcQty / plan) * 100));
    const wipOnly = Math.max(0, o.inFloorWipQty - o.awaitingFinalQcQty);
    const wipPct = Math.min(100 - s5Pct - s4Pct, Math.round((wipOnly / plan) * 100));
    const altPct = Math.min(100 - s5Pct - s4Pct - wipPct, Math.round(((o.inAlterationQty + o.scrappedQty) / plan) * 100));
    const meta = [escapeHtml(o.buyer || ''), escapeHtml(o.article || ''), `${n(o.plannedQty)} pairs planned`].filter(Boolean).join(' · ');

    return `
      <div class="su-vg-order">
        <div class="su-vg-order-head">
          <div>
            <span class="su-vg-order-id">${escapeHtml(o.orderId)}</span>
            <span class="su-vg-order-meta">${meta}</span>
          </div>
          <div class="su-vg-order-actions">
            ${renderReconciliationBadge(o.reconciliation)}
            <button type="button" class="table-btn su-vg-link" data-su-action="inspect-order" data-order-id="${escapeHtml(o.orderId)}">Inspect</button>
          </div>
        </div>

        <div class="su-vg-row">
          <span class="su-vg-row-label">GRN supply</span>
          <div class="su-vg-track"><div class="su-vg-seg su-vg-seg--grn" style="width:${rcvdPct}%"></div></div>
          <span class="su-vg-row-pct">${rcvdPct}%</span>
        </div>
        <div class="su-vg-row">
          <span class="su-vg-row-label">REQ execution</span>
          <div class="su-vg-track">
            <div class="su-vg-seg su-vg-seg--s5"  style="width:${s5Pct}%"  title="Stage 5 packed: ${n(o.packedStage5Qty)} pairs"></div>
            <div class="su-vg-seg su-vg-seg--s4"  style="width:${s4Pct}%"  title="Stage 4 hold QC: ${n(o.awaitingFinalQcQty)} pairs"></div>
            <div class="su-vg-seg su-vg-seg--wip" style="width:${wipPct}%" title="Stages 1-3 WIP: ${n(wipOnly)} pairs"></div>
            <div class="su-vg-seg su-vg-seg--alt" style="width:${altPct}%" title="Alteration and scrap: ${n(o.inAlterationQty + o.scrappedQty)} pairs"></div>
          </div>
          <span class="su-vg-row-pct">${s5Pct}% S5</span>
        </div>

        ${renderOrderFlowChain(o)}
      </div>`;
  };

  const renderTreeGroupCard = (group: OrderFlowTreeGroup): string => {
    if (!group.isMultiSubOrder) {
      return orderCard(group.orders[0]);
    }
    const plan = Math.max(1, group.plannedQty || group.receivedGrnQty || 1);
    const grpRcvdPct = Math.min(100, Math.round((group.receivedGrnQty / plan) * 100));
    const grpS5Pct = Math.min(100, Math.round((group.packedStage5Qty / plan) * 100));
    const rootMeta = [
      escapeHtml(group.buyer),
      group.po ? `PO ${escapeHtml(group.po)}` : '',
      `${n(group.plannedQty)} pairs planned`
    ].filter(Boolean).join(' · ');

    return `
      <details class="su-tree-group" data-testid="su-order-tree-group" data-base-order="${escapeHtml(group.baseOrderId)}" open>
        <summary class="su-tree-root">
          <div class="su-tree-root-main">
            <span class="su-tree-caret" aria-hidden="true"></span>
            <span class="su-tree-root-id">${escapeHtml(group.baseOrderId)}</span>
            <span class="su-tree-count">${group.orders.length} sub-orders</span>
            <span class="su-vg-order-meta">${rootMeta}</span>
          </div>
          <div class="su-vg-order-actions">
            <span class="su-badge ${group.reconciledAll ? 'su-badge-reconciled' : 'su-badge-variance'}">${group.reconciledAll ? 'RECONCILED &#10003;' : 'VARIANCE &Delta;'}</span>
            <span class="su-tree-summary-pct">Rcvd ${grpRcvdPct}% &middot; S5 ${grpS5Pct}%</span>
            <button type="button" class="table-btn su-vg-link" data-su-action="inspect-order" data-order-id="${escapeHtml(group.baseOrderId)}">Filter all</button>
          </div>
        </summary>
        <ul class="su-tree-branches">
          ${group.orders.map(o => {
            const oPlan = Math.max(1, o.plannedQty || o.receivedGrnQty || 1);
            const oRcvdPct = Math.min(100, Math.round((o.receivedGrnQty / oPlan) * 100));
            const oS5Pct = Math.min(100, Math.round((o.packedStage5Qty / oPlan) * 100));
            return `
            <li class="su-tree-branch" data-sub-order="${escapeHtml(o.orderId)}">
              <div class="su-tree-branch-head">
                <div class="su-tree-branch-title">
                  ${renderRefTag('req', o.orderId, inspect(o.orderId))}
                  <span class="su-tree-branch-art">${escapeHtml(o.article)}${o.maker ? ` &middot; ${escapeHtml(o.maker)}` : ''} &middot; ${n(o.plannedQty)} prs</span>
                </div>
                <div class="su-tree-branch-meta">
                  ${renderReconciliationBadge(o.reconciliation)}
                  <span class="su-tree-branch-pct">Rcvd ${oRcvdPct}% &middot; S5 ${oS5Pct}%</span>
                </div>
              </div>
              ${renderOrderFlowChain(o)}
            </li>`;
          }).join('')}
        </ul>
      </details>`;
  };

  const treeGroups = groupOrderRollupsForTree(s.orderRollups);

  return `
    <div class="su-vg">
      <section class="panel-card">
        <div class="panel-card-header">
          <div class="panel-card-title"><span>Pipeline volume by stage</span></div>
          <span class="admin-meta-caption">Select a bar to filter live tracking</span>
        </div>
        <div class="su-vg-chart">${s.orderRollups.length === 0 ? emptyChart : chart}</div>
      </section>

      <section class="panel-card">
        <div class="panel-card-header">
          <div class="panel-card-title"><span>Order flow</span></div>
          <span class="admin-meta-caption">Order tree &middot; Parent &rarr; Sub-orders &rarr; GRNs &rarr; REQs</span>
        </div>
        <div class="su-vg-flow" tabindex="0" role="region" aria-label="Order flow">
          ${treeGroups.length === 0 ? emptyFlow : treeGroups.map(renderTreeGroupCard).join('')}
        </div>
      </section>
    </div>
  `;
}

export function renderOrderGrnChipsWithOverflow(ord: SuperUserOrderRollup): string {
  if (ord.grnBatches.length === 0) {
    return `<span class="su-ref-none">0 GRNs</span>`;
  }
  const scored = ord.grnBatches.map(g => ({
    item: g,
    priorityScore: g.allocationStatus === 'UNALLOCATED' ? 2 : g.allocationStatus === 'PARTIALLY ALLOCATED' ? 1 : 0,
    seq: g.orderBatchSeq
  }));
  const sliced = prioritizeAndSliceChips(scored, 3);

  return `
    <div class="su-chips">
      ${sliced.visible
        .map(({ item: g }) => `
        <span class="su-chip-pair">
          ${renderRefTag(
            'grn',
            `${g.grnCode} (${n(g.rcvdPairs)})`,
            `title="${escapeHtml(g.grnCode)}: ${n(g.rcvdPairs)} Prs (${escapeHtml(g.allocationStatus)}) — Click to inspect in Live Tracking" data-su-action="inspect-order" data-order-id="${escapeHtml(ord.orderId)}" data-ref-code="${escapeHtml(g.grnCode)}"`
          )}
          <button type="button" class="su-chip-btn su-ref-slip" title="Open Printable GRN Slip (${escapeHtml(g.grnCode)})" data-su-action="open-slip" data-slip-type="GRN" data-ref-code="${escapeHtml(g.grnCode)}" data-order-id="${escapeHtml(ord.orderId)}">Slip</button>
        </span>`)
        .join('')}
      ${
        sliced.overflowCount > 0
          ? `<button type="button" class="su-ref su-ref--more su-chip-btn" data-su-action="inspect-order" data-order-id="${escapeHtml(ord.orderId)}">+${sliced.overflowCount} more</button>`
          : ''
      }
    </div>
  `;
}

export function renderOrderReqChipsWithOverflow(ord: SuperUserOrderRollup): string {
  if (ord.reqBatches.length === 0) {
    return `<span class="su-ref-none">0 REQs</span>`;
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
    <div class="su-chips">
      ${sliced.visible
        .map(({ item: r }) => `
        <span class="su-chip-pair">
          ${renderRefTag(
            'req',
            `${r.reqNumber}·M·A (${n(r.issuedPairs || r.askingPairs)})`,
            `title="${escapeHtml(r.reqNumber)} | ${escapeHtml(r.mreqNo)} | ${escapeHtml(r.altReqNo)} (${n(r.issuedPairs || r.askingPairs)} Prs) — Click to inspect in Live Tracking" data-su-action="inspect-order" data-order-id="${escapeHtml(ord.orderId)}" data-ref-code="${escapeHtml(r.reqNumber)}"`
          )}
          <button type="button" class="su-chip-btn su-ref-slip" title="Open Printable REQ Slip (${escapeHtml(r.reqNumber)})" data-su-action="open-slip" data-slip-type="REQ" data-ref-code="${escapeHtml(r.reqNumber)}" data-order-id="${escapeHtml(ord.orderId)}">Slip</button>
        </span>`)
        .join('')}
      ${
        sliced.overflowCount > 0
          ? `<button type="button" class="su-ref su-ref--more su-chip-btn" data-su-action="inspect-order" data-order-id="${escapeHtml(ord.orderId)}">+${sliced.overflowCount} more</button>`
          : ''
      }
    </div>
  `;
}

export function renderAdminNavIcon(section: 'dashboard' | 'tracking' | 'orders' | 'users' | 'reports'): string {
  switch (section) {
    case 'dashboard':
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>`;
    case 'tracking':
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`;
    case 'orders':
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`;
    case 'users':
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
    case 'reports':
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
  }
}
