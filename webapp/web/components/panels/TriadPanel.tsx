"use client";

import { useRef, useState } from "react";
import { Triangle, Square, Check } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { SectionCard } from "@/components/console/SectionCard";
import { AnimatedNumber } from "@/components/console/AnimatedNumber";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { generateTriads, type BandDirection, type TriadDirection } from "@/lib/geometry/triad";
import { api } from "@/lib/api/client";
import { ListRow } from "@/components/console/ListRow";

export function TriadPanel() {
  const hydrated = useHydrated();
  const drawnGeometry = useAppStore((s) => s.drawnGeometry);
  const workingPolygon = useAppStore((s) => s.workingPolygon);
  const triad = useAppStore((s) => s.triad);
  const setTriad = useAppStore((s) => s.setTriad);
  const setTriadHexes = useAppStore((s) => s.setTriadHexes);
  const savedShapes = useAppStore((s) => s.savedShapes);
  const triadQueue = useAppStore((s) => s.triadQueue);
  const setTriadQueue = useAppStore((s) => s.setTriadQueue);

  const [sideLength, setSideLength] = useState(5);
  const [rotationDeg, setRotationDeg] = useState(0);
  // Which end the numbering starts from — bands run north→south by default and
  // triads west→east, matching how the blocks are walked on the ground.
  const [bandDirection, setBandDirection] = useState<BandDirection>("north-south");
  const [triadDirection, setTriadDirection] = useState<TriadDirection>("west-east");
  const [err, setErr] = useState("");

  // ---- sequential run over the queued shapes ----
  type Done = { shape: string; filename: string; triads: number; bands: number };
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [done, setDone] = useState<Done[]>([]);
  // A ref, not state: the loop reads it between blocks and must see the click
  // that happened after it started.
  const stopRef = useRef(false);

  const queue = hydrated ? triadQueue : [];

  /** Hand the thread back for a frame, so paints and clicks get through. */
  const breathe = () => new Promise((r) => setTimeout(r, 80));

  const runQueue = async () => {
    setErr("");
    setDone([]);
    stopRef.current = false;
    setRunning(true);
    for (const name of queue) {
      if (stopRef.current) break;
      setCurrent(name);
      // The tessellation is synchronous and freezes the thread while it runs, so
      // Stop can only be clicked between blocks. Yield long enough for the
      // browser to paint the progress AND dispatch a pending click, or the
      // button is there but unclickable on anything but a tiny job.
      await breathe();
      const shape = savedShapes.find((x) => x.name === name);
      if (!shape) continue;
      try {
        const { triads } = generateTriads(shape.geometry, {
          sideLength, rotationDeg, bandDirection, triadDirection,
        });
        // Stopping mid-block discards it: a half-generated block must not reach
        // the outputs list, where it would look complete.
        if (stopRef.current) break;
        if (!triads.features.length) continue;
        const { filename } = await api.saveOutput(`${name} bands-triads`, triads);
        const bands = new Set(triads.features.map((f) => f.properties.band)).size;
        setDone((d) => [...d, { shape: name, filename, triads: triads.features.length, bands }]);
        await breathe(); // a window to press Stop before the next block starts
      } catch (e) {
        setErr(`${name}: ${(e as Error).message}`);
        break;
      }
    }
    setCurrent(null);
    setRunning(false);
  };

  const source = drawnGeometry ?? workingPolygon;
  const count = hydrated ? (triad?.features.length ?? 0) : 0;
  const bandCount = hydrated
    ? new Set((triad?.features ?? []).map((f) => (f.properties as { band?: number }).band)).size
    : 0;

  const generate = () => {
    if (!source) return setErr("Draw a shape or set a working polygon first.");
    const { triads, hexagons } = generateTriads(source, {
      sideLength, rotationDeg, bandDirection, triadDirection,
    });
    if (!triads.features.length) return setErr("No triangles fit — check side length / polygon.");
    setErr("");
    setTriad(triads);
    setTriadHexes(hexagons);
  };

  const download = () => {
    if (!triad) return;
    const blob = new Blob([JSON.stringify(triad)], { type: "application/geo+json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "triads.geojson";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-1.5"><Triangle size={12} /> Triad</span>}
      index="09"
      meta={count > 0 ? <span className="tabular text-[9px] text-primary"><AnimatedNumber value={count} /> triads · {bandCount} bands</span> : undefined}
    >
      <label className="block text-[9px] text-muted-foreground">
        Hexagon size (triangle side, m)
        <Input type="number" step={0.5} min={0.5} value={sideLength} onChange={(e) => setSideLength(+e.target.value)} className="mt-1 h-8 tabular" />
      </label>
      <div className="mt-2">
        <div className="mb-1 flex justify-between text-[8px] uppercase tracking-wider text-muted-foreground">
          <span>Rotation</span>
          <span className="tabular text-primary">{rotationDeg}°</span>
        </div>
        <Slider value={[rotationDeg]} min={-90} max={90} step={1} onValueChange={(v) => setRotationDeg(Array.isArray(v) ? v[0] : v)} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block text-[9px] text-muted-foreground">
          Bands numbered
          <select
            aria-label="Band direction"
            value={bandDirection}
            onChange={(e) => setBandDirection(e.target.value as BandDirection)}
            className="mt-1 h-8 w-full rounded-md border border-input bg-transparent px-2 text-[10px]"
          >
            <option value="north-south">North → south</option>
            <option value="south-north">South → north</option>
          </select>
        </label>
        <label className="block text-[9px] text-muted-foreground">
          Triads numbered
          <select
            aria-label="Triad direction"
            value={triadDirection}
            onChange={(e) => setTriadDirection(e.target.value as TriadDirection)}
            className="mt-1 h-8 w-full rounded-md border border-input bg-transparent px-2 text-[10px]"
          >
            <option value="west-east">West → east</option>
            <option value="east-west">East → west</option>
            <option value="north-south">North → south</option>
          </select>
        </label>
      </div>
      {err && <p className="mt-1.5 text-[9px] text-destructive">{err}</p>}
      {queue.length > 0 && (
        <div className="mt-2.5 rounded-md border border-border/60 bg-muted/30 p-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-muted-foreground">
              <strong className="text-foreground">{queue.length} shape{queue.length === 1 ? "" : "s"}</strong> queued
              {running && current ? ` · generating ${current}…` : ""}
            </span>
            <button className="text-[9px] text-muted-foreground hover:text-destructive"
              onClick={() => { setTriadQueue([]); setDone([]); }} disabled={running}>
              clear
            </button>
          </div>
          <div className="mt-1.5 flex gap-1.5">
            <Button size="sm" className="h-7 flex-1 text-[9px]" disabled={running} onClick={runQueue}>
              Generate {queue.length} output{queue.length === 1 ? "" : "s"}
            </Button>
            <Button size="sm" variant="destructive" className="h-7 text-[9px]" disabled={!running}
              onClick={() => { stopRef.current = true; }}>
              <Square size={9} /> Stop
            </Button>
          </div>
          {done.length > 0 && (
            <ul className="mt-1.5">
              {done.map((d) => (
                <ListRow key={d.filename} actions={<span className="tabular text-muted-foreground">{d.bands} bands · {d.triads} triads</span>}>
                  <span className="inline-flex items-center gap-1 text-[10px]">
                    <Check size={11} className="text-primary" /> {d.shape}
                  </span>
                </ListRow>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[8px] text-muted-foreground/60">
            One output per shape, generated in turn. Stopping discards the block in
            progress — only finished blocks are listed. Find them in Saved outputs.
          </p>
        </div>
      )}

      <div className="mt-2 flex gap-1.5">
        <Button size="sm" variant={queue.length ? "secondary" : "default"} className="flex-1" onClick={generate}>
          {queue.length ? "Preview on working polygon" : "Generate triads"}
        </Button>
        {count > 0 && (
          <>
            <Button size="sm" variant="secondary" onClick={download}>GeoJSON</Button>
            <Button size="sm" variant="secondary" onClick={() => { setTriad(null); setTriadHexes(null); }}>Clear</Button>
          </>
        )}
      </div>
      <p className="mt-2 text-[8px] text-muted-foreground/60">
        Hexagonal grid — 6 equilateral triads per hexagon, grouped into bands (the
        row-equivalent unit), clipped to the boundary (edge units are partial).
        Bands number from 1 within each block and triads from 1 within each band,
        which is what the ERP names <strong>Band N</strong> and
        <strong> Triad N</strong> from. Uses the drawn shape or working polygon.
      </p>
    </SectionCard>
  );
}
