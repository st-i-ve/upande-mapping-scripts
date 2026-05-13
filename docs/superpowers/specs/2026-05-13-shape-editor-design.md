# Shape Editor — Design Spec

**Date:** 2026-05-13
**Status:** Approved (brainstorming complete, ready for implementation plan)
**Scope:** Frontend-only feature added to the Bed & Zone Mapper webapp.

## Goal

Add a Photoshop-style shape editor as a new section inside the existing webapp sidebar. Users compose complex farm-block polygons from primitive rectangles and freehand strokes, manipulate them (rotate, scale from corners, duplicate, move), combine them with boolean operations (union / subtract / intersect), and either push the result into the existing bed/zone workflow or download it as GeoJSON.

Also fixes the existing "Saved outputs" list whose long filenames cause horizontal sidebar overflow.

## Non-goals

- Snapping (default off; can be enabled later via Geoman config).
- Multi-level undo/redo. Only a single-step undo for the last boolean op.
- Ellipse / circle primitives. Only rectangle + pencil.
- Server-side persistence. Shapes live in `localStorage` only.
- Touch/mobile gestures. Desktop mouse only.
- Integration with the existing section 2 "Saved shapes" (which holds named A/B/C anchor points — a different concept).

## Architecture

### New files

- `webapp/frontend/editor.js` — self-contained shape editor module. Exposes `ShapeEditor.init({ map, onUsePolygon })`. Holds all state (layers, selection set, active tool, last-op snapshot for undo). No global leakage beyond the `ShapeEditor` symbol.
- `webapp/frontend/editor.css` — scoped styles for the toolbar and selected/hovered shape outlines.

### Touched files (minimal edits)

- `webapp/frontend/index.html`
  - Load `leaflet-geoman-free` CSS + JS from CDN.
  - Load `@turf/turf` from CDN.
  - Load `editor.css` and `editor.js`.
  - Add `<section id="shape-editor-section">` between sections 7 and 8.
  - Small inline bootstrap calling `ShapeEditor.init({ map, onUsePolygon })`.
- `webapp/frontend/app.js`
  - Expose `map` and a thin `onUsePolygon(geom)` callback that runs `geom` through `normalizeToPolygonGeometry`, calls `setPolygon(geom)`, then `schedulePreview()`. ~10 lines.
- `webapp/frontend/style.css`
  - Replace the `.outputs li` rules to stack filename above actions and allow wrapping. (See "Sidebar overflow fix" below.)

### Dependencies (CDN)

- `@geoman-io/leaflet-geoman-free` (~110 KB gz) — draw, edit, rotate, scale handles, cut.
- `@turf/turf` (~85 KB gz) — `union`, `difference`, `intersect`, `simplify`, `centroid`, `bbox`.

### Map layer model

A dedicated `editorLayer = L.featureGroup()` is added to the map and holds every shape the editor owns. It is fully separate from `drawn`, `previewLayer`, `terraceLayer`, etc. Each shape is an `L.Polygon` whose `feature.properties` carries:

```js
{ id: <uuid>, name: <string>, source: "rect"|"pencil"|"merged" }
```

`feature.properties.source` lets the UI hint which shapes are derived vs. primitive.

## UI

### Sidebar section markup (compact, fits existing column width)

```
9. Shape builder
   Tools:   [⬚ Rect] [✎ Pencil ▾] [↺ Rotate] [⤢ Scale] [⎘ Duplicate] [🗑 Delete]
   Select:  Click = one · Ctrl+Shift+Click = add/remove · Esc = clear
   Combine: [Merge] [Subtract] [Intersect]   (enabled when ≥2 selected)
   Output:  [Use as polygon →]  [Download GeoJSON]
   Shapes:  3 · Selected: 2
   ─────
   [📦 Save shapes locally]  [Clear all]
```

The `✎ Pencil ▾` is a split button. Click body = activate the current pencil mode. Click caret = toggle between **Freehand** and **Click vertices**. Active mode shown in the label (`✎ Freehand` / `✎ Vertex`).

### Tool semantics

- **Rect**: click-drag draws an axis-aligned rectangle. On release, switches to selection mode; the rectangle is auto-selected.
- **Pencil — Freehand**: mousedown begins a stroke, mousemove samples points, mouseup auto-closes the ring back to start and runs `turf.simplify(tolerance ≈ 0.5 m)` to decimate. Strokes that decimate to <3 distinct vertices are discarded silently.
- **Pencil — Vertex**: each click drops a vertex (rubber-band line to cursor). `Enter` or clicking the first vertex closes. `Esc` cancels.
- **Rotate**: activates Geoman rotateMode on selected shapes. Visible handle above each shape. `Shift` snaps to 15°. Rotation is performed in a **local metric frame**: project the polygon to a meter plane centered on its centroid (equirectangular projection is fine at farm scale), rotate, unproject. This avoids the lat-vs-lng degree-length mismatch.
- **Scale**: corner + edge handles drawn around the selection bbox in a local metric frame. Dragging a corner scales both axes; dragging an edge scales one axis. `Shift`-drag a corner preserves aspect ratio. Will use Geoman's `scaleMode` if it is in the free distribution at implementation time; otherwise we build the handles ourselves (~80 LOC — eight `L.divIcon` markers around the bbox, mousedown→mousemove→mouseup transforming all vertices in the metric frame). See risk register.
- **Duplicate**: clones GeoJSON of each selected shape, offsets by `(+8 m east, −8 m south)` in metric frame, assigns new IDs, selects the copies (originals are deselected).
- **Delete**: removes selected shapes. `Del` key also bound.

### Multi-select

- Plain click on a shape → single-select (deselects others).
- `Ctrl+Shift+Click` on a shape → toggle membership in selection set.
- `Esc` → clear selection.
- Click on empty map → clear selection.
- Visual: selected shapes get a dashed orange outline (`stroke-dasharray: 6 4`, `color: #ea580c`). Unselected use solid blue (`#0f6fd1`).

### Boolean buttons

- All operate on the current selection (≥2 shapes); disabled otherwise.
- Subtract uses the **first-clicked** shape as the base; the rest are cutters. The status line shows e.g. `Base: rect-#3 · Cutters: 2`.
- After the op: originals are removed from `editorLayer`, the result is inserted with `source: "merged"`, auto-selected.
- A single-step `[Undo]` button reverses the last boolean op (restores originals, removes result). After any non-boolean change the undo buffer clears.

## Boolean operation behavior

| Op | ≥2 selected, all overlap | ≥2 selected, none overlap | Has holes? | Result type |
|---|---|---|---|---|
| **Merge (union)** | One Polygon | MultiPolygon (multiple disjoint parts) | preserved | Polygon \| MultiPolygon |
| **Subtract** | First shape minus rest | First shape unchanged; status: "no overlap" | base holes preserved; cuts may create new holes | Polygon \| MultiPolygon |
| **Intersect** | Common overlap region | Empty → status: "no intersection, nothing changed" | preserved | Polygon \| MultiPolygon \| nothing |

Implementation: pairwise reduction across the selection set via `turf.union` / `turf.difference` / `turf.intersect`. "no overlap" and "no intersection" cases show a status hint and leave originals untouched.

## "Use as polygon →" handoff

- If `editorLayer` holds exactly one shape (any source): that's the working polygon.
- If multiple shapes exist: button is disabled, hint: *"Merge or select one shape first."*
- Geometry runs through the existing `normalizeToPolygonGeometry` helper, then `setPolygon(geom)` and `schedulePreview()` — the existing bed/zone preview, terrace, block, and Frappe export flows immediately work on the new polygon.

## Download GeoJSON

- Wraps all `editorLayer` shapes into a `FeatureCollection`, including their `source` and `name` properties.
- Filename: `shape-builder-YYYYMMDD-HHMMSS.geojson`.
- Implemented client-side via `Blob` + anchor element; no backend call.

## Persistence

- **Save shapes locally** serializes the editor `FeatureCollection` to `localStorage` under key `shapeEditor.shapes.v1`.
- On page load, if that key exists and is non-empty, restore the shapes into `editorLayer` without auto-selecting anything.
- **Clear all** wipes `editorLayer` and removes the localStorage key after a confirm dialog.
- Storage key is versioned (`v1`) so a future schema change can ignore old data instead of corrupting state.

## Sidebar overflow fix

`webapp/frontend/style.css:221-228` currently:

```css
.outputs li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  padding: 6px 4px;
  border-bottom: 1px solid var(--border);
}
```

Combined with long filenames like `output-20260513-103045-aoi-block-18-b.geojson` and four flex children, the row overflows the aside → page-level horizontal scrolling.

Replacement:

```css
.outputs li {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  padding: 8px 4px;
  border-bottom: 1px solid var(--border);
  min-width: 0;
}
.outputs li > a:first-child {
  font-weight: 500;
  word-break: break-all;
  overflow-wrap: anywhere;
}
.outputs .actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
```

And in `loadOutputs` (`app.js:1538-1568`), wrap the three action anchors in a `<div class="actions">` instead of appending them as siblings of the filename link.

## Error handling

- All `turf.*` calls are wrapped in try/catch. On exception: status line shows the error string, shapes remain untouched.
- Pencil strokes with <3 distinct vertices after decimation → discarded silently (no status).
- Rotate/scale guard against degenerate zero-area shapes (skip the op, surface a status hint).
- `JSON.parse` of `localStorage` data wrapped in try/catch; on parse error or schema mismatch, log to console and ignore.

## Testing

### Manual checklist (golden path)

1. Place 3 rectangles via Rect tool.
2. Rotate one of them by 30°.
3. Duplicate one of them.
4. Draw a freehand pencil shape that overlaps two rectangles.
5. `Ctrl+Shift+Click` two overlapping rectangles → Merge → one polygon.
6. Subtract a small shape from it → confirm a hole.
7. Intersect with another shape → smaller polygon at overlap.
8. **Use as polygon →** the bed/zone preview should render against the merged shape.
9. **Save shapes locally** → reload page → all shapes restored.
10. **Download GeoJSON** → open the file, confirm a valid `FeatureCollection`.

### Automated

- A single `tests/editor_geom.test.js` (Node, no browser) imports `@turf/turf` and asserts:
  - Union of two adjacent unit squares produces a 2×1 rectangle with the correct area.
  - Difference of a smaller square inside a larger one produces a polygon with a hole.
  - Intersect of two overlapping squares produces a square of expected size.
- No backend tests needed; this is entirely frontend.

## Risk register

| Risk | Mitigation |
|---|---|
| Geoman's CSS clashes with existing sidebar styling | Scope Geoman overrides in `editor.css`; namespace any global rules under `.shape-editor`. |
| turf bundle is large (~85 KB gz) | If page-weight becomes a problem, replace umbrella import with `@turf/union`, `@turf/difference`, `@turf/intersect`, `@turf/simplify` sub-modules. Defer until measured. |
| Boolean ops on self-intersecting freehand strokes fail | Run `turf.unkinkPolygon` on freehand shapes before storing; if it produces multiple pieces, keep the largest. |
| `localStorage` corruption from a partial write | Versioned key + parse-fail fallback wipes state cleanly. |
| Sidebar still feels crowded after adding section 9 | New section is compact; consider future move to a dedicated tab if it grows. |
| Geoman free may not include `scaleMode` (Pro-only) | First implementation step verifies. If absent, fall back to a small custom corner/edge-handle shim (~80 LOC) drawn around the selection bbox in metric frame. Behavior contract for users is identical either way. |

## Implementation order (sketch — will be expanded by writing-plans)

1. CDN deps + bootstrap (Geoman, turf, editor stubs visible in UI but inert).
2. Sidebar overflow fix.
3. Rect tool + selection + delete.
4. Multi-select + visual feedback.
5. Rotate (Geoman rotateMode) + Scale (Geoman scaleMode if available in free, else custom shim).
6. Duplicate.
7. Pencil freehand mode.
8. Pencil vertex mode.
9. Boolean ops (union, subtract, intersect) + one-step undo.
10. "Use as polygon →" and "Download GeoJSON".
11. Persistence (Save / Restore / Clear).
12. Manual + scripted tests, polish.
