import * as Y from "yjs";
import { readCabinetNotes, readFolderRecords, restoreCabinetSnapshot, type ScopeContent } from "./cabinet-files";
import { atomicChangesBetween, snapshotFromScopes, snapshotFromWorkspace } from "./workspace-merge";

const DATABASE_NAME = "marktwin-workspace-recovery";
const DATABASE_VERSION = 1;
const STORE_NAME = "drafts";

export interface WorkspaceRecoveryRecord {
  key: string;
  repoId: number;
  repoFullName: string;
  branch: string;
  baseCommitSha: string;
  baseTreeSha: string;
  selectedScopes: string[];
  baseline: ScopeContent[];
  update: ArrayBuffer;
  dirty: boolean;
  updatedAt: number;
}

function normalizedRepoFullName(repoFullName: string) {
  return repoFullName.trim().toLocaleLowerCase("en-US");
}

function legacyWorkspaceRecoveryKey(repoId: number, branch: string) {
  return `${repoId}:${branch}`;
}

export function workspaceRecoveryKey(repoId: number, repoFullName: string, branch: string) {
  return `v2:${repoId}:${encodeURIComponent(normalizedRepoFullName(repoFullName))}:${encodeURIComponent(branch)}`;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Browser recovery storage is unavailable."));
  });
}

async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, mode);
      const request = operation(tx.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Browser recovery storage operation failed."));
      tx.onerror = () => reject(tx.error || new Error("Browser recovery storage transaction failed."));
    });
  } finally {
    database.close();
  }
}

export async function loadWorkspaceRecovery(repoId: number, repoFullName: string, branch: string) {
  const current = await transaction<WorkspaceRecoveryRecord | undefined>("readonly", (store) => store.get(workspaceRecoveryKey(repoId, repoFullName, branch)));
  if (current) return current;
  const legacy = await transaction<WorkspaceRecoveryRecord | undefined>("readonly", (store) => store.get(legacyWorkspaceRecoveryKey(repoId, branch)));
  return legacy && normalizedRepoFullName(legacy.repoFullName) === normalizedRepoFullName(repoFullName)
    ? legacy
    : undefined;
}

export function saveWorkspaceRecovery(input: Omit<WorkspaceRecoveryRecord, "key" | "update" | "updatedAt"> & { doc: Y.Doc }) {
  const update = Y.encodeStateAsUpdate(input.doc);
  const record: WorkspaceRecoveryRecord = {
    ...input,
    key: workspaceRecoveryKey(input.repoId, input.repoFullName, input.branch),
    update: update.buffer.slice(update.byteOffset, update.byteOffset + update.byteLength) as ArrayBuffer,
    updatedAt: Date.now(),
  };
  const { doc: _doc, ...stored } = record as WorkspaceRecoveryRecord & { doc?: Y.Doc };
  return transaction<IDBValidKey>("readwrite", (store) => store.put(stored));
}

export async function clearWorkspaceRecovery(repoId: number, repoFullName: string, branch: string) {
  const legacy = await transaction<WorkspaceRecoveryRecord | undefined>("readonly", (store) => store.get(legacyWorkspaceRecoveryKey(repoId, branch)));
  await transaction<undefined>("readwrite", (store) => store.delete(workspaceRecoveryKey(repoId, repoFullName, branch)) as IDBRequest<undefined>);
  if (legacy && normalizedRepoFullName(legacy.repoFullName) === normalizedRepoFullName(repoFullName)) {
    await transaction<undefined>("readwrite", (store) => store.delete(legacyWorkspaceRecoveryKey(repoId, branch)) as IDBRequest<undefined>);
  }
}

export async function clearWorkspaceRecoveryForRepo(repoId: number) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAllKeys();
      request.onsuccess = () => {
        const legacyPrefix = `${repoId}:`;
        const currentPrefix = `v2:${repoId}:`;
        for (const key of request.result) {
          if (typeof key === "string" && (key.startsWith(legacyPrefix) || key.startsWith(currentPrefix))) store.delete(key);
        }
      };
      request.onerror = () => reject(request.error || new Error("Browser recovery cleanup failed."));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Browser recovery cleanup failed."));
      tx.onabort = () => reject(tx.error || new Error("Browser recovery cleanup was canceled."));
    });
  } finally {
    database.close();
  }
}

export async function clearAllWorkspaceRecovery() {
  return transaction<undefined>("readwrite", (store) => store.clear() as IDBRequest<undefined>);
}

export function applyWorkspaceRecovery(
  doc: Y.Doc,
  record: WorkspaceRecoveryRecord,
  expected: { repoId: number; repoFullName: string; branch: string },
) {
  if (
    record.repoId !== expected.repoId
    || normalizedRepoFullName(record.repoFullName) !== normalizedRepoFullName(expected.repoFullName)
    || record.branch !== expected.branch
  ) {
    throw new Error("Local recovery belongs to a different Cabinet, repository, or branch.");
  }
  const recovered = new Y.Doc();
  try {
    Y.applyUpdate(recovered, new Uint8Array(record.update), "browser-recovery-read");
    restoreCabinetSnapshot(doc, recovered);
  } finally {
    recovered.destroy();
  }
}

/**
 * A checkpoint can reach GitHub before an immediate post-sync refresh settles.
 * On the next load, detect that the preserved browser draft is already exactly
 * the remote tree so it can be retired without publishing a duplicate commit.
 */
export function workspaceRecoveryMatchesRemoteContent(
  record: WorkspaceRecoveryRecord,
  content: ScopeContent[],
  expected: { repoId: number; repoFullName: string; branch: string },
) {
  const recovered = new Y.Doc();
  try {
    applyWorkspaceRecovery(recovered, record, expected);
    const local = snapshotFromWorkspace(
      readCabinetNotes(recovered, 0, true).filter((note) => note.status !== "deleted"),
      readFolderRecords(recovered, true).filter((folder) => folder.status !== "deleted"),
    );
    return atomicChangesBetween(snapshotFromScopes(content), local).length === 0;
  } finally {
    recovered.destroy();
  }
}

export async function requestPersistentWorkspaceStorage() {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted?.()) return true;
  return navigator.storage.persist();
}
