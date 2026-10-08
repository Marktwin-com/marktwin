import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent as ReactDragEvent, type InputHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject, type TextareaHTMLAttributes } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  NodeResizer,
  Position,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Columns3, FileImage, FileText, GripVertical, LayoutDashboard, Link2, MoreHorizontal, Plus, SquarePen, Trash2, X } from "lucide-react";

import type { WorkspaceNote } from "@/lib/cabinet-files";
import { fullNotePath } from "@/lib/cabinet-files";
import { canvasFilePreview, type CanvasFilePreview } from "@/lib/canvas-file-preview";
import { createClientId } from "@/lib/client-id";
import { parseCanvas, serializeCanvas, type JsonCanvasDocument, type JsonCanvasEdge, type JsonCanvasNode } from "@/lib/workspace-formats";
import { currentWorkspaceFileDrag, setWorkspaceFolderDrop, WORKSPACE_FILE_DRAG_TYPES, type WorkspaceFileDragPayload } from "@/lib/workspace-drag";
import { isSupportedImageFile } from "@/lib/workspace-images";
import { CANVAS_CLIPBOARD_MIME, duplicateCanvasSelection, parseCanvasClipboard, serializeCanvasSelection } from "@/lib/canvas-clipboard";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/contexts/i18n-context";

function workspaceFileDragType(dataTransfer: DataTransfer) {
  return WORKSPACE_FILE_DRAG_TYPES.find((type) => Array.from(dataTransfer.types).includes(type));
}

function mapTextOffset(offset: number, before: string, after: string) {
  const prefix = (() => {
    let index = 0;
    while (index < before.length && index < after.length && before[index] === after[index]) index += 1;
    return index;
  })();
  const suffix = (() => {
    let index = 0;
    while (index < before.length - prefix && index < after.length - prefix && before[before.length - index - 1] === after[after.length - index - 1]) index += 1;
    return index;
  })();
  if (offset <= prefix) return offset;
  if (offset >= before.length - suffix) return Math.max(prefix, after.length - (before.length - offset));
  return prefix;
}

function usePreservedTextSelection(value: string) {
  const elementRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const previousValueRef = useRef(value);
  const localValueRef = useRef<string | null>(null);
  const selectionRef = useRef<{ start: number; end: number } | null>(null);

  const capture = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    localValueRef.current = event.currentTarget.value;
    selectionRef.current = {
      start: event.currentTarget.selectionStart ?? event.currentTarget.value.length,
      end: event.currentTarget.selectionEnd ?? event.currentTarget.value.length,
    };
  };

  useLayoutEffect(() => {
    const element = elementRef.current;
    const previousValue = previousValueRef.current;
    if (element && document.activeElement === element && previousValue !== value) {
      const selection = localValueRef.current === value && selectionRef.current
        ? selectionRef.current
        : {
            start: mapTextOffset(element.selectionStart ?? previousValue.length, previousValue, value),
            end: mapTextOffset(element.selectionEnd ?? previousValue.length, previousValue, value),
          };
      const start = Math.max(0, Math.min(value.length, selection.start));
      const end = Math.max(start, Math.min(value.length, selection.end));
      element.setSelectionRange(start, end);
    }
    previousValueRef.current = value;
    localValueRef.current = null;
    selectionRef.current = null;
  }, [value]);

  return { elementRef, capture };
}

function CanvasTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { value, onChange, ...rest } = props;
  const selection = usePreservedTextSelection(String(value ?? ""));
  return <textarea
    {...rest}
    ref={selection.elementRef as RefObject<HTMLTextAreaElement>}
    value={value}
    onChange={(event) => {
      selection.capture(event);
      onChange?.(event);
    }}
  />;
}

function CanvasInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { value, onChange, ...rest } = props;
  const selection = usePreservedTextSelection(String(value ?? ""));
  return <input
    {...rest}
    ref={selection.elementRef as RefObject<HTMLInputElement>}
    value={value}
    onChange={(event) => {
      selection.capture(event);
      onChange?.(event);
    }}
  />;
}

type CanvasNodeData = {
  canvas: JsonCanvasNode;
  filePreview?: CanvasFilePreview;
  onOpenPath?: (path: string, artifactId?: string) => void;
  onUpdateNode?: (id: string, patch: Partial<JsonCanvasNode>) => void;
  onArmMove?: (id: string) => void;
  onSurfacePointerDown?: (id: string, event: ReactPointerEvent<HTMLDivElement>) => void;
  readOnly?: boolean;
};

type CanvasFlowNode = Node<CanvasNodeData, "marktwin">;

function isCanvasMoveTarget(target: EventTarget | null) {
  return target instanceof globalThis.Element && Boolean(target.closest("a, button, input, textarea, select, [contenteditable=\"true\"], .react-flow__handle, .react-flow__resize-control"));
}

interface CanvasEditorProps {
  file: WorkspaceNote;
  files: WorkspaceNote[];
  readOnly?: boolean;
  onContentChange: (content: string) => void;
  onOpenFile: (fileId: string) => void;
  onImageDrop?: (file: File) => Promise<string | null>;
}

function fallbackFilePreview(path: string): CanvasFilePreview {
  const filename = path.split("/").pop() || path;
  return { path, title: filename.replace(/\.(?:md|canvas|excalidraw)$/i, ""), excerpt: "" };
}

function RepositoryFilePreview({ path, preview, onOpen }: {
  path: string;
  preview?: CanvasFilePreview;
  onOpen?: (path: string, artifactId?: string) => void;
}) {
  const { t } = useI18n();
  const content = preview || fallbackFilePreview(path);
  return (
    <div className="nodrag nowheel flex h-full min-h-0 w-full flex-col p-3 text-left">
      {content.imageSource && <img src={content.imageSource} alt={content.title} className="mb-3 max-h-28 w-full rounded-lg border border-[hsl(var(--obsidian-border))] object-contain" />}
      <div className="flex min-w-0 items-center gap-2 pr-8 text-[11px] text-muted-foreground">
        {content.imageSource ? <FileImage className="h-4 w-4 flex-shrink-0 text-emerald-400" /> : <FileText className="h-4 w-4 flex-shrink-0 text-blue-400" />}
        <span className="min-w-0 truncate whitespace-nowrap" title={content.path}>{content.path}</span>
      </div>
      <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug">{content.title}</h3>
      {content.excerpt && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{content.excerpt}</p>}
      <button
        type="button"
        className="mt-auto self-end rounded-md bg-[hsl(var(--obsidian-accent))] px-2 py-1 text-[11px] font-semibold text-[hsl(var(--primary-foreground))] shadow-xs transition-opacity hover:opacity-85 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        onClick={(event) => {
          event.stopPropagation();
          onOpen?.(path);
        }}
      >
        {t("canvas.seeMore")}
      </button>
    </div>
  );
}

function CanvasNodeView({ data, selected, isConnectable }: NodeProps<CanvasFlowNode>) {
  const { t } = useI18n();
  const node = data.canvas;
  const isGroup = node.type === "group";
  return (
    <div className="relative h-full w-full text-[hsl(var(--obsidian-text))]">
      <NodeResizer
        color="hsl(var(--obsidian-accent))"
        isVisible={selected && !data.readOnly}
        minWidth={180}
        minHeight={96}
        handleClassName="!h-3 !w-3 !border-2"
        lineClassName="!border-[hsl(var(--obsidian-accent))]"
      />
      <div className="canvas-node-drag-handle absolute right-1.5 top-1.5 z-20 flex h-7 w-7 cursor-grab items-center justify-center bg-transparent active:cursor-grabbing" title={t("canvas.dragToMove")}>
        <GripVertical className="h-4 w-4 text-[hsl(var(--obsidian-text-muted))] transition-colors hover:text-[hsl(var(--primary))]" />
      </div>
      <div
        className={`h-full w-full overflow-hidden rounded-xl border shadow-xs transition-shadow ${isGroup ? "border-violet-400/55 bg-violet-500/5" : selected ? "border-[hsl(var(--obsidian-accent))] bg-[hsl(var(--obsidian-panel))] shadow-lg ring-2 ring-[hsl(var(--obsidian-accent))]/25" : "border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-panel))]"}`}
        onDoubleClick={(event) => {
          if (data.readOnly || isCanvasMoveTarget(event.target)) return;
          event.stopPropagation();
          data.onArmMove?.(node.id);
        }}
        onPointerDown={(event) => data.onSurfacePointerDown?.(node.id, event)}
      >
        {isGroup ? (
          <CanvasInput
            dir="auto"
            className="nodrag nowheel m-3 w-[calc(100%-1.5rem)] rounded-md border border-transparent bg-transparent py-1.5 pl-2 pr-9 text-sm font-semibold text-violet-300 outline-hidden placeholder:text-violet-300/50 focus:border-violet-400/60 focus:bg-[hsl(var(--obsidian-bg))]"
            value={node.label || ""}
            placeholder={t("canvas.columnName")}
            readOnly={data.readOnly}
            autoFocus={selected && !data.readOnly}
            onChange={(event) => data.onUpdateNode?.(node.id, { label: event.target.value })}
            aria-label={t("canvas.columnName")}
          />
        ) : node.type === "text" ? (
          <CanvasTextarea
            dir="auto"
            className="nodrag nowheel h-full w-full resize-none bg-transparent p-3 pr-10 text-sm leading-relaxed outline-hidden placeholder:text-[hsl(var(--obsidian-text-muted))]"
            value={node.text || ""}
            placeholder={t("canvas.cardPlaceholder")}
            readOnly={data.readOnly}
            autoFocus={selected && !data.readOnly && !node.text}
            onChange={(event) => data.onUpdateNode?.(node.id, { text: event.target.value })}
            aria-label={t("canvas.cardMarkdown")}
          />
        ) : node.type === "file" ? (
          <RepositoryFilePreview path={node.file || ""} preview={data.filePreview} onOpen={(path) => data.onOpenPath?.(path, node.artifactId)} />
        ) : (
          <a className="nodrag flex h-full flex-col gap-2 overflow-auto p-3 pr-10 text-sm text-blue-400" href={node.url} target="_blank" rel="noreferrer"><Link2 className="h-4 w-4" />{node.url}</a>
        )}
      </div>
      {!isGroup && <Handle type="target" position={Position.Left} isConnectable={isConnectable} className="!h-4 !w-4 !border-2 !border-[hsl(var(--obsidian-bg))] !bg-[hsl(var(--obsidian-accent))]" title={t("canvas.dropArrow")} />}
      {!isGroup && <Handle type="source" position={Position.Right} isConnectable={isConnectable} className="!h-4 !w-4 !border-2 !border-[hsl(var(--obsidian-bg))] !bg-[hsl(var(--obsidian-accent))]" title={t("canvas.connectArrow")} />}
    </div>
  );
}

const nodeTypes = { marktwin: CanvasNodeView };

function toFlowNode(node: JsonCanvasNode, onOpenPath: (path: string, artifactId?: string) => void, onUpdateNode: (id: string, patch: Partial<JsonCanvasNode>) => void, onArmMove: (id: string) => void, onSurfacePointerDown: (id: string, event: ReactPointerEvent<HTMLDivElement>) => void, readOnly: boolean, previewForPath: (path: string) => CanvasFilePreview | undefined): CanvasFlowNode {
  return {
    id: node.id,
    type: "marktwin",
    position: { x: node.x, y: node.y },
    width: node.width,
    height: node.height,
    style: { zIndex: node.type === "group" ? 0 : 1 },
    data: { canvas: node, filePreview: node.type === "file" && node.file ? previewForPath(node.file) : undefined, onOpenPath, onUpdateNode, onArmMove, onSurfacePointerDown, readOnly },
    selectable: true,
    draggable: !readOnly,
    connectable: !readOnly && node.type !== "group",
  };
}

function toFlowEdge(edge: JsonCanvasEdge): Edge {
  return {
    id: edge.id,
    source: edge.fromNode,
    target: edge.toNode,
    label: edge.label,
    animated: false,
    data: { canvas: edge },
    style: { stroke: "hsl(var(--obsidian-accent))", strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--obsidian-accent))" },
  };
}

function canvasFromFlow(original: JsonCanvasDocument, nodes: CanvasFlowNode[], edges: Edge[]): JsonCanvasDocument {
  return {
    ...original,
    nodes: nodes.map((node) => ({
      ...node.data.canvas,
      x: Math.round(node.position.x),
      y: Math.round(node.position.y),
      width: Math.round(node.width || node.measured?.width || Number(node.style?.width) || node.data.canvas.width),
      height: Math.round(node.height || node.measured?.height || Number(node.style?.height) || node.data.canvas.height),
    })),
    edges: edges.map((edge) => ({
      ...((edge.data?.canvas as JsonCanvasEdge | undefined) || {}),
      id: edge.id,
      fromNode: edge.source,
      toNode: edge.target,
      ...(edge.label ? { label: String(edge.label) } : {}),
    })),
  };
}

export default function WorkspaceCanvasEditor({ file, files, readOnly = false, onContentChange, onOpenFile, onImageDrop }: CanvasEditorProps) {
  const { t } = useI18n();
  const initial = useMemo(() => {
    try { return parseCanvas(file.content); } catch { return { nodes: [], edges: [] }; }
  }, [file.id]);
  const documentRef = useRef<JsonCanvasDocument>(initial);
  const lastSerialized = useRef(file.content);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWrite = useRef<(() => void) | null>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"canvas" | "kanban">("canvas");
  const [flow, setFlow] = useState<ReactFlowInstance<CanvasFlowNode, Edge> | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [fileDropActive, setFileDropActive] = useState(false);
  const [showGestureHint, setShowGestureHint] = useState(true);
  const updateNodeRef = useRef<(id: string, patch: Partial<JsonCanvasNode>) => void>(() => undefined);
  const canvasClipboardRef = useRef("");
  const armedMoveNodeRef = useRef<string | null>(null);
  const armedMoveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const surfaceDragRef = useRef<{
    id: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const nodesRef = useRef<CanvasFlowNode[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const flowRef = useRef<ReactFlowInstance<CanvasFlowNode, Edge> | null>(null);
  const persistRef = useRef<(nextNodes: CanvasFlowNode[], nextEdges: Edge[], immediate?: boolean) => void>(() => undefined);

  const openPath = useCallback((path: string, artifactId?: string) => {
    const target = files.find((candidate) => candidate.artifactId === artifactId)
      || files.find((candidate) => fullNotePath(candidate) === path);
    if (target) onOpenFile(target.id);
  }, [files, onOpenFile]);

  const previewForPath = useCallback((path: string) => {
    const target = files.find((candidate) => fullNotePath(candidate) === path);
    return target ? canvasFilePreview(target) : undefined;
  }, [files]);

  const updateNodeFromCanvas = useCallback((id: string, patch: Partial<JsonCanvasNode>) => {
    updateNodeRef.current(id, patch);
  }, []);

  const armCanvasNodeMove = useCallback((id: string) => {
    if (readOnly) return;
    armedMoveNodeRef.current = id;
    if (armedMoveTimeoutRef.current) clearTimeout(armedMoveTimeoutRef.current);
    armedMoveTimeoutRef.current = setTimeout(() => {
      if (armedMoveNodeRef.current === id) armedMoveNodeRef.current = null;
    }, 1800);
  }, [readOnly]);

  const handleSurfacePointerDown = useCallback((id: string, event: ReactPointerEvent<HTMLDivElement>) => {
    if (readOnly || armedMoveNodeRef.current !== id || event.button !== 0 || isCanvasMoveTarget(event.target)) return;
    const node = nodesRef.current.find((candidate) => candidate.id === id);
    if (!node) return;
    event.preventDefault();
    event.stopPropagation();
    surfaceDragRef.current = {
      id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: node.position.x,
      startY: node.position.y,
      moved: false,
    };
    armedMoveNodeRef.current = null;
    if (armedMoveTimeoutRef.current) clearTimeout(armedMoveTimeoutRef.current);
  }, [readOnly]);

  const [nodes, setNodes] = useState<CanvasFlowNode[]>(() => initial.nodes.map((node) => toFlowNode(node, openPath, updateNodeFromCanvas, armCanvasNodeMove, handleSurfacePointerDown, readOnly, previewForPath)));
  const [edges, setEdges] = useState<Edge[]>(() => initial.edges.map(toFlowEdge));
  nodesRef.current = nodes;
  edgesRef.current = edges;
  flowRef.current = flow;

  useEffect(() => {
    if (file.content === lastSerialized.current) return;
    try {
      const next = parseCanvas(file.content);
      documentRef.current = next;
      setNodes(next.nodes.map((node) => toFlowNode(node, openPath, updateNodeFromCanvas, armCanvasNodeMove, handleSurfacePointerDown, readOnly, previewForPath)));
      setEdges(next.edges.map(toFlowEdge));
      lastSerialized.current = file.content;
      setSelectedNodeId(null);
    } catch {
      // Keep the last valid scene visible; the raw file remains recoverable in Git.
    }
  }, [armCanvasNodeMove, file.content, handleSurfacePointerDown, openPath, previewForPath, readOnly, updateNodeFromCanvas]);

  useEffect(() => {
    setNodes((current) => current.map((node) => ({
      ...node,
      data: {
        ...node.data,
        filePreview: node.data.canvas.type === "file" && node.data.canvas.file
          ? previewForPath(node.data.canvas.file)
          : undefined,
      },
    })));
  }, [previewForPath]);

  const persist = useCallback((nextNodes: CanvasFlowNode[], nextEdges: Edge[], immediate = false) => {
    if (readOnly) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const write = () => {
      pendingWrite.current = null;
      saveTimer.current = null;
      const nextDocument = canvasFromFlow(documentRef.current, nextNodes, nextEdges);
      const serialized = serializeCanvas(nextDocument);
      documentRef.current = nextDocument;
      if (serialized !== lastSerialized.current) {
        lastSerialized.current = serialized;
        onContentChange(serialized);
      }
    };
    pendingWrite.current = write;
    if (immediate) write(); else saveTimer.current = setTimeout(write, 180);
  }, [onContentChange, readOnly]);

  persistRef.current = persist;

  useEffect(() => {
    const handleSurfacePointerMove = (event: globalThis.PointerEvent) => {
      const drag = surfaceDragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      const zoom = flowRef.current?.getViewport().zoom || 1;
      const dx = (event.clientX - drag.startClientX) / zoom;
      const dy = (event.clientY - drag.startClientY) / zoom;
      if (dx === 0 && dy === 0) return;
      drag.moved = true;
      const next = nodesRef.current.map((node) => node.id === drag.id
        ? { ...node, position: { x: drag.startX + dx, y: drag.startY + dy } }
        : node);
      nodesRef.current = next;
      setNodes(next);
    };
    const finishSurfacePointerDrag = (event: globalThis.PointerEvent) => {
      const drag = surfaceDragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      surfaceDragRef.current = null;
      if (drag.moved) persistRef.current(nodesRef.current, edgesRef.current, true);
    };
    window.addEventListener("pointermove", handleSurfacePointerMove, { passive: false });
    window.addEventListener("pointerup", finishSurfacePointerDrag);
    window.addEventListener("pointercancel", finishSurfacePointerDrag);
    return () => {
      window.removeEventListener("pointermove", handleSurfacePointerMove);
      window.removeEventListener("pointerup", finishSurfacePointerDrag);
      window.removeEventListener("pointercancel", finishSurfacePointerDrag);
      if (armedMoveTimeoutRef.current) clearTimeout(armedMoveTimeoutRef.current);
    };
  }, []);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    // Switching artifacts must not discard the final debounced Canvas edit.
    pendingWrite.current?.();
  }, []);

  const onNodesChange = useCallback((changes: NodeChange<CanvasFlowNode>[]) => {
    setNodes((current) => {
      const next = applyNodeChanges(changes, current);
      persist(next, edges, changes.some((change) => (change.type === "position" && !change.dragging) || change.type === "remove"));
      return next;
    });
  }, [edges, persist]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((current) => {
      const next = applyEdgeChanges(changes, current);
      persist(nodes, next, true);
      return next;
    });
  }, [nodes, persist]);

  const onConnect = useCallback((connection: Connection) => {
    const edgeId = createClientId();
    const edge: Edge = {
      ...connection,
      id: edgeId,
      source: connection.source!,
      target: connection.target!,
      data: { canvas: { id: edgeId, fromNode: connection.source!, toNode: connection.target!, toEnd: "arrow" } satisfies JsonCanvasEdge },
      style: { stroke: "hsl(var(--obsidian-accent))", strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--obsidian-accent))" },
    };
    setEdges((current) => {
      const next = addEdge(edge, current);
      persist(nodes, next, true);
      return next;
    });
  }, [nodes, persist]);

  const viewportPosition = useCallback((width: number, height: number) => {
    const bounds = canvasHostRef.current?.getBoundingClientRect();
    if (!flow || !bounds) return { x: 80 + nodes.length * 24, y: 80 + nodes.length * 24 };
    const center = flow.screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
    return { x: center.x - width / 2, y: center.y - height / 2 };
  }, [flow, nodes.length]);

  const addNode = useCallback((type: JsonCanvasNode["type"], filePath?: string, position?: { x: number; y: number }, extra?: Partial<JsonCanvasNode>) => {
    const id = createClientId();
    const width = type === "group" ? 320 : 260;
    const height = type === "group" ? 500 : 160;
    const target = position || viewportPosition(width, height);
    const canvas: JsonCanvasNode = {
      id,
      type,
      x: Math.round(target.x),
      y: Math.round(target.y),
      width,
      height,
      ...(type === "text" ? { text: "" } : {}),
      ...(type === "file" ? { file: filePath || "" } : {}),
      ...(type === "group" ? { label: "" } : {}),
      ...extra,
    };
    setNodes((current) => {
      const next = [...current, toFlowNode(canvas, openPath, updateNodeFromCanvas, armCanvasNodeMove, handleSurfacePointerDown, readOnly, previewForPath)];
      persist(next, edges, true);
      return next;
    });
    setSelectedNodeId(id);
    return id;
  }, [armCanvasNodeMove, edges, handleSurfacePointerDown, openPath, persist, previewForPath, readOnly, updateNodeFromCanvas, viewportPosition]);

  const handleCanvasFileDrop = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    const droppedImage = Array.from(event.dataTransfer.files).find(isSupportedImageFile);
    if (droppedImage && onImageDrop && !readOnly) {
      event.preventDefault();
      event.stopPropagation();
      setFileDropActive(false);
      const point = flow?.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      void onImageDrop(droppedImage).then((path) => {
        if (!path || !canvasHostRef.current) return;
        addNode("file", path, point ? { x: point.x - 130, y: point.y - 80 } : undefined);
      });
      return;
    }
    const dragType = workspaceFileDragType(event.dataTransfer);
    const activeDrag = currentWorkspaceFileDrag();
    if ((!dragType && !activeDrag) || readOnly) return;
    event.preventDefault();
    event.stopPropagation();
    setFileDropActive(false);
    try {
      const payload = activeDrag || JSON.parse(event.dataTransfer.getData(dragType!)) as WorkspaceFileDragPayload;
      const droppedFile = files.find((candidate) => candidate.id === payload.noteId || fullNotePath(candidate) === payload.path);
      if (!droppedFile || droppedFile.id === file.id) return;
      const point = flow?.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addNode("file", fullNotePath(droppedFile), point ? { x: point.x - 130, y: point.y - 80 } : undefined, { artifactId: droppedFile.artifactId || droppedFile.id });
    } catch {
      // Ignore malformed drags from outside the workspace explorer.
    }
  }, [addNode, file.id, files, flow, onImageDrop, readOnly]);

  const imageDragActive = useCallback((dataTransfer: DataTransfer) => (
    Array.from(dataTransfer.items).some((item) => item.kind === "file" && item.type.toLowerCase().startsWith("image/"))
  ), []);

  const updateNode = useCallback((id: string, patch: Partial<JsonCanvasNode>, immediate = false) => {
    setNodes((current) => {
      const next = current.map((node) => node.id === id ? { ...node, data: { ...node.data, canvas: { ...node.data.canvas, ...patch } } } : node);
      persist(next, edges, immediate);
      return next;
    });
  }, [edges, persist]);

  const serializeCurrentCanvasSelection = useCallback(() => {
    const selected = nodes.filter((node) => node.selected || node.id === selectedNodeId);
    if (selected.length === 0) return null;
    return serializeCanvasSelection(
      selected.map((node) => node.data.canvas),
      edges.map((edge) => edge.data?.canvas as JsonCanvasEdge).filter(Boolean),
    );
  }, [edges, nodes, selectedNodeId]);

  const copyCanvasSelection = useCallback((event?: ClipboardEvent) => {
    const serialized = serializeCurrentCanvasSelection();
    if (!serialized) return false;
    canvasClipboardRef.current = serialized;
    if (event) {
      event.preventDefault();
      event.clipboardData?.setData(CANVAS_CLIPBOARD_MIME, serialized);
      event.clipboardData?.setData("text/plain", serialized);
    }
    void navigator.clipboard.writeText(serialized).catch(() => undefined);
    return true;
  }, [serializeCurrentCanvasSelection]);

  const pasteCanvasSelection = useCallback(async (clipboardText?: string) => {
    let serialized = clipboardText || canvasClipboardRef.current;
    if (!clipboardText) {
      try { serialized = (await navigator.clipboard.readText()) || serialized; } catch { /* Use the last same-tab copy. */ }
    }
    const payload = parseCanvasClipboard(serialized);
    if (!payload) return;
    const duplicated = duplicateCanvasSelection(payload);
    const nextNodes = [
      ...nodes.map((node) => ({ ...node, selected: false })),
      ...duplicated.nodes.map((node) => ({
        ...toFlowNode(node, openPath, updateNodeFromCanvas, armCanvasNodeMove, handleSurfacePointerDown, readOnly, previewForPath),
        selected: true,
      })),
    ];
    const nextEdges = [
      ...edges.map((edge) => ({ ...edge, selected: false })),
      ...duplicated.edges.map(toFlowEdge),
    ];
    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelectedNodeId(duplicated.nodes[0]?.id || null);
    persist(nextNodes, nextEdges, true);
  }, [edges, nodes, openPath, persist, previewForPath, readOnly, updateNodeFromCanvas]);

  const handleCanvasKeyDown = useCallback((event: KeyboardEvent | ReactKeyboardEvent<HTMLDivElement>) => {
    if (readOnly || !(event.metaKey || event.ctrlKey) || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, [contenteditable=\"true\"]")) return;
    const key = event.key.toLowerCase();
    if (key === "c") {
      if (!copyCanvasSelection()) return;
      event.preventDefault();
      return;
    }
    if (key !== "v") return;
    event.preventDefault();
    void pasteCanvasSelection();
  }, [copyCanvasSelection, pasteCanvasSelection, readOnly]);

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      void handleCanvasKeyDown(event);
    };
    const handleWindowCopy = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=\"true\"]")) return;
      copyCanvasSelection(event);
    };
    const handleWindowPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=\"true\"]")) return;
      const serialized = event.clipboardData?.getData(CANVAS_CLIPBOARD_MIME)
        || event.clipboardData?.getData("text/plain")
        || "";
      if (!parseCanvasClipboard(serialized)) return;
      event.preventDefault();
      void pasteCanvasSelection(serialized);
    };
    window.addEventListener("keydown", handleWindowKeyDown);
    window.addEventListener("copy", handleWindowCopy);
    window.addEventListener("paste", handleWindowPaste);
    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown);
      window.removeEventListener("copy", handleWindowCopy);
      window.removeEventListener("paste", handleWindowPaste);
    };
  }, [copyCanvasSelection, handleCanvasKeyDown, pasteCanvasSelection]);
  updateNodeRef.current = updateNode;

  const deleteNode = useCallback((id: string) => {
    const nextNodes = nodes.filter((node) => node.id !== id);
    const nextEdges = edges.filter((edge) => edge.source !== id && edge.target !== id);
    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelectedNodeId((current) => current === id ? null : current);
    persist(nextNodes, nextEdges, true);
  }, [edges, nodes, persist]);

  const groups = useMemo(() => nodes.filter((node) => node.data.canvas.type === "group").sort((a, b) => a.position.x - b.position.x), [nodes]);

  const cardsForGroup = useCallback((group: CanvasFlowNode) => nodes.filter((node) => {
    if (node.data.canvas.type === "group") return false;
    const assignedColumn = node.data.canvas.marktwinColumnId;
    if (typeof assignedColumn === "string") return assignedColumn === group.id;
    const x = node.position.x + 1;
    const y = node.position.y + 1;
    const width = group.width || group.measured?.width || Number(group.style?.width) || group.data.canvas.width;
    const height = group.height || group.measured?.height || Number(group.style?.height) || group.data.canvas.height;
    return x >= group.position.x && x <= group.position.x + width && y >= group.position.y && y <= group.position.y + height;
  }).sort((a, b) => a.position.y - b.position.y), [nodes]);

  const assignedCardIds = useMemo(() => new Set(groups.flatMap((group) => cardsForGroup(group).map((card) => card.id))), [cardsForGroup, groups]);
  const unassignedCards = useMemo(() => nodes.filter((node) => node.data.canvas.type !== "group" && !assignedCardIds.has(node.id)), [assignedCardIds, nodes]);

  const moveCardToGroup = useCallback((cardId: string, groupId: string | null) => {
    const group = groups.find((node) => node.id === groupId);
    const count = group ? cardsForGroup(group).filter((node) => node.id !== cardId).length : unassignedCards.filter((node) => node.id !== cardId).length;
    const next = nodes.map((node) => {
      if (node.id !== cardId) return node;
      const position = group
        ? { x: group.position.x + 24, y: group.position.y + 58 + count * 174 }
        : viewportPosition(260, 160);
      return {
        ...node,
        position,
        data: { ...node.data, canvas: { ...node.data.canvas, marktwinColumnId: group?.id } },
      };
    });
    setNodes(next);
    persist(next, edges, true);
  }, [cardsForGroup, edges, groups, nodes, persist, unassignedCards, viewportPosition]);

  const addCardToGroup = (group: CanvasFlowNode) => {
    const count = cardsForGroup(group).length;
    addNode("text", undefined, { x: group.position.x + 24, y: group.position.y + 58 + count * 174 }, { marktwinColumnId: group.id });
  };

  const renderKanbanCard = (card: CanvasFlowNode) => (
    <article
      key={card.id}
      className={`rounded-lg border bg-[hsl(var(--obsidian-panel))] p-3 shadow-xs ${selectedNodeId === card.id ? "border-[hsl(var(--obsidian-accent))] ring-2 ring-[hsl(var(--obsidian-accent))]/20" : "border-[hsl(var(--obsidian-border))]"}`}
      onClick={() => setSelectedNodeId(card.id)}
    >
      <div className="mb-2 flex items-center gap-1">
        <span
          className="flex h-7 w-7 cursor-grab items-center justify-center bg-transparent text-muted-foreground active:cursor-grabbing"
          draggable={!readOnly}
          onDragStart={(event) => event.dataTransfer.setData("text/marktwin-card", card.id)}
          title={t("canvas.dragToMove")}
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <span className="flex-1" />
        {!readOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="sm" className="h-11 w-11 p-0" aria-label={t("canvas.cardActions")}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t("workspace.moveTo")}</DropdownMenuLabel>
              {groups.map((group) => <DropdownMenuItem key={group.id} onSelect={() => moveCardToGroup(card.id, group.id)}>{group.data.canvas.label || t("canvas.untitledColumn")}</DropdownMenuItem>)}
              <DropdownMenuItem onSelect={() => moveCardToGroup(card.id, null)}>{t("canvas.unassigned")}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-400" onSelect={() => deleteNode(card.id)}><Trash2 className="mr-2 h-4 w-4" />{t("canvas.deleteCard")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {card.data.canvas.type === "text" ? (
          <CanvasTextarea
          dir="auto"
          className="min-h-28 w-full resize-y rounded-md border border-transparent bg-transparent p-1 text-sm outline-hidden focus:border-[hsl(var(--obsidian-border))] focus:bg-[hsl(var(--obsidian-bg))]"
          value={card.data.canvas.text || ""}
          readOnly={readOnly}
          onChange={(event) => updateNode(card.id, { text: event.target.value })}
          aria-label={t("canvas.cardMarkdown")}
        />
      ) : card.data.canvas.type === "file" ? (
        <div className="h-32"><RepositoryFilePreview path={card.data.canvas.file || ""} preview={card.data.filePreview} onOpen={(path) => openPath(path, card.data.canvas.artifactId)} /></div>
      ) : (
        <a href={card.data.canvas.url} target="_blank" rel="noreferrer" className="break-all text-sm text-blue-400">{card.data.canvas.url}</a>
      )}
    </article>
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[hsl(var(--obsidian-bg))]">
      <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3">
        <div className="pointer-events-auto flex max-w-full min-w-0 items-center gap-1 overflow-x-auto rounded-xl border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-sidebar)/0.92)] p-1.5 marktwin-elevated-shadow backdrop-blur-md">
          <Tabs value={view} onValueChange={(value) => setView(value as "canvas" | "kanban")}>
            <TabsList className="h-9 bg-transparent">
              <TabsTrigger value="canvas" className="h-8 px-2.5 text-xs sm:px-3">{t("canvas.canvasView")}</TabsTrigger>
              <TabsTrigger value="kanban" className="h-8 px-2.5 text-xs sm:px-3">{t("canvas.kanbanView")}</TabsTrigger>
            </TabsList>
          </Tabs>
          {!readOnly && (
            <>
              <Button size="sm" className="h-9 shrink-0" onClick={() => addNode("text")}><SquarePen className="mr-1.5 h-4 w-4" />{t("canvas.card")}</Button>
              <Button size="sm" variant="outline" className="h-9 shrink-0" onClick={() => addNode("group")}><Columns3 className="mr-1.5 h-4 w-4" />{t("canvas.column")}</Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button size="sm" variant="ghost" className="h-9 w-9 shrink-0 p-0" aria-label={t("canvas.moreItems")}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                  <DropdownMenuLabel>{t("canvas.addRepositoryFile")}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {files.filter((candidate) => candidate.id !== file.id).map((candidate) => <DropdownMenuItem key={candidate.id} onSelect={() => addNode("file", fullNotePath(candidate), undefined, { artifactId: candidate.artifactId || candidate.id })}><FileText className="mr-2 h-4 w-4" />{fullNotePath(candidate)}</DropdownMenuItem>)}
                  {files.filter((candidate) => candidate.id !== file.id).length === 0 && <DropdownMenuItem disabled>{t("canvas.noOtherFiles")}</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      {view === "canvas" ? (
        <div
          ref={canvasHostRef}
          className="relative min-h-0 flex-1 touch-none"
          onDragEnterCapture={(event) => {
            if (!readOnly && (workspaceFileDragType(event.dataTransfer) || currentWorkspaceFileDrag() || imageDragActive(event.dataTransfer))) {
              setWorkspaceFolderDrop(null);
              setFileDropActive(true);
            }
          }}
          onDragOverCapture={(event) => {
            if (readOnly || (!workspaceFileDragType(event.dataTransfer) && !currentWorkspaceFileDrag() && !imageDragActive(event.dataTransfer))) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDragLeaveCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) setFileDropActive(false);
          }}
          onDropCapture={handleCanvasFileDrop}
        >
          <ReactFlow<CanvasFlowNode, Edge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onInit={setFlow}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onSelectionChange={(selection) => setSelectedNodeId(selection.nodes[0]?.id || null)}
            onPaneClick={() => setSelectedNodeId(null)}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            elementsSelectable
            panOnDrag
            panOnScroll
            zoomOnPinch
            zoomOnDoubleClick={false}
            deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
            minZoom={0.2}
            maxZoom={2.5}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} size={1} />
            <Controls showInteractive={false} />
            {nodes.length > 0 && <MiniMap pannable zoomable className="!hidden !bg-[hsl(var(--obsidian-sidebar))] sm:!block" />}
          </ReactFlow>

          {fileDropActive && (
            <div className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-[hsl(var(--obsidian-accent))] bg-[hsl(var(--obsidian-accent)/0.12)]">
              <div className="rounded-lg bg-[hsl(var(--obsidian-sidebar))] px-4 py-3 text-sm font-medium shadow-lg">{t("canvas.dropFile")}</div>
            </div>
          )}

          {nodes.length === 0 && !readOnly && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
              <div className="pointer-events-auto max-w-sm rounded-xl border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-sidebar)/0.96)] p-5 text-center shadow-xl">
                <LayoutDashboard className="mx-auto mb-3 h-10 w-10 text-violet-400" />
                <h2 className="font-semibold">{t("canvas.emptyTitle")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("canvas.emptyDescription")}</p>
                <div className="mt-4 flex justify-center gap-2"><Button size="sm" onClick={() => addNode("text")}><Plus className="mr-1 h-4 w-4" />{t("canvas.card")}</Button><Button size="sm" variant="outline" onClick={() => addNode("group")}><Columns3 className="mr-1 h-4 w-4" />{t("canvas.column")}</Button></div>
              </div>
            </div>
          )}

          {!readOnly && nodes.length > 0 && showGestureHint && (
            <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-sidebar)/0.92)] px-3 py-1.5 text-[11px] text-muted-foreground marktwin-surface-shadow">
              <span className="truncate">{t("canvas.gestureHint")}</span>
              <button
                type="button"
                className="pointer-events-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[hsl(var(--obsidian-panel-hover))] hover:text-[hsl(var(--obsidian-text))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setShowGestureHint(false)}
                aria-label={t("common.close")}
                title={t("common.close")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-x-auto p-3 pt-20 sm:p-4 sm:pt-20 touch-pan-x">
          {groups.length === 0 && unassignedCards.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <div className="text-center"><Columns3 className="mx-auto mb-3 h-10 w-10 opacity-40" /><p>{t("canvas.kanbanEmpty")}</p>{!readOnly && <Button size="sm" className="mt-4" onClick={() => addNode("group")}><Plus className="mr-1 h-4 w-4" />{t("canvas.addFirstColumn")}</Button>}</div>
            </div>
          ) : (
            <div className="flex min-h-full min-w-max items-start gap-4">
              {groups.map((group) => (
                <section
                  key={group.id}
                  data-kanban-column={group.id}
                  className="w-72 rounded-xl border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-sidebar))] p-3"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => { const cardId = event.dataTransfer.getData("text/marktwin-card"); if (cardId) moveCardToGroup(cardId, group.id); }}
                >
                  <div className="mb-3 flex items-center gap-1">
                  <CanvasInput dir="auto" className="min-w-0 flex-1 rounded bg-transparent px-1 py-2 text-sm font-semibold outline-hidden focus:bg-[hsl(var(--obsidian-bg))]" value={group.data.canvas.label || ""} placeholder={t("canvas.untitledColumn")} readOnly={readOnly} onChange={(event) => updateNode(group.id, { label: event.target.value })} aria-label={t("canvas.columnName")} />
                    {!readOnly && <Button type="button" variant="ghost" size="sm" className="h-11 w-11 p-0 text-red-400" onClick={() => deleteNode(group.id)} aria-label={t("canvas.deleteColumn", { name: group.data.canvas.label || t("canvas.untitledColumn") })}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                  <div className="space-y-3">{cardsForGroup(group).map(renderKanbanCard)}</div>
                  {!readOnly && <Button type="button" variant="ghost" size="sm" className="mt-3 h-11 w-full justify-start text-muted-foreground" onClick={() => addCardToGroup(group)}><Plus className="mr-2 h-4 w-4" />{t("canvas.addCard")}</Button>}
                </section>
              ))}
              {unassignedCards.length > 0 && (
                <section className="w-72 rounded-xl border border-dashed border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-sidebar)/0.7)] p-3" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const cardId = event.dataTransfer.getData("text/marktwin-card"); if (cardId) moveCardToGroup(cardId, null); }}>
                  <h2 className="mb-3 px-1 py-2 text-sm font-semibold text-muted-foreground">{t("canvas.unassigned")}</h2>
                  <div className="space-y-3">{unassignedCards.map(renderKanbanCard)}</div>
                </section>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
