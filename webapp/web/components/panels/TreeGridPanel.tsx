"use client";

import { useState } from "react";
import { Grid3x3 } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { SectionCard } from "@/components/console/SectionCard";
import { AnimatedNumber } from "@/components/console/AnimatedNumber";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateTreeGrid, treeGridToGeoJSON } from "@/lib/geometry/treeGrid";

const selectCls =
  "mt-1 h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs text-foreground outline-none focus-visible:border-ring";

export function TreeGridPanel() {
  const hydrated = useHydrated();
  const drawnGeometry = useAppStore((s) => s.drawnGeometry);
  const workingPolygon = useAppStore((s) => s.workingPolygon);
  const treeGrid = useAppStore((s) => s.treeGrid);
  const setTreeGrid = useAppStore((s) => s.setTreeGrid);

  const [treeSpacing, setTreeSpacing] = useState(2);
  const [rowSpacing, setRowSpacing] = useState(4);
  const [majorEdge, setMajorEdge] = useState<"EW" | "NS">("EW");
  const [err, setErr] = useState("");

  const source = drawnGeometry ?? workingPolygon;
  const count = hydrated ? treeGrid.length : 0;

  const generate = () => {
    if (!source) return setErr("Draw a rectangle or set a working polygon first.");
    const { points } = generateTreeGrid(source, { treeSpacing, rowSpacing, majorEdge });
    if (!points.length) return setErr("No points fit — check spacing / polygon.");
    setErr("");
    setTreeGrid(points);
  };

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
      meta={count > 0 ? <span className="tabular text-[11px] text-primary"><AnimatedNumber value={count} /> pts</span> : undefined}
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-muted-foreground">
          Tree spacing (m)
          <Input type="number" step={0.1} min={0.1} value={treeSpacing} onChange={(e) => setTreeSpacing(+e.target.value)} className="mt-1 h-8 tabular" />
        </label>
        <label className="text-[11px] text-muted-foreground">
          Row spacing (m)
          <Input type="number" step={0.1} min={0.1} value={rowSpacing} onChange={(e) => setRowSpacing(+e.target.value)} className="mt-1 h-8 tabular" />
        </label>
      </div>
      <label className="mt-2 block text-[11px] text-muted-foreground">
        Rows run along
        <select className={selectCls} value={majorEdge} onChange={(e) => setMajorEdge(e.target.value as "EW" | "NS")}>
          <option value="EW">East–West</option>
          <option value="NS">North–South</option>
        </select>
      </label>
      {err && <p className="mt-1.5 text-[11px] text-destructive">{err}</p>}
      <div className="mt-2 flex gap-1.5">
        <Button size="sm" className="flex-1" onClick={generate}>Generate grid</Button>
        {count > 0 && (
          <>
            <Button size="sm" variant="secondary" onClick={download}>GeoJSON</Button>
            <Button size="sm" variant="secondary" onClick={() => setTreeGrid([])}>Clear</Button>
          </>
        )}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground/60">
        Uses the drawn shape (or working polygon) as the boundary. Rotation &amp; masks come next.
      </p>
    </SectionCard>
  );
}
