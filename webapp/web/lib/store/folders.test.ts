import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "./appStore";
import { allFolders, deleteFolder, moveFolder } from "./folders";
import type { GeoGeometry, SavedShape } from "@/lib/types";

const g: GeoGeometry = { type: "Point", coordinates: [0, 0] };
const shape = (name: string, folder?: string): SavedShape => ({ name, geometry: g, visible: true, ...(folder ? { folder } : {}) });

describe("folder helpers", () => {
  it("lists every folder, parents included, from shapes and the folder list", () => {
    expect(allFolders(["Empty"], [shape("a", "GH/A"), shape("b")])).toEqual(["Empty", "GH", "GH/A"]);
  });

  it("moving a folder carries its sub-folders and shapes", () => {
    const r = moveFolder(["GH", "GH/A"], [shape("a", "GH/A"), shape("b", "GHX")], "GH", "North/GH");
    expect(r.folders).toEqual(expect.arrayContaining(["North/GH", "North/GH/A", "GHX"]));
    expect(r.shapes.map((s) => s.folder)).toEqual(["North/GH/A", "GHX"]); // GHX is not inside GH
  });

  it("deleting a folder removes what's in it and nothing else", () => {
    const r = deleteFolder(["GH", "GH/A", "Other"], [shape("a", "GH/A"), shape("b", "Other"), shape("c")], "GH");
    expect(r.removed).toEqual(["a"]);
    expect(r.shapes.map((s) => s.name)).toEqual(["b", "c"]);
    expect(r.folders).toEqual(["Other"]);
  });
});

describe("folders in the store", () => {
  beforeEach(() => useAppStore.setState({ savedShapes: [], folders: [], units: [], activeFolder: "", selectedShapes: [], slice: null }));

  it("files new shapes by type; replacing a shape keeps its folder", () => {
    const st = useAppStore.getState();
    st.addSavedShape("P1", g); // a point: not a circle, so a polygon-type shape
    expect(useAppStore.getState().savedShapes[0].folder).toBe("Polygons/P1");
    useAppStore.setState({ savedShapes: [{ ...useAppStore.getState().savedShapes[0], folder: "Mine" }] });
    st.addSavedShape("P1", g); // replace
    expect(useAppStore.getState().savedShapes[0].folder).toBe("Mine");
  });

  it("never makes two folders with the same name side by side", () => {
    const st = useAppStore.getState();
    expect(st.createFolder("")).toBe("New folder");
    expect(st.createFolder("")).toBe("New folder 2");
    expect(st.createFolder("New folder")).toBe("New folder/New folder");
  });

  it("renames a folder and everything under it, refusing a taken name", () => {
    const st = useAppStore.getState();
    st.createFolder("", "A");
    st.createFolder("", "B");
    st.moveShapesToFolder([], "A/Sub");
    useAppStore.setState({ savedShapes: [shape("x", "A/Sub")] });
    expect(st.renameFolder("A", "B")).toBeNull();
    expect(st.renameFolder("A", "C")).toBe("C");
    expect(useAppStore.getState().savedShapes[0].folder).toBe("C/Sub");
  });

  it("won't move a folder into itself", () => {
    const st = useAppStore.getState();
    st.createFolder("", "A");
    st.createFolder("A", "B");
    expect(st.moveFolder("A", "A/B")).toBe(false);
    expect(st.moveFolder("A/B", "")).toBe(true);
    expect(allFolders(useAppStore.getState().folders, [])).toEqual(["A", "B"]);
  });

  it("slices are filed next to the shape they were cut from", () => {
    const sq: GeoGeometry = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
    useAppStore.setState({ savedShapes: [{ ...shape("F", "Blocks"), geometry: sq }] });
    const st = useAppStore.getState();
    st.startSlice("F");
    st.applySlice([sq, sq], 1);
    st.finishSlice();
    const slices = useAppStore.getState().savedShapes.filter((s) => s.name !== "F");
    expect(slices.map((s) => s.folder)).toEqual(["Blocks", "Blocks"]);
  });
});
