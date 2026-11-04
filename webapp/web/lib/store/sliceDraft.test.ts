import { describe, expect, it } from "vitest";
import { fromDraft, toDraft } from "./sliceDraft";
import type { SliceSession } from "./appStore";

type G = SliceSession["slices"][number];
const sq = (x: number, n = 40): G => ({
  type: "Polygon",
  coordinates: [Array.from({ length: n }, (_, i) => [x + Math.cos(i) * 0.001, Math.sin(i) * 0.001]).concat([[x + 0.001, 0]])],
});

/** A session after `cuts` cuts, each splitting the last piece in two, kept like applySlice does. */
function session(cuts: number): SliceSession {
  let slices: G[] = [sq(0)];
  const history: G[][] = [];
  for (let c = 1; c <= cuts; c++) {
    history.push(slices);
    slices = [...slices.slice(0, -1), sq(c), sq(c + 0.5)];
  }
  return { source: "A", original: sq(0), slices, history: history.slice(-50), widths: Array(cuts).fill(1),
    future: [], sourceWasVisible: true, adopted: [], resumedFrom: 0 };
}

describe("slice drafts", () => {
  it("round-trips the session, undo and redo included", () => {
    const s = session(8);
    s.future = [{ slices: [...s.slices, sq(99)], width: 2 }, { slices: [sq(98)], width: 3 }];
    const back = fromDraft(JSON.parse(JSON.stringify(toDraft(s))), ["A"])!;
    expect(back.slices).toEqual(s.slices);
    expect(back.history).toEqual(s.history);
    expect(back.future).toEqual(s.future);
    expect(back.widths).toEqual(s.widths);
  });

  it("stores undo as changes — size grows with cuts, not cuts × pieces", () => {
    const s = session(64);
    const full = JSON.stringify({ ...s }).length;
    const packed = JSON.stringify(toDraft(s)).length;
    expect(packed).toBeLessThan(full / 8);
    expect(packed).toBeLessThan(JSON.stringify(s.slices).length * 3);
  });

  it("serialises the same after a round trip (the sync compares JSON)", () => {
    const d1 = JSON.stringify(toDraft(session(10)));
    expect(JSON.stringify(toDraft(fromDraft(JSON.parse(d1))))).toBe(d1);
  });

  it("still reads older full-copy drafts", () => {
    const s = session(3);
    const old = { ...s }; // no enc: history holds full copies
    expect(fromDraft(JSON.parse(JSON.stringify(old)), ["A"])!.history).toEqual(s.history);
  });

  it("drops a session whose shape is gone", () => {
    expect(fromDraft(toDraft(session(2)), ["B"])).toBeNull();
  });
});
