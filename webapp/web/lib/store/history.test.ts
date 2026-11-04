import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "./appStore";
import { HISTORY_LIMIT, redo, resetHistory, undo, useHistory } from "./history";
import type { GeoGeometry } from "@/lib/types";

const g: GeoGeometry = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
const names = () => useAppStore.getState().savedShapes.map((s) => s.name);
const tick = () => Promise.resolve();

beforeEach(async () => {
  useAppStore.setState({ savedShapes: [], folders: [], refPoints: [], selectedShapes: [], slice: null, activeFolder: "" });
  await tick();
  resetHistory();
});

describe("undo history", () => {
  it("undoes and redoes adds, deletes and folder moves one step at a time", async () => {
    const st = useAppStore.getState();
    st.addSavedShape("A", g);
    await tick();
    st.addSavedShape("B", g);
    await tick();
    st.moveShapesToFolder(["A"], "Pivots");
    await tick();
    st.removeSavedShape("B");
    await tick();

    expect(undo()).toBe(true);
    expect(names()).toEqual(["A", "B"]);
    expect(undo()).toBe(true);
    expect(useAppStore.getState().savedShapes[0].folder).toBe("Polygons/A"); // where it was filed
    expect(redo()).toBe(true);
    expect(useAppStore.getState().savedShapes[0].folder).toBe("Pivots");
    undo(); undo(); undo();
    expect(names()).toEqual([]);
    expect(undo()).toBe(false);
  });

  it("counts a burst of changes from one click as a single step", async () => {
    const st = useAppStore.getState();
    st.addSavedShape("A", g);
    st.addSavedShape("B", g);
    await tick();
    undo();
    expect(names()).toEqual([]);
  });

  it(`keeps only the last ${HISTORY_LIMIT} steps`, async () => {
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
      useAppStore.getState().addSavedShape(`S${i}`, g);
      await tick();
    }
    expect(useHistory.getState().past).toHaveLength(HISTORY_LIMIT);
    while (undo());
    expect(names()).toHaveLength(10);
  });

  it("a new change drops what redo was holding", async () => {
    useAppStore.getState().addSavedShape("A", g);
    await tick();
    undo();
    useAppStore.getState().addSavedShape("B", g);
    await tick();
    expect(redo()).toBe(false);
    expect(names()).toEqual(["B"]);
  });

  it("drops undone shapes from the selection", async () => {
    useAppStore.getState().addSavedShape("A", g);
    await tick();
    useAppStore.setState({ selectedShapes: ["A"] });
    undo();
    expect(useAppStore.getState().selectedShapes).toEqual([]);
  });

  it("records a whole slicing session as one step, and a cancelled one as none", async () => {
    useAppStore.getState().addSavedShape("F", g);
    await tick();
    const st = useAppStore.getState();
    st.startSlice("F");
    st.applySlice([g, g], 1);
    st.cancelSlice();
    await tick();
    expect(useHistory.getState().past).toHaveLength(1); // just the add

    st.startSlice("F");
    st.applySlice([g, g], 1);
    expect(undo()).toBe(false); // the session's own undo is in charge meanwhile
    st.finishSlice();
    await tick();
    expect(names()).toEqual(["F", "F 1", "F 2"]);
    undo();
    expect(names()).toEqual(["F"]);
    expect(useAppStore.getState().savedShapes[0].visible).toBe(true); // not left hidden
  });

  it("forgets everything when reset (a project was opened)", async () => {
    useAppStore.getState().addSavedShape("A", g);
    resetHistory(); // even mid-burst
    await tick();
    expect(undo()).toBe(false);
  });
});
