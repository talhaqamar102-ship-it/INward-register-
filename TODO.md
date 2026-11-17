# Hammad Industries MES — Active TODOs & Verified Fixes

## Completed
- [x] **Packing Hall API Persistence & Hydration (`src/main.ts`, `src/services/packingService.js`)**
  - Wired Inward REQ issue (`POST /api/orders/:orderId/issue-req`), Stages 1–3 (`step1-checking`, `step2-ironing`, `step3-matching`), M-REQ create/issue (`POST /api/wip/:reqNo/material-requisition` -> `POST /api/material-requisitions/:matReqNo/issue`), Stage 4 incremental (`step4-packing`), and Stage 5 gated (`step5-cartons-gated`).
  - Fixed `PackingService.issueOrderRequisitionTransactional` so pre-created `PENDING` order requisitions update `packing_wip.step1_checking_in`, `issued_pairs`, and `issued_at`.
  - Updated `PackingService.getRequisitions` and `mapServerRequisitionToWip` to hydrate `materialReq`, `cartons`, and `alterations` across page reloads.
  - Fixed `#btn-apply-aql-audit` to require `resp.ok && data.success` before updating `finalQcApproved` and `qcChecklist`.

## Packing Hall <-> Inward Register Requisition & Issuance Flow (Completed)
- [x] **1. Cap Packing Hall New Requisition Entries Against Available Stock & Prior REQs (`src/main.ts`, `src/services/packingService.js`)**
  - Updated `PackingService.getPendingOrders` + `PackingService.getOrderStockSummary` + `PackingService.createOrderRequisition` to compute remaining unrequested order sizes (`plannedSizes - prior non-voided REQs`) and unclaimed Inward Dock stock (`received - allocated - pending REQs`), rejecting over-requests server-side.
  - Updated `openNewRequisitionModal` in `src/main.ts` to show remaining order balance, Inward received/unclaimed stock, prefill safely within caps, clamp per-size inputs, and block saves exceeding `maxTotalAllowed`.
- [x] **2. Add Requisition Queue Selector on Inward Goods Receiving (`renderScreenGRN` in `src/main.ts`)**
  - Added `#grn-queue-req-select` inside the "Packing Hall Requisition Queue" card so `INWARD_CLERK` and `SUPER_USER` can switch between any `PENDING` / `ISSUED` requisitions right on the Inward Register tab.
- [x] **3. Scope Inward Register Available Stock Calculation per Parent Order & Hydrate Issued Totals (`renderScreenGRN`, `#btn-issue-req-to-packing`, `syncBackendData` in `src/main.ts`)**
  - Added `getOrderStockState` and `getTotalIssuedPairs` so available stock on Inward Goods Receiving reflects only non-voided GRNs and allocations for `wip.parentOrderId`, hydrated across reloads.
- [x] **4. Check Server Response & Hydrate Server GRN Record on Receiving Save (`#btn-print-grn-slip` in `src/main.ts`)**
  - Checked `response.ok && result.success && result.data` on `POST /api/store/receivings` and hydrated `state.grnList` and `PendingOrder` stock counts from server `rcv_number` instead of pushing placeholder local rows on failure.
- [x] **5. Clarify Pending Inward Issue State on Packing Hall Stages (`renderScreenPacking`, `#btn-wip-step1..step4` in `src/main.ts`)**
  - Added a Pending Inward Issue notice banner above the 5-stage pipeline when `stage1In <= 0` and guarded Stage 1–4 click handlers when `available <= 0` with actionable toasts instead of `0`-clamped input modals.

## Packing Hall UI/UX, Accessibility, Chart Scaling & Atomic WIP Polish (Completed)
- [x] **1. Final QC Clarity & Real Rolled Throughput Yield (`src/utils/requisitionLogic.ts`, `src/components/packingHallView.ts`, `src/main.ts`)**
  - Extracted pure helpers `isPackingAwaitingFinalQc`, `isStage5ReadyForCartons`, and `computeWipRolledYieldPct` (Rolled Throughput Yield across Stages 1–3) with unit tests.
  - Updated Stage 4 / Stage 5 cards to display `Awaiting QC` / `Locked (Await AQL 1.5)` plus an actionable Final QC notice banner (`#btn-wip-open-qc-banner`), and replaced hardcoded `0%` with computed RTY (`Rolled Yield (RTY)`).
- [x] **2. WIP Analytics Chart 1:1 Scaling, Token Discipline & Accessibility (`src/utils/requisitionLogic.ts`, `src/style.css`, `src/utils/requisitionLogic.test.ts`)**
  - Replaced `176px` vs `116px` mismatched track scaling with shared `PLOT_HEIGHT_PX = 140`, eliminated `--border-default` fallback mismatch, removed small-bar label overlap, and added `role="img"` labels plus an `.sr-only` data summary table.
- [x] **3. Responsive Layout, Modal Focus/Footer Cleanup, Scoped Tables & Atomic Double-Submit Prevention (`src/style.css`, `src/main.ts`, `src/services/packingService.js`)**
  - Added `.packing-toolbar-grid`, `.packing-pipeline-grid`, `.skip-to-content`, single `<h1>` + `<main id="main-content">` across all screens, `.hide-global-footer` reset in `closeModal()`, delegated `data-modal-cancel`, `<label for>` associations, `scope="col"` headers, `A-REQ`-scoped Alteration rows, requisition-scoped Print Carton Labels guard, initial/manual sync banners with Retry, and synchronous SQLite transactions (`runAtomicWipStep`) + `inFlight` UI locks.

## Multi-Contractor Order Split, Delivery Countdown Timeline & Locked Inward Entry (Completed)
- [x] **1. Lock Inward Register Order Fields & Require "Received From" (`src/db.js`, `src/services/packingService.js`, `src/main.ts`, `src/utils/requisitionLogic.ts`)**
  - Locked Article/Model and Colour/Shade as read-only fields sourced from the selected order both on screen (`#grn-article`, `#grn-color`) and server-side in `PackingService.createReceiving` (ignoring tampered client values).
  - Added required `received_from` column and `#grn-received-from` field surfaced in the GRN register table and monochrome receiving slip.
- [x] **2. Multi-Contractor Order Split & Per-Contractor Caps (`src/db.js`, `src/services/orderService.js`, `src/services/packingService.js`, `src/components/superUserView.ts`, `src/utils/requisitionLogic.ts`, `src/main.ts`)**
  - Added `order_contractor_allocations` table + backfill migration and `validateContractorAllocations` (strict per-size equality and duplicate-contractor check).
  - Added Super User Order Split editor (`+ Split Across Contractors`), Live Tracking per-contractor chips, and Inward Register contractor filtering/balance caps rejecting unallocated contractors and over-receipts.
- [x] **3. Delivery Countdown Timeline (`src/utils/requisitionLogic.ts`, `src/components/superUserView.ts`, `src/components/packingHallView.ts`, `src/main.ts`, `src/style.css`)**
  - Added `due_date` persistence, `computeDeliveryCountdown`, Super User dashboard/tracking urgency sorting + timeline progress bar, Inward Register target delivery line, and monochrome Packing Hall countdown pill.
