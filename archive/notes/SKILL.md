---
name: skill-library
description: "Master index of every skill available on this machine: the active Claude Code skills, all installed SKILL.md files, and the skill repositories saved in the local Repo Vault at http://127.0.0.1:3847/. Use whenever the user asks what skills exist, which skill to use for a task, where a skill lives, how to invoke or install one, or wants to find the right workflow. Also trigger on phrases like is there a skill for this, what can you do, do this properly, or what tools do you have, even if the word skill never appears."
---

# Skill Library — Master Index

A single lookup table for every skill on this machine. It is a **catalog, not a replacement** for the skills themselves: find the row, then open the referenced `SKILL.md` and follow it. Do not load every file at once.

- **49 unique installed skills** (53 files; 4 duplicates collapsed)
- **14 active built-in / plugin skills** with no local file
- **7 repos in Repo Vault**, exposing **17 additional skill files**

This file lives on the Desktop and is **not installed**; the `Skill` tool will not trigger it. To make it invocable, copy it to `SK\skill-library\SKILL.md`.

**Path shorthands** (expand before using):

| Alias | Full path |
|---|---|
| `SK` | `C:\Users\Hammad Ind\.claude\skills` |
| `PC` | `C:\Users\Hammad Ind\.claude\plugins\cache\anthropic-plugin-directory` |
| `MP` | `C:\Users\Hammad Ind\.claude\plugins\marketplaces\claude-plugins-official` |
| `SP` | `%USERPROFILE%\.claude\plugins\cache\anthropic-plugin-directory\superpowers\6.4.2-8ca22dba9a94\skills` |

---

## 1. Active process skills — Superpowers

These are invocable now and are the default process layer: they set the approach before implementation skills run.

| Skill | Use when | File |
|---|---|---|
| `using-superpowers` | Start of any conversation; skill-invocation discipline | `SP\using-superpowers\SKILL.md` |
| `brainstorming` | Any new feature, component, or behavior change — before code | `SP\brainstorming\SKILL.md` |
| `writing-plans` | You have a spec/requirements for a multi-step task | `SP\writing-plans\SKILL.md` |
| `executing-plans` | Executing a plan inline as the implementer | `SP\executing-plans\SKILL.md` |
| `subagent-driven-development` | Executing a plan with independent tasks in-session | `SP\subagent-driven-development\SKILL.md` |
| `dispatching-parallel-agents` | 2+ independent tasks with no shared state | `SP\dispatching-parallel-agents\SKILL.md` |
| `systematic-debugging` | Any bug, failing test, or unexpected behavior | `SP\systematic-debugging\SKILL.md` |
| `test-driven-development` | Any feature or bugfix, before implementation | `SP\test-driven-development\SKILL.md` |
| `requesting-code-review` | Task/feature complete, before merge | `SP\requesting-code-review\SKILL.md` |
| `receiving-code-review` | Acting on review feedback; verify, don't blindly agree | `SP\receiving-code-review\SKILL.md` |
| `verification-before-completion` | About to claim done/fixed/passing | `SP\verification-before-completion\SKILL.md` |
| `using-git-worktrees` | Feature work needing isolation from the workspace | `SP\using-git-worktrees\SKILL.md` |
| `finishing-a-development-branch` | Implementation done, tests pass — integrate or discard | `SP\finishing-a-development-branch\SKILL.md` |
| `writing-skills` | Creating/editing skills; verifying them before deploy | `SP\writing-skills\SKILL.md` |
| `diagnosing-superpowers` | A session went wrong; repeated work, ignored plans | `SP\diagnosing-superpowers\SKILL.md` |

---

## 2. Active skills with bundled files

| Skill | Use when | File |
|---|---|---|
| `skill-creator` | Create, edit, evaluate, or benchmark skills | `PC\skill-creator\41f619d61b99-12a7c5cc\skills\skill-creator\SKILL.md` |
| `frontend-design` | Distinctive visual design for new or reshaped UI | `PC\frontend-design\41f619d61b99-65ba16f3\skills\frontend-design\SKILL.md` |
| `claude-md-improver` | Audit/update/fix CLAUDE.md files | `PC\claude-md-management\1.0.0-41f619d61b99\skills\claude-md-improver\SKILL.md` |
| `security-audit` | Security questions, focused reviews, audits, pen tests | `SK\security-audit\SKILL.md` |
| `graphify` | Build, query, and auto-update whole-project knowledge graph (`graphify-out/`) before/after edits | `.claude/skills/graphify/SKILL.md` |
| `ui-ux-pro-max` | Searchable UI/UX design intelligence database (color palettes, typography, charts, 119 UX guidelines, design-system generator) | `.claude/skills/ui-ux-pro-max/SKILL.md` |
| `design-system` | Token architecture (primitive→semantic→component), industrial dashboard tokens | `.claude/skills/design-system/SKILL.md` |
| `ui-styling` | Production UI styling, contrast, and responsive layout patterns | `.claude/skills/ui-styling/SKILL.md` |

---

## 3. Active built-in skills (no SKILL.md on disk)

Invoke these through the `Skill` tool; their instructions load from the harness.

| Skill | Use when |
|---|---|
| `dataviz` | Any chart, graph, plot, dashboard, or visualization, in any medium — read before writing chart code |
| `update-config` | settings.json, hooks, permissions, env vars, automated behaviors |
| `keybindings-help` | Customizing keyboard shortcuts |
| `fewer-permission-prompts` | Reducing permission prompts with an allowlist |
| `loop` | Recurring prompts or interval-based tasks |
| `claude-api` | Claude API/SDK: model IDs, pricing, params, streaming, tool use, caching |
| `workflow-authoring` | Writing Workflow-tool scripts |
| `run` | Launching and driving this project's app to see a change working |
| `plugin-authoring` | Mods to Claude Code's interface: panels, bands, status line, toasts, hooks |
| `init` | Initialize a CLAUDE.md |
| `security-review` | Security review of pending changes on the current branch |
| `code-review` | Review a diff/PR (flags: low/medium/high/xhigh/max, --comment, --fix) |
| `code-review:code-review` | Plugin PR review (no local SKILL.md found) |
| `claude-md-management:revise-claude-md` | Update CLAUDE.md with session learnings |

---

## 4. Installed but not exposed in this session

Present on disk, usable if you read the file directly or enable the plugin. Grouped by purpose.

### Authoring: skills, plugins, commands, hooks, MCP

| Skill | Use when | File |
|---|---|---|
| `skill-development` | Create a skill, add it to a plugin, improve descriptions | `MP\plugins\plugin-dev\skills\skill-development\SKILL.md` |
| `plugin-structure` | Create/scaffold a plugin, understand plugin layout | `MP\plugins\plugin-dev\skills\plugin-structure\SKILL.md` |
| `plugin-settings` | Plugin settings, `.local.md` config, user-configurable plugins | `MP\plugins\plugin-dev\skills\plugin-settings\SKILL.md` |
| `command-development` | Slash commands, command arguments, frontmatter | `MP\plugins\plugin-dev\skills\command-development\SKILL.md` |
| `agent-development` | Subagents, agent frontmatter, when-to-use descriptions | `MP\plugins\plugin-dev\skills\agent-development\SKILL.md` |
| `hook-development` | PreToolUse/PostToolUse/Stop hooks, prompt-based validation | `MP\plugins\plugin-dev\skills\hook-development\SKILL.md` |
| `writing-hookify-rules` | Hookify rules and hook configuration | `MP\plugins\hookify\skills\writing-rules\SKILL.md` |
| `mcp-integration` | Add/configure an MCP server in a plugin or `.mcp.json` | `MP\plugins\plugin-dev\skills\mcp-integration\SKILL.md` |
| `build-mcp-server` | Build an MCP server; wrap an API for Claude | `MP\plugins\mcp-server-dev\skills\build-mcp-server\SKILL.md` |
| `build-mcp-app` | Interactive UI/widgets rendered inside MCP | `MP\plugins\mcp-server-dev\skills\build-mcp-app\SKILL.md` |
| `build-mcpb` | Package/bundle/distribute a local MCP server | `MP\plugins\mcp-server-dev\skills\build-mcpb\SKILL.md` |

### Claude Code operations and reporting

| Skill | Use when | File |
|---|---|---|
| `claude-automation-recommender` | Recommend hooks/subagents/skills/plugins/MCP for a codebase | `MP\plugins\claude-code-setup\skills\claude-automation-recommender\SKILL.md` |
| `claude-security` | Scan a repo, branch diff, or single commit for security issues | `MP\plugins\claude-security\skills\claude-security\SKILL.md` |
| `receipts` | Usage/impact report from local session transcripts | `MP\plugins\receipts\skills\receipts\SKILL.md` |
| `session-report` | Explorable HTML report of session usage and costs | `MP\plugins\session-report\skills\session-report\SKILL.md` |
| `project-artifact` | Publish a tabbed project status page | `MP\plugins\project-artifact\skills\project-artifact\SKILL.md` |
| `playground` | Self-contained interactive HTML explorers | `MP\plugins\playground\skills\playground\SKILL.md` |

### Messaging channels

| Skill | Use when | File |
|---|---|---|
| `discord:access` | Approve pairings, allowlists, DM/group policy for Discord | `MP\external_plugins\discord\skills\access\SKILL.md` |
| `discord:configure` | Save Discord bot token, configure the channel | `MP\external_plugins\discord\skills\configure\SKILL.md` |
| `imessage:access` | Approval and access policy for iMessage | `MP\external_plugins\imessage\skills\access\SKILL.md` |
| `imessage:configure` | Check iMessage channel setup and policy | `MP\external_plugins\imessage\skills\configure\SKILL.md` |
| `telegram:access` | Approval and access policy for Telegram | `MP\external_plugins\telegram\skills\access\SKILL.md` |
| `telegram:configure` | Save Telegram bot token, configure the channel | `MP\external_plugins\telegram\skills\configure\SKILL.md` |

### Math and hardware

| Skill | Use when | File |
|---|---|---|
| `math-olympiad` | IMO/Putnam/USAMO/AIME problems, adversarial checking | `MP\plugins\math-olympiad\skills\math-olympiad\SKILL.md` |
| `siege` | One hard math problem, multi-round judge/worker loop | `MP\plugins\math-proof\skills\siege\SKILL.md` |
| `solo` | One hard math problem, single-session staged reasoning | `MP\plugins\math-proof\skills\solo\SKILL.md` |
| `m5-onboard` | Flash/provision a fresh M5Stack ESP32 device | `MP\plugins\cwc-makers\skills\m5-onboard\SKILL.md` |
| `cardputer-buddy` | Iterate the Cardputer-Adv MicroPython app bundle | `MP\plugins\cwc-makers\skills\cardputer-buddy\SKILL.md` |

### Examples and templates

| Skill | Use when | File |
|---|---|---|
| `example-skill` | Demonstrate skill format; create a skill template | `MP\plugins\example-plugin\skills\example-skill\SKILL.md` |
| `example-command` | Demonstrate user-invoked skill frontmatter and layout | `MP\plugins\example-plugin\skills\example-command\SKILL.md` |

---

## 5. Repo Vault — local library at http://127.0.0.1:3847/

UI: `http://127.0.0.1:3847/` · API: `GET http://127.0.0.1:3847/api/v1/repositories`

None of these are installed. To use one: open the vault, use **Install skill**, or copy its `SKILL.md` into `SK\` under a new folder. Raw file pattern: `https://raw.githubusercontent.com/<repo>/<branch>/<path>`.

### `deepseek-ai/deepseek-harness` — 269k stars · status: to_explore
DeepSeek Harness — everything is a plugin.

| Skill | Use when | Path |
|---|---|---|
| `agent-experience` | Agent-experience guidance (no frontmatter description) | `.agents/skills/agent-experience/SKILL.md` |
| `cordis-styling-nitpicking` | Reviewing DeepSeek Harness Cordis plugins/helpers | `.agents/skills/cordis-styling-nitpicking/SKILL.md` |
| `dsh-archive-agent-notes` | Auditing, pruning, archiving Agent Notes | `.agents/skills/dsh-archive-agent-notes/SKILL.md` |
| `dsh-ci-test-reliability` | Designing/diagnosing CI-flaky tests and fixtures | `.agents/skills/dsh-ci-test-reliability/SKILL.md` |
| `dsh-client-ui-ux` | Client UI changes: tokens, reuse, feedback surfaces | `.agents/skills/dsh-client-ui-ux/SKILL.md` |

### `morluto/rea` — 399k stars · status: to_explore
Reverse engineer anything with agents, from app behavior down to native binaries.

| Skill | Use when | Path |
|---|---|---|
| `reverse-engineer-anything` | Native/managed/Electron/firmware/browser targets | `.agents/skills/reverse-engineer-anything/SKILL.md` |
| `rea-tool-design` | REA tools, CLI/MCP contracts, provider capabilities | `.agents/skills/rea-tool-design/SKILL.md` |
| `rea-analysis-optimization` | Optimize REA providers for context/latency/CPU/memory | `.agents/skills/rea-analysis-optimization/SKILL.md` |
| `rea-ci-tests-audit` | Audit REA CI and tests for false passes and drift | `.agents/skills/rea-ci-tests-audit/SKILL.md` |
| `rea-changelog-update` | REA changelogs and GitHub release notes | `.agents/skills/rea-changelog-update/SKILL.md` |

### `nextlevelbuilder/ui-ux-pro-max-skill` — 144k stars · status: to_explore
Design intelligence for professional UI/UX across platforms.

| Skill | Use when | Path |
|---|---|---|
| `design` | Brand identity, tokens, UI styling, logo generation | `.claude/skills/design/SKILL.md` |
| `design-system` | Token architecture (primitive→semantic→component), components | `.claude/skills/design-system/SKILL.md` |
| `brand` | Brand voice, identity, messaging, consistency | `.claude/skills/brand/SKILL.md` |
| `banner-design` | Social/ads/hero/print banners, multiple art directions | `.claude/skills/banner-design/SKILL.md` |
| `slides` | Strategic HTML presentations with Chart.js and tokens | `.claude/skills/slides/SKILL.md` |

### `cloudflare/security-audit-skill` — 57k stars · status: to_explore
Multi-phase security audits with independently verified, machine-readable findings.

| Skill | Use when | Path |
|---|---|---|
| `security-audit` | Same skill already installed locally at `SK\security-audit\SKILL.md` | `skills/security-audit/SKILL.md` |

### `heydamir/unslop` — 5.4k stars · status: to_explore
Turns vibecoded, AI-looking UI into a designed interface.

| Skill | Use when | Path |
|---|---|---|
| `unslop` | De-templating an AI-looking interface; finding a real design direction | `skills/unslop/SKILL.md` |

### `Ebony-Vinyl/dsh-our-free-model` — 57k stars · status: to_explore
A dsh plugin for free frontier-model access through OpenCode Zen / Kilo pools. No SKILL.md.

### `ranxianglei/billion-context` — 3.2k stars · status: to_explore
Context-compression plugin for month-long sessions and small context windows. No SKILL.md.

---

## 6. How to choose

1. **Process first.** New work → `brainstorming` → `writing-plans`; bugs → `systematic-debugging`; after changes → `verification-before-completion`.
2. **Then domain.** Match the row's "use when" to the task. Design → `frontend-design` or vault `design`. Security → `security-audit`. Charts → `dataviz`. Harness/config → `update-config`.
3. **Read, don't guess.** Open the referenced file and follow it; this index only routes.
4. **Vault skills need installing** before the `Skill` tool can invoke them.

## 7. Maintenance

Regenerate the inventory when skills change:

```bash
node C:\dev\tools\inventory-skills.mjs C:\dev\tools\skills-inventory.json
node C:\dev\tools\inventory-vault.mjs   C:\dev\tools\vault-inventory.json
```

Duplicates collapsed to one entry: `skill-creator`, `frontend-design`, `claude-md-improver`, `security-audit` each exist in both cache and marketplace (or jobs temp). The canonical paths above are the installed ones.
