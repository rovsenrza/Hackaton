---
version: 1
slug: "web-src-components-app-tsx"
primary_target: "web/src/components/App.tsx"
related_targets: ["web/src/components"]
---

# Surface brief: AYAN app shell (map + hub plan, dashboard, data, methodology, quality)

Scope: whole web app, visual redesign only; function, data and copy preserved. Mode: Operate (demo-led today).
Audience/scene: hackathon jury watching a projector in a lit hall at 16:30; operator clicks through the 1:20 demo path (PRODUCT.md). Light ground, because a lit room washes dark UI and the user rejected the dark control room.
Constraints: Azerbaijani copy unchanged; engine-offline fallback; what-if ~0.5 s; map legibility first; no marketing gloss, no government-portal dullness.

## Direction contract

THESIS: Every hub is evaluated like a BakıKart tap: instant, binary-clear, the decisive number first. Refuses the dark neon control room and the generic white SaaS GIS panel.

OWN-WORLD: Cool card-stock ground (#F5F7FA) and pure white card panels with ID-1 card corners, divided by 1px steel seams (#D3DAE3), no decorative shadow. BakıKart cobalt (#1F5BB5) owns brand, primary action and proposed hubs. Validator screen: an inset ink panel (#0E1A2B) carrying the key figure in large tabular numerals. State vocabulary from the validator: green (#12A150) confirms/measured, red (#D7372F) denies, cobalt = model, steel outline = scenario. Unserved demand is a warm amber-to-coral heat on a light grey basemap. Type: Manrope throughout, Montserrat only for the AYAN wordmark. The build sequence is drawn as the logo's road: asphalt band, white dashed lane line, cobalt stops.

STORY: The juror sees where Baku is unserved, taps a hub and gets a validator-clear verdict with its evidence, taps any street and watches AYAN place a hub in half a second, then sees the same-budget comparison at one honest scale.

FIRST VIEWPORT: Full-bleed light map. Top: white card bar, AYAN mark + wordmark left, segmented tab slots centre-left, 2D/3D toggle and cobalt Kopilot button right, engine status as a validator LED. Left: layer card. Right: inspector card opening with the ink validator screen (72%, ~2 065 000 people) and the cobalt "Öz hub-unuzu yoxlayın" primary action. Bottom: the road-styled build sequence, stops 1–20.

FORM: assigned direction, position 6 of the grounded list (BakıKart validator / turnstile / ticket machine), seed key 5210a96c. Raises: hairline seams and persistent panels (console); one fixed scale for comparisons (folio); selected hub dims the rest (wall); one control drives the whole scene live (specimen). Signature interaction: the what-if tap ripple on the map plus the validator verdict strip in the inspector.
ROLL EVIDENCE (verbatim script output): "DIRECTION CONCEPT SEED (key: 5210a96c; mode: operate; source: api; approved pool: c3b204a1eed6; 306/564 human-approved; rerun with --scope direction --mode operate --from 5210a96c --candidate-count 7 to reproduce this roll against this catalog revision)" · "ASSIGNED INDEX: 6" · telemetry `concept-seed --kind assigned --from 5210a96c --scope direction --mode operate` → "choice recorded".

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
