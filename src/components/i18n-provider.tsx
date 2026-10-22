"use client";

import { createContext, useContext, type ReactNode } from "react";
import { getDictionary, setActiveLocale, type Dict, type Locale } from "@/lib/i18n";
import { applyZodLocale } from "@/lib/i18n/zod";

const LocaleContext = createContext<Locale>("de");

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  // Formatting helpers read the active locale; set it before any child renders.
  setActiveLocale(locale);
  applyZodLocale(locale);
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** Dictionary of the current UI language. */
export function useT(): Dict {
  return getDictionary(useContext(LocaleContext));
}
