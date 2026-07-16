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
import { generateTriads } from "@/lib/geometry/triad";

export function TriadPanel() {
  const hydrated = useHydrated();
  const drawnGeometry = useAppStore((s) => s.drawnGeometry);
  const workingPolygon = useAppStore((s) => s.workingPolygon);
  const triad = useAppStore((s) => s.triad);
  const setTriad = useAppStore((s) => s.setTriad);

  const [sideLength, setSideLength] = useState(5);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [err, setErr] = useState("");

  const source = drawnGeometry ?? workingPolygon;
  const count = hydrated ? (triad?.features.length ?? 0) : 0;

  const generate = () => {
    if (!source) return setErr("Draw a shape or set a working polygon first.");
    const fc = generateTriads(source, { sideLength, rotationDeg });
    if (!fc.features.length) return setErr("No triangles fit — check side length / polygon.");
    setErr("");
    setTriad(fc);
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
      meta={count > 0 ? <span className="tabular text-[9px] text-primary"><AnimatedNumber value={count} /> triads</span> : undefined}
    >
      <label className="block text-[9px] text-muted-foreground">
        Triangle side (m)
        <Input type="number" step={0.5} min={0.5} value={sideLength} onChange={(e) => setSideLength(+e.target.value)} className="mt-1 h-8 tabular" />
      </label>
      <div className="mt-2">
        <div className="mb-1 flex justify-between text-[8px] uppercase tracking-wider text-muted-foreground">
          <span>Rotation</span>
          <span className="tabular text-primary">{rotationDeg}°</span>
        </div>
        <Slider value={[rotationDeg]} min={-90} max={90} step={1} onValueChange={(v) => setRotationDeg(Array.isArray(v) ? v[0] : v)} />
      </div>
      {err && <p className="mt-1.5 text-[9px] text-destructive">{err}</p>}
      <div className="mt-2 flex gap-1.5">
        <Button size="sm" className="flex-1" onClick={generate}>Generate triads</Button>
        {count > 0 && (
          <>
            <Button size="sm" variant="secondary" onClick={download}>GeoJSON</Button>
            <Button size="sm" variant="secondary" onClick={() => setTriad(null)}>Clear</Button>
          </>
        )}
      </div>
      <p className="mt-2 text-[8px] text-muted-foreground/60">
        Equilateral triangles clipped to the boundary (edge units are partial). Uses the drawn shape or working polygon.
      </p>
    </SectionCard>
  );
}
