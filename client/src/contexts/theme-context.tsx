import { createContext, useContext, useEffect, useState } from "react";
import { useLocalProfile } from "@/contexts/local-profile-context";
import {
  applyThemeAccent,
  darkThemeColorStorageKey,
  lightThemeColorStorageKey,
  normalizeThemeColorIndex,
  readThemeColorIndex,
  resolveAccountAppearancePreferences,
  resolveStoredAppearanceTheme,
  isLightAppearanceTheme,
  themePreferenceSetStorageKey,
  type AppearanceTheme,
} from "@/lib/appearance-preferences";
import { appearanceThemeValues } from "@shared/appearance-themes";

type Theme = AppearanceTheme;

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  darkThemeColorIndex: number;
  lightThemeColorIndex: number;
  setThemeColorIndex: (theme: "light" | "dark", index: number) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { profile, updateAppPreferences } = useLocalProfile();
  const [theme, setThemeState] = useState<Theme>(() => {
    const savedTheme = typeof window !== "undefined" ? window.localStorage.getItem("theme") : null;
    const explicitlySelected = typeof window !== "undefined" && window.localStorage.getItem(themePreferenceSetStorageKey) === "1";
    return resolveStoredAppearanceTheme(savedTheme, explicitlySelected);
  });
  const [darkThemeColorIndex, setDarkThemeColorIndex] = useState(() => readThemeColorIndex("dark"));
  const [lightThemeColorIndex, setLightThemeColorIndex] = useState(() => readThemeColorIndex("light"));

  const accountAppearance = resolveAccountAppearancePreferences(profile?.appPreferences);

  const setTheme = (nextTheme: Theme) => {
    localStorage.setItem(themePreferenceSetStorageKey, "1");
    setThemeState(nextTheme);
    if (profile) void updateAppPreferences({ theme: nextTheme });
  };

  const setThemeColorIndex = (selectedTheme: "light" | "dark", index: number) => {
    const normalizedIndex = normalizeThemeColorIndex(index);
    if (selectedTheme === "dark") {
      setDarkThemeColorIndex(normalizedIndex);
      window.localStorage.setItem(darkThemeColorStorageKey, String(normalizedIndex));
    } else {
      setLightThemeColorIndex(normalizedIndex);
      window.localStorage.setItem(lightThemeColorStorageKey, String(normalizedIndex));
    }
    if (profile) {
      void updateAppPreferences({
        [selectedTheme === "dark" ? "darkThemeColorIndex" : "lightThemeColorIndex"]: normalizedIndex,
      });
    }
  };

  useEffect(() => {
    window.localStorage.setItem("theme", theme);
    document.documentElement.classList.remove(...appearanceThemeValues, "theme-light", "theme-dark");
    if (theme !== "root") {
      document.documentElement.classList.add(theme);
    }
    document.documentElement.classList.add(isLightAppearanceTheme(theme) ? "theme-light" : "theme-dark");
    applyThemeAccent(theme, theme === "dark" ? darkThemeColorIndex : lightThemeColorIndex);
  }, [darkThemeColorIndex, lightThemeColorIndex, theme]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "theme") {
        const explicitlySelected = localStorage.getItem(themePreferenceSetStorageKey) === "1";
        setThemeState(resolveStoredAppearanceTheme(event.newValue, explicitlySelected));
        return;
      }
      if (event.key === darkThemeColorStorageKey || event.key === lightThemeColorStorageKey) {
        if (event.key === darkThemeColorStorageKey) {
          setDarkThemeColorIndex(normalizeThemeColorIndex(event.newValue));
        } else {
          setLightThemeColorIndex(normalizeThemeColorIndex(event.newValue));
        }
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, darkThemeColorIndex, lightThemeColorIndex, setThemeColorIndex }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
