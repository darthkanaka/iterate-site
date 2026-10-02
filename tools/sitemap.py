#!/usr/bin/env python3
"""Write sitemap.xml from the pages themselves.

Every page that can be indexed is listed by its own canonical URL, so the sitemap
can never disagree with the pages. A page with a robots noindex tag (the 404 page)
is left out. The date on each URL is the day its file last changed: today if it
has uncommitted changes, otherwise its last commit. A post can pin its date with
<meta property="article:modified_time">, which wins over git.

    python3 tools/sitemap.py           write sitemap.xml
    python3 tools/sitemap.py --check   exit 1 if sitemap.xml is out of date

tools/blog.py imports these functions with its own root to write the sitemap of a local
blog preview, whose pages are mostly links back to this repo's files.

Standard library only.
"""
import argparse
import datetime as dt
import re
import subprocess
import sys
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
SITEMAP = ROOT / "sitemap.xml"
FOLDERS = ["", "demos", "blog"]  # where pages live, in the order they're listed


def pages(root=ROOT):
    for folder in FOLDERS:
        d = root / folder
        if not d.is_dir():
            continue
        files = sorted(d.glob("*.html"), key=lambda p: (p.name != "index.html", p.name))
        yield from files


def git(*args, cwd=ROOT):
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True).stdout.strip()


def lastmod(path, html):
    pinned = re.search(r'<meta property="article:modified_time" content="(\d{4}-\d{2}-\d{2})', html)
    if pinned:
        return pinned.group(1)
    # Ask git about the real file, so a page that is a link into this repo (a blog preview)
    # gets that page's date. A file git doesn't know about is dated today.
    real = path.resolve()
    top = git("rev-parse", "--show-toplevel", cwd=real.parent)
    if not top:
        return dt.date.today().isoformat()
    top = Path(top).resolve()
    rel = str(real.relative_to(top))
    if git("status", "--porcelain", "--", rel, cwd=top):
        return dt.date.today().isoformat()
    return git("log", "-1", "--format=%cs", "--", rel, cwd=top) or dt.date.today().isoformat()


def entries(root=ROOT):
    out = []
    for path in pages(root):
        html = path.read_text(encoding="utf-8")
        if re.search(r'<meta name="robots" content="[^"]*noindex', html):
            continue
        canon = re.search(r'<link rel="canonical" href="([^"]+)"', html)
        if not canon:
            sys.exit(f"{path.relative_to(root)} has no canonical link, so it can't go in the sitemap")
        out.append((canon.group(1), lastmod(path, html)))
    return out


def render(rows):
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    lines += [f"  <url><loc>{escape(u)}</loc><lastmod>{d}</lastmod></url>" for u, d in rows]
    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="exit 1 if sitemap.xml is out of date")
    a = ap.parse_args()
    text = render(entries())
    if a.check:
        current = SITEMAP.read_text(encoding="utf-8") if SITEMAP.exists() else ""
        if current != text:
            sys.exit("sitemap.xml is out of date. Run python3 tools/sitemap.py")
        print("sitemap.xml is up to date")
        return
    SITEMAP.write_text(text, encoding="utf-8")
    print(f"sitemap.xml: {text.count('<url>')} pages")


if __name__ == "__main__":
    main()
