import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "./appStore";
import type { GeoGeometry } from "@/lib/types";

const geom: GeoGeometry = { type: "Point", coordinates: [35.748, 0.0686] };

function reset() {
  useAppStore.setState({ refPoints: [], savedShapes: [], selectedShapes: [], slice: null });
}

const polyA: GeoGeometry = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
const polyB: GeoGeometry = { type: "Polygon", coordinates: [[[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]] };

describe("appStore", () => {
  beforeEach(reset);

  it("adds a reference point and dedupes by name", () => {
    const { addRefPoint } = useAppStore.getState();
    addRefPoint({ name: "A", lat: 1, lon: 2 });
    addRefPoint({ name: "A", lat: 9, lon: 9 }); // replaces
    const pts = useAppStore.getState().refPoints;
    expect(pts).toHaveLength(1);
    expect(pts[0]).toMatchObject({ name: "A", lat: 9, lon: 9 });
  });

  it("adds saved shapes with auto colors and bulk-removes", () => {
    const { addSavedShape, removeSavedShapes } = useAppStore.getState();
    addSavedShape("one", geom);
    addSavedShape("two", geom);
    addSavedShape("three", geom);
    expect(useAppStore.getState().savedShapes).toHaveLength(3);
    expect(useAppStore.getState().savedShapes[0].color).toBeTruthy();

    removeSavedShapes(["one", "three"]);
    const names = useAppStore.getState().savedShapes.map((s) => s.name);
    expect(names).toEqual(["two"]);
  });

  it("drops deleted shapes from the selection", () => {
    const { addSavedShape, toggleSelectedShape, removeSavedShape, removeSavedShapes } = useAppStore.getState();
    addSavedShape("Cut 1", geom);
    addSavedShape("Cut 2", geom);
    addSavedShape("Cut 3", geom);
    toggleSelectedShape("Cut 1", true);
    toggleSelectedShape("Cut 2", true);
    toggleSelectedShape("Cut 3", true);
    expect(useAppStore.getState().selectedShapes).toEqual(["Cut 1", "Cut 2", "Cut 3"]);

    removeSavedShape("Cut 2");
    expect(useAppStore.getState().selectedShapes).toEqual(["Cut 1", "Cut 3"]);

    removeSavedShapes(["Cut 1", "Cut 3"]);
    expect(useAppStore.getState().selectedShapes).toEqual([]);
    expect(useAppStore.getState().savedShapes).toEqual([]);
  });

  describe("slicing session", () => {
    const shapes = () => useAppStore.getState().savedShapes;
    const session = () => useAppStore.getState().slice;
    const startOn = (name: string) => {
      useAppStore.getState().addSavedShape(name, polyA);
      useAppStore.getState().startSlice(name);
    };

    it("starts on a saved shape and hides the source", () => {
      startOn("Block A");
      expect(session()).toMatchObject({ source: "Block A", slices: [polyA], history: [], widths: [] });
      expect(shapes()[0].visible).toBe(false);
      expect(session()!.sourceWasVisible).toBe(true);
    });

    it("ignores a start on a shape that isn't saved", () => {
      useAppStore.getState().startSlice("nope");
      expect(session()).toBeNull();
    });

    it("records each cut with its blade width", () => {
      startOn("Block A");
      useAppStore.getState().applySlice([polyA, polyB], 2);
      useAppStore.getState().applySlice([polyA, polyB, polyA], 0.5);
      expect(session()!.slices).toHaveLength(3);
      expect(session()!.widths).toEqual([2, 0.5]);
      expect(session()!.history).toHaveLength(2);
    });

    it("undoes the last cut, and stops at the original", () => {
      startOn("Block A");
      useAppStore.getState().applySlice([polyA, polyB], 2);
      useAppStore.getState().undoSlice();
      expect(session()!.slices).toEqual([polyA]);
      expect(session()!.widths).toEqual([]);
      useAppStore.getState().undoSlice(); // nothing left to undo
      expect(session()!.slices).toEqual([polyA]);
    });

    it("leaves the source untouched and restores its visibility on cancel", () => {
      startOn("Block A");
      useAppStore.getState().applySlice([polyA, polyB], 2);
      useAppStore.getState().cancelSlice();
      expect(session()).toBeNull();
      expect(shapes()).toHaveLength(1);
      expect(shapes()[0]).toMatchObject({ name: "Block A", geometry: polyA, visible: true });
    });

    it("saves the slices on finish, keeping the source hidden", () => {
      startOn("Block A");
      useAppStore.getState().applySlice([polyA, polyB], 2);
      const names = useAppStore.getState().finishSlice();
      expect(names).toEqual(["Block A 1", "Block A 2"]);
      expect(session()).toBeNull();
      expect(shapes().map((s) => s.name)).toEqual(["Block A", "Block A 1", "Block A 2"]);
      expect(shapes()[0]).toMatchObject({ visible: false, geometry: polyA });
      expect(shapes()[1]).toMatchObject({ geometry: polyA, visible: true });
      expect(shapes()[1].color).toBeTruthy();
    });

    it("appends past taken names when the same shape is sliced again", () => {
      startOn("Block A");
      useAppStore.getState().applySlice([polyA, polyB], 2);
      expect(useAppStore.getState().finishSlice()).toEqual(["Block A 1", "Block A 2"]);

      useAppStore.getState().startSlice("Block A");
      useAppStore.getState().applySlice([polyA, polyB], 1);
      expect(useAppStore.getState().finishSlice()).toEqual(["Block A 3", "Block A 4"]);
      expect(shapes()).toHaveLength(5); // source + 4 slices, nothing overwritten
    });

    it("restores the first source when a session on another shape starts", () => {
      useAppStore.getState().addSavedShape("Block A", polyA);
      useAppStore.getState().addSavedShape("Block B", polyB);
      useAppStore.getState().startSlice("Block A");
      useAppStore.getState().startSlice("Block B");

      expect(session()!.source).toBe("Block B");
      expect(shapes().find((s) => s.name === "Block A")!.visible).toBe(true);
      expect(shapes().find((s) => s.name === "Block B")!.visible).toBe(false);
    });

    it("keeps the original visibility when restarting on the same shape", () => {
      startOn("Block A"); // start hides it
      useAppStore.getState().startSlice("Block A"); // restart must not record hidden
      expect(session()!.sourceWasVisible).toBe(true);
      useAppStore.getState().cancelSlice();
      expect(shapes()[0].visible).toBe(true);
    });

    it("finish is a no-op with no session", () => {
      expect(useAppStore.getState().finishSlice()).toEqual([]);
    });
  });

  it("toggles shape visibility", () => {
    const { addSavedShape, toggleShapeVisible } = useAppStore.getState();
    addSavedShape("x", geom);
    expect(useAppStore.getState().savedShapes[0].visible).toBe(true);
    toggleShapeVisible("x");
    expect(useAppStore.getState().savedShapes[0].visible).toBe(false);
  });
});
