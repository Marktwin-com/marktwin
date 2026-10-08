import type { LibraryItems } from "@excalidraw/excalidraw/types";
import type { LibraryPersistenceAdapter } from "@excalidraw/excalidraw/data/library";

const STORAGE_KEY = "marktwin-excalidraw-library-v1";

/**
 * Excalidraw owns the library item schema and restores older item versions
 * itself. We only reject values that cannot possibly be a library collection.
 */
export function parseStoredExcalidrawLibrary(value: string | null): LibraryItems {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as LibraryItems : [];
  } catch {
    return [];
  }
}

export const marktwinExcalidrawLibraryAdapter: LibraryPersistenceAdapter = {
  load() {
    if (typeof window === "undefined") return null;
    return {
      libraryItems: parseStoredExcalidrawLibrary(window.localStorage.getItem(STORAGE_KEY)),
    };
  },
  save({ libraryItems }) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(libraryItems));
  },
};

export function excalidrawLibraryReturnUrl() {
  if (typeof window === "undefined") return undefined;
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.delete("addLibrary");
  return url.toString();
}
