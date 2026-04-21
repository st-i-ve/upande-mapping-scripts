"""
Grid mapping — Part 1: rename empties.

Renames every empty inside the Blender collection `KINYORO BLK 4 - KL`
from Blender's default duplicate-suffix scheme to a stable tree ID.

Old name pattern  ->  new name
  ROW 1             ->  KINYOROBLK4_ROW1_T1
  ROW 1.001         ->  KINYOROBLK4_ROW1_T2
  ROW 5.047         ->  KINYOROBLK4_ROW5_T48
  ROW 50            ->  KINYOROBLK4_ROW50_T1

How to run:
  1. Open the .blend file in Blender 4.5.
  2. Switch to the "Scripting" workspace (top tab).
  3. In the Text Editor pane, click "Open" and pick this file.
  4. Press the ▶ "Run Script" button (or Alt+P while hovering the editor).
  5. Check the "System Console" (Window -> Toggle System Console on Windows,
     or launch Blender from a terminal on Linux/macOS) for the summary.
"""

import bpy
import re

COLL_NAME = "KINYORO BLK 4 - KL"
PREFIX = "KINYOROBLK4"
PATTERN = re.compile(r"^ROW\s+(\d+)(?:\.(\d+))?$")


def rename_empties():
    coll = bpy.data.collections.get(COLL_NAME)
    if coll is None:
        raise RuntimeError(f"Collection {COLL_NAME!r} not found")

    # Two-pass rename so a new name can't collide with an old name mid-loop.
    pending, skipped = [], []
    for obj in coll.objects:
        if obj.type != "EMPTY":
            continue
        m = PATTERN.match(obj.name)
        if not m:
            skipped.append(obj.name)
            continue
        row = int(m.group(1))
        suffix = m.group(2)  # None, or "001", "047", ...
        tree = 1 if suffix is None else int(suffix) + 1
        final = f"{PREFIX}_ROW{row}_T{tree}"
        obj.name = f"__TMP__{final}"
        pending.append((obj, final))

    for obj, final in pending:
        obj.name = final

    print(f"Renamed {len(pending)} empties in {COLL_NAME!r}.")
    if skipped:
        print(f"Skipped {len(skipped)} (name didn't match 'ROW N' / 'ROW N.NNN'):")
        for n in skipped[:15]:
            print("  ", n)
        if len(skipped) > 15:
            print(f"  ... and {len(skipped) - 15} more")


if __name__ == "__main__":
    rename_empties()
