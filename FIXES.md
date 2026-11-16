# Production Fixes

1. **Order identity and integrity:** Order references are assigned by the server from a transactional yearly sequence. Creating an order never updates an existing ID; creation and permitted deletion are audited, and deletion is blocked once GRN or requisition activity exists.
2. **Inward Register and Packing Hall:** GRN entries now respect each selected order’s remaining per-size and total quantities. Packing stages 1–3 keep passed and defect counts within the available input, forward passed pairs, and route defects to alteration without double-counting.
3. **Printing and Alteration Bay:** Slips print in a standalone window with an in-page fallback and cleanup. Alteration Bay supports saved tailor names and custom entry; repairs return pairs to Stage 1 and scrap/repair quantities update WIP.
