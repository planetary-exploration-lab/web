// Loads every collection once, checks cross-references, and resolves links in both directions.
// An unknown ID anywhere throws, which fails the build.
import { getCollection, type CollectionEntry } from 'astro:content';
import type { Locale } from '../i18n';

type Person = CollectionEntry<'people'>;
type Project = CollectionEntry<'projects'>;
type Pub = CollectionEntry<'publications'>;
type Extras = CollectionEntry<'publicationExtras'>;
type News = CollectionEntry<'news'>;

/** What the site may show about a person: name and final role, plus only the fields with consent. */
export interface PublicPerson {
  id: string;
  name: string;
  /** Current role, or final role in the lab for alumni. Empty when not yet recorded. */
  role: string;
  group?: string;
  lead: boolean;
  siteOrder?: number;
  /** First start date across positions; orders current members. */
  start?: Date;
  /** End of the last position. */
  end?: Date;
  current: boolean;
  /** Current undergraduate without a photo: counted in one group card on the people page, not listed by name. */
  grouped: boolean;
  photo?: NonNullable<Person['data']['photo']>;
  bio?: string;
  links?: Person['data']['links'];
  now?: string;
  fellowships?: string[];
  /** Set when bio consent is granted and the record is Markdown with a body: render it with render(). */
  bioEntry?: Person;
}

/** Publication date as sortable text (YYYY, YYYY-MM or YYYY-MM-DD). */
const pubDate = (p: { data: Pub['data'] }) => {
  const d = p.data.date;
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d ?? p.data.year);
};

export interface PubWithExtras {
  id: string;
  data: Pub['data'];
  extras?: Extras['data'];
}

function toPublic(p: Person, today: Date): PublicPerson {
  const d = p.data;
  const ok = (f: keyof typeof d.consent) => d.consent[f]?.granted === true;
  const last = d.positions.at(-1);
  const starts = d.positions.map((x) => x.start).filter((x): x is Date => !!x);
  const end = last?.end;
  const current = !d.alumni && (!end || end >= today);
  const photo = ok('photo') ? d.photo : undefined;
  return {
    id: p.id,
    name: d.name,
    role: last?.role ?? '',
    group: last?.group ?? undefined,
    lead: d.lead,
    siteOrder: d.siteOrder,
    start: starts.length ? new Date(Math.min(...starts.map(Number))) : undefined,
    end,
    current,
    grouped: current && !d.lead && !photo && last?.group === 'undergrad',
    photo,
    bio: ok('bio') ? d.bio : undefined,
    links: ok('links') ? d.links : undefined,
    now: ok('now') ? (d.now ?? undefined) : undefined,
    fellowships: ok('fellowships') ? (d.fellowships ?? undefined) : undefined,
    bioEntry: ok('bio') && p.body?.trim() ? p : undefined,
  };
}

let cache: ReturnType<typeof build> | undefined;
export const loadData = () => (cache ??= build());

async function build() {
  const today = new Date();
  const [peopleAll, projects, translations, pubs, extrasList, news, routes, galleryAll] = await Promise.all([
    getCollection('people'),
    getCollection('projects'),
    getCollection('projectTranslations'),
    getCollection('publications'),
    getCollection('publicationExtras'),
    getCollection('news'),
    getCollection('routes'),
    getCollection('gallery'),
  ]);

  const errors: string[] = [];
  const allPeopleIds = new Set(peopleAll.map((p) => p.id));
  const projectIds = new Set(projects.map((p) => p.id));
  const pubIds = new Set(pubs.map((p) => p.id));
  const check = (where: string, kind: string, ids: Iterable<string>, known: Set<string>) => {
    for (const x of ids) if (!known.has(x)) errors.push(`${where}: unknown ${kind} ID "${x}"`);
  };

  for (const p of projects) {
    check(`project ${p.id}`, 'project', [...p.data.related, ...(p.data.parent ? [p.data.parent] : [])], projectIds);
  }
  for (const e of extrasList) {
    if (!pubIds.has(e.id)) errors.push(`sidecar ${e.id}: no publication with this id`);
    check(`sidecar ${e.id}`, 'project', e.data.projects, projectIds);
    check(`sidecar ${e.id}`, 'person', e.data.labAuthors, allPeopleIds);
  }
  for (const n of news) {
    check(`news ${n.id}`, 'project', n.data.projects, projectIds);
    check(`news ${n.id}`, 'person', n.data.people, allPeopleIds);
    // Listed items need something to click or read; summary and hidden records may be name-only.
    if (n.data.tier === "feature" && !n.data.link && !n.body?.trim()) errors.push(`news ${n.id}: featured item needs a link or a body`);
  }
  for (const g of galleryAll) check(`gallery ${g.id}`, 'project', g.data.project ? [g.data.project] : [], projectIds);
  for (const t of translations) {
    const [lang, base] = t.id.split('/');
    if (!projectIds.has(base)) errors.push(`translation ${lang}/${base}: no English project with this ID`);
  }
  if (errors.length) throw new Error(`Content cross-reference check failed:\n  ${errors.join('\n  ')}`);

  // Only people with listing consent appear anywhere. Links to unlisted people resolve to nothing.
  const people = peopleAll.filter((p) => p.data.consent.listing.granted).map((p) => toPublic(p, today));
  const personById = new Map(people.map((p) => [p.id, p]));
  const extras = new Map(extrasList.map((e) => [e.id, e.data]));
  const allPublications: PubWithExtras[] = pubs
    .map((p) => ({ id: p.id, data: p.data, extras: extras.get(p.id) }))
    .sort((a, b) => b.data.year - a.data.year || pubDate(b).localeCompare(pubDate(a)) || a.data.title.localeCompare(b.data.title));
  /** The Publications page and per-paper pages: everything except project-only records. */
  const publications = allPublications.filter((p) => p.data.listed);

  const pick = <T,>(ids: string[], map: Map<string, T>) => ids.map((x) => map.get(x)).filter((x): x is T => !!x);
  const projectById = new Map(projects.map((p) => [p.id, p]));

  return {
    people,
    projects: projects.sort((a, b) => a.data.title.localeCompare(b.data.title)),
    publications,
    /** All news records, newest first. Pages filter by tier (feature / summary / hidden). */
    news: news.sort((a, b) => b.data.date.getTime() - a.data.date.getTime()),
    routes,
    /** Gallery photos in display order. */
    gallery: galleryAll.sort((a, b) => a.data.order - b.data.order),
    peopleFor: (ids: string[]) => pick(ids, personById),
    /** Parent and related projects, resolved in both directions. */
    relatedFor: (p: Project) => {
      const ids = new Set([...(p.data.parent ? [p.data.parent] : []), ...p.data.related]);
      for (const o of projects) if (o.data.related.includes(p.id) || o.data.parent === p.id) ids.add(o.id);
      ids.delete(p.id);
      return pick([...ids], projectById);
    },
    projectsFor: (ids: string[]) => pick(ids, projectById),
    pubsForProject: (pid: string) => allPublications.filter((p) => p.extras?.projects.includes(pid)),
    pubsForPerson: (pid: string) => publications.filter((p) => p.extras?.labAuthors.includes(pid)),
    /** The translation of a project, or undefined when the page must fall back to English. */
    projectTranslation: (pid: string, lang: Locale) =>
      lang === 'en' ? undefined : translations.find((t) => t.id === `${lang}/${pid}`)?.data,
  };
}

export type SiteData = Awaited<ReturnType<typeof build>>;
export type { Project, News };
