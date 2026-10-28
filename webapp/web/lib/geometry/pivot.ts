/**
 * Pivot — cut a centre-pivot circle into pizza slices. The shape is split into
 * `count` equal wedges around the pivot point, a path `pathM` wide is left along
 * every spoke, and a disc `centerRadiusM` across is left empty in the middle
 * where the pivot machinery stands. Pure + testable.
 *
 * Works on any outline, not just a perfect circle: each wedge is intersected
 * with the shape, so a part-circle pivot (a missing corner, a road through it)
 * gives the slices that are actually there.
 */
import {
  buffer, centroid, circle, destination, difference, distance, feature,
  featureCollection, intersect, lineString, point, polygon, union,
} from "@turf/turf";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import type { GeoGeometry } from "@/lib/types";

export interface PivotOptions {
  /** Pivot point [lon, lat]; defaults to the shape's centroid. */
  center?: [number, number];
  /** Number of slices (≥ 2). */
  count: number;
  /** Width of the path left along each spoke, in metres (0 = touching slices). */
  pathM: number;
  /** Radius of the empty disc around the pivot machinery, in metres. */
  centerRadiusM: number;
  /** Compass bearing of the first spoke, degrees clockwise from north. */
  startBearing?: number;
  /** Number the slices clockwise (default) or anticlockwise from the first spoke. */
  clockwise?: boolean;
}

type PolyFeat = Feature<Polygon | MultiPolygon>;

const asFeat = (g: GeoGeometry) => feature(g as unknown as Polygon | MultiPolygon) as PolyFeat;

/** Turf bearings run -180..180; normalise. */
const norm = (b: number) => ((b % 360) + 540) % 360 - 180;

/** The default pivot point for `shape` — its centroid. */
export function pivotCenter(shape: GeoGeometry): [number, number] {
  return centroid(asFeat(shape)).geometry.coordinates as [number, number];
}

/** Every vertex of a Polygon/MultiPolygon. */
function vertices(g: GeoGeometry): [number, number][] {
  const c = g.coordinates as unknown;
  const rings: number[][][] =
    g.type === "Polygon" ? (c as number[][][]) : (c as number[][][][]).flat();
  return rings.flat() as [number, number][];
}

/** A wedge from `center` between two bearings, reaching out to `radiusM`. */
function wedge(center: [number, number], from: number, to: number, radiusM: number): PolyFeat {
  const sweep = ((to - from) % 360 + 360) % 360 || 360;
  const steps = Math.max(4, Math.ceil(sweep / 2)); // an arc point every ~2°
  const ring: [number, number][] = [center];
  for (let k = 0; k <= steps; k++) {
    const b = norm(from + (sweep * k) / steps);
    ring.push(destination(point(center), radiusM, b, { units: "meters" }).geometry.coordinates as [number, number]);
  }
  ring.push(center);
  return polygon([ring]);
}

/**
 * Pizza-slice `shape` around its pivot.
 *
 * @returns the slices in numbering order — slice 1 starts at `startBearing` and
 *          the rest follow clockwise (or anticlockwise). A wedge the shape doesn't
 *          reach is skipped, so a part-circle gives fewer slices than `count`.
 *          Null when the options make no sense or nothing is left.
 */
export function pivotSlices(shape: GeoGeometry, opts: PivotOptions): GeoGeometry[] | null {
  const count = Math.floor(opts.count);
  if (count < 1 || opts.pathM < 0 || opts.centerRadiusM < 0) return null;
  try {
    const center = opts.center ?? pivotCenter(shape);
    const start = opts.startBearing ?? 0;
    const dir = opts.clockwise === false ? -1 : 1;
    // Far enough to clear every vertex, so wedges and spokes cover the whole shape.
    const reach =
      Math.max(...vertices(shape).map((v) => distance(point(center), point(v), { units: "meters" }))) * 1.2 + 1;
    const spoke = (i: number) => start + (dir * 360 * i) / count;

    // Everything that isn't crop: the machinery disc and, with more than one
    // slice, a path along each spoke.
    const voids: PolyFeat[] = [];
    if (opts.centerRadiusM > 0) {
      voids.push(circle(center, opts.centerRadiusM, { units: "meters", steps: 96 }) as PolyFeat);
    }
    if (opts.pathM > 0 && count > 1) {
      for (let i = 0; i < count; i++) {
        const tip = destination(point(center), reach, norm(spoke(i)), { units: "meters" }).geometry.coordinates;
        const band = buffer(lineString([center, tip]), opts.pathM / 2, { units: "meters" }) as PolyFeat | undefined;
        if (band) voids.push(band);
      }
    }
    let crop: PolyFeat | null = asFeat(shape);
    if (voids.length) {
      const hole = voids.length === 1 ? voids[0] : (union(featureCollection(voids)) as PolyFeat | null);
      if (hole) crop = difference(featureCollection([crop, hole])) as PolyFeat | null;
    }
    if (!crop) return null;

    const out: GeoGeometry[] = [];
    for (let i = 0; i < count; i++) {
      // Wedges always sweep clockwise in turf terms; anticlockwise numbering just
      // walks them the other way.
      const [a, b] = dir === 1 ? [spoke(i), spoke(i + 1)] : [spoke(i + 1), spoke(i)];
      const w = count === 1 ? circle(center, reach, { units: "meters", steps: 96 }) : wedge(center, a, b, reach);
      const piece = intersect(featureCollection([crop, w as PolyFeat])) as PolyFeat | null;
      if (piece) out.push(piece.geometry as unknown as GeoGeometry);
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

/** The pivot's circle as a polygon, for saving and slicing. */
export function pivotCircle(center: [number, number], radiusM: number): GeoGeometry {
  return circle(center, radiusM, { units: "meters", steps: 128 }).geometry as unknown as GeoGeometry;
}

/**
 * The spoke centrelines, from the edge of the machinery disc out to the
 * circumference — [lon, lat] pairs, one per cut — for the dotted preview.
 */
export function pivotSpokes(
  center: [number, number],
  radiusM: number,
  count: number,
  centerRadiusM: number,
  startBearing = 0,
): [number, number][][] {
  if (count < 2 || radiusM <= 0) return [];
  const at = (d: number, b: number) =>
    destination(point(center), d, norm(b), { units: "meters" }).geometry.coordinates as [number, number];
  return Array.from({ length: count }, (_, i) => {
    const b = startBearing + (360 * i) / count;
    return [at(Math.min(centerRadiusM, radiusM), b), at(radiusM, b)];
  });
}
