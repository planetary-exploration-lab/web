import { defineCollection, type SchemaContext } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';

// People come from web-private in the deploy build (PEOPLE_DIR=private/people)
// and from obviously fake fixtures everywhere else. Never commit real people data to this repo.
const PEOPLE_DIR = process.env.PEOPLE_DIR ?? 'fixtures/people';

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'IDs are lowercase letters, digits and hyphens');
const idList = z.array(id).default([]);

/** An image with required alt text. Empty alt only when explicitly marked decorative. */
const altImage = (image: SchemaContext['image']) =>
  z.union([
    z.object({ src: image(), alt: z.string().trim().min(1, 'alt text is required') }).strict(),
    z.object({ src: image(), decorative: z.literal(true), alt: z.literal('').default('') }).strict(),
  ]);

/** Consent for one displayable field: granted or not, when that was recorded, and on what basis. */
const consent = z
  .object({
    granted: z.boolean(),
    date: z.coerce.date(),
    /** For example "confirmed by email" or "public on pxl.earth as of 2026-11-20". */
    basis: z.string().optional(),
  })
  .strict();

/** Dates as YYYY, YYYY-MM or YYYY-MM-DD. Blank is allowed while records are being compiled. */
const flexDate = z.preprocess(
  (v) => (v === null || v === '' ? undefined : typeof v === 'number' ? `${v}-01-01` : v),
  z.coerce.date().optional(),
);
const group = z.enum(['faculty', 'staff', 'postdoc', 'grad', 'undergrad', 'visiting']);

/** One role held in the lab. List positions oldest first; the last one is the person's current or final role. */
const position = z
  .object({
    role: z.string().nullish(),
    group: group.nullish(),
    start: flexDate,
    end: flexDate,
    /** Degree earned in the lab during this position, for example "PhD" or "MS, Aerospace Engineering". */
    degree: z.string().nullish(),
  })
  .strict();

const people = defineCollection({
  // YAML for short records; Markdown when a person has a long bio (the body is the bio).
  // Files starting with _ (such as _template.yaml) are ignored.
  loader: glob({ pattern: ['*.{yaml,yml,md}', '!README.md', '!_*'], base: PEOPLE_DIR }),
  schema: ({ image }) =>
    z
      .object({
        name: z.string().min(1),
        /** Listed first among current members (the PI). */
        lead: z.boolean().default(false),
        /** Position on the people page, lower first, copied from pxl.earth. Current members: join order,
         *  longest-serving first. Alumni: departure order, most recent first (100+ = the old alumni list).
         *  People without it follow: current by start date, alumni by end date (most recent first). */
        siteOrder: z.number().int().positive().optional(),
        positions: z.array(position).default([]),
        /** Where the person is now (alumni). Shown with consent. */
        now: z.string().nullish(),
        /** Marks a past member whose end date is not yet known (interim, for records migrated from pxl.earth). */
        alumni: z.boolean().optional(),
        photo: altImage(image).optional(),
        bio: z.string().optional(),
        links: z
          .object({
            website: z.url().optional(),
            linkedin: z.url().optional(),
            x: z.url().optional(),
            orcid: z.url().optional(),
            github: z.url().optional(),
          })
          .strict()
          .optional(),
        fellowships: z.array(z.string()).nullish(),
        /** Private notes for the PI. Never displayed. */
        notes: z.string().nullish(),
        // Name and final role are shown when listing is granted. Every other field needs its own consent.
        consent: z
          .object({
            listing: consent,
            photo: consent.optional(),
            bio: consent.optional(),
            links: consent.optional(),
            now: consent.optional(),
            fellowships: consent.optional(),
          })
          .strict(),
      })
      .strict(),
});

const projectKinds = z.enum(['research', 'instrumentation', 'fieldwork', 'flight']);

const projects = defineCollection({
  loader: glob({ pattern: '*.md', base: 'src/content/projects' }),
  schema: ({ image }) =>
    z
      .object({
        title: z.string().min(1),
        shortName: z.string().min(1),
        summary: z.string().min(1),
        status: z.enum(['active', 'completed']),
        kinds: z.array(projectKinds).min(1),
        image: altImage(image),
        /** Work by the wider project team that is not the lab's, in citation form (inline Markdown). Shown as a
         *  numbered list, so the text can cite [1], [2], … */
        teamPublications: z.array(z.string().min(1)).default([]),
        /** Optional caption or credit shown under the main image. */
        imageCaption: z.string().optional(),
        fullName: z.string().optional(),
        start: z.coerce.date().optional(),
        end: z.coerce.date().optional(),
        /** Key facts shown beside the text. Values allow inline Markdown: [links](url), *italic*, **bold**.
         *  A list for pi or coi gives the plural label. */
        facts: z
          .object({
            pi: z.union([z.string(), z.array(z.string()).min(1)]).optional(),
            coi: z.union([z.string(), z.array(z.string()).min(1)]).optional(),
            collaborators: z.string().optional(),
            dates: z.string().optional(),
            status: z.string().optional(),
            launch: z.string().optional(),
            funding: z.string().optional(),
          })
          .strict()
          .optional(),
        mission: z
          .object({
            launch: z.coerce.date().optional(),
            spacecraft: z.string().optional(),
            partners: z.array(z.string()).default([]),
          })
          .strict()
          .optional(),
        gallery: z
          .array(
            z.union([
              z.object({ src: image(), alt: z.string().trim().min(1, 'alt text is required'), caption: z.string().optional() }).strict(),
              z.object({ src: image(), decorative: z.literal(true), alt: z.literal('').default(''), caption: z.string().optional() }).strict(),
            ]),
          )
          .default([]),
        parent: id.optional(),
        related: idList,
        /** Address of this project on the old Squarespace site, for the redirect map. */
        legacyUrl: z.url().optional(),
      })
      .strict(),
});

// Translations live in src/content/projects/{es,fr,ja}/<id>.md and are tied to the English file by ID.
const projectTranslations = defineCollection({
  loader: glob({ pattern: '{es,fr,ja}/*.md', base: 'src/content/projects' }),
  schema: z.object({ title: z.string(), shortName: z.string().optional(), summary: z.string() }).strict(),
});

const news = defineCollection({
  loader: glob({ pattern: '*.md', base: 'src/content/news' }),
  schema: ({ image }) =>
    z
      .object({
        // A bare year (YAML reads it as a number) means January 1 of that year; pair it with datePrecision: year.
        date: z.preprocess((v) => (typeof v === 'number' ? `${v}-01-01` : v), z.coerce.date()),
        title: z.string().min(1),
        link: z.url().optional(),
        source: z.string().optional(),
        author: z.string().optional(),
        /** Display only; every record is kept. feature: listed on the News page; summary: counted in "Earlier
         * coverage", not listed; hidden: kept on record, not shown or counted. */
        tier: z.enum(['feature', 'summary', 'hidden']).default('feature'),
        /** student / postdoc: an award or fellowship won by a lab member (labelled on the News page). */
        kind: z.enum(['student', 'postdoc']).optional(),
        /** When the source gives only a month or a year: the page shows that much and no day. */
        datePrecision: z.enum(['month', 'year']).optional(),
        /** Language of the original piece when not English (title is then an English translation). */
        lang: z.string().optional(),
        projects: idList,
        people: idList,
        image: altImage(image).optional(),
      })
      .strict(),
});

const video = z
  .object({
    youtube: z.string().regex(/^[\w-]{11}$/),
    lang: z.enum(['en', 'es', 'fr', 'ja']),
    title: z.string(),
    captions: z.array(z.object({ lang: z.string(), src: z.string().endsWith('.vtt') })).min(1),
    transcript: z.string().min(1),
    audioDescribed: z.string().optional(),
  })
  .strict();

// Per-paper sidecar files, named by publication id. Site-only extras stay here so the generated list stays untouched.
const publicationExtras = defineCollection({
  loader: glob({ pattern: '*.{yaml,yml}', base: 'src/content/publications' }),
  schema: ({ image }) =>
    z
      .object({
        projects: idList,
        labAuthors: idList,
        priority: z.number().int().min(1).optional(),
        oaUrl: z.url().optional(),
        summary: z.string().optional(),
        summaryTranslations: z.object({ es: z.string(), fr: z.string(), ja: z.string() }).partial().optional(),
        figure: altImage(image).optional(),
        videos: z.array(video).default([]),
      })
      .strict(),
});

// Generated from the private CV export by scripts/sync_publications.py; never edited by hand.
// Authors are display strings; owner_author and trainee_authors are 0-based indices into them.
const publications = defineCollection({
  loader: file('src/data/publications.yaml'),
  schema: z
    .object({
      id,
      /** false: shown only on the project pages that tag it (talks, posters, abstracts), not on the Publications page. */
      listed: z.boolean().default(true),
      type: z.string().min(1), // CV item type, e.g. journal-article, conference-paper, book-chapter, talk
      subtype: z.string().optional(),
      title: z.string().min(1),
      authors: z.array(z.string().min(1)).min(1),
      author_names: z
        .array(z.object({ family: z.string(), given: z.string().optional(), initials: z.string().optional(), suffix: z.string().optional(), corporate: z.boolean().optional(), et_al: z.boolean().optional() }))
        .optional(),
      owner_author: z.number().int().min(0).optional(),
      trainee_authors: z.array(z.number().int().min(0)).default([]),
      venue: z.string().min(1).optional(),
      venue_abbrev: z.string().min(1).optional(),
      date: z.union([z.string(), z.date()]).optional(),
      year: z.number().int().min(1900).max(2100),
      volume: z.coerce.string().optional(),
      number: z.coerce.string().optional(),
      pages: z.coerce.string().optional(),
      publisher: z.string().optional(),
      location: z.string().optional(),
      doi: z.string().regex(/^10\.\d{4,9}\/\S+$/).optional(),
      pmid: z.coerce.string().regex(/^\d+$/).optional(),
      pmcid: z.string().regex(/^PMC\d+$/).optional(),
      url: z.url().optional(),
      arxiv: z.coerce.string().optional(),
      links: z.array(z.object({ kind: z.string().min(1), url: z.url() })).default([]),
    })
    .strict()
    .refine((p) => p.owner_author === undefined || p.owner_author < p.authors.length, 'owner_author is out of range')
    .refine((p) => p.trainee_authors.every((i) => i < p.authors.length), 'trainee_authors index is out of range')
    .refine((p) => !p.author_names || p.author_names.length === p.authors.length, 'author_names must match authors')
    .refine((p) => (p.author_names ?? []).every((a) => a.family || a.et_al), 'author_names needs a family name (except et al.)'),
});

const routes = defineCollection({
  loader: file('src/data/routes.yaml'),
  schema: z
    .object({
      id,
      order: z.number().int(),
      audience: z.enum(['internal', 'external']),
      label: z.string().min(1),
      description: z.string().min(1),
      url: z.union([z.url(), z.string().regex(/^[a-z][a-z0-9-]*\/$/)]).nullable(),
      hidden: z.boolean().default(false),
    })
    .strict(),
});

const gallery = defineCollection({
  loader: file('src/data/gallery.yaml'),
  schema: ({ image }) =>
    z
      .object({
        id,
        order: z.number().int(),
        src: image(),
        title: z.string().min(1),
        alt: z.string().trim().min(1, 'alt text is required'),
        caption: z.string().min(1),
        credit: z.string().optional(),
        project: id.optional(),
      })
      .strict(),
});

const redirects = defineCollection({
  loader: file('src/data/redirects.yaml'),
  schema: z.object({ id: z.string().regex(/^\/[\w%+./-]+$/), to: z.string().regex(/^\/[a-z]{2}\/[\w./-]*$/) }).strict(),
});

export const collections = { gallery, redirects, routes, people, projects, projectTranslations, news, publications, publicationExtras };
