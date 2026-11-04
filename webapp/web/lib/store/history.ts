/**
 * App-wide undo / redo for the user's work: saved shapes, their folders, and
 * reference points. The last HISTORY_LIMIT steps are kept.
 *
 * Rather than every action pushing its own entry, this watches the store: any
 * change to those slices records the state from just before it. Changes made in
 * one synchronous burst (a pivot saves a circle and its blocks in one click) are
 * coalesced into a single step, so one Ctrl+Z undoes one thing the user did.
 *
 * A slicing session keeps its own cut-by-cut undo (Segments). While one is open,
 * its intermediate changes are not recorded here; when it ends, the whole session
 * becomes one step — undoing it puts back the shape exactly as it was before.
 *
 * Opening a project resets the history: undo never reaches into another project.
 *
 * The stacks are kept in sessionStorage, so a reload of the tab keeps them (per
 * tab, and only for the project they belong to).
 */
import { create } from "zustand";
import { useAppStore, type AppState } from "./appStore";

export const HISTORY_LIMIT = 50;

interface Snapshot {
  savedShapes: AppState["savedShapes"];
  folders: AppState["folders"];
  units: AppState["units"];
  refPoints: AppState["refPoints"];
}

const snap = (s: Snapshot): Snapshot => ({
  savedShapes: s.savedShapes,
  folders: s.folders,
  units: s.units,
  refPoints: s.refPoints,
});
// The store updates immutably, so reference equality is change detection.
const same = (a: Snapshot, b: Snapshot) =>
  a.savedShapes === b.savedShapes && a.folders === b.folders && a.units === b.units && a.refPoints === b.refPoints;

/** Same shapes by value — a cancelled slicing session hands back equal but new objects. */
const sameShapes = (a: Snapshot["savedShapes"], b: Snapshot["savedShapes"]) =>
  a === b ||
  (a.length === b.length &&
    a.every((x, i) => {
      const y = b[i];
      return x === y || (x.name === y.name && x.geometry === y.geometry && x.visible === y.visible &&
        x.color === y.color && x.folder === y.folder);
    }));
const sameByValue = (a: Snapshot, b: Snapshot) =>
  sameShapes(a.savedShapes, b.savedShapes) && a.folders === b.folders && a.units === b.units && a.refPoints === b.refPoints;

interface HistoryState {
  past: Snapshot[];
  future: Snapshot[];
}

/** Reactive view of the stacks, for enabling the Undo / Redo buttons. */
export const useHistory = create<HistoryState>(() => ({ past: [], future: [] }));

let applying = false;
let pending: Snapshot | null = null; // state before the first change of this burst
let sliceBase: Snapshot | null = null; // state before the open slicing session began

function commit(before: Snapshot) {
  const { past } = useHistory.getState();
  const next = [...past, before];
  if (next.length > HISTORY_LIMIT) next.splice(0, next.length - HISTORY_LIMIT);
  useHistory.setState({ past: next, future: [] }); // a new step drops the redo branch
}

useAppStore.subscribe((s, prev) => {
  if (applying) return;
  if (!prev.slice && s.slice) {
    // Session starts: remember where it began (before this burst, if one is open).
    sliceBase = pending ?? snap(prev);
    pending = null;
    return;
  }
  if (prev.slice && !s.slice) {
    const base = sliceBase;
    sliceBase = null;
    if (base && !sameByValue(base, snap(s))) commit(base); // cancelled sessions change nothing
    return;
  }
  if (s.slice) return; // the session's own undo covers it
  if (same(snap(s), snap(prev))) return;
  if (!pending) {
    pending = snap(prev);
    queueMicrotask(() => {
      if (pending) commit(pending);
      pending = null;
    });
  }
});

function apply(target: Snapshot) {
  applying = true;
  try {
    useAppStore.setState((s) => {
      const names = new Set(target.savedShapes.map((x) => x.name));
      return {
        ...target,
        // Nothing may stay selected that the step took away.
        selectedShapes: s.selectedShapes.filter((n) => names.has(n)),
      };
    });
  } finally {
    applying = false;
  }
}

/** Flush a burst still waiting on its microtask, so undo sees the latest step. */
function settle() {
  if (pending) {
    commit(pending);
    pending = null;
  }
}

export const canUndo = () => (settle(), useHistory.getState().past.length > 0);
export const canRedo = () => useHistory.getState().future.length > 0;

/** Step back once. False when there's nothing to undo (or a slicing session is open). */
export function undo(): boolean {
  settle();
  if (useAppStore.getState().slice) return false;
  const { past, future } = useHistory.getState();
  if (!past.length) return false;
  const target = past[past.length - 1];
  const now = snap(useAppStore.getState());
  useHistory.setState({ past: past.slice(0, -1), future: [now, ...future] });
  apply(target);
  return true;
}

/** Put back what undo took away. */
export function redo(): boolean {
  settle();
  if (useAppStore.getState().slice) return false;
  const { past, future } = useHistory.getState();
  if (!future.length) return false;
  const [target, ...rest] = future;
  const now = snap(useAppStore.getState());
  useHistory.setState({ past: [...past, now].slice(-HISTORY_LIMIT), future: rest });
  apply(target);
  return true;
}

/** Forget everything (a project was opened). */
export function resetHistory() {
  pending = null;
  sliceBase = useAppStore.getState().slice ? snap(useAppStore.getState()) : null;
  useHistory.setState({ past: [], future: [] });
}

// ---- survive a reload: the stacks live in sessionStorage, tagged with the project ----
const STORE_KEY = "upande-history";
const owner = () => useAppStore.getState().activeProject?.slug ?? "";
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function saveStacks() {
  if (typeof sessionStorage === "undefined") return;
  const { past, future } = useHistory.getState();
  let p = past;
  let f = future;
  // Big projects × 50 steps can outgrow the storage: keep the newest steps that fit.
  for (;;) {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify({ owner: owner(), past: p, future: f, sliceBase }));
      return;
    } catch {
      if (!p.length && !f.length) return;
      p = p.slice(Math.ceil(p.length / 2));
      f = f.slice(0, Math.floor(f.length / 2));
    }
  }
}

/** Take back the stacks saved before a reload — if they belong to what's open now. */
function restoreStacks() {
  resetHistory();
  try {
    const raw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(STORE_KEY) : null;
    if (!raw) return;
    const saved = JSON.parse(raw) as { owner: string; past: Snapshot[]; future: Snapshot[]; sliceBase: Snapshot | null };
    if (saved.owner !== owner()) return;
    useHistory.setState({ past: saved.past ?? [], future: saved.future ?? [] });
    if (useAppStore.getState().slice && saved.sliceBase) sliceBase = saved.sliceBase;
  } catch {
    /* unreadable — start fresh */
  }
}

useHistory.subscribe(() => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveStacks, 300);
});

// Loading saved work from the browser is not a step the user can undo — but the
// steps from before a reload are. Hydration from localStorage is synchronous, so
// it may already be done by the time this module loads.
if (useAppStore.persist?.hasHydrated?.()) restoreStacks();
else useAppStore.persist?.onFinishHydration?.(() => restoreStacks());
