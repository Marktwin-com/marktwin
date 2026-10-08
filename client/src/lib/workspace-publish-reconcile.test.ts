import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  deleteNote,
  getFilesMap,
  hasUnsyncedChanges,
  hydrateSelectedScopes,
  readCabinetNotes,
  setWorkspaceFileContent,
  type ScopeContent,
} from "./cabinet-files";
import { reconcilePublishedWorkspace } from "./workspace-publish-reconcile";

function content(sha: string, first = "one", second = "stable"): ScopeContent[] {
  return [{
    scope: "/",
    files: [
      { path: "note.md", name: "note.md", sha, content: first, fileType: "markdown" },
      { path: "second.md", name: "second.md", sha: `${sha}-second`, content: second, fileType: "markdown" },
    ],
    folderMarkers: [],
  }];
}

function noteId(doc: Y.Doc, filename: string) {
  const note = readCabinetNotes(doc, 0, true).find((candidate) => candidate.filename === filename);
  if (!note) throw new Error(`Missing ${filename}`);
  return note.id;
}

describe("reconcilePublishedWorkspace", () => {
  it("keeps the same Y.Text and preserves a newer edit made during publish", () => {
    const doc = new Y.Doc();
    hydrateSelectedScopes(doc, content("old"));
    const id = noteId(doc, "note.md");
    const ytext = getFilesMap(doc).get(id)?.get("content");

    setWorkspaceFileContent(doc, id, "two");
    // The network request publishes "two". The user keeps typing before it returns.
    setWorkspaceFileContent(doc, id, "three");

    reconcilePublishedWorkspace(doc, content("new", "two"), [{ path: "note.md", content: "two" }]);

    const note = readCabinetNotes(doc, 0, true).find((candidate) => candidate.id === id)!;
    expect(getFilesMap(doc).get(id)?.get("content")).toBe(ytext);
    expect(note.content).toBe("three");
    expect(note.githubSha).toBe("new");
    expect(note.originalPath).toBe("note.md");
    expect(note.status).toBe("modified");
    expect(hasUnsyncedChanges(doc)).toBe(true);
  });

  it("marks the published edit clean without replacing its Y.Text", () => {
    const doc = new Y.Doc();
    hydrateSelectedScopes(doc, content("old"));
    const id = noteId(doc, "note.md");
    const ytext = getFilesMap(doc).get(id)?.get("content");
    setWorkspaceFileContent(doc, id, "two");

    reconcilePublishedWorkspace(doc, content("new", "two"), [{ path: "note.md", content: "two" }]);

    const note = readCabinetNotes(doc, 0, true).find((candidate) => candidate.id === id)!;
    expect(getFilesMap(doc).get(id)?.get("content")).toBe(ytext);
    expect(note.content).toBe("two");
    expect(note.status).toBe("clean");
    expect(note.githubSha).toBe("new");
    expect(hasUnsyncedChanges(doc)).toBe(false);
  });

  it("does not discard a change to another clean file made during publish", () => {
    const doc = new Y.Doc();
    hydrateSelectedScopes(doc, content("old"));
    const first = noteId(doc, "note.md");
    const second = noteId(doc, "second.md");
    setWorkspaceFileContent(doc, first, "two");
    setWorkspaceFileContent(doc, second, "newer local edit");

    reconcilePublishedWorkspace(doc, content("new", "two", "stable"), [{ path: "note.md", content: "two" }]);

    const secondNote = readCabinetNotes(doc, 0, true).find((candidate) => candidate.id === second)!;
    expect(secondNote.content).toBe("newer local edit");
    expect(secondNote.status).toBe("modified");
    expect(hasUnsyncedChanges(doc)).toBe(true);
  });

  it("preserves a local deletion that happens after the published snapshot", () => {
    const doc = new Y.Doc();
    hydrateSelectedScopes(doc, content("old"));
    const id = noteId(doc, "note.md");
    setWorkspaceFileContent(doc, id, "two");
    deleteNote(doc, id);

    reconcilePublishedWorkspace(doc, content("new", "two"), [{ path: "note.md", content: "two" }]);

    const note = readCabinetNotes(doc, 0, true).find((candidate) => candidate.id === id)!;
    expect(note.status).toBe("deleted");
    expect(note.githubSha).toBe("new");
    expect(note.originalPath).toBe("note.md");
  });

  it("preserves newer Markdown when a remote-advanced automatic merge publishes", () => {
    const doc = new Y.Doc();
    hydrateSelectedScopes(doc, content("old", "base"));
    const id = noteId(doc, "note.md");
    const ytext = getFilesMap(doc).get(id)?.get("content");

    // The merge snapshot includes the first local edit plus a remote change.
    setWorkspaceFileContent(doc, id, "local edit used by merge");
    const mergeBaseline = readCabinetNotes(doc, 0, true);
    // The owner keeps typing while the merged commit is in flight.
    setWorkspaceFileContent(doc, id, "newer local edit during merged publish");

    reconcilePublishedWorkspace(
      doc,
      content("merged", "remote change + local edit used by merge"),
      [{ path: "note.md", content: "remote change + local edit used by merge" }],
      mergeBaseline,
    );

    const note = readCabinetNotes(doc, 0, true).find((candidate) => candidate.id === id)!;
    expect(getFilesMap(doc).get(id)?.get("content")).toBe(ytext);
    expect(note.content).toBe("newer local edit during merged publish");
    expect(note.githubSha).toBe("merged");
    expect(note.status).toBe("modified");
    expect(hasUnsyncedChanges(doc)).toBe(true);
  });

  it("applies the reviewed merge result when the local merge input did not change", () => {
    const doc = new Y.Doc();
    hydrateSelectedScopes(doc, content("old", "base"));
    const id = noteId(doc, "note.md");
    const ytext = getFilesMap(doc).get(id)?.get("content");
    setWorkspaceFileContent(doc, id, "local merge input");
    const mergeBaseline = readCabinetNotes(doc, 0, true);

    reconcilePublishedWorkspace(
      doc,
      content("merged", "reviewed incoming result"),
      [{ path: "note.md", content: "reviewed incoming result" }],
      mergeBaseline,
    );

    const note = readCabinetNotes(doc, 0, true).find((candidate) => candidate.id === id)!;
    expect(getFilesMap(doc).get(id)?.get("content")).toBe(ytext);
    expect(note.content).toBe("reviewed incoming result");
    expect(note.githubSha).toBe("merged");
    expect(note.status).toBe("clean");
    expect(hasUnsyncedChanges(doc)).toBe(false);
  });
});
