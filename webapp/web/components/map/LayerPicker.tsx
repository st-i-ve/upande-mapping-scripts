"use client";

import { useEffect, useRef, useState } from "react";
import { Layers, LocateFixed, Pencil, Check, X, ChevronDown, Download, Tags } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { api, type TileLayerInfo } from "@/lib/api/client";
import { Slider } from "@/components/ui/slider";

const ICON = "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border/60 px-1.5 pb-1.5 pt-2 first:border-0">
      <div className="mb-1 flex items-baseline justify-between gap-2 px-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">{title}</span>
        {hint && <span className="truncate text-[10px] text-muted-foreground/70">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Radio({ on }: { on: boolean }) {
  return (
    <span className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-full border ${on ? "border-primary" : "border-muted-foreground/50"}`}>
      {on && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
    </span>
  );
}

function Tick({ on }: { on: boolean }) {
  return (
    <span className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-[3px] border ${on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50"}`}>
      {on && <Check size={9} strokeWidth={3} />}
    </span>
  );
}

const fitLayer = (t: TileLayerInfo) => useMapBridge.getState().handle?.fitGeometry(t.area.geometry);

/** One imported layer: tick to draw it over the base map; rename it; zoom to it. */
function ImportedRow({ t }: { t: TileLayerInfo }) {
  const on = useAppStore((s) => s.overlayTiles.includes(t.slug));
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(t.name);
  const [err, setErr] = useState<string | null>(null);

  const rename = async () => {
    const name = draft.trim();
    if (!name || name === t.name) return setRenaming(false);
    try {
      const r = await api.renameTileLayer(t.slug, name);
      const st = useAppStore.getState();
      st.setTileLayers(st.tileLayers.map((l) => (l.slug === t.slug ? { ...l, ...r } : l)));
      setRenaming(false);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const toggle = () => {
    useAppStore.getState().setOverlayTileOn(t.slug, !on);
    if (!on) fitLayer(t); // it only covers its own patch — go there, or nothing shows
  };

  return (
    <li className={`rounded-md px-1.5 py-1 ${on ? "bg-primary/10" : "hover:bg-muted/50"}`}>
      {renaming ? (
        <div className="flex items-center gap-1">
          <input autoFocus value={draft} aria-label="Layer name" onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => { if (e.key === "Enter") void rename(); if (e.key === "Escape") setRenaming(false); }}
            className="h-6 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-[11px] outline-none focus:border-primary" />
          <button className={ICON} aria-label="Save name" onClick={() => void rename()}><Check size={12} /></button>
          <button className={ICON} aria-label="Cancel rename" onClick={() => setRenaming(false)}><X size={12} /></button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={toggle} aria-pressed={on}
            title={on ? `Hide ${t.name}` : `Show ${t.name} on top of the base map`}>
            <Tick on={on} />
            <span className="min-w-0">
              <span className={`block truncate text-[11px] ${on ? "font-medium text-primary" : "text-foreground"}`}>{t.name}</span>
              <span className="tabular block text-[9px] text-muted-foreground">
                z{t.min_zoom}–{t.max_zoom}{t.state !== "done" && ` · ${t.state}`}
              </span>
            </span>
          </button>
          <button className={ICON} title="Zoom to this layer" aria-label={`Zoom to ${t.name}`} onClick={() => fitLayer(t)}><LocateFixed size={12} /></button>
          <button className={ICON} title="Rename" aria-label={`Rename ${t.name}`} onClick={() => { setDraft(t.name); setRenaming(true); }}><Pencil size={11} /></button>
        </div>
      )}
      {err && <p className="mt-0.5 text-[9px] text-destructive">{err}</p>}
    </li>
  );
}

/**
 * The map's layer menu, in the console's own style. Pick ONE standard map as the
 * base, then tick any imported (downloaded) layers to draw on top of it — both
 * at once. While imported layers are on, a zoom button for them sits beside the
 * menu, because each only covers its own patch of ground.
 */
export function LayerPicker() {
  const handle = useMapBridge((s) => s.handle);
  const baseNames = useMapBridge((s) => s.baseNames);
  const activeBase = useMapBridge((s) => s.activeBase);
  const overlayNames = useMapBridge((s) => s.overlayNames);
  const activeOverlays = useMapBridge((s) => s.activeOverlays);
  const tileLayers = useAppStore((s) => s.tileLayers);
  const overlayTiles = useAppStore((s) => s.overlayTiles);
  const overlayOpacity = useAppStore((s) => s.overlayOpacity);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // The map needs the imported layers whichever tab is open — load them here, and
  // again whenever the menu opens so a just-finished download shows up.
  useEffect(() => {
    api.listTileLayers().then((r) => useAppStore.getState().setTileLayers(r.layers)).catch(() => {});
  }, [open]);

  // Click anywhere else (the map included) closes it.
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const base = activeBase.replace(/^base:/, "");
  const shown = overlayTiles.map((s) => tileLayers.find((t) => t.slug === s)).filter((t): t is TileLayerInfo => !!t);
  const label = shown.length ? `${base} + ${shown.length === 1 ? shown[0].name : `${shown.length} imported`}` : base;

  const zoomToShown = () => {
    if (shown.length === 1) return fitLayer(shown[0]);
    handle?.fitGeometry({ type: "GeometryCollection", geometries: shown.map((t) => t.area.geometry) } as never);
  };

  return (
    <div ref={box} className="absolute right-3 top-3 z-[600] flex flex-col items-end gap-1.5"
      // Keep wheel/drag inside the menu from moving the map underneath.
      onWheel={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5">
        {shown.length > 0 && (
          <button onClick={zoomToShown} title={`Zoom to ${shown.map((t) => t.name).join(", ")}`}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-primary/40 bg-popover/90 px-2.5 text-[11px] font-medium text-primary shadow-lg backdrop-blur transition-colors hover:bg-primary/10">
            <LocateFixed size={13} /> Zoom to imported
          </button>
        )}
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Map layers"
          className={`flex h-8 max-w-72 items-center gap-2 rounded-lg border bg-popover/90 px-2.5 text-[11px] shadow-lg backdrop-blur transition-colors hover:border-primary/50 ${open ? "border-primary/60" : "border-border"}`}>
          <Layers size={14} className="shrink-0 text-primary" />
          <span className="truncate text-foreground">{label || "Layers"}</span>
          <ChevronDown size={12} className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="w-72 overflow-hidden rounded-xl border border-border bg-popover/95 shadow-2xl backdrop-blur-md">
          <div className="max-h-[75vh] overflow-y-auto">
            <Section title="1 · Standard map" hint="pick one">
              {/* Its own scroll, so the imported layers below are always in view. */}
              <ul className="max-h-48 overflow-y-auto">
                {baseNames.map((n) => {
                  const on = activeBase === `base:${n}`;
                  return (
                    <li key={n}>
                      <button onClick={() => handle?.setBase(`base:${n}`)}
                        className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11px] ${on ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-muted/50"}`}>
                        <Radio on={on} /> <span className="truncate">{n}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Section>

            <Section title="2 · Imported layers" hint="on top · tick any">
              {tileLayers.length ? (
                <ul className="space-y-0.5">{tileLayers.map((t) => <ImportedRow key={t.slug} t={t} />)}</ul>
              ) : (
                <p className="flex items-center gap-1.5 px-1.5 py-1 text-[10px] text-muted-foreground">
                  <Download size={11} /> None yet — download one from the Export tab.
                </p>
              )}
              {shown.length > 0 && (
                <div className="mx-1.5 mt-1.5 rounded-md border border-border/60 p-2">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Imported layer opacity</span>
                    <span className="tabular">{Math.round(overlayOpacity * 100)}%</span>
                  </div>
                  <Slider className="mt-1.5" value={[Math.round(overlayOpacity * 100)]} max={100} step={1}
                    onValueChange={(v) => useAppStore.getState().setOverlayOpacity((Array.isArray(v) ? v[0] : v) / 100)} />
                </div>
              )}
            </Section>

            {overlayNames.length > 0 && (
              <Section title="Labels">
                <ul>
                  {overlayNames.map((n) => {
                    const on = activeOverlays.includes(n);
                    return (
                      <li key={n}>
                        <button onClick={() => handle?.toggleOverlay(n)} aria-pressed={on}
                          className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11px] text-foreground hover:bg-muted/50">
                          <Tick on={on} />
                          <Tags size={11} className="text-muted-foreground" /> {n}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
