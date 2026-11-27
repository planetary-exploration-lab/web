import { getCollection } from 'astro:content';
import { loadData } from './data';

export interface Redirect { from: string; to: string }

/** Old Squarespace paths from src/data/redirects.yaml, plus each project's legacyUrl. */
export async function loadRedirects(): Promise<Redirect[]> {
  const list: Redirect[] = (await getCollection('redirects')).map((r) => ({ from: r.id, to: r.data.to }));
  for (const p of await getCollection('projects')) {
    if (p.data.legacyUrl) list.push({ from: new URL(p.data.legacyUrl).pathname, to: `/en/projects/${p.id}/` });
  }
  // A person page exists only with bio consent (and never in fixture builds): fall back to the people list.
  const { people } = await loadData();
  const personPages = new Set(people.filter((p) => p.bioEntry).map((p) => `/en/people/${p.id}/`));
  for (const r of list) if (/^\/en\/people\/[^/]+\/$/.test(r.to) && !personPages.has(r.to)) r.to = '/en/people/';
  const seen = new Set<string>();
  for (const r of list) {
    if (seen.has(r.from)) throw new Error(`duplicate redirect from ${r.from}`);
    seen.add(r.from);
  }
  return list;
}
