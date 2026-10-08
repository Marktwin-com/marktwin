import { appearanceColorOptions } from "@/lib/appearance-preferences";

export const IDENTITY_COLOR_PALETTE = [
  "#375A7F",
  "#5B4B8A",
  "#2F6B5F",
  "#8A4F5D",
  "#705C3A",
  "#3F6380",
  "#6B5A82",
  "#496A4B",
] as const;

export const AVATAR_COLOR_COUNT = 5;

export interface UserAvatarPreferences {
  colorIndex: number;
  configured?: boolean;
}

export interface UserIdentitySource {
  id?: string | number | null;
  username?: string | null;
  email?: string | null;
  displayName?: string | null;
}

export interface ResolvedUserIdentity {
  stableId: string;
  displayName: string;
  initial: string;
  color: typeof IDENTITY_COLOR_PALETTE[number];
}

export function normalizeAvatarColorIndex(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed < AVATAR_COLOR_COUNT ? parsed : 0;
}

export function getUserAvatarColor(avatar: UserAvatarPreferences | null | undefined, fallbackColor: string) {
  if (!avatar) return fallbackColor;
  return `hsl(${appearanceColorOptions[normalizeAvatarColorIndex(avatar.colorIndex)].primary})`;
}

export function resolveUserAvatarPreferences(appPreferences: unknown): UserAvatarPreferences {
  const preferences = appPreferences && typeof appPreferences === "object"
    ? appPreferences as Record<string, unknown>
    : {};
  return {
    colorIndex: normalizeAvatarColorIndex(preferences.avatarColorIndex),
    configured: "avatarColorIndex" in preferences,
  };
}

function normalized(value: string | number | null | undefined) {
  return String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function stableHash(value: string) {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) || 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function getAvatarColor(stableIdentity: string | number) {
  const key = normalized(stableIdentity) || "anonymous";
  return IDENTITY_COLOR_PALETTE[stableHash(key) % IDENTITY_COLOR_PALETTE.length];
}

export function resolveUserIdentity(source: UserIdentitySource, fallbackStableId = "anonymous"): ResolvedUserIdentity {
  const username = source.username?.trim();
  const email = source.email?.trim();
  const displayName = source.displayName?.trim() || username || email?.split("@")[0] || "Anonymous";
  const stableId = source.id !== null && source.id !== undefined && String(source.id).trim()
    ? `account:${normalized(source.id)}`
    : username
      ? `username:${normalized(username)}`
      : email
        ? `email:${normalized(email)}`
        : `guest:${normalized(fallbackStableId) || "anonymous"}`;
  const initial = Array.from(displayName.normalize("NFKC"))[0]?.toLocaleUpperCase() || "?";
  return { stableId, displayName, initial, color: getAvatarColor(stableId) };
}
