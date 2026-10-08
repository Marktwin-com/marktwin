import type { ArtifactRef, ArtifactRelation } from "@shared/schema";
import type { WorkspaceNote } from "./cabinet-files";
import { fullNotePath } from "./cabinet-files";
import { parseCanvas } from "./workspace-formats";

function artifactRef(note: WorkspaceNote): ArtifactRef {
  return { id: note.artifactId || note.id, path: fullNotePath(note), fileType: note.fileType, label: note.filename };
}

function resolveRelativePath(sourcePath: string, target: string) {
  if (/^(?:[a-z]+:)?\/\//i.test(target) || target.startsWith("#")) return null;
  const clean = target.split("#")[0].trim();
  if (!clean) return null;
  if (clean.startsWith("/")) return clean.slice(1);
  const base = sourcePath.split("/").slice(0, -1);
  for (const segment of clean.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") base.pop(); else base.push(segment);
  }
  return base.join("/");
}

export function deriveArtifactRelations(notes: WorkspaceNote[]): ArtifactRelation[] {
  const byPath = new Map(notes.map((note) => [fullNotePath(note), artifactRef(note)]));
  const relations: ArtifactRelation[] = [];
  const add = (source: ArtifactRef, path: string, kind: ArtifactRelation["kind"], id?: string) => {
    const target = (id && notes.find((note) => (note.artifactId || note.id) === id)) || notes.find((note) => fullNotePath(note) === path);
    const targetRef = target ? artifactRef(target) : { id, path, fileType: "markdown" as const, label: path.split("/").pop() };
    const duplicate = relations.find((relation) => relation.source.id === source.id && relation.target.id === targetRef.id && relation.target.path === targetRef.path);
    if (duplicate) {
      if (kind === "decision") duplicate.kind = kind;
      return;
    }
    relations.push({ source, target: targetRef, kind, broken: !target });
  };

  for (const note of notes) {
    const source = artifactRef(note);
    if (note.fileType === "markdown") {
      const links = note.content.matchAll(/\]\(([^)]+)\)/g);
      for (const match of links) {
        const path = resolveRelativePath(source.path, match[1]);
        if (path) add(source, path, "references");
      }
    } else if (note.fileType === "canvas") {
      try {
        const canvas = parseCanvas(note.content);
        for (const node of canvas.nodes) {
          if (node.type === "file" && node.file) add(source, node.file, "references", node.artifactId);
        }
      } catch {
        // Broken Canvas files remain visible as files and can be repaired manually.
      }
    } else if (note.fileType === "drawing") {
      try {
        const drawing = JSON.parse(note.content) as { elements?: Array<{ link?: unknown }> };
        for (const element of drawing.elements || []) if (typeof element.link === "string") {
          const path = resolveRelativePath(source.path, element.link);
          if (path) add(source, path, "references");
        }
      } catch {
        // Ignore malformed drawing metadata.
      }
    }
  }

  for (const relation of relations) {
    if (!relation.broken && relation.target.id) {
      const target = byPath.get(relation.target.path);
      if (target) relation.target = target;
    }
  }
  return relations;
}

export function backlinksFor(relations: ArtifactRelation[], artifact: ArtifactRef) {
  return relations.filter((relation) => !relation.broken && (relation.target.id === artifact.id || relation.target.path === artifact.path));
}
