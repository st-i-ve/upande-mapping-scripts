const CACHE_NAME = "tiles-v1";
const DEFAULT_SITES = [
  "https://mapping.132.145.18.63.nip.io",
  "http://localhost",
  "http://127.0.0.1",
];
const $ = (id) => document.getElementById(id);
let objectUrls = [];

async function render() {
  const { stats, sites, allSites } = await chrome.storage.local.get(["stats", "sites", "allSites"]);
  $("sites").value = (sites || DEFAULT_SITES).join("\n");
  $("allSites").checked = allSites !== false;
  $("sites").disabled = $("allSites").checked;

  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  $("stored").textContent = keys.length;

  const perZoom = {};
  for (const req of keys) {
    const t = parseTile(req.url);
    if (t) perZoom[t.z] = (perZoom[t.z] || 0) + 1;
  }
  const zs = Object.keys(perZoom).map(Number).sort((a, b) => a - b);
  $("zooms").textContent = zs.length ? "Stored by zoom: " + zs.map((z) => `z${z}: ${perZoom[z]}`).join(" · ") : "";
  $("seen").textContent = stats?.seen ?? 0;
  $("hits").textContent = stats?.browserCacheHits ?? 0;

  const hosts = Object.entries(stats?.hosts || {}).sort((a, b) => b[1].seen - a[1].seen);
  if (hosts.length) {
    $("hosts").innerHTML = "";
    for (const [host, h] of hosts) {
      const tr = document.createElement("tr");
      for (const [v, cls] of [[host, ""], [h.seen, "n"], [h.browserCacheHits, "n"], [h.stored, "n"]]) {
        const td = document.createElement("td");
        td.textContent = v;
        td.className = cls;
        tr.append(td);
      }
      $("hosts").append(tr);
    }
  }

  objectUrls.forEach(URL.revokeObjectURL);
  objectUrls = [];
  $("recent").innerHTML = "";
  for (const r of (stats?.recent || []).slice(0, 60)) {
    const img = document.createElement("img");
    img.title = `${r.url}\nstatus ${r.status} · browser cache: ${r.fromCache} · ${r.outcome}`;
    const hit = await cache.match(r.url);
    if (hit) {
      const url = URL.createObjectURL(await hit.blob());
      objectUrls.push(url);
      img.src = url;
    } else {
      img.className = "miss";
    }
    $("recent").append(img);
  }
}

$("save").onclick = async () => {
  const sites = $("sites").value.split("\n").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
  await chrome.storage.local.set({ sites });
  render();
};
$("allSites").onchange = async () => {
  await chrome.storage.local.set({ allSites: $("allSites").checked });
  render();
};
// Every stored tile as <A|B|C…>/<z>/<x>/<y>.<ext>, one letter per layer, plus
// layers.json mapping each letter back to its URL pattern.
$("download").onclick = async () => {
  const btn = $("download");
  btn.disabled = true;
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const tiles = keys.map((req) => ({ req, t: parseTile(req.url) })).filter((e) => e.t);
    // Letters go to layers in a stable order, so the same cache exports the same way.
    const names = [...new Set(tiles.map((e) => layerName(e.t.template)))].sort();
    const letterOf = Object.fromEntries(names.map((n, i) => [n, layerLetters(i)]));

    const files = [];
    const layers = {};
    const seen = new Set();
    let skipped = 0;
    for (const { req, t } of tiles) {
      const res = await cache.match(req);
      if (!res) continue;
      const data = new Uint8Array(await res.arrayBuffer());
      const ext = sniffImage(data);
      if (!ext) { skipped++; continue; }
      const letter = letterOf[layerName(t.template)];
      const name = `${letter}/${t.z}/${t.x}/${t.y}.${ext}`;
      if (seen.has(name)) continue;
      seen.add(name);
      btn.textContent = `Packing ${files.length + 1} / ${tiles.length}…`;
      files.push({ name, data });
      const l = (layers[letter] ||= { template: t.template, zooms: {} });
      l.zooms[t.z] = (l.zooms[t.z] || 0) + 1;
    }
    if (!files.length) return alert("No image tiles stored yet — load a map first.");
    if (files.length > 65000) return alert(`${files.length} tiles is more than one zip can hold here (65,000). Clear some and try again.`);
    files.push({ name: "layers.json", data: new TextEncoder().encode(JSON.stringify(layers, null, 2)) });

    const url = URL.createObjectURL(makeZip(files));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tiles-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    if (skipped) alert(`Left out ${skipped} stored tile(s) that aren't images (e.g. vector tiles).`);
  } finally {
    btn.disabled = false;
    btn.textContent = "Download tiles (.zip)";
  }
};
$("refresh").onclick = render;
$("clear").onclick = async () => {
  await chrome.runtime.sendMessage({ type: "clear" });
  $("hosts").innerHTML = '<tr><td colspan="4" class="muted">Cleared.</td></tr>';
  render();
};

// Tiles arrive in bursts while panning; redraw at most every 500ms.
let pending;
chrome.storage.onChanged.addListener((changes) => {
  if (changes.stats && !pending) pending = setTimeout(() => { pending = null; render(); }, 500);
});
render();
