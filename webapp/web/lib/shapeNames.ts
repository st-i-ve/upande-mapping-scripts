/**
 * Name checking for shapes, shared by the rename box and the finish-slicing
 * review. Pure, so the rules are testable without a map or a store.
 *
 * A shape's name is its identity: it names the ERP document downstream, and the
 * slice hierarchy is read straight out of it ("Field 2 1" is the first piece of
 * the second piece of Field). So a collision is not a cosmetic problem, and the
 * UI blocks on one rather than quietly appending a suffix.
 */

export type NameIssue = "empty" | "duplicate" | "taken";

export const NAME_ISSUE_TEXT: Record<NameIssue, string> = {
  empty: "needs a name",
  duplicate: "same name twice in this batch",
  taken: "a shape already has this name",
};

const norm = (n: string) => n.trim();
/** Case-insensitive: "Block A" and "block a" would be two ERP documents that read alike. */
const key = (n: string) => norm(n).toLowerCase();

/**
 * One issue (or null) per proposed name.
 *
 * @param names    the proposed names, in order
 * @param existing names already in use
 * @param freed    names in `existing` that these proposals are replacing, so
 *                 reusing one is not a collision
 */
export function checkNames(
  names: string[],
  existing: Iterable<string> = [],
  freed: Iterable<string> = [],
): (NameIssue | null)[] {
  const freedKeys = new Set([...freed].map(key));
  const taken = new Set([...existing].map(key).filter((k) => !freedKeys.has(k)));

  const seen = new Map<string, number>();
  for (const n of names) {
    const k = key(n);
    if (k) seen.set(k, (seen.get(k) ?? 0) + 1);
  }

  return names.map((n) => {
    const k = key(n);
    if (!k) return "empty";
    if ((seen.get(k) ?? 0) > 1) return "duplicate";
    if (taken.has(k)) return "taken";
    return null;
  });
}

/** True when every proposed name is usable. */
export function namesAreClean(
  names: string[],
  existing: Iterable<string> = [],
  freed: Iterable<string> = [],
): boolean {
  return checkNames(names, existing, freed).every((i) => i === null);
}
