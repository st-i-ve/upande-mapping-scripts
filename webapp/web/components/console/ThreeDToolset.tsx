"use client";

import { Box, Mountain, Sun, Info } from "lucide-react";
import { SectionCard } from "./SectionCard";

/**
 * Sidebar content for the 3D view. The interactive 3D controls live inside the
 * MapLibre/three.js canvas today; this panel frames the view and is where
 * ported 3D tools (terrain exaggeration, sun angle, layer toggles) will land.
 */
export function ThreeDToolset() {
  return (
    <div className="space-y-3">
      <SectionCard
        title={<span className="inline-flex items-center gap-1.5"><Box size={12} /> 3D view</span>}
        index="3D"
      >
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Terrain-draped view of the plot. Drag to orbit, scroll to zoom, and use
          the on-canvas panel for layers and elevation.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-1.5">
            <Mountain size={13} className="text-primary" /> Terrain
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-1.5">
            <Sun size={13} className="text-primary" /> Lighting
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title={<span className="inline-flex items-center gap-1.5"><Info size={12} /> Note</span>}
        index="·"
      >
        <p className="text-[11px] leading-relaxed text-muted-foreground/80">
          Native 3D tools (terrain exaggeration, sun angle, per-layer toggles) will
          be ported into this panel in a later pass. Switch back to <strong>2D</strong>
          {" "}above for the full bed / zone / grid toolset.
        </p>
      </SectionCard>
    </div>
  );
}
