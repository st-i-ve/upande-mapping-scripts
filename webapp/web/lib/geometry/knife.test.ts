import { describe, it, expect } from "vitest";
import { area, feature } from "@turf/turf";
import type { Polygon } from "geojson";
import { cutPolygon, explodePolygons, mergePolygons, sliceAll } from "./knife";
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

// Square spans lon 35.748 → 35.7484, lat 0.0686 → 0.069.
const VERTICAL: [number, number][] = [[35.7482, 0.0685], [35.7482, 0.0691]];
const HORIZONTAL: [number, number][] = [[35.7479, 0.0688], [35.7485, 0.0688]];
const totalArea = (slices: GeoGeometry[]) =>
  slices.reduce((sum, s) => sum + area(feature(s as unknown as Polygon)), 0);

describe("mergePolygons", () => {
  it("gathers polygons into one MultiPolygon", () => {
    const merged = mergePolygons(explodePolygons(cutPolygon(square, VERTICAL, 2)!))!;
    expect(merged.type).toBe("MultiPolygon");
    expect((merged.coordinates as unknown[]).length).toBe(2);
  });

  it("flattens a MultiPolygon in the input", () => {
    const multi = cutPolygon(square, VERTICAL, 2)!;
    const merged = mergePolygons([multi, square])!;
    expect((merged.coordinates as unknown[]).length).toBe(3); // 2 parts + the square
  });

  it("returns null for nothing to merge", () => {
    expect(mergePolygons([])).toBeNull();
    expect(mergePolygons([{ type: "Point", coordinates: [1, 2] }])).toBeNull();
  });
});

describe("sliceAll", () => {
  it("slices a cake: each cut splits every piece it crosses", () => {
    const first = sliceAll([square], VERTICAL, 1)!;
    expect(first).toHaveLength(2);
    const second = sliceAll(first, HORIZONTAL, 1)!;
    expect(second).toHaveLength(4);
    expect(second.every((s) => s.type === "Polygon")).toBe(true);
  });

  it("subdivides a single slice when the stroke only crosses that one", () => {
    const halves = sliceAll([square], VERTICAL, 2)!;
    // Starts left of the shape, ends inside the gap — severs the left half only.
    const short: [number, number][] = [[35.7479, 0.0688], [35.7482, 0.0688]];
    const three = sliceAll(halves, short, 0.5)!;
    expect(three).toHaveLength(3);
  });

  it("keeps cutting the set across many strokes with different thicknesses", () => {
    let slices = [square];
    for (const [line, width] of [
      [VERTICAL, 2],
      [HORIZONTAL, 0.5],
      [[[35.7481, 0.0685], [35.7481, 0.0691]] as [number, number][], 3],
    ] as const) {
      slices = sliceAll(slices, line as [number, number][], width as number)!;
    }
    expect(slices).toHaveLength(6); // 2 → 4 → 6
  });

  it("takes a wider blade out of the total area", () => {
    const thin = totalArea(sliceAll([square], VERTICAL, 1)!);
    const thick = totalArea(sliceAll([square], VERTICAL, 4)!);
    expect(thick).toBeLessThan(thin);
    expect(thin).toBeLessThan(area(feature(square as unknown as Polygon)));
  });

  it("reports a stroke that misses as a no-op", () => {
    expect(sliceAll([square], [[35.70, 0.05], [35.71, 0.05]], 2)).toBeNull();
  });

  it("records a nick that trims area without splitting", () => {
    // Runs in from the left edge but stops short of the far side.
    const nick: [number, number][] = [[35.7479, 0.0688], [35.7481, 0.0688]];
    const after = sliceAll([square], nick, 1)!;
    expect(after).toHaveLength(1); // still one piece
    expect(totalArea(after)).toBeLessThan(totalArea([square])); // but smaller
  });

  it("returns null rather than destroying the set for a degenerate cut", () => {
    expect(sliceAll([square], [[35.748, 0.0686]], 2)).toBeNull();
    expect(sliceAll([square], VERTICAL, 0)).toBeNull();
    expect(sliceAll([], VERTICAL, 1)).toBeNull();
  });

  it("returns null when the blade would consume the whole set", () => {
    expect(sliceAll([square], VERTICAL, 500)).toBeNull();
  });
});
