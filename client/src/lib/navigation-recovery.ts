const ROUTE_RECOVERY_KEY = "marktwin:route-recovery";

const dynamicImportFailurePatterns = [
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
  /loading (?:css )?chunk [\w-]+ failed/i,
  /chunkloaderror/i,
  /unable to preload css/i,
];

function errorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

export function isDynamicImportFailure(error: unknown): boolean {
  const message = errorMessage(error);
  return dynamicImportFailurePatterns.some((pattern) => pattern.test(message));
}

export function shouldReloadForDynamicImportFailure(
  error: unknown,
  currentHref: string,
  recoveredHref: string | null,
): boolean {
  return isDynamicImportFailure(error) && recoveredHref !== currentHref;
}

function readRecoveredHref(): string | null {
  try {
    return window.sessionStorage.getItem(ROUTE_RECOVERY_KEY);
  } catch {
    return null;
  }
}

function rememberRecoveredHref(href: string): boolean {
  try {
    window.sessionStorage.setItem(ROUTE_RECOVERY_KEY, href);
    return true;
  } catch {
    // Without a marker, reloading could create a loop.
    return false;
  }
}

function clearRecoveredHref(): void {
  try {
    window.sessionStorage.removeItem(ROUTE_RECOVERY_KEY);
  } catch {
    // Storage can be disabled without affecting successful navigation.
  }
}

export function recoverStaleClient(error: unknown): boolean {
  const href = window.location.href;
  if (!shouldReloadForDynamicImportFailure(error, href, readRecoveredHref())) return false;

  if (!rememberRecoveredHref(href)) return false;
  window.location.reload();
  return true;
}

export async function loadRoute<T>(importer: () => Promise<T>): Promise<T> {
  try {
    const routeModule = await importer();
    clearRecoveredHref();
    return routeModule;
  } catch (error) {
    if (recoverStaleClient(error)) {
      // Keep the current Suspense fallback mounted while the browser reloads.
      return new Promise<T>(() => undefined);
    }
    throw error;
  }
}

export function installDynamicImportRecovery(): () => void {
  const handlePreloadError = (event: Event) => {
    const preloadEvent = event as Event & { payload?: unknown };
    if (recoverStaleClient(preloadEvent.payload)) event.preventDefault();
  };

  window.addEventListener("vite:preloadError", handlePreloadError);
  return () => window.removeEventListener("vite:preloadError", handlePreloadError);
}
