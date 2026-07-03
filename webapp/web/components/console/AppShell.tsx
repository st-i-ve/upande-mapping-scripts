"use client";

import { useAppStore } from "@/lib/store/appStore";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { LeftRail } from "./LeftRail";
import { AppSidebar } from "./AppSidebar";
import { CommandMenu } from "./CommandMenu";
import { MapCanvas } from "@/components/map/MapCanvas";
import { ThreeDView } from "./ThreeDView";

/**
 * The whole app shell. The map/3D canvas is "boxed" — a rounded, bordered card
 * inside a padded frame — with a slim tool rail on the left and the control
 * sidebar on the right (its separator faded for a seamless join). The map fills
 * the box; ⌘K stays available headlessly (no visible chrome over the map).
 */
export function AppShell() {
  const view = useAppStore((s) => s.view);
  return (
    <SidebarProvider
      className="min-h-0 flex-1 bg-sidebar"
      style={{ "--sidebar-width": "22rem" } as React.CSSProperties}
    >
      <LeftRail />
      <SidebarInset className="m-2 min-w-0 overflow-hidden rounded-xl border border-border shadow-xl">
        <div className="relative min-h-0 flex-1">
          {view === "2d" ? <MapCanvas /> : <ThreeDView />}
        </div>
        <CommandMenu hideTrigger />
      </SidebarInset>
      <AppSidebar />
    </SidebarProvider>
  );
}
