import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hashSecret } from '../src/services/orchestratorService.js';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function randomBase32(bytes = 20) {
  const buf = crypto.randomBytes(bytes);
  let out = '';
  let bits = 0;
  let value = 0;
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

const password = process.argv[2] || crypto.randomBytes(12).toString('base64url');
const accessKey = process.argv[3] || crypto.randomBytes(24).toString('hex');
const totpSecret = randomBase32(20);
const hmacKey = crypto.randomBytes(32).toString('hex');
const routePath = process.env.ORCH_ROUTE_PATH || `/_orch_${crypto.randomBytes(4).toString('hex')}`;

const backupCodesPlain = Array.from({ length: 8 }, () =>
  `${crypto.randomBytes(3).toString('hex')}-${crypto.randomBytes(3).toString('hex')}`.toUpperCase()
);
const backupCodesHashed = backupCodesPlain.map(c => ({ hash: hashSecret(c), used: false }));

const backupCodesFile = process.env.ORCH_BACKUP_CODES_FILE || path.join(os.tmpdir(), 'mes-orch-backup-codes.json');
fs.mkdirSync(path.dirname(backupCodesFile), { recursive: true });
fs.writeFileSync(backupCodesFile, JSON.stringify(backupCodesHashed, null, 2), 'utf8');
if (process.platform !== 'win32') fs.chmodSync(backupCodesFile, 0o600);

const envPath = path.join(process.cwd(), '.env');
let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const updates: Record<string, string> = {
  ORCH_ROUTE_PATH: routePath,
  ORCH_PASSWORD_HASH: hashSecret(password),
  ORCH_ACCESS_KEY_HASH: hashSecret(accessKey),
  ORCH_TOTP_SECRET: totpSecret,
  AUDIT_HMAC_KEY: hmacKey,
  ORCH_BACKUP_CODES_FILE: backupCodesFile
};

for (const [k, v] of Object.entries(updates)) {
  const re = new RegExp(`^${k}=.*$`, 'm');
  if (re.test(envContent)) {
    envContent = envContent.replace(re, `${k}=${v}`);
  } else {
    envContent += `${envContent.endsWith('\n') || !envContent ? '' : '\n'}${k}=${v}\n`;
  }
}

fs.writeFileSync(envPath, envContent, 'utf8');
if (process.platform !== 'win32') fs.chmodSync(envPath, 0o600);

console.log('=== Orchestrator Break-Glass Reset Complete ===');
console.log(`Route Path   : ${routePath}`);
console.log(`Password     : ${password}`);
console.log(`Access Key   : ${accessKey}`);
console.log(`TOTP Secret  : ${totpSecret}`);
console.log(`Backup Codes : ${backupCodesPlain.join(', ')}`);
console.log(`Saved to .env and ${backupCodesFile}`);
