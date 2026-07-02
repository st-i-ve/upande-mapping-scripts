"use client";

import dynamic from "next/dynamic";

/**
 * Client-only wrapper. Leaflet needs `window`, so the real map module is
 * dynamically imported with SSR disabled. This component is what pages mount.
 */
const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <span className="tabular text-xs text-muted-foreground">
        <span className="text-primary">◍</span> initializing map…
      </span>
    </div>
  ),
});

export function MapCanvas() {
  return <LeafletMap />;
}
