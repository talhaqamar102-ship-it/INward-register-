import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'gloves_packing.db');
export const db = new DatabaseSync(dbPath);

export function initDatabase() {
  // On Windows bind mounts (Docker Desktop) even non-WAL pragma writes can fail if
  // the volume metadata is not fully mapped; degrade gracefully instead of crashing.
  for (const pragma of [
    'PRAGMA journal_mode = WAL',
    'PRAGMA synchronous = NORMAL',
    'PRAGMA busy_timeout = 5000',
    'PRAGMA foreign_keys = ON'
  ]) {
    try {
      db.exec(`${pragma};`);
    } catch {
      // Keep defaults if this pragma is unsupported by the mounted volume
    }
  }

  db.exec(`
    -- 1. Customers Master
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      country TEXT,
      inspection_preference TEXT NOT NULL CHECK(inspection_preference IN ('RANDOM', 'THOROUGH')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Glove Products Master
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      polybag_per_pair INTEGER NOT NULL DEFAULT 1,
      silica_gel_per_pair INTEGER NOT NULL DEFAULT 1,
      stickers_per_pair INTEGER NOT NULL DEFAULT 2,
      pairs_per_carton INTEGER NOT NULL DEFAULT 50,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. Raw Gloves Store Inventory
    CREATE TABLE IF NOT EXISTS store_gloves_inventory (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id),
      customer_id TEXT NOT NULL REFERENCES customers(id),
      available_pairs INTEGER NOT NULL CHECK(available_pairs >= 0),
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 4. Packing Materials Store Inventory
    CREATE TABLE IF NOT EXISTS store_materials_inventory (
      material_code TEXT PRIMARY KEY,
      material_name TEXT NOT NULL,
      available_qty INTEGER NOT NULL CHECK(available_qty >= 0),
      unit TEXT NOT NULL,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 5. Glove Requisitions (Requested by Packing Hall, Issued by Glove Store)
    CREATE TABLE IF NOT EXISTS glove_requisitions (
      req_number TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      requested_pairs INTEGER NOT NULL CHECK(requested_pairs > 0),
      issued_pairs INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK(status IN ('PENDING', 'ISSUED', 'IN_PROGRESS', 'COMPLETED', 'DISPATCHED')),
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      issued_at DATETIME
    );

    -- 6. Packing Hall WIP Stage Tracking
    CREATE TABLE IF NOT EXISTS packing_wip (
      req_number TEXT PRIMARY KEY REFERENCES glove_requisitions(req_number),
      current_step TEXT NOT NULL DEFAULT 'STEP_1',
      
      -- Step 1: Checking / Inspection
      step1_checking_in INTEGER NOT NULL DEFAULT 0,
      step1_checking_good INTEGER NOT NULL DEFAULT 0,
      step1_checking_defects INTEGER NOT NULL DEFAULT 0,

      -- Step 2: Ironing & Brushing
      step2_ironing_in INTEGER NOT NULL DEFAULT 0,
      step2_ironing_good INTEGER NOT NULL DEFAULT 0,
      step2_ironing_defects INTEGER NOT NULL DEFAULT 0,

      -- Step 3: Pair Matching
      step3_matching_in INTEGER NOT NULL DEFAULT 0,
      step3_matching_good INTEGER NOT NULL DEFAULT 0,
      step3_matching_defects INTEGER NOT NULL DEFAULT 0,

      -- Step 4: 1st Packing (Accessories)
      step4_materials_issued INTEGER NOT NULL DEFAULT 0,
      step4_packing_good INTEGER NOT NULL DEFAULT 0,

      -- Step 5: 2nd Packing (Cartons)
      step5_cartons_packed INTEGER NOT NULL DEFAULT 0,
      step5_pairs_packed INTEGER NOT NULL DEFAULT 0,

      -- QC Status
      final_qc_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(final_qc_status IN ('PENDING', 'INSPECTING', 'APPROVED_DISPATCH', 'REPAIR_REQUIRED')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 7. Packing Material Sub-Requisitions (Created after Step 3)
    CREATE TABLE IF NOT EXISTS material_requisitions (
      mat_req_number TEXT PRIMARY KEY,
      req_number TEXT NOT NULL REFERENCES glove_requisitions(req_number),
      pairs_count INTEGER NOT NULL CHECK(pairs_count > 0),
      polybags_requested INTEGER NOT NULL,
      silica_gel_requested INTEGER NOT NULL,
      stickers_requested INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('PENDING', 'ISSUED')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      issued_at DATETIME
    );

    -- 8. Alterations & Repairs Ledger (Always returns to Step 1)
    CREATE TABLE IF NOT EXISTS alterations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      req_number TEXT NOT NULL REFERENCES glove_requisitions(req_number),
      source_stage TEXT NOT NULL CHECK(source_stage IN ('STEP_1_CHECKING', 'STEP_2_IRONING', 'STEP_3_MATCHING', 'FINAL_INSPECTION')),
      pairs_count INTEGER NOT NULL CHECK(pairs_count > 0),
      defect_reason TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('SENT_FOR_ALTERATION', 'RETURNED_TO_CHECKING')),
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      returned_at DATETIME
    );

    -- 9. Cartons
    CREATE TABLE IF NOT EXISTS cartons (
      carton_barcode TEXT PRIMARY KEY,
      req_number TEXT NOT NULL REFERENCES glove_requisitions(req_number),
      carton_number INTEGER NOT NULL,
      total_cartons INTEGER NOT NULL,
      pairs_count INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PACKED' CHECK(status IN ('PACKED', 'SAMPLED_PASS', 'THOROUGH_PASS', 'DEFECTIVE_REPAIRED')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 10. Final Inspection Records
    CREATE TABLE IF NOT EXISTS final_inspections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      req_number TEXT NOT NULL REFERENCES glove_requisitions(req_number),
      customer_id TEXT NOT NULL REFERENCES customers(id),
      inspection_type TEXT NOT NULL CHECK(inspection_type IN ('RANDOM_SAMPLING', 'THOROUGH_100_PCT')),
      total_cartons INTEGER NOT NULL,
      cartons_checked INTEGER NOT NULL,
      pairs_checked INTEGER NOT NULL,
      defective_pairs INTEGER NOT NULL DEFAULT 0,
      defect_notes TEXT,
      verdict TEXT NOT NULL CHECK(verdict IN ('APPROVED_FOR_DISPATCH', 'SENT_FOR_REPAIR')),
      inspected_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 11. Store Inward Receivings (Shipment / Contractor Receiving Record)
    CREATE TABLE IF NOT EXISTS store_receivings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rcv_number TEXT UNIQUE,
      rcv_date TEXT NOT NULL,
      maker_contractor TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      po_number TEXT NOT NULL,
      article_name TEXT NOT NULL,
      order_qty INTEGER NOT NULL CHECK(order_qty >= 0),
      rcvd_pairs INTEGER NOT NULL CHECK(rcvd_pairs >= 0),
      balance_qty INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK(status IN ('RECEIVED', 'PARTIAL', 'COMPLETE')),
      challan_no TEXT DEFAULT '',
      gate_pass_no TEXT DEFAULT '',
      vehicle_no TEXT DEFAULT '',
      overage_allowed_pct REAL DEFAULT 2.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 12. Receiving Size Breakdown Matrix
    CREATE TABLE IF NOT EXISTS receiving_size_breakdowns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rcv_number TEXT NOT NULL,
      size_code TEXT NOT NULL,
      order_pairs INTEGER NOT NULL DEFAULT 0,
      rcvd_pairs INTEGER NOT NULL DEFAULT 0,
      balance_pairs INTEGER NOT NULL DEFAULT 0
    );

    -- 13. Customer Packaging Bill of Materials (BOM) Master
    CREATE TABLE IF NOT EXISTS product_packaging_bom (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL REFERENCES products(id),
      material_code TEXT NOT NULL,
      material_name TEXT NOT NULL,
      qty_per_pair REAL NOT NULL DEFAULT 1.0,
      unit TEXT NOT NULL DEFAULT 'pcs',
      is_mandatory INTEGER NOT NULL DEFAULT 1
    );

    -- 14. Scrap & Condemned Defects Ledger
    CREATE TABLE IF NOT EXISTS scrap_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      req_number TEXT NOT NULL,
      article_name TEXT NOT NULL,
      scrapped_pairs INTEGER NOT NULL,
      fault_party TEXT NOT NULL,
      defect_reason TEXT NOT NULL,
      financial_deduction_amount REAL DEFAULT 0.0,
      condemned_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 15. Export Shipments & Master Shipping Register
    CREATE TABLE IF NOT EXISTS export_shipments (
      shipment_no TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      po_number TEXT NOT NULL,
      article_name TEXT NOT NULL,
      container_no TEXT DEFAULT '',
      seal_no TEXT DEFAULT '',
      destination_port TEXT DEFAULT '',
      total_cartons INTEGER NOT NULL DEFAULT 0,
      total_pairs INTEGER NOT NULL DEFAULT 0,
      total_gross_wt REAL NOT NULL DEFAULT 0.0,
      aql_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(aql_status IN ('PENDING', 'AQL_PASSED', 'QUARANTINED')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 16. Material Return Vouchers (MRV) - Excess/Damaged return from Floor to Store
    CREATE TABLE IF NOT EXISTS material_return_vouchers (
      mrv_number TEXT PRIMARY KEY,
      mat_req_number TEXT NOT NULL,
      material_code TEXT NOT NULL,
      returned_qty INTEGER NOT NULL,
      return_reason TEXT NOT NULL CHECK(return_reason IN ('EXCESS_UNUSED', 'DAMAGED_ON_FLOOR', 'LOT_SCRAP_REDUCTION')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 17. Super User Pending Orders Master (Buyer, Contractor, PO, Article, Colour & Size Breakdown)
    CREATE TABLE IF NOT EXISTS pending_orders (
      order_id TEXT PRIMARY KEY,
      buyer_name TEXT NOT NULL DEFAULT '',
      maker_contractor TEXT NOT NULL,
      po_number TEXT NOT NULL DEFAULT '',
      article_name TEXT NOT NULL,
      color_shade TEXT NOT NULL DEFAULT 'Standard',
      size_6 INTEGER NOT NULL DEFAULT 0,
      size_7 INTEGER NOT NULL DEFAULT 0,
      size_8 INTEGER NOT NULL DEFAULT 0,
      size_9 INTEGER NOT NULL DEFAULT 0,
      size_10 INTEGER NOT NULL DEFAULT 0,
      size_11 INTEGER NOT NULL DEFAULT 0,
      size_12 INTEGER NOT NULL DEFAULT 0,
      total_qty INTEGER NOT NULL DEFAULT 0,
      short_closed INTEGER NOT NULL DEFAULT 0,
      short_close_reason TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 18. GRN -> REQ Allocation Join Table (2.5 & 10.1: Many-to-Many with quantities & per-size JSON)
    CREATE TABLE IF NOT EXISTS grn_req_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      allocation_id TEXT UNIQUE NOT NULL,
      order_id TEXT NOT NULL,
      rcv_number TEXT NOT NULL,
      req_number TEXT NOT NULL,
      allocated_pairs INTEGER NOT NULL CHECK(allocated_pairs > 0),
      sizes_json TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 19. Immutable Append-Only Audit Trail Table (10.3: Protected by BEFORE UPDATE & BEFORE DELETE triggers)
    CREATE TABLE IF NOT EXISTS audit_trail (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      audit_id TEXT UNIQUE NOT NULL,
      actor TEXT NOT NULL,
      role TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      order_id TEXT DEFAULT '',
      before_summary TEXT NOT NULL,
      after_summary TEXT NOT NULL,
      reason TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TRIGGER IF NOT EXISTS trg_audit_trail_no_update
    BEFORE UPDATE ON audit_trail
    BEGIN
      SELECT RAISE(ABORT, 'Immutable Audit Trail: UPDATE is forbidden on audit_trail');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_audit_trail_no_delete
    BEFORE DELETE ON audit_trail
    BEGIN
      SELECT RAISE(ABORT, 'Immutable Audit Trail: DELETE is forbidden on audit_trail');
    END;

    -- DB Reliability Indexes (Query Acceleration & Foreign Key Optimizations)
    CREATE INDEX IF NOT EXISTS idx_store_receivings_po ON store_receivings(po_number);
    CREATE INDEX IF NOT EXISTS idx_store_receivings_cust ON store_receivings(customer_name);
    CREATE INDEX IF NOT EXISTS idx_store_receivings_date ON store_receivings(rcv_date);
    CREATE INDEX IF NOT EXISTS idx_size_breakdowns_rcv ON receiving_size_breakdowns(rcv_number);
    CREATE INDEX IF NOT EXISTS idx_packaging_bom_prod ON product_packaging_bom(product_id);
    CREATE INDEX IF NOT EXISTS idx_glove_req_status ON glove_requisitions(status);
    CREATE INDEX IF NOT EXISTS idx_glove_req_cust ON glove_requisitions(customer_id);
    CREATE INDEX IF NOT EXISTS idx_alterations_req ON alterations(req_number, status);
    CREATE INDEX IF NOT EXISTS idx_cartons_req ON cartons(req_number);
    CREATE INDEX IF NOT EXISTS idx_mrv_req ON material_return_vouchers(mat_req_number);
    CREATE INDEX IF NOT EXISTS idx_scrap_req ON scrap_ledger(req_number);
    CREATE INDEX IF NOT EXISTS idx_pending_orders_po ON pending_orders(po_number);
    CREATE INDEX IF NOT EXISTS idx_grn_req_alloc_order ON grn_req_allocations(order_id, rcv_number, req_number);
    CREATE INDEX IF NOT EXISTS idx_audit_trail_entity ON audit_trail(entity_id, action);
  `);

  migrateDatabase();
  seedInitialData();
  // Clean inspection mode: demo receiving sheet disabled (no dummy transactions)
  // seedDemoSheet();
  seedPackagingBOM();
  seedSizeBreakdowns();
}

function migrateDatabase() {
  const getCols = (tbl) => {
    try {
      return db.prepare(`PRAGMA table_info(${tbl})`).all().map(c => c.name);
    } catch {
      return [];
    }
  };

  // store_receivings
  const rcvCols = getCols('store_receivings');
  if (rcvCols.length > 0) {
    if (!rcvCols.includes('challan_no')) {
      db.exec(`ALTER TABLE store_receivings ADD COLUMN challan_no TEXT DEFAULT ''`);
    }
    if (!rcvCols.includes('gate_pass_no')) {
      db.exec(`ALTER TABLE store_receivings ADD COLUMN gate_pass_no TEXT DEFAULT ''`);
    }
    if (!rcvCols.includes('vehicle_no')) {
      db.exec(`ALTER TABLE store_receivings ADD COLUMN vehicle_no TEXT DEFAULT ''`);
    }
    if (!rcvCols.includes('overage_allowed_pct')) {
      db.exec(`ALTER TABLE store_receivings ADD COLUMN overage_allowed_pct REAL DEFAULT 2.0`);
    }
    if (!rcvCols.includes('order_id')) {
      db.exec(`ALTER TABLE store_receivings ADD COLUMN order_id TEXT DEFAULT ''`);
    }
    if (!rcvCols.includes('allocated_pairs')) {
      db.exec(`ALTER TABLE store_receivings ADD COLUMN allocated_pairs INTEGER DEFAULT 0`);
    }
    if (!rcvCols.includes('unallocated_pairs')) {
      db.exec(`ALTER TABLE store_receivings ADD COLUMN unallocated_pairs INTEGER DEFAULT 0`);
    }
    if (!rcvCols.includes('allocation_status')) {
      db.exec(`ALTER TABLE store_receivings ADD COLUMN allocation_status TEXT DEFAULT 'UNALLOCATED'`);
    }
    if (!rcvCols.includes('is_voided')) {
      db.exec(`ALTER TABLE store_receivings ADD COLUMN is_voided INTEGER DEFAULT 0`);
    }
    if (!rcvCols.includes('void_reason')) {
      db.exec(`ALTER TABLE store_receivings ADD COLUMN void_reason TEXT DEFAULT ''`);
    }
  }

  // glove_requisitions
  const reqCols = getCols('glove_requisitions');
  if (reqCols.length > 0) {
    if (!reqCols.includes('order_id')) {
      db.exec(`ALTER TABLE glove_requisitions ADD COLUMN order_id TEXT DEFAULT ''`);
    }
    if (!reqCols.includes('is_voided')) {
      db.exec(`ALTER TABLE glove_requisitions ADD COLUMN is_voided INTEGER DEFAULT 0`);
    }
    if (!reqCols.includes('void_reason')) {
      db.exec(`ALTER TABLE glove_requisitions ADD COLUMN void_reason TEXT DEFAULT ''`);
    }
  }

  // pending_orders
  const ordCols = getCols('pending_orders');
  if (ordCols.length > 0) {
    if (!ordCols.includes('size_6')) {
      db.exec(`ALTER TABLE pending_orders ADD COLUMN size_6 INTEGER DEFAULT 0`);
    }
    if (!ordCols.includes('size_12')) {
      db.exec(`ALTER TABLE pending_orders ADD COLUMN size_12 INTEGER DEFAULT 0`);
    }
    if (!ordCols.includes('short_closed')) {
      db.exec(`ALTER TABLE pending_orders ADD COLUMN short_closed INTEGER DEFAULT 0`);
    }
    if (!ordCols.includes('short_close_reason')) {
      db.exec(`ALTER TABLE pending_orders ADD COLUMN short_close_reason TEXT DEFAULT ''`);
    }
  }

  // alterations
  const altCols = getCols('alterations');
  if (altCols.length > 0) {
    if (!altCols.includes('fault_party')) {
      db.exec(`ALTER TABLE alterations ADD COLUMN fault_party TEXT DEFAULT 'CONTRACTOR'`);
    }
    if (!altCols.includes('tailor_name')) {
      db.exec(`ALTER TABLE alterations ADD COLUMN tailor_name TEXT DEFAULT 'Supervisor A'`);
    }
    if (!altCols.includes('rework_count')) {
      db.exec(`ALTER TABLE alterations ADD COLUMN rework_count INTEGER DEFAULT 1`);
    }
    if (!altCols.includes('is_scrapped')) {
      db.exec(`ALTER TABLE alterations ADD COLUMN is_scrapped INTEGER DEFAULT 0`);
    }
  }

  // cartons
  const ctnCols = getCols('cartons');
  if (ctnCols.length > 0) {
    if (!ctnCols.includes('packing_type')) {
      db.exec(`ALTER TABLE cartons ADD COLUMN packing_type TEXT DEFAULT 'SOLID'`);
    }
    if (!ctnCols.includes('gross_weight_kg')) {
      db.exec(`ALTER TABLE cartons ADD COLUMN gross_weight_kg REAL DEFAULT 4.8`);
    }
    if (!ctnCols.includes('net_weight_kg')) {
      db.exec(`ALTER TABLE cartons ADD COLUMN net_weight_kg REAL DEFAULT 4.2`);
    }
    if (!ctnCols.includes('dimensions_cm')) {
      db.exec(`ALTER TABLE cartons ADD COLUMN dimensions_cm TEXT DEFAULT '60x40x35'`);
    }
    if (!ctnCols.includes('qc_seal_no')) {
      db.exec(`ALTER TABLE cartons ADD COLUMN qc_seal_no TEXT DEFAULT ''`);
    }
    if (!ctnCols.includes('aql_status')) {
      db.exec(`ALTER TABLE cartons ADD COLUMN aql_status TEXT DEFAULT 'PENDING'`);
    }
  }
}

function seedInitialData() {
  const custCount = db.prepare('SELECT COUNT(*) as count FROM customers').get().count;
  if (custCount > 0) return;

  // Insert Customers (with inspection preference)
  const insertCustomer = db.prepare(`
    INSERT INTO customers (id, name, country, inspection_preference)
    VALUES (?, ?, ?, ?)
  `);
  insertCustomer.run('CUST-001', 'Northwind Safety Ltd', 'United Kingdom', 'RANDOM');
  insertCustomer.run('CUST-002', 'Globex Supply Co.', 'Japan', 'RANDOM');
  insertCustomer.run('CUST-003', 'Initech Safety Ltd', 'France', 'THOROUGH');
  insertCustomer.run('CUST-004', 'Umbrella Workwear GmbH', 'Germany', 'THOROUGH');
  insertCustomer.run('CUST-005', 'Stark Protective Ltd', 'Norway', 'THOROUGH');

  // Insert Glove Products
  const insertProduct = db.prepare(`
    INSERT INTO products (id, name, customer_id, polybag_per_pair, silica_gel_per_pair, stickers_per_pair, pairs_per_carton)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertProduct.run('GLV-A1', 'Model A1', 'CUST-002', 1, 1, 2, 50);
  insertProduct.run('GLV-A2', 'Model A2', 'CUST-002', 1, 1, 2, 50);
  insertProduct.run('GLV-A3', 'Model A3', 'CUST-001', 1, 1, 2, 50);
  insertProduct.run('GLV-A4', 'Model A4', 'CUST-002', 1, 1, 2, 50);
  insertProduct.run('GLV-A5', 'Model A5', 'CUST-002', 1, 1, 2, 50);
  insertProduct.run('GLV-A6', 'Model A6', 'CUST-002', 1, 1, 2, 50);
  insertProduct.run('GLV-A7', 'Model A7', 'CUST-001', 1, 1, 2, 50);
  insertProduct.run('GLV-A8', 'Model A8', 'CUST-001', 1, 1, 2, 50);
  insertProduct.run('GLV-A9', 'Model A9', 'CUST-001', 1, 1, 2, 50);
  insertProduct.run('GLV-A10', 'Sierra', 'CUST-003', 1, 1, 2, 50);
  insertProduct.run('GLV-A11', 'Model A11', 'CUST-001', 1, 1, 2, 50);
  insertProduct.run('GLV-A12', 'Model A12', 'CUST-001', 1, 1, 2, 50);
  insertProduct.run('GLV-A13', 'Model A13', 'CUST-001', 1, 1, 2, 50);
  insertProduct.run('GLV-A14', 'Model A14', 'CUST-001', 1, 1, 2, 50);
  insertProduct.run('GLV-A15', 'Model A15', 'CUST-002', 1, 1, 2, 50);
  insertProduct.run('GLV-A16', 'Pro Cut-5 Heavy Duty', 'CUST-001', 1, 1, 2, 50);

  // Seed Glove Store Inventory
  const insertGloveStock = db.prepare(`
    INSERT INTO store_gloves_inventory (id, product_id, customer_id, available_pairs)
    VALUES (?, ?, ?, ?)
  `);
  insertGloveStock.run('STK-GLV-001', 'GLV-A1', 'CUST-002', 4284);
  insertGloveStock.run('STK-GLV-002', 'GLV-A2', 'CUST-002', 1198);
  insertGloveStock.run('STK-GLV-003', 'GLV-A3', 'CUST-001', 157);
  insertGloveStock.run('STK-GLV-004', 'GLV-A9', 'CUST-001', 3134);
  insertGloveStock.run('STK-GLV-005', 'GLV-A10', 'CUST-003', 736);
  insertGloveStock.run('STK-GLV-006', 'GLV-A16', 'CUST-001', 3500);

  // Seed Packaging Materials Store Inventory
  const insertMatStock = db.prepare(`
    INSERT INTO store_materials_inventory (material_code, material_name, available_qty, unit)
    VALUES (?, ?, ?, ?)
  `);
  insertMatStock.run('POLYBAG', 'Individual Protective Polybags', 25000, 'pcs');
  insertMatStock.run('SILICA_GEL', 'Moisture Absorbing Silica Gel Packets', 30000, 'pouches');
  insertMatStock.run('STICKER_BARCODE', 'Cardboard Barcode Labels & Hangtags', 50000, 'stickers');
  insertMatStock.run('INNER_POLY', 'Inner Bundle Separation Sheeting', 15000, 'sheets');
}

export function seedDemoSheet() {
  const insertRcv = db.prepare(`
    INSERT OR REPLACE INTO store_receivings 
    (rcv_number, rcv_date, maker_contractor, customer_name, po_number, article_name, order_qty, rcvd_pairs, balance_qty, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const rows = [
    ['RCV-2026-0001', '31-10-2026', 'Hall A', 'Globex', '3326', 'Model A1', 4285, 4284, 1],
    ['RCV-2026-0002', '31-10-2026', 'Hall A', 'Globex', '3326', 'Model A2', 1630, 1198, 432],
    ['RCV-2026-0003', '31-10-2026', 'Hall A', 'Northwind', '27344', 'Model A3', 160, 157, 3],
    ['RCV-2026-0004', '31-10-2026', 'Hall B', 'Globex', '2726', 'Model A4', 520, 513, 7],
    ['RCV-2026-0005', '31-10-2026', 'Hall B', 'Globex', '2726', 'Model A5', 450, 445, 5],
    ['RCV-2026-0006', '31-10-2026', 'Hall B', 'Globex 1', '2726', 'Model A6', 470, 375, 95],
    ['RCV-2026-0007', '31-10-2026', 'Hall B', 'Northwind', '27346', 'Model A7', 300, 297, 3],
    ['RCV-2026-0008', '31-10-2026', 'Hall B', 'Northwind', '27344', 'Model A8', 1200, 1110, 90],
    ['RCV-2026-0009', '31-10-2026', 'Hall B', 'Northwind', '27347', 'Model A9', 3090, 942, 2148],
    ['RCV-2026-0010', '31-10-2026', 'Hall B', 'Northwind', '27346', 'Model A9', 820, 730, 90],
    ['RCV-2026-0011', '31-10-2026', 'Hall B', 'Northwind', '27345', 'Model A9', 320, 319, 1],
    ['RCV-2026-0012', '31-10-2026', 'Hall B', 'Northwind', '27344', 'Model A9', 1220, 1143, 77],
    ['RCV-2026-0013', '31-10-2026', 'Hall B', 'Sierra', '1292', 'Sierra', 3095, 736, 2359],
    ['RCV-2026-0014', '31-10-2026', 'Hall B', 'Northwind', '27344', 'Model A11', 150, 88, 62],
    ['RCV-2026-0015', '31-10-2026', 'Maker A', 'Northwind', '27345', 'Model A12', 271, 248, 23],
    ['RCV-2026-0016', '31-10-2026', 'Maker B', 'Northwind', '27344', 'Model A13', 960, 681, 279],
    ['RCV-2026-0017', '31-10-2026', 'Maker C', 'Northwind', '27345', 'Model A14', 962, 461, 501],
    ['RCV-2026-0018', '31-10-2026', 'Maker D', 'Globex', '2326', 'Model A15', 1082, 121, 960]
  ];

  for (const r of rows) {
    const status = r[8] === 0 ? 'COMPLETE' : 'PARTIAL';
    insertRcv.run(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], status);
  }
}

function seedPackagingBOM() {
  const bomCount = db.prepare('SELECT COUNT(*) as count FROM product_packaging_bom').get().count;
  if (bomCount > 0) return;

  const insertBOM = db.prepare(`
    INSERT INTO product_packaging_bom (product_id, material_code, material_name, qty_per_pair, unit, is_mandatory)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const prods = db.prepare('SELECT id, customer_id FROM products').all();
  for (const prod of prods) {
    if (prod.customer_id === 'CUST-001') {
      insertBOM.run(prod.id, 'ACC-POLY-STD', 'Northwind Heavy Protective Polybag', 1.0, 'pcs', 1);
      insertBOM.run(prod.id, 'ACC-TAG-STD', 'Northwind Genuine Hangtag / Rider Card', 1.0, 'pcs', 1);
      insertBOM.run(prod.id, 'ACC-SILICA-2G', 'Silica Gel Moisture Sachet 2g', 1.0, 'pouches', 1);
      insertBOM.run(prod.id, 'STICKER_BARCODE', 'EAN-13 Scannable Barcode Sticker', 2.0, 'stickers', 1);
      insertBOM.run(prod.id, 'CTN-5PLY-6040', '5-Ply Master Carton (30 pairs/ctn)', 0.0333, 'cartons', 1);
    } else {
      insertBOM.run(prod.id, 'POLYBAG', 'Protective Crystal Polybag', 1.0, 'pcs', 1);
      insertBOM.run(prod.id, 'ACC-SILICA-2G', 'Silica Gel Moisture Sachet 2g', 1.0, 'pouches', 1);
      insertBOM.run(prod.id, 'STICKER_BARCODE', 'Scannable Barcode Label', 1.0, 'stickers', 1);
      insertBOM.run(prod.id, 'INNER_POLY', 'Inner Separation Sheeting', 0.1, 'sheets', 0);
    }
  }
}

function seedSizeBreakdowns() {
  const sizeCount = db.prepare('SELECT COUNT(*) as count FROM receiving_size_breakdowns').get().count;
  if (sizeCount > 0) return;

  const insertSize = db.prepare(`
    INSERT INTO receiving_size_breakdowns (rcv_number, size_code, order_pairs, rcvd_pairs, balance_pairs)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Seed size matrix for RCV-2026-0009 (Hall B / Northwind / PO 27347 / Model A9: Order 3090, Rcvd 942, Balance 2148)
  insertSize.run('RCV-2026-0009', '7/S', 300, 90, 210);
  insertSize.run('RCV-2026-0009', '8/M', 900, 280, 620);
  insertSize.run('RCV-2026-0009', '9/L', 1200, 372, 828);
  insertSize.run('RCV-2026-0009', '10/XL', 690, 200, 490);

  // Seed size matrix for RCV-2026-0001 (Hall A / Globex / PO 3326 / Model A1: Order 4285, Rcvd 4284, Balance 1)
  insertSize.run('RCV-2026-0001', '7/S', 500, 500, 0);
  insertSize.run('RCV-2026-0001', '8/M', 1500, 1500, 0);
  insertSize.run('RCV-2026-0001', '9/L', 1500, 1500, 0);
  insertSize.run('RCV-2026-0001', '10/XL', 785, 784, 1);
}

export function backupDatabase(targetPath) {
  const dest = targetPath || path.join(dataDir, `backup_gloves_packing_${Date.now()}.sqlite`);
  const sql = `VACUUM INTO '${dest.replace(/\\/g, '/')}'`;
  db.exec(sql);
  return dest;
}
