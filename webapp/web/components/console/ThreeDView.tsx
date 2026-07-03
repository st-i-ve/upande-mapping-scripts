"use client";

/**
 * 3D view for the main canvas area — reuses the proven MapLibre + three.js
 * page (public/legacy-3d.html) verbatim in an iframe. The relative src is
 * base-path-agnostic (works under /next and after cutover).
 */
export function ThreeDView() {
  return (
    <iframe
      src="legacy-3d.html"
      title="Upande 3D view"
      className="h-full w-full border-0"
    />
  );
}
