import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { addWorkspaceFile, collectAtomicChanges, hydrateSelectedScopes, readCabinetNotes } from "./cabinet-files";
import { artifactMetadataPathForScope, formatArtifactMetadata, parseArtifactMetadata } from "./artifact-metadata";

describe("artifact metadata", () => {
  it("reads existing stable IDs without generating metadata changes", () => {
    const metadata = formatArtifactMetadata([{ id: "stable-1", artifactId: "stable-1", vaultId: 1, path: ".agents/", filename: "README.md", content: "# Readme", fileType: "markdown", status: "clean" }]);
    expect(parseArtifactMetadata(metadata)).toEqual([{ id: "stable-1", path: ".agents/README.md" }]);

    const doc = new Y.Doc();
    hydrateSelectedScopes(doc, [{ scope: ".agents", files: [
      { path: ".agents/README.md", name: "README.md", sha: "sha-1", content: "# Readme", fileType: "markdown" },
      { path: artifactMetadataPathForScope(".agents"), name: "ARTIFACTS.md", sha: "sha-2", content: metadata, fileType: "markdown" },
    ], folderMarkers: [] }]);
    expect(readCabinetNotes(doc).find((note) => note.filename === "README.md")?.artifactId).toBe("stable-1");
    addWorkspaceFile(doc, { path: ".agents", filename: "new-note", fileType: "markdown", content: "New" });
    const changes = collectAtomicChanges(doc);
    expect(changes).toEqual([{ path: ".agents/new-note.md", content: "New" }]);
  });
});
