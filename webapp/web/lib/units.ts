/**
 * Filing generated results in the project. The units themselves go to a saved
 * output on the server; the project keeps a pointer to it in its type folder
 * (Zones, Triads, Hexagons, Trees), so they show up in the Browser.
 */
import { api } from "@/lib/api/client";
import { useAppStore } from "@/lib/store/appStore";
import type { FeatureCollection, GeoGeometry, UnitKind } from "@/lib/types";

const LABEL: Record<UnitKind, string> = { zones: "beds & zones", triads: "triads", hexagons: "hexagons", trees: "trees" };

/**
 * The saved shape a geometry came from. Usually the very same object (the working
 * polygon is set from the shape), but after a reload the two are separate copies,
 * so fall back to comparing coordinates.
 */
export function shapeOfGeometry(geom: GeoGeometry | null | undefined) {
  if (!geom) return undefined;
  const shapes = useAppStore.getState().savedShapes;
  const same = shapes.find((s) => s.geometry === geom);
  if (same) return same;
  const key = JSON.stringify(geom);
  return shapes.find((s) => JSON.stringify(s.geometry) === key);
}

export function sourceNameOf(geom: GeoGeometry | null | undefined): string | undefined {
  return shapeOfGeometry(geom)?.name;
}

/** How many units a result holds: beds for zones, features otherwise. */
export function unitCount(kind: UnitKind, fc: FeatureCollection): number {
  if (kind === "zones") {
    const beds = fc.features.filter((f) => (f.properties as { kind?: string })?.kind === "bed").length;
    return beds || fc.features.length;
  }
  return fc.features.length;
}

/** File a result that's already saved on the server (beds & zones save themselves). */
export function fileUnit(kind: UnitKind, filename: string, fc: FeatureCollection, source?: string) {
  useAppStore.getState().addUnit({
    filename,
    kind,
    name: source ? `${source} ${LABEL[kind]}` : LABEL[kind][0].toUpperCase() + LABEL[kind].slice(1),
    count: unitCount(kind, fc),
    ...(source ? { source } : {}),
  });
}

/** Save a result to the server and file it in the project. Returns its filename. */
export async function saveUnit(kind: UnitKind, fc: FeatureCollection, source?: string): Promise<string> {
  const { filename } = await api.saveOutput(`${source ?? "polygon"} ${LABEL[kind]}`, fc);
  fileUnit(kind, filename, fc, source);
  return filename;
}
