/**
 * Which shape a knife stroke is cutting, when no slicing session is open yet.
 * Pure: takes the shapes, returns a name.
 */
import { area, booleanIntersects, feature, lineString } from "@turf/turf";
import type { Polygon, MultiPolygon } from "geojson";
import type { GeoGeometry, SavedShape } from "@/lib/types";

const isPoly = (g: GeoGeometry) => g.type === "Polygon" || g.type === "MultiPolygon";

function crosses(g: GeoGeometry, line: [number, number][]) {
  try {
    return booleanIntersects(lineString(line), feature(g as unknown as Polygon | MultiPolygon));
  } catch {
    return false;
  }
}

/**
 * The shape to slice, in order of intent:
 *  1. the one selected shape, if the line crosses it;
 *  2. the working polygon's shape, if the line crosses it;
 *  3. the smallest visible shape the line crosses — the innermost, when shapes nest.
 * Returns `{ working: true }` when only an unsaved working outline is crossed
 * (the caller saves it first, so there's an original to keep).
 */
export function knifeTarget(
  shapes: SavedShape[],
  line: [number, number][],
  opts: { selected?: string[]; working?: GeoGeometry | null } = {},
): { name: string } | { working: true } | null {
  if (line.length < 2) return null;
  const visible = shapes.filter((s) => s.visible !== false && isPoly(s.geometry));
  const sel = opts.selected?.length === 1 ? visible.find((s) => s.name === opts.selected![0]) : undefined;
  if (sel && crosses(sel.geometry, line)) return { name: sel.name };

  const w = opts.working;
  if (w) {
    const key = JSON.stringify(w);
    const own = shapes.find((s) => s.geometry === w) ?? shapes.find((s) => JSON.stringify(s.geometry) === key);
    if (own && crosses(own.geometry, line)) return { name: own.name };
    if (!own && isPoly(w) && crosses(w, line)) return { working: true };
  }

  let best: { name: string; a: number } | null = null;
  for (const s of visible) {
    if (!crosses(s.geometry, line)) continue;
    const a = area(feature(s.geometry as unknown as Polygon | MultiPolygon));
    if (!best || a < best.a) best = { name: s.name, a };
  }
  return best ? { name: best.name } : null;
}
