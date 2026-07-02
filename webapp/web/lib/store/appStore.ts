/**
 * Cross-panel app state. Persisted slices mirror the exact localStorage the
 * vanilla app used, so existing users keep their data across cutover.
 *
 * The imperative MapController (added in M2) reads/writes this store through a
 * bridge; panels never touch Leaflet directly.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BasemapKeys, RefPoint, SavedShape } from "@/lib/types";

export interface AppState {
  refPoints: RefPoint[];
  savedShapes: SavedShape[];
  basemapKeys: BasemapKeys;

  setRefPoints: (pts: RefPoint[]) => void;
  setSavedShapes: (shapes: SavedShape[]) => void;
  setBasemapKeys: (keys: BasemapKeys) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      refPoints: [],
      savedShapes: [],
      basemapKeys: {},
      setRefPoints: (refPoints) => set({ refPoints }),
      setSavedShapes: (savedShapes) => set({ savedShapes }),
      setBasemapKeys: (basemapKeys) => set({ basemapKeys }),
    }),
    {
      name: "upande-mapper", // localStorage key
      // Only persist user data, not transient UI.
      partialize: (s) => ({
        refPoints: s.refPoints,
        savedShapes: s.savedShapes,
        basemapKeys: s.basemapKeys,
      }),
    },
  ),
);
