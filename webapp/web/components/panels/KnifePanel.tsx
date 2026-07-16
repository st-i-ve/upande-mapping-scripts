"use client";

import { useState } from "react";
import { Scissors } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { SectionCard } from "@/components/console/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cutPolygon } from "@/lib/geometry/knife";

export function KnifePanel() {
  const hydrated = useHydrated();
  const workingPolygon = useAppStore((s) => s.workingPolygon);
  const setWorkingPolygon = useAppStore((s) => s.setWorkingPolygon);
  const handle = useMapBridge((s) => s.handle);
  const fitGeometry = useMapBridge((s) => s.handle?.fitGeometry);

  const [width, setWidth] = useState(1);
  const [pts, setPts] = useState<[number, number][]>([]);
  const [picking, setPicking] = useState(false);
  const [err, setErr] = useState("");

  const hasPoly = hydrated && !!workingPolygon;

  const applyCut = (line: [number, number][]) => {
    if (!workingPolygon) return setErr("Set a working polygon to cut.");
    if (line.length < 2) return setErr("Draw or pick at least 2 points for the cut.");
    const res = cutPolygon(workingPolygon, line, width);
    if (!res) return setErr("Cut failed — check the line crosses the polygon.");
    setWorkingPolygon(res);
    fitGeometry?.(res);
    handle?.knifeStop();
    setPts([]);
    setPicking(false);
    setErr("");
  };

  const drawCut = () => {
    setErr("");
    handle?.knifeFreehand((line) => applyCut(line));
  };
  const pickPoints = () => {
    setErr("");
    setPts([]);
    setPicking(true);
    handle?.knifePointMode((line) => setPts(line));
  };
  const cancel = () => {
    handle?.knifeStop();
    setPts([]);
    setPicking(false);
  };

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-1.5"><Scissors size={12} /> Knife</span>}
      index="10"
    >
      <p className="mb-2 text-[9px] text-muted-foreground/70">
        Cut the working polygon along a line, leaving a gap the width of the blade.
      </p>
      <label className="block text-[9px] text-muted-foreground">
        Blade width / gap (m)
        <Input type="number" step={0.1} min={0.1} value={width} onChange={(e) => setWidth(+e.target.value)} className="mt-1 h-8 tabular" />
      </label>

      <div className="mt-2 flex gap-1.5">
        <Button size="sm" className="flex-1" disabled={!handle || !hasPoly} onClick={drawCut}>Draw cut</Button>
        <Button size="sm" variant={picking ? "default" : "secondary"} className="flex-1" disabled={!handle || !hasPoly} onClick={picking ? cancel : pickPoints}>
          {picking ? "Cancel" : "Pick points"}
        </Button>
      </div>

      {picking && (
        <div className="mt-2 flex items-center gap-2">
          <span className="tabular flex-1 text-[9px] text-muted-foreground">{pts.length} point(s) — click the map</span>
          <Button size="sm" disabled={pts.length < 2} onClick={() => applyCut(pts)}>Apply cut</Button>
        </div>
      )}

      {err && <p className="mt-1.5 text-[9px] text-destructive">{err}</p>}
      {!hasPoly && <p className="mt-1.5 text-[9px] text-muted-foreground/60">Set a working polygon first (Parameters or a saved shape).</p>}
    </SectionCard>
  );
}
