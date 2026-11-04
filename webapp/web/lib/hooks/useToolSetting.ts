"use client";

import { useCallback } from "react";
import { useAppStore } from "@/lib/store/appStore";
import { useHydrated } from "./useHydrated";

/**
 * Like useState, but remembered in the browser: a tool's settings (triad size,
 * tree spacing, …) come back as you left them after a reload. `key` must be
 * unique per setting, e.g. "triad.sideLength".
 */
export function useToolSetting<T>(key: string, initial: T): [T, (v: T) => void] {
  const hydrated = useHydrated();
  const stored = useAppStore((s) => s.toolSettings?.[key]) as T | undefined;
  const set = useAppStore((s) => s.setToolSetting);
  const update = useCallback((v: T) => set(key, v), [set, key]);
  // Before hydration the server render and first client render must agree.
  return [hydrated && stored !== undefined ? stored : initial, update];
}
