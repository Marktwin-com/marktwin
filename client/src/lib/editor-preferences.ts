import { useSyncExternalStore } from "react";

export type EditorFontFamily = "mono" | "sans";
export type EditorContentWidth = "comfortable" | "wide" | "full";
export type EditorContentAlignment = "left" | "center" | "right";
export type DefaultMarkdownMode = "live" | "source";
export type ImageDropLocation = "figures" | "note-folder" | "ask";
export type DocumentStatisticsMode = "both" | "characters" | "words" | "hidden";

export interface EditorPreferences {
  showLineNumbers: boolean;
  lineWrapping: boolean;
  highlightActiveLine: boolean;
  spellCheck: boolean;
  fontSize: number;
  fontFamily: EditorFontFamily;
  contentWidth: EditorContentWidth;
  contentAlignment: EditorContentAlignment;
  defaultMarkdownMode: DefaultMarkdownMode;
  filesCollapsed: boolean;
  outlineCollapsed: boolean;
  outlineHeight: number;
  rightPanelWidth: number;
  drawWithFinger: boolean;
  pressureSensitivity: number;
  strokeSmoothing: number;
  defaultPenWidth: number;
  drawingToolbarSide: "left" | "right";
  keepOfflineDrafts: boolean;
  showFiguresFolder: boolean;
  imageDropLocation: ImageDropLocation;
  documentStatisticsMode: DocumentStatisticsMode;
}

const STORAGE_KEY = "marktwin-editor-preferences";

export const defaultEditorPreferences: EditorPreferences = Object.freeze({
  showLineNumbers: false,
  lineWrapping: true,
  highlightActiveLine: false,
  spellCheck: true,
  fontSize: 16,
  fontFamily: "sans",
  contentWidth: "comfortable",
  contentAlignment: "center",
  defaultMarkdownMode: "live",
  filesCollapsed: false,
  outlineCollapsed: false,
  outlineHeight: 220,
  rightPanelWidth: 384,
  drawWithFinger: false,
  pressureSensitivity: 1,
  strokeSmoothing: 0.65,
  defaultPenWidth: 2,
  drawingToolbarSide: "left",
  keepOfflineDrafts: true,
  showFiguresFolder: false,
  imageDropLocation: "figures",
  documentStatisticsMode: "both",
});

let cachedPreferences: EditorPreferences | undefined;
const listeners = new Set<() => void>();

export function normalizeEditorPreferences(value: unknown): EditorPreferences {
  const candidate = value && typeof value === "object" ? value as Partial<EditorPreferences> : {};
  const fontSize = typeof candidate.fontSize === "number" ? candidate.fontSize : defaultEditorPreferences.fontSize;
  return {
    showLineNumbers: typeof candidate.showLineNumbers === "boolean" ? candidate.showLineNumbers : defaultEditorPreferences.showLineNumbers,
    lineWrapping: typeof candidate.lineWrapping === "boolean" ? candidate.lineWrapping : defaultEditorPreferences.lineWrapping,
    highlightActiveLine: typeof candidate.highlightActiveLine === "boolean" ? candidate.highlightActiveLine : defaultEditorPreferences.highlightActiveLine,
    spellCheck: typeof candidate.spellCheck === "boolean" ? candidate.spellCheck : defaultEditorPreferences.spellCheck,
    fontSize: Math.min(20, Math.max(13, Math.round(fontSize))),
    fontFamily: candidate.fontFamily === "mono" ? "mono" : "sans",
    contentWidth: candidate.contentWidth === "full" || candidate.contentWidth === "wide" ? candidate.contentWidth : "comfortable",
    contentAlignment: candidate.contentAlignment === "left" || candidate.contentAlignment === "right" ? candidate.contentAlignment : "center",
    defaultMarkdownMode: candidate.defaultMarkdownMode === "source" ? "source" : "live",
    filesCollapsed: candidate.filesCollapsed === true,
    outlineCollapsed: candidate.outlineCollapsed === true,
    outlineHeight: Math.min(480, Math.max(120, Math.round(typeof candidate.outlineHeight === "number" ? candidate.outlineHeight : defaultEditorPreferences.outlineHeight))),
    rightPanelWidth: Math.min(600, Math.max(200, Math.round(typeof candidate.rightPanelWidth === "number" ? candidate.rightPanelWidth : defaultEditorPreferences.rightPanelWidth))),
    drawWithFinger: candidate.drawWithFinger === true,
    pressureSensitivity: Math.min(2, Math.max(0, typeof candidate.pressureSensitivity === "number" ? candidate.pressureSensitivity : defaultEditorPreferences.pressureSensitivity)),
    strokeSmoothing: Math.min(1, Math.max(0, typeof candidate.strokeSmoothing === "number" ? candidate.strokeSmoothing : defaultEditorPreferences.strokeSmoothing)),
    defaultPenWidth: Math.min(12, Math.max(1, typeof candidate.defaultPenWidth === "number" ? candidate.defaultPenWidth : defaultEditorPreferences.defaultPenWidth)),
    drawingToolbarSide: candidate.drawingToolbarSide === "right" ? "right" : "left",
    keepOfflineDrafts: candidate.keepOfflineDrafts !== false,
    showFiguresFolder: candidate.showFiguresFolder === true,
    imageDropLocation: candidate.imageDropLocation === "note-folder" || candidate.imageDropLocation === "ask" ? candidate.imageDropLocation : "figures",
    documentStatisticsMode: candidate.documentStatisticsMode === "characters" || candidate.documentStatisticsMode === "words" || candidate.documentStatisticsMode === "hidden"
      ? candidate.documentStatisticsMode
      : "both",
  };
}

export function nextDocumentStatisticsMode(mode: DocumentStatisticsMode): DocumentStatisticsMode {
  if (mode === "both") return "characters";
  if (mode === "characters") return "words";
  if (mode === "words") return "hidden";
  return "both";
}

export function editorContentMaxWidth(contentWidth: EditorContentWidth) {
  if (contentWidth === "wide") return "90ch";
  if (contentWidth === "full") return "none";
  return "70ch";
}

export function editorContentMargin(contentAlignment: EditorContentAlignment) {
  if (contentAlignment === "left") return "0 auto 0 0";
  if (contentAlignment === "right") return "0 0 0 auto";
  return "0 auto";
}

/** Shared layout contract for the actual writing column in editor and preview. */
export function editorContentLayout(contentWidth: EditorContentWidth, contentAlignment: EditorContentAlignment) {
  return {
    width: "100%",
    maxWidth: editorContentMaxWidth(contentWidth),
    margin: editorContentMargin(contentAlignment),
    boxSizing: "border-box" as const,
  };
}

function readPreferences() {
  if (typeof window === "undefined") return defaultEditorPreferences;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? normalizeEditorPreferences(JSON.parse(saved)) : defaultEditorPreferences;
  } catch {
    return defaultEditorPreferences;
  }
}

function getSnapshot() {
  cachedPreferences ??= readPreferences();
  return cachedPreferences;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    cachedPreferences = readPreferences();
    listener();
  };
  window.addEventListener("storage", handleStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function updateEditorPreferences(updates: Partial<EditorPreferences>) {
  cachedPreferences = normalizeEditorPreferences({ ...getSnapshot(), ...updates });
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedPreferences));
  } catch {
    // The preferences still apply for this page when browser storage is unavailable.
  }
  listeners.forEach((listener) => listener());
}

export function resetEditorPreferences() {
  cachedPreferences = defaultEditorPreferences;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // The in-memory reset is sufficient when browser storage is unavailable.
  }
  listeners.forEach((listener) => listener());
}

export function useEditorPreferences() {
  return useSyncExternalStore(subscribe, getSnapshot, () => defaultEditorPreferences);
}
