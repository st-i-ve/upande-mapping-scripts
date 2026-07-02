# Next.js Migration — Design

**Date:** 2026-07-02
**Status:** Approved (design); implementation in milestones
**Owner:** james@upande.com

## Summary

Migrate the Bed & Zone Mapper web frontend from a hand-written vanilla
HTML/CSS/JS app into a full **Next.js (App Router) + TypeScript** application,
so UI is built from reusable, testable components. The migration happens now,
while the codebase is still small, rather than after more features accrete.

The **FastAPI backend is not touched.** All heavy geometry (bed/zone
generation, terrace sectioning, Frappe export) stays in Python (`shapely`,
`pyproj`) behind the existing `/api/*` endpoints. The Next.js app is a client
that calls that API.

The **interactive map/editor is wrapped, not rebuilt.** The proven Leaflet +
Geoman + leaflet-draw + Turf logic moves nearly verbatim into imperative
TypeScript modules hosted inside one client component. Everything *around* the
map — the panels — is rebuilt as React components. This preserves exact editor
behavior (it is the same code) while delivering the component revamp elsewhere.

## Goals

- Full Next.js + TypeScript app; UI composed of reusable components.
- Identical runtime behavior to today's app ("works as it already does"),
  verified by parity QA before cutover.
- `lucide-react` icons throughout (replacing emoji/unicode glyphs).
- Keep the polished visual design already shipped (rounded corners, spacing,
  overflow fixes) — port the design tokens, do not restyle.
- No dark window: the current app stays live in production until the Next.js
  app reaches feature parity, then we cut over.

## Non-goals

- Rewriting the backend or porting geometry to JavaScript.
- Rebuilding the map declaratively on react-leaflet (explicitly deferred; the
  editor tooling is irreducibly imperative and rewriting it risks regressions).
- Changing the visual design language.
- Server-side rendering of map content (the map is client-only by nature).

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│ nginx (front door, TLS) — unchanged host                   │
│   /api/*  ───────────────►  FastAPI (uvicorn, systemd)      │  Python
│   /*      ───────────────►  Next.js (Node, new systemd svc) │  geometry
└───────────────────────────────────────────────────────────┘  UNCHANGED
```

- **Backend:** `webapp/backend` (FastAPI + shapely). Unchanged. Continues to
  serve `/api/generate`, `/api/preview`, `/api/terrace_sections`,
  `/api/outputs` (GET/DELETE), `/api/outputs/{f}/frappe`, `/api/health`.
- **Frontend (new):** `webapp/web` — Next.js App Router, TypeScript, Node
  runtime in production. Most components are client components; Next.js is used
  for structure, routing, the component model, and build tooling.
- **nginx** routes `/api/*` to uvicorn and everything else to the Next.js Node
  server. During development, Next.js `rewrites()` proxy `/api/*` to the local
  uvicorn dev server so the frontend calls same-origin `/api`.
- The current vanilla app (`webapp/frontend`) stays deployed until cutover.

## Directory structure (`webapp/web`)

```
app/
  layout.tsx              root layout (header, global styles)
  page.tsx                main mapper page (assembles panels + MapCanvas)
  3d/page.tsx             3D view (ported from 3d.html)
components/
  ui/                     reusable primitives
    Button.tsx  SectionCard.tsx  ListRow.tsx  Checkbox.tsx
    Toggle.tsx  Slider.tsx  StatusBadge.tsx
  panels/                 one component per sidebar section
    ReferencePointsPanel.tsx  SavedShapesPanel.tsx  PolygonPanel.tsx
    ParametersPanel.tsx       GeneratePanel.tsx      TreeGridPanel.tsx
    OutputsPanel.tsx          BasemapKeysPanel.tsx
  shape-builder/
    ShapeBuilderStrip.tsx  StripButton.tsx           (lucide-react icons)
  map/
    MapCanvas.tsx          'use client'; dynamic import ssr:false; hosts Leaflet
lib/
  map/                    ported imperative map code (from app.js/editor.js)
    controller.ts         map bootstrap, layers, overlays, generation rendering
    editor.ts             Geoman/leaflet-draw/custom handles/boolean ops
    geom.ts               editor-geom helpers
  geometry/               pure TS math (unit-tested, golden tests)
    treeGrid.ts  rotation.ts  masks.ts  terrace.ts
  api/                    typed fetch wrappers for /api/*
    client.ts  types.ts
  store/                  Zustand store(s) + localStorage persist
  types/                  shared domain types
styles/
  tokens.css              design tokens (ported CSS variables)
  globals.css             base/reset + tokens import
  *.module.css            per-component CSS Modules
public/
```

## Map wrapping strategy

- `MapCanvas` is a `'use client'` component loaded with `next/dynamic`
  (`ssr: false`) because Leaflet requires `window`.
- On mount it constructs the Leaflet map and instantiates a `MapController`
  (imperative). The controller owns all Leaflet layers, the editor, overlays,
  and rendering of generation/tree-grid/terrace results — logic lifted from the
  current `app.js`/`editor.js` with minimal change.
- **Panels never import Leaflet.** They dispatch intent to the store; a bridge
  (`useMapBridge`) wires store state/actions to `MapController` method calls and
  subscribes to controller events to push results (summaries, saved-shape lists,
  status) back into the store for panels to render.
- Third-party map libs (Leaflet, leaflet-draw, Geoman, Turf) are loaded as npm
  dependencies rather than CDN `<script>` tags.

## State & data flow

- **Zustand** store with `persist` middleware backing the same localStorage keys
  the current app uses (reference points, saved shapes, basemap API keys), so
  existing users keep their data across cutover.
- Flow: panel → store/controller → typed `/api` client → result → store →
  panels + map overlays.
- Generation is cancelable via `AbortController` (mirrors the existing Cancel
  button). API errors surface through a `StatusBadge` (mirrors today's `#status`).

## Styling & icons

- Port the polished design tokens (colors, radius scale, shadows) into
  `styles/tokens.css`; components use CSS Modules. **Same visual design.**
- `lucide-react` for icons; the glyph→icon mapping already worked out in the
  vanilla app carries over. Boolean set-operators (∪ − ∩) remain math glyphs
  (no faithful Lucide equivalent).

## Testing

- **Vitest + React Testing Library** for `ui/` primitives and panels.
- **Golden tests** for `lib/geometry/*`: capture current app outputs for sample
  inputs and assert the TypeScript port reproduces them numerically.
- **Playwright** smoke tests: draw polygon → generate → see results; shape
  builder rectangle → boolean op; reference-point add/delete.
- **Parity QA** before cutover: the old app stays live for side-by-side checks.

## Milestone roadmap

Each milestone keeps the app runnable and gets its own implementation plan
(via writing-plans). The current app stays live until M9.

| M  | Deliverable |
|----|-------------|
| M0 | Scaffold: App Router + TS, ESLint, Vitest, Playwright, tokens, `ui/` primitives, lucide-react, dev `/api` proxy to uvicorn |
| M1 | App shell + layout: header (with 3D link), panel aside, map slot |
| M2 | `MapCanvas`: Leaflet mount, base tile layers, layers control, Basemap keys panel |
| M3 | Reference points + Saved shapes panels (store + overlays, incl. checkbox multi-delete) |
| M4 | Polygon + Parameters + Generate (core `/api/generate` + `/api/preview` flow, results rendering) |
| M5 | Shape builder strip + editor tooling (port `editor.js`: move/rotate/scale/snap/boolean/undo) |
| M6 | Tree grid + masks + terrace mode (port Turf math to `lib/geometry` with golden tests) |
| M7 | Saved outputs panel (view/copy/download/delete + multi-select bulk delete) |
| M8 | 3D view page (port `3d.html`, MapLibre + three.js) |
| M9 | Next.js systemd service + nginx routing, parity QA, production cutover |

## Deployment & cutover

- Add a systemd unit running `next start` (Node) for `webapp/web`; build with
  `next build` on deploy.
- Update nginx: `/api/*` → uvicorn (unchanged), `/` → Next.js Node server.
- Cut over only after M9 parity QA passes. Keep `webapp/frontend` available at a
  fallback path (e.g. `/legacy`) for one release as a safety net, then remove.

## Risks & mitigations

- **Editor behavior drift** → wrap existing code verbatim; Playwright smoke +
  manual parity QA against the live old app.
- **Geometry math drift** (Turf port) → golden tests against captured outputs.
- **localStorage continuity** → reuse the exact existing keys/shapes via Zustand
  persist.
- **Deploy complexity** (new Node service) → isolated systemd unit; nginx change
  is a single `location` swap; old app kept as fallback.
- **Scope** → strictly milestone-gated; no feature additions during migration.
