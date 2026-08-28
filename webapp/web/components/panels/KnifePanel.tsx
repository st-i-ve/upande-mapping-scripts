"use client";

import { Scissors } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { SectionCard } from "@/components/console/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function KnifePanel() {
  const hydrated = useHydrated();
  const workingPolygon = useAppStore((s) => s.workingPolygon);
  const knifeWidth = useAppStore((s) => s.knifeWidth);
  const setKnifeWidth = useAppStore((s) => s.setKnifeWidth);
  const slice = useAppStore((s) => s.slice);
  const handle = useMapBridge((s) => s.handle);

  const slicing = hydrated ? slice : null;
  // While slicing, the knife cuts the slice set — no working polygon needed.
  const ready = !!handle && (slicing != null || (hydrated && !!workingPolygon));



  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-1.5"><Scissors size={12} /> Knife</span>}
      index="10"
      meta={slicing ? <span className="text-[8px] uppercase tracking-wider text-primary">slicing</span> : undefined}
    >
      {slicing ? (
        <p className="mb-2 text-[9px] text-muted-foreground/70">
          Slicing <strong>{slicing.source}</strong> — cut as many times as you like, changing the
          blade width between cuts. The original is kept; nothing is saved until you finish.
          {slicing.resumedFrom > 0 && (
            <> Picked up its {slicing.resumedFrom} existing slices, so you carry on cutting those.</>
          )}
        </p>
      ) : (
        <p className="mb-2 text-[9px] text-muted-foreground/70">
          Cut the working polygon along a line, leaving a gap the width of the blade.
          Each piece becomes its own saved shape and the working outline clears.
          To slice one saved shape repeatedly, hit <strong>slice</strong> on its row.
        </p>
      )}

      <label className="block text-[9px] text-muted-foreground">
        Blade width / gap (m)
        <Input aria-label="Blade width in metres" type="number" step={0.1} min={0.1} value={knifeWidth} onChange={(e) => setKnifeWidth(+e.target.value)} className="mt-1 h-8 tabular" />
      </label>
      <div className="mt-2 flex gap-1.5">
        <Button size="sm" className="flex-1" disabled={!ready} onClick={() => handle?.knifeStraight()}>Straight cut</Button>
        <Button size="sm" variant="secondary" className="flex-1" disabled={!ready} onClick={() => handle?.knifeFreehand()}>Freehand cut</Button>
      </div>
      <p className="mt-2 text-[8px] text-muted-foreground/60">
        Straight: click points on the map, <strong>Backspace</strong> removes the last one, and
        click the last point again — or double-click — to tie off the cut. The knife stays out,
        so you can start the next cut somewhere else. Freehand: drag across the polygon. The
        pale band shows the blade at its true width.
      </p>
      <p className="mt-1 text-[8px] text-muted-foreground/60">
        The knife stays out for the next cut — press <strong>Esc</strong> (or double-click
        without drawing a path) to put it away.
      </p>

      {slicing && (
        <p className="mt-2.5 rounded-md border border-border/60 bg-muted/30 p-2 text-[9px] text-muted-foreground">
          {slicing.widths.length} cut{slicing.widths.length === 1 ? "" : "s"} ·{" "}
          <strong className="text-foreground">{slicing.slices.length} segments</strong>
          {slicing.widths.length > 0 && (
            <span className="tabular block text-[8px] text-muted-foreground/70">
              {slicing.widths.map((w) => `${w}m`).join(" · ")}
            </span>
          )}
          <span className="mt-1 block">Finish or discard them in <strong>Segments</strong> above.</span>
        </p>
      )}

      {!slicing && !workingPolygon && hydrated && (
        <p className="mt-1.5 text-[9px] text-muted-foreground/60">
          Set a working polygon first — Parameters, or <strong>use</strong> on a saved shape to cut a piece again.
        </p>
      )}
    </SectionCard>
  );
}
