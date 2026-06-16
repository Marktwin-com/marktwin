import { useState, useEffect, useRef, useMemo } from "react";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { decodeInvite } from "@/lib/private-crypto";
import { InvitePayload, JoinCollaboration, joinCollaboration } from "@/lib/private-collab";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import FilePreview from "@/components/file-preview";
import MarkdownPreview from "@/components/markdown-preview";
import CollaborationIndicator from "@/components/collaboration-indicator";
import { ChevronRight, ChevronLeft, MessageSquare, Maximize2, Minimize2, Eye, FileCode, Type } from "lucide-react";
import FileExplorer from "@/components/file-explorer";
import SimpleCollaborativeEditor from "@/components/simple-collaborative-editor";
import ChatPanel, { type ChatMessage } from "@/components/chat-panel";
import type { Note } from "@shared/schema";

export default function JoinPage() {
  const ydoc = useMemo(() => new Y.Doc(), []);
  const awareness = useMemo(() => new Awareness(ydoc), [ydoc]);
  const chatClientId = String(awareness.clientID);
  const filesMap = useMemo(() => ydoc.getMap<Y.Map<any>>("files"), [ydoc]);
  const sessionRef = useRef<JoinCollaboration | null>(null);
  const showChatRef = useRef(false);
  
  const [status, setStatus] = useState("Preparing private session");
  const [invite, setInvite] = useState<InvitePayload | null>(null);
  const [error, setError] = useState("");
  
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<number | null>(null);
  const [editorMode, setEditorMode] = useState<"raw" | "preview">("raw");
  const [focusMode, setFocusMode] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [lastSidebarWidth, setLastSidebarWidth] = useState(320);
  const [openTabs, setOpenTabs] = useState<number[]>([]);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [splitViewNoteId, setSplitViewNoteId] = useState<number | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [chatWidth, setChatWidth] = useState(384);
  const [myUsername, setMyUsername] = useState(() => `Guest${Math.random().toString(36).substring(2, 6)}`);
  const [myColor, setMyColor] = useState(() => `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`);

  useEffect(() => {
    awareness.setLocalStateField('user', {
      name: myUsername,
      color: myColor,
      clientId: awareness.clientID
    });
  }, [myUsername, myColor, awareness]);

  useEffect(() => {
    const messagesArray = ydoc.getArray<ChatMessage>('chat-messages');
    const observer = (event: Y.YArrayEvent<ChatMessage>) => {
      const hasRemoteMessage = Array.from(event.changes.added).some(item => {
        return (item.content.getContent() as ChatMessage[]).some(message => {
          return message.sessionId && message.sessionId !== chatClientId;
        });
      });

      if (hasRemoteMessage && !showChatRef.current) {
        setHasUnread(true);
      }
    };
    messagesArray.observe(observer);
    return () => messagesArray.unobserve(observer);
  }, [ydoc, chatClientId]);

  useEffect(() => {
    showChatRef.current = showChat;
    if (showChat) setHasUnread(false);
  }, [showChat]);

  // Keep track of file list from YDoc
  useEffect(() => {
    const updateFiles = () => {
      const newFiles = Array.from(filesMap.keys()).map(key => {
        const fileMap = filesMap.get(key);
        return {
          id: parseInt(key, 10),
          vaultId: 0,
          filename: fileMap?.get("filename") || "Untitled",
          path: fileMap?.get("path") || "/",
          content: fileMap?.get("content")?.toString() || ""
        } as Note;
      });
      setNotes(newFiles.sort((a, b) => a.filename.localeCompare(b.filename)));
      
      // Auto-open first file if nothing is open
      if (newFiles.length > 0 && !activeNoteId && openTabs.length === 0) {
        setActiveNoteId(newFiles[0].id);
        setOpenTabs([newFiles[0].id]);
        setActiveTabId(newFiles[0].id);
      }
    };

    filesMap.observeDeep(updateFiles);
    updateFiles();
    return () => filesMap.unobserveDeep(updateFiles);
  }, [filesMap, activeNoteId, openTabs.length]);

  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const token = searchParams.get("token") || window.location.hash;
      const parsed = decodeInvite<InvitePayload>(token);
      if (parsed.v !== 1) throw new Error("Unsupported invite version");
      setInvite(parsed);
      joinCollaboration(ydoc, awareness, parsed, setStatus).then((session) => {
        sessionRef.current = session;
      });
    } catch {
      setError("Invalid private invite link.");
    }

    return () => sessionRef.current?.stop();
  }, [ydoc]);

  if (error) {
    return (
      <div className="min-h-screen bg-[hsl(var(--obsidian-bg))] flex items-center justify-center p-4">
        <Card className="max-w-md bg-[hsl(var(--obsidian-panel))] border-[hsl(var(--obsidian-border))]">
          <CardHeader>
            <CardTitle className="text-red-300">Cannot Join Session</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const activeNote = notes.find(n => n.id === activeNoteId);
  
  // Render Editor helper
  const renderEditor = (noteId: number, isSplit = false) => {
    const fileMap = filesMap.get(String(noteId));
    if (!fileMap) return null;
    return (
      <SimpleCollaborativeEditor
        note={notes.find(n => n.id === noteId)!}
        onContentChange={() => {}}
        onModeChange={!isSplit ? setEditorMode : () => {}}
        vaultId={0}
        mode={!isSplit ? editorMode : "preview"}
        vaultSlug="shared-session"
        readOnly={invite?.role !== "edit"}
        ytext={fileMap.get("content")}
        awareness={awareness}
      />
    );
  };

  return (
    <div className="flex h-screen bg-[hsl(var(--obsidian-bg))] text-[hsl(var(--obsidian-text))] overflow-hidden">
      {/* Sidebar */}
      {!sidebarCollapsed && !focusMode && (
        <div 
          className="bg-[hsl(var(--obsidian-sidebar))] border-r border-[hsl(var(--obsidian-border))] flex flex-col transition-all duration-300"
          style={{ width: `${sidebarWidth}px` }}
        >
          {/* Header */}
          <div className="p-4 border-b border-[hsl(var(--obsidian-border))]">
            <div className="flex items-center justify-between mb-3 min-w-0 overflow-hidden">
              <div className="flex items-center min-w-0 overflow-hidden">
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="p-1 h-6 w-6 mr-1 flex-shrink-0" 
                  onClick={() => window.location.href = '/'}
                  title="Leave session"
                >
                  <ChevronLeft className="h-4 w-4 text-[hsl(var(--obsidian-text-muted))]" />
                </Button>
                <h1 className="text-lg font-semibold text-[hsl(var(--obsidian-text))] truncate min-w-0">Shared Cabinet</h1>
              </div>
            </div>
            
            <div className="bg-[hsl(var(--obsidian-panel))] p-3 rounded-lg">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-sm">{status}</span>
                  </div>
                  {invite && (
                    <Badge variant={invite.role === "edit" ? "default" : "secondary"}>
                      {invite.role === "edit" ? "Can edit" : "View only"}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <CollaborationIndicator 
                    awareness={awareness} 
                    myName={myUsername} 
                    onNameChange={setMyUsername} 
                  />
                </div>
              </div>
            </div>
          </div>

          {/* File Explorer */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-[hsl(var(--primary))]">Files</h3>
              </div>
              <FileExplorer 
                notes={notes} 
                activeNoteId={activeNoteId}
                activeNote={activeNote}
                onNoteSelect={(id) => {
                  setActiveNoteId(id);
                  if (!openTabs.includes(id)) {
                    setOpenTabs(prev => [...prev, id]);
                  }
                  setActiveTabId(id);
                }}
                onCreateNote={() => {}}
                onMoveNote={() => {}}
                creatingFile={false}
                newFileName={""}
                setNewFileName={() => {}}
                handleNewFileSubmit={() => {}}
                handleNewFileCancel={() => {}}
                onCreateFolder={() => {}}
                onMoveFolder={() => {}}
                onDeleteFolder={() => {}}
                onRenameNote={() => {}}
                onDeleteNote={() => {}}
                onDuplicateNote={() => {}}
                isMovingFolder={false}
                isCreatingFolder={false}
                readOnly={true}
              />
            </div>
          </div>
        </div>
      )}

      {/* Expand button when sidebar is collapsed */}
      {sidebarCollapsed && !focusMode && (
        <button
          className="absolute left-0 top-1/2 z-50 -translate-y-1/2 bg-[hsl(var(--obsidian-sidebar))] border border-[hsl(var(--obsidian-border))] rounded-r px-1 py-2 shadow hover:bg-[hsl(var(--obsidian-panel))] transition-colors"
          style={{ width: 24 }}
          onClick={() => {
            setSidebarCollapsed(false);
            setSidebarWidth(lastSidebarWidth);
          }}
          title="Expand sidebar"
        >
          <ChevronRight className="h-4 w-4 text-[hsl(var(--obsidian-text))]" />
        </button>
      )}

      {/* Resizer */}
      {!sidebarCollapsed && !focusMode && (
        <div 
          className="w-1 cursor-col-resize hover:bg-accent/50 active:bg-accent transition-colors"
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = sidebarWidth;

            const handleMouseMove = (e: MouseEvent) => {
              let newWidth = Math.max(40, Math.min(600, startWidth + (e.clientX - startX)));
              if (newWidth <= 120) {
                setSidebarCollapsed(true);
                setLastSidebarWidth(startWidth > 120 ? startWidth : 320);
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", handleMouseUp);
                return;
              }
              setSidebarWidth(newWidth);
            };

            const handleMouseUp = () => {
              document.removeEventListener("mousemove", handleMouseMove);
              document.removeEventListener("mouseup", handleMouseUp);
            };

            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
          }}
          onDoubleClick={() => {
            setSidebarCollapsed(true);
            setLastSidebarWidth(sidebarWidth > 120 ? sidebarWidth : 320);
          }}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative">
        {/* Tab Bar */}
        <div className="h-12 bg-[hsl(var(--obsidian-sidebar))] border-b border-[hsl(var(--obsidian-border))] flex items-center px-2 z-10">
          <div className="flex flex-1 overflow-x-auto hide-scrollbar gap-1">
            {openTabs.map(tabId => {
              const note = notes.find(n => n.id === tabId);
              if (!note) return null;
              return (
                <div
                  key={tabId}
                  className={`flex items-center h-8 px-3 rounded-t-md cursor-pointer border-t border-x ${
                    activeTabId === tabId
                      ? "bg-[hsl(var(--obsidian-bg))] border-[hsl(var(--obsidian-border))] text-[hsl(var(--obsidian-text))]"
                      : "bg-transparent border-transparent text-[hsl(var(--obsidian-text-muted))] hover:bg-[hsl(var(--obsidian-panel))]"
                  }`}
                  onClick={() => {
                    setActiveTabId(tabId);
                    setActiveNoteId(tabId);
                  }}
                >
                  <span className="text-sm truncate max-w-[150px]">{note.filename}</span>
                  <button
                    className="ml-2 hover:bg-gray-700 rounded p-0.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      const newTabs = openTabs.filter(id => id !== tabId);
                      setOpenTabs(newTabs);
                      if (activeTabId === tabId) {
                        if (newTabs.length > 0) {
                          setActiveTabId(newTabs[newTabs.length - 1]);
                          setActiveNoteId(newTabs[newTabs.length - 1]);
                        } else {
                          setActiveTabId(null);
                          setActiveNoteId(null);
                        }
                      }
                      if (splitViewNoteId === tabId) {
                        setSplitViewNoteId(null);
                      }
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor">
                      <path d="M3 3L9 9M9 3L3 9" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Right Toolbar */}
          <div className="flex items-center gap-1 pl-2 ml-auto">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setFocusMode(!focusMode)}
              title={focusMode ? "Exit Focus Mode" : "Focus Mode"}
            >
              {focusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-8 w-8 p-0 ${hasUnread ? "bg-[hsl(var(--obsidian-accent))] text-white hover:brightness-110 ring-1 ring-[hsl(var(--obsidian-accent))]" : showChat ? "bg-accent/20 text-accent" : ""}`}
              onClick={() => setShowChat(!showChat)}
              title={hasUnread ? "Open chat, unread messages" : "Toggle Chat"}
              aria-label={hasUnread ? "Open chat, unread messages" : "Toggle chat"}
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
            {activeTabId && (
              <div className="flex bg-[hsl(var(--obsidian-panel))] rounded-md p-0.5 border border-[hsl(var(--obsidian-border))] ml-2">
                <button
                  className={`p-1 rounded text-xs flex items-center ${editorMode === 'raw' ? 'bg-gray-700 shadow-sm' : 'hover:bg-gray-800'}`}
                  onClick={() => setEditorMode('raw')}
                  title="Source"
                >
                  <FileCode className="h-3.5 w-3.5" />
                </button>
                <button
                  className={`p-1 rounded text-xs flex items-center ${editorMode === 'preview' ? 'bg-gray-700 shadow-sm' : 'hover:bg-gray-800'}`}
                  onClick={() => setEditorMode('preview')}
                  title="Preview"
                >
                  <Type className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {activeTabId && !splitViewNoteId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 ml-1"
                onClick={() => setSplitViewNoteId(activeTabId)}
                title="Split Right"
              >
                <div className="flex border border-current rounded overflow-hidden h-3 w-3">
                  <div className="w-1/2 border-r border-current"></div>
                  <div className="w-1/2"></div>
                </div>
              </Button>
            )}
            {splitViewNoteId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 ml-1 text-xs"
                onClick={() => setSplitViewNoteId(null)}
              >
                Close Split
              </Button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Main Editor */}
          <div className="flex-1 flex overflow-hidden relative">
            {activeTabId ? renderEditor(activeTabId, false) : (
              <div className="flex-1 flex items-center justify-center text-[hsl(var(--obsidian-text-muted))]">
                Select a file from the sidebar to view or edit.
              </div>
            )}
          </div>

          {/* Split View */}
          {splitViewNoteId && (
            <div className="flex-1 flex overflow-hidden relative border-l border-[hsl(var(--obsidian-border))]">
              {renderEditor(splitViewNoteId, true)}
            </div>
          )}
        </div>
      </div>

      {/* Chat Panel */}
      {!focusMode && (
        <ChatPanel
          open={showChat}
          onOpenChange={setShowChat}
          width={chatWidth}
          onWidthChange={setChatWidth}
          ydoc={ydoc}
          username={myUsername}
          userColor={myColor}
          clientId={chatClientId}
        />
      )}
    </div>
  );
}
