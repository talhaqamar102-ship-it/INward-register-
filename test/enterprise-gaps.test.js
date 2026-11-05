import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { initDatabase, db, seedDemoSheet } from '../src/db.js';
import { PackingService } from '../src/services/packingService.js';
import { AQLService } from '../src/services/aqlService.js';

describe('Enterprise MES Gap Implementation Test Suite', () => {
  before(() => {
    initDatabase();
    seedDemoSheet();
    db.prepare(`UPDATE store_gloves_inventory SET available_pairs = 5000 WHERE product_id = 'GLV-A9'`).run();
    db.prepare(`UPDATE store_materials_inventory SET available_qty = 50000`).run();
  });

  test('1. Size Breakdown Matrix & Challan in Inward Receiving', () => {
    const rcv = PackingService.createReceiving({
      rcvDate: '2026-10-31',
      makerContractor: 'Hall B',
      customerName: 'Northwind Safety Ltd',
      poNumber: '27347',
      articleName: 'Model A9',
      orderQty: 3090,
      rcvdPairs: 942,
      challanNo: 'CH-8821',
      gatePassNo: 'IGP-4091',
      vehicleNo: 'SLK-9902',
      sizes: [
        { sizeCode: '7/S', orderPairs: 300, rcvdPairs: 90 },
        { sizeCode: '8/M', orderPairs: 900, rcvdPairs: 280 },
        { sizeCode: '9/L', orderPairs: 1200, rcvdPairs: 372 },
        { sizeCode: '10/XL', orderPairs: 690, rcvdPairs: 200 }
      ]
    });

    assert.ok(rcv.rcv_number.startsWith('RCV-'));
    assert.equal(rcv.order_qty, 3090);
    assert.equal(rcv.rcvd_pairs, 942);
    assert.equal(rcv.balance_qty, 2148);
    assert.equal(rcv.challan_no, 'CH-8821');
    assert.equal(rcv.gate_pass_no, 'IGP-4091');
    assert.equal(rcv.sizes.length, 4);
    assert.equal(rcv.sizes[0].size_code, '7/S');
    assert.equal(rcv.sizes[0].balance_pairs, 210);
  });

  test('2. Dynamic Customer Packaging BOM Lookup', () => {
    const bom = PackingService.getPackagingBOM('GLV-A9', 910);
    assert.ok(bom.length >= 3, 'Should have Northwind polybag, hangtag, and silica');

    const polybag = bom.find(b => b.materialCode.includes('POLY'));
    assert.ok(polybag, 'Polybag item should be in BOM');
    assert.equal(polybag.requiredQty, 910);
  });

  test('3. Material Return Voucher (MRV) Returns Excess Stock', () => {
    const initialQty = db.prepare(`SELECT available_qty FROM store_materials_inventory WHERE material_code = 'POLYBAG'`).get().available_qty;
    
    const mrv = PackingService.createMaterialReturnVoucher(
      'MREQ-2026-0001',
      'POLYBAG',
      25,
      'EXCESS_UNUSED'
    );

    assert.ok(mrv.mrv_number.startsWith('MRV-'));
    assert.equal(mrv.returned_qty, 25);

    const postQty = db.prepare(`SELECT available_qty FROM store_materials_inventory WHERE material_code = 'POLYBAG'`).get().available_qty;
    assert.equal(postQty, initialQty + 25, 'Store inventory must be incremented by returned qty');
  });

  test('4. Closed Alteration Rework with Tailor Attribution & Step 1 Return', () => {
    // Create requisition and advance to Step 1 defects
    const req = PackingService.createGloveRequisition('CUST-001', 'GLV-A9', 50, 'Gap Test Batch');
    PackingService.issueGloveRequisition(req.req_number);
    PackingService.executeStep1Checking(req.req_number, 40, 10, 'Loose Stitching on Cuff');

    const alts = PackingService.getAlterations(req.req_number);
    assert.ok(alts.length > 0);
    const alt = alts[0];

    // Tailor completes repair
    const result = PackingService.completeAlterationRepair(alt.id, 'Supervisor A');
    assert.equal(result.status, 'REPAIRED_RETURNED');
    assert.equal(result.tailorName, 'Supervisor A');
    assert.equal(result.route, 'RETURNED_TO_STAGE_1_CHECKING');

    const wip = db.prepare(`SELECT * FROM packing_wip WHERE req_number = ?`).get(req.req_number);
    assert.equal(wip.step1_checking_in, 60, '10 repaired pairs returned back to Step 1 Checking (50 original + 10 returned)');
  });

  test('5. Max-2-Rework Rule Auto-Condemns to Scrap with Cost Deduction', () => {
    const req = PackingService.createGloveRequisition('CUST-001', 'GLV-A9', 30, 'Scrap Test');
    PackingService.issueGloveRequisition(req.req_number);
    PackingService.executeStep1Checking(req.req_number, 25, 5, 'Burn Scorch');

    const alts = PackingService.getAlterations(req.req_number);
    const alt = alts[0];

    // First rework attempt
    PackingService.completeAlterationRepair(alt.id, 'Supervisor A');

    // Defects happen again on re-inspection of the 5 returned pairs
    PackingService.executeStep1Checking(req.req_number, 0, 5, 'Persistent Burn Hole');
    const alts2 = PackingService.getAlterations(req.req_number);
    const alt2 = alts2.find(a => a.status === 'SENT_FOR_ALTERATION');

    // Simulate 2nd repair failure -> Scrapped
    const scrapResult = PackingService.completeAlterationRepair(alt2.id, 'Supervisor A', true, 150);
    assert.equal(scrapResult.status, 'CONDEMNED_TO_SCRAP');
    assert.equal(scrapResult.financialDeduction, 5 * 150);

    const scrapRow = db.prepare(`SELECT * FROM scrap_ledger WHERE req_number = ?`).get(req.req_number);
    assert.ok(scrapRow);
    assert.equal(scrapRow.scrapped_pairs, 5);
    assert.equal(scrapRow.financial_deduction_amount, 750);
  });

  test('6. AQL 1.5 Sampling Plan Evaluation & Export Quarantine', () => {
    // Lot of 840 pairs -> Code Letter J -> Sample 80 -> Ac: 3, Re: 4
    const plan = AQLService.getSamplingPlan(840, 1.5);
    assert.equal(plan.codeLetter, 'J');
    assert.equal(plan.sampleSize, 80);
    assert.equal(plan.acceptLimit, 3);
    assert.equal(plan.rejectLimit, 4);

    // 2 defects -> Accept
    const passEval = AQLService.evaluateLot(840, 2, 1.5);
    assert.equal(passEval.verdict, 'AQL_PASSED');
    assert.equal(passEval.isApproved, true);

    // 5 defects -> Quarantine
    const failEval = AQLService.evaluateLot(840, 5, 1.5);
    assert.equal(failEval.verdict, 'QUARANTINED');
    assert.equal(failEval.isApproved, false);
  });

  test('7. Master Carton Manifest Generation for Export', () => {
    const req = PackingService.createGloveRequisition('CUST-001', 'GLV-A9', 100, 'Export Batch');
    PackingService.issueGloveRequisition(req.req_number);
    PackingService.executeStep1Checking(req.req_number, 100, 0);
    PackingService.executeStep2Ironing(req.req_number, 100, 0);
    PackingService.executeStep3Matching(req.req_number, 100, 0);
    const matReq = PackingService.createMaterialRequisition(req.req_number);
    PackingService.issueMaterialRequisition(matReq.mat_req_number);
    PackingService.executeStep4FirstPacking(req.req_number, 100);
    PackingService.executeStep5SecondPacking(req.req_number, 50); // 2 cartons of 50 pairs

    const manifest = PackingService.getMasterCartonManifest(req.req_number);
    assert.equal(manifest.totalCartons, 2);
    assert.equal(manifest.totalPairs, 100);
    assert.equal(manifest.cartons.length, 2);
    assert.equal(manifest.cartons[0].cartonNumber, 'CTN-01');
    assert.equal(manifest.cartons[0].pairsPerCarton, 50);
    assert.ok(manifest.cartons[0].grossWeightKg > 0);
  });
});
