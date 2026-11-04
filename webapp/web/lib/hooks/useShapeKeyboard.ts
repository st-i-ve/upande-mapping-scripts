"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { resolveShapeKey } from "@/lib/map/shapeKeys";
import { redoStep, undoStep } from "@/lib/undoActions";
import { resolveToolKey } from "@/lib/map/tools";
import { runTool } from "@/lib/toolActions";
import { finishSlicing } from "@/lib/shapeActions";

/**
 * Map keyboard shortcuts:
 * - Ctrl/⌘+Z undoes the last step: a vertex while drawing, a point while placing
 *   a straight cut, a cut while slicing, and otherwise the last change to the
 *   shapes, folders or reference points (50 steps back). Ctrl+Shift+Z / Ctrl+Y redo.
 * - Delete / Backspace undoes the last point of a straight cut path if one is
 *   being placed, and otherwise removes the selected saved shapes — or, with none
 *   selected, the unsaved drawing.
 * - Escape puts the knife away (and only the knife).
 * - Enter finishes a slicing session (saves the pieces).
 * - Single letters pick a rail tool (K knife, V select, … — see lib/map/tools.ts).
 *
 * Reads state at keypress time so the listener binds once for the map's life.
 */
export function useShapeKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Enter finishes a slicing session — unless it's pressing a focused button or typing.
      if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey && useAppStore.getState().slice) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag !== "BUTTON" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT" && tag !== "A") {
          e.preventDefault();
          finishSlicing();
          return;
        }
      }
      const tool = resolveToolKey(e);
      if (tool) {
        e.preventDefault();
        if (!e.repeat) runTool(tool, true);
        return;
      }
      const action = resolveShapeKey(e);
      if (!action) return;
      const handle = useMapBridge.getState().handle;
      const st = useAppStore.getState();

      if (action === "escape") {
        // Only the knife — Escape must not disturb a pick or an edit session.
        if (handle?.knifeArmed()) {
          e.preventDefault();
          handle.knifeStop();
        }
        return;
      }

      if (action === "undo" || action === "redo") {
        e.preventDefault(); // never the browser's own undo over the map
        if (action === "undo") undoStep();
        else redoStep();
        return;
      }

      // Placing knife points takes priority — otherwise the same key would
      // delete shapes out from under an in-progress cut.
      if (handle?.knifePopPoint() || handle?.drawPopVertex?.()) {
        e.preventDefault();
        return;
      }
      if (st.selectedShapes.length) {
        e.preventDefault();
        st.removeSavedShapes(st.selectedShapes);
        return;
      }
      if (handle?.hasDrawn?.()) {
        e.preventDefault();
        handle.clearDrawn();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
