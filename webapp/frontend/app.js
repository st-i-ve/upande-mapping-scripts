/* global L */

const map = L.map("map", { zoomControl: true }).setView([0.0686, 35.748], 16);

// Expose minimal surface for sibling modules (editor.js).
window.app = window.app || {};
window.app.map = map;

// Pane for the tree grid — z-index below overlayPane (400) so drawn shapes
// always render on top of the grid dots.
map.createPane("gridPane");
map.getPane("gridPane").style.zIndex = 350;

const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 22,
  attribution: "&copy; OpenStreetMap",
});

const esriSat = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 22, attribution: "Esri World Imagery" },
);

const esriClarity = L.tileLayer(
  "https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 22, attribution: "Esri Clarity (World Imagery)" },
);

const googleSat = L.tileLayer(
  "https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
  {
    maxZoom: 22,
    subdomains: ["0", "1", "2", "3"],
    attribution: "&copy; Google",
  },
).addTo(map);

const googleHybrid = L.tileLayer(
  "https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
  {
    maxZoom: 22,
    subdomains: ["0", "1", "2", "3"],
    attribution: "&copy; Google",
  },
);

const googleTerrain = L.tileLayer(
  "https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}",
  {
    maxZoom: 22,
    subdomains: ["0", "1", "2", "3"],
    attribution: "&copy; Google",
  },
);

const googleRoad = L.tileLayer(
  "https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
  {
    maxZoom: 22,
    subdomains: ["0", "1", "2", "3"],
    attribution: "&copy; Google",
  },
);

const yandexSat = L.tileLayer(
  "https://sat0{s}.maps.yandex.net/tiles?l=sat&v=3.456.0&x={x}&y={y}&z={z}",
  {
    maxZoom: 19,
    subdomains: ["1", "2", "3", "4"],
    attribution: "&copy; Yandex",
  },
);

const esriTopo = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19, attribution: "Esri World Topo" },
);
const Lokitela = L.tileLayer("/tiles/lokitela/lokitela/{z}/{x}/{y}.png", {
  minZoom: 12,
  maxZoom: 16,
  attribution: "Lokitela (local tiles)",
});

const archiveTiles = L.tileLayer("/tiles/archive/{z}/{x}/{y}.png", {
  minZoom: 12,
  maxZoom: 18,
  attribution: "Archive (local tiles)",
});

const esriStreet = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19, attribution: "Esri World Street" },
);

const openTopo = L.tileLayer(
  "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
  { maxZoom: 17, attribution: "&copy; OpenTopoMap (CC-BY-SA)" },
);

const osmHot = L.tileLayer(
  "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
  { maxZoom: 20, attribution: "&copy; OSM HOT" },
);

const cartoLight = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  { maxZoom: 20, subdomains: "abcd", attribution: "&copy; CARTO" },
);

const cartoDark = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  { maxZoom: 20, subdomains: "abcd", attribution: "&copy; CARTO" },
);

// Bing Aerial — custom layer using quadkey tile addressing.
const BingAerial = L.TileLayer.extend({
  getTileUrl: function (coords) {
    let q = "";
    for (let i = coords.z; i > 0; i--) {
      let d = 0;
      const mask = 1 << (i - 1);
      if ((coords.x & mask) !== 0) d++;
      if ((coords.y & mask) !== 0) d += 2;
      q += d;
    }
    const sub = this._getSubdomain(coords);
    return `https://ecn.t${sub}.tiles.virtualearth.net/tiles/a${q}.jpeg?g=1`;
  },
});
const bingAerial = new BingAerial("", {
  maxZoom: 21,
  subdomains: ["0", "1", "2", "3"],
  attribution: "&copy; Microsoft Bing",
});

// NASA GIBS — MODIS/VIIRS true-color imagery from yesterday (literally latest pass).
// Low resolution (max zoom 9) — regional/cloud context only.
const gibsDate = new Date(Date.now() - 24 * 3600 * 1000)
  .toISOString()
  .slice(0, 10);
const nasaViirs = L.tileLayer(
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${gibsDate}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
  { maxZoom: 9, attribution: `NASA GIBS VIIRS ${gibsDate}` },
);

// Optional layers driven by API keys stored in localStorage.
const mapboxKey = localStorage.getItem("mapboxKey") || "";
const maptilerKey = localStorage.getItem("maptilerKey") || "";
const stadiaKey = localStorage.getItem("stadiaKey") || "";

const keyedLayers = {};
if (mapboxKey) {
  keyedLayers["Mapbox Satellite"] = L.tileLayer(
    `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}?access_token=${mapboxKey}`,
    {
      maxZoom: 22,
      tileSize: 512,
      zoomOffset: -1,
      attribution: "&copy; Mapbox",
    },
  );
  keyedLayers["Mapbox Satellite Streets"] = L.tileLayer(
    `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}?access_token=${mapboxKey}`,
    {
      maxZoom: 22,
      tileSize: 512,
      zoomOffset: -1,
      attribution: "&copy; Mapbox",
    },
  );
}
if (maptilerKey) {
  keyedLayers["MapTiler Satellite"] = L.tileLayer(
    `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${maptilerKey}`,
    { maxZoom: 22, attribution: "&copy; MapTiler" },
  );
  keyedLayers["MapTiler Hybrid"] = L.tileLayer(
    `https://api.maptiler.com/maps/hybrid/{z}/{x}/{y}.jpg?key=${maptilerKey}`,
    { maxZoom: 22, attribution: "&copy; MapTiler" },
  );
}
if (stadiaKey) {
  keyedLayers["Stadia Alidade Satellite"] = L.tileLayer(
    `https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}.jpg?api_key=${stadiaKey}`,
    { maxZoom: 20, attribution: "&copy; Stadia Maps" },
  );
  keyedLayers["Stadia Outdoors"] = L.tileLayer(
    `https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}.png?api_key=${stadiaKey}`,
    { maxZoom: 20, attribution: "&copy; Stadia Maps" },
  );
}

const layerControl = L.control
  .layers(
    {
      "Google Satellite (latest)": googleSat,
      "Google Hybrid": googleHybrid,
      "Google Terrain": googleTerrain,
      "Google Road": googleRoad,
      "Yandex Satellite": yandexSat,
      "Bing Aerial": bingAerial,
      "Esri Clarity": esriClarity,
      "Esri World Imagery": esriSat,
      "Esri World Topo": esriTopo,
      "Esri World Street": esriStreet,
      Lokitela,
      Archive: archiveTiles,
      OpenTopoMap: openTopo,
      "OSM Humanitarian": osmHot,
      "Carto Light": cartoLight,
      "Carto Dark": cartoDark,
      [`NASA VIIRS (${gibsDate})`]: nasaViirs,
      OSM: osm,
      ...keyedLayers,
    },
    null,
    { position: "topleft", collapsed: true },
  )
  .addTo(map);

// Esri Wayback — pick the freshest available release for any AOI. Fetched async.
fetch(
  "https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json",
)
  .then((r) => r.json())
  .then((cfg) => {
    const releases = Object.keys(cfg)
      .map(Number)
      .sort((a, b) => b - a);
    const latest = cfg[releases[0]];
    const url = latest.itemURL
      .replace("{level}", "{z}")
      .replace("{row}", "{y}")
      .replace("{col}", "{x}");
    const waybackLayer = L.tileLayer(url, {
      maxZoom: 22,
      attribution: `Esri Wayback ${latest.itemReleaseName}`,
    });
    layerControl.addBaseLayer(
      waybackLayer,
      `Esri Wayback (${latest.itemReleaseName})`,
    );
  })
  .catch(() => {
    /* non-fatal — layer just won't appear */
  });

// API-key settings UI.
for (const id of ["mapboxKey", "maptilerKey", "stadiaKey"]) {
  const el = document.getElementById(id);
  if (el) el.value = localStorage.getItem(id) || "";
}
const saveKeysBtn = document.getElementById("saveKeys");
if (saveKeysBtn) {
  saveKeysBtn.addEventListener("click", () => {
    for (const id of ["mapboxKey", "maptilerKey", "stadiaKey"]) {
      const v = (document.getElementById(id).value || "").trim();
      if (v) localStorage.setItem(id, v);
      else localStorage.removeItem(id);
    }
    location.reload();
  });
}

const drawn = new L.FeatureGroup().addTo(map);
const drawControl = new L.Control.Draw({
  position: "topright",
  draw: {
    polygon: {
      allowIntersection: false,
      showArea: true,
      shapeOptions: { color: "#0f6fd1" },
    },
    rectangle: { shapeOptions: { color: "#0f6fd1" } },
    polyline: false,
    circle: false,
    marker: false,
    circlemarker: false,
  },
  edit: { featureGroup: drawn, remove: true },
});
map.addControl(drawControl);

const bedsLayer = L.layerGroup().addTo(map);
const zonesLayer = L.layerGroup().addTo(map);
const blocksLayer = L.layerGroup().addTo(map);
const cornerLayer = L.layerGroup().addTo(map);
const previewLayer = L.layerGroup().addTo(map);
const terraceLayer = L.layerGroup().addTo(map);
const anchorLayer = L.layerGroup().addTo(map);

const SECTION_COLOURS = [
  "#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#14b8a6", "#f97316", "#84cc16", "#ec4899",
];

let terraceState = {
  startEdgeIdx: null,
  rawSections: null,         // FeatureCollection from /api/terrace_sections
  blockGeoJson: null,        // list of GeoJSON polygons after grouping is applied
  blockStartCorners: null,   // list of NW/NE/SW/SE | null per block (from grouping)
};
let awaitingTerracePick = false;
let awaitingCornerPick = false;
let awaitingSwapPick = false;

let currentPolygon = null; // GeoJSON geometry

// ---- status banner --------------------------------------------------------
const statusEl = document.getElementById("status");
function setStatus(text, kind = "idle") {
  statusEl.textContent = text;
  statusEl.className = "status-" + kind;
}

// ---- polygon handling -----------------------------------------------------
function normalizeToPolygonGeometry(input) {
  // Reduces any GeoJSON value to a bare Polygon/MultiPolygon geometry, or null.
  // Accepts FeatureCollection, Feature, GeometryCollection, or a raw geometry.
  if (!input || typeof input !== "object") return null;
  const collectPolys = (items, getGeom) => {
    const polys = [];
    for (const it of items || []) {
      const g = getGeom(it);
      if (!g) continue;
      if (g.type === "Polygon") polys.push(g);
      else if (g.type === "MultiPolygon") polys.push(g);
      else if (g.type === "Feature" || g.type === "GeometryCollection") {
        const nested = normalizeToPolygonGeometry(g);
        if (nested) polys.push(nested);
      }
    }
    return polys;
  };
  const merge = (polys) => {
    if (polys.length === 0) return null;
    if (polys.length === 1) return polys[0];
    const coords = [];
    for (const g of polys) {
      if (g.type === "Polygon") coords.push(g.coordinates);
      else coords.push(...g.coordinates);
    }
    return { type: "MultiPolygon", coordinates: coords };
  };
  if (input.type === "FeatureCollection") {
    return merge(collectPolys(input.features, (f) => f && f.geometry));
  }
  if (input.type === "Feature") return normalizeToPolygonGeometry(input.geometry);
  if (input.type === "GeometryCollection") {
    return merge(collectPolys(input.geometries, (g) => g));
  }
  if (input.type === "Polygon" || input.type === "MultiPolygon") return input;
  return null;
}

function setPolygon(geojson) {
  drawn.clearLayers();
  try {
    const geom = normalizeToPolygonGeometry(geojson);
    if (!geom) {
      alert("Pasted GeoJSON has no Polygon or MultiPolygon geometry.");
      return;
    }
    const layer = L.geoJSON(geom, { style: { color: "#0f6fd1" } });
    layer.eachLayer((l) => drawn.addLayer(l));
    const bounds = drawn.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
    currentPolygon = geom;
  } catch (e) {
    alert("Could not parse polygon: " + e.message);
  }
}

map.on(L.Draw.Event.CREATED, (e) => {
  // If the user armed "Draw mask", push this polygon onto the mask stack
  // and re-run the full rebuild + apply-all-masks pipeline.
  if (awaitingFilterDraw) {
    awaitingFilterDraw = false;
    const polygon = e.layer.toGeoJSON().geometry;
    filterMasks.push({ polygon, polarity: pendingMaskPolarity });
    filterLayer.addLayer(e.layer);
    rebuildAndFilter();
    renderGrid();
    return;
  }
  drawn.clearLayers();
  drawn.addLayer(e.layer);
  currentPolygon = e.layer.toGeoJSON().geometry;
  schedulePreview();
});
map.on(L.Draw.Event.EDITED, () => {
  // Re-grab geometry from whatever is in `drawn`.
  const layers = drawn.getLayers();
  if (layers.length) currentPolygon = layers[0].toGeoJSON().geometry;
  schedulePreview();
});
map.on(L.Draw.Event.DELETED, () => {
  currentPolygon = null;
  previewLayer.clearLayers();
});

document.getElementById("loadGeoJson").addEventListener("click", () => {
  const raw = document.getElementById("geojsonInput").value.trim();
  if (!raw) return;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    alert("Invalid JSON: " + e.message);
    return;
  }
  setPolygon(parsed);
  schedulePreview();
});

document.getElementById("clearPolygon").addEventListener("click", () => {
  drawn.clearLayers();
  bedsLayer.clearLayers();
  zonesLayer.clearLayers();
  blocksLayer.clearLayers();
  cornerLayer.clearLayers();
  previewLayer.clearLayers();
  anchorLayer.clearLayers();
  clearTerraceMode();
  currentPolygon = null;
  document.getElementById("summary").textContent = "";
  setStatus("ready", "idle");
});

// ---- live cut-line preview ------------------------------------------------
let previewTimer = null;
let previewController = null;

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(runPreview, 200);
}

async function runPreview() {
  if (!currentPolygon) {
    previewLayer.clearLayers();
    return;
  }
  const n = parseInt(document.getElementById("splitParts").value, 10) || 1;
  const axis = document.getElementById("splitAxis").value;
  if (n <= 1 || axis === "none") {
    previewLayer.clearLayers();
    return;
  }
  if (previewController) previewController.abort();
  previewController = new AbortController();
  const signal = previewController.signal;
  try {
    const res = await fetch("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        polygon: currentPolygon,
        direction: document.getElementById("direction").value,
        n_blocks: n,
        split_axis: axis,
        start_corner: document.getElementById("startCorner").value,
        buffer_m: parseFloat(document.getElementById("bufferM").value) || 0,
      }),
      signal,
    });
    if (!res.ok) return;
    const data = await res.json();
    renderPreview(data);
    renderBedAnchors(data.metadata);
  } catch (e) {
    // Quiet — preview is non-essential, AbortError is expected.
  }
}

function renderPreview(fc) {
  previewLayer.clearLayers();
  const blocks = fc.features.filter((f) => f.properties.kind === "block");
  const cuts = fc.features.filter((f) => f.properties.kind === "cut");

  L.geoJSON(
    { type: "FeatureCollection", features: blocks },
    {
      style: {
        color: "#7c3aed",
        weight: 1,
        opacity: 0.4,
        fillColor: "#7c3aed",
        fillOpacity: 0.05,
      },
      interactive: false,
    },
  ).addTo(previewLayer);

  L.geoJSON(
    { type: "FeatureCollection", features: cuts },
    {
      style: { color: "#dc2626", weight: 3, opacity: 0.85, dashArray: "8 5" },
      interactive: false,
    },
  ).addTo(previewLayer);
}

["splitParts", "splitAxis", "direction", "startCorner", "bufferM"].forEach(
  (id) => {
    const el = document.getElementById(id);
    el.addEventListener("input", () => {
      schedulePreview();
      scheduleTerraceRefresh();
    });
    el.addEventListener("change", () => {
      schedulePreview();
      scheduleTerraceRefresh();
    });
  },
);

let terraceRefreshTimer = null;
function scheduleTerraceRefresh() {
  if (terraceState.startEdgeIdx == null) return;
  clearTimeout(terraceRefreshTimer);
  terraceRefreshTimer = setTimeout(() => {
    const grouping = document.getElementById("terraceGrouping").value.trim();
    refreshTerrace(grouping || null);
  }, 220);
}

// ---- terrace mode ---------------------------------------------------------
function getOuterRingForTerrace(geom) {
  if (!geom) return null;
  if (geom.type === "Feature") return getOuterRingForTerrace(geom.geometry);
  if (geom.type === "Polygon") return geom.coordinates[0];
  if (geom.type === "MultiPolygon") {
    // Largest part by Shoelace area on the exterior ring.
    let best = null;
    let bestArea = -1;
    for (const poly of geom.coordinates) {
      const ring = poly[0];
      let area = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
      }
      area = Math.abs(area / 2);
      if (area > bestArea) {
        bestArea = area;
        best = ring;
      }
    }
    return best;
  }
  return null;
}

function nearestEdgeIdx(ring, latlng) {
  // ring is [[lon,lat], ...] with closing duplicate. Returns the index i
  // such that the edge from ring[i] to ring[i+1] is closest to latlng.
  if (!ring || ring.length < 2) return null;
  const click = map.latLngToLayerPoint(latlng);
  let bestI = 0;
  let bestD = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = map.latLngToLayerPoint(L.latLng(ring[i][1], ring[i][0]));
    const b = map.latLngToLayerPoint(L.latLng(ring[i + 1][1], ring[i + 1][0]));
    const d = L.LineUtil.pointToSegmentDistance(click, a, b);
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  return bestD < 30 ? bestI : null; // 30 px tolerance
}

function setTerraceStatus(text) {
  document.getElementById("terraceStatus").textContent = text;
}

function clearTerraceOverlays() {
  terraceLayer.clearLayers();
}

function clearTerraceMode() {
  terraceState = {
    startEdgeIdx: null,
    rawSections: null,
    blockGeoJson: null,
    blockStartCorners: null,
  };
  clearTerraceOverlays();
  anchorLayer.clearLayers();
  setTerraceStatus("No edge picked.");
  if (typeof renderEndBedsReadout === "function") renderEndBedsReadout();
}

document.getElementById("pickTerraceEdge").addEventListener("click", () => {
  if (!currentPolygon) {
    alert("Draw or paste a polygon first.");
    return;
  }
  awaitingTerracePick = true;
  setTerraceStatus("Click any stepped edge of the polygon…");
  document.getElementById("map").style.cursor = "crosshair";
});

document.getElementById("clearTerrace").addEventListener("click", clearTerraceMode);

map.on("click", async (e) => {
  if (awaitingTerracePick) {
    awaitingTerracePick = false;
    document.getElementById("map").style.cursor = "";
    const ring = getOuterRingForTerrace(currentPolygon);
    if (!ring) {
      setTerraceStatus("Polygon has no usable ring.");
      return;
    }
    const idx = nearestEdgeIdx(ring, e.latlng);
    if (idx == null) {
      setTerraceStatus("Click was too far from any edge — try again.");
      return;
    }
    terraceState.startEdgeIdx = idx;
    setTerraceStatus(`Edge ${idx} picked, computing sections…`);
    await refreshTerrace(null);
    return;
  }
  if (awaitingCornerPick) {
    awaitingCornerPick = false;
    document.getElementById("map").style.cursor = "";
    const meta = terraceState.rawSections?.metadata;
    if (!meta?.block_corners?.length) {
      setTerraceStatus("Preview blocks first, then pick a corner.");
      return;
    }
    const hit = findClosestBlockCorner(e.latlng);
    if (!hit) {
      setTerraceStatus("Click was too far from any block — try again.");
      return;
    }
    if (!setBlockCornerOverride(hit.block_id, hit.corner)) {
      setTerraceStatus(
        `Could not match ${hit.block_id} to a group in the grouping.`,
      );
      return;
    }
    setTerraceStatus(`Set ${hit.block_id} → @${hit.corner}.`);
    return;
  }
  if (awaitingSwapPick) {
    awaitingSwapPick = false;
    document.getElementById("map").style.cursor = "";
    const meta = terraceState.rawSections?.metadata;
    if (!meta?.block_corners?.length) {
      setTerraceStatus("Preview blocks first, then pick a sub-block to swap.");
      return;
    }
    const hit = findClosestBlockCorner(e.latlng);
    if (!hit) {
      setTerraceStatus("Click was too far from any block — try again.");
      return;
    }
    if (!toggleSubBlockReverse(hit.block_id)) {
      setTerraceStatus(
        `${hit.block_id} has no [Nx …] split spec — nothing to swap.`,
      );
      return;
    }
    setTerraceStatus(`Swapped sub-blocks of group containing ${hit.block_id}.`);
    return;
  }
});

// Quadrant snap: pick the block whose rotated bbox the click falls inside (or
// nearest to), then map the click to NW/NE/SW/SE based on which quadrant of
// that bbox it landed in. This is much more forgiving than precise corner
// dots — the user just clicks roughly in the corner area of the block they
// care about.
function findClosestBlockCorner(latlng) {
  const meta = terraceState.rawSections?.metadata;
  if (!meta?.block_corners?.length) return null;
  const clickPx = map.latLngToLayerPoint(latlng);

  let bestBlk = null;
  let bestScore = Infinity;
  for (const blk of meta.block_corners) {
    if (!blk.NW || !blk.NE || !blk.SW || !blk.SE) continue;
    const NW = map.latLngToLayerPoint(L.latLng(blk.NW.lat, blk.NW.lon));
    const NE = map.latLngToLayerPoint(L.latLng(blk.NE.lat, blk.NE.lon));
    const SW = map.latLngToLayerPoint(L.latLng(blk.SW.lat, blk.SW.lon));
    const SE = map.latLngToLayerPoint(L.latLng(blk.SE.lat, blk.SE.lon));
    // Express the click in the bbox's local (u along NW→NE, v along NW→SW)
    // frame. u,v ∈ [0,1] means inside the bbox; outside that range we score
    // by how far out the click is so a click near the edge still snaps.
    const ex = { x: NE.x - NW.x, y: NE.y - NW.y };
    const ey = { x: SW.x - NW.x, y: SW.y - NW.y };
    const denom = ex.x * ey.y - ex.y * ey.x;
    if (Math.abs(denom) < 1e-6) continue;
    const dx = clickPx.x - NW.x;
    const dy = clickPx.y - NW.y;
    const u = (dx * ey.y - dy * ey.x) / denom;
    const v = (ex.x * dy - ex.y * dx) / denom;
    // Penalty: 0 inside, otherwise distance (in u/v units) outside the bbox.
    const outU = u < 0 ? -u : u > 1 ? u - 1 : 0;
    const outV = v < 0 ? -v : v > 1 ? v - 1 : 0;
    const score = Math.hypot(outU, outV);
    if (score < bestScore) {
      bestScore = score;
      bestBlk = { blk, u, v };
    }
  }
  // Allow up to ~0.6 bbox-widths outside before giving up — keeps things
  // forgiving without snapping to absurdly distant blocks.
  if (!bestBlk || bestScore > 0.6) return null;
  // Clamp u/v to the bbox so we always end up with a defined quadrant.
  const u = Math.min(1, Math.max(0, bestBlk.u));
  const v = Math.min(1, Math.max(0, bestBlk.v));
  const ns = v < 0.5 ? "N" : "S";
  const we = u < 0.5 ? "W" : "E";
  return { block_id: bestBlk.blk.block_id, corner: ns + we };
}

// Parse a block_id like "P02a" → { groupIdx: 1, subLetter: "a" } or
// "P02" → { groupIdx: 1, subLetter: null }.
function parseBlockId(blockId) {
  const m = /^P0*(\d+)([a-z])?$/i.exec(blockId);
  if (!m) return null;
  return {
    groupIdx: parseInt(m[1], 10) - 1,
    subLetter: m[2] ? m[2].toLowerCase() : null,
  };
}

// Parse a single group part's [...] bracket. Returns null if no bracket, or
// { kind, n, axis, rev?, subs?, bracketStart, bracketEnd } where:
//   kind: "old" (Nx axis [~]) or "new" (per-sub list with @C)
//   subs: list of {idx, corner|null} for the new form, in bed-flow order
function parseBracketJS(part) {
  const m = /\[([^\]]*)\]/.exec(part);
  if (!m) return null;
  const inner = m[1].trim();
  const bracketStart = m.index;
  const bracketEnd = m.index + m[0].length;

  if (inner.includes(":")) {
    const colonIdx = inner.indexOf(":");
    const head = inner.slice(0, colonIdx).trim();
    const listStr = inner.slice(colonIdx + 1);
    const headM = /^(?:(\d+)\s*x\s*)?(longest|shortest|long|short|l|s)$/i.exec(head);
    if (!headM) return null;
    const items = listStr.split(",").map((s) => s.trim()).filter(Boolean);
    const subs = [];
    for (const it of items) {
      const sm = /^(\d+)(?:\s*@\s*(NW|NE|SW|SE))?$/i.exec(it);
      if (!sm) return null;
      subs.push({
        idx: parseInt(sm[1], 10),
        corner: sm[2] ? sm[2].toUpperCase() : null,
      });
    }
    return {
      kind: "new",
      n: headM[1] ? parseInt(headM[1], 10) : subs.length,
      axis: headM[2],
      subs,
      bracketStart,
      bracketEnd,
    };
  }

  const oldM = /^(\d+)\s*x\s*(longest|shortest|long|short|l|s)\s*(~?)$/i.exec(inner);
  if (!oldM) return null;
  return {
    kind: "old",
    n: parseInt(oldM[1], 10),
    axis: oldM[2],
    rev: oldM[3] === "~",
    bracketStart,
    bracketEnd,
  };
}

function formatBracketNew(b) {
  const items = b.subs
    .map((s) => `${s.idx}${s.corner ? `@${s.corner}` : ""}`)
    .join(", ");
  return `[${b.n}x ${b.axis}: ${items}]`;
}

function formatBracketOld(b) {
  return `[${b.n}x ${b.axis}${b.rev ? "~" : ""}]`;
}

function replaceBracket(part, bracket, newBracketText) {
  return (
    part.slice(0, bracket.bracketStart) +
    newBracketText +
    part.slice(bracket.bracketEnd)
  );
}

function setBlockCornerOverride(blockId, corner) {
  // Two paths depending on which syntax the group uses:
  //   - new (per-sub list):  rewrite THIS sub's @C in place
  //   - old (Nx axis [~]):   if click landed on a non-first sub, toggle ~ so
  //                          the clicked piece becomes 'a', then set group @C
  // For non-split groups, just set the group-level @C.
  const parsed = parseBlockId(blockId);
  if (!parsed) return false;
  const { groupIdx, subLetter } = parsed;
  if (groupIdx < 0) return false;

  const input = document.getElementById("terraceGrouping");
  const parts = splitGroupingTopLevel(input.value)
    .map((p) => p.trim())
    .filter(Boolean);
  if (groupIdx >= parts.length) return false;

  let part = parts[groupIdx];
  const bracket = parseBracketJS(part);

  if (subLetter && bracket && bracket.kind === "new") {
    const subPos = subLetter.charCodeAt(0) - "a".charCodeAt(0);
    if (subPos < 0 || subPos >= bracket.subs.length) return false;
    bracket.subs[subPos].corner = corner;
    part = replaceBracket(part, bracket, formatBracketNew(bracket));
    // Per-sub corner takes precedence; drop any stale group-level @C.
    parts[groupIdx] = part.replace(/\s*@\s*(NW|NE|SW|SE)\s*$/i, "");
    input.value = parts.join(", ");
    refreshTerrace(input.value);
    renderEndBedsReadout();
    return true;
  }

  if (subLetter && subLetter !== "a" && bracket && bracket.kind === "old") {
    const flipped = { ...bracket, rev: !bracket.rev };
    part = replaceBracket(part, bracket, formatBracketOld(flipped));
  }
  parts[groupIdx] =
    part.replace(/\s*@\s*(NW|NE|SW|SE)\s*$/i, "") + `@${corner}`;
  input.value = parts.join(", ");
  refreshTerrace(input.value);
  renderEndBedsReadout();
  return true;
}

// Reverse sub-block order for the group containing `blockId`.
//   - new syntax: reverse the sub_specs list
//   - old syntax: toggle the ~ flag
// Returns false if the group has no split spec to reverse.
function toggleSubBlockReverse(blockId) {
  const parsed = parseBlockId(blockId);
  if (!parsed) return false;
  const { groupIdx } = parsed;
  if (groupIdx < 0) return false;

  const input = document.getElementById("terraceGrouping");
  const parts = splitGroupingTopLevel(input.value)
    .map((p) => p.trim())
    .filter(Boolean);
  if (groupIdx >= parts.length) return false;

  const part = parts[groupIdx];
  const bracket = parseBracketJS(part);
  if (!bracket) return false;

  let newPart;
  if (bracket.kind === "new") {
    bracket.subs.reverse();
    newPart = replaceBracket(part, bracket, formatBracketNew(bracket));
  } else {
    const flipped = { ...bracket, rev: !bracket.rev };
    newPart = replaceBracket(part, bracket, formatBracketOld(flipped));
  }
  parts[groupIdx] = newPart;
  input.value = parts.join(", ");
  refreshTerrace(input.value);
  renderEndBedsReadout();
  return true;
}

document
  .getElementById("pickBlockCorner")
  .addEventListener("click", () => {
    if (
      !terraceState.rawSections ||
      !(terraceState.rawSections.metadata?.block_corners?.length)
    ) {
      alert("Preview blocks first, then pick a corner.");
      return;
    }
    awaitingCornerPick = true;
    awaitingTerracePick = false; // mutually exclusive
    awaitingSwapPick = false;
    setTerraceStatus("Click any corner of any block on the map…");
    document.getElementById("map").style.cursor = "crosshair";
  });

document
  .getElementById("swapSubBlocks")
  .addEventListener("click", () => {
    if (
      !terraceState.rawSections ||
      !(terraceState.rawSections.metadata?.block_corners?.length)
    ) {
      alert("Preview blocks first, then pick a sub-block to swap.");
      return;
    }
    awaitingSwapPick = true;
    awaitingCornerPick = false;
    awaitingTerracePick = false;
    setTerraceStatus(
      "Click any sub-block (e.g. P02a or P02b) to swap a/b ordering for that group…",
    );
    document.getElementById("map").style.cursor = "crosshair";
  });

async function refreshTerrace(grouping) {
  if (terraceState.startEdgeIdx == null || !currentPolygon) return false;
  try {
    const res = await fetch("/api/terrace_sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        polygon: currentPolygon,
        start_edge_idx: terraceState.startEdgeIdx,
        grouping: grouping || null,
        start_corner: document.getElementById("startCorner").value,
        buffer_m: parseFloat(document.getElementById("bufferM").value) || 0,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "terrace failed");
    }
    const data = await res.json();
    terraceState.rawSections = data;
    terraceState.blockGeoJson = data.block_geojson || null;
    terraceState.blockStartCorners = data.metadata.block_start_corners || null;
    renderTerrace(data);
    renderBedAnchors(data.metadata);
    renderEndBedsReadout();
    const m = data.metadata;
    const blockBit =
      m.block_count > 0 ? `, ${m.block_count} blocks` : "";
    setTerraceStatus(
      `Edge ${m.chain_edges?.[0] ?? "?"}+chain ${m.chain_edges?.length ?? 0}, treads ${m.tread_edges?.length ?? 0}, sections ${m.section_count}${blockBit}.`,
    );
    return true;
  } catch (err) {
    setTerraceStatus("Terrace error: " + err.message);
    return false;
  }
}

function renderBedAnchors(meta) {
  anchorLayer.clearLayers();
  if (!meta || !meta.first_bed_a || !meta.first_bed_b) return;
  const a = [meta.first_bed_a.lat, meta.first_bed_a.lon];
  const b = [meta.first_bed_b.lat, meta.first_bed_b.lon];
  // Thick purple arrow A → B
  L.polyline([a, b], {
    color: "#7c3aed",
    weight: 6,
    opacity: 0.9,
    lineCap: "round",
  }).addTo(anchorLayer);
  // Arrowhead at B
  const dy = b[0] - a[0];
  const dx = b[1] - a[1];
  const headBearing = (Math.atan2(dy, dx) * 180) / Math.PI;
  L.marker(b, {
    icon: L.divIcon({
      className: "bed-arrow-head",
      html: `<div style="transform: rotate(${-headBearing}deg);">▶</div>`,
      iconSize: [22, 22],
    }),
    interactive: false,
  }).addTo(anchorLayer);
  // A and B labels
  for (const [pt, label, cls] of [
    [a, "A", "bed-anchor-a"],
    [b, "B", "bed-anchor-b"],
  ]) {
    L.circleMarker(pt, {
      radius: 8,
      color: "#4338ca",
      fillColor: "#a78bfa",
      fillOpacity: 1,
      weight: 2,
    })
      .bindTooltip(label, {
        permanent: true,
        direction: "top",
        offset: [0, -10],
        className: cls,
      })
      .addTo(anchorLayer);
  }
}

function renderTerrace(fc) {
  clearTerraceOverlays();

  const chain = fc.features.filter((f) => f.properties.kind === "chain_edge");
  const cuts = fc.features.filter((f) => f.properties.kind === "cut");
  const sections = fc.features.filter((f) => f.properties.kind === "section");
  const blocks = fc.features.filter((f) => f.properties.kind === "block");

  // Sections — coloured fills with labels.
  for (const s of sections) {
    const colour = SECTION_COLOURS[(s.properties.i - 1) % SECTION_COLOURS.length];
    L.geoJSON(s, {
      style: {
        color: colour,
        weight: 1,
        opacity: 0.8,
        fillColor: colour,
        fillOpacity: 0.18,
      },
    }).addTo(terraceLayer);
    const c = L.geoJSON(s).getBounds().getCenter();
    L.marker(c, {
      icon: L.divIcon({
        className: "section-label",
        html: s.properties.section_id,
        iconSize: [40, 18],
      }),
      interactive: false,
    }).addTo(terraceLayer);
  }

  // Chain edges — highlight, treads thicker.
  for (const c of chain) {
    L.geoJSON(c, {
      style: {
        color: c.properties.is_tread ? "#dc2626" : "#fb923c",
        weight: c.properties.is_tread ? 5 : 3,
        opacity: 0.9,
      },
    }).addTo(terraceLayer);
  }

  // Cuts — dashed.
  for (const c of cuts) {
    L.geoJSON(c, {
      style: {
        color: "#dc2626",
        weight: 2,
        opacity: 0.9,
        dashArray: "8 5",
      },
    }).addTo(terraceLayer);
  }

  // Block previews — thick purple outlines on top.
  for (const b of blocks) {
    const sp = b.properties.split;
    let splitTag = "";
    if (sp) {
      splitTag = `, ${sp.n}x ${sp.axis}`;
      if (sp.orig_idx != null) splitTag += ` (#${sp.orig_idx})`;
      if (sp.per_sub) splitTag += " ✎"; // per-sub list in use
    }
    const overrideTag = b.properties.corner_override
      ? `, @${b.properties.corner_override}`
      : "";
    L.geoJSON(b, {
      style: {
        color: "#7c3aed",
        weight: 3,
        opacity: 0.95,
        fillColor: "#7c3aed",
        fillOpacity: 0.08,
        dashArray: "10 4",
      },
    })
      .bindTooltip(
        `${b.properties.block_id} (S${b.properties.sections.join(",")}${splitTag}${overrideTag}, ${b.properties.area_m2} m²)`,
        { sticky: true, direction: "center" },
      )
      .addTo(terraceLayer);
  }

  // Block-corner click targets — small dots at each block's 4 corners so
  // "Pick block corner" knows where to aim.
  const cornerMeta = fc.metadata?.block_corners || [];
  for (const blk of cornerMeta) {
    for (const corner of ["NW", "NE", "SW", "SE"]) {
      const c = blk[corner];
      if (!c) continue;
      L.circleMarker([c.lat, c.lon], {
        radius: 4,
        color: "#7c3aed",
        fillColor: "#ffffff",
        fillOpacity: 1,
        weight: 1.5,
        interactive: false,
      }).addTo(terraceLayer);
    }
  }
}

document
  .getElementById("previewTerraceBlocks")
  .addEventListener("click", () => {
    const grouping = document.getElementById("terraceGrouping").value.trim();
    if (!grouping) {
      alert("Type a grouping first, e.g. '1-2, 3, 4-5'.");
      return;
    }
    if (terraceState.startEdgeIdx == null) {
      alert("Pick a stepped edge on the map first.");
      return;
    }
    refreshTerrace(grouping);
  });

// Split a grouping string on commas at the top level — commas inside [...]
// annotations stay with their group.
function splitGroupingTopLevel(s) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "[") {
      depth++;
      cur += ch;
    } else if (ch === "]") {
      depth = Math.max(0, depth - 1);
      cur += ch;
    } else if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur) parts.push(cur);
  return parts;
}

// ---- live "last bed in block" readout ------------------------------------
function expectedBlockIds() {
  // Terrace mode wins — its block_geojson dictates the block list / IDs.
  if (terraceState.blockGeoJson && terraceState.blockGeoJson.length > 0) {
    return terraceState.rawSections.features
      .filter((f) => f.properties.kind === "block")
      .map((f) => f.properties.block_id);
  }
  const n =
    parseInt(document.getElementById("splitParts").value, 10) || 1;
  const axis = document.getElementById("splitAxis").value;
  const count = axis === "none" || n <= 1 ? 1 : n;
  return Array.from({ length: count }, (_, i) =>
    `P${(i + 1).toString().padStart(2, "0")}`,
  );
}

// Parse the end-beds field into per-block [start, end] ranges. Each comma-
// separated entry is either a bare integer (cumulative end-bed: continues
// from previous block's end + 1) or an explicit `start-end` range. The two
// forms can be mixed — useful for skipping ID gaps between physically-
// separate greenhouses, e.g. "1-50, 200-244" or "50, 200-244".
function parseEndBeds(text) {
  const trimmed = text.trim();
  if (!trimmed) return { ranges: [], error: null };
  const items = trimmed.split(/\s*,\s*/).filter(Boolean);
  const ranges = [];
  let prevEnd = 0;
  for (const raw of items) {
    let start, end;
    const rangeM = /^(\d+)\s*-\s*(\d+)$/.exec(raw);
    const intM = /^(\d+)$/.exec(raw);
    if (rangeM) {
      start = parseInt(rangeM[1], 10);
      end = parseInt(rangeM[2], 10);
    } else if (intM) {
      const n = parseInt(intM[1], 10);
      start = prevEnd + 1;
      end = n;
    } else {
      return {
        ranges: [],
        error: `'${raw}' is not a positive integer or 'start-end' range.`,
      };
    }
    if (start < 1 || end < 1 || start > end) {
      return {
        ranges: [],
        error: `Bad range '${raw}' — need 1 ≤ start ≤ end.`,
      };
    }
    if (start <= prevEnd) {
      return {
        ranges: [],
        error: `Range '${raw}' (start=${start}) must be greater than previous block's end (${prevEnd}).`,
      };
    }
    ranges.push([start, end]);
    prevEnd = end;
  }
  return { ranges, error: null };
}

function renderEndBedsReadout() {
  const out = document.getElementById("endBedsReadout");
  out.className = "readout";
  const text = document.getElementById("blockEndBeds").value;
  const ids = expectedBlockIds();
  const { ranges, error } = parseEndBeds(text);

  if (error) {
    out.classList.add("error");
    out.textContent = error;
    return;
  }
  if (ranges.length === 0) {
    out.textContent =
      ids.length > 1
        ? `Expecting ${ids.length} entries (one per block: ${ids.join(", ")}). Each is a count (e.g. 50) or a range (e.g. 1-50, 200-244). Empty falls back to fixed bed spacing.`
        : `Expecting 1 entry for ${ids[0]}: a count or a range. Empty falls back to fixed bed spacing.`;
    return;
  }

  const lines = [];
  for (let i = 0; i < ranges.length; i++) {
    const id = ids[i] ?? `P${(i + 1).toString().padStart(2, "0")}`;
    const [start, end] = ranges[i];
    const count = end - start + 1;
    const idStr = `B${start.toString().padStart(4, "0")} → B${end.toString().padStart(4, "0")}`;
    lines.push(`${id}: ${idStr} (${count} bed${count === 1 ? "" : "s"})`);
  }
  out.textContent = lines.join("\n");
  if (ranges.length !== ids.length) {
    out.classList.add("warn");
    out.textContent =
      `${out.textContent}\n⚠ ${ranges.length} entr${ranges.length === 1 ? "y" : "ies"} given but ${ids.length} block${ids.length === 1 ? "" : "s"} configured (${ids.join(", ")}).`;
  }
}

document
  .getElementById("blockEndBeds")
  .addEventListener("input", renderEndBedsReadout);
// Re-render when the block layout changes so expected count stays accurate.
[
  "splitParts",
  "splitAxis",
  "direction",
  "startCorner",
  "terraceGrouping",
].forEach((id) => {
  document.getElementById(id).addEventListener("input", renderEndBedsReadout);
  document.getElementById(id).addEventListener("change", renderEndBedsReadout);
});
renderEndBedsReadout();

document
  .getElementById("reverseTerraceBlocks")
  .addEventListener("click", () => {
    const input = document.getElementById("terraceGrouping");
    const raw = input.value.trim();
    if (!raw) {
      alert("Type a grouping first.");
      return;
    }
    const parts = splitGroupingTopLevel(raw).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) return; // nothing to reverse
    input.value = parts.reverse().join(", ");
    if (terraceState.startEdgeIdx != null) {
      refreshTerrace(input.value);
    }
  });

// ---- generation -----------------------------------------------------------
function renderResult(fc) {
  bedsLayer.clearLayers();
  zonesLayer.clearLayers();
  blocksLayer.clearLayers();
  cornerLayer.clearLayers();
  previewLayer.clearLayers();

  const beds = {
    type: "FeatureCollection",
    features: fc.features.filter((f) => f.properties.kind === "bed"),
  };
  const zones = {
    type: "FeatureCollection",
    features: fc.features.filter((f) => f.properties.kind === "zone"),
  };
  const blockFeatures = fc.features.filter(
    (f) => f.properties.kind === "block",
  );

  L.geoJSON(
    {
      type: "FeatureCollection",
      features: blockFeatures,
    },
    {
      style: {
        color: "#7c3aed",
        weight: 2,
        opacity: 0.85,
        fillColor: "#7c3aed",
        fillOpacity: 0.06,
        dashArray: "6 4",
      },
      onEachFeature: (f, l) =>
        l.bindTooltip(`${f.properties.block_id} (${f.properties.area_m2} m²)`, {
          sticky: true,
          direction: "center",
        }),
    },
  ).addTo(blocksLayer);

  // Per-block start-corner markers — show the user where bed #1 of each block
  // lives, and the corner used (which alternates between blocks for the U-turn).
  for (const bf of blockFeatures) {
    const p = bf.properties;
    if (p.start_corner_lat == null || p.start_corner_lon == null) continue;
    const m = L.circleMarker([p.start_corner_lat, p.start_corner_lon], {
      radius: 6,
      color: "#dc2626",
      fillColor: "#fef2f2",
      fillOpacity: 1,
      weight: 2,
    });
    m.bindTooltip(`${p.block_id} • bed #1 (${p.start_corner})`, {
      permanent: true,
      direction: "top",
      offset: [0, -8],
      className: "corner-tip",
    });
    m.addTo(cornerLayer);
  }

  L.geoJSON(beds, {
    style: { color: "#1f9d55", weight: 3, opacity: 0.9 },
    onEachFeature: (f, l) =>
      l.bindTooltip(
        `${f.properties.bed_id} (${f.properties.block_id})`,
        { sticky: true, direction: "center" },
      ),
  }).addTo(bedsLayer);

  L.geoJSON(zones, {
    style: { color: "#f59e0b", weight: 5, opacity: 0.55 },
    onEachFeature: (f, l) =>
      l.bindTooltip(f.properties.zone_id, {
        sticky: true,
        direction: "center",
      }),
  }).addTo(zonesLayer);
}

function clearResults() {
  bedsLayer.clearLayers();
  zonesLayer.clearLayers();
  blocksLayer.clearLayers();
  cornerLayer.clearLayers();
  anchorLayer.clearLayers();
  document.getElementById("summary").textContent = "";
}

let generateController = null;
let latestFilename = null;

function setGenerateBusy(busy) {
  document.getElementById("generate").disabled = busy;
  document.getElementById("cancelGenerate").disabled = !busy;
}

function setFrappeButtons(filename) {
  latestFilename = filename;
  const enabled = !!filename;
  document.getElementById("copyFrappeLatest").disabled = !enabled;
  document.getElementById("downloadFrappeLatest").disabled = !enabled;
}

async function fetchFrappeText(filename) {
  const res = await fetch(`/api/outputs/${encodeURIComponent(filename)}/frappe`);
  if (!res.ok) throw new Error("Failed to fetch Frappe text");
  return await res.text();
}

async function copyFrappeFor(filename) {
  try {
    const text = await fetchFrappeText(filename);
    await navigator.clipboard.writeText(text);
    setStatus("copied for Frappe", "ok");
  } catch (e) {
    alert("Copy failed: " + e.message);
  }
}

function downloadFrappeFor(filename) {
  const url = `/api/outputs/${encodeURIComponent(filename)}/frappe`;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/\.geojson$/, "") + ".frappe.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

document
  .getElementById("copyFrappeLatest")
  .addEventListener("click", () => {
    if (latestFilename) copyFrappeFor(latestFilename);
  });
document
  .getElementById("downloadFrappeLatest")
  .addEventListener("click", () => {
    if (latestFilename) downloadFrappeFor(latestFilename);
  });

document.getElementById("clearResults").addEventListener("click", () => {
  clearResults();
  setStatus("ready", "idle");
});

document.getElementById("cancelGenerate").addEventListener("click", () => {
  if (generateController) {
    generateController.abort();
  }
});

document.getElementById("generate").addEventListener("click", async () => {
  if (!currentPolygon) {
    alert("Draw or paste a polygon first.");
    return;
  }
  // Wipe the previous result immediately so the user sees a clean canvas
  // while the new run is computing — avoids stale beds layered on the new ones.
  clearResults();

  // If a terrace edge is picked, make sure the cached block geometry matches
  // the current grouping input. Without this refresh, edits to the grouping
  // that weren't followed by a "Preview blocks" click would leave terraceState
  // pointing at the previous blocks — Generate would then save a fresh file
  // whose contents reflect the OLD grouping, and the Frappe export would look
  // like "the latest output keeps picking the old one".
  if (terraceState.startEdgeIdx != null) {
    const groupingNow = document.getElementById("terraceGrouping").value.trim();
    const groupingApplied =
      terraceState.rawSections?.metadata?.grouping ?? null;
    const wantGrouping = groupingNow || null;
    if (wantGrouping !== groupingApplied) {
      const ok = await refreshTerrace(wantGrouping);
      if (!ok) {
        setStatus("error", "error");
        alert(
          "Couldn't refresh terrace blocks for the current grouping — fix the grouping and try again.",
        );
        return;
      }
    }
  }

  const { ranges: bedRanges, error: rangeErr } = parseEndBeds(
    document.getElementById("blockEndBeds").value,
  );
  if (rangeErr) {
    alert("End-bed entries: " + rangeErr);
    return;
  }
  const block_bed_ranges = bedRanges.length > 0 ? bedRanges : null;

  const body = {
    polygon: currentPolygon,
    bed_spacing: parseFloat(document.getElementById("bedSpacing").value) || 1.5,
    zone_length: parseFloat(document.getElementById("zoneLength").value),
    buffer_m: parseFloat(document.getElementById("bufferM").value),
    direction: document.getElementById("direction").value,
    n_blocks: parseInt(document.getElementById("splitParts").value, 10) || 1,
    split_axis: document.getElementById("splitAxis").value,
    start_corner: document.getElementById("startCorner").value,
    block_bed_ranges,
    custom_blocks: terraceState.blockGeoJson || null,
    block_start_corners: terraceState.blockGeoJson
      ? terraceState.blockStartCorners
      : null,
    name: document.getElementById("name").value || null,
  };

  // Abort any prior in-flight generation before starting a new one.
  if (generateController) generateController.abort();
  generateController = new AbortController();
  const signal = generateController.signal;

  setGenerateBusy(true);
  setStatus("generating…", "busy");
  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Request failed");
    }
    const data = await res.json();
    renderResult(data.result);
    const m = data.result.metadata;
    const splitLine =
      m.split_axis && m.split_axis !== "none"
        ? `Blocks: ${m.block_count} (split across ${m.split_axis} edge)\n`
        : "";
    const modeLine =
      m.mode === "count"
        ? `Mode: count   Per block: ${(m.block_counts || []).join(", ")}\n`
        : `Mode: spacing (${m.bed_spacing_m} m)\n`;
    document.getElementById("summary").textContent =
      `Beds: ${m.bed_count}   Zones: ${m.zone_count}\n` +
      splitLine +
      modeLine +
      `Start corner: ${m.start_corner}   Area: ${m.area_m2} m²\n` +
      `Saved: ${data.filename}`;
    setStatus("done", "ok");
    setFrappeButtons(data.filename);
    loadOutputs();
  } catch (e) {
    if (e.name === "AbortError") {
      setStatus("cancelled", "idle");
    } else {
      setStatus("error", "error");
      alert("Generation failed: " + e.message);
    }
  } finally {
    setGenerateBusy(false);
    generateController = null;
  }
});

// ---- outputs list ---------------------------------------------------------
async function loadOutputs() {
  const res = await fetch("/api/outputs");
  if (!res.ok) return;
  const data = await res.json();
  const ul = document.getElementById("outputs");
  ul.innerHTML = "";
  for (const o of data.outputs) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = "/api/outputs/" + encodeURIComponent(o.filename);
    a.textContent = o.filename;
    a.download = o.filename;
    const actions = document.createElement("div");
    actions.className = "actions";
    const view = document.createElement("a");
    view.href = "#";
    view.textContent = "view";
    view.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const r = await fetch("/api/outputs/" + encodeURIComponent(o.filename));
      if (r.ok) renderResult(await r.json());
    });
    const frappeCopy = document.createElement("a");
    frappeCopy.href = "#";
    frappeCopy.textContent = "copy frappe";
    frappeCopy.addEventListener("click", (ev) => {
      ev.preventDefault();
      copyFrappeFor(o.filename);
    });
    const frappeDl = document.createElement("a");
    frappeDl.href = "/api/outputs/" + encodeURIComponent(o.filename) + "/frappe";
    frappeDl.textContent = "frappe.txt";
    frappeDl.download =
      o.filename.replace(/\.geojson$/, "") + ".frappe.txt";
    actions.appendChild(view);
    actions.appendChild(frappeCopy);
    actions.appendChild(frappeDl);
    li.appendChild(a);
    li.appendChild(actions);
    ul.appendChild(li);
  }
}

document
  .getElementById("refreshOutputs")
  .addEventListener("click", loadOutputs);
loadOutputs();

// =========================================================================
// Tree grid — draw a rectangle, generate a grid of points inside, rotate
// around a chosen pivot. All maths is client-side, flat-earth anchored on
// the rectangle's SW corner (fine for farm-scale AOIs near the equator).
// =========================================================================

const gridLayer = L.layerGroup().addTo(map);

let gridOrigin = null; // {lat, lon} — SW corner of the source rectangle
let gridSpanM = null; // {w, h}     — source rectangle size in metres
let gridLocalPoints = []; // [{row, col, x_m, y_m}] — unrotated local frame
let gridAnchor = { x_m: 0, y_m: 0 }; // where R1·T1 lives; pinned on flow change
let gridRotationDeg = 0;
let gridPivotMode = "center";
let gridPivotLocal = null; // set when user clicks a point in "custom" mode
let awaitingPivotClick = false;

// Mask stack — each mask is a GeoJSON Polygon plus a polarity.
//   polarity "positive" = keep points inside, drop the rest
//   polarity "negative" = remove points inside, keep the rest
// On every rebuild masks are reapplied in order, so counts/flow changes
// don't revive already-deleted points.
let filterMasks = [];
let awaitingFilterDraw = false;
let pendingMaskPolarity = "positive";
const filterLayer = L.layerGroup().addTo(map);
const MASK_STYLE_POSITIVE = {
  color: "#16a34a",
  weight: 2,
  dashArray: "6,6",
  fillOpacity: 0.05,
};
const MASK_STYLE_NEGATIVE = {
  color: "#dc2626",
  weight: 2,
  dashArray: "6,6",
  fillOpacity: 0.05,
};

const EARTH_M_PER_DEG_LAT = 111320;
const mPerDegLon = (lat) =>
  EARTH_M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

function latLonToMetres(lat, lon, lat0, lon0) {
  return {
    x: (lon - lon0) * mPerDegLon(lat0),
    y: (lat - lat0) * EARTH_M_PER_DEG_LAT,
  };
}
function metresToLatLon(x, y, lat0, lon0) {
  return {
    lat: lat0 + y / EARTH_M_PER_DEG_LAT,
    lon: lon0 + x / mPerDegLon(lat0),
  };
}

function gridExtents() {
  if (!gridLocalPoints.length) return null;
  let minX = +Infinity,
    maxX = -Infinity,
    minY = +Infinity,
    maxY = -Infinity;
  for (const p of gridLocalPoints) {
    if (p.x_m < minX) minX = p.x_m;
    if (p.x_m > maxX) maxX = p.x_m;
    if (p.y_m < minY) minY = p.y_m;
    if (p.y_m > maxY) maxY = p.y_m;
  }
  return { minX, maxX, minY, maxY };
}

function pivotLocal() {
  const ex = gridExtents();
  if (!ex) return null;
  const { minX, maxX, minY, maxY } = ex;
  const cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2;
  switch (gridPivotMode) {
    case "sw":
      return { x_m: minX, y_m: minY };
    case "nw":
      return { x_m: minX, y_m: maxY };
    case "ne":
      return { x_m: maxX, y_m: maxY };
    case "se":
      return { x_m: maxX, y_m: minY };
    case "custom":
      return gridPivotLocal ?? { x_m: cx, y_m: cy };
    default:
      return { x_m: cx, y_m: cy };
  }
}

function rotateAround(p, pivot, deg) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r),
    s = Math.sin(r);
  const dx = p.x_m - pivot.x_m,
    dy = p.y_m - pivot.y_m;
  return { x_m: pivot.x_m + dx * c - dy * s, y_m: pivot.y_m + dx * s + dy * c };
}

let pivotMarker = null;

const PIVOT_ICON = L.divIcon({
  className: "",
  html:
    '<div style="width:16px;height:16px;background:#ef4444;' +
    "border:3px solid #fff;border-radius:50%;" +
    'box-shadow:0 0 0 2px #ef4444;cursor:move;"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function renderPivotMarker() {
  if (pivotMarker) {
    gridLayer.removeLayer(pivotMarker);
    pivotMarker = null;
  }
  if (!gridOrigin) return;

  const pv = pivotLocal();
  const { lat, lon } = metresToLatLon(
    pv.x_m,
    pv.y_m,
    gridOrigin.lat,
    gridOrigin.lon,
  );
  pivotMarker = L.marker([lat, lon], { draggable: true, icon: PIVOT_ICON });
  pivotMarker.bindTooltip("Drag to move the grid · rotation pivot");

  // Drag: translate the whole grid by shifting gridOrigin so the pivot's
  // local coord still maps to the marker's new world position. The rotation
  // handle moves with the pivot because it's offset from it.
  pivotMarker.on("drag", (e) => {
    const ll = e.target.getLatLng();
    const pvl = pivotLocal();
    gridOrigin.lat = ll.lat - pvl.y_m / EARTH_M_PER_DEG_LAT;
    gridOrigin.lon = ll.lng - pvl.x_m / mPerDegLon(gridOrigin.lat);
    renderGridDots();
    updateRotationHandlePosition();
  });

  gridLayer.addLayer(pivotMarker);
}

function renderGridDots() {
  // Snapshot first — mutating gridLayer during eachLayer() with
  // Leaflet's for-in internals can skip siblings, leaving stale markers
  // (and their stale tooltips) on the map. Also preserve the rotation
  // gizmo; rebuilding it here would wipe the one renderGrid() just made.
  const preserve = new Set();
  if (pivotMarker) preserve.add(pivotMarker);
  if (rotationHandleMarker) preserve.add(rotationHandleMarker);
  const toRemove = [];
  gridLayer.eachLayer((l) => {
    if (!preserve.has(l)) toRemove.push(l);
  });
  for (const l of toRemove) gridLayer.removeLayer(l);
  if (!gridOrigin || !gridLocalPoints.length) return;

  const pivot = pivotLocal();
  for (const p of gridLocalPoints) {
    const rot = rotateAround(p, pivot, gridRotationDeg);
    const { lat, lon } = metresToLatLon(
      rot.x_m,
      rot.y_m,
      gridOrigin.lat,
      gridOrigin.lon,
    );
    const m = L.circleMarker([lat, lon], {
      pane: "gridPane",
      radius: 3,
      color: "#0f6fd1",
      fillColor: "#0f6fd1",
      fillOpacity: 0.85,
      weight: 1,
      // Stop clicks / dblclicks from also firing on the map (which would
      // otherwise dblclick-zoom or re-fire the pivot click handler).
      bubblingMouseEvents: false,
    });
    m.bindTooltip(`R${p.row}·T${p.col}`, { direction: "top" });
    m.on("click", () => {
      if (!awaitingPivotClick) return;
      gridPivotLocal = { x_m: p.x_m, y_m: p.y_m };
      gridPivotMode = "custom";
      document.getElementById("gridPivot").value = "custom";
      awaitingPivotClick = false;
      document.getElementById("gridSummary").textContent =
        `Pivot set to R${p.row}·T${p.col}. Adjust rotation to see the effect.`;
      renderGrid();
    });
    m.on("dblclick", () => {
      // Double-click always sets the pivot, regardless of current mode.
      gridPivotLocal = { x_m: p.x_m, y_m: p.y_m };
      gridPivotMode = "custom";
      document.getElementById("gridPivot").value = "custom";
      awaitingPivotClick = false;
      document.getElementById("gridSummary").textContent =
        `Pivot set to R${p.row}·T${p.col} (double-click).`;
      renderGrid();
    });
    gridLayer.addLayer(m);
  }

  const summary = document.getElementById("gridSummary");
  if (!awaitingPivotClick) {
    const nRowsSurv = new Set(gridLocalPoints.map((p) => p.row)).size;
    const maskTag = filterMasks.length
      ? ` · ${filterMasks.length} mask${filterMasks.length === 1 ? "" : "s"}`
      : "";
    summary.textContent =
      `${gridLocalPoints.length} trees / ${nRowsSurv} rows · ` +
      `rotation ${gridRotationDeg.toFixed(1)}° · pivot: ${gridPivotMode}` +
      maskTag +
      ` · drag the red pin to move the grid`;
  }
}

// ---- Rotation gizmo -----------------------------------------------------
let rotationHandleMarker = null;
const ROT_HANDLE_OFFSET_M = 12; // metres from pivot; tweak for feel

const ROT_HANDLE_ICON = L.divIcon({
  className: "",
  html:
    '<div style="width:14px;height:14px;background:#10b981;' +
    "border:2px solid #fff;border-radius:50%;" +
    'box-shadow:0 0 0 1px #10b981;cursor:grab;"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function rotationHandleLatLon() {
  if (!gridOrigin) return null;
  const pv = pivotLocal();
  if (!pv) return null;
  const theta = (gridRotationDeg * Math.PI) / 180;
  const hx = pv.x_m + ROT_HANDLE_OFFSET_M * Math.cos(theta);
  const hy = pv.y_m + ROT_HANDLE_OFFSET_M * Math.sin(theta);
  return metresToLatLon(hx, hy, gridOrigin.lat, gridOrigin.lon);
}

function updateRotationHandlePosition() {
  if (!rotationHandleMarker) return;
  const ll = rotationHandleLatLon();
  if (ll) rotationHandleMarker.setLatLng([ll.lat, ll.lon]);
}

function renderRotationHandle() {
  if (rotationHandleMarker) {
    gridLayer.removeLayer(rotationHandleMarker);
    rotationHandleMarker = null;
  }
  if (!gridOrigin) return;
  const ll = rotationHandleLatLon();
  rotationHandleMarker = L.marker([ll.lat, ll.lon], {
    draggable: false,
    icon: ROT_HANDLE_ICON,
    bubblingMouseEvents: false,
  });
  rotationHandleMarker.bindTooltip("Drag to rotate");
  rotationHandleMarker.on("mousedown", (e) => {
    // Start a rotation drag re-using the Shift-drag machinery below.
    L.DomEvent.stopPropagation(e.originalEvent ?? e);
    beginRotateDrag(e.latlng);
  });
  gridLayer.addLayer(rotationHandleMarker);
}

function renderGrid() {
  renderPivotMarker();
  renderRotationHandle();
  renderGridDots();
}

// ---- Filter by polygon --------------------------------------------------
// Ray-casting point-in-polygon test on lat/lon (fine for farm-scale AOIs).
function pointInPolygon(lon, lat, polygon) {
  const ring = polygon.coordinates[0];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const hit =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-18) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

function applyMasks() {
  if (!filterMasks.length || !gridOrigin || !gridLocalPoints.length) return;
  const pivot = pivotLocal();
  for (const mask of filterMasks) {
    const survivors = [];
    for (const p of gridLocalPoints) {
      const r = rotateAround(p, pivot, gridRotationDeg);
      const { lat, lon } = metresToLatLon(
        r.x_m,
        r.y_m,
        gridOrigin.lat,
        gridOrigin.lon,
      );
      const inside = pointInPolygon(lon, lat, mask.polygon);
      const keep = mask.polarity === "positive" ? inside : !inside;
      if (keep) survivors.push(p);
    }
    gridLocalPoints = survivors;
  }
  renumberAfterFilter();
}

function renumberAfterFilter() {
  // Group by the old row number, renumber rows contiguously (1..N), and
  // renumber trees within each row so the first survivor becomes T1.
  const byRow = new Map();
  for (const p of gridLocalPoints) {
    if (!byRow.has(p.row)) byRow.set(p.row, []);
    byRow.get(p.row).push(p);
  }
  const oldRowNums = [...byRow.keys()].sort((a, b) => a - b);
  let newRow = 1;
  for (const oldRow of oldRowNums) {
    const pts = byRow.get(oldRow);
    pts.sort((a, b) => a.col - b.col); // preserve flow order within row
    pts.forEach((p, i) => {
      p.row = newRow;
      p.col = i + 1;
    });
    newRow++;
  }
}

function rebuildAndFilter() {
  rebuildGridPoints();
  if (filterMasks.length) applyMasks();
}

// Clicking anywhere on the map (not on a grid point) sets the pivot to
// that map coordinate when "custom" mode is armed.
map.on("click", (e) => {
  if (!awaitingPivotClick || !gridOrigin) return;
  const pt = latLonToMetres(
    e.latlng.lat,
    e.latlng.lng,
    gridOrigin.lat,
    gridOrigin.lon,
  );
  gridPivotLocal = { x_m: pt.x, y_m: pt.y };
  gridPivotMode = "custom";
  awaitingPivotClick = false;
  document.getElementById("gridSummary").textContent =
    "Pivot set to map click. Adjust rotation to see the effect.";
  renderGrid();
});

// Rotation drag — triggered either by Shift-drag anywhere on the map OR by
// mousedown on the green rotation gizmo. Shared state + helpers below.
const rotateDrag = { active: false, startAngle: 0, startRotation: 0 };

function angleFromPivot(latLng) {
  if (!gridOrigin) return 0;
  const pvl = pivotLocal();
  const pivotLL = metresToLatLon(
    pvl.x_m,
    pvl.y_m,
    gridOrigin.lat,
    gridOrigin.lon,
  );
  const { x, y } = latLonToMetres(
    latLng.lat,
    latLng.lng,
    pivotLL.lat,
    pivotLL.lon,
  );
  return Math.atan2(y, x); // radians, CCW from east
}

function beginRotateDrag(startLatLng) {
  if (!gridOrigin || !gridLocalPoints.length) return;
  rotateDrag.active = true;
  rotateDrag.startAngle = angleFromPivot(startLatLng);
  rotateDrag.startRotation = gridRotationDeg;
  map.dragging.disable();
  L.DomUtil.addClass(map.getContainer(), "grid-rotating");
  // Let mousemove events fly through the handle so we keep rotating even
  // when the cursor is on top of it.
  const el = rotationHandleMarker && rotationHandleMarker.getElement();
  if (el) el.style.pointerEvents = "none";
}

function endRotateDrag() {
  if (!rotateDrag.active) return;
  rotateDrag.active = false;
  map.dragging.enable();
  L.DomUtil.removeClass(map.getContainer(), "grid-rotating");
  const el = rotationHandleMarker && rotationHandleMarker.getElement();
  if (el) el.style.pointerEvents = "";
  renderGrid();
}

map.on("mousedown", (e) => {
  const o = e.originalEvent;
  if (!(o.shiftKey || o.ctrlKey || o.metaKey)) return;
  beginRotateDrag(e.latlng);
});

map.on("mousemove", (e) => {
  if (!rotateDrag.active) return;
  const delta = angleFromPivot(e.latlng) - rotateDrag.startAngle;
  gridRotationDeg = rotateDrag.startRotation + (delta * 180) / Math.PI;
  document.getElementById("gridRotation").value = gridRotationDeg.toFixed(1);
  updateRotationHandlePosition();
  renderGridDots();
});

map.on("mouseup", endRotateDrag);
window.addEventListener("mouseup", endRotateDrag);

function rebuildGridPoints() {
  if (!gridOrigin || !gridSpanM) return;

  const tree = parseFloat(document.getElementById("treeSpacing").value);
  const row = parseFloat(document.getElementById("rowSpacing").value);
  const axis = document.getElementById("majorEdge").value; // "EW" or "NS"
  if (!(tree > 0 && row > 0)) return;

  const rowsEl = document.getElementById("gridRows");
  const colsEl = document.getElementById("gridCols");
  const rowsIn = parseInt(rowsEl.value, 10);
  const colsIn = parseInt(colsEl.value, 10);

  // Auto-size from the source rectangle when the input is empty.
  let nRows, nTrees;
  if (axis === "EW") {
    nTrees =
      Number.isFinite(colsIn) && colsIn > 0
        ? colsIn
        : Math.floor(gridSpanM.w / tree) + 1;
    nRows =
      Number.isFinite(rowsIn) && rowsIn > 0
        ? rowsIn
        : Math.floor(gridSpanM.h / row) + 1;
  } else {
    nTrees =
      Number.isFinite(colsIn) && colsIn > 0
        ? colsIn
        : Math.floor(gridSpanM.h / tree) + 1;
    nRows =
      Number.isFinite(rowsIn) && rowsIn > 0
        ? rowsIn
        : Math.floor(gridSpanM.w / row) + 1;
  }
  rowsEl.value = nRows;
  colsEl.value = nTrees;

  const dirX = document.getElementById("flowX").value === "rtl" ? -1 : 1;
  const dirY = document.getElementById("flowY").value === "ttb" ? -1 : 1;

  // Positions grow from gridAnchor outward along the flow direction. So when
  // Rows/Trees-per-row are bumped, the new rows/trees appear on the "far" end
  // (where R_N / T_N are) and the existing ones never move.
  gridLocalPoints = [];
  if (axis === "EW") {
    for (let r = 0; r < nRows; r++) {
      for (let c = 0; c < nTrees; c++) {
        gridLocalPoints.push({
          row: r + 1,
          col: c + 1,
          x_m: gridAnchor.x_m + c * tree * dirX,
          y_m: gridAnchor.y_m + r * row * dirY,
        });
      }
    }
  } else {
    // NS major: row index varies in x, col index varies in y.
    for (let r = 0; r < nRows; r++) {
      for (let c = 0; c < nTrees; c++) {
        gridLocalPoints.push({
          row: r + 1,
          col: c + 1,
          x_m: gridAnchor.x_m + r * row * dirX,
          y_m: gridAnchor.y_m + c * tree * dirY,
        });
      }
    }
  }
}

document.getElementById("generateGrid").addEventListener("click", () => {
  const layers = drawn.getLayers();
  if (!layers.length) {
    alert("Draw a rectangle on the map first.");
    return;
  }
  const bounds = layers[layers.length - 1].getBounds();
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();

  gridOrigin = { lat: sw.lat, lon: sw.lng };
  const neM = latLonToMetres(ne.lat, ne.lng, sw.lat, sw.lng);
  gridSpanM = { w: neM.x, h: neM.y };

  const tree = parseFloat(document.getElementById("treeSpacing").value);
  const row = parseFloat(document.getElementById("rowSpacing").value);
  if (!(tree > 0 && row > 0)) {
    alert("Tree and row spacing must both be > 0.");
    return;
  }

  // Seed gridAnchor at the rectangle corner that matches the current flow.
  // ltr + btt  → SW, rtl + btt → SE, ltr + ttb → NW, rtl + ttb → NE.
  const flipX = document.getElementById("flowX").value === "rtl";
  const flipY = document.getElementById("flowY").value === "ttb";
  gridAnchor = {
    x_m: flipX ? gridSpanM.w : 0,
    y_m: flipY ? gridSpanM.h : 0,
  };

  rebuildGridPoints();

  gridRotationDeg =
    parseFloat(document.getElementById("gridRotation").value) || 0;
  gridPivotMode = document.getElementById("gridPivot").value;
  if (gridPivotMode !== "custom") gridPivotLocal = null;
  renderGrid();
});

// Live-update when counts, spacings, or major-edge change. These keep
// gridAnchor fixed so new rows/trees extend in the current flow direction.
for (const id of [
  "gridRows",
  "gridCols",
  "treeSpacing",
  "rowSpacing",
  "majorEdge",
]) {
  document.getElementById(id).addEventListener("change", () => {
    if (!gridOrigin) return;
    rebuildAndFilter();
    renderGrid();
  });
}

// Flow changes need an anchor update — otherwise flipping dirX/dirY alone
// would mirror the whole grid around the old anchor and make it jump.
// Instead, reseat the anchor at the current grid's extreme corner for the
// new flow, so the visible grid stays put and only the labels flip.
for (const id of ["flowX", "flowY"]) {
  document.getElementById(id).addEventListener("change", () => {
    if (!gridOrigin) return;
    const ex = gridExtents();
    if (ex) {
      const flipX = document.getElementById("flowX").value === "rtl";
      const flipY = document.getElementById("flowY").value === "ttb";
      gridAnchor = {
        x_m: flipX ? ex.maxX : ex.minX,
        y_m: flipY ? ex.maxY : ex.minY,
      };
    }
    rebuildAndFilter();
    renderGrid();
  });
}

document.getElementById("gridRotation").addEventListener("input", (e) => {
  gridRotationDeg = parseFloat(e.target.value) || 0;
  if (gridLocalPoints.length) {
    updateRotationHandlePosition();
    renderGridDots();
  }
});

document.getElementById("gridPivot").addEventListener("change", (e) => {
  gridPivotMode = e.target.value;
  if (gridPivotMode === "custom") {
    awaitingPivotClick = true;
    document.getElementById("gridSummary").textContent =
      "Click anywhere — a grid point or a spot on the map — to set the rotation pivot.";
    return;
  }
  awaitingPivotClick = false;
  if (gridLocalPoints.length) renderGrid();
});

document.getElementById("clearGrid").addEventListener("click", () => {
  gridLayer.clearLayers();
  filterLayer.clearLayers();
  gridLocalPoints = [];
  gridOrigin = null;
  gridSpanM = null;
  gridAnchor = { x_m: 0, y_m: 0 };
  gridPivotLocal = null;
  awaitingPivotClick = false;
  pivotMarker = null;
  rotationHandleMarker = null;
  filterMasks = [];
  awaitingFilterDraw = false;
  document.getElementById("gridSummary").textContent = "";
});

document.getElementById("drawFilter").addEventListener("click", () => {
  if (!gridLocalPoints.length) {
    alert("Generate the grid first.");
    return;
  }
  awaitingFilterDraw = true;
  pendingMaskPolarity = document.getElementById("maskPolarity").value;
  const style =
    pendingMaskPolarity === "positive"
      ? MASK_STYLE_POSITIVE
      : MASK_STYLE_NEGATIVE;
  document.getElementById("gridSummary").textContent =
    `Drawing ${pendingMaskPolarity} mask — click vertices, double-click (or click first vertex) to finish.`;
  new L.Draw.Polygon(map, {
    allowIntersection: false,
    showArea: false,
    shapeOptions: style,
  }).enable();
});

document.getElementById("clearFilter").addEventListener("click", () => {
  if (!filterMasks.length && !awaitingFilterDraw) return;
  filterMasks = [];
  awaitingFilterDraw = false;
  filterLayer.clearLayers();
  if (gridOrigin) {
    rebuildGridPoints(); // rebuild WITHOUT any masks
    renderGrid();
  }
});

// Derive a feature-name prefix from a human block name.
// "KINYORO BLK 4 - KL" -> split on " - " -> "KINYORO BLK 4" -> strip non-alphanum -> "KINYOROBLK4"
function blockPrefix(blockName) {
  const raw = (blockName || "").split(" - ")[0];
  return raw.replace(/[^A-Za-z0-9]/g, "");
}

function refreshBlockPrefixHint() {
  const name = document.getElementById("blockName").value;
  const px = blockPrefix(name);
  const hint = document.getElementById("blockPrefixHint");
  hint.innerHTML =
    `Prefix: <code>${px || "—"}</code>` +
    (px ? ` · Example: <code>${px}_ROW1_T1</code>` : "");
}
document
  .getElementById("blockName")
  .addEventListener("input", refreshBlockPrefixHint);
refreshBlockPrefixHint();

function buildGridFeatureCollection() {
  const pivot = pivotLocal();
  const px = blockPrefix(document.getElementById("blockName").value);
  const features = gridLocalPoints.map((p) => {
    const rot = rotateAround(p, pivot, gridRotationDeg);
    const { lat, lon } = metresToLatLon(
      rot.x_m,
      rot.y_m,
      gridOrigin.lat,
      gridOrigin.lon,
    );
    const name = px ? `${px}_ROW${p.row}_T${p.col}` : `ROW${p.row}_T${p.col}`;
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: { name },
    };
  });
  return { type: "FeatureCollection", features };
}

document
  .getElementById("copyGridGeoJson")
  .addEventListener("click", async () => {
    if (!gridOrigin || !gridLocalPoints.length) {
      alert("Generate a grid first.");
      return;
    }
    const fc = buildGridFeatureCollection();
    const txt = JSON.stringify(fc, null, 2);
    try {
      await navigator.clipboard.writeText(txt);
      document.getElementById("gridSummary").textContent =
        `Copied ${fc.features.length} points to clipboard.`;
    } catch {
      // Clipboard blocked (insecure context, permission denied) — fall back to download.
      triggerDownload(txt, gridDownloadFilename());
    }
  });

function triggerDownload(txt, fname) {
  const blob = new Blob([txt], { type: "application/geo+json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function safeFileSegment(s, fallback) {
  const cleaned = (s || "").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

function gridDownloadFilename() {
  const px = blockPrefix(document.getElementById("blockName").value);
  return (px || "grid") + "_trees.geojson";
}

document.getElementById("downloadGridGeoJson").addEventListener("click", () => {
  if (!gridOrigin || !gridLocalPoints.length) {
    alert("Generate a grid first.");
    return;
  }
  const fc = buildGridFeatureCollection();
  triggerDownload(JSON.stringify(fc, null, 2), gridDownloadFilename());
  document.getElementById("gridSummary").textContent =
    `Downloaded ${fc.features.length} points.`;
});

document.getElementById("downloadPolygon").addEventListener("click", () => {
  if (!currentPolygon) {
    alert("Draw or paste a polygon first.");
    return;
  }
  const name = document.getElementById("name").value.trim();
  const feature = {
    type: "Feature",
    geometry: currentPolygon,
    properties: name ? { name } : {},
  };
  const fc = { type: "FeatureCollection", features: [feature] };
  triggerDownload(
    JSON.stringify(fc, null, 2),
    safeFileSegment(name, "polygon") + ".geojson",
  );
});

// =========================================================================
// Reference points — user-named pins (A, B, C…) that persist in localStorage.
// Draggable; delete individually; click "Pick on map" to capture a coord.
// =========================================================================

// Distinguishable palette used for both reference markers and saved shapes.
// Items get a colour assigned at creation; users can override per-item.
const COLOR_PALETTE = [
  "#dc2626", "#ea580c", "#d97706", "#ca8a04", "#65a30d",
  "#16a34a", "#0891b2", "#2563eb", "#7c3aed", "#c026d3",
  "#db2777", "#0f766e", "#9333ea", "#0ea5e9", "#f43f5e",
];
function paletteColor(index) {
  return COLOR_PALETTE[((index % COLOR_PALETTE.length) + COLOR_PALETTE.length) % COLOR_PALETTE.length];
}
function ensureColors(items, persist) {
  let changed = false;
  items.forEach((it, i) => {
    if (!it.color) {
      it.color = paletteColor(i);
      changed = true;
    }
  });
  if (changed && persist) persist();
}

const REF_STORE_KEY = "referencePoints";
const REF_VISIBLE_KEY = "referencePointsVisible";
const REF_OPACITY_KEY = "referencePointsOpacity";
// Dedicated pane so reference pins always render above beds/zones/grid/drawn
// shapes. Leaflet's default markerPane is 600; we go higher.
map.createPane("refPane");
map.getPane("refPane").style.zIndex = 700;
const refLayer = L.layerGroup();
let refVisible = localStorage.getItem(REF_VISIBLE_KEY) === "1";
let refOpacity = (() => {
  const raw = localStorage.getItem(REF_OPACITY_KEY);
  const v = raw == null ? 0.6 : parseFloat(raw);
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.6;
})();
if (refVisible) refLayer.addTo(map);
let refPoints = []; // [{name, lat, lon}]
let refMarkers = new Map(); // name -> marker
let awaitingRefPick = false;

function loadRefPoints() {
  try {
    const raw = localStorage.getItem(REF_STORE_KEY);
    refPoints = raw ? JSON.parse(raw) : [];
  } catch {
    refPoints = [];
  }
  ensureColors(refPoints, saveRefPoints);
}
function saveRefPoints() {
  localStorage.setItem(REF_STORE_KEY, JSON.stringify(refPoints));
}

function nextRefName() {
  const used = new Set(refPoints.map((p) => p.name));
  for (let i = 0; i < 26; i++) {
    const c = String.fromCharCode(65 + i);
    if (!used.has(c)) return c;
  }
  // Past Z — AA, AB, …
  for (let i = 0; i < 26; i++) {
    for (let j = 0; j < 26; j++) {
      const c = String.fromCharCode(65 + i) + String.fromCharCode(65 + j);
      if (!used.has(c)) return c;
    }
  }
  return "";
}

function refIcon(name, color) {
  // No baked-in opacity — the marker's own setOpacity drives it live.
  const bg = color || "#171717";
  return L.divIcon({
    className: "",
    html:
      `<div style="position:relative;width:22px;height:22px;background:${bg};` +
      `border:2px solid #fff;border-radius:50%;` +
      `box-shadow:0 0 0 1px rgba(0,0,0,0.35);` +
      `color:#fff;font:600 11px/18px -apple-system,sans-serif;text-align:center;">` +
      `${name}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function renderRefMarkers() {
  refLayer.clearLayers();
  refMarkers.clear();
  for (const p of refPoints) {
    const m = L.marker([p.lat, p.lon], {
      draggable: true,
      icon: refIcon(p.name, p.color),
      pane: "refPane",
      opacity: refOpacity,
      bubblingMouseEvents: false,
    });
    m.bindTooltip(`${p.name} · ${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`);
    m.on("dragend", (e) => {
      const ll = e.target.getLatLng();
      p.lat = ll.lat;
      p.lon = ll.lng;
      saveRefPoints();
      renderRefList();
      m.setTooltipContent(
        `${p.name} · ${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`,
      );
    });
    refLayer.addLayer(m);
    refMarkers.set(p.name, m);
  }
}

function renderRefList() {
  const ul = document.getElementById("refList");
  ul.innerHTML = "";
  for (const p of refPoints) {
    const li = document.createElement("li");
    const label = document.createElement("span");
    const swatch = document.createElement("input");
    swatch.type = "color";
    swatch.value = p.color || "#171717";
    swatch.title = "Change colour";
    swatch.className = "color-swatch";
    swatch.addEventListener("input", (ev) => {
      p.color = ev.target.value;
      saveRefPoints();
      const m = refMarkers.get(p.name);
      if (m) m.setIcon(refIcon(p.name, p.color));
    });
    label.appendChild(swatch);
    const text = document.createElement("span");
    text.innerHTML = ` <strong>${p.name}</strong> ${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`;
    label.appendChild(text);
    const actions = document.createElement("span");
    const zoom = document.createElement("a");
    zoom.href = "#";
    zoom.textContent = "zoom";
    zoom.style.marginRight = "8px";
    zoom.addEventListener("click", (ev) => {
      ev.preventDefault();
      map.setView([p.lat, p.lon], Math.max(map.getZoom(), 18));
    });
    const del = document.createElement("a");
    del.href = "#";
    del.textContent = "delete";
    del.addEventListener("click", (ev) => {
      ev.preventDefault();
      refPoints = refPoints.filter((x) => x !== p);
      saveRefPoints();
      renderRefMarkers();
      renderRefList();
      document.getElementById("refName").value = nextRefName();
    });
    actions.appendChild(zoom);
    actions.appendChild(del);
    li.appendChild(label);
    li.appendChild(actions);
    ul.appendChild(li);
  }
}

function addRefPoint(name, lat, lon) {
  if (!name) {
    alert("Name required.");
    return;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    alert("Valid lat/lon required.");
    return;
  }
  const existing = refPoints.findIndex((p) => p.name === name);
  if (existing >= 0) {
    const prevColor = refPoints[existing].color;
    refPoints[existing] = { name, lat, lon, color: prevColor || paletteColor(existing) };
  } else {
    refPoints.push({ name, lat, lon, color: paletteColor(refPoints.length) });
  }
  saveRefPoints();
  renderRefMarkers();
  renderRefList();
  document.getElementById("refName").value = nextRefName();
  document.getElementById("refLat").value = "";
  document.getElementById("refLon").value = "";
}

document.getElementById("refAdd").addEventListener("click", () => {
  const name = document.getElementById("refName").value.trim();
  const lat = parseFloat(document.getElementById("refLat").value);
  const lon = parseFloat(document.getElementById("refLon").value);
  addRefPoint(name, lat, lon);
});

document.getElementById("refPick").addEventListener("click", () => {
  awaitingRefPick = true;
  map.getContainer().style.cursor = "crosshair";
});

function pointsFromGeoJson(gj) {
  // Accept Point, Feature<Point>, or FeatureCollection of Point features.
  // Returns [{name, lat, lon}]. name comes from properties.name/Name/id if
  // present; callers fall back to nextRefName() when it's blank.
  const out = [];
  const pushGeom = (geom, props) => {
    if (!geom || geom.type !== "Point") return;
    const [lon, lat] = geom.coordinates;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const name = (props && (props.name ?? props.Name ?? props.id)) || "";
    out.push({ name: String(name).trim(), lat, lon });
  };
  if (gj.type === "FeatureCollection") {
    for (const f of gj.features || []) pushGeom(f.geometry, f.properties || {});
  } else if (gj.type === "Feature") {
    pushGeom(gj.geometry, gj.properties || {});
  } else if (gj.type === "Point") {
    pushGeom(gj, {});
  }
  return out;
}

document.getElementById("refLoadGeoJson").addEventListener("click", () => {
  const raw = document.getElementById("refGeoJson").value.trim();
  if (!raw) return;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    alert("Invalid JSON: " + e.message);
    return;
  }
  const pts = pointsFromGeoJson(parsed);
  if (!pts.length) {
    alert("No Point features found in that GeoJSON.");
    return;
  }
  for (const p of pts) addRefPoint(p.name || nextRefName(), p.lat, p.lon);
  document.getElementById("refGeoJson").value = "";
});

map.on("click", (e) => {
  if (!awaitingRefPick) return;
  awaitingRefPick = false;
  map.getContainer().style.cursor = "";
  const name =
    document.getElementById("refName").value.trim() || nextRefName();
  addRefPoint(name, e.latlng.lat, e.latlng.lng);
});

document.getElementById("refClear").addEventListener("click", () => {
  if (!refPoints.length) return;
  if (!confirm(`Delete all ${refPoints.length} reference points?`)) return;
  refPoints = [];
  saveRefPoints();
  renderRefMarkers();
  renderRefList();
  document.getElementById("refName").value = nextRefName();
});

document.getElementById("refCopy").addEventListener("click", async () => {
  if (!refPoints.length) {
    alert("No reference points yet.");
    return;
  }
  const fc = {
    type: "FeatureCollection",
    features: refPoints.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: { name: p.name },
    })),
  };
  const txt = JSON.stringify(fc, null, 2);
  try {
    await navigator.clipboard.writeText(txt);
    alert(`Copied ${fc.features.length} points.`);
  } catch {
    const blob = new Blob([txt], { type: "application/geo+json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "reference_points.geojson";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
});

function applyRefVisibility() {
  const cb = document.getElementById("refVisibleToggle");
  if (cb) cb.checked = refVisible;
  if (refVisible) {
    if (!map.hasLayer(refLayer)) refLayer.addTo(map);
  } else {
    if (map.hasLayer(refLayer)) map.removeLayer(refLayer);
  }
}

function applyRefOpacity() {
  const pct = Math.round(refOpacity * 100);
  const slider = document.getElementById("refOpacity");
  const label = document.getElementById("refOpacityVal");
  if (slider) slider.value = String(pct);
  if (label) label.textContent = `${pct}%`;
  refLayer.eachLayer((m) => {
    if (m.setOpacity) m.setOpacity(refOpacity);
  });
}

document.getElementById("refVisibleToggle").addEventListener("change", (e) => {
  refVisible = e.target.checked;
  localStorage.setItem(REF_VISIBLE_KEY, refVisible ? "1" : "0");
  applyRefVisibility();
});

document.getElementById("refOpacity").addEventListener("input", (e) => {
  refOpacity = Math.min(1, Math.max(0, parseInt(e.target.value, 10) / 100));
  localStorage.setItem(REF_OPACITY_KEY, String(refOpacity));
  applyRefOpacity();
});

loadRefPoints();
renderRefMarkers();
renderRefList();
applyRefVisibility();
applyRefOpacity();
document.getElementById("refName").value = nextRefName();

// =========================================================================
// Saved shapes — named polygons/rectangles that persist in localStorage and
// can be toggled on as map overlays, or pushed back into the draw layer
// (`drawn`) to drive bed/zone/tree generation.
// =========================================================================

const SHAPE_STORE_KEY = "savedShapes";
const SHAPE_VISIBLE_KEY = "savedShapesVisible";
const SHAPE_OPACITY_KEY = "savedShapesOpacity";
// Render below the active overlayPane (400) and above gridPane (350) so the
// current `drawn` polygon still paints on top of saved overlays.
map.createPane("savedShapesPane");
map.getPane("savedShapesPane").style.zIndex = 380;
const shapesOverlayLayer = L.layerGroup();
let shapesMasterVisible = localStorage.getItem(SHAPE_VISIBLE_KEY) === "1";
let shapesOpacity = (() => {
  const raw = localStorage.getItem(SHAPE_OPACITY_KEY);
  const v = raw == null ? 0.4 : parseFloat(raw);
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.4;
})();
if (shapesMasterVisible) shapesOverlayLayer.addTo(map);
let savedShapes = []; // [{name, geometry, visible}]
let shapeLayerByName = new Map(); // name -> leaflet layer (when visible)

// Base style — opacity/fillOpacity are derived from shapesOpacity at render time.
const SAVED_SHAPE_STYLE = {
  weight: 1.5,
  dashArray: "6,4",
};
function currentShapeStyle(shape) {
  const c = (shape && shape.color) || "#525252";
  return {
    ...SAVED_SHAPE_STYLE,
    color: c,
    fillColor: c,
    opacity: shapesOpacity,
    // Fill is always much lighter than stroke, scaled by the same slider.
    fillOpacity: shapesOpacity * 0.18,
  };
}

function loadSavedShapes() {
  try {
    const raw = localStorage.getItem(SHAPE_STORE_KEY);
    savedShapes = raw ? JSON.parse(raw) : [];
  } catch {
    savedShapes = [];
  }
  ensureColors(savedShapes, persistSavedShapes);
}
function persistSavedShapes() {
  localStorage.setItem(SHAPE_STORE_KEY, JSON.stringify(savedShapes));
}

function nextShapeName() {
  const used = new Set(savedShapes.map((s) => s.name));
  for (let i = 1; i < 1000; i++) {
    const candidate = `Shape ${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `Shape ${Date.now()}`;
}

function renderSavedShapeOverlay(shape) {
  // Remove any existing rendering of this shape first.
  const prev = shapeLayerByName.get(shape.name);
  if (prev) {
    shapesOverlayLayer.removeLayer(prev);
    shapeLayerByName.delete(shape.name);
  }
  if (!shape.visible) return;
  const gj = L.geoJSON(shape.geometry, {
    pane: "savedShapesPane",
    style: currentShapeStyle(shape),
  });
  gj.bindTooltip(shape.name, { sticky: true, direction: "center" });
  shapesOverlayLayer.addLayer(gj);
  shapeLayerByName.set(shape.name, gj);
}

function renderAllSavedShapeOverlays() {
  shapesOverlayLayer.clearLayers();
  shapeLayerByName.clear();
  for (const s of savedShapes) renderSavedShapeOverlay(s);
}

function renderSavedShapeList() {
  const ul = document.getElementById("shapeList");
  ul.innerHTML = "";
  for (const s of savedShapes) {
    const li = document.createElement("li");
    const label = document.createElement("span");
    const swatch = document.createElement("input");
    swatch.type = "color";
    swatch.value = s.color || "#525252";
    swatch.title = "Change colour";
    swatch.className = "color-swatch";
    swatch.addEventListener("input", (ev) => {
      s.color = ev.target.value;
      persistSavedShapes();
      const lyr = shapeLayerByName.get(s.name);
      if (lyr && lyr.setStyle) lyr.setStyle(currentShapeStyle(s));
    });
    label.appendChild(swatch);
    const dot = s.visible ? "●" : "○";
    const text = document.createElement("span");
    text.innerHTML = ` <span style="color:${s.color || "#525252"}">${dot}</span> <strong>${s.name}</strong>`;
    label.appendChild(text);
    const actions = document.createElement("span");

    const toggle = document.createElement("a");
    toggle.href = "#";
    toggle.textContent = s.visible ? "hide" : "show";
    toggle.style.marginRight = "6px";
    toggle.addEventListener("click", (ev) => {
      ev.preventDefault();
      s.visible = !s.visible;
      persistSavedShapes();
      renderSavedShapeOverlay(s);
      renderSavedShapeList();
    });

    const zoom = document.createElement("a");
    zoom.href = "#";
    zoom.textContent = "zoom";
    zoom.style.marginRight = "6px";
    zoom.addEventListener("click", (ev) => {
      ev.preventDefault();
      const lyr = L.geoJSON(s.geometry);
      const b = lyr.getBounds();
      if (b.isValid()) map.fitBounds(b, { padding: [20, 20] });
    });

    const use = document.createElement("a");
    use.href = "#";
    use.textContent = "use";
    use.style.marginRight = "6px";
    use.title = "Load into draw layer for beds/grid generation";
    use.addEventListener("click", (ev) => {
      ev.preventDefault();
      setPolygon(s.geometry);
    });

    const dl = document.createElement("a");
    dl.href = "#";
    dl.textContent = "download";
    dl.style.marginRight = "6px";
    dl.title = "Download as GeoJSON";
    dl.addEventListener("click", (ev) => {
      ev.preventDefault();
      downloadSavedShape(s);
    });

    const del = document.createElement("a");
    del.href = "#";
    del.textContent = "delete";
    del.addEventListener("click", (ev) => {
      ev.preventDefault();
      if (!confirm(`Delete saved shape "${s.name}"?`)) return;
      savedShapes = savedShapes.filter((x) => x !== s);
      persistSavedShapes();
      renderAllSavedShapeOverlays();
      renderSavedShapeList();
    });

    actions.appendChild(toggle);
    actions.appendChild(zoom);
    actions.appendChild(use);
    actions.appendChild(dl);
    actions.appendChild(del);
    li.appendChild(label);
    li.appendChild(actions);
    ul.appendChild(li);
  }
}

function addSavedShape(name, geometry) {
  if (!geometry) {
    alert("No geometry.");
    return;
  }
  const finalName = (name || "").trim() || nextShapeName();
  const existing = savedShapes.findIndex((s) => s.name === finalName);
  const color =
    existing >= 0 && savedShapes[existing].color
      ? savedShapes[existing].color
      : paletteColor(savedShapes.length);
  const entry = { name: finalName, geometry, visible: true, color };
  if (existing >= 0) savedShapes[existing] = entry;
  else savedShapes.push(entry);
  persistSavedShapes();
  renderSavedShapeOverlay(entry);
  renderSavedShapeList();
  document.getElementById("shapeName").value = "";
}

function geometriesFromGeoJson(gj) {
  // Accept any geometry type (Polygon, MultiPolygon, LineString, …) — we just
  // hand them to L.geoJSON for rendering. Returns [{name, geometry}].
  const out = [];
  const pushGeom = (geom, props, fallbackIdx) => {
    if (!geom) return;
    const n =
      (props && (props.name ?? props.Name ?? props.id)) ||
      `Imported ${fallbackIdx}`;
    out.push({ name: String(n).trim(), geometry: geom });
  };
  if (gj.type === "FeatureCollection") {
    (gj.features || []).forEach((f, i) =>
      pushGeom(f.geometry, f.properties || {}, i + 1),
    );
  } else if (gj.type === "Feature") {
    pushGeom(gj.geometry, gj.properties || {}, 1);
  } else if (gj.type && gj.coordinates) {
    // Bare geometry.
    pushGeom(gj, {}, 1);
  }
  return out;
}

document.getElementById("shapeSaveCurrent").addEventListener("click", () => {
  const layers = drawn.getLayers();
  if (!layers.length) {
    alert("Draw a shape on the map first.");
    return;
  }
  // If multiple shapes are drawn, save them as a single MultiPolygon-ish
  // FeatureCollection-style save by saving each one individually with a
  // suffixed name. Most of the app assumes a single shape in `drawn`, so
  // this is the common path.
  const typed = document.getElementById("shapeName").value.trim();
  if (layers.length === 1) {
    addSavedShape(typed || nextShapeName(), layers[0].toGeoJSON().geometry);
  } else {
    const base = typed || nextShapeName();
    layers.forEach((l, i) =>
      addSavedShape(`${base} (${i + 1})`, l.toGeoJSON().geometry),
    );
  }
});

document.getElementById("shapeLoadGeoJson").addEventListener("click", () => {
  const raw = document.getElementById("shapeGeoJson").value.trim();
  if (!raw) return;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    alert("Invalid JSON: " + e.message);
    return;
  }
  const items = geometriesFromGeoJson(parsed);
  if (!items.length) {
    alert("No geometry found in that GeoJSON.");
    return;
  }
  const typed = document.getElementById("shapeName").value.trim();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const name =
      typed && items.length === 1
        ? typed
        : typed
          ? `${typed} (${i + 1})`
          : item.name;
    addSavedShape(name, item.geometry);
  }
  document.getElementById("shapeGeoJson").value = "";
});

document.getElementById("shapeHideAll").addEventListener("click", () => {
  for (const s of savedShapes) s.visible = false;
  persistSavedShapes();
  renderAllSavedShapeOverlays();
  renderSavedShapeList();
});

document.getElementById("shapeShowAll").addEventListener("click", () => {
  for (const s of savedShapes) s.visible = true;
  persistSavedShapes();
  renderAllSavedShapeOverlays();
  renderSavedShapeList();
});

function savedShapeFeature(s) {
  const props = { name: s.name };
  if (s.color) props.color = s.color;
  return { type: "Feature", geometry: s.geometry, properties: props };
}

function downloadSavedShape(s) {
  const fc = { type: "FeatureCollection", features: [savedShapeFeature(s)] };
  triggerDownload(
    JSON.stringify(fc, null, 2),
    safeFileSegment(s.name, "shape") + ".geojson",
  );
}

document.getElementById("shapeDownloadAll").addEventListener("click", () => {
  if (!savedShapes.length) {
    alert("No saved shapes to download.");
    return;
  }
  const fc = {
    type: "FeatureCollection",
    features: savedShapes.map(savedShapeFeature),
  };
  triggerDownload(JSON.stringify(fc, null, 2), "saved_shapes.geojson");
});

function applyShapesMasterVisibility() {
  const cb = document.getElementById("shapeVisibleToggle");
  if (cb) cb.checked = shapesMasterVisible;
  if (shapesMasterVisible) {
    if (!map.hasLayer(shapesOverlayLayer)) shapesOverlayLayer.addTo(map);
  } else {
    if (map.hasLayer(shapesOverlayLayer)) map.removeLayer(shapesOverlayLayer);
  }
}

function applyShapesOpacity() {
  const pct = Math.round(shapesOpacity * 100);
  const slider = document.getElementById("shapeOpacity");
  const label = document.getElementById("shapeOpacityVal");
  if (slider) slider.value = String(pct);
  if (label) label.textContent = `${pct}%`;
  const byName = new Map(savedShapes.map((s) => [s.name, s]));
  shapeLayerByName.forEach((lyr, name) => {
    if (lyr.setStyle) lyr.setStyle(currentShapeStyle(byName.get(name)));
  });
}

document
  .getElementById("shapeVisibleToggle")
  .addEventListener("change", (e) => {
    shapesMasterVisible = e.target.checked;
    localStorage.setItem(SHAPE_VISIBLE_KEY, shapesMasterVisible ? "1" : "0");
    applyShapesMasterVisibility();
  });

document.getElementById("shapeOpacity").addEventListener("input", (e) => {
  shapesOpacity = Math.min(1, Math.max(0, parseInt(e.target.value, 10) / 100));
  localStorage.setItem(SHAPE_OPACITY_KEY, String(shapesOpacity));
  applyShapesOpacity();
});

loadSavedShapes();
renderAllSavedShapeOverlays();
renderSavedShapeList();
applyShapesMasterVisibility();
applyShapesOpacity();

// =========================================================================
// Click-through toggle — when active, overlays (saved shapes, reference
// markers, tree grid dots) become non-interactive so clicks pass through to
// the map below. Useful when an overlay is blocking a draw / pick / pivot
// action. The drawn polygon, beds/zones and pivot/rotation handles stay
// interactive.
// =========================================================================

const PASS_THROUGH_KEY = "overlaysPassThrough";
const PASS_THROUGH_PANES = ["refPane", "savedShapesPane", "gridPane"];
let passThroughActive = localStorage.getItem(PASS_THROUGH_KEY) === "1";

function applyPassThrough() {
  for (const name of PASS_THROUGH_PANES) {
    const el = map.getPane(name);
    if (el) el.style.pointerEvents = passThroughActive ? "none" : "";
  }
}

const PassThroughControl = L.Control.extend({
  options: { position: "bottomleft" },
  onAdd() {
    const wrapper = L.DomUtil.create("div", "leaflet-bar pass-through-control");
    const btn = L.DomUtil.create("a", "", wrapper);
    btn.href = "#";
    btn.setAttribute("role", "button");
    this._btn = btn;
    L.DomEvent.disableClickPropagation(wrapper);
    L.DomEvent.on(btn, "click", (e) => {
      L.DomEvent.preventDefault(e);
      passThroughActive = !passThroughActive;
      localStorage.setItem(PASS_THROUGH_KEY, passThroughActive ? "1" : "0");
      applyPassThrough();
      this._render();
    });
    this._render();
    return wrapper;
  },
  _render() {
    if (!this._btn) return;
    this._btn.textContent = passThroughActive
      ? "Overlays: pass-through"
      : "Overlays: interactive";
    this._btn.title = passThroughActive
      ? "Click to re-enable interaction with overlays & points"
      : "Click to let map clicks pass through overlays & points";
    this._btn.classList.toggle("active", passThroughActive);
  },
});
new PassThroughControl().addTo(map);
applyPassThrough();

// ---- Shape editor bridge --------------------------------------------------
window.app.onUsePolygon = function (geom) {
  const normalized = normalizeToPolygonGeometry(geom);
  if (!normalized) {
    alert("Shape editor produced no usable polygon.");
    return;
  }
  setPolygon(normalized);
  schedulePreview();
};

window.app.isMapClickConsumed = function () {
  // True when app.js's own click handler is in "awaiting" mode and will
  // consume the click for terrace/corner/swap/pivot/ref-point pick or filter mask draw.
  return Boolean(
    (typeof awaitingTerracePick !== "undefined" && awaitingTerracePick) ||
    (typeof awaitingCornerPick !== "undefined" && awaitingCornerPick) ||
    (typeof awaitingSwapPick !== "undefined" && awaitingSwapPick) ||
    (typeof awaitingPivotClick !== "undefined" && awaitingPivotClick) ||
    (typeof awaitingRefPick !== "undefined" && awaitingRefPick) ||
    (typeof awaitingFilterDraw !== "undefined" && awaitingFilterDraw)
  );
};
