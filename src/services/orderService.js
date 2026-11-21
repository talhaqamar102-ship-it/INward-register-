function setStatus(error, statusCode) {
  error.statusCode = statusCode;
  return error;
}

export function backfillOrderSequence(database) {
  const rows = database.prepare(`SELECT order_id FROM pending_orders`).all();
  const maxByYear = new Map();
  for (const row of rows) {
    const match = /^ORD-(\d{4})-(\d+)(?:-\d+)?$/.exec(String(row.order_id || ''));
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
  const allocCols = allocTable
    ? database.prepare(`PRAGMA table_info(order_contractor_allocations)`).all().map(c => c.name)
    : [];
  const sizeStdTable = database.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='size_standards'`
  ).get();
  const prodTable = database.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='products'`
  ).get();
  return {
    hasDueDateCol: orderCols.includes('due_date'),
    hasSizeFormatCol: orderCols.includes('size_format') && orderCols.includes('sizes_json'),
    hasIdsCol: orderCols.includes('customer_id') && orderCols.includes('product_id'),
    hasAllocTable: Boolean(allocTable),
    hasAllocSizeFormatCol: allocCols.includes('size_format') && allocCols.includes('sizes_json'),
    hasSizeStandardsTable: Boolean(sizeStdTable),
    hasProductsTable: Boolean(prodTable)
  };
}

function resolveScaleCodes(database, schema, { requestedFormat, productId }) {
  let effectiveFormat = String(requestedFormat || '').trim();
  if (!effectiveFormat && productId && schema.hasProductsTable) {
    const prod = database.prepare(`SELECT size_format FROM products WHERE id = ?`).get(productId);
    if (prod?.size_format) effectiveFormat = String(prod.size_format).trim();
  }
  if (!effectiveFormat) effectiveFormat = 'LEGACY_7_11';

  if (effectiveFormat !== 'LEGACY_7_11' && !schema.hasSizeFormatCol) {
    throw new Error(`Database schema does not support dynamic size_format "${effectiveFormat}".`);
  }

  if (schema.hasSizeStandardsTable) {
    const std = database.prepare(`SELECT code, sizes_json FROM size_standards WHERE code = ?`).get(effectiveFormat);
    if (std) {
      return { sizeFormat: std.code, scaleCodes: JSON.parse(std.sizes_json) };
    }
    if (effectiveFormat === 'LEGACY_7_11') {
      return { sizeFormat: 'LEGACY_7_11', scaleCodes: ['7', '8', '9', '10', '11'] };
    }
    throw new Error(`Unsupported size format "${effectiveFormat}".`);
  }

  if (effectiveFormat === 'LEGACY_7_11') {
    return { sizeFormat: 'LEGACY_7_11', scaleCodes: ['7', '8', '9', '10', '11'] };
  }
  throw new Error(`Unsupported size format "${effectiveFormat}".`);
}

function parseScaleSizes(rawSizes, scaleCodes, labelPrefix = 'Order') {
  const normalized = {};
  let sum = 0;
  for (const code of scaleCodes) {
    const num = Number(rawSizes?.[code] ?? 0);
    if (!Number.isSafeInteger(num) || num < 0) {
      throw new Error(`${labelPrefix} size ${code} quantity must be a whole number >= 0.`);
    }
    normalized[code] = num;
    sum += num;
  }
  return { normalized, sum };
}

function normalizePendingOrderPayload(database, schema, payload) {
  const customerId = String(payload.customerId || payload.customer_id || '').trim();
  const productId = String(payload.productId || payload.product_id || '').trim();
  const buyer = String(payload.buyer || '').trim();
  const po = String(payload.po || '').trim();
  const article = String(payload.article || '').trim();
  const color = String(payload.color || 'Standard').trim();
  const { sizeFormat, scaleCodes } = resolveScaleCodes(database, schema, {
    requestedFormat: payload.sizeFormat || payload.size_format,
    productId
  });
  const isLegacy = sizeFormat === 'LEGACY_7_11';

  const sizes = payload.sizes || {};
  const parsedOrder = parseScaleSizes(sizes, scaleCodes, 'Order');
  const size7 = isLegacy ? Number(parsedOrder.normalized['7'] || 0) : 0;
  const size8 = isLegacy ? Number(parsedOrder.normalized['8'] || 0) : 0;
  const size9 = isLegacy ? Number(parsedOrder.normalized['9'] || 0) : 0;
  const size10 = isLegacy ? Number(parsedOrder.normalized['10'] || 0) : 0;
  const size11 = isLegacy ? Number(parsedOrder.normalized['11'] || 0) : 0;
  const totalQty = isLegacy
    ? Math.max(0, Number(payload.totalQty ?? parsedOrder.sum))
    : parsedOrder.sum;
  const orderSizesJson = isLegacy ? '{}' : JSON.stringify(parsedOrder.normalized);
  const rawDueDate = String(payload.dueDate || payload.due_date || '').trim();

  let normalizedAllocations = [];
  if (Array.isArray(payload.allocations) && payload.allocations.length > 0) {
    const seenMakers = new Set();
    const sumSizes = Object.fromEntries(scaleCodes.map(c => [c, 0]));
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
      const parsedAlloc = parseScaleSizes(rawAlloc?.sizes || {}, scaleCodes, `Contractor "${allocMaker}"`);
      if (totalQty > 0 && parsedAlloc.sum <= 0) {
        throw new Error(`Contractor "${allocMaker}" must be assigned at least 1 pair.`);
      }
      for (const code of scaleCodes) {
        sumSizes[code] += parsedAlloc.normalized[code];
      }
      normalizedAllocations.push({
        maker: allocMaker,
        sizesMap: parsedAlloc.normalized,
        sizesJson: isLegacy ? '{}' : JSON.stringify(parsedAlloc.normalized),
        s7: isLegacy ? Number(parsedAlloc.normalized['7'] || 0) : 0,
        s8: isLegacy ? Number(parsedAlloc.normalized['8'] || 0) : 0,
        s9: isLegacy ? Number(parsedAlloc.normalized['9'] || 0) : 0,
        s10: isLegacy ? Number(parsedAlloc.normalized['10'] || 0) : 0,
        s11: isLegacy ? Number(parsedAlloc.normalized['11'] || 0) : 0,
        total: parsedAlloc.sum,
        dueDate: String(rawAlloc?.dueDate || rawAlloc?.due_date || rawDueDate || '').trim()
      });
    }
    if (scaleCodes.some(code => sumSizes[code] !== parsedOrder.normalized[code])) {
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
      sizesMap: parsedOrder.normalized,
      sizesJson: orderSizesJson,
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
  if (!Number.isSafeInteger(totalQty)) {
    throw new Error('A valid total quantity is required');
  }

  return {
    customerId,
    productId,
    buyer,
    maker,
    po,
    article,
    color,
    sizeFormat,
    orderSizesJson,
    size7,
    size8,
    size9,
    size10,
    size11,
    totalQty,
    dueDate,
    notes: String(payload.notes || ''),
    normalizedAllocations
  };
}

function insertNormalizedOrderRow(database, schema, orderId, norm, { actor, role, recordAuditLog, parentOrderId = '' }) {
  if (schema.hasSizeFormatCol && schema.hasIdsCol && schema.hasDueDateCol) {
    database.prepare(`
      INSERT INTO pending_orders (
        order_id, customer_id, buyer_name, maker_contractor, po_number, product_id,
        article_name, color_shade, size_format, sizes_json,
        size_7, size_8, size_9, size_10, size_11, total_qty, due_date, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderId,
      norm.customerId,
      norm.buyer,
      norm.maker,
      norm.po,
      norm.productId,
      norm.article,
      norm.color,
      norm.sizeFormat,
      norm.orderSizesJson,
      norm.size7,
      norm.size8,
      norm.size9,
      norm.size10,
      norm.size11,
      norm.totalQty,
      norm.dueDate,
      norm.notes
    );
  } else if (schema.hasDueDateCol) {
    database.prepare(`
      INSERT INTO pending_orders (
        order_id, buyer_name, maker_contractor, po_number, article_name, color_shade,
        size_7, size_8, size_9, size_10, size_11, total_qty, due_date, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderId,
      norm.buyer,
      norm.maker,
      norm.po,
      norm.article,
      norm.color,
      norm.size7,
      norm.size8,
      norm.size9,
      norm.size10,
      norm.size11,
      norm.totalQty,
      norm.dueDate,
      norm.notes
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
      norm.buyer,
      norm.maker,
      norm.po,
      norm.article,
      norm.color,
      norm.size7,
      norm.size8,
      norm.size9,
      norm.size10,
      norm.size11,
      norm.totalQty,
      norm.notes
    );
  }

  if (schema.hasAllocTable) {
    if (schema.hasAllocSizeFormatCol) {
      const insertAlloc = database.prepare(`
        INSERT INTO order_contractor_allocations (
          order_id, maker_contractor, size_format, sizes_json,
          size_7, size_8, size_9, size_10, size_11, total_qty, due_date
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const a of norm.normalizedAllocations) {
        insertAlloc.run(
          orderId,
          a.maker,
          norm.sizeFormat,
          a.sizesJson,
          a.s7,
          a.s8,
          a.s9,
          a.s10,
          a.s11,
          a.total,
          a.dueDate
        );
      }
    } else {
      const insertAlloc = database.prepare(`
        INSERT INTO order_contractor_allocations (
          order_id, maker_contractor, size_7, size_8, size_9, size_10, size_11, total_qty, due_date
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const a of norm.normalizedAllocations) {
        insertAlloc.run(orderId, a.maker, a.s7, a.s8, a.s9, a.s10, a.s11, a.total, a.dueDate);
      }
    }
  }

  recordAuditLog({
    actor,
    role,
    action: 'ORDER_CREATE',
    entityId: orderId,
    orderId,
    beforeSummary: 'Order did not exist',
    afterSummary: `Created ${norm.totalQty} Prs for ${norm.maker} / ${norm.article}${parentOrderId ? ` (Parent ${parentOrderId})` : ''}`
  });
}

export function createPendingOrder(database, payload, {
  year = new Date().getFullYear(),
  actor = 'System Operator',
  role = 'SUPER_USER',
  recordAuditLog
} = {}) {
  const schema = getOrderSchemaSupport(database);
  const norm = normalizePendingOrderPayload(database, schema, payload || {});
  if (!Number.isInteger(year) || year < 1) {
    throw new Error('A valid order year is required');
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

    insertNormalizedOrderRow(database, schema, orderId, norm, { actor, role, recordAuditLog });

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

export function createPendingOrderBatch(database, payload, {
  year = new Date().getFullYear(),
  actor = 'System Operator',
  role = 'SUPER_USER',
  recordAuditLog
} = {}) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (items.length === 0) {
    throw setStatus(new Error('Select at least one article to create an order.'), 400);
  }

  const mergeSharedDefaults = (item) => ({
    ...item,
    customerId: item?.customerId ?? item?.customer_id ?? payload?.customerId ?? payload?.customer_id,
    buyer: item?.buyer ?? payload?.buyer,
    po: item?.po ?? payload?.po,
    dueDate: item?.dueDate || item?.due_date || payload?.dueDate || payload?.due_date || '',
    maker: (Array.isArray(item?.allocations) && item.allocations.length > 0)
      ? item.maker
      : (String(item?.maker || '').trim() || String(payload?.maker || '').trim())
  });

  if (items.length === 1) {
    const { orderId } = createPendingOrder(database, mergeSharedDefaults(items[0]), { year, actor, role, recordAuditLog });
    return { baseOrderId: orderId, orderId, orderIds: [orderId] };
  }

  if (!Number.isInteger(year) || year < 1) {
    throw new Error('A valid order year is required');
  }
  if (typeof recordAuditLog !== 'function') {
    throw new Error('Order creation requires an audit logger');
  }

  const schema = getOrderSchemaSupport(database);
  const normalizedItems = items.map((rawItem, idx) => {
    try {
      return normalizePendingOrderPayload(database, schema, mergeSharedDefaults(rawItem));
    } catch (err) {
      const prefix = rawItem?.article ? `Sub-order ${idx + 1} (${rawItem.article})` : `Sub-order ${idx + 1}`;
      throw setStatus(new Error(`${prefix}: ${err.message}`), err.statusCode || 400);
    }
  });

  database.exec('BEGIN IMMEDIATE');
  try {
    const sequence = database.prepare(`SELECT last_n FROM order_seq WHERE year = ?`).get(year);
    const nextNumber = Number(sequence?.last_n || 0) + 1;
    const baseOrderId = `ORD-${year}-${String(nextNumber).padStart(3, '0')}`;
    if (sequence) {
      database.prepare(`UPDATE order_seq SET last_n = ? WHERE year = ?`).run(nextNumber, year);
    } else {
      database.prepare(`INSERT INTO order_seq (year, last_n) VALUES (?, ?)`).run(year, nextNumber);
    }

    const orderIds = [];
    for (let i = 0; i < normalizedItems.length; i += 1) {
      const subOrderId = `${baseOrderId}-${i + 1}`;
      insertNormalizedOrderRow(database, schema, subOrderId, normalizedItems[i], {
        actor,
        role,
        recordAuditLog,
        parentOrderId: baseOrderId
      });
      orderIds.push(subOrderId);
    }

    database.exec('COMMIT');
    return { baseOrderId, orderId: orderIds[0], orderIds };
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
    const order = database.prepare(`SELECT * FROM active_orders WHERE order_id = ?`).get(normalizedOrderId);
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
