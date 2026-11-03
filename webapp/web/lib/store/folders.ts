/**
 * Folders inside a project. A folder is a "/"-joined path ("Greenhouses/GH-A");
 * a shape lives in one by carrying its path in `folder` (absent = the root).
 * Empty folders are kept in a separate list so they survive having no shapes.
 *
 * Pure functions over plain arrays, so the store stays thin and these are testable.
 */
import type { SavedShape } from "@/lib/types";

export const ROOT = "";

export const folderOf = (s: SavedShape) => s.folder ?? ROOT;
export const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ROOT);
export const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
export const join = (parent: string, name: string) => (parent ? `${parent}/${name}` : name);

/** `path` itself or anything below it. */
export const within = (path: string, root: string) =>
  root === ROOT || path === root || path.startsWith(`${root}/`);

/** A usable folder name: trimmed, no slashes. Null when nothing usable is left. */
export function cleanFolderName(name: string): string | null {
  const n = name.replace(/\//g, "-").trim();
  return n ? n.slice(0, 80) : null;
}

/** Every folder that exists — listed ones, ones shapes sit in, and all their parents — sorted. */
export function allFolders(folders: string[], shapes: { folder?: string }[]): string[] {
  const out = new Set<string>();
  const add = (p: string) => {
    for (let q = p; q; q = parentOf(q)) out.add(q);
  };
  folders.forEach(add);
  shapes.forEach((s) => s.folder && add(s.folder));
  return [...out].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** The direct child folders of `parent`. */
export function childFolders(all: string[], parent: string): string[] {
  return all.filter((f) => f !== ROOT && parentOf(f) === parent);
}

/** A name under `parent` not already taken: "New folder", "New folder 2", … */
export function freeFolderName(all: string[], parent: string, wanted = "New folder"): string {
  const taken = new Set(childFolders(all, parent).map((f) => baseName(f).toLowerCase()));
  if (!taken.has(wanted.toLowerCase())) return wanted;
  let n = 2;
  while (taken.has(`${wanted} ${n}`.toLowerCase())) n++;
  return `${wanted} ${n}`;
}

/** Re-home `path` (and everything under it) at `to`. */
export function rebase(path: string, from: string, to: string): string {
  if (path === from) return to;
  if (path.startsWith(`${from}/`)) return to + path.slice(from.length);
  return path;
}

/** Move/rename folder `from` to `to`, carrying its sub-folders and shapes. */
export function moveFolder(
  folders: string[],
  shapes: SavedShape[],
  from: string,
  to: string,
): { folders: string[]; shapes: SavedShape[] } {
  const next = allFolders(folders, shapes).map((f) => rebase(f, from, to));
  return {
    folders: [...new Set(next)],
    shapes: shapes.map((s) => {
      if (!s.folder || !within(s.folder, from)) return s;
      return { ...s, folder: rebase(s.folder, from, to) };
    }),
  };
}

/** Remove folder `path`, its sub-folders, and the shapes inside them. */
export function deleteFolder(
  folders: string[],
  shapes: SavedShape[],
  path: string,
): { folders: string[]; shapes: SavedShape[]; removed: string[] } {
  const removed = shapes.filter((s) => s.folder && within(s.folder, path)).map((s) => s.name);
  const drop = new Set(removed);
  return {
    folders: allFolders(folders, shapes).filter((f) => !within(f, path)),
    shapes: shapes.filter((s) => !drop.has(s.name)),
    removed,
  };
}
