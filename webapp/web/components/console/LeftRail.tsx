"use client";

import type { ReactElement } from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import {
  MousePointer2, Hexagon, Square, Spline, Move, Eraser, Trash2, PencilLine, Circle,
  Slice, Waypoints, Scissors, Mountain, Sun, Layers, Ruler, Compass, Puzzle,
  SquaresUnite, SquaresSubtract, SquaresIntersect, Undo2, Redo2, CircleX, type LucideIcon,
} from "lucide-react";
import { useAppStore } from "@/lib/store/appStore";
import { useMapBridge } from "@/lib/map/mapBridge";
import { useHistory } from "@/lib/store/history";
import { TOOL_INFO, type ToolId } from "@/lib/map/tools";
import { runTool } from "@/lib/toolActions";

/** The sticky tools, grouped top to bottom in the order you'd use them. */
const TOOL_GROUPS: { label: string; tools: { id: ToolId; icon: LucideIcon }[] }[] = [
  { label: "Select", tools: [{ id: "select", icon: MousePointer2 }] },
  {
    label: "Draw",
    tools: [
      { id: "pencil", icon: PencilLine },
      { id: "polygon", icon: Hexagon },
      { id: "rect", icon: Square },
      { id: "circle", icon: Circle },
    ],
  },
  {
    label: "Modify",
    tools: [
      { id: "edit", icon: Spline },
      { id: "move", icon: Move },
      { id: "erase", icon: Eraser },
    ],
  },
  {
    label: "Cut",
    tools: [
      { id: "knife-straight", icon: Waypoints },
      { id: "knife-draw", icon: Slice },
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

const BTN = "flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:pointer-events-none disabled:opacity-30";
const IDLE = "text-muted-foreground hover:bg-primary/10 hover:text-primary";

/** Themed hover card: the tool's name and key, one sentence on what it does, and why it's greyed out. */
function RailTip({ name, keys, desc, note, children }: {
  name: string; keys?: string; desc: string; note?: string; children: ReactElement;
}) {
  return (
    <TooltipPrimitive.Root>
      {/* A span, so the card still shows on a disabled button. */}
      <TooltipPrimitive.Trigger delay={250} render={<span className="inline-flex" />}>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side="right" sideOffset={10} className="isolate z-[1100]">
          <TooltipPrimitive.Popup className="w-60 origin-(--transform-origin) rounded-lg border border-border bg-popover/95 px-3 py-2 text-[11px] text-popover-foreground shadow-xl backdrop-blur transition-[opacity,transform] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <span className="flex items-center gap-2">
              <span className="font-medium text-foreground">{name}</span>
              {keys && (
                <kbd className="ml-auto rounded border border-primary/30 bg-primary/10 px-1.5 py-px font-mono text-[10px] text-primary">{keys}</kbd>
              )}
            </span>
            <span className="mt-0.5 block leading-snug text-muted-foreground">{desc}</span>
            {note && <span className="mt-1 block text-[10px] text-amber-500/90">{note}</span>}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

function RailButton({ id, icon: Icon, disabled, active, danger, note, name, desc }: {
  id: ToolId; icon: LucideIcon; disabled?: boolean; active?: boolean; danger?: boolean;
  /** Shown under the description — e.g. why the button is greyed out. */
  note?: string; name?: string; desc?: string;
}) {
  const info = TOOL_INFO[id];
  return (
    <RailTip name={name ?? info.name} keys={info.key} desc={desc ?? info.desc} note={note}>
      <button
        onClick={() => runTool(id)}
        aria-label={`${name ?? info.name} (${info.key})`}
        aria-pressed={active}
        disabled={disabled}
        className={`${BTN} ${
          active ? "bg-primary/15 text-primary ring-1 ring-primary/40"
          : danger ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          : IDLE
        }`}
      >
        <Icon size={16} />
      </button>
    </RailTip>
  );
}

const Divider = () => <span aria-hidden className="my-1 h-px w-6 shrink-0 bg-border" />;

/** Pinned to the rail's foot: downloads the tile-cache browser extension (zipped by the backend). */
function TileExtensionLink() {
  return (
    <div className="mt-auto">
      <RailTip name="Tile cache extension"
        desc="Download the browser extension that saves map tiles for offline use."
        note="To install: unzip it, open chrome://extensions, turn on Developer mode and Load unpacked.">
        <a href="/api/tile-cache-extension.zip" download aria-label="Download tile cache extension" className={`${BTN} ${IDLE}`}>
          <Puzzle size={16} />
        </a>
      </RailTip>
    </div>
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
  const tool = useMapBridge((s) => s.tool);
  const knifeMode = useMapBridge((s) => s.knifeMode);
  const flash = useMapBridge((s) => s.toolFlash);
  const selected = useAppStore((s) => s.selectedShapes);
  const slicing = useAppStore((s) => s.slice != null);
  const sliceUndo = useAppStore((s) => (s.slice?.history.length ?? 0) > 0);
  const sliceRedo = useAppStore((s) => (s.slice?.future.length ?? 0) > 0);
  const pastLen = useHistory((s) => s.past.length);
  const futureLen = useHistory((s) => s.future.length);

  if (view === "3d") {
    return (
      <nav className="flex w-11 shrink-0 flex-col items-center gap-1 py-2">
        {TOOLS_3D.map((t) => (
          <span key={t.id} title={`${t.label} (in 3D canvas)`} className={`${BTN} text-muted-foreground/50`}>
            <t.icon size={16} />
          </span>
        ))}
        <TileExtensionLink />
      </nav>
    );
  }

  // The knife can be put away (Esc) or switched (its map panel) without the
  // rail — so the knife's own state decides which knife button is lit.
  const active = knifeMode ? (knifeMode === "straight" ? "knife-straight" : "knife-draw")
    : tool.startsWith("knife") ? "select" : tool;

  const n = selected.length;
  const canUndo = slicing ? sliceUndo : pastLen > 0;
  const canRedo = slicing ? sliceRedo : futureLen > 0;
  const two = n < 2 ? "Select two or more shapes first." : undefined;

  return (
    <nav className="relative flex w-11 shrink-0 flex-col items-center gap-0.5 overflow-y-auto py-2" aria-label="Shape tools">
      {TOOL_GROUPS.map((g, gi) => (
        <div key={g.label} role="group" aria-label={g.label} className="flex flex-col items-center gap-0.5">
          {gi > 0 && <Divider />}
          {g.tools.map((t) => (
            <RailButton key={t.id} id={t.id} icon={t.icon} disabled={!handle} active={active === t.id} />
          ))}
          {g.label === "Cut" && (
            <RailButton id="slice" icon={Scissors} disabled={!handle || n !== 1}
              name={n === 1 ? `Slice ${selected[0]}` : undefined}
              note={n !== 1 ? "Select one shape first." : undefined} />
          )}
        </div>
      ))}

      <Divider />
      <div role="group" aria-label="Combine" className="flex flex-col items-center gap-0.5">
        <RailButton id="union" icon={SquaresUnite} disabled={n < 2} note={two} />
        <RailButton id="subtract" icon={SquaresSubtract} disabled={n < 2} note={two} />
        <RailButton id="intersect" icon={SquaresIntersect} disabled={n < 2} note={two} />
      </div>

      <Divider />
      <div role="group" aria-label="History" className="flex flex-col items-center gap-0.5">
        <RailButton id="undo" icon={Undo2} disabled={!canUndo}
          desc={slicing ? "Take back the last cut in this slicing session." : `Step back one change — ${pastLen} step${pastLen === 1 ? "" : "s"} available (up to 50).`} />
        <RailButton id="redo" icon={Redo2} disabled={!canRedo}
          desc={slicing ? "Put back the cut you just undid." : undefined} />
        <RailButton id="delete" icon={Trash2} danger disabled={!n}
          name={n ? `Delete ${n} selected` : undefined} note={n ? undefined : "Select shapes first."} />
        <RailButton id="clear" icon={CircleX} danger disabled={!handle} />
      </div>

      {flash && (
        <p role="status" className="fixed left-14 top-24 z-[1000] max-w-56 rounded-md border border-destructive/40 bg-popover px-2 py-1 text-[10px] text-destructive shadow-lg">
          {flash}
        </p>
      )}
      <TileExtensionLink />
    </nav>
  );
}
