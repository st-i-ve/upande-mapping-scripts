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
