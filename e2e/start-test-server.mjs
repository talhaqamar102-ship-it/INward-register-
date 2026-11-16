import fs from 'node:fs';
import path from 'node:path';

const dbPath = path.resolve(process.env.MES_DB_PATH || '.playwright-tmp/e2e.sqlite');
for (const suffix of ['', '-wal', '-shm']) {
  fs.rmSync(`${dbPath}${suffix}`, { force: true });
}
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

process.env.MES_DB_PATH = dbPath;
process.env.PORT = process.env.PORT || '4173';
process.env.DISABLE_HMR = 'true';

await import('../server.ts');
