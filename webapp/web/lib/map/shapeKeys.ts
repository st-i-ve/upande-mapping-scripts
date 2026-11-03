/**
 * Keyboard shortcuts for the saved-shape selection.
 *
 * Kept as pure functions so the matching rules — including the "don't fire while
 * the user is typing" guard — are testable without a map or a real DOM event.
 */

export type ShapeKeyAction = "delete" | "escape" | "undo" | "redo";

const TYPING_TAGS = new Set(["TEXTAREA", "SELECT"]);

/**
 * Input types that take no text — focus sitting on one of these (after ticking a
 * shape's checkbox, say) must NOT swallow the shortcut.
 */
const NON_TEXT_INPUTS = new Set([
  "checkbox", "radio", "button", "submit", "reset", "file", "range", "color", "image",
]);

/** True when focus sits somewhere the user is typing, so shortcuts must stay out of the way. */
export function isTypingTarget(target: EventTarget | null | undefined): boolean {
  const el = target as
    | (Partial<HTMLElement> & { tagName?: string; type?: string; isContentEditable?: boolean })
    | null
    | undefined;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName.toUpperCase();
  if (tag === "INPUT") return !NON_TEXT_INPUTS.has((el.type ?? "text").toLowerCase());
  if (TYPING_TAGS.has(tag)) return true;
  if (el.isContentEditable) return true;
  // Focus can land on a child of a contenteditable host.
  return typeof el.closest === "function" && el.closest("[contenteditable='true']") != null;
}

/** The subset of a KeyboardEvent the matching rules read. */
export type ShapeKeyEvent = {
  key: string;
  target?: EventTarget | null;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
};

/** Which shape action a keypress maps to, or null when it isn't one of ours. */
export function resolveShapeKey(e: ShapeKeyEvent): ShapeKeyAction | null {
  // In a text field, Ctrl+Z is the field's own undo.
  if (isTypingTarget(e.target)) return null;
  const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
  const k = e.key.toLowerCase();
  if (mod && k === "z") return e.shiftKey ? "redo" : "undo";
  if (mod && k === "y" && !e.shiftKey) return "redo";
  // Other modifier combos belong to the browser / OS (⌘⌫ = back, etc.).
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.key === "Delete" || e.key === "Backspace") return "delete";
  // Escape puts the knife away — nothing else, so it can't disturb a pick or an
  // edit session the user is in the middle of.
  if (e.key === "Escape") return "escape";
  return null;
}
