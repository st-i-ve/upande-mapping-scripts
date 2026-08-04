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

/**
 * An in-progress slicing session — cut a saved shape repeatedly, like slicing a
 * cake, with the blade width free to change between strokes. The source shape is
 * never mutated; slices only become saved shapes on finishSlice(). Deliberately
 * NOT persisted: a transient editing buffer that outlived a reload is exactly
 * what left an undeletable outline on the map before.
 */
export interface SliceSession {
  /** Name of the saved shape being sliced. */
  source: string;
  /** Untouched copy of the source geometry, for restoring on cancel. */
  original: GeoGeometry;
  /** Current slice set. */
  slices: GeoGeometry[];
  /** Slice sets before each cut — the undo stack. */
  history: GeoGeometry[][];
  /** Blade width used for each cut so far, in metres. */
  widths: number[];
  /** Whether the source shape was visible when the session started. */
  sourceWasVisible: boolean;
}

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

  // ---- view (2D map / 3D) ----
  view: "2d" | "3d";
  setView: (v: "2d" | "3d") => void;

  // ---- tree grid ----
  treeGrid: TreePoint[];
  setTreeGrid: (pts: TreePoint[]) => void;

  // ---- knife ----
  knifeWidth: number; // blade width / gap in metres
  setKnifeWidth: (w: number) => void;

  // ---- slicing session (cut one saved shape repeatedly) ----
  slice: SliceSession | null;
  /** Begin slicing a saved shape; hides the source so the slice gaps read. */
  startSlice: (name: string) => void;
  /** Record a cut: pushes the previous set onto the undo stack. */
  applySlice: (slices: GeoGeometry[], width: number) => void;
  undoSlice: () => void;
  /** Discard the session and restore the source shape's visibility. */
  cancelSlice: () => void;
  /** Save the slices as new shapes (source kept, left hidden). Returns their names. */
  finishSlice: () => string[];

  // ---- shape selection (shift-click multi-select) ----
  selectedShapes: string[];
  toggleSelectedShape: (name: string, additive: boolean) => void;
  setSelectedShapes: (names: string[]) => void;
  clearSelectedShapes: () => void;

  // ---- triad (hexagonal triangle tessellation) ----
  triad: FeatureCollection | null;
  triadHexes: FeatureCollection | null;
  setTriad: (fc: FeatureCollection | null) => void;
  setTriadHexes: (fc: FeatureCollection | null) => void;

  // ---- terrace mode ----
  terraceStartEdge: number | null;
  terraceGrouping: string;
  terraceResult: TerraceResult | null;
  terraceCorners: Record<string, "NW" | "NE" | "SW" | "SE">;
  setTerraceStartEdge: (idx: number | null) => void;
  setTerraceGrouping: (text: string) => void;
  setTerraceResult: (r: TerraceResult | null) => void;
  setTerraceCorner: (blockId: string, corner: "NW" | "NE" | "SW" | "SE") => void;
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

const PALETTE = ["#e5e5e5", "#9aa0a6", "#b8b8b8", "#d4d4d4", "#f5f5f5", "#8a8a8a"];

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
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

      view: "2d",
      setView: (view) => set({ view }),

      treeGrid: [],
      setTreeGrid: (treeGrid) => set({ treeGrid }),

      knifeWidth: 1,
      setKnifeWidth: (knifeWidth) => set({ knifeWidth }),

      slice: null,
      startSlice: (name) =>
        set((s) => {
          const shape = s.savedShapes.find((x) => x.name === name);
          if (!shape) return {};
          const prev = s.slice; // starting a session abandons any session in progress
          const wasVisible = prev?.source === name ? prev.sourceWasVisible : shape.visible;
          return {
            slice: {
              source: name,
              original: shape.geometry,
              slices: [shape.geometry],
              history: [],
              widths: [],
              sourceWasVisible: wasVisible,
            },
            savedShapes: s.savedShapes.map((x) => {
              // Hide the new source — its solid fill would sit over the slice gaps.
              if (x.name === name) return { ...x, visible: false };
              // Don't leave the abandoned session's source stuck hidden.
              if (prev && x.name === prev.source) return { ...x, visible: prev.sourceWasVisible };
              return x;
            }),
          };
        }),
      applySlice: (slices, width) =>
        set((s) =>
          s.slice
            ? {
                slice: {
                  ...s.slice,
                  slices,
                  history: [...s.slice.history, s.slice.slices],
                  widths: [...s.slice.widths, width],
                },
              }
            : {},
        ),
      undoSlice: () =>
        set((s) => {
          if (!s.slice?.history.length) return {};
          const history = [...s.slice.history];
          const slices = history.pop()!;
          return { slice: { ...s.slice, slices, history, widths: s.slice.widths.slice(0, -1) } };
        }),
      cancelSlice: () =>
        set((s) => {
          if (!s.slice) return {};
          const { source, sourceWasVisible } = s.slice;
          return {
            slice: null,
            savedShapes: s.savedShapes.map((x) =>
              x.name === source ? { ...x, visible: sourceWasVisible } : x,
            ),
          };
        }),
      finishSlice: () => {
        const sess = get().slice;
        if (!sess) return [];
        // Number the slices past any name already taken, so a second session on
        // the same shape appends rather than overwriting the first batch.
        const taken = new Set(get().savedShapes.map((x) => x.name));
        const names = sess.slices.map(() => {
          let n = 1;
          while (taken.has(`${sess.source} ${n}`)) n++;
          const nm = `${sess.source} ${n}`;
          taken.add(nm);
          return nm;
        });
        set((s) => {
          const next = [...s.savedShapes];
          sess.slices.forEach((geometry, i) => {
            next.push({
              name: names[i],
              geometry,
              visible: true,
              color: PALETTE[next.length % PALETTE.length],
            });
          });
          // Source is kept but stays hidden, so the slices read on the map.
          return { savedShapes: next, slice: null };
        });
        return names;
      },

      selectedShapes: [],
      toggleSelectedShape: (name, additive) =>
        set((s) => {
          if (!additive) return { selectedShapes: [name] };
          return s.selectedShapes.includes(name)
            ? { selectedShapes: s.selectedShapes.filter((n) => n !== name) }
            : { selectedShapes: [...s.selectedShapes, name] };
        }),
      setSelectedShapes: (selectedShapes) => set({ selectedShapes }),
      clearSelectedShapes: () => set({ selectedShapes: [] }),

      triad: null,
      triadHexes: null,
      setTriad: (triad) => set({ triad }),
      setTriadHexes: (triadHexes) => set({ triadHexes }),

      terraceStartEdge: null,
      terraceGrouping: "",
      terraceResult: null,
      terraceCorners: {},
      setTerraceStartEdge: (terraceStartEdge) => set({ terraceStartEdge }),
      setTerraceGrouping: (terraceGrouping) => set({ terraceGrouping }),
      setTerraceResult: (terraceResult) => set({ terraceResult, terraceCorners: {} }),
      setTerraceCorner: (blockId, corner) =>
        set((s) => ({ terraceCorners: { ...s.terraceCorners, [blockId]: corner } })),
      clearTerrace: () => set({ terraceStartEdge: null, terraceResult: null, terraceCorners: {} }),

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
      // Removal also prunes the selection — a deleted name must not linger there.
      removeSavedShape: (name) =>
        set((s) => ({
          savedShapes: s.savedShapes.filter((x) => x.name !== name),
          selectedShapes: s.selectedShapes.filter((n) => n !== name),
        })),
      removeSavedShapes: (names) =>
        set((s) => {
          const drop = new Set(names);
          return {
            savedShapes: s.savedShapes.filter((x) => !drop.has(x.name)),
            selectedShapes: s.selectedShapes.filter((n) => !drop.has(n)),
          };
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
