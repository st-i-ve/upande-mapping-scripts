import { describe, it, expect } from "vitest";
import { isJsonType } from "./client";

describe("isJsonType", () => {
  it("reads every JSON flavour as JSON — outputs are application/geo+json", () => {
    expect(isJsonType("application/json")).toBe(true);
    expect(isJsonType("application/json; charset=utf-8")).toBe(true);
    expect(isJsonType("application/geo+json")).toBe(true);
    expect(isJsonType("application/vnd.api+json")).toBe(true);
  });
  it("leaves text as text", () => {
    expect(isJsonType("text/plain")).toBe(false);
    expect(isJsonType("application/jsonx")).toBe(false);
    expect(isJsonType("")).toBe(false);
  });
});
