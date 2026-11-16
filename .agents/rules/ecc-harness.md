---
trigger: always_on
description: Enforce Everything Claude Code (ECC) skills/workflows and automated Playwright browser verification wherever UI, behavior, or code changes apply. Never skip verification or defer checks to manual user testing.
---

## ECC & Playwright Verification Harness

This workspace includes **Everything Claude Code (`affaan-m/ECC` / `ecc-universal`)** under `.agents/` (`rules/`, `skills/`, `workflows/`, `agents/`) and an automated **Playwright E2E & visual QA harness** (`playwright.config.ts`, `e2e/`, `npm run test:e2e`).

### Mandatory Rules
- **Never skip verification or punt to manual user checks**: Whenever a task adds or modifies UI, DOM markup, CSS styles, responsive layout, navigation, authentication, forms, modals, interactive handlers, client state, API contracts, or print CSS (`@media print`), you MUST verify the live rendered application with automated Playwright assertions before declaring work complete. Do NOT instruct the user to open `localhost` and check layout, overflows, focus, or interactions manually.
- **Follow ECC workflow & specialists**:
  - Read and apply the matching `.agents/skills/*/SKILL.md` and `.agents/workflows/*.md` guides when their domain applies:
    - `tdd-workflow` / `common-testing`: Write or update failing regression tests first (unit + E2E where behavior changes) before implementing fixes.
    - `e2e-testing` / `typescript-testing`: Cover critical user journeys, nav states, auth flows, form validation, and error-free runtime behavior in Playwright specs under `e2e/` (`test:e2e`, isolated via `MES_DB_PATH=.playwright-tmp/e2e.sqlite`).
    - `browser-qa` / `click-path-audit`: Audit live desktop/mobile viewports (`1440x900`, plus `768px`/`375px` when responsive layout changes), bounding boxes, text clipping, horizontal overflow, console/page/5xx network errors, and keyboard focus restoration.
    - `verification-loop` / `delivery-gate`: Run the full post-edit verification sequence before reporting completion.
- **Hard verification gate (run after final edits, with zero failures/skips)**:
  1. `npm run lint` (`tsc --noEmit`)
  2. `npm run test:unit` (`tsx --test src/utils/requisitionLogic.test.ts`)
  3. `npm test` (API/DB/enterprise integration suite)
  4. `npm run build` (`vite build`)
  5. `npm run test:e2e` (`playwright test` against isolated `MES_DB_PATH` test server — never touch `data/gloves_packing.db`)
  6. `npm run graphify` (keep `graphify-out/` synced after code changes)
- **Shortcut**: `npm run verify:all` runs steps 1–6 in sequence. Only report results you directly observed after the final edit.
