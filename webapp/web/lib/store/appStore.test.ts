import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "./appStore";
import type { GeoGeometry } from "@/lib/types";

const geom: GeoGeometry = { type: "Point", coordinates: [35.748, 0.0686] };

function reset() {
  useAppStore.setState({ refPoints: [], savedShapes: [], selectedShapes: [] });
}

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

  it("toggles shape visibility", () => {
    const { addSavedShape, toggleShapeVisible } = useAppStore.getState();
    addSavedShape("x", geom);
    expect(useAppStore.getState().savedShapes[0].visible).toBe(true);
    toggleShapeVisible("x");
    expect(useAppStore.getState().savedShapes[0].visible).toBe(false);
  });
});
