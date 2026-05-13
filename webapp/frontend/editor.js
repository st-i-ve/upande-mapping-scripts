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
      this.map.on("pm:create", (e) => this._onPmCreate(e));
      // Disable Geoman's own toolbar — we drive it from our buttons.
      if (this.map.pm && this.map.pm.addControls) {
        // no-op: we never call addControls, so no Geoman UI shows.
      }
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
  };
  window.ShapeEditor = ShapeEditor;
  // Auto-init if app.js has already exposed its map + onUsePolygon hook.
  if (window.app && window.app.map && typeof window.app.onUsePolygon === "function") {
    ShapeEditor.init({ map: window.app.map, onUsePolygon: window.app.onUsePolygon });
  }
})();
