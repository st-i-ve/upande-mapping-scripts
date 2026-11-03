"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudAlert, CloudCheck, CloudUpload } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { api, type ProjectSummary } from "@/lib/api/client";
import { backUpShapes, useProjectSync } from "@/lib/project/sync";
import { goToSection } from "@/lib/shapeActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const NEW = "__new__";
const today = () => new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** The cloud in the Browser: whether these shapes are on the server, and a way to put them there. */
export function CloudBackupButton({ onBackUp }: { onBackUp: () => void }) {
  const hydrated = useHydrated();
  const active = useAppStore((s) => (hydrated ? s.activeProject : null));
  const count = useAppStore((s) => (hydrated ? s.savedShapes.length : 0));
  const status = useProjectSync((s) => s.status);
  const toProject = () => goToSection("browser");

  if (active) {
    if (status === "error" || status === "conflict") {
      return <button title={`Not backed up — see the ${active.name} project`} className="text-destructive" onClick={toProject}><CloudAlert size={15} /></button>;
    }
    if (status === "saving" || status === "loading") {
      return <span title={`Saving to ${active.name}…`} className="animate-pulse text-primary"><Cloud size={15} /></span>;
    }
    return <button title={`Backed up to the ${active.name} project`} className="text-primary" onClick={toProject}><CloudCheck size={15} /></button>;
  }
  if (!count) return null;
  return (
    <button title={`Only in this browser — back up ${count} shape${count === 1 ? "" : "s"} to the server`}
      className="text-amber-500 hover:text-primary" onClick={onBackUp}>
      <CloudUpload size={15} />
    </button>
  );
}

/** The form the cloud opens: back up to a new project, or into an existing one. */
export function CloudBackupForm({ onDone }: { onDone: () => void }) {
  const count = useAppStore((s) => s.savedShapes.length);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [target, setTarget] = useState(NEW);
  const [name, setName] = useState(`My shapes ${today()}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.listProjects().then((r) => setProjects(r.projects)).catch(() => {}); }, []);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await backUpShapes(target === NEW ? { create: name.trim() } : { into: target });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 rounded-md border border-primary/30 bg-primary/5 p-2">
      <p className="text-[12px] text-foreground">
        Back up {count} shape{count === 1 ? "" : "s"} from this browser to the server
      </p>
      <select aria-label="Back up to" value={target} onChange={(e) => setTarget(e.target.value)}
        className="mt-1.5 h-9 w-full rounded-md border border-input bg-transparent px-2 text-xs">
        <option value={NEW}>A new project</option>
        {projects.map((p) => <option key={p.slug} value={p.slug}>Add to {p.name} ({p.shape_count} shapes)</option>)}
      </select>
      {target === NEW ? (
        <Input aria-label="Backup project name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-9" />
      ) : (
        <p className="mt-1.5 text-[11px] text-muted-foreground/70">
          Its shapes stay; yours are added. Same name, different shape → saved as “Name (2)”.
        </p>
      )}
      {error && <p className="mt-1.5 text-[12px] text-destructive">{error}</p>}
      <div className="mt-2 flex gap-1.5">
        <Button size="sm" variant="secondary" className="flex-1" onClick={onDone}>Cancel</Button>
        <Button size="sm" className="flex-1" disabled={busy || (target === NEW && !name.trim())} onClick={go}>
          <CloudUpload size={14} /> {busy ? "Backing up…" : "Back up"}
        </Button>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground/60">
        That project then stays open, so later changes save to it automatically.
      </p>
    </div>
  );
}
