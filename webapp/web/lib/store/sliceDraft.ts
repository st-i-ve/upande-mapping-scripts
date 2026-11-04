/**
 * A slicing session as it's stored — with a project on the server and in this
 * browser — its cut-by-cut undo and redo included (the newest 50), in a fixed key
 * order so the saved and loaded copies serialise identically (the sync compares
 * them as JSON).
 *
 * Undo steps are stored as changes, not copies: a cut only replaces the piece or
 * two it crosses, so each step keeps the indexes of the pieces it shares with its
 * neighbour and only the pieces that differ. Full copies grew with cuts × pieces —
 * 64 cuts on a 69-piece shape came to 5.5 MB, more than a browser will store.
 */
import type { SliceSession } from "./appStore";

type Geometry = SliceSession["slices"][number];

/** Cut-by-cut undo kept for a slicing session (in memory, storage and the project). */
export const SLICE_UNDO_LIMIT = 50;

/** A piece list against a reference list: a number is "the reference's piece i". */
type Packed = (number | Geometry)[];

export interface SliceDraft {
  source: string;
  original: SliceSession["original"];
  slices: Geometry[];
  widths: number[];
  sourceWasVisible: boolean;
  adopted: SliceSession["adopted"];
  resumedFrom: number;
  /** 2 = undo steps stored as changes (absent on older, full-copy drafts). */
  enc: 2;
  /** Oldest first; step i is packed against step i+1 (the newest against `slices`). */
  history: Packed[];
  /** Next first; step 0 is packed against `slices`, step i against step i-1. */
  future: { s: Packed; w: number }[];
}

function pack(list: Geometry[], ref: Geometry[]): Packed {
  const at = new Map<Geometry | string, number>();
  ref.forEach((g, i) => {
    if (!at.has(g)) at.set(g, i);
  });
  let byJson: Map<string, number> | null = null;
  return list.map((g) => {
    const same = at.get(g);
    if (same !== undefined) return same;
    byJson ??= new Map(ref.map((r, i) => [JSON.stringify(r), i] as const).reverse());
    return byJson.get(JSON.stringify(g)) ?? g;
  });
}

function unpack(p: unknown, ref: Geometry[]): Geometry[] | null {
  if (!Array.isArray(p)) return null;
  const out: Geometry[] = [];
  for (const x of p) {
    if (typeof x === "number") {
      if (!ref[x]) return null;
      out.push(ref[x]);
    } else if (x && typeof x === "object") out.push(x as Geometry);
    else return null;
  }
  return out;
}

export function toDraft(s: SliceSession | null | undefined): SliceDraft | null {
  if (!s) return null;
  const hist = s.history.slice(-SLICE_UNDO_LIMIT);
  const fut = s.future.slice(0, SLICE_UNDO_LIMIT);
  const history: Packed[] = hist.map((h, i) => pack(h, i + 1 < hist.length ? hist[i + 1] : s.slices));
  const future = fut.map((f, i) => ({ s: pack(f.slices, i ? fut[i - 1].slices : s.slices), w: f.width }));
  return {
    source: s.source,
    original: s.original,
    slices: s.slices,
    widths: s.widths,
    sourceWasVisible: s.sourceWasVisible,
    adopted: s.adopted,
    resumedFrom: s.resumedFrom,
    enc: 2,
    history,
    future,
  };
}

/**
 * Back into a session. With `shapeNames`, only if it still fits those shapes (its
 * source must exist). Reads both stored forms: changes (enc 2) and older full copies.
 */
export function fromDraft(d: unknown, shapeNames?: string[]): SliceSession | null {
  const x = d as Partial<SliceDraft> & { history?: unknown[]; future?: unknown[] } | null;
  if (!x || typeof x.source !== "string" || !Array.isArray(x.slices) || !x.slices.length || !x.original) return null;
  if (shapeNames && !shapeNames.includes(x.source)) return null;
  const slices = x.slices as Geometry[];
  const rawH = Array.isArray(x.history) ? x.history : [];
  const rawF = Array.isArray(x.future) ? x.future : [];
  let history: Geometry[][] = [];
  let future: SliceSession["future"] = [];
  if (x.enc === 2) {
    // Newest step first, each against the one after it; a step that won't unpack
    // ends the undo there (the older steps hang off it).
    let ref = slices;
    for (let i = rawH.length - 1; i >= 0; i--) {
      const h = unpack(rawH[i], ref);
      if (!h) break;
      history.unshift(h);
      ref = h;
    }
    ref = slices;
    for (const f of rawF as { s?: unknown; w?: unknown }[]) {
      const sl = unpack(f?.s, ref);
      if (!sl) break;
      future.push({ slices: sl, width: typeof f.w === "number" ? f.w : 1 });
      ref = sl;
    }
  } else {
    history = rawH.filter(Array.isArray) as Geometry[][];
    future = rawF as SliceSession["future"];
  }
  return {
    source: x.source,
    original: x.original,
    slices,
    widths: Array.isArray(x.widths) ? x.widths : [],
    sourceWasVisible: x.sourceWasVisible ?? true,
    adopted: Array.isArray(x.adopted) ? x.adopted : [],
    resumedFrom: x.resumedFrom ?? 0,
    history,
    future,
  };
}
