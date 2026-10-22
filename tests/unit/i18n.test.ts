import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES, fmt, getDictionary, msg, plural, setActiveLocale, translateMessage, type Plural } from "@/lib/i18n";
import { formatDay, formatDuration, formatNumber, relativeDay } from "@/lib/format";

type Node = string | Plural | { [k: string]: Node };

function leaves(node: Node, prefix = ""): Map<string, string | Plural> {
  const out = new Map<string, string | Plural>();
  if (typeof node === "string" || "one" in node) {
    out.set(prefix, node as string | Plural);
    return out;
  }
  for (const [k, v] of Object.entries(node)) for (const [p, x] of leaves(v, prefix ? `${prefix}.${k}` : k)) out.set(p, x);
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const texts = (v: string | Plural) => (typeof v === "string" ? [v] : Object.values(v).filter((x): x is string => typeof x === "string"));

describe("dictionaries", () => {
  const de = leaves(getDictionary("de") as unknown as Node);

  it.each(LOCALES.filter((l) => l !== "de"))("%s has the same keys and placeholders as German", (locale) => {
    const other = leaves(getDictionary(locale) as unknown as Node);
    expect([...other.keys()].sort()).toEqual([...de.keys()].sort());
    for (const [key, deValue] of de) {
      const expected = [...new Set(texts(deValue).flatMap(placeholders))].sort();
      for (const text of texts(other.get(key)!)) {
        expect(placeholders(text).every((ph) => expected.includes(ph)), `${locale}.${key}: ${text}`).toBe(true);
      }
    }
  });

  it.each(["ru", "uk"] as const)("%s defines few/many for every plural", (locale) => {
    for (const [key, v] of leaves(getDictionary(locale) as unknown as Node)) {
      if (typeof v !== "string") expect(v.few && v.many, `${locale}.${key}`).toBeTruthy();
    }
  });
});

describe("translation helpers", () => {
  afterEach(() => setActiveLocale(DEFAULT_LOCALE));

  it("fills placeholders", () => {
    expect(fmt("{a} und {b}", { a: 1, b: "x" })).toBe("1 und x");
    expect(fmt("{missing}", {})).toBe("{missing}");
  });

  it("picks Slavic plural forms", () => {
    setActiveLocale("ru");
    const sets = getDictionary("ru").units.sets;
    expect([1, 2, 5, 21, 22, 25].map((n) => plural(sets, n))).toEqual(["1 подход", "2 подхода", "5 подходов", "21 подход", "22 подхода", "25 подходов"]);
    setActiveLocale("uk");
    expect(plural(getDictionary("uk").units.exercises, 3)).toBe("3 вправи");
    setActiveLocale("de");
    expect(plural(getDictionary("de").units.sets, 1)).toBe("1 Satz");
  });

  it("resolves message keys and passes plain text through", () => {
    const en = getDictionary("en");
    expect(translateMessage(en, msg("validation.invalidDate"))).toBe("Invalid date");
    expect(translateMessage(en, "plain")).toBe("plain");
    expect(translateMessage(en, "i18n:does.not.exist")).toBe("i18n:does.not.exist");
  });
});

describe("locale-aware formatting", () => {
  afterEach(() => setActiveLocale(DEFAULT_LOCALE));

  it("formats numbers, dates and durations per language", () => {
    setActiveLocale("en");
    expect(formatNumber(1234.5)).toBe("1,234.5");
    expect(formatDay("2026-10-22", "month")).toBe("October 2026");
    expect(relativeDay("2026-10-21", "2026-10-22")).toBe("Yesterday");
    setActiveLocale("ru");
    expect(formatDay("2026-10-22", "month")).toBe("Октябрь 2026");
    expect(formatDuration(3725)).toBe("1 ч 2 мин");
    setActiveLocale("de");
    expect(formatNumber(1234.5)).toBe("1.234,5");
    expect(relativeDay("2026-10-22", "2026-10-22")).toBe("Heute");
  });
});
