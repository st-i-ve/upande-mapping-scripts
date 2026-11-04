"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge, clickBelongsToTool } from "@/lib/map/mapBridge";
import {
  buildBaseLayers,
  buildKeyedLayers,
  buildOverlays,
  addWayback,
  LABEL_PANE,
  OVERLAY_PANE,
} from "@/lib/map/baseLayers";
import { cutPolygon, explodePolygons, sliceAll } from "@/lib/geometry/knife";
import { pivotCircle, pivotSlices, pivotSpokes } from "@/lib/geometry/pivot";
import { useShapeKeyboard } from "@/lib/hooks/useShapeKeyboard";
import { shapeLetter } from "@/lib/shapeLabels";
import { LayerPicker } from "./LayerPicker";
import { WorkingChip } from "./WorkingChip";
import { shapeOfGeometry } from "@/lib/units";
import { setWorkingShape } from "@/lib/shapeActions";
import { undo as undoHistory, redo as redoHistory } from "@/lib/store/history";
import { Plus, Minus } from "lucide-react";
import type { GeoGeometry, SavedShape } from "@/lib/types";

const DEFAULT_CENTER: L.LatLngExpression = [0.0686, 35.748];
const DEFAULT_ZOOM = 16;
const ACCENT = "#e5e5e5";

const genRenderer = L.canvas({ padding: 0.5 });
/** The working polygon's highlight — amber, so it reads apart from white selection. */
const WORKING = "#f5b942";

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
  const pivot = useAppStore((s) => s.pivot);
  const pivotSettings = useAppStore((s) => s.pivotSettings);
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
  const tileLayers = useAppStore((s) => s.tileLayers);
  const overlayTiles = useAppStore((s) => s.overlayTiles);
  const overlayOpacity = useAppStore((s) => s.overlayOpacity);

  const sliceLayerRef = useRef<L.LayerGroup | null>(null);
  const pivotLayerRef = useRef<L.LayerGroup | null>(null);
  const workingLayerRef = useRef<L.LayerGroup | null>(null);
  const genLayerRef = useRef<L.LayerGroup | null>(null);
  const treeLayerRef = useRef<L.LayerGroup | null>(null);
  const triadLayerRef = useRef<L.LayerGroup | null>(null);
  const terraceLayerRef = useRef<L.LayerGroup | null>(null);
  const cornerLayerRef = useRef<L.LayerGroup | null>(null);
  /** Standard base maps by name (Wayback joins once fetched). */
  const basesRef = useRef<Map<string, L.Layer>>(new Map());
  const overlaysRef = useRef<Record<string, L.Layer>>({});
  /** Puts a standard base map on screen by id, "base:<name>". Set at bootstrap. */
  const switchBaseRef = useRef<(id: string) => void>(() => {});
  /** The last click on a saved shape, to spot a double-click across a redraw. */
  const lastShapeClick = useRef<{ name: string; at: number } | null>(null);
  const keyedRef = useRef<Record<string, L.Layer>>({});
  /** Imported layers on screen, by slug, with the state they were built from. */
  const overlayLayersRef = useRef<Record<string, { key: string; layer: L.TileLayer }>>({});
  const baseRef = useRef<L.Layer | null>(null);
  const defaultBaseRef = useRef<L.Layer | null>(null);

  // ---- map bootstrap (once) ----
  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;

    const map = L.map(hostRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false, // ours (themed) sits in the corner instead
    });
    mapRef.current = map;

    // Reference overlays get their own pane between the base tiles (z 200) and
    // our data (z 400) — otherwise switching the base layer re-appends it on top
    // and buries them. Non-interactive, so labels never swallow a map click.
    map.createPane(LABEL_PANE);
    const labelPane = map.getPane(LABEL_PANE);
    if (labelPane) {
      labelPane.style.zIndex = "350";
      labelPane.style.pointerEvents = "none";
    }
    // A downloaded layer laid over the base map for comparison sits above the
    // base tiles but under the labels, whichever base is picked.
    map.createPane(OVERLAY_PANE);
    const overlayPane = map.getPane(OVERLAY_PANE);
    if (overlayPane) {
      overlayPane.style.zIndex = "250";
      overlayPane.style.pointerEvents = "none";
    }

    // Full base-layer set (ported from the vanilla app), default Google Satellite.
    // The layer menu is our own (LayerPicker); this is the registry behind it.
    const { baseLayers, defaultLayer } = buildBaseLayers();
    const bridge = useMapBridge.getState();
    basesRef.current = new Map(Object.entries(baseLayers));
    overlaysRef.current = buildOverlays();
    const defaultName = Object.entries(baseLayers).find(([, l]) => l === defaultLayer)?.[0] ?? "";
    defaultLayer.addTo(map);
    baseRef.current = defaultLayer;
    defaultBaseRef.current = defaultLayer;
    const publishBases = () =>
      useMapBridge.getState().setLayers({
        baseNames: [...basesRef.current.keys(), ...Object.keys(keyedRef.current)],
      });
    bridge.setLayers({
      activeBase: `base:${defaultName}`,
      overlayNames: Object.keys(overlaysRef.current),
      activeOverlays: [],
    });
    publishBases();
    switchBaseRef.current = (id) => {
      const key = id.replace(/^base:/, "");
      const lyr = basesRef.current.get(key) ?? keyedRef.current[key];
      if (!lyr) return;
      if (baseRef.current !== lyr) {
        if (baseRef.current) map.removeLayer(baseRef.current);
        map.addLayer(lyr);
        baseRef.current = lyr;
      }
      useMapBridge.getState().setLayers({ activeBase: id });
    };
    addWayback((name, lyr) => {
      basesRef.current.set(name, lyr);
      publishBases();
    });
    // Leaflet's own credit goes; the providers' attributions stay.
    map.attributionControl.setPrefix(false);
    L.control.scale({ position: "bottomleft", imperial: false, maxWidth: 140 }).addTo(map);

    shapeLayerRef.current = L.layerGroup().addTo(map);
    sliceLayerRef.current = L.layerGroup().addTo(map);
    pivotLayerRef.current = L.layerGroup().addTo(map);
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
    /**
     * When a click on the end knot last closed a cut. The browser fires dblclick
     * right after that second click, and knDbl must not treat it as a fresh
     * (empty, therefore tool-ending) path.
     */
    let knClosedAt = 0;
    /**
     * The last cut that went through, so Ctrl+Z can take it back AND put you
     * back where you were: the path re-opened with its points (straight knife),
     * the knife still out, and — for a working-polygon cut — the polygon back.
     * Only valid while nothing has changed since (the refs are checked).
     */
    type LastCut =
      | { kind: "slice"; mode: KnifeMode; points: L.LatLng[]; slices: GeoGeometry[] }
      | { kind: "working"; mode: KnifeMode; points: L.LatLng[]; poly: GeoGeometry; shapes: SavedShape[] };
    let lastCut: LastCut | null = null;
    /** A working-polygon cut taken back by undo, for Ctrl+Y to re-apply. */
    let undoneCut: Extract<LastCut, { kind: "working" }> | null = null;
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
      const names = pieces.map((_, i) => `Cut ${base + i + 1}`);
      pieces.forEach((g, i) => st.addSavedShape(names[i], g));
      // The pieces stay together, beside the shape they were cut from (or in
      // Polygons/Cuts) — not a folder each.
      st.moveShapesToFolder(names, shapeOfGeometry(poly)?.folder ?? "Polygons/Cuts");
      st.setWorkingPolygon(null);
      try {
        const b = L.geoJSON(res as never).getBounds();
        if (b.isValid()) map.fitBounds(b, { padding: [28, 28] });
      } catch {
        /* ignore */
      }
    };
    function knStop() {
      pvStop();
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
      const points = knPts.slice();
      const nowhere = knDegenerate();
      knStop();
      if (nowhere || !mode) return;
      undoneCut = null; // a new cut ends whatever redo was holding
      const before = useAppStore.getState();
      if (applySliceCut(line)) {
        const after = useAppStore.getState().slice;
        lastCut = after && after.slices !== before.slice?.slices
          ? { kind: "slice", mode, points, slices: after.slices }
          : null;
        knArm(mode);
        return;
      }
      const poly = before.workingPolygon;
      applyKnifeCut(line);
      const after = useAppStore.getState();
      lastCut = poly && after.savedShapes !== before.savedShapes
        ? { kind: "working", mode, points, poly, shapes: after.savedShapes }
        : null;
    };
    /** Re-arm the knife with a cut's path open for editing again. */
    const knResume = (mode: KnifeMode, points: L.LatLng[]) => {
      knArm(mode);
      if (mode === "straight") {
        knPts = points.slice();
        knRedraw();
      }
    };
    /** Ctrl+Z straight after a cut: take it back and return to editing its path. */
    const knUndoCut = () => {
      const c = lastCut;
      lastCut = null;
      if (!c) return false;
      const st = useAppStore.getState();
      if (c.kind === "slice") {
        if (!st.slice || st.slice.slices !== c.slices) return false; // something else happened since
        st.undoSlice();
      } else {
        if (st.slice || st.savedShapes !== c.shapes || !undoHistory()) return false;
        useAppStore.getState().setWorkingPolygon(c.poly);
        undoneCut = c;
      }
      knResume(c.mode, c.points);
      return true;
    };
    /** Ctrl+Y after that undo: re-apply the working-polygon cut as it was. */
    const knRedoCut = () => {
      const c = undoneCut;
      undoneCut = null;
      if (!c) return false;
      if (useAppStore.getState().workingPolygon !== c.poly || !redoHistory()) return false;
      useAppStore.getState().setWorkingPolygon(null);
      knStop();
      lastCut = { ...c, shapes: useAppStore.getState().savedShapes };
      return true;
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
    /** Screen distance from a placed point, in pixels. */
    const knPxFrom = (a: L.LatLng, b: L.LatLng) =>
      map.latLngToLayerPoint(a).distanceTo(map.latLngToLayerPoint(b));

    const knClick = (e: L.LeafletMouseEvent) => {
      // Clicking the end knot again ties off this cut: apply it and stay armed,
      // ready to start the next one somewhere else. Same gesture as a polyline
      // tool, and it beats hunting for a double-click on a long path.
      const last = knPts[knPts.length - 1];
      if (last && knPxFrom(last, e.latlng) < 10 && !knDegenerate()) {
        knClosedAt = Date.now();
        knFinish();
        return;
      }
      knPts.push(e.latlng);
      knRedraw();
    };
    const knDbl = () => {
      // The dblclick that follows a knot-closing click has already been handled.
      if (Date.now() - knClosedAt < 500) return;
      knFinish();
    };
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

    // ---- pivot: click the centre, move out to the circumference, click again ----
    let pvArmed = false;
    let pvCenter: L.LatLng | null = null;
    let pvTemp: L.Circle | null = null;
    let pvSpoke: L.Polyline | null = null;
    function pvStop() {
      if (!pvArmed) return;
      pvArmed = false;
      pvCenter = null;
      map.off("click", pvClick);
      map.off("mousemove", pvMove);
      map.doubleClickZoom.enable();
      L.DomUtil.removeClass(map.getContainer(), "picking");
      if (pvTemp) { map.removeLayer(pvTemp); pvTemp = null; }
      if (pvSpoke) { map.removeLayer(pvSpoke); pvSpoke = null; }
      useMapBridge.getState().setKnifeArmed(false);
    }
    const pvMove = (e: L.LeafletMouseEvent) => {
      if (!pvCenter) return;
      const r = map.distance(pvCenter, e.latlng);
      const label = `${r.toFixed(1)} m`;
      if (pvTemp) pvTemp.setRadius(r);
      else {
        pvTemp = L.circle(pvCenter, {
          radius: r, color: "#ffffff", weight: 2, dashArray: "6 4", fill: false, interactive: false,
        }).addTo(map);
      }
      if (pvSpoke) pvSpoke.setLatLngs([pvCenter, e.latlng]).setTooltipContent(label);
      else {
        pvSpoke = L.polyline([pvCenter, e.latlng], { color: "#ffffff", weight: 1, dashArray: "2 4", interactive: false })
          .bindTooltip(label, { permanent: true, direction: "right", className: "shape-letter knife-width-tip" })
          .addTo(map);
      }
    };
    const pvClick = (e: L.LeafletMouseEvent) => {
      if (!pvCenter) {
        pvCenter = e.latlng;
        map.on("mousemove", pvMove);
        return;
      }
      const radiusM = map.distance(pvCenter, e.latlng);
      const center: [number, number] = [pvCenter.lng, pvCenter.lat];
      pvStop();
      if (radiusM < 1) return; // a double-click on the centre — nothing drawn
      useAppStore.getState().setPivot({ center, radiusM });
    };
    function pvArm() {
      disableFreehand();
      map.pm.disableDraw();
      map.pm.disableGlobalEditMode();
      map.pm.disableGlobalDragMode();
      map.pm.disableGlobalRemovalMode();
      knStop();
      pvArmed = true;
      L.DomUtil.addClass(map.getContainer(), "picking");
      map.doubleClickZoom.disable();
      map.on("click", pvClick);
      // Shares the knife's flag: shapes let the clicks through and Escape ends it.
      useMapBridge.getState().setKnifeArmed(true);
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
      viewPolygon: () => {
        const b = map.getBounds();
        const [w, s2, e, n] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
        return { type: "Polygon", coordinates: [[[w, s2], [e, s2], [e, n], [w, n], [w, s2]]] };
      },
      showTileLayer: (slug) => {
        // On top of the current base map, and go to it — it only covers its own patch.
        useAppStore.getState().setOverlayTileOn(slug, true);
        const t = useAppStore.getState().tileLayers.find((l) => l.slug === slug);
        try {
          const b = t && L.geoJSON(t.area.geometry as never).getBounds();
          if (b && b.isValid()) map.fitBounds(b, { padding: [28, 28] });
        } catch {
          /* no area */
        }
      },
      setBase: (id) => switchBaseRef.current(id),
      toggleOverlay: (name) => {
        const lyr = overlaysRef.current[name];
        if (!lyr) return;
        const on = !map.hasLayer(lyr);
        if (on) map.addLayer(lyr);
        else map.removeLayer(lyr);
        const cur = useMapBridge.getState().activeOverlays.filter((n) => n !== name);
        useMapBridge.getState().setLayers({ activeOverlays: on ? [...cur, name] : cur });
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
      knifeArmed: () => knMode != null || pvArmed,
      pivotDraw: () => pvArm(),
      knifePopPoint: () => knPopPoint(),
      knifeUndoCut: () => knUndoCut(),
      knifeRedoCut: () => knRedoCut(),
      stopModes: () => {
        disableFreehand();
        knStop();
        map.pm.disableDraw();
        map.pm.disableGlobalEditMode();
        map.pm.disableGlobalDragMode();
        map.pm.disableGlobalRemovalMode();
      },
      drawPopVertex: () => {
        const pm = map.pm as unknown as {
          Draw: { getActiveShape?: () => string | undefined } & Record<string, { _removeLastVertex?: () => void; _layer?: L.Polyline }>;
        };
        const shape = pm.Draw.getActiveShape?.();
        const tool = shape ? pm.Draw[shape] : undefined;
        if (!tool?._removeLastVertex) return false;
        // Nothing placed yet: let the key fall through to the normal undo.
        if (!(tool._layer?.getLatLngs() as L.LatLng[] | undefined)?.length) return false;
        tool._removeLastVertex();
        return true;
      },
      hasDrawn: () => drawnRef.layer != null,
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

  // ---- saved-shape overlays (click to select; shift-click to multi-select;
  // double-click to use it as the working polygon) ----
  // Outline + letter rather than a solid fill, so the imagery stays readable.
  // Fill is opt-in via the opacity slider (0 by default). The shape in use as the
  // working polygon is drawn highlighted itself, instead of a dashed copy on top.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- shapeOfGeometry reads the shapes from the store
  const workingName = useMemo(() => shapeOfGeometry(workingPolygon)?.name, [workingPolygon, savedShapes]);
  useEffect(() => {
    const grp = shapeLayerRef.current;
    if (!grp) return;
    grp.clearLayers();
    if (!shapesVisible) return;
    // While slicing, the session draws the shape's pieces itself — leave the
    // source and its earlier slices out (without hiding them in the saved data).
    const inSession = new Set(slice ? [slice.source, ...slice.adopted.map((a) => a.name)] : []);
    savedShapes.forEach((s, i) => {
      if (!s.visible || inSession.has(s.name)) return;
      const color = s.color || ACCENT;
      const selected = selectedShapes.includes(s.name);
      const working = s.name === workingName;
      L.geoJSON(s.geometry as never, {
        style: {
          color: working ? WORKING : selected ? "#ffffff" : color,
          weight: working ? 3.5 : selected ? 3 : 2,
          fill: working || shapeOpacity > 0,
          fillColor: working ? WORKING : color,
          fillOpacity: working ? Math.max(0.12, shapeOpacity) : shapeOpacity,
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
          // Double-click = "use this one". Detected from two clicks on the same
          // shape: the first click re-draws the shape (selection), so the
          // browser's own dblclick never reaches it.
          const now = Date.now();
          const prev = lastShapeClick.current;
          lastShapeClick.current = { name: s.name, at: now };
          if (prev && prev.name === s.name && now - prev.at < 450) {
            lastShapeClick.current = null;
            const map = mapRef.current;
            // Not the map's double-click zoom, which the same gesture would set off.
            map?.doubleClickZoom.disable();
            setTimeout(() => map?.doubleClickZoom.enable(), 350);
            setWorkingShape(s.name);
            return;
          }
          useAppStore.getState().toggleSelectedShape(s.name, e.originalEvent.shiftKey);
        })
        .addTo(grp);
    });
  }, [savedShapes, shapesVisible, shapeOpacity, selectedShapes, workingName, slice]);

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

  // ---- pivot layout preview: the slices as they'll be cut, dotted spokes, and
  // the dotted machinery disc — redrawn on every settings change ----
  useEffect(() => {
    const grp = pivotLayerRef.current;
    if (!grp) return;
    grp.clearLayers();
    if (!pivot) return;
    const { center, radiusM } = pivot;
    const { count, pathM, centerRadiusM, rotation, clockwise } = pivotSettings;
    const ll = (c: [number, number]) => L.latLng(c[1], c[0]);
    L.circle(ll(center), { radius: radiusM, color: "#ffffff", weight: 2, fill: false, interactive: false }).addTo(grp);
    const pieces = pivotSlices(pivotCircle(center, radiusM), {
      center, count, pathM, centerRadiusM, startBearing: rotation, clockwise,
    }) ?? [];
    pieces.forEach((g, i) => {
      L.geoJSON(g as never, {
        interactive: false,
        style: { color: "#ffffff", weight: 1, opacity: 0.7, fillColor: "#ffffff", fillOpacity: i % 2 ? 0.08 : 0.16 },
      })
        .bindTooltip(String(i + 1), { permanent: true, direction: "center", className: "shape-letter shape-letter-slice" })
        .addTo(grp);
    });
    for (const sp of pivotSpokes(center, radiusM, count, centerRadiusM, rotation)) {
      L.polyline(sp.map(ll), { color: "#ffffff", weight: 1.5, dashArray: "2 5", interactive: false }).addTo(grp);
    }
    if (centerRadiusM > 0) {
      L.circle(ll(center), {
        radius: centerRadiusM, color: "#ffffff", weight: 1.5, dashArray: "2 5", fill: false, interactive: false,
      }).addTo(grp);
    }
    L.circleMarker(ll(center), { radius: 3, color: "#ffffff", fillColor: "#ffffff", fillOpacity: 1, interactive: false }).addTo(grp);
  }, [pivot, pivotSettings]);

  // ---- working polygon (dashed outline of what will be generated) ----
  useEffect(() => {
    const grp = workingLayerRef.current;
    if (!grp) return;
    grp.clearLayers();
    if (!workingPolygon) return;
    // A shown saved shape is highlighted in place (above); only an outline with no
    // visible shape behind it — a drawing, or a hidden shape — gets the dashed copy.
    const src = shapeOfGeometry(workingPolygon);
    if (src && src.visible && shapesVisible) return;
    L.geoJSON(workingPolygon as never, {
      interactive: false,
      style: { color: WORKING, weight: 2, dashArray: "5 4", fill: false },
    }).addTo(grp);
  }, [workingPolygon, savedShapes, shapesVisible]);

  // ---- generated beds & zones ----
  useEffect(() => {
    const grp = genLayerRef.current;
    if (!grp) return;
    grp.clearLayers();
    if (!genResult) return;
    // A bad file must never take the whole page down — skip it, say why.
    if (!Array.isArray((genResult as { features?: unknown }).features)) {
      console.warn("Not a FeatureCollection; not drawn", genResult);
      return;
    }
    try {
    L.geoJSON(genResult as never, {
      // Thousands of beds: canvas draws them far faster than one SVG path each.
      renderer: genRenderer,
      // Points (tree grids) as small canvas dots — thousands of markers would crawl.
      pointToLayer: (_f: unknown, latlng: L.LatLng) =>
        L.circleMarker(latlng, { renderer: genRenderer, radius: 2.5, color: "#b8b8b8", weight: 1, fillOpacity: 0.9 }),
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
    } as L.GeoJSONOptions).addTo(grp);
    } catch (e) {
      console.warn("Couldn't draw this result", e);
    }
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
    if (!map) return;
    const bridge = useMapBridge.getState();
    const shownName = Object.entries(keyedRef.current).find(([, l]) => map.hasLayer(l))?.[0];
    for (const lyr of Object.values(keyedRef.current)) if (map.hasLayer(lyr)) map.removeLayer(lyr);
    const keyed = buildKeyedLayers(basemapKeys);
    keyedRef.current = keyed;
    bridge.setLayers({ baseNames: [...basesRef.current.keys(), ...Object.keys(keyed)] });
    if (shownName) {
      // The keyed map on screen was rebuilt (or its key removed): show it again, or fall back.
      baseRef.current = null;
      if (keyed[shownName]) switchBaseRef.current(`base:${shownName}`);
      else if (defaultBaseRef.current) {
        map.addLayer(defaultBaseRef.current);
        baseRef.current = defaultBaseRef.current;
        const def = [...basesRef.current].find(([, l]) => l === defaultBaseRef.current)?.[0];
        bridge.setLayers({ activeBase: `base:${def}` });
      }
    }
  }, [basemapKeys]);

  // ---- imported (downloaded) layers, drawn ON TOP of the standard base map ----
  // Any number can be on at once; the last one switched on is uppermost. A layer
  // is rebuilt only when it appears, goes or changes state — not on every
  // progress poll — so a finished download picks up the tiles that were 404s.
  const tileKey = tileLayers.map((l) => `${l.slug}:${l.state}`).join("|");
  const overlayKey = overlayTiles.join("|");
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const { tileLayers: infos, overlayTiles: want, overlayOpacity: opacity } = useAppStore.getState();
    const cache = overlayLayersRef.current;
    for (const [slug, e] of Object.entries(cache)) {
      const t = infos.find((l) => l.slug === slug);
      if (!want.includes(slug) || !t || `${t.slug}:${t.state}` !== e.key) {
        map.removeLayer(e.layer);
        delete cache[slug];
      }
    }
    want.forEach((slug, i) => {
      const t = infos.find((l) => l.slug === slug);
      if (!t) return;
      if (!cache[slug]) {
        let bounds: L.LatLngBounds | undefined;
        try {
          bounds = L.geoJSON(t.area.geometry as never).getBounds();
        } catch {
          /* no bounds: Leaflet just asks for tiles everywhere */
        }
        const layer = L.tileLayer(t.tile_url, {
          pane: OVERLAY_PANE,
          // Stretch its outermost zooms so it stays visible zoomed in or out past them.
          minNativeZoom: t.min_zoom,
          maxNativeZoom: t.max_zoom,
          maxZoom: 22,
          bounds,
          opacity,
          attribution: `${t.name} (imported)`,
        }).addTo(map);
        cache[slug] = { key: `${t.slug}:${t.state}`, layer };
      }
      cache[slug].layer.setZIndex(i + 1);
    });
  }, [tileKey, overlayKey]);

  useEffect(() => {
    for (const e of Object.values(overlayLayersRef.current)) e.layer.setOpacity(overlayOpacity);
  }, [overlayOpacity]);

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
    // `isolate` keeps Leaflet's pane z-indices (400–1000) inside the map, so
    // portalled dialogs at z-50 still draw above it.
    <div className="relative isolate h-full w-full">
      <div ref={hostRef} className="h-full w-full" />
      <LayerPicker />
      <WorkingChip />
      <div className="absolute left-3 top-3 z-[600] flex flex-col overflow-hidden rounded-lg border border-border bg-popover/90 shadow-lg backdrop-blur"
        onDoubleClick={(e) => e.stopPropagation()}>
        <button aria-label="Zoom in" title="Zoom in" disabled={zoom >= 22}
          onClick={() => mapRef.current?.zoomIn()}
          className="flex h-8 w-8 items-center justify-center text-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-35">
          <Plus size={14} />
        </button>
        <span aria-hidden className="h-px bg-border" />
        <button aria-label="Zoom out" title="Zoom out" disabled={zoom <= 1}
          onClick={() => mapRef.current?.zoomOut()}
          className="flex h-8 w-8 items-center justify-center text-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-35">
          <Minus size={14} />
        </button>
      </div>
      <div className="pointer-events-none absolute bottom-3 right-3 z-[500] rounded-md border border-border/60 bg-popover/85 px-3 py-1.5 text-[10px] text-muted-foreground shadow-lg backdrop-blur tabular">
        <span className="text-primary">◍</span> {coords}
        <span className="mx-1.5 opacity-40">·</span>z{zoom}
      </div>
    </div>
  );
}
