import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bold,
  Braces,
  Code2,
  Columns2,
  Columns3,
  Eye,
  Heading,
  Image as ImageIcon,
  Italic,
  Link,
  ListChecks,
  Maximize2,
  Minimize2,
  Minus,
  MoreHorizontal,
  PenLine,
  PanelRightClose,
  Quote,
  Strikethrough,
  Sigma,
  Underline,
  Workflow,
} from "lucide-react";
import * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView, type Command } from "@codemirror/view";
import { yCollab } from "y-codemirror.next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WorkspaceNote as Note } from "@/lib/cabinet-files";
import {
  editorContentLayout,
  nextDocumentStatisticsMode,
  updateEditorPreferences,
  useEditorPreferences,
} from "@/lib/editor-preferences";
import { collaborativeMarkdownPresence } from "@/lib/collaborative-markdown-presence";
import { COLLABORATION_EDITOR_RECOVERY_EVENT } from "@/lib/collaboration-update";
import { liveMarkdownExtension } from "@/lib/live-markdown-extension";
import { markdownSectionFolding, unfoldMarkdownAt } from "@/lib/markdown-section-folding";
import { readableTextHighlighting, textEditorLanguageForPath } from "@/lib/text-editor-language";
import { isMarkdownPath, textDocumentKindForPath, textDocumentLabelForPath } from "@/lib/text-files";
import { isSupportedImageFile } from "@/lib/workspace-images";
import { textStatistics } from "@/lib/text-stats";
import { isLightAppearanceTheme } from "@/lib/appearance-preferences";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/theme-context";
import { useI18n } from "@/contexts/i18n-context";
import MarkdownPreview from "./workspace-markdown-preview";
import "katex/dist/katex.min.css";

export type MarkdownEditorMode = "live" | "source" | "preview";

interface WorkspaceMarkdownEditorProps {
  note: Note;
  onContentChange: (content: string) => void;
  onModeChange: (mode: MarkdownEditorMode) => void;
  mode: MarkdownEditorMode;
  onSplitView?: () => void;
  readOnly?: boolean;
  isSplitPane?: boolean;
  ytext?: Y.Text;
  awareness?: Awareness;
  jumpToLine?: { line: number; nonce: number };
  resolveImage?: (source: string) => Promise<string | null>;
  onImageDrop?: (file: File) => Promise<string | null>;
  focusMode?: boolean;
  onFocusModeChange?: (focused: boolean) => void;
  compact?: boolean;
}

function replaceSelection(before: string, after = before, placeholder = "text"): Command {
  return (view) => {
    const selection = view.state.selection.main;
    const selected = view.state.sliceDoc(selection.from, selection.to);
    const body = selected || placeholder;
    const insert = `${before}${body}${after}`;
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert },
      selection: selected
        ? { anchor: selection.from + insert.length }
        : { anchor: selection.from + before.length, head: selection.from + before.length + body.length },
      scrollIntoView: true,
    });
    view.focus();
    return true;
  };
}

function insertBlock(template: string): Command {
  return (view) => {
    const selection = view.state.selection.main;
    const line = view.state.doc.lineAt(selection.from);
    const prefix = line.from === selection.from || view.state.sliceDoc(line.from, selection.from).trim() === "" ? "" : "\n";
    const suffix = selection.to < view.state.doc.length && view.state.sliceDoc(selection.to, Math.min(view.state.doc.length, selection.to + 1)) !== "\n" ? "\n" : "";
    view.dispatch({ changes: { from: selection.from, to: selection.to, insert: `${prefix}${template}${suffix}` }, selection: { anchor: selection.from + prefix.length + template.length }, scrollIntoView: true });
    view.focus();
    return true;
  };
}

function toggleHeading(view: EditorView) {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const match = line.text.match(/^(#{1,6})\s+/);
  const current = match?.[1].length || 0;
  const next = current === 1 ? 2 : current === 2 ? 3 : 1;
  view.dispatch({ changes: { from: line.from, to: line.from + (match?.[0].length || 0), insert: `${"#".repeat(next)} ` }, scrollIntoView: true });
  view.focus();
  return true;
}

function ToolbarButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <Button type="button" variant="ghost" size="sm" className="workspace-touch-control h-8 w-8 flex-none p-0" title={label} aria-label={label} disabled={disabled} onClick={onClick}>{children}</Button>;
}

export default function WorkspaceEditor({
  note,
  onContentChange,
  onModeChange,
  mode,
  onSplitView,
  readOnly = false,
  isSplitPane = false,
  ytext,
  awareness,
  jumpToLine,
  resolveImage,
  onImageDrop,
  focusMode = false,
  onFocusModeChange,
  compact = false,
}: WorkspaceMarkdownEditorProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const editorPreferences = useEditorPreferences();
  const [content, setContent] = useState(note.content);
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  const [editorVersion, setEditorVersion] = useState(0);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [imageSource, setImageSource] = useState("");
  const [imageDescription, setImageDescription] = useState("");
  const [collabInitialValue, setCollabInitialValue] = useState(() => ytext?.toString() ?? note.content);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const editorRootRef = useRef<HTMLDivElement>(null);
  const insertMoreTriggerRef = useRef<HTMLButtonElement>(null);
  const insertMoreOpenedByPointerRef = useRef(false);
  const lastSelectionRef = useRef({ anchor: 0, head: 0 });
  const [selectedText, setSelectedText] = useState("");
  const [selectionToolbar, setSelectionToolbar] = useState<{ left: number; top: number } | null>(null);
  const [slashMenu, setSlashMenu] = useState<{ left: number; top: number; from: number } | null>(null);
  const sourceRef = useRef({ noteId: note.id, ytext });
  const handledJumpRef = useRef<{ nonce: number; view: EditorView } | null>(null);
  const resolveImageRef = useRef(resolveImage);
  const onImageDropRef = useRef(onImageDrop);
  const onContentChangeRef = useRef(onContentChange);
  const isMarkdownDocument = isMarkdownPath(note.filename);
  const requestedMode: MarkdownEditorMode = isMarkdownDocument ? mode : "source";
  // The visual editor is backed by the exact Markdown source even when the
  // document is collaborative. Its decorations are presentation-only, so
  // every participant can edit the same Y.Text while still seeing rendered
  // headings, links, tasks, tables, code, and other Markdown blocks.
  const effectiveMode = requestedMode;
  const jumpToLineNumber = jumpToLine?.line;
  const jumpToLineNonce = jumpToLine?.nonce;

  useEffect(() => { onContentChangeRef.current = onContentChange; }, [onContentChange]);
  useEffect(() => { resolveImageRef.current = resolveImage; }, [resolveImage]);
  useEffect(() => { onImageDropRef.current = onImageDrop; }, [onImageDrop]);

  // Keep the CodeMirror extension stable while the parent reacts to a local
  // document update. The callbacks still resolve to their latest props, but
  // recreating the extension after the first keystroke would reset live
  // Markdown interaction state such as an active table source range.
  const resolveImageStable = useCallback((source: string) => resolveImageRef.current?.(source) ?? Promise.resolve(null), []);
  const onImageDropStable = useCallback((file: File) => onImageDropRef.current?.(file) ?? Promise.resolve(null), []);

  useEffect(() => {
    if (sourceRef.current.noteId === note.id && sourceRef.current.ytext === ytext) return;
    sourceRef.current = { noteId: note.id, ytext };
    const nextContent = ytext?.toString() ?? note.content;
    setContent(nextContent);
    setCollabInitialValue(nextContent);
    lastSelectionRef.current = { anchor: 0, head: 0 };
    setSelectedText("");
    setEditorVersion((version) => version + 1);
  }, [note.id, note.content, ytext]);

  useEffect(() => {
    if (!ytext) return;
    let recoveryTimer: number | null = null;
    const scheduleMismatchCheck = () => {
      if (recoveryTimer !== null) window.clearTimeout(recoveryTimer);
      // Yjs notifies its observers before CodeMirror has necessarily finished
      // applying the corresponding binding transaction. Waiting for a
      // settled mismatch prevents normal local typing from remounting the
      // editor and restoring a stale selection (notably while editing a live
      // Markdown table).
      recoveryTimer = window.setTimeout(() => {
        recoveryTimer = null;
        const view = editorRef.current?.view;
        const target = ytext.toString();
        if (view && view.state.sliceDoc() !== target) {
          setCollabInitialValue(target);
          setEditorVersion((version) => version + 1);
        }
      }, 250);
    };
    ytext.observe(scheduleMismatchCheck);
    scheduleMismatchCheck();
    return () => {
      ytext.unobserve(scheduleMismatchCheck);
      if (recoveryTimer !== null) window.clearTimeout(recoveryTimer);
    };
  }, [editorVersion, ytext]);

  useEffect(() => {
    if (!ytext) return;
    const recoverEditor = (event: Event) => {
      if (!(event instanceof CustomEvent) || event.detail !== ytext.doc) return;
      setCollabInitialValue(ytext.toString());
      setEditorVersion((version) => version + 1);
    };
    window.addEventListener(COLLABORATION_EDITOR_RECOVERY_EVENT, recoverEditor);
    return () => window.removeEventListener(COLLABORATION_EDITOR_RECOVERY_EVENT, recoverEditor);
  }, [ytext]);

  useEffect(() => {
    if (ytext && effectiveMode === "preview") setCollabInitialValue(ytext.toString());
  }, [effectiveMode, ytext]);

  useEffect(() => {
    if (jumpToLineNumber === undefined || effectiveMode === "preview") return;
    const view = editorRef.current?.view;
    if (!view) return;
    if (jumpToLineNonce !== undefined && handledJumpRef.current?.nonce === jumpToLineNonce && handledJumpRef.current.view === view) return;
    if (jumpToLineNonce !== undefined) handledJumpRef.current = { nonce: jumpToLineNonce, view };
    const line = view.state.doc.line(Math.max(1, Math.min(jumpToLineNumber, view.state.doc.lines)));
    if (isMarkdownDocument) unfoldMarkdownAt(view, line.from);
    view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: "center" }) });
    view.focus();
  }, [effectiveMode, isMarkdownDocument, jumpToLineNonce, jumpToLineNumber]);

  useEffect(() => {
    if (effectiveMode === "preview") return;
    const view = editorRef.current?.view;
    if (!view) return;
    const frame = requestAnimationFrame(() => view.requestMeasure());
    void document.fonts?.ready.then(() => view.requestMeasure());
    return () => cancelAnimationFrame(frame);
  }, [editorPreferences.contentAlignment, editorPreferences.contentWidth, editorPreferences.fontSize, effectiveMode]);

  const undoManager = useMemo(() => ytext ? new Y.UndoManager(ytext) : null, [ytext]);
  const isLive = isMarkdownDocument && effectiveMode === "live";
  const sourceFont = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, monospace";
  const writingFont = editorPreferences.fontFamily === "sans"
    ? "'Source Sans 3', -apple-system, BlinkMacSystemFont, sans-serif"
    : sourceFont;
  const documentKind = textDocumentKindForPath(note.filename);
  const editorFont = effectiveMode === "source" || (!isMarkdownDocument && documentKind !== "plain")
    ? sourceFont
    : writingFont;
  const markdownTheme = isLightAppearanceTheme(theme) ? "light" as const : "dark" as const;
  const lineSeparator = useMemo(() => (ytext?.toString() ?? note.content).includes("\r\n") ? "\r\n" : "\n", [note.content, ytext]);
  const contentLayout = useMemo(
    () => editorContentLayout(editorPreferences.contentWidth, editorPreferences.contentAlignment),
    [editorPreferences.contentAlignment, editorPreferences.contentWidth],
  );
  const basicSetup = useMemo(() => ({
    lineNumbers: editorPreferences.showLineNumbers,
    highlightActiveLine: effectiveMode === "source" && editorPreferences.highlightActiveLine,
    highlightActiveLineGutter: effectiveMode === "source" && editorPreferences.showLineNumbers && editorPreferences.highlightActiveLine,
    foldGutter: false,
    bracketMatching: true,
    closeBrackets: true,
    autocompletion: false,
    highlightSelectionMatches: true,
  }), [editorPreferences.highlightActiveLine, editorPreferences.showLineNumbers, effectiveMode]);

  const editorVisualTheme = useMemo(() => EditorView.theme({
    "&": { height: "100%", color: "hsl(var(--obsidian-text))", backgroundColor: "hsl(var(--obsidian-bg))", fontSize: `${editorPreferences.fontSize}px`, fontFamily: `${editorFont} !important` },
    "&.cm-focused": { outline: "none" },
    // Let the whole editor surface receive scroll input. The writing column
    // stays constrained and aligned inside it, so blank space around the
    // column no longer feels like a dead zone when the user scrolls.
    ".cm-scroller": { width: "100%", maxWidth: "none", margin: 0, boxSizing: "border-box", fontFamily: `${editorFont} !important`, lineHeight: "1.72", overflow: "auto" },
    // Keep CodeMirror's content and selection layer inside the configured
    // writing column. Without an explicit minimum width, a long line or a
    // block widget can widen the content box even while the content is capped
    // at 70ch/90ch, making mouse selections paint outside the column.
    ".cm-content": { ...contentLayout, minHeight: "100%", minWidth: 0, padding: isLive ? focusMode ? "64px 38px 96px" : "34px 38px 76px" : "20px 18px 48px", caretColor: "hsl(var(--obsidian-accent))", fontFamily: `${editorFont} !important` },
    ".cm-line": { padding: "0 2px", fontFamily: `${editorFont} !important` },
    ".cm-gutters": { paddingTop: isLive ? "28px" : "20px", border: "none", backgroundColor: "hsl(var(--obsidian-bg))", color: "hsl(var(--obsidian-text-muted) / 0.7)" },
    ".cm-lineNumbers .cm-gutterElement": { minWidth: "46px", padding: "0 12px 0 14px" },
    ".cm-activeLine": { backgroundColor: effectiveMode === "source" && editorPreferences.highlightActiveLine ? "hsl(var(--obsidian-accent) / 0.038)" : "transparent", borderRadius: "6px" },
    ".cm-activeLineGutter": { color: "hsl(var(--obsidian-accent))", backgroundColor: "transparent" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "hsl(var(--obsidian-accent))" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "hsl(var(--obsidian-accent) / 0.25) !important" },
  }, { dark: markdownTheme === "dark" }), [contentLayout, editorFont, editorPreferences.fontSize, editorPreferences.highlightActiveLine, effectiveMode, focusMode, isLive, markdownTheme]);

  const extensions = useMemo(() => {
    const next: any[] = [
      ...textEditorLanguageForPath(note.filename),
      readableTextHighlighting,
      EditorState.lineSeparator.of(lineSeparator),
      EditorView.contentAttributes.of({ spellcheck: editorPreferences.spellCheck ? "true" : "false", "aria-label": t(isLive ? "workspace.visualEditorFor" : "workspace.sourceEditorFor", { filename: note.filename }), dir: "auto" }),
      EditorView.domEventHandlers({
        // Remember the physical click position before live Markdown widgets
        // and focus handling get a chance to rebuild the presentation layer.
        // This keeps a subsequent first keystroke anchored to the clicked
        // line, even when the click lands on a replaced block widget.
        mousedown: (event, view) => {
          const mouseEvent = event as MouseEvent;
          if (mouseEvent.button !== 0) return false;
          const position = view.posAtCoords({ x: mouseEvent.clientX, y: mouseEvent.clientY });
          if (position !== null) lastSelectionRef.current = { anchor: position, head: position };
          return false;
        },
      }),
      EditorView.updateListener.of((update) => {
        if (!update.selectionSet && !update.docChanged) return;
        const selection = update.state.selection.main;
        const head = selection.head;
        lastSelectionRef.current = { anchor: selection.anchor, head };
        const line = update.state.doc.lineAt(head);
        const root = editorRootRef.current;
        const rootRect = root?.getBoundingClientRect();
        if (selection.empty) {
          setSelectedText("");
          setSelectionToolbar(null);
          const beforeCursor = update.state.sliceDoc(line.from, head);
          const cursor = update.view.coordsAtPos(head);
          if (isMarkdownDocument && !readOnly && /^\s*\/$/.test(beforeCursor) && rootRect) {
            const openSlashMenu = (nextCursor: ReturnType<EditorView["coordsAtPos"]>, nextRootRect: DOMRect, slashHead = head) => {
              if (!nextCursor) return false;
              setSlashMenu({
                from: slashHead - 1,
                left: Math.max(16, Math.min(nextRootRect.width - 16, nextCursor.left - nextRootRect.left)),
                top: Math.max(52, Math.min(nextRootRect.height - 250, nextCursor.bottom - nextRootRect.top + 8)),
              });
              return true;
            };
            if (!openSlashMenu(cursor, rootRect)) {
              setSlashMenu(null);
              window.requestAnimationFrame(() => {
                const nextSelection = update.view.state.selection.main;
                const nextHead = nextSelection.head;
                const nextLine = update.view.state.doc.lineAt(nextHead);
                const nextRootRect = editorRootRef.current?.getBoundingClientRect();
                if (
                  nextSelection.empty
                  && /^\s*\/$/.test(update.view.state.sliceDoc(nextLine.from, nextHead))
                  && nextRootRect
                ) {
                  openSlashMenu(update.view.coordsAtPos(nextHead), nextRootRect, nextHead);
                }
              });
            }
          } else {
            setSlashMenu(null);
          }
        } else {
          setSelectedText(update.state.sliceDoc(selection.from, selection.to));
          setSlashMenu(null);
          const anchor = update.view.coordsAtPos(selection.from);
          if (rootRect && anchor) {
            setSelectionToolbar({
              left: Math.max(128, Math.min(rootRect.width - 128, anchor.left - rootRect.left)),
              top: Math.max(54, anchor.top - rootRect.top - 44),
            });
          }
        }
        setCursorPosition({ line: line.number, column: head - line.from + 1 });
      }),
    ];
    if (isLive) {
      next.push(markdownSectionFolding());
      next.push(liveMarkdownExtension({
        readOnly,
        theme,
        resolveImage: resolveImage ? resolveImageStable : undefined,
        tableAddColumnLabel: t("workspace.addTableColumn"),
        tableAddRowLabel: t("workspace.addTableRow"),
        tableDeleteLabel: t("workspace.deleteTable"),
      }));
      if (ytext && awareness) next.push(collaborativeMarkdownPresence({ awareness, ytext }));
    }
    if (editorPreferences.lineWrapping) next.push(EditorView.lineWrapping);
    if (onImageDrop) {
      next.push(EditorView.domEventHandlers({
        dragover: (event) => {
          const dragEvent = event as DragEvent;
          if (!Array.from(dragEvent.dataTransfer?.items || []).some((item) => item.kind === "file" && item.type.startsWith("image/"))) return false;
          dragEvent.preventDefault();
          return true;
        },
        drop: (event, view) => {
          const dropEvent = event as DragEvent;
          const file = Array.from(dropEvent.dataTransfer?.files || []).find(isSupportedImageFile);
          if (!file) return false;
          dropEvent.preventDefault();
          const position = view.posAtCoords({ x: dropEvent.clientX, y: dropEvent.clientY }) ?? view.state.selection.main.head;
          void onImageDropStable(file).then((source) => {
            if (!source || !view.dom.isConnected) return;
            const description = file.name.replace(/\.[^./]+$/, "") || t("workspace.imageDescriptionPlaceholder");
            const markdown = `![${description}](${source})`;
            view.dispatch({ changes: { from: position, insert: markdown }, selection: { anchor: position + markdown.length }, scrollIntoView: true });
            view.focus();
          });
          return true;
        },
      }));
    }
    if (ytext && awareness && undoManager) next.push(yCollab(ytext, awareness, { undoManager }));
    return next;
  }, [awareness, editorPreferences.lineWrapping, editorPreferences.spellCheck, isLive, lineSeparator, note.filename, onImageDropStable, Boolean(onImageDrop), readOnly, resolveImageStable, Boolean(resolveImage), t, theme, undoManager, ytext]);

  const handlePlainChange = useCallback((value: string) => { setContent(value); onContentChange(value); }, [onContentChange]);

  useEffect(() => {
    if (!ytext) return;
    const observer = () => {
      const value = ytext.toString();
      setContent(value);
      if (!editorRef.current?.view) setCollabInitialValue(value);
      onContentChangeRef.current(value);
    };
    ytext.observe(observer);
    return () => ytext.unobserve(observer);
  }, [ytext]);

  useEffect(() => { if (!ytext) setContent(note.content); }, [note.content, note.id, ytext]);

  const run = (command: Command) => { const view = editorRef.current?.view; if (view && !readOnly) command(view); };
  const insertLink = () => {
    const url = window.prompt(t("workspace.linkUrl"));
    if (url) run(replaceSelection("[", `](${url})`, "link text"));
  };
  const openImageDialog = () => {
    const view = editorRef.current?.view;
    const selection = view?.state.selection.main;
    setImageDescription(view && selection ? view.state.sliceDoc(selection.from, selection.to) : "");
    setImageSource("");
    setImageDialogOpen(true);
  };
  const insertImage = () => {
    const source = imageSource.trim();
    const view = editorRef.current?.view;
    if (!source || !view || readOnly) return;
    const selection = view.state.selection.main;
    const selected = view.state.sliceDoc(selection.from, selection.to);
    const description = imageDescription.trim() || selected || t("workspace.imageDescriptionPlaceholder");
    const markdown = `![${description}](${source})`;
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: markdown },
      selection: { anchor: selection.from + markdown.length },
      scrollIntoView: true,
    });
    view.focus();
    setImageDialogOpen(false);
  };
  const runSlashCommand = (template: string, cursorOffset = template.length) => {
    const view = editorRef.current?.view;
    if (!view || !slashMenu || readOnly) return;
    const to = view.state.selection.main.head;
    view.dispatch({
      changes: { from: slashMenu.from, to, insert: template },
      selection: { anchor: slashMenu.from + cursorOffset },
      scrollIntoView: true,
    });
    setSlashMenu(null);
    view.focus();
  };
  const editorValue = ytext ? collabInitialValue : content;
  const editorKey = ytext ? `collab-${note.id}-${editorVersion}` : `plain-${note.id}`;
  const documentStats = useMemo(() => textStatistics(content), [content]);
  const selectionStats = useMemo(() => selectedText ? textStatistics(selectedText) : documentStats, [documentStats, selectedText]);
  const showingSelectionStats = selectedText.length > 0;
  const statisticsMode = editorPreferences.documentStatisticsMode;
  const nextStatisticsMode = nextDocumentStatisticsMode(statisticsMode);

  return (
    <div
      ref={editorRootRef}
      data-focus-mode={focusMode ? "true" : "false"}
      className={cn("relative flex h-full flex-col bg-[hsl(var(--obsidian-bg))]", focusMode && "workspace-editor-focused")}
    >
      {!compact && !focusMode && <div className={cn(
        "workspace-editor-toolbar z-20 flex h-12 flex-none items-center gap-2 overflow-x-auto px-2",
        "relative sm:justify-center",
      )}>
          {isMarkdownDocument ? <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="workspace-touch-control h-8 w-8 flex-none p-0" title={t("workspace.changeEditorView")} aria-label={t("workspace.changeEditorView")}>
                {effectiveMode === "live" ? <PenLine className="h-4 w-4" /> : effectiveMode === "source" ? <Braces className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => onModeChange("live")}><PenLine className="mr-2 h-4 w-4" />{t("workspace.editorVisual")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onModeChange("source")}><Braces className="mr-2 h-4 w-4" />{t("workspace.editorSource")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onModeChange("preview")}><Eye className="mr-2 h-4 w-4" />{t("workspace.editorPreview")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu> : <span className="flex-none rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg)/0.82)] px-2.5 py-1 text-xs font-medium text-[hsl(var(--obsidian-text-muted))]">{textDocumentLabelForPath(note.filename)}</span>}

          {isMarkdownDocument && effectiveMode !== "preview" && (
            <div className="workspace-editor-formatting flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-xl border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg)/0.82)] px-1 py-0.5 shadow-xs sm:flex-none">
              <ToolbarButton label={t("workspace.heading")} disabled={readOnly} onClick={() => { const view = editorRef.current?.view; if (view && !readOnly) toggleHeading(view); }}><Heading className="h-4 w-4" /></ToolbarButton>
              <ToolbarButton label={t("workspace.bold")} disabled={readOnly} onClick={() => run(replaceSelection("**"))}><Bold className="h-4 w-4" /></ToolbarButton>
              <ToolbarButton label={t("workspace.italic")} disabled={readOnly} onClick={() => run(replaceSelection("*"))}><Italic className="h-4 w-4" /></ToolbarButton>
              <ToolbarButton label={t("workspace.underline")} disabled={readOnly} onClick={() => run(replaceSelection("<u>", "</u>"))}><Underline className="h-4 w-4" /></ToolbarButton>
              <ToolbarButton label={t("workspace.strikethrough")} disabled={readOnly} onClick={() => run(replaceSelection("~~"))}><Strikethrough className="h-4 w-4" /></ToolbarButton>
              <ToolbarButton label={t("workspace.inlineCode")} disabled={readOnly} onClick={() => run(replaceSelection("`"))}><Code2 className="h-4 w-4" /></ToolbarButton>
              <ToolbarButton label={t("workspace.link")} disabled={readOnly} onClick={insertLink}><Link className="h-4 w-4" /></ToolbarButton>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    ref={insertMoreTriggerRef}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="workspace-touch-control h-8 w-8 flex-none p-0"
                    title={t("workspace.insertMore")}
                    aria-label={t("workspace.insertMore")}
                    data-testid="editor-insert-more-trigger"
                    disabled={readOnly}
                    onPointerDown={() => { insertMoreOpenedByPointerRef.current = true; }}
                    onKeyDown={() => { insertMoreOpenedByPointerRef.current = false; }}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  onCloseAutoFocus={(event) => {
                    if (!insertMoreOpenedByPointerRef.current) return;
                    event.preventDefault();
                    insertMoreOpenedByPointerRef.current = false;
                    insertMoreTriggerRef.current?.blur();
                  }}
                >
                  <DropdownMenuItem onSelect={openImageDialog}><ImageIcon className="mr-2 h-4 w-4" />{t("workspace.image")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => run(insertBlock("\n---\n"))}><Minus className="mr-2 h-4 w-4" />{t("workspace.horizontalRule")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => run(insertBlock("| Column 1 | Column 2 |\n| --- | --- |\n| Value | Value |"))}><Columns3 className="mr-2 h-4 w-4" />{t("workspace.table")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => run(insertBlock("$$\nE = mc^2\n$$"))}><Sigma className="mr-2 h-4 w-4" />{t("workspace.equation")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => run(insertBlock("```mermaid\nflowchart LR\n  A[Start] --> B[Finish]\n```"))}><Workflow className="mr-2 h-4 w-4" />{t("workspace.diagram")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => run(insertBlock("> Quote"))}><Quote className="mr-2 h-4 w-4" />{t("workspace.quote")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => run(insertBlock("> [!NOTE]\n> Write a note here."))}><ListChecks className="mr-2 h-4 w-4" />{t("workspace.callout")}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {onSplitView && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSplitView}
              className="workspace-touch-control hidden h-8 w-8 flex-none p-0 sm:inline-flex"
              title={t(isSplitPane ? "workspace.closeSplitView" : "workspace.openSplitView")}
              aria-label={t(isSplitPane ? "workspace.closeSplitView" : "workspace.openSplitView")}
            >
              {isSplitPane ? <PanelRightClose className="h-4 w-4" /> : <Columns2 className="h-4 w-4" />}
            </Button>
          )}
          {onFocusModeChange && <Button variant="ghost" size="sm" onClick={() => onFocusModeChange(!focusMode)} className="workspace-touch-control ml-auto h-8 w-8 flex-none p-0 sm:ml-0" aria-label={t(focusMode ? "workspace.exitFocusMode" : "workspace.enterFocusMode")} title={t(focusMode ? "workspace.exitFocusMode" : "workspace.enterFocusMode")}>{focusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Button>}
      </div>}

      {selectionToolbar && isMarkdownDocument && effectiveMode !== "preview" && !readOnly && (
        <div
          className="workspace-selection-toolbar absolute z-40 flex items-center gap-0.5 rounded-xl border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-sidebar)/0.96)] p-1 shadow-xl backdrop-blur"
          style={{ left: selectionToolbar.left, top: selectionToolbar.top, transform: "translateX(-50%)" }}
          role="toolbar"
          aria-label={t("workspace.formatSelection")}
        >
          <ToolbarButton label={t("workspace.heading")} onClick={() => { const view = editorRef.current?.view; if (view) toggleHeading(view); }}><Heading className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton label={t("workspace.bold")} onClick={() => run(replaceSelection("**"))}><Bold className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton label={t("workspace.italic")} onClick={() => run(replaceSelection("*"))}><Italic className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton label={t("workspace.underline")} onClick={() => run(replaceSelection("<u>", "</u>"))}><Underline className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton label={t("workspace.strikethrough")} onClick={() => run(replaceSelection("~~"))}><Strikethrough className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton label={t("workspace.inlineCode")} onClick={() => run(replaceSelection("`"))}><Code2 className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton label={t("workspace.link")} onClick={insertLink}><Link className="h-4 w-4" /></ToolbarButton>
        </div>
      )}

      {slashMenu && isMarkdownDocument && effectiveMode !== "preview" && !readOnly && (
        <div
          className="absolute z-40 w-56 overflow-hidden rounded-xl border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-sidebar)/0.98)] p-1 shadow-xl backdrop-blur"
          style={{ left: slashMenu.left, top: slashMenu.top }}
          role="menu"
          aria-label={t("workspace.slashCommands")}
        >
          <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--obsidian-text-muted))]">{t("workspace.slashCommands")}</p>
          <button type="button" role="menuitem" className="workspace-slash-command" onMouseDown={(event) => event.preventDefault()} onClick={() => runSlashCommand("## ")}><Heading className="h-4 w-4" />{t("workspace.heading")}</button>
          <button type="button" role="menuitem" className="workspace-slash-command" onMouseDown={(event) => event.preventDefault()} onClick={() => runSlashCommand("> ")}><Quote className="h-4 w-4" />{t("workspace.quote")}</button>
          <button type="button" role="menuitem" className="workspace-slash-command" onMouseDown={(event) => event.preventDefault()} onClick={() => runSlashCommand("> [!NOTE]\n> ")}><ListChecks className="h-4 w-4" />{t("workspace.callout")}</button>
          <button type="button" role="menuitem" className="workspace-slash-command" onMouseDown={(event) => event.preventDefault()} onClick={() => runSlashCommand("| Column 1 | Column 2 |\n| --- | --- |\n| Value | Value |\n")}><Columns3 className="h-4 w-4" />{t("workspace.table")}</button>
          <button type="button" role="menuitem" className="workspace-slash-command" onMouseDown={(event) => event.preventDefault()} onClick={() => runSlashCommand("```mermaid\nflowchart LR\n  A[Start] --> B[Finish]\n```\n")}><Workflow className="h-4 w-4" />{t("workspace.diagram")}</button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        {effectiveMode !== "preview" ? (
          <CodeMirror
            key={editorKey}
            ref={editorRef}
            value={editorValue}
            extensions={extensions}
            onCreateEditor={(view) => {
              const selection = lastSelectionRef.current;
              if (selection.anchor <= view.state.doc.length && selection.head <= view.state.doc.length) {
                view.dispatch({ selection });
              }
            }}
            onChange={ytext ? undefined : handlePlainChange}
            readOnly={readOnly}
            editable={!readOnly}
            placeholder={t("workspace.startWriting")}
            basicSetup={basicSetup}
            theme={editorVisualTheme}
            className="workspace-markdown-editor h-full w-full [&>.cm-editor]:h-full [&_.cm-ySelectionInfo]:rounded [&_.cm-ySelectionInfo]:px-1 [&_.cm-ySelectionInfo]:py-0.5 [&_.cm-ySelectionInfo]:font-sans [&_.cm-ySelectionInfo]:text-xs [&_.cm-ySelectionInfo]:opacity-100"
          />
        ) : <div className="h-full overflow-auto bg-[hsl(var(--obsidian-bg))]"><MarkdownPreview content={content} repositorySha={note.githubSha} resolveImage={resolveImage} /></div>}
      </div>

      {!focusMode && !compact && effectiveMode !== "preview" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex h-7 items-center justify-between pl-3 text-[11px] text-muted-foreground">
          <span>{readOnly ? t("workspace.readOnly") : effectiveMode === "source" ? `${textDocumentLabelForPath(note.filename)} · ${t("workspace.markdownSource")}` : null}</span>
          <div className="flex h-7 items-center font-mono">
            {effectiveMode === "source" && (
              <span className="bg-[hsl(var(--obsidian-bg))] px-2.5">
                {t("workspace.editorPosition", { line: cursorPosition.line, column: cursorPosition.column })}
              </span>
            )}
            <button
              type="button"
              data-testid="document-statistics-control"
              data-statistics-mode={statisticsMode}
              data-selection-counts={showingSelectionStats ? "true" : "false"}
              aria-label={t("workspace.cycleStatistics")}
              title={t("workspace.cycleStatistics")}
              onClick={() => updateEditorPreferences({ documentStatisticsMode: nextStatisticsMode })}
              className={cn(
                "pointer-events-auto flex h-7 items-center gap-3 rounded-tl-md text-[11px] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--obsidian-accent))]",
                statisticsMode === "hidden"
                  ? "w-7 bg-transparent p-0"
                  : "bg-[hsl(var(--obsidian-bg))] px-2.5",
              )}
            >
              {(statisticsMode === "both" || statisticsMode === "words") && (
                <span>{t("workspace.wordCount", { count: selectionStats.words })}</span>
              )}
              {(statisticsMode === "both" || statisticsMode === "characters") && (
                <span>{t("workspace.characterCount", { count: selectionStats.characters })}</span>
              )}
            </button>
          </div>
        </div>
      )}

      <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
        <DialogContent className="border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-sidebar))] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[hsl(var(--obsidian-text))]"><ImageIcon className="h-5 w-5 text-[hsl(var(--obsidian-accent))]" />{t("workspace.insertImage")}</DialogTitle>
            <DialogDescription>{t("workspace.imageDialogDescription")}</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); insertImage(); }}>
            <label htmlFor="markdown-image-source" className="block space-y-1.5 text-sm font-medium text-[hsl(var(--obsidian-text))]">
              <span>{t("workspace.imageLocation")}</span>
              <input
                id="markdown-image-source"
                autoFocus
                value={imageSource}
                onChange={(event) => setImageSource(event.target.value)}
                placeholder="images/diagram.png or https://…"
                className="w-full rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg))] px-3 py-2 text-sm text-[hsl(var(--obsidian-text))] outline-hidden placeholder:text-[hsl(var(--obsidian-text-muted))] focus:border-[hsl(var(--obsidian-accent))] focus:ring-2 focus:ring-[hsl(var(--obsidian-accent)/0.2)]"
              />
            </label>
            <label htmlFor="markdown-image-description" className="block space-y-1.5 text-sm font-medium text-[hsl(var(--obsidian-text))]">
              <span>{t("workspace.imageDescription")}</span>
              <input
                id="markdown-image-description"
                value={imageDescription}
                onChange={(event) => setImageDescription(event.target.value)}
                placeholder={t("workspace.imageDescriptionPlaceholder")}
                className="w-full rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg))] px-3 py-2 text-sm text-[hsl(var(--obsidian-text))] outline-hidden placeholder:text-[hsl(var(--obsidian-text-muted))] focus:border-[hsl(var(--obsidian-accent))] focus:ring-2 focus:ring-[hsl(var(--obsidian-accent)/0.2)]"
              />
            </label>
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setImageDialogOpen(false)}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={!imageSource.trim()}>{t("workspace.insertImage")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
