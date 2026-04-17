/* global L */

const map = L.map("map", { zoomControl: true }).setView([0.0686, 35.7480], 16);

const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 22,
  attribution: "&copy; OpenStreetMap",
}).addTo(map);

const satellite = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 22, attribution: "Esri World Imagery" },
);
L.control.layers({ OSM: osm, Satellite: satellite }, null,
  { position: "topleft", collapsed: true }).addTo(map);

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
