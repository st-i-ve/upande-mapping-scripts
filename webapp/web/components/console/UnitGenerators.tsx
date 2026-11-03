"use client";

import type { ReactNode } from "react";
import { ChevronDown, Rows3, Triangle, Hexagon, Trees, type LucideIcon } from "lucide-react";
import { useAppStore, type UnitKind } from "@/lib/store/appStore";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { FlatCards } from "./SectionCard";
import { ParametersPanel } from "@/components/panels/ParametersPanel";
import { TerracePanel } from "@/components/panels/TerracePanel";
import { GeneratePanel } from "@/components/panels/GeneratePanel";
import { TriadPanel } from "@/components/panels/TriadPanel";
import { HexPanel } from "@/components/panels/HexPanel";
import { TreeGridPanel } from "@/components/panels/TreeGridPanel";

interface Group {
  id: UnitKind;
  label: string;
  hint: string;
  icon: LucideIcon;
  panels: ReactNode;
}

const GROUPS: Group[] = [
  {
    id: "zones", label: "Beds & zones", icon: Rows3,
    hint: "Parallel beds cut into zones — flat blocks or terraces",
    panels: <><ParametersPanel /><TerracePanel /><GeneratePanel /></>,
  },
  {
    id: "triads", label: "Triads", icon: Triangle,
    hint: "Hexagons split into 6 triangles, numbered by band",
    panels: <TriadPanel />,
  },
  {
    id: "hexagons", label: "Hexagons", icon: Hexagon,
    hint: "Whole hexagons as units, numbered by band",
    panels: <HexPanel />,
  },
  {
    id: "trees", label: "Trees", icon: Trees,
    hint: "A planting grid of tree points",
    panels: <TreeGridPanel />,
  },
];

const DEFAULT_OPEN: UnitKind[] = ["zones"];
const plural = (n: number, w: string) => `${n.toLocaleString()} ${w}${n === 1 ? "" : "s"}`;

/** What each generator currently has on the map, for its header chip. */
function useCounts(): Record<UnitKind, string | null> {
  const hydrated = useHydrated();
  const gen = useAppStore((s) => s.genResult?.features.length ?? 0);
  const triad = useAppStore((s) => s.triad?.features.length ?? 0);
  const hexes = useAppStore((s) => (s.triad ? 0 : s.triadHexes?.features.length ?? 0));
  const trees = useAppStore((s) => s.treeGrid.length);
  const queued = useAppStore((s) => s.triadQueue.length);
  if (!hydrated) return { zones: null, triads: null, hexagons: null, trees: null };
  return {
    zones: gen ? plural(gen, "feature") : null,
    triads: triad ? plural(triad, "triad") : queued ? `${queued} queued` : null,
    hexagons: hexes ? plural(hexes, "hexagon") : null,
    trees: trees ? plural(trees, "tree") : null,
  };
}

/**
 * The Units tab: every generator that turns a block into field units, each a
 * dropdown group of its own. Open groups are highlighted with the accent rail;
 * the chip on the right says what that generator has on the map right now.
 */
export function UnitGenerators() {
  const hydrated = useHydrated();
  const open = useAppStore((s) => (hydrated ? s.openUnits : DEFAULT_OPEN));
  const setUnitOpen = useAppStore((s) => s.setUnitOpen);
  const counts = useCounts();

  return (
    <div className="space-y-2.5">
      <p className="px-1 text-[10px] text-muted-foreground">
        Unit generators — pick a block (or draw one), then generate the units it&apos;s divided into.
      </p>
      {GROUPS.map((g) => {
        const isOpen = open.includes(g.id);
        const chip = counts[g.id];
        return (
          <section key={g.id} id={`units-${g.id}`}
            className={`overflow-hidden rounded-[18px] border bg-card shadow-[var(--shadow-card)] transition-colors ${
              isOpen ? "border-primary/50 ring-1 ring-primary/20" : "border-border"}`}>
            <button onClick={() => setUnitOpen(g.id, !isOpen)} aria-expanded={isOpen}
              className={`relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${isOpen ? "bg-primary/8" : "hover:bg-muted/40"}`}>
              {isOpen && <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary" />}
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${isOpen ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                <g.icon size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[11px] font-semibold ${isOpen ? "text-primary" : "text-foreground"}`}>{g.label}</span>
                <span className="block truncate text-[10px] text-muted-foreground">{g.hint}</span>
              </span>
              {chip && (
                <span className="tabular shrink-0 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[9px] font-medium text-primary">
                  {chip}
                </span>
              )}
              <ChevronDown size={13} className={`shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <div className="border-t border-border/60">
                <FlatCards.Provider value={true}>{g.panels}</FlatCards.Provider>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
