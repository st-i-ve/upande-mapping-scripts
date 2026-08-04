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
import { booleanOp, OP_LABEL, type BooleanOp } from "@/lib/geometry/booleanOps";
import { shapeLetter } from "@/lib/shapeLabels";
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
  const setWorkingPolygon = useAppStore((s) => s.setWorkingPolygon);
  const selectedShapes = useAppStore((s) => s.selectedShapes);
  const setSelectedShapes = useAppStore((s) => s.setSelectedShapes);
  const clearSelectedShapes = useAppStore((s) => s.clearSelectedShapes);
  const toggleSelectedShape = useAppStore((s) => s.toggleSelectedShape);
  const startSlice = useAppStore((s) => s.startSlice);
  const fitGeometry = useMapBridge((s) => s.handle?.fitGeometry);
  const knifeFreehand = useMapBridge((s) => s.handle?.knifeFreehand);

  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [err, setErr] = useState("");

  const shapes = hydrated ? savedShapes : [];
  const selectedSet = new Set(selectedShapes);

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

  const allChecked = shapes.length > 0 && selectedShapes.length === shapes.length;
  const deleteSelected = () => {
    if (!selectedShapes.length) return;
    removeSavedShapes(selectedShapes); // prunes the selection itself
  };

  /** Start a slicing session and put the shape on screen with the knife armed. */
  const startSliceOn = (name: string, geometry: GeoGeometry) => {
    startSlice(name);
    fitGeometry?.(geometry);
    knifeFreehand?.();
  };

  const applyBoolean = (op: BooleanOp) => {
    // Preserve list order (matters for subtract = first minus the rest).
    const geoms = shapes.filter((s) => selectedSet.has(s.name)).map((s) => s.geometry);
    const result = booleanOp(geoms, op);
    if (!result) {
      setErr("Boolean op failed — need 2+ overlapping polygons.");
      return;
    }
    addSavedShape(`${op} result`, result);
    clearSelectedShapes();
    fitGeometry?.(result);
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
        <span className="text-[8px] uppercase tracking-wider text-muted-foreground" title="Shapes are drawn as outline + letter; add fill only if you want it">Fill</span>
        <Slider value={[Math.round(shapeOpacity * 100)]} max={100} step={1} onValueChange={(v) => setShapeOpacity((Array.isArray(v) ? v[0] : v) / 100)} className="flex-1" />
        <span className="tabular w-8 text-right text-[8px] text-muted-foreground">{Math.round(shapeOpacity * 100)}%</span>
      </div>

      <Input placeholder="Name (e.g. Block A outline)" value={name} onChange={(e) => setName(e.target.value)} className="mt-2 h-8" />
      <Textarea
        placeholder='Paste a Polygon / Feature / FeatureCollection'
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="mt-1.5 h-16 font-mono text-[9px]"
      />
      {err && <p className="mt-1 text-[9px] text-destructive">{err}</p>}
      <Button variant="secondary" size="sm" className="mt-1.5 w-full" onClick={addFromGeoJson}>
        Add from GeoJSON
      </Button>

      {shapes.length > 0 && (
        <>
          <div className="mt-3 flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
              <input
                type="checkbox"
                className="accent-primary"
                checked={allChecked}
                onChange={(e) => (e.target.checked ? setSelectedShapes(shapes.map((s) => s.name)) : clearSelectedShapes())}
              />
              Select all
            </label>
            <Button variant="destructive" size="sm" className="h-7 text-[9px]" disabled={!selectedShapes.length} title="Or press Delete" onClick={deleteSelected}>
              Delete selected{selectedShapes.length ? ` (${selectedShapes.length})` : ""}
            </Button>
          </div>
          {selectedShapes.length >= 2 && (
            <div className="mb-1 flex gap-1.5">
              {(Object.keys(OP_LABEL) as BooleanOp[]).map((op) => (
                <Button key={op} size="sm" variant="secondary" className="h-7 flex-1 text-[9px]" title={OP_LABEL[op]} onClick={() => applyBoolean(op)}>
                  {OP_LABEL[op].split(" ")[0]}
                </Button>
              ))}
            </div>
          )}
          <ul className="mt-1">
            {shapes.map((s, i) => (
              <ListRow
                key={s.name}
                actions={
                  <>
                    <button className="text-muted-foreground hover:text-primary" onClick={() => toggleShapeVisible(s.name)}>{s.visible ? "hide" : "show"}</button>
                    <button className="text-muted-foreground hover:text-primary" onClick={() => fitGeometry?.(s.geometry)}>zoom</button>
                    <button className="text-muted-foreground hover:text-primary" title="Use as working polygon" onClick={() => setWorkingPolygon(s.geometry)}>use</button>
                    <button
                      className="text-muted-foreground hover:text-primary"
                      title="Slice this shape repeatedly with the knife (original kept)"
                      onClick={() => startSliceOn(s.name, s.geometry)}
                    >
                      slice
                    </button>
                    <button className="text-muted-foreground hover:text-destructive" onClick={() => removeSavedShape(s.name)}>delete</button>
                  </>
                }
              >
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" className="accent-primary" checked={selectedSet.has(s.name)} onChange={() => toggleSelectedShape(s.name, true)} />
                  {/* Same letter the map draws on the shape. */}
                  <span className="tabular w-5 shrink-0 text-[10px] font-bold" style={{ color: s.color }} title="Label shown on the map">
                    {shapeLetter(i)}
                  </span>
                  <span style={{ color: s.color }}>{s.visible ? "●" : "○"}</span>
                  <strong>{s.name}</strong>
                </label>
              </ListRow>
            ))}
          </ul>
        </>
      )}
      {hydrated && shapes.length === 0 && (
        <p className="mt-2 text-[9px] text-muted-foreground/70">No shapes yet — paste GeoJSON above to add an overlay.</p>
      )}
    </SectionCard>
  );
}
