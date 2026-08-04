/**
 * The slicing flow end to end: store session + real knife geometry, in the same
 * order LeafletMap drives them (startSlice → sliceAll/applySlice per stroke →
 * undo → finishSlice). Guards the seam the map wiring sits on.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { area, feature } from "@turf/turf";
import type { Polygon } from "geojson";
import { useAppStore } from "./appStore";
import { sliceAll } from "@/lib/geometry/knife";
import type { GeoGeometry } from "@/lib/types";

/** ~44m × ~44m field. */
const field: GeoGeometry = {
  type: "Polygon",
  coordinates: [[
    [35.748, 0.0686],
    [35.7484, 0.0686],
    [35.7484, 0.069],
    [35.748, 0.069],
    [35.748, 0.0686],
  ]],
};

const VERTICAL: [number, number][] = [[35.7482, 0.0685], [35.7482, 0.0691]];
const HORIZONTAL: [number, number][] = [[35.7479, 0.0688], [35.7485, 0.0688]];
const DIAGONAL: [number, number][] = [[35.74805, 0.06855], [35.74835, 0.06895]];

/** What LeafletMap's applySliceCut does for one stroke. */
function stroke(line: [number, number][], width: number) {
  const st = useAppStore.getState();
  st.setKnifeWidth(width);
  const next = sliceAll(st.slice!.slices, line, width);
  if (next) useAppStore.getState().applySlice(next, width);
  return next != null;
}

const shapes = () => useAppStore.getState().savedShapes;
const totalArea = (geoms: GeoGeometry[]) =>
  geoms.reduce((sum, g) => sum + area(feature(g as unknown as Polygon)), 0);

describe("slicing a saved shape like a cake", () => {
  beforeEach(() => {
    useAppStore.setState({ savedShapes: [], selectedShapes: [], slice: null, knifeWidth: 1 });
    useAppStore.getState().addSavedShape("Field", field);
    useAppStore.getState().startSlice("Field");
  });

  it("cuts repeatedly with a different blade width each time", () => {
    expect(stroke(VERTICAL, 2)).toBe(true);
    expect(stroke(HORIZONTAL, 0.5)).toBe(true);
    expect(stroke(DIAGONAL, 3)).toBe(true);

    const sess = useAppStore.getState().slice!;
    expect(sess.slices.length).toBeGreaterThan(4);
    expect(sess.widths).toEqual([2, 0.5, 3]);
    // Gaps only ever remove area.
    expect(totalArea(sess.slices)).toBeLessThan(totalArea([field]));
  });

  it("never touches the source shape's geometry", () => {
    stroke(VERTICAL, 2);
    stroke(HORIZONTAL, 2);
    expect(shapes()[0]).toMatchObject({ name: "Field", geometry: field });
    expect(useAppStore.getState().slice!.original).toEqual(field);
  });

  it("leaves the working polygon out of it", () => {
    useAppStore.getState().setWorkingPolygon(null);
    stroke(VERTICAL, 2);
    expect(useAppStore.getState().workingPolygon).toBeNull();
  });

  it("undoes back through the cuts, restoring earlier slice counts", () => {
    stroke(VERTICAL, 2);
    const afterFirst = useAppStore.getState().slice!.slices.length;
    stroke(HORIZONTAL, 1);
    expect(useAppStore.getState().slice!.slices.length).toBeGreaterThan(afterFirst);

    useAppStore.getState().undoSlice();
    expect(useAppStore.getState().slice!.slices).toHaveLength(afterFirst);
    useAppStore.getState().undoSlice();
    expect(useAppStore.getState().slice!.slices).toEqual([field]);
  });

  it("saves the slices on finish, original kept and hidden", () => {
    stroke(VERTICAL, 2);
    stroke(HORIZONTAL, 1);
    const count = useAppStore.getState().slice!.slices.length;

    const names = useAppStore.getState().finishSlice();
    expect(names).toHaveLength(count);
    expect(names[0]).toBe("Field 1");
    expect(useAppStore.getState().slice).toBeNull();

    const saved = shapes();
    expect(saved).toHaveLength(count + 1); // slices + the original
    expect(saved[0]).toMatchObject({ name: "Field", geometry: field, visible: false });
    expect(saved.slice(1).every((s) => s.visible && s.geometry.type === "Polygon")).toBe(true);
    // Slices tile the original, minus the blade gaps.
    expect(totalArea(saved.slice(1).map((s) => s.geometry))).toBeLessThan(totalArea([field]));
  });

  it("discards everything on cancel and gives the original back", () => {
    stroke(VERTICAL, 2);
    stroke(HORIZONTAL, 1);
    useAppStore.getState().cancelSlice();
    expect(useAppStore.getState().slice).toBeNull();
    expect(shapes()).toEqual([
      expect.objectContaining({ name: "Field", geometry: field, visible: true }),
    ]);
  });

  it("ignores a stroke clear of the shape instead of recording a cut", () => {
    expect(stroke([[35.70, 0.05], [35.71, 0.05]], 2)).toBe(false);
    const sess = useAppStore.getState().slice!;
    expect(sess.widths).toEqual([]);
    expect(sess.history).toEqual([]);
    expect(sess.slices).toEqual([field]);
  });

  it("re-slicing the same shape appends instead of overwriting", () => {
    stroke(VERTICAL, 2);
    const first = useAppStore.getState().finishSlice();

    useAppStore.getState().startSlice("Field");
    stroke(HORIZONTAL, 2);
    const second = useAppStore.getState().finishSlice();

    expect(new Set([...first, ...second]).size).toBe(first.length + second.length);
    expect(shapes()).toHaveLength(1 + first.length + second.length);
  });
});
