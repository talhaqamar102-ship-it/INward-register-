# Combined Implementation Checklist: Audit → Implement → Report

Merges both plans (Super User Control Center & Order-to-Requisition Hierarchy, and the Meridian Works MES Relational Hierarchy & Reconciliation Plan) plus the fixes from the plan review. Give this document to the AI agent as its working brief.

## How the AI Must Work

**Phase 0 — Audit first (read-only).** Do not change any code. Go through every item below and inspect the codebase. Mark each item `DONE`, `PARTIAL`, `MISSING` or `CONFLICT` (code contradicts the plan), and cite the file and function as evidence. Where the two plans disagree, use the **Resolved Conflicts** section.

**Phase 1 — Implement.** Work only on `PARTIAL`, `MISSING` and `CONFLICT` items, in the order of the sections below. Do not touch `DONE` items except to fix a test. For any item tagged `DECISION`, stop and ask the user before building it. Keep changes small and commit by section.

**Phase 2 — Verify.** Run the full test suite, the type-check and the build. Run the manual scenario in Section 11.

**Phase 3 — Report.** Produce the report in the format at the end of this document. Never mark an item `DONE` without evidence.

## Resolved Conflicts Between the Plans

- [ ] **R1.** Size labels: use the factory's real size set. Plan 1 says `7/S`–`11/XXL`, Plan 2 says `6–12`. `DECISION`: confirm the correct set with the user, then use one shared constant everywhere.
- [ ] **R2.** Colour: Plan 1 forbids hex literals (tokens only); Plan 2 lists hex values. Resolve by defining Plan 2's colours as named tokens scoped to `.superuser-command-center`, with no raw hex in components.
- [ ] **R3.** Terminology: "Dock #1" and "Gate" mean the same thing. Pick one term and use it in UI and code.
- [ ] **R4.** Plan 2 calls decisions "Confirmed" but asks for review. Treat Decisions 1–3 of Plan 2 and the 3 decisions of Plan 1 as confirmed.

## 1. Navigation and Views

- [ ] 1.1 Super User workspace has exactly four sub-views: `1. Dashboard`, `2. Live Tracking`, `3. Order Creation`, `4. Reports`, as a single-row segmented bar.
- [ ] 1.2 Legacy admin sub-tabs are removed or redirected.
- [ ] 1.3 Clicking a GRN or REQ chip on the Dashboard switches to Live Tracking with that Order expanded and scrolled into view.
- [ ] 1.4 Chips can also open the printable slip modal (`GRN`, `REQ`, `M-REQ`, `A-REQ`).

## 2. Data Model and Hierarchy

- [ ] 2.1 `Order` is the parent; it has many `GRN` batches and many `REQ` lots.
- [ ] 2.2 `GRN` stores `orderId`, date/time, size breakdown, batch total and allocation status.
- [ ] 2.3 Partial delivery does **not** delete the pending Order. The Order stays open until `Received >= Planned` or it is explicitly closed.
- [ ] 2.4 `REQ` stores `orderId` and has an auto-linked `M-REQ` and `A-REQ` (`M-REQ-0001`, `A-REQ-0001`, and so on).
- [ ] 2.5 **GRN → REQ allocation table with quantities** (replaces the bare `sourceGrnCodes` array): `reqId`, `grnId`, `pairs`, and per-size pairs. A REQ may draw from several GRNs; a GRN may feed several REQs.
- [ ] 2.6 `grnCodes` / `reqNumbers` on the Order are **derived** from foreign keys, not stored and hand-synchronised. If they must be stored for serialization, they are rebuilt from the FKs in one function.
- [ ] 2.7 Global sequential codes (`GRN-0001`, `REQ-0001`, `M-REQ-0001`, `A-REQ-0001`, `SCRAP-xxxx`) plus a per-order `Batch #n` shown in the UI.
- [ ] 2.8 Quantities tracked per size (not only total pairs) at Order, GRN, REQ and Stage 5 levels.
- [ ] 2.9 A written schema exists: tables, keys, status enums, indexes, and migration for existing pending orders and records.
- [ ] 2.10 `OrderTraceabilityItem` exposes `grnCodes`, `reqNumbers`, `mReqNumbers`, `aReqNumbers`, `dockReconciled`, `floorReconciled`, `dockVariancePairs`, `floorVariancePairs`, `isFullyReconciled`, `reconciliationSummary`.

## 3. Accounting and Reconciliation

- [ ] 3.1 Dock rule: `Total GRN Received = Issued to REQs + Dock Available Buffer`; `Issued` can never exceed `Received` for that Order.
- [ ] 3.2 Floor rule, per REQ: `Issued = Stage 1–3 WIP + Stage 4 QC Hold + Active Alteration + Scrap + Stage 5 Packed`.
- [ ] 3.3 Parent rule: `Planned ≥ Received ≥ Issued`; contractor balance = `Planned − Received`.
- [ ] 3.4 **Checks are not tautologies.** Each term comes from an independently recorded source (stock ledger or scan events), not from subtracting the other terms.
- [ ] 3.5 Per-order badge: `RECONCILED ✓` or `VARIANCE Δ` with the exact pair discrepancy and which gate (Dock or Floor) failed. Uses text plus icon, not colour alone.
- [ ] 3.6 Stage moves, QC release, alteration transfer and scrap entry are atomic, so a transient mid-move variance is never shown.
- [ ] 3.7 Reconciliation recalculates reactively on every committed change.
- [ ] 3.8 `DECISION`: receipt tolerance for over- and under-delivery, and the rule for closing a short-shipped Order.

## 4. Lifecycle and State Machine

- [ ] 4.1 Order and REQ status enums and a transition table (who or what triggers each transition, and the allowed edge cases) are documented and enforced in code.
- [ ] 4.2 Stage 4 complete is a distinct state: `Stage 4 Complete (Awaiting Final QC)`. Stage 5 is locked until Final Checking (AQL 1.5) clears the lot.
- [ ] 4.3 A REQ becomes `CLOSED` when Stage 5 seals its cartons and all alterations are resolved.
- [ ] 4.4 The Order becomes `COMPLETED & DISPATCHED` when `Packed (Stage 5) + Scrapped = Issued` and `Open Alterations = 0`.
- [ ] 4.5 Alteration loop: defects return to Stage 1; a pair is condemned to Scrap after 2 rework failures (Cycle 1/2, Cycle 2/2).
- [ ] 4.6 `DECISION`: AQL 1.5 gate details — who records the result, per REQ or per lot, and the failure path (re-inspect, 100% check, or back to alteration).
- [ ] 4.7 `DECISION`: confirm the full A-REQ cycle/scrap workflow is needed, or use a lighter flag-and-count approach if rework is rare.

## 5. View 1 — Dashboard

- [ ] 5.1 Four pulse cards: Order Book vs. Dock Receiving; Dock Unallocated Buffer; Packing Hall Active WIP (by stage, S4 shown as awaiting QC); Quality, Alteration and Scrap.
- [ ] 5.2 Exceptions strip: lots waiting at Stage 4 for Final QC; active alterations with contractor and cycle; unfulfilled `M-REQ`.
- [ ] 5.3 "Active Master Orders Pulse" table with clickable GRN chips (with quantity), clickable `REQ · M · A` chips, and the reconciliation badge.
- [ ] 5.4 Chip overflow handled: sorted, with a "+N more" pattern.
- [ ] 5.5 Core metrics readable without scrolling (target 1440px desktop).
- [ ] 5.6 Demo loader ("1-Order → 3-GRNs → 3-REQs", 600 pairs): available in dev or demo mode only, seeded records flagged and removable, never offered on a production database.

## 6. View 2 — Live Tracking

- [ ] 6.1 Filters: status (All, In Progress, Awaiting Final QC, Completed), Buyer, Contractor/Maker. Search by `ORD-`, PO #, `GRN-`, `REQ-`, `M-REQ-`, `A-REQ-`.
- [ ] 6.2 Tier 1 order row: Order ID, Buyer, Contractor, PO #, Article and Colour, Planned, Received, Contractor Balance, Dock Available, Packed, Scrapped, Status, reconciliation math.
- [ ] 6.3 Tier 2 left panel: GRN batches with date/time, size breakdown, total and allocation status.
- [ ] 6.4 Tier 2 right panel: REQs with `M-REQ` status (Issued / Pending), `A-REQ` status (Clear / In Rework / Scrapped), a 5-stage progress track with live counts, and the `[STAGE 4 DONE — AWAITING FINAL QC]` indicator.
- [ ] 6.5 Per-REQ reconciliation shown.
- [ ] 6.6 Row expansion under 150 ms; a Planned vs. Packed chart per Order.
- [ ] 6.7 Pagination or aggregation strategy for many Orders, GRNs and REQs.

## 7. View 3 — Order Creation

- [ ] 7.1 Existing hub preserved: Buyer, Contractor/Maker, PO #, Article, Colour/Shade, size breakdown, persisted Pending Orders table.
- [ ] 7.2 Master Registries (Buyers, Articles, Contractors/Makers, System Users) in a collapsible section.
- [ ] 7.3 Inward Receiving selects a pending Order and records a GRN against it (see 2.3).

## 8. View 4 — Reports

- [ ] 8.1 Order vs. Inward GRN and Contractor Balance report.
- [ ] 8.2 Order-to-Requisition traceability ledger (`REQ` / `M-REQ` / `A-REQ`, stage completion).
- [ ] 8.3 Contractor Quality, Alteration and Scrap deduction statement per Contractor and PO #.
- [ ] 8.4 Final QC (AQL 1.5) and Stage 5 dispatch manifest.
- [ ] 8.5 Every report has **Print Official A4 Slip** (`#direct-print-stage`) and **Export CSV**.
- [ ] 8.6 Each report has written acceptance criteria and a worked example that matches the ledger.

## 9. Visual Design and Print

- [ ] 9.1 The command-centre palette applies **only** inside `.superuser-command-center`.
- [ ] 9.2 Shop-floor modules (Inward Register, Packing Hall, Alteration Bay, Final QC) and all printable slips and A4 reports stay 100% monochrome black and white.
- [ ] 9.3 Semantic colour tokens: Order/GRN navy-cobalt; M-REQ steel cyan-blue; reconciled/packed/released emerald; WIP and Stage 4 hold amber; A-REQ/scrap/variance crimson.
- [ ] 9.4 Typography: IBM Plex Sans for structure; IBM Plex Mono with `tabular-nums` for all codes, sizes, quantities and deltas.
- [ ] 9.5 Single-elevation cards, 1px borders, no nested card clutter, compact high-density tables.
- [ ] 9.6 Hover states on chips; accessible contrast.

## 10. Integrity, Concurrency and Audit

- [ ] 10.1 Issue-to-REQ and GRN writes run in a transaction with a constraint or check, so two operators cannot over-issue the same Dock pool.
- [ ] 10.2 Void and adjustment records for GRNs and REQs (wrong entry, cancelled REQ, changed planned qty); invariants still hold after a correction.
- [ ] 10.3 Audit trail: who, when, what changed, for every write to orders, GRNs, REQs, QC results and scrap.
- [ ] 10.4 Roles and permissions defined for the Super User workspace (who can create, edit, void, close).
- [ ] 10.5 Persistence layer confirmed (SQLite or other) with concurrency limits and refresh behaviour (polling vs. push) stated.

## 11. Testing and Verification

- [ ] 11.1 Pure TypeScript aggregation helper computing: `plannedQty`, `receivedGrnQty`, `contractorBalanceQty`, `dockAvailableQty`, `issuedReqQty`, `stage1To4WipQty`, `awaitingFinalQcQty`, `inAlterationQty`, `scrappedQty`, `packedStage5Qty`, `orderLifecycleStatus`.
- [ ] 11.2 Unit tests for the helper, including over-issue, over-receipt, scrap, mid-rework and a variance case that must show `VARIANCE Δ`.
- [ ] 11.3 Integration tests for the GRN → REQ → Stage 1–5 → QC → closure flow.
- [ ] 11.4 Concurrency test for 10.1.
- [ ] 11.5 Migration test with existing pending orders.
- [ ] 11.6 Manual scenario: load the 600-pair Order, 3 GRNs (250 / 200 / 150), 3 REQs; push one REQ to Stage 4 and confirm the awaiting-QC state; create one alteration and one scrap; confirm both gates show `RECONCILED ✓`; then force a deliberate variance and confirm `VARIANCE Δ` with the correct delta.
- [ ] 11.7 Type-check, lint and production build all pass.

## 12. Housekeeping

- [ ] 12.1 Run `graphify update .` after code changes and tests pass.
- [ ] 12.2 Phased rollout recorded: Phase A = Order → GRN → REQ, allocations, Dashboard, reconciliation; Phase B = Live Tracking, lifecycle, AQL gate; Phase C = alterations, scrap, Reports.
- [ ] 12.3 No leftover demo data, debug flags or hard-coded hex values.

## Report Format (Phase 3)

The AI must deliver one report with these parts:

1. **Audit table** (from Phase 0): item ID, status before (`DONE` / `PARTIAL` / `MISSING` / `CONFLICT`), evidence (file and function).
2. **Changes made**: per section, files changed, and a one-line reason.
3. **Result table**: item ID, final status, evidence, test that covers it.
4. **Test results**: counts for unit, integration and concurrency tests, plus type-check, lint and build outcomes.
5. **Manual scenario outcome**: exactly what was observed for each step of 11.6.
6. **Open `DECISION` items** still waiting on the user, with the AI's recommendation for each.
7. **Risks and follow-ups**: anything skipped, deferred or assumed.
