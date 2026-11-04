"use client";

/**
 * Keeps the open project's shapes on the server in step with savedShapes.
 *
 * Every change to the shapes is saved (debounced) as long as a project is open.
 * Each save names the version it was based on; if someone else saved in between,
 * the server refuses and we stop and ask — load theirs, or keep ours — rather than
 * overwrite their work. Mounted once, in the app shell, so it runs in 2D and 3D.
 */
import { useEffect } from "react";
import { create } from "zustand";
import { api, ApiError, type Project } from "@/lib/api/client";
import { useAppStore } from "@/lib/store/appStore";
import type { SavedShape, UnitItem } from "@/lib/types";
import { resetHistory } from "@/lib/store/history";
import { fromDraft, toDraft } from "@/lib/store/sliceDraft";

export type SyncStatus = "idle" | "loading" | "saving" | "saved" | "conflict" | "error";

interface SyncState {
  status: SyncStatus;
  error: string | null;
  /** The shapes and folders as last loaded from / saved to the server, serialised. */
  synced: string | null;
  set: (p: Partial<Omit<SyncState, "set">>) => void;
}

export const useProjectSync = create<SyncState>((set) => ({
  status: "idle",
  error: null,
  synced: null,
  set: (p) => set(p),
}));

const SAVE_DELAY_MS = 800;
// The slicing session in progress is part of what's saved, so cuts made before
// Finish survive a reload, a cleared browser, or opening the project elsewhere.
const key = (shapes: SavedShape[], folders: string[] = [], units: UnitItem[] = [], draft: unknown = null) =>
  JSON.stringify([shapes, folders, units, draft ?? null]);
const appKey = () => {
  const { savedShapes, folders, units, slice } = useAppStore.getState();
  return key(savedShapes, folders, units, toDraft(slice));
};
const projectKey = (p: Project) => key(p.shapes, p.folders, p.units, p.draft);
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Make `project` the open one, with its shapes on the map. */
export function adoptProject(project: Project) {
  const app = useAppStore.getState();
  app.replaceSavedShapes(project.shapes, project.folders ?? [], project.units ?? []);
  useAppStore.setState({ slice: fromDraft(project.draft, project.shapes.map((s) => s.name)) });
  app.setActiveProject({ slug: project.slug, name: project.name, version: project.version });
  // Undo must never reach back into the project that was open before.
  resetHistory();
  useProjectSync.getState().set({ status: "saved", error: null, synced: projectKey(project) });
}

/**
 * Another tab of this site changed the saved state. Take it on here — otherwise
 * this tab's next write would put its stale copy back over the other tab's work
 * (a slicing session, say). The other tab saves to the server, so this one
 * counts what it took on as already saved rather than saving it a second time.
 */
export function followOtherTab() {
  const before = useAppStore.getState().activeProject?.slug;
  void Promise.resolve(useAppStore.persist.rehydrate()).then(() => {
    const sync = useProjectSync.getState();
    const now = useAppStore.getState().activeProject?.slug;
    if (now !== before) sync.set({ status: now ? "saved" : "idle", error: null, synced: now ? appKey() : null });
    else if (now && sync.synced !== null && sync.status === "saved") sync.set({ synced: appKey() });
  });
}

/** True while the open project has changes the server hasn't got yet. */
export function hasUnsavedChanges() {
  const { synced } = useProjectSync.getState();
  return !!useAppStore.getState().activeProject && synced !== null && synced !== appKey();
}

/**
 * Before leaving the open project (opening or creating another), push any change
 * still waiting on the save debounce. Throws if that save didn't go through, so
 * the caller doesn't swap the shapes out from under unsaved work.
 */
export async function flushProject() {
  if (!hasUnsavedChanges()) return;
  await saveNow();
  const { status, error } = useProjectSync.getState();
  if (status !== "saved") throw new Error(`The open project couldn't be saved first: ${error ?? status}`);
}

export async function openProject(slug: string) {
  useProjectSync.getState().set({ status: "loading", error: null });
  try {
    adoptProject(await api.getProject(slug));
  } catch (e) {
    useProjectSync.getState().set({ status: "error", error: message(e) });
    throw e;
  }
}

export function closeProject() {
  useAppStore.getState().setActiveProject(null);
  useProjectSync.getState().set({ status: "idle", error: null, synced: null });
}

/** Save now. `force` overwrites whatever is on the server (the "keep mine" answer to a conflict). */
export async function saveNow(force = false) {
  const { activeProject, savedShapes, folders, units, slice, setActiveProject } = useAppStore.getState();
  if (!activeProject) return;
  const sync = useProjectSync.getState();
  const draft = toDraft(slice);
  const k = key(savedShapes, folders, units, draft);
  sync.set({ status: "saving", error: null });
  try {
    const r = await api.saveProjectShapes(activeProject.slug, savedShapes, folders, activeProject.version, force, units, draft);
    // Still the same project? (It may have been closed or switched mid-save.)
    if (useAppStore.getState().activeProject?.slug !== activeProject.slug) return;
    setActiveProject({ ...activeProject, name: r.name, version: r.version });
    sync.set({ status: "saved", synced: k });
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) sync.set({ status: "conflict", error: message(e) });
    else sync.set({ status: "error", error: message(e) });
  }
}

/** Mount once. Reconciles the remembered project on load, then saves changes as they happen. */
export function useProjectAutosave() {
  const shapes = useAppStore((s) => s.savedShapes);
  const folders = useAppStore((s) => s.folders);
  const units = useAppStore((s) => s.units);
  const slice = useAppStore((s) => s.slice);
  const active = useAppStore((s) => s.activeProject);
  const status = useProjectSync((s) => s.status);
  const synced = useProjectSync((s) => s.synced);

  // Another tab wrote the shared browser state: follow it (see followOtherTab).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === useAppStore.persist.getOptions().name && e.newValue) followOtherTab();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // On load (or when a project is reopened from memory): fetch it and line it up.
  const slug = active?.slug;
  useEffect(() => {
    if (!slug || useProjectSync.getState().synced !== null) return;
    let stop = false;
    const sync = useProjectSync.getState();
    sync.set({ status: "loading", error: null });
    api.getProject(slug).then(
      (p) => {
        if (stop) return;
        const app = useAppStore.getState();
        const local = appKey();
        const remote = projectKey(p);
        if (local === remote) {
          app.setActiveProject({ slug: p.slug, name: p.name, version: p.version });
          sync.set({ status: "saved", synced: local });
        } else if (p.version === app.activeProject?.version) {
          // Nobody else has saved since: these local edits just never reached the server.
          sync.set({ synced: remote });
          void saveNow();
        } else {
          // Both sides moved on — let the user choose.
          sync.set({ status: "conflict", synced: remote, error: "This project was changed somewhere else since this browser last saved it" });
        }
      },
      (e) => {
        if (stop) return;
        if (e instanceof ApiError && e.status === 404) {
          closeProject(); // deleted elsewhere; the shapes stay here, unattached
          sync.set({ status: "error", error: "That project no longer exists on the server — your shapes are still here" });
        } else {
          sync.set({ status: "error", error: message(e) });
        }
      },
    );
    return () => { stop = true; };
  }, [slug]);

  // Save shortly after any change — but not mid-conflict, while loading, or after a
  // failure (the panel's Retry resumes; no hammering a server that's down).
  useEffect(() => {
    if (!active || synced === null || status !== "saved") return;
    if (key(shapes, folders, units, toDraft(slice)) === synced) return;
    const t = setTimeout(() => void saveNow(), SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [shapes, folders, units, slice, active, synced, status]);
}

/**
 * Back up shapes that live only in this browser: into a new project, or added to
 * an existing one (keeping what's already there). Either way that project is then
 * open, so later changes keep saving to it.
 */
export async function backUpShapes(target: { create: string } | { into: string }) {
  const { savedShapes: shapes, folders, units } = useAppStore.getState();
  if ("create" in target) {
    adoptProject(await api.createProject(target.create, shapes, folders, units));
    return { added: shapes.length, skipped: 0 };
  }
  const p = await api.getProject(target.into);
  const merged = [...p.shapes];
  const names = new Set(merged.map((s) => s.name.toLowerCase()));
  let added = 0;
  let skipped = 0;
  for (const s of shapes) {
    const same = p.shapes.find((x) => x.name === s.name);
    if (same && key([{ ...same, visible: true, folder: undefined }]) === key([{ ...s, visible: true, folder: undefined }])) {
      skipped++; // already backed up, unchanged
      continue;
    }
    // A different shape under a taken name comes in as "Name (2)" — nothing is overwritten.
    let name = s.name;
    for (let n = 2; names.has(name.toLowerCase()); n++) name = `${s.name} (${n})`;
    names.add(name.toLowerCase());
    merged.push({ ...s, name });
    added++;
  }
  const mergedFolders = [...new Set([...(p.folders ?? []), ...folders])];
  const mergedUnits = [...(p.units ?? []), ...units.filter((u) => !(p.units ?? []).some((x) => x.filename === u.filename))];
  const r = await api.saveProjectShapes(p.slug, merged, mergedFolders, p.version, false, mergedUnits);
  adoptProject({ ...p, shapes: merged, folders: mergedFolders, units: mergedUnits, version: r.version, name: r.name });
  return { added, skipped };
}
