import { EditorState, StateEffect } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { appendMarkdownTableColumn, appendMarkdownTableRow, liveMarkdownExtension, markdownListMarker, tableCellSourceRanges } from "./live-markdown-extension";

describe("Live Markdown source invariance", () => {
  const complexInline = String.raw`Escaped \*literal\*, ***nested emphasis***, **bold** *italic* ~~strike~~, [a **bold** label](https://example.com/a_(b)), \`code **stays code**\`, <u>underlined</u>, and $x^2$.`;

  it("can add and remove presentation decorations without changing exact Markdown", () => {
    const source = "---\r\ntitle: Résumé 🚀\r\n---\r\n# Heading\r\n\r\n$E = mc^2$ and `currency $5`\r\n\r\n$$ E = mc^2 $$\r\n\r\n| A | B |\r\n| - | - |\r\n| 1 | 2 |\r\n";
    let state = EditorState.create({ doc: source, extensions: [EditorState.lineSeparator.of("\r\n"), liveMarkdownExtension({ theme: "light" })] });
    expect(state.sliceDoc()).toBe(source);
    state = state.update({ effects: StateEffect.reconfigure.of([EditorState.lineSeparator.of("\r\n")]) }).state;
    expect(state.sliceDoc()).toBe(source);
    state = state.update({ effects: StateEffect.reconfigure.of([EditorState.lineSeparator.of("\r\n"), liveMarkdownExtension({ theme: "dark" })]) }).state;
    expect(state.sliceDoc()).toBe(source);
  });

  it("does not create empty mark decorations for empty formatting constructs", () => {
    const source = "<u></u> <sup></sup> <sub></sub>\n\n**** ____ ~~~~ `` []()\n";
    expect(() => EditorState.create({ doc: source, extensions: [liveMarkdownExtension({ theme: "light" })] })).not.toThrow();
  });

  it("does not mark an empty final line for an unfinished code fence", () => {
    const source = "# Draft\n\n```text\nwork in progress\n";
    expect(() => EditorState.create({ doc: source, extensions: [liveMarkdownExtension({ theme: "light" })] })).not.toThrow();
  });

  it("preserves escaped, nested, adjacent, and incomplete inline Markdown exactly", () => {
    const source = `${complexInline}\n\n**adjacent****strong** [unfinished](https://example.com ~~open\n`;
    const state = EditorState.create({ doc: source, extensions: [liveMarkdownExtension({ theme: "dark" })] });
    expect(state.sliceDoc()).toBe(source);
  });

  it("preserves escaped characters and HTML code spans while presenting them visually", () => {
    const source = String.raw`Escaped \$40, \*literal\*, <code>inline code</code>, and <summary>safe details</summary>.`;
    const state = EditorState.create({ doc: source, extensions: [liveMarkdownExtension({ theme: "light" })] });
    expect(state.sliceDoc()).toBe(source);
  });

  it("preserves GFM task and table source including escaped pipes and code spans", () => {
    const source = "- [x] Done\n- [ ] Pending\n\n| Name | Value |\n| --- | --- |\n| escaped | a\\|b |\n| code | `a|b` |\n";
    const state = EditorState.create({ doc: source, extensions: [liveMarkdownExtension({ theme: "light" })] });
    expect(state.sliceDoc()).toBe(source);
  });

  it("adds a Markdown table column to every table line", () => {
    const source = "| Name | Value |\r\n| :--- | ---: |\r\n| escaped | a\\|b |";
    expect(appendMarkdownTableColumn(source, "\r\n")).toBe("| Name | Value |  |\r\n| :--- | ---: | --- |\r\n| escaped | a\\|b |  |");
  });

  it("adds a blank Markdown table row with the header width", () => {
    expect(appendMarkdownTableRow("Name | Value |\n--- | --- |\n1 | 2 |", "\n")).toBe("Name | Value |\n--- | --- |\n1 | 2 |\n |  |");
  });

  it("maps rendered table cells back to their exact source text", () => {
    const source = "  | Name | Value |  ";
    const ranges = tableCellSourceRanges(source);
    expect(source.slice(ranges[0].from, ranges[0].to)).toBe("Name");
    expect(source.slice(ranges[1].from, ranges[1].to)).toBe("Value");
  });

  it("keeps escaped pipes and code-span pipes inside their cell", () => {
    const source = "| escaped | a\\|b | `x|y` |";
    const ranges = tableCellSourceRanges(source);
    expect(ranges.map((range) => source.slice(range.from, range.to))).toEqual(["escaped", "a\\|b", "`x|y`"]);
  });

  it("uses a different visual marker for each nested unordered list level", () => {
    expect(markdownListMarker("-", "- top level")).toBe("•");
    expect(markdownListMarker("*", "  * second level")).toBe("◦");
    expect(markdownListMarker("+", "    + third level")).toBe("▪");
    expect(markdownListMarker("-", "\t\t- fourth level")).toBe("▫");
    expect(markdownListMarker("1.", "  1. ordered list")).toBe("1.");
  });

  it("preserves source-backed image width attributes and CRLF line endings", () => {
    const source = "# Gallery\r\n\r\n![Wide diagram](diagram.png) {width=70%}\r\n";
    const state = EditorState.create({
      doc: source,
      extensions: [EditorState.lineSeparator.of("\r\n"), liveMarkdownExtension({ theme: "light" })],
    });
    expect(state.sliceDoc()).toBe(source);
  });

  it("does not require collaboration state to derive local presentation", () => {
    const source = "# Shared\n\nSomeone else can move their cursor without changing this local view.\n";
    const state = EditorState.create({ doc: source, selection: { anchor: 12 }, extensions: [liveMarkdownExtension({ theme: "light" })] });
    expect(state.sliceDoc()).toBe(source);
  });
});
