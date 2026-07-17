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
  it("tessellates a square into triangles with full + edge kinds + hex outlines", () => {
    const { triads, hexagons } = generateTriads(square, { sideLength: 4 });
    expect(triads.type).toBe("FeatureCollection");
    expect(triads.features.length).toBeGreaterThan(20);
    const kinds = new Set(triads.features.map((f) => f.properties.kind));
    expect(kinds.has("full")).toBe(true);
    expect(kinds.has("edge")).toBe(true);
    expect(triads.features[0].properties.id).toMatch(/^H1-[1-6]$/);
    // one hexagon outline per hexagon
    expect(hexagons.features.length).toBeGreaterThan(0);
    const hexIds = new Set(triads.features.map((f) => f.properties.hex));
    expect(hexagons.features.length).toBe(hexIds.size);
  });

  it("groups 6 triads into a hexagon", () => {
    const { triads } = generateTriads(square, { sideLength: 3 });
    const byHex = new Map<number, number>();
    for (const f of triads.features) {
      const h = f.properties.hex as number;
      byHex.set(h, (byHex.get(h) ?? 0) + 1);
    }
    // A fully-interior hexagon has all 6 triads; none exceed 6.
    expect(Math.max(...byHex.values())).toBe(6);
  });

  it("tags every triad and hexagon with a band + label (the row-equivalent unit)", () => {
    const { triads, hexagons } = generateTriads(square, { sideLength: 4 });
    // Every triad has a positive integer band and a "Band N · Triad ..." label.
    for (const f of triads.features) {
      expect(f.properties.band).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(f.properties.band)).toBe(true);
      expect(f.properties.label).toMatch(/^Band \d+ · Triad H\d+-[1-6]$/);
    }
    // Hexagons carry the band too, and all 6 triads of a hexagon share its band.
    const bandByHex = new Map<number, number>();
    for (const f of triads.features) bandByHex.set(f.properties.hex, f.properties.band);
    for (const h of hexagons.features) {
      expect(h.properties.band).toBe(bandByHex.get(h.properties.hex));
      expect(h.properties.label).toMatch(/^Band \d+ · Hex H\d+$/);
    }
    // More than one band tessellates the square.
    expect(new Set(triads.features.map((f) => f.properties.band)).size).toBeGreaterThan(1);
  });

  it("changes output when rotated", () => {
    const a = generateTriads(square, { sideLength: 5 });
    const b = generateTriads(square, { sideLength: 5, rotationDeg: 25 });
    expect(b.triads.features.length).toBeGreaterThan(0);
    expect(JSON.stringify(b.triads.features)).not.toBe(JSON.stringify(a.triads.features));
  });

  it("returns empty for invalid side length", () => {
    expect(generateTriads(square, { sideLength: 0 }).triads.features).toHaveLength(0);
  });
});
