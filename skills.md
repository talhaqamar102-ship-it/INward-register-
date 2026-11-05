# Skills

Skills are the unified reusable capability layer for this project's dev team.
They come from the **dev-team plugin** of
[agentic-dev-team](https://github.com/bdfinst/agentic-dev-team) (vendored at
`.agentic-dev-team/plugins/dev-team/`). Every skill lives in
`plugins/dev-team/skills/<name>/SKILL.md`. User-invocable skills are shown as
slash commands (`/name`); agent-loaded knowledge modules are shown plain.

This catalog lists the skills this project actually uses, grouped by the same
capability sections the upstream `docs/skills.md` index generates. The complete
upstream index (all 99 skills) is at
[plugins/dev-team/docs/skills.md](.agentic-dev-team/plugins/dev-team/docs/skills.md).

## Core feature workflow

| Skill | Options | Description |
| --- | --- | --- |
| `/specs` | no flags — run directly | Produces the three specification artifacts (intent, architecture notes, acceptance criteria) that describe a change and its goals before any implementation. Resolves ambiguity with a human before build starts; no code until artifacts pass the consistency gate. |
| `/plan` | `<task-description> [--output <path>] [--yes]` | Creates a structured implementation plan with goal, acceptance criteria, incremental Code-First Small Batches steps, and a pre-PR quality gate. Decomposes into vertical slices with Gherkin scenarios up to five plan-review personas challenge. |
| `/build` | `[--plan <path>] [--yes] [--backstop-review=skip]` | Executes an approved plan in small per-behavior batches, one behavior at a time, refactor on every green, inline review checkpoints, verification evidence. |
| `/pr` | `[--skip-review] [--draft] [--base <branch>]` | Runs the pre-PR quality gate (tests, typecheck, lint, code review), then opens a pull request with a structured summary. |
| `/continue` | no flags — run directly | Resumes in-progress work by reading phase progress files in `.claude/memory/` and active plans. Use at session start on unfinished work. |
| `/ship` | `<feature-description> [--skip-spec] [--no-auto-merge]` | Runs the full spec-to-merge pipeline as one command, pausing at the existing human gates. |
| `/triage` | `<bug description or error> [--pdf]` | Investigates a bug to root cause, writes a portable triage record with a TDD fix plan. |

## Code review and static analysis

| Skill | Options | Description |
| --- | --- | --- |
| `/code-review` | `[--agent <name>] [--since <ref>] [--path <dir>] [--json] [--static-analysis]` | Runs all enabled review agents against target files; gates every `git commit` via the PreToolUse hook until a passing review exists. Auto-fixes actionable issues, re-runs until clean (up to 5 iterations). |
| `/review` | same flags as `/code-review` | Alias for `/code-review`. |
| `/review-agent` | `<agent-name> [--since <ref>] [--path <dir>]` | Runs one named review agent (e.g. `security-review`) against target files. |
| `/frontend-architecture` | `[--path <dir>] [--since <ref>]` | Frontend component-architecture review: reusable-component extraction, duplicated UI patterns, prop drilling. Advisory. |
| `/semantic-scan` | `[path] [--full] [--no-opus]` | Detects business logic reimplemented across architectural layers (service / client / presentation). |
| `/semgrep-analyze` | `[path] [--rules <ruleset>]` | Static analysis via Semgrep; the pre-review gate when security findings are needed first. |
| `/graphify` | `[path] [update \| query "<q>" \| path "<A>" "<B>" \| explain "<node>"]` | Builds, queries, and incrementally updates the whole-project knowledge graph in `graphify-out/` (`graph.json`, `GRAPH_REPORT.md`, `wiki/index.md`, `graph.html`). Installed at `.claude/skills/graphify/SKILL.md` and auto-triggered after code edits via `PostToolUse` hook (`npm run graphify`). |

## Testing and coverage

| Skill | Options | Description |
| --- | --- | --- |
| `/test-improve` | `<repo-path> [--analyze-only] [--stack <id>]` | Consolidated analyze-then-improve test orchestrator; 10 phases, human gates, baselines coverage (and mutation when enabled) before any test change. |
| `/legacy-code` | no flags — run directly | Safely modify untested code: characterization tests and dependency-breaking before behavioral changes. Relevant to `src/main.ts` and `packingService.js`. |
| `/exploratory-testing` | no flags — run directly | Charter-driven probing of a running feature with structured heuristics and adversarial expansion. |
| `/property-based-testing` | `<module> <function>` | Generates a property-based test from a function's signature/docstring (round-trip or invariant). |
| `/mutation-testing` | no flags — run directly | Validates suite quality via a real mutation tool; AI value is triage of surviving mutants. |

## Debugging

| Skill | Options | Description |
| --- | --- | --- |
| `/systematic-debugging` | no flags — run directly | Four-phase protocol (reproduce, investigate, root-cause, fix); prevents guess-and-fix thrashing. Use on any test failure or bug. |
| `/fix` | no flags — run directly | Focused defect-fix workflow for small, well-understood problems. |
| `/ci-debugging` | no flags — run directly | Debug failed CI runs; maps failures to fix strategies. |

## Design

| Skill | Options | Description |
| --- | --- | --- |
| `/design-doc` | no flags — run directly | Written design doc in `docs/specs/` with user approval before planning. Use during Research for architectural change. |
| `/design-interrogation` | no flags — run directly | Interviews the user about a plan to surface unresolved decisions and edge cases — a thinking tool, not artifacts. |
| `/api-design` | no flags — run directly | Contract-first API design for `/api/*` endpoints, incl. backward-compatibility checklist and error contracts. |
| `/domain-driven-design` | agent-loaded | DDD knowledge module; use for packing-hall stage modeling. |
| `/ui-ux-pro-max` | `<query> [--design-system \| --domain <color\|ux\|chart\|typography\|style>]` | Searchable UI/UX design intelligence engine (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py` / `npm run uupm`). Installed at `.claude/skills/ui-ux-pro-max/SKILL.md` alongside `.claude/skills/{design,design-system,ui-styling,brand,banner-design,slides}`. |

## Docker & infrastructure

| Skill | Options | Description |
| --- | --- | --- |
| `/docker-image-create` | no flags — run directly | Creates or audits the Dockerfile with hardening best practices. |
| `/docker-image-audit` | no flags — run directly | Structural audit of the Docker image config. |

## Setup, session, and safety

| Skill | Options | Description |
| --- | --- | --- |
| `/setup` | `[--yes] [--dry-run]` | Provisions the repo for the plugin end to end: prerequisite tools, project config, PostToolUse formatting hook. |
| `/project-init` | `[--yes] [--force]` | Detects the tech stack, inventories existing static-analysis tooling, installs what's missing. |
| `/careful` / `/freeze <glob>` / `/guard <glob>` | see file | Safety modes: block destructive commands; scope-lock editing. `/guard` = both — use for session touching `data/` or the print engine. |
| `/help` | `[--all]` | Lists workflows; `--all` lists every user-invocable slash command. |
| `/handoff` | no flags — run directly | Compress or fork context into a structured artifact for another session. |

## How routing works

Describe a task in natural language; the **Orchestrator agent** dispatches to
the right skill/agent and loads only the minimum viable context. The four
commands above are the backbone:

    /specs → /plan → /build → /pr

Bug fixes can skip `/specs`; trivial changes go straight to implementation.
Human approval gates sit between /specs→/plan and /plan→/build.
