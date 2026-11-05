# Meridian Works MES — Project Constitution for the Dev Team

Packaging & cobalting execution system for safety-glove manufacturing.
Full-stack: vanilla TS/HTML/CSS frontend (`src/main.ts`, 5 screens), Express
API (`server.ts` → `src/routes/api.js` → `src/services/packingService.js`),
SQLite via node:sqlite (`data/gloves_packing.db`), Docker runtime
(`Dockerfile`, `docker-compose.yml`).

## Non-negotiables

- **Grayscale only.** Every color must come from the CSS variables in
  `src/style.css` (`--ink-*`, `--bg-*`, `--border-*`, `--text-*`). Never
  introduce a new hex literal in markup or new CSS. Zero-color-tolerance rule:
  the entire UI, including print templates and SVG, stays monochrome.
- **Clean inspection mode.** No dummy/demo transaction rows. `seedDemoSheet()`
  in `src/db.js` is intentionally disabled; do not re-enable it, do not seed
  fake receivings, defects, or cartons. Reference masters (customers,
  products, materials, BOM) may be seeded as before.
- **Print engine.** Slips print through `#direct-print-stage` +
  `body.printing-slip` + native `window.print()` (defined in `src/main.ts`,
  mirrored in `src/App.tsx`). Keep `@media print` rules in `src/style.css`.
- **Entry point.** `index.html` loads `/src/main.ts` (vanilla 5-screen app:
  grn, packing, repair, qc, admin). `src/App.tsx`/`main.tsx` is the React
  harness kept out of the served entry; do not switch entries without intent.
- **Docker parity.** `docker compose build` must succeed and the container
  must pass `/health` before a task is considered done.

## Quality gates (run before done)

- `npx tsc --noEmit` — typecheck
- `npx vite build` — frontend bundle builds
- `npm run graphify` (`npx tsx scripts/graphify.ts update .`) — rebuilds `graphify-out/graph.json` and `graphify-out/GRAPH_REPORT.md` after every code change
- `docker compose build` + `curl -f http://127.0.0.1:3000/health`

## Graphify Knowledge Graph Harness (`/graphify`)

This project maintains a persistent whole-project knowledge graph in `graphify-out/` (`graph.json`, `GRAPH_REPORT.md`, `wiki/index.md`, `graph.html`), powered by `.claude/skills/graphify/SKILL.md` and `scripts/graphify.ts`:
1. **Read Before Edit**: Consult `graphify-out/GRAPH_REPORT.md`, `graphify-out/wiki/index.md`, or run `npm run graphify:query -- "<question>"` (`graphify query "<question>"`) before reading raw files.
2. **Mandatory Post-Change Update**: Every time code or schema files are modified, the `PostToolUse` (`Edit|Write`) hook and quality gate automatically run `graphify update .` (`npm run graphify`) so `graphify-out/graph.json` and `graphify-out/GRAPH_REPORT.md` stay synchronized with the latest AST and SQLite schema.

## UI/UX Pro Max Design Intelligence Harness (`/ui-ux-pro-max`)

Installed locally at `.claude/skills/ui-ux-pro-max/` (plus companion skills `design`, `design-system`, `ui-styling`, `brand`, `banner-design`, `slides`):
1. **Design System & Domain Search**: Query `.claude/skills/ui-ux-pro-max/scripts/search.py` via `npm run uupm -- "<query>" --domain <color|ux|chart|typography|style>` or `npm run uupm:design-system -- "<query>" -p "Meridian Works MES"`.
2. **Print vs. Screen Separation**: Shop-floor paper slips (`GRN`, `REQ`, `M-REQ`, `A-REQ`, `@media print`) must remain strictly 100% monochrome black-and-white for thermal/laser printers. Screen dashboards use semantic CSS variables defined in `src/style.css`.

## Workflow

Use the dev-team plugin from https://github.com/bdfinst/agentic-dev-team
(vendored at `.agentic-dev-team/`, catalog in `skills.md`):

    /specs  →  /plan  →  /build  →  /pr

Human gates sit between /specs→/plan and /plan→/build. Bug fixes may start at
/plan or go straight to implementation. Run /code-review before every commit.

