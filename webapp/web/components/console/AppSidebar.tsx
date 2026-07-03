"use client";

import { useAppStore } from "@/lib/store/appStore";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { ViewSwitcher } from "./ViewSwitcher";
import { Panels2D } from "./Panels2D";
import { ThreeDToolset } from "./ThreeDToolset";

/** Right-hand control sidebar. Wraps the app; its content follows the view. */
export function AppSidebar() {
  const view = useAppStore((s) => s.view);
  return (
    <Sidebar side="right" collapsible="offcanvas" className="border-l border-border">
      <SidebarHeader className="gap-2 border-b border-border p-3">
        <div className="flex items-baseline gap-1.5 px-0.5">
          <span className="tabular text-xs font-semibold tracking-[0.14em]">UPANDE</span>
          <span className="tabular text-xs font-medium tracking-[0.14em] text-primary">MAPPER</span>
        </div>
        <ViewSwitcher />
      </SidebarHeader>
      <SidebarContent className="p-3">
        {view === "2d" ? <Panels2D /> : <ThreeDToolset />}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
