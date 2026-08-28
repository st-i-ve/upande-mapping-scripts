"use client";

import { useState } from "react";
import { Triangle } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { SectionCard } from "@/components/console/SectionCard";
import { AnimatedNumber } from "@/components/console/AnimatedNumber";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { generateTriads, type BandDirection, type TriadDirection } from "@/lib/geometry/triad";

export function TriadPanel() {
  const hydrated = useHydrated();
  const drawnGeometry = useAppStore((s) => s.drawnGeometry);
  const workingPolygon = useAppStore((s) => s.workingPolygon);
  const triad = useAppStore((s) => s.triad);
  const setTriad = useAppStore((s) => s.setTriad);
  const setTriadHexes = useAppStore((s) => s.setTriadHexes);

  const [sideLength, setSideLength] = useState(5);
  const [rotationDeg, setRotationDeg] = useState(0);
  // Which end the numbering starts from — bands run north→south by default and
  // triads west→east, matching how the blocks are walked on the ground.
  const [bandDirection, setBandDirection] = useState<BandDirection>("north-south");
  const [triadDirection, setTriadDirection] = useState<TriadDirection>("west-east");
  const [err, setErr] = useState("");

  const source = drawnGeometry ?? workingPolygon;
  const count = hydrated ? (triad?.features.length ?? 0) : 0;
  const bandCount = hydrated
    ? new Set((triad?.features ?? []).map((f) => (f.properties as { band?: number }).band)).size
    : 0;

  const generate = () => {
    if (!source) return setErr("Draw a shape or set a working polygon first.");
    const { triads, hexagons } = generateTriads(source, {
      sideLength, rotationDeg, bandDirection, triadDirection,
    });
    if (!triads.features.length) return setErr("No triangles fit — check side length / polygon.");
    setErr("");
    setTriad(triads);
    setTriadHexes(hexagons);
  };

  const download = () => {
    if (!triad) return;
    const blob = new Blob([JSON.stringify(triad)], { type: "application/geo+json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "triads.geojson";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-1.5"><Triangle size={12} /> Triad</span>}
      index="09"
      meta={count > 0 ? <span className="tabular text-[9px] text-primary"><AnimatedNumber value={count} /> triads · {bandCount} bands</span> : undefined}
    >
      <label className="block text-[9px] text-muted-foreground">
        Hexagon size (triangle side, m)
        <Input type="number" step={0.5} min={0.5} value={sideLength} onChange={(e) => setSideLength(+e.target.value)} className="mt-1 h-8 tabular" />
      </label>
      <div className="mt-2">
        <div className="mb-1 flex justify-between text-[8px] uppercase tracking-wider text-muted-foreground">
          <span>Rotation</span>
          <span className="tabular text-primary">{rotationDeg}°</span>
        </div>
        <Slider value={[rotationDeg]} min={-90} max={90} step={1} onValueChange={(v) => setRotationDeg(Array.isArray(v) ? v[0] : v)} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block text-[9px] text-muted-foreground">
          Bands numbered
          <select
            aria-label="Band direction"
            value={bandDirection}
            onChange={(e) => setBandDirection(e.target.value as BandDirection)}
            className="mt-1 h-8 w-full rounded-md border border-input bg-transparent px-2 text-[10px]"
          >
            <option value="north-south">North → south</option>
            <option value="south-north">South → north</option>
          </select>
        </label>
        <label className="block text-[9px] text-muted-foreground">
          Triads numbered
          <select
            aria-label="Triad direction"
            value={triadDirection}
            onChange={(e) => setTriadDirection(e.target.value as TriadDirection)}
            className="mt-1 h-8 w-full rounded-md border border-input bg-transparent px-2 text-[10px]"
          >
            <option value="west-east">West → east</option>
            <option value="east-west">East → west</option>
            <option value="north-south">North → south</option>
          </select>
        </label>
      </div>
      {err && <p className="mt-1.5 text-[9px] text-destructive">{err}</p>}
      <div className="mt-2 flex gap-1.5">
        <Button size="sm" className="flex-1" onClick={generate}>Generate triads</Button>
        {count > 0 && (
          <>
            <Button size="sm" variant="secondary" onClick={download}>GeoJSON</Button>
            <Button size="sm" variant="secondary" onClick={() => { setTriad(null); setTriadHexes(null); }}>Clear</Button>
          </>
        )}
      </div>
      <p className="mt-2 text-[8px] text-muted-foreground/60">
        Hexagonal grid — 6 equilateral triads per hexagon, grouped into bands (the
        row-equivalent unit), clipped to the boundary (edge units are partial).
        Bands number from 1 within each block and triads from 1 within each band,
        which is what the ERP names <strong>Band N</strong> and
        <strong> Triad N</strong> from. Uses the drawn shape or working polygon.
      </p>
    </SectionCard>
  );
}
