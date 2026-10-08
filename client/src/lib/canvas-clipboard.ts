import { createClientId } from "./client-id";
import type { JsonCanvasEdge, JsonCanvasNode } from "./workspace-formats";

export const CANVAS_CLIPBOARD_MIME = "application/x-marktwin-canvas";
const CANVAS_CLIPBOARD_VERSION = 1;

export interface CanvasClipboardPayload {
  type: typeof CANVAS_CLIPBOARD_MIME;
  version: number;
  nodes: JsonCanvasNode[];
  edges: JsonCanvasEdge[];
}

export interface PastedCanvasSelection {
  nodes: JsonCanvasNode[];
  edges: JsonCanvasEdge[];
}

export function serializeCanvasSelection(nodes: JsonCanvasNode[], edges: JsonCanvasEdge[]): string {
  const selectedIds = new Set(nodes.map((node) => node.id));
  const payload: CanvasClipboardPayload = {
    type: CANVAS_CLIPBOARD_MIME,
    version: CANVAS_CLIPBOARD_VERSION,
    nodes: nodes.map((node) => ({ ...node })),
    edges: edges
      .filter((edge) => selectedIds.has(edge.fromNode) && selectedIds.has(edge.toNode))
      .map((edge) => ({ ...edge })),
  };
  return JSON.stringify(payload);
}

export function parseCanvasClipboard(value: string): CanvasClipboardPayload | null {
  try {
    const parsed = JSON.parse(value) as Partial<CanvasClipboardPayload>;
    if (
      parsed?.type !== CANVAS_CLIPBOARD_MIME
      || parsed.version !== CANVAS_CLIPBOARD_VERSION
      || !Array.isArray(parsed.nodes)
      || !Array.isArray(parsed.edges)
      || parsed.nodes.some((node) => !node || typeof node.id !== "string")
      || parsed.edges.some((edge) => !edge || typeof edge.id !== "string" || typeof edge.fromNode !== "string" || typeof edge.toNode !== "string")
    ) return null;
    return {
      type: CANVAS_CLIPBOARD_MIME,
      version: CANVAS_CLIPBOARD_VERSION,
      nodes: parsed.nodes.map((node) => ({ ...node })),
      edges: parsed.edges.map((edge) => ({ ...edge })),
    };
  } catch {
    return null;
  }
}

export function duplicateCanvasSelection(
  payload: CanvasClipboardPayload,
  offset = 32,
  idFactory: () => string = createClientId,
): PastedCanvasSelection {
  const idMap = new Map(payload.nodes.map((node) => [node.id, idFactory()]));
  const nodes = payload.nodes.map((node) => {
    const next = {
      ...node,
      id: idMap.get(node.id) || idFactory(),
      x: node.x + offset,
      y: node.y + offset,
    };
    if (typeof next.marktwinColumnId === "string" && idMap.has(next.marktwinColumnId)) {
      next.marktwinColumnId = idMap.get(next.marktwinColumnId);
    }
    return next;
  });
  const edges = payload.edges
    .filter((edge) => idMap.has(edge.fromNode) && idMap.has(edge.toNode))
    .map((edge) => ({
      ...edge,
      id: idFactory(),
      fromNode: idMap.get(edge.fromNode)!,
      toNode: idMap.get(edge.toNode)!,
    }));
  return { nodes, edges };
}
