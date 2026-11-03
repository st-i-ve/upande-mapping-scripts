"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Eye, Trash2, LocateFixed, Upload, Layers, X, Pencil } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { api, type TileJob } from "@/lib/api/client";
import { tileTemplate } from "@/lib/map/tileTemplate";
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
  const overlayTile = useAppStore((s) => s.overlayTile);
  const setOverlayTile = useAppStore((s) => s.setOverlayTile);
  const overlayOpacity = useAppStore((s) => s.overlayOpacity);
  const setOverlayOpacity = useAppStore((s) => s.setOverlayOpacity);

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
  const [templated, setTemplated] = useState(false);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  // A picked zip waits here to be named before it's saved as a layer.
  const [zip, setZip] = useState<File | null>(null);
  const [zipName, setZipName] = useState("");
  // Bytes sent so far; null when no upload is running. Full = the server is unpacking.
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const uploadAbort = useRef<AbortController | null>(null);
  const [renaming, setRenaming] = useState<{ slug: string; name: string } | null>(null);

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

  const pickZip = (file: File) => {
    setUploaded(null);
    setError(null);
    setZip(file);
    setZipName(file.name.replace(/\.zip$/i, "").replace(/[^A-Za-z0-9 _-]+/g, " ").trim().slice(0, 60));
  };

  // Save the picked zip (from the Tile Cache Inspector extension) as a layer under
  // the given name; a zip holding several layers (A, B, C…) becomes "<name> · A" etc.
  const doUpload = () => run(async () => {
    if (!zip) return;
    const ctl = new AbortController();
    uploadAbort.current = ctl;
    setProgress({ sent: 0, total: zip.size });
    try {
      const r = await api.uploadTileZip(zip, zipName.trim(), {
        onProgress: (sent, total) => setProgress({ sent, total }),
        signal: ctl.signal,
      });
      setZip(null);
      setUploaded(`Saved ${r.layers.map((l) => `${l.name} (${l.total.toLocaleString()} tiles)`).join(", ")}`);
      setLayers((await api.listTileLayers()).layers);
      // Straight onto the map, over the current imagery, ready to compare.
      if (r.layers[0]) setOverlayTile(r.layers[0].slug);
    } finally {
      setProgress(null);
      uploadAbort.current = null;
    }
  });

  const doRename = () => run(async () => {
    if (!renaming) return;
    await api.renameTileLayer(renaming.slug, renaming.name.trim());
    setRenaming(null);
    setLayers((await api.listTileLayers()).layers);
  });

  const remove = (slug: string) => run(async () => {
    await api.deleteTileLayer(slug);
    if (overlayTile === slug) setOverlayTile(null);
    setLayers((await api.listTileLayers()).layers);
  });

  const onUrl = (v: string) => {
    // A link to one tile becomes the pattern for the whole service.
    const t = tileTemplate(v.trim());
    setTemplated(t != null);
    setUrl(t ?? v);
    setCount(null);
    const f = formatOf(t ?? v);
    if (f) setFormat(f);
  };

  const overlay = layers.find((l) => l.slug === overlayTile) ?? null;
  const ready = !!url.trim() && !!handle;
  const tooMany = count ? count.count > count.max : false;

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-1.5"><Download size={14} /> Tile layers</span>}
      meta={active ? <span className="text-[11px] uppercase tracking-wider text-primary">downloading</span> : undefined}
    >
      <p className="mb-2 text-[12px] text-muted-foreground/70">
        Paste a tile service URL with <strong>{"{z}"}</strong>, <strong>{"{x}"}</strong> and{" "}
        <strong>{"{y}"}</strong> in it. The server downloads its tiles for an area into a layer
        of its own, listed under <strong>Imported layers</strong> in the maplisted in the map&apos;s layer menu with a ⬇.apos;s layer menu (top right), where you can rename it and zoom to it.
      </p>

      <label className="block text-[12px] text-muted-foreground">
        Tile URL
        <Input aria-label="Tile URL" placeholder="https://…/{z}/{x}/{y}.png" value={url}
          onChange={(e) => onUrl(e.target.value)} className="mt-1 h-9 text-[13px]" />
      </label>
      {templated && (
        <p className="mt-1 text-[11px] text-primary">
          That was one tile — turned its numbers into {"{z}/{x}/{y}"} so the whole area downloads.
          {!formatOf(url) && " Set the format: the link doesn't say."}
        </p>
      )}

      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        {url.includes("{s}") && (
          <label className="col-span-2 block text-[12px] text-muted-foreground">
            Subdomains for {"{s}"}
            <Input aria-label="Subdomains" value={subdomains} onChange={(e) => setSubdomains(e.target.value)} className="mt-1 h-9" />
          </label>
        )}
        <label className="block text-[12px] text-muted-foreground">
          Zoom from
          <Input aria-label="Minimum zoom" type="number" min={0} max={22} value={minZoom}
            onChange={(e) => { setMinZoom(+e.target.value); setCount(null); }} className="mt-1 h-9 tabular" />
        </label>
        <label className="block text-[12px] text-muted-foreground">
          to
          <Input aria-label="Maximum zoom" type="number" min={0} max={22} value={maxZoom}
            onChange={(e) => { setMaxZoom(+e.target.value); setCount(null); }} className="mt-1 h-9 tabular" />
        </label>
        <label className="block text-[12px] text-muted-foreground">
          Format
          <select aria-label="Tile format" value={format} onChange={(e) => setFormat(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-2 text-xs">
            {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label className="block text-[12px] text-muted-foreground">
          Layer name
          <Input aria-label="Layer name" placeholder="e.g. Mutara 2024" value={name}
            onChange={(e) => setName(e.target.value)} className="mt-1 h-9" />
        </label>
      </div>

      <div className="mt-2 flex gap-1 text-[12px]">
        <Button size="sm" variant={useShape && shape ? "default" : "secondary"} className="h-8 flex-1 text-[12px]"
          disabled={!shape} onClick={() => { setUseShape(true); setCount(null); }}
          title={shape ? undefined : "Select one saved shape to use it"}>
          {shape ? `Shape: ${shape.name}` : "Selected shape"}
        </Button>
        <Button size="sm" variant={useShape && shape ? "secondary" : "default"} className="h-8 flex-1 text-[12px]"
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
          <Download size={14} /> Download
        </Button>
      </div>
      {count && (
        <p className={`tabular mt-1.5 text-[12px] ${tooMany ? "text-destructive" : "text-muted-foreground"}`}>
          {count.count.toLocaleString()} tiles over {areaLabel}, about {mb(count.est_bytes)}
          {tooMany && ` — over the ${count.max.toLocaleString()} limit; narrow the area or zooms`}
        </p>
      )}

      <div className="mt-2.5 border-t border-border pt-2">
        <p className="mb-1.5 text-[12px] text-muted-foreground/70">
          Or save a tile zip from the <strong>Tile Cache Inspector</strong> extension (the puzzle
          piece at the foot of the tool rail) as a layer of your own, to lay over the map and compare.
        </p>
        <input ref={zipInput} type="file" accept=".zip,application/zip" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pickZip(f); }} />
        {!zip ? (
          <Button size="sm" variant="secondary" className="w-full" disabled={busy} onClick={() => zipInput.current?.click()}>
            <Upload size={14} /> Choose tiles zip
          </Button>
        ) : (
          <div className="rounded-md border border-border p-2">
            <p className="truncate text-[12px] text-muted-foreground" title={zip.name}>
              {zip.name} · {mb(zip.size)}
            </p>
            <label className="mt-1.5 block text-[12px] text-muted-foreground">
              Save as layer named
              <Input aria-label="Uploaded layer name" placeholder="e.g. Farm 2024 imagery" value={zipName}
                disabled={!!progress} onChange={(e) => setZipName(e.target.value)} className="mt-1 h-9" />
            </label>
            {progress ? (
              <div className="mt-2">
                <span className="block h-1.5 overflow-hidden rounded bg-muted">
                  <span className={`block h-full bg-primary transition-all ${progress.sent >= progress.total ? "animate-pulse" : ""}`}
                    style={{ width: `${progress.total ? Math.round((progress.sent / progress.total) * 100) : 0}%` }} />
                </span>
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="tabular">
                    {progress.sent >= progress.total
                      ? "Uploaded — unpacking tiles on the server…"
                      : `${mb(progress.sent)} of ${mb(progress.total)} · ${Math.round((progress.sent / progress.total) * 100)}%`}
                  </span>
                  {progress.sent < progress.total && (
                    <button className="hover:text-destructive" onClick={() => uploadAbort.current?.abort()}>Cancel</button>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-2 flex gap-1.5">
                <Button size="sm" variant="secondary" className="flex-1" onClick={() => setZip(null)}>Cancel</Button>
                <Button size="sm" className="flex-1" disabled={busy || !zipName.trim()} onClick={doUpload}>
                  <Upload size={14} /> Save as layer
                </Button>
              </div>
            )}
          </div>
        )}
        {uploaded && <p className="mt-1.5 text-[12px] text-primary">{uploaded}</p>}
      </div>
      {error && <p className="mt-1.5 text-[12px] text-destructive">{error}</p>}

      {layers.length > 0 && (
        <ul className="mt-2.5">
          {layers.map((l) => {
            const pct = l.total ? Math.round((l.current / l.total) * 100) : 0;
            const running = l.state === "starting" || l.state === "downloading";
            return (
              <ListRow key={l.slug} actions={
                <>
                  <button title="Show this layer" onClick={() => handle?.showTileLayer(l.slug)}><Eye size={13} /></button>
                  <button title={overlayTile === l.slug ? "Remove the overlay" : "Lay over the current map, to compare"}
                    className={overlayTile === l.slug ? "text-primary" : undefined}
                    onClick={() => setOverlayTile(overlayTile === l.slug ? null : l.slug)}>
                    <Layers size={13} />
                  </button>
                  <button title="Zoom to its area" onClick={() => handle?.fitGeometry(l.area.geometry)}><LocateFixed size={13} /></button>
                  <button title="Rename" onClick={() => setRenaming({ slug: l.slug, name: l.name })}><Pencil size={13} /></button>
                  <button title={running ? "Stop and delete" : "Delete these tiles"} className="hover:text-destructive"
                    onClick={() => window.confirm(`Delete the ${l.name} tiles from the server?`) && remove(l.slug)}>
                    <Trash2 size={13} />
                  </button>
                </>
              }>
                {renaming?.slug === l.slug ? (
                  <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); doRename(); }}>
                    <Input aria-label="New layer name" autoFocus value={renaming.name} className="h-7 text-[13px]"
                      onChange={(e) => setRenaming({ slug: l.slug, name: e.target.value })}
                      onKeyDown={(e) => e.key === "Escape" && setRenaming(null)} />
                    <Button type="submit" size="sm" className="h-7 px-2 text-[12px]" disabled={busy || !renaming.name.trim()}>Save</Button>
                  </form>
                ) : (
                  <span className="text-[13px] text-foreground">{l.name}</span>
                )}{" "}
                <span className="tabular text-[11px] text-muted-foreground/70">z{l.min_zoom}–{l.max_zoom}</span>
                <span className="tabular block text-[11px] text-muted-foreground/70">
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

      {overlay && (
        <div className="mt-2 rounded-md border border-primary/30 bg-primary/5 p-2">
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-foreground">
              <Layers size={12} className="mr-1 inline" />
              Overlay: <strong>{overlay.name}</strong>
            </span>
            <button title="Remove the overlay" className="text-muted-foreground hover:text-destructive"
              onClick={() => setOverlayTile(null)}>
              <X size={13} />
            </button>
          </div>
          <label className="mt-1.5 flex items-center gap-2 text-[12px] text-muted-foreground">
            Opacity
            <input aria-label="Overlay opacity" type="range" min={0} max={100} value={Math.round(overlayOpacity * 100)}
              onChange={(e) => setOverlayOpacity(+e.target.value / 100)} className="flex-1 accent-primary" />
            <span className="tabular w-7 text-right">{Math.round(overlayOpacity * 100)}%</span>
          </label>
          <p className="mt-1 text-[11px] text-muted-foreground/70">
            Pick the layer underneath from the map&apos;s layer menu (top right).
          </p>
        </div>
      )}
    </SectionCard>
  );
}
