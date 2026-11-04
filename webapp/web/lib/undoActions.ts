/**
 * What Ctrl+Z / Ctrl+Y (and the rail's Undo / Redo) do, in order of what's
 * closest to hand: the step in progress first, then the knife's last cut, then
 * the slicing session, then the project history (50 steps).
 */
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { redo, undo } from "@/lib/store/history";

export function undoStep(): boolean {
  const h = useMapBridge.getState().handle;
  // A vertex of the polygon being drawn, or a point of the cut being placed.
  if (h?.drawPopVertex?.() || h?.knifePopPoint?.()) return true;
  // A cut that just went through: take it back and re-open its path.
  if (h?.knifeUndoCut?.()) return true;
  const st = useAppStore.getState();
  if (st.slice) {
    if (!st.slice.history.length) return false;
    st.undoSlice();
    return true;
  }
  return undo();
}

export function redoStep(): boolean {
  const h = useMapBridge.getState().handle;
  if (h?.knifeRedoCut?.()) return true;
  const st = useAppStore.getState();
  if (st.slice) {
    if (!st.slice.future.length) return false;
    st.redoSlice();
    return true;
  }
  return redo();
}
