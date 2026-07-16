# Triad tessellation — spec

## Goal
Divide a selected polygon into **equilateral triangles ("triads")** as first-class
planning units. Pure client-side geometry (mirrors the tree grid); no backend changes.

## Behaviour
- **Source polygon:** the drawn shape (Shape builder) or the working polygon — same
  resolution as the tree grid (`drawnGeometry ?? workingPolygon`).
- **Tessellation:** equilateral triangular tiling — rows of alternating up/down
  triangles, side length `s` metres, row height `s·√3/2`.
- **Orientation:** a rotation angle (−90…90°) rotates the whole lattice around the AOI centre.
- **Edge handling:** clip boundary triangles to the polygon (full coverage). Interior
  triangles stay equilateral (`kind: "full"`); boundary units are clipped offcuts
  (`kind: "edge"`).
- **Numbering:** row-major sequential ids `T1, T2, …` (top→bottom, left→right).

## Components
- **`lib/geometry/triad.ts`** — `generateTriads(polygon, { sideLength, rotationDeg })`
  → `FeatureCollection` of triangle polygons with `properties { id, row, kind }`.
  Reuses the local-metric-frame + rotate-in/out helpers pattern from `treeGrid.ts`;
  clips each triangle to the polygon with `turf.intersect`. Also `triadsToGeoJSON`
  helper is unnecessary (already a FeatureCollection) — return it directly.
- **Store** — `triad: FeatureCollection | null`, `setTriad(fc)` (transient).
- **`components/map/LeafletMap.tsx`** — a `triadLayer` renders the polygons (grey
  fill; `edge` pieces slightly lighter) with the `id` as a centroid tooltip.
- **`components/panels/TriadPanel.tsx`** — new 2D sidebar section: side-length (m)
  input, rotation slider, **Generate triads**, count readout, **GeoJSON download**,
  **Clear**. Added to `Panels2D`.

## Testing
Unit tests on `generateTriads`: (a) a square yields a plausible triangle count and
both `full` + `edge` kinds; (b) rotation changes the output; (c) invalid input
(zero side length / no polygon) returns an empty collection.

## Out of scope
Frappe export, server-side save, per-triangle editing. (Can follow later.)
