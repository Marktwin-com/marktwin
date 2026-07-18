import * as Y from "yjs";
import type { Note, WorkspaceChange } from "@shared/schema";
import type { AtomicTreeChange, GitHubMarkdownFile } from "./browser-github";

export type CabinetFileStatus = "clean" | "added" | "modified" | "deleted";

export interface FolderRecord {
  path: string;
  originalPath?: string;
  status: CabinetFileStatus;
}

export interface ScopeContent {
  scope: string;
  files: GitHubMarkdownFile[];
  folderMarkers: string[];
}

const FILES_MAP = "files";
const FOLDERS_MAP = "folders";
type CabinetFileValue = string | Y.Text | undefined;

export function normalizeRepositoryPath(value: string) {
  const path = value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!path) return "";
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error("Repository paths cannot contain empty, '.' or '..' segments.");
  }
  return parts.join("/");
}

export function normalizeDirectoryPath(value: string) {
  const normalized = normalizeRepositoryPath(value);
  return normalized ? `${normalized}/` : "/";
}

export function normalizeFolderPath(value: string) {
  const normalized = normalizeRepositoryPath(value);
  if (!normalized) throw new Error("A folder name is required.");
  return normalized;
}

export function normalizeMarkdownFilename(value: string) {
  const filename = value.trim();
  if (!filename) throw new Error("A file name is required.");
  if (filename.includes("/") || filename.includes("\\")) {
    throw new Error("File names cannot contain slashes.");
  }
  const hasExtension = /\.[^./]+$/.test(filename);
  if (hasExtension && !filename.toLowerCase().endsWith(".md")) {
    throw new Error("Marktwin manages Markdown (.md) files only.");
  }
  const normalized = filename.toLowerCase().endsWith(".md") ? filename : `${filename}.md`;
  normalizeRepositoryPath(normalized);
  return normalized;
}

export function fullNotePath(note: Pick<Note, "path" | "filename">) {
  const directory = normalizeDirectoryPath(note.path);
  return directory === "/" ? note.filename : `${directory}${note.filename}`;
}

export function splitFullPath(path: string) {
  const normalized = normalizeRepositoryPath(path);
  const parts = normalized.split("/");
  const filename = parts.pop() || "";
  return {
    filename,
    path: parts.length ? `${parts.join("/")}/` : "/",
  };
}

export function scopeForPath(path: string) {
  const normalized = normalizeRepositoryPath(path);
  return normalized.includes("/") ? normalized.split("/")[0] : "/";
}

export function pathBelongsToScope(path: string, scope: string) {
  const normalized = normalizeRepositoryPath(path);
  if (scope === "/") return !normalized.includes("/");
  return normalized === scope || normalized.startsWith(`${scope}/`);
}

function pathBelongsToAnyScope(path: string, scopes: string[]) {
  return scopes.some((scope) => pathBelongsToScope(path, scope));
}

export function joinFolderPath(parent: string, name: string) {
  if (name.includes("/") || name.includes("\\")) {
    throw new Error("Folder names cannot contain slashes.");
  }
  const cleanName = normalizeFolderPath(name);
  const cleanParent = parent === "/" ? "" : normalizeFolderPath(parent);
  return cleanParent ? `${cleanParent}/${cleanName}` : cleanName;
}

export function getFilesMap(doc: Y.Doc) {
  return doc.getMap<Y.Map<CabinetFileValue>>(FILES_MAP);
}

export function getFoldersMap(doc: Y.Doc) {
  return doc.getMap<FolderRecord>(FOLDERS_MAP);
}

function stringField(fileMap: Y.Map<CabinetFileValue>, key: string, fallback = "") {
  const value = fileMap.get(key);
  return typeof value === "string" ? value : fallback;
}

function noteFromMap(id: string, fileMap: Y.Map<CabinetFileValue>, vaultId: number): Note {
  const content = fileMap.get("content");
  return {
    id,
    vaultId,
    filename: stringField(fileMap, "filename", "Untitled.md"),
    path: stringField(fileMap, "path", "/"),
    content: content instanceof Y.Text ? content.toString() : "",
    githubSha: stringField(fileMap, "githubSha") || undefined,
    originalPath: stringField(fileMap, "originalPath") || undefined,
    status: (stringField(fileMap, "status", "clean") as CabinetFileStatus),
  };
}

export function readCabinetNotes(doc: Y.Doc, vaultId = 0, includeDeleted = false) {
  return Array.from(getFilesMap(doc).entries())
    .map(([id, fileMap]) => noteFromMap(id, fileMap, vaultId))
    .filter((note) => includeDeleted || note.status !== "deleted")
    .sort((left, right) => fullNotePath(left).localeCompare(fullNotePath(right)));
}

export function readFolderRecords(doc: Y.Doc, includeDeleted = false) {
  return Array.from(getFoldersMap(doc).values())
    .filter((folder) => includeDeleted || folder.status !== "deleted")
    .sort((left, right) => left.path.localeCompare(right.path));
}

function createFileMap(file: GitHubMarkdownFile, id: string = crypto.randomUUID()) {
  const split = splitFullPath(file.path);
  const fileMap = new Y.Map<CabinetFileValue>();
  fileMap.set("id", id);
  fileMap.set("filename", split.filename);
  fileMap.set("path", split.path);
  fileMap.set("githubSha", file.sha);
  fileMap.set("originalPath", file.path);
  fileMap.set("status", "clean");
  const content = new Y.Text();
  if (file.content) content.insert(0, file.content);
  fileMap.set("content", content);
  return { id, fileMap };
}

export function hydrateSelectedScopes(doc: Y.Doc, contents: ScopeContent[]) {
  const filesMap = getFilesMap(doc);
  const foldersMap = getFoldersMap(doc);
  const existingIds = new Map(
    readCabinetNotes(doc, 0, true).map((note) => [fullNotePath(note), note.id]),
  );

  doc.transact(() => {
    filesMap.clear();
    foldersMap.clear();
    for (const content of contents) {
      for (const file of content.files) {
        const created = createFileMap(file, existingIds.get(file.path));
        filesMap.set(created.id, created.fileMap);
      }
      for (const marker of content.folderMarkers) {
        const path = normalizeFolderPath(marker);
        foldersMap.set(path, { path, originalPath: path, status: "clean" });
      }
    }
  }, "github-hydrate");
}

export function assertWorkspaceWithinScopes(doc: Y.Doc, scopes: string[]) {
  const normalizedScopes = Array.from(new Set(scopes.map((scope) => scope === "/" ? "/" : normalizeFolderPath(scope))));
  const violations = new Set<string>();
  const activePaths = new Set<string>();

  for (const note of readCabinetNotes(doc, 0, true)) {
    const currentPath = fullNotePath(note);
    if (!currentPath.toLowerCase().endsWith(".md")) violations.add(currentPath);
    if (!pathBelongsToAnyScope(currentPath, normalizedScopes)) violations.add(currentPath);
    if (note.originalPath && !pathBelongsToAnyScope(note.originalPath, normalizedScopes)) violations.add(note.originalPath);
    if (note.status !== "deleted") {
      const duplicateKey = currentPath.toLowerCase();
      if (activePaths.has(duplicateKey)) violations.add(currentPath);
      activePaths.add(duplicateKey);
    }
  }

  for (const folder of readFolderRecords(doc, true)) {
    const marker = `${folder.path}/.gitkeep`;
    if (!pathBelongsToAnyScope(marker, normalizedScopes)) violations.add(marker);
    if (folder.originalPath) {
      const originalMarker = `${folder.originalPath}/.gitkeep`;
      if (!pathBelongsToAnyScope(originalMarker, normalizedScopes)) violations.add(originalMarker);
    }
  }

  if (violations.size > 0) {
    throw new Error(`Sync blocked: changes outside the shared workspace scopes: ${Array.from(violations).sort().join(", ")}`);
  }
}

export function describeWorkspaceChanges(doc: Y.Doc, baseline: ScopeContent[] = []): WorkspaceChange[] {
  const baselineFiles = new Map(baseline.flatMap((scope) => scope.files).map((file) => [file.path, file]));
  const changes: WorkspaceChange[] = [];
  for (const note of readCabinetNotes(doc, 0, true)) {
    if (note.status === "clean") continue;
    const path = fullNotePath(note);
    const originalPath = note.originalPath;
    const before = originalPath ? baselineFiles.get(originalPath)?.content : undefined;
    const kind = note.status === "added"
      ? "added"
      : note.status === "deleted"
        ? "deleted"
        : originalPath && originalPath !== path
          ? "moved"
          : "modified";
    changes.push({
      id: note.id,
      fileId: note.id,
      kind,
      path,
      originalPath,
      contentBefore: before,
      contentAfter: note.status === "deleted" ? undefined : note.content,
    });
  }
  for (const folder of readFolderRecords(doc, true)) {
    if (folder.status === "clean") continue;
    const path = `${folder.path}/.gitkeep`;
    const originalPath = folder.originalPath ? `${folder.originalPath}/.gitkeep` : undefined;
    changes.push({
      id: `folder:${folder.path}`,
      kind: folder.status === "added" ? "added" : folder.status === "deleted" ? "deleted" : "moved",
      path,
      originalPath,
    });
  }
  return changes.sort((left, right) => left.path.localeCompare(right.path));
}

export function discardWorkspaceChanges(doc: Y.Doc, baseline: ScopeContent[]) {
  hydrateSelectedScopes(doc, baseline);
}

export function discardWorkspaceChange(doc: Y.Doc, change: WorkspaceChange, baseline: ScopeContent[]) {
  if (!change.fileId) {
    const folders = getFoldersMap(doc);
    const currentPath = change.path.replace(/\/\.gitkeep$/, "");
    const originalPath = change.originalPath?.replace(/\/\.gitkeep$/, "");
    doc.transact(() => {
      folders.delete(currentPath);
      if (originalPath) folders.set(originalPath, { path: originalPath, originalPath, status: "clean" });
    }, "discard-folder-change");
    return;
  }

  const files = getFilesMap(doc);
  const fileMap = files.get(change.fileId);
  if (!fileMap) return;
  if (change.kind === "added") {
    files.delete(change.fileId);
    return;
  }
  const baselineFile = baseline.flatMap((scope) => scope.files).find((file) => file.path === change.originalPath);
  if (!baselineFile) throw new Error(`The original version of '${change.originalPath || change.path}' is unavailable.`);
  const split = splitFullPath(baselineFile.path);
  doc.transact(() => {
    fileMap.set("filename", split.filename);
    fileMap.set("path", split.path);
    fileMap.set("githubSha", baselineFile.sha);
    fileMap.set("originalPath", baselineFile.path);
    fileMap.set("status", "clean");
    let content = fileMap.get("content");
    if (!(content instanceof Y.Text)) {
      content = new Y.Text();
      fileMap.set("content", content);
    }
    const text = content as Y.Text;
    text.delete(0, text.length);
    if (baselineFile.content) text.insert(0, baselineFile.content);
  }, "discard-file-change");
}

export function mergeScopeContent(doc: Y.Doc, content: ScopeContent) {
  const filesMap = getFilesMap(doc);
  const foldersMap = getFoldersMap(doc);
  const incoming = new Set(content.files.map((file) => file.path));

  doc.transact(() => {
    for (const [id, fileMap] of Array.from(filesMap.entries())) {
      const note = noteFromMap(id, fileMap, 0);
      const path = fullNotePath(note);
      if (pathBelongsToScope(path, content.scope) && note.status === "clean" && !incoming.has(path)) {
        filesMap.delete(id);
      }
    }
    for (const file of content.files) {
      const existing = Array.from(filesMap.entries()).find(([id, map]) => {
        return fullNotePath(noteFromMap(id, map, 0)) === file.path;
      });
      if (existing) continue;
      const created = createFileMap(file);
      filesMap.set(created.id, created.fileMap);
    }
    for (const marker of content.folderMarkers) {
      const path = normalizeFolderPath(marker);
      if (!foldersMap.has(path)) foldersMap.set(path, { path, originalPath: path, status: "clean" });
    }
  }, "github-scope-load");
}

export function hasUnsyncedChanges(doc: Y.Doc) {
  const fileDirty = readCabinetNotes(doc, 0, true).some((note) => note.status !== "clean");
  const folderDirty = readFolderRecords(doc, true).some((folder) => folder.status !== "clean");
  return fileDirty || folderDirty;
}

export function scopeHasUnsyncedChanges(doc: Y.Doc, scope: string) {
  const fileDirty = readCabinetNotes(doc, 0, true).some((note) => {
    const currentPath = fullNotePath(note);
    return note.status !== "clean" && (
      pathBelongsToScope(currentPath, scope) ||
      (!!note.originalPath && pathBelongsToScope(note.originalPath, scope))
    );
  });
  const folderDirty = readFolderRecords(doc, true).some((folder) => {
    return folder.status !== "clean" && (
      pathBelongsToScope(`${folder.path}/marker.md`, scope) ||
      (!!folder.originalPath && pathBelongsToScope(`${folder.originalPath}/marker.md`, scope))
    );
  });
  return fileDirty || folderDirty;
}

export function removeCleanScope(doc: Y.Doc, scope: string) {
  if (scopeHasUnsyncedChanges(doc, scope)) {
    throw new Error("Sync or discard changes in this folder before unloading it.");
  }
  const filesMap = getFilesMap(doc);
  const foldersMap = getFoldersMap(doc);
  doc.transact(() => {
    for (const [id, fileMap] of Array.from(filesMap.entries())) {
      const note = noteFromMap(id, fileMap, 0);
      if (pathBelongsToScope(fullNotePath(note), scope)) filesMap.delete(id);
    }
    for (const [path] of Array.from(foldersMap.entries())) {
      if (pathBelongsToScope(`${path}/marker.md`, scope)) foldersMap.delete(path);
    }
  }, "scope-unload");
}

export function addMarkdownNote(doc: Y.Doc, input: { filename: string; path: string; content?: string }) {
  const filename = normalizeMarkdownFilename(input.filename);
  const path = normalizeDirectoryPath(input.path);
  const candidate = path === "/" ? filename : `${path}${filename}`;
  const duplicate = readCabinetNotes(doc).some((note) => fullNotePath(note).toLowerCase() === candidate.toLowerCase());
  if (duplicate) throw new Error(`'${candidate}' already exists.`);

  const id = crypto.randomUUID();
  const fileMap = new Y.Map<CabinetFileValue>();
  fileMap.set("id", id);
  fileMap.set("filename", filename);
  fileMap.set("path", path);
  fileMap.set("status", "added");
  const content = new Y.Text();
  if (input.content) content.insert(0, input.content);
  fileMap.set("content", content);
  getFilesMap(doc).set(id, fileMap);
  return id;
}

export function markNoteModified(doc: Y.Doc, id: string) {
  const fileMap = getFilesMap(doc).get(id);
  if (!fileMap) return;
  if (fileMap.get("status") === "clean") fileMap.set("status", "modified");
}

export function renameNote(doc: Y.Doc, id: string, newName: string) {
  const fileMap = getFilesMap(doc).get(id);
  if (!fileMap) throw new Error("File not found.");
  const filename = normalizeMarkdownFilename(newName);
  const path = stringField(fileMap, "path", "/");
  const fullPath = path === "/" ? filename : `${path}${filename}`;
  const duplicate = readCabinetNotes(doc).some((note) => note.id !== id && fullNotePath(note).toLowerCase() === fullPath.toLowerCase());
  if (duplicate) throw new Error(`'${fullPath}' already exists.`);
  doc.transact(() => {
    fileMap.set("filename", filename);
    if (fileMap.get("status") === "clean") fileMap.set("status", "modified");
  }, "file-rename");
}

export function moveNote(doc: Y.Doc, id: string, newPath: string) {
  const fileMap = getFilesMap(doc).get(id);
  if (!fileMap) throw new Error("File not found.");
  const path = normalizeDirectoryPath(newPath);
  const filename = stringField(fileMap, "filename", "Untitled.md");
  const fullPath = path === "/" ? filename : `${path}${filename}`;
  const duplicate = readCabinetNotes(doc).some((note) => note.id !== id && fullNotePath(note).toLowerCase() === fullPath.toLowerCase());
  if (duplicate) throw new Error(`'${fullPath}' already exists.`);
  doc.transact(() => {
    fileMap.set("path", path);
    if (fileMap.get("status") === "clean") fileMap.set("status", "modified");
  }, "file-move");
}

export function deleteNote(doc: Y.Doc, id: string) {
  const fileMap = getFilesMap(doc).get(id);
  if (!fileMap) return;
  if (fileMap.get("status") === "added") {
    getFilesMap(doc).delete(id);
  } else {
    fileMap.set("status", "deleted");
  }
}

export function createFolder(doc: Y.Doc, path: string) {
  const normalized = normalizeFolderPath(path);
  const foldersMap = getFoldersMap(doc);
  const visibleDuplicate = visibleFolderPaths(doc).some(
    (folder) => folder.toLowerCase() === normalized.toLowerCase(),
  );
  if (visibleDuplicate) throw new Error(`'${normalized}' already exists.`);
  if (foldersMap.get(normalized)?.status !== "deleted") {
    const existsThroughFile = readCabinetNotes(doc).some((note) => fullNotePath(note).startsWith(`${normalized}/`));
    if (foldersMap.has(normalized) || existsThroughFile) throw new Error(`'${normalized}' already exists.`);
  }
  foldersMap.set(normalized, { path: normalized, status: "added" });
}

export function folderMarkdownCount(doc: Y.Doc, path: string) {
  const normalized = normalizeFolderPath(path);
  return readCabinetNotes(doc).filter((note) => fullNotePath(note).startsWith(`${normalized}/`)).length;
}

export function moveFolder(doc: Y.Doc, sourcePath: string, targetPath: string) {
  const source = normalizeFolderPath(sourcePath);
  const target = normalizeFolderPath(targetPath);
  if (target === source || target.startsWith(`${source}/`)) {
    throw new Error("A folder cannot be moved into itself.");
  }
  const notes = readCabinetNotes(doc);
  const targetExists = readFolderRecords(doc).some((folder) => folder.path.toLowerCase() === target.toLowerCase()) ||
    notes.some((note) => fullNotePath(note).toLowerCase().startsWith(`${target.toLowerCase()}/`));
  if (targetExists) throw new Error(`'${target}' already exists.`);
  const affected = notes.filter((note) => fullNotePath(note).startsWith(`${source}/`));
  const unaffectedPaths = new Set(notes.filter((note) => !affected.includes(note)).map((note) => fullNotePath(note).toLowerCase()));
  for (const note of affected) {
    const current = fullNotePath(note);
    const next = `${target}/${current.slice(source.length + 1)}`;
    if (unaffectedPaths.has(next.toLowerCase())) throw new Error(`'${next}' already exists.`);
  }

  doc.transact(() => {
    for (const note of affected) {
      const fileMap = getFilesMap(doc).get(note.id)!;
      const current = fullNotePath(note);
      const next = splitFullPath(`${target}/${current.slice(source.length + 1)}`);
      fileMap.set("path", next.path);
      if (fileMap.get("status") === "clean") fileMap.set("status", "modified");
    }
    for (const [key, folder] of Array.from(getFoldersMap(doc).entries())) {
      if (key === source || key.startsWith(`${source}/`)) {
        const nextPath = `${target}${key.slice(source.length)}`;
        getFoldersMap(doc).delete(key);
        getFoldersMap(doc).set(nextPath, {
          ...folder,
          path: nextPath,
          originalPath: folder.originalPath || key,
          status: folder.status === "added" ? "added" : "modified",
        });
      }
    }
  }, "folder-move");
}

export function deleteFolder(doc: Y.Doc, path: string) {
  const normalized = normalizeFolderPath(path);
  doc.transact(() => {
    for (const note of readCabinetNotes(doc)) {
      if (fullNotePath(note).startsWith(`${normalized}/`)) deleteNote(doc, note.id);
    }
    for (const [key, folder] of Array.from(getFoldersMap(doc).entries())) {
      if (key === normalized || key.startsWith(`${normalized}/`)) {
        if (folder.status === "added") getFoldersMap(doc).delete(key);
        else getFoldersMap(doc).set(key, { ...folder, status: "deleted" });
      }
    }
  }, "folder-delete");
}

export function collectAtomicChanges(doc: Y.Doc): AtomicTreeChange[] {
  const changes = new Map<string, AtomicTreeChange>();
  const notes = readCabinetNotes(doc, 0, true);

  for (const note of notes) {
    const currentPath = fullNotePath(note);
    const originalPath = note.originalPath;
    if (note.status === "clean") continue;
    if (note.status === "deleted") {
      if (originalPath) changes.set(originalPath, { path: originalPath, sha: null });
      continue;
    }
    if (originalPath && originalPath !== currentPath) {
      changes.set(originalPath, { path: originalPath, sha: null });
    }
    changes.set(currentPath, { path: currentPath, content: note.content });
  }

  const activeFiles = notes.filter((note) => note.status !== "deleted");
  for (const folder of readFolderRecords(doc, true)) {
    const currentMarker = `${folder.path}/.gitkeep`;
    const originalMarker = folder.originalPath ? `${folder.originalPath}/.gitkeep` : undefined;
    const hasMarkdown = activeFiles.some((note) => fullNotePath(note).startsWith(`${folder.path}/`));
    if (folder.status === "clean") {
      if (hasMarkdown && originalMarker) {
        changes.set(originalMarker, { path: originalMarker, sha: null });
      }
      continue;
    }
    if (originalMarker && (folder.status === "deleted" || folder.originalPath !== folder.path || hasMarkdown)) {
      changes.set(originalMarker, { path: originalMarker, sha: null });
    }
    if (folder.status !== "deleted" && !hasMarkdown) {
      changes.set(currentMarker, { path: currentMarker, content: "" });
    }
  }

  return Array.from(changes.values()).sort((left, right) => left.path.localeCompare(right.path));
}

export function visibleFolderPaths(doc: Y.Doc) {
  const folders = new Set<string>();
  for (const note of readCabinetNotes(doc)) {
    const parts = normalizeRepositoryPath(note.path).split("/").filter(Boolean);
    for (let index = 1; index <= parts.length; index += 1) {
      folders.add(parts.slice(0, index).join("/"));
    }
  }
  for (const folder of readFolderRecords(doc)) {
    const parts = normalizeRepositoryPath(folder.path).split("/").filter(Boolean);
    for (let index = 1; index <= parts.length; index += 1) {
      folders.add(parts.slice(0, index).join("/"));
    }
  }
  return Array.from(folders).sort();
}
