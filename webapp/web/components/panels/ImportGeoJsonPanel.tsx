"use client";

import { useState } from "react";
import { FileUp } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { SectionCard } from "@/components/console/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { GeoGeometry } from "@/lib/types";

export function extractGeometry(raw: string): GeoGeometry | null {
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  if (o.type === "FeatureCollection" && Array.isArray(o.features)) {
    const f = o.features.find((x) => (x as { geometry?: unknown })?.geometry);
    return (f as { geometry?: GeoGeometry })?.geometry ?? null;
  }
  if (o.type === "Feature" && o.geometry) return o.geometry as GeoGeometry;
  if (typeof o.type === "string" && "coordinates" in o) return o as unknown as GeoGeometry;
  return null;
}

/** Paste GeoJSON in as a saved shape — filed into the folder open in the Browser. */
export function ImportGeoJsonPanel() {
  const addSavedShape = useAppStore((s) => s.addSavedShape);
  const count = useAppStore((s) => s.savedShapes.length);
  const activeFolder = useAppStore((s) => s.activeFolder);
  const fitGeometry = useMapBridge((s) => s.handle?.fitGeometry);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [err, setErr] = useState("");

  const add = () => {
    const geom = extractGeometry(text);
    if (!geom) {
      setErr("Couldn't read a Point / Polygon / Feature / FeatureCollection.");
      return;
    }
    addSavedShape(name.trim() || `Shape ${count + 1}`, geom);
    setName("");
    setText("");
    setErr("");
    fitGeometry?.(geom);
  };

  return (
    <SectionCard title={<span className="inline-flex items-center gap-1.5"><FileUp size={12} /> Import GeoJSON</span>}>
      <Input placeholder="Name (e.g. Block A outline)" value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
      <Textarea placeholder="Paste a Polygon / Feature / FeatureCollection" value={text}
        onChange={(e) => setText(e.target.value)} className="mt-1.5 h-16 font-mono text-[9px]" />
      {err && <p className="mt-1 text-[9px] text-destructive">{err}</p>}
      <Button variant="secondary" size="sm" className="mt-1.5 w-full" disabled={!text.trim()} onClick={add}>
        Add to {activeFolder ? activeFolder.split("/").pop() : "the project"}
      </Button>
    </SectionCard>
  );
}
