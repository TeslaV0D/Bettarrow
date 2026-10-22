/** Plural forms (CLDR categories). German/English only need one/other, Russian/Ukrainian also few/many. */
export interface Plural {
  one: string;
  few?: string;
  many?: string;
  other: string;
}

/** Typed helper for writing dictionary plural entries. */
export const p = (forms: Plural): Plural => forms;
