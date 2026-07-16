"use client";

import { useState } from "react";
import { Scissors } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { SectionCard } from "@/components/console/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cutPolygon, explodePolygons } from "@/lib/geometry/knife";

export function KnifePanel() {
  const hydrated = useHydrated();
  const workingPolygon = useAppStore((s) => s.workingPolygon);
  const setWorkingPolygon = useAppStore((s) => s.setWorkingPolygon);
  const savedShapes = useAppStore((s) => s.savedShapes);
  const addSavedShape = useAppStore((s) => s.addSavedShape);
  const handle = useMapBridge((s) => s.handle);
  const fitGeometry = useMapBridge((s) => s.handle?.fitGeometry);

  const [width, setWidth] = useState(1);
  const [pts, setPts] = useState<[number, number][]>([]);
  const [picking, setPicking] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const hasPoly = hydrated && !!workingPolygon;

  const applyCut = (line: [number, number][]) => {
    if (!workingPolygon) return setErr("Set a working polygon to cut.");
    if (line.length < 2) return setErr("Draw or pick at least 2 points for the cut.");
    const res = cutPolygon(workingPolygon, line, width);
    if (!res) return setErr("Cut failed — check the line crosses the polygon.");
    // Divide into separate polygons — each cut piece becomes its own shape.
    const pieces = explodePolygons(res);
    const base = savedShapes.length;
    pieces.forEach((g, i) => addSavedShape(`Cut ${base + i + 1}`, g));
    setWorkingPolygon(pieces[0] ?? res); // working polygon = first piece (a single polygon)
    fitGeometry?.(res);
    handle?.knifeStop();
    setPts([]);
    setPicking(false);
    setErr("");
    setNote(`Divided into ${pieces.length} shape(s) → Saved shapes.`);
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
      {note && !err && <p className="mt-1.5 text-[9px] text-primary/80">{note}</p>}
      {!hasPoly && <p className="mt-1.5 text-[9px] text-muted-foreground/60">Set a working polygon first (Parameters or a saved shape).</p>}
    </SectionCard>
  );
}
