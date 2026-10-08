export type AppearanceTheme =
  | "root"
  | "light"
  | "cream"
  | "wine"
  | "dark"
  | "mono-light"
  | "mono-dark"
  | "github-light"
  | "github-dark"
  | "vscode-light"
  | "vscode-dark"
  | "obsidian-light"
  | "obsidian-dark"
  | "solarized-light"
  | "solarized-dark"
  | "dracula"
  | "nord"
  | "rose-pine"
  | "tokyo-night"
  | "catppuccin-latte"
  | "catppuccin-macchiato"
  | "gruvbox-dark"
  | "everforest-light"
  | "everforest-dark"
  | "matrix";

// A compact runtime representation keeps the complete validation list out of
// repeated array punctuation in the landing bundle while preserving its type.
export const appearanceThemeValues = "root light cream wine dark mono-light mono-dark github-light github-dark vscode-light vscode-dark obsidian-light obsidian-dark solarized-light solarized-dark dracula nord rose-pine tokyo-night catppuccin-latte catppuccin-macchiato gruvbox-dark everforest-light everforest-dark matrix".split(" ") as [AppearanceTheme, ...AppearanceTheme[]];

export type SelectableAppearanceTheme = Exclude<AppearanceTheme, "root">;
