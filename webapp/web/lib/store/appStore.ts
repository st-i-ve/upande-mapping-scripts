/**
 * Cross-panel app state. Persisted slices mirror the vanilla app's
 * localStorage so users keep their data. The map (LeafletMap) subscribes to
 * this store and reflects it as Leaflet layers; panels only read/write here.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  BasemapKeys,
  GeoGeometry,
  RefPoint,
  SavedShape,
} from "@/lib/types";

export interface AppState {
  // ---- persisted data ----
  refPoints: RefPoint[];
  savedShapes: SavedShape[];
  basemapKeys: BasemapKeys;
  // ---- persisted view prefs ----
  refVisible: boolean;
  refOpacity: number; // 0..1
  shapesVisible: boolean;
  shapeOpacity: number; // 0..1

  // ---- reference-point actions ----
  addRefPoint: (p: RefPoint) => void;
  removeRefPoint: (name: string) => void;
  clearRefPoints: () => void;
  setRefVisible: (v: boolean) => void;
  setRefOpacity: (o: number) => void;

  // ---- saved-shape actions ----
  addSavedShape: (name: string, geometry: GeoGeometry, color?: string) => void;
  removeSavedShape: (name: string) => void;
  removeSavedShapes: (names: string[]) => void;
  toggleShapeVisible: (name: string) => void;
  setShapesVisible: (v: boolean) => void;
  setShapeOpacity: (o: number) => void;

  setBasemapKeys: (keys: BasemapKeys) => void;
}

const PALETTE = ["#34d399", "#38bdf8", "#a3e635", "#f472b6", "#fbbf24", "#c084fc"];

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      refPoints: [],
      savedShapes: [],
      basemapKeys: {},
      refVisible: true,
      refOpacity: 0.9,
      shapesVisible: true,
      shapeOpacity: 0.4,

      addRefPoint: (p) =>
        set((s) => ({
          refPoints: [...s.refPoints.filter((x) => x.name !== p.name), p],
        })),
      removeRefPoint: (name) =>
        set((s) => ({ refPoints: s.refPoints.filter((x) => x.name !== name) })),
      clearRefPoints: () => set({ refPoints: [] }),
      setRefVisible: (refVisible) => set({ refVisible }),
      setRefOpacity: (refOpacity) => set({ refOpacity }),

      addSavedShape: (name, geometry, color) =>
        set((s) => {
          const finalColor = color ?? PALETTE[s.savedShapes.length % PALETTE.length];
          const entry: SavedShape = { name, geometry, visible: true, color: finalColor };
          const existing = s.savedShapes.findIndex((x) => x.name === name);
          const next = [...s.savedShapes];
          if (existing >= 0) next[existing] = entry;
          else next.push(entry);
          return { savedShapes: next };
        }),
      removeSavedShape: (name) =>
        set((s) => ({ savedShapes: s.savedShapes.filter((x) => x.name !== name) })),
      removeSavedShapes: (names) =>
        set((s) => {
          const drop = new Set(names);
          return { savedShapes: s.savedShapes.filter((x) => !drop.has(x.name)) };
        }),
      toggleShapeVisible: (name) =>
        set((s) => ({
          savedShapes: s.savedShapes.map((x) =>
            x.name === name ? { ...x, visible: !x.visible } : x,
          ),
        })),
      setShapesVisible: (shapesVisible) => set({ shapesVisible }),
      setShapeOpacity: (shapeOpacity) => set({ shapeOpacity }),

      setBasemapKeys: (basemapKeys) => set({ basemapKeys }),
    }),
    {
      name: "upande-mapper",
      partialize: (s) => ({
        refPoints: s.refPoints,
        savedShapes: s.savedShapes,
        basemapKeys: s.basemapKeys,
        refVisible: s.refVisible,
        refOpacity: s.refOpacity,
        shapesVisible: s.shapesVisible,
        shapeOpacity: s.shapeOpacity,
      }),
    },
  ),
);
