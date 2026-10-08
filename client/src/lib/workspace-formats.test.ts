import { describe, expect, it } from "vitest";
import { normalizeWorkspaceFilename } from "./cabinet-files";
import { alwaysAvailableWorkspaceFileTypes, parseCanvas, serializeCanvas } from "./workspace-formats";
import { workspaceFileTypeForPath } from "./workspace-github";
import { textEditorLanguageForPath } from "./text-editor-language";
import { isMarkdownPath, textDocumentKindForPath } from "./text-files";

describe("workspace formats", () => {
  it("keeps Text, Canvas, and Excalidraw available for every legacy Cabinet configuration", () => {
    expect(alwaysAvailableWorkspaceFileTypes(null)).toEqual(["markdown", "canvas", "drawing"]);
    expect(alwaysAvailableWorkspaceFileTypes([])).toEqual(["markdown", "canvas", "drawing"]);
    expect(alwaysAvailableWorkspaceFileTypes(["markdown"])).toEqual(["markdown", "canvas", "drawing"]);
    expect(alwaysAvailableWorkspaceFileTypes(["markdown", "image", "image", "asset"])).toEqual([
      "markdown",
      "canvas",
      "drawing",
      "image",
      "asset",
    ]);
  });

  it("detects every managed open format", () => {
    expect(workspaceFileTypeForPath("notes/a.md")).toBe("markdown");
    expect(workspaceFileTypeForPath("notes/readme.markdown")).toBe("markdown");
    expect(workspaceFileTypeForPath("notes/plain.txt")).toBe("markdown");
    expect(workspaceFileTypeForPath("notes/plain.text")).toBe("markdown");
    expect(workspaceFileTypeForPath("config/agent.yaml")).toBe("markdown");
    expect(workspaceFileTypeForPath("config/agent.yml")).toBe("markdown");
    expect(workspaceFileTypeForPath("papers/article.tex")).toBe("markdown");
    expect(workspaceFileTypeForPath("config/settings.toml")).toBe("markdown");
    expect(workspaceFileTypeForPath("boards/roadmap.canvas")).toBe("canvas");
    expect(workspaceFileTypeForPath("drawings/idea.excalidraw")).toBe("drawing");
    expect(workspaceFileTypeForPath("assets/photo.png")).toBe("image");
  });

  it("keeps Markdown distinct while grouping supported documents under Text", () => {
    expect(isMarkdownPath("README.MD")).toBe(true);
    expect(isMarkdownPath("notes.txt")).toBe(false);
    expect(textDocumentKindForPath("workflow.yaml")).toBe("yaml");
    expect(textDocumentKindForPath("paper.tex")).toBe("tex");
    expect(textDocumentKindForPath("notes.txt")).toBe("plain");
  });

  it("defaults extensionless text files to Markdown and preserves explicit text extensions", () => {
    expect(normalizeWorkspaceFilename("new-file", "markdown")).toBe("new-file.md");
    expect(normalizeWorkspaceFilename("new-file.txt", "markdown")).toBe("new-file.txt");
    expect(normalizeWorkspaceFilename("workflow.yaml", "markdown")).toBe("workflow.yaml");
    expect(normalizeWorkspaceFilename("paper.tex", "markdown")).toBe("paper.tex");
    expect(() => normalizeWorkspaceFilename("script.exe", "markdown")).toThrow("supported text extension");
  });

  it("loads syntax-aware editor support for structured text formats", () => {
    expect(textEditorLanguageForPath("README.md")).toHaveLength(1);
    expect(textEditorLanguageForPath("workflow.yaml")).toHaveLength(1);
    expect(textEditorLanguageForPath("package.json")).toHaveLength(1);
    expect(textEditorLanguageForPath("paper.tex")).toHaveLength(1);
    expect(textEditorLanguageForPath("settings.toml")).toHaveLength(1);
    expect(textEditorLanguageForPath("notes.txt")).toEqual([]);
  });

  it("round-trips unknown valid JSON Canvas fields", () => {
    const source = { nodes: [{ id: "n1", type: "text" as const, x: 1, y: 2, width: 200, height: 100, text: "Hi", future: true }], edges: [], extension: { version: 1 } };
    expect(parseCanvas(serializeCanvas(source))).toEqual(source);
  });
});
