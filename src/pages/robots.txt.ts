import type { APIRoute } from 'astro';

// Indexing stays blocked until cutover (set INDEXING=true in the deploy workflow then).
export const GET: APIRoute = ({ site }) => {
  const body =
    process.env.INDEXING === 'true'
      ? `User-agent: *\nAllow: /\nSitemap: ${new URL(import.meta.env.BASE_URL + 'sitemap.xml', site)}\n`
      : 'User-agent: *\nDisallow: /\n';
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
