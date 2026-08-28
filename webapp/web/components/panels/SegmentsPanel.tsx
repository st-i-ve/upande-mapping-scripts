"use client";

import { useState } from "react";
import { Scissors, Check, X, Undo2, Redo2, AlertTriangle } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { SectionCard } from "@/components/console/SectionCard";
import { ListRow } from "@/components/console/ListRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { checkNames, namesAreClean, NAME_ISSUE_TEXT } from "@/lib/shapeNames";
import { mergePolygons } from "@/lib/geometry/knife";

/**
 * The segments of a slice in progress — transient, and only on screen while a
 * slicing session is open. Finishing ports them into Saved shapes, but not before
 * the names have been reviewed: a name is the shape's identity downstream, so a
 * collision is caught here rather than silently renamed.
 */
export function SegmentsPanel() {
  const hydrated = useHydrated();
  const slice = useAppStore((s) => s.slice);
  const savedShapes = useAppStore((s) => s.savedShapes);
  const undoSlice = useAppStore((s) => s.undoSlice);
  const redoSlice = useAppStore((s) => s.redoSlice);
  const cancelSlice = useAppStore((s) => s.cancelSlice);
  const finishSlice = useAppStore((s) => s.finishSlice);
  const sliceNames = useAppStore((s) => s.sliceNames);
  const handle = useMapBridge((s) => s.handle);

  const [review, setReview] = useState<string[] | null>(null);

  const session = hydrated ? slice : null;
  if (!session) return null;

  const defaults = sliceNames();
  const freed = session.adopted.map((a) => a.name);
  const existing = savedShapes.map((s) => s.name);
  const issues = review ? checkNames(review, existing, freed) : [];
  const clean = review ? namesAreClean(review, existing, freed) : false;

  const port = () => {
    const merged = mergePolygons(session.slices);
    finishSlice(review ?? undefined);
    setReview(null);
    handle?.knifeStop();
    if (merged) handle?.fitGeometry(merged);
  };

  const stop = () => {
    cancelSlice();
    setReview(null);
    handle?.knifeStop();
  };

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-1.5"><Scissors size={12} /> Segments</span>}
      index="02"
      meta={<span className="text-[8px] uppercase tracking-wider text-primary">slicing</span>}
    >
      {/* Finish sits at the top: it is the action this panel exists for. */}
      <div className="flex gap-1.5">
        <Button size="sm" className="flex-1" disabled={session.slices.length < 2}
          onClick={() => setReview(defaults)}>
          <Check size={12} /> Finish slicing ({session.slices.length})
        </Button>
        <Button size="sm" variant="secondary" className="h-8" disabled={!session.widths.length}
          onClick={undoSlice} aria-label="Undo cut" title="Step back one cut">
          <Undo2 size={12} />
        </Button>
        <Button size="sm" variant="secondary" className="h-8" disabled={!session.future.length}
          onClick={redoSlice} aria-label="Redo cut" title="Put back the cut you undid">
          <Redo2 size={12} />
        </Button>
        <Button size="sm" variant="ghost" className="h-8" onClick={stop} title="Discard these segments">
          <X size={12} />
        </Button>
      </div>

      <p className="mt-2 text-[9px] text-muted-foreground/70">
        Cutting <strong>{session.source}</strong> — {session.widths.length} cut
        {session.widths.length === 1 ? "" : "s"}
        {session.future.length > 0 && `, ${session.future.length} undone`}. The original is
        kept, hidden in Saved shapes. Nothing is saved until you finish.
      </p>

      <ul className="mt-1.5">
        {session.slices.map((_, i) => (
          <ListRow key={i}>
            <span className="tabular mr-1.5 text-[10px] font-bold text-primary">{i + 1}</span>
            <span className="text-muted-foreground">{defaults[i]}</span>
          </ListRow>
        ))}
      </ul>

      <Dialog open={review !== null} onOpenChange={(o) => !o && setReview(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Move {review?.length ?? 0} segments into Saved shapes?</DialogTitle>
            <DialogDescription>
              They join the list <strong>{session.source}</strong> came from, and can then be
              selected, renamed or used to generate triads. {session.source} itself is kept,
              hidden. Check the names below — each one names a document downstream.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {(review ?? []).map((name, i) => (
              <div key={i}>
                <div className="flex items-center gap-2">
                  <span className="tabular w-5 shrink-0 text-[10px] font-bold text-muted-foreground">
                    {i + 1}
                  </span>
                  <Input
                    aria-label={`Segment ${i + 1} name`}
                    value={name}
                    onChange={(e) =>
                      setReview((r) => r!.map((n, j) => (j === i ? e.target.value : n)))
                    }
                    className={`h-8 ${issues[i] ? "border-destructive" : ""}`}
                  />
                </div>
                {issues[i] && (
                  <p className="ml-7 mt-0.5 text-[9px] text-destructive">
                    {NAME_ISSUE_TEXT[issues[i]!]}
                  </p>
                )}
              </div>
            ))}
          </div>

          {!clean && (
            <p className="flex items-center gap-1.5 text-[9px] text-destructive">
              <AlertTriangle size={11} /> Fix the names above before moving them across.
            </p>
          )}

          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setReview(null)}>
              Keep slicing
            </Button>
            <Button size="sm" disabled={!clean} onClick={port}>
              Move to Saved shapes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
