/**
 * Triad tessellation — divide a polygon into equilateral triangles ("triads")
 * arranged as HEXAGONS: a pointy-top hexagonal grid tiles the AOI, and each
 * hexagon is split into its 6 equilateral triangles (centre → each edge). So
 * every 6 triads form one hexagon — a finer version of hex-grid tools. The
 * grid is rotated by `rotationDeg` and clipped to the polygon (full coverage):
 * interior triangles stay equilateral (kind "full"); boundary units are
 * clipped offcuts (kind "edge"). Pure + testable.
 */
import { polygon as turfPolygon, intersect, area, featureCollection, feature } from "@turf/turf";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import type { FeatureCollection, GeoFeature, GeoGeometry } from "@/lib/types";

const M_PER_DEG_LAT = 111320;
const MAX_TRIANGLES = 40000; // guard against tiny side lengths freezing the UI

export interface TriadOptions {
  /** Hexagon size = equilateral triangle side length, in metres. */
  sideLength: number;
  /** Rotate the tiling by this many degrees around the AOI centre. */
  rotationDeg?: number;
}

export interface TriadProps {
  id: string; // "H{hex}-{tri}"
  hex: number; // hexagon number (row-major)
  tri: number; // 1..6 within the hexagon
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

  const polyFeat = feature(poly as unknown as Polygon | MultiPolygon);

  // Pointy-top hexagon lattice. Circumradius R = triangle side = sideLength.
  const R = s;
  const colStep = Math.sqrt(3) * R; // centre spacing within a row
  const rowStep = 1.5 * R; // centre spacing between rows
  const angles = [0, 1, 2, 3, 4, 5].map((k) => ((30 + 60 * k) * Math.PI) / 180);

  const features: GeoFeature<TriadProps>[] = [];
  let hexNum = 0;
  let rowNum = 0;

  // Iterate top→bottom (rotated-y high→low), left→right.
  for (let y = maxY + rowStep; y >= minY - rowStep; y -= rowStep) {
    rowNum++;
    const xOff = rowNum % 2 === 0 ? colStep / 2 : 0; // offset alternate rows
    for (let x = minX - colStep + xOff; x <= maxX + colStep; x += colStep) {
      const verts = angles.map(
        (a): [number, number] => [x + R * Math.cos(a), y + R * Math.sin(a)],
      );
      const kept: { geom: GeoGeometry; full: boolean; tri: number }[] = [];
      for (let k = 0; k < 6; k++) {
        const triLocal: [number, number][] = [[x, y], verts[k], verts[(k + 1) % 6]];
        const lonlat = triLocal.map(([lx, ly]) => {
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
        kept.push({ geom: clipped.geometry as unknown as GeoGeometry, full, tri: k + 1 });
      }
      if (!kept.length) continue;
      hexNum++;
      for (const t of kept) {
        features.push({
          type: "Feature",
          geometry: t.geom,
          properties: {
            id: `H${hexNum}-${t.tri}`,
            hex: hexNum,
            tri: t.tri,
            row: rowNum,
            kind: t.full ? "full" : "edge",
          },
        });
      }
      if (features.length >= MAX_TRIANGLES) return { type: "FeatureCollection", features };
    }
  }

  return { type: "FeatureCollection", features };
}
