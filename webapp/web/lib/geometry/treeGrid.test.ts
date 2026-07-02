import { describe, it, expect } from "vitest";
import { generateTreeGrid, treeGridToGeoJSON } from "./treeGrid";
import type { GeoGeometry } from "@/lib/types";

// ~22m (lon) × ~22m (lat) square near the equator.
const square: GeoGeometry = {
  type: "Polygon",
  coordinates: [[
    [35.748, 0.0686],
    [35.7482, 0.0686],
    [35.7482, 0.0688],
    [35.748, 0.0688],
    [35.748, 0.0686],
  ]],
};

describe("generateTreeGrid", () => {
  it("fills a rectangle with a grid at the given spacing", () => {
    const { points, rows, cols } = generateTreeGrid(square, {
      treeSpacing: 5,
      rowSpacing: 5,
      majorEdge: "EW",
    });
    // ~22m / 5m ≈ 5 steps per axis → a few dozen points.
    expect(points.length).toBeGreaterThan(10);
    expect(rows).toBeGreaterThan(1);
    expect(cols).toBeGreaterThan(1);
    expect(points[0]).toMatchObject({ row: 1, tree: 1 });
  });

  it("returns nothing for invalid spacing", () => {
    expect(generateTreeGrid(square, { treeSpacing: 0, rowSpacing: 5, majorEdge: "EW" }).points).toHaveLength(0);
  });

  it("exports points as a FeatureCollection with labels", () => {
    const { points } = generateTreeGrid(square, { treeSpacing: 8, rowSpacing: 8, majorEdge: "EW" });
    const fc = treeGridToGeoJSON(points);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features[0].properties.label).toMatch(/^R\d+·T\d+$/);
  });
});
