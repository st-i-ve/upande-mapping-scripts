"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Grid3x3, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SectionCard } from "./SectionCard";
import { ReferencePointsPanel } from "@/components/panels/ReferencePointsPanel";
import { SavedShapesPanel } from "@/components/panels/SavedShapesPanel";

function Reveal({ i, id, children }: { i: number; id?: string; children: ReactNode }) {
  return (
    <motion.div
      id={id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + i * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** The left control surface. Real wired panels + placeholders for later milestones. */
export function Sidebar() {
  return (
    <aside className="w-[340px] shrink-0 space-y-3 overflow-y-auto overflow-x-hidden border-r border-border bg-sidebar/60 p-3.5">
      <Reveal i={0} id="sec-ref">
        <ReferencePointsPanel />
      </Reveal>

      <Reveal i={1} id="sec-shapes">
        <SavedShapesPanel />
      </Reveal>

      <Reveal i={2} id="sec-grid">
        <SectionCard
          title={<span className="inline-flex items-center gap-1.5"><Grid3x3 size={12} /> Tree grid</span>}
          index="06"
        >
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-muted-foreground">
              Tree spacing (m)
              <Input defaultValue="2.0" className="mt-1 h-8 tabular" />
            </label>
            <label className="text-[11px] text-muted-foreground">
              Row spacing (m)
              <Input defaultValue="4.0" className="mt-1 h-8 tabular" />
            </label>
          </div>
          <Button variant="secondary" className="mt-3 w-full">Generate grid</Button>
          <p className="mt-2 text-[10px] text-muted-foreground/60">Wiring lands in M6.</p>
        </SectionCard>
      </Reveal>

      <Reveal i={3} id="sec-generate">
        <SectionCard
          title={<span className="inline-flex items-center gap-1.5"><Play size={12} /> Generate</span>}
          index="05"
        >
          <Button className="w-full">Generate beds &amp; zones</Button>
          <Separator className="my-3" />
          <div className="tabular grid grid-cols-3 gap-2 text-center">
            {[["beds", "—"], ["zones", "—"], ["blocks", "—"]].map(([k, v]) => (
              <div key={k} className="rounded-md border border-border bg-secondary/40 py-2">
                <div className="text-base font-semibold text-primary">{v}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground/60">Wiring lands in M4.</p>
        </SectionCard>
      </Reveal>
    </aside>
  );
}
