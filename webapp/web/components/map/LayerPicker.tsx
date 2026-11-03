"use client";

import { useEffect, useRef, useState } from "react";
import { Layers, LocateFixed, Pencil, Check, X, ChevronDown, Blend, Download, Tags } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { api, type TileLayerInfo } from "@/lib/api/client";
import { Slider } from "@/components/ui/slider";

const ICON = "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary";

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="border-t border-border/60 px-1.5 pb-1.5 pt-2 first:border-0">
      <div className="mb-1 flex items-center justify-between px-1.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
        {title}
        {count != null && <span className="tabular font-normal">{count}</span>}
      </div>
      {children}
    </div>
  );
}

function Radio({ on }: { on: boolean }) {
  return (
    <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${on ? "border-primary" : "border-muted-foreground/50"}`}>
      {on && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
    </span>
  );
}

/** One imported (downloaded) layer: show it, rename it, zoom to it, lay it over the base map. */
function ImportedRow({ t }: { t: TileLayerInfo }) {
  const handle = useMapBridge((s) => s.handle);
  const on = useMapBridge((s) => s.activeBase === `tile:${t.slug}`);
  const overlayTile = useAppStore((s) => s.overlayTile);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(t.name);
  const [err, setErr] = useState<string | null>(null);
  const comparing = overlayTile === t.slug;

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

  const zoom = () => handle?.fitGeometry(t.area.geometry);
  const show = () => {
    handle?.setBase(`tile:${t.slug}`);
    zoom(); // it only covers its own area — go there, or the screen may be blank
  };

  return (
    <li className={`rounded-md px-1.5 py-1 ${on ? "bg-primary/10" : "hover:bg-muted/50"}`}>
      {renaming ? (
        <div className="flex items-center gap-1">
          <input autoFocus value={draft} aria-label="Layer name" onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => { if (e.key === "Enter") void rename(); if (e.key === "Escape") setRenaming(false); }}
            className="h-7 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-[13px] outline-none focus:border-primary" />
          <button className={ICON} aria-label="Save name" onClick={() => void rename()}><Check size={14} /></button>
          <button className={ICON} aria-label="Cancel rename" onClick={() => setRenaming(false)}><X size={14} /></button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={show} title={`Show ${t.name} as the base map`}>
            <Radio on={on} />
            <span className="min-w-0">
              <span className={`block truncate text-[13px] ${on ? "font-medium text-primary" : "text-foreground"}`}>{t.name}</span>
              <span className="tabular block text-[11px] text-muted-foreground">
                z{t.min_zoom}–{t.max_zoom}{t.state !== "done" && ` · ${t.state}`}
              </span>
            </span>
          </button>
          <button className={ICON} title="Zoom to this layer" aria-label={`Zoom to ${t.name}`} onClick={zoom}><LocateFixed size={14} /></button>
          <button className={`${ICON} ${comparing ? "bg-primary/15 text-primary" : ""}`}
            title={comparing ? "Stop laying it over the base map" : "Lay it over the base map, faded, to compare"}
            aria-label={`Compare ${t.name}`} aria-pressed={comparing}
            onClick={() => useAppStore.getState().setOverlayTile(comparing ? null : t.slug)}>
            <Blend size={14} />
          </button>
          <button className={ICON} title="Rename" aria-label={`Rename ${t.name}`} onClick={() => { setDraft(t.name); setRenaming(true); }}><Pencil size={13} /></button>
        </div>
      )}
      {err && <p className="mt-0.5 text-[11px] text-destructive">{err}</p>}
    </li>
  );
}

/**
 * The map's layer menu, in the console's own style: standard base maps, then the
 * layers you've imported (downloaded) — each with rename, zoom-to and compare —
 * then reference overlays. When an imported layer is on screen, a zoom button for
 * it sits next to the menu, because it only covers its own patch of ground.
 */
export function LayerPicker() {
  const handle = useMapBridge((s) => s.handle);
  const baseNames = useMapBridge((s) => s.baseNames);
  const activeBase = useMapBridge((s) => s.activeBase);
  const overlayNames = useMapBridge((s) => s.overlayNames);
  const activeOverlays = useMapBridge((s) => s.activeOverlays);
  const tileLayers = useAppStore((s) => s.tileLayers);
  const overlayTile = useAppStore((s) => s.overlayTile);
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

  const activeTile = activeBase.startsWith("tile:") ? tileLayers.find((t) => `tile:${t.slug}` === activeBase) : undefined;
  const current = activeTile?.name ?? activeBase.replace(/^base:/, "");
  const compare = tileLayers.find((t) => t.slug === overlayTile);

  return (
    <div ref={box} className="absolute right-3 top-3 z-[600] flex flex-col items-end gap-1.5"
      // Keep wheel/drag inside the menu from moving the map underneath.
      onWheel={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5">
        {activeTile && (
          <button onClick={() => handle?.fitGeometry(activeTile.area.geometry)}
            title={`Zoom to ${activeTile.name}`}
            className="flex h-10 items-center gap-1.5 rounded-lg border border-primary/40 bg-popover/90 px-3 text-[13px] font-medium text-primary shadow-lg backdrop-blur transition-colors hover:bg-primary/10">
            <LocateFixed size={15} /> Zoom to layer
          </button>
        )}
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Map layers"
          className={`flex h-10 max-w-64 items-center gap-2 rounded-lg border bg-popover/90 px-3 text-[13px] shadow-lg backdrop-blur transition-colors hover:border-primary/50 ${open ? "border-primary/60" : "border-border"}`}>
          <Layers size={16} className="shrink-0 text-primary" />
          <span className="truncate text-foreground">{current || "Layers"}</span>
          <ChevronDown size={14} className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="w-80 overflow-hidden rounded-xl border border-border bg-popover/95 shadow-2xl backdrop-blur-md">
          <div className="max-h-[70vh] overflow-y-auto">
            <Section title="Standard maps" count={baseNames.length}>
              {/* Its own scroll, so the imported layers below are always in view. */}
              <ul className="max-h-60 overflow-y-auto">
                {baseNames.map((n) => {
                  const on = activeBase === `base:${n}`;
                  return (
                    <li key={n}>
                      <button onClick={() => handle?.setBase(`base:${n}`)}
                        className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-[13px] ${on ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-muted/50"}`}>
                        <Radio on={on} /> <span className="truncate">{n}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Section>

            <Section title="Imported layers" count={tileLayers.length}>
              {tileLayers.length ? (
                <ul className="space-y-0.5">{tileLayers.map((t) => <ImportedRow key={t.slug} t={t} />)}</ul>
              ) : (
                <p className="flex items-center gap-1.5 px-1.5 py-1 text-[12px] text-muted-foreground">
                  <Download size={13} /> None yet — download one from the Export tab.
                </p>
              )}
              {compare && (
                <div className="mx-1.5 mt-1.5 rounded-md border border-border/60 p-2">
                  <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                    <span className="truncate">Comparing <strong className="text-foreground">{compare.name}</strong></span>
                    <span className="tabular">{Math.round(overlayOpacity * 100)}%</span>
                  </div>
                  <Slider className="mt-1.5" value={[Math.round(overlayOpacity * 100)]} max={100} step={1}
                    onValueChange={(v) => useAppStore.getState().setOverlayOpacity((Array.isArray(v) ? v[0] : v) / 100)} />
                </div>
              )}
            </Section>

            {overlayNames.length > 0 && (
              <Section title="Overlays">
                <ul>
                  {overlayNames.map((n) => {
                    const on = activeOverlays.includes(n);
                    return (
                      <li key={n}>
                        <button onClick={() => handle?.toggleOverlay(n)} aria-pressed={on}
                          className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-[13px] text-foreground hover:bg-muted/50">
                          <span className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50"}`}>
                            {on && <Check size={10} />}
                          </span>
                          <Tags size={13} className="text-muted-foreground" /> {n}
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
