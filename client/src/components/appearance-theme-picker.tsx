import { useMemo, useState } from "react";
import { Check, ChevronDown, Moon, Search, Sun } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTheme } from "@/contexts/theme-context";
import { useI18n } from "@/contexts/i18n-context";
import {
  appearanceColorOptions,
  type SelectableAppearanceTheme,
} from "@/lib/appearance-preferences";
import {
  appearanceThemeGroups,
  appearanceThemePresets,
  getAppearanceThemePreset,
  type AppearanceThemeGroup,
  type AppearanceThemePreset,
} from "@/lib/appearance-theme-catalog";
import { cn } from "@/lib/utils";

const localizedThemeLabelKeys: Partial<Record<SelectableAppearanceTheme, string>> = {
  cream: "settings.creamTheme",
  dark: "settings.darkTheme",
  matrix: "settings.matrixTheme",
};

const localThemeLabels: Record<"en" | "es", Partial<Record<SelectableAppearanceTheme, string>>> = {
  en: { light: "Paper", "mono-light": "Pure White", "mono-dark": "Pure Black" },
  es: { light: "Papel", wine: "Vino", "mono-light": "Blanco puro", "mono-dark": "Negro puro" },
};

const groupLabels: Record<"en" | "es", Record<AppearanceThemeGroup, string>> = {
  en: { marktwin: "Marktwin", minimal: "Monochrome", familiar: "Familiar palettes", experimental: "Experimental" },
  es: { marktwin: "Marktwin", minimal: "Monocromo", familiar: "Paletas conocidas", experimental: "Experimental" },
};

function ThemeSwatch({ preset, compact = false }: { preset: AppearanceThemePreset; compact?: boolean }) {
  return (
    <span
      className={cn("relative flex flex-none overflow-hidden rounded-md border border-black/10", compact ? "h-6 w-9" : "h-8 w-11")}
      style={{ backgroundColor: `hsl(${preset.preview.background})`, color: `hsl(${preset.preview.foreground})` }}
      aria-hidden="true"
    >
      <span className="h-full w-[28%] border-r border-black/10" style={{ backgroundColor: `hsl(${preset.preview.panel})` }} />
      <span className="my-auto ml-1 h-0.5 w-[36%] rounded-full bg-current opacity-70" />
      <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `hsl(${preset.preview.accent})` }} />
    </span>
  );
}

export default function AppearanceThemePicker() {
  const { theme, setTheme, darkThemeColorIndex, lightThemeColorIndex, setThemeColorIndex } = useTheme();
  const { locale, t } = useI18n();
  const labelLocale = locale === "es" ? "es" : "en";
  const labels = groupLabels[labelLocale];
  const selectedTheme = theme === "root" ? "dark" : theme;
  const selectedPreset = getAppearanceThemePreset(theme);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  const supportsAccent = selectedTheme === "light" || selectedTheme === "dark";
  const selectedIndex = selectedTheme === "dark" ? darkThemeColorIndex : lightThemeColorIndex;

  const themeLabel = (preset: AppearanceThemePreset) => (
    localizedThemeLabelKeys[preset.value]
      ? t(localizedThemeLabelKeys[preset.value]!)
      : localThemeLabels[labelLocale][preset.value] || preset.label
  );

  const filteredGroups = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(labelLocale);
    return appearanceThemeGroups.map((group) => ({
      group,
      presets: appearanceThemePresets.filter((preset) => {
        if (preset.group !== group) return false;
        if (!normalized) return true;
        const label = localizedThemeLabelKeys[preset.value]
          ? t(localizedThemeLabelKeys[preset.value]!)
          : localThemeLabels[labelLocale][preset.value] || preset.label;
        return `${label} ${labels[group]}`.toLocaleLowerCase(labelLocale).includes(normalized);
      }),
    })).filter((entry) => entry.presets.length > 0);
  }, [labelLocale, labels, query, t]);

  const handleColorSelect = (index: number) => {
    setThemeColorIndex(selectedTheme === "dark" ? "dark" : "light", index);
  };

  return (
    <div ref={setPortalContainer} className="space-y-2.5">
      <Label className="text-sm font-medium text-[hsl(var(--obsidian-text))]">{t("settings.theme")}</Label>

      <Popover open={open} onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery("");
      }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`${t("settings.theme")}: ${themeLabel(selectedPreset)}`}
            className="flex h-11 w-full items-center gap-2.5 rounded-lg border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg)/0.52)] px-2.5 text-left transition hover:border-[hsl(var(--obsidian-accent)/0.42)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--obsidian-accent))]"
          >
            <ThemeSwatch preset={selectedPreset} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-[hsl(var(--obsidian-text))]">{themeLabel(selectedPreset)}</span>
              <span className="block truncate text-[10px] text-[hsl(var(--obsidian-text-muted))]">{labels[selectedPreset.group]}</span>
            </span>
            {selectedPreset.mode === "light"
              ? <Sun className="h-3.5 w-3.5 text-[hsl(var(--obsidian-text-muted))]" />
              : <Moon className="h-3.5 w-3.5 text-[hsl(var(--obsidian-text-muted))]" />}
            <ChevronDown className="h-4 w-4 text-[hsl(var(--obsidian-text-muted))]" />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          sideOffset={6}
          portalContainer={portalContainer}
          className="w-[min(22rem,calc(100vw-2rem))] border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-sidebar))] p-2"
        >
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--obsidian-text-muted))]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={labelLocale === "es" ? "Buscar temas" : "Search themes"}
              aria-label={labelLocale === "es" ? "Buscar temas" : "Search themes"}
              className="h-9 w-full rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg))] pl-8 pr-3 text-sm text-[hsl(var(--obsidian-text))] outline-hidden placeholder:text-[hsl(var(--obsidian-text-muted))] focus:border-[hsl(var(--obsidian-accent)/0.62)]"
            />
          </div>

          <div className="max-h-[min(21rem,56vh)] space-y-2 overflow-y-auto pr-1" role="radiogroup" aria-label={t("settings.theme")}>
            {filteredGroups.map(({ group, presets }) => (
              <section key={group} aria-labelledby={`compact-theme-group-${group}`}>
                <div id={`compact-theme-group-${group}`} className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--obsidian-text-muted))]">
                  {labels[group]}
                </div>
                <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                  {presets.map((preset) => {
                    const selected = selectedTheme === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => {
                          setTheme(preset.value);
                          setOpen(false);
                        }}
                        className={cn(
                          "flex h-9 min-w-0 items-center gap-2 rounded-md px-2 text-left text-xs transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--obsidian-accent))]",
                          selected
                            ? "bg-[hsl(var(--obsidian-accent)/0.12)] text-[hsl(var(--obsidian-text))]"
                            : "text-[hsl(var(--obsidian-text))] hover:bg-[hsl(var(--obsidian-panel-hover))]",
                        )}
                      >
                        <ThemeSwatch preset={preset} compact />
                        <span className="min-w-0 flex-1 truncate">{themeLabel(preset)}</span>
                        {selected && <Check className="h-3.5 w-3.5 flex-none text-[hsl(var(--obsidian-accent))]" />}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            {filteredGroups.length === 0 && (
              <div className="px-3 py-8 text-center text-xs text-[hsl(var(--obsidian-text-muted))]">
                {labelLocale === "es" ? "No se encontraron temas" : "No themes found"}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {supportsAccent && (
        <div className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg)/0.38)] px-3 py-1.5">
          <span className="text-xs text-[hsl(var(--obsidian-text-muted))]">{t("settings.primaryColor")}</span>
          <div className="flex items-center gap-1.5">
            {appearanceColorOptions.map((color, index) => (
              <button
                key={color.name}
                type="button"
                aria-label={`${color.name} ${t("settings.primaryColor")}`}
                aria-pressed={selectedIndex === index}
                onClick={() => handleColorSelect(index)}
                className={cn(
                  "h-5 w-5 rounded-full border transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--obsidian-accent))]",
                  selectedIndex === index ? "scale-110 border-[hsl(var(--obsidian-text))] shadow-xs" : "border-[hsl(var(--obsidian-border))] opacity-75 hover:opacity-100",
                )}
                style={{ background: `hsl(${selectedTheme === "light" ? color.lightPrimary : color.primary})` }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
