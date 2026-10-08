import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CaptureUpdateAction, Excalidraw, MainMenu, restore, serializeAsJSON, useHandleLibrary } from "@excalidraw/excalidraw";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import "@excalidraw/excalidraw/index.css";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";

import { updateWorkspaceDrawingElements, type WorkspaceNote } from "@/lib/cabinet-files";
import { useEditorPreferences } from "@/lib/editor-preferences";
import { reconcileDrawingElements } from "@/lib/excalidraw-collaboration";
import { excalidrawLibraryReturnUrl, marktwinExcalidrawLibraryAdapter } from "@/lib/excalidraw-library";
import { isLightAppearanceTheme } from "@/lib/appearance-preferences";
import { useTheme } from "@/contexts/theme-context";
import { useI18n } from "@/contexts/i18n-context";

interface DrawingEditorProps {
  file: WorkspaceNote;
  readOnly?: boolean;
  awareness?: Awareness;
  ydoc?: Y.Doc;
  onContentChange: (content: string) => void;
}

function drawingInitialData(
  content: string,
  localAppState: Partial<AppState> | null = null,
  localElements: readonly OrderedExcalidrawElement[] | null = null,
  localFiles: BinaryFiles | null = null,
) {
  try {
    const parsed = JSON.parse(content || "{}") as { elements?: readonly OrderedExcalidrawElement[]; appState?: Partial<AppState>; files?: BinaryFiles };
    const elements = localElements
      ? reconcileDrawingElements(parsed.elements || [], localElements)
      : parsed.elements || [];
    return restore({
      elements,
      appState: parsed.appState || {},
      files: localFiles ? { ...(parsed.files || {}), ...localFiles } : parsed.files || {},
    }, localAppState, null, { repairBindings: true });
  } catch {
    return restore({
      elements: localElements || [],
      appState: {},
      files: localFiles || {},
    }, localAppState, null, { repairBindings: true });
  }
}

function preferredStrokeWidth(width: number): 1 | 2 | 4 {
  return width <= 1 ? 1 : width <= 3 ? 2 : 4;
}

function serializeDrawing(elements: readonly OrderedExcalidrawElement[], appState: Partial<AppState>, files: BinaryFiles) {
  return `${serializeAsJSON(elements, {
    viewBackgroundColor: appState.viewBackgroundColor,
    gridSize: appState.gridSize,
    gridStep: appState.gridStep,
    gridModeEnabled: appState.gridModeEnabled,
  }, files, "local")}\n`;
}

type SharedDrawingAppState = Pick<AppState, "viewBackgroundColor" | "gridSize" | "gridStep" | "gridModeEnabled">;

function editableAppState(appState: SharedDrawingAppState) {
  return {
    viewBackgroundColor: appState.viewBackgroundColor,
    gridSize: appState.gridSize,
    gridStep: appState.gridStep,
    gridModeEnabled: appState.gridModeEnabled,
  };
}

function elementSnapshot(elements: readonly OrderedExcalidrawElement[]) {
  return new Map(elements.map((element) => [element.id, JSON.stringify(element)]));
}

function fileSnapshot(files: BinaryFiles) {
  return new Map(Object.entries(files).map(([id, file]) => [id, JSON.stringify(file)]));
}

function sceneInteractionActive(appState: AppState) {
  return Boolean(
    appState.cursorButton === "down"
    || appState.newElement
    || appState.resizingElement
    || appState.editingTextElement
    || appState.editingLinearElement
    || appState.multiElement
    || appState.selectionElement
    || appState.isRotating,
  );
}

export default function WorkspaceDrawingEditor({ file, readOnly = false, awareness, ydoc, onContentChange }: DrawingEditorProps) {
  const { t } = useI18n();
  const preferences = useEditorPreferences();
  const { theme } = useTheme();
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [excalidrawApi, setExcalidrawApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [imageDropActive, setImageDropActive] = useState(false);
  const initialDrawing = useMemo(() => {
    const drawing = drawingInitialData(file.content);
    return {
      ...drawing,
      appState: { ...drawing.appState, currentItemStrokeWidth: preferredStrokeWidth(preferences.defaultPenWidth) },
    };
  }, [file.id]);
  const lastElements = useRef(elementSnapshot(initialDrawing.elements));
  const lastFiles = useRef(fileSnapshot(initialDrawing.files));
  const lastAppState = useRef(JSON.stringify(editableAppState(initialDrawing.appState)));
  const initialChangeHandled = useRef(false);
  const normalizedStrokeRef = useRef("");
  const interactionActiveRef = useRef(false);
  const pendingIncomingContentRef = useRef<string | null>(null);
  const libraryReturnUrl = useMemo(excalidrawLibraryReturnUrl, []);

  useHandleLibrary({
    excalidrawAPI: excalidrawApi,
    adapter: marktwinExcalidrawLibraryAdapter,
  });

  const initialData = initialDrawing;

  useEffect(() => {
    const drawing = drawingInitialData(file.content);
    lastElements.current = elementSnapshot(drawing.elements);
    lastFiles.current = fileSnapshot(drawing.files);
    lastAppState.current = JSON.stringify(editableAppState(drawing.appState));
    initialChangeHandled.current = false;
    interactionActiveRef.current = false;
    pendingIncomingContentRef.current = null;
  }, [file.id]);

  useEffect(() => {
    if (!awareness) return;
    awareness.setLocalStateField("drawingPresence", { fileId: file.id });
    // Clear the former exclusive-editor claim so upgraded peers never lock one another.
    awareness.setLocalStateField("drawingEditor", null);
    return () => {
      awareness.setLocalStateField("drawingPresence", null);
    };
  }, [awareness, file.id]);

  const applyIncomingContent = useCallback((content: string) => {
    const api = apiRef.current;
    if (!api) return;
    const localAppState = api.getAppState();
    if (interactionActiveRef.current || sceneInteractionActive(localAppState)) {
      pendingIncomingContentRef.current = content;
      return;
    }
    const restored = drawingInitialData(
      content,
      localAppState,
      api.getSceneElementsIncludingDeleted(),
      api.getFiles(),
    );
    const incoming = elementSnapshot(restored.elements);
    const incomingFiles = fileSnapshot(restored.files);
    const incomingAppState = JSON.stringify(editableAppState(restored.appState));
    const elementsChanged = incoming.size !== lastElements.current.size || Array.from(incoming).some(
      ([id, value]) => lastElements.current.get(id) !== value,
    );
    const appStateChanged = incomingAppState !== lastAppState.current;
    const filesChanged = incomingFiles.size !== lastFiles.current.size || Array.from(incomingFiles).some(
      ([id, value]) => lastFiles.current.get(id) !== value,
    );
    if (!elementsChanged && !appStateChanged && !filesChanged) return;
    lastElements.current = incoming;
    lastFiles.current = incomingFiles;
    lastAppState.current = incomingAppState;
    if (filesChanged && Object.keys(restored.files).length) api.addFiles(Object.values(restored.files));
    if (elementsChanged || appStateChanged) {
      api.updateScene({
        elements: restored.elements,
        appState: editableAppState(restored.appState),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    }
  }, []);

  useEffect(() => {
    applyIncomingContent(file.content);
  }, [applyIncomingContent, file.content]);

  useEffect(() => {
    const installHelpCloseButton = () => {
      const dialog = document.querySelector<HTMLElement>(".excalidraw-modal-container .HelpDialog .Modal__content");
      if (!dialog || dialog.querySelector(".marktwin-excalidraw-help-close")) return;
      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "Dialog__close marktwin-excalidraw-help-close";
      closeButton.setAttribute("aria-label", t("drawing.closeHelp"));
      closeButton.title = t("common.close");
      closeButton.textContent = "×";
      closeButton.addEventListener("click", () => {
        apiRef.current?.updateScene({ appState: { openDialog: null } });
      });
      dialog.prepend(closeButton);
    };
    const observer = new MutationObserver(installHelpCloseButton);
    observer.observe(document.body, { childList: true, subtree: true });
    installHelpCloseButton();
    return () => {
      observer.disconnect();
      document.querySelectorAll(".marktwin-excalidraw-help-close").forEach((button) => button.remove());
    };
  }, [t]);

  const persistSceneImmediately = useCallback((elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
    if (readOnly) return;
    const sceneElements = apiRef.current?.getSceneElementsIncludingDeleted() || elements;
    const nextSnapshot = elementSnapshot(sceneElements);
    const nextFiles = fileSnapshot(files);
    const changedIds = new Set<string>();
    for (const [id, value] of nextSnapshot) {
      if (lastElements.current.get(id) !== value) changedIds.add(id);
    }
    const nextAppState = editableAppState(appState);
    const appStateSerialized = JSON.stringify(nextAppState);
    const changedFileIds = new Set<string>();
    for (const [id, value] of nextFiles) {
      if (lastFiles.current.get(id) !== value) changedFileIds.add(id);
    }
    if (changedIds.size === 0 && changedFileIds.size === 0 && appStateSerialized === lastAppState.current) return;
    // Excalidraw fills default app-state values during mounting. Treat that
    // first app-state-only notification as initialization, not a user edit.
    if (!initialChangeHandled.current && changedIds.size === 0 && changedFileIds.size === 0) {
      initialChangeHandled.current = true;
      lastAppState.current = appStateSerialized;
      return;
    }
    initialChangeHandled.current = true;
    lastElements.current = nextSnapshot;
    lastFiles.current = nextFiles;
    lastAppState.current = appStateSerialized;
    if (ydoc) {
      updateWorkspaceDrawingElements(
        ydoc,
        file.id,
        sceneElements as unknown as Array<{ id: string; [key: string]: unknown }>,
        changedIds,
        nextAppState as unknown as Record<string, unknown>,
        files as unknown as Record<string, unknown>,
        changedFileIds,
      );
    } else {
      // Compatibility fallback for the legacy private editor.
      const serialized = serializeDrawing(sceneElements, appState, files);
      onContentChange(serialized);
    }
  }, [file.id, onContentChange, readOnly, ydoc]);

  const persistScene = useCallback((elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
    if (readOnly) return;
    const sceneElements = apiRef.current?.getSceneElementsIncludingDeleted() || elements;
    if (interactionActiveRef.current || sceneInteractionActive(appState)) {
      return;
    }

    persistSceneImmediately(sceneElements, appState, files);
    const pendingIncoming = pendingIncomingContentRef.current;
    if (pendingIncoming !== null) {
      pendingIncomingContentRef.current = null;
      applyIncomingContent(pendingIncoming);
    }
  }, [applyIncomingContent, persistSceneImmediately, readOnly]);

  const handlePointerCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    const type = event.pointerType === "pen" ? "pen" : event.pointerType === "touch" ? "touch" : "mouse";
    if (type === "pen") {
      apiRef.current?.updateScene({ appState: { penMode: true, activeTool: { type: (event.button === 5 || (event.buttons & 32) !== 0) ? "eraser" : "freedraw", customType: null, lastActiveTool: null, locked: false } } });
    }
    if (type === "touch") {
      apiRef.current?.updateScene({ appState: { penMode: preferences.drawWithFinger, activeTool: { type: preferences.drawWithFinger ? "freedraw" : "selection", customType: null, lastActiveTool: null, locked: false } } });
    }
  };

  const normalizeLatestStroke = useCallback(() => {
    if (!apiRef.current || preferences.pressureSensitivity === 1 && preferences.strokeSmoothing === 0) return;
    const elements = apiRef.current.getSceneElements();
    const latest = elements[elements.length - 1] as (OrderedExcalidrawElement & { pressures?: readonly number[] }) | undefined;
    if (!latest || latest.type !== "freedraw" || !latest.pressures?.length) return;
    const key = `${latest.id}:${latest.version}`;
    if (normalizedStrokeRef.current === key) return;
    normalizedStrokeRef.current = key;
    const sensitivity = Math.max(0.05, preferences.pressureSensitivity);
    let previous = latest.pressures[0] || 0.5;
    const pressures = latest.pressures.map((pressure) => {
      const responsive = Math.min(1, Math.max(0, Math.pow(pressure, 1 / sensitivity)));
      previous += (responsive - previous) * (1 - preferences.strokeSmoothing * 0.85);
      return previous;
    });
    apiRef.current.updateScene({ elements: [...elements.slice(0, -1), { ...latest, pressures }] as readonly OrderedExcalidrawElement[] });
  }, [preferences.pressureSensitivity, preferences.strokeSmoothing]);

  const finishDrawingInteraction = useCallback(() => {
    requestAnimationFrame(() => {
      interactionActiveRef.current = false;
      normalizeLatestStroke();
      const flushWhenSettled = (attempt: number) => {
        const api = apiRef.current;
        if (!api) return;
        const appState = api.getAppState();
        if (sceneInteractionActive(appState)) {
          if (attempt < 8) requestAnimationFrame(() => flushWhenSettled(attempt + 1));
          return;
        }
        persistScene(api.getSceneElementsIncludingDeleted(), appState, api.getFiles());
      };
      requestAnimationFrame(() => flushWhenSettled(0));
    });
  }, [normalizeLatestStroke, persistScene]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[hsl(var(--obsidian-bg))]" onPointerDownCapture={handlePointerCapture}>
      <div
        className={`relative min-h-0 flex-1 ${preferences.drawingToolbarSide === "right" ? "drawing-toolbar-right" : ""}`}
        onDragEnterCapture={(event) => {
          if (!readOnly && Array.from(event.dataTransfer.items).some((item) => item.kind === "file" && item.type.toLowerCase().startsWith("image/"))) setImageDropActive(true);
        }}
        onDragOverCapture={(event) => {
          if (!readOnly && Array.from(event.dataTransfer.items).some((item) => item.kind === "file" && item.type.toLowerCase().startsWith("image/"))) {
            event.dataTransfer.dropEffect = "copy";
            setImageDropActive(true);
          }
        }}
        onDragLeaveCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) setImageDropActive(false);
        }}
        onDropCapture={() => setImageDropActive(false)}
        onPointerCancelCapture={finishDrawingInteraction}
      >
        <Excalidraw
          key={file.id}
          excalidrawAPI={(api) => {
            apiRef.current = api;
            setExcalidrawApi((current) => current === api ? current : api);
          }}
          initialData={initialData}
          onChange={persistScene}
          onPointerDown={() => { interactionActiveRef.current = true; }}
          onPointerUp={finishDrawingInteraction}
          viewModeEnabled={readOnly}
          theme={isLightAppearanceTheme(theme) ? "light" : "dark"}
          name={file.filename}
          libraryReturnUrl={libraryReturnUrl}
          autoFocus={!readOnly}
          handleKeyboardGlobally={!readOnly}
          UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: { saveFileToDisk: true }, toggleTheme: false } }}
        >
          <MainMenu>
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.SearchMenu />
            <MainMenu.DefaultItems.Help />
            {!readOnly && <MainMenu.DefaultItems.ClearCanvas />}
            <MainMenu.Separator />
            {!readOnly && <MainMenu.DefaultItems.ChangeCanvasBackground />}
          </MainMenu>
        </Excalidraw>
        {imageDropActive && (
          <div className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-[hsl(var(--obsidian-accent))] bg-[hsl(var(--obsidian-accent)/0.12)]">
            <div className="rounded-lg bg-[hsl(var(--obsidian-sidebar))] px-4 py-3 text-sm font-medium shadow-lg">{t("drawing.dropImage")}</div>
          </div>
        )}
      </div>
    </div>
  );
}
