"use client";

import { useState } from "react";
import { Hexagon, Download, Save, X } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { SectionCard } from "@/components/console/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { generateTriads, type BandDirection } from "@/lib/geometry/triad";
import { api } from "@/lib/api/client";
import { downloadGeoJson } from "@/lib/exportGeo";
import type { FeatureCollection } from "@/lib/types";

/**
 * Hexagons as units in their own right — the same pointy-top grid the triads are
 * cut from, without splitting each hexagon into its six triangles. Numbered by
 * band like the triads, clipped to the boundary (edge hexagons are partial).
 */
export function HexPanel() {
  const hydrated = useHydrated();
  const drawnGeometry = useAppStore((s) => s.drawnGeometry);
  const workingPolygon = useAppStore((s) => s.workingPolygon);
  const hexes = useAppStore((s) => s.triadHexes);
  const triad = useAppStore((s) => s.triad);
  const selected = useAppStore((s) => s.selectedShapes);
  const savedShapes = useAppStore((s) => s.savedShapes);
  const setTriad = useAppStore((s) => s.setTriad);
  const setTriadHexes = useAppStore((s) => s.setTriadHexes);
  const fitGeometry = useMapBridge((s) => s.handle?.fitGeometry);

  const [sideLength, setSideLength] = useState(5);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [bandDirection, setBandDirection] = useState<BandDirection>("north-south");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Hexagons on the map without triads = this panel's preview (not the triad one's outlines).
  const preview = hydrated && hexes && !triad ? (hexes as FeatureCollection) : null;
  const count = preview?.features.length ?? 0;
  const bands = new Set((preview?.features ?? []).map((f) => (f.properties as { band?: number }).band)).size;
  const source = drawnGeometry ?? workingPolygon;
  const opts = { sideLength, rotationDeg, bandDirection };

  const generate = () => {
    if (!source) return setMsg({ ok: false, text: "Draw a shape or set a working polygon first." });
    const { hexagons } = generateTriads(source, opts);
    if (!hexagons.features.length) return setMsg({ ok: false, text: "No hexagons fit — check the size or the polygon." });
    setTriad(null);
    setTriadHexes(hexagons);
    setMsg(null);
    fitGeometry?.(source);
  };

  /** One output per selected shape, each named after its shape. */
  const generateSelected = async () => {
    setBusy(true);
    setMsg(null);
    let made = 0;
    try {
      for (const name of selected) {
        const shape = savedShapes.find((s) => s.name === name);
        if (!shape) continue;
        await new Promise((r) => setTimeout(r, 30)); // let the progress paint between shapes
        const { hexagons } = generateTriads(shape.geometry, opts);
        if (!hexagons.features.length) continue;
        await api.saveOutput(`${name} hexagons`, hexagons);
        made++;
      }
      setMsg({ ok: true, text: `Saved ${made} hexagon output${made === 1 ? "" : "s"} — see Saved outputs on the Export tab.` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const { filename } = await api.saveOutput("hexagons", preview);
      setMsg({ ok: true, text: `Saved as ${filename}` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-1.5"><Hexagon size={14} /> Hexagons</span>}
      meta={count > 0 ? <span className="tabular text-[12px] text-primary">{count} hexagons · {bands} bands</span> : undefined}
    >
      <label className="block text-[12px] text-muted-foreground">
        Hexagon size (side, m)
        <Input type="number" step={0.5} min={0.5} value={sideLength} onChange={(e) => setSideLength(+e.target.value)} className="mt-1 h-9 tabular" />
      </label>
      <div className="mt-2">
        <div className="mb-1 flex justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
          <span>Rotation</span>
          <span className="tabular text-primary">{rotationDeg}°</span>
        </div>
        <Slider value={[rotationDeg]} min={-90} max={90} step={1} onValueChange={(v) => setRotationDeg(Array.isArray(v) ? v[0] : v)} />
      </div>
      <label className="mt-2 block text-[12px] text-muted-foreground">
        Bands numbered
        <select aria-label="Hexagon band direction" value={bandDirection} onChange={(e) => setBandDirection(e.target.value as BandDirection)}
          className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-2 text-[13px]">
          <option value="north-south">North → south</option>
          <option value="south-north">South → north</option>
        </select>
      </label>

      <div className="mt-2.5 flex gap-1.5">
        <Button size="sm" className="flex-1" onClick={generate}>Generate from working polygon</Button>
        {count > 0 && (
          <>
            <Button size="sm" variant="secondary" disabled={busy} onClick={save} title="Save to Saved outputs"><Save size={14} /></Button>
            <Button size="sm" variant="secondary" onClick={() => preview && downloadGeoJson(preview, "hexagons")} title="Download GeoJSON"><Download size={14} /></Button>
            <Button size="sm" variant="secondary" onClick={() => setTriadHexes(null)} title="Clear from the map"><X size={14} /></Button>
          </>
        )}
      </div>
      {selected.length > 0 && (
        <Button size="sm" variant="secondary" className="mt-1.5 w-full" disabled={busy} onClick={generateSelected}>
          {busy ? "Generating…" : `Generate for the ${selected.length} selected shape${selected.length === 1 ? "" : "s"}`}
        </Button>
      )}
      {msg && <p className={`mt-1.5 text-[12px] ${msg.ok ? "text-primary" : "text-destructive"}`}>{msg.text}</p>}
      <p className="mt-2 text-[11px] text-muted-foreground/60">
        Whole hexagons as units, grouped into bands and clipped to the boundary. Each
        hexagon is 6 triads — use <strong>Triads</strong> for the split version.
      </p>
    </SectionCard>
  );
}
