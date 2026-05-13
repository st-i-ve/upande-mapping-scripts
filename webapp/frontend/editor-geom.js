// Pure geometry helpers for the shape editor.
// Works in two environments:
//  - Browser: turf is window.turf (loaded by CDN tag); module attaches to window.EditorGeom.
//  - Node test: import this file as an ES module after `import * as turf from "@turf/turf"`
//    is in scope; the factory takes turf as an explicit dep.

(function () {
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
})();
