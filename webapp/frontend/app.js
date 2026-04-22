/* global L */

const map = L.map("map", { zoomControl: true }).setView([0.0686, 35.7480], 16);

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
  { maxZoom: 22, subdomains: ["0", "1", "2", "3"], attribution: "&copy; Google" },
).addTo(map);

const googleHybrid = L.tileLayer(
  "https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
  { maxZoom: 22, subdomains: ["0", "1", "2", "3"], attribution: "&copy; Google" },
);

const googleTerrain = L.tileLayer(
  "https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}",
  { maxZoom: 22, subdomains: ["0", "1", "2", "3"], attribution: "&copy; Google" },
);

const googleRoad = L.tileLayer(
  "https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
  { maxZoom: 22, subdomains: ["0", "1", "2", "3"], attribution: "&copy; Google" },
);

const yandexSat = L.tileLayer(
  "https://sat0{s}.maps.yandex.net/tiles?l=sat&v=3.456.0&x={x}&y={y}&z={z}",
  { maxZoom: 19, subdomains: ["1", "2", "3", "4"], attribution: "&copy; Yandex" },
);

const esriTopo = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19, attribution: "Esri World Topo" },
);

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
const gibsDate = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
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
    { maxZoom: 22, tileSize: 512, zoomOffset: -1, attribution: "&copy; Mapbox" },
  );
  keyedLayers["Mapbox Satellite Streets"] = L.tileLayer(
    `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}?access_token=${mapboxKey}`,
    { maxZoom: 22, tileSize: 512, zoomOffset: -1, attribution: "&copy; Mapbox" },
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

const layerControl = L.control.layers(
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
    "OpenTopoMap": openTopo,
    "OSM Humanitarian": osmHot,
    "Carto Light": cartoLight,
    "Carto Dark": cartoDark,
    [`NASA VIIRS (${gibsDate})`]: nasaViirs,
    OSM: osm,
    ...keyedLayers,
  },
  null,
  { position: "topleft", collapsed: true },
).addTo(map);

// Esri Wayback — pick the freshest available release for any AOI. Fetched async.
fetch("https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json")
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
    layerControl.addBaseLayer(waybackLayer, `Esri Wayback (${latest.itemReleaseName})`);
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
    polygon: { allowIntersection: false, showArea: true, shapeOptions: { color: "#0f6fd1" } },
    rectangle: { shapeOptions: { color: "#0f6fd1" } },
    polyline: false, circle: false, marker: false, circlemarker: false,
  },
  edit: { featureGroup: drawn, remove: true },
});
map.addControl(drawControl);

const bedsLayer = L.layerGroup().addTo(map);
const zonesLayer = L.layerGroup().addTo(map);

let currentPolygon = null; // GeoJSON geometry

// ---- status banner --------------------------------------------------------
const statusEl = document.getElementById("status");
function setStatus(text, kind = "idle") {
  statusEl.textContent = text;
  statusEl.className = "status-" + kind;
}

// ---- polygon handling -----------------------------------------------------
function setPolygon(geojson) {
  drawn.clearLayers();
  try {
    const layer = L.geoJSON(geojson, { style: { color: "#0f6fd1" } });
    layer.eachLayer((l) => drawn.addLayer(l));
    const bounds = drawn.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
    currentPolygon = geojson;
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
});
map.on(L.Draw.Event.EDITED, () => {
  // Re-grab geometry from whatever is in `drawn`.
  const layers = drawn.getLayers();
  if (layers.length) currentPolygon = layers[0].toGeoJSON().geometry;
});
map.on(L.Draw.Event.DELETED, () => {
  currentPolygon = null;
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
});

document.getElementById("clearPolygon").addEventListener("click", () => {
  drawn.clearLayers();
  bedsLayer.clearLayers();
  zonesLayer.clearLayers();
  currentPolygon = null;
  document.getElementById("summary").textContent = "";
  setStatus("ready", "idle");
});

// ---- generation -----------------------------------------------------------
function renderResult(fc) {
  bedsLayer.clearLayers();
  zonesLayer.clearLayers();

  const beds = { type: "FeatureCollection", features: fc.features.filter(f => f.properties.kind === "bed") };
  const zones = { type: "FeatureCollection", features: fc.features.filter(f => f.properties.kind === "zone") };

  L.geoJSON(beds, {
    style: { color: "#1f9d55", weight: 3, opacity: 0.9 },
    onEachFeature: (f, l) => l.bindTooltip(f.properties.bed_id, { sticky: true, direction: "center" }),
  }).addTo(bedsLayer);

  L.geoJSON(zones, {
    style: { color: "#f59e0b", weight: 5, opacity: 0.55 },
    onEachFeature: (f, l) => l.bindTooltip(f.properties.zone_id, { sticky: true, direction: "center" }),
  }).addTo(zonesLayer);
}

document.getElementById("generate").addEventListener("click", async () => {
  if (!currentPolygon) {
    alert("Draw or paste a polygon first.");
    return;
  }
  const body = {
    polygon: currentPolygon,
    bed_spacing: parseFloat(document.getElementById("bedSpacing").value),
    zone_length: parseFloat(document.getElementById("zoneLength").value),
    buffer_m: parseFloat(document.getElementById("bufferM").value),
    direction: document.getElementById("direction").value,
    name: document.getElementById("name").value || null,
  };

  setStatus("generating…", "busy");
  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Request failed");
    }
    const data = await res.json();
    renderResult(data.result);
    const m = data.result.metadata;
    document.getElementById("summary").textContent =
      `Beds: ${m.bed_count}   Zones: ${m.zone_count}\n` +
      `Area: ${m.area_m2} m²\n` +
      `Saved: ${data.filename}`;
    setStatus("done", "ok");
    loadOutputs();
  } catch (e) {
    setStatus("error", "error");
    alert("Generation failed: " + e.message);
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
    const view = document.createElement("a");
    view.href = "#";
    view.textContent = "view";
    view.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const r = await fetch("/api/outputs/" + encodeURIComponent(o.filename));
      if (r.ok) renderResult(await r.json());
    });
    li.appendChild(a);
    li.appendChild(view);
    ul.appendChild(li);
  }
}

document.getElementById("refreshOutputs").addEventListener("click", loadOutputs);
loadOutputs();

// =========================================================================
// Tree grid — draw a rectangle, generate a grid of points inside, rotate
// around a chosen pivot. All maths is client-side, flat-earth anchored on
// the rectangle's SW corner (fine for farm-scale AOIs near the equator).
// =========================================================================

const gridLayer = L.layerGroup().addTo(map);

let gridOrigin = null;       // {lat, lon} — SW corner of the source rectangle
let gridSpanM = null;        // {w, h}     — source rectangle size in metres
let gridLocalPoints = [];    // [{row, col, x_m, y_m}] — unrotated local frame
let gridAnchor = { x_m: 0, y_m: 0 }; // where R1·T1 lives; pinned on flow change
let gridRotationDeg = 0;
let gridPivotMode = "center";
let gridPivotLocal = null;   // set when user clicks a point in "custom" mode
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
  color: "#16a34a", weight: 2, dashArray: "6,6", fillOpacity: 0.05,
};
const MASK_STYLE_NEGATIVE = {
  color: "#dc2626", weight: 2, dashArray: "6,6", fillOpacity: 0.05,
};

const EARTH_M_PER_DEG_LAT = 111320;
const mPerDegLon = (lat) => EARTH_M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

function latLonToMetres(lat, lon, lat0, lon0) {
  return { x: (lon - lon0) * mPerDegLon(lat0), y: (lat - lat0) * EARTH_M_PER_DEG_LAT };
}
function metresToLatLon(x, y, lat0, lon0) {
  return { lat: lat0 + y / EARTH_M_PER_DEG_LAT, lon: lon0 + x / mPerDegLon(lat0) };
}

function gridExtents() {
  if (!gridLocalPoints.length) return null;
  let minX = +Infinity, maxX = -Infinity, minY = +Infinity, maxY = -Infinity;
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
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  switch (gridPivotMode) {
    case "sw": return { x_m: minX, y_m: minY };
    case "nw": return { x_m: minX, y_m: maxY };
    case "ne": return { x_m: maxX, y_m: maxY };
    case "se": return { x_m: maxX, y_m: minY };
    case "custom": return gridPivotLocal ?? { x_m: cx, y_m: cy };
    default:   return { x_m: cx, y_m: cy };
  }
}

function rotateAround(p, pivot, deg) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  const dx = p.x_m - pivot.x_m, dy = p.y_m - pivot.y_m;
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
  const { lat, lon } = metresToLatLon(pv.x_m, pv.y_m, gridOrigin.lat, gridOrigin.lon);
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
  gridLayer.eachLayer((l) => { if (!preserve.has(l)) toRemove.push(l); });
  for (const l of toRemove) gridLayer.removeLayer(l);
  if (!gridOrigin || !gridLocalPoints.length) return;

  const pivot = pivotLocal();
  for (const p of gridLocalPoints) {
    const rot = rotateAround(p, pivot, gridRotationDeg);
    const { lat, lon } = metresToLatLon(rot.x_m, rot.y_m, gridOrigin.lat, gridOrigin.lon);
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
      maskTag + ` · drag the red pin to move the grid`;
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
    const hit = ((yi > lat) !== (yj > lat)) &&
                (lon < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-18) + xi);
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
      const { lat, lon } = metresToLatLon(r.x_m, r.y_m, gridOrigin.lat, gridOrigin.lon);
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
  const pt = latLonToMetres(e.latlng.lat, e.latlng.lng, gridOrigin.lat, gridOrigin.lon);
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
  const pivotLL = metresToLatLon(pvl.x_m, pvl.y_m, gridOrigin.lat, gridOrigin.lon);
  const { x, y } = latLonToMetres(latLng.lat, latLng.lng, pivotLL.lat, pivotLL.lon);
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
    nTrees = Number.isFinite(colsIn) && colsIn > 0 ? colsIn : Math.floor(gridSpanM.w / tree) + 1;
    nRows  = Number.isFinite(rowsIn) && rowsIn > 0 ? rowsIn : Math.floor(gridSpanM.h / row)  + 1;
  } else {
    nTrees = Number.isFinite(colsIn) && colsIn > 0 ? colsIn : Math.floor(gridSpanM.h / tree) + 1;
    nRows  = Number.isFinite(rowsIn) && rowsIn > 0 ? rowsIn : Math.floor(gridSpanM.w / row)  + 1;
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
          row: r + 1, col: c + 1,
          x_m: gridAnchor.x_m + c * tree * dirX,
          y_m: gridAnchor.y_m + r * row  * dirY,
        });
      }
    }
  } else {
    // NS major: row index varies in x, col index varies in y.
    for (let r = 0; r < nRows; r++) {
      for (let c = 0; c < nTrees; c++) {
        gridLocalPoints.push({
          row: r + 1, col: c + 1,
          x_m: gridAnchor.x_m + r * row  * dirX,
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
  const row  = parseFloat(document.getElementById("rowSpacing").value);
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

  gridRotationDeg = parseFloat(document.getElementById("gridRotation").value) || 0;
  gridPivotMode = document.getElementById("gridPivot").value;
  if (gridPivotMode !== "custom") gridPivotLocal = null;
  renderGrid();
});

// Live-update when counts, spacings, or major-edge change. These keep
// gridAnchor fixed so new rows/trees extend in the current flow direction.
for (const id of ["gridRows", "gridCols", "treeSpacing", "rowSpacing", "majorEdge"]) {
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
  const style = pendingMaskPolarity === "positive" ? MASK_STYLE_POSITIVE : MASK_STYLE_NEGATIVE;
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
  hint.innerHTML = `Prefix: <code>${px || "—"}</code>` +
    (px ? ` · Example: <code>${px}_ROW1_T1</code>` : "");
}
document.getElementById("blockName").addEventListener("input", refreshBlockPrefixHint);
refreshBlockPrefixHint();

function buildGridFeatureCollection() {
  const pivot = pivotLocal();
  const px = blockPrefix(document.getElementById("blockName").value);
  const features = gridLocalPoints.map((p) => {
    const rot = rotateAround(p, pivot, gridRotationDeg);
    const { lat, lon } = metresToLatLon(rot.x_m, rot.y_m, gridOrigin.lat, gridOrigin.lon);
    const name = px ? `${px}_ROW${p.row}_T${p.col}` : `ROW${p.row}_T${p.col}`;
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: { name },
    };
  });
  return { type: "FeatureCollection", features };
}

document.getElementById("copyGridGeoJson").addEventListener("click", async () => {
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
    triggerDownload(txt);
  }
});

function triggerDownload(txt) {
  const px = blockPrefix(document.getElementById("blockName").value);
  const fname = (px || "grid") + "_trees.geojson";
  const blob = new Blob([txt], { type: "application/geo+json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

document.getElementById("downloadGridGeoJson").addEventListener("click", () => {
  if (!gridOrigin || !gridLocalPoints.length) {
    alert("Generate a grid first.");
    return;
  }
  const fc = buildGridFeatureCollection();
  triggerDownload(JSON.stringify(fc, null, 2));
  document.getElementById("gridSummary").textContent =
    `Downloaded ${fc.features.length} points.`;
});
