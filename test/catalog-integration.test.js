import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-s1-'));
process.env.MES_DB_PATH = path.join(tmpDir, 'catalog-s1.sqlite');

const { db, initDatabase } = await import('../src/db.js');
const { createPendingOrder } = await import('../src/services/orderService.js');
const { PackingService } = await import('../src/services/packingService.js');
const { buildPersistedCatalog } = await import('../scripts/build-catalog-seed.mjs');

const SEED_PATH = path.resolve('src/catalog/catalog-seed.json');
const ID_MAP_PATH = path.resolve('src/catalog/catalog-id-map.json');
const XLSX_PATH =
  'C:\\Users\\Hammad Ind\\.gemini\\antigravity\\brain\\f72f3018-e25f-41b3-b8ad-37f348815caa\\.user_uploaded\\media_1794898073264_d7b18ff6.xlsx';

describe('Slice 1: Catalog Seed, Non-Mirror Triggers & Multi-Scale Backend', () => {
  before(() => {
    initDatabase();
  });

  after(() => {
    try { db.close(); } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('1. Seed counts match workbook reconciliation (716 - 1 R7 - 0 dups = 715) and importer aborts exitCode=2 on unmapped key diff', () => {
    const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
    assert.equal(seed.customers.length, 33);
    assert.equal(seed.products.length, 715);
    assert.equal(seed.sizeStandards.length, 11);
    assert.equal(seed.meta.excludedPlaceholders, 1);
    assert.equal(seed.meta.rawDups, 0);
    assert.equal(seed.meta.normDups, 0);

    // Simulate a typo/rename in stored map without registering it in catalog-renames.json
    const tmpMapPath = path.join(tmpDir, 'tmp-id-map.json');
    const tmpRenamesPath = path.join(tmpDir, 'tmp-renames.json');
    const tmpSeedPath = path.join(tmpDir, 'tmp-seed.json');
    const tmpDiffPath = path.join(tmpDir, 'tmp-diff.json');

    const mapCopy = JSON.parse(fs.readFileSync(ID_MAP_PATH, 'utf8'));
    const origKey = 'ALPINE STAR\x1fTECH-1 K-104';
    const expectedId = mapCopy.products[origKey];
    assert.ok(expectedId, 'Expected ALPINE STAR TECH-1 K-104 in persisted ID map');
    delete mapCopy.products[origKey];
    const typoOldKey = 'ALPINE STAR\x1fTECH-1 K-104 TYP0';
    mapCopy.products[typoOldKey] = expectedId;

    fs.writeFileSync(tmpMapPath, JSON.stringify(mapCopy, null, 2));
    fs.writeFileSync(tmpRenamesPath, JSON.stringify({ buyers: {}, products: {} }, null, 2));

    let caught = null;
    try {
      buildPersistedCatalog({
        xlsxPath: XLSX_PATH,
        idMapPath: tmpMapPath,
        renamesPath: tmpRenamesPath,
        seedOutPath: tmpSeedPath,
        diffOutPath: tmpDiffPath
      });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, 'Expected key-diff error');
    assert.equal(caught.exitCode, 2);
    const diff = JSON.parse(fs.readFileSync(tmpDiffPath, 'utf8'));
    assert.ok(diff.addedProducts.includes(origKey));
    assert.ok(diff.removedProducts.includes(typoOldKey));

    // Register rename in catalog-renames.json -> reuses exact persisted CAT-* ID
    fs.writeFileSync(
      tmpRenamesPath,
      JSON.stringify({ buyers: {}, products: { [origKey]: typoOldKey } }, null, 2)
    );
    const rebuilt = buildPersistedCatalog({
      xlsxPath: XLSX_PATH,
      idMapPath: tmpMapPath,
      renamesPath: tmpRenamesPath,
      seedOutPath: tmpSeedPath,
      diffOutPath: tmpDiffPath
    });
    const matched = rebuilt.products.find(p => p.customerName === 'ALPINE STAR' && p.name === 'TECH-1 K-104');
    assert.equal(matched?.id, expectedId);
  });

  test('2. initDatabase seeds idempotently (38 buyers, 731 products, 11 size_standards) and triggers reject mirror/drift violations', () => {
    initDatabase(); // second call must stay identical
    const custCnt = db.prepare('SELECT COUNT(*) AS c FROM customers').get().c;
    const prodCnt = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
    const stdCnt = db.prepare('SELECT COUNT(*) AS c FROM size_standards').get().c;

    assert.equal(custCnt, 38);
    assert.equal(prodCnt, 731);
    assert.equal(stdCnt, 11);

    // Trigger enforcement: LEGACY_7_11 must keep sizes_json='{}'
    assert.throws(() => {
      db.prepare(`
        INSERT INTO pending_orders (order_id, maker_contractor, article_name, size_7, total_qty, size_format, sizes_json)
        VALUES ('BAD-TRIG-1', 'Hall A', 'Model A1', 10, 10, 'LEGACY_7_11', '{"7":10}')
      `).run();
    }, /size_format invariant violated/);

    // Trigger enforcement: non-legacy must keep size_6..size_12 at 0
    assert.throws(() => {
      db.prepare(`
        INSERT INTO pending_orders (order_id, maker_contractor, article_name, size_7, total_qty, size_format, sizes_json)
        VALUES ('BAD-TRIG-2', 'Hall A', 'TECH-1 K-104', 5, 10, 'GENRAL', '{"XS":10}')
      `).run();
    }, /size_format invariant violated/);

    // Trigger enforcement: non-legacy SUM(sizes_json) must equal total_qty
    assert.throws(() => {
      db.prepare(`
        INSERT INTO pending_orders (order_id, maker_contractor, article_name, total_qty, size_format, sizes_json)
        VALUES ('BAD-TRIG-3', 'Hall A', 'TECH-1 K-104', 20, 'GENRAL', '{"XS":10}')
      `).run();
    }, /size_format invariant violated/);
  });

  test('3. Multi-scale pending order + contractor split stores exact workbook sizes (no mirror) and blocks mismatched splits', () => {
    const oxford = db.prepare(`SELECT id, name FROM customers WHERE name = 'OXFORD'`).get();
    const article = db.prepare(`SELECT * FROM products WHERE customer_id = ? LIMIT 1`).get(oxford.id);
    assert.ok(oxford && article);
    assert.equal(article.size_format, 'GENRAL');

    const { orderId } = createPendingOrder(db, {
      customerId: oxford.id,
      buyer: oxford.name,
      productId: article.id,
      article: article.name,
      color: article.color_spec || article.raw_color || 'Black',
      sizeFormat: 'GENRAL',
      po: 'PO-OX-980',
      sizes: { XS: 60, S: 120, M: 240, L: 300, XL: 180, '2XL': 80, '3XL': 0, '4XL': 0, '5XL': 0 },
      allocations: [
        { maker: 'Hall A', sizes: { XS: 40, S: 60, M: 140, L: 200, XL: 100, '2XL': 40, '3XL': 0, '4XL': 0, '5XL': 0 } },
        { maker: 'Hall B', sizes: { XS: 20, S: 60, M: 100, L: 100, XL: 80, '2XL': 40, '3XL': 0, '4XL': 0, '5XL': 0 } }
      ]
    }, { recordAuditLog: () => {} });

    const rawRow = db.prepare('SELECT * FROM pending_orders WHERE order_id = ?').get(orderId);
    assert.equal(rawRow.size_format, 'GENRAL');
    assert.equal(rawRow.size_7, 0);
    assert.equal(rawRow.total_qty, 980);
    assert.equal(JSON.parse(rawRow.sizes_json).L, 300);

    const fetched = PackingService.getPendingOrders().find(o => o.orderId === orderId);
    assert.equal(fetched?.sizeFormat, 'GENRAL');
    assert.deepEqual(fetched?.sizes, { XS: 60, S: 120, M: 240, L: 300, XL: 180, '2XL': 80, '3XL': 0, '4XL': 0, '5XL': 0 });
    assert.equal(fetched?.contractorAllocations?.length, 2);
    assert.equal(fetched?.contractorAllocations?.[0].sizes.XS, 40);

    assert.throws(() => createPendingOrder(db, {
      customerId: oxford.id,
      buyer: oxford.name,
      productId: article.id,
      article: article.name,
      sizeFormat: 'GENRAL',
      sizes: { XS: 10, S: 0, M: 0, L: 0, XL: 0, '2XL': 0, '3XL': 0, '4XL': 0, '5XL': 0 },
      allocations: [{ maker: 'Hall A', sizes: { XS: 9 } }]
    }, { recordAuditLog: () => {} }), /Contractor size splits/);
  });

  test('4. Non-legacy GRN + Requisition preserve XS..5XL sizes cleanly and distinct BERIK G-235106-BK SKUs never collide', () => {
    const oxford = db.prepare(`SELECT id, name FROM customers WHERE name = 'OXFORD'`).get();
    const article = db.prepare(`SELECT * FROM products WHERE customer_id = ? LIMIT 1`).get(oxford.id);
    const { orderId } = createPendingOrder(db, {
      customerId: oxford.id,
      buyer: oxford.name,
      productId: article.id,
      article: article.name,
      color: article.color_spec || 'Black',
      sizeFormat: 'GENRAL',
      maker: 'Hall A',
      po: 'PO-OX-REQ',
      sizes: { XS: 60, S: 40, M: 0, L: 0, XL: 0, '2XL': 0, '3XL': 0, '4XL': 0, '5XL': 0 }
    }, { recordAuditLog: () => {} });

    const rcv = PackingService.createReceiving({
      orderId,
      makerContractor: 'Hall A',
      receivedFrom: 'Driver Ali',
      orderQty: 100,
      rcvdPairs: 100,
      sizes: [
        { sizeCode: 'XS', orderPairs: 60, rcvdPairs: 60 },
        { sizeCode: 'S', orderPairs: 40, rcvdPairs: 40 }
      ]
    });
    assert.equal(rcv.rcvd_pairs, 100);

    const req = PackingService.createOrderRequisition(orderId, {
      XS: 20, S: 15, M: 0, L: 0, XL: 0, '2XL': 0, '3XL': 0, '4XL': 0, '5XL': 0
    });
    assert.equal(req.sizes.XS, 20);
    assert.equal(req.sizes.S, 15);
    assert.equal(PackingService.getRequisition(req.reqNumber).sizes.XS, 20);

    const orderSummary = PackingService.getOrderStockSummary(
      db.prepare('SELECT * FROM pending_orders WHERE order_id = ?').get(orderId)
    );
    assert.equal(orderSummary.remainingOrderSizes.XS, 40);
    assert.equal(orderSummary.remainingOrderSizes.S, 25);

    // Distinct BERIK G-235106-BK SKUs with shared prefix must map to separate inventory rows
    const berik = db.prepare(`SELECT id, name FROM customers WHERE name = 'BERIK'`).get();
    const berikRows = db.prepare(`SELECT * FROM products WHERE customer_id = ? AND name LIKE 'G-235106-BK%'`).all(berik.id);
    assert.ok(berikRows.length >= 2);
    PackingService.createReceiving({
      customerId: berik.id,
      customerName: berik.name,
      productId: berikRows[0].id,
      articleName: berikRows[0].name,
      makerContractor: 'Hall B',
      receivedFrom: 'Driver A',
      orderQty: 10,
      rcvdPairs: 10
    });
    PackingService.createReceiving({
      customerId: berik.id,
      customerName: berik.name,
      productId: berikRows[1].id,
      articleName: berikRows[1].name,
      makerContractor: 'Hall B',
      receivedFrom: 'Driver B',
      orderQty: 12,
      rcvdPairs: 12
    });
    const inv1 = db.prepare('SELECT available_pairs FROM store_gloves_inventory WHERE product_id = ?').get(berikRows[0].id);
    const inv2 = db.prepare('SELECT available_pairs FROM store_gloves_inventory WHERE product_id = ?').get(berikRows[1].id);
    assert.equal(inv1.available_pairs, 10);
    assert.equal(inv2.available_pairs, 12);
  });
});
