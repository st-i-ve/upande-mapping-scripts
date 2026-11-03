"use client";

import { useState } from "react";
import { PenTool } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { useMapBridge } from "@/lib/map/mapBridge";
import { SectionCard } from "@/components/console/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Save what's been drawn. The drawing tools themselves live on the left rail; this
 * names the result and files it into the folder open in the Browser.
 */
export function ShapeBuilderPanel() {
  const hydrated = useHydrated();
  const drawnGeometry = useAppStore((s) => s.drawnGeometry);
  const addSavedShape = useAppStore((s) => s.addSavedShape);
  const setWorkingPolygon = useAppStore((s) => s.setWorkingPolygon);
  const savedShapes = useAppStore((s) => s.savedShapes);
  const activeFolder = useAppStore((s) => s.activeFolder);
  const [name, setName] = useState("");

  const hasDrawn = hydrated && !!drawnGeometry;
  const taken = new Set(savedShapes.map((s) => s.name.toLowerCase()));
  let n = savedShapes.length + 1;
  while (taken.has(`shape ${n}`)) n++;
  const finalName = name.trim() || `Shape ${n}`;
  const replaces = taken.has(finalName.toLowerCase());

  const save = () => {
    if (!drawnGeometry) return;
    addSavedShape(finalName, drawnGeometry);
    useMapBridge.getState().handle?.clearDrawn(); // the saved copy takes its place
    setName("");
  };

  return (
    <SectionCard title={<span className="inline-flex items-center gap-1.5"><PenTool size={14} /> Save drawing</span>}>
      {hasDrawn ? (
        <>
          <Input placeholder={finalName} value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()} className="h-9" aria-label="Shape name" />
          <p className="mt-1 text-[11px] text-muted-foreground/70">
            Saves into <strong>{activeFolder || "the project root"}</strong>
            {replaces && <span className="text-amber-500"> — replaces the shape already called {finalName}</span>}
          </p>
          <div className="mt-1.5 flex gap-1.5">
            <Button size="sm" className="flex-1" onClick={save}>Save as shape</Button>
            <Button size="sm" variant="secondary" className="flex-1" onClick={() => drawnGeometry && setWorkingPolygon(drawnGeometry)}>
              Use as polygon
            </Button>
          </div>
        </>
      ) : (
        <p className="text-[12px] text-muted-foreground/70">
          Pick a draw tool on the left — pencil, polygon, rectangle — and draw on the map. Name and save it here.
          While drawing a polygon, <strong>Ctrl+Z</strong> takes back the last point.
        </p>
      )}
    </SectionCard>
  );
}
