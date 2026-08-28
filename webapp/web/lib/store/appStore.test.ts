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

    it("numbers around slices belonging to a different source", () => {
      useAppStore.getState().addSavedShape("Block", polyB);
      useAppStore.getState().addSavedShape("Block 1", polyB); // a slice of "Block"
      startOn("Block A"); // different source — must not disturb "Block 1"
      useAppStore.getState().applySlice([polyA, polyB], 2);

      expect(useAppStore.getState().finishSlice()).toEqual(["Block A 1", "Block A 2"]);
      expect(shapes().map((s) => s.name)).toContain("Block 1");
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

    it("picks up existing slices instead of re-cutting the original", () => {
      startOn("Block A");
      useAppStore.getState().applySlice([polyA, polyB], 2);
      useAppStore.getState().finishSlice(); // → Block A 1, Block A 2

      useAppStore.getState().startSlice("Block A");
      const sess = session()!;
      expect(sess.adopted.map((a) => a.name)).toEqual(["Block A 1", "Block A 2"]);
      expect(sess.resumedFrom).toBe(2);
      expect(sess.slices).toEqual([polyA, polyB]); // the slices, not the whole shape
      // Adopted slices are hidden while the session draws them itself.
      expect(shapes().filter((s) => s.visible)).toHaveLength(0);
    });

    it("breaks one slice down further, leaving its siblings alone", () => {
      startOn("Block A");
      useAppStore.getState().applySlice([polyA, polyB], 2); // → Block A 1, Block A 2
      useAppStore.getState().finishSlice();

      useAppStore.getState().startSlice("Block A 2");
      expect(session()!.resumedFrom).toBe(0); // nothing under it yet
      expect(session()!.slices).toEqual([polyB]); // just that piece
      useAppStore.getState().applySlice([polyB, polyA], 1);
      expect(useAppStore.getState().finishSlice()).toEqual(["Block A 2 1", "Block A 2 2"]);

      const names = shapes().map((s) => s.name);
      expect(names).toEqual(["Block A", "Block A 1", "Block A 2", "Block A 2 1", "Block A 2 2"]);
      // The sibling is untouched; the piece that was split is kept but hidden.
      expect(shapes().find((s) => s.name === "Block A 1")!.visible).toBe(true);
      expect(shapes().find((s) => s.name === "Block A 2")!.visible).toBe(false);
    });

    it("resumes a parent from its leaves, not from superseded pieces", () => {
      startOn("Block A");
      useAppStore.getState().applySlice([polyA, polyB], 2);
      useAppStore.getState().finishSlice();
      useAppStore.getState().startSlice("Block A 2");
      useAppStore.getState().applySlice([polyB, polyA], 1); // Block A 2 → 2 1, 2 2
      useAppStore.getState().finishSlice();

      useAppStore.getState().startSlice("Block A");
      const sess = session()!;
      // Block A 1 + the two pieces of Block A 2 — three pieces on the ground.
      expect(sess.resumedFrom).toBe(3);
      expect(sess.slices).toHaveLength(3);
      // But every generation is adopted, so none can be orphaned on finish.
      expect(sess.adopted.map((a) => a.name)).toEqual([
        "Block A 1", "Block A 2", "Block A 2 1", "Block A 2 2",
      ]);
    });

    it("leaves no orphaned grandchildren when the parent is re-cut", () => {
      startOn("Block A");
      useAppStore.getState().applySlice([polyA, polyB], 2);
      useAppStore.getState().finishSlice();
      useAppStore.getState().startSlice("Block A 2");
      useAppStore.getState().applySlice([polyB, polyA], 1);
      useAppStore.getState().finishSlice();

      useAppStore.getState().startSlice("Block A");
      useAppStore.getState().applySlice([polyA, polyB, polyA], 1);
      expect(useAppStore.getState().finishSlice()).toEqual([
        "Block A 1", "Block A 2", "Block A 3",
      ]);
      // "Block A 2 1"/"Block A 2 2" described ground the new set now owns — gone.
      expect(shapes().map((s) => s.name)).toEqual([
        "Block A", "Block A 1", "Block A 2", "Block A 3",
      ]);
    });

    it("restores adopted slices with their original visibility on cancel", () => {
      startOn("Block A");
      useAppStore.getState().applySlice([polyA, polyB], 2);
      useAppStore.getState().finishSlice();
      useAppStore.getState().toggleShapeVisible("Block A 2"); // user hid one

      useAppStore.getState().startSlice("Block A");
      useAppStore.getState().cancelSlice();
      expect(shapes().find((s) => s.name === "Block A 1")!.visible).toBe(true);
      expect(shapes().find((s) => s.name === "Block A 2")!.visible).toBe(false);
    });

    it("replaces the adopted slices on finish, renumbered from 1", () => {
      startOn("Block A");
      useAppStore.getState().applySlice([polyA, polyB], 2);
      useAppStore.getState().finishSlice();

      useAppStore.getState().startSlice("Block A");
      useAppStore.getState().applySlice([polyA, polyB, polyA], 1);
      const names = useAppStore.getState().finishSlice();

      expect(names).toEqual(["Block A 1", "Block A 2", "Block A 3"]);
      expect(shapes().map((s) => s.name)).toEqual([
        "Block A", "Block A 1", "Block A 2", "Block A 3",
      ]); // 3 slices replace the old 2 — no leftovers
    });

    it("hands the adopted slices back untouched on cancel", () => {
      startOn("Block A");
      useAppStore.getState().applySlice([polyA, polyB], 2);
      const first = useAppStore.getState().finishSlice();

      useAppStore.getState().startSlice("Block A");
      useAppStore.getState().applySlice([polyA], 1); // would have merged them
      useAppStore.getState().cancelSlice();

      expect(shapes().map((s) => s.name)).toEqual(["Block A", ...first]);
      expect(shapes().filter((s) => s.name !== "Block A").every((s) => s.visible)).toBe(true);
    });

    it("redoes a cut that was undone, width and all", () => {
      startOn("Block A");
      useAppStore.getState().applySlice([polyA, polyB], 2);
      useAppStore.getState().applySlice([polyA, polyB, polyA], 0.5);
      expect(session()!.slices).toHaveLength(3);

      useAppStore.getState().undoSlice();
      expect(session()!.slices).toHaveLength(2);
      expect(session()!.widths).toEqual([2]);
      expect(session()!.future).toHaveLength(1);

      useAppStore.getState().redoSlice();
      expect(session()!.slices).toHaveLength(3);
      expect(session()!.widths).toEqual([2, 0.5]); // the blade width comes back too
      expect(session()!.future).toEqual([]);
    });

    it("walks the whole stack back and forward", () => {
      startOn("Block A");
      useAppStore.getState().applySlice([polyA, polyB], 2);
      useAppStore.getState().applySlice([polyA, polyB, polyA], 1);
      useAppStore.getState().undoSlice();
      useAppStore.getState().undoSlice();
      expect(session()!.slices).toEqual([polyA]); // back to the untouched shape
      expect(session()!.future).toHaveLength(2);

      useAppStore.getState().redoSlice();
      useAppStore.getState().redoSlice();
      expect(session()!.slices).toHaveLength(3);
      expect(session()!.widths).toEqual([2, 1]);
    });

    it("has nothing to redo until something is undone", () => {
      startOn("Block A");
      useAppStore.getState().applySlice([polyA, polyB], 2);
      expect(session()!.future).toEqual([]);
      useAppStore.getState().redoSlice(); // no-op
      expect(session()!.slices).toHaveLength(2);
    });

    it("drops the redo stack once a new cut is made", () => {
      startOn("Block A");
      useAppStore.getState().applySlice([polyA, polyB], 2);
      useAppStore.getState().undoSlice();
      expect(session()!.future).toHaveLength(1);

      useAppStore.getState().applySlice([polyB, polyA, polyB], 3); // a different branch
      expect(session()!.future).toEqual([]);
      useAppStore.getState().redoSlice();
      expect(session()!.slices).toHaveLength(3); // still the new branch
    });

    it("saves reviewed names verbatim", () => {
      startOn("Block A");
      useAppStore.getState().applySlice([polyA, polyB], 2);
      expect(useAppStore.getState().sliceNames()).toEqual(["Block A 1", "Block A 2"]);

      const names = useAppStore.getState().finishSlice(["North strip", " South strip "]);
      expect(names).toEqual(["North strip", "South strip"]); // trimmed
      expect(shapes().map((s) => s.name)).toEqual(["Block A", "North strip", "South strip"]);
    });

    it("falls back to generated names when the review list is the wrong length", () => {
      startOn("Block A");
      useAppStore.getState().applySlice([polyA, polyB], 2);
      expect(useAppStore.getState().finishSlice(["only one"])).toEqual([
        "Block A 1", "Block A 2",
      ]);
    });

    it("finish is a no-op with no session", () => {
      expect(useAppStore.getState().finishSlice()).toEqual([]);
    });
  });

  describe("renameSavedShape", () => {
    const names = () => useAppStore.getState().savedShapes.map((s) => s.name);

    it("renames a shape and carries its slices with it", () => {
      const { addSavedShape, renameSavedShape } = useAppStore.getState();
      addSavedShape("Field", geom);
      addSavedShape("Field 1", geom);
      addSavedShape("Field 2", geom);
      addSavedShape("Field 2 1", geom);
      addSavedShape("Fieldwork", geom); // shares a prefix but is not a slice

      expect(renameSavedShape("Field", "Plot")).toBe(4);
      expect(names()).toEqual(["Plot", "Plot 1", "Plot 2", "Plot 2 1", "Fieldwork"]);
    });

    it("follows the rename through the selection", () => {
      const { addSavedShape, toggleSelectedShape, renameSavedShape } = useAppStore.getState();
      addSavedShape("Field", geom);
      addSavedShape("Field 1", geom);
      toggleSelectedShape("Field 1", true);
      renameSavedShape("Field", "Plot");
      expect(useAppStore.getState().selectedShapes).toEqual(["Plot 1"]);
    });

    it("refuses a name another shape already has, in any case", () => {
      const { addSavedShape, renameSavedShape } = useAppStore.getState();
      addSavedShape("Field", geom);
      addSavedShape("Block", geom);
      expect(renameSavedShape("Field", "Block")).toBe(0);
      expect(renameSavedShape("Field", "block")).toBe(0);
      expect(names()).toEqual(["Field", "Block"]);
    });

    it("ignores an empty name, an unchanged name, or an unknown shape", () => {
      const { addSavedShape, renameSavedShape } = useAppStore.getState();
      addSavedShape("Field", geom);
      expect(renameSavedShape("Field", "   ")).toBe(0);
      expect(renameSavedShape("Field", "Field")).toBe(0);
      expect(renameSavedShape("Nope", "X")).toBe(0);
      expect(names()).toEqual(["Field"]);
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
