/**
 * Exporting shapes and outputs as GeoJSON files: one shape, a selection as one
 * FeatureCollection, or a selection as one file per shape (zipped — browsers
 * block a burst of separate downloads).
 */
import type { FeatureCollection, GeoFeature, SavedShape } from "@/lib/types";

/** A filesystem-safe file name, keeping it readable. */
export function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 120) || "export";
}

export function shapeFeature(s: SavedShape): GeoFeature {
  return {
    type: "Feature",
    geometry: s.geometry,
    properties: { name: s.name, ...(s.folder ? { folder: s.folder } : {}), ...(s.color ? { color: s.color } : {}) },
  };
}

export function shapesCollection(shapes: SavedShape[]): FeatureCollection {
  return { type: "FeatureCollection", features: shapes.map(shapeFeature) };
}

function save(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function downloadGeoJson(data: unknown, name: string) {
  save(new Blob([JSON.stringify(data)], { type: "application/geo+json" }), `${safeName(name)}.geojson`);
}

/* ---- a minimal zip writer (stored, no compression) ---- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Build a .zip of the given files. Names are made unique ("A.geojson", "A (2).geojson"). */
export function zipFiles(files: { name: string; data: string }[]): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const used = new Set<string>();

  for (const f of files) {
    let name = f.name;
    const dot = name.lastIndexOf(".");
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${f.name.slice(0, dot)} (${n})${f.name.slice(dot)}`;
    used.add(name.toLowerCase());
    const nameBytes = enc.encode(name);
    const data = enc.encode(f.data);
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, data);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, data.length, true);
    cen.setUint32(24, data.length, true);
    cen.setUint16(28, nameBytes.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), nameBytes);

    offset += 30 + nameBytes.length + data.length;
  }

  const cenSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: "application/zip" });
}

/** The shapes as one GeoJSON file. */
export function exportShapesTogether(shapes: SavedShape[], name: string) {
  downloadGeoJson(shapesCollection(shapes), name);
}

/** One GeoJSON file per shape, zipped; a single shape just downloads as its own file. */
export function exportShapesEach(shapes: SavedShape[], name: string) {
  if (shapes.length === 1) return downloadGeoJson(shapesCollection(shapes), shapes[0].name);
  const files = shapes.map((s) => ({
    name: `${s.folder ? `${s.folder}/` : ""}${safeName(s.name)}.geojson`,
    data: JSON.stringify(shapesCollection([s])),
  }));
  save(zipFiles(files), `${safeName(name)}.zip`);
}
