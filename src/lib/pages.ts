// Every public page path (without locale), for sitemap.xml and llms.txt.
import { loadData } from './data';
import { FILTERS } from './filters';

export async function pagePaths(): Promise<string[]> {
  const d = await loadData();
  return [
    '', 'projects/', ...FILTERS.map((f) => `projects/${f}/`), ...d.projects.map((p) => `projects/${p.id}/`),
    'people/', ...d.people.filter((p) => p.bioEntry).map((p) => `people/${p.id}/`),
    'publications/', ...d.publications.map((p) => `publications/${p.id}/`),
    'gallery/', ...d.gallery.map((g) => `gallery/${g.id}/`), 'news/', 'contact/', 'join/', 'about-site/',
  ];
}
