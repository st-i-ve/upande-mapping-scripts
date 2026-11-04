"use client";

import { Target, LocateFixed, FolderSearch, X } from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { shapeOfGeometry } from "@/lib/units";

const BTN = "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary";

/**
 * The dashed outline on the map is the working polygon: a copy of a shape that
 * Generate and the knife act on — not a shape itself, so it can't be selected or
 * edited. This chip says what it is and where it came from, and clears it.
 */
export function WorkingChip() {
  const hydrated = useHydrated();
  const working = useAppStore((s) => (hydrated ? s.workingPolygon : null));
  useAppStore((s) => s.savedShapes); // re-resolve the source when shapes change
  const handle = useMapBridge((s) => s.handle);
  if (!working) return null;
  const source = shapeOfGeometry(working);

  const reveal = () => {
    if (!source) return;
    const st = useAppStore.getState();
    st.setSideTab("browser");
    if (source.folder) st.revealFolder(source.folder);
    st.setSelectedShapes([source.name]);
  };

  return (
    <div className="absolute left-1/2 top-3 z-[600] flex -translate-x-1/2 items-center gap-1 rounded-lg border border-[#f5b942]/60 bg-popover/90 py-1 pl-2.5 pr-1 shadow-lg backdrop-blur"
      onDoubleClick={(e) => e.stopPropagation()}>
      <Target size={13} className="shrink-0 text-[#f5b942]" />
      <span className="max-w-60 truncate text-[11px] text-foreground"
        title="The highlighted shape is what Generate and the knife work on. Double-click any shape to use it instead.">
        Working polygon · <strong>{source?.name ?? "unsaved outline"}</strong>
      </span>
      <button className={BTN} title="Zoom to it" aria-label="Zoom to the working polygon" onClick={() => handle?.fitGeometry(working)}><LocateFixed size={12} /></button>
      {source && (
        <button className={BTN} title={`Find ${source.name} in the Browser`} aria-label="Find its shape in the Browser" onClick={reveal}><FolderSearch size={12} /></button>
      )}
      <button className={`${BTN} hover:!bg-destructive/10 hover:!text-destructive`} title="Clear it (removes the dashed outline; the shape itself stays)"
        aria-label="Clear the working polygon" onClick={() => useAppStore.getState().setWorkingPolygon(null)}><X size={12} /></button>
    </div>
  );
}
