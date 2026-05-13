// Pure geometry helpers for the shape editor.
// Works in two environments:
//  - Browser: turf is window.turf (loaded by CDN tag); module attaches to window.EditorGeom.
//  - Node test: import this file as an ES module after `import * as turf from "@turf/turf"`
//    is in scope; the factory takes turf as an explicit dep.

(function () {
  function makeEditorGeom(turf) {
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
    return { toMetric, fromMetric, rotateGeometry };
  }
  if (typeof window !== "undefined") {
    window.EditorGeom = makeEditorGeom(window.turf);
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { makeEditorGeom };
  }
})();
