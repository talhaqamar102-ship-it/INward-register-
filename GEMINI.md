## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.

## unslop

This project uses the `heydamir/unslop` skill installed at `.agents/skills/unslop/SKILL.md` (`CC BY 4.0`, Damir Sokolovsky `@heydamir`).

Rules:
- Follow `.agents/skills/unslop/SKILL.md` ("quiet chrome, one bright moment", Warm/Graphite neutral ramps from `references/tokens.md`, sentence-case labels, weights `400`/`500`, `tabular-nums`, and 9 passes in order) when designing or refining UI screens.
- Keep shop-floor printable slips (`GRN`, `REQ`, `M-REQ`, `A-REQ`, `@media print`) 100% monochrome black-and-white.

## Everything Claude Code (ECC) & Playwright Verification Harness

This project installs **Everything Claude Code (`affaan-m/ECC`)** under `.agents/` and an automated **Playwright** E2E & visual QA harness (`playwright.config.ts`, `e2e/`), governed by the always-on rule [`.agents/rules/ecc-harness.md`](.agents/rules/ecc-harness.md).

Rules:
- Use the ECC workflows/skills under `.agents/` (`tdd-workflow`, `e2e-testing`, `browser-qa`, `click-path-audit`, `verification-loop`, `delivery-gate`) whenever applicable instead of ad-hoc shortcuts.
- Never skip automated browser verification or hand off UI/layout/interactive checks as "manual verification steps" for the user: run `npm run test:e2e` (isolated via `MES_DB_PATH` in `e2e/start-test-server.mjs`) and assert layout, viewport geometry, interactive states, and zero console/page/5xx errors in Playwright.
- Before claiming any task done, run the full post-edit verification sequence (`npm run lint`, `npm run test:unit`, `npm test`, `npm run build`, `npm run test:e2e`, `npm run graphify`, or `npm run verify:all`) with zero failures or skipped assertions.

## 1M Context Window & Low-Latency Execution Rules

Rules:
- **Precision `graphify` lookup first (`Lstart-Lend` + DOM `#id` index)**: Run `npx tsx scripts/graphify.ts query "<function or #dom-id>"` to get the exact `L<start>-L<end>` function range, DOM render line (`renders`), and event handler line (`handled_by`). Read **only** the returned line range in `src/main.ts`, `src/components/superUserView.ts`, `src/utils/requisitionLogic.ts`, or `src/style.css`—never browse those large files sequentially.
- **Leverage the full 1M token context window (read once, reuse from memory)**: Any file or section already read in the active conversation window stays in memory—never re-read a file that is already in context. When reading for the first time, load all target ranges in **1 single parallel `read_file` batch**.
- **Confirmation / planning questions ("is that understandable?", "what's your plan?")**: Answer immediately in 1 turn with **0 file reads** (or at most 1 `graphify` lookup). Do not read files until the user confirms to execute.
- **Zero re-reading between Planner and Executor**: Include exact `Target` snippets in `exit_plan_mode` so the execution model calls `edit_file` immediately on its first step using the shared 1M conversation context.
- **Fast iteration & targeted E2E**: During incremental edits, run `npm run lint` and a targeted Playwright filter (`npx playwright test -g "<test name>"`, ~4s) instead of all 9 E2E tests. Only run `docker compose up -d --build` when updating the live `:3000` container or when requested by the user.
