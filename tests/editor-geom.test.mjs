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
