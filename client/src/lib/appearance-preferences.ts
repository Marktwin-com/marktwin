import {
  appearanceThemeValues,
  type AppearanceTheme,
} from "@shared/appearance-themes";

export type { AppearanceTheme, SelectableAppearanceTheme } from "@shared/appearance-themes";

export function isLightAppearanceTheme(theme: AppearanceTheme): boolean {
  return theme.endsWith("light") || theme === "cream" || theme.endsWith("latte");
}

export const appearanceColorOptions = [
  {
    name: "Plum",
    primary: "325 55% 45%",
    lightPrimary: "325 62% 36%",
  },
  {
    name: "Blue",
    primary: "220 90% 60%",
    lightPrimary: "220 75% 42%",
  },
  {
    name: "Emerald",
    primary: "142 76% 36%",
    lightPrimary: "142 72% 27%",
  },
  {
    name: "Orange",
    primary: "30 100% 50%",
    lightPrimary: "24 85% 38%",
  },
  {
    name: "Pink",
    primary: "340 82% 65%",
    lightPrimary: "340 68% 42%",
  },
] as const;

export const darkThemeColorStorageKey = "darkThemeColorIndex";
export const lightThemeColorStorageKey = "lightThemeColorIndex";
export const themePreferenceSetStorageKey = "marktwinThemePreferenceSet";

export interface AccountAppearancePreferences {
  theme: AppearanceTheme | null;
  lightThemeColorIndex: number | null;
  darkThemeColorIndex: number | null;
}

export function normalizeAppearanceTheme(value: unknown): AppearanceTheme {
  return typeof value === "string" && appearanceThemeValues.includes(value as AppearanceTheme) ? value as AppearanceTheme : "light";
}

export function resolveAccountAppearancePreferences(value: unknown): AccountAppearancePreferences {
  const preferences = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    theme: Object.hasOwn(preferences, "theme") ? normalizeAppearanceTheme(preferences.theme) : null,
    lightThemeColorIndex: Object.hasOwn(preferences, "lightThemeColorIndex")
      ? normalizeThemeColorIndex(preferences.lightThemeColorIndex)
      : null,
    darkThemeColorIndex: Object.hasOwn(preferences, "darkThemeColorIndex")
      ? normalizeThemeColorIndex(preferences.darkThemeColorIndex)
      : null,
  };
}

export function resolveStoredAppearanceTheme(value: unknown, explicitlySelected: boolean): AppearanceTheme {
  // `root` was the old dark default and is now represented by Dark with the
  // first (Plum) accent. Keep unmarked legacy values on the first-visit Light
  // default, but migrate an explicitly selected Root preference to Dark.
  if (value === "root") return explicitlySelected ? "dark" : "light";
  return normalizeAppearanceTheme(value);
}

export function normalizeThemeColorIndex(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed >= appearanceColorOptions.length) return 0;
  return parsed;
}

export function readThemeColorIndex(theme: "light" | "dark"): number {
  if (typeof window === "undefined") return 0;
  return normalizeThemeColorIndex(localStorage.getItem(theme === "dark" ? darkThemeColorStorageKey : lightThemeColorStorageKey));
}

export function applyThemeAccent(
  theme: AppearanceTheme,
  index = theme === "light" || theme === "dark" ? readThemeColorIndex(theme) : 0,
  root = document.documentElement,
) {
  if (theme !== "light" && theme !== "dark") {
    root.removeAttribute("style");
    return;
  }

  const color = appearanceColorOptions[normalizeThemeColorIndex(index)];
  const primary = theme === "light" ? color.lightPrimary : color.primary;
  const hover = `${primary} / ${theme === "light" ? "0.11" : "0.16"}`;
  root.style.setProperty("--primary", primary);
  // Accent is the neutral hover surface, not the brand color. Clear legacy
  // inline values so theme CSS can keep ghost controls readable.
  root.style.removeProperty("--accent");
  root.style.setProperty("--ring", primary);
  root.style.setProperty("--obsidian-accent", primary);
  root.style.setProperty("--obsidian-panel-hover", hover);
  root.style.setProperty("--obsidian-hover", hover);
  root.style.setProperty("--sidebar-accent", hover);
  root.style.setProperty("--sidebar-accent-foreground", "var(--foreground)");
  root.style.setProperty("--sidebar-ring", primary);
}

export function saveThemeColorIndex(theme: "light" | "dark", index: number) {
  const normalizedIndex = normalizeThemeColorIndex(index);
  if (typeof window !== "undefined") {
    localStorage.setItem(theme === "dark" ? darkThemeColorStorageKey : lightThemeColorStorageKey, String(normalizedIndex));
  }
  applyThemeAccent(theme, normalizedIndex);
}
