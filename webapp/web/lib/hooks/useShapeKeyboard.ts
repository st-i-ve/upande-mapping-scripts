"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { resolveShapeKey } from "@/lib/map/shapeKeys";

/**
 * Map keyboard shortcuts:
 * - Delete / Backspace undoes the last point of a straight cut path if one is
 *   being placed, and otherwise removes the selected saved shapes — the keyboard
 *   twin of "Delete selected" in the Saved shapes panel.
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

      if (action === "escape") {
        // Only the knife — Escape must not disturb a pick or an edit session.
        if (handle?.knifeArmed()) {
          e.preventDefault();
          handle.knifeStop();
        }
        return;
      }

      // Placing knife points takes priority — otherwise the same key would
      // delete shapes out from under an in-progress cut.
      if (handle?.knifePopPoint()) {
        e.preventDefault();
        return;
      }
      const st = useAppStore.getState();
      if (!st.selectedShapes.length) return;
      e.preventDefault();
      st.removeSavedShapes(st.selectedShapes);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
