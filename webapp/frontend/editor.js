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
  };
  window.ShapeEditor = ShapeEditor;
  // Auto-init if app.js has already exposed its map + onUsePolygon hook.
  if (window.app && window.app.map && typeof window.app.onUsePolygon === "function") {
    ShapeEditor.init({ map: window.app.map, onUsePolygon: window.app.onUsePolygon });
  }
})();
