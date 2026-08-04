/**
 * The command bridge between React panels and the imperative Leaflet map.
 * LeafletMap registers a handle on mount; panels call it for imperative
 * actions (fly to a point, fit a shape, pick a point by clicking the map).
 *
 * Kept in its own non-persisted store because the handle closes over live
 * Leaflet objects, which must never land in the persisted app store.
 */
import { create } from "zustand";
import type { GeoGeometry } from "@/lib/types";

export interface MapHandle {
  flyTo: (lat: number, lon: number, zoom?: number) => void;
  fitGeometry: (geom: GeoGeometry) => void;
  /** Arm a one-shot map click that returns the clicked coordinate. */
  pickPoint: (cb: (lat: number, lon: number) => void) => void;
  cancelPick: () => void;
  isPicking: () => boolean;
  /** Arm a one-shot click to pick the nearest edge of `ring` ([lon,lat][]). */
  pickEdge: (ring: [number, number][], cb: (idx: number | null) => void) => void;
  // ---- shape builder (Geoman) ----
  draw: (shape: "Polygon" | "Rectangle") => void;
  editMode: () => void;
  dragMode: () => void;
  eraseMode: () => void;
  /** Toggle freehand pencil drawing (drag to sketch a polygon). */
  freehand: () => void;
  /** Knife: freehand-drag a cut line; cuts the working polygon on release. */
  knifeFreehand: () => void;
  /** Knife: click straight-path points, double-click to finish the cut. */
  knifeStraight: () => void;
  /** Exit any knife mode and clear the temp cut line. */
  knifeStop: () => void;
  /** True while a knife mode is armed — lets Escape exit only the knife. */
  knifeArmed: () => boolean;
  /**
   * Drop the last point of a straight cut path. Returns true if it consumed the
   * request, so a Backspace while placing points doesn't also delete shapes.
   */
  knifePopPoint: () => boolean;
  stopModes: () => void;
  clearDrawn: () => void;
}

interface MapBridge {
  handle: MapHandle | null;
  picking: boolean;
  /** True while a knife mode is armed. Mirrors handle.knifeArmed() for readers. */
  knifeArmed: boolean;
  setHandle: (h: MapHandle | null) => void;
  setPicking: (p: boolean) => void;
  setKnifeArmed: (k: boolean) => void;
}

export const useMapBridge = create<MapBridge>((set) => ({
  handle: null,
  picking: false,
  knifeArmed: false,
  setHandle: (handle) => set({ handle }),
  setPicking: (picking) => set({ picking }),
  setKnifeArmed: (knifeArmed) => set({ knifeArmed }),
}));

/**
 * True when a map click belongs to a tool rather than to shape selection — while
 * the knife is armed or a point/edge pick is waiting. Shape layers must let those
 * clicks through to the map instead of consuming them.
 */
export function clickBelongsToTool(): boolean {
  const { picking, knifeArmed } = useMapBridge.getState();
  return picking || knifeArmed;
}
