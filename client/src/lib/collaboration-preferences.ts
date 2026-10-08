import { useSyncExternalStore } from "react";
import type { CollaborationTransport } from "@shared/collaboration";

const TRANSPORT_STORAGE_KEY = "marktwin-collaboration-transport-preference";
const LEGACY_TURN_RELAY_STORAGE_KEY = "marktwin-collaboration-relay-preference";
const listeners = new Set<() => void>();

export function getCollaborationTransportPreference(): CollaborationTransport {
  if (typeof window === "undefined") return "direct";
  try {
    const selected = window.localStorage.getItem(TRANSPORT_STORAGE_KEY);
    if (selected === "relay" || selected === "direct") return selected;
    // Preserve the intent of people who explicitly remembered the old relay choice.
    return window.localStorage.getItem(LEGACY_TURN_RELAY_STORAGE_KEY) === "allowed" ? "relay" : "direct";
  } catch {
    return "direct";
  }
}

export function setCollaborationTransportPreference(transport: CollaborationTransport) {
  try {
    window.localStorage.setItem(TRANSPORT_STORAGE_KEY, transport);
    window.localStorage.removeItem(LEGACY_TURN_RELAY_STORAGE_KEY);
  } catch {
    // Keep the setting in memory for this render even when browser storage is unavailable.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === TRANSPORT_STORAGE_KEY || event.key === LEGACY_TURN_RELAY_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", handleStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useCollaborationTransportPreference() {
  return useSyncExternalStore(subscribe, getCollaborationTransportPreference, () => "direct" as const);
}
