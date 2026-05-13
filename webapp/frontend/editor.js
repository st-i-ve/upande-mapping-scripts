// Shape editor UI orchestrator. Exposes window.ShapeEditor.
(function () {
  const ShapeEditor = {
    init({ map, onUsePolygon }) {
      if (this._initialized) return;
      this._initialized = true;
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
      const btnRect = document.getElementById("seTool-rect");
      btnRect.addEventListener("click", () => this._toggleRectTool());
      document.getElementById("seDelete").addEventListener("click", () => this._deleteSelected());
      document.getElementById("seTool-rotate").addEventListener("click", () => this._toggleRotateTool());
      document.getElementById("seTool-scale").addEventListener("click", () => this._toggleScaleTool());
      document.getElementById("seDuplicate").addEventListener("click", () => this._duplicateSelected());
      this.map.on("pm:create", (e) => this._onPmCreate(e));
      // Geoman's own toolbar is suppressed by not calling map.pm.addControls().
      this.map.on("click", (e) => {
        // Only clear if we're not currently drawing.
        if (this.activeTool === "rect" || this.activeTool === "pencil") return;
        // Bail if app.js is in an "awaiting" pick mode that consumed this click.
        if (window.app && typeof window.app.isMapClickConsumed === "function" && window.app.isMapClickConsumed()) return;
        if (this.selection.size === 0) return;
        this.selection.clear();
        this._refreshAll();
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
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
          } else if (this.selection.size > 0) {
            this.selection.clear();
            this._refreshAll();
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
    },
    _restoreFromLocalStorage() {
      // wired in Task 30
    },
    _updateStats() {
      const el = document.getElementById("shapeEditorStats");
      if (!el) return;
      el.textContent = `Shapes: ${this.shapes.size} · Selected: ${this.selection.size}`;
    },
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
      layer.on("pm:edit", () => {
        layer.feature.geometry = layer.toGeoJSON().geometry;
      });
      layer.on("pm:rotateend", () => {
        layer.feature.geometry = layer.toGeoJSON().geometry;
      });
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
        this._refreshAll();
        this._setStatus(this.selection.size === 0
          ? "Ready."
          : `Selected ${this.selection.size} shape(s).`);
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
      const haveAny = sel >= 1;
      document.getElementById("seUnion").disabled = !have2plus;
      document.getElementById("seSubtract").disabled = !have2plus;
      document.getElementById("seIntersect").disabled = !have2plus;
      document.getElementById("seDelete").disabled = !haveAny;
      document.getElementById("seUseAsPolygon").disabled = this.shapes.size !== 1;
      document.getElementById("seUndo").disabled = !this.lastBoolean;
    },
    _refreshAll() {
      this._refreshSelectionStyles();
      this._updateStats();
      this._refreshButtons();
    },
    _setActiveTool(name) {
      this.activeTool = name;
      for (const id of ["seTool-rect", "seTool-pencil", "seTool-rotate", "seTool-scale"]) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.classList.toggle("active", id === `seTool-${name}`);
      }
    },
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
        this._refreshAll();
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
      this._refreshAll();
      this._setStatus(`Duplicated ${newIds.length} shape(s).`);
    },
  };
  window.ShapeEditor = ShapeEditor;
  // Auto-init if app.js has already exposed its map + onUsePolygon hook.
  if (window.app && window.app.map && typeof window.app.onUsePolygon === "function") {
    ShapeEditor.init({ map: window.app.map, onUsePolygon: window.app.onUsePolygon });
  }
})();
