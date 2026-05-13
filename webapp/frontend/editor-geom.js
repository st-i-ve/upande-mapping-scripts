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
    function offsetRing(ring, originLngLat, dx, dy) {
      return ring.map((pt) => {
        const [x, y] = toMetric(pt, originLngLat);
        return fromMetric([x + dx, y + dy], originLngLat);
      });
    }
    function scaleRing(ring, originLngLat, sx, sy) {
      return ring.map((pt) => {
        const [x, y] = toMetric(pt, originLngLat);
        return fromMetric([x * sx, y * sy], originLngLat);
      });
    }
    function applyToRings(geomObj, ringFn) {
      const origin = turf.centroid(geomObj).geometry.coordinates;
      if (geomObj.type === "Polygon") {
        return { type: "Polygon", coordinates: geomObj.coordinates.map((r) => ringFn(r, origin)) };
      }
      if (geomObj.type === "MultiPolygon") {
        return {
          type: "MultiPolygon",
          coordinates: geomObj.coordinates.map((poly) => poly.map((r) => ringFn(r, origin))),
        };
      }
      throw new Error(`applyToRings: unsupported type ${geomObj.type}`);
    }
    function rotateGeometry(geomObj, degrees) {
      const radians = (degrees * Math.PI) / 180;
      return applyToRings(geomObj, (ring, origin) => rotateRing(ring, origin, radians));
    }
    function offsetGeometry(geomObj, dxMeters, dyMeters) {
      return applyToRings(geomObj, (ring, origin) => offsetRing(ring, origin, dxMeters, dyMeters));
    }
    function scaleGeometry(geomObj, sx, sy) {
      return applyToRings(geomObj, (ring, origin) => scaleRing(ring, origin, sx, sy));
    }
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
    return {
      toMetric, fromMetric,
      rotateGeometry, offsetGeometry, scaleGeometry,
      unionAll, subtractFromBase, intersectAll,
      simplifyAndClose,
    };
  }
  if (typeof window !== "undefined") {
    window.EditorGeom = makeEditorGeom(window.turf);
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { makeEditorGeom };
  }
})();
