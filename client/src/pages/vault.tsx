import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  Copy,
  FileText,
  FolderOpen,
  Github,
  ListChecks,
  Loader2,
  MessageSquare,
  Plus,
  RotateCw,
  Settings,
  Share2,
  Undo2,
  Upload,
} from "lucide-react";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";

import type { CapturedDecision, ChatMessage, Note, SessionState, Vault, WorkspaceActivity, WorkspaceChange } from "@shared/schema";
import FileExplorer from "@/components/file-explorer";
import SimpleCollaborativeEditor from "@/components/simple-collaborative-editor";
import CollaborationIndicator from "@/components/collaboration-indicator";
import CabinetSettingsDialog from "@/components/cabinet-settings-dialog";
import ChatPanel from "@/components/chat-panel";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { decodeInvite } from "@/lib/private-crypto";
import {
  InvitePayload,
  JoinCollaboration,
  OwnerCollaboration,
  canEditSession,
  joinCollaboration,
  startOwnerCollaboration,
} from "@/lib/private-collab";
import {
  GitHubApiError,
  GitHubRootScope,
  GitHubRootSnapshot,
  commitAtomicChanges,
  createPrivateRepository,
  defaultRootScopes,
  getAuthenticatedUser,
  getBranch,
  getRepository,
  getRootSnapshot,
  loadScopeSnapshot,
  parseRepo,
} from "@/lib/browser-github";
import {
  addMarkdownNote,
  assertWorkspaceWithinScopes,
  collectAtomicChanges,
  createFolder,
  deleteFolder,
  deleteNote,
  describeWorkspaceChanges,
  discardWorkspaceChange,
  discardWorkspaceChanges,
  folderMarkdownCount,
  fullNotePath,
  getFilesMap,
  getFoldersMap,
  hasUnsyncedChanges,
  hydrateSelectedScopes,
  joinFolderPath,
  markNoteModified,
  mergeScopeContent,
  moveFolder,
  moveNote,
  normalizeDirectoryPath,
  pathBelongsToScope,
  readCabinetNotes,
  removeCleanScope,
  renameNote,
  scopeForPath,
  visibleFolderPaths,
  type ScopeContent,
} from "@/lib/cabinet-files";
import { getSavedRepos, updateSavedRepo, type SavedRepoLocal } from "@/lib/saved-repos";

type PendingDelete =
  | { kind: "file"; id: string; label: string; count: 1 }
  | { kind: "folder"; path: string; label: string; count: number };

type PendingMove = {
  sourcePath: string;
  targetPath: string;
  count: number;
};

function repositoryErrorMessage(error: unknown) {
  if (error instanceof GitHubApiError) {
    if (error.status === 401) return "GitHub rejected this token. Check the token and try again.";
    if (error.status === 403) return "This token does not have permission to read and write the repository.";
    return error.responseMessage;
  }
  return error instanceof Error ? error.message : "GitHub request failed.";
}

export default function VaultPage() {
  const [, params] = useRoute("/cabinet/:slug");
  const [isJoinRoute] = useRoute("/join");
  const [, setLocation] = useLocation();
  const slug = params?.slug || "";
  const { toast } = useToast();

  const vaultYdoc = useRef(new Y.Doc()).current;
  const vaultAwareness = useRef(new Awareness(vaultYdoc)).current;
  const joinSessionRef = useRef<JoinCollaboration | null>(null);
  const ownerSessionRef = useRef<OwnerCollaboration | null>(null);
  const [collabSession, setCollabSession] = useState<OwnerCollaboration | null>(null);

  const { data: savedRepos = [], isLoading: reposLoading } = useQuery<SavedRepoLocal[]>({
    queryKey: ["saved-repos"],
    queryFn: () => getSavedRepos(),
    enabled: !isJoinRoute,
  });
  const privateRepo = savedRepos.find((repo) => (
    String(repo.id) === slug ||
    repo.repoFullName.split("/")[1] === slug ||
    repo.repoFullName === slug
  ));
  const legacyTokenKey = privateRepo ? `gh-token-${privateRepo.repoFullName.split("/")[1]}` : "";
  const tokenKey = privateRepo ? `gh-token-${privateRepo.id}` : "";
  const githubToken = privateRepo
    ? sessionStorage.getItem(tokenKey) || sessionStorage.getItem(legacyTokenKey)
    : null;

  const [notes, setNotes] = useState<Note[]>([]);
  const [emptyFolders, setEmptyFolders] = useState<string[]>([]);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [rootSnapshot, setRootSnapshot] = useState<GitHubRootSnapshot | null>(null);
  const [workingBranch, setWorkingBranch] = useState("");
  const [baseCommitSha, setBaseCommitSha] = useState("");
  const [baseTreeSha, setBaseTreeSha] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [loadingCabinet, setLoadingCabinet] = useState(false);
  const [loadProgress, setLoadProgress] = useState<{ scope: string; completed: number; total: number } | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [missingRepository, setMissingRepository] = useState(false);
  const [creationLogin, setCreationLogin] = useState("");
  const [creatingRepository, setCreatingRepository] = useState(false);
  const [branchIssue, setBranchIssue] = useState<{ requested: string; fallback: string } | null>(null);

  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [splitViewNoteId, setSplitViewNoteId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<"raw" | "preview">("raw");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"files" | "document">("files");
  const [showSettings, setShowSettings] = useState(false);
  const [showCollabDialog, setShowCollabDialog] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatWidth, setChatWidth] = useState(384);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [workspaceActivities, setWorkspaceActivities] = useState<WorkspaceActivity[]>([]);
  const [hasUnread, setHasUnread] = useState(false);
  const showChatRef = useRef(false);
  const [sessionState, setSessionState] = useState<SessionState>("stopped");
  const [peerCount, setPeerCount] = useState(0);
  const [showChanges, setShowChanges] = useState(false);
  const [confirmDiscardAll, setConfirmDiscardAll] = useState(false);
  const [commitMessage, setCommitMessage] = useState("Update agent workspace via Marktwin");
  const [decisionMessage, setDecisionMessage] = useState<ChatMessage | null>(null);
  const [decisionText, setDecisionText] = useState("");
  const [decisionTargetId, setDecisionTargetId] = useState("");
  const baselineRef = useRef<ScopeContent[]>([]);

  const [creatingFile, setCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFilePath, setNewFilePath] = useState("/");
  const [creationPath, setCreationPath] = useState(".agents/");
  const importInputRef = useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);

  const [invite, setInvite] = useState<InvitePayload | null>(null);
  const [joinStatus, setJoinStatus] = useState("Preparing private session");
  const [joinError, setJoinError] = useState("");
  const [sharedName, setSharedName] = useState("Shared workspace");
  const [showShareProgress, setShowShareProgress] = useState(false);

  const generatedUsernameRef = useRef(`User${Math.random().toString(36).substring(2, 6)}`);
  const [myUsername, setMyUsername] = useState(generatedUsernameRef.current);
  const [myColor] = useState(() => `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")}`);
  const chatClientId = String(vaultAwareness.clientID);

  const appendChatMessage = useCallback((message: ChatMessage) => {
    setChatMessages((current) => {
      if (current.some((candidate) => candidate.id === message.id)) return current;
      return [...current, message].slice(-200);
    });
    if (message.sessionId !== chatClientId && !showChatRef.current) setHasUnread(true);
  }, [chatClientId]);

  const recordActivity = useCallback((operation: string, fileId?: string, path?: string) => {
    const activity: WorkspaceActivity = {
      id: crypto.randomUUID(),
      actor: {
        sessionId: chatClientId,
        displayName: myUsername,
        color: myColor,
        role: isJoinRoute ? invite?.role || "view" : "owner",
      },
      operation,
      fileId,
      path,
      timestamp: Date.now(),
    };
    const activities = vaultYdoc.getArray<WorkspaceActivity>("workspace-activity");
    activities.push([activity]);
    if (activities.length > 300) activities.delete(0, activities.length - 300);
  }, [chatClientId, invite?.role, isJoinRoute, myColor, myUsername, vaultYdoc]);

  const vault: Vault | undefined = privateRepo ? {
    id: privateRepo.id,
    name: privateRepo.displayName.split("/").pop() || privateRepo.displayName,
    urlSlug: String(privateRepo.id),
    githubRepo: privateRepo.repoFullName,
    lastSyncAt: null,
    createdAt: new Date(privateRepo.createdAt),
  } : undefined;

  const refreshCabinetView = useCallback(() => {
    setNotes(readCabinetNotes(vaultYdoc, privateRepo?.id || 0));
    setEmptyFolders(visibleFolderPaths(vaultYdoc));
    setDirty(hasUnsyncedChanges(vaultYdoc));
  }, [privateRepo?.id, vaultYdoc]);

  const awarenessNote = notes.find((note) => note.id === activeNoteId);

  useEffect(() => {
    const filesMap = getFilesMap(vaultYdoc);
    const foldersMap = getFoldersMap(vaultYdoc);
    filesMap.observeDeep(refreshCabinetView);
    foldersMap.observe(refreshCabinetView);
    refreshCabinetView();
    return () => {
      filesMap.unobserveDeep(refreshCabinetView);
      foldersMap.unobserve(refreshCabinetView);
    };
  }, [refreshCabinetView, vaultYdoc]);

  useEffect(() => {
    const activities = vaultYdoc.getArray<WorkspaceActivity>("workspace-activity");
    const refresh = () => setWorkspaceActivities(activities.toArray().slice(-200));
    activities.observe(refresh);
    refresh();
    return () => activities.unobserve(refresh);
  }, [vaultYdoc]);

  useEffect(() => {
    vaultAwareness.setLocalStateField("user", {
      name: myUsername,
      color: myColor,
      clientId: vaultAwareness.clientID,
      role: isJoinRoute ? invite?.role || "view" : "owner",
      viewingFileId: activeNoteId || undefined,
      viewingFilePath: awarenessNote ? fullNotePath(awarenessNote) : undefined,
    });
  }, [activeNoteId, awarenessNote, invite?.role, isJoinRoute, myColor, myUsername, vaultAwareness]);

  useEffect(() => {
    showChatRef.current = showChat;
    if (showChat) setHasUnread(false);
  }, [showChat]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  useEffect(() => {
    const validIds = new Set(notes.map((note) => note.id));
    setOpenTabs((current) => current.filter((id) => validIds.has(id)));
    if (activeTabId && !validIds.has(activeTabId)) {
      const next = notes[0]?.id || null;
      setActiveTabId(next);
      setActiveNoteId(next);
    }
    if (splitViewNoteId && !validIds.has(splitViewNoteId)) setSplitViewNoteId(null);
  }, [activeTabId, notes, splitViewNoteId]);

  const persistScopes = useCallback((scopes: string[]) => {
    setSelectedScopes(scopes);
    ownerSessionRef.current?.updateControl({
      selectedScopes: scopes,
      syncing: syncingRef.current,
      workspaceName: vault?.name || "Agent workspace",
    });
    if (privateRepo) {
      updateSavedRepo(privateRepo.id, { selectedRootScopes: scopes });
      void queryClient.invalidateQueries({ queryKey: ["saved-repos"] });
    }
  }, [privateRepo, vault?.name]);

  useEffect(() => {
    if (isJoinRoute || !privateRepo || !authenticated) return;
    const saved = getSavedRepos().find((repo) => repo.id === privateRepo.id);
    const persisted = saved?.selectedRootScopes || [];
    if (
      persisted.length !== selectedScopes.length ||
      persisted.some((scope, index) => scope !== selectedScopes[index])
    ) {
      updateSavedRepo(privateRepo.id, { selectedRootScopes: selectedScopes });
    }
  }, [authenticated, isJoinRoute, privateRepo, selectedScopes]);

  const loadOwnerCabinet = useCallback(async (branchOverride?: string) => {
    if (!githubToken || !privateRepo) return;
    loadAbortRef.current?.abort();
    const abortController = new AbortController();
    loadAbortRef.current = abortController;
    setLoadingCabinet(true);
    setLoadError("");
    setMissingRepository(false);
    setBranchIssue(null);
    let repositoryValidated = false;
    try {
      const repository = await getRepository(githubToken, privateRepo.repoFullName);
      repositoryValidated = true;
      const branch = branchOverride || privateRepo.defaultBranch || repository.defaultBranch;
      try {
        await getBranch(githubToken, repository.fullName, branch);
      } catch (error) {
        if (error instanceof GitHubApiError && error.status === 404) {
          if (branch !== repository.defaultBranch) {
            setBranchIssue({ requested: branch, fallback: repository.defaultBranch });
          } else {
            setLoadError(`Branch '${branch}' was not found in '${repository.fullName}'.`);
          }
          return;
        }
        throw error;
      }

      const root = await getRootSnapshot(githubToken, repository.fullName, branch);
      const available = new Set(root.scopes.map((scope) => scope.key));
      const stored = privateRepo.selectedRootScopes;
      const scopes = (stored === undefined ? defaultRootScopes(root.scopes) : stored)
        .filter((scope) => available.has(scope));
      const content: ScopeContent[] = [];
      for (const scopeKey of scopes) {
        const scope = root.scopes.find((candidate) => candidate.key === scopeKey)!;
        const loaded = await loadScopeSnapshot({
          token: githubToken,
          repoFullName: repository.fullName,
          branch,
          scope,
          rootMarkdown: root.rootMarkdown,
          signal: abortController.signal,
          onProgress: (completed, total) => setLoadProgress({ scope: scope.label, completed, total }),
        });
        content.push({ scope: scopeKey, ...loaded });
      }

      hydrateSelectedScopes(vaultYdoc, content);
      baselineRef.current = content;
      setRootSnapshot(root);
      setBaseCommitSha(root.commitSha);
      setBaseTreeSha(root.treeSha);
      setWorkingBranch(branch);
      setAuthenticated(true);
      setSharedName(vault?.name || repository.name);
      persistScopes(scopes);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof GitHubApiError && error.status === 404 && !repositoryValidated) {
        setMissingRepository(true);
        try {
          const user = await getAuthenticatedUser(githubToken);
          setCreationLogin(user.login);
        } catch {
          setCreationLogin("");
        }
      } else {
        setLoadError(repositoryErrorMessage(error));
      }
    } finally {
      if (loadAbortRef.current === abortController) loadAbortRef.current = null;
      setLoadProgress(null);
      setLoadingCabinet(false);
    }
  }, [githubToken, persistScopes, privateRepo, vault?.name, vaultYdoc]);

  const loadedRepoRef = useRef("");
  useEffect(() => {
    if (isJoinRoute || reposLoading || !privateRepo || !githubToken) return;
    const key = `${privateRepo.id}:${githubToken}`;
    if (loadedRepoRef.current === key) return;
    loadedRepoRef.current = key;
    void loadOwnerCabinet();
  }, [githubToken, isJoinRoute, loadOwnerCabinet, privateRepo, reposLoading]);

  useEffect(() => {
    if (!isJoinRoute) return;
    try {
      const token = window.location.hash.replace(/^#/, "") || new URLSearchParams(window.location.search).get("token");
      if (!token) throw new Error("No token");
      const parsed = decodeInvite(token) as InvitePayload;
      if (parsed.v !== 1) throw new Error("Unsupported invite version");
      setInvite(parsed);
      void joinCollaboration(vaultYdoc, vaultAwareness, parsed, (status) => {
        setJoinStatus(status);
        setSessionState(status.includes("reconnecting") ? "reconnecting" : status.startsWith("Connected") ? "connected" : status === "Session stopped" ? "stopped" : "waiting");
      }, {
        onChat: appendChatMessage,
        onControl: (control) => {
          setSelectedScopes(control.selectedScopes);
          syncingRef.current = control.syncing;
          setSyncing(control.syncing);
          setSharedName(control.workspaceName);
        },
      }).then((session) => {
        joinSessionRef.current = session;
      });
    } catch {
      setJoinError("Invalid private invite link.");
    }
    return () => joinSessionRef.current?.stop();
  }, [appendChatMessage, isJoinRoute, vaultAwareness, vaultYdoc]);

  useEffect(() => () => {
    loadAbortRef.current?.abort();
    joinSessionRef.current?.stop();
    ownerSessionRef.current?.stop();
  }, []);

  useEffect(() => {
    if (activeNoteId || notes.length === 0) return;
    const preferred = notes.find((note) => fullNotePath(note).toLowerCase() === ".agents/readme.md")
      || notes.find((note) => fullNotePath(note).toLowerCase() === ".agents/agents.md")
      || notes[0];
    setActiveNoteId(preferred.id);
    setActiveTabId(preferred.id);
    setOpenTabs((current) => current.includes(preferred.id) ? current : [...current, preferred.id]);
  }, [activeNoteId, notes]);

  const availableScopes = useMemo(() => {
    const scopes = new Map<string, GitHubRootScope>();
    for (const scope of rootSnapshot?.scopes || []) scopes.set(scope.key, scope);
    for (const path of emptyFolders) {
      const top = path.split("/")[0];
      if (top && !scopes.has(top)) scopes.set(top, { key: top, label: top, kind: "folder", sha: "" });
    }
    for (const note of notes) {
      const top = scopeForPath(fullNotePath(note));
      if (top !== "/" && !scopes.has(top)) scopes.set(top, { key: top, label: top, kind: "folder", sha: "" });
    }
    return Array.from(scopes.values()).sort((left, right) => {
      if (left.key === ".agents") return -1;
      if (right.key === ".agents") return 1;
      if (left.key === "/") return -1;
      if (right.key === "/") return 1;
      return left.label.localeCompare(right.label);
    });
  }, [emptyFolders, notes, rootSnapshot]);

  const toggleScope = async (scope: GitHubRootScope, checked: boolean) => {
    if (!privateRepo || !githubToken || !rootSnapshot || syncing) return;
    try {
      if (checked) {
        if (scope.sha) {
          const loaded = await loadScopeSnapshot({
            token: githubToken,
            repoFullName: privateRepo.repoFullName,
            branch: workingBranch,
            scope,
            rootMarkdown: rootSnapshot.rootMarkdown,
          });
          const scopeContent = { scope: scope.key, ...loaded };
          mergeScopeContent(vaultYdoc, scopeContent);
          baselineRef.current = [...baselineRef.current.filter((content) => content.scope !== scope.key), scopeContent];
        }
        persistScopes(Array.from(new Set([...selectedScopes, scope.key])));
      } else {
        removeCleanScope(vaultYdoc, scope.key);
        baselineRef.current = baselineRef.current.filter((content) => content.scope !== scope.key);
        persistScopes(selectedScopes.filter((key) => key !== scope.key));
      }
    } catch (error) {
      toast({ title: "Folder selection unchanged", description: repositoryErrorMessage(error), variant: "destructive" });
    }
  };

  const createMissingRepository = async () => {
    if (!githubToken || !privateRepo) return;
    setCreatingRepository(true);
    try {
      const { repo } = parseRepo(privateRepo.repoFullName);
      const created = await createPrivateRepository(githubToken, repo);
      updateSavedRepo(privateRepo.id, {
        displayName: created.fullName,
        repoFullName: created.fullName,
        defaultBranch: created.defaultBranch,
        selectedRootScopes: [".agents"],
      });
      sessionStorage.setItem(`gh-token-${privateRepo.id}`, githubToken);
      await queryClient.invalidateQueries({ queryKey: ["saved-repos"] });
      setMissingRepository(false);
      loadedRepoRef.current = "";
      window.location.reload();
    } catch (error) {
      setLoadError(repositoryErrorMessage(error));
    } finally {
      setCreatingRepository(false);
    }
  };

  const useDefaultBranch = async () => {
    if (!privateRepo || !branchIssue) return;
    updateSavedRepo(privateRepo.id, { defaultBranch: branchIssue.fallback });
    await queryClient.invalidateQueries({ queryKey: ["saved-repos"] });
    setBranchIssue(null);
    loadedRepoRef.current = "";
    await loadOwnerCabinet(branchIssue.fallback);
  };

  const workspaceChanges = useMemo<WorkspaceChange[]>(() => (
    describeWorkspaceChanges(vaultYdoc, baselineRef.current)
  ), [dirty, emptyFolders, notes, vaultYdoc]);

  const requestSync = () => {
    try {
      assertWorkspaceWithinScopes(vaultYdoc, selectedScopes);
      if (workspaceChanges.length === 0) {
        toast({ title: "Nothing to sync", description: "The selected workspace matches GitHub." });
        return;
      }
      setShowChanges(true);
    } catch (error) {
      toast({ title: "Review required", description: repositoryErrorMessage(error), variant: "destructive" });
    }
  };

  const handleSync = async () => {
    if (!githubToken || !privateRepo || !baseCommitSha || !baseTreeSha) return;
    let changes;
    try {
      assertWorkspaceWithinScopes(vaultYdoc, selectedScopes);
      changes = collectAtomicChanges(vaultYdoc);
      if (changes.length === 0) return;
      setShowChanges(false);
      syncingRef.current = true;
      setSyncing(true);
      setSessionState("syncing");
      ownerSessionRef.current?.updateControl({ selectedScopes, syncing: true, workspaceName: vault?.name || "Agent workspace" });
      const result = await commitAtomicChanges({
        token: githubToken,
        repoFullName: privateRepo.repoFullName,
        branch: workingBranch,
        baseCommitSha,
        baseTreeSha,
        changes,
        message: commitMessage.trim() || "Update agent workspace via Marktwin",
      });
      if (result.branchCreated) {
        updateSavedRepo(privateRepo.id, { defaultBranch: result.branch });
        setWorkingBranch(result.branch);
      }

      const root = await getRootSnapshot(githubToken, privateRepo.repoFullName, result.branch);
      const available = new Set(root.scopes.map((scope) => scope.key));
      const scopes = selectedScopes.filter((scope) => available.has(scope));
      const content: ScopeContent[] = [];
      for (const scopeKey of scopes) {
        const scope = root.scopes.find((candidate) => candidate.key === scopeKey)!;
        const loaded = await loadScopeSnapshot({
          token: githubToken,
          repoFullName: privateRepo.repoFullName,
          branch: result.branch,
          scope,
          rootMarkdown: root.rootMarkdown,
          onProgress: (completed, total) => setLoadProgress({ scope: scope.label, completed, total }),
        });
        content.push({ scope: scopeKey, ...loaded });
      }
      hydrateSelectedScopes(vaultYdoc, content);
      baselineRef.current = content;
      setRootSnapshot(root);
      setBaseCommitSha(root.commitSha);
      setBaseTreeSha(root.treeSha);
      persistScopes(scopes);
      setShowChanges(false);
      await queryClient.invalidateQueries({ queryKey: ["saved-repos"] });
      setSessionState(result.branchCreated ? "conflict" : ownerSessionRef.current ? "connected" : "stopped");
      toast(result.branchCreated ? {
        title: "Conflict detected",
        description: `GitHub advanced while you were working. Your changes are safe on '${result.branch}', which is now this cabinet's working branch.`,
        duration: 7000,
      } : {
        title: "Synced to GitHub",
        description: `${changes.length} staged change${changes.length === 1 ? "" : "s"} published in one commit.`,
      });
    } catch (error) {
      toast({ title: "Sync failed", description: repositoryErrorMessage(error), variant: "destructive" });
    } finally {
      setLoadProgress(null);
      syncingRef.current = false;
      setSyncing(false);
      ownerSessionRef.current?.updateControl({ selectedScopes, syncing: false, workspaceName: vault?.name || "Agent workspace" });
      setSessionState((current) => current === "conflict" ? current : ownerSessionRef.current ? "connected" : "stopped");
    }
  };

  const structuralReadOnly = syncing || (isJoinRoute && !canEditSession(invite?.role || "view"));
  const defaultCreationPath = useMemo(() => {
    if (selectedScopes.includes(".agents")) return ".agents/";
    const folder = selectedScopes.find((scope) => scope !== "/");
    return folder ? `${folder}/` : "/";
  }, [selectedScopes]);

  const creationFolders = useMemo(() => {
    const paths = new Set<string>();
    for (const scope of selectedScopes) {
      paths.add(scope === "/" ? "/" : normalizeDirectoryPath(scope));
    }
    for (const folder of emptyFolders) paths.add(normalizeDirectoryPath(folder));
    for (const note of notes) paths.add(normalizeDirectoryPath(note.path));
    return Array.from(paths).sort((left, right) => {
      if (left === defaultCreationPath) return -1;
      if (right === defaultCreationPath) return 1;
      return left.localeCompare(right);
    });
  }, [defaultCreationPath, emptyFolders, notes, selectedScopes]);

  const effectiveCreationPath = creationFolders.includes(creationPath)
    ? creationPath
    : defaultCreationPath;

  useEffect(() => {
    if (creationFolders.length > 0 && !creationFolders.includes(creationPath)) {
      setCreationPath(defaultCreationPath);
    }
  }, [creationFolders, creationPath, defaultCreationPath]);

  const selectNote = (id: string) => {
    if (!openTabs.includes(id)) setOpenTabs((current) => [...current, id]);
    setActiveNoteId(id);
    setActiveTabId(id);
    setMobilePanel("document");
  };

  const closeTab = (id: string) => {
    const index = openTabs.indexOf(id);
    const remaining = openTabs.filter((tabId) => tabId !== id);
    setOpenTabs(remaining);
    if (activeTabId === id) {
      const next = remaining[index] || remaining[index - 1] || null;
      setActiveTabId(next);
      setActiveNoteId(next);
    }
    if (splitViewNoteId === id) setSplitViewNoteId(null);
  };

  const handleCreateNote = (path = effectiveCreationPath, filename?: string, content = "") => {
    if (!filename) {
      setCreatingFile(true);
      setNewFilePath(normalizeDirectoryPath(path));
      setNewFileName("");
      return;
    }
    try {
      const destination = normalizeDirectoryPath(path);
      const candidate = destination === "/" ? filename : `${destination}${filename}`;
      if (!selectedScopes.some((scope) => pathBelongsToScope(candidate, scope))) {
        throw new Error("Choose a destination inside the shared workspace scopes.");
      }
      const id = addMarkdownNote(vaultYdoc, { filename, path, content });
      recordActivity("created Markdown", id, `${normalizeDirectoryPath(path) === "/" ? "" : normalizeDirectoryPath(path)}${filename}`);
      setCreatingFile(false);
      setNewFileName("");
      selectNote(id);
    } catch (error) {
      toast({ title: "Could not create Markdown", description: repositoryErrorMessage(error), variant: "destructive" });
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    for (const file of files) {
      try {
        if (!file.name.toLowerCase().endsWith(".md")) throw new Error("Marktwin imports Markdown (.md) files only.");
        handleCreateNote(effectiveCreationPath, file.name, await file.text());
      } catch (error) {
        toast({ title: `Could not import ${file.name}`, description: repositoryErrorMessage(error), variant: "destructive" });
      }
    }
    event.target.value = "";
  };

  const handleCreateFolder = (parentPath: string, name: string) => {
    try {
      const path = joinFolderPath(parentPath, name);
      if (!selectedScopes.some((scope) => pathBelongsToScope(`${path}/.gitkeep`, scope))) {
        throw new Error("Create folders inside a selected workspace folder.");
      }
      createFolder(vaultYdoc, path);
      recordActivity("created folder marker", undefined, path);
    } catch (error) {
      toast({ title: "Could not create folder", description: repositoryErrorMessage(error), variant: "destructive" });
    }
  };

  const handleMoveFolder = (sourcePath: string, destinationPath: string) => {
    try {
      const name = sourcePath.split("/").pop() || sourcePath;
      const targetPath = joinFolderPath(destinationPath, name);
      if (!selectedScopes.some((scope) => pathBelongsToScope(`${targetPath}/.gitkeep`, scope))) {
        throw new Error("Move folders only within the selected workspace scopes.");
      }
      moveFolder(vaultYdoc, sourcePath, targetPath);
      recordActivity("moved folder", undefined, `${sourcePath} → ${targetPath}`);
    } catch (error) {
      toast({ title: "Could not move folder", description: repositoryErrorMessage(error), variant: "destructive" });
    }
  };

  const requestMoveFolder = (sourcePath: string, destinationPath: string) => {
    try {
      const name = sourcePath.split("/").pop() || sourcePath;
      const targetPath = joinFolderPath(destinationPath, name);
      setPendingMove({
        sourcePath,
        targetPath,
        count: folderMarkdownCount(vaultYdoc, sourcePath),
      });
    } catch (error) {
      toast({ title: "Could not move folder", description: repositoryErrorMessage(error), variant: "destructive" });
    }
  };

  const startSharing = async (rotate = false) => {
    if (ownerSessionRef.current && !rotate) {
      setShowCollabDialog(true);
      return;
    }
    try {
      setShowShareProgress(true);
      ownerSessionRef.current?.stop();
      ownerSessionRef.current = null;
      setCollabSession(null);
      setPeerCount(0);
      const session = await startOwnerCollaboration(vaultYdoc, vaultAwareness, () => {
        setPeerCount(ownerSessionRef.current?.peerCount() || 0);
      }, {
        control: {
          selectedScopes,
          syncing: syncingRef.current,
          workspaceName: vault?.name || "Agent workspace",
        },
        onChat: appendChatMessage,
        onStatus: setSessionState,
        initialChatMessages: chatMessages,
      });
      ownerSessionRef.current = session;
      setCollabSession(session);
      setShowCollabDialog(true);
    } catch (error) {
      setSessionState("offline");
      toast({ title: "Failed to start sharing", description: repositoryErrorMessage(error), variant: "destructive" });
    } finally {
      setShowShareProgress(false);
    }
  };

  const stopSharing = () => {
    ownerSessionRef.current?.stop();
    ownerSessionRef.current = null;
    setCollabSession(null);
    setPeerCount(0);
    setShowCollabDialog(false);
    setSessionState("stopped");
  };

  const sendChatMessage = (message: ChatMessage) => {
    if (isJoinRoute) {
      appendChatMessage(message);
      joinSessionRef.current?.sendChat(message);
      return;
    }
    if (ownerSessionRef.current) ownerSessionRef.current.sendChat(message);
    else appendChatMessage(message);
  };

  const openDecisionCapture = (message: ChatMessage) => {
    setDecisionMessage(message);
    setDecisionText(message.message);
    setDecisionTargetId(activeNoteId || notes[0]?.id || "");
  };

  const captureDecision = () => {
    const note = notes.find((candidate) => candidate.id === decisionTargetId);
    const fileMap = note ? getFilesMap(vaultYdoc).get(note.id) : undefined;
    const content = fileMap?.get("content");
    if (!note || !(content instanceof Y.Text) || !decisionMessage || !decisionText.trim()) return;
    const decision: CapturedDecision = {
      id: crypto.randomUUID(),
      sourceMessageId: decisionMessage.id,
      summary: decisionText.trim(),
      targetFileId: note.id,
      targetPath: fullNotePath(note),
      capturedBy: {
        sessionId: chatClientId,
        displayName: myUsername,
        color: myColor,
        role: isJoinRoute ? invite?.role || "view" : "owner",
      },
      timestamp: Date.now(),
    };
    const separator = content.length > 0 && !content.toString().endsWith("\n") ? "\n" : "";
    content.insert(content.length, `${separator}\n## Decision — ${new Date(decision.timestamp).toISOString().slice(0, 10)}\n\n${decision.summary}\n\n_Captured from discussion by ${decision.capturedBy.displayName}._\n`);
    markNoteModified(vaultYdoc, note.id);
    recordActivity("captured a decision", note.id, decision.targetPath);
    setDecisionMessage(null);
    selectNote(note.id);
    toast({ title: "Decision staged", description: `Added to ${decision.targetPath}. Review it in Changes before Sync.` });
  };

  const discardOneChange = (change: WorkspaceChange) => {
    try {
      discardWorkspaceChange(vaultYdoc, change, baselineRef.current);
    } catch (error) {
      toast({ title: "Could not discard change", description: repositoryErrorMessage(error), variant: "destructive" });
    }
  };

  const activeNote = notes.find((note) => note.id === activeNoteId);
  const cabinetName = isJoinRoute ? sharedName : vault?.name || "Workspace";

  if (joinError) {
    return (
      <div className="min-h-screen bg-[hsl(var(--obsidian-bg))] flex items-center justify-center p-4">
        <Card className="max-w-md bg-[hsl(var(--obsidian-panel))] border-[hsl(var(--obsidian-border))]">
          <CardHeader><CardTitle className="text-red-300">Cannot join session</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{joinError}</CardContent>
        </Card>
      </div>
    );
  }

  if (!isJoinRoute && !reposLoading && (!privateRepo || !githubToken)) {
    return (
      <div className="min-h-screen bg-[hsl(var(--obsidian-bg))] flex items-center justify-center p-4">
        <Card className="max-w-md bg-[hsl(var(--obsidian-panel))] border-[hsl(var(--obsidian-border))]">
          <CardHeader><CardTitle>Cabinet access required</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>Open this cabinet from My Cabinets and provide a GitHub token for this browser session.</p>
            <Button onClick={() => setLocation("/")}>Back to My Cabinets</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative h-screen bg-[hsl(var(--obsidian-bg))] text-[hsl(var(--obsidian-text))] flex overflow-hidden pb-14 sm:pb-0">
      {!sidebarCollapsed && (
        <aside className={`${mobilePanel === "files" ? "flex" : "hidden"} absolute inset-0 z-20 w-full flex-shrink-0 flex-col bg-[hsl(var(--obsidian-sidebar))] border-r border-[hsl(var(--obsidian-border))] sm:relative sm:z-auto sm:flex sm:w-72`}>
          <div className="p-4 border-b border-[hsl(var(--obsidian-border))]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center min-w-0">
                {!isJoinRoute && (
                  <Button size="sm" variant="ghost" className="h-9 w-9 p-1 mr-1" onClick={() => setLocation("/")} aria-label="Back to workspaces">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                )}
                <h1 className="font-semibold truncate">{cabinetName}</h1>
                {dirty && <span className="ml-2 h-2 w-2 rounded-full bg-amber-400" title="Unsynced changes" />}
              </div>
              <div className="flex items-center">
                {!isJoinRoute && (
                  <Button size="sm" variant="ghost" className="h-9 w-9 p-1" onClick={requestSync} disabled={syncing || loadingCabinet} title="Review staged changes" aria-label="Review changes">
                    {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
                  </Button>
                )}
                {!isJoinRoute && (
                  <Button size="sm" variant="ghost" className="h-9 w-9 p-1" onClick={() => void startSharing()} disabled={!authenticated || showShareProgress} title={collabSession ? "Session details" : "Start sharing session"} aria-label={collabSession ? "Open sharing session details" : "Start sharing session"}>
                    <Share2 className="h-4 w-4" />
                  </Button>
                )}
                {!isJoinRoute && (
                  <Button size="sm" variant="ghost" className="h-9 w-9 p-1" onClick={() => setShowSettings(true)} aria-label="Workspace settings">
                    <Settings className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            {workingBranch && <p className="text-xs text-muted-foreground mt-2 truncate">{privateRepo?.repoFullName} · {workingBranch}</p>}
            {isJoinRoute && <p className="text-xs text-muted-foreground mt-2">{joinStatus}</p>}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              {!isJoinRoute ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-sm text-[hsl(var(--primary))]" disabled={loadingCabinet || syncing}>
                      Folders ({selectedScopes.length}) <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-56 bg-[hsl(var(--obsidian-panel))] border-[hsl(var(--obsidian-border))] text-[hsl(var(--obsidian-text))] shadow-xl">
                    <DropdownMenuLabel>Principal folders</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {availableScopes.map((scope) => (
                      <DropdownMenuCheckboxItem
                        key={scope.key}
                        checked={selectedScopes.includes(scope.key)}
                        onCheckedChange={(checked) => void toggleScope(scope, checked === true)}
                        onSelect={(event) => event.preventDefault()}
                      >
                        {scope.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <span className="text-sm font-medium text-[hsl(var(--primary))]">Shared files</span>
              )}
              {!structuralReadOnly && selectedScopes.length > 0 && (
                <div className="hidden items-center gap-1 sm:flex">
                  <input ref={importInputRef} type="file" accept=".md,text/markdown" multiple className="hidden" onChange={(event) => void handleImport(event)} />
                  <label htmlFor="creation-folder" className="sr-only">Destination folder</label>
                  <select
                    id="creation-folder"
                    aria-label="Destination folder"
                    value={effectiveCreationPath}
                    onChange={(event) => setCreationPath(event.target.value)}
                    className="h-7 max-w-28 rounded border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg))] px-1 text-xs text-[hsl(var(--obsidian-text-muted))]"
                    title="Destination for new and imported Markdown"
                  >
                    {creationFolders.map((path) => (
                      <option key={path} value={path}>{path === "/" ? "Main path" : path.replace(/\/$/, "")}</option>
                    ))}
                  </select>
                  <Button size="sm" variant="ghost" className="h-9 w-9 p-1" onClick={() => importInputRef.current?.click()} title={`Import Markdown into ${effectiveCreationPath}`} aria-label={`Import Markdown into ${effectiveCreationPath}`}>
                    <Upload className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-9 w-9 p-1" onClick={() => handleCreateNote(effectiveCreationPath)} title={`New Markdown in ${effectiveCreationPath}`} aria-label={`Create Markdown in ${effectiveCreationPath}`}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {loadingCabinet ? (
              <div className="py-10 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground"><span className="flex items-center"><Loader2 className="h-4 w-4 animate-spin mr-2" />Loading {loadProgress?.scope || "selected folders"}</span>{loadProgress && loadProgress.total > 0 && <span className="text-xs">{loadProgress.completed} of {loadProgress.total} Markdown files</span>}<Button size="sm" variant="ghost" onClick={() => loadAbortRef.current?.abort()}>Cancel</Button></div>
            ) : selectedScopes.length === 0 && !isJoinRoute ? (
              <div className="rounded-md border border-dashed border-[hsl(var(--obsidian-border))] p-4 text-sm text-muted-foreground">
                <FileText className="h-6 w-6 mb-2 opacity-60" />
                No <code>.agents</code> folder was selected. Open Folders to choose Main path or another principal folder.
              </div>
            ) : (
              <FileExplorer
                notes={notes}
                emptyFolders={emptyFolders}
                activeNoteId={activeNoteId}
                activeNote={activeNote}
                onNoteSelect={selectNote}
                onCreateNote={(path = defaultCreationPath, filename) => handleCreateNote(path, filename)}
                onMoveNote={(id, path) => {
                  try {
                    const moving = notes.find((candidate) => candidate.id === id);
                    const destination = moving ? `${normalizeDirectoryPath(path) === "/" ? "" : normalizeDirectoryPath(path)}${moving.filename}` : "";
                    if (!moving || !selectedScopes.some((scope) => pathBelongsToScope(destination, scope))) throw new Error("Move Markdown only within selected workspace scopes.");
                    moveNote(vaultYdoc, id, path);
                    recordActivity("moved Markdown", id, destination);
                  }
                  catch (error) { toast({ title: "Could not move Markdown", description: repositoryErrorMessage(error), variant: "destructive" }); }
                }}
                creatingFile={creatingFile}
                newFileName={newFileName}
                newFilePath={newFilePath}
                setNewFileName={setNewFileName}
                handleNewFileCancel={() => { setCreatingFile(false); setNewFileName(""); }}
                onCreateFolder={handleCreateFolder}
                onMoveFolder={requestMoveFolder}
                onDeleteFolder={(path) => setPendingDelete({ kind: "folder", path, label: path, count: folderMarkdownCount(vaultYdoc, path) })}
                onRenameNote={(id, name) => {
                  try { renameNote(vaultYdoc, id, name); recordActivity("renamed Markdown", id, name); }
                  catch (error) { toast({ title: "Could not rename Markdown", description: repositoryErrorMessage(error), variant: "destructive" }); }
                }}
                onDeleteNote={(id) => {
                  const note = notes.find((candidate) => candidate.id === id);
                  if (note) setPendingDelete({ kind: "file", id, label: fullNotePath(note), count: 1 });
                }}
                onDuplicateNote={(note) => {
                  const base = note.filename.replace(/\.md$/i, "");
                  const existing = new Set(
                    notes
                      .filter((candidate) => candidate.path === note.path)
                      .map((candidate) => candidate.filename.toLowerCase()),
                  );
                  let suffix = "-copy";
                  let counter = 2;
                  while (existing.has(`${base}${suffix}.md`.toLowerCase())) {
                    suffix = `-copy-${counter}`;
                    counter += 1;
                  }
                  handleCreateNote(note.path, `${base}${suffix}.md`, note.content);
                }}
                isMovingFolder={false}
                isCreatingFolder={false}
                readOnly={structuralReadOnly}
              />
            )}
          </div>
        </aside>
      )}

      <main className={`${mobilePanel === "document" ? "flex" : "hidden"} flex-1 flex-col min-w-0 sm:flex`}>
        <div className="h-12 bg-[hsl(var(--obsidian-sidebar))] border-b border-[hsl(var(--obsidian-border))] flex items-center">
          {sidebarCollapsed && <Button variant="ghost" size="sm" className="mx-1 hidden sm:inline-flex" onClick={() => setSidebarCollapsed(false)}>Files</Button>}
          {!sidebarCollapsed && <Button variant="ghost" size="sm" className="mx-1 hidden text-xs sm:inline-flex" onClick={() => setSidebarCollapsed(true)}>Hide</Button>}
          <div className="flex-1 flex items-center overflow-x-auto">
            {openTabs.map((id) => {
              const note = notes.find((candidate) => candidate.id === id);
              if (!note) return null;
              return (
                <div key={id} className={`flex items-center px-3 py-2 mr-1 cursor-pointer ${activeTabId === id ? "bg-[hsl(var(--obsidian-panel))] border-b-2 border-accent" : ""}`} onClick={() => { setActiveTabId(id); setActiveNoteId(id); }}>
                  <FileText className="h-3 w-3 mr-2" /><span className="text-sm mr-2">{note.filename}</span>
                  <button onClick={(event) => { event.stopPropagation(); closeTab(id); }} aria-label={`Close ${note.filename}`}>×</button>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2 px-3 border-l border-[hsl(var(--obsidian-border))]">
            <CollaborationIndicator awareness={vaultAwareness} myName={myUsername} onNameChange={setMyUsername} />
            <Button variant="ghost" size="sm" className={hasUnread ? "bg-[hsl(var(--obsidian-accent))] text-white" : ""} onClick={() => setShowChat((open) => !open)} aria-label="Toggle discussion">
              <MessageSquare className="h-4 w-4 mr-1" />Discussion
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          {activeTabId ? (() => {
            const note = notes.find((candidate) => candidate.id === activeTabId);
            const splitNote = splitViewNoteId ? notes.find((candidate) => candidate.id === splitViewNoteId) : undefined;
            if (!note) return null;
            const renderEditor = (editorNote: Note, split = false) => (
              <SimpleCollaborativeEditor
                note={editorNote}
                mode={editorMode}
                readOnly={structuralReadOnly}
                isSplitPane={split}
                ytext={getFilesMap(vaultYdoc).get(editorNote.id)?.get("content") as Y.Text | undefined}
                awareness={vaultAwareness}
                onContentChange={() => { if (!structuralReadOnly) markNoteModified(vaultYdoc, editorNote.id); }}
                onModeChange={setEditorMode}
                onSplitView={() => setSplitViewNoteId((current) => current === editorNote.id ? null : editorNote.id)}
              />
            );
            return (
              <div className="h-full flex">
                <div className={splitNote ? "w-1/2 border-r border-[hsl(var(--obsidian-border))]" : "w-full"}>{renderEditor(note)}</div>
                {splitNote && <div className="w-1/2">{renderEditor(splitNote, true)}</div>}
              </div>
            );
          })() : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-center">
              <div><FileText className="h-12 w-12 mx-auto mb-3 opacity-40" /><p>Select a Markdown file to begin.</p></div>
            </div>
          )}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid h-14 grid-cols-4 border-t border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-sidebar))] sm:hidden" aria-label="Workspace panels">
        <button type="button" className={`flex flex-col items-center justify-center text-xs ${mobilePanel === "files" && !showChat ? "text-[hsl(var(--obsidian-accent))]" : "text-muted-foreground"}`} onClick={() => { setSidebarCollapsed(false); setMobilePanel("files"); setShowChat(false); }}><FolderOpen className="h-4 w-4" />Files</button>
        <button type="button" className={`flex flex-col items-center justify-center text-xs ${mobilePanel === "document" && !showChat ? "text-[hsl(var(--obsidian-accent))]" : "text-muted-foreground"}`} onClick={() => { setMobilePanel("document"); setShowChat(false); }}><FileText className="h-4 w-4" />Document</button>
        <button type="button" className={`flex flex-col items-center justify-center text-xs ${showChat ? "text-[hsl(var(--obsidian-accent))]" : "text-muted-foreground"}`} onClick={() => setShowChat(true)}><MessageSquare className="h-4 w-4" />Discussion</button>
        <button type="button" className="flex flex-col items-center justify-center text-xs text-muted-foreground" onClick={requestSync}><ListChecks className="h-4 w-4" />Changes{workspaceChanges.length > 0 && <span className="sr-only"> ({workspaceChanges.length})</span>}</button>
      </nav>

      <ChatPanel
        open={showChat}
        onOpenChange={setShowChat}
        width={chatWidth}
        onWidthChange={setChatWidth}
        messages={chatMessages}
        onSend={sendChatMessage}
        username={myUsername}
        userColor={myColor}
        clientId={chatClientId}
        anchor={activeNote ? { fileId: activeNote.id, filePath: fullNotePath(activeNote) } : undefined}
        onCaptureDecision={structuralReadOnly ? undefined : openDecisionCapture}
      />

      {vault && <CabinetSettingsDialog open={showSettings} onOpenChange={setShowSettings} vault={vault} />}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        title={pendingDelete?.kind === "folder" ? "Delete Markdown folder contents?" : "Delete Markdown file?"}
        description={pendingDelete?.kind === "folder"
          ? `This stages deletion of ${pendingDelete.count} visible Markdown file${pendingDelete.count === 1 ? "" : "s"} under '${pendingDelete.label}'. Unmanaged repository files are untouched.`
          : `This stages deletion of '${pendingDelete?.label}'. GitHub is not changed until the owner syncs.`}
        confirmText="Stage deletion"
        onConfirm={() => {
          if (!pendingDelete) return;
          if (pendingDelete.kind === "file") { deleteNote(vaultYdoc, pendingDelete.id); recordActivity("deleted Markdown", pendingDelete.id, pendingDelete.label); }
          else { deleteFolder(vaultYdoc, pendingDelete.path); recordActivity("deleted folder contents", undefined, pendingDelete.path); }
          setPendingDelete(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingMove)}
        onOpenChange={(open) => { if (!open) setPendingMove(null); }}
        title="Move Markdown folder contents?"
        description={`This stages moving ${pendingMove?.count || 0} visible Markdown file${pendingMove?.count === 1 ? "" : "s"} from '${pendingMove?.sourcePath || ""}' to '${pendingMove?.targetPath || ""}'. Unmanaged repository files are untouched.`}
        confirmText="Stage move"
        onConfirm={() => {
          if (!pendingMove) return;
          handleMoveFolder(pendingMove.sourcePath, pendingMove.targetPath.split("/").slice(0, -1).join("/") || "/");
          setPendingMove(null);
        }}
      />

      <Dialog open={showCollabDialog} onOpenChange={setShowCollabDialog}>
        <DialogContent className="sm:max-w-md bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))]">
          <DialogHeader>
            <DialogTitle>Private collaboration session</DialogTitle>
            <DialogDescription>Encrypted peer-to-peer links share the live workspace in memory. Closing or stopping the owner session can end access; only the owner can publish to GitHub.</DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-panel))] p-3 text-sm">
            <div className="flex items-center justify-between"><span className="font-medium capitalize">{sessionState}</span><span>{peerCount} connected {peerCount === 1 ? "person" : "people"}</span></div>
            <p className="mt-2 text-xs text-muted-foreground">Shared scopes: {selectedScopes.map((scope) => scope === "/" ? "Main path" : scope).join(", ") || "None"}</p>
          </div>
          {[{ label: "Edit link", value: collabSession?.editLink || "" }, { label: "View-only link", value: collabSession?.viewLink || "" }].map((link) => (
            <div key={link.label} className="space-y-2">
              <Label htmlFor={`share-${link.label.replace(/\W/g, "-")}`}>{link.label}</Label>
              <div className="flex gap-2"><Input id={`share-${link.label.replace(/\W/g, "-")}`} readOnly value={link.value} /><Button size="icon" variant="outline" aria-label={`Copy ${link.label.toLowerCase()}`} onClick={() => { void navigator.clipboard.writeText(link.value); toast({ title: `${link.label} copied` }); }}><Copy className="h-4 w-4" /></Button></div>
            </div>
          ))}
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="destructive" onClick={stopSharing}>Stop session</Button>
            <Button variant="outline" onClick={() => void startSharing(true)}><RotateCw className="mr-2 h-4 w-4" />Rotate links</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showChanges} onOpenChange={(open) => { if (!syncing) setShowChanges(open); }}>
        <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-2xl bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))] flex flex-col">
          <DialogHeader>
            <DialogTitle>Review changes before publishing</DialogTitle>
            <DialogDescription>{workspaceChanges.length} staged operation{workspaceChanges.length === 1 ? "" : "s"}. Collaborators can keep editing until you start Sync; Sync briefly locks the shared workspace.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {workspaceChanges.map((change) => (
              <div key={change.id} className="rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-panel))] p-3">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${change.kind === "deleted" ? "bg-red-900/60 text-red-200" : change.kind === "added" ? "bg-emerald-900/60 text-emerald-200" : "bg-amber-900/60 text-amber-100"}`}>{change.kind}</span>
                  <div className="min-w-0 flex-1"><p className="break-all text-sm font-medium">{change.path}</p>{change.originalPath && change.originalPath !== change.path && <p className="break-all text-xs text-muted-foreground">from {change.originalPath}</p>}{(() => { const activity = [...workspaceActivities].reverse().find((candidate) => candidate.fileId === change.fileId || candidate.path === change.path || candidate.path?.includes(change.path)); return activity ? <p className="mt-1 text-xs text-muted-foreground">{activity.actor.displayName} · {activity.operation} · {new Date(activity.timestamp).toLocaleTimeString()}</p> : null; })()}</div>
                  <Button size="sm" variant="ghost" onClick={() => discardOneChange(change)} aria-label={`Discard change to ${change.path}`}><Undo2 className="mr-1 h-3 w-3" />Undo</Button>
                </div>
                {(change.contentBefore !== undefined || change.contentAfter !== undefined) && (
                  <details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">Inspect content</summary><div className="mt-2 grid gap-2 sm:grid-cols-2"><pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded bg-black/20 p-2">{change.contentBefore ?? "(new file)"}</pre><pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded bg-black/20 p-2">{change.contentAfter ?? "(deleted)"}</pre></div></details>
                )}
              </div>
            ))}
          </div>
          <div className="space-y-2 border-t border-[hsl(var(--obsidian-border))] pt-3">
            <Label htmlFor="commit-message">Commit message</Label>
            <Input id="commit-message" value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} maxLength={120} />
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setConfirmDiscardAll(true)} disabled={syncing}>Discard all</Button>
            <Button onClick={() => void handleSync()} disabled={syncing || workspaceChanges.length === 0}>{syncing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Sync {workspaceChanges.length} change{workspaceChanges.length === 1 ? "" : "s"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDiscardAll}
        onOpenChange={setConfirmDiscardAll}
        title="Discard all staged work?"
        description={`Restore all ${workspaceChanges.length} staged operation${workspaceChanges.length === 1 ? "" : "s"} to the GitHub version loaded when this workspace opened. This cannot be undone.`}
        confirmText="Discard all"
        onConfirm={() => {
          discardWorkspaceChanges(vaultYdoc, baselineRef.current);
          setConfirmDiscardAll(false);
          setShowChanges(false);
        }}
      />

      <Dialog open={Boolean(decisionMessage)} onOpenChange={(open) => { if (!open) setDecisionMessage(null); }}>
        <DialogContent className="sm:max-w-lg bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))]">
          <DialogHeader><DialogTitle>Capture decision</DialogTitle><DialogDescription>Turn an ephemeral discussion message into a reviewed Markdown change.</DialogDescription></DialogHeader>
          <div className="space-y-2"><Label htmlFor="decision-summary">Decision</Label><textarea id="decision-summary" value={decisionText} onChange={(event) => setDecisionText(event.target.value)} className="min-h-28 w-full rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-panel))] p-3 text-sm" /></div>
          <div className="space-y-2"><Label htmlFor="decision-target">Workspace document</Label><select id="decision-target" value={decisionTargetId} onChange={(event) => setDecisionTargetId(event.target.value)} className="h-10 w-full rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-panel))] px-3 text-sm">{notes.map((note) => <option key={note.id} value={note.id}>{fullNotePath(note)}</option>)}</select></div>
          <DialogFooter><Button variant="outline" onClick={() => setDecisionMessage(null)}>Cancel</Button><Button onClick={captureDecision} disabled={!decisionText.trim() || !decisionTargetId}>Stage decision</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={missingRepository} onOpenChange={(open) => { if (!open) setLocation("/"); }}>
        <DialogContent className="sm:max-w-md bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))]">
          <DialogHeader>
            <DialogTitle>Repository not found or inaccessible</DialogTitle>
            <DialogDescription>
              GitHub could not access <code>{privateRepo?.repoFullName}</code> with this token. You can return to your cabinets or create a private repository under {creationLogin || "the authenticated GitHub account"}; Marktwin will initialize <code>.agents/README.md</code>.
            </DialogDescription>
          </DialogHeader>
          {loadError && <p className="text-sm text-red-400">{loadError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLocation("/")}>Cancel</Button>
            <Button onClick={() => void createMissingRepository()} disabled={creatingRepository}>
              {creatingRepository && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create private repository
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(branchIssue)} onOpenChange={(open) => { if (!open) setLocation("/"); }}>
        <DialogContent className="sm:max-w-md bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))]">
          <DialogHeader>
            <DialogTitle>Branch not found</DialogTitle>
            <DialogDescription>The saved branch <code>{branchIssue?.requested}</code> does not exist. GitHub reports <code>{branchIssue?.fallback}</code> as the repository default.</DialogDescription>
          </DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setLocation("/")}>Cancel</Button><Button onClick={() => void useDefaultBranch()}>Use {branchIssue?.fallback}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {loadError && !missingRepository && !branchIssue && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-md bg-red-950 border border-red-700 px-4 py-3 text-sm text-red-100 shadow-lg">
          <AlertCircle className="h-4 w-4" />{loadError}<Button size="sm" variant="outline" onClick={() => setLocation("/")}>Back</Button>
        </div>
      )}
    </div>
  );
}
