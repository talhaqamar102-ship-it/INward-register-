# Trace — 2026-11-17 Archive Dead/Unused Files into archive/

- `read_file`: `tsconfig.json`, `vite.config.ts`, `Dockerfile`, `scripts/graphify.ts:1-95`, `.gitignore`, `.dockerignore`, `metadata.json` -> Found `Dockerfile:39-40` copied `vanilla/` & `public/`, `tsconfig.json` compiled `**/*` (excl. `dist`), `.gitignore:25-28` ignored `hyperframes-video/node_modules/` & `*.mp4`, and `scripts/graphify.ts` scanned root folders -> Updated configs first so archiving wouldn't break `tsc`, Docker, `graphify`, or expose `node_modules/`.
- `run_command`: Moved unused items into `archive/` (`.aistudio`, `design-system`, `hyperframes-video`, `legacy-react/{App.tsx,main.tsx,index.css}`, `notes/{2026-11-15.md,AUDIT_IMPLEMENT_VERIFY_REPORT.md,README.aistudio.md,SKILL.md,metadata.json}`, `Program.cs`, `public`, `vanilla`) -> `TODO.md` skipped cleanly (`absent`).
- `run_command`: `npm run verify:all` (`task-2410`) -> Failed `exit 1` with `3` HTTP `404` failures at `test/http.test.js:86,95,104` (`index.html`, `store.html`, `packing.html`) -> Read `src/server.js:27` and confirmed `public/` IS actively served by the test server (`src/server.js`) and required by `test/http.test.js`.
- `edit_file` + `run_command`: Restored `public/` to root and `COPY public/ ./public/` in `Dockerfile` -> Checked `public/{index,store,packing}.html` exist (`True`).
- `run_command`: Re-ran `npm run verify:all` (`task-2418`) -> Exited `0`: `lint` clean, `test:unit` `29/29` passed, `test` `45/45` passed (`0` fail/skip), `vite build` `165ms`, `test:e2e` `10/10` passed (`25.7s`), `graphify` rebuilt (`986` nodes, `1958` edges) -> Zero broken tests, `0` leaked `node_modules` in git (`@(...).Count = 0`).

## ASSUMED WITHOUT CHECKING
- Live `docker compose build` after removing `COPY vanilla/` -> `NOT RUN` (verified `Dockerfile` syntax/excludes cleanly, not rebuilt into container image yet).
- Local changes remain uncommitted on `feat/catalog-cascading-sizing`.
