import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { addWorkspaceFile, collectAtomicChanges, createFolder, findPublishedChangeReloadMismatches, fullNotePath, getFilesMap, hydrateSelectedScopes, pathBelongsToScope, readCabinetNotes, renameNote, restoreCabinetSnapshot, scopeToSelectForCreatedFolder, setWorkspaceFileContent, updateArtifactReferences, updateWorkspaceDrawingElements } from "./cabinet-files";
import { parseCanvas, serializeCanvas } from "./workspace-formats";

describe("typed cabinet files", () => {
  it("blocks an incomplete post-sync reload before it can replace the live workspace", () => {
    const changes = [
      { path: "project-notes/questions.md", content: "saved content" },
      { path: "project-notes/.gitkeep", content: "" },
    ];
    expect(findPublishedChangeReloadMismatches([{ scope: "/", files: [], folderMarkers: [] }], changes))
      .toEqual(["project-notes/questions.md"]);
    expect(findPublishedChangeReloadMismatches([{
      scope: "/",
      files: [{ path: "project-notes/questions.md", name: "questions.md", sha: "blob", content: "saved content", fileType: "markdown" }],
      folderMarkers: [],
    }], changes)).toEqual([]);
  });

  it("deduplicates a GitHub file returned by overlapping scope snapshots", () => {
    const doc = new Y.Doc();
    const file = { path: "notes/idea.md", name: "idea.md", sha: "same-sha", content: "# Idea", fileType: "markdown" as const };

    hydrateSelectedScopes(doc, [
      { scope: "notes", files: [file], folderMarkers: [] },
      { scope: "notes/archive", files: [file], folderMarkers: [] },
    ]);

    expect(getFilesMap(doc).size).toBe(1);
    expect(readCabinetNotes(doc).map((note) => fullNotePath(note))).toEqual(["notes/idea.md"]);
  });

  it("does not mutate a live cabinet when hydration contains malformed structured content", () => {
    const doc = new Y.Doc();
    addWorkspaceFile(doc, { path: "/", filename: "safe.md", content: "keep me" });
    const before = Array.from(Y.encodeStateAsUpdate(doc));

    expect(() => hydrateSelectedScopes(doc, [{
      scope: "/",
      files: [
        { path: "valid.md", name: "valid.md", sha: "one", content: "valid", fileType: "markdown" },
        { path: "broken.canvas", name: "broken.canvas", sha: "two", content: "{not json", fileType: "canvas" },
      ],
      folderMarkers: [],
    }])).toThrow();

    expect(Array.from(Y.encodeStateAsUpdate(doc))).toEqual(before);
    expect(readCabinetNotes(doc).map((note) => note.filename)).toEqual(["safe.md"]);
  });

  it("does not clear a live cabinet when restoring a malformed recovery snapshot", () => {
    const doc = new Y.Doc();
    addWorkspaceFile(doc, { path: "/", filename: "safe.md", content: "keep me" });
    const malformed = new Y.Doc();
    addWorkspaceFile(malformed, { path: "/", filename: "broken.md", fileType: "markdown", content: "{not json" });
    const malformedMap = Array.from(getFilesMap(malformed).values())[0];
    malformedMap.set("filename", "broken.canvas");
    malformedMap.set("fileType", "canvas");
    const before = Array.from(Y.encodeStateAsUpdate(doc));

    expect(() => restoreCabinetSnapshot(doc, malformed)).toThrow();
    expect(Array.from(Y.encodeStateAsUpdate(doc))).toEqual(before);
    expect(readCabinetNotes(doc).map((note) => note.filename)).toEqual(["safe.md"]);
  });

  it("creates and stages Markdown, Canvas, and Excalidraw as text Git blobs", () => {
    const doc = new Y.Doc();
    addWorkspaceFile(doc, { path: "notes", filename: "idea", fileType: "markdown", content: "# Idea" });
    addWorkspaceFile(doc, { path: "boards", filename: "roadmap", fileType: "canvas" });
    addWorkspaceFile(doc, { path: "drawings", filename: "sketch", fileType: "drawing" });

    expect(readCabinetNotes(doc).map((file) => [fullNotePath(file), file.fileType])).toEqual([
      ["boards/roadmap.canvas", "canvas"],
      ["drawings/sketch.excalidraw", "drawing"],
      ["notes/idea.md", "markdown"],
    ]);
    expect(collectAtomicChanges(doc)).toHaveLength(3);
    expect(collectAtomicChanges(doc).some((change) => change.path.startsWith(".marktwin/"))).toBe(false);
  });

  it("keeps dropped images as binary cabinet files and stages base64 Git blobs", () => {
    const doc = new Y.Doc();
    addWorkspaceFile(doc, { path: ".marktwin/figures", filename: "photo.png", fileType: "image", content: "iVBORw0KGgo=", contentEncoding: "base64" });

    expect(readCabinetNotes(doc)[0]).toMatchObject({
      filename: "photo.png",
      path: ".marktwin/figures/",
      fileType: "image",
      content: "iVBORw0KGgo=",
      contentEncoding: "base64",
    });
    expect(collectAtomicChanges(doc)).toEqual([{
      path: ".marktwin/figures/photo.png",
      content: "iVBORw0KGgo=",
      contentEncoding: "base64",
    }]);
  });

  it("keeps imported assets as base64 cabinet files and stages their bytes", () => {
    const doc = new Y.Doc();
    addWorkspaceFile(doc, { path: "media", filename: "clip.mp4", fileType: "asset", content: "AAECAw==", contentEncoding: "base64" });

    expect(readCabinetNotes(doc)[0]).toMatchObject({
      filename: "clip.mp4",
      path: "media/",
      fileType: "asset",
      content: "AAECAw==",
      contentEncoding: "base64",
    });
    expect(collectAtomicChanges(doc)).toEqual([{
      path: "media/clip.mp4",
      content: "AAECAw==",
      contentEncoding: "base64",
    }]);
  });

  it("preserves the required extension when renaming", () => {
    const doc = new Y.Doc();
    const id = addWorkspaceFile(doc, { path: "/", filename: "plan", fileType: "canvas" });
    renameNote(doc, id, "updated");
    expect(readCabinetNotes(doc)[0].filename).toBe("updated.canvas");
  });

  it("stages an empty folder as a Git-compatible marker", () => {
    const doc = new Y.Doc();
    createFolder(doc, "notes/new-folder");
    expect(collectAtomicChanges(doc)).toEqual([{ path: "notes/new-folder/.gitkeep", content: "" }]);
  });

  it("allows folders at any depth when the repository root is selected", () => {
    expect(pathBelongsToScope("notes/new-folder/.gitkeep", "/")).toBe(true);
    expect(pathBelongsToScope("notes/new-folder/idea.md", "/")).toBe(true);
    expect(pathBelongsToScope("notes/new-folder/idea.md", "notes")).toBe(true);
    expect(pathBelongsToScope("other/idea.md", "notes")).toBe(false);
  });

  it("selects a newly created top-level folder for the next repository load", () => {
    expect(scopeToSelectForCreatedFolder("notes", ["/"])).toBe("notes");
    expect(scopeToSelectForCreatedFolder("notes/new-folder", ["/"])).toBe("notes");
    expect(scopeToSelectForCreatedFolder("notes/new-folder", ["notes"])).toBeNull();
    expect(scopeToSelectForCreatedFolder("other", ["/", "notes"])).toBe("other");
  });

  it("repairs known Canvas and Markdown references while preserving anchors", () => {
    const doc = new Y.Doc();
    const targetId = addWorkspaceFile(doc, { path: "notes", filename: "plan", fileType: "markdown", content: "# Plan" });
    addWorkspaceFile(doc, { path: "/", filename: "index", fileType: "markdown", content: "[Plan](notes/plan.md#next)" });
    addWorkspaceFile(doc, { path: "/", filename: "board", fileType: "canvas", content: serializeCanvas({ nodes: [{ id: "card", type: "file", x: 0, y: 0, width: 100, height: 80, file: "notes/plan.md" }], edges: [] }) });
    const target = readCabinetNotes(doc).find((note) => note.id === targetId)!;
    renameNote(doc, targetId, "decision-plan");
    updateArtifactReferences(doc, target.artifactId || target.id, "notes/plan.md", "notes/decision-plan.md");
    expect(readCabinetNotes(doc).find((note) => note.filename === "index.md")?.content).toContain("[Plan](notes/decision-plan.md#next)");
    expect(parseCanvas(readCabinetNotes(doc).find((note) => note.filename === "board.canvas")!.content).nodes[0].file).toBe("notes/decision-plan.md");
  });

  it("merges independent canvas node edits by stable Yjs IDs", () => {
    const base = new Y.Doc();
    const id = addWorkspaceFile(base, {
      path: "/",
      filename: "team.canvas",
      fileType: "canvas",
      content: serializeCanvas({
        nodes: [
          { id: "one", type: "text", x: 0, y: 0, width: 100, height: 80, text: "One" },
          { id: "two", type: "text", x: 200, y: 0, width: 100, height: 80, text: "Two" },
        ],
        edges: [],
      }),
    });
    const baseUpdate = Y.encodeStateAsUpdate(base);
    const left = new Y.Doc();
    const right = new Y.Doc();
    Y.applyUpdate(left, baseUpdate);
    Y.applyUpdate(right, baseUpdate);

    const leftCanvas = parseCanvas(readCabinetNotes(left)[0].content);
    leftCanvas.nodes.find((node) => node.id === "one")!.text = "Changed left";
    setWorkspaceFileContent(left, id, serializeCanvas(leftCanvas));
    const rightCanvas = parseCanvas(readCabinetNotes(right)[0].content);
    rightCanvas.nodes.find((node) => node.id === "two")!.text = "Changed right";
    setWorkspaceFileContent(right, id, serializeCanvas(rightCanvas));

    Y.applyUpdate(base, Y.encodeStateAsUpdate(left));
    Y.applyUpdate(base, Y.encodeStateAsUpdate(right));
    const merged = parseCanvas(readCabinetNotes(base)[0].content);
    expect(merged.nodes.map((node) => node.text)).toEqual(["Changed left", "Changed right"]);
  });

  it("merges simultaneous Excalidraw additions by stable element IDs", () => {
    const base = new Y.Doc();
    const id = addWorkspaceFile(base, { path: "/", filename: "team", fileType: "drawing" });
    const baseUpdate = Y.encodeStateAsUpdate(base);
    const left = new Y.Doc();
    const right = new Y.Doc();
    Y.applyUpdate(left, baseUpdate);
    Y.applyUpdate(right, baseUpdate);

    const leftElement = { id: "left-shape", type: "rectangle", version: 1, isDeleted: false };
    const rightElement = { id: "right-arrow", type: "arrow", version: 1, isDeleted: false };
    updateWorkspaceDrawingElements(left, id, [leftElement], new Set([leftElement.id]), { viewBackgroundColor: "#ffffff" });
    updateWorkspaceDrawingElements(right, id, [rightElement], new Set([rightElement.id]), { viewBackgroundColor: "#ffffff" });

    Y.applyUpdate(base, Y.encodeStateAsUpdate(left));
    Y.applyUpdate(base, Y.encodeStateAsUpdate(right));
    const merged = JSON.parse(readCabinetNotes(base)[0].content) as { elements: Array<{ id: string }> };
    expect(merged.elements.map((element) => element.id).sort()).toEqual(["left-shape", "right-arrow"]);
    expect(merged.elements.every((element) => !("element" in element))).toBe(true);
  });

  it("persists Excalidraw image data with its image element", () => {
    const doc = new Y.Doc();
    const id = addWorkspaceFile(doc, { path: "/", filename: "images", fileType: "drawing" });
    const image = { id: "image-element", type: "image", fileId: "binary-one", version: 1, isDeleted: false };
    const binary = { id: "binary-one", mimeType: "image/png", dataURL: "data:image/png;base64,aW1hZ2U=", created: 1 };

    updateWorkspaceDrawingElements(
      doc,
      id,
      [image],
      new Set([image.id]),
      { viewBackgroundColor: "#ffffff" },
      { [binary.id]: binary },
      new Set([binary.id]),
    );

    const drawing = JSON.parse(readCabinetNotes(doc)[0].content) as {
      elements: Array<{ id: string; fileId: string }>;
      files: Record<string, { dataURL: string }>;
    };
    expect(drawing.elements[0]).toMatchObject({ id: image.id, fileId: binary.id });
    expect(drawing.files[binary.id].dataURL).toBe(binary.dataURL);
    const published = collectAtomicChanges(doc).find((change) => change.path === "images.excalidraw");
    expect(published).toBeDefined();
    expect((JSON.parse(published!.content!) as { files: Record<string, { dataURL: string }> }).files[binary.id].dataURL).toBe(binary.dataURL);
  });

  it("merges images inserted simultaneously by different collaborators", () => {
    const base = new Y.Doc();
    const id = addWorkspaceFile(base, { path: "/", filename: "shared-images", fileType: "drawing" });
    const baseUpdate = Y.encodeStateAsUpdate(base);
    const left = new Y.Doc();
    const right = new Y.Doc();
    Y.applyUpdate(left, baseUpdate);
    Y.applyUpdate(right, baseUpdate);

    const leftElement = { id: "left-image", type: "image", fileId: "left-file", version: 1, isDeleted: false };
    const rightElement = { id: "right-image", type: "image", fileId: "right-file", version: 1, isDeleted: false };
    const leftFile = { id: "left-file", mimeType: "image/png", dataURL: "data:image/png;base64,bGVmdA==", created: 1 };
    const rightFile = { id: "right-file", mimeType: "image/jpeg", dataURL: "data:image/jpeg;base64,cmlnaHQ=", created: 2 };
    updateWorkspaceDrawingElements(left, id, [leftElement], new Set([leftElement.id]), {}, { [leftFile.id]: leftFile }, new Set([leftFile.id]));
    updateWorkspaceDrawingElements(right, id, [rightElement], new Set([rightElement.id]), {}, { [rightFile.id]: rightFile }, new Set([rightFile.id]));

    Y.applyUpdate(base, Y.encodeStateAsUpdate(left));
    Y.applyUpdate(base, Y.encodeStateAsUpdate(right));
    const merged = JSON.parse(readCabinetNotes(base)[0].content) as {
      elements: Array<{ id: string }>;
      files: Record<string, { dataURL: string }>;
    };
    expect(merged.elements.map((element) => element.id).sort()).toEqual(["left-image", "right-image"]);
    expect(Object.keys(merged.files).sort()).toEqual(["left-file", "right-file"]);
    expect(merged.files["left-file"].dataURL).toBe(leftFile.dataURL);
    expect(merged.files["right-file"].dataURL).toBe(rightFile.dataURL);
  });

  it("keeps Excalidraw deletion tombstones while another collaborator adds a shape", () => {
    const original = {
      type: "excalidraw",
      version: 2,
      source: "marktwin",
      elements: [{ id: "existing", type: "ellipse", version: 1, isDeleted: false }],
      appState: {},
      files: {},
    };
    const base = new Y.Doc();
    const id = addWorkspaceFile(base, {
      path: "/",
      filename: "team",
      fileType: "drawing",
      content: `${JSON.stringify(original)}\n`,
    });
    const baseUpdate = Y.encodeStateAsUpdate(base);
    const left = new Y.Doc();
    const right = new Y.Doc();
    Y.applyUpdate(left, baseUpdate);
    Y.applyUpdate(right, baseUpdate);

    const deleted = { ...original.elements[0], version: 2, isDeleted: true };
    const added = { id: "new", type: "line", version: 1, isDeleted: false };
    updateWorkspaceDrawingElements(left, id, [deleted], new Set([deleted.id]), {});
    updateWorkspaceDrawingElements(right, id, [original.elements[0], added], new Set([added.id]), {});

    Y.applyUpdate(base, Y.encodeStateAsUpdate(left));
    Y.applyUpdate(base, Y.encodeStateAsUpdate(right));
    const merged = JSON.parse(readCabinetNotes(base)[0].content) as { elements: Array<{ id: string; isDeleted: boolean }> };
    expect(merged.elements.find((element) => element.id === "existing")?.isDeleted).toBe(true);
    expect(merged.elements.find((element) => element.id === "new")?.isDeleted).toBe(false);
  });
});
