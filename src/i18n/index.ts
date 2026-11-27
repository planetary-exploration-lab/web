import en from './en.json';
import es from './es.json';
import fr from './fr.json';
import ja from './ja.json';

export const LOCALES = ['en', 'es', 'fr', 'ja'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export type Key = keyof typeof en;
const strings: Record<Locale, Partial<Record<Key, string>>> = { en, es, fr, ja };

/** A UI string plus the language it is actually in (English when the locale lacks it). */
export interface Str {
  text: string;
  lang: Locale;
}

export function str(locale: Locale, key: Key, vars: Record<string, string | number> = {}): Str {
  const own = strings[locale][key];
  const text = (own ?? en[key]).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
  return { text, lang: own !== undefined ? locale : DEFAULT_LOCALE };
}

/** Plain text form, for attributes. */
export function t(locale: Locale, key: Key, vars?: Record<string, string | number>): string {
  return str(locale, key, vars).text;
}

export function isLocale(x: string | undefined): x is Locale {
  return (LOCALES as readonly string[]).includes(x ?? '');
}

export const localePaths = () => LOCALES.map((lang) => ({ params: { lang } }));
