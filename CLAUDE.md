# Hammad Industries MES

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
| Frontend unit tests (tsx) | `npm run test:unit` |
| Integration tests (node:test) | `npm test` |
| Playwright E2E / visual QA | `npm run test:e2e` |
| Full verification gate | `npm run verify:all` |
| Docker run | `docker compose up -d --build` |

## ECC & Playwright Verification Harness (Hard Rule)

**Everything Claude Code (`affaan-m/ECC`)** is installed in `.agents/` alongside the Playwright E2E harness (`playwright.config.ts`, `e2e/`), enforced by `.agents/rules/ecc-harness.md`:

- Consult and follow ECC rules/skills (`tdd-workflow`, `e2e-testing`, `browser-qa`, `click-path-audit`, `verification-loop`, `delivery-gate`) wherever applicable.
- Never skip automated browser/UI verification or ask the user to manually check screens in a browser after UI, CSS, DOM, layout, nav, auth, form, or handler changes: add/update assertions in `e2e/` and run `npm run test:e2e` against the isolated `MES_DB_PATH` test server.
- Run the full post-edit gate (`npm run lint`, `npm run test:unit`, `npm test`, `npm run build`, `npm run test:e2e`, `npm run graphify`, or `npm run verify:all`) before reporting completion.

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

## unslop Design Craft Harness

Design system & UI craft guidance is installed at `.agents/skills/unslop/SKILL.md` (`heydamir/unslop`, `CC BY 4.0`):
- Follow `.agents/skills/unslop/SKILL.md` ("quiet chrome, one bright moment", Warm/Graphite neutral ramps from `references/tokens.md`, sentence-case labels, weights `400`/`500`, `tabular-nums`, and the 9 passes in order) when designing or refining screens.
- Keep shop-floor paper slips (`GRN`, `REQ`, `M-REQ`, `A-REQ`, `@media print`) strictly 100% monochrome black-and-white.
