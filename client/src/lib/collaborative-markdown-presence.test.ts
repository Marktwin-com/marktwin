import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, type DecorationSet } from "@codemirror/view";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import * as Y from "yjs";
import { describe, expect, it } from "vitest";

import { collaborativeMarkdownPresence, projectMarkdownPresencePosition } from "./collaborative-markdown-presence";

function markdownState(source: string, extensions: any[] = []) {
  return EditorState.create({ doc: source, extensions: [markdown({ base: markdownLanguage }), ...extensions] });
}

function directDecorationCount(state: EditorState) {
  let count = 0;
  for (const source of state.facet(EditorView.decorations)) {
    if (typeof source === "function") continue;
    (source as DecorationSet).between(0, state.doc.length, () => { count += 1; });
  }
  return count;
}

function syncYDocs(left: Y.Doc, right: Y.Doc) {
  const leftUpdate = Y.encodeStateAsUpdate(left, Y.encodeStateVector(right));
  const rightUpdate = Y.encodeStateAsUpdate(right, Y.encodeStateVector(left));
  Y.applyUpdate(left, rightUpdate);
  Y.applyUpdate(right, leftUpdate);
}

describe("collaborative Markdown presence", () => {
  it("projects remote carets in hidden inline markers without exposing source", () => {
    const source = "Text **bold** and [label](https://example.com).";
    const state = markdownState(source);
    expect(projectMarkdownPresencePosition(state, 6)).toEqual({ position: 7, block: false });
    expect(projectMarkdownPresencePosition(state, 12)).toEqual({ position: 11, block: false });
    const urlPosition = source.indexOf("https") + 4;
    expect(projectMarkdownPresencePosition(state, urlPosition)).toEqual({ position: source.indexOf("](https"), block: false });
    expect(projectMarkdownPresencePosition(state, 1)).toBeNull();
    expect(state.sliceDoc()).toBe(source);
  });

  it("projects table editing to the rendered block boundary", () => {
    const source = "Before\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n";
    const state = markdownState(source);
    const tableFrom = source.indexOf("| A");
    expect(projectMarkdownPresencePosition(state, source.indexOf("1 | 2"))).toEqual({ position: tableFrom, block: true });
  });

  it("projects remote carets from every fully replaced block to a visible boundary", () => {
    const source = [
      "# Heading",
      "",
      "![Diagram](diagram.png) {width=70%}",
      "",
      "```ts",
      "const value = '$notMath$';",
      "```",
      "",
      "$$",
      "x^2 + y^2",
      "$$",
      "",
      "> [!TIP] Shared hint",
    ].join("\n");
    const state = markdownState(source);
    expect(projectMarkdownPresencePosition(state, source.indexOf("Diagram"))).toEqual({ position: source.indexOf("![Diagram"), block: true });
    expect(projectMarkdownPresencePosition(state, source.indexOf("const value"))).toEqual({ position: source.indexOf("```ts"), block: true });
    expect(projectMarkdownPresencePosition(state, source.indexOf("x^2"))).toEqual({ position: source.indexOf("$$"), block: true });
    const calloutMarker = source.indexOf("[!TIP]");
    expect(projectMarkdownPresencePosition(state, calloutMarker + 2)).toEqual({ position: calloutMarker + 6, block: false });
  });

  it("projects heading and task whitespace hidden with their markers", () => {
    const source = "# Heading\n\n- [ ] Task\n";
    const state = markdownState(source);
    expect(projectMarkdownPresencePosition(state, 1)).toEqual({ position: 2, block: false });
    const taskMarker = source.indexOf("[ ]");
    expect(projectMarkdownPresencePosition(state, taskMarker + 1)).toEqual({ position: taskMarker + 4, block: false });
  });

  it("derives a projected decoration from a second synced Yjs client", () => {
    const source = "Text **bold** together.";
    const ownerDoc = new Y.Doc();
    const ownerText = ownerDoc.getText("content");
    ownerText.insert(0, source);
    const peerDoc = new Y.Doc();
    Y.applyUpdate(peerDoc, Y.encodeStateAsUpdate(ownerDoc));
    const peerText = peerDoc.getText("content");
    const ownerAwareness = new Awareness(ownerDoc);
    const peerAwareness = new Awareness(peerDoc);
    const markerPosition = source.indexOf("**") + 1;
    const relative = Y.createRelativePositionFromTypeIndex(peerText, markerPosition);
    peerAwareness.setLocalState({
      user: { name: "Peer", color: "#ff0066" },
      cursor: { anchor: relative, head: relative },
    });
    applyAwarenessUpdate(ownerAwareness, encodeAwarenessUpdate(peerAwareness, [peerAwareness.clientID]), "test");

    const state = markdownState(source, [collaborativeMarkdownPresence({ awareness: ownerAwareness, ytext: ownerText })]);
    expect(directDecorationCount(state)).toBeGreaterThan(0);
    expect(state.sliceDoc()).toBe(source);

    ownerAwareness.destroy();
    peerAwareness.destroy();
    ownerDoc.destroy();
    peerDoc.destroy();
  });

  it("keeps exact source consistent through concurrent edits, disconnect, deletion, undo, and redo", () => {
    const ownerDoc = new Y.Doc();
    const ownerText = ownerDoc.getText("content");
    ownerText.insert(0, "Start **bold** end");
    const peerDoc = new Y.Doc();
    syncYDocs(ownerDoc, peerDoc);
    const peerText = peerDoc.getText("content");
    const undoManager = new Y.UndoManager(ownerText, { captureTimeout: 0 });

    ownerText.insert(0, "Owner: ");
    peerText.insert(peerText.length, " :Peer");
    syncYDocs(ownerDoc, peerDoc);
    expect(peerText.toString()).toBe(ownerText.toString());

    const peerBold = peerText.toString().indexOf("bold");
    peerText.delete(peerBold + 1, 1);
    syncYDocs(ownerDoc, peerDoc);
    expect(peerText.toString()).toBe(ownerText.toString());
    expect(ownerText.toString()).toContain("**bld**");

    const peerWhileDisconnected = peerText.toString();
    ownerText.insert(ownerText.length, " offline");
    expect(peerText.toString()).toBe(peerWhileDisconnected);
    syncYDocs(ownerDoc, peerDoc);
    expect(peerText.toString()).toBe(ownerText.toString());

    undoManager.undo();
    syncYDocs(ownerDoc, peerDoc);
    expect(peerText.toString()).toBe(ownerText.toString());
    undoManager.redo();
    syncYDocs(ownerDoc, peerDoc);
    expect(peerText.toString()).toBe(ownerText.toString());

    undoManager.destroy();
    ownerDoc.destroy();
    peerDoc.destroy();
  });
});
