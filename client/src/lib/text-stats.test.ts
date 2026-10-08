import { describe, expect, it } from "vitest";

import { textStatistics } from "./text-stats";

describe("textStatistics", () => {
  it("counts lines, whitespace-delimited words, and all characters", () => {
    expect(textStatistics("  hello\tworld\nsecond  ")).toEqual({ lines: 2, words: 3, characters: 22 });
  });

  it("handles empty, punctuation-only, and Unicode text", () => {
    expect(textStatistics("")).toEqual({ lines: 1, words: 0, characters: 0 });
    expect(textStatistics("...!!!")).toEqual({ lines: 1, words: 1, characters: 6 });
    expect(textStatistics("café 😀")).toEqual({ lines: 1, words: 2, characters: 7 });
  });
});
