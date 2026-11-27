#!/usr/bin/env python3
"""Scans files bound for this public repo for secrets and personal data. Standard library only.

Run it before every commit:
    python3 -I scripts/check_private.py            # all tracked and untracked (not ignored) files
    python3 -I scripts/check_private.py --staged   # only what is staged for the next commit

It fails (exit 1) on:
  - secrets: token patterns, private key blocks, 1Password references
  - email addresses outside example.org/.com/.net, and phone-number patterns
  - person records (YAML with name + consent) outside fixtures/people/, or fixtures not marked "(fake)"
  - images carrying EXIF metadata (can hold GPS location, camera serial, owner name), HEIC files,
    images over 1.5 MB, and SVGs with scripts, event handlers or external references
  - forbidden paths: private/, .env files, key files
  - local file paths in text (Windows user folders, macOS or Linux home folders, file URLs)

A line that is a deliberate exception can carry the marker `pxl-allow-private`. Use it sparingly.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

ALLOW_MARKER = "pxl-allow-private"
ALLOWED_EMAIL_DOMAINS = re.compile(r"@(example\.(org|com|net)|users\.noreply\.github\.com)$", re.I)

SECRETS = {
    "GitHub token": re.compile(r"\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b"),
    "AWS access key": re.compile(r"\b(AKIA|ASIA)[A-Z0-9]{16}\b"),
    "Slack token": re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}\b"),
    "Google API key": re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b"),
    "OpenAI/Anthropic-style key": re.compile(r"\bsk-(ant-)?[A-Za-z0-9_-]{32,}\b"),
    "private key block": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "1Password reference": re.compile(r"\bop://[^\s'\"`]+"),
    "password assignment": re.compile(r"""(?i)\b(password|passwd|secret|api[_-]?key)\s*[:=]\s*['"][^'"\s]{8,}['"]"""),
}
EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
LOCAL_PATH = re.compile(r"(?i)\b[a-z]:(\\|%5c)(users|documents and settings)(\\|%5c)|file:///|(?<![\w.])/(Users|home)/[a-z0-9._-]+/")  # pxl-allow-private
PHONE = re.compile(r"(?<![\w.-])(\+\d{1,3}[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?![\w.-])")
FORBIDDEN_PATH = re.compile(
    r"(^|/)(private/|\.env($|\.)|id_(rsa|ed25519|ecdsa)(\.pub)?$|[^/]+\.(pem|key|p12|pfx|keychain)$)"
)
SKIP_TEXT_CHECKS = {"package-lock.json"}  # integrity hashes; secrets in it are still caught by push protection
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".gif", ".avif"}
MAX_IMAGE_BYTES = 1_500_000  # see docs/images.md; prepare images with scripts/prepare_images.mjs
SVG_UNSAFE = re.compile(r"<script|<foreignObject|\son[a-z]+\s*=|(?:href|src)\s*=\s*[\"'](?:https?:)?//|@import|url\(\s*['\"]?(?:https?:)?//", re.I)


def files_to_scan(staged: bool) -> list[str]:
    cmd = (
        ["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]
        if staged
        else ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"]
    )
    out = subprocess.run(cmd, check=True, capture_output=True).stdout.decode()
    return [f for f in out.split("\0") if f]


def has_exif(data: bytes, ext: str) -> bool:
    if ext in (".jpg", ".jpeg"):
        return b"Exif\x00\x00" in data[:65536]
    if ext == ".png":
        return b"eXIf" in data or b"iTXtXML:com.adobe.xmp" in data
    if ext == ".webp":
        return b"EXIF" in data[:65536] or b"XMP " in data[:65536]
    if ext in (".tif", ".tiff"):
        return True  # TIFF is EXIF-structured; don't commit TIFFs
    return False


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--staged", action="store_true", help="scan only files staged for commit")
    args = ap.parse_args()

    problems: list[str] = []
    files = files_to_scan(args.staged)
    for name in files:
        path = Path(name)
        if not path.is_file():
            continue
        if FORBIDDEN_PATH.search(name):
            problems.append(f"{name}: forbidden path (private data, env or key file)")
            continue
        ext = path.suffix.lower()
        data = path.read_bytes()
        if ext in (".heic", ".heif"):
            problems.append(f"{name}: HEIC image (convert to JPEG and strip metadata)")
        if ext in IMAGE_EXT and len(data) > MAX_IMAGE_BYTES:
            problems.append(f"{name}: image is {len(data) // 1024} KB (limit {MAX_IMAGE_BYTES // 1000} KB; run scripts/prepare_images.mjs)")
        if ext == ".svg" and SVG_UNSAFE.search(data.decode("utf-8", "replace")):
            problems.append(f"{name}: SVG contains a script, event handler, foreignObject or external reference")
        if ext in IMAGE_EXT and has_exif(data, ext):
            problems.append(f"{name}: image has EXIF/XMP metadata (strip it: it can hold location and device data)")
        if ext in IMAGE_EXT or b"\0" in data[:8192]:
            continue  # binary
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            continue
        if path.name in SKIP_TEXT_CHECKS:
            continue

        for i, line in enumerate(text.splitlines(), 1):
            if ALLOW_MARKER in line:
                continue
            for label, rx in SECRETS.items():
                if rx.search(line):
                    problems.append(f"{name}:{i}: possible {label}")
            for m in EMAIL.finditer(line):
                if not ALLOWED_EMAIL_DOMAINS.search(m.group(0)):
                    problems.append(f"{name}:{i}: email address {m.group(0)!r} (use example.org placeholders)")
            if LOCAL_PATH.search(line):
                problems.append(f"{name}:{i}: local file path (link to a public URL instead)")
            if PHONE.search(line):
                problems.append(f"{name}:{i}: possible phone number")

        # Person records belong in web-private. Only fake fixtures may live here.
        if ext in (".yaml", ".yml") and re.search(r"^name:", text, re.M) and re.search(r"^consent:", text, re.M):
            if not name.startswith("fixtures/people/"):
                problems.append(f"{name}: looks like a person record outside fixtures/people/ (real people go in web-private)")
            elif not re.search(r"^\s*-?\s*role:.*\(fake\)", text, re.M):
                problems.append(f"{name}: fixture person must have \"(fake)\" in its role")

    if problems:
        print(f"check_private: {len(problems)} problem(s) in {len(files)} files")
        for p in problems:
            print("  " + p)
        print("Fix these before committing. Real people data belongs only in web-private.")
        return 1
    print(f"check_private: {len(files)} files OK (secrets, emails, phones, person records, image metadata, paths)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
