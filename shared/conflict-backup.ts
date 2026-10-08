const CONFLICT_BACKUP_PATTERN = /^[A-Za-z0-9._-]+-marktwin-backup-[A-Za-z0-9._-]+-\d{8}-\d{6}$/;

export function isMarktwinConflictBackupBranch(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= 255
    && CONFLICT_BACKUP_PATTERN.test(value)
    && !value.includes("..")
    && !value.endsWith(".");
}

export function canDeleteConflictBackupBranch(
  candidate: unknown,
  currentBranch: string,
  defaultBranch: string,
): candidate is string {
  return isMarktwinConflictBackupBranch(candidate)
    && candidate !== currentBranch
    && candidate !== defaultBranch;
}
