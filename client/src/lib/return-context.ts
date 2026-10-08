import type { WorkspaceNote } from "./cabinet-files";
import { fullNotePath } from "./cabinet-files";

export interface ReturnContextFile { path: string; sha: string; fileType: WorkspaceNote["fileType"]; }
export interface ReturnContextSnapshot { commitSha: string; files: ReturnContextFile[]; decisionIds: string[]; }
export interface ReturnContextEntry { id: string; kind: "added" | "modified" | "deleted" | "decision" | "checkpoint"; label: string; path?: string; }

export function snapshotForNotes(notes: WorkspaceNote[], commitSha: string): ReturnContextSnapshot {
  const files = notes.filter((note) => note.status !== "deleted").map((note) => ({
    path: fullNotePath(note),
    sha: note.githubSha || `${note.status || "clean"}:${note.id}:${note.content.length}`,
    fileType: note.fileType,
  }));
  return { commitSha, files, decisionIds: [] };
}

export function diffReturnContext(previous: ReturnContextSnapshot | null, current: ReturnContextSnapshot): ReturnContextEntry[] {
  if (!previous) return [];
  const entries: ReturnContextEntry[] = [];
  const before = new Map(previous.files.map((file) => [file.path, file]));
  const after = new Map(current.files.map((file) => [file.path, file]));
  for (const [path, file] of after) {
    const old = before.get(path);
    if (!old) entries.push({ id: `added:${path}`, kind: "added", label: `Added ${path}`, path });
    else if (old.sha !== file.sha) entries.push({ id: `modified:${path}`, kind: "modified", label: `Changed ${path}`, path });
  }
  for (const path of before.keys()) if (!after.has(path)) entries.push({ id: `deleted:${path}`, kind: "deleted", label: `Removed ${path}`, path });
  if (!entries.length && previous.commitSha !== current.commitSha) entries.push({ id: `checkpoint:${current.commitSha}`, kind: "checkpoint", label: "A new checkpoint is available" });
  return entries;
}
