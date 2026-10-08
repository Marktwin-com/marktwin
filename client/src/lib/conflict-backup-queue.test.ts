import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  readLocalConflictBackups,
  rememberLocalConflictBackup,
  writeLocalConflictBackups,
} from "./conflict-backup-queue";

describe("browser backup cleanup queue", () => {
  const values = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };

  beforeEach(() => {
    values.clear();
    vi.stubGlobal("window", { localStorage });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("keeps unique branch names when server metadata is unavailable", () => {
    rememberLocalConflictBackup(3, "owner/repo", "main-marktwin-backup-NathWolf-20260817-120001");
    rememberLocalConflictBackup(3, "owner/repo", "main-marktwin-backup-NathWolf-20260817-120001");
    rememberLocalConflictBackup(3, "owner/repo", "main-marktwin-backup-NathWolf-20260817-120002");

    expect(readLocalConflictBackups(3, "owner/repo")).toEqual([
      "main-marktwin-backup-NathWolf-20260817-120001",
      "main-marktwin-backup-NathWolf-20260817-120002",
    ]);
  });

  it("quarantines manipulated and legacy branch names instead of queueing deletion", () => {
    values.set("marktwin.pendingConflictBackups.3.owner/repo", JSON.stringify([
      "main",
      "release",
      "main-marktwin-backup-legacy",
      "main-marktwin-backup-user-20260817-120001",
    ]));
    expect(readLocalConflictBackups(3, "owner/repo")).toEqual([
      "main-marktwin-backup-user-20260817-120001",
    ]);
  });

  it("clears the browser queue after cleanup succeeds", () => {
    writeLocalConflictBackups(3, "owner/repo", ["main-marktwin-backup-user-20260817-120001"]);
    writeLocalConflictBackups(3, "owner/repo", []);
    expect(readLocalConflictBackups(3, "owner/repo")).toEqual([]);
  });
});
