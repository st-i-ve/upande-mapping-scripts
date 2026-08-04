import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useShapeKeyboard } from "./useShapeKeyboard";
import { useAppStore } from "@/lib/store/appStore";
import type { GeoGeometry } from "@/lib/types";

const geom: GeoGeometry = { type: "Point", coordinates: [35.748, 0.0686] };

function seed(selected: string[]) {
  useAppStore.setState({ savedShapes: [], selectedShapes: [] });
  const { addSavedShape } = useAppStore.getState();
  addSavedShape("Cut 1", geom);
  addSavedShape("Cut 2", geom);
  useAppStore.setState({ selectedShapes: selected });
}

/** Dispatch a real keydown, optionally from an element (so the typing guard applies). */
function press(key: string, from?: HTMLElement) {
  const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  (from ?? window).dispatchEvent(e);
  return e;
}

const names = () => useAppStore.getState().savedShapes.map((s) => s.name);

describe("useShapeKeyboard", () => {
  beforeEach(() => seed([]));

  it("deletes the selected shapes on Delete", () => {
    seed(["Cut 1"]);
    renderHook(() => useShapeKeyboard());
    const e = press("Delete");
    expect(names()).toEqual(["Cut 2"]);
    expect(useAppStore.getState().selectedShapes).toEqual([]);
    expect(e.defaultPrevented).toBe(true);
  });

  it("deletes on Backspace too", () => {
    seed(["Cut 1", "Cut 2"]);
    renderHook(() => useShapeKeyboard());
    press("Backspace");
    expect(names()).toEqual([]);
  });

  it("does nothing when no shape is selected", () => {
    seed([]);
    renderHook(() => useShapeKeyboard());
    const e = press("Delete");
    expect(names()).toEqual(["Cut 1", "Cut 2"]);
    expect(e.defaultPrevented).toBe(false);
  });

  it("leaves Backspace alone while typing in an input", () => {
    seed(["Cut 1"]);
    renderHook(() => useShapeKeyboard());
    const input = document.createElement("input");
    document.body.appendChild(input);
    press("Backspace", input);
    expect(names()).toEqual(["Cut 1", "Cut 2"]);
    input.remove();
  });

  it("unbinds on unmount", () => {
    seed(["Cut 1"]);
    const { unmount } = renderHook(() => useShapeKeyboard());
    unmount();
    press("Delete");
    expect(names()).toEqual(["Cut 1", "Cut 2"]);
  });
});
