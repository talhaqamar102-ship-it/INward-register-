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

function getOrderSchemaSupport(database) {
  const orderCols = database.prepare(`PRAGMA table_info(pending_orders)`).all().map(c => c.name);
  const allocTable = database.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='order_contractor_allocations'`
  ).get();
  return {
    hasDueDateCol: orderCols.includes('due_date'),
    hasAllocTable: Boolean(allocTable)
  };
}

export function createPendingOrder(database, payload, {
  year = new Date().getFullYear(),
  actor = 'System Operator',
  role = 'SUPER_USER',
  recordAuditLog
} = {}) {
  const buyer = String(payload.buyer || '').trim();
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
  const rawDueDate = String(payload.dueDate || payload.due_date || '').trim();

  let normalizedAllocations = [];
  if (Array.isArray(payload.allocations) && payload.allocations.length > 0) {
    const seenMakers = new Set();
    const sumSizes = { '7': 0, '8': 0, '9': 0, '10': 0, '11': 0 };
    for (const rawAlloc of payload.allocations) {
      const allocMaker = String(rawAlloc?.maker || rawAlloc?.makerContractor || '').trim();
      if (!allocMaker) {
        throw new Error('Every contractor split row must have a Contractor / Maker selected.');
      }
      const makerKey = allocMaker.toLowerCase();
      if (seenMakers.has(makerKey)) {
        throw new Error(`Duplicate contractor "${allocMaker}" in order split allocations.`);
      }
      seenMakers.add(makerKey);
      const aSizes = rawAlloc?.sizes || {};
      const a7 = Math.max(0, Number(aSizes['7'] || 0));
      const a8 = Math.max(0, Number(aSizes['8'] || 0));
      const a9 = Math.max(0, Number(aSizes['9'] || 0));
      const a10 = Math.max(0, Number(aSizes['10'] || 0));
      const a11 = Math.max(0, Number(aSizes['11'] || 0));
      const aTotal = a7 + a8 + a9 + a10 + a11;
      if (totalQty > 0 && aTotal <= 0) {
        throw new Error(`Contractor "${allocMaker}" must be assigned at least 1 pair.`);
      }
      sumSizes['7'] += a7;
      sumSizes['8'] += a8;
      sumSizes['9'] += a9;
      sumSizes['10'] += a10;
      sumSizes['11'] += a11;
      normalizedAllocations.push({
        maker: allocMaker,
        s7: a7,
        s8: a8,
        s9: a9,
        s10: a10,
        s11: a11,
        total: aTotal,
        dueDate: String(rawAlloc?.dueDate || rawAlloc?.due_date || rawDueDate || '').trim()
      });
    }
    if (
      sumSizes['7'] !== size7 ||
      sumSizes['8'] !== size8 ||
      sumSizes['9'] !== size9 ||
      sumSizes['10'] !== size10 ||
      sumSizes['11'] !== size11
    ) {
      throw new Error('Contractor size splits must add up exactly to the order size breakdown.');
    }
  }

  const maker = normalizedAllocations.length > 0
    ? normalizedAllocations.map(a => a.maker).join(', ')
    : String(payload.maker || '').trim();
  const latestAllocDue = normalizedAllocations
    .map(a => a.dueDate)
    .filter(Boolean)
    .sort()
    .pop() || '';
  const dueDate = rawDueDate || latestAllocDue;

  if (normalizedAllocations.length === 0) {
    normalizedAllocations = [{
      maker,
      s7: size7,
      s8: size8,
      s9: size9,
      s10: size10,
      s11: size11,
      total: totalQty,
      dueDate
    }];
  }

  if (!maker || !article) {
    throw new Error('maker and article are required');
  }
  if (!Number.isInteger(year) || year < 1 || !Number.isSafeInteger(totalQty)) {
    throw new Error('A valid order year and total quantity are required');
  }
  if (typeof recordAuditLog !== 'function') {
    throw new Error('Order creation requires an audit logger');
  }

  const schema = getOrderSchemaSupport(database);

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

    if (schema.hasDueDateCol) {
      database.prepare(`
        INSERT INTO pending_orders (
          order_id, buyer_name, maker_contractor, po_number, article_name, color_shade,
          size_7, size_8, size_9, size_10, size_11, total_qty, due_date, notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        dueDate,
        String(payload.notes || '')
      );
    } else {
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
    }

    if (schema.hasAllocTable) {
      const insertAlloc = database.prepare(`
        INSERT INTO order_contractor_allocations (
          order_id, maker_contractor, size_7, size_8, size_9, size_10, size_11, total_qty, due_date
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const a of normalizedAllocations) {
        insertAlloc.run(orderId, a.maker, a.s7, a.s8, a.s9, a.s10, a.s11, a.total, a.dueDate);
      }
    }

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

  const schema = getOrderSchemaSupport(database);

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

    if (schema.hasAllocTable) {
      database.prepare(`DELETE FROM order_contractor_allocations WHERE order_id = ?`).run(normalizedOrderId);
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
