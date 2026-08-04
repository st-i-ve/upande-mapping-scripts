import { describe, it, expect } from "vitest";
import { resolveShapeKey, isTypingTarget } from "./shapeKeys";

describe("resolveShapeKey", () => {
  it("maps Delete and Backspace to delete", () => {
    expect(resolveShapeKey({ key: "Delete" })).toBe("delete");
    expect(resolveShapeKey({ key: "Backspace" })).toBe("delete");
  });

  it("ignores keys that aren't ours", () => {
    expect(resolveShapeKey({ key: "d" })).toBeNull();
    expect(resolveShapeKey({ key: "Escape" })).toBeNull();
    expect(resolveShapeKey({ key: "Enter" })).toBeNull();
  });

  it("ignores modifier combos so ⌘⌫ / ctrl+backspace still reach the browser", () => {
    expect(resolveShapeKey({ key: "Backspace", metaKey: true })).toBeNull();
    expect(resolveShapeKey({ key: "Backspace", ctrlKey: true })).toBeNull();
    expect(resolveShapeKey({ key: "Delete", altKey: true })).toBeNull();
  });

  it("stays out of the way while the user is typing", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(resolveShapeKey({ key: "Backspace", target: { tagName } as never })).toBeNull();
    }
    expect(
      resolveShapeKey({ key: "Delete", target: { tagName: "DIV", isContentEditable: true } as never }),
    ).toBeNull();
  });

  it("fires for keypresses on non-typing elements", () => {
    expect(resolveShapeKey({ key: "Delete", target: { tagName: "BODY" } as never })).toBe("delete");
  });
});

describe("isTypingTarget", () => {
  it("handles a null or non-element target", () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(undefined)).toBe(false);
    expect(isTypingTarget({} as never)).toBe(false);
  });

  it("detects a child of a contenteditable host", () => {
    const target = { tagName: "SPAN", closest: (sel: string) => (sel.includes("contenteditable") ? {} : null) };
    expect(isTypingTarget(target as never)).toBe(true);
  });
});
