"use client";

import { Scissors } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { SectionCard } from "@/components/console/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function KnifePanel() {
  const hydrated = useHydrated();
  const workingPolygon = useAppStore((s) => s.workingPolygon);
  const knifeWidth = useAppStore((s) => s.knifeWidth);
  const setKnifeWidth = useAppStore((s) => s.setKnifeWidth);
  const handle = useMapBridge((s) => s.handle);

  const hasPoly = hydrated && !!workingPolygon;
  const ready = !!handle && hasPoly;

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-1.5"><Scissors size={12} /> Knife</span>}
      index="10"
    >
      <p className="mb-2 text-[9px] text-muted-foreground/70">
        Cut the working polygon along a line, leaving a gap the width of the blade.
        Each piece becomes its own shape. Also on the left tool rail.
      </p>
      <label className="block text-[9px] text-muted-foreground">
        Blade width / gap (m)
        <Input type="number" step={0.1} min={0.1} value={knifeWidth} onChange={(e) => setKnifeWidth(+e.target.value)} className="mt-1 h-8 tabular" />
      </label>
      <div className="mt-2 flex gap-1.5">
        <Button size="sm" className="flex-1" disabled={!ready} onClick={() => handle?.knifeStraight()}>Straight cut</Button>
        <Button size="sm" variant="secondary" className="flex-1" disabled={!ready} onClick={() => handle?.knifeFreehand()}>Freehand cut</Button>
      </div>
      <p className="mt-2 text-[8px] text-muted-foreground/60">
        Straight: click points on the map, double-click to finish. Freehand: drag across the polygon.
      </p>
      {!hasPoly && <p className="mt-1.5 text-[9px] text-muted-foreground/60">Set a working polygon first (Parameters or a saved shape).</p>}
    </SectionCard>
  );
}
