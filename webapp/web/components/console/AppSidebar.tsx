"use client";

import { useAppStore } from "@/lib/store/appStore";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { ViewSwitcher } from "./ViewSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { Panels2D } from "./Panels2D";
import { ThreeDToolset } from "./ThreeDToolset";

/** Right-hand control sidebar. Wraps the app; its content follows the view. */
export function AppSidebar() {
  const view = useAppStore((s) => s.view);
  return (
    <Sidebar side="right" collapsible="offcanvas" className="group-data-[side=right]:border-l-0">
      <SidebarHeader className="gap-2.5 border-b border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/upande-logo.png`}
              alt="Upande"
              className="h-6 w-6 shrink-0 object-contain"
            />
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-semibold tracking-[0.14em]">UPANDE</span>
              <span className="text-lg font-medium tracking-[0.14em] text-muted-foreground">MAPPER</span>
            </div>
          </div>
          <ThemeToggle />
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
