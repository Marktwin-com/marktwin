import { describe, expect, it } from "vitest";

import { createLineDiff, lineDiffCounts } from "./line-diff";

describe("line diff presentation", () => {
  it("marks additions and removals while retaining line numbers", () => {
    const diff = createLineDiff("one\ntwo\nthree\n", "one\nchanged\nthree\nfour\n");

    expect(diff).toEqual([
      { kind: "context", text: "one", oldLine: 1, newLine: 1 },
      { kind: "removed", text: "two", oldLine: 2 },
      { kind: "added", text: "changed", newLine: 2 },
      { kind: "context", text: "three", oldLine: 3, newLine: 3 },
      { kind: "added", text: "four", newLine: 4 },
    ]);
    expect(lineDiffCounts(diff)).toEqual({ added: 2, removed: 1 });
  });

  it("represents file creation and deletion", () => {
    expect(createLineDiff(null, "new\n")).toEqual([{ kind: "added", text: "new", newLine: 1 }]);
    expect(createLineDiff("old\n", null)).toEqual([{ kind: "removed", text: "old", oldLine: 1 }]);
  });
});
