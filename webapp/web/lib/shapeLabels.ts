/**
 * Shapes are labelled by letter on the map instead of being filled in — a solid
 * fill hides the imagery underneath, and a letter reads at any zoom. The list in
 * the Saved shapes panel shows the same letters, so map and list line up.
 */

const ALPHABET = 26;
const A = "A".charCodeAt(0);

/** Spreadsheet-style letter for a zero-based index: A, B, … Z, AA, AB, … */
export function shapeLetter(index: number): string {
  if (!Number.isFinite(index) || index < 0) return "";
  let n = Math.floor(index);
  let out = "";
  do {
    out = String.fromCharCode(A + (n % ALPHABET)) + out;
    n = Math.floor(n / ALPHABET) - 1;
  } while (n >= 0);
  return out;
}

/** Shapes filed under this folder are named blocks ("A1", "D9B", …). */
export const BLOCKS_FOLDER = "Blocks";

export function isBlock(folder?: string | null): boolean {
  return !!folder && (folder === BLOCKS_FOLDER || folder.startsWith(`${BLOCKS_FOLDER}/`));
}

/**
 * The label a shape wears on the map: a block shows its own name — that is the
 * point of naming it — and every other shape its letter.
 */
export function shapeTag(s: { name: string; folder?: string | null }, index: number): string {
  return isBlock(s.folder) ? s.name : shapeLetter(index);
}
