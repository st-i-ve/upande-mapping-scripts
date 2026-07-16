"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { ReferencePointsPanel } from "@/components/panels/ReferencePointsPanel";
import { SavedShapesPanel } from "@/components/panels/SavedShapesPanel";
import { ShapeBuilderPanel } from "@/components/panels/ShapeBuilderPanel";
import { ParametersPanel } from "@/components/panels/ParametersPanel";
import { TerracePanel } from "@/components/panels/TerracePanel";
import { GeneratePanel } from "@/components/panels/GeneratePanel";
import { TreeGridPanel } from "@/components/panels/TreeGridPanel";
import { TriadPanel } from "@/components/panels/TriadPanel";
import { OutputsPanel } from "@/components/panels/OutputsPanel";
import { BasemapKeysPanel } from "@/components/panels/BasemapKeysPanel";

function Reveal({ i, id, children }: { i: number; id?: string; children: ReactNode }) {
  return (
    <motion.div
      id={id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.03 + i * 0.05, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** The 2D map toolset — all bed/zone/grid panels, stacked with a load reveal. */
export function Panels2D() {
  const panels = [
    ["sec-ref", <ReferencePointsPanel key="ref" />],
    ["sec-shapes", <SavedShapesPanel key="shapes" />],
    ["sec-build", <ShapeBuilderPanel key="build" />],
    ["sec-params", <ParametersPanel key="params" />],
    ["sec-terrace", <TerracePanel key="terrace" />],
    ["sec-generate", <GeneratePanel key="gen" />],
    ["sec-grid", <TreeGridPanel key="grid" />],
    ["sec-triad", <TriadPanel key="triad" />],
    ["sec-outputs", <OutputsPanel key="out" />],
    ["sec-keys", <BasemapKeysPanel key="keys" />],
  ] as const;

  return (
    <div className="space-y-3">
      {panels.map(([id, node], i) => (
        <Reveal key={id} i={i} id={id}>
          {node}
        </Reveal>
      ))}
    </div>
  );
}
