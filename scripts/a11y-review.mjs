// Scripted part of the manual accessibility review (one page per type): headings, landmarks, link text, alt text,
// keyboard order and visible focus, skip link, reflow at 320 px and 200% zoom, text spacing, reduced motion, and
// hover/focus contrast in both themes. Findings need human judgment; CI runs the strict checks (npm run check).
// Usage: npm run preview (or any server for dist), then: node scripts/a11y-review.mjs http://127.0.0.1:4321/web > review.json
import { chromium } from 'playwright';

const root = process.argv[2].replace(/\/$/, '');
const PAGES = {
  home: '/en/', projects: '/en/projects/', filter: '/en/projects/active/', project: '/en/projects/setg/',
  people: '/en/people/', person: '/en/people/carr/', news: '/en/news/', publications: '/en/publications/',
  publication: '/en/publications/carr2023-solid/', gallery: '/en/gallery/', photo: '/en/gallery/minion/',
  contact: '/en/contact/', join: '/en/join/', about: '/en/about-site/', notfound: '/404.html',
};
const out = {};
const browser = await chromium.launch();

function lum([r, g, b]) { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
function ratio(a, b) { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); }

for (const [name, path] of Object.entries(PAGES)) {
  const r = (out[name] = { path, issues: [] });
  const issue = (kind, detail) => r.issues.push({ kind, detail });

  // 1. Structure, links, images (desktop, light)
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  const page = await ctx.newPage();
  await page.goto(root + path);
  const s = await page.evaluate(() => {
    const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter((h) => h.offsetParent !== null || h.getClientRects().length).map((h) => ({ l: +h.tagName[1], t: h.textContent.trim().slice(0, 60) }));
    const lm = { header: document.querySelectorAll('header, [role=banner]').length, nav: document.querySelectorAll('nav, [role=navigation]').length, main: document.querySelectorAll('main, [role=main]').length, footer: document.querySelectorAll('footer, [role=contentinfo]').length };
    const links = [...document.querySelectorAll('a[href]')].map((a) => ({ text: (a.getAttribute('aria-label') || a.textContent || [...a.querySelectorAll('img')].map((i) => i.alt).join(' ')).replace(/\s+/g, ' ').trim(), href: a.href, target: a.target }));
    const imgs = [...document.querySelectorAll('img')].map((i) => {
      const fig = i.closest('figure'); const cap = fig?.querySelector('figcaption')?.textContent.trim() || '';
      return { alt: i.getAttribute('alt'), cap, src: i.currentSrc.split('/').pop() };
    });
    const title = document.title; const lang = document.documentElement.lang;
    return { heads, lm, links, imgs, title, lang };
  });
  r.title = s.title;
  const h1s = s.heads.filter((h) => h.l === 1).length;
  if (h1s !== 1) issue('headings', `${h1s} h1 elements`);
  s.heads.forEach((h, i) => { if (i && h.l > s.heads[i - 1].l + 1) issue('headings', `skip h${s.heads[i - 1].l} -> h${h.l} at "${h.t}"`); });
  for (const [k, v] of Object.entries(s.lm)) if (v < 1) issue('landmarks', `no ${k}`);
  if (s.lm.main > 1) issue('landmarks', `${s.lm.main} main landmarks`);
  const byText = new Map();
  for (const l of s.links) {
    if (!l.text) issue('links', `empty link text -> ${l.href}`);
    if (/^(here|click here|more|read more|link|this)$/i.test(l.text)) issue('links', `generic text "${l.text}" -> ${l.href}`);
    if (/^https?:\/\//.test(l.text)) issue('links', `bare URL as text: ${l.text.slice(0, 80)}`);
    if (l.target === '_blank') issue('links', `opens new window: "${l.text}"`);
    const key = l.text.toLowerCase(); const hrefs = byText.get(key) || new Set(); hrefs.add(l.href.replace(/#.*$/, '')); byText.set(key, hrefs);
  }
  for (const [t, hrefs] of byText) if (t && hrefs.size > 1) issue('links', `"${t}" goes to ${hrefs.size} different targets`);
  for (const i of s.imgs) {
    if (i.alt === null) issue('images', `missing alt: ${i.src}`);
    else if (i.alt && i.cap && i.alt.trim().toLowerCase() === i.cap.toLowerCase()) issue('images', `alt repeats caption: ${i.src}`);
    else if (/^(image|photo|picture|graphic) of\b/i.test(i.alt || '')) issue('images', `alt starts "${i.alt.split(' ').slice(0, 2).join(' ')}": ${i.src}`);
    else if ((i.alt || '').length > 300) issue('images', `alt over 300 characters: ${i.src}`);
    else if (/\.(webp|jpe?g|png)$|^img_|^dsc/i.test(i.alt || '')) issue('images', `alt looks like a file name: ${i.src}`);
  }
  r.alts = s.imgs.filter((i) => i.alt).map((i) => i.alt);

  // 2. Keyboard: skip link, order, visible focus, focus not obscured
  await page.goto(root + path);
  const stops = [];
  for (let n = 0; n < 250; n++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => {
      const e = document.activeElement; if (!e || e === document.body) return null;
      const cs = getComputedStyle(e); const rect = e.getClientRects()[0] || e.getBoundingClientRect();
      const visible = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1) || (cs.boxShadow && cs.boxShadow !== 'none');
      const cx = rect.left + Math.min(rect.width / 2, 8), cy = rect.top + rect.height / 2;
      const top = document.elementFromPoint(Math.max(0, Math.min(cx, innerWidth - 1)), Math.max(0, Math.min(cy, innerHeight - 1)));
      const obscured = rect.width > 0 && top && !(e === top || e.contains(top) || top.contains(e));
      return { tag: e.tagName.toLowerCase(), text: (e.getAttribute('aria-label') || e.textContent || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 50), id: e.id, visible, obscured, w: rect.width, h: rect.height, inView: rect.bottom > 0 && rect.top < innerHeight };
    });
    if (!f) break;
    const key = `${f.tag}|${f.text}|${f.id}`;
    if (stops.length && stops[0].key === key) break; // wrapped around
    stops.push({ ...f, key });
  }
  r.tabStops = stops.length;
  if (!stops.length || !/skip/i.test(stops[0].text)) issue('keyboard', `first Tab stop is not the skip link: "${stops[0]?.text}"`);
  for (const f of stops) {
    if (!f.visible) issue('keyboard', `no visible focus indicator: ${f.tag} "${f.text}"`);
    if (f.obscured) issue('keyboard', `focused element covered by another element: ${f.tag} "${f.text}"`);
    if (!f.inView) issue('keyboard', `focused element out of view: ${f.tag} "${f.text}"`);
  }
  // skip link moves focus to main
  await page.goto(root + path); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  const afterSkip = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
  if (afterSkip !== 'main') issue('keyboard', `skip link did not move focus to main (focus on ${afterSkip})`);
  await ctx.close();

  // 3. Reflow at 320 CSS px and 200% zoom (640 px viewport), light and dark
  for (const [label, width] of [['320px', 320], ['zoom200', 640]]) {
    const c = await browser.newContext({ viewport: { width, height: 800 } });
    const p = await c.newPage(); await p.goto(root + path);
    const over = await p.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const wide = [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > w + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('[style*="overflow"], pre, table, .scroll'); }).slice(0, 5).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')} "${(e.textContent || '').trim().slice(0, 30)}"`);
      return { sw: document.documentElement.scrollWidth, w, wide };
    });
    if (over.sw > over.w + 1) issue('reflow', `${label}: page scrolls sideways (${over.sw} > ${over.w}); widest: ${over.wide.join('; ')}`);
    await c.close();
  }

  // 4. Text spacing override (WCAG 1.4.12)
  {
    const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
    const p = await c.newPage(); await p.goto(root + path);
    await p.addStyleTag({ content: '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }' });
    const clip = await p.evaluate(() => {
      const res = [];
      for (const e of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(e);
        if (!e.textContent.trim() || e.children.length > 3) continue;
        const hidden = /hidden|clip/.test(cs.overflow + cs.overflowX + cs.overflowY);
        if (hidden && (e.scrollHeight > e.clientHeight + 2 || e.scrollWidth > e.clientWidth + 2) && !e.classList.contains('visually-hidden') && !e.matches('.skip-link')) res.push(`${e.tagName.toLowerCase()}.${[...e.classList].join('.')} "${e.textContent.trim().slice(0, 30)}"`);
      }
      return { res: res.slice(0, 5), sw: document.documentElement.scrollWidth, w: document.documentElement.clientWidth };
    });
    for (const x of clip.res) issue('text-spacing', `text clipped: ${x}`);
    if (clip.sw > clip.w + 1) issue('text-spacing', `page scrolls sideways with text spacing (${clip.sw} > ${clip.w})`);
    await c.close();
  }

  // 5. Reduced motion
  {
    const c = await browser.newContext({ reducedMotion: 'reduce' });
    const p = await c.newPage(); await p.goto(root + path); await p.waitForTimeout(300);
    const anims = await p.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    if (anims) issue('motion', `${anims} animations running with reduced motion on`);
    await c.close();
  }

  // 6. Hover and focus contrast of links in both themes
  for (const scheme of ['light', 'dark']) {
    const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
    const p = await c.newPage(); await p.goto(root + path);
    const handles = await p.$$('header a[href], main a[href], footer a[href], main button');
    const sample = handles.filter((_, i) => i < 4 || i % 7 === 0).slice(0, 14);
    for (const h of sample) {
      if (!(await h.isVisible())) continue;
      for (const state of ['hover', 'focus']) {
        try { state === 'hover' ? await h.hover({ timeout: 1000 }) : await h.focus(); } catch { continue; }
        await p.waitForTimeout(30);
        const res = await h.evaluate((e) => {
          const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number);
          let fg = parse(getComputedStyle(e).color);
          let el = e, bg = null;
          while (el) { const b = parse(getComputedStyle(el).backgroundColor); if (b.length >= 3 && (b[3] === undefined || b[3] > 0.5)) { bg = b; break; } el = el.parentElement; }
          return { fg: fg.slice(0, 3), bg: (bg || [255, 255, 255]).slice(0, 3), text: (e.textContent || '').trim().slice(0, 30), big: parseFloat(getComputedStyle(e).fontSize) >= 24 };
        });
        if (!res.text) continue; // image-only control: text contrast does not apply
        const cr = ratio(res.fg, res.bg);
        if (cr < (res.big ? 3 : 4.5)) issue('contrast', `${scheme} ${state}: "${res.text}" ${cr.toFixed(2)}:1`);
      }
    }
    await c.close();
  }
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
