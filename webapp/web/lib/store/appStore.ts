/**
 * Cross-panel app state. Persisted slices mirror the vanilla app's
 * localStorage so users keep their data. The map (LeafletMap) subscribes to
 * this store and reflects it as Leaflet layers; panels only read/write here.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  BasemapKeys,
  FeatureCollection,
  GeoGeometry,
  RefPoint,
  SavedShape,
  TerraceResult,
} from "@/lib/types";
import type { TreePoint } from "@/lib/geometry/treeGrid";

/** Bed/zone generation parameters (mirror the backend GenerateRequest). */
export interface GenParams {
  name: string;
  bed_spacing: number;
  zone_length: number;
  buffer_m: number;
  direction: "along_long_axis" | "across_long_axis";
  n_blocks: number;
  split_axis: "none" | "longest" | "shortest";
  start_corner: "NW" | "NE" | "SW" | "SE";
  block_end_beds_text: string;
}

export const DEFAULT_GEN_PARAMS: GenParams = {
  name: "",
  bed_spacing: 1.5,
  zone_length: 4,
  buffer_m: 1,
  direction: "along_long_axis",
  n_blocks: 1,
  split_axis: "none",
  start_corner: "NW",
  block_end_beds_text: "",
};

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

  // ---- generation ----
  workingPolygon: GeoGeometry | null;
  drawnGeometry: GeoGeometry | null; // transient: current shape-builder drawing
  genParams: GenParams;
  genResult: FeatureCollection | null;
  genFilename: string | null;
  setDrawnGeometry: (geom: GeoGeometry | null) => void;
  setWorkingPolygon: (geom: GeoGeometry | null) => void;
  setGenParams: (patch: Partial<GenParams>) => void;
  setGenResult: (result: FeatureCollection | null, filename: string | null) => void;

  // ---- tree grid ----
  treeGrid: TreePoint[];
  setTreeGrid: (pts: TreePoint[]) => void;

  // ---- terrace mode ----
  terraceStartEdge: number | null;
  terraceGrouping: string;
  terraceResult: TerraceResult | null;
  setTerraceStartEdge: (idx: number | null) => void;
  setTerraceGrouping: (text: string) => void;
  setTerraceResult: (r: TerraceResult | null) => void;
  clearTerrace: () => void;

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

      workingPolygon: null,
      drawnGeometry: null,
      genParams: DEFAULT_GEN_PARAMS,
      genResult: null,
      genFilename: null,
      setDrawnGeometry: (drawnGeometry) => set({ drawnGeometry }),
      setWorkingPolygon: (workingPolygon) => set({ workingPolygon }),
      setGenParams: (patch) => set((s) => ({ genParams: { ...s.genParams, ...patch } })),
      setGenResult: (genResult, genFilename) => set({ genResult, genFilename }),

      treeGrid: [],
      setTreeGrid: (treeGrid) => set({ treeGrid }),

      terraceStartEdge: null,
      terraceGrouping: "",
      terraceResult: null,
      setTerraceStartEdge: (terraceStartEdge) => set({ terraceStartEdge }),
      setTerraceGrouping: (terraceGrouping) => set({ terraceGrouping }),
      setTerraceResult: (terraceResult) => set({ terraceResult }),
      clearTerrace: () => set({ terraceStartEdge: null, terraceResult: null }),

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
        workingPolygon: s.workingPolygon,
        genParams: s.genParams,
        terraceGrouping: s.terraceGrouping,
      }),
    },
  ),
);
