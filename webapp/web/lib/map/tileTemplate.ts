/**
 * Turn a link to one map tile into the {z}/{x}/{y} pattern for the whole
 * service, so a tile copied from the browser can be pasted straight into the
 * downloader. Recognises the two common shapes:
 *
 *   query:  …/tile?z=19&x=315547&y=262087&…   (also zoom= / level=, tilex= …)
 *   path:   …/19/315547/262087.png             (also …/{z}/{y}/{x} for ArcGIS)
 *
 * Pure + testable. Returns null when the URL already is a pattern or neither
 * shape is found.
 */

const Q_Z = ["z", "zoom", "level", "lvl"];
const Q_X = ["x", "tilex", "col"];
const Q_Y = ["y", "tiley", "row"];

/** Is (x, y) a real tile at zoom z? Catches path numbers that only look like z/x/y. */
const fits = (z: number, x: number, y: number) =>
  z >= 0 && z <= 23 && x >= 0 && y >= 0 && x < 2 ** z && y < 2 ** z;

export function tileTemplate(url: string): string | null {
  if (/\{[zxy]\}/.test(url)) return null;
  const qAt = url.indexOf("?");
  const base = qAt < 0 ? url : url.slice(0, qAt);
  const query = qAt < 0 ? "" : url.slice(qAt + 1);

  // Query parameters — edit the raw string so the rest (keys, %-escapes) is untouched.
  if (query) {
    const parts = query.split("&");
    const find = (names: string[]) =>
      parts.findIndex((p) => names.includes(p.split("=")[0].toLowerCase()) && /^\d+$/.test(p.split("=")[1] ?? ""));
    const [iz, ix, iy] = [find(Q_Z), find(Q_X), find(Q_Y)];
    if (iz >= 0 && ix >= 0 && iy >= 0) {
      const val = (i: number) => +parts[i].split("=")[1];
      if (fits(val(iz), val(ix), val(iy))) {
        const set = (i: number, ph: string) => (parts[i] = `${parts[i].split("=")[0]}=${ph}`);
        set(iz, "{z}");
        set(ix, "{x}");
        set(iy, "{y}");
        return `${base}?${parts.join("&")}`;
      }
    }
  }

  // Path: the last three numeric segments, z first, then x/y or y/x.
  const m = base.match(/^(.*\/)(\d+)\/(\d+)\/(\d+)(\.[A-Za-z]+)?$/);
  if (m) {
    const [, head, a, b, c, ext = ""] = m;
    const z = +a;
    const tail = query ? `?${query}` : "";
    // ArcGIS-style services put the row first ({z}/{y}/{x}).
    const yFirst = /\/MapServer\/tile\/$/i.test(head);
    const [x, y] = yFirst ? [+c, +b] : [+b, +c];
    if (fits(z, x, y)) {
      return `${head}{z}/${yFirst ? "{y}/{x}" : "{x}/{y}"}${ext}${tail}`;
    }
  }
  return null;
}
