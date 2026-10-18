# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary audience for the current design: the TransportTech hackathon jury (İRİA × AYNA, 18.10.2026), seeing the app live on a projector during a 4-minute pitch with a 1:20 live demo, then 3 minutes of Q&A. The jury includes AYNA's Data Science lead (Nəqliyyat Strategiyası), an AYNA IT architect, an İRİA startup lead and a studio founder. The longer-term user the product is built for is AYNA's planning and strategy departments, working at a desk.

## Product Purpose

AYAN tells AYNA where to build multimodal mobility hubs in Baku, in what order, how many people each serves, and what CO₂ it saves. All coverage is measured on the real walking network (400 m, ~5 minutes). Success today: a juror leaves able to repeat "with the same budget, AYAN gets ×7.5 more new trips than random placement", having seen the map, a hub's evidence card and a live what-if.

## Positioning

Not a map of existing infrastructure but a decision tool: it computes where to build (MCLP over ~3,000 real transit-node candidates), places each hub on legal sidewalk space, and validates against baselines (center-effect-free AUC 0.76 vs 0.54; independent Apar data 0.69). Every number carries its status: measured, model, or scenario.

## Operating Context

- Live demo on a projector at 16:30, browser full screen at 100% zoom; backup screen recording in `pitch/demo_backup.mp4`.
- Demo path: unserved-demand map → Beynəlxalq Avtovağzal arrival score (2.9/5) → build-sequence hub #1 (20 Yanvar) with its real walking isochrone → what-if click (~0.5 s) → dashboard "Eyni büdcə, fərqli seçim" table → 3D twin.
- The app must keep working when the engine is offline (static fallback mode).

## Capabilities and Constraints

- Next.js 15 + MapLibre GL + deck.gl; key-free basemap (OpenFreeMap); Azerbaijani UI only.
- Screens: map + hub plan (layers rail, inspector, build sequence), Rəhbərlik paneli (dashboard), Data (data requests), Metodologiya, Keyfiyyət (data-quality center), AYAN Kopilot (Claude), 2D planning / 3D digital twin modes.
- Five transport layers (bus stations, bus routes, metro, bike parking, bike lanes) plus AYNA exchange hubs, rail stations, H3 unserved-demand heat map, proposed hubs (new / upgrade / integrate), live AYNA buses and live Apar vehicles.
- All functionality, data and copy stay as they are; this round changes the visual design only.

## Brand Commitments

- Name: AYAN. Brand mark: a cobalt-blue letter "A" drawn as a winding road with lane markings, with a car, bike and bus riding it (source: `~/Downloads/WhatsApp Image 2026-10-17 at 4.57.28 PM.jpeg`).
- Cobalt blue from the mark is binding. The tagline "Ağıllı Yol Analitika Naviqasiyası" is not required in the app.

## Evidence on Hand

- Real metrics: `web/public/data/metrics.json`, `hubs.json`, `h3_r9.json` (pipeline output); validation, equal-budget comparison, arrival scores.
- Pitch deck `pitch/AYAN_pitch.pptx`, script `pitch/PITCH.md`, methodology `docs/PLAN.md`.
- No customers, pilots, prices or testimonials exist; none may be implied.

## Product Principles

1. Decision over display: every screen answers where, in what order, and with what benefit.
2. Every number shows its provenance (measured / model / scenario) and a unit; no false precision.
3. The map stays legible first: layers must never blur into each other or hide the numbers.
4. The demo never stops: offline fallback and fast what-if are part of the product.
5. Avoid the dark "hacker" control room, the marketing-site gloss, and the dull government-portal look.
