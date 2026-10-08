export interface VersionedDrawingElement {
  id: string;
  version?: number;
  versionNonce?: number;
  [key: string]: unknown;
}

function versionOf(element: VersionedDrawingElement) {
  return typeof element.version === "number" && Number.isFinite(element.version) ? element.version : 0;
}

function nonceOf(element: VersionedDrawingElement) {
  return typeof element.versionNonce === "number" && Number.isFinite(element.versionNonce) ? element.versionNonce : 0;
}

/**
 * Reconcile a fresh shared scene with the scene currently visible in Excalidraw.
 * A local gesture may be newer than the latest Yjs render, so replacing the
 * scene with the shared copy verbatim can shorten or remove an active stroke.
 * Equal-version conflicts use Excalidraw's stable version nonce as a tie-breaker.
 */
export function reconcileDrawingElements<T extends VersionedDrawingElement>(
  incoming: readonly T[],
  local: readonly T[],
) {
  const localById = new Map(local.map((element) => [element.id, element]));
  const incomingIds = new Set(incoming.map((element) => element.id));
  const reconciled = incoming.map((incomingElement) => {
    const localElement = localById.get(incomingElement.id);
    if (!localElement) return incomingElement;
    const incomingVersion = versionOf(incomingElement);
    const localVersion = versionOf(localElement);
    if (localVersion > incomingVersion) return localElement;
    if (localVersion < incomingVersion) return incomingElement;

    const incomingNonce = nonceOf(incomingElement);
    const localNonce = nonceOf(localElement);
    if (localNonce === incomingNonce) return localElement;
    return localNonce < incomingNonce ? localElement : incomingElement;
  });

  for (const localElement of local) {
    if (!incomingIds.has(localElement.id)) reconciled.push(localElement);
  }
  return reconciled;
}
