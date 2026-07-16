import { describe, it, expect } from "vitest";
import { generateTriads } from "./triad";
import type { GeoGeometry } from "@/lib/types";

// ~22m × 22m square near the equator.
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

describe("generateTriads", () => {
  it("tessellates a square into triangles with full + edge kinds", () => {
    const fc = generateTriads(square, { sideLength: 4 });
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features.length).toBeGreaterThan(20);
    const kinds = new Set(fc.features.map((f) => f.properties.kind));
    expect(kinds.has("full")).toBe(true);
    expect(kinds.has("edge")).toBe(true);
    expect(fc.features[0].properties.id).toMatch(/^H1-[1-6]$/);
  });

  it("groups 6 triads into a hexagon", () => {
    const fc = generateTriads(square, { sideLength: 3 });
    const byHex = new Map<number, number>();
    for (const f of fc.features) {
      const h = f.properties.hex as number;
      byHex.set(h, (byHex.get(h) ?? 0) + 1);
    }
    // At least one fully-interior hexagon has all 6 triads; none exceed 6.
    const sizes = [...byHex.values()];
    expect(Math.max(...sizes)).toBe(6);
  });

  it("changes output when rotated", () => {
    const a = generateTriads(square, { sideLength: 5 });
    const b = generateTriads(square, { sideLength: 5, rotationDeg: 25 });
    expect(b.features.length).toBeGreaterThan(0);
    expect(JSON.stringify(b.features)).not.toBe(JSON.stringify(a.features));
  });

  it("returns empty for invalid side length", () => {
    expect(generateTriads(square, { sideLength: 0 }).features).toHaveLength(0);
  });
});
