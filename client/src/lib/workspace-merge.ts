import { diff3Merge } from "node-diff3";

import type { FolderRecord, ScopeContent, WorkspaceNote } from "./cabinet-files";
import { fullNotePath, normalizeRepositoryPath, pathBelongsToScope, scopeForPath } from "./cabinet-files";
import type { AtomicTreeChange, WorkspaceFileContentEncoding, WorkspaceFileType } from "./workspace-github";
import { workspaceFileTypeForPath, workspaceFileTypeUsesBase64 } from "./workspace-github";

export interface MergeSnapshotFile {
  path: string;
  content: string;
  contentEncoding?: WorkspaceFileContentEncoding;
  fileType: WorkspaceFileType;
  originalPath?: string;
  deleted?: boolean;
}

export interface WorkspaceMergeSnapshot {
  files: MergeSnapshotFile[];
  folderMarkers: string[];
}

export type MergeConflictKind = "markdown" | "structured" | "add-add" | "delete-modify" | "path-collision";
export type MergeResolution = "auto" | "unresolved" | "local" | "incoming" | "both" | "manual";

export interface MergeHunk {
  id: string;
  base: string;
  local: string;
  incoming: string;
  markerStart: string;
  markerEnd: string;
}

export interface WorkspaceMergeItem {
  id: string;
  basePath?: string;
  resultPath: string;
  sourcePaths: string[];
  fileType: WorkspaceFileType;
  baseContent: string | null;
  localContent: string | null;
  incomingContent: string | null;
  resultContent: string | null;
  conflictKind?: MergeConflictKind;
  resolution: MergeResolution;
  hunks: MergeHunk[];
  changedBy: "local" | "incoming" | "both";
}

export interface WorkspaceMergePlan {
  items: WorkspaceMergeItem[];
  passthroughFiles: MergeSnapshotFile[];
  resultFolderMarkers: string[];
  scopes: string[];
}

function splitLines(content: string) {
  return content.match(/[^\n]*\n|[^\n]+$/g) || [];
}

function sameContent(left: string | null, right: string | null) {
  return left === right;
}

function changedBy(localChanged: boolean, incomingChanged: boolean): WorkspaceMergeItem["changedBy"] {
  return localChanged && incomingChanged ? "both" : localChanged ? "local" : "incoming";
}

function mergeMarkdown(base: string, local: string, incoming: string, itemId: string) {
  const regions = diff3Merge(splitLines(local), splitLines(base), splitLines(incoming), { excludeFalseConflicts: true });
  const hunks: MergeHunk[] = [];
  const result: string[] = [];
  for (const region of regions) {
    if (region.ok) {
      result.push(...region.ok);
      continue;
    }
    if (!region.conflict) continue;
    const id = `${itemId}-h${hunks.length + 1}`;
    const markerStart = `<<<<<<< LOCAL [marktwin-${id}]\n`;
    const markerEnd = `>>>>>>> GITHUB [marktwin-${id}]\n`;
    const hunk: MergeHunk = {
      id,
      base: region.conflict.o.join(""),
      local: region.conflict.a.join(""),
      incoming: region.conflict.b.join(""),
      markerStart,
      markerEnd,
    };
    hunks.push(hunk);
    result.push(
      markerStart,
      ...region.conflict.a,
      `||||||| BASE [marktwin-${id}]\n`,
      ...region.conflict.o,
      "=======\n",
      ...region.conflict.b,
      markerEnd,
    );
  }
  return { content: result.join(""), hunks };
}

function mergeFolderMarkers(base: string[], local: string[], incoming: string[]) {
  const baseSet = new Set(base);
  const localSet = new Set(local);
  const incomingSet = new Set(incoming);
  const result = new Set<string>();
  for (const path of new Set([...baseSet, ...localSet, ...incomingSet])) {
    const wasBase = baseSet.has(path);
    const isLocal = localSet.has(path);
    const isIncoming = incomingSet.has(path);
    const keep = isLocal === isIncoming ? isLocal : isLocal === wasBase ? isIncoming : isLocal;
    if (keep) result.add(path);
  }
  return Array.from(result).sort();
}

export function snapshotFromScopes(contents: ScopeContent[]): WorkspaceMergeSnapshot {
  return {
    files: contents.flatMap((scope) => scope.files.map((file) => ({
      path: file.path,
      content: file.content,
      ...(file.contentEncoding === "base64" ? { contentEncoding: "base64" as const } : {}),
      fileType: file.fileType,
    }))),
    folderMarkers: Array.from(new Set(contents.flatMap((scope) => scope.folderMarkers))).sort(),
  };
}

export function snapshotFromWorkspace(notes: WorkspaceNote[], folders: FolderRecord[]): WorkspaceMergeSnapshot {
  const activeFiles = notes.filter((note) => note.status !== "deleted");
  return {
    files: notes.map((note) => ({
      path: fullNotePath(note),
      content: note.content,
      ...(note.contentEncoding === "base64" ? { contentEncoding: "base64" as const } : {}),
      fileType: note.fileType,
      originalPath: note.originalPath,
      deleted: note.status === "deleted",
    })),
    folderMarkers: folders
      .filter((folder) => folder.status !== "deleted")
      .filter((folder) => !activeFiles.some((note) => fullNotePath(note).startsWith(`${folder.path}/`)))
      .map((folder) => folder.path)
      .sort(),
  };
}

function makeItem(input: Omit<WorkspaceMergeItem, "id" | "hunks"> & { idSeed: string }): WorkspaceMergeItem {
  const { idSeed, ...item } = input;
  return { ...item, id: idSeed.replace(/[^A-Za-z0-9_-]+/g, "-"), hunks: [] };
}

function mergeExistingFile(
  baseFile: MergeSnapshotFile,
  localFile: MergeSnapshotFile,
  incomingFile: MergeSnapshotFile | undefined,
  index: number,
): WorkspaceMergeItem | null {
  const localContent = localFile.deleted ? null : localFile.content;
  const incomingContent = incomingFile?.content ?? null;
  const localPath = localFile.deleted ? baseFile.path : localFile.path;
  const localChanged = localContent !== baseFile.content || localPath !== baseFile.path;
  const incomingChanged = incomingContent !== baseFile.content;
  if (!localChanged && !incomingChanged) return null;

  const item = makeItem({
    idSeed: `${index}-${baseFile.path}`,
    basePath: baseFile.path,
    resultPath: localChanged && !localFile.deleted ? localPath : baseFile.path,
    sourcePaths: [baseFile.path],
    fileType: localFile.fileType || baseFile.fileType,
    baseContent: baseFile.content,
    localContent,
    incomingContent,
    resultContent: null,
    resolution: "auto",
    changedBy: changedBy(localChanged, incomingChanged),
  });

  if (!localChanged) {
    item.resultContent = incomingContent;
    return item;
  }
  if (!incomingChanged) {
    item.resultContent = localContent;
    return item;
  }
  if (sameContent(localContent, incomingContent)) {
    item.resultContent = localContent;
    return item;
  }
  if (localContent === null || incomingContent === null) {
    item.conflictKind = "delete-modify";
    item.resolution = "unresolved";
    item.resultContent = localContent;
    return item;
  }
  if (item.fileType !== "markdown") {
    item.conflictKind = "structured";
    item.resolution = "unresolved";
    item.resultContent = localContent;
    return item;
  }

  const merged = mergeMarkdown(baseFile.content, localContent, incomingContent, item.id);
  item.resultContent = merged.content;
  item.hunks = merged.hunks;
  if (merged.hunks.length > 0) {
    item.conflictKind = "markdown";
    item.resolution = "unresolved";
  }
  return item;
}

export function planWorkspaceMerge(
  base: WorkspaceMergeSnapshot,
  local: WorkspaceMergeSnapshot,
  incoming: WorkspaceMergeSnapshot,
  scopes: string[],
): WorkspaceMergePlan {
  const baseByPath = new Map(base.files.map((file) => [file.path, file]));
  const incomingByPath = new Map(incoming.files.map((file) => [file.path, file]));
  const localByOriginal = new Map(local.files
    .filter((file) => file.originalPath || baseByPath.has(file.path))
    .map((file) => [file.originalPath || file.path, file]));
  const localAdded = local.files.filter((file) => !file.originalPath && !baseByPath.has(file.path) && !file.deleted);
  const consumedIncoming = new Set<string>();
  const items: WorkspaceMergeItem[] = [];
  const passthroughFiles: MergeSnapshotFile[] = [];
  let index = 0;

  for (const baseFile of base.files) {
    const localFile = localByOriginal.get(baseFile.path) || { ...baseFile, originalPath: baseFile.path };
    const incomingFile = incomingByPath.get(baseFile.path);
    if (incomingFile) consumedIncoming.add(incomingFile.path);
    const item = mergeExistingFile(baseFile, localFile, incomingFile, index++);
    if (item) items.push(item);
    else passthroughFiles.push({ ...baseFile });
  }

  for (const localFile of localAdded) {
    const incomingFile = incomingByPath.get(localFile.path);
    if (incomingFile && !baseByPath.has(incomingFile.path)) consumedIncoming.add(incomingFile.path);
    const same = incomingFile?.content === localFile.content;
    items.push(makeItem({
      idSeed: `${index++}-${localFile.path}`,
      resultPath: localFile.path,
      sourcePaths: incomingFile ? [incomingFile.path] : [],
      fileType: localFile.fileType,
      baseContent: null,
      localContent: localFile.content,
      incomingContent: incomingFile?.content ?? null,
      resultContent: localFile.content,
      conflictKind: incomingFile && !same ? "add-add" : undefined,
      resolution: incomingFile && !same ? "unresolved" : "auto",
      changedBy: incomingFile ? "both" : "local",
    }));
  }

  for (const incomingFile of incoming.files) {
    if (consumedIncoming.has(incomingFile.path) || baseByPath.has(incomingFile.path)) continue;
    items.push(makeItem({
      idSeed: `${index++}-${incomingFile.path}`,
      resultPath: incomingFile.path,
      sourcePaths: [incomingFile.path],
      fileType: incomingFile.fileType,
      baseContent: null,
      localContent: null,
      incomingContent: incomingFile.content,
      resultContent: incomingFile.content,
      resolution: "auto",
      changedBy: "incoming",
    }));
  }

  const itemsByPath = new Map<string, WorkspaceMergeItem[]>();
  for (const item of items) {
    if (item.resultContent === null) continue;
    const atPath = itemsByPath.get(item.resultPath.toLowerCase()) || [];
    atPath.push(item);
    itemsByPath.set(item.resultPath.toLowerCase(), atPath);
  }
  for (const collisions of itemsByPath.values()) {
    if (collisions.length < 2) continue;
    for (const item of collisions) {
      item.conflictKind = "path-collision";
      item.resolution = "unresolved";
    }
  }
  const passthroughPaths = new Set(passthroughFiles.map((file) => file.path.toLowerCase()));
  for (const item of items) {
    if (item.resultContent !== null && passthroughPaths.has(item.resultPath.toLowerCase())) {
      item.conflictKind = "path-collision";
      item.resolution = "unresolved";
    }
  }

  return {
    items: items.sort((left, right) => left.resultPath.localeCompare(right.resultPath)),
    passthroughFiles,
    resultFolderMarkers: mergeFolderMarkers(base.folderMarkers, local.folderMarkers, incoming.folderMarkers),
    scopes,
  };
}

function mergeItemIdentity(item: WorkspaceMergeItem) {
  return item.basePath || item.sourcePaths[0] || item.resultPath;
}

/**
 * Carry only decisions whose merge inputs are byte-for-byte unchanged. A
 * refreshed plan must leave a newly changed or ambiguous hunk unresolved so a
 * stale review can never overwrite newer live edits.
 */
export function carryMergeResolutions(previous: WorkspaceMergePlan, next: WorkspaceMergePlan): WorkspaceMergePlan {
  const previousByIdentity = new Map<string, WorkspaceMergeItem[]>();
  for (const item of previous.items) {
    const key = mergeItemIdentity(item);
    previousByIdentity.set(key, [...(previousByIdentity.get(key) || []), item]);
  }

  return {
    ...next,
    items: next.items.map((item) => {
      const candidate = previousByIdentity.get(mergeItemIdentity(item))?.find((previousItem) => (
        previousItem.resultPath === item.resultPath
        && previousItem.fileType === item.fileType
        && previousItem.baseContent === item.baseContent
        && previousItem.localContent === item.localContent
        && previousItem.incomingContent === item.incomingContent
        && previousItem.resolution !== "auto"
        && previousItem.resolution !== "unresolved"
        && !hasConflictMarkers(previousItem.resultContent)
      ));
      if (!candidate) return item;
      return {
        ...item,
        resultContent: candidate.resultContent,
        resolution: candidate.resolution,
      };
    }),
  };
}

export function hasConflictMarkers(content: string | null) {
  return Boolean(content && /^(?:<{7}|\|{7}|>{7})/m.test(content));
}

function acceptBoth(local: string, incoming: string) {
  if (!local || !incoming || local.endsWith("\n") || incoming.startsWith("\n")) return `${local}${incoming}`;
  return `${local}\n${incoming}`;
}

export function resolveMergeHunk(item: WorkspaceMergeItem, hunkId: string, choice: "local" | "incoming" | "both") {
  const hunk = item.hunks.find((candidate) => candidate.id === hunkId);
  if (!hunk || item.resultContent === null) return item;
  const start = item.resultContent.indexOf(hunk.markerStart);
  const endStart = item.resultContent.indexOf(hunk.markerEnd, start);
  if (start < 0 || endStart < 0) return item;
  const replacement = choice === "local" ? hunk.local : choice === "incoming" ? hunk.incoming : acceptBoth(hunk.local, hunk.incoming);
  const end = endStart + hunk.markerEnd.length;
  const resultContent = `${item.resultContent.slice(0, start)}${replacement}${item.resultContent.slice(end)}`;
  return {
    ...item,
    resultContent,
    resolution: hasConflictMarkers(resultContent) ? "unresolved" as const : "manual" as const,
  };
}

export function chooseMergeVersion(item: WorkspaceMergeItem, choice: "local" | "incoming" | "both") {
  const resultContent = choice === "local"
    ? item.localContent
    : choice === "incoming"
      ? item.incomingContent
      : item.localContent === null
        ? item.incomingContent
        : item.incomingContent === null
          ? item.localContent
          : acceptBoth(item.localContent, item.incomingContent);
  return { ...item, resultContent, resolution: choice };
}

export function updateMergeResult(item: WorkspaceMergeItem, resultContent: string, resultPath = item.resultPath) {
  return {
    ...item,
    resultContent,
    resultPath,
    resolution: hasConflictMarkers(resultContent) ? "unresolved" as const : "manual" as const,
  };
}

/** Re-run the file-level merge after the owner edits the Marktwin candidate. */
export function updateMergeLocal(item: WorkspaceMergeItem, localContent: string) {
  const preservePathConflict = item.conflictKind === "path-collision";
  const unresolved = (resultContent: string, conflictKind: MergeConflictKind, hunks: MergeHunk[] = []) => ({
    ...item,
    localContent,
    resultContent,
    conflictKind: preservePathConflict ? "path-collision" as const : conflictKind,
    resolution: "unresolved" as const,
    hunks,
  });
  const resolved = (resultContent: string, hunks: MergeHunk[] = []) => ({
    ...item,
    localContent,
    resultContent,
    conflictKind: preservePathConflict ? "path-collision" as const : undefined,
    resolution: preservePathConflict ? "unresolved" as const : "manual" as const,
    hunks,
  });

  if (item.incomingContent === null) {
    if (item.baseContent === null) return resolved(localContent);
    return unresolved(localContent, "delete-modify");
  }
  if (item.baseContent === null) {
    return localContent === item.incomingContent
      ? resolved(localContent)
      : unresolved(localContent, "add-add");
  }
  if (localContent === item.incomingContent) return resolved(localContent);
  if (localContent === item.baseContent) return resolved(item.incomingContent);
  if (item.incomingContent === item.baseContent) return resolved(localContent);
  if (item.fileType !== "markdown") return unresolved(localContent, "structured");

  const merged = mergeMarkdown(item.baseContent, localContent, item.incomingContent, item.id);
  return merged.hunks.length > 0
    ? unresolved(merged.content, "markdown", merged.hunks)
    : resolved(merged.content);
}

export function materializeMergePlan(plan: WorkspaceMergePlan): WorkspaceMergeSnapshot {
  const files = [...plan.passthroughFiles];
  for (const item of plan.items) {
    if (item.resultContent === null) continue;
    files.push({ path: item.resultPath, content: item.resultContent, ...(workspaceFileTypeUsesBase64(item.fileType) ? { contentEncoding: "base64" as const } : {}), fileType: item.fileType });
  }
  return { files: files.sort((left, right) => left.path.localeCompare(right.path)), folderMarkers: [...plan.resultFolderMarkers] };
}

/** Preserve file identity and deletion tombstones when a reviewed result becomes Local for a second merge. */
export function mergePlanAsLocalSnapshot(plan: WorkspaceMergePlan, reviewedBase: WorkspaceMergeSnapshot): WorkspaceMergeSnapshot {
  const baseByPath = new Map(reviewedBase.files.map((file) => [file.path, file]));
  const files: MergeSnapshotFile[] = plan.passthroughFiles.map((file) => ({
    ...file,
    originalPath: baseByPath.has(file.path) ? file.path : undefined,
  }));
  for (const item of plan.items) {
    const originalPath = item.basePath || item.sourcePaths.find((path) => baseByPath.has(path));
    if (item.resultContent === null) {
      if (!originalPath) continue;
      const original = baseByPath.get(originalPath);
      files.push({
        path: originalPath,
        content: original?.content ?? item.baseContent ?? item.incomingContent ?? "",
        ...(original?.contentEncoding === "base64" || workspaceFileTypeUsesBase64(item.fileType) ? { contentEncoding: "base64" as const } : {}),
        fileType: original?.fileType || item.fileType,
        originalPath,
        deleted: true,
      });
      continue;
    }
    files.push({
      path: item.resultPath,
      content: item.resultContent,
      ...(workspaceFileTypeUsesBase64(item.fileType) ? { contentEncoding: "base64" as const } : {}),
      fileType: item.fileType,
      originalPath,
    });
  }
  return {
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
    folderMarkers: [...plan.resultFolderMarkers],
  };
}

export function validateMergePlan(plan: WorkspaceMergePlan) {
  const errors: string[] = [];
  const paths = new Set<string>();
  for (const item of plan.items) {
    if (item.resolution === "unresolved" || hasConflictMarkers(item.resultContent)) errors.push(`${item.resultPath}: unresolved conflict`);
    if (item.resultContent === null) continue;
    let normalizedPath: string;
    try {
      normalizedPath = normalizeRepositoryPath(item.resultPath);
      if (!normalizedPath || normalizedPath !== item.resultPath) throw new Error("invalid");
    } catch {
      errors.push(`${item.resultPath || "(empty path)"}: invalid repository path`);
      continue;
    }
    const key = normalizedPath.toLowerCase();
    if (paths.has(key) || plan.passthroughFiles.some((file) => file.path.toLowerCase() === key)) errors.push(`${item.resultPath}: duplicate result path`);
    paths.add(key);
    if (!plan.scopes.some((scope) => pathBelongsToScope(normalizedPath, scope))) errors.push(`${item.resultPath}: outside configured folders`);
    if (workspaceFileTypeForPath(normalizedPath) !== item.fileType) errors.push(`${item.resultPath}: extension does not match its file type`);
    if (item.fileType !== "markdown" && !workspaceFileTypeUsesBase64(item.fileType)) {
      try { JSON.parse(item.resultContent); } catch { errors.push(`${item.resultPath}: invalid JSON`); }
    }
  }
  return Array.from(new Set(errors));
}

export function atomicChangesBetween(incoming: WorkspaceMergeSnapshot, result: WorkspaceMergeSnapshot): AtomicTreeChange[] {
  const before = new Map<string, { content: string; contentEncoding?: WorkspaceFileContentEncoding }>();
  const after = new Map<string, { content: string; contentEncoding?: WorkspaceFileContentEncoding }>();
  for (const file of incoming.files) before.set(file.path, { content: file.content, contentEncoding: file.contentEncoding });
  for (const marker of incoming.folderMarkers) before.set(`${marker}/.gitkeep`, { content: "" });
  for (const file of result.files) after.set(file.path, { content: file.content, contentEncoding: file.contentEncoding });
  for (const marker of result.folderMarkers) after.set(`${marker}/.gitkeep`, { content: "" });
  const changes: AtomicTreeChange[] = [];
  for (const path of new Set([...before.keys(), ...after.keys()])) {
    if (!after.has(path)) changes.push({ path, sha: null });
    else if (!before.has(path) || before.get(path)?.content !== after.get(path)?.content || before.get(path)?.contentEncoding !== after.get(path)?.contentEncoding) {
      const value = after.get(path)!;
      changes.push({ path, content: value.content, ...(value.contentEncoding === "base64" ? { contentEncoding: "base64" as const } : {}) });
    }
  }
  return changes.sort((left, right) => left.path.localeCompare(right.path));
}

export function scopeContentsFromSnapshot(snapshot: WorkspaceMergeSnapshot, scopes: string[]): ScopeContent[] {
  return scopes.map((scope) => ({
    scope,
    files: snapshot.files
      .filter((file) => pathBelongsToScope(file.path, scope))
      .map((file) => ({ ...file, name: file.path.split("/").pop() || file.path, sha: "" })),
    folderMarkers: snapshot.folderMarkers.filter((marker) => scopeForPath(`${marker}/.gitkeep`) === scope),
  }));
}
