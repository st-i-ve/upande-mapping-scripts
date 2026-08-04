"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge, clickBelongsToTool } from "@/lib/map/mapBridge";
import { buildBaseLayers, buildKeyedLayers, addWayback } from "@/lib/map/baseLayers";
import { cutPolygon, explodePolygons, sliceAll } from "@/lib/geometry/knife";
import { useShapeKeyboard } from "@/lib/hooks/useShapeKeyboard";
import { shapeLetter } from "@/lib/shapeLabels";
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

  useShapeKeyboard(); // Delete / Backspace clears the selected shapes

  const refPoints = useAppStore((s) => s.refPoints);
  const refVisible = useAppStore((s) => s.refVisible);
  const refOpacity = useAppStore((s) => s.refOpacity);
  const savedShapes = useAppStore((s) => s.savedShapes);
  const shapesVisible = useAppStore((s) => s.shapesVisible);
  const shapeOpacity = useAppStore((s) => s.shapeOpacity);
  const selectedShapes = useAppStore((s) => s.selectedShapes);
  const slice = useAppStore((s) => s.slice);
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

  const sliceLayerRef = useRef<L.LayerGroup | null>(null);
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
    sliceLayerRef.current = L.layerGroup().addTo(map);
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

    // ---- knife: cut the working polygon along a line (freehand OR straight path) ----
    type KnifeMode = "draw" | "straight";
    let knPts: L.LatLng[] = [];
    let knTemp: L.Polyline | null = null;
    let knBand: L.Polyline | null = null;
    let knMode: KnifeMode | null = null;
    const knDots = L.layerGroup().addTo(map);
    const knCoords = (): [number, number][] => knPts.map((p) => [p.lng, p.lat]);
    /**
     * Blade width in screen pixels at the current zoom — the gap you'll get. A
     * 1 m blade is under a pixel at z16, so it gets a floor of 2px to stay
     * visible; the metre readout on the band is what's authoritative.
     */
    const knBladePx = () => {
      const width = useAppStore.getState().knifeWidth || 1;
      const mPerPx =
        (156543.03392 * Math.cos((map.getCenter().lat * Math.PI) / 180)) / 2 ** map.getZoom();
      return Math.max(2, width / mPerPx);
    };
    const knRedraw = () => {
      // Nothing drawn yet: clear up rather than leaving an empty band and its
      // width label sitting on the map (a zoomend can land here with no points).
      if (!knPts.length) {
        knDots.clearLayers();
        if (knTemp) { map.removeLayer(knTemp); knTemp = null; }
        if (knBand) { map.removeLayer(knBand); knBand = null; }
        return;
      }
      // Translucent band = the blade at its true width; dashed line = the path.
      const label = `${useAppStore.getState().knifeWidth || 1} m`;
      if (knBand) {
        knBand.setLatLngs(knPts).setStyle({ weight: knBladePx() });
        knBand.setTooltipContent(label);
      } else {
        knBand = L.polyline(knPts, {
          color: "#ffffff",
          weight: knBladePx(),
          opacity: 0.28,
          lineCap: "butt",
          lineJoin: "round",
          interactive: false,
          className: "knife-band",
        })
          .bindTooltip(label, {
            permanent: true,
            direction: "right",
            className: "shape-letter knife-width-tip",
          })
          .addTo(map);
      }
      if (knTemp) knTemp.setLatLngs(knPts);
      else knTemp = L.polyline(knPts, { color: "#ffffff", weight: 2, dashArray: "6 4" }).addTo(map);
      // Dots on the placed points, so a straight path shows what Backspace removes.
      knDots.clearLayers();
      if (knMode === "straight") {
        knPts.forEach((p, i) =>
          L.circleMarker(p, {
            radius: i === knPts.length - 1 ? 4 : 3,
            color: "#ffffff",
            weight: 1.5,
            fillColor: i === knPts.length - 1 ? "#ffffff" : "#1a1a1a",
            fillOpacity: 1,
            interactive: false,
            className: "knife-dot",
          }).addTo(knDots),
        );
      }
    };
    /** Straight-path undo: drop the last placed point. */
    const knPopPoint = () => {
      if (knMode !== "straight" || !knPts.length) return false;
      knPts.pop();
      knRedraw();
      return true;
    };
    // A stroke during a slicing session cuts the session's slice set — the source
    // shape and the working polygon are both left alone. Returns true so the
    // caller keeps the knife armed for the next slice.
    const applySliceCut = (line: [number, number][]) => {
      const st = useAppStore.getState();
      if (!st.slice) return false;
      if (line.length >= 2) {
        const width = st.knifeWidth || 1;
        const next = sliceAll(st.slice.slices, line, width);
        if (next) st.applySlice(next, width); // null = the stroke changed nothing
      }
      // Claim the stroke either way — a stray click must not drop the session.
      return true;
    };

    // Cut the working polygon and add each resulting piece as its own saved shape,
    // then clear the working polygon — keeping it would leave a dashed twin of one
    // piece on the map that no shape control can delete. Cut a piece further with
    // "use" on its row in Saved shapes.
    const applyKnifeCut = (line: [number, number][]) => {
      const st = useAppStore.getState();
      const poly = st.workingPolygon;
      if (!poly || line.length < 2) return;
      const res = cutPolygon(poly, line, st.knifeWidth || 1);
      if (!res) return;
      const pieces = explodePolygons(res);
      const base = st.savedShapes.length;
      pieces.forEach((g, i) => st.addSavedShape(`Cut ${base + i + 1}`, g));
      st.setWorkingPolygon(null);
      try {
        const b = L.geoJSON(res as never).getBounds();
        if (b.isValid()) map.fitBounds(b, { padding: [28, 28] });
      } catch {
        /* ignore */
      }
    };
    function knStop() {
      knPts = [];
      knMode = null;
      useMapBridge.getState().setKnifeArmed(false);
      map.off("mousedown", knDown);
      map.off("mousemove", knMove);
      map.off("mouseup", knUp);
      map.off("click", knClick);
      map.off("dblclick", knDbl);
      map.off("zoomend", knRedraw);
      map.dragging.enable();
      map.doubleClickZoom.enable();
      L.DomUtil.removeClass(map.getContainer(), "picking");
      knDots.clearLayers();
      if (knTemp) { map.removeLayer(knTemp); knTemp = null; }
      if (knBand) { map.removeLayer(knBand); knBand = null; }
    }
    const knMove = (e: L.LeafletMouseEvent) => { knPts.push(e.latlng); knRedraw(); };
    /**
     * A path going nowhere — every point within a few pixels of the first. A
     * double-click on open ground looks like this (its two clicks each place a
     * point), and that's the gesture for putting the knife away.
     */
    const knDegenerate = () => {
      if (knPts.length < 2) return true;
      const first = map.latLngToLayerPoint(knPts[0]);
      return knPts.every((p) => map.latLngToLayerPoint(p).distanceTo(first) < 6);
    };
    // End of a stroke: apply it, then re-arm the same knife mode if we're slicing,
    // so cut after cut needs no trip back to the tool rail. A degenerate path
    // ends the tool instead — otherwise straight mode would never let go.
    const knFinish = () => {
      const mode = knMode;
      const line = knCoords();
      const nowhere = knDegenerate();
      knStop();
      if (nowhere) return;
      if (applySliceCut(line)) {
        if (mode) knArm(mode);
        return;
      }
      applyKnifeCut(line);
    };
    const knUp = () => {
      map.off("mousemove", knMove);
      map.off("mouseup", knUp);
      knFinish();
    };
    const knDown = (e: L.LeafletMouseEvent) => {
      knPts = [e.latlng];
      knRedraw();
      map.on("mousemove", knMove);
      map.on("mouseup", knUp);
    };
    const knClick = (e: L.LeafletMouseEvent) => { knPts.push(e.latlng); knRedraw(); };
    const knDbl = () => knFinish();
    function knArm(mode: KnifeMode) {
      disableFreehand();
      map.pm.disableDraw();
      map.pm.disableGlobalEditMode();
      map.pm.disableGlobalDragMode();
      map.pm.disableGlobalRemovalMode();
      knStop();
      L.DomUtil.addClass(map.getContainer(), "picking");
      if (mode === "draw") {
        map.dragging.disable();
        map.on("mousedown", knDown);
      } else {
        map.doubleClickZoom.disable();
        map.on("click", knClick);
        map.on("dblclick", knDbl);
      }
      knMode = mode;
      useMapBridge.getState().setKnifeArmed(true);
      // The blade band is sized in pixels, so it has to be redrawn on zoom.
      map.on("zoomend", knRedraw);
    }

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
      knifeFreehand: () => knArm("draw"),
      knifeStraight: () => knArm("straight"),
      knifeStop: () => knStop(),
      knifeArmed: () => knMode != null,
      knifePopPoint: () => knPopPoint(),
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

  // ---- saved-shape overlays (click to select; shift-click to multi-select) ----
  // Outline + letter rather than a solid fill, so the imagery stays readable.
  // Fill is opt-in via the opacity slider (0 by default).
  useEffect(() => {
    const grp = shapeLayerRef.current;
    if (!grp) return;
    grp.clearLayers();
    if (!shapesVisible) return;
    savedShapes.forEach((s, i) => {
      if (!s.visible) return;
      const color = s.color || ACCENT;
      const selected = selectedShapes.includes(s.name);
      L.geoJSON(s.geometry as never, {
        style: {
          color: selected ? "#ffffff" : color,
          weight: selected ? 3 : 2,
          fill: shapeOpacity > 0,
          fillColor: color,
          fillOpacity: shapeOpacity,
        },
      })
        .bindTooltip(shapeLetter(i), {
          permanent: true,
          direction: "center",
          className: `shape-letter${selected ? " shape-letter-sel" : ""}`,
        })
        .on("click", (e: L.LeafletMouseEvent) => {
          // A knife point or a pick outranks selection: leave the click alone so
          // it reaches the map, or clicking near an outline swallows it.
          if (clickBelongsToTool()) return;
          L.DomEvent.stop(e);
          useAppStore.getState().toggleSelectedShape(s.name, e.originalEvent.shiftKey);
        })
        .addTo(grp);
    });
  }, [savedShapes, shapesVisible, shapeOpacity, selectedShapes]);

  // ---- live slicing preview (alternating fills so the blade gaps read) ----
  useEffect(() => {
    const grp = sliceLayerRef.current;
    if (!grp) return;
    grp.clearLayers();
    if (!slice) return;
    slice.slices.forEach((g, i) => {
      L.geoJSON(g as never, {
        // Non-interactive: a slice must never swallow a knife click.
        interactive: false,
        // Outline only — the point of slicing is seeing the ground you're cutting.
        style: { color: "#ffffff", weight: 1.5, fill: false },
      })
        // Numbered as they'll be saved: "<Source> 1", "<Source> 2", …
        .bindTooltip(String(i + 1), {
          permanent: true,
          direction: "center",
          className: "shape-letter shape-letter-slice",
        })
        .addTo(grp);
    });
  }, [slice]);

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
