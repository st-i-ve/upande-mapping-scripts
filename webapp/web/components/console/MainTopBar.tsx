"use client";

import { Map as MapIcon, Box } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { CommandMenu } from "./CommandMenu";

/** Slim top bar over the map area: view label · ⌘K · sidebar toggle. */
export function MainTopBar() {
  const view = useAppStore((s) => s.view);
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border bg-background/70 px-3 py-2 backdrop-blur">
      <span className="tabular inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {view === "2d" ? <MapIcon size={13} className="text-primary" /> : <Box size={13} className="text-primary" />}
        {view === "2d" ? "2D map" : "3D view"}
      </span>
      <div className="flex items-center gap-2">
        <CommandMenu />
        <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
      </div>
    </header>
  );
}
