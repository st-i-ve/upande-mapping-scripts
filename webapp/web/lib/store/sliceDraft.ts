/**
 * A slicing session as it's stored with a project on the server — its cut-by-cut
 * undo and redo included (the newest 50), in a fixed key order so the saved and loaded copies
 * serialise identically (the sync compares them as JSON).
 */
import { SLICE_UNDO_LIMIT, type SliceSession } from "./appStore";

export type SliceDraft = SliceSession;

export function toDraft(s: SliceSession | null | undefined): SliceDraft | null {
  if (!s) return null;
  return {
    source: s.source,
    original: s.original,
    slices: s.slices,
    widths: s.widths,
    sourceWasVisible: s.sourceWasVisible,
    adopted: s.adopted,
    resumedFrom: s.resumedFrom,
    history: s.history.slice(-SLICE_UNDO_LIMIT),
    future: s.future.slice(0, SLICE_UNDO_LIMIT),
  };
}

/** Back into a session, if it still fits the shapes (its source must exist). */
export function fromDraft(d: unknown, shapeNames: string[]): SliceSession | null {
  const x = d as Partial<SliceDraft> | null;
  if (!x || typeof x.source !== "string" || !Array.isArray(x.slices) || !x.slices.length || !x.original) return null;
  if (!shapeNames.includes(x.source)) return null;
  return {
    source: x.source,
    original: x.original,
    slices: x.slices,
    widths: Array.isArray(x.widths) ? x.widths : [],
    sourceWasVisible: x.sourceWasVisible ?? true,
    adopted: Array.isArray(x.adopted) ? x.adopted : [],
    resumedFrom: x.resumedFrom ?? 0,
    history: Array.isArray(x.history) ? x.history : [],
    future: Array.isArray(x.future) ? x.future : [],
  };
}
