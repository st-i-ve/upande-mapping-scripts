/**
 * Triad tessellation — divide a polygon into equilateral triangles ("triads").
 * Lays an equilateral triangular tiling over the AOI (rows of alternating
 * up/down triangles), rotates it by `rotationDeg`, and clips each triangle to
 * the polygon (full coverage). Interior triangles stay equilateral (kind
 * "full"); boundary units are clipped offcuts (kind "edge"). Pure + testable.
 */
import { polygon as turfPolygon, intersect, area, featureCollection, feature } from "@turf/turf";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import type { FeatureCollection, GeoFeature, GeoGeometry } from "@/lib/types";

const M_PER_DEG_LAT = 111320;
const MAX_TRIANGLES = 40000; // guard against tiny side lengths freezing the UI

export interface TriadOptions {
  /** Equilateral side length in metres. */
  sideLength: number;
  /** Rotate the tiling by this many degrees around the AOI centre. */
  rotationDeg?: number;
}

export interface TriadProps {
  id: string;
  row: number;
  kind: "full" | "edge";
  [k: string]: unknown;
}

function outerRing(geom: GeoGeometry): [number, number][] | null {
  const c = geom.coordinates as unknown;
  if (geom.type === "Polygon") return (c as [number, number][][])[0] ?? null;
  if (geom.type === "MultiPolygon") return (c as [number, number][][][])[0]?.[0] ?? null;
  return null;
}

export function generateTriads(
  poly: GeoGeometry,
  { sideLength: s, rotationDeg = 0 }: TriadOptions,
): FeatureCollection<TriadProps> {
  const empty: FeatureCollection<TriadProps> = { type: "FeatureCollection", features: [] };
  const ring = outerRing(poly);
  if (!ring || ring.length < 4 || s <= 0) return empty;

  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  const lon0 = (Math.min(...lons) + Math.max(...lons)) / 2;
  const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  const theta = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  const toLocal = (lon: number, lat: number): [number, number] => [
    (lon - lon0) * mPerDegLon,
    (lat - lat0) * M_PER_DEG_LAT,
  ];
  const toLonLat = (x: number, y: number): [number, number] => [
    lon0 + x / mPerDegLon,
    lat0 + y / M_PER_DEG_LAT,
  ];
  const rot = (x: number, y: number): [number, number] => [
    x * cos - y * sin,
    x * sin + y * cos,
  ];

  // Rotated-frame bbox of the polygon (rotate ring by -theta).
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [lon, lat] of ring) {
    const [lx, ly] = toLocal(lon, lat);
    const rx = lx * cos + ly * sin;
    const ry = -lx * sin + ly * cos;
    if (rx < minX) minX = rx;
    if (rx > maxX) maxX = rx;
    if (ry < minY) minY = ry;
    if (ry > maxY) maxY = ry;
  }

  const h = (s * Math.sqrt(3)) / 2;
  const polyFeat = feature(poly as unknown as Polygon | MultiPolygon);

  type Cand = { geom: GeoGeometry; full: boolean; j: number; sortX: number };
  const cands: Cand[] = [];

  outer: for (let j = 0, y0 = minY; y0 < maxY + 1e-9; y0 += h, j++) {
    const y1 = y0 + h;
    for (let x = minX - s; x < maxX + s; x += s) {
      const up: [number, number][] = [[x, y0], [x + s, y0], [x + s / 2, y1]];
      const down: [number, number][] = [[x + s / 2, y1], [x + (3 * s) / 2, y1], [x + s, y0]];
      for (const [tri, sortX] of [[up, x], [down, x + s / 2]] as const) {
        const lonlat = tri.map(([lx, ly]) => {
          const [rx, ry] = rot(lx, ly);
          return toLonLat(rx, ry);
        });
        const triFeat = turfPolygon([[...lonlat, lonlat[0]]]);
        let clipped: Feature<Polygon | MultiPolygon> | null = null;
        try {
          clipped = intersect(featureCollection([triFeat, polyFeat])) as Feature<Polygon | MultiPolygon> | null;
        } catch {
          clipped = null;
        }
        if (!clipped) continue;
        const clipArea = area(clipped);
        if (clipArea < 1e-6) continue;
        const full = clipArea >= area(triFeat) * 0.999;
        cands.push({ geom: clipped.geometry as unknown as GeoGeometry, full, j, sortX });
        if (cands.length >= MAX_TRIANGLES) break outer;
      }
    }
  }

  const maxJ = cands.reduce((m, c) => Math.max(m, c.j), 0);
  // Order top→bottom (higher rotated-y first), then left→right.
  cands.sort((a, b) => (b.j - a.j) || (a.sortX - b.sortX));

  const features: GeoFeature<TriadProps>[] = cands.map((c, i) => ({
    type: "Feature",
    geometry: c.geom,
    properties: { id: `T${i + 1}`, row: maxJ - c.j + 1, kind: c.full ? "full" : "edge" },
  }));

  return { type: "FeatureCollection", features };
}
