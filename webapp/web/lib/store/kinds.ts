/**
 * Filing by type. Every project has the same top-level folders — Pivots,
 * Polygons, Zones, Triads, Hexagons, Trees — and things land in the right one
 * on their own: a pivot (and the blocks cut from it) in "Pivots/<its name>",
 * any other drawn or imported shape in "Polygons", each generated result in its
 * generator's folder.
 */
import type { SavedShape, UnitKind } from "@/lib/types";
import { circleFit } from "@/lib/geometry/pivot";
import { folderOf, within } from "./folders";

export type ShapeKind = "pivots" | "polygons";
export type FolderKind = ShapeKind | UnitKind;

export const KIND_FOLDER: Record<FolderKind, string> = {
  pivots: "Pivots",
  polygons: "Polygons",
  zones: "Zones",
  triads: "Triads",
  hexagons: "Hexagons",
  trees: "Trees",
};

/** Display order of the type folders at the top of the tree. */
export const KIND_ORDER: FolderKind[] = ["pivots", "polygons", "zones", "triads", "hexagons", "trees"];

/** The kind a top-level folder stands for, if it's one of the type folders. */
export function kindOfFolder(path: string): FolderKind | null {
  const top = path.split("/")[0];
  return KIND_ORDER.find((k) => KIND_FOLDER[k] === top) ?? null;
}

/** A circle is a pivot; anything else is a polygon. */
export const shapeKind = (s: Pick<SavedShape, "geometry">): ShapeKind =>
  circleFit(s.geometry) ? "pivots" : "polygons";

/**
 * Where a new shape goes: a folder of its own under its type — Pivots/<name> or
 * Polygons/<name> — so the pieces later cut from it gather beside it. If a folder
 * inside Polygons is open, a new polygon goes in there instead.
 */
export function defaultFolder(name: string, kind: ShapeKind, activeFolder: string): string {
  const own = name.replace(/\//g, "-");
  if (kind === "pivots") return `${KIND_FOLDER.pivots}/${own}`;
  const insidePolygons = activeFolder && activeFolder !== KIND_FOLDER.polygons && within(activeFolder, KIND_FOLDER.polygons);
  return insidePolygons ? activeFolder : `${KIND_FOLDER.polygons}/${own}`;
}

/**
 * File everything that isn't in a type folder yet. A folder of shapes moves as a
 * whole — under Pivots if it holds a pivot circle, else under Polygons — and a
 * loose shape gets a folder of its own there, with the slices cut from it.
 * Nothing already filed is touched.
 */
export function arrangeByType(shapes: SavedShape[], folders: string[]): { shapes: SavedShape[]; folders: string[] } {
  const isFiled = (path: string) => !!path && kindOfFolder(path) != null;
  // Group loose things by their top-level folder; loose root shapes by name stem.
  const groups = new Map<string, SavedShape[]>();
  const rootShapes = shapes.filter((s) => !folderOf(s));
  const heads = rootShapes
    .filter((s) => !rootShapes.some((o) => o !== s && s.name.startsWith(`${o.name} `)))
    .map((s) => s.name);
  for (const s of shapes) {
    const f = folderOf(s);
    if (isFiled(f)) continue;
    const key = f ? `dir:${f.split("/")[0]}` : `root:${heads.find((h) => s.name === h || s.name.startsWith(`${h} `)) ?? s.name}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  // Empty folders that aren't filed go under Polygons too.
  for (const f of folders) {
    const top = f.split("/")[0];
    if (!isFiled(f) && !groups.has(`dir:${top}`)) groups.set(`dir:${top}`, []);
  }

  const moveTo = new Map<string, string>(); // shape name -> folder
  const folderMoves: [string, string][] = [];
  for (const [key, members] of groups) {
    const kind: ShapeKind = members.some((m) => shapeKind(m) === "pivots") ? "pivots" : "polygons";
    if (key.startsWith("dir:")) {
      const top = key.slice(4);
      const to = `${KIND_FOLDER[kind]}/${top}`;
      folderMoves.push([top, to]);
      for (const m of members) moveTo.set(m.name, to + folderOf(m).slice(top.length));
    } else {
      const head = key.slice(5);
      const to = `${KIND_FOLDER[kind]}/${head.replace(/\//g, "-")}`;
      for (const m of members) moveTo.set(m.name, to);
    }
  }

  const rebase = (f: string) => {
    for (const [from, to] of folderMoves) {
      if (f === from || f.startsWith(`${from}/`)) return to + f.slice(from.length);
    }
    return f;
  };
  return {
    shapes: shapes.map((s) => (moveTo.has(s.name) ? { ...s, folder: moveTo.get(s.name) } : s)),
    folders: [...new Set([...folders.map(rebase), ...moveTo.values()])],
  };
}
