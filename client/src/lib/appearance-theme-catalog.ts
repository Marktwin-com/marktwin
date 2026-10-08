import type { AppearanceTheme, SelectableAppearanceTheme } from "@shared/appearance-themes";

export type AppearanceThemeGroup = "marktwin" | "minimal" | "familiar" | "experimental";

export interface AppearanceThemePreset {
  value: SelectableAppearanceTheme;
  label: string;
  group: AppearanceThemeGroup;
  mode: "light" | "dark";
  preview: {
    background: string;
    panel: string;
    foreground: string;
    accent: string;
  };
}

const preset = (
  value: SelectableAppearanceTheme,
  label: string,
  group: AppearanceThemeGroup,
  mode: "light" | "dark",
  background: string,
  panel: string,
  foreground: string,
  accent: string,
): AppearanceThemePreset => ({ value, label, group, mode, preview: { background, panel, foreground, accent } });

export const appearanceThemePresets: readonly AppearanceThemePreset[] = [
  preset("light", "Paper", "marktwin", "light", "36 20% 97%", "36 14% 92%", "222 47% 11%", "325 50% 34%"),
  preset("cream", "Cream", "marktwin", "light", "42 45% 94%", "42 28% 89%", "225 15% 13%", "325 50% 25%"),
  preset("wine", "Wine", "marktwin", "dark", "325 48% 19%", "325 25% 22%", "43 77% 87%", "43 77% 87%"),
  preset("dark", "Dark", "marktwin", "dark", "225 6% 13%", "220 7% 18%", "210 40% 98%", "325 55% 45%"),
  preset("mono-light", "Pure White", "minimal", "light", "0 0% 100%", "0 0% 96%", "0 0% 3%", "0 0% 3%"),
  preset("mono-dark", "Pure Black", "minimal", "dark", "0 0% 0%", "0 0% 5%", "0 0% 96%", "0 0% 96%"),
  preset("github-light", "GitHub Light", "familiar", "light", "0 0% 100%", "210 29% 97%", "210 18% 16%", "212 92% 43%"),
  preset("github-dark", "GitHub Dark", "familiar", "dark", "216 28% 7%", "215 21% 11%", "210 17% 82%", "212 92% 67%"),
  preset("vscode-light", "VS Code Light", "familiar", "light", "0 0% 100%", "0 0% 95%", "0 0% 23%", "208 100% 36%"),
  preset("vscode-dark", "VS Code Dark", "familiar", "dark", "0 0% 12%", "0 0% 17%", "0 0% 80%", "207 100% 58%"),
  preset("obsidian-light", "Obsidian Light", "familiar", "light", "0 0% 100%", "0 0% 93%", "210 10% 20%", "248 82% 69%"),
  preset("obsidian-dark", "Obsidian Dark", "familiar", "dark", "0 0% 12%", "0 0% 20%", "0 0% 86%", "248 82% 69%"),
  preset("solarized-light", "Solarized Light", "familiar", "light", "44 87% 94%", "45 43% 88%", "194 14% 40%", "205 69% 49%"),
  preset("solarized-dark", "Solarized Dark", "familiar", "dark", "192 100% 11%", "192 72% 14%", "186 8% 55%", "205 69% 49%"),
  preset("dracula", "Dracula", "familiar", "dark", "231 15% 18%", "232 14% 31%", "60 30% 96%", "265 89% 78%"),
  preset("nord", "Nord", "familiar", "dark", "220 16% 22%", "220 16% 28%", "219 28% 88%", "193 43% 67%"),
  preset("rose-pine", "Rosé Pine", "familiar", "dark", "249 22% 12%", "248 21% 19%", "245 50% 91%", "267 57% 78%"),
  preset("tokyo-night", "Tokyo Night", "familiar", "dark", "235 21% 13%", "230 24% 19%", "229 75% 86%", "221 88% 72%"),
  preset("catppuccin-latte", "Catppuccin Latte", "familiar", "light", "220 23% 95%", "225 14% 88%", "234 16% 35%", "266 85% 58%"),
  preset("catppuccin-macchiato", "Catppuccin Macchiato", "familiar", "dark", "232 23% 18%", "230 18% 26%", "227 68% 88%", "267 83% 80%"),
  preset("gruvbox-dark", "Gruvbox Dark", "familiar", "dark", "0 0% 16%", "20 5% 22%", "43 59% 81%", "42 95% 60%"),
  preset("everforest-light", "Everforest Light", "familiar", "light", "48 56% 91%", "47 38% 84%", "200 11% 40%", "66 99% 32%"),
  preset("everforest-dark", "Everforest Dark", "familiar", "dark", "203 13% 20%", "198 13% 24%", "39 34% 75%", "82 36% 63%"),
  preset("matrix", "Matrix", "experimental", "dark", "120 20% 4%", "120 20% 10%", "120 65% 86%", "120 75% 54%"),
] as const;

export const appearanceThemeGroups: readonly AppearanceThemeGroup[] = ["marktwin", "minimal", "familiar", "experimental"];

const appearanceThemePresetMap = new Map(appearanceThemePresets.map((entry) => [entry.value, entry]));

export function getAppearanceThemePreset(theme: AppearanceTheme): AppearanceThemePreset {
  return appearanceThemePresetMap.get(theme === "root" ? "dark" : theme) ?? appearanceThemePresets[0];
}
