/**
 * Cross-panel app state. Persisted slices mirror the vanilla app's
 * localStorage so users keep their data. The map (LeafletMap) subscribes to
 * this store and reflects it as Leaflet layers; panels only read/write here.
 */
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { SLICE_UNDO_LIMIT, fromDraft, toDraft } from "./sliceDraft";
import type {
  UnitItem,
  UnitKind,
  BasemapKeys,
  FeatureCollection,
  GeoGeometry,
  RefPoint,
  SavedShape,
  TerraceResult,
} from "@/lib/types";
import type { TreePoint } from "@/lib/geometry/treeGrid";
import type { TileLayerInfo } from "@/lib/api/client";
import {
  allFolders, cleanFolderName, deleteFolder as dropFolder, folderOf, freeFolderName, join,
  moveFolder as relocateFolder, parentOf, within,
} from "./folders";
import { arrangeByType as arrange, defaultFolder, KIND_FOLDER, shapeKind } from "./kinds";

/** The right-hand sidebar's tabs, one per flow. */
export type SideTab = "browser" | "tool" | "generate" | "export";
/** The unit generators: beds & zones, triads, hexagons, trees. */
export type { UnitKind } from "@/lib/types";

/**
 * A pivot being laid out: the circle drawn on the map plus the slicing settings,
 * previewed live until it's confirmed into a slicing session. Not persisted.
 */
export interface PivotDraft {
  /** Pivot point [lon, lat]. */
  center: [number, number];
  /** Radius out to the circumference, in metres. */
  radiusM: number;
  /** The saved circle this pivot was made from, if any — its blocks are saved under its name. */
  source?: string;
}

export interface PivotSettings {
  count: number;
  /** Path width along each spoke, in metres. */
  pathM: number;
  /** Radius of the empty machinery disc, in metres. */
  centerRadiusM: number;
  /** Bearing of the first spoke, degrees clockwise from north. */
  rotation: number;
  clockwise: boolean;
}

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
  /**
   * Cuts undone but not yet discarded, newest first — the redo stack. Making a
   * new cut clears it, because the branch it belonged to no longer exists.
   */
  future: { slices: GeoGeometry[]; width: number }[];
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

export { SLICE_UNDO_LIMIT };

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

  // ---- sidebar tab ----
  sideTab: SideTab;
  setSideTab: (t: SideTab) => void;
  /** Which unit-generator groups are expanded on the Units tab. */
  openUnits: UnitKind[];
  setUnitOpen: (u: UnitKind, open: boolean) => void;

  // ---- folders inside the project (paths, "Greenhouses/GH-A"; empty ones included) ----
  folders: string[];
  /** The folder open in the browser — new shapes are saved into it. "" = the root. */
  activeFolder: string;
  setActiveFolder: (path: string) => void;
  /** Make a folder under `parent`; returns its path. */
  createFolder: (parent: string, name?: string) => string;
  /** Rename the folder at `path` (just its last part). Returns the new path, or null if unusable/taken. */
  renameFolder: (path: string, name: string) => string | null;
  /** Move folder `path` (with everything in it) under `parent`. False if that would put it inside itself. */
  moveFolder: (path: string, parent: string) => boolean;
  /** Delete a folder with its sub-folders and shapes. Returns the shape names removed. */
  deleteFolder: (path: string) => string[];
  /** File shapes into a folder ("" = the root). */
  moveShapesToFolder: (names: string[], folder: string) => void;
  /** Show or hide every shape in a folder and its sub-folders. */
  setFolderVisible: (path: string, visible: boolean) => void;
  /** Folders expanded in the Browser tree. */
  openFolders: string[];
  setFolderOpen: (path: string, open: boolean) => void;
  /** Expand a folder and every folder above it, so what's inside is in view. */
  revealFolder: (path: string) => void;
  collapseAllFolders: () => void;
  /** File everything not yet in a type folder (Pivots, Polygons, …) into one. */
  arrangeByType: () => void;

  // ---- generated results filed in the project (pointers to saved outputs) ----
  units: UnitItem[];
  /** File a generated result; replaces one with the same filename. */
  addUnit: (u: Omit<UnitItem, "folder" | "created"> & Partial<Pick<UnitItem, "folder" | "created">>) => void;
  removeUnit: (filename: string) => void;
  renameUnit: (filename: string, name: string) => void;
  moveUnitsToFolder: (filenames: string[], folder: string) => void;

  // ---- project: the server-side home of savedShapes (persisted, so a reload reopens it) ----
  activeProject: { slug: string; name: string; version: number } | null;
  setActiveProject: (p: { slug: string; name: string; version: number } | null) => void;
  /** Swap in another set of shapes wholesale (opening a project); drops selection and any slicing. */
  replaceSavedShapes: (shapes: SavedShape[], folders?: string[], units?: UnitItem[]) => void;

  // ---- downloaded tile layers (server-side; polled, not persisted) ----
  tileLayers: TileLayerInfo[];
  setTileLayers: (l: TileLayerInfo[]) => void;
  /** A downloaded layer laid over the current base map to compare them, and its opacity (0..1). */
  /** Imported layers drawn over the standard base map, bottom to top. */
  overlayTiles: string[];
  /** Switch an imported layer on (it goes on top) or off. */
  setOverlayTileOn: (slug: string, on: boolean) => void;
  overlayOpacity: number;
  /** Where the map was last looking, so a reload comes back to the same place. */
  mapView: { lat: number; lon: number; zoom: number } | null;
  /** Tool settings that panels keep between visits and reloads (see useToolSetting). */
  toolSettings: Record<string, unknown>;
  setToolSetting: (key: string, value: unknown) => void;
  setMapView: (v: { lat: number; lon: number; zoom: number }) => void;
  setOverlayOpacity: (o: number) => void;

  // ---- pivot layout (draw a circle, preview pizza slices, confirm) ----
  pivot: PivotDraft | null;
  setPivot: (p: PivotDraft | null) => void;
  pivotSettings: PivotSettings;
  setPivotSettings: (p: Partial<PivotSettings>) => void;

  // ---- slicing session (cut one saved shape repeatedly) ----
  slice: SliceSession | null;
  /**
   * The slicing session's pieces (and their numbers) kept off the map — to look
   * at the layers underneath. The session itself carries on; the next cut shows them.
   */
  sliceHidden: boolean;
  setSliceHidden: (hidden: boolean) => void;
  /** Show or hide the session's pieces; showing them also shows the shape being sliced. */
  setSliceShown: (shown: boolean) => void;
  /** Begin slicing a saved shape; hides the source so the slice gaps read. */
  startSlice: (name: string) => void;
  /** Record a cut: pushes the previous set onto the undo stack. */
  applySlice: (slices: GeoGeometry[], width: number) => void;
  undoSlice: () => void;
  /** Put back the cut that undo took away. */
  redoSlice: () => void;
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

/** A folder move/rename applied to the store's slices. */
const relocated = (s: AppState, from: string, to: string) => {
  const r = relocateFolder(s.folders, s.savedShapes, from, to);
  const units = s.units.map((u) =>
    u.folder && within(u.folder, from) ? { ...u, folder: to + u.folder.slice(from.length) } : u,
  );
  return { folders: r.folders, savedShapes: r.shapes, units };
};

const PALETTE = ["#e5e5e5", "#9aa0a6", "#b8b8b8", "#d4d4d4", "#f5f5f5", "#8a8a8a"];

/**
 * localStorage that never throws. A write that doesn't fit (the browser keeps
 * about 5 MB per site) is retried without the slicing session's undo steps — the
 * project on the server still has them — and otherwise skipped with a warning.
 * Letting it throw would break whatever change triggered the write, half-applied.
 */
let warnedFull = false;
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
      return;
    } catch {
      /* too big — try a smaller copy */
    }
    try {
      const v = JSON.parse(value) as { state?: { slice?: { history?: unknown[]; future?: unknown[] } | null } };
      if (v.state?.slice) v.state.slice = { ...v.state.slice, history: [], future: [] };
      localStorage.setItem(name, JSON.stringify(v));
    } catch (e) {
      if (!warnedFull) console.warn("This browser's storage is full; your work is still saved with the project.", e);
      warnedFull = true;
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* nothing to do */
    }
  },
};

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

      sideTab: "browser",
      setSideTab: (sideTab) => set({ sideTab }),
      openUnits: ["zones"],
      setUnitOpen: (u, open) =>
        set((s) => ({ openUnits: open ? [...s.openUnits.filter((x) => x !== u), u] : s.openUnits.filter((x) => x !== u) })),

      folders: [],
      activeFolder: "",
      setActiveFolder: (activeFolder) => set({ activeFolder }),
      createFolder: (parent, name) => {
        const all = allFolders(get().folders, [...get().savedShapes, ...get().units]);
        const wanted = (name && cleanFolderName(name)) || "New folder";
        const path = join(parent, freeFolderName(all, parent, wanted));
        set((s) => ({ folders: [...s.folders, path] }));
        return path;
      },
      renameFolder: (path, name) => {
        const clean = cleanFolderName(name);
        if (!clean) return null;
        const to = join(parentOf(path), clean);
        if (to === path) return path;
        const all = allFolders(get().folders, [...get().savedShapes, ...get().units]);
        if (all.some((f) => f.toLowerCase() === to.toLowerCase())) return null;
        set((s) => ({
          ...relocated(s, path, to),
          activeFolder: within(s.activeFolder, path) && s.activeFolder ? to + s.activeFolder.slice(path.length) : s.activeFolder,
        }));
        return to;
      },
      moveFolder: (path, parent) => {
        if (within(parent, path) && parent !== "") return false; // into itself
        if (parentOf(path) === parent) return true;
        const all = allFolders(get().folders, [...get().savedShapes, ...get().units]);
        const name = freeFolderName(all, parent, path.slice(path.lastIndexOf("/") + 1));
        const to = join(parent, name);
        set((s) => ({
          ...relocated(s, path, to),
          activeFolder: within(s.activeFolder, path) && s.activeFolder ? to + s.activeFolder.slice(path.length) : s.activeFolder,
        }));
        return true;
      },
      deleteFolder: (path) => {
        const r = dropFolder(get().folders, [...get().savedShapes], path);
        const gone = new Set(r.removed);
        set((s) => ({
          folders: allFolders(r.folders, s.units.filter((u) => !(u.folder && within(u.folder, path)))).filter((f) => !within(f, path)),
          savedShapes: r.shapes,
          units: s.units.filter((u) => !(u.folder && within(u.folder, path))),
          selectedShapes: s.selectedShapes.filter((n) => !gone.has(n)),
          activeFolder: s.activeFolder && within(s.activeFolder, path) ? parentOf(path) : s.activeFolder,
        }));
        return r.removed;
      },
      moveShapesToFolder: (names, folder) =>
        set((s) => {
          const move = new Set(names);
          return {
            // Keep the folder listed even if it was empty before.
            folders: folder && !s.folders.includes(folder) ? [...s.folders, folder] : s.folders,
            savedShapes: s.savedShapes.map((x) =>
              move.has(x.name) && folderOf(x) !== folder ? { ...x, folder: folder || undefined } : x,
            ),
          };
        }),
      openFolders: [],
      setFolderOpen: (path, open) =>
        set((s) => ({ openFolders: open ? [...new Set([...s.openFolders, path])] : s.openFolders.filter((f) => f !== path) })),
      revealFolder: (path) =>
        set((s) => {
          const add: string[] = [];
          for (let p = path; p; p = parentOf(p)) add.push(p);
          return { openFolders: [...new Set([...s.openFolders, ...add])] };
        }),
      collapseAllFolders: () => set({ openFolders: [] }),
      arrangeByType: () =>
        set((s) => {
          const r = arrange(s.savedShapes, s.folders);
          return { savedShapes: r.shapes, folders: r.folders };
        }),

      units: [],
      addUnit: (u) =>
        set((s) => {
          const entry: UnitItem = { folder: KIND_FOLDER[u.kind], created: new Date().toISOString(), ...u };
          return { units: [...s.units.filter((x) => x.filename !== u.filename), entry] };
        }),
      removeUnit: (filename) => set((s) => ({ units: s.units.filter((u) => u.filename !== filename) })),
      renameUnit: (filename, name) =>
        set((s) => ({ units: s.units.map((u) => (u.filename === filename && name.trim() ? { ...u, name: name.trim() } : u)) })),
      moveUnitsToFolder: (filenames, folder) =>
        set((s) => {
          const move = new Set(filenames);
          return {
            folders: folder && !s.folders.includes(folder) ? [...s.folders, folder] : s.folders,
            units: s.units.map((u) => (move.has(u.filename) ? { ...u, folder: folder || undefined } : u)),
          };
        }),

      setFolderVisible: (path, visible) =>
        set((s) => ({
          savedShapes: s.savedShapes.map((x) =>
            within(folderOf(x), path) && x.visible !== visible ? { ...x, visible } : x,
          ),
        })),

      activeProject: null,
      setActiveProject: (activeProject) => set({ activeProject }),
      replaceSavedShapes: (savedShapes, folders = [], units = []) =>
        set({ savedShapes, folders, units, activeFolder: "", selectedShapes: [], slice: null, pivot: null }),

      tileLayers: [],
      setTileLayers: (tileLayers) => set({ tileLayers }),
      overlayTiles: [],
      setOverlayTileOn: (slug, on) =>
        set((s) => ({ overlayTiles: [...s.overlayTiles.filter((x) => x !== slug), ...(on ? [slug] : [])] })),
      overlayOpacity: 1,
      mapView: null,
      toolSettings: {},
      setToolSetting: (key, value) => set((s) => ({ toolSettings: { ...s.toolSettings, [key]: value } })),
      setMapView: (mapView) => set({ mapView }),
      setOverlayOpacity: (overlayOpacity) => set({ overlayOpacity }),

      pivot: null,
      setPivot: (pivot) => set({ pivot }),
      pivotSettings: { count: 4, pathM: 3, centerRadiusM: 10, rotation: 0, clockwise: true },
      setPivotSettings: (p) => set((s) => ({ pivotSettings: { ...s.pivotSettings, ...p } })),

      slice: null,
      sliceHidden: false,
      setSliceHidden: (sliceHidden) => set({ sliceHidden }),
      setSliceShown: (shown) =>
        set((s) => ({
          sliceHidden: !shown,
          savedShapes: shown && s.slice && s.savedShapes.some((x) => x.name === s.slice!.source && !x.visible)
            ? s.savedShapes.map((x) => (x.name === s.slice!.source ? { ...x, visible: true } : x))
            : s.savedShapes,
        })),
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
          // The source and its slices are NOT hidden in the saved data: the map
          // leaves them out while the session draws its own pieces. So a session
          // lost to a reload or a closed tab can't leave a shape stuck hidden.
          return {
            slice: {
              source: name,
              original: shape.geometry,
              slices: leaves.length ? leaves.map((c) => c.geometry) : [shape.geometry],
              history: [],
              widths: [],
              future: [],
              sourceWasVisible: wasVisible,
              adopted,
              resumedFrom: leaves.length,
            },
          };
        }),
      applySlice: (slices, width) =>
        set((s) =>
          s.slice
            ? {
                slice: {
                  ...s.slice,
                  slices,
                  history: [...s.slice.history, s.slice.slices].slice(-SLICE_UNDO_LIMIT),
                  widths: [...s.slice.widths, width],
                  future: [], // a new cut abandons whatever redo was holding
                },
                // You just cut — see what it did, even if the shape had been turned off.
                sliceHidden: false,
                savedShapes: s.savedShapes.some((x) => x.name === s.slice!.source && !x.visible)
                  ? s.savedShapes.map((x) => (x.name === s.slice!.source ? { ...x, visible: true } : x))
                  : s.savedShapes,
              }
            : {},
        ),
      undoSlice: () =>
        set((s) => {
          if (!s.slice?.history.length) return {};
          const history = [...s.slice.history];
          const slices = history.pop()!;
          const width = s.slice.widths[s.slice.widths.length - 1] ?? 1;
          return {
            slice: {
              ...s.slice,
              slices,
              history,
              widths: s.slice.widths.slice(0, -1),
              // Keep the cut we just took off, so it can be put back.
              future: [{ slices: s.slice.slices, width }, ...s.slice.future],
            },
          };
        }),
      redoSlice: () =>
        set((s) => {
          if (!s.slice?.future.length) return {};
          const [next, ...future] = s.slice.future;
          return {
            slice: {
              ...s.slice,
              slices: next.slices,
              history: [...s.slice.history, s.slice.slices].slice(-SLICE_UNDO_LIMIT),
              widths: [...s.slice.widths, next.width],
              future,
            },
          };
        }),
      // Nothing to put back: a session never touches the saved shapes until it finishes.
      cancelSlice: () => set((s) => (s.slice ? { slice: null } : {})),
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
          // The source is kept but hidden from here on, so its slices read on the map.
          const next = s.savedShapes
            .filter((x) => !dropped.has(x.name))
            .map((x) => (x.name === sess.source ? { ...x, visible: false } : x));
          // Slices are filed next to the shape they were cut from.
          const folder = s.savedShapes.find((x) => x.name === sess.source)?.folder;
          sess.slices.forEach((geometry, i) => {
            next.push({
              name: names[i],
              geometry,
              visible: true,
              color: PALETTE[next.length % PALETTE.length],
              ...(folder ? { folder } : {}),
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
          const existing = s.savedShapes.findIndex((x) => x.name === name);
          // A replaced shape stays where it was filed; a new one is filed by type —
          // a pivot in Pivots/<name>, anything else in Polygons (or the open folder there).
          const folder = existing >= 0
            ? s.savedShapes[existing].folder
            : defaultFolder(name, shapeKind({ geometry }), s.activeFolder);
          const entry: SavedShape = { name, geometry, visible: true, color: finalColor, ...(folder ? { folder } : {}) };
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
      storage: createJSONStorage(() => safeStorage),
      // v1: shapes are drawn as outline + letter, so fill starts off. Without this
      // a previously persisted 0.4 would keep hiding the imagery.
      version: 1,
      // A remembered session whose shape has gone (deleted, or another project
      // opened elsewhere) is dropped rather than resumed on nothing.
      merge: (persisted, current) => {
        const m = { ...current, ...(persisted as Partial<AppState>) };
        m.slice = fromDraft(m.slice, m.savedShapes.map((x) => x.name));
        return m;
      },
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
        pivotSettings: s.pivotSettings,
        activeProject: s.activeProject,
        folders: s.folders,
        units: s.units,
        sideTab: s.sideTab,
        openUnits: s.openUnits,
        openFolders: s.openFolders,
        // An unfinished slicing session survives a reload, its cut-by-cut undo
        // included (newest 50, stored as changes — see sliceDraft).
        slice: toDraft(s.slice),
        overlayTiles: s.overlayTiles,
        overlayOpacity: s.overlayOpacity,
        mapView: s.mapView,
        toolSettings: s.toolSettings,
        knifeWidth: s.knifeWidth,
        sliceHidden: s.sliceHidden,
      }),
    },
  ),
);

/** Whether the open slicing session's pieces are drawn: not hidden, and its shape not turned off. */
export const slicePiecesShown = (s: AppState) =>
  !!s.slice && !s.sliceHidden && s.savedShapes.find((x) => x.name === s.slice!.source)?.visible !== false;
