import { describe, it, expect } from "vitest";
import { isBlock, shapeLetter, shapeTag } from "./shapeLabels";

describe("shapeLetter", () => {
  it("counts A through Z", () => {
    expect(shapeLetter(0)).toBe("A");
    expect(shapeLetter(1)).toBe("B");
    expect(shapeLetter(25)).toBe("Z");
  });

  it("rolls over to two letters", () => {
    expect(shapeLetter(26)).toBe("AA");
    expect(shapeLetter(27)).toBe("AB");
    expect(shapeLetter(51)).toBe("AZ");
    expect(shapeLetter(52)).toBe("BA");
    expect(shapeLetter(701)).toBe("ZZ");
    expect(shapeLetter(702)).toBe("AAA");
  });

  it("gives every index up to 300 a distinct label", () => {
    const seen = new Set(Array.from({ length: 300 }, (_, i) => shapeLetter(i)));
    expect(seen.size).toBe(300);
  });

  it("returns empty for nonsense", () => {
    expect(shapeLetter(-1)).toBe("");
    expect(shapeLetter(NaN)).toBe("");
  });
});

describe("shapeTag", () => {
  it("names blocks, letters everything else", () => {
    expect(shapeTag({ name: "D9B", folder: "Blocks" }, 4)).toBe("D9B");
    expect(shapeTag({ name: "A1", folder: "Blocks/North" }, 0)).toBe("A1");
    expect(shapeTag({ name: "Field", folder: "Polygons/Field" }, 1)).toBe("B");
    expect(shapeTag({ name: "Field" }, 2)).toBe("C");
    expect(isBlock("Blockset")).toBe(false);
  });
});
