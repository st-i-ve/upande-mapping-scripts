/**
 * Triad tessellation — divide a polygon into equilateral triangles ("triads")
 * arranged as HEXAGONS: a pointy-top hexagonal grid tiles the AOI, and each
 * hexagon is split into its 6 equilateral triangles (centre → each edge). So
 * every 6 triads form one hexagon — a finer version of hex-grid tools. The
 * grid is rotated by `rotationDeg` and clipped to the polygon (full coverage):
 * interior triangles stay equilateral (kind "full"); boundary units are
 * clipped offcuts (kind "edge"). Pure + testable.
 *
 * Each hexagon (and its 6 triads) is tagged with a `band` — a horizontal line
 * of hexes. The band is the triad tessellation's row-equivalent unit (the shape
 * within the AOI is named "<shape> · Band N"), analogous to a row of orchard
 * trees: a band's members are colinear and reconstructable from its endpoints.
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
  band: number; // the "band" — a horizontal line of hexes (the row-equivalent unit)
  label: string; // "Band {band} · Triad H{hex}-{tri}"
  kind: "full" | "edge";
  [k: string]: unknown;
}

export interface HexProps {
  id: string; // "H{hex}"
  hex: number;
  band: number; // the band this hexagon belongs to
  label: string; // "Band {band} · Hex H{hex}"
  [k: string]: unknown;
}

export interface TriadResult {
  /** The individual triangle units. */
  triads: FeatureCollection<TriadProps>;
  /** The hexagon outlines (each = 6 triads), clipped to the polygon. */
  hexagons: FeatureCollection<HexProps>;
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
): TriadResult {
  const empty: TriadResult = {
    triads: { type: "FeatureCollection", features: [] },
    hexagons: { type: "FeatureCollection", features: [] },
  };
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
  const hexFeatures: GeoFeature<HexProps>[] = [];
  let hexNum = 0;
  let bandNum = 0; // the band index — a horizontal line of hexes (row-equivalent)

  const clipToPoly = (ringLonLat: [number, number][]) => {
    const f = turfPolygon([[...ringLonLat, ringLonLat[0]]]);
    try {
      const c = intersect(featureCollection([f, polyFeat])) as Feature<Polygon | MultiPolygon> | null;
      return c && area(c) > 1e-6 ? { geom: c.geometry as unknown as GeoGeometry, full: area(c) >= area(f) * 0.999 } : null;
    } catch {
      return null;
    }
  };

  // Iterate top→bottom (rotated-y high→low), left→right.
  for (let y = maxY + rowStep; y >= minY - rowStep; y -= rowStep) {
    if (features.length >= MAX_TRIANGLES) break;
    bandNum++;
    const xOff = bandNum % 2 === 0 ? colStep / 2 : 0; // offset alternate bands
    for (let x = minX - colStep + xOff; x <= maxX + colStep; x += colStep) {
      const verts = angles.map(
        (a): [number, number] => [x + R * Math.cos(a), y + R * Math.sin(a)],
      );
      const toWgs = ([lx, ly]: [number, number]): [number, number] => {
        const [rx, ry] = rot(lx, ly);
        return toLonLat(rx, ry);
      };
      const kept: { geom: GeoGeometry; full: boolean; tri: number }[] = [];
      for (let k = 0; k < 6; k++) {
        const triLocal: [number, number][] = [[x, y], verts[k], verts[(k + 1) % 6]];
        const clip = clipToPoly(triLocal.map(toWgs));
        if (clip) kept.push({ geom: clip.geom, full: clip.full, tri: k + 1 });
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
            band: bandNum,
            label: `Band ${bandNum} · Triad H${hexNum}-${t.tri}`,
            kind: t.full ? "full" : "edge",
          },
        });
      }
      const hexClip = clipToPoly(verts.map(toWgs));
      if (hexClip) {
        hexFeatures.push({
          type: "Feature",
          geometry: hexClip.geom,
          properties: { id: `H${hexNum}`, hex: hexNum, band: bandNum, label: `Band ${bandNum} · Hex H${hexNum}` },
        });
      }
      if (features.length >= MAX_TRIANGLES) break;
    }
  }

  return {
    triads: { type: "FeatureCollection", features },
    hexagons: { type: "FeatureCollection", features: hexFeatures },
  };
}
