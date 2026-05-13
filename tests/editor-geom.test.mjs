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
