/**
 * Polygon boolean operations via Turf. Pure + unit-tested.
 *   union     — merge all shapes into one
 *   subtract  — first shape minus the rest
 *   intersect — overlap common to all shapes
 */
import { union, intersect, difference, featureCollection, feature } from "@turf/turf";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import type { GeoGeometry } from "@/lib/types";

export type BooleanOp = "union" | "subtract" | "intersect";

export const OP_LABEL: Record<BooleanOp, string> = {
  union: "∪ Union",
  subtract: "− Subtract",
  intersect: "∩ Intersect",
};

type PolyFeature = Feature<Polygon | MultiPolygon>;

export function booleanOp(geoms: GeoGeometry[], op: BooleanOp): GeoGeometry | null {
  const polys = geoms.filter(
    (g) => g.type === "Polygon" || g.type === "MultiPolygon",
  );
  if (polys.length < 2) return null;
  const fc = featureCollection(
    polys.map((g) => feature(g as unknown as Polygon | MultiPolygon)),
  ) as unknown as ReturnType<typeof featureCollection<Polygon | MultiPolygon>>;

  let res: PolyFeature | null = null;
  if (op === "union") res = union(fc) as PolyFeature | null;
  else if (op === "intersect") res = intersect(fc) as PolyFeature | null;
  else res = difference(fc) as PolyFeature | null;

  return res ? (res.geometry as unknown as GeoGeometry) : null;
}
