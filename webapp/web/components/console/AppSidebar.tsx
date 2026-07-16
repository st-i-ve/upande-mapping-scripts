"use client";

import { useAppStore } from "@/lib/store/appStore";
import { Sidebar, SidebarContent, SidebarRail } from "@/components/ui/sidebar";
import { ViewSwitcher } from "./ViewSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { Panels2D } from "./Panels2D";
import { ThreeDToolset } from "./ThreeDToolset";

/** Right-hand control sidebar. The header is a sticky glassmorphic bar — panels
 *  scroll underneath it with a frosted blur. */
export function AppSidebar() {
  const view = useAppStore((s) => s.view);
  const logo = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/upande-logo.png`;
  return (
    <Sidebar side="right" collapsible="offcanvas" className="group-data-[side=right]:border-l-0">
      <SidebarContent className="gap-0">
        <div className="sticky top-0 z-20 border-b border-border/70 bg-sidebar/60 px-3 py-3 backdrop-blur-md">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt="Upande" className="h-10 w-10 shrink-0 object-contain" />
              <div className="leading-[1.05]">
                <div className="text-xl font-bold tracking-[0.16em]">UPANDE</div>
                <div className="text-xl font-semibold tracking-[0.16em] text-muted-foreground">MAPPER</div>
              </div>
            </div>
            <ThemeToggle />
          </div>
          <div className="mt-3">
            <ViewSwitcher />
          </div>
        </div>
        <div className="p-3">
          {view === "2d" ? <Panels2D /> : <ThreeDToolset />}
        </div>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
