import { describe, expect, it } from "vitest";

import { CANVAS_CLIPBOARD_MIME, duplicateCanvasSelection, parseCanvasClipboard, serializeCanvasSelection } from "./canvas-clipboard";
import type { JsonCanvasEdge, JsonCanvasNode } from "./workspace-formats";

const node = (id: string, type: JsonCanvasNode["type"], extra: Partial<JsonCanvasNode> = {}): JsonCanvasNode => ({
  id,
  type,
  x: 10,
  y: 20,
  width: 160,
  height: 100,
  ...extra,
});

describe("canvas clipboard payloads", () => {
  it("copies only edges whose endpoints are both selected", () => {
    const nodes = [node("card", "text"), node("column", "group")];
    const edges: JsonCanvasEdge[] = [
      { id: "inside", fromNode: "card", toNode: "column" },
      { id: "outside", fromNode: "card", toNode: "missing" },
    ];
    const payload = parseCanvasClipboard(serializeCanvasSelection(nodes, edges));
    expect(payload?.type).toBe(CANVAS_CLIPBOARD_MIME);
    expect(payload?.edges.map((edge) => edge.id)).toEqual(["inside"]);
  });

  it("remaps node, edge, and column IDs while offsetting the pasted selection", () => {
    const payload = parseCanvasClipboard(serializeCanvasSelection([
      node("card", "text", { marktwinColumnId: "column" }),
      node("column", "group"),
    ], [{ id: "edge", fromNode: "card", toNode: "column" }]))!;
    let nextId = 0;
    const pasted = duplicateCanvasSelection(payload, 32, () => `new-${++nextId}`);
    expect(pasted.nodes.map((item) => item.id)).toEqual(["new-1", "new-2"]);
    expect(pasted.nodes[0].marktwinColumnId).toBe("new-2");
    expect(pasted.nodes[0].x).toBe(42);
    expect(pasted.nodes[0].y).toBe(52);
    expect(pasted.edges).toEqual([{ id: "new-3", fromNode: "new-1", toNode: "new-2" }]);
  });

  it("rejects unrelated clipboard text", () => {
    expect(parseCanvasClipboard("hello from another application")).toBeNull();
  });
});
