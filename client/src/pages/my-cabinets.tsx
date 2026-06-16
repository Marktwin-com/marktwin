import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Github, Plus, FolderOpen, Trash2 } from "lucide-react";
import { getSavedRepos, addSavedRepo, deleteSavedRepo, type SavedRepoLocal } from "@/lib/saved-repos";

export default function MyCabinets() {
  const [, setLocation] = useLocation();
  const [repos, setRepos] = useState<SavedRepoLocal[]>([]);

  // Token dialog state
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<SavedRepoLocal | null>(null);
  const [token, setToken] = useState("");

  // Add repo dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoBranch, setNewRepoBranch] = useState("main");
  const [addError, setAddError] = useState("");

  useEffect(() => {
    setRepos(getSavedRepos());
  }, []);

  const handleOpenCabinet = (repo: SavedRepoLocal) => {
    setSelectedRepo(repo);
    const repoName = repo.repoFullName.split('/')[1] || repo.repoFullName;
    const saved = sessionStorage.getItem(`gh-token-${repoName}`);
    setToken(saved || "");
    setTokenDialogOpen(true);
  };

  const handleEnterCabinet = () => {
    if (!selectedRepo || !token.trim()) return;
    const repoName = selectedRepo.repoFullName.split('/')[1] || selectedRepo.repoFullName;
    sessionStorage.setItem(`gh-token-${repoName}`, token.trim());
    setTokenDialogOpen(false);
    setLocation(`/cabinet/${repoName}`);
  };

  const handleAddRepo = () => {
    setAddError("");
    if (!newRepoName.trim().includes("/")) {
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
  };

  const handleDeleteRepo = (repoId: number) => {
    deleteSavedRepo(repoId);
    setRepos((prev) => prev.filter((r) => r.id !== repoId));
    sessionStorage.removeItem(`gh-token-${repoId}`);
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[hsl(var(--obsidian-text))]">My Cabinets</h1>
            <p className="text-[hsl(var(--obsidian-text-muted))] mt-1">
              Open a GitHub repository with a personal access token. The token is kept in this
              browser's session storage only and is never sent to a server.
            </p>
          </div>
          <Button onClick={() => setAddDialogOpen(true)} className="bg-primary hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-2" />
            New Cabinet
          </Button>
        </div>

        {repos.length === 0 ? (
          <div className="text-center py-16">
            <Github className="h-12 w-12 mx-auto mb-4 text-[hsl(var(--obsidian-text-muted))] opacity-50" />
            <p className="text-[hsl(var(--obsidian-text-muted))] mb-4">No cabinets yet. Add a GitHub repository to get started.</p>
            <Button onClick={() => setAddDialogOpen(true)} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Create your first cabinet
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            {repos.map((repo) => (
              <Card
                key={repo.id}
                className="bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))] hover:border-primary/50 transition-colors group"
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4">
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
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteRepo(repo.id);
                      }}
                      title="Remove repository"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleOpenCabinet(repo)}
                      className="bg-primary hover:bg-primary/90"
                    >
                      <FolderOpen className="h-4 w-4 mr-2" />
                      Open Cabinet
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
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-[hsl(var(--obsidian-panel))] rounded-lg p-3 text-sm text-[hsl(var(--obsidian-text-muted))]">
              Your token is stored only in this browser's session storage and is never sent to a server.
            </div>
            <div className="space-y-2">
              <Label htmlFor="gh-token">GitHub Token (PAT or OAuth)</Label>
              <Input
                id="gh-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEnterCabinet()}
                placeholder="ghp_…"
                autoComplete="current-password"
                className="bg-[hsl(var(--obsidian-bg))] border-[hsl(var(--obsidian-border))]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTokenDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEnterCabinet}
              disabled={!token.trim()}
              className="bg-primary hover:bg-primary/90"
            >
              <FolderOpen className="h-4 w-4 mr-2" />
              Enter Cabinet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add repo dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))]">
          <DialogHeader>
            <DialogTitle>New Cabinet</DialogTitle>
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
              New Cabinet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
