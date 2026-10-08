import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from "react";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";

import type { WorkspaceNote } from "@/lib/cabinet-files";
import WorkspaceMarkdownEditor from "./workspace-editor";
import type { MarkdownEditorMode } from "./workspace-editor";
import { useI18n } from "@/contexts/i18n-context";
import { imageDataUrl } from "@/lib/workspace-images";
import { workspaceAssetDataUrl, workspaceAssetPreviewKind } from "@/lib/workspace-assets";

const WorkspaceCanvasEditor = lazy(() => import("./workspace-canvas-editor"));
const WorkspaceDrawingEditor = lazy(() => import("./workspace-drawing-editor"));

function EditorLoading() {
  const { t } = useI18n();
  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground" role="status">{t("workspace.editorLoading")}</div>;
}

interface EditorErrorLabels {
  title: string;
  description: string;
  primary: string;
  retry?: string;
}

class DrawingErrorBoundary extends Component<{
  children: ReactNode;
  resetKey: string;
  labels: EditorErrorLabels;
}, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Drawing editor could not render the scene", error, info);
  }

  componentDidUpdate(previous: Readonly<{ children: ReactNode; resetKey: string }>) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full items-center justify-center bg-[hsl(var(--obsidian-bg))] p-6 text-center">
        <div className="max-w-md rounded-lg border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-panel))] p-5">
          <p className="font-medium text-[hsl(var(--obsidian-text))]" role="alert">{this.props.labels.title}</p>
          <p className="mt-2 text-sm text-muted-foreground">{this.props.labels.description}</p>
          <button
            type="button"
            className="mt-4 rounded-md border border-[hsl(var(--obsidian-border))] px-3 py-2 text-sm hover:bg-[hsl(var(--obsidian-panel-hover))]"
            onClick={() => this.setState({ error: null })}
          >
            {this.props.labels.primary}
          </button>
        </div>
      </div>
    );
  }
}

class MarkdownErrorBoundary extends Component<{
  children: ReactNode;
  resetKey: string;
  onUseSource: () => void;
  labels: EditorErrorLabels;
}, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Markdown editor could not render the document", error, info);
  }

  componentDidUpdate(previous: Readonly<{ children: ReactNode; resetKey: string; onUseSource: () => void }>) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full items-center justify-center bg-[hsl(var(--obsidian-bg))] p-6 text-center">
        <div className="max-w-md rounded-lg border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-panel))] p-5">
          <p className="font-medium text-[hsl(var(--obsidian-text))]" role="alert">{this.props.labels.title}</p>
          <p className="mt-2 text-sm text-muted-foreground">{this.props.labels.description}</p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              className="rounded-md bg-[hsl(var(--obsidian-accent))] px-3 py-2 text-sm text-white hover:opacity-90"
              onClick={() => {
                this.setState({ error: null });
                this.props.onUseSource();
              }}
            >
              {this.props.labels.primary}
            </button>
            <button
              type="button"
              className="rounded-md border border-[hsl(var(--obsidian-border))] px-3 py-2 text-sm hover:bg-[hsl(var(--obsidian-panel-hover))]"
              onClick={() => this.setState({ error: null })}
            >
              {this.props.labels.retry}
            </button>
          </div>
        </div>
      </div>
    );
  }
}

function ImageFilePreview({ file }: { file: WorkspaceNote }) {
  const { t } = useI18n();
  const source = imageDataUrl(file.content, file.filename);
  if (!source) return <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">{t("workspace.repositoryImageUnavailable", { source: file.filename })}</div>;
  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-auto bg-[hsl(var(--obsidian-bg))] p-8">
      <img src={source} alt={file.filename} className="max-h-full max-w-full rounded-xl border border-[hsl(var(--obsidian-border))] object-contain shadow-xs" />
    </div>
  );
}

function AssetFilePreview({ file }: { file: WorkspaceNote }) {
  const { t } = useI18n();
  const source = workspaceAssetDataUrl(file.content, file.filename);
  const kind = workspaceAssetPreviewKind(file.filename);
  if (!source) return <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">{t("workspace.assetUnavailable")}</div>;
  if (kind === "image") return <div className="flex h-full min-h-0 items-center justify-center overflow-auto bg-[hsl(var(--obsidian-bg))] p-8"><img src={source} alt={file.filename} className="max-h-full max-w-full rounded-xl border border-[hsl(var(--obsidian-border))] object-contain shadow-xs" /></div>;
  if (kind === "video") return <div className="flex h-full min-h-0 items-center justify-center overflow-auto bg-[hsl(var(--obsidian-bg))] p-8"><video src={source} controls className="max-h-full max-w-full rounded-xl border border-[hsl(var(--obsidian-border))] shadow-xs" /></div>;
  if (kind === "audio") return <div className="flex h-full items-center justify-center bg-[hsl(var(--obsidian-bg))] p-8"><audio src={source} controls /></div>;
  if (kind === "pdf") return <iframe title={file.filename} src={source} className="h-full w-full border-0 bg-white" />;
  return <div className="flex h-full items-center justify-center bg-[hsl(var(--obsidian-bg))] p-8"><a href={source} download={file.filename} className="rounded-md bg-[hsl(var(--obsidian-accent))] px-4 py-2 text-sm font-medium text-white hover:opacity-90">{t("workspace.downloadAsset", { filename: file.filename })}</a></div>;
}

interface WorkspaceFileEditorProps {
  file: WorkspaceNote;
  files: WorkspaceNote[];
  onContentChange: (content: string) => void;
  onOpenFile: (fileId: string) => void;
  onModeChange: (mode: MarkdownEditorMode) => void;
  mode: MarkdownEditorMode;
  onSplitView?: () => void;
  readOnly?: boolean;
  isSplitPane?: boolean;
  ydoc?: Y.Doc;
  ytext?: Y.Text;
  awareness?: Awareness;
  jumpToLine?: { line: number; nonce: number };
  resolveImage?: (source: string) => Promise<string | null>;
  onImageDrop?: (file: File) => Promise<string | null>;
  onCanvasImageDrop?: (file: File) => Promise<string | null>;
  focusMode?: boolean;
  onFocusModeChange?: (focused: boolean) => void;
  compact?: boolean;
}

export default function WorkspaceFileEditor(props: WorkspaceFileEditorProps) {
  const { t } = useI18n();
  if (props.file.fileType === "image") return <ImageFilePreview file={props.file} />;
  if (props.file.fileType === "asset") return <AssetFilePreview file={props.file} />;
  if (props.file.fileType === "canvas") {
    return <Suspense fallback={<EditorLoading />}><WorkspaceCanvasEditor key={props.file.id} file={props.file} files={props.files} readOnly={props.readOnly} onContentChange={props.onContentChange} onOpenFile={props.onOpenFile} onImageDrop={props.onCanvasImageDrop} /></Suspense>;
  }
  if (props.file.fileType === "drawing") {
    return (
      <DrawingErrorBoundary resetKey={props.file.id} labels={{
        title: t("workspace.drawingErrorTitle"),
        description: t("workspace.drawingErrorDescription"),
        primary: t("workspace.retryDrawing"),
      }}>
        <Suspense fallback={<EditorLoading />}><WorkspaceDrawingEditor file={props.file} readOnly={props.readOnly} awareness={props.awareness} ydoc={props.ydoc} onContentChange={props.onContentChange} /></Suspense>
      </DrawingErrorBoundary>
    );
  }
  return (
    <MarkdownErrorBoundary resetKey={`${props.file.id}:${props.mode}`} onUseSource={() => props.onModeChange("source")} labels={{
      title: t("workspace.markdownErrorTitle"),
      description: t("workspace.markdownErrorDescription"),
      primary: t("workspace.openSourceEditor"),
      retry: t("workspace.retryVisualEditor"),
    }}>
      <WorkspaceMarkdownEditor
        key={props.file.id}
        note={props.file}
        mode={props.mode}
        readOnly={props.readOnly}
        isSplitPane={props.isSplitPane}
        ytext={props.ytext}
        awareness={props.awareness}
        jumpToLine={props.jumpToLine}
        resolveImage={props.resolveImage}
        onImageDrop={props.onImageDrop}
        onContentChange={props.onContentChange}
        onModeChange={props.onModeChange}
        onSplitView={props.onSplitView}
        focusMode={props.focusMode}
        onFocusModeChange={props.onFocusModeChange}
        compact={props.compact}
      />
    </MarkdownErrorBoundary>
  );
}
