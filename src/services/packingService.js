import { db, backupDatabase, initDatabase } from '../db.js';
import { AQLService } from './aqlService.js';

export class PackingService {
  // --- INVENTORY LOOKUPS ---
  static getGloveInventory() {
    return db.prepare(`
      SELECT g.id, g.product_id, p.name AS product_name, 
             g.customer_id, c.name AS customer_name, c.country, c.inspection_preference,
             g.available_pairs, g.last_updated
      FROM store_gloves_inventory g
      JOIN products p ON g.product_id = p.id
      JOIN customers c ON g.customer_id = c.id
      ORDER BY c.name, p.name
    `).all();
  }

  static getMaterialInventory() {
    return db.prepare(`
      SELECT material_code, material_name, available_qty, unit, last_updated
      FROM store_materials_inventory
      ORDER BY material_code
    `).all();
  }

  static getCustomers() {
    return db.prepare(`SELECT * FROM customers ORDER BY name`).all();
  }

  static getProducts(customerId = null) {
    if (customerId) {
      return db.prepare(`SELECT * FROM products WHERE customer_id = ? ORDER BY name`).all(customerId);
    }
    return db.prepare(`
      SELECT p.*, c.name as customer_name, c.inspection_preference 
      FROM products p 
      JOIN customers c ON p.customer_id = c.id 
      ORDER BY p.name
    `).all();
  }

  // --- GLOVE REQUISITION (Packing Hall -> Glove Store) ---
  static createGloveRequisition(customerId, productId, requestedPairs, notes = '') {
    const year = new Date().getFullYear();
    const countRow = db.prepare(`
      SELECT COUNT(*) as cnt FROM glove_requisitions WHERE req_number LIKE ?
    `).get(`REQ-${year}-%`);
    
    const seq = String(Number(countRow.cnt) + 1).padStart(4, '0');
    const reqNumber = `REQ-${year}-${seq}`;

    db.prepare(`
      INSERT INTO glove_requisitions (req_number, customer_id, product_id, requested_pairs, status, notes)
      VALUES (?, ?, ?, ?, 'PENDING', ?)
    `).run(reqNumber, customerId, productId, requestedPairs, notes);

    return this.getRequisition(reqNumber);
  }

  static getRequisitions() {
    return db.prepare(`
      SELECT r.*, c.name AS customer_name, c.inspection_preference, p.name AS product_name
      FROM glove_requisitions r
      JOIN customers c ON r.customer_id = c.id
      JOIN products p ON r.product_id = p.id
      ORDER BY r.created_at DESC
    `).all();
  }

  static getRequisition(reqNumber) {
    const req = db.prepare(`
      SELECT r.*, c.name AS customer_name, c.inspection_preference, p.name AS product_name,
             p.polybag_per_pair, p.silica_gel_per_pair, p.stickers_per_pair, p.pairs_per_carton
      FROM glove_requisitions r
      JOIN customers c ON r.customer_id = c.id
      JOIN products p ON r.product_id = p.id
      WHERE r.req_number = ?
    `).get(reqNumber);

    if (!req) return null;

    const wip = db.prepare(`SELECT * FROM packing_wip WHERE req_number = ?`).get(reqNumber);
    const materialReq = db.prepare(`SELECT * FROM material_requisitions WHERE req_number = ?`).get(reqNumber);
    const alterations = db.prepare(`SELECT * FROM alterations WHERE req_number = ? ORDER BY id DESC`).all(reqNumber);
    const cartons = db.prepare(`SELECT * FROM cartons WHERE req_number = ? ORDER BY carton_number`).all(reqNumber);
    const inspections = db.prepare(`SELECT * FROM final_inspections WHERE req_number = ? ORDER BY id DESC`).all(reqNumber);

    return {
      ...req,
      wip: wip || null,
      materialReq: materialReq || null,
      alterations,
      cartons,
      inspections
    };
  }

  // --- STORE KEEPER ISSUES RAW GLOVES (10.1: Wrapped in BEGIN IMMEDIATE SQLite Transaction) ---
  static issueGloveRequisition(reqNumber) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const req = db.prepare(`SELECT * FROM glove_requisitions WHERE req_number = ?`).get(reqNumber);
      if (!req) throw new Error(`Requisition ${reqNumber} not found`);
      if (req.status !== 'PENDING') throw new Error(`Requisition ${reqNumber} is already ${req.status}`);

      const stock = db.prepare(`
        SELECT * FROM store_gloves_inventory 
        WHERE product_id = ? AND customer_id = ?
      `).get(req.product_id, req.customer_id);

      if (!stock || stock.available_pairs < req.requested_pairs) {
        const avail = stock ? stock.available_pairs : 0;
        throw new Error(`Insufficient inventory in Glove Store. Available: ${avail} pairs, Requested: ${req.requested_pairs} pairs`);
      }

      // Deduct stock
      db.prepare(`
        UPDATE store_gloves_inventory 
        SET available_pairs = available_pairs - ?, last_updated = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(req.requested_pairs, stock.id);

      // Update requisition
      db.prepare(`
        UPDATE glove_requisitions 
        SET status = 'ISSUED', issued_pairs = requested_pairs, issued_at = CURRENT_TIMESTAMP
        WHERE req_number = ?
      `).run(reqNumber);

      // Create / Initialize Packing WIP batch (pairs arrive at Step 1: Checking)
      db.prepare(`
        INSERT INTO packing_wip (req_number, current_step, step1_checking_in)
        VALUES (?, 'STEP_1', ?)
        ON CONFLICT(req_number) DO UPDATE SET
          step1_checking_in = step1_checking_in + excluded.step1_checking_in,
          updated_at = CURRENT_TIMESTAMP
      `).run(reqNumber, req.requested_pairs);

      db.exec('COMMIT');
      return this.getRequisition(reqNumber);
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // Ignore rollback error if already rolled back
      }
      throw err;
    }
  }

  // --- STEP 1: CHECKING / INSPECTION ---
  static executeStep1Checking(reqNumber, goodPairs, defectPairs = 0, defectReason = '') {
    const wip = db.prepare(`SELECT * FROM packing_wip WHERE req_number = ?`).get(reqNumber);
    if (!wip) throw new Error(`WIP record for ${reqNumber} not found`);

    const availableToCheck = wip.step1_checking_in - wip.step1_checking_good - wip.step1_checking_defects;
    const totalProcessed = goodPairs + defectPairs;

    if (totalProcessed > availableToCheck) {
      throw new Error(`Cannot process ${totalProcessed} pairs. Only ${availableToCheck} pairs pending check at Step 1.`);
    }

    db.prepare(`
      UPDATE packing_wip
      SET step1_checking_good = step1_checking_good + ?,
          step1_checking_defects = step1_checking_defects + ?,
          step2_ironing_in = step2_ironing_in + ?,
          current_step = CASE WHEN (step1_checking_in - (step1_checking_good + ?) - (step1_checking_defects + ?)) = 0 THEN 'STEP_2' ELSE current_step END,
          updated_at = CURRENT_TIMESTAMP
      WHERE req_number = ?
    `).run(goodPairs, defectPairs, goodPairs, goodPairs, defectPairs, reqNumber);

    // If defects found, log to Alteration
    if (defectPairs > 0) {
      db.prepare(`
        INSERT INTO alterations (req_number, source_stage, pairs_count, defect_reason, status)
        VALUES (?, 'STEP_1_CHECKING', ?, ?, 'SENT_FOR_ALTERATION')
      `).run(reqNumber, defectPairs, defectReason || 'Failed Checking Inspection');
    }

    return this.getRequisition(reqNumber);
  }

  // --- STEP 2: IRONING & BRUSHING ---
  static executeStep2Ironing(reqNumber, goodPairs, defectPairs = 0, defectReason = '') {
    const wip = db.prepare(`SELECT * FROM packing_wip WHERE req_number = ?`).get(reqNumber);
    if (!wip) throw new Error(`WIP record for ${reqNumber} not found`);

    const availableToIron = wip.step2_ironing_in - wip.step2_ironing_good - wip.step2_ironing_defects;
    const totalProcessed = goodPairs + defectPairs;

    if (totalProcessed > availableToIron) {
      throw new Error(`Cannot process ${totalProcessed} pairs. Only ${availableToIron} pairs pending at Step 2.`);
    }

    db.prepare(`
      UPDATE packing_wip
      SET step2_ironing_good = step2_ironing_good + ?,
          step2_ironing_defects = step2_ironing_defects + ?,
          step3_matching_in = step3_matching_in + ?,
          current_step = CASE WHEN (step2_ironing_in - (step2_ironing_good + ?) - (step2_ironing_defects + ?)) = 0 THEN 'STEP_3' ELSE current_step END,
          updated_at = CURRENT_TIMESTAMP
      WHERE req_number = ?
    `).run(goodPairs, defectPairs, goodPairs, goodPairs, defectPairs, reqNumber);

    // If defects found, log to Alteration (loops back to Step 1 upon return)
    if (defectPairs > 0) {
      db.prepare(`
        INSERT INTO alterations (req_number, source_stage, pairs_count, defect_reason, status)
        VALUES (?, 'STEP_2_IRONING', ?, ?, 'SENT_FOR_ALTERATION')
      `).run(reqNumber, defectPairs, defectReason || 'Ironing/Brushing Workmanship Defect');
    }

    return this.getRequisition(reqNumber);
  }

  // --- STEP 3: PAIR MATCHING ---
  static executeStep3Matching(reqNumber, goodPairs, defectPairs = 0, defectReason = '') {
    const wip = db.prepare(`SELECT * FROM packing_wip WHERE req_number = ?`).get(reqNumber);
    if (!wip) throw new Error(`WIP record for ${reqNumber} not found`);

    const availableToMatch = wip.step3_matching_in - wip.step3_matching_good - wip.step3_matching_defects;
    const totalProcessed = goodPairs + defectPairs;

    if (totalProcessed > availableToMatch) {
      throw new Error(`Cannot process ${totalProcessed} pairs. Only ${availableToMatch} pairs pending at Step 3.`);
    }

    db.prepare(`
      UPDATE packing_wip
      SET step3_matching_good = step3_matching_good + ?,
          step3_matching_defects = step3_matching_defects + ?,
          current_step = CASE WHEN (step3_matching_in - (step3_matching_good + ?) - (step3_matching_defects + ?)) = 0 THEN 'WAITING_MATERIALS' ELSE current_step END,
          updated_at = CURRENT_TIMESTAMP
      WHERE req_number = ?
    `).run(goodPairs, defectPairs, goodPairs, defectPairs, reqNumber);

    // If defects found, log to Alteration (loops back to Step 1 upon return)
    if (defectPairs > 0) {
      db.prepare(`
        INSERT INTO alterations (req_number, source_stage, pairs_count, defect_reason, status)
        VALUES (?, 'STEP_3_MATCHING', ?, ?, 'SENT_FOR_ALTERATION')
      `).run(reqNumber, defectPairs, defectReason || 'Mismatch in pair sizing or shade difference');
    }

    return this.getRequisition(reqNumber);
  }

  // --- CREATE MATERIAL REQUISITION FOR 1ST PACKING ACCESSORIES ---
  static createMaterialRequisition(reqNumber) {
    const req = this.getRequisition(reqNumber);
    if (!req) throw new Error(`Requisition ${reqNumber} not found`);
    if (!req.wip || req.wip.step3_matching_good <= 0) {
      throw new Error(`Step 3 Matching has no completed good pairs yet.`);
    }

    const existingMatReq = db.prepare(`SELECT * FROM material_requisitions WHERE req_number = ?`).get(reqNumber);
    if (existingMatReq) {
      return existingMatReq;
    }

    const goodPairs = req.wip.step3_matching_good;
    const polybags = goodPairs * req.polybag_per_pair;
    const silicaGel = goodPairs * req.silica_gel_per_pair;
    const stickers = goodPairs * req.stickers_per_pair;

    const year = new Date().getFullYear();
    const countRow = db.prepare(`
      SELECT COUNT(*) as cnt FROM material_requisitions WHERE mat_req_number LIKE ?
    `).get(`MREQ-${year}-%`);
    const seq = String(Number(countRow.cnt) + 1).padStart(4, '0');
    const matReqNumber = `MREQ-${year}-${seq}`;

    db.prepare(`
      INSERT INTO material_requisitions (
        mat_req_number, req_number, pairs_count, 
        polybags_requested, silica_gel_requested, stickers_requested, status
      )
      VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
    `).run(matReqNumber, reqNumber, goodPairs, polybags, silicaGel, stickers);

    return db.prepare(`SELECT * FROM material_requisitions WHERE mat_req_number = ?`).get(matReqNumber);
  }

  static getMaterialRequisitions() {
    return db.prepare(`
      SELECT m.*, r.customer_id, c.name AS customer_name, p.name AS product_name
      FROM material_requisitions m
      JOIN glove_requisitions r ON m.req_number = r.req_number
      JOIN customers c ON r.customer_id = c.id
      JOIN products p ON r.product_id = p.id
      ORDER BY m.created_at DESC
    `).all();
  }

  // --- PACKING MATERIALS STORE ISSUES ACCESSORIES ---
  static issueMaterialRequisition(matReqNumber) {
    const matReq = db.prepare(`SELECT * FROM material_requisitions WHERE mat_req_number = ?`).get(matReqNumber);
    if (!matReq) throw new Error(`Material Requisition ${matReqNumber} not found`);
    if (matReq.status !== 'PENDING') throw new Error(`Material Requisition is already ${matReq.status}`);

    // Verify stock
    const polyStock = db.prepare(`SELECT available_qty FROM store_materials_inventory WHERE material_code = 'POLYBAG'`).get();
    const silicaStock = db.prepare(`SELECT available_qty FROM store_materials_inventory WHERE material_code = 'SILICA_GEL'`).get();
    const stickerStock = db.prepare(`SELECT available_qty FROM store_materials_inventory WHERE material_code = 'STICKER_BARCODE'`).get();

    if (polyStock.available_qty < matReq.polybags_requested) {
      throw new Error(`Insufficient Polybags in Materials Store. Available: ${polyStock.available_qty}, Requested: ${matReq.polybags_requested}`);
    }
    if (silicaStock.available_qty < matReq.silica_gel_requested) {
      throw new Error(`Insufficient Silica Gel in Materials Store. Available: ${silicaStock.available_qty}, Requested: ${matReq.silica_gel_requested}`);
    }
    if (stickerStock.available_qty < matReq.stickers_requested) {
      throw new Error(`Insufficient Stickers in Materials Store. Available: ${stickerStock.available_qty}, Requested: ${matReq.stickers_requested}`);
    }

    // Deduct stock
    db.prepare(`UPDATE store_materials_inventory SET available_qty = available_qty - ? WHERE material_code = 'POLYBAG'`).run(matReq.polybags_requested);
    db.prepare(`UPDATE store_materials_inventory SET available_qty = available_qty - ? WHERE material_code = 'SILICA_GEL'`).run(matReq.silica_gel_requested);
    db.prepare(`UPDATE store_materials_inventory SET available_qty = available_qty - ? WHERE material_code = 'STICKER_BARCODE'`).run(matReq.stickers_requested);

    // Update status
    db.prepare(`
      UPDATE material_requisitions 
      SET status = 'ISSUED', issued_at = CURRENT_TIMESTAMP 
      WHERE mat_req_number = ?
    `).run(matReqNumber);

    // Release WIP for Step 4
    db.prepare(`
      UPDATE packing_wip 
      SET step4_materials_issued = 1, current_step = 'STEP_4', updated_at = CURRENT_TIMESTAMP
      WHERE req_number = ?
    `).run(matReq.req_number);

    return db.prepare(`SELECT * FROM material_requisitions WHERE mat_req_number = ?`).get(matReqNumber);
  }

  // --- STEP 4: 1ST PACKING (INDIVIDUAL PAIR PACKING) ---
  static executeStep4FirstPacking(reqNumber, packedPairs) {
    const wip = db.prepare(`SELECT * FROM packing_wip WHERE req_number = ?`).get(reqNumber);
    if (!wip) throw new Error(`WIP for ${reqNumber} not found`);
    if (!wip.step4_materials_issued) throw new Error(`Materials have not been issued by the Packing Materials Store yet.`);

    const maxCanPack = wip.step3_matching_good - wip.step4_packing_good;
    if (packedPairs > maxCanPack) {
      throw new Error(`Cannot pack ${packedPairs} pairs. Only ${maxCanPack} good pairs pending at Step 4.`);
    }

    db.prepare(`
      UPDATE packing_wip
      SET step4_packing_good = step4_packing_good + ?,
          current_step = CASE WHEN (step3_matching_good - (step4_packing_good + ?)) = 0 THEN 'STEP_5' ELSE current_step END,
          updated_at = CURRENT_TIMESTAMP
      WHERE req_number = ?
    `).run(packedPairs, packedPairs, reqNumber);

    return this.getRequisition(reqNumber);
  }

  // --- STEP 5: 2ND PACKING (PAIRS INTO CARTONS) ---
  static executeStep5SecondPacking(reqNumber, pairsPerCartonOverride = null, options = {}) {
    const req = this.getRequisition(reqNumber);
    if (!req || !req.wip) throw new Error(`Requisition ${reqNumber} not found`);

    const pairsReady = req.wip.step4_packing_good;
    if (pairsReady <= 0) throw new Error(`No packed pairs available for carton boxing.`);

    if (options && options.enforcePreStage5AqlGate) {
      const qcApproved =
        req.wip.final_qc_status === 'APPROVED_DISPATCH' ||
        req.wip.current_step === 'DISPATCH_APPROVED';
      if (!qcApproved) {
        throw new Error(
          `LOCKED: Stage 5 Master Carton Packing for ${reqNumber} requires Final QC (AQL 1.5) approval at the end of Stage 4.`
        );
      }
    }

    const pairsPerCarton = pairsPerCartonOverride || req.pairs_per_carton || 50;
    const totalCartons = Math.ceil(pairsReady / pairsPerCarton);

    // Delete existing cartons if re-packing
    db.prepare(`DELETE FROM cartons WHERE req_number = ?`).run(reqNumber);

    let remaining = pairsReady;
    for (let i = 1; i <= totalCartons; i++) {
      const thisCartonPairs = Math.min(remaining, pairsPerCarton);
      const cartonBarcode = `CTN-${reqNumber}-${String(i).padStart(3, '0')}`;
      db.prepare(`
        INSERT INTO cartons (carton_barcode, req_number, carton_number, total_cartons, pairs_count, status)
        VALUES (?, ?, ?, ?, ?, 'PACKED')
      `).run(cartonBarcode, reqNumber, i, totalCartons, thisCartonPairs);
      remaining -= thisCartonPairs;
    }

    db.prepare(`
      UPDATE packing_wip
      SET step5_cartons_packed = ?,
          step5_pairs_packed = ?,
          current_step = CASE WHEN final_qc_status = 'APPROVED_DISPATCH' THEN 'DISPATCH_APPROVED' ELSE 'FINAL_QC' END,
          final_qc_status = CASE WHEN final_qc_status = 'APPROVED_DISPATCH' THEN 'APPROVED_DISPATCH' ELSE 'PENDING' END,
          updated_at = CURRENT_TIMESTAMP
      WHERE req_number = ?
    `).run(totalCartons, pairsReady, reqNumber);

    return this.getRequisition(reqNumber);
  }

  // --- FINAL INSPECTION (Random Sampling vs Thorough 100%) ---
  static executeFinalInspection(reqNumber, cartonsChecked, defectivePairs = 0, defectNotes = '') {
    const req = this.getRequisition(reqNumber);
    if (!req || !req.wip) throw new Error(`Requisition ${reqNumber} not found`);
    if (req.wip.step5_cartons_packed <= 0) throw new Error(`No cartons packed for ${reqNumber}.`);

    const preference = req.inspection_preference; // 'RANDOM' or 'THOROUGH'
    const totalCartons = req.wip.step5_cartons_packed;

    // Validate inspection scope
    if (preference === 'THOROUGH' && cartonsChecked < totalCartons) {
      throw new Error(`Customer requires 100% Thorough Inspection. All ${totalCartons} cartons must be inspected (currently checked: ${cartonsChecked}).`);
    }

    const inspectionType = preference === 'THOROUGH' ? 'THOROUGH_100_PCT' : 'RANDOM_SAMPLING';
    const isPassed = defectivePairs === 0;
    const verdict = isPassed ? 'APPROVED_FOR_DISPATCH' : 'SENT_FOR_REPAIR';

    // Record inspection
    db.prepare(`
      INSERT INTO final_inspections (
        req_number, customer_id, inspection_type, total_cartons, 
        cartons_checked, pairs_checked, defective_pairs, defect_notes, verdict
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reqNumber, req.customer_id, inspectionType, totalCartons,
      cartonsChecked, req.wip.step5_pairs_packed, defectivePairs, defectNotes, verdict
    );

    if (isPassed) {
      // Mark as Approved for Dispatch
      db.prepare(`
        UPDATE packing_wip 
        SET final_qc_status = 'APPROVED_DISPATCH', current_step = 'DISPATCH_APPROVED', updated_at = CURRENT_TIMESTAMP
        WHERE req_number = ?
      `).run(reqNumber);

      db.prepare(`UPDATE glove_requisitions SET status = 'DISPATCHED' WHERE req_number = ?`).run(reqNumber);
      db.prepare(`UPDATE cartons SET status = ? WHERE req_number = ?`).run(
        preference === 'THOROUGH' ? 'THOROUGH_PASS' : 'SAMPLED_PASS', reqNumber
      );
    } else {
      // DEFECTS FOUND: Send for repair (NOT rejected / scrapped)!
      // Defective pairs return back to Step 1: Checking
      db.prepare(`
        UPDATE packing_wip 
        SET final_qc_status = 'REPAIR_REQUIRED', 
            current_step = 'STEP_1',
            updated_at = CURRENT_TIMESTAMP
        WHERE req_number = ?
      `).run(reqNumber);

      // Create alteration entry with source FINAL_INSPECTION
      db.prepare(`
        INSERT INTO alterations (req_number, source_stage, pairs_count, defect_reason, status)
        VALUES (?, 'FINAL_INSPECTION', ?, ?, 'SENT_FOR_ALTERATION')
      `).run(reqNumber, defectivePairs, defectNotes || 'Defect found during final carton audit');
    }

    return this.getRequisition(reqNumber);
  }

  // --- ALTERATION RETURN LOOP: ALWAYS RETURNS TO STEP 1 (CHECKING) ---
  static returnAlteration(alterationId) {
    const alt = db.prepare(`SELECT * FROM alterations WHERE id = ?`).get(alterationId);
    if (!alt) throw new Error(`Alteration record #${alterationId} not found`);
    if (alt.status !== 'SENT_FOR_ALTERATION') throw new Error(`Alteration #${alterationId} is already marked ${alt.status}`);

    // Update alteration status
    db.prepare(`
      UPDATE alterations 
      SET status = 'RETURNED_TO_CHECKING', returned_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(alterationId);

    // Feed returned pairs strictly back into Step 1 Checking input!
    db.prepare(`
      UPDATE packing_wip
      SET step1_checking_in = step1_checking_in + ?,
          current_step = CASE WHEN current_step = 'DISPATCH_APPROVED' THEN current_step ELSE 'STEP_1' END,
          updated_at = CURRENT_TIMESTAMP
      WHERE req_number = ?
    `).run(alt.pairs_count, alt.req_number);

    return db.prepare(`SELECT * FROM alterations WHERE id = ?`).get(alterationId);
  }

  static getAlterations(reqNumber = null) {
    if (reqNumber) {
      return db.prepare(`SELECT * FROM alterations WHERE req_number = ? ORDER BY id DESC`).all(reqNumber);
    }
    return db.prepare(`
      SELECT a.*, r.customer_id, c.name AS customer_name, p.name AS product_name
      FROM alterations a
      JOIN glove_requisitions r ON a.req_number = r.req_number
      JOIN customers c ON r.customer_id = c.id
      JOIN products p ON r.product_id = p.id
      ORDER BY a.id DESC
    `).all();
  }

  // --- STORE MANAGER INWARD RECEIVINGS (Shipment Record) ---
  static getReceivings(filters = {}) {
    let query = `SELECT * FROM store_receivings WHERE 1=1`;
    const params = [];
    if (filters.date) {
      query += ` AND rcv_date = ?`;
      params.push(filters.date);
    }
    if (filters.customer) {
      query += ` AND customer_name = ?`;
      params.push(filters.customer);
    }
    if (filters.maker) {
      query += ` AND maker_contractor = ?`;
      params.push(filters.maker);
    }
    if (filters.search) {
      query += ` AND (po_number LIKE ? OR article_name LIKE ? OR rcv_number LIKE ? OR maker_contractor LIKE ?)`;
      const s = `%${filters.search}%`;
      params.push(s, s, s, s);
    }
    query += ` ORDER BY id ASC`;
    const rows = db.prepare(query).all(...params);

    const sizeStmt = db.prepare(`SELECT * FROM receiving_size_breakdowns WHERE rcv_number = ? ORDER BY id ASC`);
    return rows.map(r => ({
      ...r,
      sizes: sizeStmt.all(r.rcv_number)
    }));
  }

  static createReceiving(data) {
    const {
      rcvDate,
      makerContractor,
      customerName,
      poNumber,
      articleName,
      orderQty,
      rcvdPairs,
      challanNo,
      gatePassNo,
      vehicleNo,
      overageAllowedPct,
      sizes
    } = data;

    const effectiveCustomer = customerName || 'Standard';
    const effectivePo = poNumber || data.pendingOrderId || 'ORD-INWARD';

    if (!makerContractor || !articleName) {
      throw new Error('Maker/Contractor and Article are required');
    }

    const rcvdNum = Number(rcvdPairs || 0);
    const orderNum = Number(orderQty || rcvdNum || 0);
    if (rcvdNum <= 0) {
      throw new Error('Received pairs count must be greater than 0');
    }
    const balanceNum = Math.max(0, orderNum - rcvdNum);

    const year = new Date().getFullYear();
    const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM store_receivings`).get();
    const seq = String(Number(countRow.cnt) + 1).padStart(4, '0');
    const rcvNumber = data.rcvNumber || data.rcv_no || `RCV-${year}-${seq}`;
    const orderIdVal = data.orderId || data.order_id || data.pendingOrderId || '';

    const dateVal = rcvDate || data.rcv_date || new Date().toISOString().slice(0, 10);
    const status = balanceNum === 0 ? 'COMPLETE' : 'PARTIAL';

    db.prepare(`
      INSERT INTO store_receivings 
      (rcv_number, rcv_date, order_id, maker_contractor, customer_name, po_number, article_name, order_qty, rcvd_pairs, allocated_pairs, unallocated_pairs, allocation_status, balance_qty, status, challan_no, gate_pass_no, vehicle_no, overage_allowed_pct)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'UNALLOCATED', ?, ?, ?, ?, ?, ?)
    `).run(
      rcvNumber,
      dateVal,
      orderIdVal,
      makerContractor,
      effectiveCustomer,
      effectivePo,
      articleName,
      orderNum,
      rcvdNum,
      rcvdNum,
      balanceNum,
      status,
      challanNo || '',
      gatePassNo || '',
      vehicleNo || '',
      Number(overageAllowedPct || 2.0)
    );

    // Save size breakdown if provided
    if (Array.isArray(sizes) && sizes.length > 0) {
      const insertSize = db.prepare(`
        INSERT INTO receiving_size_breakdowns (rcv_number, size_code, order_pairs, rcvd_pairs, balance_pairs)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const s of sizes) {
        const o = Number(s.orderPairs || 0);
        const r = Number(s.rcvdPairs || 0);
        const b = Math.max(0, o - r);
        insertSize.run(rcvNumber, s.sizeCode, o, r, b);
      }
    }

    // Update raw gloves store inventory automatically
    let product = db.prepare(`SELECT * FROM products WHERE name = ? COLLATE NOCASE`).get(articleName);
    let customer = db.prepare(`SELECT * FROM customers WHERE name LIKE ?`).get(`%${effectiveCustomer}%`);

    if (!customer) {
      const custId = `CUST-${effectiveCustomer.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)}`;
      db.prepare(`INSERT OR IGNORE INTO customers (id, name, country, inspection_preference) VALUES (?, ?, 'Global', 'RANDOM')`)
        .run(custId, effectiveCustomer);
      customer = { id: custId, name: effectiveCustomer };
    }

    if (!product) {
      const prodId = `GLV-${articleName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)}`;
      db.prepare(`INSERT OR IGNORE INTO products (id, name, customer_id, polybag_per_pair, silica_gel_per_pair, stickers_per_pair, pairs_per_carton) VALUES (?, ?, ?, 1, 1, 2, 50)`)
        .run(prodId, articleName, customer.id);
      product = { id: prodId, name: articleName };
    }

    // Increment raw gloves inventory for this product
    const existingStock = db.prepare(`SELECT * FROM store_gloves_inventory WHERE product_id = ?`).get(product.id);
    if (existingStock) {
      db.prepare(`
        UPDATE store_gloves_inventory 
        SET available_pairs = available_pairs + ?, last_updated = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(rcvdNum, existingStock.id);
    } else {
      const stockId = `STK-${product.id}`;
      db.prepare(`
        INSERT INTO store_gloves_inventory (id, product_id, customer_id, available_pairs)
        VALUES (?, ?, ?, ?)
      `).run(stockId, product.id, customer.id, rcvdNum);
    }

    const row = db.prepare(`SELECT * FROM store_receivings WHERE rcv_number = ?`).get(rcvNumber);
    const sizeRows = db.prepare(`SELECT * FROM receiving_size_breakdowns WHERE rcv_number = ?`).all(rcvNumber);
    return { ...row, sizes: sizeRows };
  }

  static getReceivingDropdowns() {
    const makers = db.prepare(`
      SELECT DISTINCT maker_contractor FROM store_receivings ORDER BY maker_contractor
    `).all().map(r => r.maker_contractor);

    // Standard contractors from sheet
    const defaultMakers = [
      'Hall B',
      'Hall A',
      'Maker A',
      'Maker B',
      'Maker C',
      'Maker D'
    ];
    defaultMakers.forEach(m => {
      if (!makers.includes(m)) makers.push(m);
    });

    const customers = db.prepare(`
      SELECT DISTINCT customer_name FROM store_receivings
      UNION
      SELECT name FROM customers
      ORDER BY 1
    `).all().map(r => r.customer_name || r.name);

    const articles = db.prepare(`
      SELECT DISTINCT article_name FROM store_receivings
      UNION
      SELECT name FROM products
      ORDER BY 1
    `).all().map(r => r.article_name || r.name);

    const poList = db.prepare(`
      SELECT DISTINCT po_number FROM store_receivings WHERE po_number IS NOT NULL AND po_number != '' ORDER BY po_number
    `).all().map(r => r.po_number);

    return { makers, customers, articles, poList };
  }

  // --- PACKAGING BOM LOOKUP ---
  static getPackagingBOM(productId, pairsCount = 1) {
    const pCount = Number(pairsCount || 1);
    const bomRows = db.prepare(`
      SELECT b.*, m.available_qty as store_stock, m.unit
      FROM product_packaging_bom b
      LEFT JOIN store_materials_inventory m ON b.material_code = m.material_code
      WHERE b.product_id = ?
    `).all(productId);

    return bomRows.map(b => ({
      materialCode: b.material_code,
      materialName: b.material_name,
      unit: b.unit,
      qtyPerPair: b.qty_per_pair,
      requiredQty: Math.ceil(b.qty_per_pair * pCount),
      availableStock: b.store_stock || 0,
      isMandatory: Boolean(b.is_mandatory)
    }));
  }

  // --- MATERIAL RETURN VOUCHER (MRV) ---
  static createMaterialReturnVoucher(matReqNumber, materialCode, returnedQty, returnReason) {
    const qty = Number(returnedQty);
    if (qty <= 0) throw new Error('Returned quantity must be greater than 0');

    const year = new Date().getFullYear();
    const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM material_return_vouchers`).get();
    const seq = String(Number(countRow.cnt) + 1).padStart(4, '0');
    const mrvNumber = `MRV-${year}-${seq}`;

    db.prepare(`
      INSERT INTO material_return_vouchers (mrv_number, mat_req_number, material_code, returned_qty, return_reason)
      VALUES (?, ?, ?, ?, ?)
    `).run(mrvNumber, matReqNumber, materialCode, qty, returnReason);

    // Return stock back to store materials inventory
    db.prepare(`
      UPDATE store_materials_inventory
      SET available_qty = available_qty + ?, last_updated = CURRENT_TIMESTAMP
      WHERE material_code = ?
    `).run(qty, materialCode);

    return db.prepare(`SELECT * FROM material_return_vouchers WHERE mrv_number = ?`).get(mrvNumber);
  }

  // --- CLOSED LOOP ALTERATION REWORK (Max 2-Rework Scrap Rule) ---
  static completeAlterationRepair(alterationId, tailorName = 'Supervisor A', isScrap = false, deductionRate = 150) {
    const alt = db.prepare(`SELECT * FROM alterations WHERE id = ?`).get(alterationId);
    if (!alt) throw new Error(`Alteration #${alterationId} not found`);

    if (alt.status === 'RETURNED_TO_CHECKING') {
      throw new Error(`Alteration #${alterationId} has already been repaired and returned`);
    }

    const currentReworks = Number(alt.rework_count || 1);

    // If marked scrap or exceeded 2 rework attempts -> Auto condemn to scrap
    if (isScrap || currentReworks >= 2) {
      db.prepare(`
        UPDATE alterations
        SET status = 'RETURNED_TO_CHECKING', tailor_name = ?, is_scrapped = 1, returned_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(tailorName, alterationId);

      const req = db.prepare(`SELECT p.name as article_name FROM glove_requisitions r JOIN products p ON r.product_id = p.id WHERE r.req_number = ?`).get(alt.req_number);
      const articleName = req ? req.article_name : 'Gloves';
      const totalDeduction = Number(alt.pairs_count) * Number(deductionRate);

      db.prepare(`
        INSERT INTO scrap_ledger (req_number, article_name, scrapped_pairs, fault_party, defect_reason, financial_deduction_amount)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(alt.req_number, articleName, alt.pairs_count, alt.fault_party || 'CONTRACTOR', alt.defect_reason || 'Unrepairable Defect', totalDeduction);

      return {
        alterationId,
        status: 'CONDEMNED_TO_SCRAP',
        pairsCount: alt.pairs_count,
        tailorName,
        faultParty: alt.fault_party || 'CONTRACTOR',
        financialDeduction: totalDeduction,
        route: 'Scrap Condemned / Bin'
      };
    }

    // Otherwise repaired -> MANDATORY FACTORY RULE: Must return to Step 1 Checking
    db.prepare(`
      UPDATE alterations
      SET status = 'RETURNED_TO_CHECKING', tailor_name = ?, rework_count = rework_count + 1, returned_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(tailorName, alterationId);

    // Advance pairs back to Step 1 Checking in WIP
    db.prepare(`
      UPDATE packing_wip
      SET step1_checking_in = step1_checking_in + ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE req_number = ?
    `).run(alt.pairs_count, alt.req_number);

    return {
      alterationId,
      status: 'REPAIRED_RETURNED',
      pairsCount: alt.pairs_count,
      tailorName,
      route: 'RETURNED_TO_STAGE_1_CHECKING',
      message: `${alt.pairs_count} pairs repaired by ${tailorName} and auto-routed back to Stage 1 Checking.`
    };
  }

  // --- AQL 1.5 SAMPLING INSPECTION & QUARANTINE ---
  static executeAQLAudit(reqNumber, foundDefects = 0, inspectorId = 'QC-4402', inspectorName = 'Tariq Mehmood') {
    const req = this.getRequisition(reqNumber);
    if (!req) throw new Error(`Requisition ${reqNumber} not found`);

    const lotSize = req.issued_pairs || req.requested_pairs;
    const evaluation = AQLService.evaluateLot(lotSize, foundDefects, 1.5);

    const newAqlStatus = evaluation.isApproved ? 'PASSED' : 'REJECTED';
    const finalQcStatus = evaluation.isApproved ? 'APPROVED_DISPATCH' : 'REPAIR_REQUIRED';

    // Update all cartons for this requisition
    db.prepare(`
      UPDATE cartons
      SET aql_status = ?,
          status = ?
      WHERE req_number = ?
    `).run(newAqlStatus, evaluation.isApproved ? 'SAMPLED_PASS' : 'DEFECTIVE_REPAIRED', reqNumber);

    // Update packing_wip final_qc_status
    db.prepare(`
      UPDATE packing_wip
      SET final_qc_status = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE req_number = ?
    `).run(finalQcStatus, reqNumber);

    return {
      reqNumber,
      inspector: { id: inspectorId, name: inspectorName },
      ...evaluation
    };
  }

  // --- MASTER CARTON MANIFEST & EXPORT PACKING LIST ---
  static getMasterCartonManifest(reqNumber) {
    const req = this.getRequisition(reqNumber);
    if (!req) throw new Error(`Requisition ${reqNumber} not found`);

    const cartons = db.prepare(`
      SELECT * FROM cartons WHERE req_number = ? ORDER BY carton_number ASC
    `).all(reqNumber);

    const totalCartons = cartons.length;
    const totalPairs = cartons.reduce((sum, c) => sum + Number(c.pairs_count), 0);
    const totalGrossWt = cartons.reduce((sum, c) => sum + Number(c.gross_weight_kg || 4.8), 0);
    const totalCBM = (totalCartons * (0.6 * 0.4 * 0.35)).toFixed(2); // 0.084 CBM per ctn

    return {
      reqNumber: req.req_number,
      customerName: req.customer_name,
      articleName: req.product_name,
      poNumber: req.notes || 'PO-27347',
      totalCartons,
      totalPairs,
      totalGrossWtKg: totalGrossWt.toFixed(1),
      totalCBM,
      containerNo: 'MSKU-449102-1',
      destinationPort: 'Southampton / Felixstowe UK',
      cartons: cartons.map(c => ({
        cartonNumber: `CTN-${String(c.carton_number).padStart(2, '0')}`,
        pairsPerCarton: c.pairs_count,
        netWeightKg: c.net_weight_kg || 4.2,
        grossWeightKg: c.gross_weight_kg || 4.8,
        dimensionsCm: c.dimensions_cm || '60x40x35',
        barcodeVerified: true,
        qcSealNo: c.qc_seal_no || `QC-SEAL-${9080 + c.carton_number}`,
        aqlStatus: c.aql_status || 'PASSED'
      }))
    };
  }

  // ============================================================================
  // SUPER USER ADMIN MANAGEMENT METHODS
  // ============================================================================
  static getAdminOverview() {
    const journalMode = db.prepare('PRAGMA journal_mode').get()?.journal_mode || 'wal';
    const integrity = db.prepare('PRAGMA integrity_check').get()?.integrity_check || 'ok';

    const tables = [
      'customers',
      'products',
      'store_gloves_inventory',
      'store_materials_inventory',
      'glove_requisitions',
      'packing_wip',
      'material_requisitions',
      'alterations',
      'cartons',
      'final_inspections',
      'store_receivings',
      'receiving_size_breakdowns',
      'product_packaging_bom',
      'scrap_ledger',
      'export_shipments',
      'material_return_vouchers',
      'pending_orders'
    ];

    const tableCounts = {};
    for (const t of tables) {
      try {
        tableCounts[t] = db.prepare(`SELECT COUNT(*) as cnt FROM ${t}`).get().cnt;
      } catch {
        tableCounts[t] = 0;
      }
    }

    const receivings = this.getReceivings();
    const requisitions = db.prepare(`
      SELECT r.*, c.name AS customer_name, c.inspection_preference, p.name AS product_name,
             w.current_step, w.step1_checking_in, w.step1_checking_good, w.step1_checking_defects,
             w.step2_ironing_in, w.step2_ironing_good, w.step2_ironing_defects,
             w.step3_matching_in, w.step3_matching_good, w.step3_matching_defects,
             w.step4_materials_issued, w.step4_packing_good,
             w.step5_cartons_packed, w.step5_pairs_packed, w.final_qc_status
      FROM glove_requisitions r
      LEFT JOIN customers c ON r.customer_id = c.id
      LEFT JOIN products p ON r.product_id = p.id
      LEFT JOIN packing_wip w ON r.req_number = w.req_number
      ORDER BY r.created_at DESC
    `).all();

    const alterations = this.getAlterations();
    const scrapLedger = db.prepare(`SELECT * FROM scrap_ledger ORDER BY id DESC`).all();
    const mrvList = db.prepare(`SELECT * FROM material_return_vouchers ORDER BY created_at DESC`).all();
    const customers = this.getCustomers();
    const products = this.getProducts();
    const gloveInventory = this.getGloveInventory();
    const materialInventory = this.getMaterialInventory();
    const materialReqs = this.getMaterialRequisitions();
    const dropdowns = this.getReceivingDropdowns();
    const pendingOrders = this.getPendingOrders();

    return {
      dbHealth: {
        journalMode,
        integrity,
        tableCounts,
        totalTables: tables.length
      },
      customers,
      products,
      gloveInventory,
      materialInventory,
      receivings,
      requisitions,
      materialReqs,
      alterations,
      scrapLedger,
      mrvList,
      dropdowns,
      pendingOrders
    };
  }

  static getPendingOrders() {
    try {
      const rows = db.prepare(`SELECT * FROM pending_orders ORDER BY created_at DESC, order_id DESC`).all();
      return rows.map(r => ({
        orderId: r.order_id,
        buyer: r.buyer_name,
        maker: r.maker_contractor,
        po: r.po_number,
        article: r.article_name,
        color: r.color_shade,
        sizes: {
          '7': Number(r.size_7 || 0),
          '8': Number(r.size_8 || 0),
          '9': Number(r.size_9 || 0),
          '10': Number(r.size_10 || 0),
          '11': Number(r.size_11 || 0)
        },
        totalQty: Number(r.total_qty || 0),
        notes: r.notes || ''
      }));
    } catch {
      return [];
    }
  }

  static upsertPendingOrderAdmin(payload) {
    const orderId = String(payload.orderId || '').trim();
    const buyer = String(payload.buyer || '').trim();
    const maker = String(payload.maker || '').trim();
    const po = String(payload.po || '').trim();
    const article = String(payload.article || '').trim();
    const color = String(payload.color || 'Standard').trim();
    const sizes = payload.sizes || {};
    const s7 = Math.max(0, Number(sizes['7'] || 0));
    const s8 = Math.max(0, Number(sizes['8'] || 0));
    const s9 = Math.max(0, Number(sizes['9'] || 0));
    const s10 = Math.max(0, Number(sizes['10'] || 0));
    const s11 = Math.max(0, Number(sizes['11'] || 0));
    const totalQty = Math.max(0, Number(payload.totalQty ?? (s7 + s8 + s9 + s10 + s11)));

    if (!orderId || !maker || !article) {
      throw new Error('orderId, maker, and article are required');
    }

    db.prepare(`
      INSERT INTO pending_orders (
        order_id, buyer_name, maker_contractor, po_number, article_name, color_shade,
        size_7, size_8, size_9, size_10, size_11, total_qty, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(order_id) DO UPDATE SET
        buyer_name = excluded.buyer_name,
        maker_contractor = excluded.maker_contractor,
        po_number = excluded.po_number,
        article_name = excluded.article_name,
        color_shade = excluded.color_shade,
        size_7 = excluded.size_7,
        size_8 = excluded.size_8,
        size_9 = excluded.size_9,
        size_10 = excluded.size_10,
        size_11 = excluded.size_11,
        total_qty = excluded.total_qty,
        notes = excluded.notes
    `).run(
      orderId,
      buyer,
      maker,
      po,
      article,
      color,
      s7,
      s8,
      s9,
      s10,
      s11,
      totalQty,
      payload.notes || ''
    );

    return this.getPendingOrders();
  }

  static deletePendingOrderAdmin(orderId) {
    db.prepare(`DELETE FROM pending_orders WHERE order_id = ?`).run(String(orderId || '').trim());
    return this.getPendingOrders();
  }

  static updateGloveInventoryAdmin({ id, productId, customerId, availablePairs }) {
    const pairs = Math.max(0, Number(availablePairs || 0));
    if (id) {
      db.prepare(`
        UPDATE store_gloves_inventory
        SET available_pairs = ?, last_updated = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(pairs, id);
    } else if (productId && customerId) {
      const existing = db.prepare(`
        SELECT id FROM store_gloves_inventory WHERE product_id = ? AND customer_id = ?
      `).get(productId, customerId);
      if (existing) {
        db.prepare(`
          UPDATE store_gloves_inventory
          SET available_pairs = ?, last_updated = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(pairs, existing.id);
      } else {
        const newId = `STK-GLV-${Date.now().toString().slice(-4)}`;
        db.prepare(`
          INSERT INTO store_gloves_inventory (id, product_id, customer_id, available_pairs)
          VALUES (?, ?, ?, ?)
        `).run(newId, productId, customerId, pairs);
      }
    } else {
      throw new Error('Either inventory id or (productId, customerId) is required');
    }
    return this.getGloveInventory();
  }

  static updateMaterialInventoryAdmin({ materialCode, materialName, availableQty, unit }) {
    if (!materialCode) throw new Error('materialCode is required');
    const code = String(materialCode).trim().toUpperCase();
    const qty = Math.max(0, Number(availableQty || 0));
    const existing = db.prepare(`SELECT * FROM store_materials_inventory WHERE material_code = ?`).get(code);
    if (existing) {
      db.prepare(`
        UPDATE store_materials_inventory
        SET available_qty = ?,
            material_name = COALESCE(?, material_name),
            unit = COALESCE(?, unit),
            last_updated = CURRENT_TIMESTAMP
        WHERE material_code = ?
      `).run(qty, materialName || null, unit || null, code);
    } else {
      db.prepare(`
        INSERT INTO store_materials_inventory (material_code, material_name, available_qty, unit)
        VALUES (?, ?, ?, ?)
      `).run(code, materialName || code, qty, unit || 'pcs');
    }
    return this.getMaterialInventory();
  }

  static upsertCustomerAdmin({ id, name, country, inspectionPreference }) {
    if (!name) throw new Error('Customer name is required');
    const custId = id || `CUST-${Date.now().toString().slice(-4)}`;
    const pref = inspectionPreference === 'THOROUGH' ? 'THOROUGH' : 'RANDOM';
    db.prepare(`
      INSERT INTO customers (id, name, country, inspection_preference)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        country = excluded.country,
        inspection_preference = excluded.inspection_preference
    `).run(custId, name.trim(), (country || 'United Kingdom').trim(), pref);
    return this.getCustomers();
  }

  static upsertProductAdmin({ id, name, customerId, polybagPerPair, silicaGelPerPair, stickersPerPair, pairsPerCarton }) {
    if (!name || !customerId) throw new Error('Article name and customerId are required');
    const prodId = id || `GLV-${name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)}-${Date.now().toString().slice(-2)}`;
    db.prepare(`
      INSERT INTO products (id, name, customer_id, polybag_per_pair, silica_gel_per_pair, stickers_per_pair, pairs_per_carton)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        customer_id = excluded.customer_id,
        polybag_per_pair = excluded.polybag_per_pair,
        silica_gel_per_pair = excluded.silica_gel_per_pair,
        stickers_per_pair = excluded.stickers_per_pair,
        pairs_per_carton = excluded.pairs_per_carton
    `).run(
      prodId,
      name.trim(),
      customerId,
      Number(polybagPerPair ?? 1),
      Number(silicaGelPerPair ?? 1),
      Number(stickersPerPair ?? 2),
      Number(pairsPerCarton ?? 50)
    );
    return this.getProducts();
  }

  static overrideWipAdmin(reqNumber, payload) {
    const wip = db.prepare(`SELECT * FROM packing_wip WHERE req_number = ?`).get(reqNumber);
    if (!wip) throw new Error(`WIP record for ${reqNumber} not found`);

    db.prepare(`
      UPDATE packing_wip
      SET current_step = COALESCE(?, current_step),
          step1_checking_in = COALESCE(?, step1_checking_in),
          step1_checking_good = COALESCE(?, step1_checking_good),
          step1_checking_defects = COALESCE(?, step1_checking_defects),
          step2_ironing_in = COALESCE(?, step2_ironing_in),
          step2_ironing_good = COALESCE(?, step2_ironing_good),
          step2_ironing_defects = COALESCE(?, step2_ironing_defects),
          step3_matching_in = COALESCE(?, step3_matching_in),
          step3_matching_good = COALESCE(?, step3_matching_good),
          step3_matching_defects = COALESCE(?, step3_matching_defects),
          step4_materials_issued = COALESCE(?, step4_materials_issued),
          step4_packing_good = COALESCE(?, step4_packing_good),
          step5_cartons_packed = COALESCE(?, step5_cartons_packed),
          step5_pairs_packed = COALESCE(?, step5_pairs_packed),
          final_qc_status = COALESCE(?, final_qc_status),
          updated_at = CURRENT_TIMESTAMP
      WHERE req_number = ?
    `).run(
      payload.currentStep ?? null,
      payload.step1In !== undefined ? Number(payload.step1In) : null,
      payload.step1Good !== undefined ? Number(payload.step1Good) : null,
      payload.step1Defects !== undefined ? Number(payload.step1Defects) : null,
      payload.step2In !== undefined ? Number(payload.step2In) : null,
      payload.step2Good !== undefined ? Number(payload.step2Good) : null,
      payload.step2Defects !== undefined ? Number(payload.step2Defects) : null,
      payload.step3In !== undefined ? Number(payload.step3In) : null,
      payload.step3Good !== undefined ? Number(payload.step3Good) : null,
      payload.step3Defects !== undefined ? Number(payload.step3Defects) : null,
      payload.step4Issued !== undefined ? Number(payload.step4Issued) : null,
      payload.step4Good !== undefined ? Number(payload.step4Good) : null,
      payload.step5Cartons !== undefined ? Number(payload.step5Cartons) : null,
      payload.step5Pairs !== undefined ? Number(payload.step5Pairs) : null,
      payload.finalQcStatus ?? null,
      reqNumber
    );

    if (payload.reqStatus) {
      db.prepare(`UPDATE glove_requisitions SET status = ? WHERE req_number = ?`).run(payload.reqStatus, reqNumber);
    }

    return this.getRequisition(reqNumber);
  }

  static deleteRecordAdmin(table, id) {
    const allowed = {
      store_receivings: 'id',
      alterations: 'id',
      scrap_ledger: 'id',
      material_return_vouchers: 'mrv_number',
      glove_requisitions: 'req_number'
    };

    const pk = allowed[table];
    if (!pk) throw new Error(`Deletion not permitted on table: ${table}`);

    if (table === 'glove_requisitions') {
      db.prepare(`DELETE FROM final_inspections WHERE req_number = ?`).run(id);
      db.prepare(`DELETE FROM cartons WHERE req_number = ?`).run(id);
      db.prepare(`DELETE FROM alterations WHERE req_number = ?`).run(id);
      db.prepare(`DELETE FROM material_requisitions WHERE req_number = ?`).run(id);
      db.prepare(`DELETE FROM packing_wip WHERE req_number = ?`).run(id);
      db.prepare(`DELETE FROM glove_requisitions WHERE req_number = ?`).run(id);
    } else {
      db.prepare(`DELETE FROM ${table} WHERE ${pk} = ?`).run(id);
    }
    return { deleted: true, table, id };
  }

  static triggerDatabaseBackupAdmin() {
    const dest = backupDatabase();
    return {
      backupPath: dest,
      timestamp: new Date().toISOString()
    };
  }

  static resetAndSeedDatabaseAdmin() {
    initDatabase();
    return this.getAdminOverview();
  }

  // ============================================================================
  // 10.1, 10.2, 10.3, 10.4 — SERVER-SIDE CONCURRENCY, VOID/SHORT-CLOSE, RBAC & IMMUTABLE AUDIT TRAIL
  // ============================================================================
  static ROLE_PERMISSIONS = {
    SUPER_USER: [
      'ORDER_CREATE',
      'ORDER_ADJUST',
      'ORDER_SHORT_CLOSE',
      'GRN_RECEIVE',
      'GRN_VOID',
      'REQ_CREATE',
      'REQ_ISSUE',
      'REQ_VOID',
      'WIP_STAGE_ADVANCE',
      'FINAL_QC_APPROVE',
      'FINAL_QC_REJECT',
      'STAGE_5_CARTON_SEAL',
      'ALTERATION_CYCLE_UPDATE',
      'SCRAP_CONDEMN'
    ],
    INWARD_CLERK: ['GRN_RECEIVE', 'REQ_ISSUE'],
    PACKING_SUPERVISOR: ['REQ_CREATE', 'WIP_STAGE_ADVANCE', 'STAGE_5_CARTON_SEAL'],
    QC_INSPECTOR: ['FINAL_QC_APPROVE', 'FINAL_QC_REJECT', 'WIP_STAGE_ADVANCE'],
    ALTERATION_LEAD: ['ALTERATION_CYCLE_UPDATE', 'SCRAP_CONDEMN']
  };

  static enforceRolePermission(role, action) {
    const effectiveRole = String(role || 'SUPER_USER').trim().toUpperCase();
    const allowed = this.ROLE_PERMISSIONS[effectiveRole] || [];
    if (!allowed.includes(action)) {
      const err = new Error(`RBAC Forbidden: Role ${effectiveRole} is not permitted to perform ${action}.`);
      err.statusCode = 403;
      throw err;
    }
    return true;
  }

  static recordAuditLog({
    actor = 'System Operator',
    role = 'SUPER_USER',
    action,
    entityId,
    orderId = '',
    beforeSummary,
    afterSummary,
    reason = ''
  }) {
    const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM audit_trail`).get();
    const seq = Number(countRow?.cnt || 0) + 1;
    const auditId = `AUD-${String(seq).padStart(4, '0')}-${Date.now().toString().slice(-4)}`;
    db.prepare(`
      INSERT INTO audit_trail (
        audit_id, actor, role, action, entity_id, order_id, before_summary, after_summary, reason
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      auditId,
      String(actor),
      String(role),
      String(action),
      String(entityId),
      String(orderId || ''),
      String(beforeSummary),
      String(afterSummary),
      String(reason || '')
    );
    return db.prepare(`SELECT * FROM audit_trail WHERE audit_id = ?`).get(auditId);
  }

  static getAuditTrail(limit = 100) {
    return db
      .prepare(`SELECT * FROM audit_trail ORDER BY id DESC LIMIT ?`)
      .all(Math.max(1, Number(limit || 100)));
  }

  /**
   * 10.1 — Server-side SQLite Transactional Dock Issuance against a Parent Order's GRNs.
   * Uses `BEGIN IMMEDIATE` to serialize concurrent writers across tabs/machines and prevent Dock over-issue.
   */
  static issueOrderRequisitionTransactional({
    orderId,
    reqNumber,
    requestedPairs,
    actor = 'Inward Clerk',
    role = 'INWARD_CLERK'
  }) {
    this.enforceRolePermission(role, 'REQ_ISSUE');
    const qty = Number(requestedPairs || 0);
    if (!orderId || !reqNumber || qty <= 0) {
      throw new Error('orderId, reqNumber, and requestedPairs > 0 are required');
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      const grnRows = db
        .prepare(
          `SELECT * FROM store_receivings
           WHERE (order_id = ? OR po_number = ?) AND COALESCE(is_voided, 0) = 0
           ORDER BY id ASC`
        )
        .all(orderId, orderId);

      const totalReceived = grnRows.reduce((s, r) => s + Number(r.rcvd_pairs || 0), 0);
      const existingAllocs = db
        .prepare(`SELECT COALESCE(SUM(allocated_pairs), 0) as total_alloc FROM grn_req_allocations WHERE order_id = ?`)
        .get(orderId);
      const alreadyAllocated = Number(existingAllocs?.total_alloc || 0);
      const availableDockPairs = Math.max(0, totalReceived - alreadyAllocated);

      if (qty > availableDockPairs) {
        throw new Error(
          `Insufficient Dock Pool balance for ${orderId}: Available ${availableDockPairs} pairs, Requested ${qty} pairs.`
        );
      }

      let remainingToAllocate = qty;
      const allocationsCreated = [];

      for (const grn of grnRows) {
        if (remainingToAllocate <= 0) break;
        const grnAllocRow = db
          .prepare(
            `SELECT COALESCE(SUM(allocated_pairs), 0) as alloc FROM grn_req_allocations WHERE order_id = ? AND rcv_number = ?`
          )
          .get(orderId, grn.rcv_number);
        const grnAllocated = Number(grnAllocRow?.alloc || 0);
        const grnAvail = Math.max(0, Number(grn.rcvd_pairs || 0) - grnAllocated);
        if (grnAvail <= 0) continue;

        const take = Math.min(remainingToAllocate, grnAvail);
        remainingToAllocate -= take;
        const newGrnAllocated = grnAllocated + take;
        const newGrnUnallocated = Math.max(0, Number(grn.rcvd_pairs || 0) - newGrnAllocated);
        const newStatus =
          newGrnUnallocated === 0 ? 'FULLY ALLOCATED' : 'PARTIALLY ALLOCATED';

        const allocId = `ALLOC-${orderId}-${grn.rcv_number}-${reqNumber}-${Date.now()}-${allocationsCreated.length + 1}`;
        db.prepare(
          `INSERT INTO grn_req_allocations (allocation_id, order_id, rcv_number, req_number, allocated_pairs, sizes_json)
           VALUES (?, ?, ?, ?, ?, '{}')`
        ).run(allocId, orderId, grn.rcv_number, reqNumber, take);

        db.prepare(
          `UPDATE store_receivings
           SET allocated_pairs = ?, unallocated_pairs = ?, allocation_status = ?
           WHERE rcv_number = ?`
        ).run(newGrnAllocated, newGrnUnallocated, newStatus, grn.rcv_number);

        allocationsCreated.push({
          allocationId: allocId,
          grnCode: grn.rcv_number,
          reqNumber,
          allocatedPairs: take
        });
      }

      // Ensure glove_requisitions & packing_wip records exist for this order requisition
      const firstCust = db.prepare(`SELECT id FROM customers LIMIT 1`).get();
      const firstProd = db.prepare(`SELECT id FROM products LIMIT 1`).get();
      const custId = firstCust?.id || 'CUST-001';
      const prodId = firstProd?.id || 'GLV-001';
      db.prepare(`
        INSERT INTO glove_requisitions (req_number, order_id, customer_id, product_id, requested_pairs, status, is_voided)
        VALUES (?, ?, ?, ?, ?, 'ISSUED', 0)
        ON CONFLICT(req_number) DO UPDATE SET
          order_id = excluded.order_id,
          requested_pairs = excluded.requested_pairs,
          status = 'ISSUED',
          is_voided = 0
      `).run(reqNumber, orderId, custId, prodId, qty);

      db.prepare(`
        INSERT OR IGNORE INTO packing_wip (req_number, current_step, step1_checking_in, step4_packing_good)
        VALUES (?, 'STEP_1', ?, 0)
      `).run(reqNumber, qty);

      this.recordAuditLog({
        actor,
        role,
        action: 'REQ_ISSUE',
        entityId: reqNumber,
        orderId,
        beforeSummary: `Dock Pool: ${availableDockPairs} Prs`,
        afterSummary: `Issued ${qty} Prs to ${reqNumber}; Remaining Dock Pool: ${availableDockPairs - qty} Prs`
      });

      db.exec('COMMIT');
      return {
        accepted: true,
        orderId,
        reqNumber,
        issuedPairs: qty,
        remainingDockPoolPairs: availableDockPairs - qty,
        allocations: allocationsCreated
      };
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // Ignore rollback error
      }
      throw err;
    }
  }

  /**
   * 10.2 — Void a GRN in SQLite only if 0 pairs have been allocated/issued to any REQ.
   */
  static voidReceivingGrn(rcvNumber, reason = 'Entry Correction', actor = 'Super User', role = 'SUPER_USER') {
    if (typeof reason === 'object' && reason !== null) {
      role = reason.role || role;
      actor = reason.actor || actor;
      reason = reason.reason || 'Entry Correction';
    }
    this.enforceRolePermission(role, 'GRN_VOID');
    db.exec('BEGIN IMMEDIATE');
    try {
      const rcv = db.prepare(`SELECT * FROM store_receivings WHERE rcv_number = ?`).get(rcvNumber);
      if (!rcv) throw new Error(`GRN ${rcvNumber} not found`);
      if (Number(rcv.is_voided || 0) === 1) throw new Error(`GRN ${rcvNumber} is already voided`);

      const allocRow = db
        .prepare(`SELECT COALESCE(SUM(allocated_pairs), 0) as alloc FROM grn_req_allocations WHERE rcv_number = ?`)
        .get(rcvNumber);
      const allocated = Math.max(Number(rcv.allocated_pairs || 0), Number(allocRow?.alloc || 0));
      if (allocated > 0) {
        throw new Error(`Cannot void GRN ${rcvNumber}: ${allocated} pairs have already been allocated to REQs.`);
      }

      db.prepare(
        `UPDATE store_receivings
         SET is_voided = 1, void_reason = ?, allocation_status = 'VOIDED', unallocated_pairs = 0
         WHERE rcv_number = ?`
      ).run(reason, rcvNumber);

      this.recordAuditLog({
        actor,
        role,
        action: 'GRN_VOID',
        entityId: rcvNumber,
        orderId: rcv.order_id || rcv.po_number || '',
        beforeSummary: `Received ${rcv.rcvd_pairs} Prs (UNALLOCATED)`,
        afterSummary: `VOIDED (${reason})`,
        reason
      });

      db.exec('COMMIT');
      return db.prepare(`SELECT * FROM store_receivings WHERE rcv_number = ?`).get(rcvNumber);
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {}
      throw err;
    }
  }

  /**
   * 10.2 — Void a REQ in SQLite only before Stage 1 inspection begins.
   */
  static voidGloveRequisition(reqNumber, reason = 'Cancelled Lot', actor = 'Super User', role = 'SUPER_USER') {
    if (typeof reason === 'object' && reason !== null) {
      role = reason.role || role;
      actor = reason.actor || actor;
      reason = reason.reason || 'Cancelled Lot';
    }
    this.enforceRolePermission(role, 'REQ_VOID');
    db.exec('BEGIN IMMEDIATE');
    try {
      const req = this.getRequisition(reqNumber);
      if (!req) throw new Error(`Requisition ${reqNumber} not found`);
      if (Number(req.is_voided || 0) === 1) throw new Error(`Requisition ${reqNumber} is already voided`);

      const s1Good = Number(req.wip?.step1_checking_good || 0);
      const s5Packed = Number(req.wip?.step5_pairs_packed || 0);
      if (s1Good > 0 || s5Packed > 0) {
        throw new Error(`Cannot void ${reqNumber}: Stage 1 inspection has already begun (${s1Good} pairs checked).`);
      }

      // Release any GRN allocations back to unallocated dock bins
      const allocs = db.prepare(`SELECT * FROM grn_req_allocations WHERE req_number = ?`).all(reqNumber);
      for (const a of allocs) {
        db.prepare(`
          UPDATE store_receivings
          SET allocated_pairs = MAX(0, COALESCE(allocated_pairs, 0) - ?),
              unallocated_pairs = COALESCE(unallocated_pairs, 0) + ?,
              allocation_status = CASE WHEN MAX(0, COALESCE(allocated_pairs, 0) - ?) = 0 THEN 'UNALLOCATED' ELSE 'PARTIALLY ALLOCATED' END
          WHERE rcv_number = ?
        `).run(a.allocated_pairs, a.allocated_pairs, a.allocated_pairs, a.rcv_number);
      }
      db.prepare(`DELETE FROM grn_req_allocations WHERE req_number = ?`).run(reqNumber);

      db.prepare(`UPDATE glove_requisitions SET status = 'PENDING', is_voided = 1, void_reason = ? WHERE req_number = ?`).run(
        reason,
        reqNumber
      );

      this.recordAuditLog({
        actor,
        role,
        action: 'REQ_VOID',
        entityId: reqNumber,
        orderId: req.order_id || '',
        beforeSummary: `Status: ${req.status} (${req.requested_pairs} Prs)`,
        afterSummary: `VOIDED (${reason})`,
        reason
      });

      db.exec('COMMIT');
      return this.getRequisition(reqNumber);
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {}
      throw err;
    }
  }

  /**
   * 2.3 & 10.2 — Short-close a Pending Order in SQLite.
   */
  static shortClosePendingOrder(orderId, reason = 'Short-shipped closure', actor = 'Super User', role = 'SUPER_USER') {
    if (typeof reason === 'object' && reason !== null) {
      role = reason.role || role;
      actor = reason.actor || actor;
      reason = reason.reason || 'Short-shipped closure';
    }
    this.enforceRolePermission(role, 'ORDER_SHORT_CLOSE');
    const ord = db.prepare(`SELECT * FROM pending_orders WHERE order_id = ?`).get(orderId);
    if (!ord) throw new Error(`Pending Order ${orderId} not found`);

    db.prepare(
      `UPDATE pending_orders SET short_closed = 1, short_close_reason = ? WHERE order_id = ?`
    ).run(reason, orderId);

    this.recordAuditLog({
      actor,
      role,
      action: 'ORDER_SHORT_CLOSE',
      entityId: orderId,
      orderId,
      beforeSummary: `Planned: ${ord.total_qty} Prs (Open)`,
      afterSummary: `Short-Closed (${reason})`,
      reason
    });

    return db.prepare(`SELECT * FROM pending_orders WHERE order_id = ?`).get(orderId);
  }
}

