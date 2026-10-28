"use client";

import { useEffect, useState } from "react";
import { Download, Eye, Trash2, LocateFixed } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { api, type TileJob } from "@/lib/api/client";
import { SectionCard } from "@/components/console/SectionCard";
import { ListRow } from "@/components/console/ListRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const FORMATS = ["png", "jpg", "jpeg", "gif"];

/** The image format a tile URL names, e.g. ".../{y}.jpg?key=" → "jpg". */
function formatOf(url: string): string | null {
  const m = url.split("?")[0].match(/\.(png|jpe?g|gif)$/i);
  return m ? m[1].toLowerCase() : null;
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;

/**
 * Tile layers — paste a tile service URL, pick an area and zooms, and the
 * server downloads those tiles (via the vendored map-tile-downloader) into a
 * layer of its own. Downloaded layers appear in the map's layer menu, marked ⬇,
 * and stay on the server for everyone.
 */
export function TileDownloadPanel() {
  const hydrated = useHydrated();
  const handle = useMapBridge((s) => s.handle);
  const savedShapes = useAppStore((s) => s.savedShapes);
  const selectedShapes = useAppStore((s) => s.selectedShapes);
  const layers = useAppStore((s) => s.tileLayers);
  const setLayers = useAppStore((s) => s.setTileLayers);

  const [url, setUrl] = useState("");
  const [subdomains, setSubdomains] = useState("a,b,c");
  const [format, setFormat] = useState("png");
  const [name, setName] = useState("");
  const [minZoom, setMinZoom] = useState(14);
  const [maxZoom, setMaxZoom] = useState(19);
  const [useShape, setUseShape] = useState(true);
  const [count, setCount] = useState<{ count: number; max: number; est_bytes: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shape = hydrated && selectedShapes.length === 1
    ? savedShapes.find((s) => s.name === selectedShapes[0]) ?? null
    : null;
  const areaLabel = useShape && shape ? shape.name : "the current map view";
  const active = layers.some((l) => l.state === "starting" || l.state === "downloading");

  // Load the server's layers, and keep polling while one is downloading.
  useEffect(() => {
    let stop = false;
    const load = () => api.listTileLayers().then((r) => !stop && setLayers(r.layers)).catch(() => {});
    load();
    const t = active ? setInterval(load, 1500) : undefined;
    return () => { stop = true; if (t) clearInterval(t); };
  }, [active, setLayers]);

  const job = (): TileJob | null => {
    const area = useShape && shape ? shape.geometry : handle?.viewPolygon();
    if (!area) return null;
    return {
      url: url.trim(),
      subdomains: url.includes("{s}") ? subdomains.split(",").map((s) => s.trim()).filter(Boolean) : [],
      min_zoom: minZoom,
      max_zoom: maxZoom,
      format,
      area,
    };
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const doCount = () => run(async () => {
    const j = job();
    if (j) setCount(await api.countTiles(j));
  });

  const doDownload = () => run(async () => {
    const j = job();
    if (!j) return;
    await api.downloadTiles({ ...j, name: name.trim() });
    setCount(null);
    setName("");
    setLayers((await api.listTileLayers()).layers);
  });

  const remove = (slug: string) => run(async () => {
    await api.deleteTileLayer(slug);
    setLayers((await api.listTileLayers()).layers);
  });

  const onUrl = (v: string) => {
    setUrl(v);
    setCount(null);
    const f = formatOf(v);
    if (f) setFormat(f);
  };

  const ready = !!url.trim() && !!handle;
  const tooMany = count ? count.count > count.max : false;

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-1.5"><Download size={12} /> Tile layers</span>}
      index="12"
      meta={active ? <span className="text-[8px] uppercase tracking-wider text-primary">downloading</span> : undefined}
    >
      <p className="mb-2 text-[9px] text-muted-foreground/70">
        Paste a tile service URL with <strong>{"{z}"}</strong>, <strong>{"{x}"}</strong> and{" "}
        <strong>{"{y}"}</strong> in it. The server downloads its tiles for an area into a layer
        of its own, listed in the map&apos;s layer menu with a ⬇.
      </p>

      <label className="block text-[9px] text-muted-foreground">
        Tile URL
        <Input aria-label="Tile URL" placeholder="https://…/{z}/{x}/{y}.png" value={url}
          onChange={(e) => onUrl(e.target.value)} className="mt-1 h-8 text-[10px]" />
      </label>

      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        {url.includes("{s}") && (
          <label className="col-span-2 block text-[9px] text-muted-foreground">
            Subdomains for {"{s}"}
            <Input aria-label="Subdomains" value={subdomains} onChange={(e) => setSubdomains(e.target.value)} className="mt-1 h-8" />
          </label>
        )}
        <label className="block text-[9px] text-muted-foreground">
          Zoom from
          <Input aria-label="Minimum zoom" type="number" min={0} max={22} value={minZoom}
            onChange={(e) => { setMinZoom(+e.target.value); setCount(null); }} className="mt-1 h-8 tabular" />
        </label>
        <label className="block text-[9px] text-muted-foreground">
          to
          <Input aria-label="Maximum zoom" type="number" min={0} max={22} value={maxZoom}
            onChange={(e) => { setMaxZoom(+e.target.value); setCount(null); }} className="mt-1 h-8 tabular" />
        </label>
        <label className="block text-[9px] text-muted-foreground">
          Format
          <select aria-label="Tile format" value={format} onChange={(e) => setFormat(e.target.value)}
            className="mt-1 h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs">
            {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label className="block text-[9px] text-muted-foreground">
          Layer name
          <Input aria-label="Layer name" placeholder="e.g. Mutara 2024" value={name}
            onChange={(e) => setName(e.target.value)} className="mt-1 h-8" />
        </label>
      </div>

      <div className="mt-2 flex gap-1 text-[9px]">
        <Button size="sm" variant={useShape && shape ? "default" : "secondary"} className="h-7 flex-1 text-[9px]"
          disabled={!shape} onClick={() => { setUseShape(true); setCount(null); }}
          title={shape ? undefined : "Select one saved shape to use it"}>
          {shape ? `Shape: ${shape.name}` : "Selected shape"}
        </Button>
        <Button size="sm" variant={useShape && shape ? "secondary" : "default"} className="h-7 flex-1 text-[9px]"
          onClick={() => { setUseShape(false); setCount(null); }}>
          Map view
        </Button>
      </div>

      <div className="mt-2 flex gap-1.5">
        <Button size="sm" variant="secondary" className="flex-1" disabled={!ready || busy} onClick={doCount}>
          Count tiles
        </Button>
        <Button size="sm" className="flex-1" disabled={!ready || busy || !name.trim() || !count || tooMany} onClick={doDownload}
          title={!count ? "Count first, so you see the size" : undefined}>
          <Download size={12} /> Download
        </Button>
      </div>
      {count && (
        <p className={`tabular mt-1.5 text-[9px] ${tooMany ? "text-destructive" : "text-muted-foreground"}`}>
          {count.count.toLocaleString()} tiles over {areaLabel}, about {mb(count.est_bytes)}
          {tooMany && ` — over the ${count.max.toLocaleString()} limit; narrow the area or zooms`}
        </p>
      )}
      {error && <p className="mt-1.5 text-[9px] text-destructive">{error}</p>}

      {layers.length > 0 && (
        <ul className="mt-2.5">
          {layers.map((l) => {
            const pct = l.total ? Math.round((l.current / l.total) * 100) : 0;
            const running = l.state === "starting" || l.state === "downloading";
            return (
              <ListRow key={l.slug} actions={
                <>
                  <button title="Show this layer" onClick={() => handle?.showTileLayer(l.slug)}><Eye size={11} /></button>
                  <button title="Zoom to its area" onClick={() => handle?.fitGeometry(l.area.geometry)}><LocateFixed size={11} /></button>
                  <button title={running ? "Stop and delete" : "Delete these tiles"} className="hover:text-destructive"
                    onClick={() => window.confirm(`Delete the ${l.name} tiles from the server?`) && remove(l.slug)}>
                    <Trash2 size={11} />
                  </button>
                </>
              }>
                <span className="text-[10px] text-foreground">{l.name}</span>{" "}
                <span className="tabular text-[8px] text-muted-foreground/70">z{l.min_zoom}–{l.max_zoom}</span>
                <span className="tabular block text-[8px] text-muted-foreground/70">
                  {running ? `${l.current.toLocaleString()} / ${l.total.toLocaleString()} tiles · ${pct}%`
                    : l.state === "done" ? `${l.total.toLocaleString()} tiles`
                    : l.state === "stopped" ? `stopped at ${l.current.toLocaleString()} / ${l.total.toLocaleString()}`
                    : "failed"}
                  {l.failed > 0 && <span className="text-destructive"> · {l.failed} missing</span>}
                </span>
                {running && (
                  <span className="mt-0.5 block h-1 overflow-hidden rounded bg-muted">
                    <span className="block h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </span>
                )}
              </ListRow>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
