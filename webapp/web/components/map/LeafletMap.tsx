"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { buildBaseLayers, buildKeyedLayers, addWayback } from "@/lib/map/baseLayers";
import type { GeoGeometry } from "@/lib/types";

const DEFAULT_CENTER: L.LatLngExpression = [0.0686, 35.748];
const DEFAULT_ZOOM = 16;
const ACCENT = "#e5e5e5";

export default function LeafletMap() {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const refLayerRef = useRef<L.LayerGroup | null>(null);
  const shapeLayerRef = useRef<L.LayerGroup | null>(null);
  const pickCbRef = useRef<((lat: number, lon: number) => void) | null>(null);
  const edgePickRef = useRef<{ ring: [number, number][]; cb: (idx: number | null) => void } | null>(null);

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
  const treeGrid = useAppStore((s) => s.treeGrid);
  const triad = useAppStore((s) => s.triad);
  const triadHexes = useAppStore((s) => s.triadHexes);
  const terraceResult = useAppStore((s) => s.terraceResult);
  const terraceCorners = useAppStore((s) => s.terraceCorners);
  const setHandle = useMapBridge((s) => s.setHandle);
  const setPicking = useMapBridge((s) => s.setPicking);

  const basemapKeys = useAppStore((s) => s.basemapKeys);

  const workingLayerRef = useRef<L.LayerGroup | null>(null);
  const genLayerRef = useRef<L.LayerGroup | null>(null);
  const treeLayerRef = useRef<L.LayerGroup | null>(null);
  const triadLayerRef = useRef<L.LayerGroup | null>(null);
  const terraceLayerRef = useRef<L.LayerGroup | null>(null);
  const cornerLayerRef = useRef<L.LayerGroup | null>(null);
  const layerControlRef = useRef<L.Control.Layers | null>(null);
  const keyedRef = useRef<Record<string, L.Layer>>({});

  // ---- map bootstrap (once) ----
  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;

    const map = L.map(hostRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });
    mapRef.current = map;

    // Full base-layer set (ported from the vanilla app), default Google Satellite.
    const { baseLayers, defaultLayer } = buildBaseLayers();
    defaultLayer.addTo(map);
    const layerControl = L.control
      .layers(baseLayers, {}, { position: "topright", collapsed: true })
      .addTo(map);
    layerControlRef.current = layerControl;
    addWayback(layerControl);
    L.control.scale({ position: "bottomleft", imperial: false }).addTo(map);

    shapeLayerRef.current = L.layerGroup().addTo(map);
    workingLayerRef.current = L.layerGroup().addTo(map);
    terraceLayerRef.current = L.layerGroup().addTo(map);
    cornerLayerRef.current = L.layerGroup().addTo(map);
    genLayerRef.current = L.layerGroup().addTo(map);
    triadLayerRef.current = L.layerGroup().addTo(map);
    treeLayerRef.current = L.layerGroup().addTo(map);
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
        return;
      }
      const ep = edgePickRef.current;
      if (ep) {
        edgePickRef.current = null;
        setPicking(false);
        L.DomUtil.removeClass(map.getContainer(), "picking");
        // Nearest polygon edge in screen space (30px tolerance) — matches vanilla.
        const click = map.latLngToLayerPoint(e.latlng);
        let bestI: number | null = null;
        let bestD = Infinity;
        for (let i = 0; i < ep.ring.length - 1; i++) {
          const a = map.latLngToLayerPoint(L.latLng(ep.ring[i][1], ep.ring[i][0]));
          const b = map.latLngToLayerPoint(L.latLng(ep.ring[i + 1][1], ep.ring[i + 1][0]));
          const d = L.LineUtil.pointToSegmentDistance(click, a, b);
          if (d < bestD) { bestD = d; bestI = i; }
        }
        ep.cb(bestD < 30 ? bestI : null);
      }
    });

    // ---- Geoman shape builder ----
    const drawnGroup = L.featureGroup().addTo(map);
    const drawnRef = { layer: null as L.Layer | null };
    const syncDrawn = () => {
      const lyr = drawnRef.layer as { toGeoJSON?: () => { geometry: unknown } } | null;
      const geom = lyr?.toGeoJSON?.().geometry ?? null;
      useAppStore.getState().setDrawnGeometry(geom as never);
    };
    map.pm.setGlobalOptions({ snappable: true, snapDistance: 15 });
    map.on("pm:create", (e: { layer: L.Layer }) => {
      if (drawnRef.layer) drawnGroup.removeLayer(drawnRef.layer);
      drawnRef.layer = e.layer;
      drawnGroup.addLayer(e.layer);
      if ("setStyle" in e.layer) (e.layer as L.Path).setStyle({ color: ACCENT, weight: 2, fillOpacity: 0.1 });
      e.layer.on("pm:edit pm:dragend", syncDrawn);
      syncDrawn();
      map.pm.disableDraw();
    });
    map.on("pm:remove", () => {
      drawnRef.layer = null;
      useAppStore.getState().setDrawnGeometry(null);
    });

    // ---- freehand pencil: drag to sketch a polygon → becomes the drawn shape ----
    let fhActive = false;
    let fhPts: L.LatLng[] = [];
    let fhTemp: L.Polyline | null = null;
    const fhMove = (e: L.LeafletMouseEvent) => {
      fhPts.push(e.latlng);
      fhTemp?.setLatLngs(fhPts);
    };
    const fhUp = () => {
      map.off("mousemove", fhMove);
      map.off("mouseup", fhUp);
      if (fhTemp) { map.removeLayer(fhTemp); fhTemp = null; }
      if (fhPts.length >= 3) {
        if (drawnRef.layer) drawnGroup.removeLayer(drawnRef.layer);
        const poly = L.polygon(fhPts, { color: ACCENT, weight: 2, fillOpacity: 0.1 });
        drawnGroup.addLayer(poly);
        drawnRef.layer = poly;
        poly.on("pm:edit pm:dragend", syncDrawn);
        syncDrawn();
      }
      fhPts = [];
    };
    const fhDown = (e: L.LeafletMouseEvent) => {
      fhPts = [e.latlng];
      fhTemp = L.polyline(fhPts, { color: ACCENT, weight: 2, dashArray: "4 3" }).addTo(map);
      map.on("mousemove", fhMove);
      map.on("mouseup", fhUp);
    };
    const disableFreehand = () => {
      if (!fhActive) return;
      fhActive = false;
      map.dragging.enable();
      L.DomUtil.removeClass(map.getContainer(), "picking");
      map.off("mousedown", fhDown);
      map.off("mousemove", fhMove);
      map.off("mouseup", fhUp);
      if (fhTemp) { map.removeLayer(fhTemp); fhTemp = null; }
    };
    const enableFreehand = () => {
      knStop();
      fhActive = true;
      map.pm.disableDraw();
      map.pm.disableGlobalEditMode();
      map.pm.disableGlobalDragMode();
      map.pm.disableGlobalRemovalMode();
      map.dragging.disable();
      L.DomUtil.addClass(map.getContainer(), "picking");
      map.on("mousedown", fhDown);
    };

    // ---- knife: capture a cut line (freehand drag OR clicked points) ----
    let knPts: L.LatLng[] = [];
    let knTemp: L.Polyline | null = null;
    let knOnChange: ((line: [number, number][]) => void) | null = null;
    const knCoords = (): [number, number][] => knPts.map((p) => [p.lng, p.lat]);
    const knRedraw = () => {
      if (knTemp) knTemp.setLatLngs(knPts);
      else knTemp = L.polyline(knPts, { color: "#ffffff", weight: 2, dashArray: "6 4" }).addTo(map);
    };
    function knStop() {
      knOnChange = null;
      knPts = [];
      map.off("mousedown", knDown);
      map.off("mousemove", knMove);
      map.off("mouseup", knUp);
      map.off("click", knClick);
      map.dragging.enable();
      L.DomUtil.removeClass(map.getContainer(), "picking");
      if (knTemp) { map.removeLayer(knTemp); knTemp = null; }
    }
    const knMove = (e: L.LeafletMouseEvent) => { knPts.push(e.latlng); knRedraw(); };
    const knUp = () => {
      map.off("mousemove", knMove);
      map.off("mouseup", knUp);
      const line = knCoords();
      const cb = knOnChange;
      knStop();
      cb?.(line);
    };
    const knDown = (e: L.LeafletMouseEvent) => {
      knPts = [e.latlng];
      knRedraw();
      map.on("mousemove", knMove);
      map.on("mouseup", knUp);
    };
    const knClick = (e: L.LeafletMouseEvent) => { knPts.push(e.latlng); knRedraw(); knOnChange?.(knCoords()); };
    const knifeStartCommon = () => {
      disableFreehand();
      map.pm.disableDraw();
      map.pm.disableGlobalEditMode();
      map.pm.disableGlobalDragMode();
      map.pm.disableGlobalRemovalMode();
      knStop();
      L.DomUtil.addClass(map.getContainer(), "picking");
    };

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
      pickEdge: (ring, cb) => {
        edgePickRef.current = { ring, cb };
        setPicking(true);
        L.DomUtil.addClass(map.getContainer(), "picking");
      },
      draw: (shape) => {
        disableFreehand();
        map.pm.disableGlobalEditMode();
        map.pm.disableGlobalDragMode();
        map.pm.disableGlobalRemovalMode();
        map.pm.enableDraw(shape, { pathOptions: { color: ACCENT, weight: 2, fillOpacity: 0.1 } });
      },
      editMode: () => { disableFreehand(); map.pm.toggleGlobalEditMode(); },
      dragMode: () => { disableFreehand(); map.pm.toggleGlobalDragMode(); },
      eraseMode: () => { disableFreehand(); map.pm.toggleGlobalRemovalMode(); },
      freehand: () => { if (fhActive) disableFreehand(); else enableFreehand(); },
      knifeFreehand: (onLine) => {
        knifeStartCommon();
        knOnChange = onLine;
        map.dragging.disable();
        map.on("mousedown", knDown);
      },
      knifePointMode: (onChange) => {
        knifeStartCommon();
        knOnChange = onChange;
        map.on("click", knClick);
      },
      knifeStop: () => knStop(),
      stopModes: () => {
        disableFreehand();
        knStop();
        map.pm.disableDraw();
        map.pm.disableGlobalEditMode();
        map.pm.disableGlobalDragMode();
        map.pm.disableGlobalRemovalMode();
      },
      clearDrawn: () => {
        if (drawnRef.layer) drawnGroup.removeLayer(drawnRef.layer);
        drawnRef.layer = null;
        useAppStore.getState().setDrawnGeometry(null);
      },
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
        if (kind === "zone") return { color: "#e5e5e5", weight: 1.5, opacity: 0.95 };
        if (kind === "bed") return { color: "#9aa0a6", weight: 1, fillColor: "#9aa0a6", fillOpacity: 0.12 };
        return { color: "#f5f5f5", weight: 1.2, fillOpacity: 0.05 };
      },
      onEachFeature: (feature, layer) => {
        const p = (feature.properties ?? {}) as { bed_id?: string; block_id?: string; kind?: string };
        const label = [p.block_id, p.bed_id].filter(Boolean).join(" · ");
        if (label) layer.bindTooltip(label, { sticky: true, className: "ref-tip" });
      },
    }).addTo(grp);
  }, [genResult]);

  // ---- terrace sections / blocks / cuts ----
  useEffect(() => {
    const grp = terraceLayerRef.current;
    if (!grp) return;
    grp.clearLayers();
    if (!terraceResult) return;
    L.geoJSON(terraceResult as never, {
      style: (feature) => {
        const kind = (feature?.properties as { kind?: string })?.kind;
        if (kind === "chain_edge")
          return { color: "#f5f5f5", weight: 4, opacity: 0.9 };
        if (kind === "cut")
          return { color: "#9aa0a6", weight: 2, dashArray: "5 4" };
        if (kind === "block")
          return { color: "#d4d4d4", weight: 2.5, fillOpacity: 0 };
        // section
        return { color: "#b8b8b8", weight: 1, fillColor: "#b8b8b8", fillOpacity: 0.12 };
      },
      onEachFeature: (feature, layer) => {
        const p = (feature.properties ?? {}) as { kind?: string; section_id?: string; block_id?: string };
        const label = p.block_id || p.section_id;
        if (label && (p.kind === "section" || p.kind === "block"))
          layer.bindTooltip(label, { permanent: true, direction: "center", className: "ref-tip" });
      },
    }).addTo(grp);
  }, [terraceResult]);

  // ---- key-gated provider layers (Mapbox / MapTiler / Stadia) ----
  useEffect(() => {
    const map = mapRef.current;
    const control = layerControlRef.current;
    if (!map || !control) return;
    for (const lyr of Object.values(keyedRef.current)) {
      control.removeLayer(lyr);
      if (map.hasLayer(lyr)) map.removeLayer(lyr);
    }
    const keyed = buildKeyedLayers(basemapKeys);
    for (const [name, lyr] of Object.entries(keyed)) control.addBaseLayer(lyr, name);
    keyedRef.current = keyed;
  }, [basemapKeys]);

  // ---- terrace block corner pickers (click to set a block's start corner) ----
  useEffect(() => {
    const grp = cornerLayerRef.current;
    if (!grp) return;
    grp.clearLayers();
    const blocks = terraceResult?.metadata.block_corners as
      | Array<Record<string, { lat: number; lon: number } | string>>
      | undefined;
    if (!blocks) return;
    const setCorner = useAppStore.getState().setTerraceCorner;
    for (const b of blocks) {
      const blockId = b.block_id as string;
      for (const label of ["NW", "NE", "SW", "SE"] as const) {
        const c = b[label] as { lat: number; lon: number } | undefined;
        if (!c) continue;
        const chosen = terraceCorners[blockId] === label;
        L.circleMarker([c.lat, c.lon], {
          radius: chosen ? 7 : 4,
          color: chosen ? "#ffffff" : "#9aa0a6",
          weight: chosen ? 2 : 1,
          fillColor: chosen ? "#ffffff" : "#1a1a1a",
          fillOpacity: chosen ? 1 : 0.7,
        })
          .bindTooltip(`${blockId} · ${label}`, { direction: "top", className: "ref-tip" })
          .on("click", () => setCorner(blockId, label))
          .addTo(grp);
      }
    }
  }, [terraceResult, terraceCorners]);

  // ---- triad tessellation ----
  useEffect(() => {
    const grp = triadLayerRef.current;
    if (!grp) return;
    grp.clearLayers();
    if (!triad) return;
    L.geoJSON(triad as never, {
      style: (feature) => {
        const p = (feature?.properties ?? {}) as { kind?: string; hex?: number };
        const edge = p.kind === "edge";
        const altHex = (p.hex ?? 0) % 2 === 0; // alternate hexes so the pattern reads
        return {
          color: "#e5e5e5",
          weight: 1,
          fillColor: edge ? "#8a8a8a" : altHex ? "#cfcfcf" : "#a6a6a6",
          fillOpacity: edge ? 0.18 : 0.3,
        };
      },
      onEachFeature: (feature, layer) => {
        const id = (feature.properties as { id?: string })?.id;
        if (id) layer.bindTooltip(id, { permanent: false, direction: "center", className: "ref-tip" });
      },
    }).addTo(grp);
    // Hexagon outlines on top — bold stroke so the hex pattern reads.
    if (triadHexes) {
      L.geoJSON(triadHexes as never, {
        style: { color: "#ffffff", weight: 1.6, opacity: 0.9, fill: false },
        interactive: false,
      }).addTo(grp);
    }
  }, [triad, triadHexes]);

  // ---- tree grid points ----
  useEffect(() => {
    const grp = treeLayerRef.current;
    if (!grp) return;
    grp.clearLayers();
    for (const p of treeGrid) {
      L.circleMarker([p.lat, p.lon], {
        radius: 2.5,
        color: "#b8b8b8",
        weight: 1,
        fillColor: "#b8b8b8",
        fillOpacity: 0.9,
      }).addTo(grp);
    }
  }, [treeGrid]);

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full" />
      <div className="pointer-events-none absolute bottom-3 right-3 z-[500] rounded-md border border-border/60 bg-popover/85 px-2.5 py-1 text-[9px] text-muted-foreground shadow-lg backdrop-blur tabular">
        <span className="text-primary">◍</span> {coords}
        <span className="mx-1.5 opacity-40">·</span>z{zoom}
      </div>
    </div>
  );
}
