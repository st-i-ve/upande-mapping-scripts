/**
 * The left-rail tools: name, one-line description and shortcut key, in one place
 * so the rail's tooltips and the keyboard always agree. Pure — no map, no DOM.
 */
import { isTypingTarget, type ShapeKeyEvent } from "./shapeKeys";

export type ToolId =
  | "select" | "pencil" | "polygon" | "rect" | "circle"
  | "edit" | "move" | "erase"
  | "knife-straight" | "knife-draw"
  | "union" | "subtract" | "intersect"
  | "undo" | "redo" | "delete" | "clear";

export interface ToolInfo {
  name: string;
  /** One sentence: what it does. */
  desc: string;
  /** The shortcut as shown to the user. */
  key: string;
}

export const TOOL_INFO: Record<ToolId, ToolInfo> = {
  select: { name: "Select / pan", key: "V", desc: "Click shapes to select them and drag the map to move around." },
  pencil: { name: "Freehand pencil", key: "P", desc: "Drag on the map to sketch a shape freehand." },
  polygon: { name: "Draw polygon", key: "D", desc: "Click corner points and click the first one again to close the shape." },
  rect: { name: "Draw rectangle", key: "R", desc: "Drag from one corner to the opposite corner." },
  circle: { name: "Circle / pivot", key: "C", desc: "Click the centre, then click the edge to set the radius." },
  edit: { name: "Edit vertices", key: "E", desc: "Drag a shape's corner points to reshape it." },
  move: { name: "Move", key: "M", desc: "Drag a drawn shape to a new place." },
  erase: { name: "Erase drawing", key: "X", desc: "Click a drawn shape to remove it." },
  "knife-straight": { name: "Knife", key: "K", desc: "Cut across a shape as many times as you like, then Finish to save the pieces — the original is kept." },
  "knife-draw": { name: "Knife — freehand", key: "Shift+K", desc: "The knife, cutting along a line you drag instead of points you click." },
  union: { name: "Union", key: "U", desc: "Merge the selected shapes into one." },
  subtract: { name: "Subtract", key: "−", desc: "Take the other selected shapes away from the first one." },
  intersect: { name: "Intersect", key: "I", desc: "Keep only where the selected shapes overlap." },
  undo: { name: "Undo", key: "Ctrl+Z", desc: "Step back one change, up to 50 steps." },
  redo: { name: "Redo", key: "Ctrl+Y", desc: "Put back the change you just undid." },
  delete: { name: "Delete selected", key: "Del", desc: "Remove the selected shapes from the project." },
  clear: { name: "Clear drawing", key: "Shift+Del", desc: "Throw away the unsaved shape you're drawing." },
};

/** Single-key shortcuts (lower-case key, shift?) → tool. Undo/redo/delete live in shapeKeys. */
const KEYS: Record<string, ToolId> = {
  v: "select", p: "pencil", d: "polygon", r: "rect", c: "circle",
  e: "edit", m: "move", x: "erase",
  k: "knife-straight", "shift+k": "knife-draw",
  u: "union", "-": "subtract", i: "intersect",
  "shift+delete": "clear", "shift+backspace": "clear",
};

/** The tool a keypress picks, or null. Never while typing, never with Ctrl/⌘/Alt. */
export function resolveToolKey(e: ShapeKeyEvent): ToolId | null {
  if (isTypingTarget(e.target)) return null;
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (k === "-" || k === "_") return "subtract"; // either minus key, shifted or not
  return KEYS[e.shiftKey ? `shift+${k}` : k] ?? null;
}
