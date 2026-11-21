# Project Setup & Transfer Guide

## Runtime Requirements
- **Node.js:** `v24.22.1` (match this version on the target machine)
- **Git**

## Install & Run
```powershell
git clone https://github.com/talhaqamar102-ship-it/INward-register-.git
cd INward-register-
npm install
```

1. Copy `.env` and `data/` from your encrypted USB drive into the project root (update any `C:\...` paths in `.env` if needed).
2. Or, for a fresh Orchestrator setup on the new machine:
   ```powershell
   npm run orch:reset
   ```
3. Start the server:
   ```powershell
   npm run dev
   ```

## Environment Variables (`.env`)
- `PORT` — HTTP port (default `3000`)
- `MES_DB_PATH` — Optional custom SQLite DB path (default `data/gloves_packing.db`)
- `ORCH_ROUTE_PATH` — Hidden Orchestrator route path (default `/_orch`)
- `ORCH_PASSWORD_HASH` — Scrypt hash of Orchestrator password
- `ORCH_ACCESS_KEY_HASH` — Scrypt hash of Orchestrator access key
- `ORCH_TOTP_SECRET` — Base32 TOTP authenticator secret
- `AUDIT_HMAC_KEY` — Server-side HMAC-SHA256 key for the audit chain
- `ORCH_BACKUP_CODES_FILE` — Path to hashed one-time backup codes JSON
- `ORCH_ANCHOR_FILE` — Path to append-only hash anchor log outside the DB folder
- `ORCH_ALERTS_LOG` — Path to alerts log (default `logs/alerts.log`)
