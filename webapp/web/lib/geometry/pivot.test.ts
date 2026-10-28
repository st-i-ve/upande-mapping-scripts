import { describe, it, expect } from "vitest";
import { area, bearing, centroid, circle, difference, feature, featureCollection, point, polygon } from "@turf/turf";
import type { Polygon } from "geojson";
import { pivotCircle, pivotSlices, pivotSpokes } from "./pivot";
import type { GeoGeometry } from "@/lib/types";

const CENTER: [number, number] = [36.8, -0.3];
// A 200 m radius pivot — about 12.6 ha.
const disc = circle(CENTER, 200, { units: "meters", steps: 128 }).geometry as unknown as GeoGeometry;
const areaOf = (g: GeoGeometry) => area(feature(g as unknown as Polygon));
const bearingOf = (g: GeoGeometry) =>
  bearing(point(CENTER), centroid(feature(g as unknown as Polygon)));

describe("pivotSlices", () => {
  it("cuts a full circle into equal slices", () => {
    const s = pivotSlices(disc, { count: 4, pathM: 0, centerRadiusM: 0 })!;
    expect(s).toHaveLength(4);
    const total = areaOf(disc);
    for (const g of s) expect(areaOf(g)).toBeCloseTo(total / 4, -2);
  });

  it("leaves the path and the centre disc empty", () => {
    const plain = pivotSlices(disc, { count: 6, pathM: 0, centerRadiusM: 0 })!;
    const cut = pivotSlices(disc, { count: 6, pathM: 4, centerRadiusM: 15 })!;
    expect(cut).toHaveLength(6);
    const sum = (gs: GeoGeometry[]) => gs.reduce((t, g) => t + areaOf(g), 0);
    const lost = sum(plain) - sum(cut);
    // 15 m disc ≈ 707 m², six 4 m paths from 15 m to 200 m ≈ 4440 m².
    expect(lost).toBeGreaterThan(4000);
    expect(lost).toBeLessThan(6000);
  });

  it("numbers slices clockwise from the start bearing", () => {
    const s = pivotSlices(disc, { count: 4, pathM: 2, centerRadiusM: 10, startBearing: 0 })!;
    // Slice 1 spans N→E, so its middle points north-east; then SE, SW, NW.
    expect(bearingOf(s[0])).toBeCloseTo(45, -1);
    expect(bearingOf(s[1])).toBeCloseTo(135, -1);
    expect(bearingOf(s[2])).toBeCloseTo(-135, -1);
    expect(bearingOf(s[3])).toBeCloseTo(-45, -1);
  });

  it("numbers anticlockwise on request", () => {
    const s = pivotSlices(disc, { count: 4, pathM: 0, centerRadiusM: 0, clockwise: false })!;
    expect(bearingOf(s[0])).toBeCloseTo(-45, -1);
    expect(bearingOf(s[1])).toBeCloseTo(-135, -1);
  });

  it("skips wedges a part-circle doesn't reach", () => {
    // Take the whole north-west quarter out of the pivot.
    const nw = polygon([[[CENTER[0], CENTER[1]], [CENTER[0], CENTER[1] + 0.01],
      [CENTER[0] - 0.01, CENTER[1] + 0.01], [CENTER[0] - 0.01, CENTER[1]], [CENTER[0], CENTER[1]]]]);
    const part = difference(featureCollection([feature(disc as unknown as Polygon), nw]))!
      .geometry as unknown as GeoGeometry;
    const s = pivotSlices(part, { center: CENTER, count: 4, pathM: 0, centerRadiusM: 0 })!;
    expect(s).toHaveLength(3);
  });

  it("rejects nonsense", () => {
    expect(pivotSlices(disc, { count: 0, pathM: 1, centerRadiusM: 0 })).toBeNull();
    expect(pivotSlices(disc, { count: 4, pathM: -1, centerRadiusM: 0 })).toBeNull();
    expect(pivotSlices(disc, { count: 4, pathM: 0, centerRadiusM: 500 })).toBeNull();
  });
});

describe("pivotSpokes", () => {
  it("runs one spoke per cut from the centre disc to the edge", () => {
    const sp = pivotSpokes(CENTER, 200, 4, 10, 90);
    expect(sp).toHaveLength(4);
    // First spoke points east at the requested rotation.
    expect(bearing(point(sp[0][0]), point(sp[0][1]))).toBeCloseTo(90, 0);
    expect(pivotSpokes(CENTER, 200, 1, 10)).toEqual([]);
  });

  it("pivotCircle slices like a drawn pivot", () => {
    const s = pivotSlices(pivotCircle(CENTER, 150), { center: CENTER, count: 8, pathM: 3, centerRadiusM: 12 });
    expect(s).toHaveLength(8);
  });
});
