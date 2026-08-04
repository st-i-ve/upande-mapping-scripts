import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useShapeKeyboard } from "./useShapeKeyboard";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import type { GeoGeometry } from "@/lib/types";

const geom: GeoGeometry = { type: "Point", coordinates: [35.748, 0.0686] };

function seed(selected: string[]) {
  useMapBridge.setState({ handle: null });
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

  it("gives the knife first claim on Backspace while points are being placed", () => {
    seed(["Cut 1"]);
    let popped = 0;
    useMapBridge.setState({
      handle: { knifePopPoint: () => { popped++; return true; } } as never,
    });
    renderHook(() => useShapeKeyboard());
    const e = press("Backspace");
    expect(popped).toBe(1);
    expect(names()).toEqual(["Cut 1", "Cut 2"]); // shape survived
    expect(e.defaultPrevented).toBe(true);
  });

  it("deletes shapes when the knife isn't placing points", () => {
    seed(["Cut 1"]);
    useMapBridge.setState({ handle: { knifePopPoint: () => false } as never });
    renderHook(() => useShapeKeyboard());
    press("Backspace");
    expect(names()).toEqual(["Cut 2"]);
  });

  it("Escape puts an armed knife away", () => {
    seed(["Cut 1"]);
    let stopped = 0;
    useMapBridge.setState({
      handle: { knifeArmed: () => true, knifeStop: () => { stopped++; } } as never,
    });
    renderHook(() => useShapeKeyboard());
    const e = press("Escape");
    expect(stopped).toBe(1);
    expect(e.defaultPrevented).toBe(true);
    expect(names()).toEqual(["Cut 1", "Cut 2"]); // and leaves shapes alone
  });

  it("Escape does nothing when no knife is armed", () => {
    seed(["Cut 1"]);
    let stopped = 0;
    useMapBridge.setState({
      handle: { knifeArmed: () => false, knifeStop: () => { stopped++; } } as never,
    });
    renderHook(() => useShapeKeyboard());
    const e = press("Escape");
    expect(stopped).toBe(0);
    expect(e.defaultPrevented).toBe(false); // a pick or edit session keeps the key
    expect(names()).toEqual(["Cut 1", "Cut 2"]);
  });

  it("unbinds on unmount", () => {
    seed(["Cut 1"]);
    const { unmount } = renderHook(() => useShapeKeyboard());
    unmount();
    press("Delete");
    expect(names()).toEqual(["Cut 1", "Cut 2"]);
  });
});
