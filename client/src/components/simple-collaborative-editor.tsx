import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2, Eye, Edit2, FlipVertical } from "lucide-react";
import type { Note } from "@shared/schema";
import MarkdownPreview from "./markdown-preview";
import { cn } from "@/lib/utils";
import FilePreview from './file-preview';
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { yCollab } from 'y-codemirror.next';
import { useTheme } from "@/contexts/theme-context";

interface SimpleCollaborativeEditorProps {
  note: Note;
  onContentChange: (content: string) => void;
  onModeChange: (mode: "raw" | "preview") => void;
  vaultId: number;
  mode: "raw" | "preview";
  vaultSlug: string;
  onSplitView?: () => void;
  readOnly?: boolean;
  isSplitPane?: boolean;
  ytext?: Y.Text;
  awareness?: Awareness;
}

export default function SimpleCollaborativeEditor({ 
  note, 
  onContentChange,
  onModeChange,
  vaultId,
  mode,
  vaultSlug,
  onSplitView,
  readOnly = false,
  isSplitPane = false,
  ytext,
  awareness
}: SimpleCollaborativeEditorProps) {
  const { theme } = useTheme();
  const [content, setContent] = useState(note.content);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const [collabInitialValue, setCollabInitialValue] = useState(() => ytext?.toString() ?? note.content);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const sourceRef = useRef({ noteId: note.id, ytext });

  // Keep collaborative editor initialization deterministic when switching notes/Y.Text sources.
  useEffect(() => {
    if (sourceRef.current.noteId === note.id && sourceRef.current.ytext === ytext) return;
    sourceRef.current = { noteId: note.id, ytext };

    const nextContent = ytext?.toString() ?? note.content;
    setContent(nextContent);
    setCollabInitialValue(nextContent);
    setEditorVersion((version) => version + 1);
  }, [note.id, note.content, ytext]);

  // If yCollab misses a late initial Yjs update, remount with Y.Text as the source of truth.
  useEffect(() => {
    if (!ytext) return;

    let frameId: number | null = null;
    const scheduleMismatchCheck = () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        const view = editorRef.current?.view;
        if (!view || view.state.doc.length === ytext.length) return;

        const targetDoc = ytext.toString();
        if (view.state.doc.toString() !== targetDoc) {
          setCollabInitialValue(targetDoc);
          setEditorVersion((version) => version + 1);
        }
      });
    };

    ytext.observe(scheduleMismatchCheck);
    scheduleMismatchCheck();

    return () => {
      ytext.unobserve(scheduleMismatchCheck);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [ytext, editorVersion]);

  useEffect(() => {
    if (ytext && mode !== "raw") {
      setCollabInitialValue(ytext.toString());
    }
  }, [mode, ytext]);

  const isImage = /\.(jpg|jpeg|png|gif|svg)$/i.test(note.filename);
  const isPdf = /\.pdf$/i.test(note.filename);

  const undoManager = useMemo(() => (ytext ? new Y.UndoManager(ytext) : null), [ytext]);

  const extensions = useMemo(() => {
    const nextExtensions: any[] = [markdown({ base: markdownLanguage })];
    if (ytext && awareness && undoManager) {
      nextExtensions.push(yCollab(ytext, awareness, { undoManager }));
    }
    return nextExtensions;
  }, [awareness, undoManager, ytext]);

  const handlePlainChange = useCallback((val: string) => {
    setContent(val);
    onContentChange(val);
  }, [onContentChange]);

  // Observe Yjs Document to trigger auto-save for both local and remote changes
  useEffect(() => {
    if (!ytext) return;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const observer = () => {
      const str = ytext.toString();
      setContent(str);
      if (!editorRef.current?.view) setCollabInitialValue(str);

      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        onContentChange(str);
      }, 500); // Debounce saves to prevent lag and network flooding
    };
    ytext.observe(observer);
    return () => {
      ytext.unobserve(observer);
      clearTimeout(timeoutId);
    };
  }, [ytext, onContentChange]);

  const handleToggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Update content when switching notes (if not driven by ytext)
  useEffect(() => {
    if (ytext) return;
    setContent(note.content);
  }, [note.id, note.content, ytext]);

  // If it's an image or PDF, we don't need the editor
  if (isImage || isPdf) {
    return (
      <FilePreview
        file={note}
        vaultSlug={vaultSlug}
      />
    );
  }

  const editorValue = ytext ? collabInitialValue : content;
  const editorKey = ytext ? `collab-${note.id}-${editorVersion}` : `plain-${note.id}`;
  const codeMirrorTheme = theme === "cream" || theme === "light" ? "light" : "dark";

  return (
    <div className={cn(
      "flex flex-col h-full relative",
      isFullscreen && "fixed inset-0 z-50 bg-[hsl(var(--obsidian-bg))]"
    )}>
      {/* Single toolbar with all buttons */}
      {!isSplitPane && (
        <div className="flex items-center justify-between p-2 border-b border-[hsl(var(--obsidian-border))] relative z-10 bg-[hsl(var(--obsidian-bg))]">
          <div className="flex items-center gap-2">
          {/* Mode toggle button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onModeChange(mode === "raw" ? "preview" : "raw")}
            className="flex items-center gap-2 text-[hsl(var(--obsidian-text-muted))] hover:text-[hsl(var(--obsidian-text))] hover:bg-[hsl(var(--obsidian-panel-hover))]"
            title={mode === "raw" ? "Switch to Preview" : "Switch to Edit"}
          >
            {mode === "raw" ? (
              <>
                <Eye className="h-4 w-4" />
                <span>Preview</span>
              </>
            ) : (
              <>
                <Edit2 className="h-4 w-4" />
                <span>Edit</span>
              </>
            )}
          </Button>

          {/* Split view button */}
          {onSplitView && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSplitView}
              className="flex items-center gap-2 text-[hsl(var(--obsidian-text-muted))] hover:text-[hsl(var(--obsidian-text))] hover:bg-[hsl(var(--obsidian-panel-hover))] px-3"
              title="Open in split view (⌘+S)"
            >
              <FlipVertical className="h-4 w-4" />
              <span className="font-medium">Split View</span>
            </Button>
          )}

          {/* Fullscreen button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleFullscreen}
            className="flex items-center gap-2 text-[hsl(var(--obsidian-text-muted))] hover:text-[hsl(var(--obsidian-text))] hover:bg-[hsl(var(--obsidian-panel-hover))]"
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="h-4 w-4" />
                <span>Exit Fullscreen</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-4 w-4" />
                <span>Fullscreen</span>
              </>
            )}
          </Button>
        </div>
      </div>
      )}

      {/* Editor area - absolutely positioned to prevent layout shifts */}
      <div className={cn(
        "absolute inset-0 bottom-0 overflow-auto",
        isSplitPane ? "top-0" : "top-[3rem]"
      )}>
        {mode === "raw" ? (
          <CodeMirror
            key={editorKey}
            ref={editorRef}
            value={editorValue}
            extensions={extensions}
            onChange={ytext ? undefined : handlePlainChange}
            readOnly={readOnly}
            theme={codeMirrorTheme}
            className="w-full h-full text-[15px] [&>.cm-editor]:h-full [&>.cm-editor]:outline-none [&_.cm-scroller]:font-mono [&_.cm-scroller]:p-4 [&_.cm-ySelectionInfo]:opacity-100 [&_.cm-ySelectionInfo]:font-sans [&_.cm-ySelectionInfo]:text-xs [&_.cm-ySelectionInfo]:px-1 [&_.cm-ySelectionInfo]:py-0.5 [&_.cm-ySelectionInfo]:rounded"
          />
        ) : (
          <div className="h-full overflow-auto bg-[hsl(var(--obsidian-bg))]">
            <MarkdownPreview
              content={content}
              vaultSlug={vaultSlug}
              notePath={note.path}
            />
          </div>
        )}
      </div>
    </div>
  );
}
