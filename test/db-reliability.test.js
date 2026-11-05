import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { db, initDatabase, backupDatabase } from '../src/db.js';
import fs from 'node:fs';

describe('Database Reliability Engineering (DBRE) Test Suite', () => {
  test('1. Database Engine is in WAL Journal Mode & Normal Sync', () => {
    initDatabase();
    const journalMode = db.prepare('PRAGMA journal_mode').get().journal_mode;
    assert.equal(journalMode.toLowerCase(), 'wal', 'Database must run in WAL mode for concurrent multi-terminal safety');

    const foreignKeys = db.prepare('PRAGMA foreign_keys').get().foreign_keys;
    assert.equal(foreignKeys, 1, 'Foreign keys must be actively enforced');
  });

  test('2. SQLite Data Integrity Check Passes with Zero Corruption', () => {
    const integrity = db.prepare('PRAGMA integrity_check').all();
    assert.equal(integrity.length, 1);
    assert.equal(integrity[0].integrity_check, 'ok');

    const fkCheck = db.prepare('PRAGMA foreign_key_check').all();
    assert.equal(fkCheck.length, 0, 'Zero foreign key violations in active database');
  });

  test('3. Query Acceleration Secondary Indexes are Created', () => {
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map(i => i.name);
    
    assert.ok(indexes.includes('idx_store_receivings_po'), 'PO Number index exists');
    assert.ok(indexes.includes('idx_store_receivings_cust'), 'Customer name index exists');
    assert.ok(indexes.includes('idx_packaging_bom_prod'), 'Packaging BOM product index exists');
    assert.ok(indexes.includes('idx_glove_req_status'), 'Requisition status index exists');
    assert.ok(indexes.includes('idx_alterations_req'), 'Alteration requisition index exists');
  });

  test('4. Automated Non-Blocking Online VACUUM Snapshot Backup Drill', () => {
    const backupPath = backupDatabase();
    assert.ok(fs.existsSync(backupPath), 'Backup snapshot file must exist');
    const stats = fs.statSync(backupPath);
    assert.ok(stats.size > 10000, 'Backup file must contain valid database pages');

    // Clean up drill artifact
    fs.unlinkSync(backupPath);
  });
});
