"use client";

import { useState } from "react";
import { Check, ChevronDown, Redo2, Slice, Undo2, Waypoints, X } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { runTool } from "@/lib/toolActions";
import { finishSlicing, discardSlicing } from "@/lib/shapeActions";
import { BladeWidth } from "@/components/console/BladeWidth";

const SEG = "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[10px] transition-colors";
const SMALL = "flex h-7 w-7 items-center justify-center rounded-md border border-border/70 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:pointer-events-none disabled:opacity-35";

/**
 * The knife's settings and its slicing session, on the map while the knife is
 * out (bottom right, like an operator panel). Every cut goes into a session on
 * the shape it crosses; Finish saves the pieces, the original is kept.
 */
export function KnifeHud() {
  const hydrated = useHydrated();
  const mode = useMapBridge((s) => s.knifeMode);
  const handle = useMapBridge((s) => s.handle);
  const width = useAppStore((s) => s.knifeWidth);
  const slice = useAppStore((s) => (hydrated ? s.slice : null));
  const undoSlice = useAppStore((s) => s.undoSlice);
  const redoSlice = useAppStore((s) => s.redoSlice);
  const [open, setOpen] = useState(true);
  if (!mode) return null;

  const cuts = slice?.widths.length ?? 0;
  const pieces = slice?.slices.length ?? 0;

  return (
    <div role="dialog" aria-label="Knife settings"
      className="absolute bottom-[4.5rem] right-3 z-[600] w-64 rounded-lg border border-border bg-popover/92 text-[11px] text-popover-foreground shadow-xl backdrop-blur"
      onDoubleClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="flex flex-1 items-center gap-1.5 text-left font-medium text-foreground">
          <ChevronDown size={12} className={`text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
          Knife
          <span className="font-normal text-muted-foreground">
            · {mode} · {width} m{slice ? ` · ${pieces} pieces` : ""}
          </span>
        </button>
        <button onClick={() => handle?.knifeStop()} aria-label="Put the knife away (Esc)" title="Put the knife away (Esc)"
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-primary/10 hover:text-primary">
          <X size={12} />
        </button>
      </div>

      {open && (
        <div className="space-y-2.5 border-t border-border/60 px-2.5 pb-2.5 pt-2">
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

          <BladeWidth />

          {slice ? (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2">
              <p className="text-[10px] text-muted-foreground">
                Slicing <strong className="text-foreground">{slice.source}</strong> · {pieces} piece{pieces === 1 ? "" : "s"} · {cuts} cut{cuts === 1 ? "" : "s"}
              </p>
              <div className="mt-1.5 flex gap-1">
                <button onClick={finishSlicing} disabled={pieces < 2}
                  title="Save the pieces as shapes (Enter) — the original is kept, hidden"
                  className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md bg-primary text-[10px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40">
                  <Check size={12} /> Finish <kbd className="font-mono text-[9px] opacity-70">↵</kbd>
                </button>
                <button className={SMALL} disabled={!cuts} onClick={undoSlice} aria-label="Undo cut" title="Undo cut (Ctrl+Z)"><Undo2 size={12} /></button>
                <button className={SMALL} disabled={!slice.future.length} onClick={redoSlice} aria-label="Redo cut" title="Redo cut (Ctrl+Y)"><Redo2 size={12} /></button>
                <button className={`${SMALL} hover:!border-destructive/40 hover:!text-destructive`} onClick={() => void discardSlicing()}
                  aria-label="Discard the cuts" title="Discard the cuts — the shape stays as it was"><X size={12} /></button>
              </div>
            </div>
          ) : (
            <p className="text-[10px] leading-snug text-muted-foreground">
              Cut across any shape to start slicing it. Pieces are saved when you <strong className="text-foreground">Finish</strong>; the original is kept.
            </p>
          )}

          <p className="text-[9px] leading-snug text-muted-foreground/70">
            {mode === "straight"
              ? "Click points along the cut, click the last one again to cut. Backspace removes a point."
              : "Drag across the shape to cut along the line you draw."}{" "}
            Esc puts the knife away.
          </p>
        </div>
      )}
    </div>
  );
}
