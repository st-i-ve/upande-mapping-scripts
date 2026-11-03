"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SideTab } from "@/lib/store/appStore";
import { goToSection, goToUnits } from "@/lib/shapeActions";
import {
  MapPin,
  Shapes,
  Grid3x3,
  Play,
  Box,
  Layers,
  Search,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

/**
 * ⌘K command palette — jump between tools/sections. Wired to navigation now;
 * section-scroll and tool activation hook into the store in later milestones.
 */
export function CommandMenu({ hideTrigger = false }: { hideTrigger?: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Returns a select handler that closes the palette then runs the action.
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const jump = (tab: SideTab, id: string) => () => goToSection(tab, id);

  return (
    <>
      {!hideTrigger && (
      <button
        onClick={() => setOpen(true)}
        className="tabular inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/60 px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        aria-label="Open command menu"
      >
        <Search size={14} />
        <span className="hidden sm:inline">Search</span>
        <kbd className="rounded bg-background/60 px-1 text-[11px]">⌘K</kbd>
      </button>
      )}

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Jump to a tool or section…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Sections">
            <CommandItem onSelect={run(jump("browser", "sec-ref"))}>
              <MapPin /> Reference points
            </CommandItem>
            <CommandItem onSelect={run(jump("browser", "sec-shapes"))}>
              <Shapes /> Saved shapes
            </CommandItem>
            <CommandItem onSelect={run(() => goToUnits("trees"))}>
              <Grid3x3 /> Tree grid
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem onSelect={run(() => goToUnits("zones"))}>
              <Play /> Generate beds &amp; zones
            </CommandItem>
            <CommandItem onSelect={run(jump("browser", "sec-shapes"))}>
              <Layers /> Toggle overlays
            </CommandItem>
            <CommandItem onSelect={run(() => router.push("/3d"))}>
              <Box /> Open 3D view
              <CommandShortcut>3D</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
