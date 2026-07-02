/**
 * Tree-grid generation — flat-earth local projection anchored on the AOI's
 * SW corner (fine for farm-scale areas near the equator, matching the vanilla
 * app's approach). Pure functions → unit-tested.
 */
import type { GeoGeometry } from "@/lib/types";

export interface TreePoint {
  lat: number;
  lon: number;
  row: number;
  tree: number;
}

export interface TreeGridOptions {
  /** Metres between trees along a row. */
  treeSpacing: number;
  /** Metres between rows. */
  rowSpacing: number;
  /** Which axis the rows run parallel to. */
  majorEdge: "EW" | "NS";
}

const M_PER_DEG_LAT = 111320;

/** Outer ring of a Polygon / first Polygon of a MultiPolygon, as [lon,lat][]. */
function outerRing(geom: GeoGeometry): [number, number][] | null {
  const c = geom.coordinates as unknown;
  if (geom.type === "Polygon") return (c as [number, number][][])[0] ?? null;
  if (geom.type === "MultiPolygon") return (c as [number, number][][][])[0]?.[0] ?? null;
  return null;
}

/** Ray-casting point-in-polygon for a single ring ([lon,lat] coords). */
function inRing(lon: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Generate a grid of tree points inside `polygon`. Rows run along the major
 * edge; numbering starts at the SW corner (R1·T1). Points outside the polygon
 * are dropped.
 */
export function generateTreeGrid(
  polygon: GeoGeometry,
  { treeSpacing, rowSpacing, majorEdge }: TreeGridOptions,
): { points: TreePoint[]; rows: number; cols: number } {
  const ring = outerRing(polygon);
  if (!ring || ring.length < 4 || treeSpacing <= 0 || rowSpacing <= 0)
    return { points: [], rows: 0, cols: 0 };

  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const lat0 = (minLat + maxLat) / 2;

  const mPerDegLon = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  // Along-row step is the tree spacing; between-row step is the row spacing.
  // EW: rows run east-west → step lon by tree, lat by row. NS: swap.
  const lonStepM = majorEdge === "EW" ? treeSpacing : rowSpacing;
  const latStepM = majorEdge === "EW" ? rowSpacing : treeSpacing;
  const dLon = lonStepM / mPerDegLon;
  const dLat = latStepM / M_PER_DEG_LAT;

  const points: TreePoint[] = [];
  let rows = 0;
  let cols = 0;
  let r = 0;
  for (let lat = minLat; lat <= maxLat + 1e-12; lat += dLat, r++) {
    let t = 0;
    let rowHad = false;
    for (let lon = minLon; lon <= maxLon + 1e-12; lon += dLon, t++) {
      if (inRing(lon, lat, ring)) {
        points.push({ lat, lon, row: r + 1, tree: t + 1 });
        rowHad = true;
        cols = Math.max(cols, t + 1);
      }
    }
    if (rowHad) rows = Math.max(rows, r + 1);
  }
  return { points, rows, cols };
}

/** GeoJSON FeatureCollection of the tree points (for download / overlay). */
export function treeGridToGeoJSON(points: TreePoint[]) {
  return {
    type: "FeatureCollection" as const,
    features: points.map((p) => ({
      type: "Feature" as const,
      geometry: { type: "Point", coordinates: [p.lon, p.lat] } as GeoGeometry,
      properties: { row: p.row, tree: p.tree, label: `R${p.row}·T${p.tree}` },
    })),
  };
}
