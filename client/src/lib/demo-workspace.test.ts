import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { hydrateSelectedScopes, readCabinetNotes } from "./cabinet-files";
import {
  createBundledDemoScopes,
  createDemoCheckpointScopes,
  createScenarioDemoScopes,
  DEMO_SCENARIOS,
  DEMO_WORKSPACE_SCOPES,
  LEGACY_DEMO_PROJECT_BOARD,
  PROJECT_BOARD,
  migrateLegacyDemoScopes,
} from "./demo-workspace";

describe("bundled demo workspace", () => {
  it("seeds each validation scenario with Markdown context and a Canvas", () => {
    for (const scenario of DEMO_SCENARIOS) {
      const files = createScenarioDemoScopes(scenario.id).flatMap((scope) => scope.files);
      expect(files.some((file) => file.fileType === "markdown")).toBe(true);
      expect(files.some((file) => file.fileType === "canvas")).toBe(true);
      expect(files.every((file) => file.sha.startsWith("demo-v"))).toBe(true);
    }
  });

  it("contains documentation plus every editable workspace format", () => {
    const scopes = createBundledDemoScopes();
    const files = scopes.flatMap((scope) => scope.files);
    const paths = files.map((file) => file.path);

    expect(new Set(paths).size).toBe(paths.length);
    expect(new Set(files.map((file) => file.fileType))).toEqual(new Set(["markdown", "canvas", "drawing"]));
    expect(paths).toContain("README.md");
    expect(paths.some((path) => path.startsWith(".marktwin/"))).toBe(false);
    expect(paths).toContain("examples/PROJECT-BOARD.canvas");
    expect(paths).toContain("examples/TEAM-SKETCH.excalidraw");
    expect(files.find((file) => file.path === "README.md")?.content).toContain("safe place to try");
  });

  it("returns a fresh seed and hydrates all files as a clean working tree", () => {
    const first = createBundledDemoScopes();
    const second = createBundledDemoScopes();
    expect(first).not.toBe(second);
    expect(first[0].files).not.toBe(second[0].files);

    const doc = new Y.Doc();
    hydrateSelectedScopes(doc, first);
    const notes = readCabinetNotes(doc);
    expect(notes).toHaveLength(first.flatMap((scope) => scope.files).length);
    expect(notes.every((note) => note.status === "clean")).toBe(true);

    const checkpoint = createDemoCheckpointScopes(notes, [], DEMO_WORKSPACE_SCOPES);
    expect(checkpoint.flatMap((scope) => scope.files).map((file) => file.path).sort())
      .toEqual(first.flatMap((scope) => scope.files).map((file) => file.path).sort());
    doc.destroy();
  });

  it("ships valid JSON for the canvas and drawing examples", () => {
    const files = createBundledDemoScopes().flatMap((scope) => scope.files);
    const canvas = JSON.parse(files.find((file) => file.fileType === "canvas")!.content);
    const drawing = JSON.parse(files.find((file) => file.fileType === "drawing")!.content);

    expect(canvas.nodes.length).toBeGreaterThan(2);
    expect(canvas.edges.length).toBeGreaterThan(0);
    expect(canvas.nodes.filter((node: { type: string }) => node.type === "group")).toHaveLength(2);
    expect(canvas.nodes.filter((node: { type: string; marktwinColumnId?: string }) => node.type !== "group")
      .every((node: { marktwinColumnId?: string }) => Boolean(node.marktwinColumnId))).toBe(true);
    expect(drawing.type).toBe("excalidraw");
    expect(drawing.elements.length).toBeGreaterThan(0);
  });

  it("migrates only the untouched legacy canvas seed", () => {
    const legacy = createBundledDemoScopes();
    const board = legacy.flatMap((scope) => scope.files).find((file) => file.path === "examples/PROJECT-BOARD.canvas")!;
    board.content = LEGACY_DEMO_PROJECT_BOARD;

    const migrated = migrateLegacyDemoScopes(legacy);
    expect(migrated.flatMap((scope) => scope.files).find((file) => file.path === board.path)?.content).toBe(PROJECT_BOARD);

    board.content = `${LEGACY_DEMO_PROJECT_BOARD}\nvisitor edit`;
    expect(migrateLegacyDemoScopes(legacy).flatMap((scope) => scope.files).find((file) => file.path === board.path)?.content)
      .toBe(board.content);
  });
});
