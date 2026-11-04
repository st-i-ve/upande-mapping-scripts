"use client";

import { useState } from "react";
import { ChevronDown, Slice, Waypoints, X } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { shapeOfGeometry } from "@/lib/units";
import { runTool } from "@/lib/toolActions";

const PRESETS = [0.3, 0.5, 1, 2, 5];
const SEG = "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[10px] transition-colors";

/**
 * The knife's settings, on the map while the knife is out (bottom right, like an
 * operator panel): straight or freehand, and the blade width. The same settings
 * as the Knife card in the Tool tab, so either place works.
 */
export function KnifeHud() {
  const hydrated = useHydrated();
  const mode = useMapBridge((s) => s.knifeMode);
  const handle = useMapBridge((s) => s.handle);
  const width = useAppStore((s) => s.knifeWidth);
  const setWidth = useAppStore((s) => s.setKnifeWidth);
  const working = useAppStore((s) => (hydrated ? s.workingPolygon : null));
  const slice = useAppStore((s) => (hydrated ? s.slice : null));
  useAppStore((s) => s.savedShapes); // re-resolve the working shape's name
  const [open, setOpen] = useState(true);
  if (!mode) return null;

  const target = slice
    ? <>Slicing <strong className="text-foreground">{slice.source}</strong> · {slice.slices.length} segment{slice.slices.length === 1 ? "" : "s"}</>
    : working
      ? <>Cutting <strong className="text-foreground">{shapeOfGeometry(working)?.name ?? "the working polygon"}</strong></>
      : null;

  return (
    <div role="dialog" aria-label="Knife settings"
      className="absolute bottom-[4.5rem] right-3 z-[600] w-64 rounded-lg border border-border bg-popover/92 text-[11px] text-popover-foreground shadow-xl backdrop-blur"
      onDoubleClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="flex flex-1 items-center gap-1.5 text-left font-medium text-foreground">
          <ChevronDown size={12} className={`text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
          Knife
          <span className="font-normal text-muted-foreground">· {mode === "straight" ? "straight" : "freehand"} · {width} m</span>
        </button>
        <button onClick={() => handle?.knifeStop()} aria-label="Put the knife away (Esc)" title="Put the knife away (Esc)"
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-primary/10 hover:text-primary">
          <X size={12} />
        </button>
      </div>

      {open && (
        <div className="space-y-2 border-t border-border/60 px-2.5 pb-2.5 pt-2">
          <div className="flex gap-1 rounded-lg bg-muted/50 p-0.5" role="radiogroup" aria-label="Knife type">
            <button role="radio" aria-checked={mode === "straight"} onClick={() => runTool("knife-straight", true)}
              className={`${SEG} ${mode === "straight" ? "bg-primary/15 text-primary ring-1 ring-primary/40" : "text-muted-foreground hover:text-foreground"}`}>
              <Waypoints size={12} /> Straight <kbd className="font-mono text-[9px] opacity-70">K</kbd>
            </button>
            <button role="radio" aria-checked={mode === "freehand"} onClick={() => runTool("knife-draw", true)}
              className={`${SEG} ${mode === "freehand" ? "bg-primary/15 text-primary ring-1 ring-primary/40" : "text-muted-foreground hover:text-foreground"}`}>
              <Slice size={12} /> Freehand <kbd className="font-mono text-[9px] opacity-70">⇧K</kbd>
            </button>
          </div>

          <div>
            <label className="flex items-center justify-between text-[10px] text-muted-foreground">
              Blade width / gap
              <span className="flex items-center gap-1">
                <input aria-label="Blade width in metres" type="number" step={0.1} min={0.1} value={width}
                  onChange={(e) => { const v = +e.target.value; if (v > 0) setWidth(v); }}
                  className="tabular h-6 w-16 rounded-md border border-border bg-background px-1.5 text-right text-[11px] text-foreground outline-none focus:border-primary/60" />
                m
              </span>
            </label>
            <div className="mt-1.5 flex gap-1">
              {PRESETS.map((p) => (
                <button key={p} onClick={() => setWidth(p)}
                  className={`tabular flex-1 rounded-md border py-0.5 text-[10px] transition-colors ${
                    width === p ? "border-primary/50 bg-primary/15 text-primary" : "border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[10px] leading-snug text-muted-foreground">
            {target ?? <span className="text-amber-500/90">Nothing to cut — double-click a shape to make it the working polygon.</span>}
          </p>
          <p className="text-[9px] leading-snug text-muted-foreground/70">
            {mode === "straight"
              ? "Click points along the cut, click the last one again to cut. Backspace removes a point."
              : "Drag across the shape to cut along the line you draw."}{" "}
            Ctrl+Z undoes a cut · Esc puts the knife away.
          </p>
        </div>
      )}
    </div>
  );
}
