"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { ReferencePointsPanel } from "@/components/panels/ReferencePointsPanel";
import { SavedShapesPanel } from "@/components/panels/SavedShapesPanel";
import { ShapeBuilderPanel } from "@/components/panels/ShapeBuilderPanel";
import { ParametersPanel } from "@/components/panels/ParametersPanel";
import { GeneratePanel } from "@/components/panels/GeneratePanel";
import { TreeGridPanel } from "@/components/panels/TreeGridPanel";
import { OutputsPanel } from "@/components/panels/OutputsPanel";

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

      <Reveal i={2} id="sec-build">
        <ShapeBuilderPanel />
      </Reveal>

      <Reveal i={3} id="sec-params">
        <ParametersPanel />
      </Reveal>

      <Reveal i={4} id="sec-generate">
        <GeneratePanel />
      </Reveal>

      <Reveal i={5} id="sec-grid">
        <TreeGridPanel />
      </Reveal>

      <Reveal i={6} id="sec-outputs">
        <OutputsPanel />
      </Reveal>
    </aside>
  );
}
