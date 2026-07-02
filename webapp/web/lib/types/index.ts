/** Shared domain types for the mapper frontend. */

// GeoJSON — minimal shapes we actually pass around (avoids a dep).
export type Position = [number, number];

export interface GeoGeometry {
  type: string;
  coordinates: unknown;
}

export interface GeoFeature<P = Record<string, unknown>> {
  type: "Feature";
  geometry: GeoGeometry | null;
  properties: P;
}

export interface FeatureCollection<P = Record<string, unknown>> {
  type: "FeatureCollection";
  features: GeoFeature<P>[];
}

/** A named reference point, kept in the browser. */
export interface RefPoint {
  name: string;
  lat: number;
  lon: number;
  color?: string;
  visible?: boolean;
}

/** A saved shape overlay, kept in the browser. */
export interface SavedShape {
  name: string;
  geometry: GeoGeometry;
  visible: boolean;
  color?: string;
}

/** Basemap provider keys (localStorage only). */
export interface BasemapKeys {
  mapbox?: string;
  maptiler?: string;
  stadia?: string;
}

/** A server-stored generation output listing. */
export interface OutputInfo {
  filename: string;
  size_bytes: number;
  mtime: string;
}

/** Response from /api/terrace_sections. */
export interface TerraceResult {
  type: "FeatureCollection";
  metadata: {
    edge_count: number;
    chain_edges: number[];
    tread_edges: number[];
    section_count: number;
    block_count: number;
    grouping: string | null;
    start_corner: string;
    block_start_corners: (string | null)[];
    block_corners: Record<string, unknown>[];
    first_bed_a: { lat: number; lon: number } | null;
    first_bed_b: { lat: number; lon: number } | null;
  };
  features: GeoFeature[];
  block_geojson: GeoGeometry[];
}
