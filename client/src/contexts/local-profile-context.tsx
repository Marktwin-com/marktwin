import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export interface LocalProfile { id: string; username: string; appPreferences: Record<string, unknown>; }
const KEY = "marktwin:local-profile";
function readProfile(): LocalProfile {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "null");
    if (value && typeof value.id === "string" && typeof value.username === "string" && value.appPreferences && typeof value.appPreferences === "object") return value;
  } catch { /* A new local profile can still be used when storage is unavailable. */ }
  const id = crypto.randomUUID();
  const profile = { id, username: `Guest ${id.slice(-4)}`, appPreferences: {} };
  try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* Session-only fallback. */ }
  return profile;
}
const Context = createContext<{
  profile: LocalProfile;
  updateUsername: (name: string) => Promise<boolean>;
  updateAppPreferences: (values: Record<string, unknown>) => Promise<boolean>;
} | null>(null);
export function LocalProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState(readProfile);
  const current = useRef(profile);
  const save = useCallback((changes: Partial<LocalProfile>) => {
    const next = { ...current.current, ...changes };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { return false; }
    current.current = next;
    setProfile(next);
    return true;
  }, []);
  const updateUsername = useCallback(async (name: string) => {
    const username = name.trim().slice(0, 80);
    return Boolean(username) && save({ username });
  }, [save]);
  const updateAppPreferences = useCallback(async (values: Record<string, unknown>) => save({ appPreferences: { ...current.current.appPreferences, ...values } }), [save]);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== KEY) return;
      const next = readProfile(); current.current = next; setProfile(next);
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  return <Context.Provider value={{ profile, updateUsername, updateAppPreferences }}>{children}</Context.Provider>;
}
export function useLocalProfile() {
  const value = useContext(Context);
  if (!value) throw new Error("useLocalProfile requires LocalProfileProvider");
  return value;
}
