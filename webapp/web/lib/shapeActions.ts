/**
 * Actions on the saved-shape selection, shared by the left tool rail and the
 * browser so both do exactly the same thing.
 */
import { useAppStore, type SideTab, type UnitKind } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { booleanOp, type BooleanOp } from "@/lib/geometry/booleanOps";
import { circleFit } from "@/lib/geometry/pivot";
import { askConfirm } from "@/lib/confirm";

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

/**
 * Make a saved shape the working polygon — what Generate and the knife act on —
 * and select it. Double-click does this, on the map or in the Browser. Using the
 * shape's own geometry object keeps the link: the map highlights the shape itself.
 */
export function setWorkingShape(name: string) {
  const st = useAppStore.getState();
  const shape = st.savedShapes.find((s) => s.name === name);
  if (!shape) return;
  st.setWorkingPolygon(shape.geometry);
  st.setSelectedShapes([name]);
}

/**
 * Start slicing one saved shape with the knife out (straight). The view is left
 * where it is — the knife's own cut on any shape does the same without this.
 */
export function sliceShape(name: string) {
  const st = useAppStore.getState();
  if (!st.savedShapes.some((s) => s.name === name)) return;
  st.startSlice(name);
  const b = useMapBridge.getState();
  if (b.knifeMode !== "straight") b.handle?.knifeStraight();
  b.setTool("knife-straight");
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

/** Open the Units tab at one generator, expanded. */
export function goToUnits(kind: UnitKind) {
  useAppStore.getState().setUnitOpen(kind, true);
  goToSection("generate", `units-${kind}`);
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

/**
 * Save the slicing session's pieces as shapes (default names), keeping the
 * original. The knife stays out, so the next cut can start on another shape.
 */
export function finishSlicing() {
  const st = useAppStore.getState();
  if (!st.slice || st.slice.slices.length < 2) return [];
  return st.finishSlice();
}

/** Drop the session's cuts; the shape is left exactly as it was. */
export async function discardSlicing() {
  const st = useAppStore.getState();
  if (!st.slice) return;
  if (st.slice.widths.length) {
    const ok = await askConfirm({
      title: `Discard ${st.slice.widths.length} cut${st.slice.widths.length === 1 ? "" : "s"}?`,
      message: `${st.slice.source} stays as it was — nothing has been saved yet.`,
    });
    if (!ok) return;
  }
  useAppStore.getState().cancelSlice();
}
