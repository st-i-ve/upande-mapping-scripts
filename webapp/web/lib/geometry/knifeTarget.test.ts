import { describe, expect, it } from "vitest";
import { knifeTarget } from "./knifeTarget";
import type { GeoGeometry, SavedShape } from "@/lib/types";

const sq = (x0: number, y0: number, s: number): GeoGeometry => ({
  type: "Polygon",
  coordinates: [[[x0, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s], [x0, y0]]],
});
const shape = (name: string, g: GeoGeometry, visible = true): SavedShape => ({ name, geometry: g, visible });

const big = shape("Big", sq(0, 0, 1));
const inner = shape("Inner", sq(0.2, 0.2, 0.2));
const far = shape("Far", sq(5, 5, 1));
const across: [number, number][] = [[0.3, -0.5], [0.3, 1.5]];

describe("knifeTarget", () => {
  it("picks the smallest visible shape the line crosses", () => {
    expect(knifeTarget([big, inner, far], across)).toEqual({ name: "Inner" });
  });
  it("prefers the selected shape, then the working polygon's shape", () => {
    expect(knifeTarget([big, inner], across, { selected: ["Big"] })).toEqual({ name: "Big" });
    expect(knifeTarget([big, inner], across, { working: big.geometry })).toEqual({ name: "Big" });
  });
  it("skips hidden shapes and shapes the line misses", () => {
    expect(knifeTarget([shape("Inner", inner.geometry, false), big], across)).toEqual({ name: "Big" });
    expect(knifeTarget([far], across)).toBeNull();
  });
  it("flags an unsaved working outline", () => {
    expect(knifeTarget([far], across, { working: sq(0, 0, 1) })).toEqual({ working: true });
  });
});
