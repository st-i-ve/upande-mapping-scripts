"use client";

import { useEffect, useMemo, useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import {
  FolderOpen, FolderClosed, FolderPlus, Folder, ChevronRight, ChevronDown, Pencil, Trash2, X, Check,
  Cloud, CloudOff, RefreshCw, Eye, EyeOff, LocateFixed, Target, Scissors, Search, PieChart,
  Triangle, FolderInput, Plus, ChevronsDownUp, Download, Layers, Files,
} from "lucide-react";
import { exportShapesEach, exportShapesTogether } from "@/lib/exportGeo";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { api, type ProjectSummary } from "@/lib/api/client";
import {
  adoptProject, closeProject, flushProject, openProject, saveNow, useProjectSync,
} from "@/lib/project/sync";
import { allFolders, baseName, childFolders, folderOf, parentOf, within } from "@/lib/store/folders";
import { deleteSelected, goToUnits, selectedInOrder, makePivotFromSelected, selectedCircle, sliceShape } from "@/lib/shapeActions";
import { SectionCard } from "@/components/console/SectionCard";
import { CloudBackupButton, CloudBackupForm } from "@/components/panels/CloudBackup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { shapeLetter } from "@/lib/shapeLabels";
import { checkNames, NAME_ISSUE_TEXT } from "@/lib/shapeNames";
import type { SavedShape } from "@/lib/types";

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const NO_SHAPES: SavedShape[] = [];
const DRAG_SHAPES = "application/x-upande-shapes";
const DRAG_FOLDER = "application/x-upande-folder";
const ICON = "text-muted-foreground transition-colors hover:text-primary";

/* ------------------------------------------------------------------ projects */

/** The project switcher: what's open, every project on the server, and a way to start a new one. */
function ProjectBar() {
  const hydrated = useHydrated();
  const active = useAppStore((s) => (hydrated ? s.activeProject : null));
  const savedShapes = useAppStore((s) => s.savedShapes);
  const status = useProjectSync((s) => s.status);
  const syncError = useProjectSync((s) => s.error);

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [bringShapes, setBringShapes] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => api.listProjects().then((r) => setProjects(r.projects)).catch(() => {});
  useEffect(() => { void refresh(); }, [active?.slug, active?.version]);

  const local = hydrated ? savedShapes.length : 0;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(errText(e)); }
    finally { setBusy(false); void refresh(); }
  };

  /** Shapes that aren't in any project would be replaced — make sure that's meant. */
  const okToReplace = (what: string) =>
    active || local === 0 || window.confirm(
      `${what}? The ${plural(local, "shape")} on this map aren't in a project and will be replaced.\n\n` +
      "To keep them, cancel and back them up to a project first (the cloud button).");

  const startCreate = () => {
    setCreating(true);
    setListOpen(false);
    setName("");
    // Outside a project, the shapes on the map are usually what the new project is for.
    setBringShapes(!active && local > 0);
  };

  const create = () => {
    const n = name.trim();
    if (!n) return;
    if (!bringShapes && !okToReplace(`Start ${n} empty`)) return;
    void run(async () => {
      await flushProject(); // the project being left keeps its last edits
      const { savedShapes: shapes, folders } = useAppStore.getState();
      adoptProject(await api.createProject(n, bringShapes ? shapes : [], bringShapes ? folders : []));
      setCreating(false);
    });
  };

  const open = (p: ProjectSummary) => {
    if (!okToReplace(`Open ${p.name}`)) return;
    void run(async () => {
      await flushProject();
      await openProject(p.slug);
      setListOpen(false);
    });
  };

  const rename = () => run(async () => {
    if (!active || !renaming?.trim()) return;
    const r = await api.renameProject(active.slug, renaming.trim());
    useAppStore.getState().setActiveProject({ ...active, name: r.name, version: r.version });
    setRenaming(null);
  });

  const remove = (p: ProjectSummary) => {
    if (!window.confirm(`Delete the project ${p.name} and its ${plural(p.shape_count, "shape")} from the server? This can't be undone.`)) return;
    void run(async () => {
      await api.deleteProject(p.slug);
      if (active?.slug === p.slug) closeProject(); // its shapes stay on this map, unattached
    });
  };

  const statusIcon = active ? (
    status === "error" || status === "conflict"
      ? <CloudOff size={11} className="shrink-0 text-destructive" />
      : <Cloud size={11} className={`shrink-0 ${status === "saving" ? "animate-pulse text-primary" : "text-primary"}`} />
  ) : <CloudBackupButton onBackUp={() => setBackingUp(true)} />;

  const statusLine =
    status === "saving" ? "Saving…"
    : status === "loading" ? "Loading…"
    : status === "saved" ? "All changes saved"
    : null;

  return (
    <div>
      {/* What's open */}
      <div className={`rounded-md border p-2 ${active ? "border-primary/30 bg-primary/5" : "border-dashed border-border"}`}>
        {renaming !== null && active ? (
          <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); void rename(); }}>
            <Input aria-label="Project name" autoFocus value={renaming} className="h-7 text-[10px]"
              onChange={(e) => setRenaming(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setRenaming(null)} />
            <Button type="submit" size="sm" className="h-7 px-2 text-[10px]" disabled={busy || !renaming.trim()}>Save</Button>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <FolderOpen size={13} className={active ? "shrink-0 text-primary" : "shrink-0 text-muted-foreground"} />
            <button className="min-w-0 flex-1 text-left" onClick={() => setListOpen((o) => !o)}
              title="Switch project" aria-expanded={listOpen}>
              <span className="block truncate text-[11px] font-medium text-foreground">
                {active ? active.name : "No project open"}
              </span>
              <span className="tabular block text-[9px] text-muted-foreground">
                {active ? (statusLine ?? " ") : local ? `${plural(local, "shape")} only in this browser` : "Open or create one to keep your shapes"}
              </span>
            </button>
            <span className="flex shrink-0 items-center gap-1.5">
              {statusIcon}
              {active && <button className={ICON} title="Rename the project" onClick={() => setRenaming(active.name)}><Pencil size={11} /></button>}
              {active && <button className={ICON} title="Close the project (its shapes stay on this map)" onClick={closeProject}><X size={11} /></button>}
            </span>
          </div>
        )}

        {active && status === "conflict" && (
          <div className="mt-1.5">
            <p className="text-[10px] text-destructive">{syncError}. Which copy should the project keep?</p>
            <div className="mt-1.5 flex gap-1.5">
              <Button size="sm" variant="secondary" className="h-7 flex-1 text-[10px]" disabled={busy}
                onClick={() => run(() => openProject(active.slug))}
                title="Replace the shapes on this map with the project's latest saved copy">Load latest</Button>
              <Button size="sm" className="h-7 flex-1 text-[10px]" disabled={busy}
                onClick={() => window.confirm("Overwrite the project with the shapes on this map? The other changes will be lost.") && run(() => saveNow(true))}>
                Keep mine
              </Button>
            </div>
          </div>
        )}
        {status === "error" && syncError && (
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <p className="text-[10px] text-destructive">{active ? `Not saved: ${syncError}` : syncError}</p>
            {active && (
              <Button size="sm" variant="secondary" className="h-6 px-2 text-[10px]" onClick={() => run(() => saveNow())}>
                <RefreshCw size={10} /> Retry
              </Button>
            )}
          </div>
        )}
      </div>

      {backingUp && <CloudBackupForm onDone={() => setBackingUp(false)} />}

      {/* Switch / create */}
      <div className="mt-1.5 flex gap-1.5">
        <Button size="sm" variant="secondary" className="h-7 flex-1 text-[10px]" onClick={() => { setListOpen((o) => !o); setCreating(false); }}
          aria-expanded={listOpen}>
          {listOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />} All projects{projects.length ? ` (${projects.length})` : ""}
        </Button>
        <Button size="sm" className="h-7 flex-1 text-[10px]" onClick={() => (creating ? setCreating(false) : startCreate())}>
          <Plus size={11} /> New project
        </Button>
      </div>

      {creating && (
        <div className="mt-1.5 rounded-md border border-border p-2">
          <div className="flex gap-1.5">
            <Input aria-label="New project name" placeholder="e.g. Kaitet North" value={name} autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") setCreating(false); }}
              className="h-7" />
            <Button size="sm" className="h-7" disabled={busy || !name.trim()} onClick={create}>
              <FolderPlus size={11} /> Create
            </Button>
          </div>
          {local > 0 && (
            <label className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <input type="checkbox" className="accent-primary" checked={bringShapes} onChange={(e) => setBringShapes(e.target.checked)} />
              {active ? `Copy the ${plural(local, "shape")} of ${active.name} into it` : `Start it with the ${plural(local, "shape")} on this map`}
            </label>
          )}
          {active && (
            <p className="mt-1 text-[9px] text-muted-foreground/70">{active.name} is saved and closed; the new project opens in its place.</p>
          )}
        </div>
      )}

      {listOpen && (
        <ul className="mt-1.5 max-h-56 overflow-y-auto rounded-md border border-border">
          {projects.length === 0 && <li className="p-2 text-[10px] text-muted-foreground">No projects on the server yet.</li>}
          {projects.map((p) => {
            const isOpen = active?.slug === p.slug;
            return (
              <li key={p.slug} className={`group/row flex items-center gap-2 border-b border-border/50 px-2 py-1.5 last:border-0 ${isOpen ? "bg-primary/5" : "hover:bg-muted/40"}`}>
                <button className="min-w-0 flex-1 text-left disabled:cursor-default" disabled={isOpen || busy}
                  onClick={() => open(p)} title={isOpen ? "Open now" : `Open ${p.name}`}>
                  <span className={`block truncate text-[10px] ${isOpen ? "font-medium text-primary" : "text-foreground"}`}>
                    {p.name}{isOpen && " · open"}
                  </span>
                  <span className="tabular block text-[9px] text-muted-foreground/70">
                    {plural(p.shape_count, "shape")} · {when(p.updated)}
                  </span>
                </button>
                <button title="Delete this project" className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/row:opacity-100 focus:opacity-100"
                  onClick={() => remove(p)}>
                  <Trash2 size={11} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="mt-1.5 text-[10px] text-destructive">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ tree */

function dragData(e: DragEvent): { shapes?: string[]; folder?: string } {
  const shapes = e.dataTransfer.getData(DRAG_SHAPES);
  const folder = e.dataTransfer.getData(DRAG_FOLDER);
  try {
    return { shapes: shapes ? (JSON.parse(shapes) as string[]) : undefined, folder: folder || undefined };
  } catch {
    return {};
  }
}
const accepts = (e: DragEvent) =>
  e.dataTransfer.types.includes(DRAG_SHAPES) || e.dataTransfer.types.includes(DRAG_FOLDER);

/** Drop shapes or a folder onto `target`. */
function useDropInto(target: string) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => { if (accepts(e)) { e.preventDefault(); setOver(true); } },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        setOver(false);
        const d = dragData(e);
        if (!d.shapes && !d.folder) return;
        e.preventDefault();
        e.stopPropagation();
        const st = useAppStore.getState();
        if (d.shapes) st.moveShapesToFolder(d.shapes, target);
        if (d.folder) st.moveFolder(d.folder, target);
      },
    },
  };
}

function InlineName({ initial, issue, onSave, onCancel }: {
  initial: string; issue?: string | null; onSave: (v: string) => void; onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1">
        <Input autoFocus aria-label="Name" value={v} className={`h-6 text-[10px] ${issue ? "border-destructive" : ""}`}
          onChange={(e) => setV(e.target.value)} onFocus={(e) => e.target.select()}
          onKeyDown={(e) => { if (e.key === "Enter") onSave(v); if (e.key === "Escape") onCancel(); }} />
        <button className={ICON} aria-label="Save name" onClick={() => onSave(v)}><Check size={11} /></button>
        <button className="text-muted-foreground hover:text-destructive" aria-label="Cancel rename" onClick={onCancel}><X size={11} /></button>
      </div>
      {issue && <p className="mt-0.5 text-[9px] text-destructive">{issue}</p>}
    </div>
  );
}

interface TreeCtx {
  all: string[];
  /** Shapes shown (search applied), by folder. */
  byFolder: Map<string, SavedShape[]>;
  /** Index in savedShapes, for the letter the map draws. */
  index: Map<string, number>;
  /** Folders with a visible shape somewhere under them (search applied). */
  nonEmpty: Set<string>;
  searching: boolean;
  open: Set<string>;
  toggle: (path: string) => void;
  setOpen: (path: string, v: boolean) => void;
}

function ShapeRow({ s, ctx, depth }: { s: SavedShape; ctx: TreeCtx; depth: number }) {
  const selected = useAppStore((st) => st.selectedShapes.includes(s.name));
  const savedShapes = useAppStore((st) => st.savedShapes);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(s.name);
  const handle = useMapBridge((st) => st.handle);
  const st = useAppStore.getState;

  const issue = renaming ? checkNames([draft], savedShapes.map((x) => x.name), [s.name])[0] : null;
  const children = renaming ? savedShapes.filter((x) => x.name.startsWith(`${s.name} `)).length : 0;

  const click = (e: MouseEvent) => {
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    st().toggleSelectedShape(s.name, additive);
  };

  return (
    <li
      draggable={!renaming}
      onDragStart={(e) => {
        const sel = st().selectedShapes;
        const names = sel.includes(s.name) ? sel : [s.name];
        e.dataTransfer.setData(DRAG_SHAPES, JSON.stringify(names));
        e.dataTransfer.effectAllowed = "move";
      }}
      className={`group/row flex items-center gap-1.5 rounded py-[3px] pr-1 text-[10px] ${selected ? "bg-primary/12 ring-1 ring-primary/30" : "hover:bg-muted/50"}`}
      style={{ paddingLeft: 6 + depth * 12 }}
    >
      <input type="checkbox" className="accent-primary" aria-label={`Select ${s.name}`}
        checked={selected} onChange={() => st().toggleSelectedShape(s.name, true)} />
      <span className="tabular w-5 shrink-0 text-[10px] font-bold" style={{ color: s.color }} title="Label shown on the map">
        {shapeLetter(ctx.index.get(s.name) ?? 0)}
      </span>
      {renaming ? (
        <InlineName
          initial={s.name}
          issue={issue ? NAME_ISSUE_TEXT[issue] : children ? `Renames its ${plural(children, "slice")} too.` : null}
          onCancel={() => setRenaming(false)}
          onSave={(v) => {
            setDraft(v);
            if (checkNames([v], savedShapes.map((x) => x.name), [s.name])[0]) return;
            st().renameSavedShape(s.name, v);
            setRenaming(false);
          }}
        />
      ) : (
        <>
          <button className={`min-w-0 flex-1 truncate text-left ${s.visible ? "text-foreground" : "text-muted-foreground/60"}`}
            onClick={click} onDoubleClick={() => handle?.fitGeometry(s.geometry)}
            title={`${s.name} — click to select (Ctrl/Shift adds), double-click to zoom, drag into a folder`}>
            {s.name}
          </button>
          <span className="flex shrink-0 items-center gap-1.5 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
            <button className={ICON} title="Zoom to it" aria-label={`Zoom to ${s.name}`} onClick={() => handle?.fitGeometry(s.geometry)}><LocateFixed size={11} /></button>
            <button className={ICON} title="Use as the working polygon (Generate / knife)" aria-label={`Use ${s.name}`} onClick={() => st().setWorkingPolygon(s.geometry)}><Target size={11} /></button>
            <button className={ICON} title="Slice it repeatedly with the knife (original kept)" aria-label={`Slice ${s.name}`} onClick={() => sliceShape(s.name)}><Scissors size={11} /></button>
            <button className={ICON} title="Export as GeoJSON" aria-label={`Export ${s.name}`} onClick={() => exportShapesTogether([s], s.name)}><Download size={11} /></button>
            <button className={ICON} title="Rename" aria-label={`Rename ${s.name}`} onClick={() => { setDraft(s.name); setRenaming(true); }}><Pencil size={11} /></button>
            <button className="text-muted-foreground hover:text-destructive" title="Delete (Ctrl+Z brings it back)" aria-label={`Delete ${s.name}`} onClick={() => st().removeSavedShape(s.name)}><Trash2 size={11} /></button>
          </span>
        </>
      )}
      <button className={`shrink-0 ${ICON}`} title={s.visible ? "Hide on the map" : "Show on the map"}
        aria-label={s.visible ? `Hide ${s.name}` : `Show ${s.name}`} onClick={() => st().toggleShapeVisible(s.name)}>
        {s.visible ? <Eye size={11} /> : <EyeOff size={11} />}
      </button>
    </li>
  );
}

function FolderNode({ path, ctx, depth }: { path: string; ctx: TreeCtx; depth: number }) {
  const activeFolder = useAppStore((s) => s.activeFolder);
  const savedShapes = useAppStore((s) => s.savedShapes);
  const [renaming, setRenaming] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const drop = useDropInto(path);
  const st = useAppStore.getState;

  if (ctx.searching && !ctx.nonEmpty.has(path)) return null;
  const isOpen = ctx.searching || ctx.open.has(path);
  const inside = savedShapes.filter((s) => within(folderOf(s), path));
  const anyVisible = inside.some((s) => s.visible);
  const isActive = activeFolder === path;

  const remove = () => {
    if (inside.length && !window.confirm(
      `Delete the folder ${baseName(path)} and the ${plural(inside.length, "shape")} in it? (Ctrl+Z brings them back.)`)) return;
    st().deleteFolder(path);
  };
  const addSub = () => {
    const p = st().createFolder(path);
    ctx.setOpen(path, true);
    st().setActiveFolder(p);
  };

  return (
    <li>
      <div
        draggable={!renaming}
        onDragStart={(e) => { e.dataTransfer.setData(DRAG_FOLDER, path); e.dataTransfer.effectAllowed = "move"; }}
        {...drop.props}
        className={`group/row flex items-center gap-1 rounded py-[3px] pr-1 text-[10px] ${
          drop.over ? "bg-primary/20 ring-1 ring-primary" : isActive ? "bg-primary/8" : "hover:bg-muted/50"}`}
        style={{ paddingLeft: 2 + depth * 12 }}
      >
        <button className="shrink-0 text-muted-foreground" aria-label={isOpen ? `Collapse ${path}` : `Expand ${path}`} onClick={() => ctx.toggle(path)}>
          {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>
        {isOpen ? <FolderOpen size={11} className="shrink-0 text-primary/80" /> : <FolderClosed size={11} className="shrink-0 text-primary/80" />}
        {renaming ? (
          <InlineName initial={baseName(path)} issue={issue}
            onCancel={() => { setRenaming(false); setIssue(null); }}
            onSave={(v) => {
              const to = st().renameFolder(path, v);
              if (!to) { setIssue("That name is empty or already used here."); return; }
              setRenaming(false);
              setIssue(null);
            }} />
        ) : (
          <>
            <button className={`min-w-0 flex-1 truncate text-left font-medium ${isActive ? "text-primary" : "text-foreground"}`}
              onClick={() => { st().setActiveFolder(isActive ? parentOf(path) : path); if (!isOpen) ctx.toggle(path); }}
              onDoubleClick={() => setRenaming(true)}
              title={`${path} — click to open (new shapes save here), double-click to rename, drag to move`}>
              {baseName(path)} <span className="tabular font-normal text-muted-foreground/70">{inside.length}</span>
            </button>
            <span className="flex shrink-0 items-center gap-1.5 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
              <button className={ICON} title="Select every shape in it" aria-label={`Select all in ${path}`}
                onClick={() => st().setSelectedShapes(inside.map((s) => s.name))}><Check size={11} /></button>
              <button className={ICON} title="Export everything in it as one GeoJSON" aria-label={`Export ${path}`} disabled={!inside.length}
                onClick={() => exportShapesTogether(inside, baseName(path))}><Download size={11} /></button>
              <button className={ICON} title="New sub-folder" aria-label={`New folder in ${path}`} onClick={addSub}><FolderPlus size={11} /></button>
              <button className={ICON} title="Rename" aria-label={`Rename ${path}`} onClick={() => setRenaming(true)}><Pencil size={11} /></button>
              <button className="text-muted-foreground hover:text-destructive" title="Delete the folder and its shapes" aria-label={`Delete ${path}`} onClick={remove}><Trash2 size={11} /></button>
            </span>
          </>
        )}
        <button className={`shrink-0 ${ICON}`} disabled={!inside.length}
          title={anyVisible ? "Hide everything in it" : "Show everything in it"}
          aria-label={anyVisible ? `Hide ${path}` : `Show ${path}`}
          onClick={() => st().setFolderVisible(path, !anyVisible)}>
          {anyVisible || !inside.length ? <Eye size={11} /> : <EyeOff size={11} />}
        </button>
      </div>
      {isOpen && <TreeLevel parent={path} ctx={ctx} depth={depth + 1} />}
    </li>
  );
}

function TreeLevel({ parent, ctx, depth }: { parent: string; ctx: TreeCtx; depth: number }) {
  const folders = childFolders(ctx.all, parent);
  const shapes = ctx.byFolder.get(parent) ?? [];
  if (!folders.length && !shapes.length) {
    return depth > 0 && !ctx.searching
      ? <p className="py-0.5 text-[10px] italic text-muted-foreground/60" style={{ paddingLeft: 20 + depth * 12 }}>Empty — drag shapes here</p>
      : null;
  }
  return (
    <ul>
      {folders.map((f) => <FolderNode key={f} path={f} ctx={ctx} depth={depth} />)}
      {shapes.map((s) => <ShapeRow key={s.name} s={s} ctx={ctx} depth={depth} />)}
    </ul>
  );
}

/** What to do with the selection: file it, pivot it, triad it, delete it. */
function SelectionBar({ all }: { all: string[] }) {
  const selected = useAppStore((s) => s.selectedShapes);
  const st = useAppStore.getState;
  useAppStore((s) => s.savedShapes); // re-check the circle when shapes change
  if (!selected.length) return null;
  const circle = selectedCircle();

  return (
    <div className="sticky bottom-0 z-10 mt-2 rounded-md border border-primary/30 bg-card/95 p-2 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium text-foreground">{selected.length} selected</span>
        <button className="text-[10px] text-muted-foreground hover:text-primary" onClick={() => st().clearSelectedShapes()}>Clear</button>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <FolderInput size={11} className="shrink-0 text-muted-foreground" />
        <select aria-label="Move the selected shapes to a folder" value="" className="h-7 min-w-0 flex-1 rounded-md border border-input bg-transparent px-1.5 text-[10px]"
          onChange={(e) => { if (e.target.value !== "") st().moveShapesToFolder(selected, e.target.value === "/" ? "" : e.target.value); }}>
          <option value="" disabled>Move to folder…</option>
          <option value="/">Project root</option>
          {all.map((f) => <option key={f} value={f}>{"  ".repeat(f.split("/").length - 1)}{baseName(f)}</option>)}
        </select>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {circle && (
          <Button size="sm" variant="secondary" className="h-7 text-[10px]" onClick={makePivotFromSelected}
            title={`Lay out ${circle.shape.name} as a pivot (${Math.round(circle.fit.radiusM)} m radius) and cut it into blocks`}>
            <PieChart size={10} /> Make pivot
          </Button>
        )}
        <Button size="sm" variant="secondary" className="h-7 text-[10px]" title="Queue these shapes for band/triad generation (Units tab)"
          onClick={() => { st().setTriadQueue(selected); goToUnits("triads"); }}>
          <Triangle size={10} /> Triads
        </Button>
        <Button size="sm" variant="secondary" className="h-7 text-[10px]" title="All the selected shapes in one GeoJSON file"
          onClick={() => exportShapesTogether(selectedInOrder(), selected.length === 1 ? selected[0] : `${selected.length} shapes`)}>
          <Layers size={10} /> Export as one
        </Button>
        <Button size="sm" variant="secondary" className="h-7 text-[10px]" title="One GeoJSON file per shape, zipped"
          onClick={() => exportShapesEach(selectedInOrder(), `${selected.length} shapes`)}>
          <Files size={10} /> Export each
        </Button>
        <Button variant="destructive" size="sm" className="ml-auto h-7 text-[10px]" title="Or press Delete — Ctrl+Z brings them back" onClick={deleteSelected}>
          <Trash2 size={10} /> Delete
        </Button>
      </div>
    </div>
  );
}

function ShapeTree() {
  const hydrated = useHydrated();
  const savedShapes = useAppStore((s) => s.savedShapes);
  const folders = useAppStore((s) => s.folders);
  const activeFolder = useAppStore((s) => s.activeFolder);
  const activeProject = useAppStore((s) => (hydrated ? s.activeProject : null));
  const shapesVisible = useAppStore((s) => s.shapesVisible);
  const shapeOpacity = useAppStore((s) => s.shapeOpacity);
  const st = useAppStore.getState;
  const [query, setQuery] = useState("");
  const [open, setOpenSet] = useState<Set<string>>(() => new Set());
  const rootDrop = useDropInto("");

  const shapes = hydrated ? savedShapes : NO_SHAPES;
  const all = useMemo(() => allFolders(folders, shapes), [folders, shapes]);

  const ctx = useMemo<TreeCtx>(() => {
    const q = query.trim().toLowerCase();
    const index = new Map(shapes.map((s, i) => [s.name, i]));
    const shown = q ? shapes.filter((s) => s.name.toLowerCase().includes(q) || folderOf(s).toLowerCase().includes(q)) : shapes;
    const byFolder = new Map<string, SavedShape[]>();
    const nonEmpty = new Set<string>();
    for (const s of shown) {
      const f = folderOf(s);
      byFolder.set(f, [...(byFolder.get(f) ?? []), s]);
      for (let p = f; p; p = parentOf(p)) nonEmpty.add(p);
    }
    if (q) all.filter((f) => baseName(f).toLowerCase().includes(q)).forEach((f) => {
      for (let p = f; p; p = parentOf(p)) nonEmpty.add(p);
    });
    return {
      all, byFolder, index, nonEmpty, searching: !!q, open,
      toggle: (p) => setOpenSet((o) => { const n = new Set(o); if (n.has(p)) n.delete(p); else n.add(p); return n; }),
      setOpen: (p, v) => setOpenSet((o) => { const n = new Set(o); if (v) n.add(p); else n.delete(p); return n; }),
    };
  }, [shapes, all, query, open]);

  const newFolder = () => {
    const p = st().createFolder(activeFolder);
    if (activeFolder) ctx.setOpen(activeFolder, true);
    st().setActiveFolder(p);
  };
  const rootName = activeProject?.name ?? "This browser";
  const crumbs = activeFolder ? activeFolder.split("/") : [];

  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search size={11} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search shapes and folders" placeholder={`Search ${plural(shapes.length, "shape")}…`} value={query}
            onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            className="h-7 pl-6 text-[10px]" />
        </div>
        <button className={ICON} title={`New folder in ${activeFolder ? baseName(activeFolder) : rootName}`} aria-label="New folder" onClick={newFolder}>
          <FolderPlus size={13} />
        </button>
        <button className={ICON} title={`Export all ${plural(shapes.length, "shape")} (one file per shape, zipped, in their folders)`}
          aria-label="Export all shapes" disabled={!shapes.length} onClick={() => exportShapesEach(shapes, rootName)}>
          <Download size={13} />
        </button>
        <button className={ICON} title="Collapse all folders" aria-label="Collapse all folders" onClick={() => setOpenSet(new Set())}>
          <ChevronsDownUp size={13} />
        </button>
        <Switch checked={shapesVisible} onCheckedChange={setShapesVisibleSafe} aria-label="Show shapes on the map" />
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground" title="Shapes are drawn as outline + letter; add fill only if you want it">Fill</span>
        <Slider value={[Math.round(shapeOpacity * 100)]} max={100} step={1}
          onValueChange={(v) => st().setShapeOpacity((Array.isArray(v) ? v[0] : v) / 100)} className="flex-1" />
        <span className="tabular w-8 text-right text-[9px] text-muted-foreground">{Math.round(shapeOpacity * 100)}%</span>
      </div>

      {/* Where you are — new shapes are saved into this folder. */}
      <nav aria-label="Open folder" className="mt-2 flex flex-wrap items-center gap-0.5 text-[10px] text-muted-foreground">
        <span className="mr-1">Saving into</span>
        <Crumb onClick={() => st().setActiveFolder("")} current={!crumbs.length}>{rootName}</Crumb>
        {crumbs.map((c, i) => {
          const p = crumbs.slice(0, i + 1).join("/");
          return (
            <span key={p} className="inline-flex items-center gap-0.5">
              <ChevronRight size={9} />
              <Crumb onClick={() => st().setActiveFolder(p)} current={i === crumbs.length - 1}>{c}</Crumb>
            </span>
          );
        })}
      </nav>

      <div
        {...rootDrop.props}
        className={`mt-1 min-h-10 rounded-md border p-1 ${rootDrop.over ? "border-primary bg-primary/5" : "border-border/60"}`}
      >
        <div className="flex items-center gap-1 px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Folder size={11} /> {rootName}
          <span className="tabular ml-auto font-normal normal-case tracking-normal">
            {plural(shapes.length, "shape")} · {plural(all.length, "folder")}
          </span>
          {shapes.length > 0 && (
            <button className="ml-1.5 rounded px-1.5 py-0.5 font-normal normal-case tracking-normal text-primary hover:bg-primary/10"
              title="Select every shape (then export, move or delete them together)"
              onClick={() => st().setSelectedShapes(shapes.map((x) => x.name))}>
              Select all
            </button>
          )}
        </div>
        <TreeLevel parent="" ctx={ctx} depth={0} />
        {hydrated && shapes.length === 0 && all.length === 0 && (
          <p className="px-1 py-2 text-[10px] text-muted-foreground/70">
            No shapes yet. Draw one with the tools on the left, or import GeoJSON from the Tool tab.
          </p>
        )}
        {ctx.searching && ctx.nonEmpty.size === 0 && !(ctx.byFolder.get("")?.length) && (
          <p className="px-1 py-2 text-[10px] text-muted-foreground/70">Nothing matches “{query}”.</p>
        )}
      </div>

      <SelectionBar all={all} />
    </div>
  );
}

const setShapesVisibleSafe = (v: boolean) => useAppStore.getState().setShapesVisible(v);

function Crumb({ children, onClick, current }: { children: ReactNode; onClick: () => void; current?: boolean }) {
  return (
    <button onClick={onClick} className={`max-w-28 truncate rounded px-1 hover:bg-muted ${current ? "font-medium text-primary" : "hover:text-foreground"}`}>
      {children}
    </button>
  );
}

/**
 * The Browser: the project you're in, every other project, and the shapes in it
 * arranged in folders — like a file browser. Everything here autosaves to the
 * open project, and every change can be undone with Ctrl+Z.
 */
export function ProjectBrowser() {
  return (
    <SectionCard title={<span className="inline-flex items-center gap-1.5"><FolderOpen size={11} /> Projects &amp; shapes</span>}>
      <ProjectBar />
      <ShapeTree />
    </SectionCard>
  );
}
