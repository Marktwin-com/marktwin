import { describe, expect, it } from "vitest";

import type { WorkspaceNote } from "./cabinet-files";
import { FIGURES_FOLDER, isFiguresFolderPath, relativeRepositoryAssetPath, resolveRepositoryImagePath } from "./workspace-images";

const note: WorkspaceNote = {
  id: "note",
  vaultId: 1,
  filename: "readme.md",
  path: "docs/guide/",
  content: "",
  fileType: "markdown",
};

describe("repository image paths", () => {
  it("resolves repository-relative images beside the Markdown document", () => {
    expect(resolveRepositoryImagePath(note, "images/diagram.png?raw=1#preview")).toBe("docs/guide/images/diagram.png");
    expect(resolveRepositoryImagePath({ ...note, path: "/" }, "assets/photo.webp")).toBe("assets/photo.webp");
  });

  it("leaves remote and data images to the browser", () => {
    expect(resolveRepositoryImagePath(note, "https://example.com/image.png")).toBeNull();
    expect(resolveRepositoryImagePath(note, "data:image/png;base64,AA==")).toBeNull();
  });

  it("creates portable links from a note to the default hidden Figures folder", () => {
    expect(relativeRepositoryAssetPath(note, `${FIGURES_FOLDER}/diagram.png`)).toBe("../../.marktwin/figures/diagram.png");
    expect(relativeRepositoryAssetPath({ ...note, path: "/", filename: "readme.md" }, `${FIGURES_FOLDER}/diagram.png`)).toBe(".marktwin/figures/diagram.png");
    expect(isFiguresFolderPath(".agents/.marktwin/figures/diagram.png")).toBe(true);
  });

  it("rejects traversal and malformed encodings", () => {
    expect(() => resolveRepositoryImagePath(note, "../private.png")).toThrow(/traverse/);
    expect(() => resolveRepositoryImagePath(note, "%E0%A4%A")).toThrow(/malformed/);
  });
});
