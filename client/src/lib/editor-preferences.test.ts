import { describe, expect, it } from "vitest";

import {
  defaultEditorPreferences,
  editorContentLayout,
  nextDocumentStatisticsMode,
  normalizeEditorPreferences,
} from "./editor-preferences";

describe("editor preferences", () => {
  it("defaults older devices to Live Markdown and an expanded Outline", () => {
    const preferences = normalizeEditorPreferences({ fontSize: 16, lineWrapping: false });
    expect(preferences.defaultMarkdownMode).toBe("live");
    expect(preferences.outlineCollapsed).toBe(false);
    expect(preferences.filesCollapsed).toBe(false);
    expect(preferences.outlineHeight).toBe(defaultEditorPreferences.outlineHeight);
    expect(preferences.rightPanelWidth).toBe(defaultEditorPreferences.rightPanelWidth);
    expect(preferences.highlightActiveLine).toBe(false);
    expect(preferences.fontFamily).toBe("sans");
    expect(preferences.documentStatisticsMode).toBe("both");
  });

  it("retains Source as a saved default and clamps panel dimensions", () => {
    const preferences = normalizeEditorPreferences({ defaultMarkdownMode: "source", filesCollapsed: true, outlineHeight: 10, rightPanelWidth: 900 });
    expect(preferences.defaultMarkdownMode).toBe("source");
    expect(preferences.filesCollapsed).toBe(true);
    expect(preferences.outlineHeight).toBe(120);
    expect(preferences.rightPanelWidth).toBe(600);
  });

  it("retains an explicit cursor-line background preference", () => {
    expect(normalizeEditorPreferences({ highlightActiveLine: true }).highlightActiveLine).toBe(true);
    expect(normalizeEditorPreferences({ highlightActiveLine: false }).highlightActiveLine).toBe(false);
  });

  it("persists writing width presets and column position", () => {
    expect(normalizeEditorPreferences({ contentWidth: "wide", contentAlignment: "right" })).toMatchObject({
      contentWidth: "wide",
      contentAlignment: "right",
    });
    expect(normalizeEditorPreferences({ contentWidth: "invalid", contentAlignment: "invalid" })).toMatchObject({
      contentWidth: "comfortable",
      contentAlignment: "center",
    });
  });

  it("keeps width and alignment on a border-box writing column", () => {
    expect(editorContentLayout("wide", "right")).toEqual({
      width: "100%",
      maxWidth: "90ch",
      margin: "0 0 0 auto",
      boxSizing: "border-box",
    });
  });

  it("normalizes and cycles the persistent document statistics preference", () => {
    expect(normalizeEditorPreferences({ documentStatisticsMode: "characters" }).documentStatisticsMode).toBe("characters");
    expect(normalizeEditorPreferences({ documentStatisticsMode: "words" }).documentStatisticsMode).toBe("words");
    expect(normalizeEditorPreferences({ documentStatisticsMode: "hidden" }).documentStatisticsMode).toBe("hidden");
    expect(normalizeEditorPreferences({ documentStatisticsMode: "invalid" }).documentStatisticsMode).toBe("both");

    expect(nextDocumentStatisticsMode("both")).toBe("characters");
    expect(nextDocumentStatisticsMode("characters")).toBe("words");
    expect(nextDocumentStatisticsMode("words")).toBe("hidden");
    expect(nextDocumentStatisticsMode("hidden")).toBe("both");
  });
});
