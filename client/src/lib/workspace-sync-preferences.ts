import { useQuery } from "@tanstack/react-query";

import { getSavedRepos, type SavedRepoLocal } from "./saved-repos";

export const AUTO_SYNC_INTERVAL_OPTIONS = [30, 60, 300] as const;
export type AutoSyncIntervalSeconds = (typeof AUTO_SYNC_INTERVAL_OPTIONS)[number];
export const DEFAULT_AUTO_SYNC_INTERVAL_SECONDS: AutoSyncIntervalSeconds = 60;

export function normalizeAutoSyncIntervalSeconds(value: unknown): AutoSyncIntervalSeconds {
  const number = typeof value === "number" ? value : Number(value);
  return AUTO_SYNC_INTERVAL_OPTIONS.includes(number as AutoSyncIntervalSeconds)
    ? number as AutoSyncIntervalSeconds
    : DEFAULT_AUTO_SYNC_INTERVAL_SECONDS;
}

export function autoSyncDelayMs(value: unknown) {
  return normalizeAutoSyncIntervalSeconds(value) * 1000;
}

export function formatAutoSyncInterval(seconds: AutoSyncIntervalSeconds) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = seconds / 60;
  return `${minutes} min`;
}

/**
 * Subscribe to the existing saved-repos query without starting a second request.
 * WorkspaceVaultPage already owns the authenticated query; disabled observers still
 * receive cache updates after Settings saves or invalidates Cabinet metadata.
 */
export function useAutoSyncInterval(repoFullName?: string | null) {
  const { data: repos = [] } = useQuery<SavedRepoLocal[]>({
    queryKey: ["saved-repos"],
    queryFn: () => getSavedRepos(),
    enabled: false,
  });
  const repo = repoFullName
    ? repos.find((candidate) => candidate.repoFullName === repoFullName)
    : undefined;
  return [normalizeAutoSyncIntervalSeconds(repo?.autoSyncIntervalSeconds)] as const;
}

export type SyncControlState = "unpublished" | "publishing" | "synced" | "error";

export function syncControlState(input: {
  unpublishedCount: number;
  publishing: boolean;
  error: boolean;
}): SyncControlState {
  if (input.publishing) return "publishing";
  if (input.error) return "error";
  if (input.unpublishedCount > 0) return "unpublished";
  return "synced";
}
