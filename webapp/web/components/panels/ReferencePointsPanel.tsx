"use client";

import { useState } from "react";
import { MapPin, Crosshair } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { SectionCard } from "@/components/console/SectionCard";
import { ListRow } from "@/components/console/ListRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

function nextName(existing: string[]): string {
  for (let i = 0; i < 26; i++) {
    const c = String.fromCharCode(65 + i);
    if (!existing.includes(c)) return c;
  }
  return `P${existing.length + 1}`;
}

export function ReferencePointsPanel() {
  const hydrated = useHydrated();
  const refPoints = useAppStore((s) => s.refPoints);
  const refVisible = useAppStore((s) => s.refVisible);
  const refOpacity = useAppStore((s) => s.refOpacity);
  const addRefPoint = useAppStore((s) => s.addRefPoint);
  const removeRefPoint = useAppStore((s) => s.removeRefPoint);
  const setRefVisible = useAppStore((s) => s.setRefVisible);
  const setRefOpacity = useAppStore((s) => s.setRefOpacity);

  const handle = useMapBridge((s) => s.handle);
  const picking = useMapBridge((s) => s.picking);

  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");

  const points = hydrated ? refPoints : [];

  const add = (la: number, lo: number) => {
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return;
    const nm = name.trim() || nextName(refPoints.map((p) => p.name));
    addRefPoint({ name: nm, lat: la, lon: lo });
    setName("");
    setLat("");
    setLon("");
    handle?.flyTo(la, lo);
  };

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-1.5"><MapPin size={12} /> Reference points</span>}
      index="01"
      meta={
        <Switch
          checked={refVisible}
          onCheckedChange={setRefVisible}
          aria-label="Show reference points on map"
        />
      }
    >
      <div className="grid grid-cols-[1fr_1.3fr_1.3fr] gap-1.5">
        <Input placeholder="A" value={name} onChange={(e) => setName(e.target.value)} className="h-8 tabular" />
        <Input placeholder="lat" value={lat} onChange={(e) => setLat(e.target.value)} className="h-8 tabular" inputMode="decimal" />
        <Input placeholder="lon" value={lon} onChange={(e) => setLon(e.target.value)} className="h-8 tabular" inputMode="decimal" />
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <Button className="flex-1" size="sm" onClick={() => add(parseFloat(lat), parseFloat(lon))}>
          Add point
        </Button>
        <Button
          variant={picking ? "default" : "secondary"}
          size="sm"
          className="flex-1"
          disabled={!handle}
          onClick={() =>
            picking ? handle?.cancelPick() : handle?.pickPoint((la, lo) => add(la, lo))
          }
        >
          <Crosshair size={13} /> {picking ? "Click map…" : "Pick on map"}
        </Button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Opacity</span>
        <Slider
          value={[Math.round(refOpacity * 100)]}
          max={100}
          step={1}
          onValueChange={(v) => setRefOpacity((Array.isArray(v) ? v[0] : v) / 100)}
          className="flex-1"
        />
        <span className="tabular w-8 text-right text-[10px] text-muted-foreground">
          {Math.round(refOpacity * 100)}%
        </span>
      </div>

      {points.length > 0 && (
        <ul className="mt-2">
          {points.map((p) => (
            <ListRow
              key={p.name}
              actions={
                <>
                  <button className="text-muted-foreground hover:text-primary" onClick={() => handle?.flyTo(p.lat, p.lon)}>zoom</button>
                  <button className="text-muted-foreground hover:text-destructive" onClick={() => removeRefPoint(p.name)}>delete</button>
                </>
              }
            >
              <span className="text-primary">{p.name}</span>{" "}
              <span className="tabular text-muted-foreground">{p.lat.toFixed(6)}, {p.lon.toFixed(6)}</span>
            </ListRow>
          ))}
        </ul>
      )}
      {hydrated && points.length === 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground/70">No points yet — add one or pick on the map.</p>
      )}
    </SectionCard>
  );
}
