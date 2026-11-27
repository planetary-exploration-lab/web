// Publication display helpers shared by the list page, the per-paper page and project pages.
// Citations follow the compact PubMed style: "Carr CE, Zuber MT. Title. Venue. 2020 Mar;6(1):24. doi: … PMID: …".
import type { PubWithExtras } from './data';

/** CV item types shown under "Presentations and abstracts" on project pages; everything else is a lab publication. */
export const PRESENTATION_TYPES = ['talk', 'panel', 'poster', 'conference-abstract'];

/** Page sections, in order, and the CV item types each one holds. Types not listed fall into "other". */
export const PUB_GROUPS = [
  { key: 'preprint', types: ['preprint'] },
  { key: 'journal', types: ['journal-article'] },
  { key: 'conference', types: ['conference-paper'] },
  { key: 'chapter', types: ['book-chapter', 'book-part'] },
  { key: 'writing', types: ['report', 'white-paper', 'testimony', 'magazine-article', 'encyclopedia-entry', 'scholarly-other'] },
  { key: 'talk', types: ['talk', 'panel'] },
] as const;
export type PubGroup = (typeof PUB_GROUPS)[number]['key'] | 'other';

export const pubGroup = (type: string): PubGroup =>
  PUB_GROUPS.find((g) => (g.types as readonly string[]).includes(type))?.key ?? 'other';

/**
 * Author i as "Family Initials" (e.g. "Ramírez-Colón JL", "Smith J Jr"); organisations as written; a trailing "et al".
 * Uses author_names from the export when present;
 * otherwise splits the display string, treating tokens that end in "." as initials ("J. L. Ramírez-Colón").
 */
export const authorName = (p: PubWithExtras, i: number): string => {
  const parts = p.data.author_names?.[i];
  if (parts) {
    if (parts.et_al) return 'et al';
    if (parts.corporate) return parts.family;
    const initials = parts.initials || ((parts.given ?? '').match(/\p{Lu}/gu)?.join('') ?? '');
    return [parts.family, initials, parts.suffix?.replace(/\.$/, '')].filter(Boolean).join(' ');
  }
  const raw = p.data.authors[i];
  const tokens = raw.split(/\s+/);
  const initials: string[] = [];
  while (tokens.length > 1 && /^(\p{Lu}\.)(-?\p{Lu}\.)*$/u.test(tokens[0])) initials.push(tokens.shift()!.replace(/[.-]/g, ''));
  return initials.length ? `${tokens.join(' ')} ${initials.join('')}` : raw;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Publication date as "2016", "2016 Sep" or "2016 Sep 8". */
export const citeDate = (p: PubWithExtras): string => {
  const raw = p.data.date instanceof Date ? p.data.date.toISOString().slice(0, 10) : String(p.data.date ?? '');
  const m = raw.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (!m) return String(p.data.year);
  const [, y, mo, d] = m;
  return [y, mo ? MONTHS[Number(mo) - 1] : '', mo && d ? String(Number(d)) : ''].filter(Boolean).join(' ');
};

const pageRange = (pages: string) => pages.replace(/(\d)\s*[-‐‑–]\s*(\d)/g, '$1–$2');

/** Volume, issue and pages, e.g. "17(1):10274" or "1056–1070". */
export const venueDetail = (p: PubWithExtras) => {
  const d = p.data;
  const vol = [d.volume ?? '', d.number ? `(${d.number})` : ''].join('');
  return [vol, d.pages ? pageRange(d.pages) : ''].filter(Boolean).join(':');
};

/** The source part of a citation: "Annu Rev Microbiol. 2016 Sep 8;70:435–457". */
export const citeSource = (p: PubWithExtras) => {
  const venue = p.data.venue_abbrev ?? p.data.venue;
  const detail = venueDetail(p);
  const when = `${citeDate(p)}${detail ? `;${detail}` : ''}`;
  return venue ? `${venue}. ${when}` : when;
};

/** Persistent identifiers, shown as "doi: <number>", "PMID: <number>", "PMCID: <number>" with only the number linked. */
export const pubIds = (p: PubWithExtras) => {
  const d = p.data;
  return [
    ...(d.doi ? [{ label: 'doi', value: d.doi, href: `https://doi.org/${d.doi}` }] : []),
    ...(d.pmid ? [{ label: 'PMID', value: d.pmid, href: `https://pubmed.ncbi.nlm.nih.gov/${d.pmid}/` }] : []),
    ...(d.pmcid ? [{ label: 'PMCID', value: d.pmcid, href: `https://pmc.ncbi.nlm.nih.gov/articles/${d.pmcid}/` }] : []),
    ...(d.arxiv ? [{ label: 'arXiv', value: d.arxiv, href: `https://arxiv.org/abs/${d.arxiv}` }] : []),
  ];
};

/** Short link text for a URL: the DOI for doi.org links, otherwise the host name. */
const host = (u: string) => {
  try {
    const url = new URL(u);
    if (url.hostname === 'doi.org' || url.hostname === 'dx.doi.org') return decodeURIComponent(url.pathname.slice(1));
    return url.hostname.replace(/^www\./, '');
  } catch { return u; }
};
const LINK_LABEL: Record<string, string> = { code: 'Code', data: 'Data', video: 'Video', preprint: 'Preprint', slides: 'Slides' };

/** Other outbound links: the URL (when there is no DOI), an open-access copy, then code, data and video. */
export const pubLinks = (p: PubWithExtras) => {
  const d = p.data;
  return [
    ...(!d.doi && d.url ? [{ href: d.url, text: host(d.url) }] : []),
    ...(p.extras?.oaUrl ? [{ href: p.extras.oaUrl, text: 'Open-access copy' }] : []),
    ...numberRepeats(d.links.map((l) => ({ href: l.url, text: `${LINK_LABEL[l.kind] ?? l.kind}: ${host(l.url)}` }))),
  ];
};

/** Give repeated link texts a number ("Data 1: osf.io", "Data 2: osf.io") so every link is distinguishable. */
function numberRepeats(links: { href: string; text: string }[]) {
  const total = new Map<string, number>();
  for (const l of links) total.set(l.text, (total.get(l.text) ?? 0) + 1);
  const seen = new Map<string, number>();
  return links.map((l) => {
    if ((total.get(l.text) ?? 0) < 2) return l;
    const n = (seen.get(l.text) ?? 0) + 1;
    seen.set(l.text, n);
    return { ...l, text: l.text.replace(':', ` ${n}:`) };
  });
}

/** Ends a title with a period unless it already ends in punctuation. */
export const withStop = (s: string) => (/[.?!]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
