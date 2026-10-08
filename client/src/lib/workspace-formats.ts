import type { WorkspaceFileType } from "./workspace-github";

export const ALWAYS_AVAILABLE_WORKSPACE_FILE_TYPES = ["markdown", "canvas", "drawing"] as const satisfies readonly WorkspaceFileType[];

const OPTIONAL_WORKSPACE_FILE_TYPES = ["image", "asset"] as const satisfies readonly WorkspaceFileType[];

/** Keep the open core formats available while preserving configured optional types. */
export function alwaysAvailableWorkspaceFileTypes(configured?: readonly string[] | null): WorkspaceFileType[] {
  return [
    ...ALWAYS_AVAILABLE_WORKSPACE_FILE_TYPES,
    ...OPTIONAL_WORKSPACE_FILE_TYPES.filter((fileType) => configured?.includes(fileType)),
  ];
}

export interface JsonCanvasNode {
  id: string;
  type: "text" | "file" | "link" | "group";
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  text?: string;
  marktwinColumnId?: string;
  file?: string;
  artifactId?: string;
  subpath?: string;
  url?: string;
  label?: string;
  background?: string;
  backgroundStyle?: "cover" | "ratio" | "repeat";
  [key: string]: unknown;
}

export interface JsonCanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: "top" | "right" | "bottom" | "left";
  toSide?: "top" | "right" | "bottom" | "left";
  fromEnd?: "none" | "arrow";
  toEnd?: "none" | "arrow";
  color?: string;
  label?: string;
  [key: string]: unknown;
}

export interface JsonCanvasDocument {
  nodes: JsonCanvasNode[];
  edges: JsonCanvasEdge[];
  [key: string]: unknown;
}

export const emptyCanvasDocument: JsonCanvasDocument = Object.freeze({ nodes: [], edges: [] });

export function defaultContentForFileType(fileType: WorkspaceFileType) {
  if (fileType === "canvas") return serializeCanvas(emptyCanvasDocument);
  if (fileType === "drawing") {
    return `${JSON.stringify({
      type: "excalidraw",
      version: 2,
      source: "marktwin",
      elements: [],
      appState: { viewBackgroundColor: "#ffffff", gridSize: null },
      files: {},
    }, null, 2)}\n`;
  }
  if (fileType === "image") return "";
  if (fileType === "asset") return "";
  return "";
}

export function parseCanvas(content: string): JsonCanvasDocument {
  if (!content.trim()) return { nodes: [], edges: [] };
  const value = JSON.parse(content) as Partial<JsonCanvasDocument>;
  if (!value || typeof value !== "object" || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new Error("This file is not a valid JSON Canvas document.");
  }
  return { ...value, nodes: value.nodes, edges: value.edges };
}

export function serializeCanvas(document: JsonCanvasDocument) {
  const nodes = [...document.nodes]
    .map((node) => ({ ...node }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const edges = [...document.edges].sort((left, right) => left.id.localeCompare(right.id));
  return `${JSON.stringify({ ...document, nodes, edges }, null, 2)}\n`;
}

export function fileTypeLabel(fileType: WorkspaceFileType) {
  if (fileType === "canvas") return "Canvas";
  if (fileType === "drawing") return "Drawing";
  if (fileType === "image") return "Image";
  if (fileType === "asset") return "Asset";
  return "Text";
}

export function fileTypeExtension(fileType: WorkspaceFileType) {
  if (fileType === "canvas") return ".canvas";
  if (fileType === "drawing") return ".excalidraw";
  if (fileType === "image") return ".png";
  if (fileType === "asset") return ".bin";
  return ".md";
}
