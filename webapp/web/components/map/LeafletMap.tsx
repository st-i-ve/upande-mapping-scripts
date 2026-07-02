"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import type { GeoGeometry } from "@/lib/types";

const DEFAULT_CENTER: L.LatLngExpression = [0.0686, 35.748];
const DEFAULT_ZOOM = 16;
const ACCENT = "#34d399";

export default function LeafletMap() {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const refLayerRef = useRef<L.LayerGroup | null>(null);
  const shapeLayerRef = useRef<L.LayerGroup | null>(null);
  const pickCbRef = useRef<((lat: number, lon: number) => void) | null>(null);

  const [coords, setCoords] = useState("—");
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  const refPoints = useAppStore((s) => s.refPoints);
  const refVisible = useAppStore((s) => s.refVisible);
  const refOpacity = useAppStore((s) => s.refOpacity);
  const savedShapes = useAppStore((s) => s.savedShapes);
  const shapesVisible = useAppStore((s) => s.shapesVisible);
  const shapeOpacity = useAppStore((s) => s.shapeOpacity);
  const workingPolygon = useAppStore((s) => s.workingPolygon);
  const genResult = useAppStore((s) => s.genResult);
  const setHandle = useMapBridge((s) => s.setHandle);
  const setPicking = useMapBridge((s) => s.setPicking);

  const workingLayerRef = useRef<L.LayerGroup | null>(null);
  const genLayerRef = useRef<L.LayerGroup | null>(null);

  // ---- map bootstrap (once) ----
  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;

    const map = L.map(hostRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });
    mapRef.current = map;

    const dark = L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { maxZoom: 22, attribution: "&copy; OSM &copy; CARTO" },
    );
    const satellite = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 22, attribution: "Tiles &copy; Esri" },
    );
    const streets = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { maxZoom: 19, attribution: "&copy; OpenStreetMap" },
    );
    dark.addTo(map);
    L.control
      .layers({ "Dark (CARTO)": dark, Satellite: satellite, Streets: streets }, {}, { position: "topright" })
      .addTo(map);
    L.control.scale({ position: "bottomleft", imperial: false }).addTo(map);

    shapeLayerRef.current = L.layerGroup().addTo(map);
    workingLayerRef.current = L.layerGroup().addTo(map);
    genLayerRef.current = L.layerGroup().addTo(map);
    refLayerRef.current = L.layerGroup().addTo(map);

    const onMove = () => {
      const c = map.getCenter();
      setCoords(`${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`);
      setZoom(map.getZoom());
    };
    onMove();
    map.on("move zoom", onMove);

    map.on("click", (e: L.LeafletMouseEvent) => {
      const cb = pickCbRef.current;
      if (cb) {
        pickCbRef.current = null;
        setPicking(false);
        L.DomUtil.removeClass(map.getContainer(), "picking");
        cb(e.latlng.lat, e.latlng.lng);
      }
    });

    // Register the imperative command handle for panels.
    setHandle({
      flyTo: (lat, lon, z) => map.flyTo([lat, lon], z ?? Math.max(map.getZoom(), 18)),
      fitGeometry: (geom: GeoGeometry) => {
        try {
          const b = L.geoJSON(geom as never).getBounds();
          if (b.isValid()) map.fitBounds(b, { padding: [28, 28] });
        } catch {
          /* ignore bad geometry */
        }
      },
      pickPoint: (cb) => {
        pickCbRef.current = cb;
        setPicking(true);
        L.DomUtil.addClass(map.getContainer(), "picking");
      },
      cancelPick: () => {
        pickCbRef.current = null;
        setPicking(false);
        L.DomUtil.removeClass(map.getContainer(), "picking");
      },
      isPicking: () => pickCbRef.current != null,
    });

    return () => {
      map.off();
      map.remove();
      mapRef.current = null;
      setHandle(null);
    };
  }, [setHandle, setPicking]);

  // ---- reference-point markers ----
  useEffect(() => {
    const grp = refLayerRef.current;
    if (!grp) return;
    grp.clearLayers();
    if (!refVisible) return;
    for (const p of refPoints) {
      const color = p.color || ACCENT;
      L.circleMarker([p.lat, p.lon], {
        radius: 6,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: refOpacity,
      })
        .bindTooltip(p.name, { permanent: true, direction: "right", className: "ref-tip" })
        .addTo(grp);
    }
  }, [refPoints, refVisible, refOpacity]);

  // ---- saved-shape overlays ----
  useEffect(() => {
    const grp = shapeLayerRef.current;
    if (!grp) return;
    grp.clearLayers();
    if (!shapesVisible) return;
    for (const s of savedShapes) {
      if (!s.visible) continue;
      const color = s.color || ACCENT;
      L.geoJSON(s.geometry as never, {
        style: { color, weight: 2, fillColor: color, fillOpacity: shapeOpacity },
      }).addTo(grp);
    }
  }, [savedShapes, shapesVisible, shapeOpacity]);

  // ---- working polygon (dashed outline of what will be generated) ----
  useEffect(() => {
    const grp = workingLayerRef.current;
    if (!grp) return;
    grp.clearLayers();
    if (!workingPolygon) return;
    L.geoJSON(workingPolygon as never, {
      style: { color: ACCENT, weight: 2, dashArray: "5 4", fill: false },
    }).addTo(grp);
  }, [workingPolygon]);

  // ---- generated beds & zones ----
  useEffect(() => {
    const grp = genLayerRef.current;
    if (!grp) return;
    grp.clearLayers();
    if (!genResult) return;
    L.geoJSON(genResult as never, {
      style: (feature) => {
        const kind = (feature?.properties as { kind?: string })?.kind;
        if (kind === "zone") return { color: "#34d399", weight: 1.5, opacity: 0.95 };
        if (kind === "bed") return { color: "#38bdf8", weight: 1, fillColor: "#38bdf8", fillOpacity: 0.12 };
        return { color: "#fbbf24", weight: 1.2, fillOpacity: 0.05 };
      },
      onEachFeature: (feature, layer) => {
        const p = (feature.properties ?? {}) as { bed_id?: string; block_id?: string; kind?: string };
        const label = [p.block_id, p.bed_id].filter(Boolean).join(" · ");
        if (label) layer.bindTooltip(label, { sticky: true, className: "ref-tip" });
      },
    }).addTo(grp);
  }, [genResult]);

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full" />
      <div className="pointer-events-none absolute bottom-3 right-3 z-[500] rounded-md border border-border/60 bg-popover/85 px-2.5 py-1 text-[11px] text-muted-foreground shadow-lg backdrop-blur tabular">
        <span className="text-primary">◍</span> {coords}
        <span className="mx-1.5 opacity-40">·</span>z{zoom}
      </div>
    </div>
  );
}
