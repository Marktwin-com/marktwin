import { describe, expect, it } from "vitest";

import { parseMarkdownOutline, renderKatex } from "./markdown-presentation";

describe("Markdown presentation", () => {
  it("builds an outline without treating fenced headings as document headings", () => {
    const content = "# Title\r\n\r\n## **Plan**\r\n```md\r\n# Example\r\n```\r\n### Résumé 🚀\r\n";
    expect(parseMarkdownOutline(content).map(({ level, text, line }) => ({ level, text, line }))).toEqual([
      { level: 1, text: "Title", line: 1 },
      { level: 2, text: "Plan", line: 3 },
      { level: 3, text: "Résumé 🚀", line: 7 },
    ]);
  });

  it("renders valid mathematics and falls back to readable source for invalid mathematics", () => {
    expect(renderKatex("E = mc^2", false)).toContain("katex");
    expect(renderKatex("\\frac{", true)).toContain("marktwin-render-error");
    expect(renderKatex("\\frac{", true)).toContain("\\frac{");
  });
});
