GOAL:    Viewer immediately grasps how Meridian Works MES enforces end-to-end gloves order traceability, buyer QC protocols, transactional Dock Pool gating, and 5-stage floor WIP reconciliation with zero phantom inventory.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps
TIME:    28.0 s x 30 fps = 840 frames; 120 BPM (15 frames per beat, 30 frames per 2 beats)
LOOK:    ground #0B1120 with subtle precision telemetry grid (#1E293B at 0.35 opacity) and radial vignette (24%);
         elevated surfaces #0F172A & #FFFFFF UI product plates; primary ink #F8FAFC on dark / #0F172A on paper;
         accents: cobalt #2563EB (orders/WIP), emerald #16A34A (reconciled/save/buyer CTA), sky #0284C7 (Material Req / AQL 1.5), amber #D97706 (Dock/Thorough 100%);
         display face Fira Sans 800 (64px-88px titles, tracking -0.03em), body face Fira Sans 400/600 (24px-32px), mono face Fira Code 500/700 (18px-24px tabular data);
         depth: crisp browser chassis frame (16px radius, 2px #334155 stroke, 0 28px 70px rgba(0,0,0,0.55) contact shadow).
OBJECTS: Real Meridian Works MES 1920x1080 product screens (Super User Command Center, Section 2 Buyer Split Workbench, Section 1 Contractor Split Order Form, Module 1 Inward GRN Register, Module 2 Packing Hall 5-Stage WIP & Material Req Gate, Live Tracking Reconciliation Card), geometric animated traceability architecture nodes, live telemetry counters, and an audio waveform pulse.
MOTION:  arrivals expo.out (0.45s - 0.65s), slides power3.out (0.4s), continuous progress/bars linear, exits power3.in (0.28s);
         strict gsap.fromTo() inside every <template>; no CSS initial transform conflicts; child animation inside timed .clip wrappers.
SHOTS:
  1. 0.00s - 4.50s (scene-01-intro, frames 0-135): Cold open dark telemetry grid -> brand emblem + "Meridian Works MES" -> staggered 3-pillar pipeline badges (Super User -> Inward Dock -> 5-Stage Packing) -> clean slide-up transition.
  2. 4.50s - 9.50s (scene-02-buyers, frames 135-285): Section 2 Flagship Buyer Master Split Workbench plate glides into dual-pane hero frame while left telemetry rail highlights 4-Card Bento KPI strip, Onboarding Dock, and RANDOM (AQL 1.5) vs THOROUGH (100%) QC protocol badges.
  3. 9.50s - 14.50s (scene-03-orders, frames 285-435): Section 1 Master Order Creation + Multi-Contractor Share Split UI plate zooms into size matrix (7/S - 11/XXL) & 100% balanced split bar + Delivery Countdown urgency states.
  4. 14.50s - 19.50s (scene-04-inward, frames 435-585): Module 1 Inward Goods Receiving UI plate with animated callout pills showing order-locked Article & Colour, mandatory Received From carrier verification, and transactional Dock Pool FIFO draw.
  5. 19.50s - 24.50s (scene-05-packing, frames 585-735): Module 2 Packing Hall 5-Stage WIP plate + animated stage-gate bar showing Stage 1 -> Stage 2 -> Stage 3 Pair Matching unlocking the Material Requisition slip, Stage 4 Polybagging, Final QC AQL Gate, Stage 5 Master Cartons, and 2-Cycle Alteration Bay rework loop.
  6. 24.50s - 28.00s (scene-06-reconcile, frames 735-840): Live Order Traceability plate (1 Order -> 3 GRNs -> 3 REQs) paired with animated pair-conservation equation (Planned = Unreceived + Dock + WIP + Packed + Scrap) -> emerald RECONCILED ✓ seal -> Meridian Works MES closing title.
BANNED:  floating microscopic text under 2.6% short side (<28px on 1080p), cropped screens, empty first frame, CSS filter blur on footage, un-keyframed static 3s+ holds, unstyled templates outside <template>.
QA:      Check frames at 2.2s, 7.0s, 12.0s, 17.0s, 22.0s, 26.2s with npx hyperframes snapshot + npx hyperframes check --json (0 errors).
