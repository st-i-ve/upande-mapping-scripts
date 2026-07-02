"use client";

import { useState } from "react";
import { Shapes } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { SectionCard } from "@/components/console/SectionCard";
import { ListRow } from "@/components/console/ListRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import type { GeoGeometry } from "@/lib/types";

function extractGeometry(raw: string): GeoGeometry | null {
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

export function SavedShapesPanel() {
  const hydrated = useHydrated();
  const savedShapes = useAppStore((s) => s.savedShapes);
  const shapesVisible = useAppStore((s) => s.shapesVisible);
  const shapeOpacity = useAppStore((s) => s.shapeOpacity);
  const addSavedShape = useAppStore((s) => s.addSavedShape);
  const removeSavedShape = useAppStore((s) => s.removeSavedShape);
  const removeSavedShapes = useAppStore((s) => s.removeSavedShapes);
  const toggleShapeVisible = useAppStore((s) => s.toggleShapeVisible);
  const setShapesVisible = useAppStore((s) => s.setShapesVisible);
  const setShapeOpacity = useAppStore((s) => s.setShapeOpacity);
  const fitGeometry = useMapBridge((s) => s.handle?.fitGeometry);

  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const shapes = hydrated ? savedShapes : [];

  const addFromGeoJson = () => {
    const geom = extractGeometry(text);
    if (!geom) {
      setErr("Couldn't parse a Point / Polygon / Feature / FeatureCollection.");
      return;
    }
    const nm = name.trim() || `Shape ${savedShapes.length + 1}`;
    addSavedShape(nm, geom);
    setName("");
    setText("");
    setErr("");
    fitGeometry?.(geom);
  };

  const toggleSel = (nm: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(nm)) n.delete(nm);
      else n.add(nm);
      return n;
    });
  const allChecked = shapes.length > 0 && selected.size === shapes.length;
  const deleteSelected = () => {
    if (!selected.size) return;
    removeSavedShapes([...selected]);
    setSelected(new Set());
  };

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-1.5"><Shapes size={12} /> Saved shapes</span>}
      index="02"
      meta={
        <Switch checked={shapesVisible} onCheckedChange={setShapesVisible} aria-label="Show overlays on map" />
      }
    >
      <div className="mt-1 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Opacity</span>
        <Slider value={[Math.round(shapeOpacity * 100)]} max={100} step={1} onValueChange={(v) => setShapeOpacity((Array.isArray(v) ? v[0] : v) / 100)} className="flex-1" />
        <span className="tabular w-8 text-right text-[10px] text-muted-foreground">{Math.round(shapeOpacity * 100)}%</span>
      </div>

      <Input placeholder="Name (e.g. Block A outline)" value={name} onChange={(e) => setName(e.target.value)} className="mt-2 h-8" />
      <Textarea
        placeholder='Paste a Polygon / Feature / FeatureCollection'
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="mt-1.5 h-16 font-mono text-[11px]"
      />
      {err && <p className="mt-1 text-[11px] text-destructive">{err}</p>}
      <Button variant="secondary" size="sm" className="mt-1.5 w-full" onClick={addFromGeoJson}>
        Add from GeoJSON
      </Button>

      {shapes.length > 0 && (
        <>
          <div className="mt-3 flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                className="accent-primary"
                checked={allChecked}
                onChange={(e) => setSelected(e.target.checked ? new Set(shapes.map((s) => s.name)) : new Set())}
              />
              Select all
            </label>
            <Button variant="destructive" size="sm" className="h-7 text-[11px]" disabled={!selected.size} onClick={deleteSelected}>
              Delete selected{selected.size ? ` (${selected.size})` : ""}
            </Button>
          </div>
          <ul className="mt-1">
            {shapes.map((s) => (
              <ListRow
                key={s.name}
                actions={
                  <>
                    <button className="text-muted-foreground hover:text-primary" onClick={() => toggleShapeVisible(s.name)}>{s.visible ? "hide" : "show"}</button>
                    <button className="text-muted-foreground hover:text-primary" onClick={() => fitGeometry?.(s.geometry)}>zoom</button>
                    <button className="text-muted-foreground hover:text-destructive" onClick={() => removeSavedShape(s.name)}>delete</button>
                  </>
                }
              >
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" className="accent-primary" checked={selected.has(s.name)} onChange={() => toggleSel(s.name)} />
                  <span style={{ color: s.color }}>{s.visible ? "●" : "○"}</span>
                  <strong>{s.name}</strong>
                </label>
              </ListRow>
            ))}
          </ul>
        </>
      )}
      {hydrated && shapes.length === 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground/70">No shapes yet — paste GeoJSON above to add an overlay.</p>
      )}
    </SectionCard>
  );
}
