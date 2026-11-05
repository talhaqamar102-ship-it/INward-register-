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
