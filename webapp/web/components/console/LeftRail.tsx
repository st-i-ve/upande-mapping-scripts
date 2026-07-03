"use client";

import {
  MapPin, Shapes, PenTool, SlidersHorizontal, Layers, Play, Grid3x3, Archive,
  Mountain, Sun, Ruler, Compass, type LucideIcon,
} from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useSidebar } from "@/components/ui/sidebar";

interface Tool {
  id: string;
  label: string;
  icon: LucideIcon;
}

const TOOLS_2D: Tool[] = [
  { id: "sec-ref", label: "Reference points", icon: MapPin },
  { id: "sec-shapes", label: "Saved shapes", icon: Shapes },
  { id: "sec-build", label: "Shape builder", icon: PenTool },
  { id: "sec-params", label: "Parameters", icon: SlidersHorizontal },
  { id: "sec-terrace", label: "Terrace mode", icon: Layers },
  { id: "sec-generate", label: "Generate", icon: Play },
  { id: "sec-grid", label: "Tree grid", icon: Grid3x3 },
  { id: "sec-outputs", label: "Saved outputs", icon: Archive },
];

// 3D enrolls its own toolset (the interactive controls live in the 3D canvas).
const TOOLS_3D: Tool[] = [
  { id: "3d-terrain", label: "Terrain", icon: Mountain },
  { id: "3d-light", label: "Lighting", icon: Sun },
  { id: "3d-layers", label: "Layers", icon: Layers },
  { id: "3d-measure", label: "Measure", icon: Ruler },
  { id: "3d-orient", label: "Orientation", icon: Compass },
];

/** Fixed vertical tool rail (Photoshop-style), shared by both views. */
export function LeftRail() {
  const view = useAppStore((s) => s.view);
  const { setOpen } = useSidebar();
  const tools = view === "2d" ? TOOLS_2D : TOOLS_3D;

  const activate = (id: string) => {
    setOpen(true);
    if (view === "2d") {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-sidebar/80 py-2">
      {tools.map((t) => (
        <button
          key={t.id}
          onClick={() => activate(t.id)}
          aria-label={t.label}
          title={t.label}
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
        >
          <t.icon size={17} />
        </button>
      ))}
    </nav>
  );
}
