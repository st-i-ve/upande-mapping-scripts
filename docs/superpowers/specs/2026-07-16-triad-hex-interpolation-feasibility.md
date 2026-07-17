# Triad / hexagon interpolation — feasibility findings

**Date:** 2026-07-16
**Status:** ⚠️ **Exploratory — NOT a final build.** The triad/hex mapper is under
active development; the model, numbering, storage and rendering described here
can and will change as we align it with what the orchard/scouting side needs.
This doc records a feasibility study and a recommended direction, not a frozen
spec.

## Question

Can hexagon packing **predict the next triads** — including for **irregular
shapes** — so we materialise only a compact "constellation" (per-row endpoints +
boundary pieces) and reconstruct the rest, the way the orchard-tree map stores
only a row's first/last tree and interpolates the interior?

Short answer: **yes — high feasibility, low risk.** It's a direct port of the
orchard-tree row-endpoints-plus-interpolate approach.

## What exists today (`webapp/web/lib/geometry/triad.ts`)

- `generateTriads(polygon, { sideLength s, rotationDeg })` builds a **pointy-top
  hexagonal lattice** in a local metric frame:
  - `colStep = √3·s` (centre spacing within a row),
  - `rowStep = 1.5·s` (between rows),
  - alternate rows offset by `colStep/2`,
  - whole lattice rotated by `theta` about the AOI centre.
- **Each hexagon is sliced into its 6 equilateral triads** (centre → each edge),
  numbered `H{hex}-{tri}` (`hex` row-major, `tri` 1..6, plus a `row` counter),
  tagged `kind: "full"` (interior) or `"edge"` (boundary offcut).
- **Coverage is done by clipping:** every triad **and** the hex outline is run
  through `turf.intersect` against the polygon → **7 intersects per hexagon**,
  capped by `MAX_TRIANGLES = 40000` (~5,700 hexes, ~40k intersect calls).
- Triads are **client-side only** (`appStore`: `triad` / `triadHexes`, zustand
  persisted). The FastAPI backend (`webapp/backend/main.py`) only stores/serves
  generated GeoJSON and can export Frappe NDJSON — there is no per-view server
  fetch like the orchard trees.

**The ceiling today** is the per-triangle `turf.intersect` cost and the 40k cap.

## Key insight — the lattice is analytic, so it predicts itself

Every hex centre is a pure recurrence:

```
centre(row, col) = origin + rotate( col·colStep + rowOffset(row),  row·rowStep )
rowOffset(row)   = (row even) ? colStep/2 : 0
```

and each hex's 6 triad vertices follow from `centre`, `s` and `theta`. So given
the **lattice params + one seed hex, every other hex/triad is computed with
arithmetic** — no storage, no clipping, at any rotation. That is exactly
"one hexagon predefines the next."

The **only** non-analytic thing is where the polygon **cuts** the lattice — the
boundary.

## Recommended approach (mirrors the orchard-tree row trick)

1. **Classify, don't clip.** For each hex, a cheap **point-in-polygon** test on
   its centre + its 6 triad centroids sorts it into:
   - **interior** — all 6 inside → `kind:"full"`, emitted **analytically, no
     intersect**;
   - **outside** — skipped;
   - **boundary** — straddles the edge → the **only** case that runs
     `turf.intersect` (for exact clipped `edge` geometry).
2. **Clip cost O(area) → O(perimeter).** Interior hexes ≈ `area / hexArea`;
   boundary hexes ≈ `perimeter / colStep`. A plot that is 5,700 hexes today
   (≈40k intersects) becomes a few hundred boundary clips + analytic interior —
   and the 40k cap goes away.
3. **Row-run compaction = "first & last triad in a row."** Per hex-row, the
   in-polygon hexes form contiguous **runs** `{ row, firstCol, lastCol }`.
   Represent a tessellation as:
   - **lattice params** (origin lon/lat, `s`, `rotationDeg`, derived
     `colStep`/`rowStep`),
   - **per-row runs** (interior, reconstructed on demand),
   - **explicit clipped geometry for the boundary (`edge`) hexes only**.
   Interior triads are regenerated from `(row, col)`. This is the orchard
   `LINEAR` (endpoints+count → interpolate) vs `EXPLICIT` (edge, verbatim) split.

## Irregular shapes ✓

A concave polygon (or one with holes) yields **multiple runs per row** — the same
"obstacle row" case handled for orchard trees. `turf` point-in-polygon respects
holes/multipolygon, so the run breaks come for free and only boundary hexes in
each run are clipped. Irregular AOIs are covered, not a special case.

## Mapping to the goals

| Goal | How it's met |
|---|---|
| Hex packing predicts the next triads (even irregular) | Analytic lattice recurrence + PIP run-detection per row |
| One hex = 6 triads, sliced but kept in rows | Numbering unchanged; runs give first/last hex per row |
| Constellations predefine the others | Interior emitted from params; only boundary is materialised |
| "Easy like the orchard tree" | Same endpoints/interpolate + edge-explicit compaction; if ever persisted, payload is O(rows + boundary), not O(triads) |

## Feasibility verdict — High, low-risk

The generator already has the lattice, numbering, and full/edge concept. The
change is *how coverage is decided* (PIP-classify + analytic interior; clip only
the boundary) plus an optional compact representation for save/fetch. It is
self-contained to `triad.ts` (+ tests); no backend change is required for the
generation win.

**Caveats**
- "Interior" must test **all 6** triad centroids (a hex clipped on one edge is
  still `edge`).
- Exact boundary geometry still needs `turf.intersect`, but only on the few
  boundary hexes.
- If triads are later persisted/fetched server-side, mirror the orchard rows
  payload (params + runs + edge geoms) and reconstruct client-side.
- For very large AOIs, add viewport culling on render (as the avocado map does).

## Next step (test harness — separate, to be built after this doc)

Stand up a **Coffee** crop to exercise the triad analogy end-to-end without
touching rose/avocado:
- Add **Coffee** as a `Crop Scouted` record (like Rose / Avocado).
- The SCP Navigation custom-HTML block already renders a **dynamic per-crop
  tile** from `Crop Scouted`, so Coffee auto-gets a tile → `/scp_app#/coffee`
  (no block edit needed — confirm on load).
- Coffee only needs **Dashboard + Scouting map** (a trimmed coffee nav), reusing
  the crop-namespaced routing, to test the triad tessellation as the coffee
  "grid" (the avocado-map analogue).
- First milestone: **generate random triads** on the coffee map to validate the
  analytic-lattice + row-run reconstruction described above.

(Reminder: this is exploratory — the triad model/features may change as we
integrate; nothing here is final.)
