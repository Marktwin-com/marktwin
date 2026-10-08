import { describe, expect, it } from "vitest";

import type { WorkspaceNote } from "./cabinet-files";
import { canvasFilePreview } from "./canvas-file-preview";

function note(content: string, filename = "release-notes.md"): WorkspaceNote {
  return { id: "note-1", vaultId: 1, filename, path: "docs/", content, fileType: "markdown" };
}

describe("canvas file previews", () => {
  it("uses the first heading and the first content line after it", () => {
    expect(canvasFilePreview(note("# August release\n\n**Faster** collaborative editing.\nMore details."))).toEqual({
      path: "docs/release-notes.md",
      title: "August release",
      excerpt: "Faster collaborative editing.",
    });
  });

  it("uses front matter or the filename when a heading is unavailable", () => {
    expect(canvasFilePreview(note("---\ntitle: 'Launch plan'\n---\n\n- Invite the team"))).toMatchObject({
      title: "Launch plan",
      excerpt: "Invite the team",
    });
    expect(canvasFilePreview(note("First visible line", "ideas.md"))).toMatchObject({
      title: "ideas",
      excerpt: "First visible line",
    });
  });

  it("does not expose structured canvas or drawing JSON as an excerpt", () => {
    const canvas = { ...note('{"nodes":[],"edges":[]}', "board.canvas"), fileType: "canvas" as const };
    expect(canvasFilePreview(canvas)).toMatchObject({ title: "board", excerpt: "" });
  });

  it("renders a saved image file inside its Canvas file node preview", () => {
    const image = { ...note("iVBORw0KGgo=", "diagram.png"), fileType: "image" as const, contentEncoding: "base64" as const };
    expect(canvasFilePreview(image)).toMatchObject({
      path: "docs/diagram.png",
      title: "diagram.png",
      imageSource: "data:image/png;base64,iVBORw0KGgo=",
    });
  });
});
