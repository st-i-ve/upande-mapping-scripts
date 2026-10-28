"use client";

import { useState } from "react";
import { Check, CircleDashed, PieChart, RotateCw, X } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { SectionCard } from "@/components/console/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { pivotCircle, pivotSlices } from "@/lib/geometry/pivot";

/**
 * Pivot layout — draw the pivot circle on the map (click the centre, move out,
 * click the edge), then set the slices, path and machinery centre while the map
 * previews the cut live. Rotate until the paths sit on the ones on the ground.
 * Confirming saves the circle and opens a slicing session on it, so the blocks
 * are named and saved through Segments like any other slice.
 */
export function PivotPanel() {
  const hydrated = useHydrated();
  const pivot = useAppStore((s) => s.pivot);
  const setPivot = useAppStore((s) => s.setPivot);
  const settings = useAppStore((s) => s.pivotSettings);
  const setSettings = useAppStore((s) => s.setPivotSettings);
  const savedShapes = useAppStore((s) => s.savedShapes);
  const addSavedShape = useAppStore((s) => s.addSavedShape);
  const startSlice = useAppStore((s) => s.startSlice);
  const applySlice = useAppStore((s) => s.applySlice);
  const handle = useMapBridge((s) => s.handle);
  const armed = useMapBridge((s) => s.knifeArmed);

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const draft = hydrated ? pivot : null;
  const { count, pathM, centerRadiusM, rotation, clockwise } = settings;

  const taken = new Set(savedShapes.map((s) => s.name.toLowerCase()));
  let free = 1;
  while (taken.has(`pivot ${free}`)) free++;
  const finalName = name.trim() || `Pivot ${free}`;
  const clash = taken.has(finalName.toLowerCase());

  const draw = () => {
    setError(null);
    handle?.pivotDraw();
  };

  const confirm = () => {
    if (!draft || clash) return;
    const circle = pivotCircle(draft.center, draft.radiusM);
    const pieces = pivotSlices(circle, {
      center: draft.center, count, pathM, centerRadiusM, startBearing: rotation, clockwise,
    });
    if (!pieces) {
      setError("Nothing left to slice — the centre radius covers the whole pivot.");
      return;
    }
    addSavedShape(finalName, circle);
    startSlice(finalName);
    applySlice(pieces, pathM);
    setPivot(null);
    setName("");
    handle?.fitGeometry(circle);
  };

  const num = (key: keyof typeof settings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSettings({ [key]: +e.target.value });
  const ha = draft ? (Math.PI * draft.radiusM ** 2) / 10_000 : 0;

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-1.5"><PieChart size={12} /> Pivot</span>}
      index="11"
      meta={draft ? <span className="text-[8px] uppercase tracking-wider text-primary">preview</span> : undefined}
    >
      {!draft ? (
        <>
          <p className="mb-2 text-[9px] text-muted-foreground/70">
            Lay out a centre pivot and cut it into blocks like a pizza. Click the pivot&apos;s
            centre on the map, move out to its edge, and click again to fix the circle.
          </p>
          <Button size="sm" className="w-full" disabled={!handle} onClick={draw}>
            <CircleDashed size={12} /> {armed ? "Click the centre, then the edge…" : "Draw pivot circle"}
          </Button>
          <p className="mt-1.5 text-[8px] text-muted-foreground/60">
            <strong>Esc</strong> puts the tool away.
          </p>
        </>
      ) : (
        <>
          <p className="mb-2 text-[9px] text-muted-foreground/70">
            The map shows the cut as it will be made. Turn it until the paths line up with
            the ones on the ground, then confirm.
          </p>

          <div className="grid grid-cols-2 gap-1.5">
            <label className="block text-[9px] text-muted-foreground">
              Slices
              <Input aria-label="Number of slices" type="number" min={1} step={1} value={count} onChange={num("count")} className="mt-1 h-8 tabular" />
            </label>
            <label className="block text-[9px] text-muted-foreground">
              Path size (m)
              <Input aria-label="Path size in metres" type="number" min={0} step={0.5} value={pathM} onChange={num("pathM")} className="mt-1 h-8 tabular" />
            </label>
            <label className="block text-[9px] text-muted-foreground">
              Centre radius (m)
              <Input aria-label="Centre radius in metres" type="number" min={0} step={1} value={centerRadiusM} onChange={num("centerRadiusM")} className="mt-1 h-8 tabular" />
            </label>
            <label className="block text-[9px] text-muted-foreground">
              Pivot radius (m)
              <Input aria-label="Pivot radius in metres" type="number" min={1} step={1}
                value={Math.round(draft.radiusM * 10) / 10}
                onChange={(e) => +e.target.value > 0 && setPivot({ ...draft, radiusM: +e.target.value })}
                className="mt-1 h-8 tabular" />
            </label>
          </div>

          <div className="mt-2.5">
            <div className="flex items-center justify-between text-[9px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><RotateCw size={10} /> Rotation</span>
              <Input aria-label="Rotation in degrees" type="number" step={1} value={rotation}
                onChange={(e) => setSettings({ rotation: ((+e.target.value % 360) + 360) % 360 })}
                className="h-6 w-16 text-right tabular" />
            </div>
            <Slider value={[rotation]} min={0} max={359} step={1} className="mt-1.5"
              onValueChange={(v) => setSettings({ rotation: Array.isArray(v) ? v[0] : v })} />
          </div>

          <label className="mt-2.5 flex items-center justify-between text-[9px] text-muted-foreground">
            Number clockwise
            <Switch checked={clockwise} onCheckedChange={(c) => setSettings({ clockwise: c })} aria-label="Number slices clockwise" />
          </label>

          <label className="mt-2 block text-[9px] text-muted-foreground">
            Name
            <Input aria-label="Pivot name" placeholder={`Pivot ${free}`} value={name}
              onChange={(e) => setName(e.target.value)}
              className={`mt-1 h-8 ${clash ? "border-destructive" : ""}`} />
          </label>
          {clash && <p className="mt-0.5 text-[9px] text-destructive">A saved shape is already called {finalName}.</p>}

          <p className="tabular mt-2 text-[8px] text-muted-foreground/60">
            {draft.radiusM.toFixed(1)} m radius · {ha.toFixed(2)} ha · {count} slice{count === 1 ? "" : "s"}
          </p>

          <div className="mt-2 flex gap-1.5">
            <Button size="sm" className="flex-1" disabled={clash} onClick={confirm}>
              <Check size={12} /> Confirm {finalName}
            </Button>
            <Button size="sm" variant="secondary" className="h-8" onClick={draw} title="Draw the circle again">
              <CircleDashed size={12} />
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setPivot(null)} title="Discard this pivot">
              <X size={12} />
            </Button>
          </div>
          {error && <p className="mt-1.5 text-[9px] text-destructive">{error}</p>}
          <p className="mt-1.5 text-[8px] text-muted-foreground/60">
            Confirming saves the circle and opens its slices in <strong>Segments</strong>, where
            you name the blocks and finish.
          </p>
        </>
      )}
    </SectionCard>
  );
}
