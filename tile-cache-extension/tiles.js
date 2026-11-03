// Reads z/x/y out of a tile URL. Same rules as webapp/web/lib/map/tileTemplate.ts:
//   query:  …/tile?z=19&x=315547&y=262087&…   (also zoom= / level=, tilex= …)
//   path:   …/19/315547/262087.png             (…/{z}/{y}/{x} for ArcGIS)
// Shared by background.js (importScripts) and popup.js (<script>).

const Q_Z = ["z", "zoom", "level", "lvl"];
const Q_X = ["x", "tilex", "col"];
const Q_Y = ["y", "tiley", "row"];

// Is (x, y) a real tile at zoom z? Catches path numbers that only look like z/x/y.
const fits = (z, x, y) => z >= 0 && z <= 23 && x >= 0 && y >= 0 && x < 2 ** z && y < 2 ** z;

/** {z, x, y, template} for a tile URL, or null if it isn't one. */
function parseTile(url) {
  // Google's …/vt/lyrs=s&x=…&y=…&z=… has its parameters in the last path segment, no "?".
  let qAt = url.indexOf("?");
  let sep = "?";
  if (qAt < 0 && /\/[^/]*=[^/]*$/.test(url)) [qAt, sep] = [url.lastIndexOf("/"), "/"];
  const base = qAt < 0 ? url : url.slice(0, qAt);
  const query = qAt < 0 ? "" : url.slice(qAt + 1);

  if (query) {
    const parts = query.split("&");
    const find = (names) =>
      parts.findIndex((p) => names.includes(p.split("=")[0].toLowerCase()) && /^\d+$/.test(p.split("=")[1] ?? ""));
    const [iz, ix, iy] = [find(Q_Z), find(Q_X), find(Q_Y)];
    if (iz >= 0 && ix >= 0 && iy >= 0) {
      const val = (i) => +parts[i].split("=")[1];
      const [z, x, y] = [val(iz), val(ix), val(iy)];
      if (fits(z, x, y)) {
        const rest = parts.filter((_, i) => ![iz, ix, iy].includes(i));
        return { z, x, y, template: base + (rest.length ? sep + rest.join("&") : "") };
      }
    }
  }

  const m = base.match(/^(.*\/)(\d+)\/(\d+)\/(\d+)(\.[A-Za-z]+)?$/);
  if (m) {
    const [, head, a, b, c] = m;
    const yFirst = /\/MapServer\/tile\/$/i.test(head);
    const [z, x, y] = yFirst ? [+a, +c, +b] : [+a, +b, +c];
    if (fits(z, x, y)) return { z, x, y, template: head + (query ? `?${query}` : "") };
  }
  return null;
}

// Query params that change per session/key, not per layer.
const NOISE_PARAMS = /^(key|access_token|token|apikey|api_key|v|ver|version|s|hl|gl)$/i;

/** Folder-safe layer name from a tile's template, e.g. "mt.google.com_vt_lyrs=s". */
function layerName(template) {
  const u = new URL(template);
  const host = u.hostname.replace(/^([a-z]+)\d+\./i, "$1.").replace(/^[a-d]\./i, "");
  // Google-style templates keep their params in the last path segment.
  const pathParams = u.pathname.split("/").pop().split("&").filter((p) => p.includes("=")).map((p) => p.split("="));
  const params = [...u.searchParams, ...pathParams]
    .filter(([k]) => !NOISE_PARAMS.test(k))
    .map(([k, v]) => `${k}=${v}`);
  const path = u.pathname.replace(/\/[^/]*=[^/]*$/, "");
  return [host, path, ...params].join("_")
    .replace(/[^A-Za-z0-9.=-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}

/** The image format a tile's bytes really are ("png" | "jpg" | "webp" | "gif"), or null if not an image. */
function sniffImage(bytes) {
  const b = (i) => bytes[i];
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "png";
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "jpg";
  if (b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x38) return "gif";
  if (String.fromCharCode(b(0), b(1), b(2), b(3)) === "RIFF" && String.fromCharCode(b(8), b(9), b(10), b(11)) === "WEBP") return "webp";
  return null;
}

/** Folder names for layers in an export: A … Z, then AA, AB, … */
function layerLetters(i) {
  let s = "";
  for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}
