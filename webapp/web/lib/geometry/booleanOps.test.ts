import { describe, it, expect } from "vitest";
import { booleanOp } from "./booleanOps";
import type { GeoGeometry } from "@/lib/types";

const sq = (x0: number, y0: number, x1: number, y1: number): GeoGeometry => ({
  type: "Polygon",
  coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
});

const a = sq(0, 0, 2, 2);
const b = sq(1, 1, 3, 3); // overlaps a in [1,2]×[1,2]

describe("booleanOp", () => {
  it("returns null for fewer than two polygons", () => {
    expect(booleanOp([a], "union")).toBeNull();
  });

  it("union merges overlapping squares", () => {
    const r = booleanOp([a, b], "union");
    expect(r).not.toBeNull();
    expect(["Polygon", "MultiPolygon"]).toContain(r!.type);
  });

  it("intersect yields the overlap", () => {
    const r = booleanOp([a, b], "intersect");
    expect(r).not.toBeNull();
    expect(r!.type).toBe("Polygon");
  });

  it("subtract removes the rest from the first", () => {
    const r = booleanOp([a, b], "subtract");
    expect(r).not.toBeNull();
  });
});
