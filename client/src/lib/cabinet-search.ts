import type { SearchResult } from "@shared/schema";
import type { WorkspaceNote } from "./cabinet-files";
import { fullNotePath } from "./cabinet-files";
import { parseCanvas } from "./workspace-formats";

export function buildCabinetSearchIndex(notes: WorkspaceNote[]): SearchResult[] {
  const results: SearchResult[] = [];
  for (const note of notes) {
    const path = fullNotePath(note);
    results.push({ id: `file:${note.id}`, kind: "file", title: note.filename, path, excerpt: path, fileId: note.id });
    if (note.fileType === "markdown") {
      const lines = note.content.split(/\r?\n/);
      lines.forEach((line, index) => {
        const heading = line.match(/^#{1,6}\s+(.+?)\s*#*$/)?.[1];
        if (heading) results.push({ id: `heading:${note.id}:${index}`, kind: "heading", title: heading, path, excerpt: line.trim(), fileId: note.id, line: index + 1 });
        else if (line.trim()) results.push({ id: `text:${note.id}:${index}`, kind: "file", title: note.filename, path, excerpt: line.trim(), fileId: note.id, line: index + 1 });
      });
    }
    if (note.fileType === "canvas") {
      try {
        const canvas = parseCanvas(note.content);
        canvas.nodes.forEach((node) => {
          const cardText = node.type === "text" ? node.text : node.type === "group" ? node.label : node.type === "file" ? node.file : node.url;
          if (cardText) results.push({ id: `canvas:${note.id}:${node.id}`, kind: "canvas-card", title: cardText, path, excerpt: cardText, fileId: note.id });
        });
      } catch {
        // The file result remains searchable even when the Canvas is malformed.
      }
    }
  }
  return results;
}

export function searchCabinet(index: SearchResult[], query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return index.filter((result) => result.kind === "file").slice(0, 40);
  return index.filter((result) => [result.title, result.path, result.excerpt].filter(Boolean).join(" ").toLocaleLowerCase().includes(normalized)).slice(0, 80);
}
