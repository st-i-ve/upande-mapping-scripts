"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, RefreshCw } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { SectionCard } from "@/components/console/SectionCard";
import { ListRow } from "@/components/console/ListRow";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import type { OutputInfo } from "@/lib/types";

function kb(bytes: number) {
  return bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

export function OutputsPanel() {
  const [items, setItems] = useState<OutputInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const setGenResult = useAppStore((s) => s.setGenResult);
  const fitGeometry = useMapBridge((s) => s.handle?.fitGeometry);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { outputs } = await api.listOutputs();
      setItems(outputs);
      setSelected(new Set());
    } catch {
      /* backend unreachable — leave list as-is */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const view = async (filename: string) => {
    const fc = await api.getOutput(filename);
    setGenResult(fc, filename);
    const g = fc.features?.[0]?.geometry;
    if (g) fitGeometry?.(g);
  };

  const copyFrappe = async (filename: string) => {
    const res = await fetch(api.frappeUrl(filename));
    await navigator.clipboard.writeText(await res.text());
  };

  const del = async (filename: string) => {
    await api.deleteOutput(filename);
    load();
  };
  const delSelected = async () => {
    for (const f of selected) await api.deleteOutput(f);
    load();
  };
  const toggle = (f: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(f) ? n.delete(f) : n.add(f);
      return n;
    });
  const allChecked = items.length > 0 && selected.size === items.length;

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-1.5"><Archive size={12} /> Saved outputs</span>}
      index="07"
      meta={
        <button onClick={load} aria-label="Refresh" className="text-muted-foreground hover:text-primary">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      }
    >
      {items.length > 0 && (
        <div className="mb-1 flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
            <input
              type="checkbox"
              className="accent-primary"
              checked={allChecked}
              onChange={(e) => setSelected(e.target.checked ? new Set(items.map((i) => i.filename)) : new Set())}
            />
            Select all
          </label>
          <Button variant="destructive" size="sm" className="h-7 text-[9px]" disabled={!selected.size} onClick={delSelected}>
            Delete selected{selected.size ? ` (${selected.size})` : ""}
          </Button>
        </div>
      )}
      <ul>
        {items.map((o) => (
          <ListRow
            key={o.filename}
            actions={
              <>
                <button className="text-muted-foreground hover:text-primary" onClick={() => view(o.filename)}>view</button>
                <button className="text-muted-foreground hover:text-primary" onClick={() => copyFrappe(o.filename)}>frappe</button>
                <a className="text-muted-foreground hover:text-primary" href={api.frappeUrl(o.filename)} download>.txt</a>
                <button className="text-muted-foreground hover:text-destructive" onClick={() => del(o.filename)}>delete</button>
              </>
            }
          >
            <label className="flex items-start gap-1.5">
              <input type="checkbox" className="mt-0.5 accent-primary" checked={selected.has(o.filename)} onChange={() => toggle(o.filename)} />
              <span>
                <span className="tabular break-all text-[9px]">{o.filename}</span>
                <span className="tabular ml-1 text-[8px] text-muted-foreground">{kb(o.size_bytes)}</span>
              </span>
            </label>
          </ListRow>
        ))}
      </ul>
      {!items.length && <p className="text-[9px] text-muted-foreground/70">No saved outputs yet — Generate creates them.</p>}
    </SectionCard>
  );
}
