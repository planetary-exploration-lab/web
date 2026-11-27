import type { APIRoute } from 'astro';
import { loadData } from '../lib/data';
import { localeUrl } from '../lib/url';

// A plain-text guide to the site for AI agents (https://llmstxt.org).
export const GET: APIRoute = async ({ site }) => {
  const abs = (p: string) => new URL(p, site).href;
  const d = await loadData();
  const lines = [
    '# Planetary eXploration Lab (PXL)',
    '',
    '> Georgia Tech research lab led by Prof. Christopher E. Carr. Seeking and supporting life beyond Earth while enabling a sustainable human future.',
    '',
    'Pages exist in English (/en/), Spanish (/es/), French (/fr/) and Japanese (/ja/); untranslated pages show English content.',
    'Project, paper, and person URLs use permanent IDs that do not change when titles change.',
    '',
    '## Sections',
    `- [Projects](${abs(localeUrl('en', 'projects/'))}): research, instrumentation, fieldwork, and flight projects`,
    `- [People](${abs(localeUrl('en', 'people/'))}): current members and alumni`,
    `- [Publications](${abs(localeUrl('en', 'publications/'))})`,
    `- [Gallery](${abs(localeUrl('en', 'gallery/'))}): photos of field sites, instruments, flights, and people`,
    `- [News](${abs(localeUrl('en', 'news/'))}): media coverage and announcements`,
    `- [Contact](${abs(localeUrl('en', 'contact/'))}): how to propose a collaboration or contact us for media`,
    `- [Join the lab](${abs(localeUrl('en', 'join/'))}): guidance for prospective undergraduates, graduate students, and postdocs, and options for high school students`,
    `- [About this site](${abs(localeUrl('en', 'about-site/'))}): how the site is made, use of AI, accessibility, and privacy`,
    '',
    '## Projects',
    ...d.projects.map((p) => `- [${p.data.title}](${abs(localeUrl('en', `projects/${p.id}/`))}): ${p.data.summary}`),
    '',
    `Sitemap: ${abs(import.meta.env.BASE_URL + 'sitemap.xml')}`,
  ];
  return new Response(lines.join('\n') + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
