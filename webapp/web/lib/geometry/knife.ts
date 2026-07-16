/**
 * Knife — cut an existing polygon along a line, leaving a gap the width of the
 * blade. Buffers the cut line by width/2 into a corridor, then subtracts it
 * from the polygon (difference) — splitting it into pieces with a real gap.
 * Pure + testable.
 */
import { lineString, buffer, difference, featureCollection, feature } from "@turf/turf";
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
