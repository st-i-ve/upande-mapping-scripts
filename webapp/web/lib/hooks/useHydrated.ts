"use client";

import { useEffect, useState } from "react";

/**
 * True only after client mount. Use to gate rendering of persisted-store data
 * so server HTML (empty store) matches the first client render, avoiding
 * hydration mismatches from localStorage-backed state.
 */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
