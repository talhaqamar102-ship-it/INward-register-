import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mes-orch-test-'));
process.env.MES_DB_PATH = path.join(tmpDir, 'test.sqlite');
process.env.AUDIT_HMAC_KEY = 'test-hmac-key-32-bytes-minimum-1234';
process.env.ORCH_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
process.env.ORCH_ANCHOR_FILE = path.join(tmpDir, 'anchor.log');
process.env.ORCH_ALERTS_LOG = path.join(tmpDir, 'alerts.log');
process.env.ORCH_BACKUP_CODES_FILE = path.join(tmpDir, 'backup-codes.json');

const { db, initDatabase, getReadOnlyDb } = await import('../src/db.js');
const {
  OrchestratorService,
  hashSecret,
  verifySecretHash,
  generateTotpCode,
  verifyTotp,
  appendSealedAudit,
  verifyAuditChain,
  computeBackoffDelayMs
} = await import('../src/services/orchestratorService.js');

initDatabase();

const TEST_PASS = 'OrchStrongPass!99';
const TEST_KEY = 'orch-secret-access-key-xyz';
process.env.ORCH_PASSWORD_HASH = hashSecret(TEST_PASS);
process.env.ORCH_ACCESS_KEY_HASH = hashSecret(TEST_KEY);

const BACKUP_CODE_1 = 'AAA111-BBB222';
fs.writeFileSync(
  process.env.ORCH_BACKUP_CODES_FILE,
  JSON.stringify([{ hash: hashSecret(BACKUP_CODE_1), used: false }]),
  'utf8'
);

test('1. Login hardening: scrypt, TOTP, backup code single-use, backoff without lockout', async () => {
  assert.equal(verifySecretHash(TEST_PASS, process.env.ORCH_PASSWORD_HASH), true);
  assert.equal(verifySecretHash('wrong', process.env.ORCH_PASSWORD_HASH), false);

  const code = generateTotpCode(process.env.ORCH_TOTP_SECRET);
  assert.equal(verifyTotp(process.env.ORCH_TOTP_SECRET, code), true);
  assert.equal(verifyTotp(process.env.ORCH_TOTP_SECRET, '000000'), false);

  assert.equal(computeBackoffDelayMs(0), 0);
  assert.equal(computeBackoffDelayMs(1), 500);
  assert.equal(computeBackoffDelayMs(2), 1000);

  const bad = await OrchestratorService.login({
    accessKey: TEST_KEY,
    password: 'wrong-password',
    totpCode: code,
    ip: '127.0.0.1'
  });
  assert.equal(bad.ok, false);

  const alerts = db.prepare(`SELECT * FROM orchestrator_alerts WHERE category = 'ORCH_LOGIN_FAILED'`).all();
  assert.ok(alerts.length >= 1, 'Failed login must emit an alert');

  // Account is NOT locked out — valid login with backup code succeeds
  const goodBackup = await OrchestratorService.login({
    accessKey: TEST_KEY,
    password: TEST_PASS,
    backupCode: BACKUP_CODE_1,
    ip: '127.0.0.1'
  });
  assert.equal(goodBackup.ok, true);
  assert.equal(OrchestratorService.validateSession(goodBackup.token), true);

  // Backup code cannot be reused
  const reuseBackup = await OrchestratorService.login({
    accessKey: TEST_KEY,
    password: TEST_PASS,
    backupCode: BACKUP_CODE_1,
    ip: '127.0.0.1'
  });
  assert.equal(reuseBackup.ok, false);
});

test('2. HMAC audit chain, append-only triggers, and local anchor file', () => {
  const entry = appendSealedAudit({
    actor: 'orchestrator',
    action: 'TEST_ACTION',
    targetId: 'ORD-1',
    details: { note: 'sealed' }
  });
  assert.ok(entry.hmacHash.length === 64);

  const verified = verifyAuditChain();
  assert.equal(verified.ok, true);
  assert.ok(verified.count >= 1);

  assert.ok(fs.existsSync(process.env.ORCH_ANCHOR_FILE), 'Anchor file must exist');
  const anchorLines = fs.readFileSync(process.env.ORCH_ANCHOR_FILE, 'utf8').trim().split('\n');
  const lastAnchor = JSON.parse(anchorLines[anchorLines.length - 1]);
  assert.equal(lastAnchor.headHash, verified.headHash);

  assert.throws(() => {
    db.prepare(`UPDATE orchestrator_audit_chain SET action = 'TAMPERED' WHERE seq = 1`).run();
  }, /append-only|forbidden/i);

  assert.throws(() => {
    db.prepare(`DELETE FROM orchestrator_audit_chain WHERE seq = 1`).run();
  }, /append-only|forbidden/i);
});

test('3. Soft-delete hides order from active_orders view & requires password re-entry', () => {
  db.prepare(`
    INSERT INTO pending_orders (order_id, buyer_name, maker_contractor, po_number, article_name, total_qty)
    VALUES ('ORD-SOFT-1', 'Test Buyer', 'Maker A', 'PO-999', 'Glove X', 1000)
  `).run();

  assert.throws(() => {
    OrchestratorService.softDeleteOrder('ORD-SOFT-1', 'test', 'wrong-pass');
  }, /Password re-entry failed/);

  const res = OrchestratorService.softDeleteOrder('ORD-SOFT-1', 'mistake order', TEST_PASS);
  assert.equal(res.ok, true);

  const activeRow = db.prepare(`SELECT * FROM active_orders WHERE order_id = 'ORD-SOFT-1'`).get();
  assert.equal(activeRow, undefined, 'Soft-deleted order must not appear in active_orders view');

  const rawRow = db.prepare(`SELECT deleted_at FROM pending_orders WHERE order_id = 'ORD-SOFT-1'`).get();
  assert.ok(rawRow.deleted_at, 'Tombstone deleted_at must be set');

  OrchestratorService.restoreOrder('ORD-SOFT-1', TEST_PASS);
  const restored = db.prepare(`SELECT * FROM active_orders WHERE order_id = 'ORD-SOFT-1'`).get();
  assert.ok(restored, 'Restored order must reappear in active_orders view');
});

test('4. Read-only DB connection rejects writes & signed export is verifiable', () => {
  const roDb = getReadOnlyDb();
  try {
    assert.throws(() => {
      roDb.prepare(`INSERT INTO orchestrator_alerts (ts, severity, category, message) VALUES ('t', 'INFO', 'X', 'Y')`).run();
    }, /readonly|read-only/i);
  } finally {
    roDb.close();
  }

  const overview = OrchestratorService.getSilentOverview();
  assert.equal(overview.chainStatus.ok, true);

  const exported = OrchestratorService.exportSignedHistory();
  const body = JSON.stringify({
    exportedAt: exported.exportedAt,
    headSeq: exported.headSeq,
    headHash: exported.headHash,
    rows: exported.rows
  });
  const expectedSig = crypto.createHmac('sha256', process.env.AUDIT_HMAC_KEY).update(body).digest('hex');
  assert.equal(exported.signature, expectedSig);
});
