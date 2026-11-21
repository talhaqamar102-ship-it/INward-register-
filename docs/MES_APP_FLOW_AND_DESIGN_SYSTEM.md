# Hammad Industries MES — App Flow, User-Wise Colour Composition & ASCII UI Mocks

> **Scope:** Complete architectural, visual, and workflow reference for the Hammad Industries Manufacturing Execution System (MES).  
> **Layout Principle:** Fluid full-width workspace (`.main-viewport` = `width: 100%; max-width: none; padding: 20px 24px;`) using `"IBM Plex Sans"`, `"IBM Plex Mono"`, and `tabular-nums`.  
> **Visual Discipline:** Quiet-chrome neutrals + single-purpose cobalt action accents in control/dock screens (`unslop`), pure grayscale monochrome on execution floors, and strict 100% black-and-white on printable shop-floor slips (`@media print`).

---

## Table of Contents

1. [Section 1 — System Overview & End-to-End MES Flow](#section-1--system-overview--end-to-end-mes-flow)
   - [1.1 End-to-End Production & Document Lifecycle](#11-end-to-end-production--document-lifecycle)
   - [1.2 Role, Screen & Data-Isolation Matrix](#12-role-screen--data-isolation-matrix)
2. [Section 2 — Colour Composition & Design System (Global + User-Wise)](#section-2--colour-composition--design-system-global--user-wise)
   - [2.1 Global Base Tokens (`tokensAndBase.css`)](#21-global-base-tokens-tokensandbasecss)
   - [2.2 User-Wise Colour Composition](#22-user-wise-colour-composition)
   - [2.3 Colour Composition Quick-Reference Matrix](#23-colour-composition-quick-reference-matrix)
3. [Section 3 — User-Wise Workflows & ASCII UI Mocks](#section-3--user-wise-workflows--ascii-ui-mocks)
   - [3.1 Authentication & First-Run Setup (`authView.ts`)](#31-authentication--first-run-setup-authviewts)
   - [3.2 `SUPER_USER` — Command Center (`screen-admin`)](#32-super_user--command-center-screen-admin)
   - [3.3 `INWARD_CLERK` — Inward Register Dock #1 (`screen-grn`)](#33-inward_clerk--inward-register-dock-1-screen-grn)
   - [3.4 `PACKING_SUPERVISOR` — Packing Hall (`screen-packing`)](#34-packing_supervisor--packing-hall-screen-packing)
   - [3.5 `ALTERATION_LEAD` — Alteration Bay #2 (`screen-repair`)](#35-alteration_lead--alteration-bay-2-screen-repair)
   - [3.6 `QC_INSPECTOR` — Final QC Dock #4 (`screen-qc`)](#36-qc_inspector--final-qc-dock-4-screen-qc)
   - [3.7 Printable Shop-Floor Slips (`print.css`)](#37-printable-shop-floor-slips-printcss)

---

## Section 1 — System Overview & End-to-End MES Flow

### 1.1 End-to-End Production & Document Lifecycle

```text
+--------------------------------------------------------------------------------------------------+
|                        HAMMAD INDUSTRIES MES — END-TO-END WORKFLOW                               |
+--------------------------------------------------------------------------------------------------+

  [1] ORDER SETUP (SUPER_USER · screen-admin · Order Creation + Registries 02-06)
      ├── Select Buyer + Multi-Select Glove Articles + Per-Article Size Quantities
      └── Atomic Creation -> Parent Order (ORD-YYYY-NNN)
                              ├── Sub-Order ORD-YYYY-NNN-1  (Article A · independent slip chain)
                              ├── Sub-Order ORD-YYYY-NNN-2  (Article B · independent slip chain)
                              └── Sub-Order ORD-YYYY-NNN-3  (Article C · independent slip chain)
                                        │
                                        ▼
  [2] STITCHING RECEIPT (INWARD_CLERK · screen-grn · Dock #1)
      ├── Select Hall -> Stitcher -> Received From + Spinner-Free Size Matrix
      └── Issues GRN / RCV ──▶ Adds pairs to Unclaimed Dock Stock Pool
                                        │
                                        ▼
  [3] STOCK CLAIM & WIP (PACKING_SUPERVISOR · screen-packing · Packing Hall)
      ├── Stock-Only Picker (#wip-batch-select -> dockReadyOrders, "<N> pairs available")
      │   * Planned totals & Buyer identities are strictly hidden *
      ├── Modal: Create Packing Hall Requisition -> Issues REQ against Available at Dock
      └── INWARD_CLERK issues Dock Stock against queued REQ ──▶ Enters 5-Stage WIP Pipeline:
            │
            ├── Stage 1 -> Stage 2 -> Stage 3
            │                            ├── Unlocks Dashed Material Requisition card -> M-REQ
            │                            └── Defect spotted? -> Issues A-REQ ──┐
            │                                                                    ▼
            │                                       [4] REWORK (ALTERATION_LEAD · screen-repair · Bay #2)
            │                                           ├── Select Hall <optgroup> Stitcher
            │                                           ├── Cycle <= 2 -> Return Stage 1 ────────┐
            │                                           └── Limit/Void -> Scrap (Contractor Debit)│
            │                                                                                    │
            │   ◄────────────────────────────────────────────────────────────────────────────────┘
            ▼
      Stage 4 (Hold Gate: .packing-qc-notice)
            │
            ▼
  [5] FINAL QUALITY GATE (QC_INSPECTOR · screen-qc · Dock #4)
      ├── Order Summary (NO Buyer visible)
      ├── 5-Item AQL 1.5 Checklist + Inspector Stamp ID (e.g. 4402)
      └── Approved ──▶ Stage 5 (Master Carton Manifest) + Dispatch Ready
                                        │
                                        ▼
  [6] EXECUTIVE TRACEABILITY & SLIPS
      ├── SUPER_USER Dashboard: KPIs, Exceptions (RECONCILED ✓ / VARIANCE Δ), 7-Col Pipeline Chart,
      │   Active Orders (11 cols), and Clickable Branching Order Tree ("Mind Map": Parent -> -1/-2 -> Slips)
      ├── Live Tracking: Filterable Supply Stream (GRN) + Execution Stream (REQ / M-REQ / A-REQ)
      └── Print Output (print.css): 100% B&W #000000/#ffffff A4 portrait slips (GRN, REQ, M-REQ, A-REQ)
```

### 1.2 Role, Screen & Data-Isolation Matrix

| Role (`authView.ts`) | Target Screen ID | Primary Responsibilities | Document Types Owned / Acted On | Buyer Identity Visible? | Order Planned Qty Visible? | Colour Mode |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`SUPER_USER`** | `screen-admin` | Orders, multi-article split, Master Registries `02`–`06`, live monitoring, user & ledger reporting | `ORD-YYYY-NNN` (`-1`, `-2`, ...), reads all `GRN`/`REQ`/`M-REQ`/`A-REQ` | **Yes** (exclusive) | **Yes** | Quiet Chrome + 5 Semantic `--su-*` Accents |
| **`INWARD_CLERK`** | `screen-grn` (toggleable via `#btn-inward-nav-repair` to `screen-repair`) | Log stitcher deliveries into Dock Stock (`GRN`), fulfill Packing Hall `REQ` queue, audit Store Receiving Ledger | `GRN` (`RCV`), fulfills `REQ`, views `A-REQ` ledger status | **No** | Order receipt tracking only | Quiet Chrome + Cobalt `#1E40AF` CTA + `.su-ref` dots (`.inw`) |
| **`PACKING_SUPERVISOR`** | `screen-packing` | Request Dock Stock (`REQ`), drive 5-stage WIP, request packing materials at Stage 3 (`M-REQ`), flag defects (`A-REQ`), pack cartons | `REQ`, `M-REQ` (Stage 3 gate), `A-REQ`, Cartons | **No** (strictly hidden) | **No** (sees `dockReadyOrders` only) | 100% Shop-Floor Monochrome (`tokensAndBase.css` + `shopFloor.css`) |
| **`ALTERATION_LEAD`** | `screen-repair` | Receive `A-REQ` rework pairs, assign stitcher via Hall `<optgroup>`, enforce 2-cycle rule (`Return Stage 1` vs `Scrap`) | `A-REQ`, Rework & Scrap records | **No** (strictly hidden) | **No** | 100% Shop-Floor Monochrome (`tokensAndBase.css` + `shopFloor.css`) |
| **`QC_INSPECTOR`** | `screen-qc` | Perform AQL 1.5 5-item inspection on Stage-4 holds, stamp Inspector ID (`4402`), clear Master Carton Manifest | Stage 4 Hold, AQL 1.5 Checklist, Carton Manifest | **No** (Order Summary excludes Buyer) | Batch / Carton scope | 100% Shop-Floor Monochrome (`tokensAndBase.css` + `shopFloor.css`) |
| **Print Subsystem** | `.printable-slip-box` | Generate physical shop-floor paper travelers & audit slips (`@page` A4 portrait) | `GRN`, `REQ`, `M-REQ`, `A-REQ` | **No** (zero Buyer leakage) | Slip-specific quantities | **100% Pure Black & White** (`#000000` on `#ffffff`, `!important`) |

---

## Section 2 — Colour Composition & Design System (Global + User-Wise)

### 2.1 Global Base Tokens (`tokensAndBase.css`)

Every authenticated role shares the same base grayscale ink ramp, card primitives, and typography from `src/styles/tokensAndBase.css`:

| Token / Class | Hex / Value | Role Across System |
| :--- | :--- | :--- |
| `--ink-950` / `--text-heading` | `#09090b` | Primary headings, active high-contrast monochrome surfaces, `.sub-header-bar` bg |
| `--ink-900` / `--text-main` | `#18181b` | Body copy, `.btn-primary` fill (`border: #09090b`) |
| `--ink-800` | `#27272a` | Secondary dark surfaces & emphasis |
| `--ink-700` | `#3f3f46` | Secondary prose, dense table copy |
| `--ink-600` | `#52525b` | Muted metadata, labels, timestamps |
| `--ink-400` | `#a1a1aa` | Unpassed/inactive QC checkboxes, placeholder icons |
| `--ink-300` / `--border-strong` | `#d4d4d8` | Strong card borders, inputs, muted dates inside dark `.sub-header-bar` |
| `--ink-200` / `--border-subtle` | `#e4e4e7` | Subtle dividers, table grid lines |
| `--ink-100` | `#f4f4f5` | Secondary panels, table headers, notice backgrounds |
| `--ink-50` / `--bg-page` | `#fafafa` | Global application page canvas |
| `--white` / `--bg-card` | `#ffffff` | `.panel-card`, modals, tables, data inputs |
| `.btn-danger` | bg `#991B1B`, border `#7F1D1D` | Destructive / void / scrap confirmations |
| Typography | `"IBM Plex Sans"`, `"IBM Plex Mono"`, `tabular-nums` | Sans for labels/prose; Mono + `tabular-nums` for order IDs, slips, counters, dates |
| `.main-viewport` | `width: 100%; max-width: none; margin: 0; padding: 20px 24px;` | Fluid edge-to-edge layout scaling smoothly across wide monitors |

---

### 2.2 User-Wise Colour Composition

#### 1. Authentication & First-Run Setup (`authView.ts` + `tokensAndBase.css`)
- **Canvas & Surfaces:** `#fafafa` (`--bg-page`), `#ffffff` (`--bg-card`), `#e4e4e7` (`--border-subtle`), `#d4d4d8` (`--border-strong`).
- **Top Chrome:** `.module-switcher-bar` (shared shell navigation bar).
- **Actions & Validation:** `#18181b` primary button (`.btn-primary`, border `#09090b`); `#991B1B` validation error text.
- **Colour Intent:** Zero brand/status hues; clean entry gate separating administrative vs shop-floor sessions.

---

#### 2. `SUPER_USER` — Control Center (`screen-admin`, `.superuser-command-center` in `superUser.css` & `su-shared.css`)
The Super User workspace extends the monochrome base with **5 scoped semantic colour families** so complex document chains (`ORD` -> `GRN` -> `REQ` / `M-REQ` / `A-REQ`) can be read at a glance in KPIs, the 7-column bar graph (`.su-vg`), Live Tracking streams, and the Branching Order Tree (`.su-tree-group` / `.su-tree-branches`).

- **Scoped Neutrals (`--su-*`):**
  - Surfaces: `--su-bg-primary: #fafafa`, `--su-bg-secondary: #ffffff`, `--su-bg-tertiary: #f4f4f5`, `--su-white: #ffffff`
  - Text: `--su-text-primary: #09090b`, `--su-text-secondary: #3f3f46`, `--su-text-muted: #52525b`
  - Borders: `--su-border: #d4d4d8`, `--su-border-subtle: #e4e4e7`, `--su-border-hover: #52525b`
- **Dark Sub-Header Bar (`.sub-header-bar`):**
  - Background `#09090b`, text `#ffffff`, bottom accent divider `1px solid #1E40AF`.

| Semantic Family | Tokens (`superUser.css`) | Hex Values | Assigned Meaning (`SUPER_USER` Only) |
| :--- | :--- | :--- | :--- |
| **Cobalt Blue** | `--su-req-primary`, `--su-req-dark`, `--su-req-deep`, `--su-req-accent`, `--su-req-bg`, `--su-req-fill-soft`, `--su-req-border` | `#1E40AF`, `#1E3A8A`, `#172554`, `#2563EB`, `#EFF6FF`, `#DBEAFE`, `#BFDBFE` | Primary actions, `REQ` slips, WIP Stages 1–3, active filters, Parent Order IDs (`ORD-YYYY-NNN`) |
| **Sky Blue** | `--su-mreq-primary`, `--su-mreq-dark`, `--su-mreq-bg`, `--su-mreq-border` | `#0284C7`, `#0369A1`, `#F0F9FF`, `#BAE6FD` | `M-REQ` material requisitions, WIP Stage 4, Final QC Hold Gate |
| **Emerald Green** | `--su-complete-primary`, `--su-complete-dark`, `--su-complete-bg`, `--su-complete-border` | `#16A34A`, `#15803D`, `#F0FDF4`, `#BBF7D0` | WIP Stage 5 Cartons, QC Approved, `RECONCILED ✓` |
| **Amber** | `--su-grn-primary`, `--su-grn-accent`, `--su-grn-dark`, `--su-grn-deep`, `--su-grn-bg`, `--su-grn-fill-soft`, `--su-grn-border` | `#D97706`, `#F59E0B`, `#B45309`, `#92400E`, `#FFFBEB`, `#FEF3C7`, `#FDE68A` | `GRN` goods receipts, Dock Stock Pool, Contractor Hall/Stitcher balances |
| **Red** | `--su-areq-primary`, `--su-areq-dark`, `--su-areq-bg`, `--su-areq-fill-soft`, `--su-areq-border` | `#DC2626`, `#991B1B`, `#FEF2F2`, `#FEE2E2`, `#FECACA` | `A-REQ` alteration rework, Scrap Debits, `VARIANCE Δ` alerts |

---

#### 3. `INWARD_CLERK` — Dock #1 (`screen-grn`, `.inw` in `inward-register.css`)
Built around **`unslop`: quiet chrome + one bright cobalt moment**, stripping away heavy coloured pill backgrounds used in the Super User views:

- **Quiet Surfaces & Borders:**
  - `--inw-bg: #fafafa` (page)
  - `--inw-surface: #ffffff` (`.inw-card`, fluid `.inw-main` wrapper)
  - `--inw-subtle: #f4f4f5` (header bands, table headers, summary footer)
  - `--inw-border: #e4e4e7`, `--inw-border-strong: #d4d4d8`
  - Text: `--inw-text: #09090b`, `--inw-text-2: #3f3f46`, `--inw-muted: #52525b`
- **Dark Sub-Header Bar (`.sub-header-bar`):**
  - Background `#09090b`, bottom border `1px solid #1E40AF`, `#ffffff` title, muted `#d4d4d8` date.
- **Single Bright CTA Moment:**
  - `--inw-accent: #1E40AF` (Primary Cobalt CTA button, interactive links, `ORD` pill dot)
  - `--inw-accent-dark: #1E3A8A` (Hover/active border)
- **Precision Dot & Status Tokens (`.su-ref--rcv`, `.su-ref--req`, `.su-ref--areq`):**
  - `--inw-ok: #15803D` / `--inw-ok-dot: #16A34A` -> `RCV` / `Received` status indicator dot
  - `--inw-warn: #B45309` -> Pending requisition issue status
  - `--inw-danger: #DC2626` -> `A-REQ` / `Voided` indicator dot & input validation error border
- **Secondary Alteration Toggle (`#btn-inward-nav-repair`):**
  - When toggled to `screen-repair`, inherits 100% monochrome (`tokensAndBase.css` + `shopFloor.css`).

---

#### 4. `PACKING_SUPERVISOR` — Packing Hall (`screen-packing`, `tokensAndBase.css` + `shopFloor.css`)
- **Palette:** **100% Shop-Floor Monochrome** (zero `--su-*` hues).
- **Surfaces & Borders:** `#fafafa` canvas, `#ffffff` cards & `.size-matrix-table`, `#f4f4f5` table/panel subtle bands & `.packing-qc-notice`, `#d4d4d8` borders.
- **Interactive Hierarchy:**
  - `.pipeline-stage-card.stage-active` & `.stage-active-badge` highlight the current WIP stage in `#09090b` / `#18181b` against `#ffffff` / `#f4f4f5`.
  - Stage 3 unlocks the dashed-border `Material Requisition` (`M-REQ`) card (monochrome dashed border).
  - Primary actions (`Create Packing Hall Requisition`, stage advances) use `.btn-primary` (`#18181b` / `#09090b`).

---

#### 5. `ALTERATION_LEAD` — Alteration Bay #2 (`screen-repair`, `tokensAndBase.css` + `shopFloor.css`)
- **Palette:** **100% Shop-Floor Monochrome**.
- **Surfaces & Controls:** `#fafafa` page, `#ffffff` rework intake & active queue cards, `#f4f4f5` 2-cycle rule notice banner & table headers, `#d4d4d8` borders.
- **Actions:** `.btn-primary` (`#18181b` / `#09090b`) for `Return Stage 1`; `.btn-danger` (`#991B1B` bg, `#7F1D1D` border) when confirming destructive `Scrap` write-off actions.

---

#### 6. `QC_INSPECTOR` — Final QC Dock #4 (`screen-qc`, `tokensAndBase.css` + `shopFloor.css`)
- **Palette:** **100% Shop-Floor Monochrome**.
- **Checklist Contrast:**
  - Unpassed AQL 1.5 `.checklist-*` checkbox / border: `--ink-400` (`#a1a1aa`).
  - Passed AQL 1.5 items & primary approval CTA: `--ink-950` / `--ink-900` (`#09090b` / `#18181b`).
  - Notice bands & summary cards: `#f4f4f5` / `#ffffff` with `#d4d4d8` / `#e4e4e7` borders.

---

#### 7. Printable Shop-Floor Slips (`print.css`)
- **Palette:** **100% Pure Black & White** (strict shop-floor thermal/laser legibility; overrides Super User colours using `!important`).
- **Exact Print Tokens:**
  - Page: `@page` A4 portrait
  - Background: `#ffffff`
  - Foreground Ink: `#000000` (`!important`)
  - Slip Container (`.printable-slip-box`): `1.5px solid #000000`
  - Matrix / Table Borders: `1px solid #000000`
- **Privacy Guarantee:** Zero Buyer fields rendered on printable `GRN`, `REQ`, `M-REQ`, or `A-REQ` slips.

---

### 2.3 Colour Composition Quick-Reference Matrix

| Role / Context | Page Bg | Card Surface | Header Bar | Primary CTA | Semantic Accent Count | Print Override |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Auth** | `#fafafa` | `#ffffff` | `.module-switcher-bar` | `#18181b` | `0` (`#991B1B` error text only) | N/A |
| **`SUPER_USER`** | `#fafafa` | `#ffffff` / `#f4f4f5` | `#09090b` + `#1E40AF` bottom | `#1E40AF` | `5` (Cobalt, Sky, Green, Amber, Red) | Stripped to B&W (`!important`) |
| **`INWARD_CLERK`** | `#fafafa` | `#ffffff` / `#f4f4f5` | `#09090b` + `#1E40AF` bottom | `#1E40AF` | `1` CTA (`#1E40AF`) + small dots (`#16A34A`, `#B45309`, `#DC2626`) | Stripped to B&W (`!important`) |
| **`PACKING_SUPERVISOR`** | `#fafafa` | `#ffffff` / `#f4f4f5` | Ink monochrome | `#18181b` | `0` (100% Grayscale) | Stripped to B&W (`!important`) |
| **`ALTERATION_LEAD`** | `#fafafa` | `#ffffff` / `#f4f4f5` | Ink monochrome | `#18181b` (`.btn-danger` `#991B1B` for scrap) | `0` (100% Grayscale) | Stripped to B&W (`!important`) |
| **`QC_INSPECTOR`** | `#fafafa` | `#ffffff` / `#f4f4f5` | Ink monochrome | `#18181b` (`#a1a1aa` unpassed boxes) | `0` (100% Grayscale) | Stripped to B&W (`!important`) |
| **Print Slips** | `#ffffff` | `#ffffff` | `1.5px solid #000000` | N/A | `0` (Strict `#000000` / `#ffffff`) | Native `@media print` A4 |

---

## Section 3 — User-Wise Workflows & ASCII UI Mocks

> **Note on Sample Data:** Order numbers, counts, dates, and operator names inside the wireframes below are illustrative placeholders demonstrating structure; all container classes, DOM IDs, tab labels, card titles, and workflow rules match the live implementation.

### 3.1 Authentication & First-Run Setup (`authView.ts`)

**Workflow:**
1. Unauthenticated visits load First-Run Admin Setup (when no admin exists) or standard Sign In.
2. Submitting valid credentials resolves the user's `role` to its dedicated station screen (`screen-admin`, `screen-grn`, `screen-packing`, `screen-repair`, `screen-qc`) and displays `.module-switcher-bar` + station `.sub-header-bar`.
3. Invalid credentials surface inline `#991B1B` error text inside the form card.

```text
+----------------------------------------------------------------------------------------+
| [.module-switcher-bar]  HAMMAD INDUSTRIES MES                      Session: Signed Out |
+----------------------------------------------------------------------------------------+
|  Bg: #fafafa                                                                           |
|                                                                                        |
|                      +------------------------------------------+                      |
|                      | .panel-card (Bg: #ffffff, Bdr: #d4d4d8)  |                      |
|                      |------------------------------------------|                      |
|                      | Sign In · Manufacturing Execution        |                      |
|                      | Enter operator credentials to open bay.  |                      |
|                      |                                          |                      |
|                      | Username / Operator ID                   |                      |
|                      | [ inw_clerk_01                         ] |                      |
|                      |                                          |                      |
|                      | Password / PIN                           |                      |
|                      | [ ••••••••                             ] |                      |
|                      |                                          |                      |
|                      | ! Invalid credentials (#991B1B)          | <-- shown on error   |
|                      |                                          |                      |
|                      | [ Sign In (.btn-primary #18181b)       ] |                      |
|                      +------------------------------------------+                      |
|                                                                                        |
+----------------------------------------------------------------------------------------+
```

---

### 3.2 `SUPER_USER` — Command Center (`screen-admin`)

The Control Center (`superUserView.ts` + `src/components/superUser/*`) provides **5 tabs** under `.sub-header-bar` (`#09090b` with `1px solid #1E40AF` bottom border):
`Dashboard` · `Live Tracking` · `Order Creation` · `Users` · `Reports`

#### A. Tab 1 — Dashboard (`dashboardTab.ts`)

**Workflow:**
1. Top **KPI Strip** summarizes order pool, unclaimed dock stock (Amber), active WIP/REQs (Cobalt), QC holds/M-REQs (Sky), cartons/reconciled counts (Emerald), and rework/variance (`A-REQ`, Red).
2. **Exceptions Panel** flags `VARIANCE Δ` (Red) vs `RECONCILED ✓` (Emerald).
3. **7-Column Pipeline Bar Graph (`.su-vg`)** plots pair volumes across all 7 production buckets (from Order/Dock through QC/Cartons).
4. **Active Orders Table (11 columns)** gives buyer, article, size/total quantities, dock stock, WIP, rework, cartons, variance, and status.
5. **Interactive Branching Order Tree ("Mind Map", `.su-tree-group` / `.su-tree-branches`)** visualizes parent-to-child order splits (`ORD-2026-101` -> `-1`, `-2`, `-3`) and lets the Super User click into each sub-order's linked **`GRN`**, **`REQ`**, **`M-REQ`**, and **`A-REQ`** nodes to inspect full lineage.

```text
+---------------------------------------------------------------------------------------------------+
| [.module-switcher-bar]  HAMMAD INDUSTRIES MES                       SUPER_USER · Switch | SignOut |
+---------------------------------------------------------------------------------------------------+
| [.sub-header-bar #09090b, border-bottom: 1px solid #1E40AF]                                       |
| CONTROL CENTER · EXECUTIVE OVERSIGHT                                            2026-11-19 · LIVE |
| [ Dashboard (active #1E40AF) ] [ Live Tracking ] [ Order Creation ] [ Users ] [ Reports ]         |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  +-- KPI STRIP --------------------------------------------------------------------------------+  |
|  | Planned Orders | Dock Pool(Ambr)| In WIP (Cobalt)| QC Hold (Sky) | Cartons (Grn)  | A-REQ   |  |
|  | 12,400 prs     | 1,850 (#D977)  | 3,200 (#1E40)  | 640 (#0284C7) | 4,900 (#16A3)  | 45(#DC) |  |
|  +---------------------------------------------------------------------------------------------+  |
|                                                                                                   |
|  +-- EXCEPTIONS PANEL ----------------------+  +-- 7-COL PIPELINE BAR GRAPH (.su-vg) ----------+  |
|  | [VARIANCE Δ · #DC2626] ORD-2026-098-2(-8)|  |   4.9k                                 ██    |  |
|  | [VARIANCE Δ · #DC2626] Hall B A-REQ >2cyc|  |   3.2k            ██   ██              ██    |  |
|  | [RECONCILED ✓ · #16A34A] ORD-2026-094    |  |   1.8k       ██   ██   ██   ██   ██    ██    |  |
|  +------------------------------------------+  |   Dock  St1  St2  St3  MREQ QCHld Cartons    |  |
|                                                +----------------------------------------------+  |
|                                                                                                   |
|  +-- ACTIVE ORDERS (11 COLUMNS) ---------------------------------------------------------------+  |
|  | Order ID       | Buyer  | Article | Plan | Dock | WIP | M-REQ | A-REQ | QC | Cartons | State|  |
|  | ORD-2026-101-1 | Nordic | TigWeld |  600 |  150 | 300 |   Yes |     6 |  0 |     144 | WIP  |  |
|  | ORD-2026-101-2 | Nordic | CryoPro |  400 |  220 | 120 |    No |     0 | 60 |       0 | HOLD |  |
|  +---------------------------------------------------------------------------------------------+  |
|                                                                                                   |
|  +-- BRANCHING ORDER TREE ("MIND MAP" · .su-tree-group / .su-tree-branches) -------------------+  |
|  |                                                                                             |  |
|  |  [Parent: ORD-2026-101 (#1E40AF Cobalt)] · Nordic Safety · 2 Articles · 1,000 prs           |  |
|  |     ├── [Sub-Order: ORD-2026-101-1 · TigWeld · 600 prs]  (clickable node)                   |  |
|  |     │     ├── [GRN-2026-411] +350 prs (Amber #D97706) · Hall A / Stitcher Ali               |  |
|  |     │     ├── [REQ-2026-205]  300 prs (Cobalt #1E40AF) · Stage 3 Active                     |  |
|  |     │     ├── [M-REQ-2026-088] Carton + Polybag Kit (Sky #0284C7)                           |  |
|  |     │     └── [A-REQ-2026-019] 6 prs Cuff Tear -> Bay #2 (Red #DC2626)                      |  |
|  |     └── [Sub-Order: ORD-2026-101-2 · CryoPro · 400 prs]  (clickable node)                   |  |
|  |           ├── [GRN-2026-412] +280 prs (Amber #D97706) · Hall B / Stitcher Bilal             |  |
|  |           └── [REQ-2026-209]  180 prs (Cobalt #1E40AF) · 60 prs Stage 4 Hold (#0284)        |  |
|  +---------------------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------------------+
```

#### B. Tab 2 — Live Tracking (`liveTrackingTab.ts`)

**Workflow:**
Filter across Order/Sub-Order, Slip Type (`GRN`/`REQ`/`M-REQ`/`A-REQ`), Hall, and Status to cross-check the **Supply Stream** (inward stitcher receipts + contractor balances) against the **Execution Stream** (Packing Hall `REQ`, `M-REQ`, `A-REQ`, and Stage milestones).

```text
+---------------------------------------------------------------------------------------------------+
| Filter: [ Search ORD / Slip # ]  [ Type: All v ]  [ Hall: All v ]  [ Status: All v ]   [ Reset ]  |
+------------------------------------------------+--------------------------------------------------+
| SUPPLY STREAM (Amber GRN · Contractor Balance) | EXECUTION STREAM (Cobalt REQ / Sky M-REQ / Red A)|
|------------------------------------------------|--------------------------------------------------|
| [.su-ref GRN-412] ORD-2026-101-2  +280 prs     | [.su-ref REQ-209] ORD-2026-101-2 · Stage 4 Hold  |
|   Hall B -> Bilal · Bal: 120 prs               |   180 issued · 60 pending QC #4                  |
| [.su-ref GRN-411] ORD-2026-101-1  +350 prs     | [.su-ref M-REQ-088] ORD-2026-101-1 · Issued      |
|   Hall A -> Ali   · Bal: 250 prs               | [.su-ref A-REQ-019] ORD-2026-101-1 · 6 prs Bay 2 |
+------------------------------------------------+--------------------------------------------------+
```

#### C. Tab 3 — Order Creation & Master Registries (`orderCreationTab.ts`)

**Workflow:**
1. Select a **Buyer** (e.g., `Nordic Safety`).
2. **Multi-Select Articles** available for that buyer—checking multiple pairs/articles renders per-article size matrices in the builder.
3. Submitting the Multi-Article Buyer Order executes atomically and splits the order under a shared Parent ID (`ORD-2026-101`) into independent sub-orders (`ORD-2026-101-1`, `ORD-2026-101-2`, ...) so each sub-order owns separate `REQ`, `M-REQ`, and `A-REQ` slip chains without cross-contamination.
4. Collapsible **Master Registries `02`–`06`** below/alongside manage system data, including **`04 Halls & Stitchers`** rendered as `.su-halls-*` cards.

```text
+---------------------------------------------------------------------------------------------------+
| [01] MULTI-ARTICLE BUYER ORDER CREATION                                                           |
|---------------------------------------------------------------------------------------------------|
| Buyer: [ Nordic Safety (EUR)           v ]    Target Dispatch: [ 2026-12-05 ]  PO#: [ NS-8841 ]   |
| Select Buyer Articles (Multi-Select):                                                             |
|   [x] TigWeld Leather (ART-104)      [x] CryoPro Insulated (ART-209)     [ ] KevlarGrip (ART-311) |
|                                                                                                   |
|  Sub-Order Preview: ORD-2026-101-1 · TigWeld Leather                                              |
|  Size Matrix:  S [ 100 ]   M [ 200 ]   L [ 200 ]   XL [ 100 ]    Subtotal: 600 prs                |
|                                                                                                   |
|  Sub-Order Preview: ORD-2026-101-2 · CryoPro Insulated                                            |
|  Size Matrix:  S [  50 ]   M [ 150 ]   L [ 150 ]   XL [  50 ]    Subtotal: 400 prs                |
|                                                                                                   |
|  Total Parent Order (ORD-2026-101): 2 Sub-Orders (-1, -2) · 1,000 prs [ Create Split Orders #1E4] |
+---------------------------------------------------------------------------------------------------+
| COLLAPSIBLE MASTER REGISTRIES (02 - 06)                                                           |
|  [▸ 02 Buyers Registry]   [▸ 03 Articles & Specs]   [▾ 04 Halls & Stitchers (.su-halls-*)]        |
|  +-----------------------------+  +-----------------------------+  +---------------------------+  |
|  | Hall A · Lead: Tariq        |  | Hall B · Lead: Imran        |  | Hall C · Lead: Kamran     |  |
|  | Stitchers: Ali, Zain, Raza  |  | Stitchers: Bilal, Usman     |  | Stitchers: Nadeem, Fahad  |  |
|  +-----------------------------+  +-----------------------------+  +---------------------------+  |
|  [▸ 05 Packing Materials Catalog]   [▸ 06 Defect & Reason Codes]                                  |
+---------------------------------------------------------------------------------------------------+
```

#### D. Tabs 4 & 5 — Users & Reports

```text
+-------------------------------------------------+-------------------------------------------------+
| TAB 4: USERS MANAGEMENT                         | TAB 5: LEDGER & EXCEPTION REPORTS               |
|-------------------------------------------------|-------------------------------------------------|
| Operator        Role                 Status     | [ Export GRN Ledger ]  [ Export WIP / QC Audit ]|
| super_01        SUPER_USER           Active     | [ Parent vs Sub-Order Reconciliation Report ]   |
| dock_clerk_1    INWARD_CLERK         Active     |                                                 |
| pack_sup_1      PACKING_SUPERVISOR   Active     | Preview: ORD-2026-101 (-1, -2) · Variance: 0    |
| repair_lead_1   ALTERATION_LEAD      Active     | Contractor Stitcher Balance Summary · Ready     |
| qc_insp_4402    QC_INSPECTOR         Active     |                                                 |
+-------------------------------------------------+-------------------------------------------------+
```

---

### 3.3 `INWARD_CLERK` — Inward Register Dock #1 (`screen-grn`)

**Workflow (`inwardRegisterView.ts` + `inward-register.css`):**
1. Quiet-chrome `.inw` 4-card layout inside fluid `.inw-main` below `.sub-header-bar` (`#09090b`, `1px solid #1E40AF` bottom border).
2. **Card 1 (`Receive goods`):** Cascading `Hall -> Stitcher -> Received from`, Sub-Order selection (showing Article, NO Buyer), spinner-free `.inw-size-input` size matrix -> Cobalt `#1E40AF` CTA logs a **`GRN` (`RCV`)** adding pairs to the unclaimed Dock Stock Pool.
3. **Card 2 (`Packing hall requisition queue`):** Lists pending Packing Hall **`REQ`** requests (`.su-ref--req` Cobalt dot); clerk issues Dock Stock to transfer pairs into Packing Hall WIP.
4. **Card 3 (`Store receiving ledger`):** Historical audit table with precision `.su-ref--rcv` (`#16A34A` dot), `.su-ref--req` (`#1E40AF` dot), and `.su-ref--areq` (`#DC2626` dot) markers, Print slip trigger, and Void action (`#DC2626`).
5. **Card 4 (`Summary Footer`):** Totals for Dock Pool & shift receipts. Header button `#btn-inward-nav-repair` lets the Inward Clerk switch directly into Alteration Bay (`screen-repair`).

```text
+---------------------------------------------------------------------------------------------------+
| [.module-switcher-bar]  HAMMAD INDUSTRIES MES                       INWARD_CLERK · [Bay #2 Toggle]|
+---------------------------------------------------------------------------------------------------+
| [.sub-header-bar #09090b, border-bottom: 1px solid #1E40AF]                                       |
| INWARD REGISTER · DOCK #1                                                       2026-11-19 (#d4d4)|
|                                                 [#btn-inward-nav-repair: Open Alteration Bay ->]  |
+---------------------------------------------------------------------------------------------------+
| [.inw-main (fluid width, Bg: #fafafa, .inw-card Bg: #ffffff, Border: #e4e4e7)]                    |
|                                                                                                   |
|  +-- CARD 1: Receive goods --------------------------------------------------------------------+  |
|  | Hall: [ Hall A v ]  ->  Stitcher: [ Ali (#S-12) v ]  ->  Received from: [ Ali (Contractor) ]|  |
|  | Order / Sub-Order: [ ORD-2026-101-1 · TigWeld (No Buyer Shown)   v ]                        |  |
|  | Size Matrix (.inw-size-input, spinner-free):                                                |  |
|  |   S [  50 ]   M [ 100 ]   L [ 100 ]   XL [  50 ]      Batch Receipt Total: 300 prs          |  |
|  |                                          [ Record GRN Receipt (Cobalt CTA #1E40AF) ]        |  |
|  +---------------------------------------------------------------------------------------------+  |
|                                                                                                   |
|  +-- CARD 2: Packing hall requisition queue -------------+ +-- CARD 3: Store receiving ledger -+  |
|  | (● #1E40AF) REQ-210 · ORD-2026-101-1 · 120 prs        | | Slip     Order       Qty   State  |  |
|  |   Size breakdown: S:20 M:40 L:40 XL:20  [Issue Stock] | | ● GRN-412 101-2      280  ● RCV   |  |
|  |                                                       | | ● GRN-411 101-1      350  ● RCV   |  |
|  | (● #B45309) Pending Queue: 1 Req awaiting issue       | | ● REQ-209 101-2      180  ● Issued|  |
|  |                                                       | | ● A-REQ-19 101-1      6  ● Voided |  |
|  +-------------------------------------------------------+ +-----------------------------------+  |
|                                                                                                   |
|  +-- CARD 4: Summary Footer (.inw-subtle #f4f4f5) ---------------------------------------------+  |
|  | Shift GRNs: 630 prs  |  Dock Pool Unclaimed: 370 prs  |  Issued to Packing: 180 prs         |  |
|  +---------------------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------------------+
```

---

### 3.4 `PACKING_SUPERVISOR` — Packing Hall (`screen-packing`)

**Workflow (`packingHallView.ts` + `shopFloor.css`, 100% Monochrome):**
1. **Strict Stock-Only Visibility:** `#wip-batch-select` lists only `dockReadyOrders` (`<N> pairs available`). Orders with zero unclaimed dock stock never appear, and planned totals or Buyer names are never exposed.
2. **`Create Packing Hall Requisition` Modal:** Displays only `Available at Dock` and the `Available` size row; supervisor enters desired quantities up to available dock limits to submit a **`REQ`** to Dock #1.
3. **5-Stage WIP Pipeline (`.pipeline-stage-card`):** Tracks batches monotonically from `Stage 1` through `Stage 5` (active card styled with `.stage-active` & `.stage-active-badge` in `#09090b`/`#18181b`).
   - Reaching **Stage 3** unlocks the **dashed-border `Material Requisition` (`M-REQ`) card** for cartons/polybags/labels.
   - **Stage 4** automatically raises `.packing-qc-notice` (**Final QC Hold Gate**) awaiting `QC_INSPECTOR` sign-off before Stage 5 clearance.
   - Defective pairs can be pulled into an **`A-REQ`** toward Alteration Bay #2.
4. **Bottom Analytics & Split Tables:** WIP Analytics chart, Split **Alteration Log** & **Master Carton Manifest**, and **RTY (Rolled Throughput Yield) Footer**.

```text
+---------------------------------------------------------------------------------------------------+
| [.module-switcher-bar]  HAMMAD INDUSTRIES MES                               PACKING_SUPERVISOR    |
+---------------------------------------------------------------------------------------------------+
| PACKING HALL · EXECUTION FLOOR (100% Monochrome: #fafafa / #ffffff / #f4f4f5 / #09090b)           |
| Stock Picker (#wip-batch-select): [ ORD-2026-101-1 · TigWeld · 150 pairs available  v ] [New REQ] |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  +-- MODAL: Create Packing Hall Requisition (Overlay) -----------------------------------------+  |
|  | Batch: ORD-2026-101-1 · TigWeld        Available at Dock: 150 prs  (Planned qty NOT shown)  |  |
|  | Size Row    |  S    |  M    |  L    |  XL   |                                               |  |
|  | Available   |  25   |  50   |  50   |  25   |                                               |  |
|  | Request Qty | [25]  | [40]  | [40]  | [20]  |   [ Submit REQ (.btn-primary #18181b) ]       |  |
|  +---------------------------------------------------------------------------------------------+  |
|                                                                                                   |
|  +-- 5-STAGE WIP PIPELINE (.pipeline-stage-card) ----------------------------------------------+  |
|  | +------------+  +------------+  +-------------------+  +-----------------+  +-------------+ |  |
|  | | Stage 1    |->| Stage 2    |->| STAGE 3 [ACTIVE]  |->| Stage 4         |->| Stage 5     | |  |
|  | | Sorting    |  | Trimming   |  | Cuff & Pair Match |  | QC Hold Gate    |  | Cartons     | |  |
|  | | 0 prs      |  | 0 prs      |  | 300 prs (#18181b) |  | (.packing-qc-   |  | 144 prs     | |  |
|  | +------------+  +------------+  +---------+---------+  |  notice) 60 prs |  | 12 ctns     | |  |
|  |                                           │            +-----------------+  +-------------+ |  |
|  |       +-----------------------------------▼--------------------------+                      |  |
|  |       | - - - MATERIAL REQUISITION (M-REQ) · UNLOCKED AT STAGE 3 - - | (dashed border card) |  |
|  |       | Material: [ 12-Pair Master Carton + Inner Polybag v ] Qty:[5]| [ Request M-REQ ]    |  |
|  |       +--------------------------------------------------------------+                      |  |
|  +---------------------------------------------------------------------------------------------+  |
|                                                                                                   |
|  +-- WIP ANALYTICS CHART --------+  +-- SPLIT TABLES: ALTERATION LOG | CARTON MANIFEST --------+  |
|  | St1 [    ] St2 [    ]         |  | A-REQ-019 | 6 prs | Cuff Tear | CTN-01..12 | 144 prs   |  |
|  | St3 [████████] St4 [███]      |  | [ Flag New A-REQ Rework ]     | Pending QC4 | Approved |  |
|  +-------------------------------+  +-------------------------------+--------------------------+  |
|                                                                                                   |
|  +-- RTY FOOTER (#f4f4f5) ---------------------------------------------------------------------+  |
|  | Rolled Throughput Yield (RTY): 98.0%  |  Active WIP: 360 prs  |  Cartons Packed: 144 prs    |  |
|  +---------------------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------------------+
```

---

### 3.5 `ALTERATION_LEAD` — Alteration Bay #2 (`screen-repair`)

**Workflow (`repairAndQcViews.ts` + `shopFloor.css`, 100% Monochrome):**
1. Displays the **2-Cycle Rule Banner** prominently at the top of the bay.
2. Lists incoming **`A-REQ`** defect slips (accessible both to `ALTERATION_LEAD` and `INWARD_CLERK` via `#btn-inward-nav-repair`).
3. Lead assigns stitcher rework using the **Hall `<optgroup>` Stitcher selector** (`Hall A`, `Hall B`, ...) and defect code.
4. Once repaired or condemned, operator closes the ticket via **`Return Stage 1`** (cycles 1–2, returning pairs to Packing Hall Stage 1) or **`Scrap`** (cycle limit exceeded / unrepairable, logging contractor debit/variance).
5. Bottom **Pareto / Summary Footer** aggregates top defect reasons and rework vs scrap totals.

```text
+---------------------------------------------------------------------------------------------------+
| [.module-switcher-bar]  HAMMAD INDUSTRIES MES                                ALTERATION_LEAD      |
+---------------------------------------------------------------------------------------------------+
| ALTERATION BAY #2 · REWORK & SCRAP CONTROL (100% Monochrome)                                      |
+---------------------------------------------------------------------------------------------------+
| [!] RULE BANNER (#f4f4f5): Maximum 2 Rework Cycles Allowed. Exceeding Cycle 2 requires SCRAP.     |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  +-- REWORK ASSIGNMENT INTAKE ----------------------+  +-- ACTIVE A-REQ REWORK QUEUE -----------+  |
|  | A-REQ Slip: [ A-REQ-2026-019 (ORD-2026-101-1) v ]|  | Slip      Qty  Cyc  Action           |  |
|  | Assign Stitcher (Hall <optgroup>):               |  | A-REQ-019   6   1   [Return Stage 1] |  |
|  | [ -- Hall A --                               v ] |  |                     [Scrap (.danger)]  |  |
|  |   Hall A: Ali (#S-12)                            |  | A-REQ-014   4   2   [Return Stage 1] |  |
|  |   Hall B: Bilal (#S-19)                          |  |                     [Scrap (.danger)]  |  |
|  | Defect: [ Cuff Seam Tear   ]  Qty: [ 6 ]         |  |                                        |  |
|  |                 [ Assign Rework (.btn-primary) ] |  |                                        |  |
|  +--------------------------------------------------+  +----------------------------------------+  |
|                                                                                                   |
|  +-- PARETO / SUMMARY FOOTER (#f4f4f5) --------------------------------------------------------+  |
|  | Top Defects: Cuff Tear (60%) · Thumb Stitch (40%) | Returned Stg 1: 18 prs | Scrap: 2 prs  |  |
|  +---------------------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------------------+
```

---

### 3.6 `QC_INSPECTOR` — Final QC Dock #4 (`screen-qc`)

**Workflow (`repairAndQcViews.ts` + `shopFloor.css`, 100% Monochrome):**
1. Selects a batch awaiting clearance in **Stage 4 Hold** (`Order Summary without Buyer`—strictly blind QA).
2. Works through the **5-Item AQL 1.5 Checklist** (`.checklist-*`: `#a1a1aa` unpassed -> `#18181b` / `#09090b` passed).
3. Enters personal **Inspector Stamp ID** (e.g., `4402`) and records pass/hold verdict.
4. Passed batches release Stage 4 into **Stage 5 Master Carton Manifest** and update the **Dispatch Footer**.

```text
+---------------------------------------------------------------------------------------------------+
| [.module-switcher-bar]  HAMMAD INDUSTRIES MES                                   QC_INSPECTOR      |
+---------------------------------------------------------------------------------------------------+
| FINAL QC · DOCK #4 (100% Monochrome · Blind Inspection)                                           |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  +-- ORDER SUMMARY (WITHOUT BUYER) ------------------------------------------------------------+  |
|  | Sub-Order: ORD-2026-101-2   |   Article: CryoPro Insulated   |   Held at Stage 4: 60 prs    |  |
|  | Size Matrix (.size-matrix-table):   S: 10   M: 20   L: 20   XL: 10   (Buyer: HIDDEN)        |  |
|  +---------------------------------------------------------------------------------------------+  |
|                                                                                                   |
|  +-- 5-ITEM AQL 1.5 CHECKLIST ----------------------+  +-- MASTER CARTON MANIFEST --------------+  |
|  | [x] (#18181b) 1. Seam Integrity & Stitch Density |  | Carton ID  Sub-Order    Pairs Status |  |
|  | [x] (#18181b) 2. Pair Left/Right Length Match    |  | CTN-013    101-2        12    Sealed |  |
|  | [x] (#18181b) 3. Lining & Cuff Elasticity Check  |  | CTN-014    101-2        12    Sealed |  |
|  | [ ] (#a1a1aa) 4. Surface Cleanliness & Mark-Free |  | CTN-015    101-2        12    Hold   |  |
|  | [ ] (#a1a1aa) 5. Inner Polybag & Size Labels     |  |                                        |  |
|  | [ Approve Stage 4 -> 5 (.btn-primary #18181b) ]  |  | Inspector Stamp ID: [ 4402           ] |  |
|  |                                                  |  | [ Reject Stage 4 Hold -> A-REQ       ] |  |
|  +--------------------------------------------------+  +----------------------------------------+  |
|                                                                                                   |
|  +-- DISPATCH FOOTER (#f4f4f5) ----------------------------------------------------------------+  |
|  | Inspected Today: 240 prs  |  Approved & Cleared for Dispatch: 24 ctns  |  Stamp ID: 4402    |  |
|  +---------------------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------------------+
```

---

### 3.7 Printable Shop-Floor Slips (`print.css`)

**Workflow:**
- Clicking Print on any **`GRN`**, **`REQ`**, **`M-REQ`**, or **`A-REQ`** renders `.printable-slip-box`.
- Under `@media print` (`A4 portrait`), `print.css` overrides all screen colours with `#ffffff` background, `#000000` (`!important`) text, `1.5px solid #000000` outer border, and `1px solid #000000` grid borders.
- **Buyer Name is permanently omitted** from all shop-floor slips.

```text
+======================================================================================+
| .printable-slip-box  (Bg: #ffffff · Ink: #000000 !important · Border: 1.5px solid)   |
|--------------------------------------------------------------------------------------|
| HAMMAD INDUSTRIES · SHOP-FLOOR DOCUMENT SLIP              SLIP NO: REQ-2026-209      |
| DOCUMENT TYPE: [ GRN | REQ | M-REQ | A-REQ ]              DATE:    2026-11-19        |
|--------------------------------------------------------------------------------------|
| Sub-Order / Lot : ORD-2026-101-2     | Article    : CryoPro Insulated                |
| Source / Station: Dock #1 -> Pack    | Buyer      : [ OMITTED ON SHOP-FLOOR SLIPS ]  |
| Hall / Stitcher : Hall B -> Bilal    | Cycle / Ref: GRN-412                          |
+--------------------------------------------------------------------------------------+
| SIZE BREAKDOWN (1px solid #000000 cell borders)                                      |
| +--------+--------+--------+--------+--------+-------------+                         |
| |   S    |   M    |   L    |   XL   | OTHER  |    TOTAL    |                         |
| +--------+--------+--------+--------+--------+-------------+                         |
| |   25   |   65   |   65   |   25   |   0    |   180 prs   |                         |
| +--------+--------+--------+--------+--------+-------------+                         |
|                                                                                      |
| Issued By: ________________________     Received By: ________________________        |
+======================================================================================+
```
