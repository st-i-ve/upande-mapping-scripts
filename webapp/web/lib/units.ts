/**
 * Filing generated results in the project. The units themselves go to a saved
 * output on the server; the project keeps a pointer to it in its type folder
 * (Zones, Triads, Hexagons, Trees), so they show up in the Browser.
 */
import { api } from "@/lib/api/client";
import { useAppStore } from "@/lib/store/appStore";
import type { FeatureCollection, GeoGeometry, UnitKind } from "@/lib/types";

const LABEL: Record<UnitKind, string> = { zones: "beds & zones", triads: "triads", hexagons: "hexagons", trees: "trees" };

/** The saved shape a geometry came from (the working polygon is the shape's own geometry object). */
export function sourceNameOf(geom: GeoGeometry | null | undefined): string | undefined {
  if (!geom) return undefined;
  return useAppStore.getState().savedShapes.find((s) => s.geometry === geom)?.name;
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
