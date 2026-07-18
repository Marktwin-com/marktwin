import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Github, Plus, FolderOpen, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { getSavedRepos, addSavedRepo, deleteSavedRepo, updateSavedRepo, type SavedRepoLocal } from "@/lib/saved-repos";
import { GitHubApiError, createPrivateRepository, getAuthenticatedUser, getBranch, getRepository, parseRepo } from "@/lib/browser-github";
import { configuredGitHubClientId, consumeGitHubOAuthToken, startGitHubOAuth } from "@/lib/github-oauth-pkce";

const OAUTH_REPO_KEY = "marktwin.githubOAuthRepoId";

export default function MyCabinets() {
  const [, setLocation] = useLocation();
  const [repos, setRepos] = useState<SavedRepoLocal[]>([]);

  // Token dialog state
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<SavedRepoLocal | null>(null);
  const [token, setToken] = useState("");
  const [tokenError, setTokenError] = useState("");
  const [validatingToken, setValidatingToken] = useState(false);
  const [missingRepo, setMissingRepo] = useState(false);
  const [creationLogin, setCreationLogin] = useState("");
  const [repoToRemove, setRepoToRemove] = useState<SavedRepoLocal | null>(null);

  // Add repo dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoBranch, setNewRepoBranch] = useState("main");
  const [addError, setAddError] = useState("");

  useEffect(() => {
    const saved = getSavedRepos();
    setRepos(saved);
    const oauthToken = consumeGitHubOAuthToken();
    const oauthRepoId = Number(sessionStorage.getItem(OAUTH_REPO_KEY));
    if (oauthToken && oauthRepoId) {
      const repo = saved.find((candidate) => candidate.id === oauthRepoId);
      sessionStorage.removeItem(OAUTH_REPO_KEY);
      if (repo) {
        setSelectedRepo(repo);
        setToken(oauthToken);
        setTokenDialogOpen(true);
      }
    }
  }, []);

  const handleOpenCabinet = (repo: SavedRepoLocal) => {
    setSelectedRepo(repo);
    const repoName = repo.repoFullName.split('/')[1] || repo.repoFullName;
    const saved = sessionStorage.getItem(`gh-token-${repo.id}`) || sessionStorage.getItem(`gh-token-${repoName}`);
    setToken(saved || "");
    setTokenError("");
    setMissingRepo(false);
    setTokenDialogOpen(true);
  };

  const enterValidatedCabinet = (repo: SavedRepoLocal, tokenValue: string) => {
    sessionStorage.setItem(`gh-token-${repo.id}`, tokenValue);
    setTokenDialogOpen(false);
    setLocation(`/cabinet/${repo.id}`);
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
      try {
        await getBranch(token.trim(), repository.fullName, selectedRepo.defaultBranch);
      } catch (error) {
        if (error instanceof GitHubApiError && error.status === 404) {
          setTokenError(selectedRepo.defaultBranch !== repository.defaultBranch
            ? `Branch '${selectedRepo.defaultBranch}' was not found. Use GitHub's default branch '${repository.defaultBranch}' instead.`
            : `Branch '${selectedRepo.defaultBranch}' was not found in '${repository.fullName}'.`);
          return;
        }
        throw error;
      }
      enterValidatedCabinet(selectedRepo, token.trim());
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404 && !repositoryValidated) {
        setMissingRepo(true);
        setTokenError(`The repository '${selectedRepo.repoFullName}' was not found or this token cannot access it.`);
        try {
          setCreationLogin((await getAuthenticatedUser(token.trim())).login);
        } catch {
          setCreationLogin("");
        }
      } else if (error instanceof GitHubApiError && error.status === 401) {
        setTokenError("GitHub rejected this token. Check it and try again.");
      } else if (error instanceof GitHubApiError && error.status === 403) {
        setTokenError("This token does not have permission to access the repository.");
      } else {
        setTokenError(error instanceof Error ? error.message : "GitHub validation failed.");
      }
    } finally {
      setValidatingToken(false);
    }
  };

  const handleUseDefaultBranch = async () => {
    if (!selectedRepo || !token.trim()) return;
    setValidatingToken(true);
    try {
      const repository = await getRepository(token.trim(), selectedRepo.repoFullName);
      const updated = { ...selectedRepo, defaultBranch: repository.defaultBranch };
      updateSavedRepo(selectedRepo.id, { defaultBranch: repository.defaultBranch });
      setRepos(getSavedRepos());
      enterValidatedCabinet(updated, token.trim());
    } catch (error) {
      setTokenError(error instanceof Error ? error.message : "Could not use the default branch.");
    } finally {
      setValidatingToken(false);
    }
  };

  const handleCreateMissingRepository = async () => {
    if (!selectedRepo || !token.trim()) return;
    setValidatingToken(true);
    try {
      const { repo } = parseRepo(selectedRepo.repoFullName);
      const created = await createPrivateRepository(token.trim(), repo);
      const updated = updateSavedRepo(selectedRepo.id, {
        displayName: created.fullName,
        repoFullName: created.fullName,
        defaultBranch: created.defaultBranch,
        selectedRootScopes: [".agents"],
      });
      if (!updated) throw new Error("Could not update the saved cabinet.");
      setRepos(getSavedRepos());
      enterValidatedCabinet(updated, token.trim());
    } catch (error) {
      setTokenError(error instanceof Error ? error.message : "Could not create the repository.");
    } finally {
      setValidatingToken(false);
    }
  };

  const handleAddRepo = () => {
    setAddError("");
    try {
      parseRepo(newRepoName);
    } catch {
      setAddError("Use owner/repo format (e.g. acme/docs)");
      return;
    }
    const repo = addSavedRepo({
      displayName: newRepoName.trim(),
      repoFullName: newRepoName.trim(),
      defaultBranch: newRepoBranch.trim() || "main",
    });
    setRepos((prev) => [...prev, repo]);
    setNewRepoName("");
    setNewRepoBranch("main");
    setAddDialogOpen(false);
    handleOpenCabinet(repo);
  };

  const handleOAuth = async () => {
    if (!selectedRepo) return;
    sessionStorage.setItem(OAUTH_REPO_KEY, String(selectedRepo.id));
    try {
      await startGitHubOAuth("/my-cabinets");
    } catch (error) {
      sessionStorage.removeItem(OAUTH_REPO_KEY);
      setTokenError(error instanceof Error ? error.message : "Could not start GitHub OAuth.");
    }
  };

  const handleDeleteRepo = (repoId: number) => {
    deleteSavedRepo(repoId);
    setRepos((prev) => prev.filter((r) => r.id !== repoId));
    sessionStorage.removeItem(`gh-token-${repoId}`);
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto min-w-0">
        <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-3xl font-bold text-[hsl(var(--obsidian-text))]">Agent workspaces</h1>
            <p className="text-[hsl(var(--obsidian-text-muted))] mt-1">
              Think together about agent rules, skills, tools, boundaries, and decisions—then review and publish the result to GitHub.
            </p>
          </div>
          <Button onClick={() => setAddDialogOpen(true)} className="bg-primary hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-2" />
            Connect repository
          </Button>
        </div>

        {repos.length === 0 ? (
          <div className="text-center py-16">
            <Github className="h-12 w-12 mx-auto mb-4 text-[hsl(var(--obsidian-text-muted))] opacity-50" />
            <p className="text-[hsl(var(--obsidian-text-muted))] mb-4">Connect a repository to create your first collaborative agent workspace.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {repos.map((repo) => (
              <Card
                key={repo.id}
                className="bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))] hover:border-primary/50 transition-colors group"
              >
                <CardHeader className="flex flex-col items-stretch justify-between gap-3 space-y-0 p-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3 min-w-0">
                    <Github className="h-5 w-5 text-[hsl(var(--obsidian-text-muted))] flex-shrink-0" />
                    <div className="min-w-0">
                      <CardTitle className="text-base text-[hsl(var(--obsidian-text))] truncate">
                        {repo.displayName}
                      </CardTitle>
                      <CardDescription className="text-xs text-[hsl(var(--obsidian-text-muted))]">
                        {repo.repoFullName} · {repo.defaultBranch}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRepoToRemove(repo);
                      }}
                      title="Remove repository"
                      aria-label={`Remove ${repo.displayName} from this browser`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleOpenCabinet(repo)}
                      className="bg-primary hover:bg-primary/90"
                    >
                      <FolderOpen className="h-4 w-4 mr-2" />
                      Open workspace
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Token entry dialog */}
      <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
        <DialogContent className="bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Github className="h-5 w-5" />
              {selectedRepo?.displayName}
            </DialogTitle>
            <DialogDescription>
              Marktwin validates the repository and branch directly with GitHub before opening the workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-[hsl(var(--obsidian-panel))] rounded-lg p-3 text-sm text-[hsl(var(--obsidian-text-muted))]">
              Your token is stored only in this browser's session storage and is never sent to a server.
            </div>
            {configuredGitHubClientId() && <Button className="w-full" onClick={() => void handleOAuth()}><Github className="mr-2 h-4 w-4" />Continue with GitHub</Button>}
            <details open={!configuredGitHubClientId()} className="rounded-md border border-[hsl(var(--obsidian-border))] p-3">
              <summary className="cursor-pointer text-sm font-medium">Use a personal access token <span className="font-normal text-muted-foreground">(advanced)</span></summary>
            <div className="mt-3 space-y-2">
              <Label htmlFor="gh-token">GitHub personal access token</Label>
              <Input
                id="gh-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleEnterCabinet()}
                placeholder="ghp_…"
                autoComplete="off"
                className="bg-[hsl(var(--obsidian-bg))] border-[hsl(var(--obsidian-border))]"
              />
              <p className="text-xs text-muted-foreground">Fine-grained tokens need Contents read/write for Sync. Creating a missing private repository also requires Administration write permission.</p>
            </div>
            </details>
            {tokenError && <p className="text-sm text-red-400">{tokenError}</p>}
            {missingRepo && (
              <p className="text-xs text-[hsl(var(--obsidian-text-muted))]">
                Create a private repository under {creationLogin || "the authenticated account"}. Marktwin will seed <code>.agents/README.md</code> and retarget this cabinet if the owner name differs.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTokenDialogOpen(false)}>
              Cancel
            </Button>
            {tokenError.includes("default branch") && !missingRepo && (
              <Button variant="outline" onClick={() => void handleUseDefaultBranch()} disabled={validatingToken}>
                Use default branch
              </Button>
            )}
            {missingRepo && (
              <Button variant="outline" onClick={() => void handleCreateMissingRepository()} disabled={validatingToken}>
                Create private repository
              </Button>
            )}
            <Button
              onClick={() => void handleEnterCabinet()}
              disabled={!token.trim() || validatingToken}
              className="bg-primary hover:bg-primary/90"
            >
              <FolderOpen className="h-4 w-4 mr-2" />
              Validate and open
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add repo dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))]">
          <DialogHeader>
            <DialogTitle>Connect repository</DialogTitle>
            <DialogDescription>Step 1 of 2 · Choose the repository. Next, connect GitHub and validate access.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="repo-name">Repository</Label>
              <Input
                id="repo-name"
                value={newRepoName}
                onChange={(e) => setNewRepoName(e.target.value)}
                placeholder="owner/repo"
                className="bg-[hsl(var(--obsidian-bg))] border-[hsl(var(--obsidian-border))]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="repo-branch">Default branch</Label>
              <Input
                id="repo-branch"
                value={newRepoBranch}
                onChange={(e) => setNewRepoBranch(e.target.value)}
                placeholder="main"
                className="bg-[hsl(var(--obsidian-bg))] border-[hsl(var(--obsidian-border))]"
              />
            </div>
            {addError && <p className="text-sm text-red-400">{addError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddDialogOpen(false); setAddError(""); }}>
              Cancel
            </Button>
            <Button
              onClick={handleAddRepo}
              disabled={!newRepoName.trim()}
              className="bg-primary hover:bg-primary/90"
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(repoToRemove)}
        onOpenChange={(open) => { if (!open) setRepoToRemove(null); }}
        title="Remove workspace from this browser?"
        description={`This removes '${repoToRemove?.displayName || "the workspace"}' from this browser only. It does not delete the GitHub repository.`}
        confirmText="Remove workspace"
        onConfirm={() => {
          if (repoToRemove) handleDeleteRepo(repoToRemove.id);
          setRepoToRemove(null);
        }}
      />
    </Layout>
  );
}
