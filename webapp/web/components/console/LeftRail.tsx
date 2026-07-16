"use client";

import { useState } from "react";
import {
  MousePointer2, Hexagon, Square, Spline, Move, Eraser, Trash2,
  Mountain, Sun, Layers, Ruler, Compass, type LucideIcon,
} from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge, type MapHandle } from "@/lib/map/mapBridge";

interface Tool {
  id: string;
  label: string;
  icon: LucideIcon;
  run: (h: MapHandle) => void;
  /** momentary (fires + clears active) vs sticky (stays highlighted). */
  momentary?: boolean;
}

const TOOLS_2D: Tool[] = [
  { id: "select", label: "Select / pan", icon: MousePointer2, run: (h) => h.stopModes() },
  { id: "polygon", label: "Draw polygon", icon: Hexagon, run: (h) => h.draw("Polygon") },
  { id: "rect", label: "Draw rectangle", icon: Square, run: (h) => h.draw("Rectangle") },
  { id: "edit", label: "Edit vertices", icon: Spline, run: (h) => h.editMode() },
  { id: "move", label: "Move", icon: Move, run: (h) => h.dragMode() },
  { id: "erase", label: "Erase", icon: Eraser, run: (h) => h.eraseMode() },
  { id: "clear", label: "Clear drawing", icon: Trash2, run: (h) => h.clearDrawn(), momentary: true },
];

// 3D enrolls its own toolset (interactive controls live in the 3D canvas).
const TOOLS_3D = [
  { id: "3d-terrain", label: "Terrain", icon: Mountain },
  { id: "3d-light", label: "Lighting", icon: Sun },
  { id: "3d-layers", label: "Layers", icon: Layers },
  { id: "3d-measure", label: "Measure", icon: Ruler },
  { id: "3d-orient", label: "Orientation", icon: Compass },
];

/** Fixed vertical tool palette (Photoshop-style). 2D tools are wired to the map. */
export function LeftRail() {
  const view = useAppStore((s) => s.view);
  const handle = useMapBridge((s) => s.handle);
  const [active, setActive] = useState("select");

  if (view === "3d") {
    return (
      <nav className="flex w-12 shrink-0 flex-col items-center gap-1 py-2">
        {TOOLS_3D.map((t) => (
          <span
            key={t.id}
            title={`${t.label} (in 3D canvas)`}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground/50"
          >
            <t.icon size={17} />
          </span>
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex w-12 shrink-0 flex-col items-center gap-1 py-2">
      {TOOLS_2D.map((t) => (
        <button
          key={t.id}
          onClick={() => {
            if (!handle) return;
            t.run(handle);
            if (!t.momentary) setActive(t.id);
          }}
          aria-label={t.label}
          title={t.label}
          aria-pressed={active === t.id}
          disabled={!handle}
          className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
            active === t.id && !t.momentary
              ? "bg-primary/15 text-primary ring-1 ring-primary/40"
              : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
          }`}
        >
          <t.icon size={17} />
        </button>
      ))}
    </nav>
  );
}
