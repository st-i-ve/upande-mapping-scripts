"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { resolveShapeKey } from "@/lib/map/shapeKeys";
import { redo, undo } from "@/lib/store/history";

/**
 * Map keyboard shortcuts:
 * - Ctrl/⌘+Z undoes the last step: a vertex while drawing, a point while placing
 *   a straight cut, a cut while slicing, and otherwise the last change to the
 *   shapes, folders or reference points (50 steps back). Ctrl+Shift+Z / Ctrl+Y redo.
 * - Delete / Backspace undoes the last point of a straight cut path if one is
 *   being placed, and otherwise removes the selected saved shapes — or, with none
 *   selected, the unsaved drawing.
 * - Escape puts the knife away (and only the knife).
 *
 * Reads state at keypress time so the listener binds once for the map's life.
 */
export function useShapeKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
        if (action === "undo") {
          // The step in progress comes first, then the session, then the history.
          if (handle?.drawPopVertex?.() || handle?.knifePopPoint()) return;
          if (st.slice) return st.undoSlice();
          undo();
        } else {
          if (st.slice) return st.redoSlice();
          redo();
        }
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
