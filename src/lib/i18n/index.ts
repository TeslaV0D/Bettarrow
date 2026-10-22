import { formatNumber } from "@/lib/format";
import { MSG, activeIntlLocale, type Locale } from "./locales";
import { de } from "./dictionaries/de";
import { en } from "./dictionaries/en";
import { ru } from "./dictionaries/ru";
import { uk } from "./dictionaries/uk";

import type { Plural } from "./types";

export * from "./locales";
export type { Plural } from "./types";

type Widen<T> = T extends string ? string : T extends Plural ? Plural : { [K in keyof T]: Widen<T[K]> };
/** Shape of every dictionary; German is the source of truth. */
export type Dict = Widen<typeof de>;

const DICTIONARIES: Record<Locale, Dict> = { de, en, ru, uk };

export function getDictionary(locale: Locale): Dict {
  return DICTIONARIES[locale];
}

/** Replaces `{name}` placeholders. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

const pluralRules = new Map<string, Intl.PluralRules>();

/** Picks the plural form for `n` and fills `{n}` (formatted) plus any other placeholders. */
export function plural(forms: Plural, n: number, vars: Record<string, string | number> = {}): string {
  const locale = activeIntlLocale();
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRules.set(locale, rules);
  }
  const cat = rules.select(n) as keyof Plural;
  const template = forms[cat] ?? forms.other;
  return fmt(template, { n: formatNumber(n, 1), ...vars });
}


type Leaves<T> = { [K in keyof T & string]: T[K] extends string ? K : T[K] extends Plural ? never : `${K}.${Leaves<T[K]>}` }[keyof T & string];
/** Dot path of a plain-text dictionary entry, e.g. "validation.invalidDate". */
export type MessageKey = Leaves<Dict>;

/** Encodes a dictionary key as a message that {@link translateMessage} resolves later. */
export function msg(key: MessageKey): string {
  return MSG + key;
}

/**
 * Resolves a message that may be a dictionary key (see {@link MSG}) into text.
 * Shared zod schemas run on client and server, so they carry keys instead of German text.
 */
export function translateMessage(t: Dict, message: string): string {
  if (!message.startsWith(MSG)) return message;
  let node: unknown = t;
  for (const part of message.slice(MSG.length).split(".")) {
    node = node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined;
  }
  return typeof node === "string" ? node : message;
}
