import { describe, expect, it } from "vitest";

import {
  atomicChangesBetween,
  carryMergeResolutions,
  chooseMergeVersion,
  hasConflictMarkers,
  materializeMergePlan,
  mergePlanAsLocalSnapshot,
  planWorkspaceMerge,
  resolveMergeHunk,
  updateMergeLocal,
  updateMergeResult,
  validateMergePlan,
  type MergeSnapshotFile,
  type WorkspaceMergeSnapshot,
} from "./workspace-merge";

const md = (path: string, content: string, originalPath?: string): MergeSnapshotFile => ({
  path,
  content,
  fileType: "markdown",
  originalPath,
});

const structured = (path: string, content: string, fileType: "canvas" | "drawing" = "canvas", originalPath?: string): MergeSnapshotFile => ({
  path,
  content,
  fileType,
  originalPath,
});

const snapshot = (files: MergeSnapshotFile[], folderMarkers: string[] = []): WorkspaceMergeSnapshot => ({ files, folderMarkers });

describe("planWorkspaceMerge", () => {
  it("accepts one-sided and identical edits deterministically", () => {
    const base = snapshot([md("docs/a.md", "base\n"), md("docs/b.md", "base\n"), md("docs/c.md", "base\n")]);
    const local = snapshot([
      md("docs/a.md", "local\n", "docs/a.md"),
      md("docs/b.md", "base\n", "docs/b.md"),
      md("docs/c.md", "same\n", "docs/c.md"),
    ]);
    const incoming = snapshot([
      md("docs/a.md", "base\n"),
      md("docs/b.md", "github\n"),
      md("docs/c.md", "same\n"),
    ]);

    const result = materializeMergePlan(planWorkspaceMerge(base, local, incoming, ["docs"]));
    expect(Object.fromEntries(result.files.map((file) => [file.path, file.content]))).toEqual({
      "docs/a.md": "local\n",
      "docs/b.md": "github\n",
      "docs/c.md": "same\n",
    });
  });

  it("automatically combines non-overlapping Markdown edits", () => {
    const base = snapshot([md("docs/a.md", "one\ntwo\nthree\n")]);
    const local = snapshot([md("docs/a.md", "ONE\ntwo\nthree\n", "docs/a.md")]);
    const incoming = snapshot([md("docs/a.md", "one\ntwo\nTHREE\n")]);
    const plan = planWorkspaceMerge(base, local, incoming, ["docs"]);

    expect(validateMergePlan(plan)).toEqual([]);
    expect(materializeMergePlan(plan).files[0].content).toBe("ONE\ntwo\nTHREE\n");
  });

  it("creates resolvable hunks for overlapping Markdown edits", () => {
    const base = snapshot([md("docs/a.md", "before\nvalue\nafter\n")]);
    const local = snapshot([md("docs/a.md", "before\nlocal\nafter\n", "docs/a.md")]);
    const incoming = snapshot([md("docs/a.md", "before\ngithub\nafter\n")]);
    const plan = planWorkspaceMerge(base, local, incoming, ["docs"]);
    const item = plan.items[0];

    expect(item.conflictKind).toBe("markdown");
    expect(item.hunks).toHaveLength(1);
    expect(hasConflictMarkers(item.resultContent)).toBe(true);
    const resolved = resolveMergeHunk(item, item.hunks[0].id, "both");
    expect(resolved.resultContent).toContain("local\ngithub\n");
    expect(hasConflictMarkers(resolved.resultContent)).toBe(false);
  });

  it("recomputes the result and conflict hunks after editing Marktwin changes", () => {
    const plan = planWorkspaceMerge(
      snapshot([md("docs/a.md", "title\nbase\n")]),
      snapshot([md("docs/a.md", "title\nlocal\n", "docs/a.md")]),
      snapshot([md("docs/a.md", "title\ngithub\n")]),
      ["docs"],
    );

    const stillConflicted = updateMergeLocal(plan.items[0], "title\nrewritten\n");
    expect(stillConflicted.localContent).toBe("title\nrewritten\n");
    expect(stillConflicted.resolution).toBe("unresolved");
    expect(stillConflicted.hunks[0].local).toBe("rewritten\n");

    const matchesGitHub = updateMergeLocal(stillConflicted, "title\ngithub\n");
    expect(matchesGitHub.resultContent).toBe("title\ngithub\n");
    expect(matchesGitHub.resolution).toBe("manual");
    expect(matchesGitHub.hunks).toEqual([]);
  });

  it("requires choices for add/add and delete/modify", () => {
    const addPlan = planWorkspaceMerge(
      snapshot([]),
      snapshot([md("docs/new.md", "local")]),
      snapshot([md("docs/new.md", "github")]),
      ["docs"],
    );
    expect(addPlan.items[0].conflictKind).toBe("add-add");
    expect(chooseMergeVersion(addPlan.items[0], "incoming").resultContent).toBe("github");

    const deleted = { ...md("docs/a.md", "base", "docs/a.md"), deleted: true };
    const deletePlan = planWorkspaceMerge(
      snapshot([md("docs/a.md", "base")]),
      snapshot([deleted]),
      snapshot([md("docs/a.md", "changed")]),
      ["docs"],
    );
    expect(deletePlan.items[0].conflictKind).toBe("delete-modify");
    expect(chooseMergeVersion(deletePlan.items[0], "local").resultContent).toBeNull();
  });

  it("carries an incoming content edit to a local move destination", () => {
    const plan = planWorkspaceMerge(
      snapshot([md("docs/a.md", "base\n")]),
      snapshot([md("docs/moved.md", "base\n", "docs/a.md")]),
      snapshot([md("docs/a.md", "github\n")]),
      ["docs"],
    );
    expect(validateMergePlan(plan)).toEqual([]);
    expect(materializeMergePlan(plan).files).toMatchObject([{ path: "docs/moved.md", content: "github\n" }]);
  });

  it("preserves deletion identity when a reviewed result is rebased again", () => {
    const base = snapshot([md("docs/a.md", "base")]);
    const firstIncoming = snapshot([md("docs/a.md", "github one")]);
    const firstPlan = planWorkspaceMerge(
      base,
      snapshot([{ ...md("docs/a.md", "base", "docs/a.md"), deleted: true }]),
      firstIncoming,
      ["docs"],
    );
    const reviewedPlan = { ...firstPlan, items: [chooseMergeVersion(firstPlan.items[0], "local")] };
    const reviewedLocal = mergePlanAsLocalSnapshot(reviewedPlan, firstIncoming);
    const rebased = planWorkspaceMerge(firstIncoming, reviewedLocal, snapshot([md("docs/a.md", "github two")]), ["docs"]);

    expect(rebased.items[0].conflictKind).toBe("delete-modify");
    expect(rebased.items[0].localContent).toBeNull();
  });

  it("preserves move identity when a reviewed result is rebased again", () => {
    const base = snapshot([md("docs/a.md", "base\n")]);
    const firstIncoming = snapshot([md("docs/a.md", "github one\n")]);
    const firstPlan = planWorkspaceMerge(
      base,
      snapshot([md("docs/moved.md", "base\n", "docs/a.md")]),
      firstIncoming,
      ["docs"],
    );
    const reviewedLocal = mergePlanAsLocalSnapshot(firstPlan, firstIncoming);
    const rebased = planWorkspaceMerge(firstIncoming, reviewedLocal, snapshot([md("docs/a.md", "github two\n")]), ["docs"]);

    expect(rebased.items[0].resultPath).toBe("docs/moved.md");
    expect(materializeMergePlan(rebased).files[0]).toMatchObject({ path: "docs/moved.md", content: "github two\n" });
  });

  it("marks move destinations that collide with existing or incoming files", () => {
    const plan = planWorkspaceMerge(
      snapshot([md("docs/a.md", "a"), md("docs/taken.md", "taken")]),
      snapshot([md("docs/taken.md", "a", "docs/a.md"), md("docs/taken.md", "taken", "docs/taken.md")]),
      snapshot([md("docs/a.md", "a"), md("docs/taken.md", "taken")]),
      ["docs"],
    );
    expect(plan.items.some((item) => item.conflictKind === "path-collision")).toBe(true);
    expect(validateMergePlan(plan).some((error) => error.includes("duplicate result path"))).toBe(true);
  });

  it("requires a whole-file choice for canvas and drawing edits", () => {
    for (const fileType of ["canvas", "drawing"] as const) {
      const extension = fileType === "canvas" ? "canvas" : "excalidraw";
      const path = `docs/a.${extension}`;
      const plan = planWorkspaceMerge(
        snapshot([structured(path, '{"v":0}', fileType)]),
        snapshot([structured(path, '{"v":1}', fileType, path)]),
        snapshot([structured(path, '{"v":2}', fileType)]),
        ["docs"],
      );
      expect(plan.items[0].conflictKind).toBe("structured");
      expect(validateMergePlan({ ...plan, items: [chooseMergeVersion(plan.items[0], "incoming")] })).toEqual([]);
    }
  });

  it("preserves empty folders through .gitkeep changes", () => {
    const incoming = snapshot([], ["docs/remote-empty"]);
    const result = snapshot([], ["docs/local-empty"]);
    expect(atomicChangesBetween(incoming, result)).toEqual([
      { path: "docs/local-empty/.gitkeep", content: "" },
      { path: "docs/remote-empty/.gitkeep", sha: null },
    ]);
  });

  it("validates paths, extensions, JSON, and manually introduced markers", () => {
    const basePlan = planWorkspaceMerge(snapshot([]), snapshot([md("docs/a.md", "ok")]), snapshot([]), ["docs"]);
    const badPath = { ...basePlan.items[0], resultPath: "../a.md", resolution: "manual" as const };
    expect(validateMergePlan({ ...basePlan, items: [badPath] })[0]).toContain("invalid repository path");

    const invalidJsonPlan = planWorkspaceMerge(snapshot([]), snapshot([structured("docs/a.canvas", "not json")]), snapshot([]), ["docs"]);
    expect(validateMergePlan(invalidJsonPlan)).toContain("docs/a.canvas: invalid JSON");

    const wrongExtension = updateMergeResult(basePlan.items[0], "<<<<<<< something\n", "docs/a.canvas");
    const errors = validateMergePlan({ ...basePlan, items: [wrongExtension] });
    expect(errors.some((error) => error.includes("unresolved conflict"))).toBe(true);
    expect(errors.some((error) => error.includes("extension"))).toBe(true);
  });

  it("preserves empty content, trailing newlines, CRLF, and Unicode", () => {
    const base = snapshot([
      md("docs/empty.md", ""),
      md("docs/crlf.md", "one\r\nmiddle\r\ntwo\r\n"),
      md("docs/unicode.md", "café 🌍\n"),
    ]);
    const local = snapshot([
      md("docs/empty.md", "", "docs/empty.md"),
      md("docs/crlf.md", "ONE\r\nmiddle\r\ntwo\r\n", "docs/crlf.md"),
      md("docs/unicode.md", "café 🌍\nlocal\n", "docs/unicode.md"),
    ]);
    const incoming = snapshot([
      md("docs/empty.md", ""),
      md("docs/crlf.md", "one\r\nmiddle\r\nTWO\r\n"),
      md("docs/unicode.md", "café 🌍\n"),
    ]);
    const result = materializeMergePlan(planWorkspaceMerge(base, local, incoming, ["docs"]));
    const contents = Object.fromEntries(result.files.map((file) => [file.path, file.content]));
    expect(contents["docs/empty.md"]).toBe("");
    expect(contents["docs/crlf.md"]).toBe("ONE\r\nmiddle\r\nTWO\r\n");
    expect(contents["docs/unicode.md"]).toBe("café 🌍\nlocal\n");
  });
});

describe("carryMergeResolutions", () => {
  it("keeps a decision only when the reviewed merge inputs are unchanged", () => {
    const base = snapshot([md("docs/a.md", "base")]);
    const reviewed = planWorkspaceMerge(base, snapshot([md("docs/a.md", "local")]), snapshot([md("docs/a.md", "github")]), ["docs"]);
    const chosen = { ...reviewed, items: [chooseMergeVersion(reviewed.items[0], "local")] };

    const unchanged = planWorkspaceMerge(base, snapshot([md("docs/a.md", "local")]), snapshot([md("docs/a.md", "github")]), ["docs"]);
    expect(carryMergeResolutions(chosen, unchanged).items[0].resolution).toBe("local");

    const changedLive = planWorkspaceMerge(base, snapshot([md("docs/a.md", "newer local")]), snapshot([md("docs/a.md", "github")]), ["docs"]);
    expect(carryMergeResolutions(chosen, changedLive).items[0].resolution).toBe("unresolved");
  });
});
