import { useEffect, useMemo, useRef, useState } from "react";
import { FileArchive, FileText, Folder, Loader2, PanelsTopLeft, PenTool } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getBranches,
  getRootSnapshot,
  resolveSelectedRootScopes,
  type GitHubRootScope,
  type WorkspaceFileType,
} from "@/lib/workspace-github";
import { getSavedRepos, updateSavedRepo } from "@/lib/saved-repos";
import { TEXT_FILE_EXTENSION_SUMMARY } from "@/lib/text-files";
import { alwaysAvailableWorkspaceFileTypes } from "@/lib/workspace-formats";
import {
  AUTO_SYNC_INTERVAL_OPTIONS,
  formatAutoSyncInterval,
  normalizeAutoSyncIntervalSeconds,
  type AutoSyncIntervalSeconds,
} from "@/lib/workspace-sync-preferences";
import { useI18n } from "@/contexts/i18n-context";

export interface RepositoryConfiguration {
  branch: string;
  selectedRootScopes: string[];
  selectedFileTypes: WorkspaceFileType[];
  autoSync: boolean;
  autoSyncIntervalSeconds: AutoSyncIntervalSeconds;
  autoMergeNonOverlapping: boolean;
  createConflictBackup: boolean;
}

interface RepositoryConfigurationFormProps {
  token: string;
  repoFullName: string;
  initialBranch: string;
  initialRootScopes?: string[] | null;
  initialFileTypes?: string[] | null;
  initialAutoSync?: boolean;
  initialAutoSyncIntervalSeconds?: number;
  initialAutoMergeNonOverlapping?: boolean;
  initialCreateConflictBackup?: boolean;
  submitLabel?: string;
  contentDisabled?: boolean;
  disabledMessage?: string;
  readOnly?: boolean;
  readOnlyMessage?: string;
  onCancel?: () => void;
  onSave: (configuration: RepositoryConfiguration) => Promise<void> | void;
}

function configurationError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function RepositoryConfigurationForm({
  token,
  repoFullName,
  initialBranch,
  initialRootScopes,
  initialFileTypes,
  initialAutoSync = false,
  initialAutoSyncIntervalSeconds = 60,
  initialAutoMergeNonOverlapping = true,
  initialCreateConflictBackup = true,
  submitLabel,
  contentDisabled = false,
  disabledMessage,
  readOnly = false,
  readOnlyMessage,
  onCancel,
  onSave,
}: RepositoryConfigurationFormProps) {
  const { t } = useI18n();
  const [branch, setBranch] = useState(initialBranch);
  const [branches, setBranches] = useState<string[]>([]);
  const [emptyRepository, setEmptyRepository] = useState(false);
  const [scopes, setScopes] = useState<GitHubRootScope[]>([]);
  const [selectedScopes, setSelectedScopes] = useState<string[]>(initialRootScopes || []);
  const [selectedFileTypes, setSelectedFileTypes] = useState<WorkspaceFileType[]>(
    () => alwaysAvailableWorkspaceFileTypes(initialFileTypes),
  );
  const [autoSync, setAutoSync] = useState(initialAutoSync);
  const [autoSyncIntervalSeconds, setAutoSyncIntervalSeconds] = useState<AutoSyncIntervalSeconds>(() => normalizeAutoSyncIntervalSeconds(initialAutoSyncIntervalSeconds));
  const [autoMergeNonOverlapping, setAutoMergeNonOverlapping] = useState(initialAutoMergeNonOverlapping);
  const [createConflictBackup, setCreateConflictBackup] = useState(initialCreateConflictBackup);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [loadingScopes, setLoadingScopes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const initializedBranch = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingBranches(true);
    getBranches(token, repoFullName)
      .then((items) => {
        if (cancelled) return;
        const names = items.map((item) => item.name);
        setEmptyRepository(names.length === 0);
        setBranches(names.length === 0
          ? [initialBranch]
          : names.includes(initialBranch) ? names : [initialBranch, ...names]);
      })
      .catch((reason) => !cancelled && setError(configurationError(reason, t("errors.repoConfiguration"))))
      .finally(() => !cancelled && setLoadingBranches(false));
    return () => { cancelled = true; };
  }, [initialBranch, repoFullName, token]);

  useEffect(() => {
    let cancelled = false;
    setLoadingScopes(true);
    setError("");
    getRootSnapshot(token, repoFullName, branch)
      .then((snapshot) => {
        if (cancelled) return;
        setScopes(snapshot.scopes);
        setSelectedScopes((current) => {
          if (initializedBranch.current === null) {
            initializedBranch.current = branch;
            return resolveSelectedRootScopes(snapshot.scopes, initialRootScopes);
          }
          const available = new Set(snapshot.scopes.map((scope) => scope.key));
          const retained = current.filter((scope) => available.has(scope));
          return retained.length > 0 ? retained : resolveSelectedRootScopes(snapshot.scopes);
        });
      })
      .catch((reason) => !cancelled && setError(configurationError(reason, t("errors.repoConfiguration"))))
      .finally(() => !cancelled && setLoadingScopes(false));
    return () => { cancelled = true; };
  }, [branch, initialRootScopes, repoFullName, token]);

  const sortedScopes = useMemo(() => [...scopes].sort((left, right) => {
    if (left.key === ".agents") return -1;
    if (right.key === ".agents") return 1;
    if (left.key === "/") return -1;
    if (right.key === "/") return 1;
    return left.label.localeCompare(right.label);
  }), [scopes]);

  const toggleScope = (scope: string, checked: boolean) => {
    setSelectedScopes((current) => checked
      ? Array.from(new Set([...current, scope]))
      : current.filter((candidate) => candidate !== scope));
  };

  const toggleFileType = (fileType: WorkspaceFileType, checked: boolean) => {
    if (fileType !== "asset") return;
    setSelectedFileTypes((current) => checked
      ? alwaysAvailableWorkspaceFileTypes([...current, fileType])
      : alwaysAvailableWorkspaceFileTypes(current.filter((candidate) => candidate !== fileType)));
  };

  const handleSubmit = async () => {
    if (readOnly) return;
    setError("");
    if (selectedScopes.length === 0) {
      setError(t("repo.selectFolder"));
      return;
    }
    setSaving(true);
    try {
      const savedRepo = (await getSavedRepos()).find((repo) => repo.repoFullName === repoFullName);
      if (!savedRepo) throw new Error(t("errors.repoNotFound"));
      await updateSavedRepo(savedRepo.id, { autoSyncIntervalSeconds });
      await onSave({ branch, selectedRootScopes: selectedScopes, selectedFileTypes: alwaysAvailableWorkspaceFileTypes(selectedFileTypes), autoSync, autoSyncIntervalSeconds, autoMergeNonOverlapping, createConflictBackup });
    } catch (reason) {
      setError(configurationError(reason, t("errors.repoConfiguration")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {disabledMessage && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          {disabledMessage}
        </p>
      )}
      {readOnlyMessage && (
        <p className="rounded-md border border-[hsl(var(--obsidian-accent)/0.35)] bg-[hsl(var(--obsidian-accent)/0.08)] p-3 text-sm text-[hsl(var(--obsidian-text-muted))]">
          {readOnlyMessage}
        </p>
      )}

      <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-5 border-0 p-0">
      <div className="rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg))] p-3 text-sm text-muted-foreground">
        {t("repo.defaultNotice")}
      </div>
      {emptyRepository && (
        <div className="rounded-md border border-[hsl(var(--obsidian-accent)/0.45)] bg-[hsl(var(--obsidian-panel))] p-3 text-sm text-[hsl(var(--obsidian-text))]">
          {t("repo.emptyRepositoryNotice")}
        </div>
      )}
      <div className="rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg))] p-3 text-sm">
        <label htmlFor="repository-auto-sync" className="flex cursor-pointer items-start gap-3">
          <Checkbox id="repository-auto-sync" checked={autoSync} onCheckedChange={(checked) => setAutoSync(checked === true)} disabled={saving} />
          <span><span className="font-medium">{t("repo.autoSync")}</span><span className="mt-1 block text-xs text-muted-foreground">{t("repo.autoSyncHelp")}</span></span>
        </label>
        {autoSync && (
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-[hsl(var(--obsidian-border))] pt-3">
            <span className="text-xs text-muted-foreground">{t("repo.autoSync")}</span>
            <Select
              value={String(autoSyncIntervalSeconds)}
              onValueChange={(value) => setAutoSyncIntervalSeconds(normalizeAutoSyncIntervalSeconds(value))}
              disabled={saving}
            >
              <SelectTrigger className="h-8 w-28 bg-[hsl(var(--obsidian-panel))]" aria-label={t("repo.autoSync")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTO_SYNC_INTERVAL_OPTIONS.map((seconds) => (
                  <SelectItem key={seconds} value={String(seconds)}>{formatAutoSyncInterval(seconds)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <Button type="button" variant="outline" className="w-full" onClick={() => setShowAdvanced((value) => !value)}>
        {showAdvanced ? t("repo.advanced.hide") : t("repo.advanced.show")}
      </Button>

      {showAdvanced && <>
        <div className="space-y-2">
          <Label htmlFor="workspace-branch">{t("repo.branch")}</Label>
          <Select value={branch} onValueChange={setBranch} disabled={contentDisabled || loadingBranches || saving}>
            <SelectTrigger id="workspace-branch" className="bg-[hsl(var(--obsidian-bg))] border-[hsl(var(--obsidian-border))]">
              <SelectValue placeholder={loadingBranches ? t("repo.loadingBranches") : t("repo.selectBranch")} />
            </SelectTrigger>
            <SelectContent>
              {branches.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
        <div>
          <Label>{t("repo.folders")}</Label>
          <p className="mt-1 text-xs text-muted-foreground">{t("repo.foldersHelp")}</p>
        </div>
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg))] p-3">
          {loadingScopes ? (
            <div className="flex items-center py-3 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("repo.loadingFolders")}</div>
          ) : sortedScopes.map((scope) => (
            <label key={scope.key} className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 text-sm hover:bg-[hsl(var(--obsidian-panel-hover))]">
              <Checkbox
                checked={selectedScopes.includes(scope.key)}
                onCheckedChange={(checked) => toggleScope(scope.key, checked === true)}
                disabled={contentDisabled || saving}
              />
              <Folder className="h-4 w-4 text-[hsl(var(--folder-icon))]" />
              <span>{scope.label}</span>
            </label>
          ))}
        </div>
        </div>

        <div className="space-y-2">
        <div>
          <Label>{t("repo.fileTypes")}</Label>
          <p className="mt-1 text-xs text-muted-foreground">{t("repo.fileTypesHelp")}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          {([
            { type: "markdown" as const, label: t("repo.markdown"), extension: TEXT_FILE_EXTENSION_SUMMARY, icon: FileText, color: "text-blue-400" },
            { type: "canvas" as const, label: t("repo.canvas"), extension: ".canvas", icon: PanelsTopLeft, color: "text-violet-400" },
            { type: "drawing" as const, label: t("repo.drawing"), extension: ".excalidraw", icon: PenTool, color: "text-amber-400" },
            { type: "asset" as const, label: t("repo.asset"), extension: ".mp4 · .mp3 · .pdf · …", icon: FileArchive, color: "text-emerald-400" },
          ]).map(({ type, label, extension, icon: Icon, color }) => (
            <label key={type} className={`flex items-start gap-3 rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg))] p-3 text-sm ${type === "asset" ? "cursor-pointer" : "cursor-default"}`}>
              <Checkbox
                checked={type === "asset" ? selectedFileTypes.includes(type) : true}
                onCheckedChange={(checked) => toggleFileType(type, checked === true)}
                disabled={type !== "asset" || contentDisabled || saving}
              />
              <span className="min-w-0"><span className="flex items-center gap-2"><Icon className={`h-4 w-4 ${color}`} />{label}</span><span className="mt-1 block text-xs text-muted-foreground">{extension}</span></span>
            </label>
          ))}
        </div>
        </div>

        <div className="space-y-2">
        <div>
          <Label>{t("repo.mergeSafety")}</Label>
          <p className="mt-1 text-xs text-muted-foreground">{t("repo.mergeSafetyHelp")}</p>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg))] p-3 text-sm">
          <Checkbox checked={autoMergeNonOverlapping} onCheckedChange={(checked) => setAutoMergeNonOverlapping(checked === true)} disabled={saving} />
          <span><span className="font-medium">{t("repo.autoMerge")}</span><span className="mt-1 block text-xs text-muted-foreground">{t("repo.autoMergeHelp")}</span></span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg))] p-3 text-sm">
          <Checkbox checked={createConflictBackup} onCheckedChange={(checked) => setCreateConflictBackup(checked === true)} disabled={saving} />
          <span><span className="font-medium">{t("repo.backup")}</span><span className="mt-1 block text-xs text-muted-foreground">{t("repo.backupHelp")}</span></span>
        </label>
        </div>
      </>}

      {error && <p id="repository-configuration-error" role="alert" aria-live="assertive" className="text-sm text-red-400">{error}</p>}

      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>{t("common.cancel")}</Button>}
        {!readOnly && <Button type="button" onClick={() => void handleSubmit()} disabled={loadingScopes || loadingBranches || saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {saving ? t("common.saving") : submitLabel || t("repo.saveOpen")}
        </Button>}
      </div>
      </fieldset>
    </div>
  );
}
