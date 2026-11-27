#!/usr/bin/env node
// Build the PXL logo files the site serves from the two-layer source in src/assets/logo/.
// Run after changing the source or the palette below:  node scripts/make_brand_assets.mjs
// Writes public/logo/pxl-logo-{gold,white}.svg, public/favicon.svg, public/favicon-32.png,
// public/apple-touch-icon.png and public/og.png (1200x630 link-preview card).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';

const NAVY = '#051E39';
// Color treatments (see src/assets/logo/README.md). "gold" is option D, "white" is option C.
const VARIANTS = {
  gold: { paper: '#DEBD88', ink: NAVY },
  white: { paper: '#FFFFFF', ink: NAVY },
};
const SITE_VARIANT = 'gold';

const src = readFileSync('src/assets/logo/pxl-logo-2tone.svg', 'utf8');
const bake = ({ paper, ink }) =>
  src
    .replace(/style="fill:var\(--logo-paper, #[0-9a-fA-F]+\)"/, `fill="${paper}"`)
    .replace(/style="fill:var\(--logo-ink, #[0-9a-fA-F]+\)"/, `fill="${ink}"`);

mkdirSync('public/logo', { recursive: true });
for (const [name, colors] of Object.entries(VARIANTS)) {
  const svg = bake(colors);
  if (svg.includes('var(')) throw new Error('palette substitution failed');
  writeFileSync(`public/logo/pxl-logo-${name}.svg`, svg);
}
const site = bake(VARIANTS[SITE_VARIANT]);
writeFileSync('public/favicon.svg', site);

const png = (svg, size) => sharp(Buffer.from(svg), { density: 72 }).resize(size, size).png().toBuffer();
// Tab icon fallback for browsers without SVG favicons.
writeFileSync('public/favicon-32.png', await png(site, 32));
// iOS home screen: opaque square, badge on navy with padding.
const badge180 = await png(site, 148);
writeFileSync(
  'public/apple-touch-icon.png',
  await sharp({ create: { width: 180, height: 180, channels: 4, background: NAVY } })
    .composite([{ input: badge180, left: 16, top: 16 }])
    .png()
    .toBuffer(),
);

// Link-preview card: navy, badge on the left, lab name drawn as text paths are not needed (system sans is fine
// for a raster made once and committed).
const badgeOg = await png(site, 380);
const text = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <style>.n{font:700 64px Roboto, 'Helvetica Neue', Arial, sans-serif; fill:#fff} .s{font:400 34px Roboto, 'Helvetica Neue', Arial, sans-serif; fill:#DEBD88}</style>
  <text class="n" x="530" y="300">Planetary</text>
  <text class="n" x="530" y="374">eXploration Lab</text>
  <text class="s" x="532" y="440">Georgia Tech · Aerospace Engineering</text>
</svg>`;
writeFileSync(
  'public/og.png',
  await sharp({ create: { width: 1200, height: 630, channels: 4, background: NAVY } })
    .composite([{ input: badgeOg, left: 100, top: 125 }, { input: Buffer.from(text), left: 0, top: 0 }])
    .png({ compressionLevel: 9 })
    .toBuffer(),
);
console.log(`brand assets written (site variant: ${SITE_VARIANT})`);
