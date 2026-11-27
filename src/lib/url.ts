import type { Locale } from '../i18n';

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');

/** Site-internal URL with the configurable base path, always with a trailing slash. */
export function url(path = ''): string {
  const clean = path.replace(/^\/+/, '').replace(/\/?$/, '/');
  return clean === '/' ? BASE : BASE + clean;
}

export function localeUrl(locale: Locale, path = ''): string {
  return url(`${locale}/${path.replace(/^\/+/, '')}`);
}

/** The same page in another locale: swaps the first path segment after the base. */
export function switchLocale(pathname: string, to: Locale): string {
  const rest = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname.replace(/^\//, '');
  return localeUrl(to, rest.split('/').slice(1).join('/'));
}

/** Asset URL (files in public/). No trailing slash. */
export function asset(path: string): string {
  return BASE + path.replace(/^\/+/, '');
}
