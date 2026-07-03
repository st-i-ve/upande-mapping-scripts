"use client";

import { useState } from "react";
import { SlidersHorizontal, Check, X } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { SectionCard } from "@/components/console/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { GeoGeometry } from "@/lib/types";

const selectCls =
  "mt-1 h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs text-foreground outline-none focus-visible:border-ring";

function parsePolygon(raw: string): GeoGeometry | null {
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    return null;
  }
  const o = j as Record<string, unknown>;
  if (o?.type === "FeatureCollection" && Array.isArray(o.features))
    return (o.features[0] as { geometry?: GeoGeometry })?.geometry ?? null;
  if (o?.type === "Feature") return (o.geometry as GeoGeometry) ?? null;
  if (typeof o?.type === "string" && "coordinates" in o) return o as unknown as GeoGeometry;
  return null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[9px] text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

export function ParametersPanel() {
  const hydrated = useHydrated();
  const workingPolygon = useAppStore((s) => s.workingPolygon);
  const setWorkingPolygon = useAppStore((s) => s.setWorkingPolygon);
  const p = useAppStore((s) => s.genParams);
  const setGenParams = useAppStore((s) => s.setGenParams);
  const fitGeometry = useMapBridge((s) => s.handle?.fitGeometry);
  const [paste, setPaste] = useState("");
  const [err, setErr] = useState("");

  const usePasted = () => {
    const geom = parsePolygon(paste);
    if (!geom) return setErr("Not a valid Polygon / Feature / FeatureCollection.");
    setWorkingPolygon(geom);
    setErr("");
    setPaste("");
    fitGeometry?.(geom);
  };

  const hasPoly = hydrated && !!workingPolygon;

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-1.5"><SlidersHorizontal size={12} /> Parameters</span>}
      index="04"
    >
      {/* Working polygon source */}
      <div className="mb-3 rounded-md border border-border bg-secondary/30 p-2">
        <div className="flex items-center justify-between text-[9px]">
          <span className="text-muted-foreground">Working polygon</span>
          {hasPoly ? (
            <span className="inline-flex items-center gap-1 text-primary"><Check size={12} /> set</span>
          ) : (
            <span className="text-muted-foreground/60">none</span>
          )}
        </div>
        <Textarea
          placeholder='Paste a Polygon, or click "use" on a saved shape'
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          className="mt-1.5 h-14 font-mono text-[9px]"
        />
        {err && <p className="mt-1 text-[9px] text-destructive">{err}</p>}
        <div className="mt-1.5 flex gap-1.5">
          <Button size="sm" variant="secondary" className="flex-1" onClick={usePasted}>Use pasted</Button>
          {hasPoly && (
            <Button size="sm" variant="secondary" onClick={() => setWorkingPolygon(null)} aria-label="Clear polygon"><X size={13} /></Button>
          )}
        </div>
      </div>

      <Field label="Plot name">
        <Input value={p.name} onChange={(e) => setGenParams({ name: e.target.value })} placeholder="e.g. Kapkolia GH 18" className="mt-1 h-8" />
      </Field>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Field label="Blocks">
          <Input type="number" min={1} max={20} value={p.n_blocks} onChange={(e) => setGenParams({ n_blocks: Math.max(1, +e.target.value || 1) })} className="mt-1 h-8 tabular" />
        </Field>
        <Field label="Cut across">
          <select className={selectCls} value={p.split_axis} onChange={(e) => setGenParams({ split_axis: e.target.value as never })}>
            <option value="none">No split</option>
            <option value="longest">Longest edge</option>
            <option value="shortest">Shortest edge</option>
          </select>
        </Field>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Field label="Bed orientation">
          <select className={selectCls} value={p.direction} onChange={(e) => setGenParams({ direction: e.target.value as never })}>
            <option value="along_long_axis">Along long axis</option>
            <option value="across_long_axis">Across long axis</option>
          </select>
        </Field>
        <Field label="Start corner">
          <select className={selectCls} value={p.start_corner} onChange={(e) => setGenParams({ start_corner: e.target.value as never })}>
            <option value="NW">NW</option><option value="NE">NE</option>
            <option value="SW">SW</option><option value="SE">SE</option>
          </select>
        </Field>
      </div>

      <Field label="Per-block bed numbering (e.g. 50, 95 or 1-50, 200-244)">
        <Input value={p.block_end_beds_text} onChange={(e) => setGenParams({ block_end_beds_text: e.target.value })} placeholder="optional" className="mt-1 h-8 tabular" />
      </Field>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <Field label="Buffer (m)">
          <Input type="number" step={0.05} min={0} value={p.buffer_m} onChange={(e) => setGenParams({ buffer_m: +e.target.value })} className="mt-1 h-8 tabular" />
        </Field>
        <Field label="Zone len (m)">
          <Input type="number" step={0.5} min={0.5} value={p.zone_length} onChange={(e) => setGenParams({ zone_length: +e.target.value })} className="mt-1 h-8 tabular" />
        </Field>
        <Field label="Bed sp. (m)">
          <Input type="number" step={0.1} min={0.1} value={p.bed_spacing} onChange={(e) => setGenParams({ bed_spacing: +e.target.value })} className="mt-1 h-8 tabular" />
        </Field>
      </div>
    </SectionCard>
  );
}
