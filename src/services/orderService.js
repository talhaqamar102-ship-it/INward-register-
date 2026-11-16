function setStatus(error, statusCode) {
  error.statusCode = statusCode;
  return error;
}

export function backfillOrderSequence(database) {
  const rows = database.prepare(`SELECT order_id FROM pending_orders`).all();
  const maxByYear = new Map();
  for (const row of rows) {
    const match = /^ORD-(\d{4})-(\d+)$/.exec(String(row.order_id || ''));
    if (!match) continue;
    const year = Number(match[1]);
    const sequence = Number(match[2]);
    if (!Number.isSafeInteger(sequence)) continue;
    maxByYear.set(year, Math.max(maxByYear.get(year) || 0, sequence));
  }

  const insertSequence = database.prepare(`
    INSERT OR IGNORE INTO order_seq (year, last_n) VALUES (?, ?)
  `);
  const advanceSequence = database.prepare(`
    UPDATE order_seq SET last_n = MAX(last_n, ?) WHERE year = ?
  `);
  for (const [year, lastN] of maxByYear) {
    insertSequence.run(year, lastN);
    advanceSequence.run(lastN, year);
  }
}

export function createPendingOrder(database, payload, {
  year = new Date().getFullYear(),
  actor = 'System Operator',
  role = 'SUPER_USER',
  recordAuditLog
} = {}) {
  const buyer = String(payload.buyer || '').trim();
  const maker = String(payload.maker || '').trim();
  const po = String(payload.po || '').trim();
  const article = String(payload.article || '').trim();
  const color = String(payload.color || 'Standard').trim();
  const sizes = payload.sizes || {};
  const size7 = Math.max(0, Number(sizes['7'] || 0));
  const size8 = Math.max(0, Number(sizes['8'] || 0));
  const size9 = Math.max(0, Number(sizes['9'] || 0));
  const size10 = Math.max(0, Number(sizes['10'] || 0));
  const size11 = Math.max(0, Number(sizes['11'] || 0));
  const totalQty = Math.max(0, Number(payload.totalQty ?? (size7 + size8 + size9 + size10 + size11)));

  if (!maker || !article) {
    throw new Error('maker and article are required');
  }
  if (!Number.isInteger(year) || year < 1 || !Number.isSafeInteger(totalQty)) {
    throw new Error('A valid order year and total quantity are required');
  }
  if (typeof recordAuditLog !== 'function') {
    throw new Error('Order creation requires an audit logger');
  }

  database.exec('BEGIN IMMEDIATE');
  try {
    const sequence = database.prepare(`SELECT last_n FROM order_seq WHERE year = ?`).get(year);
    const nextNumber = Number(sequence?.last_n || 0) + 1;
    const orderId = `ORD-${year}-${String(nextNumber).padStart(3, '0')}`;
    if (sequence) {
      database.prepare(`UPDATE order_seq SET last_n = ? WHERE year = ?`).run(nextNumber, year);
    } else {
      database.prepare(`INSERT INTO order_seq (year, last_n) VALUES (?, ?)`).run(year, nextNumber);
    }

    database.prepare(`
      INSERT INTO pending_orders (
        order_id, buyer_name, maker_contractor, po_number, article_name, color_shade,
        size_7, size_8, size_9, size_10, size_11, total_qty, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderId,
      buyer,
      maker,
      po,
      article,
      color,
      size7,
      size8,
      size9,
      size10,
      size11,
      totalQty,
      String(payload.notes || '')
    );

    recordAuditLog({
      actor,
      role,
      action: 'ORDER_CREATE',
      entityId: orderId,
      orderId,
      beforeSummary: 'Order did not exist',
      afterSummary: `Created ${totalQty} Prs for ${maker} / ${article}`
    });

    database.exec('COMMIT');
    return { orderId };
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // Preserve the original transaction error.
    }
    if (error?.errcode === 1555 || error?.errcode === 2067) {
      throw setStatus(new Error('Generated Order Reference already exists; retry the save.'), 409);
    }
    throw error;
  }
}

export function deletePendingOrder(database, orderId, {
  actor = 'System Operator',
  role = 'SUPER_USER',
  recordAuditLog
} = {}) {
  const normalizedOrderId = String(orderId || '').trim();
  if (!normalizedOrderId) throw new Error('orderId is required');
  if (typeof recordAuditLog !== 'function') {
    throw new Error('Order deletion requires an audit logger');
  }

  database.exec('BEGIN IMMEDIATE');
  try {
    const order = database.prepare(`SELECT * FROM pending_orders WHERE order_id = ?`).get(normalizedOrderId);
    if (!order) throw setStatus(new Error(`Pending Order ${normalizedOrderId} not found`), 404);

    const linkedReceiving = database.prepare(`
      SELECT 1 FROM store_receivings WHERE order_id = ? LIMIT 1
    `).get(normalizedOrderId);
    const linkedAllocation = database.prepare(`
      SELECT 1 FROM grn_req_allocations WHERE order_id = ? LIMIT 1
    `).get(normalizedOrderId);
    const linkedRequisition = database.prepare(`
      SELECT 1 FROM glove_requisitions WHERE order_id = ? LIMIT 1
    `).get(normalizedOrderId);
    if (linkedReceiving || linkedAllocation || linkedRequisition) {
      throw new Error(`Cannot delete Order ${normalizedOrderId}: linked production records exist.`);
    }

    database.prepare(`DELETE FROM pending_orders WHERE order_id = ?`).run(normalizedOrderId);
    recordAuditLog({
      actor,
      role,
      action: 'ORDER_DELETE',
      entityId: normalizedOrderId,
      orderId: normalizedOrderId,
      beforeSummary: `Order ${normalizedOrderId} (${order.total_qty} Prs)`,
      afterSummary: 'Deleted before production activity'
    });

    database.exec('COMMIT');
    return { deleted: true, orderId: normalizedOrderId };
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // Preserve the original transaction error.
    }
    throw error;
  }
}
