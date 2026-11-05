# Meridian Works MES

Packaging & cobalting execution system for safety-glove manufacturing.

- Frontend: vanilla TS/HTML/CSS — `index.html` loads `src/main.ts`; five
  screens (Inward Register, Packing Hall, Repair Bay, Final QC, Admin).
- Backend: Express (`server.ts`) → `src/routes/api.js` →
  `src/services/packingService.js`; SQLite via `node:sqlite` in `data/`.
- Styling: strict grayscale CSS variables (`--ink-*`, `--bg-*`, `--border-*`,
  `--text-*`) defined in `src/style.css`. No new hex colors, ever.
- Clean inspection mode: no dummy/demo transaction data; masters only.
- Print: GRN and other slips print via `#direct-print-stage` +
  `body.printing-slip` + `window.print()`; `@media print` rules in style.css.
- Docker: `docker compose up -d --build`; health endpoint `/health`.

## Commands

| Task | Command |
| --- | --- |
| Dev server (Vite + API, port 3000) | `npm run dev` |
| Typecheck | `npm run lint` |
| Frontend build | `npm run build` |
| Unit tests (node:test) | `npm test` |
| UI/UX Pro Max search | `npm run uupm -- "<query>" --domain <domain>` |
| Docker run | `docker compose up -d --build` |

## Development workflow

This project uses the **dev-team** plugin from
https://github.com/bdfinst/agentic-dev-team — vendored in
`.agentic-dev-team/plugins/dev-team/`, cataloged in `skills.md`:

    /specs → /plan → /build → /pr

Human gates between /specs→/plan and /plan→/build. `/code-review` before every
commit. See `.claude/CLAUDE.md` for the full project constitution
(grayscale gate, clean-mode gate, quality gates).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.

## ui-ux-pro-max

Design intelligence database installed at `.claude/skills/ui-ux-pro-max/SKILL.md` (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py`).
- Run `npm run uupm:design-system -- "manufacturing erp enterprise analytics dashboard" -p "Meridian Works MES"` for system-wide palette, typography, and layout reasoning.
- Run `npm run uupm -- "<query>" --domain <color|ux|chart|typography|style>` for targeted component, chart, or table UX rules.
