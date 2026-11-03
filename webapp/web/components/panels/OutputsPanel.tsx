"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Archive, RefreshCw, Eye, LocateFixed, Download, ClipboardCopy, FileText, Trash2, Check, Layers, Files,
} from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { SectionCard } from "@/components/console/SectionCard";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { downloadGeoJson, safeName, zipFiles } from "@/lib/exportGeo";
import type { FeatureCollection, GeoGeometry, OutputInfo } from "@/lib/types";

function kb(bytes: number) {
  return bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
const stem = (f: string) => f.replace(/\.geojson$/i, "");
const ICON = "flex h-6 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-40";

function saveBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function OutputsPanel() {
  const [items, setItems] = useState<OutputInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const setGenResult = useAppStore((s) => s.setGenResult);
  const genFilename = useAppStore((s) => s.genFilename);
  const fitGeometry = useMapBridge((s) => s.handle?.fitGeometry);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { outputs } = await api.listOutputs();
      setItems(outputs);
      setSelected((sel) => new Set([...sel].filter((f) => outputs.some((o) => o.filename === f))));
    } catch {
      /* backend unreachable — leave list as-is */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (ok: boolean, text: string) => {
    setNote({ ok, text });
    setTimeout(() => setNote(null), 3500);
  };
  const tryIt = async (fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { flash(false, e instanceof Error ? e.message : String(e)); }
  };

  /** Zoom to the whole output — every feature, not just the first. */
  const zoom = (fc: FeatureCollection) => fitGeometry?.(fc as unknown as GeoGeometry);

  const show = (f: string) => tryIt(async () => {
    if (shown === f || genFilename === f) {
      setGenResult(null, null);
      setShown(null);
      return;
    }
    const fc = await api.getOutput(f);
    setGenResult(fc, f);
    setShown(f);
    zoom(fc);
  });
  const zoomTo = (f: string) => tryIt(async () => zoom(await api.getOutput(f)));
  const download = (f: string) => tryIt(async () => downloadGeoJson(await api.getOutput(f), stem(f)));
  const copyFrappe = (f: string) => tryIt(async () => {
    const res = await fetch(api.frappeUrl(f));
    await navigator.clipboard.writeText(await res.text());
    flash(true, "Frappe format copied");
  });
  const del = (f: string) => tryIt(async () => {
    if (!window.confirm(`Delete ${f} from the server?`)) return;
    await api.deleteOutput(f);
    await load();
  });

  const picked = items.filter((o) => selected.has(o.filename)).map((o) => o.filename);
  const delSelected = () => tryIt(async () => {
    if (!window.confirm(`Delete ${picked.length} output${picked.length === 1 ? "" : "s"} from the server?`)) return;
    for (const f of picked) await api.deleteOutput(f);
    await load();
  });
  /** All the picked outputs merged into one GeoJSON, each feature tagged with its source file. */
  const exportTogether = () => tryIt(async () => {
    const fcs = await Promise.all(picked.map(async (f) => ({ f, fc: await api.getOutput(f) })));
    downloadGeoJson({
      type: "FeatureCollection",
      features: fcs.flatMap(({ f, fc }) => fc.features.map((x) => ({ ...x, properties: { ...x.properties, output: stem(f) } }))),
    }, picked.length === 1 ? stem(picked[0]) : `outputs (${picked.length})`);
  });
  /** One GeoJSON per picked output, zipped. */
  const exportEach = () => tryIt(async () => {
    if (picked.length === 1) return download(picked[0]);
    const files = await Promise.all(picked.map(async (f) => ({ name: `${safeName(stem(f))}.geojson`, data: JSON.stringify(await api.getOutput(f)) })));
    saveBlob(zipFiles(files), `outputs (${picked.length}).zip`);
  });

  const toggle = (f: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(f)) n.delete(f);
      else n.add(f);
      return n;
    });
  const allChecked = items.length > 0 && selected.size === items.length;

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-1.5"><Archive size={11} /> Saved outputs</span>}
      meta={
        <button onClick={() => void load()} aria-label="Refresh" title="Refresh" className="text-muted-foreground hover:text-primary">
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
        </button>
      }
    >
      {items.length > 0 && (
        <label className="mb-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <input type="checkbox" className="accent-primary" checked={allChecked}
            onChange={(e) => setSelected(e.target.checked ? new Set(items.map((i) => i.filename)) : new Set())} />
          Select all <span className="tabular">({items.length})</span>
        </label>
      )}
      <ul className="space-y-0.5">
        {items.map((o) => {
          const isShown = shown === o.filename || genFilename === o.filename;
          const isSel = selected.has(o.filename);
          return (
            <li key={o.filename}
              className={`group/row flex items-center gap-2 rounded-md px-1.5 py-1 ${isSel ? "bg-primary/10" : isShown ? "bg-muted/60" : "hover:bg-muted/40"}`}>
              <input type="checkbox" className="accent-primary" aria-label={`Select ${o.filename}`} checked={isSel} onChange={() => toggle(o.filename)} />
              <button className="min-w-0 flex-1 text-left" onClick={() => void show(o.filename)} title={isShown ? "Hide from the map" : "Show on the map and zoom to it"}>
                <span title={o.filename} className={`block truncate text-[10px] ${isShown ? "font-medium text-primary" : "text-foreground"}`}>{stem(o.filename)}</span>
                <span className="tabular block text-[9px] text-muted-foreground">{kb(o.size_bytes)}{isShown && " · on the map"}</span>
              </button>
              <span className="flex shrink-0 items-center">
                <button className={`${ICON} ${isShown ? "text-primary" : ""}`} title={isShown ? "Hide from the map" : "Show on the map"} aria-label={`Show ${o.filename}`} onClick={() => void show(o.filename)}><Eye size={11} /></button>
                <button className={ICON} title="Zoom to it" aria-label={`Zoom to ${o.filename}`} onClick={() => void zoomTo(o.filename)}><LocateFixed size={11} /></button>
                <button className={ICON} title="Download GeoJSON" aria-label={`Download ${o.filename}`} onClick={() => void download(o.filename)}><Download size={11} /></button>
                <button className={ICON} title="Copy the Frappe automation format" aria-label={`Copy Frappe format of ${o.filename}`} onClick={() => void copyFrappe(o.filename)}><ClipboardCopy size={11} /></button>
                <a className={ICON} title="Download the Frappe format (.txt)" aria-label={`Download Frappe text of ${o.filename}`} href={api.frappeUrl(o.filename)} download><FileText size={11} /></a>
                <button className={`${ICON} hover:!bg-destructive/10 hover:!text-destructive`} title="Delete" aria-label={`Delete ${o.filename}`} onClick={() => void del(o.filename)}><Trash2 size={11} /></button>
              </span>
            </li>
          );
        })}
      </ul>

      {picked.length > 0 && (
        <div className="sticky bottom-0 mt-2 rounded-md border border-primary/30 bg-card/95 p-2 shadow-lg backdrop-blur">
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-medium text-foreground">{picked.length} selected</span>
            <button className="text-muted-foreground hover:text-primary" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Button size="sm" variant="secondary" className="h-7 text-[10px]" onClick={() => void exportTogether()} title="All the selected outputs in one GeoJSON file">
              <Layers size={11} /> Export as one
            </Button>
            <Button size="sm" variant="secondary" className="h-7 text-[10px]" onClick={() => void exportEach()} title="One GeoJSON file per output, zipped">
              <Files size={11} /> Export each
            </Button>
            <Button size="sm" variant="destructive" className="ml-auto h-7 text-[10px]" onClick={() => void delSelected()}>
              <Trash2 size={11} /> Delete
            </Button>
          </div>
        </div>
      )}

      {note && (
        <p className={`mt-1.5 flex items-center gap-1 text-[10px] ${note.ok ? "text-primary" : "text-destructive"}`}>
          {note.ok && <Check size={11} />} {note.text}
        </p>
      )}
      {!items.length && <p className="text-[10px] text-muted-foreground/70">No saved outputs yet — the Units tab creates them.</p>}
      {items.length > 0 && (
        <p className="mt-2 text-[9px] text-muted-foreground/60">
          <ClipboardCopy size={9} className="inline" /> copies the automation format. For bands/triads, paste it
          into a <strong>Field Unit Automation</strong> with the Block selected and Unit
          Type <strong>Band</strong> — it creates the bands and their triads the same way
          rows and orchard trees are created.
        </p>
      )}
    </SectionCard>
  );
}
