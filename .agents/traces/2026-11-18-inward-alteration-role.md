# Verification Trace — Grant `INWARD_CLERK` Alteration Bay & Stage 1 Return Role

- **Date:** 2026-11-18
- **Branch:** `feat/excel-catalog-dynamic-sizing` (left uncommitted in working tree until user requests commit)

## 1. Summary of Changes
1. **RBAC & Backend API Routes**:
   - `src/utils/requisition/policyRbacAndDemo.ts` (`L286`): Granted `'ALTERATION_CYCLE_UPDATE'` and `'SCRAP_CONDEMN'` to `ROLE_PERMISSIONS.INWARD_CLERK`.
   - `src/services/packingService.js` (`L1759`): Updated `PackingService.ROLE_PERMISSIONS.INWARD_CLERK` to match (`GRN_RECEIVE`, `REQ_ISSUE`, `ALTERATION_CYCLE_UPDATE`, `SCRAP_CONDEMN`).
   - `src/routes/api.js` (`L89-91`, `L315-324`): Permitted `INWARD_CLERK` on `/api/alterations` and `/api/alterations/:id/(return|repair)` and forwarded optional `pairsCount` to `completeAlterationRepair`.
   - `src/services/packingService.js` (`L1057-1160`): Wrapped `completeAlterationRepair` in `runAtomicWipStep` with partial-quantity split support (`pairsToProcess`), cleanly returning repaired pairs back to `packing_wip.step1_checking_in`.
2. **Inward UI Switcher & SQLite-Backed Stage 1 Return**:
   - `src/components/authView.ts` (`L80-120`): Rendered `Inward Register` (`#btn-inward-nav-grn`) and `Alteration Bay` (`#btn-inward-nav-repair`) toggle buttons for `INWARD_CLERK` with pending rework count.
   - `src/components/repairAndQcViews.ts` (`L24-27`, `L146-153`): Included open `ordersWipMap` alteration batches and wired real `[data-alt-return-id]` (`Return Stage 1`) and `[data-alt-scrap-id]` (`Scrap`) row actions.
   - `src/main.ts` (`L747-755`, `L885-895`, `L1785-1870`, `L5026-5048`, `L5124`): Permitted `INWARD_CLERK` screen switching (`screen-grn` / `screen-repair`), synced `/api/alterations` for `INWARD_CLERK`, preserved SQLite `altId`/`rawStatus`/`pairsCount`, and persisted repairs/partial returns/scrap to `POST /api/alterations/:id/repair` followed by `syncBackendData()`.
3. **Regression Tests**:
   - `src/utils/requisitionLogic.test.ts` (`L645-651`): Unit RBAC checks for `INWARD_CLERK`.
   - `test/http.test.js` (`L1130-1248`): Partial & full alteration return to Stage 1 by `INWARD_CLERK`.
   - `e2e/superuser-nav.spec.ts` (`L1341-1457`): Full browser flow from Stage 1 defect $\rightarrow$ `INWARD_CLERK` Alteration Bay $\rightarrow$ Return Stage 1 $\rightarrow$ reload persistence $\rightarrow$ `#wip-stg1-in = 10` (`#btn-wip-step1` re-enabled).

## 2. Verification (`npm run verify:all`, post-edit)
- `npm run lint` (`tsc --noEmit`): passed (`exit 0`)
- `npm run test:unit`: `32/32` passed (`0` failed, `0` skipped)
- `npm test`: `52/52` passed across `5` suites (`0` failed, `0` skipped)
- `npm run build` (`vite build`): passed (`24` modules, `47.52 kB` CSS, `410.02 kB` JS)
- `npm run test:e2e`: `14/14` passed (`41.8s`, `0` failed, `0` skipped)
- `npm run graphify`: rebuilt (`1071` nodes, `2230` edges, `8` communities)
