"use client";

import { useEffect, useRef } from "react";
import { useThreeD } from "@/lib/map/threeDBridge";

/**
 * 3D view for the main canvas area — reuses the proven MapLibre + three.js
 * page (public/legacy-3d.html) verbatim in an iframe. When embedded, that page
 * hides its own on-canvas panel and takes control from our sidebar via the
 * threeDBridge (postMessage). Registers its window so the sidebar can drive it.
 */
export function ThreeDView() {
  const src = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/legacy-3d.html`;
  const ref = useRef<HTMLIFrameElement>(null);
  const setWin = useThreeD((s) => s.setWin);
  const setReady = useThreeD((s) => s.setReady);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.__mapper3d === "ready") setReady(true);
    };
    window.addEventListener("message", onMsg);
    return () => {
      window.removeEventListener("message", onMsg);
      setWin(null);
      setReady(false);
    };
  }, [setWin, setReady]);

  return (
    <iframe
      ref={ref}
      src={src}
      title="Upande 3D view"
      className="h-full w-full border-0"
      onLoad={() => setWin(ref.current?.contentWindow ?? null)}
    />
  );
}
