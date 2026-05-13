# Shape Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Photoshop-style shape editor as a new sidebar section in the Bed & Zone Mapper webapp — rectangles + pencil + transform handles + boolean operations, plus a CSS fix for the existing "Saved outputs" list that overflows the sidebar.

**Architecture:** Frontend-only. A new self-contained `editor.js` module attaches to the existing Leaflet `map`, owns its own `L.FeatureGroup`, and exposes one callback (`onUsePolygon`) back to `app.js`. Heavy lifting is delegated to Leaflet-Geoman Community (draw + edit + rotate) and turf.js (boolean ops + simplify). Pure geometry helpers live in `editor-geom.js` so they can be unit-tested under Node.

**Tech Stack:** Leaflet 1.9.4 (existing), Leaflet-Geoman Community 2.16.x (new, CDN), Turf.js 7.x (new, CDN), vanilla ES2020 JS. No build step — frontend is served as static files from `webapp/frontend/`.

**Reference spec:** `docs/superpowers/specs/2026-05-13-shape-editor-design.md`

**How to run during development:**
```bash
cd /home/ubuntu/stive/code/mapping-script/upande-mapping-scripts/webapp
.venv/bin/uvicorn --app-dir backend main:app --host 127.0.0.1 --port 8765 --reload
# Open http://127.0.0.1:8765 in a browser. Hard-refresh after frontend edits.
```

**On TDD for this feature:** Most of the editor is browser-interactive (mouse drag, Leaflet events). Strict TDD on those is impractical without Puppeteer, which we are not adding. We TDD the *pure* parts: the metric-frame geometry math and the boolean-op wrappers, all isolated in `editor-geom.js` and tested with Node's built-in `node --test`. For UI tasks, each task ends with an explicit **manual verification checklist** the engineer must walk through in the browser before committing.

---

## File Map

**New files:**
- `webapp/frontend/editor-geom.js` — pure functions (metric-frame transforms, boolean-op wrappers, simplify+close). Imports turf via `window.turf` when in browser, via `import` when in Node tests.
- `webapp/frontend/editor.js` — UI orchestrator: state, tool dispatch, Geoman wiring, sidebar event handlers, persistence.
- `webapp/frontend/editor.css` — scoped styles for the editor toolbar and selected-shape outlines.
- `tests/editor-geom.test.mjs` — Node test for `editor-geom.js`.
- `tests/package.json` — declares `@turf/turf` dependency for the Node test.

**Modified files:**
- `webapp/frontend/index.html` — add CDN scripts, editor.css link, editor.js script, new sidebar section, init call.
- `webapp/frontend/app.js` — expose `map` and add an `onUsePolygon(geom)` hook (~12 lines added).
- `webapp/frontend/style.css` — fix `.outputs li` overflow (existing rules replaced).

---

## Phase 1 — Sidebar overflow fix (independent quick win)

### Task 1: Restyle `.outputs li` to stack filename above actions

**Files:**
- Modify: `webapp/frontend/style.css:215-236`

- [ ] **Step 1: Read the current rules to confirm the exact text to replace**

Run: `sed -n '215,236p' webapp/frontend/style.css`
Expected output exactly matches the `old_string` in step 2.

- [ ] **Step 2: Replace the `.outputs` block**

Replace this exact block in `webapp/frontend/style.css`:

```css
.outputs {
  list-style: none;
  padding: 0;
  margin: 8px 0 0;
  font-size: 12px;
}
.outputs li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  padding: 6px 4px;
  border-bottom: 1px solid var(--border);
}
.outputs li:last-child { border-bottom: 0; }
.outputs a {
  color: var(--accent);
  text-decoration: none;
  font-size: 11px;
  font-weight: 500;
}
.outputs a:hover { color: var(--accent-hover); text-decoration: underline; }
```

With:

```css
.outputs {
  list-style: none;
  padding: 0;
  margin: 8px 0 0;
  font-size: 12px;
}
.outputs li {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  padding: 8px 4px;
  border-bottom: 1px solid var(--border);
  min-width: 0;
}
.outputs li:last-child { border-bottom: 0; }
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
.outputs a {
  color: var(--accent);
  text-decoration: none;
  font-size: 11px;
}
.outputs a:hover { color: var(--accent-hover); text-decoration: underline; }
```

### Task 2: Wrap action anchors in `<div class="actions">`

**Files:**
- Modify: `webapp/frontend/app.js:1538-1568` (inside `loadOutputs`)

- [ ] **Step 1: Replace the `for` body in `loadOutputs`**

In `webapp/frontend/app.js`, replace this exact block:

```javascript
  for (const o of data.outputs) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = "/api/outputs/" + encodeURIComponent(o.filename);
    a.textContent = o.filename;
    a.download = o.filename;
    const view = document.createElement("a");
    view.href = "#";
    view.textContent = "view";
    view.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const r = await fetch("/api/outputs/" + encodeURIComponent(o.filename));
      if (r.ok) renderResult(await r.json());
    });
    const frappeCopy = document.createElement("a");
    frappeCopy.href = "#";
    frappeCopy.textContent = "copy frappe";
    frappeCopy.addEventListener("click", (ev) => {
      ev.preventDefault();
      copyFrappeFor(o.filename);
    });
    const frappeDl = document.createElement("a");
    frappeDl.href = "/api/outputs/" + encodeURIComponent(o.filename) + "/frappe";
    frappeDl.textContent = "frappe.txt";
    frappeDl.download =
      o.filename.replace(/\.geojson$/, "") + ".frappe.txt";
    li.appendChild(a);
    li.appendChild(view);
    li.appendChild(frappeCopy);
    li.appendChild(frappeDl);
    ul.appendChild(li);
  }
```

With:

```javascript
  for (const o of data.outputs) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = "/api/outputs/" + encodeURIComponent(o.filename);
    a.textContent = o.filename;
    a.download = o.filename;
    const actions = document.createElement("div");
    actions.className = "actions";
    const view = document.createElement("a");
    view.href = "#";
    view.textContent = "view";
    view.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const r = await fetch("/api/outputs/" + encodeURIComponent(o.filename));
      if (r.ok) renderResult(await r.json());
    });
    const frappeCopy = document.createElement("a");
    frappeCopy.href = "#";
    frappeCopy.textContent = "copy frappe";
    frappeCopy.addEventListener("click", (ev) => {
      ev.preventDefault();
      copyFrappeFor(o.filename);
    });
    const frappeDl = document.createElement("a");
    frappeDl.href = "/api/outputs/" + encodeURIComponent(o.filename) + "/frappe";
    frappeDl.textContent = "frappe.txt";
    frappeDl.download =
      o.filename.replace(/\.geojson$/, "") + ".frappe.txt";
    actions.appendChild(view);
    actions.appendChild(frappeCopy);
    actions.appendChild(frappeDl);
    li.appendChild(a);
    li.appendChild(actions);
    ul.appendChild(li);
  }
```

### Task 3: Manual verify and commit the sidebar fix

- [ ] **Step 1: Hard-refresh the page and inspect the outputs list**

Open http://127.0.0.1:8765 and open section 7 "Saved outputs". Click "Refresh" if empty.

Manual verification checklist:
- [ ] No horizontal scrollbar appears on the sidebar regardless of how long the filenames are.
- [ ] Filenames wrap onto multiple lines instead of overflowing.
- [ ] The three action links (`view`, `copy frappe`, `frappe.txt`) sit on a row below the filename and remain clickable.
- [ ] Clicking each action still works.

- [ ] **Step 2: Commit**

```bash
git add webapp/frontend/style.css webapp/frontend/app.js
git commit -m "fix(sidebar): stack saved-output filename above actions to stop horizontal overflow"
```

---

## Phase 2 — Scaffolding (CDN deps, empty module, sidebar markup)

### Task 4: Add Geoman + turf CDN tags to index.html

**Files:**
- Modify: `webapp/frontend/index.html:7-8` (CSS block) and `:278-280` (scripts)

- [ ] **Step 1: Add Geoman CSS link**

In `webapp/frontend/index.html`, replace this exact block:

```html
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css" />
```

With:

```html
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css" />
  <link rel="stylesheet" href="https://unpkg.com/@geoman-io/leaflet-geoman-free@2.16.0/dist/leaflet-geoman.css" />
  <link rel="stylesheet" href="/editor.css" />
```

- [ ] **Step 2: Add Geoman JS + turf + editor scripts**

In `webapp/frontend/index.html`, replace this exact block:

```html
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js"></script>
  <script src="/app.js"></script>
```

With:

```html
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js"></script>
  <script src="https://unpkg.com/@geoman-io/leaflet-geoman-free@2.16.0/dist/leaflet-geoman.min.js"></script>
  <script src="https://unpkg.com/@turf/turf@7.1.0/turf.min.js"></script>
  <script src="/editor-geom.js"></script>
  <script src="/app.js"></script>
  <script src="/editor.js"></script>
```

(Order matters: `editor-geom.js` defines `window.EditorGeom` for the editor to consume, and `editor.js` must load after `app.js` so it can read the exposed `map`.)

- [ ] **Step 3: Verify the page still loads with no console errors**

Hard-refresh http://127.0.0.1:8765 and open the browser devtools console.

Manual verification:
- [ ] Page loads.
- [ ] No 404s on the new CDN URLs in the network tab.
- [ ] Console has no errors. (The two new local scripts `editor-geom.js` and `editor.css` will 404 — that's expected until Tasks 5 and 6.)

- [ ] **Step 4: Commit**

```bash
git add webapp/frontend/index.html
git commit -m "feat(editor): load Geoman + turf + editor.{js,css} scripts"
```

### Task 5: Create empty editor-geom.js, editor.css, editor.js stubs

**Files:**
- Create: `webapp/frontend/editor-geom.js`
- Create: `webapp/frontend/editor.css`
- Create: `webapp/frontend/editor.js`

- [ ] **Step 1: Create `webapp/frontend/editor-geom.js`**

```javascript
// Pure geometry helpers for the shape editor.
// Works in two environments:
//  - Browser: turf is window.turf (loaded by CDN tag); module attaches to window.EditorGeom.
//  - Node test: import this file as an ES module after `import * as turf from "@turf/turf"`
//    is in scope; the factory takes turf as an explicit dep.

(function (globalRoot) {
  function makeEditorGeom(turf) {
    return {
      // populated by later tasks
    };
  }
  if (typeof window !== "undefined") {
    window.EditorGeom = makeEditorGeom(window.turf);
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { makeEditorGeom };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
```

- [ ] **Step 2: Create `webapp/frontend/editor.css`**

```css
/* Shape editor — scoped to .shape-editor namespace. */

.shape-editor .toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 6px 0;
}

.shape-editor .toolbar button {
  padding: 4px 8px;
  font-size: 12px;
}

.shape-editor .toolbar button.active {
  background: var(--accent);
  color: white;
}

.shape-editor .stat-line {
  font-size: 11px;
  color: var(--muted);
  margin: 4px 0;
}

.shape-editor .status {
  font-size: 11px;
  min-height: 14px;
  color: var(--muted);
  margin: 4px 0;
}

/* Selected polygon outline — applied via setStyle in editor.js. */
.shape-editor-selected {
  stroke-dasharray: 6 4;
}
```

- [ ] **Step 3: Create `webapp/frontend/editor.js`**

```javascript
// Shape editor UI orchestrator. Exposes window.ShapeEditor.
(function () {
  const ShapeEditor = {
    init({ map, onUsePolygon }) {
      this.map = map;
      this.onUsePolygon = onUsePolygon;
      this.editorLayer = L.featureGroup().addTo(map);
      this.shapes = new Map(); // id -> { layer, props }
      this.selection = new Set(); // set of ids
      this.activeTool = null;
      this.pencilMode = "freehand"; // or "vertex"
      this.lastBoolean = null; // {originals: [{id, geoJson}], resultId}
      this._wireSidebar();
      this._restoreFromLocalStorage();
      this._updateStats();
    },
    _wireSidebar() {
      // wired in later tasks
    },
    _restoreFromLocalStorage() {
      // wired in Task 30
    },
    _updateStats() {
      const el = document.getElementById("shapeEditorStats");
      if (!el) return;
      el.textContent = `Shapes: ${this.shapes.size} · Selected: ${this.selection.size}`;
    },
  };
  window.ShapeEditor = ShapeEditor;
})();
```

- [ ] **Step 4: Verify all three files load with no console errors**

Hard-refresh http://127.0.0.1:8765.

Manual verification:
- [ ] No 404s for `/editor-geom.js`, `/editor.css`, `/editor.js`.
- [ ] No console errors.
- [ ] `window.EditorGeom` and `window.ShapeEditor` are defined (check in console).

- [ ] **Step 5: Commit**

```bash
git add webapp/frontend/editor-geom.js webapp/frontend/editor.css webapp/frontend/editor.js
git commit -m "feat(editor): scaffold empty editor-geom/editor.{js,css} modules"
```

### Task 6: Add section 9 markup to index.html

**Files:**
- Modify: `webapp/frontend/index.html` (insert between section 7 and 8 — currently lines ~259-272)

- [ ] **Step 1: Insert the new section**

In `webapp/frontend/index.html`, find this exact block:

```html
      <section>
        <h2>7. Saved outputs</h2>
        <button id="refreshOutputs" class="secondary">Refresh</button>
        <ul id="outputs" class="outputs"></ul>
      </section>

      <section>
        <h2>8. Basemap API keys</h2>
```

Replace with:

```html
      <section>
        <h2>7. Saved outputs</h2>
        <button id="refreshOutputs" class="secondary">Refresh</button>
        <ul id="outputs" class="outputs"></ul>
      </section>

      <section class="shape-editor">
        <h2>9. Shape builder</h2>
        <p class="hint">Compose a complex polygon from rectangles and freehand strokes. Combine with boolean operations.</p>
        <div class="stat-line"><strong>Tools</strong></div>
        <div class="toolbar">
          <button id="seTool-rect" class="secondary" type="button">⬚ Rect</button>
          <button id="seTool-pencil" class="secondary" type="button">✎ Freehand</button>
          <button id="seTogglePencilMode" class="secondary" type="button" title="Toggle freehand / vertex">▾</button>
          <button id="seTool-rotate" class="secondary" type="button">↺ Rotate</button>
          <button id="seTool-scale" class="secondary" type="button">⤢ Scale</button>
          <button id="seDuplicate" class="secondary" type="button">⎘ Duplicate</button>
          <button id="seDelete" class="secondary" type="button">🗑 Delete</button>
        </div>
        <p class="hint">Click = select · Ctrl+Shift+Click = add/remove · Esc = clear</p>
        <div class="stat-line"><strong>Combine</strong></div>
        <div class="toolbar">
          <button id="seUnion" class="secondary" type="button" disabled>Merge</button>
          <button id="seSubtract" class="secondary" type="button" disabled>Subtract</button>
          <button id="seIntersect" class="secondary" type="button" disabled>Intersect</button>
          <button id="seUndo" class="secondary" type="button" disabled>Undo</button>
        </div>
        <div class="stat-line"><strong>Output</strong></div>
        <div class="toolbar">
          <button id="seUseAsPolygon" type="button" disabled>Use as polygon →</button>
          <button id="seDownload" class="secondary" type="button">Download GeoJSON</button>
        </div>
        <div class="stat-line" id="shapeEditorStats">Shapes: 0 · Selected: 0</div>
        <div class="status" id="shapeEditorStatus">Ready.</div>
        <div class="toolbar">
          <button id="seSave" class="secondary" type="button">📦 Save shapes locally</button>
          <button id="seClearAll" class="secondary" type="button">Clear all</button>
        </div>
      </section>

      <section>
        <h2>8. Basemap API keys</h2>
```

(Yes, section 9 is rendered *above* section 8 visually — adding it after section 8 would push the basemap keys further away from related settings. Keep the existing heading numbers; users have grown used to them. Renumbering basemap keys is out of scope.)

- [ ] **Step 2: Verify the section renders**

Hard-refresh http://127.0.0.1:8765.

Manual verification:
- [ ] Section "9. Shape builder" appears in the sidebar between sections 7 and 8.
- [ ] All buttons render. None of the buttons do anything yet (Use as polygon and the three Combine buttons should appear disabled).
- [ ] The stat line reads `Shapes: 0 · Selected: 0`.
- [ ] No console errors.
- [ ] Page does not horizontally scroll.

- [ ] **Step 3: Commit**

```bash
git add webapp/frontend/index.html
git commit -m "feat(editor): add shape-builder sidebar section markup"
```

### Task 7: Expose `map` from app.js and call `ShapeEditor.init` at bottom

**Files:**
- Modify: `webapp/frontend/app.js` (add at top after `const map = ...` and add init at bottom)

- [ ] **Step 1: Find the line that creates the map**

Run: `grep -n "^const map = L.map\|^let map = L.map\|map = L.map" webapp/frontend/app.js | head`

Note the line number; in the current code `map` is a top-level `const map = L.map(...)` (declared once near the top of the file).

- [ ] **Step 2: Add a `window.app` export immediately after the map is created**

Find the first occurrence of a non-trivial use of `map` (typically the line after `const map = L.map(...).setView(...)`). Append directly below it:

```javascript
// Expose minimal surface for sibling modules (editor.js).
window.app = window.app || {};
window.app.map = map;
```

- [ ] **Step 3: Add the `onUsePolygon` hook and the editor init at the end of `app.js`**

Append at the bottom of `webapp/frontend/app.js`:

```javascript
// ---- Shape editor bridge --------------------------------------------------
window.app.onUsePolygon = function (geom) {
  const normalized = normalizeToPolygonGeometry(geom);
  if (!normalized) {
    alert("Shape editor produced no usable polygon.");
    return;
  }
  setPolygon(normalized);
  schedulePreview();
};

if (window.ShapeEditor && typeof window.ShapeEditor.init === "function") {
  window.ShapeEditor.init({
    map: window.app.map,
    onUsePolygon: window.app.onUsePolygon,
  });
}
```

- [ ] **Step 4: Verify the editor initialised**

Hard-refresh http://127.0.0.1:8765.

Manual verification:
- [ ] In the console, `window.ShapeEditor.shapes` is a `Map(0)`.
- [ ] In the console, `window.ShapeEditor.editorLayer` is a Leaflet feature group with 0 layers.
- [ ] Stat line still reads `Shapes: 0 · Selected: 0`.
- [ ] No errors in console.

- [ ] **Step 5: Commit**

```bash
git add webapp/frontend/app.js
git commit -m "feat(editor): bridge ShapeEditor to app's map and currentPolygon"
```

---

## Phase 3 — Editor geometry helpers (TDD)

These tasks build up `editor-geom.js` with unit tests. Each task adds one helper and its test. The Node test setup is bootstrapped first.

### Task 8: Bootstrap Node test setup

**Files:**
- Create: `tests/package.json`
- Create: `tests/editor-geom.test.mjs`

- [ ] **Step 1: Create `tests/package.json`**

```json
{
  "name": "upande-mapper-tests",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test ."
  },
  "dependencies": {
    "@turf/turf": "7.1.0"
  }
}
```

- [ ] **Step 2: Install the test dependency**

```bash
cd tests
npm install
cd ..
```

Expected: `tests/node_modules/` is created with `@turf/turf` inside. Adds maybe 200 packages but only `@turf/turf` is direct.

- [ ] **Step 3: Add `tests/node_modules` to gitignore**

In `.gitignore`, add a new line at the end:

```
tests/node_modules
```

- [ ] **Step 4: Create `tests/editor-geom.test.mjs` with a trivial sanity test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import * as turf from "@turf/turf";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { makeEditorGeom } = require("../webapp/frontend/editor-geom.js");
const geom = makeEditorGeom(turf);

test("editor-geom module loads", () => {
  assert.equal(typeof geom, "object");
});
```

- [ ] **Step 5: Run the test to verify the test infrastructure works**

Run: `cd tests && npm test`
Expected: 1 test passes (`editor-geom module loads`).

- [ ] **Step 6: Commit**

```bash
git add tests/package.json tests/package-lock.json tests/editor-geom.test.mjs .gitignore
git commit -m "test: bootstrap node:test runner for editor-geom"
```

### Task 9: Implement `toMetric` / `fromMetric` projection helpers (TDD)

**Files:**
- Modify: `webapp/frontend/editor-geom.js`
- Modify: `tests/editor-geom.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/editor-geom.test.mjs`:

```javascript
test("toMetric and fromMetric round-trip at the equator", () => {
  const origin = [0, 0]; // [lng, lat]
  const point = [0.001, 0.001]; // ~111 m east, ~110 m north
  const m = geom.toMetric(point, origin);
  assert.ok(Math.abs(m[0] - 111.32) < 0.1, `x≈111.32 m, got ${m[0]}`);
  assert.ok(Math.abs(m[1] - 110.54) < 0.1, `y≈110.54 m, got ${m[1]}`);
  const back = geom.fromMetric(m, origin);
  assert.ok(Math.abs(back[0] - point[0]) < 1e-9);
  assert.ok(Math.abs(back[1] - point[1]) < 1e-9);
});

test("toMetric handles latitude offset (cos compression)", () => {
  const origin = [35.5, 0.05]; // near the project's actual area
  const east1deg = [36.5, 0.05];
  const m = geom.toMetric(east1deg, origin);
  // 1 degree lng at cos(0.05°) ≈ 111320 m (basically uncompressed near equator)
  assert.ok(Math.abs(m[0] - 111320) < 100);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd tests && npm test`
Expected: tests fail with `TypeError: geom.toMetric is not a function`.

- [ ] **Step 3: Implement `toMetric` / `fromMetric` in `editor-geom.js`**

In `webapp/frontend/editor-geom.js`, replace the empty return inside `makeEditorGeom`:

```javascript
return {
  // populated by later tasks
};
```

With:

```javascript
const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LNG_EQUATOR = 111320;
function toMetric(point, origin) {
  // point: [lng, lat], origin: [lng, lat] → [x_m, y_m]
  const cosLat = Math.cos((origin[1] * Math.PI) / 180);
  const x = (point[0] - origin[0]) * M_PER_DEG_LNG_EQUATOR * cosLat;
  const y = (point[1] - origin[1]) * M_PER_DEG_LAT;
  return [x, y];
}
function fromMetric(m, origin) {
  const cosLat = Math.cos((origin[1] * Math.PI) / 180);
  const lng = origin[0] + m[0] / (M_PER_DEG_LNG_EQUATOR * cosLat);
  const lat = origin[1] + m[1] / M_PER_DEG_LAT;
  return [lng, lat];
}
return { toMetric, fromMetric };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd tests && npm test`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add webapp/frontend/editor-geom.js tests/editor-geom.test.mjs
git commit -m "feat(editor-geom): add toMetric/fromMetric projection helpers"
```

### Task 10: Implement `rotateRing` and `rotateGeometry` (TDD)

**Files:**
- Modify: `webapp/frontend/editor-geom.js`
- Modify: `tests/editor-geom.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/editor-geom.test.mjs`:

```javascript
test("rotateGeometry rotates a square 90° around its centroid", () => {
  const square = {
    type: "Polygon",
    coordinates: [[
      [35.5, 0.05],
      [35.5001, 0.05],
      [35.5001, 0.0501],
      [35.5, 0.0501],
      [35.5, 0.05],
    ]],
  };
  const rotated = geom.rotateGeometry(square, 90); // degrees CCW
  // After 90° CCW around the centroid, vertices have permuted positions
  // but the bbox in metric space should have the same dimensions swapped.
  const c = turf.centroid(square).geometry.coordinates;
  const cRot = turf.centroid(rotated).geometry.coordinates;
  assert.ok(Math.abs(c[0] - cRot[0]) < 1e-9, "centroid lng unchanged");
  assert.ok(Math.abs(c[1] - cRot[1]) < 1e-9, "centroid lat unchanged");
  // Verify area is preserved (allow 0.1% tolerance for projection round-trip)
  const a1 = turf.area(square);
  const a2 = turf.area(rotated);
  assert.ok(Math.abs(a1 - a2) / a1 < 0.001, `area preserved (${a1} vs ${a2})`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd tests && npm test`
Expected: fails with `geom.rotateGeometry is not a function`.

- [ ] **Step 3: Implement `rotateGeometry` in `editor-geom.js`**

Inside `makeEditorGeom`, before the `return`, add:

```javascript
function rotateRing(ring, originLngLat, radians) {
  const cosA = Math.cos(radians);
  const sinA = Math.sin(radians);
  return ring.map((pt) => {
    const [x, y] = toMetric(pt, originLngLat);
    const xr = x * cosA - y * sinA;
    const yr = x * sinA + y * cosA;
    return fromMetric([xr, yr], originLngLat);
  });
}
function rotateGeometry(geomObj, degrees) {
  const radians = (degrees * Math.PI) / 180;
  const origin = turf.centroid(geomObj).geometry.coordinates;
  if (geomObj.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: geomObj.coordinates.map((r) => rotateRing(r, origin, radians)),
    };
  }
  if (geomObj.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geomObj.coordinates.map((poly) =>
        poly.map((r) => rotateRing(r, origin, radians)),
      ),
    };
  }
  throw new Error(`rotateGeometry: unsupported type ${geomObj.type}`);
}
```

Then extend the return statement to include them:

```javascript
return { toMetric, fromMetric, rotateGeometry };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd tests && npm test`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add webapp/frontend/editor-geom.js tests/editor-geom.test.mjs
git commit -m "feat(editor-geom): add rotateGeometry (metric-frame, centroid-anchored)"
```

### Task 11: Implement `offsetGeometry` (metric translation) (TDD)

**Files:**
- Modify: `webapp/frontend/editor-geom.js`
- Modify: `tests/editor-geom.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/editor-geom.test.mjs`:

```javascript
test("offsetGeometry shifts a polygon by (dx, dy) meters", () => {
  const square = {
    type: "Polygon",
    coordinates: [[
      [35.5, 0.05],
      [35.5001, 0.05],
      [35.5001, 0.0501],
      [35.5, 0.0501],
      [35.5, 0.05],
    ]],
  };
  const shifted = geom.offsetGeometry(square, 100, -50);
  const c1 = turf.centroid(square).geometry.coordinates;
  const c2 = turf.centroid(shifted).geometry.coordinates;
  const dist = turf.distance(turf.point(c1), turf.point(c2), { units: "meters" });
  const expected = Math.hypot(100, 50);
  assert.ok(Math.abs(dist - expected) < 1, `dist≈${expected} m, got ${dist} m`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd tests && npm test`
Expected: fails with `geom.offsetGeometry is not a function`.

- [ ] **Step 3: Implement `offsetGeometry`**

In `editor-geom.js`, inside `makeEditorGeom`, add before the return:

```javascript
function offsetRing(ring, originLngLat, dx, dy) {
  return ring.map((pt) => {
    const [x, y] = toMetric(pt, originLngLat);
    return fromMetric([x + dx, y + dy], originLngLat);
  });
}
function offsetGeometry(geomObj, dxMeters, dyMeters) {
  const origin = turf.centroid(geomObj).geometry.coordinates;
  if (geomObj.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: geomObj.coordinates.map((r) => offsetRing(r, origin, dxMeters, dyMeters)),
    };
  }
  if (geomObj.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geomObj.coordinates.map((poly) =>
        poly.map((r) => offsetRing(r, origin, dxMeters, dyMeters)),
      ),
    };
  }
  throw new Error(`offsetGeometry: unsupported type ${geomObj.type}`);
}
```

Update the return:

```javascript
return { toMetric, fromMetric, rotateGeometry, offsetGeometry };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd tests && npm test`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add webapp/frontend/editor-geom.js tests/editor-geom.test.mjs
git commit -m "feat(editor-geom): add offsetGeometry (metric translation)"
```

### Task 12: Implement `scaleGeometry` (bbox-anchored) (TDD)

**Files:**
- Modify: `webapp/frontend/editor-geom.js`
- Modify: `tests/editor-geom.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/editor-geom.test.mjs`:

```javascript
test("scaleGeometry doubles a square's area when sx=sy=2 around centroid", () => {
  const square = {
    type: "Polygon",
    coordinates: [[
      [35.5, 0.05],
      [35.5001, 0.05],
      [35.5001, 0.0501],
      [35.5, 0.0501],
      [35.5, 0.05],
    ]],
  };
  const a1 = turf.area(square);
  const scaled = geom.scaleGeometry(square, 2, 2);
  const a2 = turf.area(scaled);
  // Area scales by sx*sy = 4
  assert.ok(Math.abs(a2 / a1 - 4) < 0.01, `area ratio ≈4, got ${a2 / a1}`);
  const c1 = turf.centroid(square).geometry.coordinates;
  const c2 = turf.centroid(scaled).geometry.coordinates;
  assert.ok(Math.abs(c1[0] - c2[0]) < 1e-9, "centroid lng unchanged");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd tests && npm test`
Expected: fails with `geom.scaleGeometry is not a function`.

- [ ] **Step 3: Implement `scaleGeometry`**

In `editor-geom.js`, inside `makeEditorGeom`, add before the return:

```javascript
function scaleRing(ring, originLngLat, sx, sy) {
  return ring.map((pt) => {
    const [x, y] = toMetric(pt, originLngLat);
    return fromMetric([x * sx, y * sy], originLngLat);
  });
}
function scaleGeometry(geomObj, sx, sy) {
  const origin = turf.centroid(geomObj).geometry.coordinates;
  if (geomObj.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: geomObj.coordinates.map((r) => scaleRing(r, origin, sx, sy)),
    };
  }
  if (geomObj.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geomObj.coordinates.map((poly) =>
        poly.map((r) => scaleRing(r, origin, sx, sy)),
      ),
    };
  }
  throw new Error(`scaleGeometry: unsupported type ${geomObj.type}`);
}
```

Update the return:

```javascript
return { toMetric, fromMetric, rotateGeometry, offsetGeometry, scaleGeometry };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd tests && npm test`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add webapp/frontend/editor-geom.js tests/editor-geom.test.mjs
git commit -m "feat(editor-geom): add scaleGeometry (centroid-anchored)"
```

### Task 13: Implement `unionAll`, `subtractFromBase`, `intersectAll` boolean wrappers (TDD)

**Files:**
- Modify: `webapp/frontend/editor-geom.js`
- Modify: `tests/editor-geom.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `tests/editor-geom.test.mjs`:

```javascript
function squareAt(x, y, side = 0.0001) {
  return {
    type: "Polygon",
    coordinates: [[
      [x, y],
      [x + side, y],
      [x + side, y + side],
      [x, y + side],
      [x, y],
    ]],
  };
}

test("unionAll fuses two overlapping squares into one polygon", () => {
  const a = squareAt(35.5, 0.05);
  const b = squareAt(35.50005, 0.05); // overlaps a by half
  const out = geom.unionAll([a, b]);
  assert.equal(out.type, "Polygon");
  // Combined extent in lng spans ~1.5 * side
  const xs = out.coordinates[0].map((p) => p[0]);
  const dx = Math.max(...xs) - Math.min(...xs);
  assert.ok(Math.abs(dx - 0.00015) < 1e-9, `expected ~0.00015, got ${dx}`);
});

test("unionAll returns MultiPolygon for non-overlapping inputs", () => {
  const a = squareAt(35.5, 0.05);
  const b = squareAt(35.51, 0.05); // far away, no overlap
  const out = geom.unionAll([a, b]);
  assert.equal(out.type, "MultiPolygon");
  assert.equal(out.coordinates.length, 2);
});

test("subtractFromBase creates a hole when cutter is inside base", () => {
  const base = squareAt(35.5, 0.05, 0.001);   // big
  const cutter = squareAt(35.5003, 0.0503, 0.0002); // inside
  const out = geom.subtractFromBase(base, [cutter]);
  assert.equal(out.type, "Polygon");
  // A polygon with a hole has 2 rings: outer + inner.
  assert.equal(out.coordinates.length, 2);
});

test("subtractFromBase returns base unchanged when no overlap", () => {
  const base = squareAt(35.5, 0.05);
  const cutter = squareAt(35.51, 0.05); // far away
  const out = geom.subtractFromBase(base, [cutter]);
  // turf.difference returns base geometry unchanged
  assert.equal(out.type, "Polygon");
  assert.equal(out.coordinates.length, 1);
});

test("intersectAll returns the overlap area of two squares", () => {
  const a = squareAt(35.5, 0.05);
  const b = squareAt(35.50005, 0.05); // half overlap
  const out = geom.intersectAll([a, b]);
  assert.ok(out, "non-null result");
  assert.equal(out.type, "Polygon");
});

test("intersectAll returns null when shapes don't overlap", () => {
  const a = squareAt(35.5, 0.05);
  const b = squareAt(35.51, 0.05);
  const out = geom.intersectAll([a, b]);
  assert.equal(out, null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd tests && npm test`
Expected: fails with `geom.unionAll is not a function`.

- [ ] **Step 3: Implement the boolean wrappers**

In `editor-geom.js`, inside `makeEditorGeom`, add before the return:

```javascript
function toFeature(g) {
  return g.type === "Feature" ? g : turf.feature(g);
}
function unionAll(geoms) {
  if (!geoms || geoms.length < 2) {
    return geoms && geoms[0] ? geoms[0] : null;
  }
  const features = geoms.map(toFeature);
  const fc = turf.featureCollection(features);
  const result = turf.union(fc);
  return result ? result.geometry : null;
}
function subtractFromBase(base, cutters) {
  if (!base) return null;
  if (!cutters || cutters.length === 0) return base;
  let resultFeat = toFeature(base);
  for (const c of cutters) {
    const cutterFeat = toFeature(c);
    const fc = turf.featureCollection([resultFeat, cutterFeat]);
    const diff = turf.difference(fc);
    if (!diff) return null; // base was entirely consumed
    resultFeat = diff;
  }
  return resultFeat.geometry;
}
function intersectAll(geoms) {
  if (!geoms || geoms.length < 2) return null;
  let resultFeat = toFeature(geoms[0]);
  for (let i = 1; i < geoms.length; i++) {
    const fc = turf.featureCollection([resultFeat, toFeature(geoms[i])]);
    const inter = turf.intersect(fc);
    if (!inter) return null;
    resultFeat = inter;
  }
  return resultFeat.geometry;
}
```

Update the return:

```javascript
return {
  toMetric, fromMetric,
  rotateGeometry, offsetGeometry, scaleGeometry,
  unionAll, subtractFromBase, intersectAll,
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd tests && npm test`
Expected: 12 tests pass.

- [ ] **Step 5: Commit**

```bash
git add webapp/frontend/editor-geom.js tests/editor-geom.test.mjs
git commit -m "feat(editor-geom): add unionAll/subtractFromBase/intersectAll wrappers"
```

### Task 14: Implement `simplifyAndClose` for pencil strokes (TDD)

**Files:**
- Modify: `webapp/frontend/editor-geom.js`
- Modify: `tests/editor-geom.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/editor-geom.test.mjs`:

```javascript
test("simplifyAndClose decimates a dense ring and returns a closed Polygon", () => {
  // Build a noisy 20-point square-ish loop
  const ring = [];
  for (let i = 0; i < 20; i++) {
    const t = i / 20;
    ring.push([35.5 + Math.cos(t * 2 * Math.PI) * 1e-5, 0.05 + Math.sin(t * 2 * Math.PI) * 1e-5]);
  }
  const poly = geom.simplifyAndClose(ring, 0.5 /* meters tolerance */);
  assert.equal(poly.type, "Polygon");
  // First and last vertex are equal (closed)
  const first = poly.coordinates[0][0];
  const last = poly.coordinates[0][poly.coordinates[0].length - 1];
  assert.deepEqual(first, last);
  // Simplified should have fewer vertices than input (was 20 in a circle ≈ 1 m radius)
  assert.ok(poly.coordinates[0].length <= 20, "vertex count not increased");
});

test("simplifyAndClose returns null for fewer than 3 distinct points", () => {
  const ring = [[35.5, 0.05], [35.50001, 0.05]];
  assert.equal(geom.simplifyAndClose(ring, 0.5), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd tests && npm test`
Expected: fails with `geom.simplifyAndClose is not a function`.

- [ ] **Step 3: Implement `simplifyAndClose`**

In `editor-geom.js`, inside `makeEditorGeom`, add before the return:

```javascript
function simplifyAndClose(ring, toleranceMeters) {
  // Drop consecutive duplicate points first.
  const cleaned = [];
  for (const pt of ring) {
    const last = cleaned[cleaned.length - 1];
    if (!last || last[0] !== pt[0] || last[1] !== pt[1]) cleaned.push(pt);
  }
  if (cleaned.length < 3) return null;
  // Close if not closed.
  const first = cleaned[0];
  const lastPt = cleaned[cleaned.length - 1];
  if (first[0] !== lastPt[0] || first[1] !== lastPt[1]) cleaned.push([first[0], first[1]]);
  const line = turf.lineString(cleaned);
  // Convert meters tolerance to degrees roughly (1 deg ≈ 111000 m)
  const toleranceDeg = toleranceMeters / 111000;
  const simplified = turf.simplify(line, { tolerance: toleranceDeg, highQuality: false });
  const simpleCoords = simplified.geometry.coordinates;
  if (simpleCoords.length < 4) return null; // need at least 3 unique + closing
  return { type: "Polygon", coordinates: [simpleCoords] };
}
```

Update the return:

```javascript
return {
  toMetric, fromMetric,
  rotateGeometry, offsetGeometry, scaleGeometry,
  unionAll, subtractFromBase, intersectAll,
  simplifyAndClose,
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd tests && npm test`
Expected: 14 tests pass.

- [ ] **Step 5: Commit**

```bash
git add webapp/frontend/editor-geom.js tests/editor-geom.test.mjs
git commit -m "feat(editor-geom): add simplifyAndClose for pencil strokes"
```

---

## Phase 4 — Editor UI: rectangle tool, selection, delete

### Task 15: Add internal `_addShape`, `_removeShape`, `_setStatus` helpers

**Files:**
- Modify: `webapp/frontend/editor.js`

- [ ] **Step 1: Add helpers inside `ShapeEditor`**

In `webapp/frontend/editor.js`, inside the `ShapeEditor` object literal before the closing `}`, add (after `_updateStats`):

```javascript
    _setStatus(text) {
      const el = document.getElementById("shapeEditorStatus");
      if (el) el.textContent = text;
    },
    _newId() {
      return (crypto && crypto.randomUUID) ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}`;
    },
    _addShape(layer, source) {
      const id = this._newId();
      // Stop polygon click from bubbling to the map click handler, which
      // would immediately clear our just-made selection.
      if (layer.options) layer.options.bubblingMouseEvents = false;
      layer.feature = layer.feature || { type: "Feature", properties: {}, geometry: layer.toGeoJSON().geometry };
      layer.feature.properties = { id, source, name: source };
      this.shapes.set(id, layer);
      this.editorLayer.addLayer(layer);
      this._applyStyle(layer, false);
      this._wireShapeClick(layer);
      this._updateStats();
      this._refreshButtons();
      return id;
    },
    _removeShape(id) {
      const layer = this.shapes.get(id);
      if (!layer) return;
      this.editorLayer.removeLayer(layer);
      this.shapes.delete(id);
      this.selection.delete(id);
      this._updateStats();
      this._refreshButtons();
    },
    _applyStyle(layer, selected) {
      if (typeof layer.setStyle === "function") {
        layer.setStyle(selected
          ? { color: "#ea580c", weight: 2, fillOpacity: 0.15, dashArray: "6 4" }
          : { color: "#0f6fd1", weight: 2, fillOpacity: 0.1, dashArray: null });
      }
    },
    _wireShapeClick(layer) {
      layer.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        const id = layer.feature.properties.id;
        const isToggle = e.originalEvent && e.originalEvent.ctrlKey && e.originalEvent.shiftKey;
        if (isToggle) {
          if (this.selection.has(id)) this.selection.delete(id);
          else this.selection.add(id);
        } else {
          this.selection = new Set([id]);
        }
        this._refreshSelectionStyles();
        this._updateStats();
        this._refreshButtons();
      });
    },
    _refreshSelectionStyles() {
      for (const [id, layer] of this.shapes) {
        this._applyStyle(layer, this.selection.has(id));
      }
    },
    _refreshButtons() {
      const sel = this.selection.size;
      const have2plus = sel >= 2;
      document.getElementById("seUnion").disabled = !have2plus;
      document.getElementById("seSubtract").disabled = !have2plus;
      document.getElementById("seIntersect").disabled = !have2plus;
      document.getElementById("seUseAsPolygon").disabled = this.shapes.size !== 1;
      document.getElementById("seUndo").disabled = !this.lastBoolean;
    },
```

- [ ] **Step 2: Verify the helpers exist and nothing crashed**

Hard-refresh http://127.0.0.1:8765.

Manual verification:
- [ ] In console: `window.ShapeEditor._addShape` is a function.
- [ ] No errors at page load.

- [ ] **Step 3: Commit**

```bash
git add webapp/frontend/editor.js
git commit -m "feat(editor): add _addShape/_removeShape/_refreshButtons helpers"
```

### Task 16: Wire Rect tool button to Geoman draw mode

**Files:**
- Modify: `webapp/frontend/editor.js`

- [ ] **Step 1: Add `_setActiveTool` and rectangle activation in `_wireSidebar`**

In `webapp/frontend/editor.js`, replace the empty `_wireSidebar()` body with:

```javascript
    _wireSidebar() {
      const btnRect = document.getElementById("seTool-rect");
      btnRect.addEventListener("click", () => this._toggleRectTool());
      document.getElementById("seDelete").addEventListener("click", () => this._deleteSelected());
      this.map.on("pm:create", (e) => this._onPmCreate(e));
      // Disable Geoman's own toolbar — we drive it from our buttons.
      if (this.map.pm && this.map.pm.addControls) {
        // no-op: we never call addControls, so no Geoman UI shows.
      }
    },
    _setActiveTool(name) {
      this.activeTool = name;
      for (const id of ["seTool-rect", "seTool-pencil", "seTool-rotate", "seTool-scale"]) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.classList.toggle("active", id === `seTool-${name}`);
      }
    },
    _toggleRectTool() {
      if (this.activeTool === "rect") {
        this.map.pm.disableDraw();
        this._setActiveTool(null);
        this._setStatus("Ready.");
        return;
      }
      this.map.pm.disableDraw();
      this.map.pm.enableDraw("Rectangle", { snappable: false });
      this._setActiveTool("rect");
      this._setStatus("Draw a rectangle by dragging.");
    },
    _onPmCreate(e) {
      if (!e || !e.layer) return;
      // Geoman auto-attaches the new layer directly to the map. Detach it so
      // it's only ever a member of our editorLayer (single source of truth).
      this.map.removeLayer(e.layer);
      if (this.activeTool === "rect") {
        const id = this._addShape(e.layer, "rect");
        this.selection = new Set([id]);
        this._refreshSelectionStyles();
        this._updateStats();
        this.map.pm.disableDraw();
        this._setActiveTool(null);
        this._setStatus(`Rectangle added.`);
      }
      // Any other tool path (pencil) does not use pm:create; we ignore.
    },
    _deleteSelected() {
      if (this.selection.size === 0) {
        this._setStatus("Nothing selected.");
        return;
      }
      const ids = [...this.selection];
      for (const id of ids) this._removeShape(id);
      this._setStatus(`Deleted ${ids.length} shape(s).`);
    },
```

- [ ] **Step 2: Verify the Rect tool**

Hard-refresh http://127.0.0.1:8765.

Manual verification:
- [ ] Click "⬚ Rect" — the button shows an active visual state. Status reads `Draw a rectangle by dragging.`
- [ ] Click-drag on the map → a rectangle appears in blue.
- [ ] Status updates to `Rectangle added.` and stat line shows `Shapes: 1 · Selected: 1`.
- [ ] The new rectangle has a dashed orange outline (selected).
- [ ] Click "⬚ Rect" again → cursor returns to normal, status `Ready.`
- [ ] "Use as polygon →" button becomes enabled when exactly 1 shape exists.
- [ ] Click "🗑 Delete" → shape removed, counters back to 0.

- [ ] **Step 3: Commit**

```bash
git add webapp/frontend/editor.js
git commit -m "feat(editor): Rect tool via Geoman draw + click-select + delete"
```

### Task 17: Map-empty click clears selection; Esc clears selection and active tool

**Files:**
- Modify: `webapp/frontend/editor.js`

- [ ] **Step 1: Wire global key + map handlers in `_wireSidebar`**

In `webapp/frontend/editor.js`, append inside `_wireSidebar`:

```javascript
      this.map.on("click", (e) => {
        // Only clear if we're not currently drawing.
        if (this.activeTool === "rect" || this.activeTool === "pencil") return;
        if (this.selection.size === 0) return;
        this.selection.clear();
        this._refreshSelectionStyles();
        this._updateStats();
        this._refreshButtons();
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          if (this.activeTool) {
            this.map.pm.disableDraw();
            this._setActiveTool(null);
            this._setStatus("Ready.");
          } else if (this.selection.size > 0) {
            this.selection.clear();
            this._refreshSelectionStyles();
            this._updateStats();
            this._refreshButtons();
          }
        } else if (e.key === "Delete" || e.key === "Backspace") {
          // Only consume Delete if focus is not inside an input/textarea.
          const tag = document.activeElement && document.activeElement.tagName;
          if (tag === "INPUT" || tag === "TEXTAREA") return;
          if (this.selection.size > 0) {
            e.preventDefault();
            this._deleteSelected();
          }
        }
      });
```

- [ ] **Step 2: Verify selection clearing**

Hard-refresh http://127.0.0.1:8765.

Manual verification:
- [ ] Place 2 rectangles. Click on one to select it. Click on empty map → selection cleared, stat shows `Selected: 0`.
- [ ] Select a rectangle and press `Delete` → rectangle removed.
- [ ] Activate Rect tool. Press `Esc` → tool deactivates, status returns to `Ready.`

- [ ] **Step 3: Commit**

```bash
git add webapp/frontend/editor.js
git commit -m "feat(editor): Esc/Delete keys + empty-map click clear selection"
```

---

## Phase 5 — Multi-select polish

### Task 18: Verify Ctrl+Shift+Click multi-select works end-to-end

(`_wireShapeClick` already implements this — this task is a verification pass and a small visual polish.)

**Files:**
- Modify: `webapp/frontend/editor.js` (small change)

- [ ] **Step 1: Update status text on selection change**

In `webapp/frontend/editor.js`, inside `_wireShapeClick`, at the end of the click handler (after `this._refreshButtons();`), add:

```javascript
        this._setStatus(this.selection.size === 0
          ? "Ready."
          : `Selected ${this.selection.size} shape(s).`);
```

- [ ] **Step 2: Verify multi-select**

Hard-refresh http://127.0.0.1:8765.

Manual verification:
- [ ] Place 3 rectangles.
- [ ] Click rect A → only A is dashed orange. Status: `Selected 1 shape(s).`
- [ ] `Ctrl+Shift+Click` rect B → both A and B are dashed orange. Status: `Selected 2 shape(s).`
- [ ] `Ctrl+Shift+Click` A again → A goes back to solid blue, B stays selected. Status: `Selected 1 shape(s).`
- [ ] The three Combine buttons (Merge / Subtract / Intersect) become enabled when 2+ are selected, disabled when <2.

- [ ] **Step 3: Commit**

```bash
git add webapp/frontend/editor.js
git commit -m "feat(editor): show selection count in status line"
```

---

## Phase 6 — Rotate and scale

### Task 19: Wire Rotate button to Geoman rotateMode

**Files:**
- Modify: `webapp/frontend/editor.js`

- [ ] **Step 1: Wire the rotate button**

In `webapp/frontend/editor.js`, inside `_wireSidebar` (anywhere after `btnRect`), add:

```javascript
      document.getElementById("seTool-rotate").addEventListener("click", () => this._toggleRotateTool());
```

And add the method inside `ShapeEditor`:

```javascript
    _toggleRotateTool() {
      if (this.selection.size === 0) {
        this._setStatus("Select shapes to rotate first.");
        return;
      }
      const enabling = this.activeTool !== "rotate";
      for (const id of this.selection) {
        const layer = this.shapes.get(id);
        if (!layer || !layer.pm) continue;
        if (enabling) {
          if (typeof layer.pm.enableRotate === "function") layer.pm.enableRotate();
        } else {
          if (typeof layer.pm.disableRotate === "function") layer.pm.disableRotate();
        }
      }
      this._setActiveTool(enabling ? "rotate" : null);
      this._setStatus(enabling ? "Drag the rotation handle. Esc to finish." : "Ready.");
    },
```

Also extend the Esc handler block in `_wireSidebar` to disable rotate on Esc. In the keydown handler, replace:

```javascript
          if (this.activeTool) {
            this.map.pm.disableDraw();
            this._setActiveTool(null);
            this._setStatus("Ready.");
          }
```

With:

```javascript
          if (this.activeTool) {
            this.map.pm.disableDraw();
            if (this.activeTool === "rotate") {
              for (const id of this.selection) {
                const layer = this.shapes.get(id);
                if (layer && layer.pm && typeof layer.pm.disableRotate === "function") layer.pm.disableRotate();
              }
            }
            this._setActiveTool(null);
            this._setStatus("Ready.");
          }
```

Also persist Geoman's geometry edits back to our internal `feature` cache. Add a listener inside `_addShape`, after `this._wireShapeClick(layer);`:

```javascript
      layer.on("pm:edit", () => {
        layer.feature.geometry = layer.toGeoJSON().geometry;
      });
      layer.on("pm:rotateend", () => {
        layer.feature.geometry = layer.toGeoJSON().geometry;
      });
```

- [ ] **Step 2: Verify rotation**

Hard-refresh http://127.0.0.1:8765.

Manual verification:
- [ ] Place a rectangle. Click "↺ Rotate" → a rotation handle appears.
- [ ] Drag the handle → rectangle rotates around its centroid.
- [ ] Press `Esc` → handle disappears, status returns to `Ready.`
- [ ] Click "↺ Rotate" again with rotated shape selected → drags resume from the new orientation.
- [ ] With nothing selected, clicking "↺ Rotate" shows the status `Select shapes to rotate first.`

- [ ] **Step 3: Commit**

```bash
git add webapp/frontend/editor.js
git commit -m "feat(editor): rotate via Geoman rotateMode on selected shapes"
```

### Task 20: Implement custom Scale tool with corner handles

Geoman free does not include `scaleMode`. Build a small corner/edge-handle scaler.

**Files:**
- Modify: `webapp/frontend/editor.js`
- Modify: `webapp/frontend/editor.css` (handle styling)

- [ ] **Step 1: Add CSS for handle markers**

In `webapp/frontend/editor.css`, append:

```css
.shape-editor-handle {
  width: 12px;
  height: 12px;
  background: white;
  border: 2px solid #ea580c;
  border-radius: 2px;
  cursor: nwse-resize;
  margin-left: -6px;
  margin-top: -6px;
  box-sizing: border-box;
}
.shape-editor-handle.edge-handle { cursor: ew-resize; }
.shape-editor-handle.edge-handle.vertical { cursor: ns-resize; }
```

- [ ] **Step 2: Add the scale machinery to `editor.js`**

In `webapp/frontend/editor.js`, add inside `ShapeEditor` (alongside the other methods):

```javascript
    _toggleScaleTool() {
      if (this.activeTool === "scale") {
        this._exitScale();
        return;
      }
      if (this.selection.size === 0) {
        this._setStatus("Select shapes to scale first.");
        return;
      }
      this._scaleHandles = L.layerGroup().addTo(this.map);
      this._buildScaleHandles();
      this._setActiveTool("scale");
      this._setStatus("Drag a corner or edge handle to scale. Esc to finish.");
    },
    _exitScale() {
      if (this._scaleHandles) {
        this.map.removeLayer(this._scaleHandles);
        this._scaleHandles = null;
      }
      this._setActiveTool(null);
      this._setStatus("Ready.");
    },
    _selectionBboxLngLat() {
      let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
      for (const id of this.selection) {
        const layer = this.shapes.get(id);
        const b = layer.getBounds();
        minLng = Math.min(minLng, b.getWest());
        minLat = Math.min(minLat, b.getSouth());
        maxLng = Math.max(maxLng, b.getEast());
        maxLat = Math.max(maxLat, b.getNorth());
      }
      return { minLng, minLat, maxLng, maxLat };
    },
    _buildScaleHandles() {
      this._scaleHandles.clearLayers();
      const bb = this._selectionBboxLngLat();
      const positions = [
        { key: "nw", lat: bb.maxLat, lng: bb.minLng, klass: "" },
        { key: "ne", lat: bb.maxLat, lng: bb.maxLng, klass: "" },
        { key: "se", lat: bb.minLat, lng: bb.maxLng, klass: "" },
        { key: "sw", lat: bb.minLat, lng: bb.minLng, klass: "" },
        { key: "n",  lat: bb.maxLat, lng: (bb.minLng + bb.maxLng) / 2, klass: "edge-handle vertical" },
        { key: "s",  lat: bb.minLat, lng: (bb.minLng + bb.maxLng) / 2, klass: "edge-handle vertical" },
        { key: "e",  lat: (bb.minLat + bb.maxLat) / 2, lng: bb.maxLng, klass: "edge-handle" },
        { key: "w",  lat: (bb.minLat + bb.maxLat) / 2, lng: bb.minLng, klass: "edge-handle" },
      ];
      for (const p of positions) {
        const icon = L.divIcon({ className: `shape-editor-handle ${p.klass}` });
        const m = L.marker([p.lat, p.lng], { icon, draggable: true, keyboard: false });
        m._handleKey = p.key;
        m._bboxAtStart = null;
        m.on("dragstart", () => {
          m._bboxAtStart = this._selectionBboxLngLat();
          m._snapshotsAtStart = new Map();
          for (const id of this.selection) {
            m._snapshotsAtStart.set(id, this.shapes.get(id).toGeoJSON().geometry);
          }
        });
        m.on("drag", (ev) => this._onScaleHandleDrag(m, ev));
        m.on("dragend", () => this._rebuildHandlesAfterScale());
        this._scaleHandles.addLayer(m);
      }
    },
    _rebuildHandlesAfterScale() {
      // Rebuild handle positions to match the new bbox.
      this._buildScaleHandles();
    },
    _onScaleHandleDrag(handle, ev) {
      const key = handle._handleKey;
      const bb0 = handle._bboxAtStart;
      if (!bb0) return;
      const newLatLng = handle.getLatLng();
      let minLng = bb0.minLng, minLat = bb0.minLat, maxLng = bb0.maxLng, maxLat = bb0.maxLat;
      if (key.includes("n")) maxLat = newLatLng.lat;
      if (key.includes("s")) minLat = newLatLng.lat;
      if (key.includes("e")) maxLng = newLatLng.lng;
      if (key.includes("w")) minLng = newLatLng.lng;
      // Guard against flipping past origin.
      if (maxLng <= minLng || maxLat <= minLat) return;
      const sx = (maxLng - minLng) / (bb0.maxLng - bb0.minLng);
      const sy = (maxLat - minLat) / (bb0.maxLat - bb0.minLat);
      // Origin of the transform = the OPPOSITE corner of the dragged handle in lng/lat space.
      const anchorLng = key.includes("e") ? bb0.minLng : key.includes("w") ? bb0.maxLng : (bb0.minLng + bb0.maxLng) / 2;
      const anchorLat = key.includes("n") ? bb0.minLat : key.includes("s") ? bb0.maxLat : (bb0.minLat + bb0.maxLat) / 2;
      for (const id of this.selection) {
        const layer = this.shapes.get(id);
        const original = handle._snapshotsAtStart.get(id);
        const transformed = this._scaleAroundLatLng(original, anchorLng, anchorLat, sx, sy);
        // Replace coordinates on the existing layer in place.
        if (transformed.type === "Polygon") {
          layer.setLatLngs(this._geojsonToLatLngs(transformed.coordinates));
        } else if (transformed.type === "MultiPolygon") {
          layer.setLatLngs(transformed.coordinates.map((p) => this._geojsonToLatLngs(p)));
        }
        layer.feature.geometry = transformed;
      }
    },
    _scaleAroundLatLng(geomObj, anchorLng, anchorLat, sx, sy) {
      const map = (ring) =>
        ring.map(([lng, lat]) => [
          anchorLng + (lng - anchorLng) * sx,
          anchorLat + (lat - anchorLat) * sy,
        ]);
      if (geomObj.type === "Polygon") {
        return { type: "Polygon", coordinates: geomObj.coordinates.map(map) };
      }
      if (geomObj.type === "MultiPolygon") {
        return {
          type: "MultiPolygon",
          coordinates: geomObj.coordinates.map((poly) => poly.map(map)),
        };
      }
      return geomObj;
    },
    _geojsonToLatLngs(rings) {
      // rings = [outer, hole1, hole2, ...]; each ring is [[lng,lat], ...]
      return rings.map((ring) => ring.slice(0, -1).map(([lng, lat]) => [lat, lng]));
    },
```

- [ ] **Step 3: Wire the Scale button in `_wireSidebar`**

Append inside `_wireSidebar`:

```javascript
      document.getElementById("seTool-scale").addEventListener("click", () => this._toggleScaleTool());
```

Also extend the Esc handler block to clean up scale handles. Replace the existing rotate-disable block (inside the Esc handler) with this combined block:

```javascript
          if (this.activeTool) {
            this.map.pm.disableDraw();
            if (this.activeTool === "rotate") {
              for (const id of this.selection) {
                const layer = this.shapes.get(id);
                if (layer && layer.pm && typeof layer.pm.disableRotate === "function") layer.pm.disableRotate();
              }
            } else if (this.activeTool === "scale") {
              this._exitScale();
              return;
            }
            this._setActiveTool(null);
            this._setStatus("Ready.");
          }
```

- [ ] **Step 4: Verify scaling**

Hard-refresh http://127.0.0.1:8765.

Manual verification:
- [ ] Place a rectangle. Click "⤢ Scale" → 8 white-with-orange-border handles appear at corners and edge midpoints.
- [ ] Drag the NE corner outward → the rectangle grows. The SW corner stays put.
- [ ] Drag the E edge handle right → rectangle widens; height stays the same.
- [ ] Esc clears handles, returns to `Ready.`
- [ ] Select two shapes → "⤢ Scale" shows handles around the combined bbox; dragging scales both.

- [ ] **Step 5: Commit**

```bash
git add webapp/frontend/editor.js webapp/frontend/editor.css
git commit -m "feat(editor): custom 8-handle scale tool with bbox-anchored transform"
```

---

## Phase 7 — Duplicate

### Task 21: Implement Duplicate

**Files:**
- Modify: `webapp/frontend/editor.js`

- [ ] **Step 1: Wire the button and add the method**

In `webapp/frontend/editor.js`, inside `_wireSidebar`, append:

```javascript
      document.getElementById("seDuplicate").addEventListener("click", () => this._duplicateSelected());
```

Add inside `ShapeEditor`:

```javascript
    _duplicateSelected() {
      if (this.selection.size === 0) {
        this._setStatus("Select shapes to duplicate first.");
        return;
      }
      const newIds = [];
      for (const id of this.selection) {
        const layer = this.shapes.get(id);
        const g = layer.toGeoJSON().geometry;
        const shifted = window.EditorGeom.offsetGeometry(g, 8, -8); // +8m east, -8m south
        const newLayer = L.geoJSON({ type: "Feature", geometry: shifted }).getLayers()[0];
        const source = layer.feature.properties.source || "rect";
        const newId = this._addShape(newLayer, source);
        newIds.push(newId);
      }
      this.selection = new Set(newIds);
      this._refreshSelectionStyles();
      this._updateStats();
      this._refreshButtons();
      this._setStatus(`Duplicated ${newIds.length} shape(s).`);
    },
```

- [ ] **Step 2: Verify duplicate**

Hard-refresh http://127.0.0.1:8765.

Manual verification:
- [ ] Place a rectangle, click ⎘ Duplicate → an identical rectangle appears slightly east-and-south of the original. The new rectangle is selected; the original is not.
- [ ] Stat line shows `Shapes: 2 · Selected: 1`.
- [ ] Multi-select two rects, click ⎘ Duplicate → two copies appear, both selected.

- [ ] **Step 3: Commit**

```bash
git add webapp/frontend/editor.js
git commit -m "feat(editor): duplicate selected shapes with 8m metric offset"
```

---

## Phase 8 — Pencil (freehand + vertex)

### Task 22: Pencil — Freehand mode

**Files:**
- Modify: `webapp/frontend/editor.js`

- [ ] **Step 1: Wire the pencil button + add freehand handlers**

In `webapp/frontend/editor.js`, inside `_wireSidebar`, append:

```javascript
      document.getElementById("seTool-pencil").addEventListener("click", () => this._togglePencilTool());
      document.getElementById("seTogglePencilMode").addEventListener("click", () => this._togglePencilMode());
```

Add inside `ShapeEditor`:

```javascript
    _togglePencilTool() {
      if (this.activeTool === "pencil") {
        this._exitPencil();
        return;
      }
      this._setActiveTool("pencil");
      if (this.pencilMode === "freehand") this._enterFreehand();
      else this._enterVertex();
    },
    _togglePencilMode() {
      const wasActive = this.activeTool === "pencil";
      if (wasActive) this._exitPencil();
      this.pencilMode = this.pencilMode === "freehand" ? "vertex" : "freehand";
      const btn = document.getElementById("seTool-pencil");
      btn.textContent = this.pencilMode === "freehand" ? "✎ Freehand" : "✎ Vertex";
      this._setStatus(`Pencil mode: ${this.pencilMode}.`);
      if (wasActive) this._togglePencilTool();
    },
    _exitPencil() {
      this._exitFreehand();
      this._exitVertex();
      this._setActiveTool(null);
      this._setStatus("Ready.");
    },
    _enterFreehand() {
      this._setStatus("Hold mouse + drag to draw a freehand shape.");
      this.map.dragging.disable();
      this._fhPoints = null;
      this._fhPreview = null;
      this._fhHandlers = {
        down: (e) => {
          this._fhPoints = [[e.latlng.lng, e.latlng.lat]];
          if (this._fhPreview) this.map.removeLayer(this._fhPreview);
          this._fhPreview = L.polyline([[e.latlng.lat, e.latlng.lng]], { color: "#ea580c", weight: 2 }).addTo(this.map);
        },
        move: (e) => {
          if (!this._fhPoints) return;
          this._fhPoints.push([e.latlng.lng, e.latlng.lat]);
          this._fhPreview.addLatLng([e.latlng.lat, e.latlng.lng]);
        },
        up: () => {
          if (!this._fhPoints) return;
          const ring = this._fhPoints;
          if (this._fhPreview) { this.map.removeLayer(this._fhPreview); this._fhPreview = null; }
          this._fhPoints = null;
          if (ring.length < 4) {
            this._setStatus("Stroke too short — discarded.");
            return;
          }
          const poly = window.EditorGeom.simplifyAndClose(ring, 0.5);
          if (!poly) {
            this._setStatus("Stroke simplified to too few vertices — discarded.");
            return;
          }
          const layer = L.geoJSON({ type: "Feature", geometry: poly }).getLayers()[0];
          const id = this._addShape(layer, "pencil");
          this.selection = new Set([id]);
          this._refreshSelectionStyles();
          this._updateStats();
          this._refreshButtons();
          this._setStatus("Freehand shape added.");
        },
      };
      this.map.on("mousedown", this._fhHandlers.down);
      this.map.on("mousemove", this._fhHandlers.move);
      this.map.on("mouseup", this._fhHandlers.up);
    },
    _exitFreehand() {
      if (this._fhHandlers) {
        this.map.off("mousedown", this._fhHandlers.down);
        this.map.off("mousemove", this._fhHandlers.move);
        this.map.off("mouseup", this._fhHandlers.up);
        this._fhHandlers = null;
      }
      if (this._fhPreview) {
        this.map.removeLayer(this._fhPreview);
        this._fhPreview = null;
      }
      this._fhPoints = null;
      this.map.dragging.enable();
    },
    _enterVertex() { /* implemented in next task */ },
    _exitVertex() { /* implemented in next task */ },
```

Extend the Esc handler block in `_wireSidebar` keydown to handle pencil:

```javascript
            } else if (this.activeTool === "scale") {
              this._exitScale();
              return;
            } else if (this.activeTool === "pencil") {
              this._exitPencil();
              return;
            }
```

- [ ] **Step 2: Verify freehand**

Hard-refresh http://127.0.0.1:8765.

Manual verification:
- [ ] Click "✎ Freehand" — status: `Hold mouse + drag to draw a freehand shape.`
- [ ] Click-drag a closed loop on the map → on release, a blue polygon appears and is selected.
- [ ] Stat line counts up. Esc clears the tool.
- [ ] A very tiny scribble shows the "stroke too short — discarded" status without creating a shape.

- [ ] **Step 3: Commit**

```bash
git add webapp/frontend/editor.js
git commit -m "feat(editor): pencil freehand mode (drag → simplified closed polygon)"
```

### Task 23: Pencil — Vertex mode

**Files:**
- Modify: `webapp/frontend/editor.js`

- [ ] **Step 1: Implement vertex mode (replace the stubs from Task 22)**

In `webapp/frontend/editor.js`, replace:

```javascript
    _enterVertex() { /* implemented in next task */ },
    _exitVertex() { /* implemented in next task */ },
```

With:

```javascript
    _enterVertex() {
      this._setStatus("Click to add vertices. Enter or click first to close. Esc to cancel.");
      this._vxPoints = [];
      this._vxLine = null;
      this._vxRubber = null;
      this._vxHandlers = {
        click: (e) => {
          L.DomEvent.stopPropagation(e);
          // Close if click is near the first vertex.
          if (this._vxPoints.length >= 3) {
            const first = this._vxPoints[0];
            const pxA = this.map.latLngToLayerPoint([first[1], first[0]]);
            const pxB = this.map.latLngToLayerPoint(e.latlng);
            if (pxA.distanceTo(pxB) < 12) {
              this._commitVertexPolygon();
              return;
            }
          }
          this._vxPoints.push([e.latlng.lng, e.latlng.lat]);
          this._redrawVxPreview();
        },
        move: (e) => {
          if (this._vxPoints.length === 0) return;
          if (!this._vxRubber) {
            this._vxRubber = L.polyline([], { color: "#ea580c", weight: 1, dashArray: "4 4" }).addTo(this.map);
          }
          const last = this._vxPoints[this._vxPoints.length - 1];
          this._vxRubber.setLatLngs([[last[1], last[0]], [e.latlng.lat, e.latlng.lng]]);
        },
        keyEnter: (e) => {
          if (e.key === "Enter" && this._vxPoints.length >= 3) this._commitVertexPolygon();
        },
      };
      this.map.on("click", this._vxHandlers.click);
      this.map.on("mousemove", this._vxHandlers.move);
      document.addEventListener("keydown", this._vxHandlers.keyEnter);
    },
    _redrawVxPreview() {
      if (this._vxLine) this.map.removeLayer(this._vxLine);
      if (this._vxPoints.length < 2) return;
      this._vxLine = L.polyline(this._vxPoints.map(([lng, lat]) => [lat, lng]), { color: "#ea580c", weight: 2 }).addTo(this.map);
    },
    _commitVertexPolygon() {
      const ring = [...this._vxPoints, [this._vxPoints[0][0], this._vxPoints[0][1]]];
      this._exitVertex();
      if (ring.length < 4) {
        this._setStatus("Need at least 3 vertices.");
        this._setActiveTool(null);
        return;
      }
      const layer = L.geoJSON({ type: "Feature", geometry: { type: "Polygon", coordinates: [ring] } }).getLayers()[0];
      const id = this._addShape(layer, "pencil");
      this.selection = new Set([id]);
      this._refreshSelectionStyles();
      this._updateStats();
      this._refreshButtons();
      this._setActiveTool(null);
      this._setStatus("Vertex polygon added.");
    },
    _exitVertex() {
      if (this._vxHandlers) {
        this.map.off("click", this._vxHandlers.click);
        this.map.off("mousemove", this._vxHandlers.move);
        document.removeEventListener("keydown", this._vxHandlers.keyEnter);
        this._vxHandlers = null;
      }
      if (this._vxLine) { this.map.removeLayer(this._vxLine); this._vxLine = null; }
      if (this._vxRubber) { this.map.removeLayer(this._vxRubber); this._vxRubber = null; }
      this._vxPoints = [];
    },
```

- [ ] **Step 2: Verify vertex mode**

Hard-refresh http://127.0.0.1:8765.

Manual verification:
- [ ] Click `▾` button next to "✎ Freehand" → label switches to `✎ Vertex`. Status: `Pencil mode: vertex.`
- [ ] Click "✎ Vertex" → status: `Click to add vertices. Enter or click first to close. Esc to cancel.`
- [ ] Click 3+ points on the map → orange polyline traces them, dashed rubber-band line follows cursor.
- [ ] Press Enter → polygon closes and is added (selected, blue → orange dashed).
- [ ] Repeat; this time click the first vertex to close (within 12 px) instead of pressing Enter.
- [ ] Esc cancels without creating a shape.
- [ ] Switching back to freehand via `▾` works.

- [ ] **Step 3: Commit**

```bash
git add webapp/frontend/editor.js
git commit -m "feat(editor): pencil vertex mode with rubber-band preview"
```

---

## Phase 9 — Boolean operations + undo

### Task 24: Implement Merge (union)

**Files:**
- Modify: `webapp/frontend/editor.js`

- [ ] **Step 1: Wire the button and add the method**

In `webapp/frontend/editor.js`, inside `_wireSidebar`, append:

```javascript
      document.getElementById("seUnion").addEventListener("click", () => this._applyBoolean("union"));
      document.getElementById("seSubtract").addEventListener("click", () => this._applyBoolean("subtract"));
      document.getElementById("seIntersect").addEventListener("click", () => this._applyBoolean("intersect"));
      document.getElementById("seUndo").addEventListener("click", () => this._undoBoolean());
```

Add inside `ShapeEditor`:

```javascript
    _applyBoolean(op) {
      if (this.selection.size < 2) return;
      const ids = [...this.selection];
      const geoms = ids.map((id) => this.shapes.get(id).toGeoJSON().geometry);
      let result;
      try {
        if (op === "union") result = window.EditorGeom.unionAll(geoms);
        else if (op === "subtract") result = window.EditorGeom.subtractFromBase(geoms[0], geoms.slice(1));
        else if (op === "intersect") result = window.EditorGeom.intersectAll(geoms);
      } catch (err) {
        this._setStatus(`${op} failed: ${err.message}`);
        return;
      }
      if (!result) {
        this._setStatus(op === "intersect" ? "No intersection — nothing changed." : `${op} produced no geometry.`);
        return;
      }
      // Save undo snapshot of originals BEFORE removing.
      this.lastBoolean = {
        originals: ids.map((id) => ({ id, geoJson: this.shapes.get(id).toGeoJSON().geometry, source: this.shapes.get(id).feature.properties.source })),
        resultId: null,
      };
      for (const id of ids) this._removeShape(id);
      const layer = L.geoJSON({ type: "Feature", geometry: result }).getLayers()[0];
      const newId = this._addShape(layer, "merged");
      this.lastBoolean.resultId = newId;
      this.selection = new Set([newId]);
      this._refreshSelectionStyles();
      this._updateStats();
      this._refreshButtons();
      this._setStatus(`${op[0].toUpperCase()}${op.slice(1)} complete.`);
    },
    _undoBoolean() {
      if (!this.lastBoolean) return;
      // Remove the result shape, restore originals.
      if (this.lastBoolean.resultId) this._removeShape(this.lastBoolean.resultId);
      const restoredIds = [];
      for (const orig of this.lastBoolean.originals) {
        const layer = L.geoJSON({ type: "Feature", geometry: orig.geoJson }).getLayers()[0];
        const newId = this._addShape(layer, orig.source);
        restoredIds.push(newId);
      }
      this.selection = new Set(restoredIds);
      this.lastBoolean = null;
      this._refreshSelectionStyles();
      this._updateStats();
      this._refreshButtons();
      this._setStatus("Undo: boolean op reverted.");
    },
```

- [ ] **Step 2: Clear `lastBoolean` on any non-boolean change**

In `webapp/frontend/editor.js`, locate `_addShape`. Inside it, before `return id;`, add a check that only clears `lastBoolean` if the call did NOT come from `_applyBoolean` or `_undoBoolean`. Simplest approach: clear it inside `_deleteSelected`, `_duplicateSelected`, `_onPmCreate`, `_commitVertexPolygon`, and the freehand `up` handler.

Add this helper inside `ShapeEditor`:

```javascript
    _invalidateUndo() {
      if (this.lastBoolean) {
        this.lastBoolean = null;
        this._refreshButtons();
      }
    },
```

Then add `this._invalidateUndo();` calls in:
- `_deleteSelected` at the top
- `_duplicateSelected` at the top
- The successful branch of `_onPmCreate` (before `this._setStatus(...)`)
- The successful branch of `_commitVertexPolygon` (before `this._setStatus(...)`)
- The successful branch of freehand `up` handler (before `this._setStatus("Freehand shape added.")`)

- [ ] **Step 3: Verify union**

Hard-refresh http://127.0.0.1:8765.

Manual verification:
- [ ] Place two overlapping rectangles. Multi-select both. Click "Merge" → one merged polygon appears, originals are gone. Stat: `Shapes: 1 · Selected: 1`. Undo button enabled.
- [ ] Click "Undo" → original two rectangles return, merged shape is gone. Undo button disabled.
- [ ] Place two non-overlapping rectangles. Merge → result is a MultiPolygon (visually two separate rings).

- [ ] **Step 4: Verify subtract**

- [ ] Place a large rectangle, then a small rectangle inside it. Multi-select with the large one clicked first (so it's the base — note: with multi-select we use insertion order of `Set`, so the first clicked shape is `geoms[0]`). Click "Subtract" → the result is the large rectangle with a hole.
- [ ] If shapes don't overlap, status shows the no-change message.

- [ ] **Step 5: Verify intersect**

- [ ] Place two overlapping rectangles. Multi-select. Click "Intersect" → the result is the overlap region only.
- [ ] Two non-overlapping shapes → status: `No intersection — nothing changed.` Originals untouched.

- [ ] **Step 6: Commit**

```bash
git add webapp/frontend/editor.js
git commit -m "feat(editor): boolean ops (union, subtract, intersect) + single-step undo"
```

---

## Phase 10 — Output: Use as polygon / Download

### Task 25: Wire "Use as polygon →" and "Download GeoJSON"

**Files:**
- Modify: `webapp/frontend/editor.js`

- [ ] **Step 1: Add handlers in `_wireSidebar`**

In `webapp/frontend/editor.js`, inside `_wireSidebar`, append:

```javascript
      document.getElementById("seUseAsPolygon").addEventListener("click", () => this._useAsPolygon());
      document.getElementById("seDownload").addEventListener("click", () => this._downloadGeoJson());
```

Add inside `ShapeEditor`:

```javascript
    _useAsPolygon() {
      if (this.shapes.size !== 1) {
        this._setStatus("Merge or remove shapes so exactly one remains.");
        return;
      }
      const only = [...this.shapes.values()][0];
      const geom = only.toGeoJSON().geometry;
      if (typeof this.onUsePolygon === "function") {
        this.onUsePolygon(geom);
        this._setStatus("Polygon sent to bed/zone mapper.");
      }
    },
    _downloadGeoJson() {
      if (this.shapes.size === 0) {
        this._setStatus("No shapes to download.");
        return;
      }
      const features = [];
      for (const layer of this.shapes.values()) {
        const f = layer.toGeoJSON();
        f.properties = { ...layer.feature.properties };
        features.push(f);
      }
      const fc = { type: "FeatureCollection", features };
      const blob = new Blob([JSON.stringify(fc, null, 2)], { type: "application/geo+json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
      a.href = url;
      a.download = `shape-builder-${ts}.geojson`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this._setStatus(`Downloaded ${features.length} shape(s).`);
    },
```

- [ ] **Step 2: Verify**

Hard-refresh http://127.0.0.1:8765.

Manual verification:
- [ ] With 1 shape in the editor, "Use as polygon →" is enabled. Click it → the existing bed/zone preview kicks in (orange/green bed lines appear), status: `Polygon sent to bed/zone mapper.`
- [ ] With 0 or >1 shapes, "Use as polygon →" is disabled.
- [ ] With ≥1 shape, click "Download GeoJSON" → a `shape-builder-YYYYMMDD-HHMMSS.geojson` file downloads. Open it; confirm it's a valid `FeatureCollection`.

- [ ] **Step 3: Commit**

```bash
git add webapp/frontend/editor.js
git commit -m "feat(editor): Use-as-polygon hand-off + Download GeoJSON button"
```

---

## Phase 11 — Persistence

### Task 26: Save shapes to localStorage; restore on page load

**Files:**
- Modify: `webapp/frontend/editor.js`

- [ ] **Step 1: Implement save / restore / clear**

In `webapp/frontend/editor.js`, replace the empty `_restoreFromLocalStorage()` body and add new methods:

```javascript
    _restoreFromLocalStorage() {
      try {
        const raw = localStorage.getItem("shapeEditor.shapes.v1");
        if (!raw) return;
        const fc = JSON.parse(raw);
        if (!fc || fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) return;
        for (const feat of fc.features) {
          if (!feat.geometry) continue;
          const layer = L.geoJSON(feat).getLayers()[0];
          this._addShape(layer, (feat.properties && feat.properties.source) || "rect");
        }
        this._setStatus(`Restored ${fc.features.length} shape(s).`);
      } catch (err) {
        console.warn("Could not restore shapes:", err);
      }
    },
    _saveToLocalStorage() {
      const features = [];
      for (const layer of this.shapes.values()) {
        const f = layer.toGeoJSON();
        f.properties = { ...layer.feature.properties };
        features.push(f);
      }
      const fc = { type: "FeatureCollection", features };
      try {
        localStorage.setItem("shapeEditor.shapes.v1", JSON.stringify(fc));
        this._setStatus(`Saved ${features.length} shape(s) to browser storage.`);
      } catch (err) {
        this._setStatus(`Save failed: ${err.message}`);
      }
    },
    _clearAll() {
      if (this.shapes.size === 0 && !localStorage.getItem("shapeEditor.shapes.v1")) {
        this._setStatus("Nothing to clear.");
        return;
      }
      if (!window.confirm("Clear all editor shapes and saved data?")) return;
      for (const id of [...this.shapes.keys()]) this._removeShape(id);
      this.lastBoolean = null;
      localStorage.removeItem("shapeEditor.shapes.v1");
      this._refreshButtons();
      this._setStatus("Cleared.");
    },
```

- [ ] **Step 2: Wire the buttons in `_wireSidebar`**

Append inside `_wireSidebar`:

```javascript
      document.getElementById("seSave").addEventListener("click", () => this._saveToLocalStorage());
      document.getElementById("seClearAll").addEventListener("click", () => this._clearAll());
```

- [ ] **Step 3: Verify persistence**

Hard-refresh http://127.0.0.1:8765.

Manual verification:
- [ ] Place 2 rectangles + 1 freehand. Click "📦 Save shapes locally" → status: `Saved 3 shape(s) to browser storage.`
- [ ] Hard-refresh page → all 3 shapes reappear (unselected). Status: `Restored 3 shape(s).`
- [ ] Click "Clear all" → confirm dialog appears. Accept → all shapes vanish, status: `Cleared.`
- [ ] Hard-refresh → no shapes restored.
- [ ] If you decline the confirm, nothing changes.

- [ ] **Step 4: Commit**

```bash
git add webapp/frontend/editor.js
git commit -m "feat(editor): localStorage persistence (save/restore/clear)"
```

---

## Phase 12 — End-to-end verification

### Task 27: Walk the full golden-path checklist; fix any regressions

**Files:**
- Verify: all of the above

- [ ] **Step 1: Run the geometry test suite one more time**

Run: `cd tests && npm test`
Expected: 14 tests pass.

- [ ] **Step 2: Walk the manual end-to-end checklist**

Open http://127.0.0.1:8765 in a fresh browser tab (or clear localStorage first).

Manual end-to-end:
- [ ] Place 3 rectangles via the Rect tool.
- [ ] Click "↺ Rotate" with one selected; rotate by ~30°. Esc.
- [ ] Click ⎘ Duplicate on one of them → 4 shapes now.
- [ ] Click "✎ Freehand" → draw a freehand shape that overlaps two of the rectangles. 5 shapes now.
- [ ] Ctrl+Shift+Click two of the overlapping rectangles. Click "Merge" → 4 shapes.
- [ ] Place a small rectangle inside the merged shape. Click the merged shape first, then Ctrl+Shift+Click the small one. Click "Subtract" → merged shape now has a hole.
- [ ] Place yet another rectangle overlapping the merged-with-hole shape. Select both. Click "Intersect" → overlap-only smaller polygon.
- [ ] Delete extras until exactly one shape remains. Click "Use as polygon →" → bed/zone preview renders (orange/green lines).
- [ ] Click "Download GeoJSON" → file downloads. Open it; verify it's a valid `FeatureCollection`.
- [ ] Click "📦 Save shapes locally" → reload page → shape reappears.
- [ ] Click "Clear all" → confirm → editor empty.
- [ ] Verify section 7 ("Saved outputs") still wraps filenames correctly and doesn't horizontally scroll the sidebar.

- [ ] **Step 3: If everything passes, tag the work**

```bash
git log --oneline -20  # confirm history is clean
# No tag needed; the commits document the work clearly.
```

- [ ] **Step 4: Commit any last polish**

If any fixes were made during step 2:

```bash
git add -A
git commit -m "fix(editor): regressions caught in end-to-end verification"
```

If no fixes were needed, this task ends without a commit.

---

## Known limitations (documented for future work)

These were called out as **explicitly out of scope** in the spec; do not implement in this plan:

- Snapping (Geoman default off; enable later via `pmIgnore` / `snappable` config).
- Multi-level undo/redo (only single-step undo for the last boolean op).
- Ellipse/circle primitives.
- Touch/mobile gestures.
- Server-side persistence.
- Integration with section 2 "Saved shapes" (different concept).

## Risk-mitigated decisions baked into the plan

- Geoman free lacks `scaleMode` → built our own 8-handle scaler in Task 20.
- Turf bundle is large but loaded via CDN; not bundled with our code so initial load is parallel with Leaflet.
- Pencil freehand decimation is parameterised (0.5 m) so future-tuning is a one-line change in `editor.js`.
- `localStorage` schema is versioned (`shapeEditor.shapes.v1`) so a future incompatible change can bump the key and silently ignore old data.
