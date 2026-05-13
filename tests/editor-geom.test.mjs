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
