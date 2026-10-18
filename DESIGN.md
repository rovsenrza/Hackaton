---
name: AYAN
description: Baku mobility-hub planner drawn as a BakıKart validator on a light card-stock map.
colors:
  cobalt: "#1F5BB5"
  cobalt-deep: "#17468C"
  cobalt-tint: "#E8EFFA"
  on-accent: "#FFFFFF"
  confirm-green: "#12A150"
  confirm-tint: "#E4F5EB"
  deny-red: "#D7372F"
  steel: "#8E9AA8"
  card-stock: "#F5F7FA"
  card-white: "#FFFFFF"
  sunk-panel: "#F2F5F9"
  seam: "#D3DAE3"
  card-edge: "#C9D2DD"
  seam-strong: "#B9C3CF"
  ink: "#0E1A2B"
  muted-slate: "#5A6779"
  ink-text: "#F3F6FA"
  ink-muted: "#9FB0C6"
  asphalt: "#2B3748"
  bar-neutral: "#AEB9C6"
  metro-red: "#D6403A"
  bus-steel-blue: "#6683A8"
  bike-green: "#12A150"
  parking-mps: "#16864A"
  parking-mpv: "#56C487"
  ayna-teal: "#0A8C8C"
  rail-grey: "#5F6B78"
  rail-dark: "#2A323B"
  live-bus-amber: "#FFB020"
  basemap-land: "#EDF1F5"
  basemap-water: "#C6D6E6"
  basemap-park: "#DCE9DF"
  basemap-building: "#DDE3EA"
  basemap-road: "#FFFFFF"
  basemap-label: "#76849A"
typography:
  wordmark:
    fontFamily: "Montserrat, Manrope, sans-serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.02em"
  lcd:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "2.9rem"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.03em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 800
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title-sm:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 500
    lineHeight: 1.4
  label:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 600
    lineHeight: 1.3
  caption:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "10.5px"
    fontWeight: 500
    lineHeight: 1.25
rounded:
  bar: "3px"
  row: "8px"
  ctl: "9px"
  screen: "10px"
  seg: "11px"
  card: "14px"
  full: "9999px"
spacing:
  row: "7px"
  inset: "10px"
  rail: "14px"
  gutter: "16px"
  board: "20px"
components:
  button-primary:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.on-accent}"
    typography: "{typography.body}"
    rounded: "{rounded.ctl}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.cobalt-deep}"
  button-outline:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.cobalt}"
    rounded: "{rounded.ctl}"
    padding: "8px 12px"
  button-outline-hover:
    backgroundColor: "{colors.cobalt-tint}"
  button-quiet:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.ctl}"
    padding: "8px 12px"
  card:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.gutter}"
  validator-screen:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ink-text}"
    typography: "{typography.lcd}"
    rounded: "{rounded.screen}"
    padding: "14px 16px 12px"
  segmented:
    backgroundColor: "{colors.sunk-panel}"
    textColor: "{colors.muted-slate}"
    rounded: "{rounded.seg}"
    padding: "3px"
  segmented-active:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.row}"
    padding: "6px 14px"
  verdict-ok:
    backgroundColor: "{colors.confirm-tint}"
    textColor: "{colors.confirm-green}"
    typography: "{typography.label}"
    rounded: "{rounded.ctl}"
    padding: "8px 10px"
  sunk-panel:
    backgroundColor: "{colors.sunk-panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.screen}"
    padding: "{spacing.inset}"
  hub-stop:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.full}"
    size: "30px"
---

# Design System: AYAN

## Overview

**Creative North Star: "The BakıKart Validator"**

Every hub is read the way a commuter reads a turnstile: one tap, one binary-clear answer, the decisive number first. The world is a cool, lit card-stock ground under a full-bleed light map, with pure white card panels floating at the edges, each cut by a single 1px steel seam rather than a shadow. Inside the inspector and the dashboard, an inset ink panel plays the validator's screen: dark, recessed, carrying one huge tabular figure and a short sentence of meaning.

Colour is a vocabulary, not decoration. BakıKart cobalt (taken from the AYAN mark) owns the brand, the primary action and every proposed hub; green confirms or marks a measured fact; red denies; steel outlines anything that is a scenario. Unserved demand is a warm amber-to-coral heat that lives only on the map. Density is a desk console: persistent panels, hairline rows, small but legible type, nothing animated except the tap.

The world refuses the dark neon control room and the generic white SaaS GIS panel. It stays light because a lit hall washes out dark UI, and it stays plain because every number has to read as evidence, not marketing.

**Key Characteristics:**
- Light card-stock ground, white ID-1-cornered cards, 1px steel seams, no decorative shadow.
- One inset ink validator screen per view, holding the key figure in 800-weight tabular numerals.
- Cobalt is brand, action and "model"; green is "measured/confirmed"; red is "denied"; steel is "scenario".
- The build sequence is drawn as the logo's road: asphalt band, white dashed lane, cobalt stops.
- One signature motion: the what-if tap ripple on the map and the verdict strip that answers it.

## Colors

A cool, near-monochrome card-and-ink neutral range carrying one binding brand blue and a validator's green/red/steel state set; transport hues appear only on the map and its legend.

### Primary
- **BakıKart Cobalt** (cobalt): brand wordmark, the primary button, proposed hubs on the map and in the road strip, walking isochrones, the "model" provenance dot, the AYAN row in comparisons, focus rings, selection and form accents. Darkens to **Deep Cobalt** (cobalt-deep) on hover; **Cobalt Wash** (cobalt-tint) fills outline-button hover, the highlighted AYAN table row and the "human review" tag.

### Secondary
- **Validator Green** (confirm-green): the "measured" provenance dot, the engine-online LED, the confirm verdict strip (on **Green Wash**, confirm-tint) and the ripple's settle-ok ring. Shares its value with the bike network on purpose: the same green means "real, on the ground".
- **Deny Red** (deny-red): the ripple's settle-deny ring and refusals. Never used as an accent.

### Tertiary
- **Scenario Steel** (steel): hollow provenance dot for scenario numbers, the caution verdict border, the outer ring of hubs integrated into AYNA exchange centres, and the neutral LED for middling arrival scores.

### Neutral
- **Card Stock** (card-stock): the page ground and map halo; also the label halo colour on the basemap.
- **Card White** (card-white): every panel, card and active segment.
- **Sunk Panel** (sunk-panel): segmented-control tray, nested evidence boxes, memo previews.
- **Steel Seam** (seam): row dividers, table rules, inner borders of quiet buttons and inputs.
- **Card Edge** (card-edge): the outer 1px border of every floating card; one step darker than the seam so cards hold their edge against the light map.
- **Strong Seam** (seam-strong): scrollbar thumbs.
- **Validator Ink** (ink): body text, the validator screen, the selected hub's fill, transit-terminal symbols.
- **Muted Slate** (muted-slate): secondary text, inactive tabs, row keys, captions.
- **Screen Text / Screen Muted** (ink-text, ink-muted): copy and units on the ink screen.
- **Asphalt** (asphalt): the road band in the build sequence.
- **Bar Neutral** (bar-neutral): every non-AYAN bar in a comparison.

### Map data hues
Baku's own transport signage is kept: **Metro Red** (metro-red, circle with white M), **Bus Steel-Blue** (bus-steel-blue, chosen so buses never read as cobalt hubs), **Bike Green** (bike-green) with **MPS Green** and **MPV Green** (parking-mps, parking-mpv) for the two parking lists, **AYNA Teal** (ayna-teal) for existing exchange centres, **Rail Grey / Rail Dark** (rail-grey, rail-dark) for ADY stations, and **Live Amber** (live-bus-amber) for real-time AYNA bus dots. The basemap is a pale cool grey (basemap-land, basemap-building) with soft blue water, faint green parks, white roads and slate labels, so every data layer sits above it.

The unserved-demand heat is a sequential YlOrRd-derived ramp whose two lowest classes are fully transparent; only above-median cells show, from pale amber (rgba 253,214,150,0.2) to coral (rgba 212,76,48,0.66).

### Named Rules
**The Validator Vocabulary Rule.** Cobalt means model or AYAN's proposal, green means measured or confirmed, red means denied, steel means scenario. A colour that carries one of these meanings never appears with another.

**The All-Cobalt Hub Rule.** Every hub type is cobalt; type is encoded by form, not hue: new is solid cobalt with a white ring, upgrade is a white centre with a cobalt ring, integrate is solid cobalt with a white ring and a steel outer ring. The selected hub turns ink with a cobalt halo.

**The Heat Stays On The Map Rule.** The amber-to-coral ramp is reserved for unserved demand. It never colours UI chrome, buttons or text.

## Typography

**Display Font:** Manrope (with system-ui, sans-serif)
**Body Font:** Manrope (with system-ui, sans-serif)
**Label/Mono Font:** Montserrat 700, for the AYAN wordmark only

**Character:** One humanist-geometric grotesque does everything, from 800-weight validator numerals down to 10.5px captions; Montserrat appears once, in the wordmark, to echo the logo's lettering.

### Hierarchy
- **LCD** (800, 2.9rem in the inspector and 2.4rem on the dashboard board, line-height 0.95, -0.03em, tabular): the decisive figure on the ink screen. Units follow at about 1.15rem bold in screen-muted.
- **Headline** (800, 2rem, tight tracking): page titles on dashboard, data and methodology views.
- **Title** (700, 18px, tight tracking): inspector subject and dashboard section headings.
- **Title Small** (700, 15px, tight tracking): card titles such as the layer card and build-sequence strip.
- **Body** (500, 13.5px; nav and buttons at 600): tab labels, evidence rows, layer names. Long-form intro copy runs 15px, relaxed, capped near 42rem.
- **Label** (600, 11.5px, sentence case): layer group headings, screen tags, KPI sources.
- **Caption** (500, 10.5px): road-strip stop names, legend ticks, provenance badges.

### Named Rules
**The Tabular Figures Rule.** Every number that can change or be compared is set with tabular numerals, from the LCD figure to the stop percentages under the road strip.

**The One-Wordmark Rule.** Montserrat is loaded at a single weight for the AYAN wordmark and is never used for headings or UI.

## Layout

The map view is full-bleed with persistent cards floating on a 16px inset gutter: a top bar of separate cards (mark and wordmark, segmented section tabs, primary Kopilot action, 2D/3D segmented toggle, engine LED); a 18.5rem layer card on the left and a 22.5rem inspector (24rem for Kopilot) on the right, both starting 5.25rem from the top and stopping above the build-sequence strip, which spans the bottom edge. Panels scroll internally; the map never scrolls. Report views (dashboard, data, methodology) sit on card stock in a centred column (max 72rem for the dashboard, 56-64rem for text views), opening with a 2rem headline, a muted intro and, on the dashboard, a four-cell ink KPI board that collapses to stacked cells on narrow screens.

Rhythm is compact: evidence rows are 7px top and bottom with a hairline between, cards pad 14-20px, sections on report pages separate by 40px.

### Named Rules
**The One Scale Rule.** Comparison bars share a single fixed scale so the AYAN row and every alternative are measured against the same maximum; the AYAN bar is cobalt and every other bar is bar-neutral.

**The Selection Dims The Rest Rule.** When a hub is selected, every other map layer drops to half opacity so the chosen hub and its walking zone carry the scene.

## Elevation & Depth

The system is flat. Cards separate from the map with a 1px card-edge border and no shadow; depth is conveyed by tone (white card on light map, sunk-panel trays inside cards) and by one inward move: the ink validator screen is recessed with an inset hairline and an inner top shade, so it reads as a screen set into the card rather than a layer above it.

### Shadow Vocabulary
- **Screen recess** (`box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06), inset 0 10px 24px -14px rgba(0,0,0,0.6)`): the validator screen only.
- **Active segment lift** (`box-shadow: 0 1px 2px rgba(14,26,43,0.12), 0 0 0 1px #D3DAE3`): the selected slot in a segmented control, the one place a surface rises.
- **LED halo** (`box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 18%, transparent)`): status LEDs.

### Named Rules
**The Seam Not Shadow Rule.** Floating cards are held by a 1px border, never a drop shadow. If a card disappears against the map, darken the edge, do not add blur.

## Shapes

Corners follow a card's ID-1 radius at the outside (14px) and step down as elements nest: segmented tray 11px, validator screen and nested panels 10px, buttons, inputs and verdict strips 9px, segments and list rows 8px, comparison bars 3px. Hubs, stops and LEDs are full circles; map symbols for AYNA centres, rail and bus terminals are rounded squares with a white or rail-grey stroke, and the metro symbol is a red disc with a white M, matching Baku signage. Borders are always 1px, except the 2px focus outline and the ripple rings.

## Components

### Buttons
Plain, firm and few: one cobalt action per region.
- **Shape:** gently rounded (9px).
- **Primary:** cobalt fill, white 700-weight label, 10px by 16px at 13.5-14px type. Used for "AYAN Kopilot" and the inspector's "test your own hub" call to action.
- **Hover / Focus:** fills deepen to cobalt-deep over 160ms ease-out; press nudges down 1px; focus shows a 2px cobalt outline at 2px offset. Disabled drops to 55% opacity with a progress cursor.
- **Outline:** 1px cobalt border, cobalt text, cobalt-wash fill on hover (AI memo action).
- **Quiet:** 1px seam border on white, ink or muted text, 13-14px 600 (fly-to, export, remove, reset).

### Chips
- **Segmented slots:** a sunk-panel tray (11px, 3px padding) with 8px slots; the active slot turns white with ink text and the active-segment lift, inactive slots are muted and darken to ink on hover. Used for section tabs and the 2D/3D toggle, each wrapped in its own card.
- **Provenance badge:** a 6px dot plus 10.5px 600 word, coloured by the Validator Vocabulary (filled green "measured", filled cobalt "model", hollow steel "scenario"), trailing the value in every evidence row.

### Cards / Containers
- **Corner Style:** 14px.
- **Background:** card-white on card-stock or map.
- **Shadow Strategy:** none; see Seam Not Shadow.
- **Border:** 1px card-edge.
- **Internal Padding:** 16px for inspector and data cards, 14px for the layer card, 20px for dashboard cards and the road strip's sides.
- **Nested panels:** sunk-panel fill, 1px seam, 10px corner, 10px padding.

### Inputs / Fields
- **Style:** white field, 1px seam border, 8-9px corner, 13px 500 text; checkboxes, radios and range sliders take cobalt as their accent colour, carets are cobalt.
- **Focus:** the global 2px cobalt outline.

### Navigation
Section tabs are a segmented control inside a white card in the top bar, 13.5px 600, horizontally scrollable when space runs out. The brand card to its left carries the cobalt mark image and the Montserrat wordmark in cobalt with a muted 11px descriptor that hides below the medium breakpoint. The engine status is its own small card with a validator LED: green when connected, muted while checking.

### Validator Screen (signature)
An ink panel (10px corner, screen recess) carrying one LCD figure with a muted unit, a 13px caption in screen-text at 85%, and an optional tag row under a 10%-white hairline holding an LED and a short label. On the dashboard the same screen becomes a four-cell KPI board divided by 10%-white seams.

### Evidence Row
A definition row: muted key left, 600-weight tabular value right with its provenance badge, 13.5px, 7px vertical padding, seam hairline between rows and none after the last.

### Verdict Strip (signature)
The inspector's answer to a what-if tap: a 9px-cornered strip with a 16px stroked check (confirm, green on green-wash) or a stroked exclamation (caution, ink text with a steel border, no fill). It enters once with a 700ms ease-out rise from 4px above.

### Tap Ripple (signature)
A click on any street spawns two cobalt rings (60px, 3.5px stroke, white keylines) pulsing outward every 900ms while the engine works; on reply one ring settles green (placed) or red (refused) and expands to 2.2x over 1100ms. Easing is cubic-bezier(0.16, 1, 0.3, 1). Hidden entirely under reduced motion.

### Road Strip (build sequence)
The bottom card draws the top 20 hubs as the logo's road: an asphalt band whose thickness (6-14px) scales with each hub's gain, a white dashed lane line, and 30px numbered stops styled by the All-Cobalt Hub Rule. Each stop shows a two-line 10.5px name and its cumulative share; stops scale to 110% on hover, and the selected stop turns ink with a cobalt halo.

## Do's and Don'ts

### Do:
- **Do** put the one decisive number of a view on an ink validator screen in 800-weight tabular numerals, with its unit and a one-sentence caption.
- **Do** attach a provenance badge (measured green, model cobalt, scenario steel) to every evidence value.
- **Do** separate floating cards from the map with the 1px card-edge border and a 16px gutter.
- **Do** encode hub type by ring and fill within cobalt, and dim all other layers to 50% when a hub is selected.
- **Do** draw every comparison at one fixed scale, AYAN in cobalt and every alternative in bar-neutral.
- **Do** keep Baku's real signage colours for metro, bus, bike, AYNA centres and rail on the map.

### Don't:
- **Don't** add drop shadows to cards or panels; depth comes from seams, tone and the recessed screen.
- **Don't** use cobalt for anything that is not AYAN's brand, proposal, model output or primary action.
- **Don't** let the amber-to-coral heat or the transport hues leak into UI chrome.
- **Don't** set headings or UI in Montserrat; it is the wordmark's face only.
- **Don't** turn the ground dark; the world is a light card-stock room by design.
- **Don't** animate anything beyond the tap ripple, the verdict rise and 160ms control transitions, and drop all of them under reduced motion.
