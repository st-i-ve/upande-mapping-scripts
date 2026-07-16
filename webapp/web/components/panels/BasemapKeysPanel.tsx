"use client";

import { useEffect, useState } from "react";
import { KeyRound, Check } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { SectionCard } from "@/components/console/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PROVIDERS = [
  { key: "mapbox", label: "Mapbox", hint: "access token" },
  { key: "maptiler", label: "MapTiler", hint: "key" },
  { key: "stadia", label: "Stadia", hint: "api key" },
] as const;

export function BasemapKeysPanel() {
  const hydrated = useHydrated();
  const basemapKeys = useAppStore((s) => s.basemapKeys);
  const setBasemapKeys = useAppStore((s) => s.setBasemapKeys);

  const [draft, setDraft] = useState({ mapbox: "", maptiler: "", stadia: "" });
  const [saved, setSaved] = useState(false);

  // Sync the draft from the store once hydrated.
  useEffect(() => {
    if (hydrated) {
      setDraft({
        mapbox: basemapKeys.mapbox ?? "",
        maptiler: basemapKeys.maptiler ?? "",
        stadia: basemapKeys.stadia ?? "",
      });
    }
  }, [hydrated, basemapKeys.mapbox, basemapKeys.maptiler, basemapKeys.stadia]);

  const save = () => {
    setBasemapKeys({
      mapbox: draft.mapbox.trim() || undefined,
      maptiler: draft.maptiler.trim() || undefined,
      stadia: draft.stadia.trim() || undefined,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-1.5"><KeyRound size={12} /> Basemap keys</span>}
      index="08"
    >
      <p className="mb-2 text-[9px] text-muted-foreground/70">
        Add provider keys to unlock their satellite layers in the layer control.
        Stored locally in your browser only.
      </p>
      <div className="space-y-2">
        {PROVIDERS.map((p) => (
          <label key={p.key} className="block text-[9px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              {p.label}
              {hydrated && basemapKeys[p.key] && <Check size={11} className="text-primary" />}
            </span>
            <Input
              type="password"
              autoComplete="off"
              placeholder={p.hint}
              value={draft[p.key]}
              onChange={(e) => setDraft((d) => ({ ...d, [p.key]: e.target.value }))}
              className="mt-1 h-8 tabular"
            />
          </label>
        ))}
      </div>
      <Button size="sm" className="mt-2.5 w-full" onClick={save}>
        {saved ? "Saved ✓" : "Save keys"}
      </Button>
    </SectionCard>
  );
}
