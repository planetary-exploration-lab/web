#!/usr/bin/env node
// Prepare raster images for the site: auto-rotate, convert to sRGB, resize, encode WebP, strip all metadata.
// Usage:
//   node scripts/prepare_images.mjs --kind photo   --out src/assets/projects  in1.jpg in2.png ...
//   node scripts/prepare_images.mjs --kind graphic --out src/assets/projects --name venusian-2 diagram.png
// --kind photo    photographs and renders: WebP quality 80, long edge up to 2000 px
// --kind graphic  diagrams, charts, screenshots, text: WebP quality 92 with full chroma, long edge up to 2400 px
// --max N         override the long-edge limit;  --name N  output name (single input only)
// Sharp drops EXIF, GPS, XMP and ICC metadata unless asked to keep it. See docs/images.md.
import { basename, extname, join } from 'node:path';
import { mkdirSync, statSync } from 'node:fs';
import sharp from 'sharp';

const args = process.argv.slice(2);
const opt = { kind: 'photo', out: '.', max: 0, name: '' };
const inputs = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) opt[a.slice(2)] = args[++i];
  else inputs.push(a);
}
if (!inputs.length || !['photo', 'graphic'].includes(opt.kind) || (opt.name && inputs.length > 1)) {
  console.error('Usage: node scripts/prepare_images.mjs --kind photo|graphic --out DIR [--max N] [--name NAME] files...');
  process.exit(2);
}
const max = Number(opt.max) || (opt.kind === 'photo' ? 2000 : 2400);
const enc = opt.kind === 'photo' ? { quality: 80, effort: 5 } : { quality: 92, smartSubsample: true, effort: 6 };
mkdirSync(opt.out, { recursive: true });

let warn = 0;
for (const file of inputs) {
  const name = (opt.name || basename(file, extname(file))).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const dest = join(opt.out, `${name}.webp`);
  const info = await sharp(file, { failOn: 'error' })
    .rotate()
    .toColorspace('srgb')
    .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
    .webp(enc)
    .toFile(dest);
  const kb = Math.round(statSync(dest).size / 1024);
  const flag = kb > 500 ? '  (over 500 KB: try a smaller --max or --kind photo)' : '';
  if (flag) warn++;
  console.log(`${dest}  ${info.width}x${info.height}  ${kb} KB${flag}`);
}
if (warn) process.exitCode = 1;
