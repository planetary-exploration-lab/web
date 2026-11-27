// @ts-check
import { defineConfig } from 'astro/config';

// Base path: "/web/" for the GitHub Pages preview, "/" after cutover to www.pxl.earth.
const base = process.env.BASE_PATH ?? '/';
const site = process.env.SITE_URL ?? 'https://planetary-exploration-lab.github.io';

export default defineConfig({
  output: 'static',
  site,
  base,
  trailingSlash: 'always',
  build: {
    format: 'directory',
    // Keep all CSS in files so the CSP can stay at style-src 'self'.
    inlineStylesheets: 'never',
  },
  i18n: {
    locales: ['en', 'es', 'fr', 'ja'],
    defaultLocale: 'en',
    routing: {
      prefixDefaultLocale: true,
      // The root redirect is our own static page (src/pages/index.astro).
      redirectToDefaultLocale: false,
    },
  },
  devToolbar: { enabled: false },
});
