export const LOCALES = ["de", "en", "ru", "uk"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "de";

/** Names shown in the language switch, always in the language itself. */
export const LOCALE_NAMES: Record<Locale, string> = {
  de: "Deutsch",
  en: "English",
  ru: "Русский",
  uk: "Українська",
};

/** BCP 47 tags used for Intl number/date formatting. en-GB keeps 24h time and day-month order. */
export const INTL_LOCALES: Record<Locale, string> = {
  de: "de-DE",
  en: "en-GB",
  ru: "ru-RU",
  uk: "uk-UA",
};

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

/** Prefix marking a validation/domain message as a dictionary key (e.g. "i18n:validation.invalidDate"). */
export const MSG = "i18n:";

let active: Locale = DEFAULT_LOCALE;

/**
 * The locale used by the shared formatting helpers (numbers, dates, plurals).
 * Bettarrow is a single-user app with one stored language, so a module-level value is enough:
 * the server sets it whenever it resolves the locale, the client provider sets it while rendering.
 */
export function setActiveLocale(locale: Locale) {
  active = locale;
}

export function activeLocale(): Locale {
  return active;
}

export function activeIntlLocale(): string {
  return INTL_LOCALES[active];
}
