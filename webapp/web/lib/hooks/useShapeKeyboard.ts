"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store/appStore";
import { resolveShapeKey } from "@/lib/map/shapeKeys";

/**
 * Delete / Backspace removes the selected saved shapes — the keyboard twin of
 * "Delete selected" in the Saved shapes panel. Reads the store at keypress time
 * so the listener binds once for the life of the map.
 */
export function useShapeKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (resolveShapeKey(e) !== "delete") return;
      const st = useAppStore.getState();
      if (!st.selectedShapes.length) return;
      e.preventDefault();
      st.removeSavedShapes(st.selectedShapes);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
