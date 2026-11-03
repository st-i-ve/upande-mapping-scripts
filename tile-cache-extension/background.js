// Watches tile requests made by any page (or just the listed sites), keeps a copy of each tile in
// the extension's own Cache Storage, and tallies what happened in chrome.storage.

const CACHE_NAME = "tiles-v1";
const DEFAULT_SITES = [
  "https://mapping.132.145.18.63.nip.io",
  "http://localhost",
  "http://127.0.0.1",
];
const RECENT_MAX = 200;

importScripts("tiles.js");

// allSites defaults to on; when off, only pages on the sites list are watched.
async function shouldWatch(details) {
  const { sites, allSites } = await chrome.storage.local.get(["sites", "allSites"]);
  if (allSites !== false) return true;
  const origin = details.initiator || details.documentUrl || "";
  return (sites || DEFAULT_SITES).some((s) => origin.startsWith(s));
}

// Stats writes are serialised so concurrent tile loads don't clobber each other.
let writeChain = Promise.resolve();
function updateStats(fn) {
  writeChain = writeChain.then(async () => {
    const { stats } = await chrome.storage.local.get("stats");
    const next = stats || { seen: 0, browserCacheHits: 0, stored: 0, alreadyStored: 0, failed: 0, notImage: 0, hosts: {}, recent: [] };
    fn(next);
    await chrome.storage.local.set({ stats: next });
  }).catch((e) => console.error("stats update failed", e));
  return writeChain;
}

async function storeTile(url) {
  const cache = await caches.open(CACHE_NAME);
  if (await cache.match(url)) return "alreadyStored";
  try {
    // force-cache: reuse the browser's HTTP cache copy if this context can see it.
    const res = await fetch(url, { cache: "force-cache", credentials: "omit" });
    if (!res.ok) return "failed";
    // Vector tiles, error pages etc. share the z/x/y URLs; keep only real images.
    const body = await res.clone().arrayBuffer();
    if (!sniffImage(new Uint8Array(body, 0, Math.min(12, body.byteLength)))) return "notImage";
    await cache.put(url, res);
    return "stored";
  } catch (e) {
    console.warn("tile fetch failed", url, e);
    return "failed";
  }
}

chrome.webRequest.onCompleted.addListener(
  async (details) => {
    if (details.tabId < 0 || details.method !== "GET") return;
    if (!parseTile(details.url)) return;
    if (!(await shouldWatch(details))) return;

    const outcome = details.statusCode === 200 ? await storeTile(details.url) : "failed";
    const host = new URL(details.url).host;

    await updateStats((s) => {
      s.seen++;
      if (details.fromCache) s.browserCacheHits++;
      s[outcome] = (s[outcome] || 0) + 1;
      const h = (s.hosts[host] ||= { seen: 0, browserCacheHits: 0, stored: 0 });
      h.seen++;
      if (details.fromCache) h.browserCacheHits++;
      if (outcome === "stored") h.stored++;
      s.recent.unshift({
        url: details.url,
        host,
        status: details.statusCode,
        fromCache: details.fromCache,
        outcome,
        at: Date.now(),
      });
      s.recent.length = Math.min(s.recent.length, RECENT_MAX);
    });
  },
  { urls: ["<all_urls>"], types: ["image", "xmlhttprequest", "other"] }
);

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === "clear") {
    Promise.all([caches.delete(CACHE_NAME), chrome.storage.local.remove("stats")])
      .then(() => reply({ ok: true }));
    return true;
  }
  if (msg.type === "cacheInfo") {
    caches.open(CACHE_NAME)
      .then((c) => c.keys())
      .then((keys) => reply({ count: keys.length }));
    return true;
  }
});
