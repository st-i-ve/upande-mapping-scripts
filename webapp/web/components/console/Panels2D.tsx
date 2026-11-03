"use client";

import { motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { FolderTree, Wrench, Boxes, Download, type LucideIcon } from "lucide-react";
import { useAppStore, type SideTab } from "@/lib/store/appStore";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { ProjectBrowser } from "@/components/panels/ProjectBrowser";
import { ReferencePointsPanel } from "@/components/panels/ReferencePointsPanel";
import { SegmentsPanel } from "@/components/panels/SegmentsPanel";
import { ShapeBuilderPanel } from "@/components/panels/ShapeBuilderPanel";
import { ImportGeoJsonPanel } from "@/components/panels/ImportGeoJsonPanel";
import { KnifePanel } from "@/components/panels/KnifePanel";
import { PivotPanel } from "@/components/panels/PivotPanel";
import { TileDownloadPanel } from "@/components/panels/TileDownloadPanel";
import { OutputsPanel } from "@/components/panels/OutputsPanel";
import { BasemapKeysPanel } from "@/components/panels/BasemapKeysPanel";
import { UnitGenerators } from "./UnitGenerators";

/** One tab per flow, in the order work moves through them. */
export const TABS: { id: SideTab; label: string; hint: string; icon: LucideIcon }[] = [
  { id: "browser", label: "Browser", hint: "Projects, folders, shapes and reference points", icon: FolderTree },
  { id: "tool", label: "Tool", hint: "Settings for the tool picked on the left: save a drawing, knife, segments, pivot, import", icon: Wrench },
  { id: "generate", label: "Units", hint: "Unit generators: beds & zones, triads, hexagons, trees", icon: Boxes },
  { id: "export", label: "Export", hint: "Saved outputs, tile layers, basemap keys", icon: Download },
];

const PANELS: Record<SideTab, [string, ReactNode][]> = {
  browser: [
    ["sec-shapes", <ProjectBrowser key="browser" />],
    ["sec-ref", <ReferencePointsPanel key="ref" />],
  ],
  tool: [
    // Segments only shows while a slicing session is open — it comes first then.
    ["sec-segments", <SegmentsPanel key="segments" />],
    ["sec-build", <ShapeBuilderPanel key="build" />],
    ["sec-knife", <KnifePanel key="knife" />],
    ["sec-pivot", <PivotPanel key="pivot" />],
    ["sec-import", <ImportGeoJsonPanel key="import" />],
  ],
  generate: [["sec-units", <UnitGenerators key="units" />]],
  export: [
    ["sec-outputs", <OutputsPanel key="out" />],
    ["sec-tiles", <TileDownloadPanel key="tiles" />],
    ["sec-keys", <BasemapKeysPanel key="keys" />],
  ],
};

function Reveal({ i, id, children }: { i: number; id?: string; children: ReactNode }) {
  return (
    <motion.div
      id={id}
      className="scroll-mt-36"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.02 + i * 0.04, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** The tab strip — sits in the sidebar's sticky header. */
export function SideTabs() {
  const hydrated = useHydrated();
  const tab = useAppStore((s) => (hydrated ? s.sideTab : "browser"));
  const setTab = useAppStore((s) => s.setSideTab);
  const slicing = useAppStore((s) => s.slice != null);
  const drawn = useAppStore((s) => s.drawnGeometry != null);
  const pivot = useAppStore((s) => s.pivot != null);
  const queued = useAppStore((s) => s.triadQueue.length > 0);
  // A dot on a tab that has something waiting for you.
  const pending: Partial<Record<SideTab, boolean>> = { tool: slicing || drawn || pivot, generate: queued };

  return (
    <div role="tablist" aria-label="Sidebar" className="grid grid-cols-4 gap-1 rounded-lg bg-muted/50 p-1">
      {TABS.map((t) => {
        const on = tab === t.id;
        return (
          <button key={t.id} role="tab" aria-selected={on} title={t.hint} onClick={() => setTab(t.id)}
            className={`relative flex flex-col items-center gap-0.5 rounded-md py-1.5 text-[10px] font-medium transition-colors ${
              on ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            <t.icon size={13} />
            {t.label}
            {pending[t.id] && !on && <span className="absolute right-2 top-1 h-1.5 w-1.5 rounded-full bg-primary" />}
          </button>
        );
      })}
    </div>
  );
}

/** The 2D map toolset — the open tab's panels, stacked with a load reveal. */
export function Panels2D() {
  const hydrated = useHydrated();
  const tab = useAppStore((s) => (hydrated ? s.sideTab : "browser"));
  const ref = useRef<HTMLDivElement>(null);
  // A new tab starts at its top, not wherever the last one was scrolled to.
  useEffect(() => {
    ref.current?.closest<HTMLElement>("[data-sidebar='content']")?.scrollTo({ top: 0 });
  }, [tab]);
  return (
    <div key={tab} ref={ref} role="tabpanel" className="space-y-3">
      {PANELS[tab].map(([id, node], i) => (
        <Reveal key={id} i={i} id={id}>
          {node}
        </Reveal>
      ))}
    </div>
  );
}
