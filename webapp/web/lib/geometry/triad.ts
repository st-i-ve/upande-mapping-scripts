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
import { polygon as turfPolygon, intersect, area, featureCollection, feature, centroid } from "@turf/turf";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import type { FeatureCollection, GeoFeature, GeoGeometry } from "@/lib/types";

const M_PER_DEG_LAT = 111320;
const MAX_TRIANGLES = 40000; // guard against tiny side lengths freezing the UI

/** Which end of the shape band 1 sits at. */
export type BandDirection = "north-south" | "south-north";
/** The order triads are numbered in, within their band. */
export type TriadDirection = "west-east" | "east-west" | "north-south";

export interface TriadOptions {
  /** Hexagon size = equilateral triangle side length, in metres. */
  sideLength: number;
  /** Rotate the tiling by this many degrees around the AOI centre. */
  rotationDeg?: number;
  /** Band 1 at the north end (default) or the south. */
  bandDirection?: BandDirection;
  /** Triad 1 at the west end of its band (default), the east, or the north. */
  triadDirection?: TriadDirection;
}

export interface TriadProps {
  id: string; // "H{hex}-{tri}"
  hex: number; // hexagon number (row-major)
  tri: number; // 1..6 within the hexagon
  band: number; // the "band" — a horizontal line of hexes (the row-equivalent unit)
  /** The triad's number within its band, 1..n, in `triadDirection` order. */
  triadNo: number;
  /**
   * The ERP contract (upande_scp `Field Unit Automation`): `unit_id` names the
   * Band and `child_id` the Triad within it. Band is a `Bed` with
   * unit_type="Band" and Triad is named "{band} - Triad {child_id}", so
   * child_id has to be unique within its band — which `tri` (1..6 within a
   * hexagon) is not.
   */
  unit_id: number;
  child_id: number;
  label: string; // "Band {band} · Triad {triadNo}"
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
  opts: TriadOptions,
): TriadResult {
  const { sideLength: s, rotationDeg = 0 } = opts;
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
  // `rowIndex` is geometric and drives the alternate-row offset; `bandNum` is
  // what gets emitted and only advances for rows that actually produced hexes,
  // so bands are contiguous 1..N with no gaps where the shape was empty.
  let rowIndex = 0;
  let bandNum = 0;

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
    rowIndex++;
    const xOff = rowIndex % 2 === 0 ? colStep / 2 : 0; // offset alternate rows
    let bandUsed = false;
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
      if (!bandUsed) { bandUsed = true; bandNum++; }
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
            triadNo: 0,
            unit_id: bandNum,
            child_id: 0,
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

  return numberTriads(
    { type: "FeatureCollection", features },
    { type: "FeatureCollection", features: hexFeatures },
    opts,
  );
}

/** [lon, lat] of a geometry's centroid. */
function centre(geom: GeoGeometry | null): [number, number] {
  if (!geom) return [0, 0];
  try {
    const c = centroid(feature(geom as unknown as Polygon | MultiPolygon));
    const [lon, lat] = c.geometry.coordinates as [number, number];
    return [lon, lat];
  } catch {
    return [0, 0];
  }
}

/**
 * Assign the numbers the ERP needs: bands 1..N from the chosen end of the shape,
 * and triads 1..n within each band in the chosen direction.
 *
 * Kept separate from the tiling so the ordering rules can be tested on their own,
 * and so re-numbering never has to re-cut the geometry.
 */
export function numberTriads(
  triads: FeatureCollection<TriadProps>,
  hexagons: FeatureCollection<HexProps>,
  opts: { bandDirection?: BandDirection; triadDirection?: TriadDirection } = {},
): TriadResult {
  const bandDir = opts.bandDirection ?? "north-south";
  const triadDir = opts.triadDirection ?? "west-east";

  const withCentre = triads.features.map((f) => ({ f, c: centre(f.geometry) }));

  // Group by the band the tiling produced, then order those groups by latitude
  // rather than trusting the loop — so the direction means north/south on the
  // ground even when the grid is rotated.
  const groups = new Map<number, { f: GeoFeature<TriadProps>; c: [number, number] }[]>();
  for (const item of withCentre) {
    const b = item.f.properties.band;
    if (!groups.has(b)) groups.set(b, []);
    groups.get(b)!.push(item);
  }
  const meanLat = (items: { c: [number, number] }[]) =>
    items.reduce((sum, i) => sum + i.c[1], 0) / (items.length || 1);

  const ordered = [...groups.entries()].sort((a, b) => meanLat(b[1]) - meanLat(a[1])); // north first
  if (bandDir === "south-north") ordered.reverse();

  const bandMap = new Map<number, number>();
  ordered.forEach(([oldBand], i) => bandMap.set(oldBand, i + 1));

  const order = (a: [number, number], b: [number, number]) => {
    if (triadDir === "west-east") return a[0] - b[0];
    if (triadDir === "east-west") return b[0] - a[0];
    return b[1] - a[1]; // north-south
  };

  const features: GeoFeature<TriadProps>[] = [];
  for (const [oldBand, items] of ordered) {
    const band = bandMap.get(oldBand)!;
    [...items]
      .sort((x, y) => order(x.c, y.c))
      .forEach((item, i) => {
        const triadNo = i + 1;
        features.push({
          ...item.f,
          properties: {
            ...item.f.properties,
            band,
            triadNo,
            unit_id: band,
            child_id: triadNo,
            label: `Band ${band} · Triad ${triadNo}`,
          },
        });
      });
  }

  const hexFeatures = hexagons.features.map((h) => {
    const band = bandMap.get(h.properties.band) ?? h.properties.band;
    return {
      ...h,
      properties: { ...h.properties, band, label: `Band ${band} · Hex ${h.properties.id}` },
    };
  });

  return {
    triads: { type: "FeatureCollection", features },
    hexagons: { type: "FeatureCollection", features: hexFeatures },
  };
}
