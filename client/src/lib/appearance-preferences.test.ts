import { describe, expect, it, vi } from "vitest";

import { appearanceThemeValues } from "@shared/appearance-themes";
import { appearanceThemePresets } from "./appearance-theme-catalog";
import {
  applyThemeAccent,
  isLightAppearanceTheme,
  normalizeAppearanceTheme,
  normalizeThemeColorIndex,
  resolveAccountAppearancePreferences,
  resolveStoredAppearanceTheme,
} from "./appearance-preferences";

describe("appearance preferences", () => {
  it("accepts every supported browser-local theme", () => {
    appearanceThemeValues.forEach((theme) => expect(normalizeAppearanceTheme(theme)).toBe(theme));
    expect(new Set(appearanceThemePresets.map((preset) => preset.value))).toEqual(new Set(appearanceThemeValues.filter((theme) => theme !== "root")));
  });

  it("falls back safely when stored theme or accent data is invalid", () => {
    expect(normalizeAppearanceTheme("shared-owner-theme")).toBe("light");
    expect(normalizeAppearanceTheme(null)).toBe("light");
    expect(normalizeThemeColorIndex("3")).toBe(3);
    expect(normalizeThemeColorIndex("99")).toBe(0);
    expect(normalizeThemeColorIndex("not-a-number")).toBe(0);
    expect(normalizeThemeColorIndex(-1)).toBe(0);
  });

  it("migrates the legacy implicit dark root default to Light", () => {
    expect(resolveStoredAppearanceTheme("root", false)).toBe("light");
    expect(resolveStoredAppearanceTheme("root", true)).toBe("dark");
    expect(resolveStoredAppearanceTheme("dark", true)).toBe("dark");
  });

  it("reads only explicitly stored account appearance preferences", () => {
    expect(resolveAccountAppearancePreferences({ theme: "dark", lightThemeColorIndex: 3, darkThemeColorIndex: "2" })).toEqual({
      theme: "dark",
      lightThemeColorIndex: 3,
      darkThemeColorIndex: 2,
    });
    expect(resolveAccountAppearancePreferences({ language: "en" })).toEqual({
      theme: null,
      lightThemeColorIndex: null,
      darkThemeColorIndex: null,
    });
  });

  it("uses the selected brand color without overriding readable hover surfaces", () => {
    const root = { style: { setProperty: vi.fn(), removeProperty: vi.fn() } } as unknown as HTMLElement;

    applyThemeAccent("light", 1, root);

    expect(root.style.setProperty).toHaveBeenCalledWith("--primary", "220 75% 42%");
    expect(root.style.setProperty).not.toHaveBeenCalledWith("--accent", expect.anything());
    expect(root.style.removeProperty).toHaveBeenCalledWith("--accent");
    expect(root.style.setProperty).toHaveBeenCalledWith("--obsidian-panel-hover", "220 75% 42% / 0.11");
    expect(root.style.setProperty).toHaveBeenCalledWith("--obsidian-hover", "220 75% 42% / 0.11");
    expect(root.style.setProperty).toHaveBeenCalledWith("--sidebar-accent", "220 75% 42% / 0.11");
  });

  it("classifies familiar palettes for light- and dark-aware editors", () => {
    expect(isLightAppearanceTheme("github-light")).toBe(true);
    expect(isLightAppearanceTheme("github-dark")).toBe(false);
    expect(isLightAppearanceTheme("wine")).toBe(false);
  });
});
