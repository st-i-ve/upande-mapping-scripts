import Link from "next/link";

export const metadata = { title: "Upande 3D — coming soon" };

/** Placeholder. The MapLibre + three.js 3D view is ported in milestone M8. */
export default function ThreeDPage() {
  return (
    <main
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        color: "var(--text-muted)",
      }}
    >
      <h1 style={{ fontSize: 16, margin: 0 }}>3D view</h1>
      <p style={{ margin: 0, fontSize: 13 }}>Ported in a later milestone (M8).</p>
      <Link href="/">← Back to the mapper</Link>
    </main>
  );
}
