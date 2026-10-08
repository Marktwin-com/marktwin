import type * as Y from "yjs";
import type { WorkspaceNote } from "./cabinet-files";

export const ARTIFACT_METADATA_FILENAME = "ARTIFACTS.md";
export const ARTIFACT_METADATA_DIRECTORY = ".marktwin/";

export interface ArtifactMetadataRecord {
  id: string;
  path: string;
}

export function isArtifactMetadataPath(path: string) {
  return path.replace(/^\/+/, "").toLocaleLowerCase("en-US") === `${ARTIFACT_METADATA_DIRECTORY}${ARTIFACT_METADATA_FILENAME}`.toLocaleLowerCase("en-US")
    || path.replace(/^\/+/, "").toLocaleLowerCase("en-US").endsWith(`/${ARTIFACT_METADATA_DIRECTORY}${ARTIFACT_METADATA_FILENAME}`.toLocaleLowerCase("en-US"));
}

export function artifactMetadataPathForScope(scope: string) {
  const normalized = scope === "/" ? "" : scope.replace(/^\/+|\/+$/g, "");
  return normalized ? `${normalized}/${ARTIFACT_METADATA_DIRECTORY}${ARTIFACT_METADATA_FILENAME}` : `${ARTIFACT_METADATA_DIRECTORY}${ARTIFACT_METADATA_FILENAME}`;
}

export function parseArtifactMetadata(content: string): ArtifactMetadataRecord[] {
  try {
    const parsed = JSON.parse(content) as { version?: unknown; artifacts?: unknown };
    if (parsed.version !== 1 || !Array.isArray(parsed.artifacts)) return [];
    return parsed.artifacts.filter((record): record is ArtifactMetadataRecord => Boolean(record && typeof record === "object" && typeof (record as ArtifactMetadataRecord).id === "string" && typeof (record as ArtifactMetadataRecord).path === "string"));
  } catch {
    return [];
  }
}

export function formatArtifactMetadata(notes: WorkspaceNote[]) {
  const artifacts = notes
    .filter((note) => note.status !== "deleted" && !isArtifactMetadataPath(`${note.path === "/" ? "" : note.path}${note.filename}`))
    .map((note) => ({ id: note.artifactId || note.id, path: `${note.path === "/" ? "" : note.path}${note.filename}` }))
    .sort((left, right) => left.path.localeCompare(right.path));
  return `${JSON.stringify({ version: 1, artifacts }, null, 2)}\n`;
}

export function artifactMetadataPath(doc: Y.Doc) {
  return (doc.getMap<string>("cabinet-metadata").get("artifactMetadataPath") || artifactMetadataPathForScope("/"));
}

export function setArtifactMetadataPath(doc: Y.Doc, path: string) {
  doc.getMap<string>("cabinet-metadata").set("artifactMetadataPath", path);
}
