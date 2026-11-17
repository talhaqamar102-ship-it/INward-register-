# How to Diagnose & Architect a Large Domain Catalog Migration (Without Rewriting the App)

> **SUPERSEDED — DO NOT RELY ON CLAIMS BELOW WITHOUT RE-VERIFICATION:** Subsequent uncapped consumer scans killed Step 1's assumption that downstream floor tables already handle dynamic sizes (`packingService.js:5-10` strips non-`'7'..'11'` keys, and uncapped scanning found `200` size/master-table references across `12` files including `37` `STANDARD_GLOVE_SIZES` hits), and corrected Step 5/ID rules (IDs must be assigned once and persisted in a mapping/seed table, never recomputed from editable spreadsheet text). Retained only as an archival note on early hypotheses.

> **Purpose:** This document captures the **diagnostic reasoning process**—how to go from *"we have a huge legacy spreadsheet that will force a full rewrite"* to a concrete, low-risk, quota-conscious integration architecture.
>
> **Confidentiality / Alias Policy:** All original company, buyer, product, spreadsheet column, codebase file, database table, and symbol names have been replaced with functional aliases below.

---

## Alias Reference (By Role)

| Alias Used Here | Role in Architecture |
| :--- | :--- |
| **`ApexApparel Works`** | Client manufacturing company operating the ERP workbook |
| **`catalog_master.xlsx`** | Multi-tab workbook (`Tab_Configurator`, `Tab_MasterRows`, `Tab_CascadingLists`) |
| **`Scale_Col`**, **`Style_Code`**, **`Slot_1..Slot_10`** | Sizing-standard column, SKU code column, and horizontal size columns in `Tab_MasterRows` |
| **`FactoryMES`** | Existing production, inward store, and packing web application |
| **`SchemaFile`** | Database schema initialization script (`SQLite` tables) |
| **`SizeHelpers`** | Shared domain logic module & **`SizeMap`** interface |
| **`BuyersTable`**, **`CatalogTable`** | Buyer registry and product/packaging master tables |
| **`OrdersTable`**, **`SplitsTable`** | Upstream order creation & contractor allocation tables (using **`fixed_size_cols`**) |
| **`RequisitionsTable`**, **`ReceivingMatrixTable`** | Downstream floor requisition (using **`sizes_payload`**) & inward ledger (vertical key-value rows) |
| **`ScaleLookupTable`** | New lookup table storing normalized sizing scales |
| **`Buyer_01` … `Buyer_33`** | The 33 distinct buyers extracted from `Tab_MasterRows` |
| **`Scale_G` … `Scale_HalfStep`** | The 10 distinct sizing scales used across styles (5 to 10 sizes each) |
| **`Legacy_Numeric_5`** | Existing hardcoded 5-size scale (`7` through `11`) currently used on the shop floor |
| **`Model_X104`**, **`Series_B175`** | Sample article aliases representing multi-color SKU variants |

---

## Step 0: Defend Context & Quota Before Touching Any File

The wrong first instinct on a large integration request is to read entire frontend/backend files sequentially (`3,000+` lines each) or launch broad multi-agent scans. That burns budget before you even locate the real bottleneck.

Instead, start with **targeted structural triangulation**:
1. **Locate only the choke points** via a symbol/dependency index (one narrow lookup for **`SizeMap`** and schema definitions).
2. **Read narrow line ranges (`<150` lines total)** strictly around:
   - Table definitions in **`SchemaFile`**
   - Shared size constants/types in **`SizeHelpers`**
3. **Profile binary `.xlsx` exports fast without extra runtime bloat.** Because `.xlsx` is a ZIP archive of XML sheets, one lightweight read-only inspection reveals exact sheet counts, row counts, distinct enums, and anomalies in under a second without guessing numbers.

**Mental check:** *Before proposing any architecture, verify what is actually rigid in code and what is actually dirty in the data.*

---

## Step 1: Challenge the Assumption That "Everything Will Break"

When the incoming dataset scales up across three dimensions simultaneously:
- Buyers: `5 → 33`
- Articles: `~16 → 716 rows`
- Size scales: `1 → 10 distinct sizing standards`

...it *feels* like the entire system has to be torn down and rebuilt.

The critical architectural breakthrough comes from checking **every table along the workflow chain (`Order → Receiving → Store Requisition → Packing`)** instead of assuming every layer shares the same constraint:

- **`RequisitionsTable`** *already* serializes sizes dynamically inside **`sizes_payload`**.
- **`ReceivingMatrixTable`** *already* stores sizes vertically as normalized `(doc_id, size_key, qty)` rows rather than fixed horizontal columns.
- Only **`OrdersTable`**, **`SplitsTable`** (**`fixed_size_cols`**), **`CatalogTable`** (missing style code, available colors, and scale link), and **`SizeHelpers`** (**`SizeMap`** / fixed 5-size array) are rigid.

### Reasoning Heuristic #1: *Look for accidental flexibility already hiding in your schema.*
When half the downstream pipeline already handles dynamic keys, you do **not** need a rewrite. You isolate the rigid upstream choke points and bridge them with an adapter.

---

## Step 2: Profile the Raw Data Like a Skeptic

Visual Excel sheets built for operators (**`Tab_Configurator`**) almost always mask structural flaws inside their backing table (**`Tab_MasterRows`**). Profiling the raw XML rows uncovered four concrete facts that drove the design:

1. **Invariant Discovery (The Big Simplifier):**
   Across all `716` article rows, grouping by **`Scale_Col`** showed that **every row sharing a scale uses the exact same ordered tuple of `Slot_1..Slot_10`** (10 scales total, 5–10 sizes each).
   - *Conclusion:* Sizing belongs in a normalized **10-row `ScaleLookupTable`**, not 716 custom per-article schemas.
2. **Missing Primary Keys:**
   `39` rows in the inspected range had an empty **`Style_Code`**.
   - *Conclusion:* **`Style_Code`** cannot be trusted as a primary key; keep deterministic synthetic IDs (`buyer-slug + article-slug`) and treat **`Style_Code`** as a searchable attribute.
3. **Sentinel Values & Mixed Delimiters:**
   `25+` rows used placeholder text (`< None >` or blank) for color, visual divider rows (`---`), and mixed list delimiters (`,`, `/`, `|`, trailing whitespace).
   - *Conclusion:* Raw Excel text cannot be dropped straight into `<option>` tags; an explicit sanitization pass is mandatory.
4. **Domain Typos Are Often Intentional Factory Labels:**
   Several scale headers and dual-size labels had missing characters or missing separators (e.g., misspelled generic scale names or merged alphanumeric tokens like `XL10`).
   - *Conclusion:* Never auto-rewrite domain labels silently—buyers and shop-floor tickets may depend on the original ERP spelling. Surface typo normalization vs. raw preservation as an explicit Day-1 decision.

### Reasoning Heuristic #2: *Hunt for hidden invariants across messy rows.*
When 700+ rows collapse onto 10 fixed size tuples, system complexity drops by an order of magnitude—provided you verify the invariant against real rows first.

---

## Step 3: Separate One-Time Cleansing from Runtime Code

Next decision: *Should **`FactoryMES`** parse `.xlsx` files at runtime, or convert the workbook offline?*

Runtime parsing inside the app container was ruled out for three reasons:
1. **Zero dependency bloat:** Shipping spreadsheet parsers inside production containers adds unnecessary weight for a master catalog that rarely changes.
2. **Diff-level auditability:** Converting **`Tab_MasterRows`** once via a small script (`xlsx → clean JSON + idempotent SQL seed`) makes sanitized colors, generated SKU fallbacks, and skipped divider rows inspectable in Git before touching live data.
3. **Decoupling from sheet layout:** **`catalog_master.xlsx`** mixes UI formulas (**`Tab_Configurator`**) with master records (**`Tab_MasterRows`**). Production code should never break if a column shifts in Excel.

### Reasoning Heuristic #3: *Keep spreadsheet cleansing offline; keep runtime schemas strict and clean.*

---

## Step 4: Protect Active Shop-Floor WIP & Tests (Additive Dual-Read Boundary)

In a running factory system with live stock, open orders, and automated tests, dropping **`fixed_size_cols`** on **`OrdersTable`** would immediately break:
- In-flight orders still moving through packing stages
- Printable shop-floor slips expecting legacy numeric breakdowns
- Existing unit, integration, and E2E suites

The safe boundary is **additive side-by-side support**:
- Leave existing **`fixed_size_cols`** intact on **`OrdersTable`** and **`SplitsTable`**.
- Add **`scale_id`** (defaulting to **`Legacy_Numeric_5`**) and **`sizes_payload`** alongside them.
- Generalize **`SizeMap`** in **`SizeHelpers`** to accept `Record<string, number>`, falling back to **`Legacy_Numeric_5`** when **`scale_id`** is absent.

Result: **Zero Day-0 regressions.** Existing WIP and tests continue using `7..11`, while new orders dynamically store 5–10 sizes from **`ScaleLookupTable`**.

### Reasoning Heuristic #4: *Extend schemas sideways; never tear up tracks underneath moving WIP.*

---

## Step 5: Treat the Client's Excel Configurator as Free UX Research

Loading `716` articles into one flat `<select>` would pass a naive smoke test and fail miserably on a factory floor terminal: operators scrolling 700+ rows with repeated **`Model_X104`** / **`Series_B175`** prefixes would make constant entry mistakes.

Looking closely at **`Tab_Configurator`** inside **`catalog_master.xlsx`** revealed the mental model operators already trust:
1. Select **Buyer** (`Buyer_01..Buyer_33`)
2. Select filtered **Article** (~5–45 items per buyer instead of 716)
3. Auto-populate **Style Code**, **Color options**, and **Scale**
4. Render **only that scale's 5–10 size columns** in the quantity matrix

### Reasoning Heuristic #5: *When replacing an Excel tool, preserve its domain cascade and remove only the manual friction.*

---

## Step 6: Sequence Delivery Into Independently Verifiable Slices

Instead of one massive patch touching DB schema, importer scripts, Order UI, Receiving, Requisitions, Packing WIP, and Print CSS together, slice the rollout so **each stage is buildable and test-verified**:

- **Slice 1 (Data + Schema Foundation):** Add **`ScaleLookupTable`**, additive columns on **`CatalogTable`**, and the idempotent importer for `33` buyers & `716` articles. Verify DB/unit tests green before touching UI.
- **Slice 2 (Upstream Order Capture):** Wire the Buyer → Article cascade and dynamic 5–10 column matrix in Order Creation. Verify end-to-end creation before altering floor views.
- **Slice 3 (Downstream Floor Propagation):** Thread **`scale_id`** through Receiving, Store Requisitions, Packing WIP, and printable floor slips (already structurally prepared thanks to Step 1).

---

## Reusable 6-Question Checklist for Any Future Domain Import

1. **Where is rigidity real vs. assumed?** *(Check every table/module along the pipeline before planning a rewrite.)*
2. **What invariants hold across the raw rows?** *(Group by candidate columns like `Scale_Col` to uncover small lookup sets.)*
3. **What dirty-data edge cases exist?** *(Check empty keys, sentinel strings, mixed delimiters, and domain typos.)*
4. **Can cleansing run once offline instead of inside production runtime?**
5. **How can legacy records and tests keep running unmodified via additive defaults?**
6. **What is the smallest vertical slice that ships green before touching downstream screens?**
