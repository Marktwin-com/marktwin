import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { foldEffect } from "@codemirror/language";
import { markdownSectionFolding, markdownSectionRange } from "./markdown-section-folding";

describe("visual Markdown section folding", () => {
  const document = "# One\nintro\n## Nested\ndetail\n### Deeper\nmore\n## Peer\npeer body\n# Two\nend";

  it("folds a heading through nested headings but stops at its next peer", () => {
    const state = EditorState.create({ doc: document });
    const first = markdownSectionRange(state, state.doc.line(1).from);
    const nested = markdownSectionRange(state, state.doc.line(3).from);

    expect(state.sliceDoc(first!.from, first!.to)).toContain("## Nested");
    expect(state.sliceDoc(first!.from, first!.to)).not.toContain("# Two");
    expect(state.sliceDoc(nested!.from, nested!.to)).toContain("### Deeper");
    expect(state.sliceDoc(nested!.from, nested!.to)).not.toContain("## Peer");
  });

  it("does not offer a fold for an empty section", () => {
    const state = EditorState.create({ doc: "# Empty\n# Next\nbody" });
    expect(markdownSectionRange(state, 0)).toBeNull();
  });

  it("folding changes only view state, never Markdown source", () => {
    const state = EditorState.create({ doc: document, extensions: [markdownSectionFolding()] });
    const range = markdownSectionRange(state, 0)!;
    const folded = state.update({ effects: foldEffect.of(range) }).state;
    expect(folded.sliceDoc()).toBe(document);
  });
});
