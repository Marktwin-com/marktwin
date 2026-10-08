import type { WorkingSetItem } from "@shared/schema";

// Favorites are a personal browser preference, not shared Cabinet content.
// Keep them out of .marktwin so they do not create repository changes or sync
// one person's view to collaborators and other browsers.
function key(cabinetId: number | string, userId = "anonymous") {
  return `marktwin-working-set:${userId}:${cabinetId}`;
}

export function loadWorkingSet(cabinetId: number | string, userId = "anonymous"): WorkingSetItem[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(key(cabinetId, userId)) || "[]") as WorkingSetItem[];
    return Array.isArray(value) ? value.slice(0, 4) : [];
  } catch {
    return [];
  }
}

export function saveWorkingSet(cabinetId: number | string, items: WorkingSetItem[], userId = "anonymous") {
  if (typeof window !== "undefined") window.localStorage.setItem(key(cabinetId, userId), JSON.stringify(items));
}

export function toggleWorkingSetItem(cabinetId: number | string, item: Omit<WorkingSetItem, "addedAt">, userId = "anonymous") {
  const current = loadWorkingSet(cabinetId, userId);
  const existing = current.findIndex((candidate) => (item.id && candidate.id === item.id) || candidate.path === item.path);
  const next = existing >= 0
    ? current.filter((_, index) => index !== existing)
    : [{ ...item, addedAt: Date.now() }, ...current].slice(0, 4);
  saveWorkingSet(cabinetId, next, userId);
  return next;
}

export function pruneWorkingSet(cabinetId: number | string, paths: Set<string>, userId = "anonymous") {
  const next = loadWorkingSet(cabinetId, userId).filter((item) => paths.has(item.path));
  saveWorkingSet(cabinetId, next, userId);
  return next;
}
