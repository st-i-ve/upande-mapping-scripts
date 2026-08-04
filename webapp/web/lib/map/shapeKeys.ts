/**
 * Keyboard shortcuts for the saved-shape selection.
 *
 * Kept as pure functions so the matching rules — including the "don't fire while
 * the user is typing" guard — are testable without a map or a real DOM event.
 */

export type ShapeKeyAction = "delete";

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** True when focus sits somewhere the user is typing, so shortcuts must stay out of the way. */
export function isTypingTarget(target: EventTarget | null | undefined): boolean {
  const el = target as
    | (Partial<HTMLElement> & { tagName?: string; isContentEditable?: boolean })
    | null
    | undefined;
  if (!el || typeof el.tagName !== "string") return false;
  if (TYPING_TAGS.has(el.tagName.toUpperCase())) return true;
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
};

/** Which shape action a keypress maps to, or null when it isn't one of ours. */
export function resolveShapeKey(e: ShapeKeyEvent): ShapeKeyAction | null {
  if (isTypingTarget(e.target)) return null;
  // Modifier combos belong to the browser / OS (⌘⌫ = back, etc.).
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.key === "Delete" || e.key === "Backspace") return "delete";
  return null;
}
