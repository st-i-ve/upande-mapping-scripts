"use client";

import { useState } from "react";
import {
  MousePointer2, Hexagon, Square, Spline, Move, Eraser, Trash2, PencilLine, Circle,
  Slice, Waypoints, Scissors, Mountain, Sun, Layers, Ruler, Compass, Puzzle,
  SquaresUnite, SquaresSubtract, SquaresIntersect, Undo2, Redo2, CircleX, type LucideIcon,
} from "lucide-react";
import { useAppStore, type SideTab } from "@/lib/store/appStore";
import { useMapBridge, type MapHandle } from "@/lib/map/mapBridge";
import { useHistory, undo, redo } from "@/lib/store/history";
import { combineSelected, deleteSelected, sliceShape } from "@/lib/shapeActions";
import { OP_LABEL } from "@/lib/geometry/booleanOps";

interface Tool {
  id: string;
  label: string;
  icon: LucideIcon;
  run: (h: MapHandle) => void;
  /** Sidebar tab holding this tool's options — opened when the tool is picked. */
  tab?: SideTab;
}

/** Sticky tools: picking one makes it the active mode on the map. */
const TOOL_GROUPS: { label: string; tools: Tool[] }[] = [
  {
    label: "Select",
    tools: [{ id: "select", label: "Select / pan", icon: MousePointer2, run: (h) => h.stopModes() }],
  },
  {
    label: "Draw",
    tools: [
      { id: "pencil", label: "Freehand pencil (drag to sketch)", icon: PencilLine, run: (h) => h.freehand(), tab: "tool" },
      { id: "polygon", label: "Draw polygon (Ctrl+Z removes the last point)", icon: Hexagon, run: (h) => h.draw("Polygon"), tab: "tool" },
      { id: "rect", label: "Draw rectangle", icon: Square, run: (h) => h.draw("Rectangle"), tab: "tool" },
      { id: "circle", label: "Draw circle / pivot (click centre, click edge)", icon: Circle, run: (h) => h.pivotDraw(), tab: "tool" },
    ],
  },
  {
    label: "Modify",
    tools: [
      { id: "edit", label: "Edit vertices", icon: Spline, run: (h) => h.editMode() },
      { id: "move", label: "Move", icon: Move, run: (h) => h.dragMode() },
      { id: "erase", label: "Erase drawing", icon: Eraser, run: (h) => h.eraseMode() },
    ],
  },
  {
    label: "Cut",
    tools: [
      { id: "knife-straight", label: "Knife — straight path (click points, click the last again to cut)", icon: Waypoints, run: (h) => h.knifeStraight(), tab: "tool" },
      { id: "knife-draw", label: "Knife — draw path (drag)", icon: Slice, run: (h) => h.knifeFreehand(), tab: "tool" },
    ],
  },
];

const TOOLS_3D = [
  { id: "3d-terrain", label: "Terrain", icon: Mountain },
  { id: "3d-light", label: "Lighting", icon: Sun },
  { id: "3d-layers", label: "Layers", icon: Layers },
  { id: "3d-measure", label: "Measure", icon: Ruler },
  { id: "3d-orient", label: "Orientation", icon: Compass },
];

const BTN = "flex h-10 w-10 items-center justify-center rounded-full transition-colors disabled:pointer-events-none disabled:opacity-30";
const IDLE = "text-muted-foreground hover:bg-primary/10 hover:text-primary";

function RailButton({ label, icon: Icon, onClick, disabled, active, danger }: {
  label: string; icon: LucideIcon; onClick: () => void; disabled?: boolean; active?: boolean; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      className={`${BTN} ${
        active ? "bg-primary/15 text-primary ring-1 ring-primary/40"
        : danger ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        : IDLE
      }`}
    >
      <Icon size={19} />
    </button>
  );
}

const Divider = () => <span aria-hidden className="my-1 h-px w-7 shrink-0 bg-border" />;

/** Pinned to the rail's foot: downloads the tile-cache browser extension (zipped by the backend). */
function TileExtensionLink() {
  return (
    <a
      href="/api/tile-cache-extension.zip"
      download
      aria-label="Download tile cache extension"
      title={"Download the Tile Cache Inspector browser extension.\nTo install: unzip it, open chrome://extensions, turn on Developer mode, click Load unpacked and pick the unzipped folder."}
      className={`mt-auto ${BTN} ${IDLE}`}
    >
      <Puzzle size={19} />
    </a>
  );
}

/**
 * The shape-making toolbox, top to bottom in the order you'd use it: select,
 * draw, modify, cut, combine — then history and delete. Picking a tool that has
 * settings (knife width, pivot slices, the drawing's name) opens them on the right.
 */
export function LeftRail() {
  const view = useAppStore((s) => s.view);
  const handle = useMapBridge((s) => s.handle);
  const selected = useAppStore((s) => s.selectedShapes);
  const slicing = useAppStore((s) => s.slice != null);
  const sliceUndo = useAppStore((s) => (s.slice?.history.length ?? 0) > 0);
  const sliceRedo = useAppStore((s) => (s.slice?.future.length ?? 0) > 0);
  const setSideTab = useAppStore((s) => s.setSideTab);
  const pastLen = useHistory((s) => s.past.length);
  const futureLen = useHistory((s) => s.future.length);
  const [active, setActive] = useState("select");
  const [flash, setFlash] = useState<string | null>(null);

  if (view === "3d") {
    return (
      <nav className="flex w-14 shrink-0 flex-col items-center gap-1 py-2">
        {TOOLS_3D.map((t) => (
          <span key={t.id} title={`${t.label} (in 3D canvas)`} className={`${BTN} text-muted-foreground/50`}>
            <t.icon size={19} />
          </span>
        ))}
        <TileExtensionLink />
      </nav>
    );
  }

  const pick = (t: Tool) => {
    if (!handle) return;
    t.run(handle);
    setActive(t.id);
    if (t.tab) setSideTab(t.tab);
  };

  const combine = (op: keyof typeof OP_LABEL) => {
    const err = combineSelected(op);
    setFlash(err);
    if (err) setTimeout(() => setFlash(null), 3000);
  };

  const n = selected.length;
  const canUndo = slicing ? sliceUndo : pastLen > 0;
  const canRedo = slicing ? sliceRedo : futureLen > 0;
  const st = () => useAppStore.getState();

  return (
    <nav className="relative flex w-14 shrink-0 flex-col items-center gap-0.5 overflow-y-auto py-2" aria-label="Shape tools">
      {TOOL_GROUPS.map((g, gi) => (
        <div key={g.label} role="group" aria-label={g.label} className="flex flex-col items-center gap-0.5">
          {gi > 0 && <Divider />}
          {g.tools.map((t) => (
            <RailButton key={t.id} label={t.label} icon={t.icon} disabled={!handle}
              active={active === t.id} onClick={() => pick(t)} />
          ))}
          {g.label === "Cut" && (
            <RailButton label={n === 1 ? `Slice ${selected[0]} repeatedly (original kept)` : "Slice a shape — select one first"}
              icon={Scissors} disabled={!handle || n !== 1}
              onClick={() => { sliceShape(selected[0]); setActive("knife-draw"); }} />
          )}
        </div>
      ))}

      <Divider />
      <div role="group" aria-label="Combine" className="flex flex-col items-center gap-0.5">
        <RailButton label="Union — merge the selected shapes" icon={SquaresUnite} disabled={n < 2} onClick={() => combine("union")} />
        <RailButton label="Subtract — first selected minus the rest" icon={SquaresSubtract} disabled={n < 2} onClick={() => combine("subtract")} />
        <RailButton label="Intersect — keep only the overlap" icon={SquaresIntersect} disabled={n < 2} onClick={() => combine("intersect")} />
      </div>

      <Divider />
      <div role="group" aria-label="History" className="flex flex-col items-center gap-0.5">
        <RailButton label={slicing ? "Undo cut (Ctrl+Z)" : `Undo (Ctrl+Z) — ${pastLen} step${pastLen === 1 ? "" : "s"} back`}
          icon={Undo2} disabled={!canUndo} onClick={() => (slicing ? st().undoSlice() : undo())} />
        <RailButton label={slicing ? "Redo cut (Ctrl+Y)" : "Redo (Ctrl+Y)"}
          icon={Redo2} disabled={!canRedo} onClick={() => (slicing ? st().redoSlice() : redo())} />
        <RailButton label={n ? `Delete ${n} selected (Del)` : "Delete selected (Del) — select shapes first"}
          icon={Trash2} danger disabled={!n} onClick={deleteSelected} />
        <RailButton label="Clear the unsaved drawing" icon={CircleX} danger disabled={!handle}
          onClick={() => handle?.clearDrawn()} />
      </div>

      {flash && (
        <p role="status" className="fixed left-14 top-24 z-[1000] max-w-56 rounded-md border border-destructive/40 bg-popover px-2 py-1 text-[13px] text-destructive shadow-lg">
          {flash}
        </p>
      )}
      <TileExtensionLink />
    </nav>
  );
}
