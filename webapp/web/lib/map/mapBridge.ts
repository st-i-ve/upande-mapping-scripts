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
  // ---- shape builder (Geoman) ----
  draw: (shape: "Polygon" | "Rectangle") => void;
  editMode: () => void;
  dragMode: () => void;
  eraseMode: () => void;
  stopModes: () => void;
  clearDrawn: () => void;
}

interface MapBridge {
  handle: MapHandle | null;
  picking: boolean;
  setHandle: (h: MapHandle | null) => void;
  setPicking: (p: boolean) => void;
}

export const useMapBridge = create<MapBridge>((set) => ({
  handle: null,
  picking: false,
  setHandle: (handle) => set({ handle }),
  setPicking: (picking) => set({ picking }),
}));
