import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Braces,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Eye,
  FileArchive,
  FileImage,
  FileText,
  FolderOpen,
  FilePlus,
  Github,
  History,
  Keyboard,
  LayoutDashboard,
  LayoutGrid,
  Loader2,
  Maximize2,
  MessageSquare,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Share2,
  Undo2,
  Upload,
  PenTool,
  PenLine,
  FolderPlus,
  Search,
  Star,
  X,
  Wand2,
} from "lucide-react";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";

import type { ChatMessage, SessionState, Vault, WorkspaceActivity, WorkspaceActivityCode, WorkspaceChange } from "@shared/schema";
import FileExplorer from "@/components/workspace-file-explorer";
import SidebarResizer from "@/components/sidebar-resizer";
import WorkspaceFileEditor from "@/components/workspace-file-editor";
import MarkdownPreview from "@/components/workspace-markdown-preview";
import type { MarkdownEditorMode } from "@/components/workspace-editor";
import WorkspaceOutline from "@/components/workspace-outline";
import CollaborationIndicator from "@/components/collaboration-indicator";
import CabinetSettingsDialog, { AppearancePreferencesDialog } from "@/components/workspace-settings-dialog";
import MergeConflictResolver from "@/components/merge-conflict-resolver";
import { PDFDownloadButton } from "@/components/pdf-download-button";
import PrivateCollaborationDialog from "@/components/private-collaboration-dialog";
import type { RepositoryConfiguration } from "@/components/repository-configuration-form";
import ChatPanel from "@/components/workspace-chat-panel";
import WorkspaceHistoryPanel from "@/components/workspace-history-panel";
import CabinetCommandPalette from "@/components/cabinet-command-palette";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { isMarkdownPath } from "@/lib/text-files";
import {
  InvitePayload,
  type CollaborationTransport,
  type JoinStatusCode,
  JoinCollaboration,
  OwnerCollaboration,
  canEditSession,
  joinCollaboration,
  replaceOwnerCollaboration,
  sessionStateForJoinStatus,
  startOwnerCollaboration,
} from "@/lib/workspace-collab";
import {
  BranchAdvancedError,
  GitHubApiError,
  GitHubRootSnapshot,
  commitAtomicChanges,
  createConflictBackup,
  createPrivateRepository,
  deleteBranch,
  getAuthenticatedUser,
  getBranch,
  getCommitRootSnapshot,
  initializeEmptyRepository,
  getRepository,
  getRecentCommits,
  getRootSnapshot,
  isEmptyGitHubRepositoryError,
  loadRepositoryImage,
  loadScopeSnapshot,
  parseRepo,
  resolveSelectedRootScopes,
  scopesForWorkspaceLoad,
  imageMimeTypeForPath,
  assetMimeTypeForFile,
  workspaceFileTypeForPath,
  type WorkspaceFileType,
  type WorkspaceFileContentEncoding,
  type GitHubCommitSummary,
} from "@/lib/workspace-github";
import {
  addWorkspaceFile,
  assertWorkspaceWithinScopes,
  collectAtomicChanges,
  createFolder,
  deleteFolder,
  deleteNote,
  describeWorkspaceChanges,
  discardWorkspaceChange,
  discardWorkspaceChanges,
  findPublishedChangeReloadMismatches,
  folderManagedFileCount,
  fullNotePath,
  getFilesMap,
  getFoldersMap,
  hasUnsyncedChanges,
  hydrateSelectedScopes,
  joinFolderPath,
  moveFolder,
  moveNote,
  normalizeDirectoryPath,
  normalizeRepositoryPath,
  pathBelongsToScope,
  readCabinetNotes,
  readFolderRecords,
  renameNote,
  scopeToSelectForCreatedFolder,
  setWorkspaceFileContent,
  updateArtifactReferences,
  visibleFolderPaths,
  type ScopeContent,
} from "@/lib/cabinet-files";
import { buildCabinetSearchIndex } from "@/lib/cabinet-search";
import { removeRetiredPresentationMetadata } from "@/lib/retired-presentation-metadata";
import { deriveArtifactRelations, backlinksFor } from "@/lib/artifact-relations";
import { diffReturnContext, snapshotForNotes, type ReturnContextEntry, type ReturnContextSnapshot } from "@/lib/return-context";
import { quickCaptureContent, quickCaptureDirectory, quickCaptureFilename } from "@/lib/quick-capture";
import { loadWorkingSet, pruneWorkingSet, saveWorkingSet, toggleWorkingSetItem } from "@/lib/working-set";
import { builtInTemplates, loadUserTemplates, saveUserTemplate, type WorkspaceTemplate } from "@/lib/templates";
import { isArtifactMetadataPath } from "@/lib/artifact-metadata";
import { trackProductEvent } from "@/lib/analytics";
import { workspaceActivityPresentation } from "@/lib/workspace-activity";
import { getUserAvatarColor, resolveUserAvatarPreferences, resolveUserIdentity } from "@/lib/user-identity";
import { getSavedRepos, SavedRepoRequestError, updateSavedRepo, type SavedRepoLocal } from "@/lib/saved-repos";
import { resolveRepositoryCredential } from "@/lib/github-session";
import { readLocalConflictBackups, rememberLocalConflictBackup, writeLocalConflictBackups } from "@/lib/conflict-backup-queue";
import { canDeleteConflictBackupBranch } from "@shared/conflict-backup";
import { decodeWorkspaceInviteHash } from "@/lib/workspace-invite";
import {
  enableInsecureCollaborationTestMode,
  isInsecureCollaborationTestMode,
  PRIVATE_COLLABORATION_SECURE_CONTEXT_ERROR,
} from "@/lib/private-crypto";
import { useCollaborationTransportPreference } from "@/lib/collaboration-preferences";
import { useLocalProfile } from "@/contexts/local-profile-context";
import { useI18n } from "@/contexts/i18n-context";
import type { WorkspaceNote } from "@/lib/cabinet-files";
import { createClientId } from "@/lib/client-id";
import { ALWAYS_AVAILABLE_WORKSPACE_FILE_TYPES, alwaysAvailableWorkspaceFileTypes, fileTypeExtension, fileTypeLabel } from "@/lib/workspace-formats";
import { clearAllWorkspaceRecovery, clearWorkspaceRecovery, applyWorkspaceRecovery, loadWorkspaceRecovery, requestPersistentWorkspaceStorage, saveWorkspaceRecovery, workspaceRecoveryMatchesRemoteContent, type WorkspaceRecoveryRecord } from "@/lib/workspace-recovery";
import { reconcilePublishedWorkspace } from "@/lib/workspace-publish-reconcile";
import { syncControlState, useAutoSyncInterval } from "@/lib/workspace-sync-preferences";
import { updateEditorPreferences, useEditorPreferences } from "@/lib/editor-preferences";
import {
  atomicChangesBetween,
  carryMergeResolutions,
  materializeMergePlan,
  planWorkspaceMerge,
  snapshotFromScopes,
  snapshotFromWorkspace,
  validateMergePlan,
  type WorkspaceMergePlan,
  type WorkspaceMergeSnapshot,
} from "@/lib/workspace-merge";
import { FIGURES_FOLDER, MAX_IMAGE_SESSION_CACHE_BYTES, base64ToBytes, fileToBase64, filenameForDroppedImage, imageDataUrl, isFiguresFolderPath, isSupportedImageFile, relativeRepositoryAssetPath, resolveRepositoryImagePath } from "@/lib/workspace-images";
import { MAX_WORKSPACE_ASSET_BYTES, filenameForDroppedAsset, isSupportedWorkspaceAsset } from "@/lib/workspace-assets";
import {
  createBundledDemoScopes,
  createDemoCheckpointScopes,
  DEMO_HISTORY,
  DEMO_PROJECT_BOARD_SHA,
  DEMO_REPOSITORY,
  DEMO_WORKSPACE_BRANCH,
  DEMO_WORKSPACE_SCOPES,
  LEGACY_DEMO_PROJECT_BOARD,
  LEGACY_DEMO_WORKSPACE_BRANCH,
  PROJECT_BOARD,
  migrateLegacyDemoScopes,
  createScenarioDemoScopes,
  getDemoScenario,
  type DemoWorkspaceAccess,
  type DemoScenarioId,
} from "@/lib/demo-workspace";

type PendingDelete =
  | { kind: "file"; id: string; label: string; count: 1 }
  | { kind: "folder"; path: string; label: string; count: number };

type PendingMove = {
  sourcePath: string;
  targetPath: string;
  count: number;
};

type PendingMerge = {
  id: string;
  plan: WorkspaceMergePlan;
  incoming: WorkspaceMergeSnapshot;
  root: GitHubRootSnapshot;
  scopes: string[];
  backupBranch?: string;
  backupWarning?: string;
  backupPending?: boolean;
  recordedBackupBranches: string[];
  reconcileBaseline: WorkspaceNote[];
  localSnapshot: WorkspaceMergeSnapshot;
};

type WorkspaceRightPanel = "chat" | "history" | null;
type WorkspaceEditorPane = "primary" | "split";
type SavedImageDrop = { fullPath: string; relativePath: string };
type PendingImageDrop = { note: WorkspaceNote; file: File; resolve: (image: SavedImageDrop | null) => void };

export default function WorkspaceVaultPage() {
  const [, params] = useRoute("/cabinet/:slug");
  const [isJoinRoute] = useRoute("/join");
  const [, setLocation] = useLocation();
  const { profile } = useLocalProfile();
  const cabinetsReturnPath = profile ? "/app" : "/";
  const slug = params?.slug || "";
  const requestedDemoScenario = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("scenario")
    : null;
  const demoScenario = getDemoScenario(requestedDemoScenario);
  const demoScenarioId: DemoScenarioId | null = demoScenario?.id || null;
  const demoAccess: DemoWorkspaceAccess | null = !isJoinRoute && slug === "documentation-read"
    ? "read-only"
    : !isJoinRoute && slug === "documentation"
      ? "editable"
      : null;
  const isDemoWorkspace = demoAccess !== null;
  const isReadOnlyDemo = demoAccess === "read-only";
  const { toast } = useToast();
  const { t, dateTime } = useI18n();
  const editorPreferences = useEditorPreferences();
  const defaultCollaborationTransport = useCollaborationTransportPreference();
  const [collaborationTransport, setCollaborationTransport] = useState<CollaborationTransport>(defaultCollaborationTransport);
  const [insecureCollaborationTestMode, setInsecureCollaborationTestMode] = useState(() => isInsecureCollaborationTestMode());
  const [showRelayConsent, setShowRelayConsent] = useState(false);
  const relayConsentResolverRef = useRef<((allowed: boolean) => void) | null>(null);

  const requestRelayFallback = useCallback(() => {
    if (relayConsentResolverRef.current) return new Promise<boolean>((resolve) => {
      const previous = relayConsentResolverRef.current;
      relayConsentResolverRef.current = (allowed) => {
        previous?.(allowed);
        resolve(allowed);
      };
    });
    setShowCollabDialog(false);
    setShowRelayConsent(true);
    return new Promise<boolean>((resolve) => {
      relayConsentResolverRef.current = resolve;
    });
  }, []);

  const resolveRelayConsent = useCallback((allowed: boolean) => {
    relayConsentResolverRef.current?.(allowed);
    relayConsentResolverRef.current = null;
    setShowRelayConsent(false);
  }, []);

  const localizedRepositoryError = useCallback((error: unknown) => {
    if (error instanceof Error && error.message === PRIVATE_COLLABORATION_SECURE_CONTEXT_ERROR) {
      return t("workspace.secureContextRequired");
    }
    if (error instanceof GitHubApiError) {
      if (error.status === 401) return t("errors.tokenInvalid");
      if (error.status === 403) return t("errors.repoPermission");
      if (error.status === 404) return t("errors.repoNotFound");
      return error.responseMessage;
    }
    if (error instanceof Error) return error.message;
    return t("errors.generic");
  }, [t]);


  const vaultYdoc = useRef(new Y.Doc()).current;
  const vaultAwareness = useRef(new Awareness(vaultYdoc)).current;
  const joinSessionRef = useRef<JoinCollaboration | null>(null);
  const ownerSessionRef = useRef<OwnerCollaboration | null>(null);
  const [collabSession, setCollabSession] = useState<OwnerCollaboration | null>(null);

  useEffect(() => {
    if (!ownerSessionRef.current) setCollaborationTransport(defaultCollaborationTransport);
  }, [defaultCollaborationTransport]);

  const { data: savedRepos = [], isLoading: reposLoading } = useQuery<SavedRepoLocal[]>({
    queryKey: ["saved-repos"],
    queryFn: async () => getSavedRepos(),
    enabled: !isJoinRoute && !isDemoWorkspace && Boolean(profile),
  });
  const privateRepo = isDemoWorkspace
    ? demoScenario?.repository || DEMO_REPOSITORY
    : savedRepos.find((repo) => String(repo.id) === slug)
      || savedRepos.find((repo) => (
        String(repo.cabinetNumber) === slug ||
        repo.repoFullName.split("/")[1] === slug ||
        repo.repoFullName === slug
      ));
  const settingsEditable = privateRepo?.settingsEditable !== false;
  const sharedCabinet = privateRepo?.access === "shared";
  const [autoSyncIntervalSeconds] = useAutoSyncInterval(privateRepo?.repoFullName);
  const [githubToken, setGithubToken] = useState<string | null>(null);
  const [credentialResolving, setCredentialResolving] = useState(false);

  useEffect(() => {
    if (!privateRepo || isDemoWorkspace || isJoinRoute) {
      setGithubToken(null);
      setCredentialResolving(false);
      return;
    }
    let cancelled = false;
    setCredentialResolving(true);
    void resolveRepositoryCredential(privateRepo)
      .then((credential) => { if (!cancelled) setGithubToken(credential?.token || null); })
      .finally(() => { if (!cancelled) setCredentialResolving(false); });
    return () => { cancelled = true; };
  }, [isDemoWorkspace, isJoinRoute, privateRepo?.id, privateRepo?.repoFullName]);

  const [notes, setNotes] = useState<WorkspaceNote[]>([]);
  const [emptyFolders, setEmptyFolders] = useState<string[]>([]);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [collaborationFileTypes, setCollaborationFileTypes] = useState<WorkspaceFileType[]>([...ALWAYS_AVAILABLE_WORKSPACE_FILE_TYPES]);
  const [rootSnapshot, setRootSnapshot] = useState<GitHubRootSnapshot | null>(null);
  const [workingBranch, setWorkingBranch] = useState("");
  const [baseCommitSha, setBaseCommitSha] = useState("");
  const [baseTreeSha, setBaseTreeSha] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [cabinetReady, setCabinetReady] = useState(false);
  const [loadingCabinet, setLoadingCabinet] = useState(false);
  const [loadProgress, setLoadProgress] = useState<{ scope: string; completed: number; total: number } | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const syncingRef = useRef(false);
  const syncQueuedRef = useRef(false);
  const syncSnapshotRef = useRef<WorkspaceMergeSnapshot | null>(null);
  const autoSyncTimerRef = useRef<number | null>(null);
  const handleSyncRef = useRef<(() => Promise<void>) | null>(null);
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
  const [activeEditorPane, setActiveEditorPane] = useState<WorkspaceEditorPane>("primary");
  const [focusMode, setFocusMode] = useState(false);
  const [multiViewOpen, setMultiViewOpen] = useState(false);
  const [multiViewActiveId, setMultiViewActiveId] = useState<string | null>(null);
  const [editorModes, setEditorModes] = useState<Record<WorkspaceEditorPane, Record<string, MarkdownEditorMode>>>({ primary: {}, split: {} });
  const [outlineJump, setOutlineJump] = useState<{ fileId: string; line: number; nonce: number } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(288);
  const [viewportWidth, setViewportWidth] = useState(() => typeof window === "undefined" ? 1440 : window.innerWidth);
  const [mobilePanel, setMobilePanel] = useState<"files" | "document">("files");
  const [showSettings, setShowSettings] = useState(false);
  const [showCollabDialog, setShowCollabDialog] = useState(false);
  const [rightPanel, setRightPanel] = useState<WorkspaceRightPanel>(null);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showQuickCapture, setShowQuickCapture] = useState(false);
  const [quickCaptureText, setQuickCaptureText] = useState("");
  const [quickCaptureTitle, setQuickCaptureTitle] = useState("");
  const [quickCaptureTemplateId, setQuickCaptureTemplateId] = useState("blank-note");
  const [showBacklinks, setShowBacklinks] = useState(false);
  const [showWorkingSet, setShowWorkingSet] = useState(false);
  const [showReturnContext, setShowReturnContext] = useState(false);
  const [availableTemplates, setAvailableTemplates] = useState<WorkspaceTemplate[]>(builtInTemplates);
  const [workingSet, setWorkingSet] = useState<import("@shared/schema").WorkingSetItem[]>([]);
  const [returnContextEntries, setReturnContextEntries] = useState<ReturnContextEntry[]>([]);
  const returnContextSnapshotRef = useRef<ReturnContextSnapshot | null>(null);
  const returnContextKeyRef = useRef("");
  const editedArtifactsRef = useRef(new Set<string>());
  const chatOpenedTrackedRef = useRef(false);
  const joinedTrackedRef = useRef(false);
  const showChat = rightPanel === "chat";
  const showHistory = rightPanel === "history" && !isJoinRoute && !isReadOnlyDemo;
  const setShowChat = useCallback((next: boolean | ((open: boolean) => boolean)) => {
    if (isReadOnlyDemo) return;
    setRightPanel((current) => {
      const open = typeof next === "function" ? next(current === "chat") : next;
      return open ? "chat" : current === "chat" ? null : current;
    });
  }, [isReadOnlyDemo]);
  useEffect(() => {
    if (isReadOnlyDemo && rightPanel) setRightPanel(null);
  }, [isReadOnlyDemo, rightPanel]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [historyCommits, setHistoryCommits] = useState<GitHubCommitSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyRevision, setHistoryRevision] = useState(0);
  const [workspaceActivities, setWorkspaceActivities] = useState<WorkspaceActivity[]>([]);
  const [hasUnread, setHasUnread] = useState(false);
  const showChatRef = useRef(false);
  const [sessionState, setSessionState] = useState<SessionState>("stopped");
  const [peerCount, setPeerCount] = useState(0);
  const [showChanges, setShowChanges] = useState(false);
  const [confirmDiscardAll, setConfirmDiscardAll] = useState(false);
  const [confirmResetDemo, setConfirmResetDemo] = useState(false);
  const [confirmClearRecovery, setConfirmClearRecovery] = useState(false);
  const [confirmOpenGitHubVersion, setConfirmOpenGitHubVersion] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [pendingMerge, setPendingMerge] = useState<PendingMerge | null>(null);
  const [publishingMerge, setPublishingMerge] = useState(false);
  const [localSavedAt, setLocalSavedAt] = useState<number | null>(null);
  const [recoveryError, setRecoveryError] = useState("");
  const [pendingRecovery, setPendingRecovery] = useState<{ record: WorkspaceRecoveryRecord; content: ScopeContent[]; root: GitHubRootSnapshot; scopes: string[] } | null>(null);
  const baselineRef = useRef<ScopeContent[]>([]);
  const imageObjectUrlsRef = useRef(new Map<string, { url: string; bytes: number; usedAt: number }>());
  const imagePathShaRef = useRef(new Map<string, string>());

  const [creatingFile, setCreatingFile] = useState(false);
  const [creatingFileType, setCreatingFileType] = useState<WorkspaceFileType>("markdown");
  const [newFileName, setNewFileName] = useState("");
  const [newFilePath, setNewFilePath] = useState("/");
  const [creationPath, setCreationPath] = useState("/");
  const [creatingFolderFromToolbar, setCreatingFolderFromToolbar] = useState(false);
  const [newFolderNameFromToolbar, setNewFolderNameFromToolbar] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [pendingImageDrop, setPendingImageDrop] = useState<PendingImageDrop | null>(null);
  const [imageDropDestination, setImageDropDestination] = useState("");

  const [invite, setInvite] = useState<InvitePayload | null>(null);
  const [joinStatus, setJoinStatus] = useState<JoinStatusCode | "preparing">("preparing");
  const [joinError, setJoinError] = useState("");
  const [showShareProgress, setShowShareProgress] = useState(false);

  const chatClientId = String(vaultAwareness.clientID);
  const defaultIdentity = useMemo(
    () => resolveUserIdentity(
      profile || { displayName: `Guest ${chatClientId.slice(-4)}` },
      `collaboration-session:${chatClientId}`,
    ),
    [chatClientId, profile],
  );
  const defaultUsernameRef = useRef(defaultIdentity.displayName);
  const [myUsername, setMyUsername] = useState(defaultIdentity.displayName);
  const userAvatar = useMemo(
    () => resolveUserAvatarPreferences(profile?.appPreferences),
    [profile?.appPreferences],
  );
  const myColor = getUserAvatarColor(userAvatar.configured ? userAvatar : undefined, defaultIdentity.color);

  useEffect(() => {
    setMyUsername((name) => {
      const followsDefaultIdentity = name === defaultUsernameRef.current;
      defaultUsernameRef.current = defaultIdentity.displayName;
      return followsDefaultIdentity ? defaultIdentity.displayName : name;
    });
  }, [defaultIdentity.displayName]);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handleWorkspaceShortcut = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShowCommandPalette(true);
      } else if (modifier && event.altKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setShowQuickCapture(true);
      } else if (modifier && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setFocusMode((focused) => !focused);
      } else if (modifier && !event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!isReadOnlyDemo && !isJoinRoute) void handleSyncRef.current?.();
      } else if (event.key === "Escape" && focusMode) {
        setFocusMode(false);
      }
    };
    window.addEventListener("keydown", handleWorkspaceShortcut);
    return () => window.removeEventListener("keydown", handleWorkspaceShortcut);
  }, [focusMode, isJoinRoute, isReadOnlyDemo]);

  useEffect(() => {
    if (!privateRepo) return;
    setWorkingSet(loadWorkingSet(privateRepo.id, profile?.id || "anonymous"));
  }, [profile?.id, privateRepo?.id]);

  useEffect(() => {
    setAvailableTemplates([...builtInTemplates, ...loadUserTemplates()]);
  }, []);

  useEffect(() => {
    setEditorModes({ primary: {}, split: {} });
  }, [editorPreferences.defaultMarkdownMode]);

  const modeForFile = useCallback((fileId: string, pane: WorkspaceEditorPane = "primary") => editorModes[pane][fileId] || editorPreferences.defaultMarkdownMode, [editorModes, editorPreferences.defaultMarkdownMode]);
  const setFileEditorMode = useCallback((fileId: string, mode: MarkdownEditorMode, pane: WorkspaceEditorPane = "primary") => {
    setEditorModes((current) => ({ ...current, [pane]: { ...current[pane], [fileId]: mode } }));
  }, []);

  useEffect(() => {
    if (rightPanel && viewportWidth >= 640 && viewportWidth < 1024) {
      setSidebarCollapsed(true);
    }
  }, [rightPanel, viewportWidth]);

  const appendChatMessage = useCallback((message: ChatMessage) => {
    setChatMessages((current) => {
      if (current.some((candidate) => candidate.id === message.id)) return current;
      return [...current, message].slice(-200);
    });
    if (message.sessionId !== chatClientId && !showChatRef.current) setHasUnread(true);
  }, [chatClientId]);

  const recordActivity = useCallback((operationCode: WorkspaceActivityCode, fileId?: string, path?: string, params?: WorkspaceActivity["params"]) => {
    const activity: WorkspaceActivity = {
      id: createClientId(),
      actor: {
        sessionId: chatClientId,
        displayName: myUsername,
        color: myColor,
        role: isJoinRoute ? invite?.role || "view" : "owner",
      },
      operationCode,
      params,
      fileId,
      path,
      timestamp: Date.now(),
    };
    const activities = vaultYdoc.getArray<WorkspaceActivity>("workspace-activity");
    activities.push([activity]);
    if (activities.length > 300) activities.delete(0, activities.length - 300);
  }, [chatClientId, invite?.role, isJoinRoute, myColor, myUsername, vaultYdoc]);

  const activityLabel = useCallback((activity: WorkspaceActivity) => {
    const presentation = workspaceActivityPresentation(activity);
    if ("legacy" in presentation) return presentation.legacy || t("activity.unknown");
    const fileType = presentation.params?.fileType ? t(`repo.${presentation.params.fileType}`) : t("repo.markdown");
    return t(presentation.key, { fileType });
  }, [t]);

  const vault: Vault | undefined = privateRepo ? {
    id: privateRepo.id,
    name: privateRepo.displayName.split("/").pop() || privateRepo.displayName,
    urlSlug: String(privateRepo.id),
    githubRepo: privateRepo.repoFullName,
    lastSyncAt: null,
    createdAt: new Date(privateRepo.createdAt),
  } as unknown as Vault : undefined;

  const managedFileTypes = useMemo<WorkspaceFileType[]>(() => {
    const configured = isJoinRoute ? collaborationFileTypes : privateRepo?.selectedFileTypes;
    return alwaysAvailableWorkspaceFileTypes([...(configured || []), "image"]);
  }, [collaborationFileTypes, isJoinRoute, privateRepo?.selectedFileTypes]);

  const refreshCabinetView = useCallback(() => {
    setNotes(readCabinetNotes(vaultYdoc, privateRepo?.id || 0).filter((note) => !isArtifactMetadataPath(fullNotePath(note))));
    setEmptyFolders(visibleFolderPaths(vaultYdoc).filter((path) => !isArtifactMetadataPath(`${path}/ARTIFACTS.md`)));
    setDirty(hasUnsyncedChanges(vaultYdoc));
    if (syncingRef.current && syncSnapshotRef.current) {
      const current = snapshotFromWorkspace(readCabinetNotes(vaultYdoc, 0, true), readFolderRecords(vaultYdoc, true));
      if (atomicChangesBetween(syncSnapshotRef.current, current).length > 0) syncQueuedRef.current = true;
    }
  }, [privateRepo?.id, vaultYdoc]);

  const awarenessNote = notes.find((note) => note.id === activeNoteId);
  const searchableNotes = useMemo(() => notes.filter((note) => note.fileType !== "image" && note.fileType !== "asset"), [notes]);
  const searchIndex = useMemo(() => buildCabinetSearchIndex(searchableNotes), [searchableNotes]);
  const artifactRelations = useMemo(() => deriveArtifactRelations(searchableNotes), [searchableNotes]);
  const activeBacklinks = useMemo(() => {
    if (!awarenessNote) return [];
    return backlinksFor(artifactRelations, { id: awarenessNote.artifactId || awarenessNote.id, path: fullNotePath(awarenessNote), fileType: awarenessNote.fileType, label: awarenessNote.filename });
  }, [artifactRelations, awarenessNote]);
  const workingSetNotes = useMemo(() => workingSet
    .map((item) => notes.find((note) => (note.artifactId || note.id) === item.id || fullNotePath(note) === item.path))
    .filter((note): note is WorkspaceNote => Boolean(note))
    .slice(0, 4), [notes, workingSet]);

  useEffect(() => {
    if (!multiViewOpen) return;
    if (multiViewActiveId && workingSetNotes.some((note) => note.id === multiViewActiveId)) return;
    setMultiViewActiveId(workingSetNotes[0]?.id || null);
  }, [multiViewActiveId, multiViewOpen, workingSetNotes]);

  useEffect(() => {
    if (!privateRepo || !cabinetReady) return;
    setWorkingSet(pruneWorkingSet(privateRepo.id, new Set(notes.map((note) => fullNotePath(note))), profile?.id || "anonymous"));
  }, [cabinetReady, profile?.id, notes, privateRepo?.id]);

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
    if (!privateRepo || isJoinRoute || !authenticated || loadingCabinet || pendingRecovery || !workingBranch || !notes.length) return;
    const key = `${privateRepo.id}:${workingBranch}:${baseCommitSha}`;
    if (returnContextKeyRef.current === key) return;
    returnContextKeyRef.current = key;
    const current = snapshotForNotes(notes, baseCommitSha || workingBranch);
    let previous: ReturnContextSnapshot | null = null;
    try {
      const stored = window.localStorage.getItem(`marktwin-return-context:${privateRepo.id}`);
      previous = stored ? JSON.parse(stored) as ReturnContextSnapshot : null;
    } catch {
      previous = null;
    }
    returnContextSnapshotRef.current = current;
    const changesSinceReturn = diffReturnContext(previous, current);
    setReturnContextEntries(changesSinceReturn);
    if (previous && changesSinceReturn.length > 0) {
      trackProductEvent("user_returned", { cabinetId: isDemoWorkspace ? undefined : privateRepo.id, metadata: { source: isDemoWorkspace ? "demo" : "workspace", route: "/cabinet", returning: true } });
    }
  }, [authenticated, baseCommitSha, isJoinRoute, loadingCabinet, notes, pendingRecovery, privateRepo, workingBranch]);

  useEffect(() => {
    vaultAwareness.setLocalStateField("user", {
      name: myUsername,
      color: myColor,
      avatar: userAvatar.configured
        ? {
            colorIndex: userAvatar.colorIndex,
          }
        : undefined,
      clientId: vaultAwareness.clientID,
      role: isJoinRoute ? invite?.role || "view" : "owner",
      viewingFileId: activeNoteId || undefined,
      viewingFilePath: awarenessNote ? fullNotePath(awarenessNote) : undefined,
    });
  }, [activeNoteId, awarenessNote, invite?.role, isJoinRoute, myColor, myUsername, userAvatar, vaultAwareness]);

  useEffect(() => {
    showChatRef.current = showChat;
    if (showChat) {
      setHasUnread(false);
      if (!chatOpenedTrackedRef.current) {
        chatOpenedTrackedRef.current = true;
        trackProductEvent("chat_opened", { cabinetId: isDemoWorkspace ? undefined : privateRepo?.id, metadata: { source: "chat", route: "/cabinet" } });
      }
    }
  }, [privateRepo?.id, showChat]);

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
    if (editorPreferences.keepOfflineDrafts) void requestPersistentWorkspaceStorage().catch(() => false);
  }, [editorPreferences.keepOfflineDrafts]);

  useEffect(() => {
    if (isJoinRoute || isReadOnlyDemo || !privateRepo || !authenticated || !cabinetReady || !workingBranch || !baseCommitSha || !baseTreeSha || pendingRecovery) return;
    if (!isDemoWorkspace && !editorPreferences.keepOfflineDrafts) return;
    const timer = window.setTimeout(() => {
      saveWorkspaceRecovery({
        doc: vaultYdoc,
        repoId: privateRepo.id,
        repoFullName: privateRepo.repoFullName,
        branch: workingBranch,
        baseCommitSha,
        baseTreeSha,
        selectedScopes,
        baseline: baselineRef.current,
        dirty,
      }).then(() => {
        setLocalSavedAt(Date.now());
        setRecoveryError("");
      }).catch((error) => {
        setRecoveryError(error instanceof Error ? error.message : "Local recovery storage failed.");
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [authenticated, baseCommitSha, baseTreeSha, cabinetReady, dirty, editorPreferences.keepOfflineDrafts, emptyFolders, isDemoWorkspace, isJoinRoute, isReadOnlyDemo, notes, pendingRecovery, privateRepo, selectedScopes, vaultYdoc, workingBranch]);

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
      selectedFileTypes: managedFileTypes,
      syncing: syncingRef.current,
      workspaceName: vault?.name || "Marktwin workspace",
    });
    if (privateRepo && !isDemoWorkspace && settingsEditable) {
      void Promise.resolve().then(() => updateSavedRepo(privateRepo.id, { selectedRootScopes: scopes }))
        .then((updatedRepo) => {
          queryClient.setQueryData<SavedRepoLocal[]>(["saved-repos"], (current) =>
            current?.map((repo) => repo.id === updatedRepo.id ? updatedRepo : repo),
          );
        })
        .catch(() => undefined);
    }
  }, [isDemoWorkspace, managedFileTypes, privateRepo, settingsEditable, vault?.name]);

  const loadDemoWorkspace = useCallback(async (reset = false) => {
    setLoadingCabinet(true);
    setCabinetReady(false);
    setLoadError("");
    const demoRepository = privateRepo || DEMO_REPOSITORY;
    try {
      if (reset && !isReadOnlyDemo) {
        await Promise.all([
          clearWorkspaceRecovery(demoRepository.id, demoRepository.repoFullName, demoRepository.defaultBranch || DEMO_WORKSPACE_BRANCH).catch(() => undefined),
          ...(demoScenarioId ? [] : [clearWorkspaceRecovery(DEMO_REPOSITORY.id, DEMO_REPOSITORY.repoFullName, LEGACY_DEMO_WORKSPACE_BRANCH).catch(() => undefined)]),
        ]);
      }
      const bundled = demoScenarioId ? createScenarioDemoScopes(demoScenarioId) : createBundledDemoScopes();
      const demoScopes = demoRepository.selectedRootScopes || DEMO_WORKSPACE_SCOPES;
      const demoBranch = demoRepository.defaultBranch || DEMO_WORKSPACE_BRANCH;
      hydrateSelectedScopes(vaultYdoc, bundled);
      baselineRef.current = bundled;
      setSelectedScopes([...demoScopes]);
      setWorkingBranch(demoBranch);
      setBaseCommitSha(demoBranch);
      setBaseTreeSha(demoBranch);
      setCommitMessage(demoScenario?.title || "Explore Marktwin in the browser");
      setHistoryCommits(DEMO_HISTORY);
      setPendingRecovery(null);

      if (!reset && !isReadOnlyDemo) {
        let recovery = await loadWorkspaceRecovery(demoRepository.id, demoRepository.repoFullName, demoBranch).catch(() => undefined);
        let migratedLegacyRecovery = false;
        if (!recovery && !demoScenarioId) {
          recovery = await loadWorkspaceRecovery(DEMO_REPOSITORY.id, DEMO_REPOSITORY.repoFullName, LEGACY_DEMO_WORKSPACE_BRANCH).catch(() => undefined);
          migratedLegacyRecovery = Boolean(recovery);
        }
        if (recovery) {
          baselineRef.current = recovery.baseline.length
            ? migrateLegacyDemoScopes(recovery.baseline)
            : bundled;
          applyWorkspaceRecovery(vaultYdoc, recovery, migratedLegacyRecovery
            ? { repoId: DEMO_REPOSITORY.id, repoFullName: DEMO_REPOSITORY.repoFullName, branch: LEGACY_DEMO_WORKSPACE_BRANCH }
            : { repoId: demoRepository.id, repoFullName: demoRepository.repoFullName, branch: demoBranch });
          if (migratedLegacyRecovery && !demoScenarioId) {
            const legacyBoard = readCabinetNotes(vaultYdoc, DEMO_REPOSITORY.id)
              .find((note) => fullNotePath(note) === "examples/PROJECT-BOARD.canvas" && note.content === LEGACY_DEMO_PROJECT_BOARD);
            if (legacyBoard) {
              const boardRecord = getFilesMap(vaultYdoc).get(legacyBoard.id);
              const boardText = boardRecord?.get("content");
              if (boardRecord && boardText instanceof Y.Text) {
                vaultYdoc.transact(() => {
                  boardText.delete(0, boardText.length);
                  boardText.insert(0, PROJECT_BOARD);
                  boardRecord.set("originalContent", PROJECT_BOARD);
                  boardRecord.set("githubSha", DEMO_PROJECT_BOARD_SHA);
                  boardRecord.set("status", "clean");
                }, "demo-version-migration");
              }
            }
            await saveWorkspaceRecovery({
              doc: vaultYdoc,
              repoId: demoRepository.id,
              repoFullName: demoRepository.repoFullName,
              branch: demoBranch,
              baseCommitSha: demoBranch,
              baseTreeSha: demoBranch,
              selectedScopes: [...demoScopes],
              baseline: baselineRef.current,
              dirty: recovery.dirty,
            });
            await clearWorkspaceRecovery(DEMO_REPOSITORY.id, DEMO_REPOSITORY.repoFullName, LEGACY_DEMO_WORKSPACE_BRANCH).catch(() => undefined);
          }
          setLocalSavedAt(recovery.updatedAt);
          if (recovery.updatedAt) {
            setHistoryCommits([
              {
                sha: `demo-local-${recovery.updatedAt}`,
                shortSha: "local",
                message: recovery.dirty ? t("workspace.continueDemoChanges") : t("workspace.defaultDemoCheckpointMessage"),
                author: t("workspace.thisBrowser"),
                authoredAt: new Date(recovery.updatedAt).toISOString(),
                url: "",
              },
              ...DEMO_HISTORY,
            ]);
          }
        }
      } else {
        const activities = vaultYdoc.getArray<WorkspaceActivity>("workspace-activity");
        if (activities.length) activities.delete(0, activities.length);
        setActiveNoteId(null);
        setActiveTabId(null);
        setOpenTabs([]);
        setSplitViewNoteId(null);
        setChatMessages([]);
        setWorkspaceActivities([]);
        setLocalSavedAt(null);
      }
      setAuthenticated(true);
      setCabinetReady(true);
    } catch (error) {
      setCabinetReady(false);
      setLoadError(error instanceof Error ? error.message : "The bundled Tutorial could not be opened.");
    } finally {
      setLoadingCabinet(false);
    }
  }, [demoScenario, demoScenarioId, isReadOnlyDemo, privateRepo, vaultYdoc]);

  const demoLoadedRef = useRef("");
  useEffect(() => {
    if (!isDemoWorkspace) {
      demoLoadedRef.current = "";
      return;
    }
    const demoKey = `${slug}:${demoScenarioId || "tutorial"}`;
    if (demoLoadedRef.current === demoKey) return;
    demoLoadedRef.current = demoKey;
    void loadDemoWorkspace();
  }, [isDemoWorkspace, loadDemoWorkspace, slug]);

  const loadOwnerCabinet = useCallback(async (branchOverride?: string) => {
    if (!githubToken || !privateRepo) return;
    loadAbortRef.current?.abort();
    const abortController = new AbortController();
    loadAbortRef.current = abortController;
    setLoadingCabinet(true);
    setCabinetReady(false);
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
        if (isEmptyGitHubRepositoryError(error)) {
          if (!settingsEditable) {
            setLoadError(t("settings.sharedRepositoryReadOnly"));
            return;
          }
          await initializeEmptyRepository(githubToken, repository.fullName, branch);
        } else if (error instanceof GitHubApiError && error.status === 404) {
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
      const scopes = resolveSelectedRootScopes(root.scopes, privateRepo.selectedRootScopes);
      const content: ScopeContent[] = [];
      const fileTypes = managedFileTypes;
      for (const scopeKey of scopesForWorkspaceLoad(scopes)) {
        const scope = root.scopes.find((candidate) => candidate.key === scopeKey)!;
        const loaded = await loadScopeSnapshot({
          token: githubToken,
          repoFullName: repository.fullName,
          branch,
          scope,
          rootMarkdown: root.rootMarkdown,
          rootFiles: root.rootFiles,
          fileTypes,
          signal: abortController.signal,
          onProgress: (completed, total) => setLoadProgress({ scope: scope.label, completed, total }),
        });
        content.push({ scope: scopeKey, ...loaded });
      }

      setRootSnapshot(root);
      setWorkingBranch(branch);
      setAuthenticated(true);
      const recovery = editorPreferences.keepOfflineDrafts
        ? await loadWorkspaceRecovery(privateRepo.id, privateRepo.repoFullName, branch).catch(() => undefined)
        : undefined;
      const recoveryAlreadyPublished = Boolean(
        recovery?.dirty
        && recovery.baseCommitSha !== root.commitSha
        && workspaceRecoveryMatchesRemoteContent(recovery, content, {
          repoId: privateRepo.id,
          repoFullName: privateRepo.repoFullName,
          branch,
        }),
      );
      if (recovery?.dirty && recovery.baseCommitSha !== root.commitSha && !recoveryAlreadyPublished) {
        setPendingRecovery({ record: recovery, content, root, scopes });
      } else {
        hydrateSelectedScopes(vaultYdoc, content);
        baselineRef.current = content;
        setBaseCommitSha(root.commitSha);
        setBaseTreeSha(root.treeSha);
        setSelectedScopes(scopes);
        ownerSessionRef.current?.updateControl({
          selectedScopes: scopes,
          selectedFileTypes: managedFileTypes,
          syncing: syncingRef.current,
          workspaceName: vault?.name || "Marktwin workspace",
        });
        if (recoveryAlreadyPublished) {
          await clearWorkspaceRecovery(privateRepo.id, privateRepo.repoFullName, branch).catch((error) => {
            setRecoveryError(error instanceof Error ? error.message : t("workspace.recoveryStorageFailed"));
          });
          setLocalSavedAt(Date.now());
          toast({ title: t("workspace.syncedToGithub"), description: t("workspace.githubAlreadyReviewed") });
        } else if (recovery?.dirty) {
          applyWorkspaceRecovery(vaultYdoc, recovery, { repoId: privateRepo.id, repoFullName: privateRepo.repoFullName, branch });
          setLocalSavedAt(recovery.updatedAt);
          toast({ title: t("workspace.localDraftRestored"), description: t("workspace.localDraftRestoredDescription") });
        }
        setCabinetReady(true);
      }
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
        setCabinetReady(false);
        setLoadError(localizedRepositoryError(error));
      }
    } finally {
      if (loadAbortRef.current === abortController) loadAbortRef.current = null;
      setLoadProgress(null);
      setLoadingCabinet(false);
    }
  }, [editorPreferences.keepOfflineDrafts, githubToken, managedFileTypes, privateRepo, settingsEditable, t, toast, vault?.name, vaultYdoc]);

  const loadedRepoRef = useRef("");
  useEffect(() => {
    if (isJoinRoute || isDemoWorkspace || reposLoading || !privateRepo || !githubToken) return;
    const key = `${privateRepo.id}:${githubToken}`;
    if (loadedRepoRef.current === key) return;
    loadedRepoRef.current = key;
    void loadOwnerCabinet();
  }, [githubToken, isDemoWorkspace, isJoinRoute, loadOwnerCabinet, privateRepo, reposLoading]);

  useEffect(() => {
    if (!isJoinRoute) return;
    let cancelled = false;
    try {
      const parsed = decodeWorkspaceInviteHash(window.location.hash);
      setInvite(parsed);
      void joinCollaboration(vaultYdoc, vaultAwareness, parsed, (status) => {
        if (cancelled) return;
        setJoinStatus(status);
        setSessionState(sessionStateForJoinStatus(status));
        if ((status === "connected_edit" || status === "connected_view") && !joinedTrackedRef.current) {
          joinedTrackedRef.current = true;
          trackProductEvent("collaborator_joined", { metadata: { source: "workspace", route: "/join" } });
        }
      }, {
        onChat: appendChatMessage,
        onControl: (control) => {
          setSelectedScopes(control.selectedScopes);
          setCollaborationFileTypes(alwaysAvailableWorkspaceFileTypes(control.selectedFileTypes));
          syncingRef.current = control.syncing;
          setSyncing(control.syncing);
        },
      }).then((session) => {
        if (cancelled) {
          session.stop();
          return;
        }
        joinSessionRef.current = session;
        setCabinetReady(true);
      }).catch((error) => {
        if (cancelled) return;
        joinSessionRef.current?.stop();
        joinSessionRef.current = null;
        setCabinetReady(false);
        setJoinError(error instanceof Error ? error.message : t("workspace.invalidInvite"));
      });
    } catch {
      setCabinetReady(false);
      setJoinError(t("workspace.invalidInvite"));
    }
    return () => {
      cancelled = true;
      joinSessionRef.current?.stop();
      joinSessionRef.current = null;
    };
  }, [appendChatMessage, isJoinRoute, requestRelayFallback, t, vaultAwareness, vaultYdoc]);

  useEffect(() => () => {
    loadAbortRef.current?.abort();
    joinSessionRef.current?.stop();
    ownerSessionRef.current?.stop();
    relayConsentResolverRef.current?.(false);
    relayConsentResolverRef.current = null;
    for (const entry of imageObjectUrlsRef.current.values()) URL.revokeObjectURL(entry.url);
    imageObjectUrlsRef.current.clear();
    imagePathShaRef.current.clear();
  }, []);

  useEffect(() => {
    if (activeNoteId || notes.length === 0) return;
    const preferred = isDemoWorkspace
      ? notes.find((note) => fullNotePath(note).toLowerCase() === "readme.md") || notes[0]
      : notes.find((note) => fullNotePath(note).toLowerCase() === ".agents/readme.md")
      || notes.find((note) => fullNotePath(note).toLowerCase() === ".agents/agents.md")
      || notes[0];
    setActiveNoteId(preferred.id);
    setActiveTabId(preferred.id);
    setOpenTabs((current) => current.includes(preferred.id) ? current : [...current, preferred.id]);
  }, [activeNoteId, isDemoWorkspace, notes]);

  const createMissingRepository = async () => {
    if (!githubToken || !privateRepo || !settingsEditable) {
      if (sharedCabinet) setLoadError(t("settings.sharedRepositoryReadOnly"));
      return;
    }
    setCreatingRepository(true);
    try {
      const { repo } = parseRepo(privateRepo.repoFullName);
      const created = await createPrivateRepository(githubToken, repo);
      updateSavedRepo(privateRepo.id, {
        displayName: created.fullName,
        repoFullName: created.fullName,
        defaultBranch: created.defaultBranch,
        selectedRootScopes: [".agents"],
        selectedFileTypes: [...ALWAYS_AVAILABLE_WORKSPACE_FILE_TYPES],
        autoSync: false,
        autoMergeNonOverlapping: true,
        createConflictBackup: true,
      });
      sessionStorage.setItem(`gh-token-${privateRepo.id}`, githubToken);
      await queryClient.invalidateQueries({ queryKey: ["saved-repos"] });
      setMissingRepository(false);
      loadedRepoRef.current = "";
      window.location.reload();
    } catch (error) {
      setLoadError(localizedRepositoryError(error));
    } finally {
      setCreatingRepository(false);
    }
  };

  const useDefaultBranch = async () => {
    if (!privateRepo || !branchIssue || !settingsEditable) {
      if (sharedCabinet) setLoadError(t("settings.sharedRepositoryReadOnly"));
      return;
    }
    updateSavedRepo(privateRepo.id, { defaultBranch: branchIssue.fallback });
    await queryClient.invalidateQueries({ queryKey: ["saved-repos"] });
    setBranchIssue(null);
    loadedRepoRef.current = "";
    await loadOwnerCabinet(branchIssue.fallback);
  };

  const workspaceChanges = useMemo<WorkspaceChange[]>(() => (
    describeWorkspaceChanges(vaultYdoc, baselineRef.current)
  ), [dirty, emptyFolders, notes, vaultYdoc]);

  useEffect(() => {
    if (workspaceChanges.length === 0 && syncError) setSyncError(false);
  }, [syncError, workspaceChanges.length]);

  const loadHistory = useCallback(async () => {
    if (isJoinRoute) return;
    if (isDemoWorkspace) {
      setHistoryError("");
      setHistoryCommits((current) => current.length ? current : DEMO_HISTORY);
      return;
    }
    if (!githubToken || !privateRepo || !workingBranch) return;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error(t("workspace.offlineHistory"));
      setHistoryCommits(await getRecentCommits(githubToken, privateRepo.repoFullName, workingBranch, 25));
    } catch (error) {
      setHistoryError(localizedRepositoryError(error));
    } finally {
      setHistoryLoading(false);
    }
  }, [githubToken, isDemoWorkspace, isJoinRoute, privateRepo, workingBranch]);

  useEffect(() => {
    if (showHistory) void loadHistory();
  }, [historyRevision, loadHistory, showHistory]);

  const saveRepositorySettings = async (configuration: RepositoryConfiguration) => {
    if (!privateRepo) return;
    if (!settingsEditable) throw new Error(t("settings.sharedRepositoryReadOnly"));
    const contentConfigurationChanged = (
      configuration.branch !== privateRepo.defaultBranch ||
      JSON.stringify(configuration.selectedRootScopes) !== JSON.stringify(privateRepo.selectedRootScopes || []) ||
      JSON.stringify(alwaysAvailableWorkspaceFileTypes(configuration.selectedFileTypes)) !== JSON.stringify(alwaysAvailableWorkspaceFileTypes(privateRepo.selectedFileTypes))
    );
    if (dirty && contentConfigurationChanged) throw new Error(t("settings.stagedChangesWarning"));
    const updatedRepo = await updateSavedRepo(privateRepo.id, {
      defaultBranch: configuration.branch,
      selectedRootScopes: configuration.selectedRootScopes,
      selectedFileTypes: configuration.selectedFileTypes,
      autoSync: configuration.autoSync,
      autoMergeNonOverlapping: configuration.autoMergeNonOverlapping,
      createConflictBackup: configuration.createConflictBackup,
    });
    queryClient.setQueryData<SavedRepoLocal[]>(["saved-repos"], (current) =>
      current?.map((repo) => repo.id === updatedRepo.id ? updatedRepo : repo),
    );
    setSelectedScopes(configuration.selectedRootScopes);
    ownerSessionRef.current?.updateControl({
      selectedScopes: configuration.selectedRootScopes,
      selectedFileTypes: configuration.selectedFileTypes,
      syncing: syncingRef.current,
      workspaceName: vault?.name || "Marktwin workspace",
    });
    await queryClient.invalidateQueries({ queryKey: ["saved-repos"] });
    setShowSettings(false);
    if (contentConfigurationChanged) window.location.reload();
  };

  const requestSync = () => {
    if (isReadOnlyDemo) return;
    try {
      assertWorkspaceWithinScopes(vaultYdoc, selectedScopes);
      if (workspaceChanges.length === 0) {
        toast({
          title: isDemoWorkspace ? t("workspace.noDemoChanges") : t("workspace.nothingToSync"),
          description: isDemoWorkspace ? t("workspace.demoMatchesCheckpoint") : t("workspace.githubMatchesWorkspace"),
        });
        return;
      }
      setShowChanges(true);
    } catch (error) {
      toast({ title: t("workspace.reviewRequired"), description: localizedRepositoryError(error), variant: "destructive" });
    }
  };

  const setWorkspaceLocked = (locked: boolean) => {
    const wasSyncing = syncingRef.current;
    syncingRef.current = locked;
    setSyncing(locked);
    ownerSessionRef.current?.updateControl({
      selectedScopes,
      selectedFileTypes: managedFileTypes,
      syncing: locked,
      workspaceName: vault?.name || "Agent workspace",
    });
    setSessionState(locked ? "syncing" : ownerSessionRef.current ? "connected" : "stopped");
    if (!locked && wasSyncing) {
      const shouldRunFollowUp = syncQueuedRef.current;
      syncQueuedRef.current = false;
      syncSnapshotRef.current = null;
      if (shouldRunFollowUp) {
        window.setTimeout(() => {
          if (!syncingRef.current) void handleSyncRef.current?.();
        }, 0);
      }
    }
  };

  const loadRemoteWorkspace = async (root: GitHubRootSnapshot, scopes = selectedScopes) => {
    if (!githubToken || !privateRepo) throw new Error(t("workspace.githubAuthenticationUnavailable"));
    const content = await Promise.all(scopesForWorkspaceLoad(scopes).map(async (scopeKey) => {
      const scope = root.scopes.find((candidate) => candidate.key === scopeKey);
      if (!scope) {
        return { scope: scopeKey, files: [], folderMarkers: [] } satisfies ScopeContent;
      }
      const loaded = await loadScopeSnapshot({
        token: githubToken,
        repoFullName: privateRepo.repoFullName,
        branch: workingBranch,
        scope,
        rootMarkdown: root.rootMarkdown,
        rootFiles: root.rootFiles,
        fileTypes: managedFileTypes,
        concurrency: 12,
        onProgress: (completed, total) => setLoadProgress({ scope: scope.label, completed, total }),
      });
      return { scope: scopeKey, ...loaded };
    }));
    return { content, snapshot: snapshotFromScopes(content) };
  };

  const cleanupConflictBackups = async (extraBranches: string[] = []) => {
    if (!githubToken || !privateRepo || !settingsEditable) return;
    const candidates = Array.from(new Set([
      ...(privateRepo.pendingConflictBackupBranches || []),
      ...readLocalConflictBackups(privateRepo.id, privateRepo.repoFullName),
      ...extraBranches,
    ]));
    if (candidates.length === 0) return;
    const failures: string[] = [];
    const manualReview: string[] = [];
    for (const branch of candidates) {
      if (!canDeleteConflictBackupBranch(branch, workingBranch, privateRepo.defaultBranch)) {
        manualReview.push(branch);
        continue;
      }
      try {
        await deleteBranch(githubToken, privateRepo.repoFullName, branch);
      } catch (error) {
        const alreadyMissing = error instanceof GitHubApiError && (
          error.status === 404 ||
          (error.status === 422 && /not found|does not exist/i.test(error.responseMessage))
        );
        if (!alreadyMissing) failures.push(branch);
      }
    }
    writeLocalConflictBackups(privateRepo.id, privateRepo.repoFullName, failures);
    try {
      await updateSavedRepo(privateRepo.id, { pendingConflictBackupBranches: failures });
      await queryClient.invalidateQueries({ queryKey: ["saved-repos"] });
    } catch {
      toast({
        title: t("workspace.backupStatusNotSaved"),
        description: t("workspace.backupStatusNotSavedDescription"),
        variant: "destructive",
      });
      return;
    }
    if (failures.length > 0) {
      toast({
        title: t("workspace.backupCleanupPending"),
        description: t("workspace.backupCleanupFailures", { count: failures.length }),
        variant: "destructive",
      });
    }
    if (manualReview.length > 0) {
      toast({
        title: t("workspace.backupManualReview"),
        description: t("workspace.backupManualReviewDescription", { count: manualReview.length }),
        variant: "destructive",
      });
    }
  };

  const finishSuccessfulSync = async (
    finalRoot: GitHubRootSnapshot,
    finalContent: ScopeContent[],
    scopes: string[],
    publishedChanges: number,
    backupBranches: string[] = [],
    publishedChangeSet?: ReturnType<typeof collectAtomicChanges>,
    reconcileBaseline?: WorkspaceNote[],
  ) => {
    if (!privateRepo) return;
    if (publishedChangeSet) reconcilePublishedWorkspace(vaultYdoc, finalContent, publishedChangeSet, reconcileBaseline);
    else hydrateSelectedScopes(vaultYdoc, finalContent);
    setSyncError(false);
    baselineRef.current = finalContent;
    setRootSnapshot(finalRoot);
    setBaseCommitSha(finalRoot.commitSha);
    setBaseTreeSha(finalRoot.treeSha);
    persistScopes(scopes);
    await clearWorkspaceRecovery(privateRepo.id, privateRepo.repoFullName, workingBranch).catch(() => undefined);
    setLocalSavedAt(Date.now());
    setPendingMerge(null);
    setLoadProgress(null);
    setHistoryRevision((revision) => revision + 1);
    await cleanupConflictBackups(backupBranches);
    setWorkspaceLocked(false);
    toast({
      title: t("workspace.syncedToGithub"),
      description: publishedChanges === 0
        ? t("workspace.githubAlreadyReviewed")
        : t("workspace.atomicChangesPublished", { count: publishedChanges }),
    });
    trackProductEvent("checkpoint_completed", { cabinetId: isDemoWorkspace ? undefined : privateRepo.id, metadata: { source: isDemoWorkspace ? "demo" : "workspace", route: "/cabinet" } });
  };

  const verifyPublishedReload = (content: ScopeContent[], changes: ReturnType<typeof collectAtomicChanges>) => {
    const mismatches = findPublishedChangeReloadMismatches(content, changes);
    if (mismatches.length > 0) {
      throw new Error(t("workspace.postSyncVerificationFailed", { paths: mismatches.join(", ") }));
    }
  };

  const openMergeResolver = (merge: PendingMerge) => {
    setPendingMerge(merge);
    setSessionState("conflict");
  };

  const rebasePendingMerge = async (merge: PendingMerge, newestRoot: GitHubRootSnapshot) => {
    if (!privateRepo) throw new Error(t("workspace.githubAuthenticationUnavailable"));
    const newest = await loadRemoteWorkspace(newestRoot, merge.scopes);
    const currentBaseline = readCabinetNotes(vaultYdoc, privateRepo.id, true);
    const currentLocal = snapshotFromWorkspace(currentBaseline, readFolderRecords(vaultYdoc, true));
    const freshPlan = planWorkspaceMerge(snapshotFromScopes(baselineRef.current), currentLocal, newest.snapshot, merge.scopes);
    const plan = carryMergeResolutions(merge.plan, freshPlan);
    openMergeResolver({
      ...merge,
      plan,
      incoming: newest.snapshot,
      root: newestRoot,
      reconcileBaseline: currentBaseline,
      localSnapshot: currentLocal,
    });
  };

  const publishMerge = async (merge: PendingMerge) => {
    if (!githubToken || !privateRepo) throw new Error(t("workspace.githubAuthenticationUnavailable"));
    if (merge.backupPending) return "opened" as const;
    const currentBaseline = readCabinetNotes(vaultYdoc, privateRepo.id, true);
    const currentLocal = snapshotFromWorkspace(currentBaseline, readFolderRecords(vaultYdoc, true));
    const observedRoot = await getRootSnapshot(githubToken, privateRepo.repoFullName, workingBranch);
    const localChangedSinceReview = atomicChangesBetween(merge.localSnapshot, currentLocal).length > 0;
    if (localChangedSinceReview || observedRoot.commitSha !== merge.root.commitSha) {
      await rebasePendingMerge(merge, observedRoot);
      return "opened" as const;
    }

    const validationErrors = validateMergePlan(merge.plan);
    if (validationErrors.length > 0) throw new Error(validationErrors[0]);

    const reviewedResult = materializeMergePlan(merge.plan);

    const changes = atomicChangesBetween(merge.incoming, reviewedResult);
    let publishedCommit: Awaited<ReturnType<typeof commitAtomicChanges>> | undefined;
    if (changes.length > 0) {
      try {
        publishedCommit = await commitAtomicChanges({
          token: githubToken,
          repoFullName: privateRepo.repoFullName,
          branch: workingBranch,
          baseCommitSha: observedRoot.commitSha,
          baseTreeSha: observedRoot.treeSha,
          changes,
          message: commitMessage.trim() || t("workspace.defaultCommitMessage"),
        });
      } catch (error) {
        if (error instanceof BranchAdvancedError) {
          const newestRoot = await getRootSnapshot(githubToken, privateRepo.repoFullName, workingBranch);
          await rebasePendingMerge(merge, newestRoot);
          return "opened" as const;
        }
        throw error;
      }
    }

    const finalRoot = publishedCommit
      ? await getCommitRootSnapshot(githubToken, privateRepo.repoFullName, publishedCommit.commitSha, publishedCommit.treeSha)
      : observedRoot;
    const final = await loadRemoteWorkspace(finalRoot, merge.scopes);
    verifyPublishedReload(final.content, changes);
    await finishSuccessfulSync(
      finalRoot,
      final.content,
      merge.scopes,
      changes.length,
      merge.recordedBackupBranches,
      changes,
      merge.reconcileBaseline,
    );
    return "completed" as const;
  };

  const createConflictBackupForMerge = async (
    merge: PendingMerge,
    originalChanges: ReturnType<typeof collectAtomicChanges>,
  ) => {
    if (!githubToken || !privateRepo || !settingsEditable) return;
    let backupBranch: string | undefined;
    let backupWarning: string | undefined;
    let recordedBackupBranches: string[] = [];

    try {
      const backup = await createConflictBackup({
        token: githubToken,
        repoFullName: privateRepo.repoFullName,
        branch: workingBranch,
        baseCommitSha,
        baseTreeSha,
        changes: originalChanges,
        message: `Temporary Marktwin conflict backup for ${workingBranch}`,
        username: profile?.username || myUsername,
      });
      backupBranch = backup.branch;
      recordedBackupBranches = [backup.branch];
      const queuedInBrowser = rememberLocalConflictBackup(privateRepo.id, privateRepo.repoFullName, backup.branch);
      const pendingBranches = Array.from(new Set([
        ...(privateRepo.pendingConflictBackupBranches || []),
        backup.branch,
      ]));
      try {
        await updateSavedRepo(privateRepo.id, { pendingConflictBackupBranches: pendingBranches });
        await queryClient.invalidateQueries({ queryKey: ["saved-repos"] });
      } catch (error) {
        const sessionExpired = error instanceof SavedRepoRequestError && error.status === 401;
        backupWarning = sessionExpired
          ? `Temporary backup '${backup.branch}' was created. Your Marktwin login session expired, so the server cleanup record was not saved; this was not a GitHub permission failure. ${queuedInBrowser ? "Cleanup is still queued in this browser." : "Browser storage was unavailable, so this branch must be deleted manually."} Sign in again before the next sync.`
          : `Temporary backup '${backup.branch}' was created, but the server cleanup record could not be saved (${error instanceof Error ? error.message : "unknown error"}). ${queuedInBrowser ? "Cleanup is still queued in this browser; delete it manually only if a later successful sync cannot remove it." : "Browser storage was unavailable, so this branch must be deleted manually."}`;
      }
    } catch (error) {
      backupWarning = `GitHub could not create a temporary backup branch. Resolution can continue, but recovery is available only in this browser. ${localizedRepositoryError(error)}`;
    }

    setPendingMerge((current) => {
      if (!current || current.id !== merge.id) return current;
      return {
        ...current,
        backupBranch,
        backupWarning,
        backupPending: false,
        recordedBackupBranches,
      };
    });
  };

  const prepareMerge = async (
    incomingRoot: GitHubRootSnapshot,
    originalChanges: ReturnType<typeof collectAtomicChanges>,
  ) => {
    if (!githubToken || !privateRepo) throw new Error(t("workspace.githubAuthenticationUnavailable"));
    const incoming = await loadRemoteWorkspace(incomingRoot, selectedScopes);
    const base = snapshotFromScopes(baselineRef.current);
    const reconcileBaseline = readCabinetNotes(vaultYdoc, privateRepo.id, true);
    const local = snapshotFromWorkspace(reconcileBaseline, readFolderRecords(vaultYdoc, true));
    const plan = planWorkspaceMerge(base, local, incoming.snapshot, selectedScopes);
    const hasGenuineConflicts = plan.items.some((item) => item.resolution === "unresolved" || item.conflictKind);
    const merge: PendingMerge = {
      id: `${incomingRoot.commitSha}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      plan,
      incoming: incoming.snapshot,
      root: incomingRoot,
      scopes: selectedScopes,
      backupPending: hasGenuineConflicts && privateRepo.createConflictBackup,
      recordedBackupBranches: [],
      reconcileBaseline,
      localSnapshot: local,
    };
    if (validateMergePlan(plan).length === 0 && privateRepo.autoMergeNonOverlapping) {
      return publishMerge(merge);
    }
    setLoadProgress(null);
    openMergeResolver(merge);
    if (merge.backupPending) void createConflictBackupForMerge(merge, originalChanges);
    return "opened" as const;
  };

  const handleSync = async () => {
    if (isReadOnlyDemo) return;
    if (syncingRef.current) {
      syncQueuedRef.current = true;
      return;
    }
    if (isDemoWorkspace) {
      await saveDemoCheckpoint();
      return;
    }
    if (!githubToken || !privateRepo || !baseCommitSha || !baseTreeSha) return;
    setSyncError(false);
    try {
      assertWorkspaceWithinScopes(vaultYdoc, selectedScopes);
      const changes = collectAtomicChanges(vaultYdoc);
      if (changes.length === 0) return;
      setShowChanges(false);
      syncSnapshotRef.current = snapshotFromWorkspace(readCabinetNotes(vaultYdoc, privateRepo.id, true), readFolderRecords(vaultYdoc, true));
      setWorkspaceLocked(true);
      const latestRoot = await getRootSnapshot(githubToken, privateRepo.repoFullName, workingBranch);
      if (latestRoot.commitSha !== baseCommitSha) {
        await prepareMerge(latestRoot, changes);
        return;
      }
      let publishedCommit: Awaited<ReturnType<typeof commitAtomicChanges>>;
      try {
        publishedCommit = await commitAtomicChanges({
          token: githubToken,
          repoFullName: privateRepo.repoFullName,
          branch: workingBranch,
          baseCommitSha,
          baseTreeSha,
          changes,
          message: commitMessage.trim() || t("workspace.defaultCommitMessage"),
        });
      } catch (error) {
        if (error instanceof BranchAdvancedError) {
          const advancedRoot = await getRootSnapshot(githubToken, privateRepo.repoFullName, workingBranch);
          await prepareMerge(advancedRoot, changes);
          return;
        }
        throw error;
      }
      const finalRoot = await getCommitRootSnapshot(githubToken, privateRepo.repoFullName, publishedCommit.commitSha, publishedCommit.treeSha);
      const final = await loadRemoteWorkspace(finalRoot, selectedScopes);
      verifyPublishedReload(final.content, changes);
      await finishSuccessfulSync(finalRoot, final.content, selectedScopes, changes.length, [], changes);
    } catch (error) {
      setSyncError(true);
      toast({ title: t("workspace.syncFailed"), description: localizedRepositoryError(error), variant: "destructive" });
      setLoadProgress(null);
      setWorkspaceLocked(false);
    }
  };

  handleSyncRef.current = handleSync;
  useEffect(() => {
    if (
      !privateRepo?.autoSync ||
      isDemoWorkspace ||
      isJoinRoute ||
      isReadOnlyDemo ||
      !cabinetReady ||
      pendingRecovery ||
      !dirty ||
      workspaceChanges.length === 0 ||
      !githubToken ||
      !workingBranch ||
      !baseCommitSha ||
      !baseTreeSha
    ) return;

    if (autoSyncTimerRef.current !== null) window.clearTimeout(autoSyncTimerRef.current);
    autoSyncTimerRef.current = window.setTimeout(() => {
      autoSyncTimerRef.current = null;
      if (!syncingRef.current) void handleSyncRef.current?.();
    }, autoSyncIntervalSeconds * 1000);
    return () => {
      if (autoSyncTimerRef.current !== null) {
        window.clearTimeout(autoSyncTimerRef.current);
        autoSyncTimerRef.current = null;
      }
    };
  }, [autoSyncIntervalSeconds, baseCommitSha, baseTreeSha, cabinetReady, dirty, emptyFolders, githubToken, isDemoWorkspace, isJoinRoute, isReadOnlyDemo, notes, pendingRecovery, privateRepo?.autoSync, workspaceChanges.length, workingBranch]);

  const cancelMerge = () => {
    setPendingMerge(null);
    setPublishingMerge(false);
    setLoadProgress(null);
    setWorkspaceLocked(false);
    toast({ title: t("workspace.mergeCanceled"), description: t("workspace.mergeCanceledDescription") });
  };

  const publishPendingMerge = async () => {
    if (!pendingMerge) return;
    setPublishingMerge(true);
    setSyncError(false);
    try {
      await publishMerge(pendingMerge);
    } catch (error) {
      setSyncError(true);
      toast({ title: t("workspace.mergePublishFailed"), description: localizedRepositoryError(error), variant: "destructive" });
    } finally {
      setPublishingMerge(false);
    }
  };

  const saveDemoCheckpoint = async () => {
    if (!privateRepo || isReadOnlyDemo) return;
    const publishedChanges = workspaceChanges.length;
    const timestamp = Date.now();
    setShowChanges(false);
    setWorkspaceLocked(true);
    try {
      const content = createDemoCheckpointScopes(
        readCabinetNotes(vaultYdoc, privateRepo.id),
        readFolderRecords(vaultYdoc),
        selectedScopes,
      );
      hydrateSelectedScopes(vaultYdoc, content);
      baselineRef.current = content;
      const checkpointId = `demo-checkpoint-${timestamp}`;
      setBaseCommitSha(checkpointId);
      setBaseTreeSha(checkpointId);
      await saveWorkspaceRecovery({
        doc: vaultYdoc,
        repoId: privateRepo.id,
        repoFullName: privateRepo.repoFullName,
        branch: privateRepo.defaultBranch,
        baseCommitSha: checkpointId,
        baseTreeSha: checkpointId,
        selectedScopes,
        baseline: content,
        dirty: false,
      });
      setLocalSavedAt(timestamp);
      setHistoryCommits((current) => [{
        sha: checkpointId,
        shortSha: "local",
        message: commitMessage.trim() || t("workspace.defaultDemoCheckpointMessage"),
        author: myUsername,
        authoredAt: new Date(timestamp).toISOString(),
        url: "",
      }, ...current.filter((commit) => commit.sha !== checkpointId)].slice(0, 25));
      toast({
        title: t("workspace.demoCheckpointSaved"),
        description: t("workspace.demoChangesSaved", { count: publishedChanges }),
      });
      trackProductEvent("checkpoint_completed", { metadata: { source: "demo", route: "/cabinet" } });
    } catch (error) {
      toast({ title: t("workspace.demoCheckpointFailed"), description: localizedRepositoryError(error), variant: "destructive" });
    } finally {
      setWorkspaceLocked(false);
    }
  };

  const editorReadOnly = isReadOnlyDemo || (isJoinRoute && !canEditSession(invite?.role || "view"));
  const structuralReadOnly = editorReadOnly;
  useEffect(() => {
    if (structuralReadOnly) return;
    for (const note of notes) {
      if (!isMarkdownPath(note.filename)) continue;
      const content = removeRetiredPresentationMetadata(note.content);
      if (content !== note.content) setWorkspaceFileContent(vaultYdoc, note.id, content);
    }
  }, [notes, structuralReadOnly, vaultYdoc]);
  const defaultCreationPath = useMemo(() => {
    if (selectedScopes.includes("/")) return "/";
    const folder = selectedScopes.find((scope) => scope !== "/");
    return folder ? `${folder}/` : "/";
  }, [selectedScopes]);

  const creationFolders = useMemo(() => {
    const paths = new Set<string>();
    for (const scope of selectedScopes) {
      paths.add(scope === "/" ? "/" : normalizeDirectoryPath(scope));
    }
    for (const folder of emptyFolders) if (editorPreferences.showFiguresFolder || !isFiguresFolderPath(folder)) paths.add(normalizeDirectoryPath(folder));
    for (const note of notes) if (editorPreferences.showFiguresFolder || !isFiguresFolderPath(fullNotePath(note))) paths.add(normalizeDirectoryPath(note.path));
    return Array.from(paths).sort((left, right) => {
      if (left === defaultCreationPath) return -1;
      if (right === defaultCreationPath) return 1;
      return left.localeCompare(right);
    });
  }, [defaultCreationPath, editorPreferences.showFiguresFolder, emptyFolders, notes, selectedScopes]);

  const effectiveCreationPath = creationFolders.includes(creationPath)
    ? creationPath
    : defaultCreationPath;
  const visibleChatWidth = viewportWidth < 640
    ? Math.min(editorPreferences.rightPanelWidth, viewportWidth)
    : Math.min(editorPreferences.rightPanelWidth, Math.max(200, viewportWidth - (sidebarCollapsed ? 0 : sidebarWidth + 8) - 320));

  const figuresFolder = selectedScopes.includes("/") || selectedScopes.length === 0
    ? FIGURES_FOLDER
    : `${selectedScopes[0].replace(/\/$/, "")}/${FIGURES_FOLDER}`;

  const saveDroppedImage = useCallback(async (note: WorkspaceNote, file: File, destinationPath: string) => {
    if (!isSupportedImageFile(file)) throw new Error(t("workspace.imageDropFailed"));
    if (file.size > 10 * 1024 * 1024) throw new Error(t("workspace.imageDropTooLarge"));
    const filenameBase = filenameForDroppedImage(file);
    const destination = normalizeDirectoryPath(destinationPath);
    const candidatePaths = new Set(notes.map((candidate) => fullNotePath(candidate).toLocaleLowerCase("en-US")));
    let filename = filenameBase;
    const extension = filenameBase.match(/\.[^./]+$/)?.[0] || ".png";
    const stem = filenameBase.slice(0, -extension.length) || "image";
    let counter = 2;
    while (candidatePaths.has(`${destination === "/" ? "" : destination}${filename}`.toLocaleLowerCase("en-US"))) {
      filename = `${stem}-${counter}${extension}`;
      counter += 1;
    }
    const fullPath = `${destination === "/" ? "" : destination}${filename}`;
    if (!selectedScopes.some((scope) => pathBelongsToScope(fullPath, scope))) throw new Error(t("workspace.imageOutsideFolders"));
    const content = await fileToBase64(file);
    addWorkspaceFile(vaultYdoc, { path: destination, filename, content, contentEncoding: "base64", fileType: "image" });
    recordActivity("file.created", undefined, fullPath, { targetPath: fullPath, fileType: "image" });
    return { fullPath, relativePath: relativeRepositoryAssetPath(note, fullPath) };
  }, [notes, pathBelongsToScope, recordActivity, selectedScopes, t, vaultYdoc]);

  const saveImageDrop = useCallback((note: WorkspaceNote, file: File): Promise<SavedImageDrop | null> => {
    if (editorReadOnly) return Promise.resolve(null);
    if (editorPreferences.imageDropLocation === "ask") {
      setImageDropDestination(note.path);
      return new Promise<SavedImageDrop | null>((resolve) => setPendingImageDrop({ note, file, resolve }));
    }
    const destination = editorPreferences.imageDropLocation === "note-folder" ? note.path : figuresFolder;
    return saveDroppedImage(note, file, destination).catch((error) => {
      toast({ title: t("workspace.imageDropFailed"), description: localizedRepositoryError(error), variant: "destructive" });
      return null;
    });
  }, [editorPreferences.imageDropLocation, editorReadOnly, figuresFolder, saveDroppedImage, t, toast]);

  const handleImageDrop = useCallback((note: WorkspaceNote, file: File) => (
    saveImageDrop(note, file).then((image) => image?.relativePath || null)
  ), [saveImageDrop]);

  const handleCanvasImageDrop = useCallback((note: WorkspaceNote, file: File) => (
    saveImageDrop(note, file).then((image) => image?.fullPath || null)
  ), [saveImageDrop]);

  const saveDroppedAsset = useCallback(async (note: WorkspaceNote, file: File) => {
    if (!isSupportedWorkspaceAsset(file) || workspaceFileTypeForPath(file.name) !== "asset") throw new Error(t("workspace.assetTypeUnsupported"));
    if (file.size > MAX_WORKSPACE_ASSET_BYTES) throw new Error(t("workspace.assetTooLarge"));
    const destination = normalizeDirectoryPath(note.path);
    const candidatePaths = new Set(notes.map((candidate) => fullNotePath(candidate).toLocaleLowerCase("en-US")));
    const originalName = filenameForDroppedAsset(file);
    const extension = originalName.match(/\.[^./]+$/)?.[0] || ".bin";
    const stem = originalName.slice(0, -extension.length) || "asset";
    let filename = originalName;
    let counter = 2;
    while (candidatePaths.has(`${destination === "/" ? "" : destination}${filename}`.toLocaleLowerCase("en-US"))) {
      filename = `${stem}-${counter}${extension}`;
      counter += 1;
    }
    const fullPath = `${destination === "/" ? "" : destination}${filename}`;
    if (!selectedScopes.some((scope) => pathBelongsToScope(fullPath, scope))) throw new Error(t("workspace.destinationOutsideScopes"));
    addWorkspaceFile(vaultYdoc, { path: destination, filename, content: await fileToBase64(file), contentEncoding: "base64", fileType: "asset" });
    recordActivity("file.created", undefined, fullPath, { targetPath: fullPath, fileType: "asset" });
    return fullPath;
  }, [notes, pathBelongsToScope, recordActivity, selectedScopes, t, vaultYdoc]);

  const handleAssetFileDrop = useCallback((event: React.DragEvent<HTMLElement>, note: WorkspaceNote) => {
    if (structuralReadOnly) return;
    const droppedAsset = Array.from(event.dataTransfer.files).find((candidate) => workspaceFileTypeForPath(candidate.name) === "asset");
    if (!droppedAsset) return;
    event.preventDefault();
    event.stopPropagation();
    void saveDroppedAsset(note, droppedAsset).catch((error) => {
      toast({ title: t("workspace.importFailed", { filename: droppedAsset.name }), description: localizedRepositoryError(error), variant: "destructive" });
    });
  }, [saveDroppedAsset, structuralReadOnly, t, toast]);

  const handleAssetFileDragOver = useCallback((event: React.DragEvent<HTMLElement>) => {
    if (structuralReadOnly) return;
    if (!Array.from(event.dataTransfer.items).some((item) => item.kind === "file" && workspaceFileTypeForPath(item.getAsFile()?.name || "") === "asset")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, [structuralReadOnly]);

  const loadManagedImage = useCallback(async (path: string) => {
    const normalized = normalizeRepositoryPath(path);
    if (!selectedScopes.some((scope) => pathBelongsToScope(normalized, scope))) throw new Error(t("workspace.imageOutsideFolders"));
    const local = notes.find((candidate) => candidate.fileType === "image" && fullNotePath(candidate).toLocaleLowerCase("en-US") === normalized.toLocaleLowerCase("en-US"));
    if (local) {
      const mimeType = imageMimeTypeForPath(normalized);
      if (!mimeType) throw new Error(t("workspace.repositoryImageUnavailable", { source: normalized }));
      return { path: normalized, sha: local.githubSha || `local:${local.id}:${local.content.length}`, mimeType, bytes: base64ToBytes(local.content) };
    }
    if (isJoinRoute) return joinSessionRef.current?.requestImage(normalized) ?? Promise.reject(new Error("The owner is not connected."));
    if (!githubToken || !privateRepo || !workingBranch) throw new Error(t("workspace.githubImageUnavailable"));
    return loadRepositoryImage(githubToken, privateRepo.repoFullName, normalized, workingBranch);
  }, [githubToken, isJoinRoute, notes, privateRepo, selectedScopes, t, workingBranch]);

  const resolveRepositoryImage = useCallback(async (note: WorkspaceNote, source: string) => {
    const path = resolveRepositoryImagePath(note, source);
    if (!path) return /^(data:image\/(?:png|jpeg|gif|webp|avif|bmp);|blob:)/i.test(source) ? source : null;
    const local = notes.find((candidate) => candidate.fileType === "image" && fullNotePath(candidate).toLocaleLowerCase("en-US") === path.toLocaleLowerCase("en-US"));
    if (local) return imageDataUrl(local.content, path);
    const cachedSha = imagePathShaRef.current.get(path);
    const cached = cachedSha ? imageObjectUrlsRef.current.get(cachedSha) : undefined;
    if (cached) {
      cached.usedAt = Date.now();
      return cached.url;
    }
    try {
      const asset = await loadManagedImage(path);
      const sameContent = imageObjectUrlsRef.current.get(asset.sha);
      if (sameContent) {
        sameContent.usedAt = Date.now();
        imagePathShaRef.current.set(path, asset.sha);
        return sameContent.url;
      }
      const url = URL.createObjectURL(new Blob([asset.bytes], { type: asset.mimeType }));
      imageObjectUrlsRef.current.set(asset.sha, { url, bytes: asset.bytes.byteLength, usedAt: Date.now() });
      imagePathShaRef.current.set(path, asset.sha);
      let total = Array.from(imageObjectUrlsRef.current.values()).reduce((sum, entry) => sum + entry.bytes, 0);
      if (total > MAX_IMAGE_SESSION_CACHE_BYTES) {
        const oldest = Array.from(imageObjectUrlsRef.current.entries()).sort((left, right) => left[1].usedAt - right[1].usedAt);
        for (const [sha, entry] of oldest) {
          if (total <= MAX_IMAGE_SESSION_CACHE_BYTES) break;
          URL.revokeObjectURL(entry.url);
          imageObjectUrlsRef.current.delete(sha);
          for (const [cachedPath, cachedSha] of imagePathShaRef.current.entries()) {
            if (cachedSha === sha) imagePathShaRef.current.delete(cachedPath);
          }
          total -= entry.bytes;
        }
      }
      return url;
    } catch {
      return null;
    }
  }, [loadManagedImage, notes]);

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

  const startOutlineResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = editorPreferences.outlineHeight;
    const handleMove = (moveEvent: PointerEvent) => {
      updateEditorPreferences({ outlineHeight: startHeight + startY - moveEvent.clientY });
    };
    const handleEnd = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd, { once: true });
  };

  const resizeOutlineWithKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 40 : 16;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      updateEditorPreferences({ outlineHeight: editorPreferences.outlineHeight + step });
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      updateEditorPreferences({ outlineHeight: editorPreferences.outlineHeight - step });
    }
    if (event.key === "Home") {
      event.preventDefault();
      updateEditorPreferences({ outlineHeight: 120 });
    }
    if (event.key === "End") {
      event.preventDefault();
      updateEditorPreferences({ outlineHeight: 480 });
    }
  };

  const closeTab = (id: string) => {
    const index = openTabs.indexOf(id);
    const remaining = openTabs.filter((tabId) => tabId !== id);
    let focusTarget: string | null = activeTabId;
    setOpenTabs(remaining);
    if (activeTabId === id) {
      const next = remaining[index] || remaining[index - 1] || null;
      setActiveTabId(next);
      setActiveNoteId(next);
      focusTarget = next;
    }
    if (splitViewNoteId === id) setSplitViewNoteId(null);
    if (focusTarget) requestAnimationFrame(() => document.getElementById(workspaceTabId(focusTarget!))?.focus());
  };

  const workspaceTabId = (id: string) => `workspace-tab-${id.replace(/[^A-Za-z0-9_-]/g, "-")}`;

  const activateTab = (id: string) => {
    setActiveTabId(id);
    setActiveNoteId(id);
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, id: string) => {
    const currentIndex = openTabs.indexOf(id);
    if (currentIndex < 0) return;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % openTabs.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + openTabs.length) % openTabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = openTabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextId = openTabs[nextIndex];
    activateTab(nextId);
    requestAnimationFrame(() => document.getElementById(workspaceTabId(nextId))?.focus());
  };

  const handleCreateFile = (path = effectiveCreationPath, fileType: WorkspaceFileType = "markdown", filename?: string, content?: string, contentEncoding?: WorkspaceFileContentEncoding) => {
    if (structuralReadOnly) return;
    if (!filename) {
      setCreatingFile(true);
      setCreatingFileType(fileType);
      setNewFilePath(normalizeDirectoryPath(path));
      setNewFileName("");
      return;
    }
    try {
      const destination = normalizeDirectoryPath(path);
      const candidate = destination === "/" ? filename : `${destination}${filename}`;
      if (!selectedScopes.some((scope) => pathBelongsToScope(candidate, scope))) {
        throw new Error(t("workspace.destinationOutsideScopes"));
      }
      const id = addWorkspaceFile(vaultYdoc, { filename, path, content, contentEncoding, fileType });
      recordActivity("file.created", id, `${normalizeDirectoryPath(path) === "/" ? "" : normalizeDirectoryPath(path)}${filename}`, { fileType });
      const creationEvent = fileType === "markdown" ? "markdown_created" : fileType === "canvas" ? "canvas_created" : fileType === "drawing" ? "drawing_created" : "asset_created";
      trackProductEvent(creationEvent, { cabinetId: isDemoWorkspace ? undefined : privateRepo?.id, metadata: { source: isDemoWorkspace ? "demo" : "workspace", artifactType: fileType, route: "/cabinet" } });
      setCreatingFile(false);
      setNewFileName("");
      selectNote(id);
    } catch (error) {
      toast({ title: t("workspace.createFileFailed", { fileType: t(`repo.${fileType}`) }), description: localizedRepositoryError(error), variant: "destructive" });
    }
  };

  const createFromTemplate = (template: WorkspaceTemplate) => {
    if (!managedFileTypes.includes(template.fileType)) {
      setShowSettings(true);
      return;
    }
    const extension = fileTypeExtension(template.fileType);
    const date = new Date().toISOString().slice(0, 10);
    const stem = `template-${template.id.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "note"}-${date}`;
    const existing = new Set(notes.filter((note) => note.path === effectiveCreationPath).map((note) => note.filename.toLocaleLowerCase()));
    let filename = `${stem}${extension}`;
    let counter = 2;
    while (existing.has(filename.toLocaleLowerCase())) {
      filename = `${stem}-${counter}${extension}`;
      counter += 1;
    }
    handleCreateFile(effectiveCreationPath, template.fileType, filename, template.content);
  };

  const saveActiveAsTemplate = () => {
    if (!activeNote || activeNote.fileType !== "markdown" || !isMarkdownPath(activeNote.filename) || !activeNote.content.trim()) {
      toast({ title: t("workspace.nothingToSaveAsTemplate"), description: t("workspace.openMarkdownToTemplate"), variant: "destructive" });
      return;
    }
    try {
      const template = saveUserTemplate({ name: `${activeNote.filename} template`, fileType: "markdown", content: activeNote.content });
      setAvailableTemplates((current) => [...current, template]);
      toast({ title: t("workspace.templateSaved"), description: t("workspace.templateSavedDescription") });
    } catch (error) {
      toast({ title: t("workspace.templateLimitReached"), description: t("workspace.templateLimit"), variant: "destructive" });
    }
  };

  const openSearchResult = (result: import("@shared/schema").SearchResult) => {
    if (!result.fileId) return;
    selectNote(result.fileId);
    if (result.line) setOutlineJump({ fileId: result.fileId, line: result.line, nonce: Date.now() });
  };

  const saveQuickCapture = () => {
    if (structuralReadOnly || !quickCaptureText.trim()) return;
    const scope = selectedScopes.includes("/") ? "/" : selectedScopes[0];
    if (!scope) {
      toast({ title: t("workspace.quickCaptureUnavailable"), description: t("workspace.chooseCaptureFolder"), variant: "destructive" });
      return;
    }
    const directory = quickCaptureDirectory(scope);
    const filename = quickCaptureFilename(new Date(), notes.filter((note) => note.path === directory).map((note) => note.filename));
    const template = availableTemplates.find((candidate) => candidate.id === quickCaptureTemplateId);
    const content = template && template.id !== "blank-note"
      ? `${template.content.trim()}\n\n## ${t("workspace.capturedThoughtHeading")}\n\n${quickCaptureText.trim()}\n`
      : quickCaptureContent(quickCaptureText, quickCaptureTitle.trim() || t("workspace.quickNoteDefault"));
    handleCreateFile(directory, "markdown", filename, content);
    setQuickCaptureText("");
    setQuickCaptureTitle("");
    setQuickCaptureTemplateId("blank-note");
    setShowQuickCapture(false);
  };

  const isFavoriteNote = (note: WorkspaceNote) => workingSet.some((item) => item.id === (note.artifactId || note.id) || item.path === fullNotePath(note));

  const toggleFavoriteNote = (note: WorkspaceNote) => {
    if (!privateRepo) return;
    const next = toggleWorkingSetItem(privateRepo.id, {
      id: note.artifactId || note.id,
      path: fullNotePath(note),
      fileType: note.fileType,
      label: note.filename,
    }, profile?.id || "anonymous");
    setWorkingSet(next);
  };

  const toggleActiveWorkingSet = () => {
    if (!awarenessNote) return;
    toggleFavoriteNote(awarenessNote);
  };

  const markReturnContextSeen = () => {
    if (!privateRepo || !returnContextSnapshotRef.current) return;
    window.localStorage.setItem(`marktwin-return-context:${privateRepo.id}`, JSON.stringify(returnContextSnapshotRef.current));
    setReturnContextEntries([]);
    setShowReturnContext(false);
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (structuralReadOnly) {
      event.target.value = "";
      return;
    }
    const files = Array.from(event.target.files || []);
    for (const file of files) {
      try {
        const fileType = workspaceFileTypeForPath(file.name);
        if (!fileType || !managedFileTypes.includes(fileType)) throw new Error(t("workspace.fileTypeDisabled"));
        const isBinary = fileType === "image" || fileType === "asset";
        if (isBinary) {
          if ((fileType === "image" ? !isSupportedImageFile(file) : !isSupportedWorkspaceAsset(file)) || (fileType === "asset" && !assetMimeTypeForFile(file))) throw new Error(t("workspace.assetTypeUnsupported"));
          if (file.size > MAX_WORKSPACE_ASSET_BYTES) throw new Error(t("workspace.assetTooLarge"));
        }
        handleCreateFile(effectiveCreationPath, fileType, file.name, isBinary ? await fileToBase64(file) : await file.text(), isBinary ? "base64" : "utf8");
      } catch (error) {
        toast({ title: t("workspace.importFailed", { filename: file.name }), description: localizedRepositoryError(error), variant: "destructive" });
      }
    }
    event.target.value = "";
  };

  const handleCreateFolder = (parentPath: string, name: string) => {
    if (structuralReadOnly) return;
    try {
      const path = joinFolderPath(parentPath, name);
      if (!selectedScopes.some((scope) => pathBelongsToScope(`${path}/.gitkeep`, scope))) {
        throw new Error(t("workspace.folderOutsideScopes"));
      }
      createFolder(vaultYdoc, path);
      const scopeToSelect = scopeToSelectForCreatedFolder(path, selectedScopes);
      if (scopeToSelect) {
        persistScopes(Array.from(new Set([...selectedScopes, scopeToSelect])));
      }
      recordActivity("folder.created", undefined, path);
    } catch (error) {
      toast({ title: t("workspace.createFolderFailed"), description: localizedRepositoryError(error), variant: "destructive" });
    }
  };

  const submitToolbarFolder = () => {
    const name = newFolderNameFromToolbar.trim();
    if (!name) return;
    handleCreateFolder(effectiveCreationPath, name);
    setNewFolderNameFromToolbar("");
    setCreatingFolderFromToolbar(false);
  };

  const handleMoveFolder = (sourcePath: string, destinationPath: string) => {
    if (structuralReadOnly) return;
    try {
      const name = sourcePath.split("/").pop() || sourcePath;
      const targetPath = joinFolderPath(destinationPath, name);
      if (!selectedScopes.some((scope) => pathBelongsToScope(`${targetPath}/.gitkeep`, scope))) {
        throw new Error(t("workspace.moveFolderOutsideScopes"));
      }
      moveFolder(vaultYdoc, sourcePath, targetPath);
      recordActivity("folder.moved", undefined, targetPath, { sourcePath, targetPath });
    } catch (error) {
      toast({ title: t("workspace.moveFolderFailed"), description: localizedRepositoryError(error), variant: "destructive" });
    }
  };

  const requestMoveFolder = (sourcePath: string, destinationPath: string) => {
    if (structuralReadOnly) return;
    try {
      const name = sourcePath.split("/").pop() || sourcePath;
      const targetPath = joinFolderPath(destinationPath, name);
      setPendingMove({
        sourcePath,
        targetPath,
        count: folderManagedFileCount(vaultYdoc, sourcePath),
      });
    } catch (error) {
      toast({ title: t("workspace.moveFolderFailed"), description: localizedRepositoryError(error), variant: "destructive" });
    }
  };

  const startSharing = async (rotate = false, transport: CollaborationTransport = collaborationTransport) => {
    if (isReadOnlyDemo) return;
    const previousSession = ownerSessionRef.current;
    const previousSessionState = sessionState;
    if (previousSession && !rotate) {
      setShowCollabDialog(true);
      return;
    }
    let replacementSession: OwnerCollaboration | null = null;
    try {
      setShowShareProgress(true);
      if (!previousSession) {
        setCollabSession(null);
        setPeerCount(0);
      }
      const session = await replaceOwnerCollaboration(previousSession, () => startOwnerCollaboration(
        vaultYdoc,
        vaultAwareness,
        () => setPeerCount(ownerSessionRef.current?.peerCount() || 0),
        {
          transport,
          control: {
            selectedScopes,
            selectedFileTypes: managedFileTypes,
            syncing: syncingRef.current,
            workspaceName: vault?.name || "Marktwin workspace",
          },
          onChat: appendChatMessage,
          onStatus: setSessionState,
          onTransportChange: setCollaborationTransport,
          initialChatMessages: chatMessages,
          onImageRequest: loadManagedImage,
          onRelayFallbackNeeded: requestRelayFallback,
        },
      ));
      replacementSession = session;
      ownerSessionRef.current = session;
      setCollabSession(session);
      setCollaborationTransport(session.transportMode());
      setPeerCount(session.peerCount());
      setShowCollabDialog(true);
      if (!rotate) trackProductEvent("collaborator_invited", { cabinetId: isDemoWorkspace ? undefined : privateRepo?.id, metadata: { source: "workspace", route: "/cabinet" } });
      if (rotate) {
        toast({
          title: t("workspace.linksRotated"),
          description: t("workspace.linksRotatedDescription"),
        });
      }
    } catch (error) {
      replacementSession?.stop(false);
      setSessionState(previousSession ? previousSessionState : "offline");
      const secureContextError = error instanceof Error && error.message === PRIVATE_COLLABORATION_SECURE_CONTEXT_ERROR;
      toast({
        title: secureContextError
          ? t("workspace.secureContextRequiredTitle")
          : rotate ? t("workspace.rotateLinksFailed") : t("workspace.startSharingFailed"),
        description: rotate && previousSession
          ? t("workspace.existingLinksStillActive", { error: localizedRepositoryError(error) })
          : localizedRepositoryError(error),
        variant: "destructive",
        ...(secureContextError && !insecureCollaborationTestMode ? {
          action: (
            <ToastAction
              altText={t("workspace.continueInHttpTestMode")}
              onClick={() => {
                enableInsecureCollaborationTestMode();
                setInsecureCollaborationTestMode(true);
                void startSharing(rotate, transport);
              }}
            >
              {t("workspace.continueInHttpTestMode")}
            </ToastAction>
          ),
        } : {}),
      });
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
    trackProductEvent("chat_message_sent", { cabinetId: isDemoWorkspace ? undefined : privateRepo?.id, metadata: { source: "chat", route: isJoinRoute ? "/join" : "/cabinet" } });
    if (isJoinRoute) {
      appendChatMessage(message);
      joinSessionRef.current?.sendChat(message);
      return;
    }
    if (ownerSessionRef.current) ownerSessionRef.current.sendChat(message);
    else appendChatMessage(message);
  };

  const discardOneChange = (change: WorkspaceChange) => {
    try {
      discardWorkspaceChange(vaultYdoc, change, baselineRef.current);
    } catch (error) {
      toast({ title: t("workspace.discardChangeFailed"), description: localizedRepositoryError(error), variant: "destructive" });
    }
  };

  const openRemoteInsteadOfRecovery = async () => {
    if (!pendingRecovery || !privateRepo) return;
    try {
      hydrateSelectedScopes(new Y.Doc(), pendingRecovery.content);
      await clearWorkspaceRecovery(privateRepo.id, privateRepo.repoFullName, workingBranch);
      hydrateSelectedScopes(vaultYdoc, pendingRecovery.content);
      baselineRef.current = pendingRecovery.content;
      setBaseCommitSha(pendingRecovery.root.commitSha);
      setBaseTreeSha(pendingRecovery.root.treeSha);
      persistScopes(pendingRecovery.scopes);
      setPendingRecovery(null);
      setCabinetReady(true);
      toast({ title: t("workspace.githubVersionOpened"), description: t("workspace.oldRecoveryRemoved") });
    } catch (error) {
      toast({ title: t("workspace.recoveryCleanupFailed"), description: localizedRepositoryError(error), variant: "destructive" });
    }
  };

  const removeAllRecoveryCopies = async () => {
    try {
      await clearAllWorkspaceRecovery();
      setLocalSavedAt(null);
      toast({ title: t("workspace.localCopiesRemoved"), description: t("workspace.localCopiesRemovedDescription") });
    } catch (error) {
      toast({ title: t("workspace.recoveryCleanupFailed"), description: localizedRepositoryError(error), variant: "destructive" });
    }
  };

  const recoverLocalDraft = () => {
    if (!pendingRecovery) return;
    if (!privateRepo) return;
    applyWorkspaceRecovery(vaultYdoc, pendingRecovery.record, {
      repoId: privateRepo.id,
      repoFullName: privateRepo.repoFullName,
      branch: workingBranch,
    });
    baselineRef.current = pendingRecovery.record.baseline;
    setBaseCommitSha(pendingRecovery.record.baseCommitSha);
    setBaseTreeSha(pendingRecovery.record.baseTreeSha);
    persistScopes(pendingRecovery.record.selectedScopes);
    setLocalSavedAt(pendingRecovery.record.updatedAt);
    setPendingRecovery(null);
    setCabinetReady(true);
    toast({ title: t("workspace.localDraftRecovered"), description: t("workspace.recoveryWillBranch") });
  };

  const activeNote = notes.find((note) => note.id === activeNoteId);
  const autoSyncMergeProblem = Boolean(privateRepo?.autoSync && pendingMerge);
  const publishState = syncControlState({
    unpublishedCount: workspaceChanges.length,
    publishing: syncing,
    error: syncError || autoSyncMergeProblem,
  });
  const githubStatusClassName = publishState === "error"
    ? "text-red-500"
    : publishState === "unpublished"
      ? "text-amber-400"
      : "text-[hsl(var(--obsidian-text-muted))]";
  const githubStatusLabel = publishState === "error"
    ? t("workspace.syncFailed")
    : publishState === "unpublished"
      ? t("workspace.unsynced")
      : t("workspace.synced");
  if (joinError) {
    return (
      <div className="min-h-screen bg-[hsl(var(--obsidian-bg))] flex items-center justify-center p-4">
        <Card className="max-w-md bg-[hsl(var(--obsidian-panel))] border-[hsl(var(--obsidian-border))]">
          <CardHeader><CardTitle className="text-red-300">{t("workspace.cannotJoin")}</CardTitle></CardHeader>
          <CardContent className="select-text text-sm text-muted-foreground" role="alert" aria-live="assertive">{joinError}</CardContent>
        </Card>
      </div>
    );
  }

  if (!isJoinRoute && !isDemoWorkspace && !reposLoading && !credentialResolving && (!privateRepo || !githubToken)) {
    return (
      <div className="min-h-screen bg-[hsl(var(--obsidian-bg))] flex items-center justify-center p-4">
        <Card className="max-w-md bg-[hsl(var(--obsidian-panel))] border-[hsl(var(--obsidian-border))]">
          <CardHeader><CardTitle>{t("workspace.accessRequired")}</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>{t("workspace.openFromCabinets")}</p>
            <Button onClick={() => setLocation(cabinetsReturnPath)}>{t("workspace.backToCabinets")}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div data-workspace-focus={focusMode ? "true" : "false"} className="workspace-mobile-shell relative flex h-screen overflow-hidden bg-[hsl(var(--obsidian-bg))] text-[hsl(var(--obsidian-text))]">
      {focusMode && (
        <div className="group absolute right-3 top-3 z-[70] flex items-center gap-2 rounded-full border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg)/0.84)] px-2 py-1 opacity-20 shadow-xs backdrop-blur transition-opacity hover:opacity-100 focus-within:opacity-100">
          <span className="max-w-52 truncate pl-2 text-xs text-[hsl(var(--obsidian-text-muted))]">{activeNote?.filename || t("nav.document")}</span>
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 rounded-full p-0" onClick={() => setFocusMode(false)} aria-label={t("workspace.exitFocusMode")} title={t("workspace.exitFocusMode")}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      {!focusMode && !sidebarCollapsed && (
        <aside
          className={`${mobilePanel === "files" ? "flex" : "hidden"} absolute inset-0 z-20 min-h-0 w-full flex-shrink-0 flex-col bg-[hsl(var(--obsidian-sidebar))] sm:relative sm:z-auto sm:flex sm:w-[var(--file-explorer-width)]`}
          style={{ "--file-explorer-width": `${sidebarWidth}px` } as React.CSSProperties}
        >
          <div className="p-3 sm:p-4" data-testid="workspace-sidebar-header">
            <div className="flex items-center gap-1">
              {!isJoinRoute && (
                <Button size="sm" variant="ghost" className="workspace-touch-control h-9 w-9 p-1" onClick={() => setLocation(cabinetsReturnPath)} aria-label={t("workspace.backToCabinets")}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}
              <div className="min-w-0 flex-1 px-1">
                <p className="truncate text-sm font-medium text-[hsl(var(--obsidian-text))]">{vault?.name}</p>
                {!isJoinRoute && <p className="truncate text-[10px] text-[hsl(var(--obsidian-text-muted))]">{githubStatusLabel}</p>}
              </div>
              <div className="flex items-center gap-0.5">
                {!isJoinRoute && !isReadOnlyDemo && !isDemoWorkspace && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="workspace-touch-control group h-9 w-9 p-1"
                    onClick={requestSync}
                    disabled={syncing || loadingCabinet || (!isDemoWorkspace && workspaceChanges.length === 0)}
                    title={isDemoWorkspace ? t("workspace.reviewDemoChanges") : githubStatusLabel}
                    aria-label={isDemoWorkspace ? t("workspace.reviewDemoChanges") : githubStatusLabel}
                  >
                    {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className={`h-4 w-4 ${githubStatusClassName} group-hover:text-accent-foreground`} />}
                  </Button>
                )}
                {isDemoWorkspace && !isReadOnlyDemo && (
                  <Button size="sm" variant="ghost" className="workspace-touch-control group h-9 w-9 p-1" onClick={() => setConfirmResetDemo(true)} disabled={syncing || loadingCabinet} title={t("workspace.resetDemo")} aria-label={t("workspace.resetDemo")}>
                    <Github className="h-4 w-4 text-[hsl(var(--obsidian-text-muted))] group-hover:text-accent-foreground" />
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="workspace-touch-control h-9 w-9 p-1" onClick={() => setShowCommandPalette(true)} title={t("workspace.searchCabinet")} aria-label={t("workspace.searchCabinet")}>
                  <Search className="h-4 w-4" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" className="workspace-touch-control h-9 w-9 p-1" title={t("workspace.moreWorkspaceActions")} aria-label={t("workspace.moreWorkspaceActions")}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {!isJoinRoute && !isReadOnlyDemo && <DropdownMenuItem onSelect={() => void startSharing()} disabled={!authenticated || showShareProgress}><Share2 className="mr-2 h-4 w-4" />{collabSession ? t("workspace.sessionDetails") : t("workspace.startSharing")}</DropdownMenuItem>}
                    <DropdownMenuItem onSelect={() => setMultiViewOpen(true)}><LayoutGrid className="mr-2 h-4 w-4" />{t("workspace.openMultiView")}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setShowWorkingSet(true)}><Star className="mr-2 h-4 w-4" />{t("workspace.manageWorkingSet")}</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {activeNote && isMarkdownPath(activeNote.filename) && <PDFDownloadButton markdown={activeNote.content} title={activeNote.filename} />}
                    <DropdownMenuItem onSelect={() => setShowShortcuts(true)}><Keyboard className="mr-2 h-4 w-4" />{t("workspace.shortcuts")}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setShowSettings(true)}><Settings className="mr-2 h-4 w-4" />{isJoinRoute || isDemoWorkspace ? t("workspace.appearance") : t("workspace.settings")}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            {isJoinRoute && <p className="text-xs text-muted-foreground mt-2">{t(`collab.joinStatus.${joinStatus}`)}</p>}
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
          <section
            className={editorPreferences.filesCollapsed ? "h-10 flex-none overflow-hidden" : "flex min-h-[160px] flex-1 flex-col overflow-hidden"}
            aria-label={t("workspace.panels")}
          >
            <div className="flex h-10 flex-none items-center gap-1 px-4" data-testid="workspace-files-header">
              <button
                type="button"
                className="mr-auto flex min-w-0 items-center gap-2 text-sm font-semibold text-[hsl(var(--primary))]"
                onClick={() => updateEditorPreferences({ filesCollapsed: !editorPreferences.filesCollapsed })}
                aria-expanded={!editorPreferences.filesCollapsed}
              >
                {editorPreferences.filesCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {t("workspace.files")}
              </button>
              {!structuralReadOnly && selectedScopes.length > 0 && (
                <div className="flex items-center gap-1">
                  <input ref={importInputRef} type="file" accept=".md,.canvas,.excalidraw,text/markdown,application/json,image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip" multiple className="hidden" onChange={(event) => void handleImport(event)} />
                  <Button size="sm" variant="ghost" className="workspace-touch-control h-9 w-9 p-1" onClick={() => importInputRef.current?.click()} title={t("workspace.importFiles", { path: effectiveCreationPath })} aria-label={t("workspace.importFiles", { path: effectiveCreationPath })}>
                    <Upload className="h-4 w-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" className="workspace-touch-control h-9 w-9 p-1" title={t("workspace.createIn", { path: effectiveCreationPath })} aria-label={t("workspace.createIn", { path: effectiveCreationPath })}>
                        <FilePlus className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-72">
                      <DropdownMenuLabel>{t("workspace.create")}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {(["markdown", "canvas", "drawing"] as WorkspaceFileType[]).map((fileType) => {
                        const enabled = managedFileTypes.includes(fileType);
                        const label = fileType === "canvas" ? t("repo.canvas") : fileTypeLabel(fileType);
                        return <DropdownMenuItem key={fileType} onSelect={() => enabled ? handleCreateFile(effectiveCreationPath, fileType) : setShowSettings(true)} className={!enabled ? "text-muted-foreground" : undefined}>
                          {fileType === "canvas" ? <LayoutDashboard className="mr-2 h-4 w-4 text-violet-400" /> : fileType === "drawing" ? <PenTool className="mr-2 h-4 w-4 text-amber-400" /> : <FileText className="mr-2 h-4 w-4 text-blue-400" />}
                          <span className="flex-1">{enabled ? t("workspace.newFile", { fileType: label }) : t("workspace.enableInSettings", { fileType: label })}</span>
                        </DropdownMenuItem>;
                      })}
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>{t("workspace.templates")}</DropdownMenuLabel>
                      {availableTemplates.map((template) => <DropdownMenuItem key={template.id} onSelect={() => createFromTemplate(template)} disabled={!managedFileTypes.includes(template.fileType)}>
                        <Wand2 className="mr-2 h-4 w-4 text-emerald-400" />
                        <span className="flex-1">{template.name}</span>
                        {template.userSaved && <span className="text-[10px] text-muted-foreground">{t("workspace.saved")}</span>}
                      </DropdownMenuItem>)}
                      {activeNote?.fileType === "markdown" && isMarkdownPath(activeNote.filename) && <DropdownMenuItem onSelect={saveActiveAsTemplate}><Wand2 className="mr-2 h-4 w-4 text-amber-400" />{t("workspace.saveCurrentTemplate")}</DropdownMenuItem>}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => { setNewFolderNameFromToolbar(""); setCreatingFolderFromToolbar(true); }}>
                        <FolderPlus className="mr-2 h-4 w-4 text-[hsl(var(--folder-icon))]" />
                        {t("workspace.newFolder")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>

            {!editorPreferences.filesCollapsed && <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            {creatingFolderFromToolbar && (
              <form className="mb-3 space-y-3 rounded-xl border border-[hsl(var(--obsidian-accent)/0.5)] bg-[hsl(var(--obsidian-panel))] p-3 shadow-xs" onSubmit={(event) => { event.preventDefault(); submitToolbarFolder(); }}>
                <div className="flex items-center gap-2 text-sm font-semibold"><FolderPlus className="h-4 w-4 text-[hsl(var(--folder-icon))]" />{t("workspace.newFolder")}</div>
                <label htmlFor="new-toolbar-folder-destination" className="block space-y-1 text-xs font-medium text-[hsl(var(--obsidian-text-muted))]">
                  <span>{t("workspace.destination")}</span>
                  <select id="new-toolbar-folder-destination" value={effectiveCreationPath} onChange={(event) => setCreationPath(event.target.value)} className="w-full rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg))] px-3 py-2 text-sm text-[hsl(var(--obsidian-text))] outline-hidden focus:border-[hsl(var(--obsidian-accent))] focus:ring-2 focus:ring-[hsl(var(--obsidian-accent)/0.2)]">
                    {creationFolders.map((path) => <option key={path} value={path}>{path === "/" ? t("workspace.root") : path.replace(/\/$/, "")}</option>)}
                  </select>
                </label>
                <label htmlFor="new-toolbar-folder-name" className="block space-y-1 text-xs font-medium text-[hsl(var(--obsidian-text-muted))]"><span>{t("workspace.folderName")}</span><input id="new-toolbar-folder-name" autoFocus value={newFolderNameFromToolbar} onChange={(event) => setNewFolderNameFromToolbar(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setCreatingFolderFromToolbar(false); }} className="w-full rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg))] px-3 py-2 text-sm text-[hsl(var(--obsidian-text))] outline-hidden focus:border-[hsl(var(--obsidian-accent))] focus:ring-2 focus:ring-[hsl(var(--obsidian-accent)/0.2)]" placeholder={t("workspace.folderName")} /></label>
                <div className="flex justify-end gap-2"><Button type="button" size="sm" variant="ghost" onClick={() => setCreatingFolderFromToolbar(false)}>{t("common.cancel")}</Button><Button type="submit" size="sm" disabled={!newFolderNameFromToolbar.trim()}>{t("common.create")}</Button></div>
              </form>
            )}

            {loadingCabinet ? (
              <div className="py-10 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground"><span className="flex items-center"><Loader2 className="h-4 w-4 animate-spin mr-2" />{t("workspace.loadingScope", { scope: loadProgress?.scope || t("repo.folders") })}</span>{loadProgress && loadProgress.total > 0 && <span className="text-xs">{t("workspace.managedFilesProgress", { completed: loadProgress.completed, total: loadProgress.total })}</span>}<Button size="sm" variant="ghost" onClick={() => loadAbortRef.current?.abort()}>{t("common.cancel")}</Button></div>
            ) : !selectedScopes.some((scope) => scope === "/" || scope.trim().length > 0) && !isJoinRoute ? (
              <div className="rounded-md border border-dashed border-[hsl(var(--obsidian-border))] p-4 text-sm text-muted-foreground">
                <FileText className="h-6 w-6 mb-2 opacity-60" />
                {t("workspace.noFoldersConfigured")}
              </div>
            ) : (
              <FileExplorer
                notes={notes}
                emptyFolders={emptyFolders}
                activeNoteId={activeNoteId}
                activeNote={activeNote}
                showFiguresFolder={editorPreferences.showFiguresFolder}
                onNoteSelect={selectNote}
                onCreateFile={(path, fileType, filename) => handleCreateFile(path || defaultCreationPath, fileType, filename)}
                enabledFileTypes={managedFileTypes}
                defaultCreatePath={effectiveCreationPath}
                onCreatePathSelect={setCreationPath}
                onManageFileTypes={() => setShowSettings(true)}
                onMoveNote={(id, path) => {
                  try {
                    const moving = notes.find((candidate) => candidate.id === id);
                    const destination = moving ? `${normalizeDirectoryPath(path) === "/" ? "" : normalizeDirectoryPath(path)}${moving.filename}` : "";
                    if (!moving || !selectedScopes.some((scope) => pathBelongsToScope(destination, scope))) throw new Error(t("workspace.moveFileOutsideScopes"));
                    const oldPath = moving ? fullNotePath(moving) : destination;
                    moveNote(vaultYdoc, id, path);
                    updateArtifactReferences(vaultYdoc, moving?.artifactId || id, oldPath, destination);
                    recordActivity("file.moved", id, destination, { targetPath: destination });
                  }
                  catch (error) { toast({ title: t("workspace.moveFileFailed"), description: localizedRepositoryError(error), variant: "destructive" }); }
                }}
                creatingFile={creatingFile}
                creatingFileType={creatingFileType}
                newFileName={newFileName}
                newFilePath={newFilePath}
                setNewFileName={setNewFileName}
                setNewFilePath={setNewFilePath}
                creationPaths={creationFolders}
                handleNewFileCancel={() => { setCreatingFile(false); setNewFileName(""); }}
                onCreateFolder={handleCreateFolder}
                onMoveFolder={requestMoveFolder}
                onDeleteFolder={(path) => setPendingDelete({ kind: "folder", path, label: path, count: folderManagedFileCount(vaultYdoc, path) })}
                onRenameNote={(id, name) => {
                  try {
                    const current = notes.find((candidate) => candidate.id === id);
                    const oldPath = current ? fullNotePath(current) : name;
                    renameNote(vaultYdoc, id, name);
                    const next = readCabinetNotes(vaultYdoc).find((candidate) => candidate.id === id);
                    updateArtifactReferences(vaultYdoc, current?.artifactId || id, oldPath, next ? fullNotePath(next) : name);
                    recordActivity("file.renamed", id, name, { targetPath: name });
                  }
                  catch (error) { toast({ title: t("workspace.renameFileFailed"), description: localizedRepositoryError(error), variant: "destructive" }); }
                }}
                onDeleteNote={(id) => {
                  const note = notes.find((candidate) => candidate.id === id);
                  if (note) setPendingDelete({ kind: "file", id, label: fullNotePath(note), count: 1 });
                }}
                onDuplicateNote={(note) => {
                  const extension = note.fileType === "image" || note.fileType === "asset" ? (note.filename.match(/\.[^./]+$/)?.[0] || ".bin") : fileTypeExtension(note.fileType);
                  const base = note.filename.slice(0, -extension.length);
                  const existing = new Set(
                    notes
                      .filter((candidate) => candidate.path === note.path)
                      .map((candidate) => candidate.filename.toLowerCase()),
                  );
                  let suffix = "-copy";
                  let counter = 2;
                  while (existing.has(`${base}${suffix}${extension}`.toLowerCase())) {
                    suffix = `-copy-${counter}`;
                    counter += 1;
                  }
                  handleCreateFile(note.path, note.fileType, `${base}${suffix}${extension}`, note.content, note.contentEncoding);
                }}
                onOpenBeside={(note) => {
                  setSplitViewNoteId(note.id);
                  setActiveEditorPane("split");
                  setMobilePanel("document");
                }}
                isFavorite={isFavoriteNote}
                onToggleFavorite={!isJoinRoute && !isReadOnlyDemo ? toggleFavoriteNote : undefined}
                isMovingFolder={false}
                isCreatingFolder={false}
                readOnly={structuralReadOnly}
              />
            )}
            </div>}
          </section>
          {!editorPreferences.filesCollapsed && !editorPreferences.outlineCollapsed && (!activeNote || isMarkdownPath(activeNote.filename)) && (
            <div
              className="group flex h-2 flex-none cursor-row-resize items-center justify-center bg-transparent outline-hidden"
              role="separator"
              aria-label={t("workspace.resizeFilesOutline")}
              aria-orientation="horizontal"
              tabIndex={0}
              onPointerDown={startOutlineResize}
              onKeyDown={resizeOutlineWithKeyboard}
            >
              <span className="h-0.5 w-12 rounded-full bg-[hsl(var(--obsidian-accent))] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
            </div>
          )}
          <div
            className={`${editorPreferences.filesCollapsed && !editorPreferences.outlineCollapsed && (!activeNote || isMarkdownPath(activeNote.filename)) ? "min-h-10 flex-1" : "min-h-10 flex-none"} overflow-hidden`}
            style={editorPreferences.filesCollapsed && !editorPreferences.outlineCollapsed && (!activeNote || isMarkdownPath(activeNote.filename))
              ? undefined
              : { height: editorPreferences.outlineCollapsed || (activeNote && !isMarkdownPath(activeNote.filename)) ? 40 : editorPreferences.outlineHeight }}
          >
            <WorkspaceOutline
              note={activeNote}
              collapsed={editorPreferences.outlineCollapsed || Boolean(activeNote && !isMarkdownPath(activeNote.filename))}
              onCollapsedChange={(outlineCollapsed) => {
                if (!activeNote || isMarkdownPath(activeNote.filename)) updateEditorPreferences({ outlineCollapsed });
              }}
              onSelect={(line) => {
                if (!activeNote || !isMarkdownPath(activeNote.filename)) return;
                if (modeForFile(activeNote.id) === "preview") setFileEditorMode(activeNote.id, editorPreferences.defaultMarkdownMode);
                setOutlineJump({ fileId: activeNote.id, line, nonce: Date.now() });
                setMobilePanel("document");
              }}
            />
          </div>
          </div>
        </aside>
      )}

      {!focusMode && !sidebarCollapsed && (
        <SidebarResizer
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
          onCollapse={() => setSidebarCollapsed(true)}
          label="Resize workspace file explorer"
        />
      )}

      <main
        className={`${mobilePanel === "document" ? "flex" : "hidden"} ${rightPanel && !focusMode ? "workspace-main-with-chat" : ""} min-w-0 flex-1 flex-col sm:flex`}
        style={{ "--workspace-chat-width": `${visibleChatWidth}px` } as React.CSSProperties}
      >
        {!focusMode && <div className="flex h-12 items-center bg-[hsl(var(--obsidian-sidebar))]" data-testid="workspace-document-header">
          {sidebarCollapsed && (
            <Button variant="ghost" size="sm" className="mx-1 hidden h-9 w-9 p-0 sm:inline-flex" onClick={() => { setSidebarCollapsed(false); if (viewportWidth < 1024) setRightPanel(null); }} title={t("workspace.files")} aria-label={t("workspace.files")}>
              <PanelLeftOpen className="h-4 w-4" />
            </Button>
          )}
          {!sidebarCollapsed && (
            <Button variant="ghost" size="sm" className="mx-1 hidden h-9 w-9 p-0 sm:inline-flex" onClick={() => setSidebarCollapsed(true)} title={t("workspace.files")} aria-label={t("workspace.files")}>
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          )}
          <div className="flex-1 flex items-center overflow-x-auto" role="tablist" aria-label={t("workspace.openDocuments")}>
            {openTabs.map((id) => {
              const note = notes.find((candidate) => candidate.id === id);
              if (!note) return null;
              const active = activeTabId === id;
              return (
                <div key={id} className={`mr-1 flex h-12 flex-none items-center border-b-2 ${active ? "border-accent" : "border-transparent"}`}>
                  <button
                    type="button"
                    id={workspaceTabId(id)}
                    role="tab"
                    aria-selected={active}
                    aria-controls="workspace-active-editor"
                    tabIndex={active ? 0 : -1}
                    className={`flex h-full min-w-0 items-center py-2 pl-3 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${active ? "font-semibold" : "font-normal"}`}
                    onClick={() => activateTab(id)}
                    onKeyDown={(event) => handleTabKeyDown(event, id)}
                  >
                    {note.fileType === "canvas" ? <LayoutDashboard className="mr-2 h-3 w-3 flex-none text-violet-400" /> : note.fileType === "drawing" ? <PenTool className="mr-2 h-3 w-3 flex-none text-amber-400" /> : note.fileType === "image" ? <FileImage className="mr-2 h-3 w-3 flex-none text-emerald-400" /> : note.fileType === "asset" ? <FileArchive className="mr-2 h-3 w-3 flex-none text-emerald-400" /> : <FileText className="mr-2 h-3 w-3 flex-none text-blue-400" />}
                    <span className="max-w-48 truncate text-sm">{note.filename}</span>
                  </button>
                  <button
                    type="button"
                    className="mx-1 flex h-9 w-9 flex-none items-center justify-center rounded-sm text-muted-foreground hover:bg-accent/10 hover:text-accent-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => closeTab(id)}
                    aria-label={t("workspace.closeFile", { filename: note.filename })}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2 px-3">
            <CollaborationIndicator awareness={vaultAwareness} myName={myUsername} onNameChange={setMyUsername} avatar={userAvatar.configured ? userAvatar : undefined} />
            {!isReadOnlyDemo && (
              <Button variant="ghost" size="sm" className="relative hidden h-9 w-9 p-0 sm:inline-flex" onClick={() => setShowChat((open) => !open)} aria-label={hasUnread ? t("workspace.toggleChatUnread") : t("workspace.toggleChat")} title={t("nav.chat")}>
                <MessageSquare className="!h-5 !w-5" />
                {hasUnread && <span aria-hidden="true" className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[hsl(var(--obsidian-accent))] ring-1 ring-[hsl(var(--obsidian-bg))]" />}
              </Button>
            )}
            {!isJoinRoute && !isReadOnlyDemo && (
              <Button variant="ghost" size="sm" className={`hidden h-9 w-9 p-0 sm:inline-flex ${showHistory ? "bg-[hsl(var(--obsidian-panel))]" : ""}`} onClick={() => setRightPanel((panel) => panel === "history" ? null : "history")} aria-label={t("workspace.toggleHistory")} title={t("nav.history")}>
                <History className="!h-5 !w-5" />
              </Button>
            )}
          </div>
        </div>}

        {!focusMode && returnContextEntries.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-panel))] px-4 py-2 text-sm">
            <button type="button" className="font-semibold text-[hsl(var(--primary))]" onClick={() => setShowReturnContext(true)}>{t("workspace.whatChangedTitle")}</button>
            <span className="text-muted-foreground">{t("workspace.changeSummary", { count: returnContextEntries.length })}</span>
            <Button size="sm" variant="ghost" className="ml-auto h-8" onClick={markReturnContextSeen}>{t("workspace.markSeen")}</Button>
          </div>
        )}

        <div
          id="workspace-active-editor"
          className="flex-1 min-h-0"
          role="tabpanel"
          aria-labelledby={activeTabId ? workspaceTabId(activeTabId) : undefined}
        >
          {activeTabId || multiViewOpen ? (() => {
            const note = notes.find((candidate) => candidate.id === activeTabId);
            const splitNote = splitViewNoteId ? notes.find((candidate) => candidate.id === splitViewNoteId) : undefined;
            const availableEditorWidth = viewportWidth
              - (viewportWidth >= 640 && !focusMode && !sidebarCollapsed ? sidebarWidth + 6 : 0)
              - (viewportWidth >= 640 && !focusMode && rightPanel ? visibleChatWidth + 6 : 0);
            const stackSplitView = Boolean(splitNote) && (viewportWidth < 640 || availableEditorWidth < 760);
            const renderEditor = (editorNote: WorkspaceNote, split = false, compactEditor = false) => {
              const pane: WorkspaceEditorPane = split ? "split" : "primary";
              return (
                <WorkspaceFileEditor
                  file={editorNote}
                  files={notes}
                  mode={modeForFile(editorNote.id, pane)}
                  readOnly={editorReadOnly}
                  isSplitPane={split}
                  ydoc={vaultYdoc}
                  ytext={getFilesMap(vaultYdoc).get(editorNote.id)?.get("content") as Y.Text | undefined}
                  awareness={vaultAwareness}
                  jumpToLine={!split && outlineJump?.fileId === editorNote.id ? { line: outlineJump.line, nonce: outlineJump.nonce } : undefined}
                  resolveImage={(source) => resolveRepositoryImage(editorNote, source)}
                  onImageDrop={(file) => handleImageDrop(editorNote, file)}
                  onCanvasImageDrop={(file) => handleCanvasImageDrop(editorNote, file)}
                  onContentChange={(nextContent) => {
                    if (editorReadOnly) return;
                    setWorkspaceFileContent(vaultYdoc, editorNote.id, nextContent);
                    if (!editedArtifactsRef.current.has(editorNote.id) && nextContent.trim().length > 0) {
                      editedArtifactsRef.current.add(editorNote.id);
                      const eventName = editorNote.fileType === "markdown" ? "markdown_edited" : editorNote.fileType === "canvas" ? "canvas_edited" : editorNote.fileType === "drawing" ? "drawing_edited" : "asset_edited";
                      trackProductEvent(eventName, { cabinetId: isDemoWorkspace ? undefined : privateRepo?.id, metadata: { source: isDemoWorkspace ? "demo" : "workspace", artifactType: editorNote.fileType, route: isJoinRoute ? "/join" : "/cabinet" } });
                    }
                  }}
                  onOpenFile={selectNote}
                  onModeChange={(mode) => setFileEditorMode(editorNote.id, mode, pane)}
                  focusMode={focusMode}
                  onFocusModeChange={setFocusMode}
                  compact={compactEditor}
                  onSplitView={editorNote.fileType !== "markdown"
                    ? undefined
                    : split
                      ? () => setSplitViewNoteId(null)
                      : splitNote
                        ? undefined
                        : () => setSplitViewNoteId(editorNote.id)}
                />
              );
            };

            if (multiViewOpen) {
              return (
                <div className="flex h-full min-h-0 flex-col bg-[hsl(var(--obsidian-bg))]">
                  {!focusMode && <div className="flex h-11 flex-none items-center gap-2 border-b border-[hsl(var(--obsidian-border))] px-3">
                    <LayoutGrid className="h-4 w-4 text-[hsl(var(--obsidian-accent))]" />
                    <span className="text-sm font-medium">{t("workspace.multiView")}</span>
                    <span className="text-xs text-[hsl(var(--obsidian-text-muted))]">{t("workspace.multiViewCount", { count: workingSetNotes.length })}</span>
                    <Button type="button" variant="ghost" size="sm" className="ml-auto h-8" onClick={() => setShowWorkingSet(true)}>{t("workspace.manageWorkingSet")}</Button>
                    <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setMultiViewOpen(false)} aria-label={t("workspace.closeMultiView")} title={t("workspace.closeMultiView")}><X className="h-4 w-4" /></Button>
                  </div>}
                  {workingSetNotes.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center p-8 text-center">
                      <div className="max-w-sm">
                        <LayoutGrid className="mx-auto h-10 w-10 text-[hsl(var(--obsidian-text-muted))] opacity-45" />
                        <p className="mt-4 font-medium">{t("workspace.multiViewEmpty")}</p>
                        <p className="mt-1 text-sm text-[hsl(var(--obsidian-text-muted))]">{t("workspace.multiViewEmptyDescription")}</p>
                        <Button type="button" variant="outline" className="mt-4" onClick={() => setShowWorkingSet(true)}>{t("workspace.manageWorkingSet")}</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid min-h-0 flex-1 auto-rows-fr gap-3 overflow-auto p-3 md:grid-cols-2">
                      {workingSetNotes.map((workingNote) => {
                        const active = multiViewActiveId === workingNote.id;
                        const lightweightPreview = workingNote.fileType === "markdown" && isMarkdownPath(workingNote.filename)
                          ? <div className="h-full overflow-auto"><MarkdownPreview content={workingNote.content} repositorySha={workingNote.githubSha} resolveImage={(source) => resolveRepositoryImage(workingNote, source)} className="p-5" /></div>
                          : workingNote.fileType === "image" || workingNote.fileType === "asset"
                            ? <WorkspaceFileEditor file={workingNote} files={notes} mode="preview" readOnly onContentChange={() => {}} onOpenFile={selectNote} onModeChange={() => {}} />
                            : <button type="button" className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-[hsl(var(--obsidian-text-muted))]" onClick={() => setMultiViewActiveId(workingNote.id)}>{workingNote.fileType === "canvas" ? <LayoutDashboard className="h-10 w-10 text-violet-400/70" /> : <PenTool className="h-10 w-10 text-amber-400/70" />}<span className="text-sm">{t("workspace.activateToEdit")}</span></button>;
                        return (
                          <section key={workingNote.id} data-active={active ? "true" : "false"} className={cn("flex min-h-[320px] min-w-0 flex-col overflow-hidden rounded-2xl border bg-[hsl(var(--obsidian-bg))] transition-shadow", active ? "border-[hsl(var(--obsidian-accent)/0.45)] shadow-lg" : "border-[hsl(var(--obsidian-border))]")} aria-label={t("workspace.multiViewCard", { filename: workingNote.filename })}>
                            <div className="flex h-10 flex-none items-center gap-2 border-b border-[hsl(var(--obsidian-border))] px-3">
                              {workingNote.fileType === "canvas" ? <LayoutDashboard className="h-3.5 w-3.5 text-violet-400" /> : workingNote.fileType === "drawing" ? <PenTool className="h-3.5 w-3.5 text-amber-400" /> : workingNote.fileType === "image" || workingNote.fileType === "asset" ? <FileImage className="h-3.5 w-3.5 text-emerald-400" /> : <FileText className="h-3.5 w-3.5 text-[hsl(var(--obsidian-text-muted))]" />}
                              <button type="button" className="min-w-0 flex-1 truncate text-left text-xs font-medium" onClick={() => { setMultiViewActiveId(workingNote.id); setActiveNoteId(workingNote.id); }}>{workingNote.filename}</button>
                              {!active && <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setMultiViewActiveId(workingNote.id)}>{t("common.edit")}</Button>}
                              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => toggleFavoriteNote(workingNote)} aria-label={`${t("workspace.removeCurrent")} ${workingNote.filename}`} title={t("workspace.removeCurrent")}><X className="h-3.5 w-3.5" /></Button>
                            </div>
                            <div className="min-h-0 flex-1">{active ? renderEditor(workingNote, false, true) : lightweightPreview}</div>
                          </section>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            if (!note) return null;
            const activePaneNote = activeEditorPane === "split" && splitNote ? splitNote : note;
            return (
            <div className="flex h-full min-h-0 min-w-0 flex-col">
                {splitNote && !focusMode && <div className="flex h-10 flex-none items-center gap-1 border-b border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg))] px-2">
                  <span className="min-w-0 max-w-60 truncate px-2 text-xs text-[hsl(var(--obsidian-text-muted))]">{t("workspace.editingPane", { filename: activePaneNote.filename })}</span>
                  {activePaneNote.fileType === "markdown" && <>
                    <Button type="button" variant={modeForFile(activePaneNote.id, activeEditorPane) === "live" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0" onClick={() => setFileEditorMode(activePaneNote.id, "live", activeEditorPane)} aria-label={t("workspace.editorVisual")} title={t("workspace.editorVisual")}><PenLine className="h-4 w-4" /></Button>
                    <Button type="button" variant={modeForFile(activePaneNote.id, activeEditorPane) === "source" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0" onClick={() => setFileEditorMode(activePaneNote.id, "source", activeEditorPane)} aria-label={t("workspace.editorSource")} title={t("workspace.editorSource")}><Braces className="h-4 w-4" /></Button>
                    <Button type="button" variant={modeForFile(activePaneNote.id, activeEditorPane) === "preview" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0" onClick={() => setFileEditorMode(activePaneNote.id, "preview", activeEditorPane)} aria-label={t("workspace.editorPreview")} title={t("workspace.editorPreview")}><Eye className="h-4 w-4" /></Button>
                  </>}
                  <Button type="button" variant="ghost" size="sm" className="ml-auto h-8 w-8 p-0" onClick={() => setFocusMode(true)} aria-label={t("workspace.enterFocusMode")} title={t("workspace.enterFocusMode")}><Maximize2 className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setSplitViewNoteId(null)} aria-label={t("workspace.closeSplitView")} title={t("workspace.closeSplitView")}><Columns2 className="h-4 w-4" /></Button>
                </div>}
                {splitNote ? <PanelGroup direction={stackSplitView ? "vertical" : "horizontal"} autoSaveId={`marktwin-split-${stackSplitView ? "vertical" : "horizontal"}`} className="min-h-0 flex-1">
                  <Panel minSize={25} defaultSize={50}>
                    <section onPointerDown={() => setActiveEditorPane("primary")} onFocusCapture={() => setActiveEditorPane("primary")} onDragOver={handleAssetFileDragOver} onDrop={(event) => handleAssetFileDrop(event, note)} className={cn("flex h-full min-h-0 min-w-0 flex-col", activeEditorPane === "primary" && "bg-[hsl(var(--obsidian-panel)/0.12)]")} aria-label={`${note.filename} editor`}>
                      <div className="flex h-9 flex-none items-center border-b border-[hsl(var(--obsidian-border))] px-3 text-xs"><span className="truncate">{note.filename}</span><span className="ml-auto text-[10px] uppercase tracking-wide text-[hsl(var(--obsidian-text-muted))]">{activeEditorPane === "primary" ? t("workspace.activePane") : ""}</span></div>
                      <div className="min-h-0 flex-1">{renderEditor(note, false, true)}</div>
                    </section>
                  </Panel>
                  <PanelResizeHandle className={stackSplitView ? "workspace-split-resizer workspace-split-resizer--horizontal" : "workspace-split-resizer"} />
                  <Panel minSize={25} defaultSize={50}>
                    <section onPointerDown={() => setActiveEditorPane("split")} onFocusCapture={() => setActiveEditorPane("split")} onDragOver={handleAssetFileDragOver} onDrop={(event) => handleAssetFileDrop(event, splitNote)} className={cn("flex h-full min-h-0 min-w-0 flex-col", activeEditorPane === "split" && "bg-[hsl(var(--obsidian-panel)/0.12)]")} aria-label={`${splitNote.filename} editor`}>
                      <div className="flex h-9 flex-none items-center border-b border-[hsl(var(--obsidian-border))] px-3 text-xs"><span className="truncate">{splitNote.filename}</span><Button type="button" variant="ghost" size="sm" className="ml-auto h-7 w-7 p-0" onClick={() => setSplitViewNoteId(null)} aria-label={t("workspace.closeSplitView")}><X className="h-3.5 w-3.5" /></Button></div>
                      <div className="min-h-0 flex-1">{renderEditor(splitNote, true, true)}</div>
                    </section>
                  </Panel>
                </PanelGroup> : <section onDragOver={handleAssetFileDragOver} onDrop={(event) => handleAssetFileDrop(event, note)} className="h-full min-h-0 min-w-0" aria-label={`${note.filename} editor`}>{renderEditor(note)}</section>}
              </div>
            );
          })() : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-center">
              <div><FileText className="h-12 w-12 mx-auto mb-3 opacity-40" /><p>{t("workspace.selectArtifact")}</p></div>
            </div>
          )}
        </div>
      </main>

      {!focusMode && <nav className={`workspace-mobile-nav fixed inset-x-0 bottom-0 z-30 grid ${isReadOnlyDemo ? "grid-cols-2" : isJoinRoute ? "grid-cols-3" : "grid-cols-4"} border-t border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-sidebar))] sm:hidden`} aria-label={t("workspace.panels")}>
        <button type="button" className={`flex flex-col items-center justify-center text-xs ${mobilePanel === "files" && !rightPanel ? "text-[hsl(var(--obsidian-accent))]" : "text-muted-foreground"}`} onClick={() => { setSidebarCollapsed(false); setMobilePanel("files"); setRightPanel(null); }}><FolderOpen className="h-4 w-4" />{t("nav.files")}</button>
        <button type="button" className={`flex flex-col items-center justify-center text-xs ${mobilePanel === "document" && !rightPanel ? "text-[hsl(var(--obsidian-accent))]" : "text-muted-foreground"}`} onClick={() => { setMobilePanel("document"); setRightPanel(null); }}><FileText className="h-4 w-4" />{t("nav.document")}</button>
        {!isReadOnlyDemo && <button type="button" className={`flex flex-col items-center justify-center text-xs ${showChat ? "text-[hsl(var(--obsidian-accent))]" : "text-muted-foreground"}`} onClick={() => setShowChat(true)}><MessageSquare className="h-4 w-4" />{t("nav.chat")}</button>}
        {!isJoinRoute && !isReadOnlyDemo && <button type="button" className={`flex flex-col items-center justify-center text-xs ${showHistory ? "text-[hsl(var(--obsidian-accent))]" : "text-muted-foreground"}`} onClick={() => setRightPanel("history")}><History className="h-4 w-4" />{t("nav.history")}</button>}
      </nav>}

      <ChatPanel
        open={!focusMode && !isReadOnlyDemo && showChat}
        onOpenChange={setShowChat}
        width={visibleChatWidth}
        onWidthChange={(rightPanelWidth) => updateEditorPreferences({ rightPanelWidth })}
        messages={chatMessages}
        onSend={sendChatMessage}
        username={myUsername}
        userColor={myColor}
        userAvatar={userAvatar.configured ? userAvatar : undefined}
        awareness={vaultAwareness}
        clientId={chatClientId}
        anchor={activeNote ? { fileId: activeNote.id, filePath: fullNotePath(activeNote) } : undefined}
      />

      <CabinetCommandPalette
        open={showCommandPalette}
        onOpenChange={setShowCommandPalette}
        results={searchIndex}
        onOpenResult={openSearchResult}
        onCreateFile={(fileType) => handleCreateFile(effectiveCreationPath, fileType)}
        onQuickCapture={() => setShowQuickCapture(true)}
        onOpenSettings={() => setShowSettings(true)}
        onTogglePanel={(panel) => {
          if (panel === "backlinks") setShowBacklinks(true);
          else setRightPanel((current) => current === panel ? null : panel);
        }}
        onShowChanges={() => setShowReturnContext(true)}
        onToggleWorkingSet={() => setShowWorkingSet(true)}
      />

      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="sm:max-w-md bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5 text-[hsl(var(--primary))]" aria-hidden="true" />
              {t("workspace.shortcutsTitle")}
            </DialogTitle>
            <DialogDescription>{t("workspace.shortcutsDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2" aria-label={t("workspace.shortcutsTitle")}>
            <div className="flex items-center justify-between gap-4 rounded-lg bg-[hsl(var(--obsidian-panel))] px-3 py-2.5 text-sm">
              <span>{t("workspace.shortcutSearch")}</span>
              <kbd className="rounded border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg)/0.55)] px-2 py-1 text-xs text-[hsl(var(--obsidian-text-muted))]">⌘ K / Ctrl K</kbd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg bg-[hsl(var(--obsidian-panel))] px-3 py-2.5 text-sm">
              <span>{t("workspace.shortcutQuickCapture")}</span>
              <kbd className="rounded border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg)/0.55)] px-2 py-1 text-xs text-[hsl(var(--obsidian-text-muted))]">⌘ ⌥ N / Ctrl Alt N</kbd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg bg-[hsl(var(--obsidian-panel))] px-3 py-2.5 text-sm">
              <span>{t("workspace.shortcutFocus")}</span>
              <kbd className="rounded border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg)/0.55)] px-2 py-1 text-xs text-[hsl(var(--obsidian-text-muted))]">⌘ ⇧ F / Ctrl Shift F</kbd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg bg-[hsl(var(--obsidian-panel))] px-3 py-2.5 text-sm">
              <span>{t("workspace.shortcutSave")}</span>
              <kbd className="rounded border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg)/0.55)] px-2 py-1 text-xs text-[hsl(var(--obsidian-text-muted))]">⌘ S / Ctrl S</kbd>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showQuickCapture} onOpenChange={setShowQuickCapture}>
        <DialogContent className="sm:max-w-lg bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))]">
          <DialogHeader>
            <DialogTitle>{t("workspace.quickCaptureTitle")}</DialogTitle>
            <DialogDescription>{t("workspace.quickCaptureDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2"><Label htmlFor="quick-capture-title">{t("workspace.quickCaptureFieldTitle")}</Label><Input id="quick-capture-title" value={quickCaptureTitle} onChange={(event) => setQuickCaptureTitle(event.target.value)} placeholder={t("workspace.quickNoteDefault")} maxLength={120} /></div>
            <div className="space-y-2"><Label htmlFor="quick-capture-template">{t("workspace.quickCaptureTemplate")}</Label><select id="quick-capture-template" value={quickCaptureTemplateId} onChange={(event) => setQuickCaptureTemplateId(event.target.value)} className="w-full rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-panel))] p-2 text-sm">{availableTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></div>
            <div className="space-y-2"><Label htmlFor="quick-capture-text">{t("workspace.quickCaptureThought")}</Label><textarea id="quick-capture-text" autoFocus value={quickCaptureText} onChange={(event) => setQuickCaptureText(event.target.value)} placeholder={t("workspace.quickCapturePlaceholder")} className="min-h-32 w-full rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-panel))] p-3 text-sm outline-hidden focus:border-[hsl(var(--obsidian-accent))]" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowQuickCapture(false)}>{t("common.cancel")}</Button><Button onClick={saveQuickCapture} disabled={structuralReadOnly || !quickCaptureText.trim()}>{t("workspace.saveNote")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBacklinks} onOpenChange={setShowBacklinks}>
        <DialogContent className="sm:max-w-lg bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))]">
          <DialogHeader><DialogTitle>{t("workspace.backlinksTitle")}{awarenessNote ? `: ${awarenessNote.filename}` : ""}</DialogTitle><DialogDescription>{t("workspace.backlinksDescription")}</DialogDescription></DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {!awarenessNote || activeBacklinks.length === 0 ? <p className="text-sm text-muted-foreground">{t("workspace.noBacklinks")}</p> : activeBacklinks.map((relation) => (
              <button key={`${relation.source.id}:${relation.target.path}`} type="button" className="flex w-full items-start gap-3 rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-panel))] p-3 text-left hover:border-[hsl(var(--obsidian-accent))]" onClick={() => { if (relation.source.id) selectNote(relation.source.id); setShowBacklinks(false); }}>
                <FileText className="mt-0.5 h-4 w-4 flex-none text-blue-400" />
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{relation.source.label || relation.source.path}</span><span className="block truncate text-xs text-muted-foreground">{relation.source.path}</span></span>
              </button>
            ))}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowBacklinks(false)}>{t("common.close")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showWorkingSet} onOpenChange={setShowWorkingSet}>
        <DialogContent className="sm:max-w-lg bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))]">
          <DialogHeader><DialogTitle>{t("workspace.workingSetTitle")}</DialogTitle><DialogDescription>{t("workspace.workingSetDescription")}</DialogDescription></DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {workingSet.length === 0 ? <p className="text-sm text-muted-foreground">{t("workspace.workingSetEmpty")}</p> : workingSet.map((item) => (
              <div key={item.id || item.path} className="flex items-center gap-2 rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-panel))] p-2">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { const note = notes.find((candidate) => (candidate.artifactId || candidate.id) === item.id || fullNotePath(candidate) === item.path); if (note) selectNote(note.id); setShowWorkingSet(false); }}><span className="block truncate text-sm font-medium">{item.label || item.path}</span><span className="block truncate text-xs text-muted-foreground">{item.path}</span></button>
                <Button size="sm" variant="ghost" onClick={() => { if (!privateRepo) return; const next = workingSet.filter((candidate) => candidate.id !== item.id && candidate.path !== item.path); saveWorkingSet(privateRepo.id, next, profile?.id || "anonymous"); setWorkingSet(next); }} aria-label={`${t("workspace.removeCurrent")} ${item.label || item.path}`}>{t("common.remove")}</Button>
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2 sm:justify-between"><Button variant="ghost" onClick={() => { if (!privateRepo) return; saveWorkingSet(privateRepo.id, [], profile?.id || "anonymous"); setWorkingSet([]); }}>{t("common.clearAll")}</Button><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setShowWorkingSet(false)}>{t("common.close")}</Button><Button variant="outline" onClick={() => { setShowWorkingSet(false); setMultiViewOpen(true); }} disabled={workingSet.length === 0}><LayoutGrid className="mr-2 h-4 w-4" />{t("workspace.openMultiView")}</Button><Button onClick={toggleActiveWorkingSet} disabled={!awarenessNote || structuralReadOnly}>{awarenessNote && workingSet.some((item) => item.id === (awarenessNote.artifactId || awarenessNote.id)) ? t("workspace.removeCurrent") : t("workspace.addCurrent")}</Button></div></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showReturnContext} onOpenChange={setShowReturnContext}>
        <DialogContent className="sm:max-w-lg bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))]">
          <DialogHeader><DialogTitle>{t("workspace.whatChangedTitle")}</DialogTitle><DialogDescription>{t("workspace.whatChangedDescription")}</DialogDescription></DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {returnContextEntries.length === 0 ? <p className="text-sm text-muted-foreground">{t("workspace.nothingNew")}</p> : returnContextEntries.map((entry) => {
              const note = entry.path ? notes.find((candidate) => fullNotePath(candidate) === entry.path) : undefined;
              return <div key={entry.id} className="flex items-center gap-3 rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-panel))] p-3"><span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{entry.kind}</span><span className="min-w-0 flex-1 truncate text-sm">{entry.label}</span>{note && <Button size="sm" variant="ghost" onClick={() => { selectNote(note.id); setShowReturnContext(false); }}>{t("common.open")}</Button>}</div>;
            })}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowReturnContext(false)}>{t("common.close")}</Button><Button onClick={markReturnContextSeen} disabled={returnContextEntries.length === 0}>{t("workspace.markSeen")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {!isJoinRoute && !isReadOnlyDemo && (
        <WorkspaceHistoryPanel
          open={!focusMode && showHistory}
          width={visibleChatWidth}
          onWidthChange={(rightPanelWidth) => updateEditorPreferences({ rightPanelWidth })}
          onClose={() => setRightPanel(null)}
          loading={historyLoading}
          error={historyError}
          commits={historyCommits}
          unpublishedCount={workspaceChanges.length}
          onRetry={() => void loadHistory()}
          subtitle={isReadOnlyDemo ? t("workspace.tutorialHistory") : isDemoWorkspace ? t("workspace.demoCheckpointHistory") : undefined}
          ariaLabel={isDemoWorkspace ? t("workspace.demoHistory") : undefined}
        />
      )}

      {pendingMerge && (
        <MergeConflictResolver
          plan={pendingMerge.plan}
          backupBranch={pendingMerge.backupBranch}
          backupWarning={pendingMerge.backupWarning}
          backupPending={pendingMerge.backupPending}
          publishing={publishingMerge}
          onPlanChange={(plan) => setPendingMerge((current) => current ? { ...current, plan } : current)}
          onCancel={cancelMerge}
          onPublish={() => void publishPendingMerge()}
        />
      )}

      {showSettings && (isJoinRoute || isDemoWorkspace) && (
        <AppearancePreferencesDialog open={showSettings} onOpenChange={setShowSettings} />
      )}

      {showSettings && !isJoinRoute && vault && privateRepo && githubToken && (
        <CabinetSettingsDialog
          open={showSettings}
          onOpenChange={setShowSettings}
          vault={vault}
          repo={privateRepo}
          token={githubToken}
          hasUnsyncedChanges={dirty}
          onRepositorySave={saveRepositorySettings}
          onClearLocalCopies={() => setConfirmClearRecovery(true)}
          settingsEditable={settingsEditable}
        />
      )}

      <Dialog
        open={Boolean(pendingImageDrop)}
        onOpenChange={(open) => {
          if (open || !pendingImageDrop) return;
          pendingImageDrop.resolve(null);
          setPendingImageDrop(null);
        }}
      >
        <DialogContent className="border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-sidebar))] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("workspace.chooseImageFolder")}</DialogTitle>
            <DialogDescription>{t("workspace.chooseImageFolderDescription")}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!pendingImageDrop) return;
              const current = pendingImageDrop;
              const destination = imageDropDestination || current.note.path;
              setPendingImageDrop(null);
              void saveDroppedImage(current.note, current.file, destination)
                .then((image) => current.resolve(image))
                .catch((error) => {
                  toast({ title: t("workspace.imageDropFailed"), description: localizedRepositoryError(error), variant: "destructive" });
                  current.resolve(null);
                });
            }}
          >
            <label htmlFor="dropped-image-destination" className="block space-y-1.5 text-sm font-medium text-[hsl(var(--obsidian-text))]">
              <span>{t("workspace.imageLocation")}</span>
              <select
                id="dropped-image-destination"
                value={imageDropDestination}
                onChange={(event) => setImageDropDestination(event.target.value)}
                className="w-full rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg))] px-3 py-2 text-sm text-[hsl(var(--obsidian-text))] outline-hidden focus:border-[hsl(var(--obsidian-accent))] focus:ring-2 focus:ring-[hsl(var(--obsidian-accent)/0.2)]"
              >
                {Array.from(new Set([figuresFolder, pendingImageDrop?.note.path || "/", ...creationFolders]))
                  .filter((path) => selectedScopes.some((scope) => pathBelongsToScope(path || "/", scope)))
                  .map((path) => <option key={path} value={path}>{path === figuresFolder ? t("workspace.figuresFolder") : path === pendingImageDrop?.note.path ? t("workspace.noteFolder") : path === "/" ? t("workspace.root") : path.replace(/\/$/, "")}</option>)}
              </select>
            </label>
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => { pendingImageDrop?.resolve(null); setPendingImageDrop(null); }}>{t("common.cancel")}</Button>
              <Button type="submit">{t("workspace.saveImage")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmClearRecovery}
        onOpenChange={setConfirmClearRecovery}
        title={t("workspace.removeAllRecoveryTitle")}
        description={t("workspace.removeAllRecoveryDescription")}
        confirmText={t("settings.removeRecoveryCopies")}
        destructive
        onConfirm={() => void removeAllRecoveryCopies()}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        title={pendingDelete?.kind === "folder" ? t("workspace.deleteFolderTitle") : t("workspace.deleteFileTitle")}
        description={pendingDelete?.kind === "folder"
          ? pendingDelete.count === 0
            ? t("workspace.deleteEmptyFolderDescription", { name: pendingDelete.label })
            : t("workspace.deleteFolderContentsDescription", { count: pendingDelete.count, name: pendingDelete.label })
          : t("workspace.deleteFileDescription", { name: pendingDelete?.label || "" })}
        confirmText={t("workspace.stageDeletion")}
        destructive
        onConfirm={() => {
          if (!pendingDelete) return;
          if (pendingDelete.kind === "file") { deleteNote(vaultYdoc, pendingDelete.id); recordActivity("file.deleted", pendingDelete.id, pendingDelete.label); }
          else { deleteFolder(vaultYdoc, pendingDelete.path); recordActivity("folder.contents_deleted", undefined, pendingDelete.path); }
          setPendingDelete(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingMove)}
        onOpenChange={(open) => { if (!open) setPendingMove(null); }}
        title={t("workspace.moveFolderTitle")}
        description={t("workspace.moveFolderDescription", { count: pendingMove?.count || 0, source: pendingMove?.sourcePath || "", target: pendingMove?.targetPath || "" })}
        confirmText={t("workspace.stageMove")}
        onConfirm={() => {
          if (!pendingMove) return;
          handleMoveFolder(pendingMove.sourcePath, pendingMove.targetPath.split("/").slice(0, -1).join("/") || "/");
          setPendingMove(null);
        }}
      />

      {isDemoWorkspace && !isReadOnlyDemo && (
        <ConfirmDialog
          open={confirmResetDemo}
          onOpenChange={setConfirmResetDemo}
          title={t("workspace.resetDemo")}
          description={(
            <>
              <span className="mb-3 block rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg)/0.55)] p-3 text-sm text-[hsl(var(--obsidian-text-muted))]">
                {t("workspace.demoGithubUnavailable")}
              </span>
              <span className="block">{t("workspace.resetDemoDescription")}</span>
            </>
          )}
          confirmText={t("workspace.resetDemo")}
          destructive
          onConfirm={() => {
            setConfirmResetDemo(false);
            void loadDemoWorkspace(true).then(() => {
              toast({ title: t("workspace.demoReset"), description: t("workspace.demoReady") });
            });
          }}
        />
      )}

      <Dialog open={showRelayConsent} onOpenChange={(open) => { if (!open) resolveRelayConsent(false); }}>
        <DialogContent className="border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-sidebar))] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("collab.relayConsentTitle")}</DialogTitle>
            <DialogDescription>{t("collab.relayConsentDescription")}</DialogDescription>
          </DialogHeader>
          <div role="note" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100">
            {t("collab.relayConsentWarning")}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => resolveRelayConsent(false)}>{t("collab.keepDirectP2P")}</Button>
            <Button type="button" onClick={() => resolveRelayConsent(true)}>{t("collab.allowRelay")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!isReadOnlyDemo && <PrivateCollaborationDialog
        open={showCollabDialog}
        editLink={collabSession?.editLink || ""}
        viewLink={collabSession?.viewLink || ""}
        rotating={showShareProgress}
        transport={collaborationTransport}
        onOpenChange={setShowCollabDialog}
        onStop={stopSharing}
        onRotate={() => void startSharing(true)}
        onTransportChange={(transport) => void startSharing(true, transport)}
      />}

      <Dialog open={showChanges} onOpenChange={(open) => { if (!syncing) setShowChanges(open); }}>
        <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-2xl bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))] flex flex-col">
          <DialogHeader>
            <DialogTitle>{isDemoWorkspace ? t("workspace.reviewDemoTitle") : t("workspace.reviewPublishTitle")}</DialogTitle>
            <DialogDescription>{t("workspace.reviewOperations", { count: workspaceChanges.length })} {isDemoWorkspace ? t("workspace.demoReviewDescription") : t("workspace.publishReviewDescription")}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {workspaceChanges.map((change) => (
              <div key={change.id} className="rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-panel))] p-3">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${change.kind === "deleted" ? "bg-red-900/60 text-red-200" : change.kind === "added" ? "bg-emerald-900/60 text-emerald-200" : "bg-amber-900/60 text-amber-100"}`}>{t(`workspace.change.${change.kind}`)}</span>
                  <div className="min-w-0 flex-1"><p className="break-all text-sm font-medium">{change.path}</p>{change.originalPath && change.originalPath !== change.path && <p className="break-all text-xs text-muted-foreground">{t("workspace.fromPath", { path: change.originalPath })}</p>}{(() => { const activity = [...workspaceActivities].reverse().find((candidate) => candidate.fileId === change.fileId || candidate.path === change.path || candidate.path?.includes(change.path)); return activity ? <p className="mt-1 text-xs text-muted-foreground">{activity.actor.displayName} · {activityLabel(activity)} · {dateTime(activity.timestamp, { timeStyle: "short" })}</p> : null; })()}</div>
                  <Button size="sm" variant="ghost" onClick={() => discardOneChange(change)} aria-label={t("workspace.discardChange", { path: change.path })}><Undo2 className="mr-1 h-3 w-3" />{t("workspace.undo")}</Button>
                </div>
                {(change.contentBefore !== undefined || change.contentAfter !== undefined) && (
                  <details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">{t("workspace.inspectContent")}</summary><div className="mt-2 grid gap-2 sm:grid-cols-2"><pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded bg-black/20 p-2">{change.contentBefore ?? t("workspace.newFileContent")}</pre><pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded bg-black/20 p-2">{change.contentAfter ?? t("workspace.deletedContent")}</pre></div></details>
                )}
              </div>
            ))}
          </div>
          <div className="space-y-2 border-t border-[hsl(var(--obsidian-border))] pt-3">
            <Label htmlFor="commit-message">{isDemoWorkspace ? t("workspace.checkpointMessage") : t("workspace.commitMessage")}</Label>
            <Input id="commit-message" value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} placeholder={isDemoWorkspace ? t("workspace.defaultDemoCheckpointMessage") : t("workspace.defaultCommitMessage")} maxLength={120} />
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setConfirmDiscardAll(true)} disabled={syncing}>{t("workspace.discardAll")}</Button>
            <Button onClick={() => void handleSync()} disabled={syncing || workspaceChanges.length === 0}>{syncing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{isDemoWorkspace ? t("workspace.saveChanges", { count: workspaceChanges.length }) : t("workspace.checkpointChanges", { count: workspaceChanges.length })}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDiscardAll}
        onOpenChange={setConfirmDiscardAll}
        title={t("workspace.discardAllTitle")}
        description={t("workspace.discardAllDescription", {
          count: workspaceChanges.length,
          target: isDemoWorkspace ? t("workspace.discardAllTargetDemo") : t("workspace.discardAllTargetGithub"),
        })}
        confirmText={t("workspace.discardAll")}
        destructive
        onConfirm={() => {
          discardWorkspaceChanges(vaultYdoc, baselineRef.current);
          setConfirmDiscardAll(false);
          setShowChanges(false);
        }}
      />

      <Dialog open={Boolean(pendingRecovery)} onOpenChange={() => undefined}>
        <DialogContent className="sm:max-w-lg bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))]">
          <DialogHeader><DialogTitle>{t("workspace.localWorkTitle")}</DialogTitle><DialogDescription>{t("workspace.localWorkDescription")}</DialogDescription></DialogHeader>
          <div className="rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-panel))] p-3 text-sm">
            <p>{t("workspace.localDraftSaved", { date: pendingRecovery ? dateTime(pendingRecovery.record.updatedAt, { dateStyle: "medium", timeStyle: "short" }) : "" })}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("workspace.recoveryDescription")}</p>
          </div>
          <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setConfirmOpenGitHubVersion(true)}>{t("workspace.discardDraftOpenGitHub")}</Button><Button onClick={recoverLocalDraft}>{t("workspace.recoverLocalDraft")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpenGitHubVersion}
        onOpenChange={setConfirmOpenGitHubVersion}
        title={t("workspace.discardDraftTitle")}
        description={t("workspace.discardDraftDescription")}
        confirmText={t("workspace.discardDraftOpenGitHub")}
        destructive
        onConfirm={() => void openRemoteInsteadOfRecovery()}
      />

      <Dialog open={missingRepository} onOpenChange={(open) => { if (!open) setLocation(cabinetsReturnPath); }}>
        <DialogContent className="sm:max-w-md bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))]">
          <DialogHeader>
            <DialogTitle>{t("workspace.repositoryNotFoundTitle")}</DialogTitle>
            <DialogDescription>
              {t("workspace.repositoryNotFoundDescription", {
                repo: privateRepo?.repoFullName || "your repository",
                account: creationLogin || t("workspace.authenticatedAccount"),
                readme: ".agents/README.md",
              })}
            </DialogDescription>
          </DialogHeader>
          {loadError && <p className="select-text text-sm text-red-400" role="alert">{loadError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLocation(cabinetsReturnPath)}>{t("common.cancel")}</Button>
            <Button onClick={() => void createMissingRepository()} disabled={creatingRepository}>
              {creatingRepository && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("workspace.createPrivateRepository")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(branchIssue)} onOpenChange={(open) => { if (!open) setLocation(cabinetsReturnPath); }}>
        <DialogContent className="sm:max-w-md bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))]">
          <DialogHeader>
            <DialogTitle>{t("workspace.branchNotFoundTitle")}</DialogTitle>
            <DialogDescription>{t("workspace.branchNotFoundDescription", {
              requested: branchIssue?.requested || t("workspace.branchNotFoundFallback"),
              fallback: branchIssue?.fallback || t("workspace.branchNotFoundFallback"),
            })}</DialogDescription>
          </DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setLocation(cabinetsReturnPath)}>{t("common.cancel")}</Button><Button onClick={() => void useDefaultBranch()}>{t("workspace.useBranch", { branch: branchIssue?.fallback || t("workspace.branchNotFoundFallback") })}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {loadError && !missingRepository && !branchIssue && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex select-text items-center gap-2 rounded-md bg-red-950 border border-red-700 px-4 py-3 text-sm text-red-100 shadow-lg" role="alert" aria-live="assertive">
          <AlertCircle className="h-4 w-4" />{loadError}<Button size="sm" variant="outline" onClick={() => setLocation(cabinetsReturnPath)}>{t("common.back")}</Button>
        </div>
      )}
    </div>
  );
}
