/* global L */

const map = L.map("map", { zoomControl: true }).setView([0.0686, 35.7480], 16);

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
