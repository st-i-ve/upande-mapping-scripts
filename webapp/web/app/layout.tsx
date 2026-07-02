import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Upande Bed & Zone Mapper",
  description: "Map beds, zones, and tree grids for Upande greenhouses.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
