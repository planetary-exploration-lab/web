#!/usr/bin/env python3
"""Checks the built site in dist/. Standard library only.

1. External origins: no HTML, CSS or JS may load anything from an origin outside ALLOWED_LOAD.
   Plain outbound <a href> links are allowed (they load nothing until clicked).
2. Internal links: every site-internal href/src resolves to a file in dist/, and #fragments exist.
3. Every page has <html lang> set to a known locale, and lang attributes use known values.
4. Every <img> has an alt attribute; every page has a CSP meta tag and exactly one <main>.
5. Contact details: no mailto: or tel: links, and no links to hosts in NO_LINK_HOSTS. Contact goes
   through src/data/routes.yaml and the directory profile in src/lib/site.ts.

Usage: python3 scripts/check_dist.py [dist] [--base /web/]
"""
from __future__ import annotations

import argparse
import posixpath
import os
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

# Origins pages may load resources from. youtube-nocookie is used only by click-to-load video.
ALLOWED_LOAD = {"https://www.youtube-nocookie.com"}
# Origins that appear as identifiers, not requests (XML namespaces).
IDENTIFIERS = {"http://www.w3.org", "https://www.w3.org"}
# Origin of this site itself (canonical and hreflang links use absolute URLs). Before cutover, links to
# www.pxl.earth point at the old Squarespace site, so they count as external.
_site = urlsplit(os.environ.get("SITE_URL", "https://planetary-exploration-lab.github.io"))
SELF = {f"{_site.scheme}://{_site.netloc}"}
LANGS = {"en", "es", "fr", "ja"}
# Hosts the site must not link to.
NO_LINK_HOSTS = {"people.research.gatech.edu"}

URL_ATTRS = {"src", "href", "srcset", "poster", "data", "action", "formaction", "content"}
CSS_URL = re.compile(r"""url\(\s*['"]?([^'")]+)['"]?\s*\)|@import\s+['"]([^'"]+)['"]""")
ABS_URL = re.compile(r"""(?:https?:)?//[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?""", re.I)


def origin(u: str) -> str | None:
    p = urlsplit(u if not u.startswith("//") else "https:" + u)
    return f"{p.scheme}://{p.netloc}" if p.scheme in ("http", "https") and p.netloc else None


class Page(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.html_lang: str | None = None
        self.langs: list[str] = []
        self.ids: set[str] = set()
        self.loads: list[tuple[str, str]] = []  # (tag.attr, url) that fetch something
        self.links: list[str] = []  # <a href>, navigational
        self.imgs_without_alt = 0
        self.csp = False
        self.mains = 0
        self.inline: list[str] = []
        self._in_style = False
        self._a_text: list[str] | None = None  # text of the <a> being parsed
        self.url_link_texts: list[str] = []  # links whose visible text is a bare URL (WCAG 2.4.4, style guide)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = {k: (v or "") for k, v in attrs}
        if tag == "html":
            self.html_lang = a.get("lang")
        if "lang" in a:
            self.langs.append(a["lang"])
        if "id" in a:
            self.ids.add(a["id"])
        if tag == "main":
            self.mains += 1
        if tag == "img" and "alt" not in a:
            self.imgs_without_alt += 1
        if tag == "a" and "href" in a:
            self._a_text = []
        if tag == "meta" and a.get("http-equiv", "").lower() == "content-security-policy":
            self.csp = True
        if tag == "meta" and a.get("http-equiv", "").lower() == "refresh":
            m = re.search(r"url=(.+)$", a.get("content", ""), re.I)
            if m:
                self.links.append(m.group(1).strip())
        if tag == "style" or "style" in a:
            self.inline.append(f"<{tag}> inline style")
        if tag == "script" and "src" not in a and a.get("type") != "application/ld+json":
            self.inline.append("<script> inline script")
        if any(k.startswith("on") for k in a):
            self.inline.append(f"<{tag}> inline event handler")
        for k, v in a.items():
            if k not in URL_ATTRS or not v or (tag == "meta" and k == "content"):
                continue
            urls = [s.strip().split()[0] for s in v.split(",") if s.strip()] if k == "srcset" else [v]
            for u in urls:
                if tag == "a" and k == "href":
                    self.links.append(u)
                elif tag == "link" and a.get("rel", "") in ("canonical", "alternate"):
                    self.links.append(u)
                else:
                    self.loads.append((f"{tag}.{k}", u))

    def handle_data(self, data: str) -> None:
        if self._a_text is not None:
            self._a_text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._a_text is not None:
            text = "".join(self._a_text).strip()
            if re.match(r"https?://", text):
                self.url_link_texts.append(text)
            self._a_text = None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("dist", nargs="?", default="dist")
    ap.add_argument("--base", default=os.environ.get("BASE_PATH", "/"))
    args = ap.parse_args()
    dist = Path(args.dist)
    base = "/" + args.base.strip("/") + "/" if args.base.strip("/") else "/"
    if not dist.is_dir():
        print(f"{dist}/ not found. Run `npm run build` first.", file=sys.stderr)
        return 2

    errors: list[str] = []
    pages: dict[Path, Page] = {}
    for f in sorted(dist.rglob("*.html")):
        p = Page()
        p.feed(f.read_text("utf-8"))
        pages[f] = p

    def resolve(u: str, page_file: Path) -> tuple[Path | None, str]:
        """Map a site-internal URL to a file in dist. Returns (None, '') for external or ignorable URLs."""
        s = urlsplit(u)
        if s.scheme in ("mailto", "tel", "data") or (s.scheme and s.scheme not in ("http", "https")):
            return None, ""
        if s.scheme or u.startswith("//"):
            if origin(u) not in SELF:
                return None, ""
            # Absolute self links (canonical, hreflang) carry the base path too.
        path = unquote(s.path)
        if not path:
            return page_file, s.fragment
        if not path.startswith("/"):
            # Relative link: resolve against the page's own URL (base path included) and normalize "..".
            page_dir = base + str(page_file.parent.relative_to(dist)).replace("\\", "/")
            joined = posixpath.normpath(posixpath.join(page_dir, path))
            path = joined + ("/" if path.endswith("/") else "")
        if not path.startswith(base):
            return dist / "__outside_base__" / path.lstrip("/"), s.fragment
        rel = path[len(base):]
        target = dist / rel
        if path.endswith("/"):
            target = target / "index.html"
        return target, s.fragment

    for f, p in pages.items():
        name = str(f.relative_to(dist))
        if p.html_lang not in LANGS:
            errors.append(f"{name}: <html lang> is {p.html_lang!r}, expected one of {sorted(LANGS)}")
        for lang in p.langs:
            if lang.split("-")[0] not in LANGS:
                errors.append(f"{name}: unexpected lang={lang!r}")
        for t in p.url_link_texts[:3]:
            errors.append(f"{name}: link text is a bare URL ({t[:60]}); describe the target instead")
        if p.imgs_without_alt:
            errors.append(f"{name}: {p.imgs_without_alt} <img> without alt")
        if not p.csp:
            errors.append(f"{name}: missing Content-Security-Policy meta tag")
        if p.mains != 1:
            errors.append(f"{name}: expected one <main>, found {p.mains}")
        errors += [f"{name}: {x} (breaks the CSP)" for x in p.inline]
        for where, u in p.loads:
            o = origin(u)
            if o and o not in ALLOWED_LOAD and o not in SELF:
                errors.append(f"{name}: {where} loads from external origin {o}")
        for u in p.links:
            s = urlsplit(u)
            if s.scheme in ("mailto", "tel"):
                errors.append(f"{name}: {s.scheme}: link (use a route or the directory profile)")
            elif (s.hostname or "").lower() in NO_LINK_HOSTS:
                errors.append(f"{name}: links to {s.hostname}, which is in NO_LINK_HOSTS")
        for u in p.links + [u for _, u in p.loads]:
            target, frag = resolve(u, f)
            if target is None:
                continue
            if not target.is_file():
                errors.append(f"{name}: broken internal link {u}")
            elif frag and target.suffix == ".html" and frag not in pages[target].ids:
                errors.append(f"{name}: link {u} points to missing #{frag}")

    # Privacy guard: start and end dates in people records are private and must never be served.
    # Runs when the private records are available (deploy build); fixtures are fake but checked too.
    people_dir = Path(os.environ.get("PEOPLE_DIR", "fixtures/people"))
    record_dates: set[str] = set()
    for rec in list(people_dir.glob("*.yaml")) + list(people_dir.glob("*.md")):
        for m in re.finditer(r"^\s+(?:start|end):\s*(\d{4}-\d{2}-\d{2})\s*$", rec.read_text("utf-8"), re.M):
            record_dates.add(m.group(1))
    if record_dates:
        for f in list(dist.glob("*/people/**/*.html")) + list(dist.glob("*/projects/**/*.html")):
            text = f.read_text("utf-8")
            for d in record_dates:
                y, mo, dd = d.split("-")
                for pat in (d, f"{int(mo)}/{int(dd)}/{y}", f"{y}/{mo}/{dd}"):
                    if pat in text:
                        errors.append(f"{f.relative_to(dist)}: shows a private date from a people record ({pat})")

    for f in sorted(list(dist.rglob("*.css")) + list(dist.rglob("*.js")) + list(dist.rglob("*.mjs"))):
        text = f.read_text("utf-8", errors="replace")
        found = {m.group(1) or m.group(2) for m in CSS_URL.finditer(text)} if f.suffix == ".css" else set()
        found |= set(ABS_URL.findall(text))
        for u in found:
            o = origin(u)
            if o and o not in ALLOWED_LOAD and o not in SELF and o not in IDENTIFIERS:
                errors.append(f"{f.relative_to(dist)}: references external origin {o}")

    if errors:
        print(f"check_dist: {len(errors)} problem(s)")
        for e in errors:
            print("  " + e)
        return 1
    print(f"check_dist: {len(pages)} pages OK (origins, internal links, lang, alt, CSP, contact links)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
