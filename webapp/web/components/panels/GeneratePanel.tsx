"use client";

import { useRef, useState } from "react";
import { Play, Loader2 } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { SectionCard } from "@/components/console/SectionCard";
import { AnimatedNumber } from "@/components/console/AnimatedNumber";
import { StatusBadge, type Status } from "@/components/console/StatusBadge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { api, ApiError } from "@/lib/api/client";
import type { FeatureCollection } from "@/lib/types";
import type { GenParams } from "@/lib/store/appStore";

function summarize(fc: FeatureCollection | null) {
  const beds = new Set<string>();
  const blocks = new Set<string>();
  let zones = 0;
  for (const f of fc?.features ?? []) {
    const p = (f.properties ?? {}) as { kind?: string; bed_id?: string; block_id?: string };
    if (p.kind === "zone") zones++;
    if (p.bed_id) beds.add(p.bed_id);
    if (p.block_id) blocks.add(p.block_id);
  }
  return { beds: beds.size, zones, blocks: blocks.size };
}

function buildBody(polygon: unknown, p: GenParams) {
  const tokens = p.block_end_beds_text.split(",").map((t) => t.trim()).filter(Boolean);
  const body: Record<string, unknown> = {
    polygon,
    bed_spacing: p.bed_spacing,
    zone_length: p.zone_length,
    buffer_m: p.buffer_m,
    direction: p.direction,
    n_blocks: p.n_blocks,
    split_axis: p.split_axis,
    start_corner: p.start_corner,
  };
  if (p.name.trim()) body.name = p.name.trim();
  if (tokens.length && tokens.every((t) => /^\d+-\d+$/.test(t)))
    body.block_bed_ranges = tokens.map((t) => t.split("-").map(Number));
  else if (tokens.length && tokens.every((t) => /^\d+$/.test(t)))
    body.block_end_beds = tokens.map(Number);
  return body;
}

export function GeneratePanel() {
  const hydrated = useHydrated();
  const workingPolygon = useAppStore((s) => s.workingPolygon);
  const genParams = useAppStore((s) => s.genParams);
  const genResult = useAppStore((s) => s.genResult);
  const genFilename = useAppStore((s) => s.genFilename);
  const setGenResult = useAppStore((s) => s.setGenResult);
  const terraceResult = useAppStore((s) => s.terraceResult);
  const fitGeometry = useMapBridge((s) => s.handle?.fitGeometry);

  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState("ready");
  const abortRef = useRef<AbortController | null>(null);

  const summary = summarize(hydrated ? genResult : null);
  const busy = status === "busy";

  const generate = async () => {
    if (!workingPolygon) {
      setStatus("error");
      setMsg("Set a working polygon first (Parameters).");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("busy");
    setMsg("generating…");
    try {
      const body = buildBody(workingPolygon, genParams);
      // Terrace mode: use the computed block polygons instead of equal split.
      const blocks = terraceResult?.block_geojson;
      if (blocks && blocks.length) {
        body.custom_blocks = blocks;
        body.block_start_corners = terraceResult?.metadata.block_start_corners ?? null;
      }
      const { result, filename } = await api.generate(body, controller.signal);
      setGenResult(result, filename);
      fitGeometry?.(workingPolygon);
      const s = summarize(result);
      setStatus("ok");
      setMsg(`${s.beds} beds · ${s.zones} zones`);
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setStatus("idle");
        setMsg("cancelled");
      } else {
        setStatus("error");
        setMsg(e instanceof ApiError ? e.message : "Generation failed.");
      }
    } finally {
      abortRef.current = null;
    }
  };

  const downloadGeoJson = () => {
    if (!genResult) return;
    const blob = new Blob([JSON.stringify(genResult)], { type: "application/geo+json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (genFilename ?? "beds_zones") + ".geojson";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const copyFrappe = async () => {
    if (!genFilename) return;
    const res = await fetch(api.frappeUrl(genFilename));
    await navigator.clipboard.writeText(await res.text());
    setMsg("copied Frappe format");
  };

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-1.5"><Play size={12} /> Generate</span>}
      index="05"
      meta={<StatusBadge status={status}>{msg}</StatusBadge>}
    >
      <div className="flex gap-1.5">
        <Button className="flex-1" onClick={generate} disabled={busy}>
          {busy ? <><Loader2 size={13} className="animate-spin" /> Generating…</> : "Generate beds & zones"}
        </Button>
        {busy && (
          <Button variant="secondary" size="sm" onClick={() => abortRef.current?.abort()}>Cancel</Button>
        )}
      </div>
      {hydrated && !!terraceResult?.block_geojson?.length && (
        <p className="mt-1.5 text-[10px] text-primary/80">
          Terrace mode: using {terraceResult.block_geojson.length} block(s) from the stepped-edge split.
        </p>
      )}

      <Separator className="my-3" />

      <div className="tabular grid grid-cols-3 gap-2 text-center">
        {[
          ["beds", summary.beds, 3],
          ["zones", summary.zones, 0],
          ["blocks", summary.blocks, 2],
        ].map(([k, v, pad]) => (
          <div key={k as string} className="rounded-md border border-border bg-secondary/40 py-2">
            <div className="text-base font-semibold text-primary">
              {v ? <AnimatedNumber value={v as number} pad={pad as number} /> : "—"}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
          </div>
        ))}
      </div>

      {hydrated && genResult && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Button variant="secondary" size="sm" className="h-7 flex-1 text-[11px]" onClick={copyFrappe}>Copy Frappe</Button>
          {genFilename && (
            <a href={api.frappeUrl(genFilename)} download className="flex-1">
              <Button variant="secondary" size="sm" className="h-7 w-full text-[11px]">Frappe .txt</Button>
            </a>
          )}
          <Button variant="secondary" size="sm" className="h-7 flex-1 text-[11px]" onClick={downloadGeoJson}>GeoJSON</Button>
          <Button variant="secondary" size="sm" className="h-7 text-[11px]" onClick={() => { setGenResult(null, null); setStatus("idle"); setMsg("cleared"); }}>Clear</Button>
        </div>
      )}
    </SectionCard>
  );
}
