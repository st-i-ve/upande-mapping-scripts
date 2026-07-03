"use client";

import { useAppStore } from "@/lib/store/appStore";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { LeftRail } from "./LeftRail";
import { MainTopBar } from "./MainTopBar";
import { AppSidebar } from "./AppSidebar";
import { MapCanvas } from "@/components/map/MapCanvas";
import { ThreeDView } from "./ThreeDView";

/**
 * The whole app shell: a left tool rail, the map/3D canvas in the middle, and
 * the collapsible control sidebar on the right — all wrapped by SidebarProvider
 * so the sidebar frames the entire layout. 2D and 3D are just views that share
 * this chrome and swap the center canvas + the sidebar's toolset.
 */
export function AppShell() {
  const view = useAppStore((s) => s.view);
  return (
    <SidebarProvider className="min-h-0 flex-1">
      <LeftRail />
      <SidebarInset className="min-w-0">
        <MainTopBar />
        <div className="relative min-h-0 flex-1">
          {view === "2d" ? <MapCanvas /> : <ThreeDView />}
        </div>
      </SidebarInset>
      <AppSidebar />
    </SidebarProvider>
  );
}
