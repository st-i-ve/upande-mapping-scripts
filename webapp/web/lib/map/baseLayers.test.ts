import { describe, it, expect } from "vitest";
import { pickWaybackRelease } from "./baseLayers";

const tileUrl = (id: string) =>
  `https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/${id}/{level}/{row}/{col}`;

/** Shaped like Esri's real waybackconfig.json: keys are release ids, not dates. */
const CONFIG = {
  "64776": { itemURL: tileUrl("64776"), itemTitle: "World Imagery (Wayback 2023-08-31)" },
  "26334": { itemURL: tileUrl("26334"), itemTitle: "World Imagery (Wayback 2026-08-05)" },
  "32246": { itemURL: tileUrl("32246"), itemTitle: "World Imagery (Wayback 2026-06-30)" },
};

describe("pickWaybackRelease", () => {
  it("picks the newest release by date, not by the numeric config key", () => {
    // 64776 is the highest key but a 2023 release — sorting by key served
    // three-year-old imagery from the layer that is meant to be the freshest.
    const r = pickWaybackRelease(CONFIG)!;
    expect(r.url).toContain("/tile/26334/");
    expect(r.label).toBe("Esri Wayback (2026-08-05)");
  });

  it("rewrites the WMTS placeholders to Leaflet's", () => {
    const r = pickWaybackRelease(CONFIG)!;
    expect(r.url.endsWith("/{z}/{y}/{x}")).toBe(true);
    expect(r.url).not.toMatch(/\{level\}|\{row\}|\{col\}/);
  });

  it("skips entries with no url or no date, rather than labelling them undefined", () => {
    const r = pickWaybackRelease({
      a: { itemTitle: "World Imagery (Wayback 2027-01-01)" }, // newest, but no url
      b: { itemURL: tileUrl("b") }, // url, but no title to date it
      c: { itemURL: tileUrl("c"), itemTitle: "World Imagery (Wayback 2025-02-02)" },
    })!;
    expect(r.url).toContain("/tile/c/");
    expect(r.label).toBe("Esri Wayback (2025-02-02)");
  });

  it("returns null when there is nothing usable", () => {
    expect(pickWaybackRelease({})).toBeNull();
    expect(pickWaybackRelease({ a: {}, b: { itemTitle: "no date here" } })).toBeNull();
    expect(pickWaybackRelease(undefined as never)).toBeNull();
  });
});
