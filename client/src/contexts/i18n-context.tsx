import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocalProfile } from "@/contexts/local-profile-context";
import {
  detectBrowserLocale,
  FALLBACK_LOCALE,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatList,
  formatMessage,
  formatNumber,
  formatRelativeTime,
  getLocaleDirection,
  loadCatalog,
  LOCALE_STORAGE_KEY,
  localeOptions,
  resolveLocale,
  type Locale,
  type LocaleDirection,
  type MessageValues,
} from "@/lib/i18n";
import type { MessageCatalog } from "@/lib/i18n";

interface I18nContextValue {
  locale: Locale;
  direction: LocaleDirection;
  localeOptions: typeof localeOptions;
  isLoading: boolean;
  setLocale: (locale: string) => Promise<void>;
  t: (key: string, values?: MessageValues) => string;
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  currency: (value: number, currency: string) => string;
  date: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string;
  dateTime: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string;
  relative: (value: number, unit: Intl.RelativeTimeFormatUnit) => string;
  list: (values: string[], options?: Intl.ListFormatOptions) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLocale(): Locale {
  if (typeof window !== "undefined") {
    return window.localStorage.getItem(LOCALE_STORAGE_KEY)
      ? resolveLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY))
      : detectBrowserLocale();
  }
  return FALLBACK_LOCALE;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const { profile, updateAppPreferences } = useLocalProfile();
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);
  const [catalogState, setCatalogState] = useState<{ locale: Locale; catalog: MessageCatalog } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const accountLocaleValue = (profile?.appPreferences as { language?: unknown } | null)?.language;
  const accountLocale = typeof accountLocaleValue === "string" ? resolveLocale(accountLocaleValue) : null;

  useEffect(() => {
    if (!accountLocale) return;
    setLocaleState(accountLocale);
    window.localStorage.setItem(LOCALE_STORAGE_KEY, accountLocale);
  }, [accountLocale]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    void loadCatalog(locale)
      .then((loaded) => {
        if (cancelled) return;
        setCatalogState({ locale, catalog: loaded });
        setIsLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setCatalogState(null);
          setIsLoading(false);
        }
      });
    document.documentElement.lang = locale;
    document.documentElement.dir = getLocaleDirection(locale);
    return () => { cancelled = true; };
  }, [locale]);

  const setLocale = useCallback(async (nextLocale: string) => {
    const resolved = resolveLocale(nextLocale);
    setLocaleState(resolved);
    window.localStorage.setItem(LOCALE_STORAGE_KEY, resolved);
    if (profile) {
      await updateAppPreferences({ language: resolved });
    }
  }, [profile, updateAppPreferences]);

  const direction = getLocaleDirection(locale);
  const value = useMemo(() => ({
    locale,
    direction,
    localeOptions,
    isLoading,
    setLocale,
    t: (key: string, values?: MessageValues) => formatMessage(
      locale,
      catalogState?.locale === locale ? catalogState.catalog : {},
      key,
      values,
    ),
    number: (value: number, options?: Intl.NumberFormatOptions) => formatNumber(locale, value, options),
    currency: (value: number, currencyCode: string) => formatCurrency(locale, value, currencyCode),
    date: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => formatDate(locale, value, options),
    dateTime: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => formatDateTime(locale, value, options),
    relative: (value: number, unit: Intl.RelativeTimeFormatUnit) => formatRelativeTime(locale, value, unit),
    list: (values: string[], options?: Intl.ListFormatOptions) => formatList(locale, values, options),
  }), [catalogState, direction, isLoading, locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within an I18nProvider");
  return context;
}
