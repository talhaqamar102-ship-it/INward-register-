# Catalog Integration & Cascading Sizing Implementation Plan

- **Branch:** `feat/catalog-cascading-sizing` `[V: prior git checkout cmd]`
- **Workbook Source:** `fasf.xlsx` (`Order_Selector` `sheet1`, `Database_Master` `sheet2`, `Lookup_Lists` `sheet3`) `[V: PS XML recon]`

---

## 1. Verified Baseline & Reconciliations

### 1.1 Workbook SKU Reconciliation (`fasf.xlsx` `sheet2.xml`)
`716 data rows (717 declared & XML rows - 1 header) - 0 empty/pure-dash divider rows - 0 duplicate (Customer, Item_Name) pairs = 716 rows` (`715` if uncoded row `R7` `ALPINE STAR | Art='-----------------' | Name='TECH-1 KX v3 ------' | Col='< None >'` is excluded) `[V: PS sheet2 row assertion + placeholder check]`.

| Metric | Verified Result | Source |
| :--- | :--- | :--- |
| Buyers (`Customer`) | `33` (`raw=33`, `normalized=33`, `0` empty) | `[V: PS sheet2 XML cmd]` |
| Distinct Size Formats | `10` (`raw=10`, `normalized=10`, `1` exact `Size_1..Size_10` tuple per format) | `[V: PS sheet2 XML cmd]` |
| `(Customer, Article_No)` | `65` duplicates (`raw=65`, `normalized=65`), `39` empty across `10` buyers | `[V: PS sheet2 XML cmd]` |
| `(Customer, Item_Name)` | `0` duplicates (`raw=0`, `normalized=0`), `0` empty | `[V: PS sheet2 XML cmd]` |
| `Col D` (`Color`) | `431` single/no-delim (`25` empty/`< None >`), `285` multi-color-delim; `sheet1` `INDEX/MATCH` reads verbatim cell string | `[V: PS sheet1/sheet2 XML cmd]` |
| Partial-dash rows (`-{2,}`) | `3` total: `R7` (`TECH-1 KX v3 ------`), `R262` (`IXS X43317--031 PANDORA WHITE`), `R263` (`IXS X43317--035 PANDORA YELLOW`) | `[V: PS sheet2 XML cmd]` |

### 1.2 Full `200`-Hit Consumer Breakdown (`scratch/scan-full.csv`)
Uncapped scan across `20` files (`src/`, `test/`, `e2e/`) returned **`200` total hits** summing cleanly across **`12` files** (`0` unaccounted refs) `[V: Import-Csv scan-full.csv sum]`:
- `src/services/packingService.js`: `55` (`REQUISITION_SIZES` `L5-10`, `createOrderRequisition` `L98-145`, `receiving_size_breakdowns` `L710,852,898,1253`, `getOrderStockSummary` `L1207-1343`, `products`/`customers` SQL `L59-72,126-132,864-878,1457-1471`, `pending_orders` `L113,740,1347,1920-1938`) `[V: read_file packingService.js + steps/2301/output.txt]`
- `src/db.js`: `51` (schema & `size_6..12` tables `L38-56,77-91,201-295`) `[V: read_file src/db.js + scan-full.csv]`
- `src/main.ts`: `25` (`getGrnRemainingCaps`/`getOrderStockState` `L326-445`, `@media print` `L876`, GRN sync/submit `L2059-2318`, REQ modal `L3603-3625`, packing check `L5644`) `[V: read_file main.ts + scan-full.csv]`
- `src/utils/requisitionLogic.ts`: `19` (`STANDARD_GLOVE_SIZES`/`EXTENDED_GLOVE_SIZES` `L13-41`, size loops `L195-250, 1600-1672`, date slices `L81,93`, `sizeKeys` `L3430`) `[V: scan-full.csv]`
- `test/http.test.js`: `14`, `src/services/orderService.js`: `12` (`L30-275`), `test/order-integrity.test.js`: `11`, `src/utils/requisitionLogic.test.ts`: `8` (`@media print` guard `L1304`) `[V: scan-full.csv]`
- UI & CSS views (`5` hits total): `src/components/packingHallView.ts` (`2`: `.slice(0, 5)` on defects/cartons `L362, L406`), `e2e/superuser-nav.spec.ts` (`1`), `src/components/superUserView.ts` (`1`: `pending_orders` caption `L1704`), `src/style.css` (`1`: `@media print` `L2702`) `[V: scan-full.csv]`
- Additional hardcoded HTML size tables found via template grep (`[V: Select-String UI size tables]`): `superUserView.ts` (`L1613-1627`, `L1648-1673`, `L1726-1730`), `main.ts` (`GRN` form `L1147-1161`, `GRN` history `L1252-1256`, `REQ` modal `L3666-3681`), `requisitionLogic.ts` (print/slip builders `L2901-2905`, `L3166-3170`, `L3432-3436`).

---

## 2. Architecture Options

### Option Set A — Product/Customer Identity & Re-import Diffing
| Option | Summary | Cost | Risk | Reversibility | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **A1 (Chosen)** | Assign immutable IDs (`CUST-0001..`, `GLV-0001..`) **once** into `data/catalog-id-map.json` + explicit rename map `data/catalog-renames.json`; re-imports diff source keys `(Customer, Item_Name)` against stored map and **exit `2`** (`import-diff.json`) on any unexpected add/remove unless `--accept-diff` passed; store raw columns verbatim (`raw_name`, `raw_color`, `raw_size_format`, `article_code`) separately from display labels. | Low | Low (guards `product_id` FKs across typos) | Medium before first order; High once live WIP binds `product_id` | **Chosen** |
| **A2 (Rejected)** | Recompute hash IDs from raw `(Customer, Item_Name)` on every import. | Low | **High** (fixing an Excel typo silently mints a new ID and strands orders/WIP) | High once orders bind IDs | Rejected |
| **A3 (Rejected)** | Key on `(Customer, Article_No)` or sliced string slugs (`packingService.js:868,875`). | Low | **Fatal** (`65` raw collisions + `39` empty codes `[V: PS XML cmd]`) | High | Rejected |

### Option Set B — Multi-Scale Sizing Source of Truth (Non-Mirror)
| Option | Summary | Cost | Risk | Reversibility | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **B1 (Chosen)** | Add `size_standards(code PK, raw_label, sizes_json, is_legacy)` seeded with `'LEGACY_7_11'` + `10` sheet scales. Add `size_format TEXT NOT NULL DEFAULT 'LEGACY_7_11'` (no `REFERENCES` in `ALTER TABLE`, compatible with `PRAGMA foreign_keys = ON` `[V: src/db.js:27; node:sqlite test]`) and `sizes_json TEXT NOT NULL DEFAULT '{}'` to `pending_orders` & `order_contractor_allocations`. **No mirror:** `LEGACY_7_11` reads/writes **only** `size_6..12` (`sizes_json = '{}'`); non-legacy reads/writes **only** `sizes_json` (`size_6..12 = 0` and `SUM(sizes_json) == total_qty`). Enforced by SQLite `BEFORE INSERT`/`BEFORE UPDATE` triggers (`verified on SQLite 3.53.4` `[V: node:sqlite trigger test]`). | Medium | Low | High before first non-legacy order; **forward-fix only** afterward | **Chosen** |
| **B2 (Rejected)** | Mirror `sizes_json` and `size_6..12` on `LEGACY_7_11` or fallback when empty. | Low | High (dual-source drift) | Medium | Rejected |
| **B3 (Rejected)** | Drop `size_6..12` columns in migration. | High | **High** (breaks `49` `size_6..12` consumers & `3` test suites `[V: scan-full.csv]`) | Irreversible without backup restore | Rejected |

---

## 3. Sliced Execution Plan (`feat/catalog-cascading-sizing`)

### Prerequisite (Before Slice `1`)
1. Resolve Open Decisions `1–3` below (`STOP-AND-ASK` items `#2` and `#3` must be answered before seeding `products` or implementing color selection semantics).
2. Make a separate housekeeping commit for `.agents/env.md`, `.agents/rules/senior-verification.md`, `.agents/traces/*`, `docs/domain-integration-reasoning.md` (`SUPERSEDED`), and `docs/last-5-turns-senior-audit.md` (`SUPERSEDED`) before Slice `1` app changes.

- Keep `catalog-id-map.json`, `catalog-renames.json`, and `catalog-seed.json` under `src/catalog/` (not `data/`, since `data/` is gitignored in `.gitignore:4` and shadowed by `VOLUME ["/app/data"]` in `Dockerfile:46`).

---

### Slice 1 — Persisted Catalog Seed + Schema + Backend Enforcement
- **Files to create/modify:**
  - `scripts/build-catalog-seed.mjs` (new): Parses `Database_Master` via `node:zlib` ZIP/XML reader with `declared == xmlRows == processed + 1` assertion, runs key-diff check against `src/catalog/catalog-id-map.json` + `src/catalog/catalog-renames.json` (aborts `exit 2` with `import-diff.json` on unmatched keys unless `--accept-diff`), emits clean deterministic `src/catalog/catalog-seed.json`.
  - `src/catalog/catalog-id-map.json` & `src/catalog/catalog-renames.json` (new): Initial persisted buyer/product ID map.
  - `src/db.js` (`L38-56, L260-295, L388+`): Add `size_standards`, `ALTER TABLE` migrations (`products`: `raw_name`, `article_code`, `raw_color`, `available_colors_json`, `size_format`; `pending_orders` & `order_contractor_allocations`: `customer_id`, `product_id`, `size_format`, `sizes_json`), `BEFORE INSERT`/`BEFORE UPDATE` invariant triggers (`pending_orders`, `order_contractor_allocations`), and idempotent catalog seeding.
  - `src/services/orderService.js` (`L30-275`): Accept `customerId`, `productId`, `sizeFormat`, `sizes`; validate dynamic scale sizes & contractor split sums per `size_standards` key; write strictly to `size_6..12` (`LEGACY_7_11`) OR `sizes_json` (`non-legacy`).
  - `src/services/packingService.js` (`L5-10, L58-145, L215, L234, L864-878, L1126-1380`):
    - Update `parseRequisitionSizes(value, allowedSizes)` + `createOrderRequisition()` (`L92-145`) + `getOrderStockSummary()` (`L1207-1343`) to read `size_format` cleanly instead of filtering `REQUISITION_SIZES = ['7'..'11']`.
    - Replace `LIKE '%...%'` (`L865`) and truncated `slice(0,8)` / `slice(0,10)` inserts (`L868, L875`) with strict `customer_id`/`product_id` lookups and deterministic non-colliding IDs.
    - Include `sizeStandards`, extended `products` metadata, and `order.sizeFormat` / `order.productId` in `getAdminOverview()` & `getPendingOrders()`.
  - `src/routes/api.js` (`L326, L372-405`) & tests `test/order-integrity.test.js`, `test/http.test.js`.
- **Gate Checks:**
  - Trigger invariant test (`LEGACY+json`, `non-legacy+col`, `sum != total_qty` all abort).
  - Key-diff importer test (`renamed` row without rename entry exits `2` and does not mint new ID).
  - Run `node --test test/*.test.js` (`100%` pass + new non-legacy order/split/requisition round-trip specs).
- **Must NOT touch:** `src/components/*`, `src/main.ts`, `src/style.css`, `@media print`.

---

### Slice 2 — Super User Cascading Selector (`Buyer → Article → Color → Sizes`)
- **Files to modify:**
  - `src/utils/requisitionLogic.ts` (`L1-42, L195-250`): Generalize `SizeBreakdown` to `Record<string, number>`, add scale-aware helpers (`getArticlesForCustomer`, `getColorSelectionSpecForProduct` per Decision `#2`, `getScaleSizeCodes`, parameterized `validateContractorAllocations(orderSizes, splits, sizeCodes)`).
  - `src/components/superUserView.ts` (`L1500-1730`):
    - `#admin-pending-order-buyer` (`L1539`) -> drives `#admin-pending-order-article` (`L1579`: disabled `"-- Choose Buyer First --"` when blank; lists only `customer_id`-matched items keyed by `product.id` + `articleCode — name`).
    - `#admin-pending-order-color` (`L1587`) -> wired strictly per Open Decision `#2` (`1` colorway string vs tokenized choice + `< None >` override).
    - Dynamic headers & inputs (`L1610-1695`, `L1726-1730`) rendered from active `size_format` tuple (`5` to `10` columns) in BOTH the main order matrix and the Contractor Share Split table + `#admin-split-balance-bar`.
  - `src/main.ts` (`L4463-4695, L5622-5625`): Hydrate `sizeStandards` & rich `products` catalog in bootstrap; cascade `change` events on `#admin-pending-order-buyer` & `#admin-pending-order-article` (clear/re-key sizes & splits on `size_format` change); submit `customerId`, `productId`, `sizeFormat`, `sizes`.
  - Tests: `src/utils/requisitionLogic.test.ts` + new Playwright E2E spec under `e2e/` (`GENRAL` `9`-col + `IXS MEN` `10`-col + split balance + reload persistence at `1440x900` & `375px`).
- **Gate Checks:** `npm run lint`, `npm run test:unit`, targeted Playwright cascading spec (`0` console/page/5xx errors, `0` horizontal overflow).
- **Must NOT touch:** GRN/REQ modal size handlers (`main.ts:1147-1256, 2059-2318, 3603-3835`), `packingHallView.ts`, `@media print`.

---

### Slice 3 — Downstream Propagation (`GRN → REQ → Packing WIP → Print Slips`)
- **Files to modify (mapped across remaining `scan-full.csv` hits):**
  - `src/main.ts` (`L326-445` `getGrnRemainingCaps`/`getOrderStockState`, `L1147-1161` GRN matrix, `L1252-1256` GRN history headers, `L2059-2318` GRN cap validation/save, `L3603-3835` REQ modal cap calc/matrix, `L5644` packing check, `@media print` `L876`).
  - `src/utils/requisitionLogic.ts` (print/slip builders `L2901-2905, L3166-3170`, `L3432-3436`, keyboard handler `L3904-3905`).
  - `src/components/packingHallView.ts` & `src/style.css` (`@media print` `L2702`, ensuring up to `10` monochrome slip columns fit printable width without wrapping/clipping `[V: GEMINI.md]`).
- **Gate Checks:** Full `npm run verify:all` (`lint`, `test:unit`, `test`, `build`, `test:e2e`, `graphify`) + Playwright `@media print` layout assertion on `10`-size (`SPARCO` / `IXS MEN`) slips (`0` failures/skips).
- **Must NOT touch:** Legacy `'LEGACY_7_11'` historical fixtures (`RCV-2026-0001/0009` in `src/db.js:671-680` `[V: Select-String]`).

---

## 4. Failure Modes & Catching Verification
1. **Silent Typo Re-import ID Drift:** Editing `Item_Name` or trimming a space in `fasf.xlsx` changes `(Customer, Item_Name)` and could mint a duplicate `GLV-*` ID. **Catch:** `scripts/build-catalog-seed.ts` diffs source keys against `data/catalog-id-map.json` and exits `2` (`import-diff.json`) unless mapped in `data/catalog-renames.json`; tested explicitly in Slice `1`.
2. **Dual Source-of-Truth Size Mismatch / Trigger Rejection:** Writing `sizes_json` on `'LEGACY_7_11'` or non-zero `size_7..11` on `'GENRAL'`, or `SUM(sizes_json) != total_qty`. **Catch:** SQLite `BEFORE INSERT`/`BEFORE UPDATE` triggers on `pending_orders` & `order_contractor_allocations` (`abort('size_format invariant violated')`) verified on `node:sqlite` (`3.53.4`) `[V: node:sqlite trigger test]` + Slice `1` HTTP tests.
3. **Downstream `7..11` Stripping or `LIKE`/Truncated GRN Collapse:** Sending `XS..5XL` through `parseRequisitionSizes()` (`packingService.js:5-10`) or auto-creating GRN SKUs via `packingService.js:864-878` zeroes requisition counts or collides `BERIK` SKUs. **Catch:** Replace `REQUISITION_SIZES` filter & `LIKE` / `slice(0,10)` auto-creates + add multi-scale GRN → REQ → StockSummary round-trip test.
4. **Wide (`10`-Column) Slip Clipping in Print / UI:** `IXS MEN` / `SPARCO` / `VQUATRO` (`10` columns + Total + Contractor) overflowing `1440px`/print width or breaking `.printable-slip-box` monochrome test (`requisitionLogic.test.ts:1304` `[V: scan-full.csv]`). **Catch:** Dynamic responsive grid styling + Playwright geometry & monochrome CSS guard in Slices `2–3`.

---

## 5. Rollback Window & Procedure
- **Full Reversibility Window:** Valid **only before the first non-legacy order (`size_format <> 'LEGACY_7_11'`) is saved in production SQLite**. Within this window: revert branch (`git checkout feat/contractor-split-delivery-countdown`) + run down-migration SQL (`DROP TRIGGER ...`, drop seeded rows via `data/catalog-id-map.json`, remove additive columns or restore pre-migration DB backup).
- **After First Non-Legacy Order Exists:** Old code cannot read `sizes_json` for non-legacy scales — **forward-fix only** (`never` blind branch rollback against modified DB).

---

## 6. Open Decisions (`STOP-AND-ASK` Gate — Resolved `2026-11-17`)

| # | Question | Decision Recorded (`2026-11-17`) | Gate Status |
| :-: | :--- | :--- | :---: |
| `1` | **Row `R7` (`TECH-1 KX v3 ------`, `Art='-----------------'`, `Col='< None >'`):** Import or exclude? | **User decided `1. skip it`** -> Exclude `R7`, yielding `715` active catalog rows (`716 - 1 = 715`). | **RESOLVED** |
| `2` | **Color semantics (`285` comma/pipe/slash rows, e.g. `Black,Red,White`):** Single combined glove spec vs. pick-1? | **User decided `2. one glove with three colours`** -> Verbatim multi-color colorway spec per row (`Col D`), matching `Order_Selector`. | **RESOLVED** |
| `3` | **Dynamic Buyer → Article → Color → Sizes (`715` rows vs. size formats `5–10`):** Keep `715` unique rows + exact workbook size sets? | **User confirmed `as it is in the file` + `dynamic according to buyer and article`** -> `1:1` over `715` unique `(Customer, Item_Name)` rows; preserve exact `10` Excel size formats verbatim (`5` to `10` sizes each) while keeping `LEGACY_7_11` for old orders. | **RESOLVED** |
