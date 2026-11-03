/**
 * Actions on the saved-shape selection, shared by the left tool rail and the
 * browser so both do exactly the same thing.
 */
import { useAppStore, type SideTab } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { booleanOp, type BooleanOp } from "@/lib/geometry/booleanOps";
import { circleFit } from "@/lib/geometry/pivot";

/** The selected shapes, in list order (it matters: subtract = first minus the rest). */
export function selectedInOrder() {
  const { savedShapes, selectedShapes } = useAppStore.getState();
  const sel = new Set(selectedShapes);
  return savedShapes.filter((s) => sel.has(s.name));
}

/** Union / subtract / intersect the selection into a new shape. Returns an error message, or null. */
export function combineSelected(op: BooleanOp): string | null {
  const shapes = selectedInOrder();
  if (shapes.length < 2) return "Select two or more shapes to combine.";
  const result = booleanOp(shapes.map((s) => s.geometry), op);
  if (!result) return "Couldn't combine them — they need to be overlapping polygons.";
  const st = useAppStore.getState();
  const taken = new Set(st.savedShapes.map((s) => s.name));
  let name = `${op} result`;
  for (let n = 2; taken.has(name); n++) name = `${op} result ${n}`;
  st.addSavedShape(name, result);
  st.setSelectedShapes([name]);
  useMapBridge.getState().handle?.fitGeometry(result);
  return null;
}

/** Start slicing one saved shape, with it on screen and the knife out. */
export function sliceShape(name: string) {
  const st = useAppStore.getState();
  const shape = st.savedShapes.find((s) => s.name === name);
  if (!shape) return;
  st.startSlice(name);
  st.setSideTab("tool");
  const h = useMapBridge.getState().handle;
  h?.fitGeometry(shape.geometry);
  h?.knifeFreehand();
}

/** The one selected shape, if it's a circle that can become a pivot. */
export function selectedCircle() {
  const shapes = selectedInOrder();
  if (shapes.length !== 1) return null;
  const fit = circleFit(shapes[0].geometry);
  return fit ? { shape: shapes[0], fit } : null;
}

export function makePivotFromSelected() {
  const c = selectedCircle();
  if (!c) return;
  const st = useAppStore.getState();
  st.setPivot({ ...c.fit, source: c.shape.name });
  useMapBridge.getState().handle?.fitGeometry(c.shape.geometry);
  goToSection("tool", "sec-pivot");
}

export function deleteSelected() {
  const st = useAppStore.getState();
  if (st.selectedShapes.length) st.removeSavedShapes(st.selectedShapes);
}

/** Open a sidebar tab and bring one of its sections into view. */
export function goToSection(tab: SideTab, id?: string) {
  useAppStore.getState().setSideTab(tab);
  if (!id) return;
  // The tab's panels mount on the next frame.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })),
  );
}
