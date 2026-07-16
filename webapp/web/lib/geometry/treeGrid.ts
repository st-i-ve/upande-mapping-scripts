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
  /** Rotate the grid lattice by this many degrees (around the AOI centre). */
  rotationDeg?: number;
  /** Keep only points inside at least one of these polygons (if any). */
  includes?: GeoGeometry[];
  /** Drop points inside any of these polygons. */
  excludes?: GeoGeometry[];
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
  { treeSpacing, rowSpacing, majorEdge, rotationDeg = 0, includes = [], excludes = [] }: TreeGridOptions,
): { points: TreePoint[]; rows: number; cols: number } {
  const ring = outerRing(polygon);
  if (!ring || ring.length < 4 || treeSpacing <= 0 || rowSpacing <= 0)
    return { points: [], rows: 0, cols: 0 };

  const excRings = excludes.map(outerRing).filter((r): r is [number, number][] => !!r);
  const incRings = includes.map(outerRing).filter((r): r is [number, number][] => !!r);
  const keep = (lon: number, lat: number) =>
    !excRings.some((rg) => inRing(lon, lat, rg)) &&
    (incRings.length === 0 || incRings.some((rg) => inRing(lon, lat, rg)));

  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  const lon0 = (Math.min(...lons) + Math.max(...lons)) / 2;
  const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;

  const mPerDegLon = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  const theta = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  // Local metric frame centred on the AOI, and helpers to rotate in/out of it.
  const toLocal = (lon: number, lat: number): [number, number] => [
    (lon - lon0) * mPerDegLon,
    (lat - lat0) * M_PER_DEG_LAT,
  ];
  const toLonLat = (x: number, y: number): [number, number] => [
    lon0 + x / mPerDegLon,
    lat0 + y / M_PER_DEG_LAT,
  ];
  const rot = (x: number, y: number, a: number): [number, number] => [
    x * Math.cos(a) - y * Math.sin(a),
    x * Math.sin(a) + y * Math.cos(a),
  ];

  // Ring in the rotated frame (rotate by -theta) → axis-aligned bbox there.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [lon, lat] of ring) {
    const [lx, ly] = toLocal(lon, lat);
    const rx = lx * cos + ly * sin; // rotate by -theta
    const ry = -lx * sin + ly * cos;
    if (rx < minX) minX = rx;
    if (rx > maxX) maxX = rx;
    if (ry < minY) minY = ry;
    if (ry > maxY) maxY = ry;
  }

  // Along-row step = tree spacing; between-row = row spacing (EW default; NS swaps).
  const stepX = majorEdge === "EW" ? treeSpacing : rowSpacing;
  const stepY = majorEdge === "EW" ? rowSpacing : treeSpacing;

  const points: TreePoint[] = [];
  let rows = 0;
  let cols = 0;
  let r = 0;
  for (let ry = minY; ry <= maxY + 1e-6; ry += stepY, r++) {
    let t = 0;
    let rowHad = false;
    for (let rx = minX; rx <= maxX + 1e-6; rx += stepX, t++) {
      const [lx, ly] = rot(rx, ry, theta); // rotate back by +theta
      const [lon, lat] = toLonLat(lx, ly);
      if (inRing(lon, lat, ring) && keep(lon, lat)) {
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
