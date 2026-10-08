import { useI18n } from "@/contexts/i18n-context";

export default function LanguagePicker({ className = "" }: { className?: string }) {
  const { locale, localeOptions, setLocale, t } = useI18n();

  return (
    <label className={`flex items-center gap-1.5 text-[hsl(var(--obsidian-text-muted))] ${className}`} title={t("nav.language")}>
      <span className="sr-only">{t("nav.language")}</span>
      <select
        aria-label={t("nav.language")}
        value={locale}
        onChange={(event) => void setLocale(event.target.value)}
        className="rounded-sm bg-transparent text-xs outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {localeOptions.map((option) => (
          <option key={option.code} value={option.code}>{option.nativeLabel}</option>
        ))}
      </select>
    </label>
  );
}
