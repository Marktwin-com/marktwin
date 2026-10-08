import * as Y from "yjs";

import {
  addWorkspaceFile,
  fullNotePath,
  getFilesMap,
  getFoldersMap,
  normalizeRepositoryPath,
  readCabinetNotes,
  readFolderRecords,
  setWorkspaceFileContent,
  type ScopeContent,
  type WorkspaceNote,
} from "./cabinet-files";
import { workspaceFileTypeUsesBase64 } from "./workspace-github";

export interface PublishedAtomicChange {
  path: string;
  content?: string;
  contentEncoding?: "utf8" | "base64";
  sha?: string | null;
}

function pathKey(path: string) {
  return normalizeRepositoryPath(path).toLocaleLowerCase("en-US");
}

function splitRepositoryPath(path: string) {
  const normalized = normalizeRepositoryPath(path);
  const parts = normalized.split("/").filter(Boolean);
  const filename = parts.pop() || normalized;
  return {
    filename,
    path: parts.length > 0 ? `${parts.join("/")}/` : "/",
  };
}

function incomingFiles(contents: ScopeContent[]) {
  const files = new Map<string, ScopeContent["files"][number]>();
  for (const content of contents) {
    for (const file of content.files) files.set(pathKey(file.path), { ...file, path: normalizeRepositoryPath(file.path) });
  }
  return files;
}

function incomingFolderMarkers(contents: ScopeContent[]) {
  return new Set(contents.flatMap((content) => content.folderMarkers).map((path) => pathKey(path)));
}

function noteByPath(notes: WorkspaceNote[], path: string) {
  const key = pathKey(path);
  return notes.find((note) => pathKey(fullNotePath(note)) === key);
}

/**
 * Advance the GitHub baseline after a successful direct publish without replacing
 * the live Yjs document. A network round trip may finish after the editor or a
 * collaborator has produced newer local changes. Those newer changes must remain
 * unpublished instead of being overwritten by the just-published snapshot.
 *
 * The direct publish path has already verified that every write in `publishedChanges`
 * is present in `finalContent`. This function therefore only reconciles local Yjs
 * state with that verified baseline; it never performs network conflict resolution.
 */
export function reconcilePublishedWorkspace(
  doc: Y.Doc,
  finalContent: ScopeContent[],
  publishedChanges: ReadonlyArray<PublishedAtomicChange>,
  mergeBaseline?: ReadonlyArray<WorkspaceNote>,
) {
  const filesMap = getFilesMap(doc);
  const foldersMap = getFoldersMap(doc);
  const finalFiles = incomingFiles(finalContent);
  const finalMarkers = incomingFolderMarkers(finalContent);
  const writePaths = new Set(
    publishedChanges
      .filter((change) => typeof change.content === "string")
      .map((change) => pathKey(change.path)),
  );
  const deletedPaths = new Set(
    publishedChanges
      .filter((change) => change.sha === null && typeof change.content !== "string")
      .map((change) => pathKey(change.path)),
  );

  const beforeNotes = readCabinetNotes(doc, 0, true);
  const beforeById = new Map(beforeNotes.map((note) => [note.id, note]));
  const mergeBaselineById = mergeBaseline
    ? new Map(mergeBaseline.map((note) => [note.id, note]))
    : null;
  const changedSinceMerge = new Set(
    mergeBaselineById
      ? beforeNotes
          .filter((note) => {
            const baseline = mergeBaselineById.get(note.id);
            return !baseline
              || normalizeRepositoryPath(fullNotePath(note)) !== normalizeRepositoryPath(fullNotePath(baseline))
              || note.content !== baseline.content
              || note.fileType !== baseline.fileType
              || note.status !== baseline.status;
          })
          .map((note) => note.id)
      : [],
  );
  const consumedIds = new Set<string>();

  doc.transact(() => {
    for (const [key, incoming] of finalFiles) {
      const direct = noteByPath(beforeNotes, incoming.path);
      const moveCandidate = direct || beforeNotes.find((note) => (
        note.status !== "deleted"
        && Boolean(note.originalPath)
        && deletedPaths.has(pathKey(note.originalPath!))
        && writePaths.has(key)
        && !finalFiles.has(pathKey(fullNotePath(note)))
      ));
      const note = moveCandidate;

      if (!note) {
        const createdId = addWorkspaceFile(doc, {
          filename: splitRepositoryPath(incoming.path).filename,
          path: splitRepositoryPath(incoming.path).path,
          content: incoming.content,
          contentEncoding: incoming.contentEncoding,
          fileType: incoming.fileType,
        });
        const createdMap = filesMap.get(createdId);
        if (!createdMap) continue;
        createdMap.set("githubSha", incoming.sha);
        createdMap.set("originalPath", incoming.path);
        // A file that was published and then deleted locally while the request
        // was in flight has no live record. Recreate only its deletion tombstone.
        createdMap.set("status", !mergeBaselineById && writePaths.has(key) ? "deleted" : "clean");
        consumedIds.add(createdId);
        continue;
      }

      consumedIds.add(note.id);
      const fileMap = filesMap.get(note.id);
      if (!fileMap) continue;
      const current = beforeById.get(note.id) || note;
      const currentPath = normalizeRepositoryPath(fullNotePath(current));
      const incomingPath = normalizeRepositoryPath(incoming.path);
      const publishedThisPath = writePaths.has(key);

      fileMap.set("githubSha", incoming.sha);
      fileMap.set("contentEncoding", incoming.contentEncoding || (workspaceFileTypeUsesBase64(incoming.fileType) ? "base64" : "utf8"));

      if (current.status === "deleted" && (!mergeBaselineById || changedSinceMerge.has(note.id))) {
        // The remote baseline contains the file, so this is a newer local
        // deletion (including deletion of a file that was just published).
        fileMap.set("originalPath", incomingPath);
        fileMap.set("status", "deleted");
        continue;
      }

      const localDiffersFromPublished = currentPath !== incomingPath || current.content !== incoming.content;
      const newerLocalChange = mergeBaselineById
        ? changedSinceMerge.has(note.id)
        : current.status !== "clean" && (!publishedThisPath || localDiffersFromPublished);

      if (newerLocalChange) {
        // Keep the current Y.Text and structural position untouched. Only move
        // its Git baseline forward so the next checkpoint diffs from the commit
        // that actually landed.
        fileMap.set("originalPath", incomingPath);
        fileMap.set("status", localDiffersFromPublished ? "modified" : "clean");
        continue;
      }

      // The live record is exactly what was published (or was clean before the
      // publish). Update it in place. setWorkspaceFileContent preserves the Y.Text
      // object, so CodeMirror/Yjs selection bindings do not get replaced.
      const split = splitRepositoryPath(incomingPath);
      fileMap.set("filename", split.filename);
      fileMap.set("path", split.path);
      fileMap.set("originalPath", incomingPath);
      if (current.content !== incoming.content) setWorkspaceFileContent(doc, note.id, incoming.content);
      fileMap.set("status", "clean");
    }

    for (const note of beforeNotes) {
      if (consumedIds.has(note.id)) continue;
      const currentMap = filesMap.get(note.id);
      if (!currentMap) continue;
      const currentPath = pathKey(fullNotePath(note));
      const originalPath = pathKey(note.originalPath || fullNotePath(note));

      if (mergeBaselineById) {
        if (!changedSinceMerge.has(note.id)) filesMap.delete(note.id);
        continue;
      }
      if (note.status === "deleted" && deletedPaths.has(originalPath)) {
        // This deletion is part of the verified commit and no longer needs a
        // local tombstone.
        filesMap.delete(note.id);
        continue;
      }
      if (note.status !== "clean") {
        // Added/modified work not included in the published snapshot happened
        // while the request was in flight. Leave it unpublished.
        continue;
      }
      if (!finalFiles.has(currentPath)) filesMap.delete(note.id);
    }

    const beforeFolders = readFolderRecords(doc, true);
    for (const folder of beforeFolders) {
      const markerPath = `${normalizeRepositoryPath(folder.path)}/.gitkeep`;
      const originalMarkerPath = `${normalizeRepositoryPath(folder.originalPath || folder.path)}/.gitkeep`;
      const markerKey = pathKey(markerPath);
      const originalMarkerKey = pathKey(originalMarkerPath);

      if (folder.status === "deleted" && deletedPaths.has(originalMarkerKey)) {
        foldersMap.delete(folder.path);
        continue;
      }
      if (folder.status !== "clean" && !writePaths.has(markerKey)) continue;
      if (finalMarkers.has(pathKey(folder.path))) {
        foldersMap.set(folder.path, { path: folder.path, originalPath: folder.path, status: "clean" });
      } else if (folder.status === "clean" || writePaths.has(markerKey)) {
        foldersMap.delete(folder.path);
      }
    }

    for (const content of finalContent) {
      for (const marker of content.folderMarkers) {
        const path = normalizeRepositoryPath(marker);
        if (!foldersMap.has(path)) foldersMap.set(path, { path, originalPath: path, status: "clean" });
      }
    }
  }, "github-publish-reconcile");
}
