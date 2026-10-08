import IntlMessageFormat from "intl-messageformat";
import { messages as enMessages } from "./locales/en";
import type { Locale, LocaleDirection, LocaleInfo, MessageCatalog, MessageValues } from "./types";

export type { Locale, LocaleDirection, LocaleInfo, MessageCatalog, MessageValues } from "./types";

export const LOCALE_STORAGE_KEY = "marktwin-locale";
export const FALLBACK_LOCALE = "en";

export const localeOptions: LocaleInfo[] = [
  { code: "en", label: "English", nativeLabel: "English", direction: "ltr", quality: "reviewed" },
  { code: "es", label: "Spanish", nativeLabel: "Español", direction: "ltr", quality: "reviewed" },
  { code: "fr", label: "French", nativeLabel: "Français (beta)", direction: "ltr", quality: "beta" },
  { code: "de", label: "German", nativeLabel: "Deutsch (beta)", direction: "ltr", quality: "beta" },
  { code: "zh", label: "Chinese", nativeLabel: "简体中文（beta）", direction: "ltr", quality: "beta" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी (beta)", direction: "ltr", quality: "beta" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية (beta)", direction: "rtl", quality: "beta" },
];

const localeLoaders: Record<string, () => Promise<{ messages: MessageCatalog }>> = {
  en: async () => ({ messages: enMessages }),
  es: async () => import("./locales/es"),
  fr: async () => import("./locales/fr"),
  de: async () => import("./locales/de"),
  zh: async () => import("./locales/zh"),
  hi: async () => import("./locales/hi"),
  ar: async () => import("./locales/ar"),
};

const catalogCache = new Map<string, MessageCatalog>([["en", enMessages]]);

export function isRtlLocale(locale: string): boolean {
  return /^(ar|dv|fa|he|ku|ps|ur|yi)(-|$)/i.test(locale);
}

export function getLocaleDirection(locale: string): LocaleDirection {
  return isRtlLocale(locale) ? "rtl" : "ltr";
}

export function resolveLocale(value: unknown): Locale {
  if (typeof value !== "string") return FALLBACK_LOCALE;
  const normalized = value.trim().replace("_", "-").toLowerCase();
  const exact = localeOptions.find((option) => option.code.toLowerCase() === normalized);
  if (exact) return exact.code;
  const base = normalized.split("-")[0];
  return localeOptions.find((option) => option.code === base)?.code || FALLBACK_LOCALE;
}

export function normalizeLocale(value: unknown): Locale | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return resolveLocale(value);
}

export function detectBrowserLocale(languages?: readonly string[]): Locale {
  const candidates = languages?.length
    ? languages
    : typeof navigator !== "undefined" && navigator.languages?.length
      ? navigator.languages
      : typeof navigator !== "undefined"
        ? [navigator.language]
        : [];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    const normalized = candidate.trim().replace("_", "-").toLowerCase();
    const exact = localeOptions.find((option) => option.code.toLowerCase() === normalized);
    if (exact) return exact.code;
    const base = normalized.split("-")[0];
    const match = localeOptions.find((option) => option.code === base);
    if (match) return match.code;
  }
  return FALLBACK_LOCALE;
}

export function getLocaleInfo(locale: string): LocaleInfo {
  return localeOptions.find((option) => option.code === resolveLocale(locale)) || localeOptions[0];
}

export async function loadCatalog(locale: Locale): Promise<MessageCatalog> {
  const resolved = resolveLocale(locale);
  const cached = catalogCache.get(resolved);
  if (cached) return cached;
  const loaded = await localeLoaders[resolved]();
  catalogCache.set(resolved, loaded.messages);
  return loaded.messages;
}

function rawMessage(locale: Locale, catalog: MessageCatalog, key: string): string {
  return catalog[key] || enMessages[key] || key;
}

export function formatMessage(locale: Locale, catalog: MessageCatalog, key: string, values: MessageValues = {}): string {
  const message = rawMessage(locale, catalog, key);
  try {
    return String(new IntlMessageFormat(message, resolveLocale(locale)).format(values));
  } catch {
    return message;
  }
}

export function translate(locale: Locale, key: string, values: MessageValues = {}): string {
  const resolved = resolveLocale(locale);
  const catalog = catalogCache.get(resolved) || enMessages;
  return formatMessage(resolved, catalog, key, values);
}

export function formatNumber(locale: Locale, value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(resolveLocale(locale), options).format(value);
}

export function formatCurrency(locale: Locale, value: number, currency: string): string {
  return formatNumber(locale, value, { style: "currency", currency });
}

export function formatDate(locale: Locale, value: Date | number | string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(resolveLocale(locale), options ?? { dateStyle: "medium" }).format(new Date(value));
}

export function formatDateTime(locale: Locale, value: Date | number | string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(resolveLocale(locale), options ?? { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function formatRelativeTime(locale: Locale, value: number, unit: Intl.RelativeTimeFormatUnit): string {
  return new Intl.RelativeTimeFormat(resolveLocale(locale), { numeric: "auto" }).format(value, unit);
}

export function formatList(locale: Locale, values: string[], options?: Intl.ListFormatOptions): string {
  return new Intl.ListFormat(resolveLocale(locale), options ?? { style: "long", type: "conjunction" }).format(values);
}

export function validateCatalogKeys(source: MessageCatalog, target: MessageCatalog): string[] {
  return Object.keys(source).filter((key) => !(key in target));
}

export { enMessages };
