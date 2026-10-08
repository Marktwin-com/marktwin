import * as Y from "yjs";
import type { WorkspaceChange } from "@shared/schema";
import type { AtomicTreeChange, GitHubWorkspaceFile, WorkspaceFileContentEncoding, WorkspaceFileType } from "./workspace-github";
import { assetMimeTypeForPath, imageMimeTypeForPath, workspaceFileTypeForPath } from "./workspace-github";
import { createClientId } from "./client-id";
import { isTextPath, normalizeTextFilename } from "./text-files";
import {
  defaultContentForFileType,
  fileTypeExtension,
  parseCanvas,
  serializeCanvas,
  type JsonCanvasDocument,
} from "./workspace-formats";
import {
  artifactMetadataPathForScope,
  isArtifactMetadataPath,
  parseArtifactMetadata,
  setArtifactMetadataPath,
} from "./artifact-metadata";

function usesBase64Content(fileType: WorkspaceFileType) {
  return fileType === "image" || fileType === "asset";
}

/** Browser-only working-tree file. Database/demo notes intentionally remain numeric. */
export interface WorkspaceNote {
  id: string;
  artifactId?: string;
  vaultId: number;
  filename: string;
  path: string;
  content: string;
  contentEncoding?: WorkspaceFileContentEncoding;
  fileType: WorkspaceFileType;
  githubSha?: string;
  originalPath?: string;
  status?: CabinetFileStatus;
}

export type CabinetFileStatus = "clean" | "added" | "modified" | "deleted";

export interface FolderRecord {
  path: string;
  originalPath?: string;
  status: CabinetFileStatus;
}

export interface ScopeContent {
  scope: string;
  files: GitHubWorkspaceFile[];
  folderMarkers: string[];
}

const FILES_MAP = "files";
const FOLDERS_MAP = "folders";
type CabinetFileValue = string | Y.Text | Y.Map<string> | undefined;

const CANVAS_NODES = "canvasNodes";
const CANVAS_EDGES = "canvasEdges";
const CANVAS_META = "canvasMeta";
const DRAWING_ELEMENTS = "drawingElements";
const DRAWING_META = "drawingMeta";
const DRAWING_APP_STATE = "drawingAppState";
const DRAWING_FILES = "drawingFiles";

interface DrawingElementRecord {
  id: string;
  [key: string]: unknown;
}

interface StoredDrawingElement {
  element: DrawingElementRecord;
  order: number;
}

interface DrawingDocument {
  elements: DrawingElementRecord[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
  [key: string]: unknown;
}

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

export function normalizeWorkspaceFilename(value: string, fileType: WorkspaceFileType = "markdown") {
  const filename = value.trim();
  if (!filename) throw new Error("A file name is required.");
  if (filename.includes("/") || filename.includes("\\")) {
    throw new Error("File names cannot contain slashes.");
  }
  if (fileType === "markdown") {
    const normalized = normalizeTextFilename(filename);
    if (!isTextPath(normalized)) {
      throw new Error("A text file must use a supported text extension.");
    }
    normalizeRepositoryPath(normalized);
    return normalized;
  }
  if (fileType === "image") {
    if (!imageMimeTypeForPath(filename)) throw new Error("An image file must use a supported image extension.");
    normalizeRepositoryPath(filename);
    return filename;
  }
  if (fileType === "asset") {
    if (!assetMimeTypeForPath(filename)) throw new Error("This asset type is not supported.");
    normalizeRepositoryPath(filename);
    return filename;
  }
  const hasExtension = /\.[^./]+$/.test(filename);
  const extension = fileTypeExtension(fileType);
  if (hasExtension && !filename.toLowerCase().endsWith(extension)) {
    throw new Error(`A ${fileType} file must use the ${extension} extension.`);
  }
  const normalized = filename.toLowerCase().endsWith(extension) ? filename : `${filename}${extension}`;
  normalizeRepositoryPath(normalized);
  return normalized;
}

export function normalizeMarkdownFilename(value: string) {
  return normalizeWorkspaceFilename(value, "markdown");
}

export function fullNotePath(note: Pick<WorkspaceNote, "path" | "filename">) {
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
  // Selecting the repository root grants access to files and folders at any
  // depth. A root-level folder is still inside the repository root scope.
  if (scope === "/") return true;
  return normalized === scope || normalized.startsWith(`${scope}/`);
}

/**
 * Return the repository scope that should be visibly selected after creating a
 * folder, or null when an already-selected folder scope covers it. Main path
 * already loads recursively, but retaining the new top-level selection makes
 * its connection explicit in Workspace settings.
 */
export function scopeToSelectForCreatedFolder(path: string, selectedScopes: string[]) {
  const normalized = normalizeRepositoryPath(path);
  if (!normalized) return null;

  const topLevelScope = normalized.split("/")[0];
  const coveredBySelectedFolder = selectedScopes.some(
    (scope) => scope !== "/" && pathBelongsToScope(`${normalized}/.gitkeep`, scope),
  );
  if (coveredBySelectedFolder || selectedScopes.includes(topLevelScope)) return null;
  return topLevelScope;
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

function replaceRecordMap(target: Y.Map<string>, records: Array<{ id: string; [key: string]: unknown }>) {
  const nextIds = new Set(records.map((record) => record.id));
  for (const id of Array.from(target.keys())) {
    if (!nextIds.has(id)) target.delete(id);
  }
  for (const record of records) {
    const serialized = JSON.stringify(record);
    if (target.get(record.id) !== serialized) target.set(record.id, serialized);
  }
}

function writeCanvasStructure(fileMap: Y.Map<CabinetFileValue>, content: string) {
  const document = parseCanvas(content);
  const { nodes, edges, ...meta } = document;
  let nodeMap = fileMap.get(CANVAS_NODES);
  if (!(nodeMap instanceof Y.Map)) {
    nodeMap = new Y.Map<string>();
    fileMap.set(CANVAS_NODES, nodeMap);
  }
  let edgeMap = fileMap.get(CANVAS_EDGES);
  if (!(edgeMap instanceof Y.Map)) {
    edgeMap = new Y.Map<string>();
    fileMap.set(CANVAS_EDGES, edgeMap);
  }
  replaceRecordMap(nodeMap as Y.Map<string>, nodes);
  replaceRecordMap(edgeMap as Y.Map<string>, edges);
  fileMap.set(CANVAS_META, JSON.stringify(meta));
}

function initializeCanvasStructure(fileMap: Y.Map<CabinetFileValue>, content: string) {
  const document = parseCanvas(content);
  const { nodes, edges, ...meta } = document;
  const nodeMap = new Y.Map<string>();
  const edgeMap = new Y.Map<string>();
  for (const node of nodes) nodeMap.set(node.id, JSON.stringify(node));
  for (const edge of edges) edgeMap.set(edge.id, JSON.stringify(edge));
  fileMap.set(CANVAS_NODES, nodeMap);
  fileMap.set(CANVAS_EDGES, edgeMap);
  fileMap.set(CANVAS_META, JSON.stringify(meta));
}

function canvasContentFromMap(fileMap: Y.Map<CabinetFileValue>, fallback: string) {
  const nodeMap = fileMap.get(CANVAS_NODES);
  const edgeMap = fileMap.get(CANVAS_EDGES);
  if (!(nodeMap instanceof Y.Map) || !(edgeMap instanceof Y.Map)) return fallback;
  try {
    const meta = JSON.parse(stringField(fileMap, CANVAS_META, "{}")) as Omit<JsonCanvasDocument, "nodes" | "edges">;
    return serializeCanvas({
      ...meta,
      nodes: Array.from((nodeMap as Y.Map<string>).values()).map((value) => JSON.parse(value)),
      edges: Array.from((edgeMap as Y.Map<string>).values()).map((value) => JSON.parse(value)),
    });
  } catch {
    return fallback;
  }
}

function parseDrawing(content: string): DrawingDocument {
  const value = JSON.parse(content || "{}") as Partial<DrawingDocument>;
  if (!value || typeof value !== "object" || !Array.isArray(value.elements)) {
    throw new Error("This file is not a valid Excalidraw document.");
  }
  return {
    ...value,
    elements: value.elements.filter((element): element is DrawingElementRecord => (
      Boolean(element) && typeof element === "object" && typeof element.id === "string"
    )),
    appState: value.appState && typeof value.appState === "object" ? value.appState : {},
    files: value.files && typeof value.files === "object" ? value.files : {},
  };
}

function storedDrawingElement(value: string, fallbackOrder: number): StoredDrawingElement | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && parsed.element && typeof parsed.element === "object") {
      const element = parsed.element as DrawingElementRecord;
      if (typeof element.id !== "string") return null;
      return { element, order: typeof parsed.order === "number" && Number.isFinite(parsed.order) ? parsed.order : fallbackOrder };
    }
    if (parsed && typeof parsed === "object" && typeof parsed.id === "string") {
      return { element: parsed as DrawingElementRecord, order: fallbackOrder };
    }
  } catch {
    // A malformed individual element should not make the whole workspace unreadable.
  }
  return null;
}

function drawingElementMap(fileMap: Y.Map<CabinetFileValue>) {
  const value = fileMap.get(DRAWING_ELEMENTS);
  return value instanceof Y.Map ? value as Y.Map<string> : null;
}

function drawingFilesFromMap(fileMap: Y.Map<CabinetFileValue>) {
  const value = fileMap.get(DRAWING_FILES);
  if (value instanceof Y.Map) {
    const files: Record<string, unknown> = {};
    for (const [id, serialized] of (value as Y.Map<string>).entries()) {
      try {
        files[id] = JSON.parse(serialized);
      } catch {
        // Ignore one malformed attachment without hiding the rest of a drawing.
      }
    }
    return files;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function initializeDrawingFiles(files: Record<string, unknown>) {
  const fileRecords = new Y.Map<string>();
  for (const [id, file] of Object.entries(files)) fileRecords.set(id, JSON.stringify(file));
  return fileRecords;
}

function ensureDrawingFilesMap(fileMap: Y.Map<CabinetFileValue>) {
  const existing = fileMap.get(DRAWING_FILES);
  if (existing instanceof Y.Map) return existing as Y.Map<string>;
  const fileRecords = initializeDrawingFiles(drawingFilesFromMap(fileMap));
  fileMap.set(DRAWING_FILES, fileRecords);
  return fileRecords;
}

function replaceDrawingFiles(fileMap: Y.Map<CabinetFileValue>, files: Record<string, unknown>) {
  const fileRecords = ensureDrawingFilesMap(fileMap);
  const nextIds = new Set(Object.keys(files));
  for (const id of Array.from(fileRecords.keys())) {
    if (!nextIds.has(id)) fileRecords.delete(id);
  }
  for (const [id, file] of Object.entries(files)) {
    const serialized = JSON.stringify(file);
    if (fileRecords.get(id) !== serialized) fileRecords.set(id, serialized);
  }
}

function initializeDrawingStructure(fileMap: Y.Map<CabinetFileValue>, content: string) {
  const document = parseDrawing(content);
  const { elements, appState, files, ...meta } = document;
  const elementMap = new Y.Map<string>();
  elements.forEach((element, order) => {
    elementMap.set(element.id, JSON.stringify({ element, order } satisfies StoredDrawingElement));
  });
  fileMap.set(DRAWING_ELEMENTS, elementMap);
  fileMap.set(DRAWING_META, JSON.stringify(meta));
  fileMap.set(DRAWING_APP_STATE, JSON.stringify(appState));
  fileMap.set(DRAWING_FILES, initializeDrawingFiles(files));
}

function writeDrawingStructure(fileMap: Y.Map<CabinetFileValue>, content: string) {
  const document = parseDrawing(content);
  const { elements, appState, files, ...meta } = document;
  let elementMap = drawingElementMap(fileMap);
  if (!elementMap) {
    elementMap = new Y.Map<string>();
    fileMap.set(DRAWING_ELEMENTS, elementMap);
  }
  const nextIds = new Set(elements.map((element) => element.id));
  for (const id of Array.from(elementMap.keys())) {
    if (!nextIds.has(id)) elementMap.delete(id);
  }
  elements.forEach((element, order) => {
    const next = JSON.stringify({ element, order } satisfies StoredDrawingElement);
    if (elementMap!.get(element.id) !== next) elementMap!.set(element.id, next);
  });
  fileMap.set(DRAWING_META, JSON.stringify(meta));
  fileMap.set(DRAWING_APP_STATE, JSON.stringify(appState));
  replaceDrawingFiles(fileMap, files);
}

function drawingContentFromMap(fileMap: Y.Map<CabinetFileValue>, fallback: string) {
  const elementMap = drawingElementMap(fileMap);
  if (!elementMap) return fallback;
  try {
    const stored = Array.from(elementMap.values())
      .map((value, index) => storedDrawingElement(value, index))
      .filter((value): value is StoredDrawingElement => Boolean(value))
      .sort((left, right) => {
        const leftIndex = typeof left.element.index === "string" ? left.element.index : "";
        const rightIndex = typeof right.element.index === "string" ? right.element.index : "";
        if (leftIndex && rightIndex && leftIndex !== rightIndex) return leftIndex.localeCompare(rightIndex);
        return left.order - right.order || left.element.id.localeCompare(right.element.id);
      });
    const meta = JSON.parse(stringField(fileMap, DRAWING_META, "{}")) as Record<string, unknown>;
    const appState = JSON.parse(stringField(fileMap, DRAWING_APP_STATE, "{}")) as Record<string, unknown>;
    const files = drawingFilesFromMap(fileMap);
    return `${JSON.stringify({ ...meta, elements: stored.map((entry) => entry.element), appState, files }, null, 2)}\n`;
  } catch {
    return fallback;
  }
}

function noteFromMap(id: string, fileMap: Y.Map<CabinetFileValue>, vaultId: number): WorkspaceNote {
  const content = fileMap.get("content");
  const filename = stringField(fileMap, "filename", "Untitled.md");
  const storedType = stringField(fileMap, "fileType") as WorkspaceFileType;
  const fileType = storedType || workspaceFileTypeForPath(filename) || "markdown";
  const textContent = content instanceof Y.Text ? content.toString() : "";
  return {
    id,
    artifactId: stringField(fileMap, "artifactId", id),
    vaultId,
    filename,
    path: stringField(fileMap, "path", "/"),
    content: fileType === "canvas"
      ? canvasContentFromMap(fileMap, textContent)
      : fileType === "drawing"
        ? drawingContentFromMap(fileMap, textContent)
        : textContent,
    contentEncoding: stringField(fileMap, "contentEncoding") === "base64" || usesBase64Content(fileType) ? "base64" : undefined,
    fileType,
    githubSha: stringField(fileMap, "githubSha") || undefined,
    originalPath: stringField(fileMap, "originalPath") || undefined,
    status: (stringField(fileMap, "status", "clean") as CabinetFileStatus),
  };
}

export function readCabinetNotes(doc: Y.Doc, vaultId = 0, includeDeleted = false) {
  const notes = Array.from(getFilesMap(doc).entries())
    .map(([id, fileMap]) => noteFromMap(id, fileMap, vaultId));
  return canonicalizeCabinetNotes(notes)
    .filter((note) => includeDeleted || note.status !== "deleted")
    .sort((left, right) => fullNotePath(left).localeCompare(fullNotePath(right)));
}

function notePreference(note: WorkspaceNote) {
  // A duplicate clean record is normally the freshly hydrated GitHub copy. Keep
  // a staged record in preference to it so browser recovery never hides edits.
  if (note.status === "added") return 3;
  if (note.status === "modified") return 2;
  if (note.status === "deleted") return 1;
  return 0;
}

/**
 * A Git working tree cannot contain two active files at the same case-insensitive
 * path in MarkTwin. Yjs records use stable IDs, however, so an older browser
 * recovery could previously add a second record for the same logical file.
 */
export function canonicalizeCabinetNotes(notes: WorkspaceNote[]) {
  const canonical = new Map<string, WorkspaceNote>();
  for (const note of notes) {
    const path = note.status === "deleted" ? note.originalPath || fullNotePath(note) : fullNotePath(note);
    const key = `${note.status === "deleted" ? "deleted" : "active"}:${path.toLocaleLowerCase("en-US")}`;
    const existing = canonical.get(key);
    if (!existing || notePreference(note) > notePreference(existing)) canonical.set(key, note);
  }
  return Array.from(canonical.values());
}

export function readFolderRecords(doc: Y.Doc, includeDeleted = false) {
  return Array.from(getFoldersMap(doc).values())
    .filter((folder) => includeDeleted || folder.status !== "deleted")
    .sort((left, right) => left.path.localeCompare(right.path));
}

function createFileMap(file: GitHubWorkspaceFile, id: string = createClientId()) {
  const split = splitFullPath(file.path);
  const fileMap = new Y.Map<CabinetFileValue>();
  fileMap.set("id", id);
  fileMap.set("artifactId", id);
  fileMap.set("filename", split.filename);
  fileMap.set("path", split.path);
  fileMap.set("githubSha", file.sha);
  fileMap.set("originalPath", file.path);
  fileMap.set("status", "clean");
  const fileType = file.fileType || workspaceFileTypeForPath(file.path) || "markdown";
  fileMap.set("fileType", fileType);
  fileMap.set("contentEncoding", file.contentEncoding || (usesBase64Content(fileType) ? "base64" : "utf8"));
  const content = new Y.Text();
  if (file.content) content.insert(0, file.content);
  fileMap.set("content", content);
  if (fileType === "canvas") initializeCanvasStructure(fileMap, file.content);
  if (fileType === "drawing") initializeDrawingStructure(fileMap, file.content);
  return { id, fileMap };
}

export function hydrateSelectedScopes(doc: Y.Doc, contents: ScopeContent[]) {
  const filesMap = getFilesMap(doc);
  const foldersMap = getFoldersMap(doc);
  const existingIds = new Map(
    readCabinetNotes(doc, 0, true).map((note) => [fullNotePath(note).toLocaleLowerCase("en-US"), note.id]),
  );
  const uniqueFiles = new Map<string, GitHubWorkspaceFile>();
  const uniqueMarkers = new Map<string, string>();
  for (const content of contents) {
    for (const file of content.files) {
      const normalizedPath = normalizeRepositoryPath(file.path);
      const key = normalizedPath.toLocaleLowerCase("en-US");
      if (!uniqueFiles.has(key)) uniqueFiles.set(key, { ...file, path: normalizedPath });
    }
    for (const marker of content.folderMarkers) {
      const path = normalizeFolderPath(marker);
      const key = path.toLocaleLowerCase("en-US");
      if (!uniqueMarkers.has(key)) uniqueMarkers.set(key, path);
    }
  }

  const metadataFile = Array.from(uniqueFiles.values()).find((file) => isArtifactMetadataPath(file.path));
  const metadataPath = metadataFile?.path || artifactMetadataPathForScope(contents.find((content) => content.scope)?.scope || "/");
  const metadataRecords = metadataFile ? parseArtifactMetadata(metadataFile.content) : [];
  const metadataIds = new Map(metadataRecords.map((record) => [normalizeRepositoryPath(record.path).toLocaleLowerCase("en-US"), record.id]));
  const preparedFiles = Array.from(uniqueFiles.entries()).map(([key, file]) => {
    const created = createFileMap(file, existingIds.get(key));
    const storedArtifactId = metadataIds.get(key);
    if (storedArtifactId) created.fileMap.set("artifactId", storedArtifactId);
    return created;
  });

  doc.transact(() => {
    setArtifactMetadataPath(doc, metadataPath);
    filesMap.clear();
    foldersMap.clear();
    for (const created of preparedFiles) {
      filesMap.set(created.id, created.fileMap);
    }
    for (const path of uniqueMarkers.values()) {
      foldersMap.set(path, { path, originalPath: path, status: "clean" });
    }
  }, "github-hydrate");
}

/** Replace only the logical repository working tree, without merging Yjs histories. */
export function restoreCabinetSnapshot(doc: Y.Doc, snapshot: Y.Doc) {
  const filesMap = getFilesMap(doc);
  const foldersMap = getFoldersMap(doc);
  const recoveredNotes = readCabinetNotes(snapshot, 0, true);
  const recoveredFolders = readFolderRecords(snapshot, true);
  const recoveredMetadata = recoveredNotes.find((note) => isArtifactMetadataPath(fullNotePath(note)));
  const preparedFiles = recoveredNotes.map((note) => {
    const created = createFileMap({
      path: fullNotePath(note),
      name: note.filename,
      sha: note.githubSha || "",
      content: note.content,
      contentEncoding: note.contentEncoding,
      fileType: note.fileType,
    }, note.id);
    if (!note.githubSha) created.fileMap.delete("githubSha");
    created.fileMap.set("artifactId", note.artifactId || note.id);
    if (note.originalPath) created.fileMap.set("originalPath", note.originalPath);
    else created.fileMap.delete("originalPath");
    created.fileMap.set("status", note.status || "clean");
    return created;
  });

  doc.transact(() => {
    if (recoveredMetadata) setArtifactMetadataPath(doc, fullNotePath(recoveredMetadata));
    filesMap.clear();
    foldersMap.clear();
    for (const created of preparedFiles) {
      filesMap.set(created.id, created.fileMap);
    }
    for (const folder of recoveredFolders) foldersMap.set(folder.path, { ...folder });
  }, "browser-recovery");
}

export function assertWorkspaceWithinScopes(doc: Y.Doc, scopes: string[]) {
  const normalizedScopes = Array.from(new Set(scopes.map((scope) => scope === "/" ? "/" : normalizeFolderPath(scope))));
  const violations = new Set<string>();
  const activePaths = new Set<string>();

  for (const note of readCabinetNotes(doc, 0, true)) {
    const currentPath = fullNotePath(note);
    if (workspaceFileTypeForPath(currentPath) !== note.fileType) violations.add(currentPath);
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
    fileMap.set("contentEncoding", baselineFile.contentEncoding || (usesBase64Content(baselineFile.fileType) ? "base64" : "utf8"));
    let content = fileMap.get("content");
    if (!(content instanceof Y.Text)) {
      content = new Y.Text();
      fileMap.set("content", content);
    }
    const text = content as Y.Text;
    text.delete(0, text.length);
    if (baselineFile.content) text.insert(0, baselineFile.content);
    if (baselineFile.fileType === "canvas") writeCanvasStructure(fileMap, baselineFile.content);
    if (baselineFile.fileType === "drawing") writeDrawingStructure(fileMap, baselineFile.content);
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

export function addWorkspaceFile(doc: Y.Doc, input: { filename: string; path: string; content?: string; contentEncoding?: WorkspaceFileContentEncoding; fileType?: WorkspaceFileType }) {
  const fileType = input.fileType || workspaceFileTypeForPath(input.filename) || "markdown";
  const filename = normalizeWorkspaceFilename(input.filename, fileType);
  const path = normalizeDirectoryPath(input.path);
  const candidate = path === "/" ? filename : `${path}${filename}`;
  const duplicate = readCabinetNotes(doc).some((note) => fullNotePath(note).toLowerCase() === candidate.toLowerCase());
  if (duplicate) throw new Error(`'${candidate}' already exists.`);

  const id = createClientId();
  const fileMap = new Y.Map<CabinetFileValue>();
  fileMap.set("id", id);
  fileMap.set("artifactId", id);
  fileMap.set("filename", filename);
  fileMap.set("path", path);
  fileMap.set("status", "added");
  fileMap.set("fileType", fileType);
  fileMap.set("contentEncoding", input.contentEncoding || (usesBase64Content(fileType) ? "base64" : "utf8"));
  const content = new Y.Text();
  const initialContent = input.content ?? defaultContentForFileType(fileType);
  if (initialContent) content.insert(0, initialContent);
  fileMap.set("content", content);
  if (fileType === "canvas") initializeCanvasStructure(fileMap, initialContent);
  if (fileType === "drawing") initializeDrawingStructure(fileMap, initialContent);
  getFilesMap(doc).set(id, fileMap);
  return id;
}

export function addMarkdownNote(doc: Y.Doc, input: { filename: string; path: string; content?: string }) {
  return addWorkspaceFile(doc, { ...input, fileType: "markdown" });
}

export function markNoteModified(doc: Y.Doc, id: string) {
  const fileMap = getFilesMap(doc).get(id);
  if (!fileMap) return;
  if (fileMap.get("status") === "clean") fileMap.set("status", "modified");
}

/**
 * Updates one managed file. Canvas nodes/edges and Drawing elements live in
 * Y.Maps keyed by stable IDs so collaborators merge independent object edits.
 */
export function setWorkspaceFileContent(doc: Y.Doc, id: string, nextContent: string) {
  const fileMap = getFilesMap(doc).get(id);
  if (!fileMap) return;
  const fileType = (stringField(fileMap, "fileType") as WorkspaceFileType) || "markdown";
  doc.transact(() => {
    if (fileType === "canvas") writeCanvasStructure(fileMap, nextContent);
    if (fileType === "drawing") writeDrawingStructure(fileMap, nextContent);
    let content = fileMap.get("content");
    if (!(content instanceof Y.Text)) {
      content = new Y.Text();
      fileMap.set("content", content);
    }
    const text = content as Y.Text;
    if (text.toString() !== nextContent) {
      text.delete(0, text.length);
      if (nextContent) text.insert(0, nextContent);
    }
    if (fileMap.get("status") === "clean") fileMap.set("status", "modified");
  }, fileType === "canvas"
    ? "canvas-structured-edit"
    : fileType === "drawing"
      ? "drawing-structured-replace"
      : "file-content-edit");
}

/** Keep known repository references usable after a Marktwin rename or move. */
export function updateArtifactReferences(doc: Y.Doc, artifactId: string, oldPath: string, nextPath: string) {
  const notes = readCabinetNotes(doc);
  const markdownLink = /\]\(([^)#]+)(#[^)]+)?\)/g;
  const resolveLinkTarget = (sourcePath: string, target: string) => {
    if (target.startsWith("/")) return normalizeRepositoryPath(target.slice(1));
    const sourceDirectory = sourcePath.split("/").slice(0, -1).filter(Boolean);
    const segments = [...sourceDirectory];
    for (const segment of target.split("/").filter(Boolean)) {
      if (segment === ".") continue;
      if (segment === "..") segments.pop();
      else segments.push(segment);
    }
    return normalizeRepositoryPath(segments.join("/"));
  };
  const relativeLinkTarget = (sourcePath: string, targetPath: string) => {
    const sourceDirectory = sourcePath.split("/").slice(0, -1).filter(Boolean);
    const targetParts = targetPath.split("/").filter(Boolean);
    let common = 0;
    while (common < sourceDirectory.length && common < targetParts.length && sourceDirectory[common] === targetParts[common]) common += 1;
    return [...sourceDirectory.slice(common).map(() => ".."), ...targetParts.slice(common)].join("/") || targetParts[targetParts.length - 1] || targetPath;
  };
  for (const note of notes) {
    if (note.artifactId === artifactId) continue;
    if (note.fileType === "canvas") {
      try {
        const document = parseCanvas(note.content);
        let changed = false;
        const nodes = document.nodes.map((node) => {
          if (node.type !== "file" || (node.artifactId !== artifactId && node.file !== oldPath)) return node;
          changed = true;
          return { ...node, artifactId, file: nextPath };
        });
        if (changed) setWorkspaceFileContent(doc, note.id, serializeCanvas({ ...document, nodes }));
      } catch {
        // Keep malformed Canvas content untouched and visible for manual repair.
      }
    } else if (note.fileType === "markdown" && markdownLink.test(note.content)) {
      markdownLink.lastIndex = 0;
      setWorkspaceFileContent(doc, note.id, note.content.replace(markdownLink, (match, target: string, anchor: string | undefined) => {
        const normalizedTarget = resolveLinkTarget(fullNotePath(note), target.trim());
        if (normalizedTarget !== normalizeRepositoryPath(oldPath)) return match;
        return `](${relativeLinkTarget(fullNotePath(note), nextPath)}${anchor || ""})`;
      }));
    }
  }
}

/**
 * Apply only the Excalidraw elements changed by this editor. Separate element
 * IDs are separate Yjs keys, so simultaneous gestures on different objects
 * merge. Deleted Excalidraw elements remain tombstones (`isDeleted: true`).
 */
export function updateWorkspaceDrawingElements(
  doc: Y.Doc,
  id: string,
  elements: DrawingElementRecord[],
  changedIds: ReadonlySet<string>,
  appState: Record<string, unknown>,
  files: Record<string, unknown> = {},
  changedFileIds: ReadonlySet<string> = new Set(),
) {
  const fileMap = getFilesMap(doc).get(id);
  if (!fileMap || stringField(fileMap, "fileType") !== "drawing") return;
  const nextAppState = JSON.stringify(appState);
  const existingFiles = drawingFilesFromMap(fileMap);
  const filesChanged = Array.from(changedFileIds).some((fileId) => (
    fileId in files && JSON.stringify(existingFiles[fileId]) !== JSON.stringify(files[fileId])
  ));
  if (changedIds.size === 0 && !filesChanged && stringField(fileMap, DRAWING_APP_STATE, "{}") === nextAppState) return;
  doc.transact(() => {
    let elementMap = drawingElementMap(fileMap);
    if (!elementMap) {
      const fallback = fileMap.get("content");
      initializeDrawingStructure(fileMap, fallback instanceof Y.Text ? fallback.toString() : defaultContentForFileType("drawing"));
      elementMap = drawingElementMap(fileMap)!;
    }
    elements.forEach((element, order) => {
      if (!changedIds.has(element.id)) return;
      const previous = elementMap!.get(element.id);
      const previousOrder = previous ? storedDrawingElement(previous, order)?.order : undefined;
      const next = JSON.stringify({ element, order: previousOrder ?? order } satisfies StoredDrawingElement);
      if (previous !== next) elementMap!.set(element.id, next);
    });
    if (stringField(fileMap, DRAWING_APP_STATE, "{}") !== nextAppState) {
      fileMap.set(DRAWING_APP_STATE, nextAppState);
    }
    if (filesChanged) {
      const fileRecords = ensureDrawingFilesMap(fileMap);
      for (const fileId of changedFileIds) {
        if (!(fileId in files)) continue;
        const next = JSON.stringify(files[fileId]);
        if (fileRecords.get(fileId) !== next) fileRecords.set(fileId, next);
      }
    }
    if (fileMap.get("status") === "clean") fileMap.set("status", "modified");
  }, "drawing-element-edit");
}

export function renameNote(doc: Y.Doc, id: string, newName: string) {
  const fileMap = getFilesMap(doc).get(id);
  if (!fileMap) throw new Error("File not found.");
  const fileType = (stringField(fileMap, "fileType") as WorkspaceFileType) || "markdown";
  const filename = normalizeWorkspaceFilename(newName, fileType);
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

export const folderManagedFileCount = folderMarkdownCount;

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
    const change: AtomicTreeChange = { path: currentPath, content: note.content };
    if (note.contentEncoding === "base64") change.contentEncoding = "base64";
    changes.set(currentPath, change);
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

/**
 * Verify the post-checkpoint GitHub reload before it may replace the live
 * Y.Doc. Folder markers are represented separately, so only file writes are
 * checked here.
 */
export function findPublishedChangeReloadMismatches(contents: ScopeContent[], changes: AtomicTreeChange[]) {
  const loadedFiles = new Map(
    contents.flatMap((content) => content.files).map((file) => [normalizeRepositoryPath(file.path).toLocaleLowerCase("en-US"), file.content]),
  );
  return changes
    .filter((change): change is AtomicTreeChange & { content: string } => typeof change.content === "string")
    .filter((change) => normalizeRepositoryPath(change.path).split("/").pop() !== ".gitkeep")
    .filter((change) => loadedFiles.get(normalizeRepositoryPath(change.path).toLocaleLowerCase("en-US")) !== change.content)
    .map((change) => normalizeRepositoryPath(change.path));
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
