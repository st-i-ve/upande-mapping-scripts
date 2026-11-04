"use client";

import { Scissors, Slice, Waypoints } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { runTool } from "@/lib/toolActions";
import { SectionCard } from "@/components/console/SectionCard";
import { BladeWidth } from "@/components/console/BladeWidth";
import { Button } from "@/components/ui/button";

/** The knife's settings — the same ones as its panel on the map. */
export function KnifePanel() {
  const hydrated = useHydrated();
  const slice = useAppStore((s) => s.slice);
  const handle = useMapBridge((s) => s.handle);
  const mode = useMapBridge((s) => s.knifeMode);
  const slicing = hydrated ? slice : null;

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-1.5"><Scissors size={11} /> Knife</span>}
      meta={slicing ? <span className="text-[9px] uppercase tracking-wider text-primary">slicing</span> : undefined}
    >
      <p className="mb-2 text-[10px] text-muted-foreground/70">
        Cut across any shape — it opens a slicing session on that shape, and you can cut it as many
        times as you like, changing the blade width between cuts. <strong>Finish</strong> saves the
        pieces as shapes; the original is always kept. A selected shape, or the working polygon,
        is cut first when the line crosses more than one.
      </p>

      <BladeWidth />
      <div className="mt-2.5 flex gap-1.5">
        <Button size="sm" className="flex-1" variant={mode === "straight" ? "default" : "secondary"} disabled={!handle}
          onClick={() => runTool("knife-straight", true)}>
          <Waypoints size={11} /> Straight <kbd className="font-mono text-[9px] opacity-70">K</kbd>
        </Button>
        <Button size="sm" className="flex-1" variant={mode === "freehand" ? "default" : "secondary"} disabled={!handle}
          onClick={() => runTool("knife-draw", true)}>
          <Slice size={11} /> Freehand <kbd className="font-mono text-[9px] opacity-70">⇧K</kbd>
        </Button>
      </div>
      <p className="mt-2 text-[9px] text-muted-foreground/60">
        Straight: click points on the map, <strong>Backspace</strong> removes the last one, and
        click the last point again — or double-click — to cut. Freehand: drag across the shape.
        The pale band shows the blade at its true width. <strong>Enter</strong> finishes,
        <strong> Esc</strong> puts the knife away.
      </p>

      {slicing && (
        <p className="mt-2.5 rounded-md border border-border/60 bg-muted/30 p-2 text-[10px] text-muted-foreground">
          Slicing <strong className="text-foreground">{slicing.source}</strong> ·{" "}
          {slicing.widths.length} cut{slicing.widths.length === 1 ? "" : "s"} ·{" "}
          <strong className="text-foreground">{slicing.slices.length} pieces</strong>
          {slicing.widths.length > 0 && (
            <span className="tabular block text-[9px] text-muted-foreground/70">
              {slicing.widths.map((w) => `${w}m`).join(" · ")}
            </span>
          )}
          <span className="mt-1 block">Finish or discard them in <strong>Segments</strong> above, or on the map.</span>
        </p>
      )}
    </SectionCard>
  );
}
