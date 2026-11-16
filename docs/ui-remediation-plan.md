# Meridian Works MES — UI/UX & Accessibility Remediation Plan

## Current Phase Status

### Phase 2 — Closed
- Removed fragile ARIA tablist roles (`role="tab"`, `aria-selected`, `tablist`), single-letter badges (`data-short-label`), duplicate lock controls (`btn-admin-lock`, `Lock Admin Session`), and `"Refresh Ledger"` across `src/` and tests.
- Repo-wide grep confirms only negative test assertions in `src/utils/requisitionLogic.test.ts` and an unrelated `.claude` skill reference; `e2e/` does not exist.
- `#btn-admin-refresh` (`Sync Database`) uses `btn-outline`, styled via `.superuser-command-center .sub-header-right .btn-outline` without relying on `.btn-primary`.
- **Remaining manual check:** inspect collapsed and expanded sidebar navigation at `1440px` desktop viewport.

### Phases 1 & 3 — Complete (Verified)

| Item | Status |
|---|---|
| `extractBlocks` print guard (`@media print` & `.printable-slip-box`) | Done, and passing |
| `.form-hint`, `.su-collapsible-body` | Done |
| `.su-report-sheet-wrap`, `.su-demo-drawer` (`?demo=1` / `hasDemoOrder`) | Done (`src/components/superUserView.ts`, `src/main.ts`, `src/utils/requisitionLogic.test.ts`) |
| `Choose Buyer` default option (`#admin-pending-order-buyer`) | Done |
| Required `*` markers, `Save & Issue Master Order`, `Reset Form` | Done (`src/components/superUserView.ts`, `src/main.ts`, `src/utils/requisitionLogic.test.ts`) |
| `Reconciliation Rule:` label in 4 reports (replaced `Acceptance Criteria & Worked Formula (8.6):`) | Done |
| Dashboard stage-bar buttons (`<button class="su-stage-bar-btn" data-tracking-filter="...">`) + zero-order empty state & CTA | Done (`src/components/superUserView.ts`, `src/main.ts`, `src/utils/requisitionLogic.test.ts`) |
| `allowEmpty` opt-in 3rd parameter on `buildRequisitionAnalyticsSeries` (passed only from Super User Live Tracking) | Done (`src/utils/requisitionLogic.ts`, `src/components/superUserView.ts`, `src/utils/requisitionLogic.test.ts`) |
| Tracking filter buttons (`.admin-tracking-filter-btn`) `>= 12px` CSS class without inline `11px` styling | Done (`src/style.css`, `src/components/superUserView.ts`, `src/utils/requisitionLogic.test.ts`) |
| Muted-color test resolving `--ink-600` & real `--su-bg-*` surfaces from CSS | Done (`src/utils/requisitionLogic.test.ts`) |
| Badge contrast fix (`.su-badge-areq` / `.su-badge-variance` using `--su-areq-dark` >= `4.5:1`) & `.table-btn` styling | Done (`src/style.css`, `src/utils/requisitionLogic.test.ts`) |
| Order Creation sections numbered `1–6`, `Phased Rollout Record` unnumbered, `Checklist 12.2...` string removed | Done (`src/components/superUserView.ts`, `src/utils/requisitionLogic.test.ts`) |

---

## Locked Execution Order & Decisions

1. **Order of Phases:** Finish Phase 1 gaps -> Phase 3 remainder -> Phase 4.
2. **Phase 4 Sequence (strictly in order):**
   1. HTML escaping using `data-*` attributes instead of interpolated handler strings, plus hostile-payload test.
   2. `openConfirmDialog` (Promise-based) for the three named destructive actions, `runAdminAction` with `pendingAdminActionKeys`, and inline validation (`.su-form-error`, `aria-invalid="true"`).
   3. Keyboard focus restore across `renderApp()` re-renders.
   4. Responsive CSS grids for Customer Master and Article & BOM Master forms.
3. **Deferred Scope:** Full delegated-handler migration across all views and the 403-inline-style purge.
4. **Demo Drawer Behavior:** `.su-demo-drawer` opens automatically when `hasDemoOrder` is true or `?demo=1` is present in the URL query string, keeping `#btn-load-demo-600-inprogress`, `#btn-load-demo-600-complete`, `#btn-load-demo-600-variance`, and `#btn-remove-demo-600`.
5. **Order Creation Numbering:** Sections numbered `1` through `6` (`1. Master Order Creation`, `2. Customer & Buyer Master`, `3. Glove Article & Packaging BOM Master`, `4. Contractors / Makers & PO Registry`, `5. Immutable Audit Trail Ledger`, `6. SQLite WAL Database & Snapshot Administration`), with `Phased Rollout Record` unnumbered and checklist IDs omitted from UI labels.
6. **Color Scope Rule:** All hex color literals stay strictly inside `src/style.css`; `src/components/superUserView.ts` and `src/utils/requisitionLogic.ts` contain zero raw hex literals; `@media print` and `.printable-slip-box` remain 100% monochrome (`#000` / `#fff`).

---

## Remaining Phase 1 & 3 Work Checklist

1. **Phase 1 CSS & Contrast Gaps:**
   - Merge duplicate `.superuser-command-center .table-btn` blocks, ensure `.su-badge-areq` / `.su-badge-variance` use `var(--su-areq-dark)` (`>= 4.5:1`), move tracking filter buttons to `.admin-tracking-filter-btn` at `>= 12px`, and add scoped styles for `.su-demo-drawer` and `.su-stage-bar-btn`.
   - Update `src/utils/requisitionLogic.test.ts` to keep `--su-text-muted: var(--ink-600)` and dynamically resolve `:root` / `.superuser-command-center` CSS variables for contrast checks (`>= 4.5:1` on all `--su-bg-*` surfaces and badges).
2. **Wire `.su-demo-drawer` & `.su-report-sheet-wrap`:**
   - Wrap Dashboard demo controls in `<details class="su-demo-drawer">` (open on `hasDemoOrder || ?demo=1`) preserving all 4 button IDs.
   - Wrap report preview content in `.su-report-sheet-wrap`.
3. **Report Formula Labels:**
   - Rename `Acceptance Criteria & Worked Formula (8.6):` to `Reconciliation Rule:` in all 4 reports.
4. **Dashboard Stage Bars & Zero-Order Empty State:**
   - Replace clickable stage-bar `<div>`s with `<button type="button" class="su-stage-bar-btn" data-tracking-filter="...">` wired to filter Live Tracking, and add a zero-order empty state with a `+ Create Master Order` CTA.
5. **Opt-In `allowEmpty` on `buildRequisitionAnalyticsSeries`:**
   - Add `allowEmpty = false` as the 3rd parameter, passing `true` only from Super User Live Tracking (`renderLiveTrackingTab`) and rendering a clean empty-state card in `renderRequisitionWipAnalyticsChart` when `series.length === 0`.
6. **Order Creation Form & Section Numbering:**
   - Add `*` required markers on Contractor/Maker and Article, rename submit CTA to `Save & Issue Master Order`, add `Reset Form`, remove `Checklist 12.2...`, renumber sections `1–6` with `Phased Rollout Record` unnumbered, and update `src/utils/requisitionLogic.test.ts`.
