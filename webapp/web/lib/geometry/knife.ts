/**
 * Knife — cut an existing polygon along a line, leaving a gap the width of the
 * blade. Buffers the cut line by width/2 into a corridor, then subtracts it
 * from the polygon (difference) — splitting it into pieces with a real gap.
 * Pure + testable.
 */
import { lineString, buffer, difference, featureCollection, feature, area } from "@turf/turf";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import type { GeoGeometry } from "@/lib/types";

/**
 * @param polygon target polygon (Polygon / MultiPolygon)
 * @param line    cut path as [lon, lat][] (≥ 2 points)
 * @param widthM  blade width in metres (the gap)
 * @returns the cut geometry (usually a MultiPolygon), or null if nothing to cut
 */
export function cutPolygon(
  polygon: GeoGeometry,
  line: [number, number][],
  widthM: number,
): GeoGeometry | null {
  if (line.length < 2 || widthM <= 0) return null;
  try {
    const corridor = buffer(lineString(line), widthM / 2, { units: "meters" }) as
      | Feature<Polygon | MultiPolygon>
      | undefined;
    if (!corridor) return null;
    const polyFeat = feature(polygon as unknown as Polygon | MultiPolygon);
    const res = difference(
      featureCollection([polyFeat, corridor]) as unknown as ReturnType<
        typeof featureCollection<Polygon | MultiPolygon>
      >,
    );
    return res ? (res.geometry as unknown as GeoGeometry) : null;
  } catch {
    return null;
  }
}

/** Gather Polygons/MultiPolygons into a single MultiPolygon. */
export function mergePolygons(geoms: GeoGeometry[]): GeoGeometry | null {
  const coords: unknown[] = [];
  for (const g of geoms) {
    if (g.type === "Polygon") coords.push(g.coordinates);
    else if (g.type === "MultiPolygon") coords.push(...(g.coordinates as unknown[]));
  }
  return coords.length ? { type: "MultiPolygon", coordinates: coords } : null;
}

/**
 * Slice a set of pieces with one blade stroke — the cake cut. Every piece the
 * line crosses splits; the rest pass through untouched, so a long stroke cuts
 * the whole shape and a short one subdivides a single slice.
 *
 * @returns the new slice set, or null when the stroke changes nothing or would
 *          consume everything (blade wider than the shape) — callers treat null
 *          as a no-op rather than destroying the current slices.
 */
export function sliceAll(
  slices: GeoGeometry[],
  line: [number, number][],
  widthM: number,
): GeoGeometry[] | null {
  const merged = mergePolygons(slices);
  if (!merged) return null;
  const cut = cutPolygon(merged, line, widthM);
  if (!cut) return null;
  const pieces = explodePolygons(cut);
  if (!pieces.length) return null;
  // A stroke clear of the shape leaves the set untouched — report that as a no-op
  // so callers don't record a cut that did nothing.
  const before = totalArea(slices);
  if (pieces.length === slices.length && Math.abs(totalArea(pieces) - before) <= before * 1e-9) {
    return null;
  }
  return pieces;
}

/** Combined area of a set of polygons, in m². */
function totalArea(geoms: GeoGeometry[]): number {
  return geoms.reduce((sum, g) => {
    try {
      return sum + area(feature(g as unknown as Polygon | MultiPolygon));
    } catch {
      return sum;
    }
  }, 0);
}

/** Split a Polygon/MultiPolygon into separate Polygon geometries (one per part). */
export function explodePolygons(geom: GeoGeometry): GeoGeometry[] {
  if (geom.type === "Polygon") return [geom];
  if (geom.type === "MultiPolygon") {
    return (geom.coordinates as unknown as number[][][][]).map((coords) => ({
      type: "Polygon",
      coordinates: coords,
    }));
  }
  return [];
}
