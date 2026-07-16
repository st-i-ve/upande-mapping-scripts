"use client";

import { useState } from "react";
import { Grid3x3 } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { SectionCard } from "@/components/console/SectionCard";
import { AnimatedNumber } from "@/components/console/AnimatedNumber";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { generateTreeGrid, treeGridToGeoJSON } from "@/lib/geometry/treeGrid";

const selectCls =
  "mt-1 h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs text-foreground outline-none focus-visible:border-ring";

export function TreeGridPanel() {
  const hydrated = useHydrated();
  const drawnGeometry = useAppStore((s) => s.drawnGeometry);
  const workingPolygon = useAppStore((s) => s.workingPolygon);
  const savedShapes = useAppStore((s) => s.savedShapes);
  const treeGrid = useAppStore((s) => s.treeGrid);
  const setTreeGrid = useAppStore((s) => s.setTreeGrid);

  const [treeSpacing, setTreeSpacing] = useState(2);
  const [rowSpacing, setRowSpacing] = useState(4);
  const [majorEdge, setMajorEdge] = useState<"EW" | "NS">("EW");
  const [rotationDeg, setRotationDeg] = useState(0);
  const [masks, setMasks] = useState<Record<string, "inc" | "exc">>({});
  const [err, setErr] = useState("");

  const source = drawnGeometry ?? workingPolygon;
  const count = hydrated ? treeGrid.length : 0;

  const generate = () => {
    if (!source) return setErr("Draw a rectangle or set a working polygon first.");
    const includes = savedShapes.filter((s) => masks[s.name] === "inc").map((s) => s.geometry);
    const excludes = savedShapes.filter((s) => masks[s.name] === "exc").map((s) => s.geometry);
    const { points } = generateTreeGrid(source, { treeSpacing, rowSpacing, majorEdge, rotationDeg, includes, excludes });
    if (!points.length) return setErr("No points fit — check spacing / masks / polygon.");
    setErr("");
    setTreeGrid(points);
  };

  const cycleMask = (name: string) =>
    setMasks((m) => {
      const cur = m[name];
      const next = { ...m };
      if (!cur) next[name] = "inc";
      else if (cur === "inc") next[name] = "exc";
      else delete next[name];
      return next;
    });

  const download = () => {
    const blob = new Blob([JSON.stringify(treeGridToGeoJSON(treeGrid))], { type: "application/geo+json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tree_grid.geojson";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-1.5"><Grid3x3 size={12} /> Tree grid</span>}
      index="06"
      meta={count > 0 ? <span className="tabular text-[9px] text-primary"><AnimatedNumber value={count} /> pts</span> : undefined}
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[9px] text-muted-foreground">
          Tree spacing (m)
          <Input type="number" step={0.1} min={0.1} value={treeSpacing} onChange={(e) => setTreeSpacing(+e.target.value)} className="mt-1 h-8 tabular" />
        </label>
        <label className="text-[9px] text-muted-foreground">
          Row spacing (m)
          <Input type="number" step={0.1} min={0.1} value={rowSpacing} onChange={(e) => setRowSpacing(+e.target.value)} className="mt-1 h-8 tabular" />
        </label>
      </div>
      <label className="mt-2 block text-[9px] text-muted-foreground">
        Rows run along
        <select className={selectCls} value={majorEdge} onChange={(e) => setMajorEdge(e.target.value as "EW" | "NS")}>
          <option value="EW">East–West</option>
          <option value="NS">North–South</option>
        </select>
      </label>
      <div className="mt-2">
        <div className="mb-1 flex justify-between text-[8px] uppercase tracking-wider text-muted-foreground">
          <span>Rotation</span>
          <span className="tabular text-primary">{rotationDeg}°</span>
        </div>
        <Slider
          value={[rotationDeg]}
          min={-90}
          max={90}
          step={1}
          onValueChange={(v) => setRotationDeg(Array.isArray(v) ? v[0] : v)}
        />
      </div>
      {hydrated && savedShapes.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-[8px] uppercase tracking-wider text-muted-foreground">Masks (saved shapes)</div>
          <ul className="space-y-1">
            {savedShapes.map((s) => (
              <li key={s.name} className="flex items-center justify-between gap-2 text-[9px]">
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <button
                  onClick={() => cycleMask(s.name)}
                  className={`rounded-full px-2 py-0.5 text-[8px] font-medium transition-colors ${
                    masks[s.name] === "inc"
                      ? "bg-primary text-primary-foreground"
                      : masks[s.name] === "exc"
                        ? "bg-destructive text-white"
                        : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {masks[s.name] === "inc" ? "include" : masks[s.name] === "exc" ? "exclude" : "off"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {err && <p className="mt-1.5 text-[9px] text-destructive">{err}</p>}
      <div className="mt-2 flex gap-1.5">
        <Button size="sm" className="flex-1" onClick={generate}>Generate grid</Button>
        {count > 0 && (
          <>
            <Button size="sm" variant="secondary" onClick={download}>GeoJSON</Button>
            <Button size="sm" variant="secondary" onClick={() => setTreeGrid([])}>Clear</Button>
          </>
        )}
      </div>
      <p className="mt-2 text-[8px] text-muted-foreground/60">
        Uses the drawn shape (or working polygon) as the boundary. Include/exclude masks come next.
      </p>
    </SectionCard>
  );
}
