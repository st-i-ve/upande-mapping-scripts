# Next.js migration — status & cutover runbook

The Next.js/TypeScript frontend (`webapp/web`) is built per the design in
`docs/superpowers/specs/2026-07-02-nextjs-migration-design.md`. The FastAPI
backend is unchanged.

## Where it runs

- **Live vanilla app:** `https://mapping.132.145.21.55.nip.io/` (FastAPI, port 8765) — untouched.
- **Next.js preview:** `https://mapping.132.145.21.55.nip.io/next` (`mapping-next.service`, port 3100, built with `NEXT_BASE_PATH=/next`).

## Milestone status

| M  | Scope | State |
|----|-------|-------|
| M0 | Scaffold, tokens, shadcn/Tailwind, UI primitives | ✅ |
| M1 | App shell / layout | ✅ |
| M2 | Field Console theme + live Leaflet map | ✅ |
| M3 | Reference points + Saved shapes (store + overlays) | ✅ |
| M4 | Polygon + Parameters + Generate (`/api/generate`) | ✅ |
| M5 | Shape builder (Geoman draw/edit) | ✅ baseline — boolean ops (∪ − ∩) deferred |
| M6 | Tree grid (client geometry) | ✅ baseline — rotation / masks / pivot deferred |
| M7 | Saved outputs (list / view / delete) | ✅ |
| M8 | 3D view | ✅ reuses `3d.html` verbatim via iframe |
| M9 | Deploy artifacts + cutover runbook | ✅ (this file) — **root cutover not yet performed** |

## Parity progress (post-M9)

- ✅ **Terrace mode** — pick stepped edge, block grouping (`1-3, 4, 5-7`),
  preview sections/blocks, feeds `custom_blocks` into Generate.
- ✅ **Boolean ops** — union / subtract / intersect on 2+ selected saved
  shapes (Turf), result saved as a new shape.
- ✅ **Shell restructure** — shadcn `sidebar-08` sidebar on the **right**
  wrapping the app; Photoshop-style **left tool rail**; **2D/3D unified as
  views** with a top-of-sidebar view switcher (3D reuses `legacy-3d.html`
  in the center canvas and enrolls its own toolset).

## Still deferred to reach full parity (before root cutover)

- Terrace advanced grouping sugar (per-sub corners / sub-splits / swap / pick-corner).
- Draw-time boolean ops in the shape builder + custom rotate/scale/snap handles.
- Tree-grid rotation, interactive pivot, and positive/negative masks.
- Native 3D tools in the sidebar (terrain exaggeration, sun angle, layer toggles).
- Basemap API-key panel (Mapbox / MapTiler / Stadia) + reference-point colors.
- Side-by-side parity QA against the live vanilla app.

## Cutover (when parity is confirmed)

1. Rebuild for root: `cd webapp/web && npm run build` (no `NEXT_BASE_PATH`).
2. Update `mapping-next.service`: remove the `NEXT_BASE_PATH=/next` line; `daemon-reload` + `restart`.
3. Swap the nginx locations per the CUTOVER block in `deploy/nginx.mapping.conf`
   (`/api` + `/tiles` + `/legacy` → FastAPI; `/` → Next), `nginx -t`, reload.
4. Smoke-test `/`, `/api/health`, `/legacy`, then announce.
5. **Rollback:** point nginx `/` back at `127.0.0.1:8765`, reload.

## Dev

```bash
cd webapp/web
npm run dev          # http://localhost:3000 ; /api proxied to uvicorn :8765
npm run typecheck && npm test && npm run build
```
