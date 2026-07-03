"use client";

import { useAppStore } from "@/lib/store/appStore";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { LeftRail } from "./LeftRail";
import { MainTopBar } from "./MainTopBar";
import { AppSidebar } from "./AppSidebar";
import { MapCanvas } from "@/components/map/MapCanvas";
import { ThreeDView } from "./ThreeDView";

/**
 * The whole app shell. The map/3D canvas is "boxed" — a rounded, shadowed
 * card floating inside a padded frame — with a slim tool rail on the left and
 * the collapsible control sidebar in the wider right gutter. 2D and 3D are
 * just views that share this chrome and swap the center canvas + toolset.
 */
export function AppShell() {
  const view = useAppStore((s) => s.view);
  return (
    <SidebarProvider
      className="min-h-0 flex-1 bg-sidebar"
      style={{ "--sidebar-width": "22rem" } as React.CSSProperties}
    >
      <LeftRail />
      <SidebarInset className="m-2 min-w-0 overflow-hidden rounded-xl shadow-xl">
        <MainTopBar />
        <div className="relative min-h-0 flex-1">
          {view === "2d" ? <MapCanvas /> : <ThreeDView />}
        </div>
      </SidebarInset>
      <AppSidebar />
    </SidebarProvider>
  );
}
