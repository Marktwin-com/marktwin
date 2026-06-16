import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Lock, Github, Users, Settings, Plus, FileText, Share2, Upload, Copy, Maximize2, Minimize2, MessageSquare, FileCode, Type, ChevronRight, ChevronLeft } from "lucide-react";
import FileExplorer from "@/components/file-explorer";
import SimpleCollaborativeEditor from "@/components/simple-collaborative-editor";
import CollaborationIndicator from "@/components/collaboration-indicator";
import CabinetSettingsDialog from "@/components/cabinet-settings-dialog";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { decodeInvite } from "@/lib/private-crypto";
import { startOwnerCollaboration, OwnerCollaboration, InvitePayload, JoinCollaboration, joinCollaboration } from "@/lib/private-collab";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import ChatPanel, { type ChatMessage } from "@/components/chat-panel";
import { useToast } from "@/hooks/use-toast";
import type { Vault, Note } from "@shared/schema";
import { listGitHubFiles, loadMarkdownFile, commitMarkdownFile, createBranch } from "@/lib/browser-github";
import { getSavedRepos, updateSavedRepo, type SavedRepoLocal } from "@/lib/saved-repos";

export default function VaultPage() {
  const [, params] = useRoute("/cabinet/:slug");
  const [isJoinRoute] = useRoute("/join");
  const [, setLocation] = useLocation();
  const slug = params?.slug || "";
  const [authenticated, setAuthenticated] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState<number | null>(null);
  const [editorMode, setEditorMode] = useState<"raw" | "preview">("raw");
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [showVaultUrl, setShowVaultUrl] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCollabDialog, setShowCollabDialog] = useState(false);
  const [collabSession, setCollabSession] = useState<OwnerCollaboration | null>(null);
  const [syncedPeerCount, setSyncedPeerCount] = useState(1);
  const [sharedName, setSharedName] = useState("Shared Cabinet");
  const [invite, setInvite] = useState<InvitePayload | null>(null);
  const [joinStatus, setJoinStatus] = useState("Preparing private session");
  const [joinError, setJoinError] = useState("");
  const joinSessionRef = useRef<JoinCollaboration | null>(null);
  const [joinNotes, setJoinNotes] = useState<Note[]>([]);

  // Yjs document for the full cabinet sync
  const vaultYdoc = useRef(new Y.Doc()).current;
  const [focusMode, setFocusMode] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const { toast } = useToast();
  const fileExplorerRef = useRef(null);
  const [creatingFile, setCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFilePath, setNewFilePath] = useState("/");
  const [openTabs, setOpenTabs] = useState<number[]>([]);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [splitViewNoteId, setSplitViewNoteId] = useState<number | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [chatWidth, setChatWidth] = useState(384); // Default width of 384px (w-96)
  const [isMovingFolder, setIsMovingFolder] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [lastSidebarWidth, setLastSidebarWidth] = useState(320);
  const activeNoteIdRef = useRef(activeNoteId);
  const openTabsLengthRef = useRef(openTabs.length);
  const showChatRef = useRef(showChat);

  const vaultAwareness = useRef(new Awareness(vaultYdoc)).current;
  const chatClientId = String(vaultAwareness.clientID);
  const generatedUsernameRef = useRef(`User${Math.random().toString(36).substring(2, 6)}`);
  const userRenamedSelfRef = useRef(false);
  const [myUsername, setMyUsername] = useState(() => generatedUsernameRef.current);
  const [myColor, setMyColor] = useState(() => `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`);

  const handleUsernameChange = useCallback((name: string) => {
    userRenamedSelfRef.current = true;
    setMyUsername(name);
  }, []);

  useEffect(() => {
    vaultAwareness.setLocalStateField('user', {
      name: myUsername,
      color: myColor,
      clientId: vaultAwareness.clientID
    });
  }, [myUsername, myColor, vaultAwareness]);

  useEffect(() => {
    const messagesArray = vaultYdoc.getArray<ChatMessage>('chat-messages');
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
  }, [vaultYdoc, chatClientId]);

  useEffect(() => {
    showChatRef.current = showChat;
    if (showChat) setHasUnread(false);
  }, [showChat]);

  // Get private repo
  const { data: savedRepos = [], isLoading: reposLoading } = useQuery<SavedRepoLocal[]>({
    queryKey: ["/api/repos"],
    queryFn: () => getSavedRepos(),
    enabled: !isJoinRoute,
  });
  const privateRepo = savedRepos.find(r => r.repoFullName.split('/')[1] === slug || r.repoFullName === slug);
  const githubToken = privateRepo ? sessionStorage.getItem(`gh-token-${slug}`) : null;

  const [localNotes, setLocalNotes] = useState<Note[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const vaultLoading = reposLoading;
  const vault = privateRepo ? { id: privateRepo.id, name: privateRepo.displayName.split('/').pop() || privateRepo.displayName, slug: slug, urlSlug: slug, githubRepo: privateRepo.repoFullName } as unknown as Vault : undefined;

  // Auto-authenticate once a token is available for this repo
  useEffect(() => {
    if (githubToken && !authenticated) {
      setAuthenticated(true);
    }
  }, [githubToken, authenticated]);

  useEffect(() => {
    activeNoteIdRef.current = activeNoteId;
  }, [activeNoteId]);

  useEffect(() => {
    openTabsLengthRef.current = openTabs.length;
  }, [openTabs.length]);


  useEffect(() => {
    if (!isJoinRoute) return;
    const filesMap = vaultYdoc.getMap<Y.Map<any>>("files");
    const fileObservers = new Map<Y.Map<any>, (event: Y.YMapEvent<any>) => void>();

    const buildNotes = () => Array.from(filesMap.keys()).map(key => {
      const fileMap = filesMap.get(key);
      return {
        id: Number(fileMap?.get("id") ?? parseInt(key, 10)),
        vaultId: 0,
        filename: fileMap?.get("filename") || "Untitled",
        path: fileMap?.get("path") || "/",
        content: ""
      } as Note;
    }).sort((a, b) => a.filename.localeCompare(b.filename));

    const reconcileFileObservers = () => {
      const currentFileMaps = new Set<Y.Map<any>>();

      for (const fileMap of Array.from(filesMap.values())) {
        currentFileMaps.add(fileMap);
        if (fileObservers.has(fileMap)) continue;

        const observer = (event: Y.YMapEvent<any>) => {
          if (
            event.keysChanged.has("id") ||
            event.keysChanged.has("filename") ||
            event.keysChanged.has("path")
          ) {
            updateFiles();
          }
        };

        fileMap.observe(observer);
        fileObservers.set(fileMap, observer);
      }

      for (const [fileMap, observer] of Array.from(fileObservers.entries())) {
        if (!currentFileMaps.has(fileMap)) {
          fileMap.unobserve(observer);
          fileObservers.delete(fileMap);
        }
      }
    };

    const updateFiles = () => {
      reconcileFileObservers();
      const newFiles = buildNotes();
      setJoinNotes(newFiles);

      if (newFiles.length > 0 && activeNoteIdRef.current === null && openTabsLengthRef.current === 0) {
        const firstFileId = newFiles[0].id;
        activeNoteIdRef.current = firstFileId;
        openTabsLengthRef.current = 1;
        setActiveNoteId(firstFileId);
        setOpenTabs([firstFileId]);
        setActiveTabId(firstFileId);
      }
    };

    filesMap.observe(updateFiles);
    updateFiles();
    return () => {
      filesMap.unobserve(updateFiles);
      for (const [fileMap, observer] of fileObservers) {
        fileMap.unobserve(observer);
      }
    };
  }, [isJoinRoute, vaultYdoc]);

  if (joinError) {
    return (
      <div className="min-h-screen bg-[hsl(var(--obsidian-bg))] flex items-center justify-center p-4">
        <Card className="max-w-md bg-[hsl(var(--obsidian-panel))] border-[hsl(var(--obsidian-border))]">
          <CardHeader>
            <CardTitle className="text-red-300">Cannot Join Session</CardTitle>
            <div className="text-sm text-muted-foreground">{joinError}</div>
          </CardHeader>
        </Card>
      </div>
    );
  }

  useEffect(() => {
    if (!isJoinRoute) return;
    
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const token = searchParams.get("token") || window.location.hash.replace('#', '');
      if (!token) throw new Error("No token");
      const parsed = decodeInvite(token) as InvitePayload;
      if (parsed.v !== 1) throw new Error("Unsupported invite version");
      setInvite(parsed);
      joinCollaboration(vaultYdoc, vaultAwareness, parsed, setJoinStatus).then((session) => {
        joinSessionRef.current = session;
      });
    } catch {
      setJoinError("Invalid private invite link.");
    }
    return () => joinSessionRef.current?.stop();
  }, [isJoinRoute, vaultYdoc, vaultAwareness]);

  const notes = isJoinRoute ? joinNotes : localNotes;
  const refetchNotes = async () => {
    if (!githubToken || !privateRepo) return;
    setIsSyncing(true);
    try {
      const files = await listGitHubFiles(githubToken, privateRepo.repoFullName, privateRepo.defaultBranch);
      setLocalNotes(files.map((f, i) => ({
        id: i + 1,
        vaultId: privateRepo.id,
        path: f.path.substring(0, f.path.lastIndexOf('/') + 1) || "/",
        filename: f.name,
        content: "",
        githubSha: f.sha
      } as unknown as Note)));
    } catch (e) {
      // failed to fetch
    }
    setIsSyncing(false);
  };

  useEffect(() => {
    if (authenticated && githubToken && privateRepo) {
      refetchNotes();
    }
  }, [authenticated, githubToken, privateRepo]);

  // Synchronize localNotes into the Y.Doc (max 20 files)
  useEffect(() => {
    if (!authenticated) return;

    const filesMap = vaultYdoc.getMap<Y.Map<any>>("files");
    const notesToSync = localNotes.slice(0, 20); // enforce max 20 files limit
    
    vaultYdoc.transact(() => {
      notesToSync.forEach(note => {
        const idStr = String(note.id);
        let fileMap = filesMap.get(idStr);
        
        if (!fileMap) {
          fileMap = new Y.Map();
          filesMap.set(idStr, fileMap);
          
          fileMap.set("id", note.id);
          fileMap.set("filename", note.filename);
          fileMap.set("path", note.path);
          
          const contentText = new Y.Text();
          if (note.content) {
            contentText.insert(0, note.content);
          }
          fileMap.set("content", contentText);
        } else {
          if (fileMap.get("filename") !== note.filename) fileMap.set("filename", note.filename);
          if (fileMap.get("path") !== note.path) fileMap.set("path", note.path);
          
          const contentText = fileMap.get("content") as Y.Text;
          if (note.content && contentText.length === 0 && note.content.length > 0) {
            contentText.insert(0, note.content);
          }
        }
      });
    });
  }, [localNotes, vaultYdoc, authenticated]);

  
  // Track meta map
  useEffect(() => {
    const metaMap = vaultYdoc.getMap("meta");
    const updateMeta = () => {
      setSyncedPeerCount((metaMap.get("peerCount") as number) || 1);
      setSharedName((metaMap.get("name") as string) || "Shared Cabinet");
    };
    metaMap.observe(updateMeta);
    updateMeta();
    return () => metaMap.unobserve(updateMeta);
  }, [vaultYdoc]);
  
  // Owner syncing meta map
  useEffect(() => {
    if (isJoinRoute || !authenticated || !vault) return;
    const metaMap = vaultYdoc.getMap("meta");
    if (metaMap.get("name") !== vault.name) {
      metaMap.set("name", vault.name);
    }
  }, [vault, vaultYdoc, isJoinRoute, authenticated]);

  useEffect(() => {
    if (activeNoteId !== null && githubToken && privateRepo) {
      const note = localNotes.find(n => n.id === activeNoteId);
      if (note && !note.content) {
        const fullPath = (note.path !== "/" ? note.path : "") + note.filename;
        loadMarkdownFile(githubToken, privateRepo.repoFullName, fullPath, privateRepo.defaultBranch)
          .then((loaded: any) => {
            const content = loaded.content;
            setLocalNotes(prev => prev.map(n => n.id === activeNoteId ? { ...n, content, githubSha: loaded.sha } : n));
          });
      }
    }
  }, [activeNoteId, localNotes, githubToken, privateRepo]);

  const activeNote = isJoinRoute ? joinNotes.find(n => n.id === activeNoteId) : localNotes.find(n => n.id === activeNoteId);

  // Create note mutation
  const createNoteMutation = useMutation({
    mutationFn: async (noteData: { filename: string; path?: string; content?: string }) => {
      const newNote: Note = {
        id: Math.max(0, ...localNotes.map(n => n.id)) + 1,
        vaultId: privateRepo!.id,
        path: noteData.path || "/",
        filename: noteData.filename,
        content: noteData.content ?? "",
      } as unknown as Note;
      setLocalNotes(prev => [...prev, newNote]);
      return newNote;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Note created successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create note",
        variant: "destructive",
      });
    },
  });

  // Update note mutation
  const updateNoteMutation = useMutation({
    mutationFn: async ({ id, content }: { id: number; content: string }) => {
      setLocalNotes(prev => prev.map(n => n.id === id ? { ...n, content } : n));
      return { id, content };
    },
  });

  // GitHub sync mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
        if (!githubToken || !privateRepo) throw new Error("No token or repo");
        let targetBranch = privateRepo.defaultBranch;
        let branchCreated = false;

        for (const note of localNotes) {
          if (note.content) {
             const fullPath = (note.path !== "/" ? note.path : "") + note.filename;
             const previousSha = (note as any).githubSha || "";
             
             try {
                const res = await commitMarkdownFile({
                   token: githubToken,
                   repoFullName: privateRepo.repoFullName,
                   path: fullPath,
                   branch: targetBranch,
                   previousSha: previousSha,
                   content: note.content,
                   message: `Update ${note.filename} via Marktwin`
                });
                if (!res.ok) {
                   throw new Error("CONFLICT_DETECTED");
                }
                setLocalNotes(prev => prev.map(n => n.id === note.id ? { ...n, githubSha: res.sha } : n));
             } catch (err: any) {
                if (err.message === "CONFLICT_DETECTED" || err.message.includes("409")) {
                   if (!branchCreated) {
                      const now = new Date();
                      const dd = String(now.getDate()).padStart(2, '0');
                      const hh = String(now.getHours()).padStart(2, '0');
                      const mm = String(now.getMinutes()).padStart(2, '0');
                      const ss = String(now.getSeconds()).padStart(2, '0');
                      const newBranch = `${privateRepo.defaultBranch}-${dd}-${hh}-${mm}-${ss}`;
                      
                      await createBranch(githubToken, privateRepo.repoFullName, privateRepo.defaultBranch, newBranch);
                      targetBranch = newBranch;
                      branchCreated = true;
                   }
                   
                   const newBranchFiles = await listGitHubFiles(githubToken, privateRepo.repoFullName, targetBranch);
                   const newBranchFile = newBranchFiles.find(f => f.path === fullPath);
                   
                   const retryRes = await commitMarkdownFile({
                       token: githubToken,
                       repoFullName: privateRepo.repoFullName,
                       path: fullPath,
                       branch: targetBranch,
                       previousSha: newBranchFile ? newBranchFile.sha : "",
                       content: note.content,
                       message: `Update ${note.filename} via Marktwin (conflict resolution branch)`
                   });
                   if (retryRes.ok) {
                       setLocalNotes(prev => prev.map(n => n.id === note.id ? { ...n, githubSha: retryRes.sha } : n));
                   } else {
                       throw new Error("Failed to push to fallback branch");
                   }
                } else {
                   throw err;
                }
             }
          }
        }
        return { branchCreated, targetBranch };
    },
    onSuccess: async (data: any) => {
      if (data?.branchCreated) {
        if (privateRepo) {
          updateSavedRepo(privateRepo.id, { defaultBranch: data.targetBranch });
          queryClient.invalidateQueries({ queryKey: ["/api/repos"] });
        }
        toast({
          title: "Conflict Detected",
          description: `Conflict when merging. New branch '${data.targetBranch}' created. Conflict resolution will come in the future!`,
          duration: 6000,
        });
      } else {
        toast({
          title: "Success",
          description: "Committed directly to GitHub",
          duration: 3000,
        });
      }
    },
    onError: (error: any) => {
        toast({
          title: "Error",
          description: error.message || "Failed to sync with GitHub",
          variant: "destructive",
          duration: 3000,
        });
    }
  });

  // Auto-sync effect
  useEffect(() => {
    const interval = setInterval(() => {
      syncMutation.mutate();
    }, 15 * 60 * 1000); // 15 minutes

    return () => clearInterval(interval);
  }, [slug, syncMutation]);

  const handleNoteSelect = (noteId: number) => {
    if (!openTabs.includes(noteId)) setOpenTabs(prev => [...prev, noteId]);
    setActiveTabId(noteId);
    setActiveNoteId(noteId);
  };

  const handleTabClose = (noteId: number) => {
    setOpenTabs((prev) => prev.filter(id => id !== noteId));
    if (activeTabId === noteId) {
      // Switch to next tab, or previous, or null
      const idx = openTabs.indexOf(noteId);
      const nextTab = openTabs[idx + 1] || openTabs[idx - 1] || null;
      setActiveTabId(nextTab);
      setActiveNoteId(nextTab);
    }
    if (splitViewNoteId === noteId) {
      setSplitViewNoteId(null);
    }
  };

  const toggleSplitView = (noteId: number) => {
    setSplitViewNoteId(prev => prev === noteId ? null : noteId);
  };

  const handleSync = () => {
    syncMutation.mutate();
  };

  const handleNewFile = (path: string) => {
    setCreatingFile(true);
    setNewFileName("");
    setNewFilePath(path);
  };

  const handleNewFileSubmit = () => {
    if (newFileName.trim()) {
      let filename = newFileName.trim();
      if (!filename.includes('.')) filename += '.md';
      createNoteMutation.mutate({ filename, path: newFilePath });
      setCreatingFile(false);
      setNewFileName("");
    }
  };

  const handleNewFileCancel = () => {
    setCreatingFile(false);
    setNewFileName("");
  };

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: async (path: string) => {
      setIsCreatingFolder(true);
      try {
        const response = await apiRequest("POST", `/api/vaults/${slug}/folders`, { path });
        return response.json();
      } finally {
        setIsCreatingFolder(false);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/vaults/${slug}/notes`] });
      toast({
        title: "Success",
        description: "Folder created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create folder",
        variant: "destructive",
      });
    },
  });

  // Move folder mutation
  const moveFolderMutation = useMutation({
    mutationFn: async ({ oldPath, newPath }: { oldPath: string; newPath: string }) => {
      setIsMovingFolder(true);
      try {
        const response = await apiRequest("POST", `/api/vaults/${slug}/folders/move`, {
          sourcePath: oldPath,
          destPath: newPath,
        });
        return response.json();
      } finally {
        setIsMovingFolder(false);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/vaults/${slug}/notes`] });
      toast({
        title: "Success",
        description: "Folder moved successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to move folder",
        variant: "destructive",
      });
    },
  });

  // Delete folder mutation
  const deleteFolderMutation = useMutation({
    mutationFn: async (path: string) => {
      const response = await apiRequest("DELETE", `/api/vaults/${slug}/folders`, { path });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/vaults/${slug}/notes`] });
      toast({
        title: "Success",
        description: "Folder deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete folder",
        variant: "destructive",
      });
    },
  });

  // Rename note mutation
  const renameNoteMutation = useMutation({
    mutationFn: async ({ id, filename }: { id: number; filename: string }) => {
      const response = await apiRequest("PUT", `/api/notes/${id}`, { filename });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/vaults/${slug}/notes`] });
      toast({ title: "Success", description: "File renamed successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to rename file", variant: "destructive" });
    },
  });

  // Delete note mutation
  const deleteNoteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/notes/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/vaults/${slug}/notes`] });
      toast({ title: "Success", description: "File deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete file", variant: "destructive" });
    },
  });

  const handleRenameNote = (id: number, filename: string) => {
    renameNoteMutation.mutate({ id, filename });
  };

  const handleDeleteNote = (id: number) => {
    deleteNoteMutation.mutate(id);
  };

  // Duplicate note handler
  const handleDuplicateNote = (note: Note) => {
    // Find a unique filename in the same path
    const base = note.filename.replace(/(\.[^.]*)$/, "");
    const ext = note.filename.includes('.') ? note.filename.slice(note.filename.lastIndexOf('.')) : '.md';
    let copyName = `${base}-copy${ext}`;
    let i = 2;
    while (notes.some(n => n.path === note.path && n.filename === copyName)) {
      copyName = `${base}-copy-${i}${ext}`;
      i++;
    }
    createNoteMutation.mutate({ filename: copyName, path: note.path, content: note.content });
  };

  const moveNoteMutation = useMutation({
    mutationFn: async ({ noteId, newPath }: { noteId: number; newPath: string }) => {
      return apiRequest("PUT", `/api/notes/${noteId}`, { path: newPath });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/vaults/${vault?.urlSlug}/notes`] });
      toast({
        title: "Success",
        description: "Note moved successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to move note",
        variant: "destructive",
      });
    },
  });

  const handleMoveNote = (noteId: number, newPath: string) => {
    moveNoteMutation.mutate({ noteId, newPath });
  };

  const uploadFileMutation = useMutation({
    mutationFn: async ({ file, path }: { file: File; path: string }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', path);
      
      const response = await fetch(`/api/vaults/${vault?.urlSlug}/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Upload failed');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/vaults/${vault?.urlSlug}/notes`] });
      toast({
        title: "Success",
        description: "File uploaded successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to upload file",
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const allowedTypes = [
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/gif',
        'image/svg+xml',
        'text/markdown',
        'text/plain'
      ];

      if (allowedTypes.includes(file.type) || file.name.match(/\.(pdf|png|jpg|jpeg|gif|svg|md|txt)$/i)) {
        uploadFileMutation.mutate({ file, path: "/" });
      } else {
        toast({
          title: "Error",
          description: `File type not supported: ${file.name}`,
          variant: "destructive",
        });
      }
    });
    // Reset input
    event.target.value = '';
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(event.dataTransfer.files);
    files.forEach(file => {
      const allowedTypes = [
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/gif',
        'image/svg+xml',
        'text/markdown',
        'text/plain'
      ];

      if (allowedTypes.includes(file.type) || file.name.match(/\.(pdf|png|jpg|jpeg|gif|svg|md|txt)$/i)) {
        uploadFileMutation.mutate({ file, path: "/" });
      } else {
        toast({
          title: "Error",
          description: `File type not supported: ${file.name}`,
          variant: "destructive",
        });
      }
    });
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    // Only show upload overlay for external file drags (not app-file-move or folder-move)
    const types = event.dataTransfer.types;
    if (
      types.includes('Files') &&
      !types.includes('app-file-move') &&
      !types.includes('folder-move')
    ) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
  };

  const handleContentChange = (content: string) => {
    if (activeNoteId) {
      updateNoteMutation.mutate({ id: activeNoteId, content });
    }
  };

  if (!slug && !isJoinRoute) return null;

  if (vaultLoading && !isJoinRoute) {
    return (
      <div className="min-h-screen bg-[hsl(var(--obsidian-bg))] flex items-center justify-center">
        <div className="text-white">Loading cabinet...</div>
      </div>
    );
  }

  if (!vault && !isJoinRoute) {
    return (
      <div className="min-h-screen bg-[hsl(var(--obsidian-bg))] flex items-center justify-center">
        <Card className="w-full max-w-md mx-4 bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))]">
          <CardContent className="pt-6">
            <div className="flex mb-4 gap-2">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <h1 className="text-2xl font-bold text-white">Cabinet Not Found</h1>
            </div>
            <p className="mt-4 text-sm text-gray-400">
              The cabinet "{slug}" does not exist.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!authenticated && !isJoinRoute) {
    return (
      <div className="min-h-screen bg-[hsl(var(--obsidian-bg))] flex items-center justify-center">
        <Card className="w-full max-w-md mx-4 bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))]">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Cabinet: {vault?.name || "Private Cabinet"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-400">
              No GitHub token found in this browser session for this cabinet.
            </p>
            <Button
              onClick={() => setLocation("/my-cabinets")}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Go to My Cabinets
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div 
      className={`h-screen bg-[hsl(var(--obsidian-bg))] text-[hsl(var(--obsidian-text))] overflow-hidden flex relative transition-all duration-300`}
      style={{ paddingRight: showChat ? `${chatWidth}px` : '0' }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div
          className="absolute inset-0 bg-accent/20 border-2 border-dashed border-accent z-50 flex items-center justify-center"
          onDragEnter={e => {
            if (e.dataTransfer.types.includes("app-file-move") || e.dataTransfer.types.includes("folder-move")) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          }}
          onDragOver={e => {
            if (e.dataTransfer.types.includes("app-file-move") || e.dataTransfer.types.includes("folder-move")) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          }}
        >
          <div className="bg-[hsl(var(--obsidian-sidebar))] p-6 rounded-lg text-center">
            <Upload className="h-12 w-12 text-accent mx-auto mb-4" />
            <p className="text-xl font-semibold text-[hsl(var(--obsidian-text))] mb-2">Drop files here</p>
            <p className="text-[hsl(var(--obsidian-text-muted))]">Supports PDF and image files</p>
          </div>
        </div>
      )}
      
      {/* Sidebar (collapsible) */}
      {!sidebarCollapsed && (
        <div 
          className="bg-[hsl(var(--obsidian-sidebar))] border-r border-[hsl(var(--obsidian-border))] flex flex-col transition-all duration-300 relative overflow-hidden"
          style={{ width: `${sidebarWidth}px` }}
        >
          {/* Watermark - positioned to show right half */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.015] z-0 flex items-center">
            <img
              src="/logo_w.svg"
              alt=""
              className="max-w-[200%] h-auto object-contain -translate-x-1/2"
            />
          </div>
          {/* Vault Header */}
          <div className="p-4 border-b border-[hsl(var(--obsidian-border))]">
            <div className="flex items-center justify-between mb-3 min-w-0 overflow-hidden">
              <div className="flex items-center min-w-0 overflow-hidden">
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="p-1 h-6 w-6 mr-1 flex-shrink-0" 
                  onClick={() => setLocation("/")}
                  title="Back to Home"
                >
                  <ChevronLeft className="h-4 w-4 text-[hsl(var(--obsidian-text-muted))]" />
                </Button>
                <h1 className="text-lg font-semibold text-[hsl(var(--obsidian-text))] truncate min-w-0">{isJoinRoute ? sharedName : vault?.name}</h1>
              </div>
              <div className="flex items-center space-x-2 flex-shrink-0 min-w-0 overflow-hidden max-w-full" style={{maxWidth: 'calc(100% - 1.5rem)'}}>
                
                {!isJoinRoute && vault?.githubRepo && (
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="p-1 h-6 w-6"
                    onClick={handleSync}
                    disabled={syncMutation.isPending}
                    title="Sync Now"
                  >
                    <Github className={`h-3 w-3 text-[hsl(var(--obsidian-text))] ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                  </Button>
                )}
                {!isJoinRoute && <Button 
                  size="sm" 
                  variant="ghost" 
                  className="p-1 h-6 w-6"
                  onClick={async () => {
                    try {
                      let s = collabSession;
                      s = await startOwnerCollaboration(vaultYdoc, vaultAwareness, () => {
                        const metaMap = vaultYdoc.getMap("meta");
                        metaMap.set("peerCount", (s?.peerCount() || 0) + 1);
                      });
                      const session = s;
                      setCollabSession(session);
                      setShowCollabDialog(true);
                    } catch (e: any) {
                      toast({ title: "Failed to start sharing", description: e.message, variant: "destructive" });
                    }
                  }}
                  title="Share Full Cabinet (P2P)"
                >
                  <Share2 className="h-3 w-3 text-[hsl(var(--obsidian-text))]" />
                </Button>}
                {!isJoinRoute && <Button 
                  size="sm" 
                  variant="ghost" 
                  className="p-1 h-6 w-6"
                  onClick={() => setShowSettings(true)}
                >
                  <Settings className="h-3 w-3 text-[hsl(var(--obsidian-text))]" />
                </Button>}
              </div>
            </div>
            
            {/* Replaced showVaultUrl with Dialog handled below */}

            </div>

          {/* File Explorer */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-[hsl(var(--primary))]">Files</h3>
                {!isJoinRoute && (
                  <div className="flex items-center gap-1" style={{ pointerEvents: 'auto' }}>
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.gif,.svg,.md,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="file-upload"
                      multiple
                      onDragOver={e => e.stopPropagation()}
                      onDrop={e => e.stopPropagation()}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="p-1 h-6 w-6"
                      onClick={() => document.getElementById('file-upload')?.click()}
                      title="Upload file"
                      onDragOver={e => e.stopPropagation()}
                      onDrop={e => e.stopPropagation()}
                    >
                      <Upload className="h-3 w-3 text-gray-400" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="p-1 h-6 w-6"
                      onClick={() => handleNewFile("/")}
                      title="New File"
                    >
                      <Plus className="h-3 w-3 text-gray-400" />
                    </Button>
                  </div>
                )}
              </div>
              <FileExplorer 
                notes={notes} 
                activeNoteId={activeNoteId}
                activeNote={activeNote}
                onNoteSelect={handleNoteSelect}
                onCreateNote={(path: string = "/", filename?: string) => {
                  if (filename) {
                    let finalName = filename.trim();
                    if (!finalName.includes('.')) finalName += '.md';
                    createNoteMutation.mutate({ filename: finalName, path });
                    setCreatingFile(false);
                  } else {
                    setCreatingFile(true);
                    setNewFileName("");
                    setNewFilePath(path);
                  }
                }}
                onMoveNote={handleMoveNote}
                creatingFile={creatingFile}
                newFileName={newFileName}
                setNewFileName={setNewFileName}
                handleNewFileSubmit={handleNewFileSubmit}
                handleNewFileCancel={handleNewFileCancel}
                onCreateFolder={(parentPath: string, folderName: string) => {
                  let path = parentPath;
                  if (!path.endsWith('/')) path += '/';
                  path += folderName;
                  createFolderMutation.mutate(path);
                }}
                onMoveFolder={(sourcePath: string, destPath: string) => {
                  if (isMovingFolder) return;
                  moveFolderMutation.mutate({ oldPath: sourcePath, newPath: destPath });
                }}
                onDeleteFolder={(path: string) => {
                  if (confirm(`Are you sure you want to delete the folder "${path}" and all its contents?`)) {
                    deleteFolderMutation.mutate(path);
                  }
                }}
                vaultSlug={slug}
                onRenameNote={handleRenameNote}
                onDeleteNote={handleDeleteNote}
                onDuplicateNote={handleDuplicateNote}
                isMovingFolder={isMovingFolder}
                isCreatingFolder={isCreatingFolder}
                readOnly={isJoinRoute}
              />
            </div>
          </div>

          {/* GitHub Integration Panel */}
          {!isJoinRoute && vault?.githubRepo && (
            <div className="p-4 border-t border-[hsl(var(--obsidian-border))]">
              <div className="bg-[hsl(var(--obsidian-panel))] p-3 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-[hsl(var(--obsidian-text))]">GitHub Sync</span>
                  <Github className="h-4 w-4 text-[hsl(var(--obsidian-text))]" />
                </div>
                <div className="text-xs text-[hsl(var(--obsidian-text-muted))] mb-2">{vault.githubRepo}</div>
              {vault?.lastSyncAt && (
                <div className="text-xs text-[hsl(var(--obsidian-text-muted))] mb-3">
                  Last synced: {new Date(vault.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
                <div className="flex items-center justify-end text-xs">
                  <Button
                    size="sm" 
                    variant="ghost" 
                    className="text-accent hover:text-accent/80 h-auto p-0"
                    onClick={handleSync}
                    disabled={syncMutation.isPending}
                  >
                    {syncMutation.isPending ? "Syncing..." : "Sync Now"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expand button when sidebar is collapsed */}
      {sidebarCollapsed && (
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
      {!sidebarCollapsed && (
        <div 
          className="resizer"
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

      {/* Editor Area: Single Tab Bar and Editor */}
      <div className="flex-1 flex flex-col">
        {/* Tab Bar */}
        <div className="h-12 bg-[hsl(var(--obsidian-sidebar))] border-b border-[hsl(var(--obsidian-border))] flex items-center px-2">
          {/* Tabs */}
          <div className="flex-1 flex items-center overflow-x-auto">
            {openTabs.map(tabId => {
              const note = notes.find(n => n.id === tabId);
              if (!note) return null;
              return (
                <div
                  key={tabId}
                  className={`flex items-center px-4 py-1 mr-2 rounded-t cursor-pointer transition-colors ${tabId === activeTabId ? 'bg-[hsl(var(--obsidian-panel))] border-b-2 border-accent' : 'hover:bg-[hsl(var(--obsidian-panel))]'}`}
                  onClick={() => { setActiveTabId(tabId); setActiveNoteId(tabId); }}
                >
                  <FileText className="h-3 w-3 text-[hsl(var(--obsidian-text))] mr-2" />
                  <span className="text-sm text-[hsl(var(--obsidian-text))] mr-2">{note.filename}</span>
                  <button
                    className="ml-1 text-[hsl(var(--obsidian-text-muted))] hover:text-red-400"
                    onClick={e => { e.stopPropagation(); handleTabClose(tabId); }}
                    title="Close tab"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          {/* Collaboration Status */}
          <div className="flex items-center gap-4 px-4 border-l border-[hsl(var(--obsidian-border))]">
            {/* Identity and Avatar */}
            <div className="flex items-center gap-2">
              <CollaborationIndicator 
                awareness={vaultAwareness} 
                myName={myUsername} 
                onNameChange={handleUsernameChange} 
              />
            </div>

            {/* Chat Button */}
            <button
              onClick={() => setShowChat(!showChat)}
              aria-label={hasUnread ? "Open chat, unread messages" : "Open chat"}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${
                hasUnread 
                  ? 'bg-[hsl(var(--obsidian-accent))] text-white hover:brightness-110 ring-1 ring-[hsl(var(--obsidian-accent))]' 
                  : 'bg-[hsl(var(--obsidian-panel))] hover:bg-[hsl(var(--obsidian-panel-hover))] text-[hsl(var(--obsidian-text-muted))] hover:text-[hsl(var(--obsidian-text))]'
              }`}
            >
              <MessageSquare className="h-4 w-4" />
              <span className="text-xs">Chat</span>
            </button>
          </div>
        </div>
        {/* Editor Content */}
        <div className="flex-1 flex flex-col min-h-0 relative">
          {activeTabId ? (
            (() => {
              const note = notes.find(n => n.id === activeTabId);
              const splitNote = splitViewNoteId ? notes.find(n => n.id === splitViewNoteId) : null;
              
              return note ? (
                <div className="h-full flex flex-row w-full overflow-hidden">
                  {/* Primary Editor */}
                  <div className={`h-full flex flex-col relative ${splitNote ? 'w-1/2 border-r border-[hsl(var(--obsidian-border))]' : 'w-full'}`}>
                      <SimpleCollaborativeEditor
                        note={note}
                        vaultId={vault?.id || 0}
                        mode={editorMode}
                        vaultSlug={isJoinRoute ? "shared-session" : slug}
                        readOnly={isJoinRoute ? invite?.role !== "edit" : !authenticated}
                        ytext={vaultYdoc.getMap<Y.Map<any>>('files').get(String(note.id))?.get('content') as Y.Text | undefined}
                        awareness={vaultAwareness}
                        onContentChange={(newContent) => {
                        if (!isJoinRoute) {
                          updateNoteMutation.mutate({ id: note.id, content: newContent });
                        }
                      }}
                      onModeChange={setEditorMode}
                      onSplitView={() => toggleSplitView(note.id)}
                    />
                  </div>
                  
                  {/* Split View Editor */}
                  {splitNote && (
                    <div className="h-full w-1/2 flex flex-col relative">
                      <SimpleCollaborativeEditor
                        note={splitNote}
                        vaultId={vault?.id || 0}
                        mode={editorMode}
                        vaultSlug={isJoinRoute ? "shared-session" : slug}
                        readOnly={isJoinRoute ? invite?.role !== "edit" : !authenticated}
                        isSplitPane={true}
                        ytext={vaultYdoc.getMap<Y.Map<any>>('files').get(String(splitNote.id))?.get('content') as Y.Text | undefined}
                        awareness={vaultAwareness}
                        onContentChange={(newContent) => {
                          if (!isJoinRoute) {
                            updateNoteMutation.mutate({ id: splitNote.id, content: newContent });
                          }
                        }}
                        onModeChange={setEditorMode}
                        onSplitView={() => toggleSplitView(splitNote.id)}
                      />
                    </div>
                  )}
                </div>
              ) : null;
            })()
          ) : (
            <div className="h-full flex items-center justify-center text-[hsl(var(--obsidian-text-muted))]">
              <div className="text-center">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a note to start editing</p>
                <p className="text-sm mt-2">or create a new one using the + button</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Settings Dialog */}
      {vault && (
        <CabinetSettingsDialog
          open={showSettings}
          onOpenChange={setShowSettings}
          vault={vault}
        />
      )}
      {/* Chat Panel */}
      <ChatPanel
        open={showChat}
        onOpenChange={setShowChat}
        width={chatWidth}
        onWidthChange={setChatWidth}
        ydoc={vaultYdoc}
        username={myUsername}
        userColor={myColor}
        clientId={chatClientId}
      />
      
      <Dialog open={showCollabDialog} onOpenChange={setShowCollabDialog}>
        <DialogContent className="bg-[hsl(var(--obsidian-panel))] border-[hsl(var(--obsidian-border))] text-[hsl(var(--obsidian-text))] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share Cabinet P2P</DialogTitle>
            <DialogDescription className="text-[hsl(var(--obsidian-text-muted))]">
              Share this ephemeral link with collaborators. The connection is direct WebRTC and zero content passes through any server.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="space-y-2">
              <Label>Edit Link</Label>
              <div className="flex gap-2">
                <Input readOnly value={collabSession?.editLink || ""} className="bg-[hsl(var(--obsidian-bg))] border-[hsl(var(--obsidian-border))]" />
                <Button variant="outline" size="icon" onClick={() => {
                  navigator.clipboard.writeText(collabSession?.editLink || "");
                  toast({ title: "Copied!" });
                }}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>View Only Link</Label>
              <div className="flex gap-2">
                <Input readOnly value={collabSession?.viewLink || ""} className="bg-[hsl(var(--obsidian-bg))] border-[hsl(var(--obsidian-border))]" />
                <Button variant="outline" size="icon" onClick={() => {
                  navigator.clipboard.writeText(collabSession?.viewLink || "");
                  toast({ title: "Copied!" });
                }}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCollabDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
