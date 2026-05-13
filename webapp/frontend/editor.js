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
  // Auto-init if app.js has already exposed its map + onUsePolygon hook.
  if (window.app && window.app.map && typeof window.app.onUsePolygon === "function") {
    ShapeEditor.init({ map: window.app.map, onUsePolygon: window.app.onUsePolygon });
  }
})();
