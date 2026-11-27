/** Public contact link shown on the Contact page: the PI's Georgia Tech directory profile, which lists
 * the official contact details. The site itself shows no email address or phone number.
 * Also used by the collaboration and media routes in src/data/routes.yaml. */
export const CONTACT_PROFILE = 'https://ae.gatech.edu/directory/person/christopher-carr';

/** Addresses shown under "Location" on the Contact page. `map` is a Google Maps search link for the address. */
export interface Place { key: 'lab' | 'shipping'; name: string; lines: string[]; map: string }
const mapSearch = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
export const PLACES: Place[] = [
  {
    key: 'lab',
    name: 'Weber Building',
    // \u2060 (word joiner) keeps the room range on one line.
    lines: ['Weber Building, Rooms 216\u2060–\u2060217', '275 Ferst Dr NW', 'Atlanta, GA 30332', 'USA'],
    map: mapSearch('Weber Building, 275 Ferst Dr NW, Atlanta, GA'),
  },
  {
    key: 'shipping',
    name: 'ESM Building',
    lines: ['ESM Building, Room G10', '620 Cherry St NW', 'Atlanta, GA 30332', 'USA'],
    map: mapSearch('Engineering Science and Mechanics Building, 620 Cherry St NW, Atlanta, GA'),
  },
];

/** The PI's complete publication record, linked from the Publications page. */
export const SCHOLAR_PROFILE = 'https://scholar.google.com/citations?user=N38VZzsAAAAJ';
export const ORCID_PROFILE = 'https://orcid.org/0000-0002-7946-5622';
