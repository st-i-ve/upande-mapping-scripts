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
      // The label now carries the triad's number within its band — the number
      // the ERP names the document from — not its position in a hexagon.
      expect(f.properties.label).toMatch(/^Band \d+ · Triad \d+$/);
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

// ---- direction-aware numbering (the ERP contract) ----------------------------
import { numberTriads } from "./triad";
import type { TriadProps, HexProps } from "./triad";
import type { FeatureCollection as FC } from "@/lib/types";

/** A tiny square triad at (lon, lat), tagged with the band the tiling gave it. */
const tri = (lon: number, lat: number, band: number): GeoFeatureT => ({
  type: "Feature",
  geometry: {
    type: "Polygon",
    coordinates: [[[lon, lat], [lon + 0.0001, lat], [lon + 0.0001, lat + 0.0001], [lon, lat + 0.0001], [lon, lat]]],
  },
  properties: {
    id: `x`, hex: 1, tri: 1, band, triadNo: 0, unit_id: band, child_id: 0,
    label: "", kind: "full",
  },
});
type GeoFeatureT = FC<TriadProps>["features"][number];

const emptyHexes: FC<HexProps> = { type: "FeatureCollection", features: [] };
const numbers = (fc: FC<TriadProps>) =>
  fc.features.map((f) => `${f.properties.band}.${f.properties.child_id}`);

describe("numberTriads", () => {
  // Two bands: north at lat 1, south at lat 0. Three triads each, west→east.
  const sample = (): FC<TriadProps> => ({
    type: "FeatureCollection",
    features: [
      tri(0.2, 0, 9), tri(0.0, 0, 9), tri(0.1, 0, 9),      // south band, out of order
      tri(0.1, 1, 4), tri(0.2, 1, 4), tri(0.0, 1, 4),      // north band, out of order
    ],
  });

  it("numbers bands from the north by default, contiguously from 1", () => {
    const { triads } = numberTriads(sample(), emptyHexes);
    const bands = triads.features.map((f) => f.properties.band);
    expect(new Set(bands)).toEqual(new Set([1, 2]));
    // Band 1 is the northern one (lat 1), whatever the tiling called it.
    const band1 = triads.features.filter((f) => f.properties.band === 1);
    expect(band1.every((f) => (f.geometry!.coordinates as number[][][])[0][0][1] === 1)).toBe(true);
  });

  it("numbers bands from the south when asked", () => {
    const { triads } = numberTriads(sample(), emptyHexes, { bandDirection: "south-north" });
    const band1 = triads.features.filter((f) => f.properties.band === 1);
    expect(band1.every((f) => (f.geometry!.coordinates as number[][][])[0][0][1] === 0)).toBe(true);
  });

  it("numbers triads west→east within their band by default", () => {
    const { triads } = numberTriads(sample(), emptyHexes);
    const lons = triads.features
      .filter((f) => f.properties.band === 1)
      .sort((a, b) => a.properties.child_id - b.properties.child_id)
      .map((f) => (f.geometry!.coordinates as number[][][])[0][0][0]);
    expect(lons).toEqual([0.0, 0.1, 0.2]);
  });

  it("numbers triads east→west when asked", () => {
    const { triads } = numberTriads(sample(), emptyHexes, { triadDirection: "east-west" });
    const lons = triads.features
      .filter((f) => f.properties.band === 1)
      .sort((a, b) => a.properties.child_id - b.properties.child_id)
      .map((f) => (f.geometry!.coordinates as number[][][])[0][0][0]);
    expect(lons).toEqual([0.2, 0.1, 0.0]);
  });

  it("restarts child_id at 1 in every band", () => {
    const { triads } = numberTriads(sample(), emptyHexes);
    expect(numbers(triads).sort()).toEqual(["1.1", "1.2", "1.3", "2.1", "2.2", "2.3"]);
  });

  it("mirrors band/child_id into unit_id, which is what the ERP reads", () => {
    const { triads } = numberTriads(sample(), emptyHexes);
    for (const f of triads.features) {
      expect(f.properties.unit_id).toBe(f.properties.band);
      expect(f.properties.child_id).toBe(f.properties.triadNo);
    }
  });

  it("renumbers the hexagons to match their band", () => {
    const hexes: FC<HexProps> = {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [[[0, 1], [0.1, 1], [0.1, 1.1], [0, 1]]] },
        properties: { id: "H1", hex: 1, band: 4, label: "" },
      }],
    };
    const { hexagons } = numberTriads(sample(), hexes);
    expect(hexagons.features[0].properties.band).toBe(1); // band 4 was the northern one
  });
});

describe("generateTriads numbering", () => {
  it("gives every triad a band and a child_id unique within it", () => {
    const { triads } = generateTriads(square, { sideLength: 8 });
    expect(triads.features.length).toBeGreaterThan(3);
    const seen = new Set<string>();
    for (const f of triads.features) {
      const p = f.properties;
      expect(p.band).toBeGreaterThan(0);
      expect(p.child_id).toBeGreaterThan(0);
      const key = `${p.band}.${p.child_id}`;
      expect(seen.has(key)).toBe(false); // never two "Band 2 - Triad 3"
      seen.add(key);
    }
  });

  it("numbers bands contiguously from 1", () => {
    const { triads } = generateTriads(square, { sideLength: 8 });
    const bands = [...new Set(triads.features.map((f) => f.properties.band))].sort((a, b) => a - b);
    expect(bands[0]).toBe(1);
    expect(bands).toEqual(bands.map((_, i) => i + 1)); // no gaps
  });
});
