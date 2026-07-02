"use client";

import { useState } from "react";
import { Layers, Crosshair } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { SectionCard } from "@/components/console/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api/client";
import type { GeoGeometry } from "@/lib/types";

function outerRing(geom: GeoGeometry | null): [number, number][] | null {
  if (!geom) return null;
  const c = geom.coordinates as unknown;
  if (geom.type === "Polygon") return (c as [number, number][][])[0] ?? null;
  if (geom.type === "MultiPolygon") return (c as [number, number][][][])[0]?.[0] ?? null;
  return null;
}

export function TerracePanel() {
  const hydrated = useHydrated();
  const workingPolygon = useAppStore((s) => s.workingPolygon);
  const startEdge = useAppStore((s) => s.terraceStartEdge);
  const grouping = useAppStore((s) => s.terraceGrouping);
  const result = useAppStore((s) => s.terraceResult);
  const genParams = useAppStore((s) => s.genParams);
  const setStartEdge = useAppStore((s) => s.setTerraceStartEdge);
  const setGrouping = useAppStore((s) => s.setTerraceGrouping);
  const setResult = useAppStore((s) => s.setTerraceResult);
  const clearTerrace = useAppStore((s) => s.clearTerrace);
  const handle = useMapBridge((s) => s.handle);
  const picking = useMapBridge((s) => s.picking);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const run = async (edgeIdx: number, group: string) => {
    if (!workingPolygon) return;
    setBusy(true);
    setErr("");
    try {
      const data = await api.terraceSections({
        polygon: workingPolygon,
        start_edge_idx: edgeIdx,
        grouping: group.trim() || undefined,
        start_corner: genParams.start_corner,
        buffer_m: genParams.buffer_m,
      });
      setResult(data);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Terrace failed.");
    } finally {
      setBusy(false);
    }
  };

  const pickEdge = () => {
    const ring = outerRing(workingPolygon);
    if (!ring) return setErr("Set a working polygon first (Parameters).");
    setErr("");
    handle?.pickEdge(ring, (idx) => {
      if (idx == null) return setErr("No edge near the click — try again.");
      setStartEdge(idx);
      run(idx, grouping);
    });
  };

  const meta = hydrated ? result?.metadata : undefined;

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-1.5"><Layers size={12} /> Terrace mode</span>}
      index="4T"
    >
      <p className="mb-2 text-[11px] text-muted-foreground/70">
        For staircase greenhouses: pick a stepped edge, then group sections into blocks.
      </p>
      <Button
        size="sm"
        variant={picking ? "default" : "secondary"}
        className="w-full"
        disabled={!handle || !workingPolygon}
        onClick={() => (picking ? handle?.cancelPick() : pickEdge())}
      >
        <Crosshair size={13} /> {picking ? "Click a stepped edge…" : "Pick stepped edge"}
      </Button>

      <label className="mt-2 block text-[11px] text-muted-foreground">
        Block grouping (e.g. 1-3, 4, 5-7)
        <Input
          value={grouping}
          onChange={(e) => setGrouping(e.target.value)}
          placeholder="optional — leave blank for one block per section"
          className="mt-1 h-8 tabular"
        />
      </label>

      <div className="mt-1.5 flex gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          className="flex-1"
          disabled={busy || startEdge == null}
          onClick={() => startEdge != null && run(startEdge, grouping)}
        >
          {busy ? "Working…" : "Preview blocks"}
        </Button>
        {meta && (
          <Button size="sm" variant="secondary" onClick={clearTerrace}>Clear</Button>
        )}
      </div>

      {err && <p className="mt-1.5 text-[11px] text-destructive">{err}</p>}
      {meta && (
        <div className="tabular mt-2 rounded-md border border-border bg-secondary/40 px-2 py-1.5 text-[11px] text-muted-foreground">
          edge <span className="text-primary">{startEdge}</span> · {meta.section_count} sections ·{" "}
          <span className="text-primary">{meta.block_count}</span> blocks
          {meta.block_count > 0 && <span className="ml-1 text-primary/80">→ feeds Generate</span>}
        </div>
      )}
    </SectionCard>
  );
}
