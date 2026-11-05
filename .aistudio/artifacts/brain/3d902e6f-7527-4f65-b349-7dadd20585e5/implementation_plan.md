# Meridian Works MES — Relational Order-to-GRN-to-Requisition Hierarchy & Super User Reconciliation Plan

Extend the factory data model so every Master Order explicitly owns its list of Inward Receiving Batches (`GRN-0001..N`) and Packing Requisition Lots (`REQ-0001..N` along with `M-REQ` and `A-REQ`), and surface those clickable links with automatic Gate and Floor pair reconciliation directly on the Super User Dashboard.

## User Review & Critical Decisions

> [!IMPORTANT]
> Please review the confirmed architectural and design decisions below. Click **Proceed** when you are ready for these changes to be implemented.

- **Confirmed Decision 1 — First-Class Relational Hierarchy**: Each Master Order record directly maintains its ordered lists of child GRN codes (`GRN-0001`, `GRN-0002`, ...) and Requisition numbers (`REQ-0001`, `REQ-0002`, ...), while each Requisition also tracks the source GRN batches that supplied its footwear pairs.
- **Confirmed Decision 2 — Two-Way Automatic Reconciliation on Super User Dashboard**: The Super User Dashboard automatically verifies both **Gate Reconciliation** ($\text{Total GRN Received} = \text{Issued to REQs} + \text{Gate Buffer}$) and **Floor Reconciliation** ($\text{Issued to REQs} = \text{Floor WIP} + \text{Stage 4 QC Hold} + \text{Alteration/Scrap} + \text{Stage 5 Packed}$), displaying a clear `RECONCILED ✓` or `VARIANCE Δ` status per Order.
- **Confirmed Decision 3 — Color Scope Boundary**: The UI/UX Pro Max Industrial Command Center palette applies **exclusively** to the Super User view. All shop-floor operator modules (`Inward Register`, `Packing Hall`, `Alteration Bay`, `Final QC`) and all printable slips (`GRN`, `REQ`, `M-REQ`, `A-REQ`, and A4 Reports) remain 100% monochrome black-and-white.

---

### 1. Overview & Core Concept

- **What It Does**: Connects every Master Buyer Order (`ORD-xxxx`) to multiple staggered contractor deliveries (`GRN-0001`, `GRN-0002`, `GRN-0003`) and multiple shop-floor packing requisitions (`REQ-0001`, `REQ-0002`, `REQ-0003`), displaying the complete chain of slips (`GRN`, `REQ`, `M-REQ`, `A-REQ`) and live pair-accounting math right on the main Super User Dashboard.
- **Target Audience / Persona**: Factory Super Users, Plant Heads, and Production Controllers who need an immediate, single-screen answer to *"Which GRN batches and Packing Requisitions belong to this Order, and is every single pair accounted for?"*
- **Key Value**: Eliminates blind spots between the Inward Gate and the Packing Floor by turning text-only references into live clickable relational links and automatic mathematical reconciliation.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Single-Screen Relational Overview (`1. Dashboard`)**: In the **Active Master Orders Pulse** table on the Super User Dashboard, each Order row now displays:
     - **Linked GRN Batches**: Clickable chips (`GRN-0001 (250)`, `GRN-0002 (200)`, `GRN-0003 (150)`) that jump straight to the expanded traceability ledger or print slip.
     - **Linked Requisitions (`REQ` / `M` / `A`)**: Clickable chips (`REQ-0001 · M · A`, `REQ-0002 · M · A`) that inspect the specific packing lot, material requisition, or alteration slip.
     - **Reconciliation Status**: An instant audit badge showing **`RECONCILED ✓`** when Gate and Floor math balance, or **`VARIANCE Δ`** with the exact pair discrepancy if any pairs are unaccounted for.
  2. **One-Click Multi-Batch Demo Loader on Dashboard**: A primary toolbar button on `1. Dashboard` (*"Load 1-Order → 3-GRNs → 3-REQs Demo"*) populates a realistic 600-pair Master Order split across 3 staggered GRN deliveries and 3 active Requisitions so the Super User can test reconciliation immediately.
  3. **Drill-Down to Live Tracking (`2. Live Tracking`)**: Clicking any GRN or REQ chip on the Dashboard opens and scrolls to that exact Order's expanded 3-tier breakdown (`Order → GRN Batches → Requisitions + M-REQ + A-REQ`) in Live Tracking.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-Trust Industrial Command Center (scoped strictly to `.superuser-command-center`) paired with 100% Monochrome Brutalist Ledger for shop-floor screens and thermal/A4 printouts.
  - *Color Palette & Mood*:
    - **Canvas & Surfaces**: Cool Alabaster Slate (`#F8FAFC`) background, Crisp White (`#FFFFFF`) elevation panels, and Cool Slate borders (`#CBD5E1`).
    - **Semantic Traceability Tokens**:
      - Master Order & `GRN` Batches: Industrial Navy & Cobalt (`#1E40AF` / `#2563EB`)
      - Material Slip (`M-REQ`): Steel Cyan-Blue (`#0284C7`)
      - Reconciled / Stage 5 Packed / QC Released: Signal Emerald (`#16A34A`)
      - Active Floor WIP / Stage 4 QC Hold: Industrial Amber (`#D97706`)
      - Alteration Slip (`A-REQ`) / Scrap / Reconciliation Variance: Signal Crimson (`#DC2626`)
  - *Typography & Hierarchy*: Crisp geometric sans-serif structure paired with strict monospace tabular numerals (`IBM Plex Mono`, `tabular-nums`) for all batch codes, size matrices (6–12), pair quantities, and reconciliation deltas.
  - *Component Styling & Layout*: High-density 1440px desktop tables with compact row heights, single-elevation cards with 1px structural borders, and zero nested card clutter.
- **Interactive Feedback & Motion**: Instantaneous (<150ms) row expansion, hover highlights on relational chips, and live reactive recalculation of reconciliation status whenever any GRN or Requisition stage changes.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Synchronized Explicit Link Arrays + Foreign-Key Derivation**
  - *Chosen Approach*: Store explicit `grnCodes: string[]` and `reqNumbers: string[]` arrays directly on each `OrderRecord` (and `sourceGrnCodes: string[]` on each `RequisitionLotState`) while continuously synchronizing them whenever GRNs or Requisitions are added, edited, or seeded.
  - *Why*: Gives the data model explicit parent-to-child and child-to-parent pointers for fast inspection and serialization while guaranteeing that legacy or newly added records never fall out of sync.
  - *Alternatives Considered*: Relying only on ad-hoc filtering by order number string, which makes relational links invisible in the Order data structure itself.

- **Decision 2: Dual-Gate Reconciliation Formula (Dock Check + Floor Check)**
  - *Chosen Approach*: Verify every Order against two independent conservation-of-pairs equations:
    1. **Dock Equation**: $\text{Total GRN Pairs} = \text{Total REQ Issued Pairs} + \text{Available Dock Buffer}$
    2. **Floor Equation**: $\text{Total REQ Issued Pairs} = \text{Stages 1–3 WIP} + \text{Stage 4 QC Hold} + \text{Active Alteration} + \text{Scrap} + \text{Stage 5 Packed}$
  - *Why*: Separates gate-receiving discrepancies (e.g., over-issuing beyond received GRNs) from packing-floor discrepancies (e.g., unaccounted pairs between Stage 1 and Stage 5).
  - *Alternatives Considered*: A single "Planned vs. Packed" subtraction, which cannot distinguish normal work-in-progress from lost or unissued pairs.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   RELATIONAL STATE & RECONCILIATION ENGINE                 │
│                                                                            │
│  OrderRecord (Parent)                                                      │
│   ├── orderNo, poNo, buyer, article, plannedQty, sizes                     │
│   ├── grnCodes: ["GRN-0001", "GRN-0002", "GRN-0003"]  ──┐                  │
│   └── reqNumbers: ["REQ-0001", "REQ-0002", "REQ-0003"] ─┼─┐                │
│                                                         │ │                │
│  InwardRecord (Child GRN Batches) ◄─────────────────────┘ │                │
│   └── grnNo, orderNo, date, pairs, sizes, status          │                │
│                                                           │                │
│  RequisitionLotState (Child Packing Lots) ◄───────────────┘                │
│   ├── reqNo, parentOrderNo, sourceGrnCodes: ["GRN-0001", ...]              │
│   ├── materialSlipNo ("M-REQ-xxxx"), alterationSlipNo ("A-REQ-xxxx")       │
│   └── stage1..stage5, alterationRecords, scrapTotal                        │
└───────────────────────────────────────┬────────────────────────────────────┘
                                        │
                                        ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                TWO-WAY RECONCILIATION & TRACEABILITY BUILDER               │
│                                                                            │
│  • Dock Check : totalGrnPairs == totalReqIssuedPairs + dockAvailableBuffer │
│  • Floor Check: totalReqIssuedPairs == WIP + S4Hold + Alter + Scrap + S5   │
│  • Outputs    : dockReconciled, floorReconciled, variancePairs,            │
│                 grnCodes[], reqNumbers[], mReqNumbers[], aReqNumbers[]     │
└──────────────────┬────────────────────────────────────┬────────────────────┘
                   │                                    │
                   ▼                                    ▼
┌─────────────────────────────────────┐  ┌───────────────────────────────────┐
│   SUPER USER 1. DASHBOARD VIEW      │  │   SUPER USER 2. LIVE TRACKING     │
│                                     │  │                                   │
│ • Quick-Seed 1-Order→3-GRN→3-REQ    │  │ • Expandable 3-Tier Order Cards   │
│ • Active Master Orders Pulse Table: │  │ • Tier 1: Master Order + Math     │
│   - Clickable GRN-xxxx Badges       │  │ • Tier 2: Linked GRN Sub-Table    │
│   - Clickable REQ / M / A Badges    │  │ • Tier 3: Linked REQ/M/A Sub-Table│
│   - RECONCILED ✓ / VARIANCE Δ Badge │  │ • Recharts Planned vs. Packed     │
└─────────────────────────────────────┘  └───────────────────────────────────┘
```

- **Data Model & State**:
  - **Master Order (`OrderRecord`)**: Extended with `grnCodes: string[]` and `reqNumbers: string[]` so every order explicitly lists its child GRN batches and Requisition lots.
  - **Requisition Lot (`RequisitionLotState`)**: Extended with `sourceGrnCodes: string[]` linking each packing requisition back to the specific GRN deliveries that funded its footwear pairs.
  - **Traceability Item (`OrderTraceabilityItem`)**: Extended with explicit relational arrays (`grnCodes`, `reqNumbers`, `mReqNumbers`, `aReqNumbers`) and reconciliation metrics (`dockReconciled`, `floorReconciled`, `dockVariancePairs`, `floorVariancePairs`, `isFullyReconciled`, `reconciliationSummary`).

- **Interactive Component & State Mapping**:
  - **Automatic Relational Sync**: Creating a GRN in `Inward Register`, issuing a Requisition in `Packing Hall`, creating an Order in `Master Setup`, or clicking the Multi-Batch Demo button automatically updates `grnCodes` and `reqNumbers` on the parent `OrderRecord` and `sourceGrnCodes` on each `RequisitionLotState`.
  - **Clickable Relational Chips on Dashboard**: Clicking any `GRN-xxxx` or `REQ-xxxx` badge inside the Super User Dashboard's **Active Master Orders Pulse** table switches to `2. Live Tracking` with that parent Order automatically expanded, or opens the official printable slip modal (`GRN`, `REQ`, `M-REQ`, or `A-REQ`).
  - **Live Reconciliation Badges**: Every stage advance, QC release, alteration transfer, or scrap entry immediately recomputes `isFullyReconciled` and updates the Dashboard's Reconciliation column and KPI summary.
