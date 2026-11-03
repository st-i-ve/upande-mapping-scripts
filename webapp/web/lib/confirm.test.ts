import { describe, it, expect } from "vitest";
import { askConfirm, answerConfirm, useConfirm } from "./confirm";

describe("askConfirm", () => {
  it("resolves with the answer and closes", async () => {
    const p = askConfirm({ title: "Delete it?" });
    expect(useConfirm.getState().request?.title).toBe("Delete it?");
    answerConfirm(true);
    await expect(p).resolves.toBe(true);
    expect(useConfirm.getState().request).toBeNull();
  });

  it("a new question answers the open one with no", async () => {
    const first = askConfirm({ title: "A" });
    const second = askConfirm({ title: "B" });
    await expect(first).resolves.toBe(false);
    answerConfirm(false);
    await expect(second).resolves.toBe(false);
  });
});
