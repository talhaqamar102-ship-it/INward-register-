# Receiving Hall UX, Option B Split Entry, and Live Save Date Fixes

Date: 2026-11-18
Branch: `feat/excel-catalog-dynamic-sizing`

## Implemented Changes
1. **Receive Button, Confirmation Popup, and Print Button Order ([src/main.ts](file:///c:/dev/Inward-register/src/main.ts), [src/utils/requisitionLogic.ts](file:///c:/dev/Inward-register/src/utils/requisitionLogic.ts))**:
   - Renamed primary submit button from `Print Receiving Slip` to `Receive`.
   - Removed automatic `printDocument(...)` trigger on Receive; instead opens `#global-modal` with `buildGrnReceiveConfirmationHtml` showing who it was received from, contractor(s), Order #, saved date, total pairs, and split breakdown above `#doc-preview-container` monochrome slip(s).
   - Placed `Print` first and `Close` second inside `#global-modal .modal-footer`; clicking `Print` triggers printing.
2. **Option B Multi-Contractor Split Receiving & Full Split Display ([src/main.ts](file:///c:/dev/Inward-register/src/main.ts), [src/utils/requisitionLogic.ts](file:///c:/dev/Inward-register/src/utils/requisitionLogic.ts))**:
   - Defaulted split orders (`contractorAllocations.length > 1`) on Dock #1 (`#grn-pending-order` change and `adminQuickReceiveGrnForOrder`) into the Option B `#grn-split-entry-table`, displaying all allocated contractors together with balance, `Received From`, and per-contractor capped size inputs in a single table.
   - Displayed `Split: <contractor breakdown>` across the GRN form header, confirmation popup, GRN slips (`Order Split`), and Store Register Master Table.
3. **Live Current Date (`DD-MM-YYYY`) Across GRN Save, Header & Slips ([src/main.ts](file:///c:/dev/Inward-register/src/main.ts), [src/components/packingHallView.ts](file:///c:/dev/Inward-register/src/components/packingHallView.ts), [src/utils/requisitionLogic.ts](file:///c:/dev/Inward-register/src/utils/requisitionLogic.ts))**:
   - Added shared `formatCurrentDateDDMMYYYY()` helper and replaced hardcoded `'31-10-2026'` / `'04-11-2026'` save and display dates across `POST /api/store/receivings`, confirmation modals, `.system-date-label` headers, and slip builders.
4. **Tests Added**:
   - `src/utils/requisitionLogic.test.ts`: `Receiving Hall fixes: live DD-MM-YYYY date, Option B split confirmation popup & slip split summary`.
   - `e2e/superuser-nav.spec.ts`: `Receiving Hall: Receive button, Option B multi-contractor split, confirmation popup with Print first, and live DD-MM-YYYY date`.

## Verification Results (`npm run verify:all`)
- `npm run lint` (`tsc --noEmit`): exit `0`
- `npm run test:unit`: `32` pass, `0` fail, `0` skipped
- `npm test`: `49` pass, `0` fail, `0` skipped (`5` suites)
- `npm run build` (`vite build`): exit `0` (`dist/assets/index-DizAOS6y.js`)
- `npm run test:e2e` (`playwright test` isolated via `MES_DB_PATH`): `13` pass, `0` fail (`53.3s`), `0` console/page/5xx errors
- `npm run graphify`: rebuilt (`1026` nodes, `2119` edges, `8` communities)
