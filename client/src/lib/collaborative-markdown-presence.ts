import { syntaxTree } from "@codemirror/language";
import { StateEffect, StateField, type EditorState, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import type { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { resolveUserIdentity } from "./user-identity";

export interface CollaborativeMarkdownPresenceConfig {
  awareness: Awareness;
  ytext: Y.Text;
}

const refreshProjectedPresence = StateEffect.define<void>();
const markerNodeNames = new Set(["HeaderMark", "EmphasisMark", "StrikethroughMark", "CodeMark", "ListMark", "QuoteMark", "TaskMarker", "Escape"]);

class ProjectedRemoteCaretWidget extends WidgetType {
  constructor(private color: string, private name: string, private block: boolean) { super(); }
  eq(other: ProjectedRemoteCaretWidget) { return this.color === other.color && this.name === other.name && this.block === other.block; }
  toDOM() {
    const element = document.createElement("span");
    element.className = `marktwin-projected-remote-caret${this.block ? " marktwin-projected-remote-caret-block" : ""}`;
    element.style.setProperty("--marktwin-remote-color", this.color);
    element.setAttribute("aria-label", `${this.name} is editing hidden Markdown source`);
    const label = document.createElement("span");
    label.className = "marktwin-projected-remote-caret-label";
    label.textContent = this.name;
    element.append(label);
    return element;
  }
  ignoreEvent() { return true; }
}

function followingHorizontalSpace(state: EditorState, position: number, limit: number) {
  let end = position;
  while (end < limit && /[\t ]/.test(state.sliceDoc(end, end + 1))) end += 1;
  return end;
}

function nearestMarkerBoundary(state: EditorState, node: SyntaxNode, position: number) {
  const parent = node.parent;
  if (!parent) return node.to;
  if (node.name === "Escape") return Math.min(node.from + 1, node.to);
  if (node.name === "HeaderMark" || node.name === "ListMark" || node.name === "QuoteMark" || node.name === "TaskMarker") {
    return followingHorizontalSpace(state, node.to, state.doc.lineAt(node.to).to);
  }
  const midpoint = parent.from + (parent.to - parent.from) / 2;
  return position <= midpoint ? node.to : node.from;
}

/** @internal Exported for deterministic presence mapping tests. */
export function projectMarkdownPresencePosition(state: EditorState, position: number) {
  const tree = syntaxTree(state);
  const bounded = Math.max(0, Math.min(state.doc.length, position));
  const candidates: SyntaxNode[] = [];
  for (const bias of [-1, 1] as const) {
    let node: SyntaxNode | null = tree.resolveInner(bounded, bias);
    while (node) {
      candidates.push(node);
      node = node.parent;
    }
  }
  const insideCode = candidates.some((node) => node.name === "FencedCode" || node.name === "CodeBlock");

  const currentLine = state.doc.lineAt(bounded);
  const trimmedLine = currentLine.text.trim();
  if (!insideCode && /^<\/?details>$/i.test(trimmedLine)) {
    return { position: bounded === currentLine.to ? currentLine.from : currentLine.to, block: false };
  }
  const summary = currentLine.text.match(/<summary>(.*?)<\/summary>/i);
  if (!insideCode && summary) {
    const openingFrom = currentLine.from + (summary.index ?? 0);
    const contentFrom = openingFrom + "<summary>".length;
    const contentTo = contentFrom + summary[1].length;
    const closingTo = openingFrom + summary[0].length;
    if (bounded >= openingFrom && bounded <= contentFrom) return { position: contentFrom, block: false };
    if (bounded >= contentTo && bounded <= closingTo) return { position: contentTo, block: false };
  }
  if (!insideCode && /^!\[[^\]]*\]\(.+\)(?:\s+\{width=\d{1,3}%\})?$/.test(trimmedLine)) {
    return { position: currentLine.from, block: true };
  }

  const callout = currentLine.text.match(/^\s*>\s*(\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\])/i);
  if (!insideCode && callout) {
    const markerFrom = currentLine.from + currentLine.text.indexOf(callout[1]);
    const markerTo = markerFrom + callout[1].length;
    if (bounded >= markerFrom && bounded <= markerTo) return { position: markerTo, block: false };
  }

  const inlineMath = /(?<!\\)\$(?!\s|\d+(?:[.,]\d+)?(?:\s|$))([^$\n]+?)(?<!\\)\$|\\\((.+?)\\\)/g;
  let mathMatch: RegExpExecArray | null;
  while (!insideCode && (mathMatch = inlineMath.exec(currentLine.text))) {
    const from = currentLine.from + mathMatch.index;
    const to = from + mathMatch[0].length;
    if (bounded >= from && bounded <= to) {
      return { position: bounded <= from + (to - from) / 2 ? from : to, block: false };
    }
  }

  for (let lineNumber = 1; !insideCode && lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const single = /^\s*(?:\$\$.+\$\$|\\\[.+\\\])\s*$/.test(line.text);
    if (single && bounded >= line.from && bounded <= line.to) return { position: line.from, block: true };
    if (!/^\s*(?:\$\$|\\\[)\s*$/.test(line.text)) continue;
    const dollar = line.text.includes("$$");
    const closing = dollar ? /^\s*\$\$\s*$/ : /^\s*\\\]\s*$/;
    let end = lineNumber + 1;
    while (end <= state.doc.lines && !closing.test(state.doc.line(end).text)) end += 1;
    if (end <= state.doc.lines) {
      const endLine = state.doc.line(end);
      if (bounded >= line.from && bounded <= endLine.to) return { position: line.from, block: true };
      lineNumber = end;
    }
  }

  for (const node of candidates) {
    if (markerNodeNames.has(node.name) && bounded >= node.from && bounded <= node.to) {
      return { position: nearestMarkerBoundary(state, node, bounded), block: false };
    }
    if (node.name === "Link" || node.name === "Image") {
      const marks = node.getChildren("LinkMark");
      if (marks.length >= 2) {
        const labelFrom = marks[0].to;
        const labelTo = marks[1].from;
        if (node.name === "Link" && state.sliceDoc(labelFrom, labelTo).startsWith("^")) {
          return { position: node.from, block: false };
        }
        if (bounded <= labelFrom) return { position: labelFrom, block: false };
        if (bounded >= labelTo) return { position: labelTo, block: false };
      }
    }
    if (node.name === "Table") return { position: node.from, block: true };
    if (node.name === "FencedCode" || node.name === "CodeBlock") return { position: node.from, block: true };
  }
  return null;
}

function buildProjectedPresence(state: EditorState, config: CollaborativeMarkdownPresenceConfig): DecorationSet {
  const ranges: Array<Range<Decoration>> = [];
  const doc = config.ytext.doc;
  if (!doc) return Decoration.none;

  for (const [clientId, presence] of config.awareness.getStates()) {
    if (clientId === config.awareness.clientID) continue;
    const cursor = presence?.cursor;
    if (!cursor?.head) continue;
    const head = Y.createAbsolutePositionFromRelativePosition(cursor.head, doc);
    if (!head || head.type !== config.ytext) continue;
    const projection = projectMarkdownPresencePosition(state, head.index);
    if (!projection || projection.position === head.index) continue;
    const user = presence.user || {};
    const name = typeof user.name === "string" && user.name.trim() ? user.name.trim() : "Collaborator";
    const color = typeof user.color === "string" ? user.color : resolveUserIdentity({ displayName: name }, `awareness:${clientId}`).color;
    ranges.push(Decoration.widget({
      widget: new ProjectedRemoteCaretWidget(color, name, projection.block),
      side: projection.position <= head.index ? -1 : 1,
    }).range(projection.position));
  }
  return Decoration.set(ranges, true);
}

export function collaborativeMarkdownPresence(config: CollaborativeMarkdownPresenceConfig): Extension {
  const field = StateField.define<DecorationSet>({
    create(state) { return buildProjectedPresence(state, config); },
    update(value, transaction) {
      if (transaction.docChanged || transaction.effects.some((effect) => effect.is(refreshProjectedPresence))) {
        return buildProjectedPresence(transaction.state, config);
      }
      return value;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
  const awarenessPlugin = ViewPlugin.fromClass(class {
    private frame: number | null = null;
    private refresh = () => {
      if (this.frame !== null) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        this.view.dispatch({ effects: refreshProjectedPresence.of() });
      });
    };
    constructor(private view: EditorView) { config.awareness.on("change", this.refresh); }
    destroy() {
      config.awareness.off("change", this.refresh);
      if (this.frame !== null) cancelAnimationFrame(this.frame);
    }
  });
  return [field, awarenessPlugin];
}
