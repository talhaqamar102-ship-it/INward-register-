import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const dbPath = process.env.MES_DB_PATH
  ? path.resolve(process.env.MES_DB_PATH)
  : path.join(ROOT_DIR, 'data', 'gloves_packing.db');

const idMapPath = path.join(ROOT_DIR, 'src', 'catalog', 'catalog-id-map.json');
const force = process.argv.includes('--force');

const database = new DatabaseSync(dbPath);
try {
  const nonLegacyCount = database
    .prepare(`SELECT COUNT(*) AS cnt FROM pending_orders WHERE COALESCE(size_format, 'LEGACY_7_11') <> 'LEGACY_7_11'`)
    .get().cnt;
  if (nonLegacyCount > 0 && !force) {
    console.error(
      `Forward-fix only: ${nonLegacyCount} non-legacy pending_orders already exist. Pass --force only after taking a backup.`
    );
    process.exit(2);
  }

  const idMap = fs.existsSync(idMapPath)
    ? JSON.parse(fs.readFileSync(idMapPath, 'utf8'))
    : { buyers: {}, products: {} };

  database.exec('BEGIN IMMEDIATE');
  database.exec(`
    DROP TRIGGER IF EXISTS pending_orders_size_fmt_ins;
    DROP TRIGGER IF EXISTS pending_orders_size_fmt_upd;
    DROP TRIGGER IF EXISTS order_contractor_allocations_size_fmt_ins;
    DROP TRIGGER IF EXISTS order_contractor_allocations_size_fmt_upd;
  `);

  const delProd = database.prepare(`
    DELETE FROM products WHERE id = ?
      AND NOT EXISTS (SELECT 1 FROM glove_requisitions WHERE product_id = products.id)
      AND NOT EXISTS (SELECT 1 FROM store_gloves_inventory WHERE product_id = products.id)
  `);
  for (const pid of Object.values(idMap.products || {})) {
    delProd.run(pid);
  }

  const delCust = database.prepare(`
    DELETE FROM customers WHERE id = ?
      AND NOT EXISTS (SELECT 1 FROM products WHERE customer_id = customers.id)
      AND NOT EXISTS (SELECT 1 FROM glove_requisitions WHERE customer_id = customers.id)
      AND NOT EXISTS (SELECT 1 FROM store_gloves_inventory WHERE customer_id = customers.id)
  `);
  for (const cid of Object.values(idMap.buyers || {})) {
    delCust.run(cid);
  }

  database.exec(`DELETE FROM size_standards WHERE code <> 'LEGACY_7_11'`);
  database.exec('COMMIT');
  console.log(`Catalog rollback complete on ${dbPath}`);
} catch (err) {
  try { database.exec('ROLLBACK'); } catch {}
  console.error(err.message);
  process.exit(1);
} finally {
  database.close();
}
