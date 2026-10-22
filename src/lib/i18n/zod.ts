import { z } from "zod";
import type { Locale } from "./locales";

const ZOD_LOCALES = { de: z.locales.de, en: z.locales.en, ru: z.locales.ru, uk: z.locales.uk } satisfies Record<Locale, unknown>;
let applied: Locale | null = null;

/** Zod's built-in validation messages (for checks without a custom message) in the UI language. */
export function applyZodLocale(locale: Locale) {
  if (applied === locale) return;
  z.config(ZOD_LOCALES[locale]());
  applied = locale;
}
