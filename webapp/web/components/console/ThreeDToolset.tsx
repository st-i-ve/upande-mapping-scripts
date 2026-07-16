"use client";

import { useState } from "react";
import { Box, Trees, Grid2x2, Plane, PencilLine, Droplets } from "lucide-react";
import { useThreeD } from "@/lib/map/threeDBridge";
import { SectionCard } from "./SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

function num(v: number | readonly number[]) {
  return Array.isArray(v) ? v[0] : (v as number);
}

/** Sidebar toolset for the 3D view — drives the (hidden) legacy-3d.html
 *  controls over the postMessage bridge. 1:1 with the on-canvas panel. */
export function ThreeDToolset() {
  const ready = useThreeD((s) => s.ready);
  const set = useThreeD((s) => s.set);
  const click = useThreeD((s) => s.click);
  const loadTrees = useThreeD((s) => s.loadTrees);
  const loadValves = useThreeD((s) => s.loadValves);
  const status = useThreeD((s) => s.status);

  const [pitch, setPitch] = useState(60);
  const [opacity, setOpacity] = useState(100);
  const [exag, setExag] = useState(1.5);
  const [terrain, setTerrain] = useState(false);
  const [topDown, setTopDown] = useState(false);
  const [rowArrows, setRowArrows] = useState(false);
  const [pencil, setPencil] = useState(false);

  const readFiles = (files: FileList | null, sink: (t: string[]) => void) =>
    files?.length && Promise.all(Array.from(files).map((f) => f.text())).then(sink);

  const dim = ready ? "" : "pointer-events-none opacity-50";

  return (
    <div className={`space-y-3 ${dim}`}>
      {!ready && <p className="text-[9px] text-muted-foreground/70">Loading 3D view…</p>}

      <SectionCard title={<span className="inline-flex items-center gap-1.5"><Box size={12} /> View</span>} index="3D">
        <Button size="sm" variant="secondary" className="w-full" onClick={() => click("flyToLokitela")}>
          <Plane size={13} /> Fly to Lokitela
        </Button>
        <div className="mt-3 space-y-2.5">
          <Labeled label="Camera pitch" value={`${pitch}°`}>
            <Slider value={[pitch]} min={0} max={85} step={1} onValueChange={(v) => { setPitch(num(v)); set("pitch", num(v)); }} />
          </Labeled>
          <Labeled label="Imagery opacity" value={`${opacity}%`}>
            <Slider value={[opacity]} min={0} max={100} step={1} onValueChange={(v) => { setOpacity(num(v)); set("opacity", num(v)); }} />
          </Labeled>
          <Labeled label="Terrain exaggeration" value={`${exag.toFixed(1)}×`}>
            <Slider value={[exag]} min={1} max={5} step={0.1} onValueChange={(v) => { setExag(num(v)); set("exag", num(v)); }} />
          </Labeled>
        </div>
        <div className="mt-3 space-y-1.5">
          <ToggleRow label="Terrain (AWS)" checked={terrain} onChange={(c) => { setTerrain(c); set("terrainToggle", c); }} />
          <ToggleRow label="Top-down view" checked={topDown} onChange={(c) => { setTopDown(c); set("topDownToggle", c); }} />
          <ToggleRow label="Row arrows" checked={rowArrows} onChange={(c) => { setRowArrows(c); set("rowArrowsToggle", c); }} />
        </div>
        <StatusLine text={status.fps || status.status} />
      </SectionCard>

      <SectionCard title={<span className="inline-flex items-center gap-1.5"><Trees size={12} /> Trees</span>} index="3T">
        <label className="block text-[9px] text-muted-foreground">
          Load tree GeoJSON
          <Input type="file" multiple accept=".geojson,.json" className="mt-1 h-8 text-[9px]" onChange={(e) => readFiles(e.target.files, loadTrees)} />
        </label>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <NumField label="Trunk (m)" id="trunkH" def={1.5} set={set} />
          <NumField label="Canopy (m)" id="canopyH" def={2.5} set={set} />
          <NumField label="Radius (m)" id="canopyR" def={1.2} set={set} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => click("previewTrees")}>Preview</Button>
          <Button size="sm" variant="secondary" onClick={() => click("rebuildTrees")}>Rebuild</Button>
          <Button size="sm" variant="secondary" onClick={() => click("flyToTrees")}>Fly to</Button>
          <Button size="sm" variant="secondary" onClick={() => click("clearTrees")}>Clear</Button>
        </div>
        <StatusLine text={status.treesStatus} />
      </SectionCard>

      <SectionCard title={<span className="inline-flex items-center gap-1.5"><PencilLine size={12} /> Scouting path</span>} index="3P">
        <div className="grid grid-cols-3 gap-1.5">
          <Button size="sm" variant={pencil ? "default" : "secondary"} onClick={() => { setPencil((p) => !p); click("pencilToggle"); }}>Pencil</Button>
          <Button size="sm" variant="secondary" onClick={() => click("pathSnap")}>Snap</Button>
          <Button size="sm" variant="secondary" onClick={() => click("pathClear")}>Clear</Button>
        </div>
        <div className="mt-2">
          <NumField label="Snap radius (m)" id="snapRadius" def={3} step={0.5} set={set} />
        </div>
        <StatusLine text={status.pathStatus} />
      </SectionCard>

      <SectionCard title={<span className="inline-flex items-center gap-1.5"><Droplets size={12} /> Valves</span>} index="3V">
        <label className="block text-[9px] text-muted-foreground">
          Load valve GeoJSON (points)
          <Input type="file" multiple accept=".geojson,.json" className="mt-1 h-8 text-[9px]" onChange={(e) => readFiles(e.target.files, loadValves)} />
        </label>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => click("previewValves")}>Preview</Button>
          <Button size="sm" variant="secondary" onClick={() => click("flyToValves")}>Fly to</Button>
          <Button size="sm" variant="secondary" onClick={() => click("clearValves")}>Clear</Button>
        </div>
        <StatusLine text={status.valvesStatus} />
      </SectionCard>

      <SectionCard title={<span className="inline-flex items-center gap-1.5"><Grid2x2 size={12} /> Blocks</span>} index="3B">
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Pad (m)" id="blockPad" def={2} set={set} />
          <NumField label="Max edge (m)" id="blockMaxEdge" def={8} set={set} />
        </div>
        <label className="mt-2 block text-[9px] text-muted-foreground">
          Name suffix
          <Input defaultValue=" - KL" className="mt-1 h-8 tabular" onChange={(e) => set("blockSuffix", e.target.value)} />
        </label>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <Button size="sm" onClick={() => click("generateBlocks")}>Generate</Button>
          <Button size="sm" variant="secondary" onClick={() => click("viewBlocks")}>View</Button>
          <Button size="sm" variant="secondary" onClick={() => click("exportBlocks")}>Export all</Button>
          <Button size="sm" variant="secondary" onClick={() => click("exportBlocksEach")}>Export each</Button>
        </div>
        <StatusLine text={status.blocksStatus} />
      </SectionCard>
    </div>
  );
}

function StatusLine({ text }: { text?: string }) {
  if (!text) return null;
  return <p className="tabular mt-2 text-[9px] text-primary/80">{text}</p>;
}

function Labeled({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[8px] uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <span className="tabular text-primary">{value}</span>
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (c: boolean) => void }) {
  return (
    <label className="flex items-center justify-between text-[9px] text-muted-foreground">
      {label}
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function NumField({ label, id, def, step = 0.1, set }: { label: string; id: string; def: number; step?: number; set: (id: string, v: number) => void }) {
  return (
    <label className="block text-[9px] text-muted-foreground">
      {label}
      <Input type="number" step={step} defaultValue={def} className="mt-1 h-8 tabular" onChange={(e) => set(id, +e.target.value)} />
    </label>
  );
}
