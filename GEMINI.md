## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.

## ui-ux-pro-max

This project includes the UI/UX Pro Max design intelligence skill installed at `.claude/skills/ui-ux-pro-max/` (along with `.claude/skills/{design,design-system,ui-styling,brand,banner-design,slides}`).

Rules:
- Before designing or restyling screens, palettes, charts, or dense tables, query the design intelligence engine via `npm run uupm -- "<query>" --domain <color|ux|chart|typography|style>` or `npm run uupm:design-system -- "<query>" -p "Meridian Works MES"`.
- Keep shop-floor printable slips (`GRN`, `REQ`, `M-REQ`, `A-REQ`, `@media print`) 100% monochrome black-and-white while using semantic status tokens on screen.

## Everything Claude Code (ECC) & Playwright Verification Harness

This project installs **Everything Claude Code (`affaan-m/ECC`)** under `.agents/` and an automated **Playwright** E2E & visual QA harness (`playwright.config.ts`, `e2e/`), governed by the always-on rule [`.agents/rules/ecc-harness.md`](.agents/rules/ecc-harness.md).

Rules:
- Use the ECC workflows/skills under `.agents/` (`tdd-workflow`, `e2e-testing`, `browser-qa`, `click-path-audit`, `verification-loop`, `delivery-gate`) whenever applicable instead of ad-hoc shortcuts.
- Never skip automated browser verification or hand off UI/layout/interactive checks as "manual verification steps" for the user: run `npm run test:e2e` (isolated via `MES_DB_PATH` in `e2e/start-test-server.mjs`) and assert layout, viewport geometry, interactive states, and zero console/page/5xx errors in Playwright.
- Before claiming any task done, run the full post-edit verification sequence (`npm run lint`, `npm run test:unit`, `npm test`, `npm run build`, `npm run test:e2e`, `npm run graphify`, or `npm run verify:all`) with zero failures or skipped assertions.
