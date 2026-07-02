import Link from "next/link";
import { Box } from "lucide-react";

export const metadata = { title: "Upande · 3D (coming soon)" };

/** Placeholder. The MapLibre + three.js 3D view is ported in milestone M8. */
export default function ThreeDPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <Box className="text-primary" size={28} />
      <h1 className="text-base font-semibold text-foreground">3D view</h1>
      <p className="text-sm">Ported in a later milestone (M8).</p>
      <Link href="/" className="text-primary hover:underline">
        ← Back to the mapper
      </Link>
    </main>
  );
}
