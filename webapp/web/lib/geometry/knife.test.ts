import { describe, it, expect } from "vitest";
import { area, feature } from "@turf/turf";
import type { Polygon } from "geojson";
import { cutPolygon, explodePolygons } from "./knife";
import type { GeoGeometry } from "@/lib/types";

const square: GeoGeometry = {
  type: "Polygon",
  coordinates: [[
    [35.748, 0.0686],
    [35.7484, 0.0686],
    [35.7484, 0.069],
    [35.748, 0.069],
    [35.748, 0.0686],
  ]],
};

describe("cutPolygon", () => {
  it("splits a square into two pieces with a gap", () => {
    // vertical cut through the middle
    const line: [number, number][] = [[35.7482, 0.0685], [35.7482, 0.0691]];
    const cut = cutPolygon(square, line, 2);
    expect(cut).not.toBeNull();
    expect(cut!.type).toBe("MultiPolygon");
    expect((cut!.coordinates as unknown[]).length).toBe(2); // two pieces
    // gap removed area, so result < original
    const before = area(feature(square as unknown as Polygon));
    const after = area(feature(cut! as unknown as Polygon));
    expect(after).toBeLessThan(before);
  });

  it("explodes a cut result into separate polygons", () => {
    const line: [number, number][] = [[35.7482, 0.0685], [35.7482, 0.0691]];
    const cut = cutPolygon(square, line, 2)!;
    const pieces = explodePolygons(cut);
    expect(pieces.length).toBe(2);
    expect(pieces.every((p) => p.type === "Polygon")).toBe(true);
  });

  it("returns null for a degenerate line or zero width", () => {
    expect(cutPolygon(square, [[35.748, 0.0686]], 2)).toBeNull();
    expect(cutPolygon(square, [[35.7482, 0.0685], [35.7482, 0.0691]], 0)).toBeNull();
  });
});
