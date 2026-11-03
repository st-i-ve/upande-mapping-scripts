import { describe, it, expect } from "vitest";
import { crc32, safeName, shapesCollection, zipFiles } from "./exportGeo";

describe("exportGeo", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("writes a zip with unique entry names", async () => {
    const blob = zipFiles([{ name: "A.geojson", data: "{}" }, { name: "A.geojson", data: "[]" }]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    expect(bytes[0]).toBe(0x50); // "PK"
    expect(text).toContain("A.geojson");
    expect(text).toContain("A (2).geojson");
  });

  it("keeps names readable but filesystem-safe", () => {
    expect(safeName('Block A/B: "north"')).toBe("Block A-B- -north-");
  });

  it("exports shapes as named features with their folder", () => {
    const fc = shapesCollection([{ name: "P1", folder: "Pivots", visible: true, geometry: { type: "Point", coordinates: [0, 0] } }]);
    expect(fc.features[0].properties).toEqual({ name: "P1", folder: "Pivots" });
  });
});
