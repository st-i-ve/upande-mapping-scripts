import { describe, it, expect } from "vitest";
import { checkNames, namesAreClean } from "./shapeNames";

describe("checkNames", () => {
  it("passes distinct, unused names", () => {
    expect(checkNames(["A", "B"], ["C"])).toEqual([null, null]);
  });

  it("flags a name already in use", () => {
    expect(checkNames(["A", "B"], ["B"])).toEqual([null, "taken"]);
  });

  it("flags both sides of a duplicate within the batch", () => {
    expect(checkNames(["A", "A", "B"])).toEqual(["duplicate", "duplicate", null]);
  });

  it("treats names that differ only by case or padding as the same", () => {
    expect(checkNames(["Block A", "  block a  "])).toEqual(["duplicate", "duplicate"]);
    expect(checkNames(["BLOCK A"], ["Block A"])).toEqual(["taken"]);
  });

  it("flags an empty or whitespace-only name", () => {
    expect(checkNames(["", "   ", "A"])).toEqual(["empty", "empty", null]);
  });

  it("lets a batch reuse the names it is replacing", () => {
    // Re-slicing Field: the old "Field 1"/"Field 2" go away as these arrive.
    const existing = ["Field", "Field 1", "Field 2"];
    expect(checkNames(["Field 1", "Field 2", "Field 3"], existing, ["Field 1", "Field 2"]))
      .toEqual([null, null, null]);
    // But the source itself is not freed, so taking its name still collides.
    expect(checkNames(["Field"], existing, ["Field 1"])).toEqual(["taken"]);
  });

  it("reports duplicate ahead of taken, so the batch is fixed first", () => {
    expect(checkNames(["A", "A"], ["A"])).toEqual(["duplicate", "duplicate"]);
  });
});

describe("namesAreClean", () => {
  it("is true only when nothing is flagged", () => {
    expect(namesAreClean(["A", "B"], ["C"])).toBe(true);
    expect(namesAreClean(["A", "A"])).toBe(false);
    expect(namesAreClean([""], [])).toBe(false);
    expect(namesAreClean(["A"], ["A"])).toBe(false);
  });
});
