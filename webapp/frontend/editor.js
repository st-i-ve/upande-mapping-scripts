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
      document.getElementById("seTool-move").addEventListener("click", () => this._toggleMoveTool());
      document.getElementById("seTool-rotate").addEventListener("click", () => this._toggleRotateTool());
      document.getElementById("seTool-scale").addEventListener("click", () => this._toggleScaleTool());
      document.getElementById("seDuplicate").addEventListener("click", () => this._duplicateSelected());
      document.getElementById("seTool-pencil").addEventListener("click", () => this._togglePencilTool());
      document.getElementById("seTogglePencilMode").addEventListener("click", () => this._togglePencilMode());
      document.getElementById("seUnion").addEventListener("click", () => this._applyBoolean("union"));
      document.getElementById("seSubtract").addEventListener("click", () => this._applyBoolean("subtract"));
      document.getElementById("seIntersect").addEventListener("click", () => this._applyBoolean("intersect"));
      document.getElementById("seUndo").addEventListener("click", () => this._undoBoolean());
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
      document.getElementById("seUseAsPolygon").addEventListener("click", () => this._useAsPolygon());
      document.getElementById("seDownload").addEventListener("click", () => this._downloadGeoJson());
      document.getElementById("seSave").addEventListener("click", () => this._saveToLocalStorage());
      document.getElementById("seClearAll").addEventListener("click", () => this._clearAll());
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          if (this.activeTool) {
            this.map.pm.disableDraw();
            if (this.activeTool === "rotate") {
              for (const id of this.selection) {
                const layer = this.shapes.get(id);
                if (layer && layer.pm && typeof layer.pm.disableRotate === "function") layer.pm.disableRotate();
              }
            } else if (this.activeTool === "move") {
              for (const id of this.selection) {
                const layer = this.shapes.get(id);
                if (layer && layer.pm && typeof layer.pm.disableLayerDrag === "function") layer.pm.disableLayerDrag();
              }
            } else if (this.activeTool === "scale") {
              this._exitScale();
              return;
            } else if (this.activeTool === "pencil") {
              this._exitPencil();
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
      layer.on("pm:dragend", () => {
        layer.feature.geometry = layer.toGeoJSON().geometry;
      });
      this._updateStats();
      this._refreshButtons();
      return id;
    },
    _removeShape(id) {
      const layer = this.shapes.get(id);
      if (!layer) return;
      // Disable any active Geoman handles before removing the layer, otherwise
      // rotation / drag helper markers can stay parented on the map.
      if (layer.pm) {
        if (typeof layer.pm.disableRotate === "function") layer.pm.disableRotate();
        if (typeof layer.pm.disableLayerDrag === "function") layer.pm.disableLayerDrag();
        if (typeof layer.pm.disable === "function") layer.pm.disable();
      }
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
      for (const id of ["seTool-rect", "seTool-pencil", "seTool-move", "seTool-rotate", "seTool-scale"]) {
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
    _toggleMoveTool() {
      if (this.selection.size === 0) {
        this._setStatus("Select shapes to move first.");
        return;
      }
      const enabling = this.activeTool !== "move";
      for (const id of this.selection) {
        const layer = this.shapes.get(id);
        if (!layer || !layer.pm) continue;
        if (enabling) {
          if (typeof layer.pm.enableLayerDrag === "function") layer.pm.enableLayerDrag();
        } else {
          if (typeof layer.pm.disableLayerDrag === "function") layer.pm.disableLayerDrag();
        }
      }
      this._setActiveTool(enabling ? "move" : null);
      this._setStatus(enabling ? "Drag any selected shape to move. Esc to finish." : "Ready.");
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
        this._invalidateUndo();
        this._setStatus(`Rectangle added.`);
      }
      // Any other tool path (pencil) does not use pm:create; we ignore.
    },
    _deleteSelected() {
      this._invalidateUndo();
      if (this.selection.size === 0) {
        this._setStatus("Nothing selected.");
        return;
      }
      const ids = [...this.selection];
      for (const id of ids) this._removeShape(id);
      this._setStatus(`Deleted ${ids.length} shape(s).`);
    },
    _duplicateSelected() {
      this._invalidateUndo();
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
          let poly = window.EditorGeom.simplifyAndClose(ring, 0.5);
          if (!poly) {
            this._setStatus("Stroke simplified to too few vertices — discarded.");
            return;
          }
          // Self-intersecting freehand strokes break later turf boolean ops.
          // Run unkinkPolygon and keep the largest non-self-intersecting piece.
          try {
            const unkinked = window.turf.unkinkPolygon(window.turf.feature(poly));
            if (unkinked && unkinked.features && unkinked.features.length > 0) {
              let best = unkinked.features[0];
              let bestArea = window.turf.area(best);
              for (let i = 1; i < unkinked.features.length; i++) {
                const a = window.turf.area(unkinked.features[i]);
                if (a > bestArea) { best = unkinked.features[i]; bestArea = a; }
              }
              poly = best.geometry;
            }
          } catch (err) {
            // Fall through with the kinked polygon; later boolean ops may surface a clearer error.
          }
          const layer = L.geoJSON({ type: "Feature", geometry: poly }).getLayers()[0];
          const id = this._addShape(layer, "pencil");
          this.selection = new Set([id]);
          this._refreshAll();
          this._invalidateUndo();
          this._setStatus("Freehand shape added.");
        },
      };
      this.map.on("mousedown", this._fhHandlers.down);
      this.map.on("mousemove", this._fhHandlers.move);
      this.map.on("mouseup", this._fhHandlers.up);
    },
    _exitFreehand() {
      // Only run when freehand was actually entered (_enterFreehand sets _fhHandlers).
      if (!this._fhHandlers) return;
      this.map.off("mousedown", this._fhHandlers.down);
      this.map.off("mousemove", this._fhHandlers.move);
      this.map.off("mouseup", this._fhHandlers.up);
      this._fhHandlers = null;
      if (this._fhPreview) {
        this.map.removeLayer(this._fhPreview);
        this._fhPreview = null;
      }
      this._fhPoints = null;
      this.map.dragging.enable();
    },
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
      // Callers (click-on-first-vertex / Enter) only invoke this with >=3 vertices,
      // so ring is guaranteed to have >=4 entries (3 + closing duplicate).
      const layer = L.geoJSON({ type: "Feature", geometry: { type: "Polygon", coordinates: [ring] } }).getLayers()[0];
      const id = this._addShape(layer, "pencil");
      this.selection = new Set([id]);
      this._refreshAll();
      this._setActiveTool(null);
      this._invalidateUndo();
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
      this._refreshAll();
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
      this._refreshAll();
      this._setStatus("Undo: boolean op reverted.");
    },
    _invalidateUndo() {
      if (this.lastBoolean) {
        this.lastBoolean = null;
        this._refreshButtons();
      }
    },
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
  };
  window.ShapeEditor = ShapeEditor;
  // Auto-init if app.js has already exposed its map + onUsePolygon hook.
  if (window.app && window.app.map && typeof window.app.onUsePolygon === "function") {
    ShapeEditor.init({ map: window.app.map, onUsePolygon: window.app.onUsePolygon });
  }
})();
