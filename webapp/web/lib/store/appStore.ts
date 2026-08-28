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
  /**
   * Every already-saved slice descended from this source, with the visibility it
   * had, hidden for the session's duration. Finishing removes them all and saves
   * the new set; cancelling gives them back exactly as they were. Includes
   * superseded intermediates ("Field 2" once it has been split further) so that
   * re-cutting a shape can't leave stale, overlapping generations behind.
   */
  adopted: { name: string; wasVisible: boolean }[];
  /** How many slices the session resumed from — 0 when starting from the whole shape. */
  resumedFrom: number;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Numeric-suffix segments of a slice name: "Field 2 10" → [2, 10]. */
function sliceIndex(name: string, source: string): number[] {
  return name
    .slice(source.length)
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter((n) => !Number.isNaN(n));
}

/** Every saved slice descended from `source`, any depth — "F 1", "F 2", "F 2 1", … */
export function sliceDescendants(shapes: SavedShape[], source: string): SavedShape[] {
  const re = new RegExp(`^${escapeRe(source)}( \\d+)+$`);
  return shapes
    .filter((s) => re.test(s.name))
    .sort((a, b) => {
      const ai = sliceIndex(a.name, source);
      const bi = sliceIndex(b.name, source);
      for (let i = 0; i < Math.max(ai.length, bi.length); i++) {
        if ((ai[i] ?? 0) !== (bi[i] ?? 0)) return (ai[i] ?? 0) - (bi[i] ?? 0);
      }
      return 0;
    });
}

/**
 * The shape's current partition: descendants that were never split further. A
 * piece that has been broken down is represented by its own pieces, not itself.
 */
export function sliceLeaves(shapes: SavedShape[], source: string): SavedShape[] {
  const desc = sliceDescendants(shapes, source);
  return desc.filter((d) => !desc.some((o) => o.name.startsWith(`${d.name} `)));
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
  /**
   * Save the slices as new shapes (source kept, left hidden). Pass reviewed
   * names to use them verbatim; omit for the generated defaults. Returns the
   * names used.
   */
  finishSlice: (names?: string[]) => string[];
  /** The names the slices would be saved under right now. */
  sliceNames: () => string[];
  /**
   * Rename a shape and, with it, every slice descended from it — the hierarchy
   * lives in the names ("Field 2 1"), so leaving children behind would orphan
   * them. Returns the number of shapes renamed, 0 if the name was unusable.
   */
  renameSavedShape: (from: string, to: string) => number;

  // ---- shape selection (shift-click multi-select) ----
  selectedShapes: string[];
  toggleSelectedShape: (name: string, additive: boolean) => void;
  setSelectedShapes: (names: string[]) => void;
  clearSelectedShapes: () => void;

  /**
   * Shapes queued for triad generation, by name. Generation walks these one at a
   * time so a long run can be stopped between blocks, and each finished block
   * gets its own output.
   */
  triadQueue: string[];
  setTriadQueue: (names: string[]) => void;

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
      shapeOpacity: 0, // outline + letter by default; fill is opt-in

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
          // Pick up where the last session left off: cut the pieces that are
          // actually on the ground now, not the whole shape again. Deeper
          // generations come along too, so none are left orphaned on finish.
          const leaves = sliceLeaves(s.savedShapes, name);
          const adopted = sliceDescendants(s.savedShapes, name).map((d) => ({
            name: d.name,
            wasVisible: d.visible,
          }));
          const hide = new Set([name, ...adopted.map((a) => a.name)]);
          return {
            slice: {
              source: name,
              original: shape.geometry,
              slices: leaves.length ? leaves.map((c) => c.geometry) : [shape.geometry],
              history: [],
              widths: [],
              sourceWasVisible: wasVisible,
              adopted,
              resumedFrom: leaves.length,
            },
            savedShapes: s.savedShapes.map((x) => {
              // Hide the source and its slices — the session draws them itself.
              if (hide.has(x.name)) return { ...x, visible: false };
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
          const { source, sourceWasVisible, adopted } = s.slice;
          const back = new Map(adopted.map((a) => [a.name, a.wasVisible]));
          return {
            slice: null,
            savedShapes: s.savedShapes.map((x) => {
              if (x.name === source) return { ...x, visible: sourceWasVisible };
              // Adopted slices go back exactly as they were, visibility included.
              if (back.has(x.name)) return { ...x, visible: back.get(x.name)! };
              return x;
            }),
          };
        }),
      sliceNames: () => {
        const sess = get().slice;
        if (!sess) return [];
        const dropped = new Set(sess.adopted.map((a) => a.name));
        const taken = new Set(
          get().savedShapes.map((x) => x.name).filter((n) => !dropped.has(n)),
        );
        return sess.slices.map(() => {
          let n = 1;
          while (taken.has(`${sess.source} ${n}`)) n++;
          const nm = `${sess.source} ${n}`;
          taken.add(nm);
          return nm;
        });
      },
      renameSavedShape: (from, to) => {
        const name = to.trim();
        if (!name || name === from) return 0;
        const shapes = get().savedShapes;
        if (!shapes.some((x) => x.name === from)) return 0;
        if (shapes.some((x) => x.name.toLowerCase() === name.toLowerCase() && x.name !== from)) {
          return 0; // caller should have checked; never silently overwrite
        }
        // "Field" -> "Plot" also moves "Field 1" and "Field 2 1".
        const rename = (n: string) =>
          n === from ? name : n.startsWith(`${from} `) ? `${name}${n.slice(from.length)}` : n;
        const touched = shapes.filter((x) => rename(x.name) !== x.name).length;
        set((st) => ({
          savedShapes: st.savedShapes.map((x) => ({ ...x, name: rename(x.name) })),
          selectedShapes: st.selectedShapes.map(rename),
          slice: st.slice
            ? {
                ...st.slice,
                source: rename(st.slice.source),
                adopted: st.slice.adopted.map((a) => ({ ...a, name: rename(a.name) })),
              }
            : st.slice,
        }));
        return touched;
      },
      finishSlice: (reviewed) => {
        const sess = get().slice;
        if (!sess) return [];
        // The adopted slices — every generation of them — are replaced by this
        // session's set, so their names free up first; anything else keeps its
        // name and we number past it.
        const dropped = new Set(sess.adopted.map((a) => a.name));
        const taken = new Set(
          get().savedShapes.map((x) => x.name).filter((n) => !dropped.has(n)),
        );
        const names =
          reviewed && reviewed.length === sess.slices.length
            ? reviewed.map((n) => n.trim())
            : sess.slices.map(() => {
                let n = 1;
                while (taken.has(`${sess.source} ${n}`)) n++;
                const nm = `${sess.source} ${n}`;
                taken.add(nm);
                return nm;
              });
        set((s) => {
          const next = s.savedShapes.filter((x) => !dropped.has(x.name));
          sess.slices.forEach((geometry, i) => {
            next.push({
              name: names[i],
              geometry,
              visible: true,
              color: PALETTE[next.length % PALETTE.length],
            });
          });
          // Source is kept but stays hidden, so the slices read on the map.
          return {
            savedShapes: next,
            selectedShapes: s.selectedShapes.filter((n) => !dropped.has(n)),
            slice: null,
          };
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

      triadQueue: [],
      setTriadQueue: (triadQueue) => set({ triadQueue }),

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
      // v1: shapes are drawn as outline + letter, so fill starts off. Without this
      // a previously persisted 0.4 would keep hiding the imagery.
      version: 1,
      migrate: (persisted, version) =>
        version < 1
          ? { ...(persisted as object), shapeOpacity: 0 }
          : (persisted as never),
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
