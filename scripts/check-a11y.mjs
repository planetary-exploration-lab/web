// Runs axe-core (WCAG 2.0/2.1/2.2 A and AA rules) on every built page, in light and dark color schemes,
// and checks reflow at 320 CSS px (WCAG 1.4.10).
// Serves dist/ under the configured base path with a tiny static server, so URLs match production.
// Usage: node scripts/check-a11y.mjs [dist]   (BASE_PATH env var, default "/")
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';

const dist = process.argv[2] ?? 'dist';
const raw = (process.env.BASE_PATH ?? '/').replace(/^\/*|\/*$/g, '');
const base = raw ? `/${raw}/` : '/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.txt': 'text/plain', '.vtt': 'text/vtt' };
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!path.startsWith(base)) return res.writeHead(404).end();
  let file = join(dist, path.slice(base.length));
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    let body = await readFile(file);
    // Strip meta refresh so redirect pages stay put long enough to be checked.
    if (file.endsWith('.html')) body = body.toString('utf8').replace(/<meta http-equiv="refresh"[^>]*>/gi, '');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const pages = (await walk(dist)).map((f) => base + relative(dist, f).split(sep).join('/').replace(/(^|\/)index\.html$/, '$1'));
const browser = await chromium.launch();
let failures = 0;
const external = new Set();
for (const colorScheme of ['light', 'dark']) {
  const context = await browser.newContext({ colorScheme, reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
  // Belt and braces with check_dist.py: record any request that leaves the local server.
  await context.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(origin)) return route.continue();
    external.add(u);
    return route.abort();
  });
  const page = await context.newPage();
  for (const p of pages) {
    await page.goto(origin + p, { waitUntil: 'load' });
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    for (const v of violations) {
      failures++;
      console.log(`[${colorScheme}] ${p}: ${v.id} (${v.impact}) ${v.help}`);
      for (const n of v.nodes.slice(0, 3)) console.log(`    ${n.target.join(' ')}  ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`);
    }
    // Reflow (WCAG 1.4.10): no sideways scrolling at 320 CSS px. Checked once, in the light scheme.
    if (colorScheme === 'light') {
      await page.setViewportSize({ width: 320, height: 640 });
      const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      if (sw > cw + 1) { failures++; console.log(`[320px] ${p}: page scrolls sideways (${sw} > ${cw}px)`); }
      await page.setViewportSize({ width: 1280, height: 800 });
    }
  }
  await context.close();
}
await browser.close();
server.close();
for (const u of external) console.log(`external request blocked: ${u}`);
if (failures || external.size) {
  console.log(`check-a11y: ${failures} violation(s), ${external.size} external request(s) on ${pages.length} pages`);
  process.exit(1);
}
console.log(`check-a11y: ${pages.length} pages x 2 color schemes, no axe violations, no sideways scrolling at 320px, no external requests`);
