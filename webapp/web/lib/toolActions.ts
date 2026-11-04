/**
 * Running a left-rail tool — the same path for a click on the rail and for its
 * shortcut key.
 */
import { useAppStore, type SideTab } from "@/lib/store/appStore";
import { useMapBridge, type MapHandle } from "@/lib/map/mapBridge";
import { TOOL_INFO, type ToolId } from "@/lib/map/tools";
import { combineSelected, deleteSelected } from "@/lib/shapeActions";
import { redoStep, undoStep } from "@/lib/undoActions";

/** Sticky tools: picking one makes it the map's active mode. */
const MODES: Partial<Record<ToolId, { run: (h: MapHandle) => void; tab?: SideTab }>> = {
  select: { run: (h) => h.stopModes() },
  pencil: { run: (h) => h.freehand(), tab: "tool" },
  polygon: { run: (h) => h.draw("Polygon"), tab: "tool" },
  rect: { run: (h) => h.draw("Rectangle"), tab: "tool" },
  circle: { run: (h) => h.pivotDraw(), tab: "tool" },
  edit: { run: (h) => h.editMode() },
  move: { run: (h) => h.dragMode() },
  erase: { run: (h) => h.eraseMode() },
  "knife-straight": { run: (h) => h.knifeStraight() },
  "knife-draw": { run: (h) => h.knifeFreehand() },
};

export const isModeTool = (id: ToolId) => id in MODES;

/**
 * Run a tool. `fromKey` skips switching the sidebar tab — a shortcut shouldn't
 * pull the sidebar around (the knife has its own panel on the map).
 */
export function runTool(id: ToolId, fromKey = false) {
  const bridge = useMapBridge.getState();
  const h = bridge.handle;
  const st = useAppStore.getState();
  const mode = MODES[id];
  if (mode) {
    if (!h) return;
    // Re-picking the knife that's already out must not drop a path in progress.
    const already = { "knife-straight": "straight", "knife-draw": "freehand" }[id as string];
    if (already && bridge.knifeMode === already) return;
    mode.run(h);
    bridge.setTool(id);
    if (mode.tab && !fromKey) st.setSideTab(mode.tab);
    return;
  }
  switch (id) {
    case "union":
    case "subtract":
    case "intersect":
      return bridge.flashTool(combineSelected(id));
    case "undo": return void undoStep();
    case "redo": return void redoStep();
    case "delete": return deleteSelected();
    case "clear": return h?.clearDrawn();
  }
}

export { TOOL_INFO };
