import Link from "next/link";
import { ArrowLeft, Box } from "lucide-react";

export const metadata = { title: "Upande · 3D view" };

/**
 * M8 — 3D view. Reuses the proven MapLibre + three.js page verbatim as a
 * static asset (public/legacy-3d.html) inside a full-viewport iframe. The
 * relative src is base-path-agnostic (works under /next and after cutover).
 */
export default function ThreeDPage() {
  return (
    <>
      <header className="flex items-center gap-3 border-b border-border bg-background/80 px-4 py-2 backdrop-blur">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Mapper
        </Link>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-widest text-primary">
          <Box size={13} /> 3D VIEW
        </span>
      </header>
      <iframe
        src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/legacy-3d.html`}
        title="Upande 3D view"
        className="w-full flex-1 border-0"
      />
    </>
  );
}
