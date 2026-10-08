import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useLocalProfile } from "@/contexts/local-profile-context";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription as ModalDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle, BookOpen, Github, Plus, FolderOpen, RefreshCw, Search, Settings, Trash2 } from "lucide-react";
import { DEFAULT_WORKSPACE_BRANCH, GitHubApiError, createPrivateRepository, getAuthenticatedUser, getBranch, getBranches, getRepository, initializeEmptyRepository, isEmptyGitHubRepositoryError, parseRepo } from "@/lib/workspace-github";
import RepositoryConfigurationForm, { type RepositoryConfiguration } from "@/components/repository-configuration-form";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { clearWorkspaceRecoveryForRepo } from "@/lib/workspace-recovery";
import { trackProductEvent } from "@/lib/analytics";
import { useI18n } from "@/contexts/i18n-context";
import { getSavedRepos, addSavedRepo, updateSavedRepo, deleteSavedRepo } from "@/lib/saved-repos";
import { resolveRepositoryCredential } from "@/lib/github-session";
import { configuredGitHubClientId, startGitHubOAuth } from "@/lib/github-oauth-pkce";

interface SavedRepo {
  id: number;
  cabinetNumber: number;
  displayName: string;
  repoFullName: string;
  defaultBranch: string;
  selectedRootScopes?: string[];
  selectedFileTypes?: string[];
  autoSync: boolean;
  autoMergeNonOverlapping: boolean;
  createConflictBackup: boolean;
  pendingConflictBackupBranches: string[];
  githubRepositoryId?: string | null;
  githubInstallationId?: string | null;
  access?: "owner" | "shared";
  settingsEditable?: boolean;
  connectionSource?: string | null;
}

export default function MyCabinets() {
  const { profile } = useLocalProfile();
  const connectGitHub = (returnTo = "/app") => startGitHubOAuth(returnTo).catch(error => setTokenError(error instanceof Error ? error.message : "GitHub connection failed."));
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, number } = useI18n();
  const [repos, setRepos] = useState<SavedRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [reposLoadFailed, setReposLoadFailed] = useState(false);

  // Token dialog state
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<SavedRepo | null>(null);
  const [token, setToken] = useState("");
  const [tokenError, setTokenError] = useState("");
  const [validatingToken, setValidatingToken] = useState(false);
  const [missingRepo, setMissingRepo] = useState(false);
  const [creationLogin, setCreationLogin] = useState("");
  const [branchIssue, setBranchIssue] = useState<{ fallback: string } | null>(null);
  const [configuringRepo, setConfiguringRepo] = useState(false);

  // Add repo dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [addError, setAddError] = useState("");
  const [repoPendingRemoval, setRepoPendingRemoval] = useState<SavedRepo | null>(null);
  const [cabinetSearch, setCabinetSearch] = useState("");
  const tutorialHintKey = profile ? `marktwin:tutorial-hint-dismissed:${profile.id}` : "";
  const [showTutorialHint, setShowTutorialHint] = useState(false);
  const sharedRepos = useMemo(() => repos.filter((repo) => repo.access === "shared"), [repos]);
  const sharedSources = useMemo(
    () => Array.from(new Set(sharedRepos.map((repo) => repo.connectionSource || repo.repoFullName.split("/")[0] || repo.repoFullName))),
    [sharedRepos],
  );
  const filteredRepos = useMemo(() => {
    const query = cabinetSearch.trim().toLocaleLowerCase();
    if (!query) return repos;
    return repos.filter((repo) => `${repo.displayName} ${repo.repoFullName} ${repo.defaultBranch}`.toLocaleLowerCase().includes(query));
  }, [cabinetSearch, repos]);

  const openAddDialog = () => {
    setAddDialogOpen(true);
    setAddError("");
  };

  const loadRepos = async () => {
    setLoading(true); setReposLoadFailed(false);
    try { setRepos(getSavedRepos()); } catch { setReposLoadFailed(true); } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!profile) return;
    void loadRepos();
  }, [profile]);

  useEffect(() => {
    if (!tutorialHintKey) {
      setShowTutorialHint(false);
      return;
    }
    try {
      setShowTutorialHint(window.localStorage.getItem(tutorialHintKey) !== "1");
    } catch {
      // A privacy-restricted browser should still show the helpful prompt.
      setShowTutorialHint(true);
    }
  }, [tutorialHintKey]);

  const dismissTutorialHint = () => {
    setShowTutorialHint(false);
    if (!tutorialHintKey) return;
    try {
      window.localStorage.setItem(tutorialHintKey, "1");
    } catch {
      // The local state still dismisses it for this visit when storage is unavailable.
    }
  };

  const handleOpenCabinet = async (repo: SavedRepo) => {
    trackProductEvent("cabinet_opened", { cabinetId: repo.id, metadata: { source: "onboarding", route: "/app" } });
    setSelectedRepo(repo);
    const credential = await resolveRepositoryCredential(repo);
    if (repo.access === "shared" && credential) {
      // The Cabinet route resolves the browser's current GitHub credential
      // again. No shared credential is copied into another account's storage.
      setLocation(`/cabinet/${repo.id}`);
      return;
    }
    setToken(credential?.token || "");
    setTokenError("");
    setMissingRepo(false);
    setBranchIssue(null);
    setConfiguringRepo(false);
    setTokenDialogOpen(true);
  };

  const handleEnterCabinet = async () => {
    if (!selectedRepo || !token.trim()) return;
    setTokenError("");
    setMissingRepo(false);
    setValidatingToken(true);
    let repositoryValidated = false;
    try {
      const repository = await getRepository(token.trim(), selectedRepo.repoFullName);
      repositoryValidated = true;
      const needsInitialConfiguration = selectedRepo.selectedRootScopes == null || selectedRepo.selectedFileTypes == null;
      const needsRepositoryDefaults = selectedRepo.selectedRootScopes == null;
      if (!needsRepositoryDefaults) {
        try {
          await getBranch(token.trim(), repository.fullName, selectedRepo.defaultBranch);
        } catch (error) {
          if (isEmptyGitHubRepositoryError(error)) {
            // The configuration form will create the first commit after the
            // user confirms the branch, scopes, and file types.
          } else if (error instanceof GitHubApiError && error.status === 404 && repository.defaultBranch !== selectedRepo.defaultBranch) {
            setBranchIssue({ fallback: repository.defaultBranch });
            setTokenError(t("cabinet.branchMissing", { branch: selectedRepo.defaultBranch, fallback: repository.defaultBranch }));
            return;
          } else {
            throw error;
          }
        }
      }
      const repoMetadataChanged = repository.fullName !== selectedRepo.repoFullName
        || (needsRepositoryDefaults && selectedRepo.defaultBranch !== repository.defaultBranch);
      const repoForCabinet = repoMetadataChanged
        ? updateSavedRepo(selectedRepo.id, {
              displayName: repository.fullName,
              repoFullName: repository.fullName,
              defaultBranch: needsRepositoryDefaults ? repository.defaultBranch : selectedRepo.defaultBranch,
            })
        : selectedRepo;
      setRepos((current) => current.map((candidate) => candidate.id === repoForCabinet.id ? repoForCabinet : candidate));
      sessionStorage.setItem(`gh-token-${repoForCabinet.id}`, token.trim());
      if (needsInitialConfiguration) {
        setSelectedRepo(repoForCabinet);
        setConfiguringRepo(true);
      } else {
        setTokenDialogOpen(false);
        setLocation(`/cabinet/${repoForCabinet.cabinetNumber}`);
      }
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404 && !repositoryValidated) {
        setMissingRepo(true);
        setTokenError(t("cabinet.repoMissing", { repo: selectedRepo.repoFullName }));
        try { setCreationLogin((await getAuthenticatedUser(token.trim())).login); } catch { setCreationLogin(""); }
      } else if (error instanceof GitHubApiError && error.status === 401) {
        setTokenError(t("cabinet.tokenRejected"));
      } else if (error instanceof GitHubApiError && error.status === 403) {
        setTokenError(t("cabinet.tokenPermission"));
      } else {
        setTokenError(error instanceof Error ? error.message : t("cabinet.validationFailed"));
      }
    } finally {
      setValidatingToken(false);
    }
  };

  const handleUseDefaultBranch = async () => {
    if (!selectedRepo || !branchIssue) return;
    try {
      const updated = updateSavedRepo(selectedRepo.id, { defaultBranch: branchIssue.fallback });
      setRepos((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
      setSelectedRepo(updated);
      setBranchIssue(null);
      setTokenError("");
    } catch (error) {
      setTokenError(error instanceof Error ? error.message : t("cabinet.branchUpdateFailed"));
    }
  };

  const handleCreateMissingRepository = async () => {
    if (!selectedRepo || !token.trim()) return;
    setValidatingToken(true);
    try {
      const { repo } = parseRepo(selectedRepo.repoFullName);
      const created = await createPrivateRepository(token.trim(), repo);
      const updated = updateSavedRepo(selectedRepo.id, { displayName: created.fullName, repoFullName: created.fullName, defaultBranch: created.defaultBranch });
      setRepos((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
      sessionStorage.setItem(`gh-token-${updated.id}`, token.trim());
      setSelectedRepo(updated);
      setMissingRepo(false);
      setConfiguringRepo(true);
      trackProductEvent("cabinet_created", { cabinetId: updated.id, metadata: { source: "onboarding", route: "/app" } });
    } catch (error) {
      setTokenError(error instanceof Error ? error.message : t("cabinet.repoCreateFailed"));
    } finally {
      setValidatingToken(false);
    }
  };

  const handleAddRepo = async () => {
    setAddError("");
    if (!newRepoName.trim().includes("/")) {
      setAddError(t("cabinet.repoFormat"));
      return;
    }
    try {
      const repo = addSavedRepo({
          displayName: newRepoName.trim(),
          repoFullName: newRepoName.trim(),
          defaultBranch: "main",
        });
      setRepos((prev) => [...prev, repo]);
      setNewRepoName("");
      setAddDialogOpen(false);
    } catch {
      setAddError(t("cabinet.repoSaveFailed"));
    }
  };

  const handleSaveInitialConfiguration = async (configuration: RepositoryConfiguration) => {
    if (!selectedRepo) return;
    let branch = configuration.branch || DEFAULT_WORKSPACE_BRANCH;
    const branches = await getBranches(token.trim(), selectedRepo.repoFullName);
    if (branches.length === 0) {
      const initialized = await initializeEmptyRepository(token.trim(), selectedRepo.repoFullName, branch);
      branch = initialized.branch;
    }
    const updated = updateSavedRepo(selectedRepo.id, {
        defaultBranch: branch,
        selectedRootScopes: configuration.selectedRootScopes,
        selectedFileTypes: configuration.selectedFileTypes,
        autoSync: configuration.autoSync,
        autoMergeNonOverlapping: configuration.autoMergeNonOverlapping,
        createConflictBackup: configuration.createConflictBackup,
      });
    setRepos((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
    setSelectedRepo(updated);
    setConfiguringRepo(false);
    setTokenDialogOpen(false);
    setLocation(`/cabinet/${updated.cabinetNumber}`);
  };

  const handleDeleteRepo = async (repo: SavedRepo) => {
    try {
      deleteSavedRepo(repo.id);
      setRepos((prev) => prev.filter((candidate) => candidate.id !== repo.id));
      if (selectedRepo?.id === repo.id) setSelectedRepo(null);
      sessionStorage.removeItem(`gh-token-${repo.id}`);
      sessionStorage.removeItem(`gh-token-${repo.repoFullName.split("/")[1] || repo.repoFullName}`);
      try {
        await clearWorkspaceRecoveryForRepo(repo.id);
        toast({ title: t("cabinet.removed"), description: t("cabinet.removedDescription") });
      } catch {
        toast({ title: t("cabinet.removed"), description: t("cabinet.removedDescription"), variant: "destructive" });
      }
    } catch (error) {
      toast({ title: t("cabinet.removeFailed"), description: error instanceof Error ? error.message : t("common.retry"), variant: "destructive" });
    }
  };


  return (
    <Layout hideNavigation hideFooter mainClassName="pt-6 sm:pt-8">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight text-[hsl(var(--obsidian-text))]">{t("cabinet.title")}</h1>
            <p className="text-[hsl(var(--obsidian-text-muted))] mt-1">
              {t("cabinet.description")}
            </p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button type="button" variant="ghost" size="icon" className="h-10 w-10 flex-none" onClick={() => setLocation("/user")} aria-label={t("user.openSettings")} title={t("user.openSettings")}><Settings className="h-4 w-4" /></Button>
            <Button onClick={openAddDialog} className="flex-1 bg-primary hover:bg-primary/90 sm:flex-none">
              <Plus className="h-4 w-4 mr-2" />
              {t("cabinet.new")}
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--obsidian-text-muted))]" aria-hidden="true" />
          <Input value={cabinetSearch} onChange={(event) => setCabinetSearch(event.target.value)} placeholder={t("cabinet.searchPlaceholder")} aria-label={t("cabinet.searchPlaceholder")} className="h-11 border-[hsl(var(--obsidian-border))] bg-transparent pl-10" />
        </div>

        {!loading && !reposLoadFailed && sharedRepos.length > 0 && (
          <div className="border-l-2 border-[hsl(var(--obsidian-accent)/0.45)] py-1 pl-3">
              <p className="text-sm font-medium text-[hsl(var(--obsidian-text))]">{t("cabinet.availableTitle")}</p>
              <p className="mt-0.5 text-xs leading-5 text-[hsl(var(--obsidian-text-muted))]">
                {t("cabinet.availableDescription", { accounts: sharedSources.join(", ") })}
              </p>
          </div>
        )}

        {loading ? (
          <p className="text-[hsl(var(--obsidian-text-muted))] text-center py-12">{t("cabinet.loading")}</p>
        ) : reposLoadFailed ? (
          <Card className="border-destructive/40 bg-[hsl(var(--obsidian-sidebar))]">
            <CardContent className="flex flex-col items-center gap-4 p-8 text-center sm:p-10">
              <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden="true" />
              <p role="alert" className="max-w-lg text-[hsl(var(--obsidian-text-muted))]">{t("cabinet.loadFailed")}</p>
              <Button type="button" variant="outline" onClick={() => void loadRepos()}>
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                {t("cabinet.retry")}
              </Button>
            </CardContent>
          </Card>
        ) : repos.length === 0 ? (
          <div className="space-y-3">
            {showTutorialHint && (
              <Card data-tutorial-hint className="bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))] hover:border-[hsl(var(--obsidian-accent)/0.7)] hover:bg-[hsl(var(--obsidian-accent)/0.06)] transition-colors group">
                <CardHeader className="flex flex-col items-stretch gap-3 space-y-0 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <BookOpen className="h-5 w-5 text-[hsl(var(--obsidian-text-muted))] flex-shrink-0" />
                    <div className="min-w-0">
                      <CardTitle className="text-base text-[hsl(var(--obsidian-text))] truncate">{t("cabinet.tutorialHintTitle")}</CardTitle>
                      <CardDescription className="text-xs text-[hsl(var(--obsidian-text-muted))]">{t("cabinet.tutorialHintDescription")}</CardDescription>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2 sm:justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-10 w-10 p-0 text-red-400 opacity-100 hover:bg-red-500/10 hover:text-red-300 sm:h-9 sm:w-9 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                      onClick={dismissTutorialHint}
                      aria-label={t("cabinet.tutorialHintDismiss")}
                      title={t("cabinet.tutorialHintDismiss")}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button asChild size="sm" className="h-10 flex-1 bg-primary hover:bg-primary/90 sm:h-9 sm:flex-none">
                      <Link href="/cabinet/documentation">
                        <FolderOpen className="mr-2 h-4 w-4" />
                        {t("cabinet.tutorialHintAction")}
                      </Link>
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            )}
            <div className="py-12 text-center sm:py-16">
              <Github className="mx-auto mb-4 h-12 w-12 text-[hsl(var(--obsidian-text-muted))] opacity-50" />
              <p className="mb-4 text-[hsl(var(--obsidian-text-muted))]">{t("cabinet.empty")}</p>
              <Button onClick={openAddDialog} variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                {t("cabinet.first")}
              </Button>
            </div>
          </div>
        ) : filteredRepos.length === 0 ? (
          <div className="py-12 text-center text-sm text-[hsl(var(--obsidian-text-muted))]">{t("cabinet.searchEmpty")}</div>
        ) : (
          <div className="grid gap-3">
            {filteredRepos.map((repo) => (
              <Card
                key={repo.id}
                className="bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))] hover:border-[hsl(var(--obsidian-accent)/0.7)] hover:bg-[hsl(var(--obsidian-accent)/0.06)] transition-colors group"
              >
                <CardHeader className="flex flex-col items-stretch gap-3 space-y-0 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <Github className="h-5 w-5 text-[hsl(var(--obsidian-text-muted))] flex-shrink-0" />
                    <div className="min-w-0">
                      <CardTitle className="text-base text-[hsl(var(--obsidian-text))] truncate">
                        {repo.displayName}
                      </CardTitle>
                      <CardDescription className="text-xs text-[hsl(var(--obsidian-text-muted))]">
                        {repo.access === "shared"
                          ? t("cabinet.availableFrom", { source: repo.connectionSource || repo.repoFullName.split("/")[0] || repo.repoFullName })
                          : t("cabinet.number", { number: number(repo.cabinetNumber) })} · {repo.repoFullName} · {repo.defaultBranch}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2 sm:justify-end">
                    {repo.access !== "shared" && <Button
                      size="sm"
                      variant="ghost"
                      className="h-10 w-10 p-0 text-red-400 opacity-100 hover:bg-red-500/10 hover:text-red-300 sm:h-9 sm:w-9 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRepoPendingRemoval(repo);
                      }}
                      title={t("cabinet.remove")}
                      aria-label={`${t("cabinet.remove")} ${repo.displayName}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>}
                    <Button
                      size="sm"
                      onClick={() => void handleOpenCabinet(repo)}
                      className="h-10 flex-1 bg-primary hover:bg-primary/90 sm:h-9 sm:flex-none"
                    >
                      <FolderOpen className="h-4 w-4 mr-2" />
                      {t("cabinet.open")}
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Token entry dialog */}
      <Dialog open={tokenDialogOpen} onOpenChange={(open) => { setTokenDialogOpen(open); if (!open) setConfiguringRepo(false); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Github className="h-5 w-5" />
              {selectedRepo?.displayName}
            </DialogTitle>
            <ModalDescription>{configuringRepo ? t("cabinet.configureDescription") : t("cabinet.tokenDescription")}</ModalDescription>
          </DialogHeader>
          {configuringRepo && selectedRepo ? (
            <div className="space-y-4 py-2">
              <p className="text-sm text-[hsl(var(--obsidian-text-muted))]">
                {t("cabinet.configureHelp")}
              </p>
              <RepositoryConfigurationForm
                token={token.trim()}
                repoFullName={selectedRepo.repoFullName}
                initialBranch={selectedRepo.defaultBranch}
                initialRootScopes={selectedRepo.selectedRootScopes}
                initialFileTypes={selectedRepo.selectedFileTypes}
                initialAutoSync={selectedRepo.autoSync}
                initialAutoMergeNonOverlapping={selectedRepo.autoMergeNonOverlapping}
                initialCreateConflictBackup={selectedRepo.createConflictBackup}
                onCancel={() => { setConfiguringRepo(false); setTokenDialogOpen(false); }}
                onSave={handleSaveInitialConfiguration}
              />
            </div>
          ) : <>
          <div className="space-y-4 py-2">
            {!token && configuredGitHubClientId() && (
              <div className="space-y-2 rounded-lg border border-[hsl(var(--obsidian-border))] p-3">
                <Button type="button" className="w-full" onClick={() => void connectGitHub("/app")}>
                  <Github className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t("cabinet.connectGitHub")}
                </Button>
                <p className="text-center text-xs text-muted-foreground">{t("cabinet.orUseToken")}</p>
              </div>
            )}
            <div className="rounded-lg bg-[hsl(var(--obsidian-panel))] p-3 text-sm text-[hsl(var(--obsidian-text-muted))]">
              <p>{t("cabinet.tokenBoundary")}</p>
              <p className="mt-2">
                {t("cabinet.tokenPermissions")} {" "}
                <a
                  href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-[hsl(var(--primary))] underline decoration-[hsl(var(--primary)/0.45)] underline-offset-2 hover:decoration-[hsl(var(--primary))]"
                >
                  {t("cabinet.tokenGuide")}
                </a>
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gh-token">{t("cabinet.tokenLabel")}</Label>
              <Input
                id="gh-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                aria-invalid={Boolean(tokenError)}
                aria-describedby={tokenError ? "gh-token-error" : undefined}
                onKeyDown={(e) => e.key === "Enter" && handleEnterCabinet()}
                placeholder="ghp_…"
                autoComplete="current-password"
                className="bg-[hsl(var(--obsidian-bg))] border-[hsl(var(--obsidian-border))]"
              />
            </div>
            {tokenError && <p id="gh-token-error" role="alert" aria-live="assertive" className="text-sm text-red-400">{tokenError}</p>}
            {missingRepo && (
              <p className="text-xs text-[hsl(var(--obsidian-text-muted))]">
                {t("cabinet.createMissing")} {creationLogin || "the authenticated account"}. Marktwin will seed <code>.agents/README.md</code>.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTokenDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            {missingRepo && (
              <Button variant="outline" onClick={() => void handleCreateMissingRepository()} disabled={validatingToken}>
                {t("cabinet.createMissing")}
              </Button>
            )}
            {branchIssue && !missingRepo && (
              <Button variant="outline" onClick={() => void handleUseDefaultBranch()} disabled={validatingToken}>
                {t("cabinet.useDefaultBranch")}
              </Button>
            )}
            <Button
              onClick={handleEnterCabinet}
              disabled={!token.trim() || validatingToken}
              className="bg-primary hover:bg-primary/90"
            >
              <FolderOpen className="h-4 w-4 mr-2" />
              {validatingToken ? t("common.validating") : t("cabinet.validateOpen")}
            </Button>
          </DialogFooter>
          </>}
        </DialogContent>
      </Dialog>

      {/* Add repo dialog */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (open) setAddError(""); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))]">
          <DialogHeader>
            <DialogTitle>{t("cabinet.new")}</DialogTitle>
            <ModalDescription>{t("cabinet.newDescription")}</ModalDescription>
          </DialogHeader>
          {<div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="repo-name">{t("cabinet.repository")}</Label>
              <Input
                id="repo-name"
                value={newRepoName}
                onChange={(e) => setNewRepoName(e.target.value)}
                aria-invalid={Boolean(addError)}
                aria-describedby={addError ? "repo-name-error" : undefined}
                placeholder="owner/repo"
                className="bg-[hsl(var(--obsidian-bg))] border-[hsl(var(--obsidian-border))]"
              />
            </div>
          </div>}
          {addError && <p id="repo-name-error" role="alert" aria-live="assertive" className="text-sm text-red-400">{addError}</p>}
          {<DialogFooter>
            <Button variant="outline" onClick={() => { setAddDialogOpen(false); setAddError(""); }}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleAddRepo}
              disabled={!newRepoName.trim()}
              className="bg-primary hover:bg-primary/90"
            >
              {t("cabinet.createRepo")}
            </Button>
          </DialogFooter>}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(repoPendingRemoval)}
        onOpenChange={(open) => { if (!open) setRepoPendingRemoval(null); }}
        title={t("cabinet.removeConfirmTitle")}
        description={t("cabinet.removeConfirm", { name: repoPendingRemoval?.displayName || t("cabinet.title") })}
        confirmText={t("cabinet.remove")}
        destructive
        onConfirm={() => {
          const repo = repoPendingRemoval;
          setRepoPendingRemoval(null);
          if (repo) void handleDeleteRepo(repo);
        }}
      />
    </Layout>
  );
}
