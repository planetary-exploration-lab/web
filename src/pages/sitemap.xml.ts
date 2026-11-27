import type { APIRoute } from 'astro';
import { LOCALES } from '../i18n';
import { pagePaths } from '../lib/pages';
import { localeUrl } from '../lib/url';

export const GET: APIRoute = async ({ site }) => {
  const abs = (p: string) => new URL(p, site).href;
  const urls = (await pagePaths()).map((path) => {
    const alts = LOCALES.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${abs(localeUrl(l, path))}"/>`).join('\n');
    return LOCALES.map((l) => `  <url>\n    <loc>${abs(localeUrl(l, path))}</loc>\n${alts}\n  </url>`).join('\n');
  });
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
