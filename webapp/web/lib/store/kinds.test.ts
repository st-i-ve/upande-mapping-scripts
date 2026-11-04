import { describe, it, expect, beforeEach } from "vitest";
import { arrangeByType, defaultFolder, kindOfFolder, shapeKind } from "./kinds";
import { useAppStore } from "./appStore";
import { pivotCircle } from "@/lib/geometry/pivot";
import type { GeoGeometry, SavedShape } from "@/lib/types";

const square: GeoGeometry = { type: "Polygon", coordinates: [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]]] };
const circle = pivotCircle([36.67, 0.04], 200);
const sh = (name: string, geometry: GeoGeometry, folder?: string): SavedShape =>
  ({ name, geometry, visible: true, ...(folder ? { folder } : {}) });

describe("filing by type", () => {
  it("knows a pivot circle from a polygon", () => {
    expect(shapeKind({ geometry: circle })).toBe("pivots");
    expect(shapeKind({ geometry: square })).toBe("polygons");
  });

  it("gives each new shape its own folder under its type", () => {
    expect(defaultFolder("Pivot A", "pivots", "")).toBe("Pivots/Pivot A");
    expect(defaultFolder("Field", "polygons", "")).toBe("Polygons/Field");
    expect(defaultFolder("Field", "polygons", "Polygons")).toBe("Polygons/Field");
    expect(defaultFolder("Field", "polygons", "Polygons/North")).toBe("Polygons/North");
    expect(defaultFolder("Field", "polygons", "Pivots/Pivot A")).toBe("Polygons/Field");
  });

  it("reads type folders", () => {
    expect(kindOfFolder("Triads")).toBe("triads");
    expect(kindOfFolder("Pivots/Pivot 1")).toBe("pivots");
    expect(kindOfFolder("Greenhouses")).toBeNull();
  });

  it("arranges a lokitela-style project: block folders move under their type, whole", () => {
    const r = arrangeByType(
      [
        sh("Pivot 1", circle, "Pivot 1"), sh("Pivot 1 1", square, "Pivot 1"),
        sh("Paddock A", square, "Paddock A"), sh("Paddock A1", square, "Paddock A"),
        sh("Loose", square), sh("Loose 1", square),
        sh("Pivot B", circle), sh("Pivot B 1", square),
        sh("Done", square, "Polygons/Old"),
      ],
      ["Pivot 1", "Paddock A", "Empty"],
    );
    const at = Object.fromEntries(r.shapes.map((s) => [s.name, s.folder]));
    expect(at).toEqual({
      "Pivot 1": "Pivots/Pivot 1", "Pivot 1 1": "Pivots/Pivot 1",
      "Paddock A": "Polygons/Paddock A", "Paddock A1": "Polygons/Paddock A",
      Loose: "Polygons/Loose", "Loose 1": "Polygons/Loose",
      "Pivot B": "Pivots/Pivot B", "Pivot B 1": "Pivots/Pivot B",
      Done: "Polygons/Old",
    });
    expect(r.folders).toEqual(expect.arrayContaining(["Pivots/Pivot 1", "Polygons/Paddock A", "Polygons/Empty"]));
    expect(r.folders).not.toContain("Pivot 1");
  });
});

describe("generated results in the project", () => {
  beforeEach(() => useAppStore.setState({ savedShapes: [], folders: [], units: [], activeFolder: "" }));
  const unit = { filename: "a.geojson", name: "Pivot 1 1 triads", kind: "triads" as const, count: 300 };

  it("files a result in its type folder", () => {
    useAppStore.getState().addUnit(unit);
    expect(useAppStore.getState().units[0].folder).toBe("Triads");
  });

  it("carries results along when their folder is renamed, drops them when it's deleted", () => {
    const st = useAppStore.getState();
    st.addUnit(unit);
    expect(st.renameFolder("Triads", "Bands")).toBe("Bands");
    expect(useAppStore.getState().units[0].folder).toBe("Bands");
    st.deleteFolder("Bands");
    expect(useAppStore.getState().units).toEqual([]);
  });

  it("arranging by type is one undoable step for the whole project", () => {
    useAppStore.setState({ savedShapes: [sh("Field", square)] });
    useAppStore.getState().arrangeByType();
    expect(useAppStore.getState().savedShapes[0].folder).toBe("Polygons/Field");
  });
});

