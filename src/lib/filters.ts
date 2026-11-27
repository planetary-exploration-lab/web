// Project filter pages (/en/projects/<filter>/). Also the targets of old Squarespace category URLs.
export const FILTERS = ['active', 'completed', 'research', 'instrumentation', 'fieldwork', 'flight'] as const;
export type Filter = (typeof FILTERS)[number];
export const isFilter = (x: string): x is Filter => (FILTERS as readonly string[]).includes(x);
