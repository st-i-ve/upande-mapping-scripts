import { describe, expect, it } from "vitest";
import { resolveToolKey, TOOL_INFO, type ToolId } from "./tools";

const key = (k: string, extra: Record<string, unknown> = {}) => resolveToolKey({ key: k, ...extra });

describe("resolveToolKey", () => {
  it("K is the straight knife, Shift+K the freehand knife", () => {
    expect(key("k")).toBe("knife-straight");
    expect(key("K", { shiftKey: true })).toBe("knife-draw");
  });

  it("maps the other tools", () => {
    expect(key("v")).toBe("select");
    expect(key("d")).toBe("polygon");
    expect(key("u")).toBe("union");
    expect(key("-")).toBe("subtract");
    expect(key("_", { shiftKey: true })).toBe("subtract");
    expect(key("Delete", { shiftKey: true })).toBe("clear");
  });

  it("leaves plain Delete and modifier combos alone", () => {
    expect(key("Delete")).toBeNull();
    expect(key("k", { ctrlKey: true })).toBeNull(); // Ctrl+K is the command menu
    expect(key("z", { metaKey: true })).toBeNull();
    expect(key("D", { shiftKey: true })).toBeNull();
  });

  it("stays quiet while typing", () => {
    expect(key("k", { target: { tagName: "INPUT", type: "text" } as unknown as EventTarget })).toBeNull();
    expect(key("k", { target: { tagName: "INPUT", type: "checkbox" } as unknown as EventTarget })).toBe("knife-straight");
  });

  it("every shortcut key shown in a tooltip is unique", () => {
    const keys = (Object.keys(TOOL_INFO) as ToolId[]).map((id) => TOOL_INFO[id].key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
