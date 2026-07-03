"use client";

import { useState } from "react";
import { Hexagon, Square, Spline, Move, Eraser, Trash2, PenTool } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { SectionCard } from "@/components/console/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function Tool({ label, onClick, disabled, children }: { label: string; onClick?: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-9 items-center justify-center rounded-md border border-border bg-secondary/40 text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function ShapeBuilderPanel() {
  const hydrated = useHydrated();
  const handle = useMapBridge((s) => s.handle);
  const drawnGeometry = useAppStore((s) => s.drawnGeometry);
  const addSavedShape = useAppStore((s) => s.addSavedShape);
  const setWorkingPolygon = useAppStore((s) => s.setWorkingPolygon);
  const [name, setName] = useState("");

  const hasDrawn = hydrated && !!drawnGeometry;

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-1.5"><PenTool size={12} /> Shape builder</span>}
      index="03"
    >
      <div className="grid grid-cols-6 gap-1.5">
        <Tool label="Draw polygon" disabled={!handle} onClick={() => handle?.draw("Polygon")}><Hexagon size={15} /></Tool>
        <Tool label="Draw rectangle" disabled={!handle} onClick={() => handle?.draw("Rectangle")}><Square size={15} /></Tool>
        <Tool label="Edit vertices" disabled={!handle} onClick={() => handle?.editMode()}><Spline size={15} /></Tool>
        <Tool label="Move" disabled={!handle} onClick={() => handle?.dragMode()}><Move size={15} /></Tool>
        <Tool label="Erase" disabled={!handle} onClick={() => handle?.eraseMode()}><Eraser size={15} /></Tool>
        <Tool label="Clear" disabled={!handle} onClick={() => handle?.clearDrawn()}><Trash2 size={15} /></Tool>
      </div>

      <Input
        placeholder="Shape name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="mt-2.5 h-8"
      />
      <div className="mt-1.5 flex gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          className="flex-1"
          disabled={!hasDrawn}
          onClick={() => {
            if (!drawnGeometry) return;
            addSavedShape(name.trim() || `Shape`, drawnGeometry);
            setName("");
          }}
        >
          Save as shape
        </Button>
        <Button
          size="sm"
          className="flex-1"
          disabled={!hasDrawn}
          onClick={() => drawnGeometry && setWorkingPolygon(drawnGeometry)}
        >
          Use as polygon
        </Button>
      </div>
      <p className="mt-2 text-[8px] text-muted-foreground/60">
        Draw, then save it or send it straight to Generate. Boolean ops (∪ − ∩) land in a later pass.
      </p>
    </SectionCard>
  );
}
