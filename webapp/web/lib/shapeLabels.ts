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
