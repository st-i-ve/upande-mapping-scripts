"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { MapPin, Shapes, Grid3x3, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SectionCard } from "./SectionCard";
import { ListRow } from "./ListRow";

function Reveal({ i, children }: { i: number; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + i * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function Action({ children }: { children: ReactNode }) {
  return (
    <button className="text-muted-foreground transition-colors hover:text-primary">
      {children}
    </button>
  );
}

/** The left control surface. Sections stagger in on load (M2 demo content). */
export function Sidebar() {
  return (
    <aside className="w-[340px] shrink-0 space-y-3 overflow-y-auto overflow-x-hidden border-r border-border bg-sidebar/60 p-3.5">
      <Reveal i={0}>
        <section id="sec-ref">
          <SectionCard
            title={
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={12} /> Reference points
              </span>
            }
            index="01"
            meta={<Switch defaultChecked aria-label="Show on map" />}
          >
            <Slider defaultValue={[60]} max={100} step={1} className="my-3" />
            <ul>
              <ListRow actions={<><Action>zoom</Action><Action>delete</Action></>}>
                <span className="text-primary">A</span>{" "}
                <span className="tabular text-muted-foreground">0.068612, 35.748031</span>
              </ListRow>
              <ListRow actions={<><Action>zoom</Action><Action>delete</Action></>}>
                <span className="text-primary">Kapkolia-Greenhouse-18-NorthWest-survey-marker-2024</span>{" "}
                <span className="tabular text-muted-foreground">0.070145, 35.751902</span>
              </ListRow>
            </ul>
          </SectionCard>
        </section>
      </Reveal>

      <Reveal i={1}>
        <section id="sec-shapes">
          <SectionCard
            title={
              <span className="inline-flex items-center gap-1.5">
                <Shapes size={12} /> Saved shapes
              </span>
            }
            index="02"
          >
            <div className="mb-2 flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <input type="checkbox" className="accent-primary" /> Select all
              </label>
              <Button size="sm" variant="destructive" disabled className="h-7 text-[11px]">
                Delete selected
              </Button>
            </div>
            <ul>
              <ListRow actions={<><Action>hide</Action><Action>use</Action><Action>delete</Action></>}>
                <span className="text-primary">●</span> <strong>Block A outline</strong>
              </ListRow>
            </ul>
            <Button className="mt-3 w-full">Save current shape</Button>
          </SectionCard>
        </section>
      </Reveal>

      <Reveal i={2}>
        <section id="sec-grid">
          <SectionCard
            title={
              <span className="inline-flex items-center gap-1.5">
                <Grid3x3 size={12} /> Tree grid
              </span>
            }
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
          </SectionCard>
        </section>
      </Reveal>

      <Reveal i={3}>
        <section id="sec-generate">
          <SectionCard
            title={
              <span className="inline-flex items-center gap-1.5">
                <Play size={12} /> Generate
              </span>
            }
            index="05"
          >
            <Button className="w-full">Generate beds &amp; zones</Button>
            <Separator className="my-3" />
            <div className="tabular grid grid-cols-3 gap-2 text-center">
              {[["beds", "025"], ["zones", "312"], ["blocks", "03"]].map(([k, v]) => (
                <div key={k} className="rounded-md border border-border bg-secondary/40 py-2">
                  <div className="text-base font-semibold text-primary">{v}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
                </div>
              ))}
            </div>
          </SectionCard>
        </section>
      </Reveal>
    </aside>
  );
}
