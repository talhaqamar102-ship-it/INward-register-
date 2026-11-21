import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { db, getReadOnlyDb } from '../db.js';
import { AuthService } from './authService.js';

const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes
const SCRYPT_KEYLEN = 64;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// In-memory session store & progressive backoff state (never persisted in mes_sessions)
const orchSessions = new Map();
const loginBackoff = { failures: 0, lastFailureAt: 0 };

function getEnvConfig() {
  return {
    routePath: process.env.ORCH_ROUTE_PATH || '/_orch',
    passwordHash: process.env.ORCH_PASSWORD_HASH || '',
    accessKeyHash: process.env.ORCH_ACCESS_KEY_HASH || '',
    totpSecret: process.env.ORCH_TOTP_SECRET || '',
    hmacKey: process.env.AUDIT_HMAC_KEY || '',
    backupCodesFile: process.env.ORCH_BACKUP_CODES_FILE || path.join(os.tmpdir(), 'mes-orch-backup-codes.json'),
    anchorFile: process.env.ORCH_ANCHOR_FILE || path.join(os.tmpdir(), 'mes-orch-anchor.log'),
    alertsLogFile: process.env.ORCH_ALERTS_LOG || path.join(process.cwd(), 'logs', 'alerts.log')
  };
}

function ensureFileDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function setRestrictedPermissions(filePath) {
  try {
    if (process.platform !== 'win32') {
      fs.chmodSync(filePath, 0o600);
    }
  } catch {
    // Best-effort on non-POSIX filesystems
  }
}

export function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(secret), salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${derived}`;
}

export function verifySecretHash(secret, storedHash) {
  if (!secret || !storedHash || !storedHash.includes(':')) return false;
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) return false;
  const actualBuf = crypto.scryptSync(String(secret), salt, SCRYPT_KEYLEN);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

function base32Decode(encoded) {
  const clean = String(encoded || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpCode(secret, timeMs = Date.now(), stepSec = 30) {
  const key = base32Decode(secret);
  const counter = Math.floor(timeMs / 1000 / stepSec);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

export function verifyTotp(secret, token, timeMs = Date.now(), windowSteps = 1) {
  if (!secret || !token) return false;
  const normalized = String(token).trim();
  if (!/^\d{6}$/.test(normalized)) return false;
  const tokenBuf = Buffer.from(normalized, 'utf8');
  for (let offset = -windowSteps; offset <= windowSteps; offset++) {
    const candidate = generateTotpCode(secret, timeMs + offset * 30_000);
    const candBuf = Buffer.from(candidate, 'utf8');
    if (candBuf.length === tokenBuf.length && crypto.timingSafeEqual(candBuf, tokenBuf)) {
      return true;
    }
  }
  return false;
}

function consumeBackupCode(code) {
  const { backupCodesFile } = getEnvConfig();
  if (!code || !fs.existsSync(backupCodesFile)) return false;
  try {
    const raw = fs.readFileSync(backupCodesFile, 'utf8');
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries)) return false;
    for (const entry of entries) {
      if (!entry.used && verifySecretHash(String(code).trim(), entry.hash)) {
        entry.used = true;
        entry.usedAt = new Date().toISOString();
        fs.writeFileSync(backupCodesFile, JSON.stringify(entries, null, 2), 'utf8');
        setRestrictedPermissions(backupCodesFile);
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

export function computeBackoffDelayMs(failures) {
  if (failures <= 0) return 0;
  return Math.min(30_000, 500 * Math.pow(2, failures - 1));
}

function appendAnchor(seq, ts, headHash) {
  const { anchorFile } = getEnvConfig();
  try {
    ensureFileDir(anchorFile);
    const line = JSON.stringify({ ts, seq, headHash }) + '\n';
    fs.appendFileSync(anchorFile, line, 'utf8');
    setRestrictedPermissions(anchorFile);
  } catch {
    // Non-fatal in restricted environments, but logged
  }
}

export function emitAlert({ severity = 'WARN', category, message, actor = '', meta = {} }) {
  const ts = new Date().toISOString();
  const metaJson = JSON.stringify(meta || {});
  try {
    db.prepare(`
      INSERT INTO orchestrator_alerts (ts, severity, category, message, actor, meta)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(ts, severity, category, message, actor, metaJson);
  } catch {
    // Ignore DB errors during early boot
  }
  try {
    const { alertsLogFile } = getEnvConfig();
    ensureFileDir(alertsLogFile);
    const line = JSON.stringify({ ts, severity, category, message, actor, meta }) + '\n';
    fs.appendFileSync(alertsLogFile, line, 'utf8');
    setRestrictedPermissions(alertsLogFile);
  } catch {
    // Ignore filesystem errors
  }
}

export function appendSealedAudit({ actor = 'system', action, targetId = '', details = {} }) {
  const { hmacKey } = getEnvConfig();
  const key = hmacKey || 'UNCONFIGURED_DEV_HMAC_KEY';
  const ts = new Date().toISOString();
  const detailsJson = typeof details === 'string' ? details : JSON.stringify(details || {});

  const last = db.prepare(`SELECT seq, hmac_hash FROM orchestrator_audit_chain ORDER BY seq DESC LIMIT 1`).get();
  const seq = last ? Number(last.seq) + 1 : 1;
  const prevHash = last ? last.hmac_hash : 'GENESIS';

  const payload = JSON.stringify({ seq, ts, actor, action, targetId, details: detailsJson, prev: prevHash });
  const hmacHash = crypto.createHmac('sha256', key).update(payload).digest('hex');

  db.prepare(`
    INSERT INTO orchestrator_audit_chain (seq, ts, actor, action, target_id, details, prev_hash, hmac_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(seq, ts, actor, action, targetId, detailsJson, prevHash, hmacHash);

  appendAnchor(seq, ts, hmacHash);
  return { seq, ts, actor, action, targetId, prevHash, hmacHash };
}

export function verifyAuditChain(customDb = null) {
  const { hmacKey } = getEnvConfig();
  const key = hmacKey || 'UNCONFIGURED_DEV_HMAC_KEY';
  const reader = customDb || getReadOnlyDb();
  try {
    const rows = reader.prepare(`
      SELECT id, seq, ts, actor, action, target_id, details, prev_hash, hmac_hash
      FROM orchestrator_audit_chain
      ORDER BY seq ASC
    `).all();

    let prev = 'GENESIS';
    for (const r of rows) {
      if (r.prev_hash !== prev) {
        return { ok: false, brokenAtSeq: r.seq, brokenAtId: r.id, reason: 'prev_hash mismatch' };
      }
      const payload = JSON.stringify({
        seq: r.seq,
        ts: r.ts,
        actor: r.actor,
        action: r.action,
        targetId: r.target_id,
        details: r.details,
        prev
      });
      const expected = crypto.createHmac('sha256', key).update(payload).digest('hex');
      const actualBuf = Buffer.from(String(r.hmac_hash || ''), 'hex');
      const expectedBuf = Buffer.from(expected, 'hex');
      if (actualBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(actualBuf, expectedBuf)) {
        return { ok: false, brokenAtSeq: r.seq, brokenAtId: r.id, reason: 'hmac_hash mismatch' };
      }
      prev = r.hmac_hash;
    }
    return { ok: true, count: rows.length, headHash: prev };
  } finally {
    if (!customDb) reader.close();
  }
}

export class OrchestratorService {
  static isConfigured() {
    const cfg = getEnvConfig();
    return Boolean(cfg.passwordHash && cfg.accessKeyHash && cfg.totpSecret && cfg.hmacKey);
  }

  static getRoutePath() {
    return getEnvConfig().routePath;
  }

  static async login({ accessKey, password, totpCode, backupCode, ip = '' }) {
    const cfg = getEnvConfig();
    if (!this.isConfigured()) {
      throw new Error('Orchestrator is not configured on this server.');
    }

    const delayMs = computeBackoffDelayMs(loginBackoff.failures);
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    const keyOk = verifySecretHash(accessKey, cfg.accessKeyHash);
    const passOk = verifySecretHash(password, cfg.passwordHash);
    const totpOk = totpCode ? verifyTotp(cfg.totpSecret, totpCode) : false;
    const backupOk = !totpOk && backupCode ? consumeBackupCode(backupCode) : false;

    if (!keyOk || !passOk || (!totpOk && !backupOk)) {
      loginBackoff.failures += 1;
      loginBackoff.lastFailureAt = Date.now();
      emitAlert({
        severity: 'CRITICAL',
        category: 'ORCH_LOGIN_FAILED',
        message: `Failed Orchestrator login attempt (attempt #${loginBackoff.failures})`,
        actor: 'unknown',
        meta: { ip, keyOk, passOk, mfaOk: totpOk || backupOk }
      });
      return { ok: false, error: 'Invalid credentials' };
    }

    loginBackoff.failures = 0;
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + SESSION_TTL_MS;
    orchSessions.set(token, { expiresAt, ip });

    appendSealedAudit({
      actor: 'orchestrator',
      action: 'ORCH_LOGIN',
      targetId: 'session',
      details: { ip, usedBackupCode: backupOk }
    });

    return { ok: true, token, expiresAt };
  }

  static validateSession(token) {
    if (!token) return false;
    const sess = orchSessions.get(token);
    if (!sess) return false;
    if (Date.now() > sess.expiresAt) {
      orchSessions.delete(token);
      return false;
    }
    return true;
  }

  static logout(token) {
    if (token) orchSessions.delete(token);
  }

  static requirePasswordReentry(password) {
    const cfg = getEnvConfig();
    if (!verifySecretHash(password, cfg.passwordHash)) {
      emitAlert({
        severity: 'HIGH',
        category: 'ORCH_REAUTH_FAILED',
        message: 'Failed password re-entry for destructive Orchestrator action',
        actor: 'orchestrator'
      });
      const err = new Error('Password re-entry failed.');
      err.statusCode = 403;
      throw err;
    }
  }

  static getSilentOverview() {
    const roDb = getReadOnlyDb();
    try {
      const chainStatus = verifyAuditChain(roDb);
      const activeOrders = roDb.prepare(`SELECT COUNT(*) AS cnt FROM active_orders`).get().cnt;
      const deletedOrders = roDb.prepare(`SELECT COUNT(*) AS cnt FROM pending_orders WHERE deleted_at IS NOT NULL`).get().cnt;
      const recentOrders = roDb.prepare(`
        SELECT order_id, buyer_name, po_number, article_name, total_qty, short_closed, deleted_at, created_at
        FROM pending_orders
        ORDER BY created_at DESC
        LIMIT 50
      `).all();
      const superUsers = roDb.prepare(`
        SELECT user_id, username, name, role, active, created_at
        FROM mes_users
        WHERE role = 'SUPER_USER'
        ORDER BY created_at DESC
      `).all();
      const alerts = roDb.prepare(`
        SELECT id, ts, severity, category, message, actor, acknowledged
        FROM orchestrator_alerts
        ORDER BY id DESC
        LIMIT 50
      `).all();
      const auditTail = roDb.prepare(`
        SELECT seq, ts, actor, action, target_id, details, hmac_hash
        FROM orchestrator_audit_chain
        ORDER BY seq DESC
        LIMIT 50
      `).all();

      return {
        chainStatus,
        counts: { activeOrders, deletedOrders },
        recentOrders,
        superUsers,
        alerts,
        auditTail
      };
    } finally {
      roDb.close();
    }
  }

  static softDeleteOrder(orderId, reason, password) {
    this.requirePasswordReentry(password);
    const existing = db.prepare(`SELECT order_id, deleted_at FROM pending_orders WHERE order_id = ?`).get(orderId);
    if (!existing) {
      const err = new Error(`Order ${orderId} not found`);
      err.statusCode = 404;
      throw err;
    }
    db.prepare(`UPDATE pending_orders SET deleted_at = CURRENT_TIMESTAMP WHERE order_id = ?`).run(orderId);
    const sealed = appendSealedAudit({
      actor: 'orchestrator',
      action: 'ORDER_SOFT_DELETE',
      targetId: orderId,
      details: { reason: reason || 'Orchestrator soft-delete' }
    });
    return { ok: true, orderId, sealed };
  }

  static restoreOrder(orderId, password) {
    this.requirePasswordReentry(password);
    db.prepare(`UPDATE pending_orders SET deleted_at = NULL WHERE order_id = ?`).run(orderId);
    const sealed = appendSealedAudit({
      actor: 'orchestrator',
      action: 'ORDER_RESTORE',
      targetId: orderId,
      details: {}
    });
    return { ok: true, orderId, sealed };
  }

  static toggleSuperUser(userId, active, password) {
    this.requirePasswordReentry(password);
    const updated = AuthService.setUserActive(userId, active);
    const sealed = appendSealedAudit({
      actor: 'orchestrator',
      action: 'ORCH_SUPER_USER_TOGGLE',
      targetId: userId,
      details: { active: Boolean(active) }
    });
    emitAlert({
      severity: 'INFO',
      category: 'SUPER_USER_CHANGED',
      message: `Orchestrator ${active ? 'activated' : 'deactivated'} Super User ${updated.username}`,
      actor: 'orchestrator',
      meta: { userId }
    });
    return { ok: true, user: updated, sealed };
  }

  static exportSignedHistory() {
    const roDb = getReadOnlyDb();
    try {
      const rows = roDb.prepare(`
        SELECT seq, ts, actor, action, target_id, details, prev_hash, hmac_hash
        FROM orchestrator_audit_chain
        ORDER BY seq ASC
      `).all();
      const headHash = rows.length > 0 ? rows[rows.length - 1].hmac_hash : 'GENESIS';
      const headSeq = rows.length > 0 ? rows[rows.length - 1].seq : 0;
      const exportedAt = new Date().toISOString();
      const { hmacKey } = getEnvConfig();
      const key = hmacKey || 'UNCONFIGURED_DEV_HMAC_KEY';
      const body = JSON.stringify({ exportedAt, headSeq, headHash, rows });
      const signature = crypto.createHmac('sha256', key).update(body).digest('hex');
      return { exportedAt, headSeq, headHash, count: rows.length, rows, signature };
    } finally {
      roDb.close();
    }
  }
}
