import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";

import {
  addMarkdownNote,
  assertWorkspaceWithinScopes,
  collectAtomicChanges,
  createFolder,
  deleteNote,
  describeWorkspaceChanges,
  discardWorkspaceChange,
  discardWorkspaceChanges,
  fullNotePath,
  hydrateSelectedScopes,
  joinFolderPath,
  markNoteModified,
  mergeScopeContent,
  moveNote,
  moveFolder,
  normalizeDirectoryPath,
  normalizeMarkdownFilename,
  normalizeRepositoryPath,
  readCabinetNotes,
  removeCleanScope,
  renameNote,
  scopeHasUnsyncedChanges,
} from "../client/src/lib/cabinet-files.ts";
import { defaultRootScopes, type GitHubRootScope } from "../client/src/lib/workspace-github.ts";

test("path normalization rejects traversal and normalizes Markdown names", () => {
  assert.equal(normalizeRepositoryPath("/.agents/rules/"), ".agents/rules");
  assert.equal(normalizeDirectoryPath(".agents/rules"), ".agents/rules/");
  assert.equal(normalizeMarkdownFilename("SKILL"), "SKILL.md");
  assert.throws(() => normalizeRepositoryPath(".agents/../secrets"), /cannot contain/);
  assert.throws(() => normalizeMarkdownFilename("nested/file.md"), /slashes/);
  assert.equal(normalizeMarkdownFilename("rules.txt"), "rules.txt");
  assert.throws(() => joinFolderPath(".agents", "nested/folder"), /slashes/);
});

test(".agents is preferred and main path is the fallback root scope", () => {
  const scopes: GitHubRootScope[] = [
    { key: "/", label: "Main path", kind: "root", sha: "root" },
    { key: "docs", label: "docs", kind: "folder", sha: "docs" },
    { key: ".agents", label: ".agents", kind: "folder", sha: "agents" },
  ];
  assert.deepEqual(defaultRootScopes(scopes), [".agents"]);
  assert.deepEqual(defaultRootScopes(scopes.filter((scope) => scope.key !== ".agents")), ["/"]);
});

test("empty and non-empty new Markdown files are staged explicitly", () => {
  const doc = new Y.Doc();
  const emptyId = addMarkdownNote(doc, { filename: "EMPTY.md", path: ".agents", content: "" });
  addMarkdownNote(doc, { filename: "SKILL.md", path: ".agents", content: "# Skill\n" });
  const notes = readCabinetNotes(doc);
  assert.equal(typeof emptyId, "string");
  assert.equal(notes.length, 2);
  assert.deepEqual(collectAtomicChanges(doc), [
    { path: ".agents/EMPTY.md", content: "" },
    { path: ".agents/SKILL.md", content: "# Skill\n" },
  ]);
});

test("loaded empty files can be modified without being mistaken for new files", () => {
  const doc = new Y.Doc();
  hydrateSelectedScopes(doc, [{
    scope: ".agents",
    files: [{ path: ".agents/EMPTY.md", name: "EMPTY.md", sha: "sha-empty", content: "" }],
    folderMarkers: [],
  }]);
  const note = readCabinetNotes(doc)[0];
  assert.equal(note.status, "clean");
  assert.deepEqual(collectAtomicChanges(doc), []);
  markNoteModified(doc, note.id);
  assert.deepEqual(collectAtomicChanges(doc), [{ path: ".agents/EMPTY.md", content: "" }]);
});

test("rename, move, and delete produce atomic tree entries", () => {
  const doc = new Y.Doc();
  hydrateSelectedScopes(doc, [{
    scope: ".agents",
    files: [{ path: ".agents/AGENTS.md", name: "AGENTS.md", sha: "sha-agent", content: "rules" }],
    folderMarkers: [],
  }]);
  const note = readCabinetNotes(doc)[0];
  renameNote(doc, note.id, "RULES.md");
  moveNote(doc, note.id, "docs/");
  assert.deepEqual(collectAtomicChanges(doc), [
    { path: ".agents/AGENTS.md", sha: null },
    { path: "docs/RULES.md", content: "rules" },
  ]);
  deleteNote(doc, note.id);
  assert.deepEqual(collectAtomicChanges(doc), [{ path: ".agents/AGENTS.md", sha: null }]);
});

test("empty folders stage hidden markers and remove them when Markdown is added", () => {
  const doc = new Y.Doc();
  createFolder(doc, ".agents/new-skill");
  assert.deepEqual(collectAtomicChanges(doc), [{ path: ".agents/new-skill/.gitkeep", content: "" }]);
  addMarkdownNote(doc, { filename: "SKILL.md", path: ".agents/new-skill", content: "# New" });
  assert.deepEqual(collectAtomicChanges(doc), [{ path: ".agents/new-skill/SKILL.md", content: "# New" }]);

  const hydrated = new Y.Doc();
  hydrateSelectedScopes(hydrated, [{
    scope: ".agents",
    files: [],
    folderMarkers: [".agents/existing"],
  }]);
  addMarkdownNote(hydrated, { filename: "README.md", path: ".agents/existing", content: "hello" });
  assert.deepEqual(collectAtomicChanges(hydrated), [
    { path: ".agents/existing/.gitkeep", sha: null },
    { path: ".agents/existing/README.md", content: "hello" },
  ]);
});

test("dirty scopes cannot be unloaded", () => {
  const doc = new Y.Doc();
  const id = addMarkdownNote(doc, { filename: "AGENTS.md", path: ".agents" });
  assert.equal(scopeHasUnsyncedChanges(doc, ".agents"), true);
  assert.equal(scopeHasUnsyncedChanges(doc, "/"), true);
  assert.equal(fullNotePath(readCabinetNotes(doc).find((note) => note.id === id)!), ".agents/AGENTS.md");
  assert.throws(() => removeCleanScope(doc, ".agents"), /Sync or discard/);
});

test("scope additions and removals reconcile clean files", () => {
  const doc = new Y.Doc();
  hydrateSelectedScopes(doc, [{
    scope: ".agents",
    files: [{ path: ".agents/AGENTS.md", name: "AGENTS.md", sha: "agents-sha", content: "rules" }],
    folderMarkers: [],
  }]);
  mergeScopeContent(doc, {
    scope: "docs",
    files: [{ path: "docs/README.md", name: "README.md", sha: "docs-sha", content: "docs" }],
    folderMarkers: [],
  });
  assert.deepEqual(readCabinetNotes(doc).map(fullNotePath), [".agents/AGENTS.md", "docs/README.md"]);
  removeCleanScope(doc, "docs");
  assert.deepEqual(readCabinetNotes(doc).map(fullNotePath), [".agents/AGENTS.md"]);
});

test("folder moves reject ambiguous existing destinations", () => {
  const doc = new Y.Doc();
  createFolder(doc, ".agents/source");
  createFolder(doc, ".agents/destination/source");
  assert.throws(() => moveFolder(doc, ".agents/source", ".agents/destination/source"), /already exists/);
});

test("owner scope validation rejects crafted current and original paths", () => {
  const doc = new Y.Doc();
  hydrateSelectedScopes(doc, [{
    scope: ".agents",
    files: [{ path: ".agents/AGENTS.md", name: "AGENTS.md", sha: "sha", content: "rules" }],
    folderMarkers: [],
  }]);
  const note = readCabinetNotes(doc)[0];
  moveNote(doc, note.id, "secrets");
  assert.throws(() => assertWorkspaceWithinScopes(doc, [".agents"]), /outside the shared workspace scopes.*secrets\/AGENTS.md/);
  assert.doesNotThrow(() => assertWorkspaceWithinScopes(doc, [".agents", "secrets"]));
});

test("per-file and all-workspace discard restore the GitHub baseline", () => {
  const baseline = [{
    scope: ".agents",
    files: [{ path: ".agents/AGENTS.md", name: "AGENTS.md", sha: "sha", content: "original" }],
    folderMarkers: [".agents/empty"],
  }];
  const doc = new Y.Doc();
  hydrateSelectedScopes(doc, baseline);
  const original = readCabinetNotes(doc)[0];
  renameNote(doc, original.id, "RULES.md");
  const addedId = addMarkdownNote(doc, { filename: "NEW.md", path: ".agents", content: "new" });
  createFolder(doc, ".agents/new-folder");

  const changes = describeWorkspaceChanges(doc, baseline);
  assert.equal(changes.find((change) => change.fileId === original.id)?.kind, "moved");
  assert.equal(changes.find((change) => change.fileId === addedId)?.kind, "added");
  assert.equal(changes.some((change) => change.path === ".agents/new-folder/.gitkeep"), true);
  discardWorkspaceChange(doc, changes.find((change) => change.fileId === original.id)!, baseline);
  discardWorkspaceChange(doc, changes.find((change) => change.fileId === addedId)!, baseline);
  assert.deepEqual(readCabinetNotes(doc).map(fullNotePath), [".agents/AGENTS.md"]);

  addMarkdownNote(doc, { filename: "ANOTHER.md", path: ".agents", content: "draft" });
  discardWorkspaceChanges(doc, baseline);
  assert.deepEqual(readCabinetNotes(doc).map((note) => [fullNotePath(note), note.content, note.status]), [[".agents/AGENTS.md", "original", "clean"]]);
  assert.deepEqual(collectAtomicChanges(doc), []);
});

test("Yjs propagates structural edits between collaborating documents", () => {
  const owner = new Y.Doc();
  const peer = new Y.Doc();
  const id = addMarkdownNote(owner, { filename: "AGENTS.md", path: ".agents", content: "one" });
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(owner));
  renameNote(peer, id, "RULES.md");
  moveNote(peer, id, ".agents/team");
  Y.applyUpdate(owner, Y.encodeStateAsUpdate(peer));
  const ownerNote = readCabinetNotes(owner)[0];
  assert.equal(fullNotePath(ownerNote), ".agents/team/RULES.md");
  assert.equal(ownerNote.status, "added");
});
