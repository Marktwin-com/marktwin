export type Locale = string;

export type MessageValue = string | number | boolean | Date;
export type MessageValues = Record<string, MessageValue>;
export type MessageCatalog = Record<string, string>;
export type LocaleDirection = "ltr" | "rtl";
export type LocaleQuality = "reviewed" | "beta" | "fallback";

export interface LocaleInfo {
  code: Locale;
  label: string;
  nativeLabel: string;
  direction: LocaleDirection;
  quality: LocaleQuality;
}
