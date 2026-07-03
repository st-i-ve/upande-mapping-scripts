"use client";

import { Map as MapIcon, Box } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";

/** Segmented 2D / 3D view switch. Lives at the top of the sidebar. */
export function ViewSwitcher() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);

  return (
    <div className="flex rounded-md border border-border bg-secondary/40 p-0.5 text-[9px] font-medium">
      {([["2d", "2D", MapIcon], ["3d", "3D", Box]] as const).map(([v, label, Icon]) => (
        <button
          key={v}
          onClick={() => setView(v)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 transition-colors ${
            view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon size={13} /> {label}
        </button>
      ))}
    </div>
  );
}
