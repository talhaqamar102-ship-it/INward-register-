import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  backfillOrderSequence,
  createPendingOrder,
  createPendingOrderBatch,
  deletePendingOrder
} from '../src/services/orderService.js';

function createTestDatabase() {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE pending_orders (
      order_id TEXT PRIMARY KEY,
      buyer_name TEXT NOT NULL DEFAULT '',
      maker_contractor TEXT NOT NULL,
      po_number TEXT NOT NULL DEFAULT '',
      article_name TEXT NOT NULL,
      color_shade TEXT NOT NULL DEFAULT 'Standard',
      size_7 INTEGER NOT NULL DEFAULT 0,
      size_8 INTEGER NOT NULL DEFAULT 0,
      size_9 INTEGER NOT NULL DEFAULT 0,
      size_10 INTEGER NOT NULL DEFAULT 0,
      size_11 INTEGER NOT NULL DEFAULT 0,
      total_qty INTEGER NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE order_seq (
      year INTEGER PRIMARY KEY,
      last_n INTEGER NOT NULL
    );
    CREATE TABLE store_receivings (order_id TEXT NOT NULL);
    CREATE TABLE grn_req_allocations (order_id TEXT NOT NULL);
    CREATE TABLE glove_requisitions (order_id TEXT NOT NULL);
  `);
  return database;
}

function orderPayload(orderId, maker) {
  return {
    orderId,
    buyer: 'Test Buyer',
    maker,
    po: 'PO-TEST',
    article: 'Test Article',
    color: 'Black',
    sizes: { '7': 2, '8': 3, '9': 4, '10': 3, '11': 2 },
    totalQty: 14,
    notes: 'Created for isolated order integrity test'
  };
}

test('order creation backfills existing IDs, ignores client IDs, and never overwrites an existing order', () => {
  const database = createTestDatabase();
  const currentYear = new Date().getFullYear();
  const existingId = `ORD-${currentYear}-120`;
  database.prepare(`
    INSERT INTO pending_orders (order_id, maker_contractor, article_name, total_qty)
    VALUES (?, 'Original Maker', 'Original Article', 77)
  `).run(existingId);

  backfillOrderSequence(database);
  const auditEvents = [];
  const recordAuditLog = event => auditEvents.push(event);

  const first = createPendingOrder(database, orderPayload(existingId, 'First Maker'), {
    year: currentYear,
    actor: 'Test Operator',
    role: 'SUPER_USER',
    recordAuditLog
  });
  const second = createPendingOrder(database, orderPayload(existingId, 'Second Maker'), {
    year: currentYear,
    actor: 'Test Operator',
    role: 'SUPER_USER',
    recordAuditLog
  });

  assert.equal(first.orderId, `ORD-${currentYear}-121`);
  assert.equal(second.orderId, `ORD-${currentYear}-122`);
  assert.equal(database.prepare('SELECT maker_contractor FROM pending_orders WHERE order_id = ?').get(existingId).maker_contractor, 'Original Maker');
  assert.equal(auditEvents.length, 2);
  assert.equal(auditEvents[0].action, 'ORDER_CREATE');
  assert.equal(auditEvents[0].entityId, first.orderId);
  database.close();
});

test('failed order audit rolls back the insert and sequence increment', () => {
  const database = createTestDatabase();
  const currentYear = new Date().getFullYear();

  assert.throws(() => createPendingOrder(database, orderPayload('', 'Test Maker'), {
    year: currentYear,
    actor: 'Test Operator',
    role: 'SUPER_USER',
    recordAuditLog: () => { throw new Error('audit unavailable'); }
  }), /audit unavailable/);

  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM pending_orders').get().count, 0);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM order_seq').get().count, 0);
  const created = createPendingOrder(database, orderPayload('', 'Test Maker'), {
    year: currentYear,
    actor: 'Test Operator',
    role: 'SUPER_USER',
    recordAuditLog: () => {}
  });
  assert.equal(created.orderId, `ORD-${currentYear}-001`);
  database.close();
});

test('order deletion is blocked when GRN or requisition records reference it', () => {
  const database = createTestDatabase();
  const orderId = 'ORD-2026-001';
  database.prepare(`
    INSERT INTO pending_orders (order_id, maker_contractor, article_name)
    VALUES (?, 'Maker', 'Article')
  `).run(orderId);
  database.prepare('INSERT INTO glove_requisitions (order_id) VALUES (?)').run(orderId);

  assert.throws(() => deletePendingOrder(database, orderId, {
    actor: 'Test Operator',
    role: 'SUPER_USER',
    recordAuditLog: () => {}
  }), /linked production records/);
  assert.ok(database.prepare('SELECT 1 FROM pending_orders WHERE order_id = ?').get(orderId));
  database.close();
});

test('multi-article order batch creates atomic -1..-3 sub-orders sharing one sequence increment and rolls back on failure', () => {
  const database = createTestDatabase();
  const audits = [];
  const res = createPendingOrderBatch(database, {
    buyer: 'OXFORD',
    po: 'PO-MULTI-10',
    dueDate: '2026-12-01',
    maker: 'Hall A',
    items: [
      { article: 'BRISBANE AIR', color: 'Black', sizes: { '7': 40, '8': 0, '9': 0, '10': 0, '11': 0 } },
      { article: 'AERO TEC', color: 'White', maker: 'Hall B', sizes: { '7': 0, '8': 60, '9': 0, '10': 0, '11': 0 } },
      { article: 'TRACKER PRO', color: 'Red', sizes: { '7': 0, '8': 0, '9': 30, '10': 0, '11': 0 } }
    ]
  }, {
    year: 2026,
    actor: 'Super User',
    role: 'SUPER_USER',
    recordAuditLog: (entry) => audits.push(entry)
  });

  assert.equal(res.baseOrderId, 'ORD-2026-001');
  assert.deepEqual(res.orderIds, ['ORD-2026-001-1', 'ORD-2026-001-2', 'ORD-2026-001-3']);
  assert.equal(audits.length, 3);
  const rows = database.prepare('SELECT order_id, maker_contractor, article_name, total_qty FROM pending_orders ORDER BY order_id ASC').all();
  assert.deepEqual(rows.map(r => r.order_id), ['ORD-2026-001-1', 'ORD-2026-001-2', 'ORD-2026-001-3']);
  assert.equal(rows[0].maker_contractor, 'Hall A');
  assert.equal(rows[1].maker_contractor, 'Hall B');
  assert.equal(rows[2].maker_contractor, 'Hall A');

  // Verify backfillOrderSequence handles -1..-3 sub-order suffixes before next sequence allocation
  database.prepare('DELETE FROM order_seq WHERE year = 2026').run();
  backfillOrderSequence(database);
  const seqAfterBackfill = database.prepare('SELECT last_n FROM order_seq WHERE year = 2026').get();
  assert.equal(seqAfterBackfill.last_n, 1);

  // Mid-batch failure rolls back both sub-orders and sequence increment
  assert.throws(() => createPendingOrderBatch(database, {
    buyer: 'OXFORD',
    po: 'PO-FAIL-11',
    maker: 'Hall A',
    items: [
      { article: 'Art 1', sizes: { '7': 10, '8': 0, '9': 0, '10': 0, '11': 0 } },
      { article: 'Art 2', sizes: { '7': 20, '8': 0, '9': 0, '10': 0, '11': 0 } }
    ]
  }, {
    year: 2026,
    actor: 'Super User',
    role: 'SUPER_USER',
    recordAuditLog: (entry) => {
      if (entry.entityId.endsWith('-2')) throw new Error('Simulated audit failure');
    }
  }), /Simulated audit failure/);

  const countAfterRollback = database.prepare('SELECT COUNT(*) AS cnt FROM pending_orders').get().cnt;
  assert.equal(countAfterRollback, 3);
  const seqAfterRollback = database.prepare('SELECT last_n FROM order_seq WHERE year = 2026').get();
  assert.equal(seqAfterRollback.last_n, 1);
  database.close();
});

