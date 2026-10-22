import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { DEFAULT_LOCALE, getDictionary, isLocale, setActiveLocale, type Dict, type Locale } from "@/lib/i18n";
import { applyZodLocale } from "@/lib/i18n/zod";
import { getSettings } from "@/server/queries/settings";

/** UI language stored in the settings; falls back to German if the database is unavailable. */
export const getLocale = cache(async (): Promise<Locale> => {
  // The language lives in the database: wait for a real request instead of prerendering at build
  // time (no database there). Outside the try block so Next can interrupt prerendering.
  await connection();
  let locale: Locale = DEFAULT_LOCALE;
  try {
    const s = await getSettings();
    if (isLocale(s.locale)) locale = s.locale;
  } catch (err) {
    console.error("[i18n] could not read locale:", err);
  }
  setActiveLocale(locale);
  applyZodLocale(locale);
  return locale;
});

/** Dictionary for server components, actions and route handlers. */
export async function getT(): Promise<Dict> {
  return getDictionary(await getLocale());
}
