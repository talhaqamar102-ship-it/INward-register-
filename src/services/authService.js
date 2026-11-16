import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash
} from 'node:crypto';
import { db } from '../db.js';

export const MES_ROLES = [
  'SUPER_USER',
  'INWARD_CLERK',
  'PACKING_SUPERVISOR',
  'QC_INSPECTOR',
  'ALTERATION_LEAD'
];

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const PASSWORD_HASH_BYTES = 64;

function publicUser(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    username: row.username,
    name: row.name,
    role: row.role,
    station: row.station,
    active: Boolean(row.active)
  };
}

function normalizeAccount({ name, username, password, role, station }) {
  const normalizedName = String(name || '').trim();
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const normalizedPassword = String(password || '');
  const normalizedRole = String(role || '').trim().toUpperCase();
  const normalizedStation = String(station || '').trim();

  if (!normalizedName) throw new Error('Operator name is required.');
  if (!/^[a-z0-9._-]{3,48}$/.test(normalizedUsername)) {
    throw new Error('Username must be 3–48 characters and use letters, numbers, dots, underscores, or hyphens.');
  }
  if (normalizedPassword.length < 8) throw new Error('Password must be at least 8 characters.');
  if (!MES_ROLES.includes(normalizedRole)) throw new Error('Select a valid station role.');

  return {
    name: normalizedName,
    username: normalizedUsername,
    password: normalizedPassword,
    role: normalizedRole,
    station: normalizedStation
  };
}

function insertUser(account) {
  const { salt, passwordHash } = hashPassword(account.password);
  const userId = `USR-${Date.now()}-${randomBytes(3).toString('hex')}`;
  db.prepare(`
    INSERT INTO mes_users (user_id, username, name, role, station, password_salt, password_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, account.username, account.name, account.role, account.station, salt, passwordHash);
  return publicUser(db.prepare('SELECT * FROM mes_users WHERE user_id = ?').get(userId));
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const passwordHash = scryptSync(password, salt, PASSWORD_HASH_BYTES).toString('hex');
  return { salt, passwordHash };
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export const AuthService = {
  hasUsers() {
    return Number(db.prepare('SELECT COUNT(*) AS count FROM mes_users').get().count) > 0;
  },

  createInitialSuperUser(input) {
    const account = normalizeAccount({ ...input, role: 'SUPER_USER' });
    db.exec('BEGIN IMMEDIATE');
    try {
      if (this.hasUsers()) {
        const error = new Error('Initial Super User setup has already been completed.');
        error.statusCode = 409;
        throw error;
      }
      const user = insertUser(account);
      db.exec('COMMIT');
      return user;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  },

  createUser(input) {
    return insertUser(normalizeAccount(input));
  },

  updatePassword(userId, password) {
    const normalizedPassword = String(password || '');
    if (normalizedPassword.length < 8) throw new Error('Password must be at least 8 characters.');
    const { salt, passwordHash } = hashPassword(normalizedPassword);
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = db.prepare(`
        UPDATE mes_users
        SET password_salt = ?, password_hash = ?
        WHERE user_id = ?
      `).run(salt, passwordHash, userId);
      if (Number(result.changes) === 0) {
        const error = new Error('User account was not found.');
        error.statusCode = 404;
        throw error;
      }
      db.prepare('DELETE FROM mes_sessions WHERE user_id = ?').run(userId);
      db.exec('COMMIT');
      return true;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  },

  listUsers() {
    return db.prepare(`
      SELECT user_id, username, name, role, station, active
      FROM mes_users
      ORDER BY created_at, user_id
    `).all().map(publicUser);
  },

  verifyCredentials(username, password) {
    const row = db.prepare(`
      SELECT * FROM mes_users
      WHERE username = ? COLLATE NOCASE AND active = 1
    `).get(String(username || '').trim());
    if (!row) return null;
    const actualHash = scryptSync(String(password || ''), row.password_salt, PASSWORD_HASH_BYTES);
    const expectedHash = Buffer.from(row.password_hash, 'hex');
    if (actualHash.length !== expectedHash.length || !timingSafeEqual(actualHash, expectedHash)) return null;
    return publicUser(row);
  },

  createSession(userId) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + SESSION_TTL_MS;
    db.prepare('DELETE FROM mes_sessions WHERE expires_at <= ?').run(Date.now());
    db.prepare(`
      INSERT INTO mes_sessions (token_hash, user_id, expires_at)
      VALUES (?, ?, ?)
    `).run(hashToken(token), userId, expiresAt);
    return { token, expiresAt };
  },

  getSessionUser(token) {
    if (!token || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
    const row = db.prepare(`
      SELECT u.*
      FROM mes_sessions s
      JOIN mes_users u ON u.user_id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1
    `).get(hashToken(token), Date.now());
    if (!row) return null;
    return publicUser(row);
  },

  destroySession(token) {
    if (token) db.prepare('DELETE FROM mes_sessions WHERE token_hash = ?').run(hashToken(token));
  },

  deleteUser(userId) {
    db.prepare('DELETE FROM mes_sessions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM mes_users WHERE user_id = ?').run(userId);
  },

  deleteUserByAdmin({ targetUserId, adminUserId, adminPassword }) {
    const normalizedTargetId = String(targetUserId || '').trim();
    const normalizedAdminId = String(adminUserId || '').trim();
    const rawAdminPassword = String(adminPassword || '');

    if (!normalizedTargetId) {
      const err = new Error('Target user ID is required.');
      err.statusCode = 400;
      throw err;
    }
    if (!rawAdminPassword) {
      const err = new Error('Enter your Admin password to confirm user deletion.');
      err.statusCode = 400;
      throw err;
    }
    if (normalizedTargetId === normalizedAdminId) {
      const err = new Error('You cannot delete your own currently signed-in Super User account.');
      err.statusCode = 400;
      throw err;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      const adminRow = db.prepare(`
        SELECT * FROM mes_users
        WHERE user_id = ? AND active = 1 AND role = 'SUPER_USER'
      `).get(normalizedAdminId);
      if (!adminRow) {
        const err = new Error('Admin session is invalid.');
        err.statusCode = 401;
        throw err;
      }

      const actualHash = scryptSync(rawAdminPassword, adminRow.password_salt, PASSWORD_HASH_BYTES);
      const expectedHash = Buffer.from(adminRow.password_hash, 'hex');
      if (actualHash.length !== expectedHash.length || !timingSafeEqual(actualHash, expectedHash)) {
        const err = new Error('Incorrect Admin password. User was not deleted.');
        err.statusCode = 401;
        throw err;
      }

      const targetRow = db.prepare('SELECT * FROM mes_users WHERE user_id = ?').get(normalizedTargetId);
      if (!targetRow) {
        const err = new Error('User account was not found.');
        err.statusCode = 404;
        throw err;
      }

      if (targetRow.role === 'SUPER_USER') {
        const superCount = Number(
          db.prepare(`SELECT COUNT(*) AS count FROM mes_users WHERE role = 'SUPER_USER' AND active = 1`).get().count
        );
        if (superCount <= 1) {
          const err = new Error('Cannot delete the last remaining Super User account.');
          err.statusCode = 400;
          throw err;
        }
      }

      db.prepare('DELETE FROM mes_sessions WHERE user_id = ?').run(normalizedTargetId);
      db.prepare('DELETE FROM mes_users WHERE user_id = ?').run(normalizedTargetId);
      db.exec('COMMIT');
      return publicUser(targetRow);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
};
