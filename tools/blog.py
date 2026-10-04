#!/usr/bin/env python3
"""The iteratehi.com blog, generated from the vault.

Posts are written in Obsidian, one Markdown note each, in ~/Documents/Obsidian/iterate/posts/
with their pictures in ~/Documents/Obsidian/iterate/images/<slug>/. This tool reads them
straight from there. The Markdown is never copied into this repo: the repo is public and
serves every file in it, and a draft can hold private notes. The writing contract (the
frontmatter fields, the link shortcodes, the "Needs Kawika" box) is the vault note
iterate/README.md, and this file implements exactly that contract.

    python3 tools/blog.py                 publish: render the live posts into the repo
    python3 tools/blog.py --preview       a complete local mirror in .preview/, drafts included
    python3 tools/blog.py --check         check every post, drafts too, and write nothing

    --vault DIR    read posts from DIR instead (pictures from DIR/../images/)
    --out DIR      where --preview builds its mirror (default .preview)
    --no-cards     --preview only: skip drawing the share cards, for a quicker look

Publishing renders a post when its status is "published" and its date is today or earlier in
Honolulu. It writes blog/<slug>.html, blog/index.html, feed.xml, the post's pictures and share
card under assets/img/blog/<slug>/, fills the home page block between <!-- blog:latest --> and
<!-- /blog:latest --> when index.html has both, removes what it generated before and no longer
produces, then rewrites sitemap.xml with tools/sitemap.py. Every page it writes opens its body
with the generated-by comment below, which is how it knows a file is its own. A published post
that fails a check is not rendered, any page and pictures it had before are removed like any
other old output (so the blog index, feed, home block and sitemap all agree), and the run exits
1, so nothing should be committed until the check passes.

Comments (%% ... %% and <!-- ... -->) never reach a page. One that never closes hides the rest
of the note, as it does in Obsidian, and is an error.

Needs Python's markdown, PyYAML and Pillow. Share cards are drawn by tools/og.mjs with
Playwright (NODE_PATH, as for tools/check.mjs); without it the posts use the site's own share
picture and the run says so.
"""
from __future__ import annotations

import sys

sys.dont_write_bytecode = True  # no __pycache__ in a repo that serves every file

import argparse
import datetime as dt
import html as htmllib
import importlib.util
import json
import math
import os
import re
import shutil
import subprocess
import tempfile
import unicodedata
import xml.etree.ElementTree as ET
from email.utils import format_datetime
from pathlib import Path

import markdown
import yaml
from markdown.extensions import Extension
from markdown.extensions.fenced_code import FencedBlockPreprocessor
from markdown.treeprocessors import Treeprocessor
from PIL import Image, ImageOps

# -- Wording for the blog index. Placeholders until Kawika approves them. -----------------------
INDEX_TITLE = "Plain answers about AI for small businesses | Iterate"
INDEX_H1 = "Plain answers about AI for small businesses"
INDEX_DESCRIPTION = ("Plain-English answers about AI receptionists, automation and custom apps "
                     "for small businesses, from the team that builds them in Honolulu.")
INDEX_LEDE = "The questions owners ask us before they hire anyone, answered the way we'd answer them across a table."

# The closing band's line when a post has no `closing:` of its own.
CLOSING_DEFAULT = ("We've built these for real businesses, and we know which tools hold up and which "
                   "don't. Tell us what's eating your week and we'll show you what we'd build.")

# Author bios for the box under each post. Every fact here is on about.html; add nothing that
# isn't there. Name, role and photo are read from about.html at build time.
BIOS = {
    "kawika": ("Kawika majored in film, then turned to running businesses, and became a partner at "
               "9th Avenue Studio working across branding, photography, video, web development and "
               "animation. He has studied and put AI tools to work for Hawaiʻi's small business community."),
    "dave": ("Dave started out delivering some of Hawaiʻi's earliest web services, then moved into web "
             "design, branding and video and co-founded 9th Avenue Studio. Today he runs several "
             "businesses in home services and digital media and brings decades of experience in "
             "digital services to the AI work."),
    "ben": ("Ben is a digital strategist with a background in marketing, video production and nonprofit "
            "leadership, and more than five years in digital marketing. When AI first emerged he began "
            "researching and building it for businesses, and found a real passion for practical tools "
            "that help companies thrive."),
}

REPO = Path(__file__).resolve().parent.parent
TOOLS = Path(__file__).resolve().parent
VAULT = Path.home() / "Documents" / "Obsidian" / "iterate" / "posts"
SITE = "https://iteratehi.com/"
HST = dt.timezone(dt.timedelta(hours=-10), "HST")  # Honolulu keeps no daylight saving
NODE_PATH_DEFAULT = "/Users/veex/Documents/Developer/kawikalopez-site/tools/node_modules"
MARKER = "<!-- generated by tools/blog.py: edit the post in the vault, not this file -->"
HOME_OPEN, HOME_CLOSE = "<!-- blog:latest -->", "<!-- /blog:latest -->"
PREVIEW_STAMP = ".iterate-preview"

AUTHORS = ("kawika", "dave", "ben")
PILLARS = {
    "education": "Education", "rabbit-hole": "Rabbit hole", "case-study": "Case study",
    "landscape": "Landscape", "industry": "Industry", "field-notes": "Field notes",
}
DEMOS = ("phone", "portal", "handyman", "inventory")
WORDS = {"field-notes": (600, 900)}
WORDS_DEFAULT = (800, 2000)  # as long as the answer needs; never padded (Kawika, 2026-10-04)
MAX_WIDTH = 1600
IDS_USED_BY_PAGE = {"main", "menu", "mark", "post-demo-title", "post-author-title",
                    "post-related-title", "post-cta-title", "post-list-title"}


class BlogError(Exception):
    pass


# -- Small helpers -------------------------------------------------------------------------------

def esc(s):
    return htmllib.escape(str(s), quote=False)


def attr(s):
    return htmllib.escape(str(s), quote=True).replace("&#x27;", "'")


def long_date(d):
    return f"{d:%B} {d.day}, {d.year}"


def today_hst():
    return dt.datetime.now(HST).date()


def slugify(s):
    s = unicodedata.normalize("NFKD", str(s))
    s = "".join(c for c in s if not unicodedata.combining(c) and c not in "ʻ'’‘")
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def fold(s):
    """Lowercase without ʻokina, kahakō or apostrophes, for comparing phrases."""
    s = unicodedata.normalize("NFKD", str(s))
    s = "".join(c for c in s if not unicodedata.combining(c) and c not in "ʻ'’‘`")
    return re.sub(r"\s+", " ", s.lower()).strip()


def clean(v):
    return "" if v is None else str(v).strip()


def parse_date(v):
    s = clean(v)
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return None
    try:
        return dt.date.fromisoformat(s)
    except ValueError:
        return None


STASH = re.compile("\x02[^\x03]*\x03")


def plain(el, skip=()):
    """The text of an element tree, leaving out any tags named in skip."""
    parts = [el.text or ""]
    for c in el:
        if c.tag not in skip:
            parts.append(plain(c, skip))
        parts.append(c.tail or "")
    return STASH.sub("", "".join(parts))


def count_words(text):
    return len(re.findall(r"[^\W_]+(?:['’ʻ.,][^\W_]+)*", text))


def is_internal(href):
    if href.startswith(("http://iteratehi.com", "https://iteratehi.com", "https://www.iteratehi.com")):
        return True
    return bool(href) and not re.match(r"^(#|[a-zA-Z][a-zA-Z0-9+.-]*:|//)", href)


# -- Posts ---------------------------------------------------------------------------------------

FM = re.compile(r"\A\ufeff?---[ \t]*\n(.*?)\n---[ \t]*(?:\n(.*))?\Z", re.S)


def _quote_loose(block):
    """Quote plain values that contain ': ' (easy to type in Obsidian, invalid YAML)."""
    out = []
    for line in block.splitlines():
        m = re.match(r"^([A-Za-z_]+):\s+(.*)$", line)
        if m and ": " in m.group(2) and not m.group(2).startswith(("'", '"', "[", "{")):
            line = f'{m.group(1)}: "' + m.group(2).replace('"', '\\"') + '"'
        out.append(line)
    return "\n".join(out)


class Post:
    def __init__(self, path, raw):
        self.path = Path(path)
        self.raw = raw.replace("\r\n", "\n")
        self.errors, self.warnings = [], []
        meta, body, bad_yaml = {}, self.raw, False
        self.body_line = 1  # the file's line number where the body starts, for messages
        m = FM.match(self.raw)
        if m:
            body = m.group(2) or ""
            self.body_line = self.raw.count("\n", 0, m.start(2)) + 1 if m.group(2) is not None else 1
            try:
                meta = yaml.safe_load(m.group(1)) or {}
            except yaml.YAMLError:
                try:
                    meta = yaml.safe_load(_quote_loose(m.group(1))) or {}
                except yaml.YAMLError:
                    bad_yaml = True
            if not isinstance(meta, dict):
                meta, bad_yaml = {}, True
        self.meta, self.body, self.bad_yaml, self.has_frontmatter = meta, body, bad_yaml, bool(m)
        g = lambda k: clean(meta.get(k))  # noqa: E731
        self.slug = g("slug") or slugify(self.path.stem)
        self.title = g("title")
        self.description = g("description")
        self.target = g("target")
        self.seo_title = g("seo_title") or (f"{self.title} | Iterate" if self.title else "")
        self.pillar = g("pillar").lower()
        self.author = g("author").lower()
        self.demo = g("demo").lower()
        self.status = g("status").lower() or "draft"
        self.date_raw, self.updated_raw = g("date"), g("updated")
        self.date, self.updated = parse_date(self.date_raw), parse_date(self.updated_raw)
        self.closing = g("closing")
        self.words, self.minutes = 0, 1

    @property
    def published(self):
        return self.status == "published"

    def live(self, today):
        return self.published and self.date is not None and self.date <= today

    @property
    def modified(self):
        if self.updated and self.date and self.updated > self.date:
            return self.updated
        return self.date

    @property
    def pillar_label(self):
        return PILLARS.get(self.pillar, self.pillar.replace("-", " ").capitalize() or "Blog")

    @property
    def sort_key(self):
        return (-(self.date or dt.date.max).toordinal(), self.title.lower(), self.slug)

    @property
    def canonical(self):
        return f"{SITE}blog/{self.slug}"

    @property
    def name(self):
        return self.path.name


def load_posts(vault):
    vault = Path(vault)
    if not vault.is_dir():
        raise BlogError(f"no posts folder at {vault}")
    return [Post(f, f.read_text(encoding="utf-8")) for f in sorted(vault.glob("*.md"))]


# -- What the build reads from the site ----------------------------------------------------------

def depth1(fragment):
    """Rewrite a root page's relative href and src values for a page one folder down."""
    def fix(m):
        name, url = m.group(1), m.group(2)
        if re.match(r"^(#|[a-zA-Z][a-zA-Z0-9+.-]*:|//|/)", url):
            return m.group(0)
        if url == "index.html" or url.startswith("index.html#"):
            url = "../" + url[len("index.html"):]
        else:
            url = "../" + url
        return f'{name}="{url}"'
    return re.sub(r'(?<![\w:-])(href|src)="([^"]*)"', fix, fragment)


def mark_blog_current(fragment):
    fragment = re.sub(r'\s+aria-current="[^"]*"', "", fragment)
    return re.sub(r'(<a\b[^>]*\bhref="[^"]*blog/(?:index\.html)?")', r'\1 aria-current="page"', fragment)


def text_of(fragment):
    return re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", "", fragment))).strip()


class Site:
    """Everything the blog takes from the hand-written pages, read once per build."""

    def __init__(self, repo):
        self.repo = repo = Path(repo)
        src_path = repo / "what-we-do.html"
        if not src_path.is_file():
            raise BlogError(f"{src_path} is missing, and the blog takes its chrome from it")
        src = src_path.read_text(encoding="utf-8")
        m = re.search(r'(<body\b[^>]*>)(.*?<nav class="nav-menu"[^>]*>.*?</nav>)', src, re.S)
        f = re.search(r"<footer\b[^>]*>.*?</footer>", src, re.S)
        if not m or not f:
            raise BlogError("what-we-do.html no longer has a <body> through the mobile menu's </nav> "
                            "and a <footer>...</footer>, so the blog can't copy the site chrome")
        self.body_tag = m.group(1)
        self.top = mark_blog_current(depth1(m.group(2)))
        self.footer = mark_blog_current(depth1(f.group(0)))
        head = src.split("</head>", 1)[0]
        self.head_links = [depth1(x) for x in re.findall(
            r'<link rel="(?:icon|apple-touch-icon|manifest|preload)"[^>]*>', head)]
        # The analytics snippet travels with the chrome, so posts count visits exactly like the
        # hand-written pages (and, like them, skip previews and automated browsers).
        ga = re.search(r"<script>\s*/\* Google Analytics.*?</script>", head, re.S)
        self.analytics = ga.group(0) if ga else ""
        tc = re.search(r'<meta name="theme-color" content="([^"]+)"', head)
        self.theme_color = tc.group(1) if tc else "#f0eee8"
        alt = re.search(r'<meta property="og:image:alt" content="([^"]+)"', head)
        self.default_og_alt = htmllib.unescape(alt.group(1)) if alt else "The Iterate HI mark"
        self.reserved_ids = set(IDS_USED_BY_PAGE) | set(re.findall(r'\bid="([^"]+)"', self.top + self.footer))
        self.pages = {p.stem for p in repo.glob("*.html")}

        self.demos, cta = {}, None
        for p in sorted((repo / "demos").glob("*.html")):
            s = p.read_text(encoding="utf-8")
            h1 = re.search(r"<h1\b[^>]*>(.*?)</h1>", s, re.S)
            desc = re.search(r'<meta name="description" content="([^"]*)"', s)
            if h1 and desc:
                self.demos[p.stem] = {"h1": text_of(h1.group(1)), "description": htmllib.unescape(desc.group(1))}
            c = re.search(r'<section class="[^"]*\bdemo-cta\b[^"]*">.*?(<a class="btn\b[^>]*>.*?</a>)', s, re.S)
            if c and not cta:
                cta = c.group(1)
        if not cta:
            raise BlogError("no demo page has a closing band (.demo-cta) to copy the Let's Connect button from")
        self.cta_button = re.sub(r'href="[^"]*"', 'href="../contact.html"', cta, count=1)

        self.authors = {}
        about = (repo / "about.html").read_text(encoding="utf-8")
        for pid, block in re.findall(r'<article class="person" id="([a-z]+)"[^>]*>(.*?)</article>', about, re.S):
            img = re.search(r"<img\b[^>]*>", block)
            name = re.search(r"<h3[^>]*>(.*?)</h3>", block, re.S)
            role = re.search(r'<p class="role">(.*?)</p>', block, re.S)
            if not (img and name):
                continue
            a = dict(re.findall(r'(\w+)="([^"]*)"', img.group(0)))
            self.authors[pid] = {
                "name": text_of(name.group(1)), "role": text_of(role.group(1)) if role else "",
                "src": a.get("src", f"assets/img/{pid}.webp"), "alt": htmllib.unescape(a.get("alt", "")),
                "width": a.get("width", ""), "height": a.get("height", ""),
            }

        self.names = []
        nf = repo / "private" / "names-to-keep-out.txt"
        if nf.is_file():
            for i, line in enumerate(nf.read_text(encoding="utf-8").splitlines(), 1):
                line = line.strip()
                if line and not line.startswith("#"):
                    self.names.append((i, line))
        og = repo / "assets" / "img" / "og.jpg"
        self.default_og_bytes = og.stat().st_size if og.is_file() else 0


# -- Pictures ------------------------------------------------------------------------------------

class Pictures:
    """Resolves img: shortcodes. With an out folder it writes the web copies too."""

    def __init__(self, images_dir, out_dir=None, url_prefix=""):
        self.images_dir = Path(images_dir)
        self.out_dir = Path(out_dir) if out_dir else None
        self.url_prefix = url_prefix
        self.produced = {}   # slug -> {output name: source file}

    def __call__(self, slug, file):
        if not file or "/" in file or "\\" in file or file.startswith("."):
            raise BlogError(f'picture "{file}" has to be a file name in images/{slug}/, with no folders')
        src = self.images_dir / slug / file
        if not src.is_file():
            raise BlogError(f'picture "{file}" isn\'t in images/{slug}/')
        name = (slugify(Path(file).stem) or "picture") + ".webp"
        seen = self.produced.setdefault(slug, {})
        if seen.get(name, file) != file:
            raise BlogError(f'pictures "{seen[name]}" and "{file}" would both become {name}; rename one')
        seen[name] = file
        try:
            if self.out_dir is None:
                with Image.open(src) as im:
                    w, h = ImageOps.exif_transpose(im).size
                if w > MAX_WIDTH:
                    w, h = MAX_WIDTH, max(1, round(h * MAX_WIDTH / w))
                return "", w, h
            out = self.out_dir / slug / name
            if out.is_file() and out.stat().st_mtime >= src.stat().st_mtime:
                with Image.open(out) as o:
                    w, h = o.size
            else:
                with Image.open(src) as im:
                    im = ImageOps.exif_transpose(im)
                    if im.width > MAX_WIDTH:
                        im = im.resize((MAX_WIDTH, max(1, round(im.height * MAX_WIDTH / im.width))), Image.LANCZOS)
                    if im.mode not in ("RGB", "RGBA"):
                        im = im.convert("RGBA" if ("A" in im.mode or "transparency" in im.info) else "RGB")
                    out.parent.mkdir(parents=True, exist_ok=True)
                    im.save(out, "WEBP", quality=82, method=6)
                    w, h = im.size
        except OSError as e:
            raise BlogError(f'picture "{file}" can\'t be read as an image ({e.__class__.__name__}); use PNG, JPEG or WebP')
        return f"{self.url_prefix}{slug}/{name}", w, h


# -- Markdown ------------------------------------------------------------------------------------

CALLOUT = re.compile(r"^(\s*(?:>\s*)+)\[!([A-Za-z-]+)\][+-]?[ \t]*(.*)$")
# The "Needs Kawika" box in any spelling Obsidian draws as that box: question or its aliases
# faq and help, nested in quotes or not, the title bold or not, any spaces between the words.
QUESTION_KINDS = ("question", "faq", "help")
NEEDS_KAWIKA_TITLE = re.compile(r"(?:[^\S\n]|[*_])*needs[^\S\n]+kawika", re.I)
NEEDS_KAWIKA = re.compile(r"^[^\S\n]*(?:>[^\S\n]*)+\[!(?:question|faq|help)\][+-]?" + NEEDS_KAWIKA_TITLE.pattern,
                          re.I | re.M)
FENCE = re.compile(r"^\s*(```|~~~)")
# Python-Markdown's own fenced block pattern, so a %% or <!-- counts as code exactly where
# Markdown will draw code, and nowhere else.
CODE_FENCE = FencedBlockPreprocessor.FENCED_BLOCK_RE
TICKS = re.compile(r"`+")
BLANK_LINE = re.compile(r"\n[^\S\n]*\n")
COMMENTS = (("%%", "%%"), ("<!--", "-->"))


def strip_comments(body, first_line=1):
    """Drop Obsidian's %% comments and HTML <!-- comments -->, which can hold private notes.
    A %% or <!-- inside a fenced block or a `code span` is code and stays. A comment that never
    closes runs to the end of the note, as Obsidian shows it, and is reported, since the rest of
    the post would silently go missing. Returns the text and the problems found."""
    out, problems, i, n = [], [], 0, len(body)
    while i < n:
        if i == 0 or body[i - 1] == "\n":
            f = CODE_FENCE.match(body, i)
            if f:
                out.append(f.group(0))
                i = f.end()
                continue
        c = body[i]
        if c == "\\" and body[i + 1:i + 2] in ("`", "\\"):
            out.append(body[i:i + 2])
            i += 2
            continue
        if c == "`":
            run = TICKS.match(body, i).end() - i
            para = BLANK_LINE.search(body, i)
            close = re.compile(r"(?<!`)`{%d}(?!`)" % run).search(body, i + run, para.start() if para else n)
            end = close.end() if close else i + run
            out.append(body[i:end])
            i = end
            continue
        opener = next(((o, e) for o, e in COMMENTS if body.startswith(o, i)), None)
        if opener:
            o, e = opener
            end = body.find(e, i + len(o))
            if end < 0:
                line = first_line + body.count("\n", 0, i)
                problems.append(f"line {line} opens a {o} comment that never closes, so everything after it "
                                f"is hidden; close it with {e} or cut it")
                break
            i = end + len(e)
            continue
        out.append(c)
        i += 1
    return "".join(out), problems


def prepare(body, first_line=1):
    """Obsidian's extras, before Markdown sees the text: comments are dropped (they can hold
    private notes), callout markers come off so callouts render as plain quotes, and wiki links
    become their plain text. Returns the text, the wiki link count and any comment problems."""
    body, problems = strip_comments(body, first_line)
    lines, out, fence = body.split("\n"), [], None
    wiki = 0
    for i, line in enumerate(lines):
        f = FENCE.match(line)
        if f:
            fence = None if fence == f.group(1) else (fence or f.group(1))
            out.append(line)
            continue
        if fence:
            out.append(line)
            continue
        m = CALLOUT.match(line)
        if m:
            prefix, kind, title = m.groups()
            # Markdown joins quotes that only a blank line separates; Obsidian keeps each
            # callout its own box. An empty comment between them keeps them apart.
            before = next((x for x in reversed(out) if x.strip()), "")
            if before.lstrip().startswith(">"):
                out += ["", "<!-- -->", ""]
            if kind.lower() in QUESTION_KINDS and NEEDS_KAWIKA_TITLE.match(title):
                out += [prefix + "**Needs Kawika**", prefix.rstrip()]
                continue
            nxt = lines[i + 1] if i + 1 < len(lines) else ""
            if title and not nxt.lstrip().startswith(">"):
                out.append(prefix + title)
            continue
        line, n = re.subn(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", lambda w: w.group(2) or w.group(1), line)
        wiki += n
        out.append(line)
    return "\n".join(out), wiki, problems


def unwrap(parent, el):
    """Replace an element with its own content, keeping the text around it."""
    kids = list(parent)
    i = kids.index(el)
    parent.remove(el)

    def add_before(s):
        if not s:
            return
        if i == 0:
            parent.text = (parent.text or "") + s
        else:
            kids[i - 1].tail = (kids[i - 1].tail or "") + s

    add_before(el.text)
    inner = list(el)
    for j, c in enumerate(inner):
        parent.insert(i + j, c)
    if inner:
        inner[-1].tail = (inner[-1].tail or "") + (el.tail or "")
    else:
        add_before(el.tail)


class Rendered:
    def __init__(self):
        self.html = ""
        self.errors = []
        self.post_links = []
        self.internal = set()
        self.h2s = []
        self.paragraphs = []
        self.has_h1 = False
        self.words = 0
        self.wiki_links = 0
        self.pictures = []


class BodyTree(Treeprocessor):
    def __init__(self, md, post, site, resolve_post, pictures, result):
        super().__init__(md)
        self.post, self.site, self.resolve_post, self.pictures, self.r = post, site, resolve_post, pictures, result

    def run(self, root):
        r, site = self.r, self.site
        parents = {c: p for p in root.iter() for c in p}

        for a in list(root.iter("a")):
            href = a.get("href", "")
            kind, sep, rest = href.partition(":")
            if sep and kind in ("demo", "page", "post", "img") and not rest.startswith("//"):
                name, _, frag = rest.partition("#")
                frag = f"#{frag}" if frag else ""
                label = plain(a).strip()
                target = None
                if kind == "demo":
                    if name in site.demos:
                        target = f"../demos/{name}.html"
                    else:
                        r.errors.append(f'[{label}](demo:{name}) points at a demo that doesn\'t exist '
                                        f'(the demos are {", ".join(sorted(site.demos))})')
                elif kind == "page":
                    if name == "home":
                        target = "../"
                    elif name == "blog":
                        target = "index.html"
                    elif name in site.pages:
                        target = f"../{name}.html"
                    else:
                        r.errors.append(f'[{label}](page:{name}) points at a page that isn\'t on the site')
                elif kind == "post":
                    r.post_links.append(name)
                    target = self.resolve_post(name)
                else:
                    r.errors.append(f'[{label}]({href}) uses img: as a link; img: is only for pictures, ![...](img:file)')
                if target is None:
                    unwrap(parents[a], a)
                    parents = {c: p for p in root.iter() for c in p}
                    continue
                a.set("href", target + frag)
                r.internal.add(target)
            elif is_internal(href):
                r.internal.add(href.split("#")[0])
            classes = (a.get("class") or "").split()
            if "tlink" not in classes:
                a.set("class", " ".join(classes + ["tlink"]))

        for img in list(root.iter("img")):
            src = img.get("src", "")
            if not src.startswith("img:"):
                continue
            file, alt, title = src[4:], (img.get("alt") or "").strip(), img.get("title")
            r.pictures.append(file)
            parent = parents[img]
            if not alt:
                r.errors.append(f'picture "{file}" has nothing in its brackets; describe what it shows, '
                                f'that\'s what a screen reader says')
            try:
                url, w, h = self.pictures(self.post.slug, file)
            except BlogError as e:
                r.errors.append(str(e))
                stand_in = ET.Element("span")
                stand_in.text = f"[picture missing: {file}]"
                stand_in.tail = img.tail
                parent.insert(list(parent).index(img), stand_in)
                parent.remove(img)
                continue
            img.attrib.clear()
            for k, v in (("src", url), ("width", str(w)), ("height", str(h)), ("alt", alt),
                         ("loading", "lazy"), ("decoding", "async")):
                img.set(k, v)
            alone = (parent.tag == "p" and len(parent) == 1 and not (parent.text or "").strip()
                     and not (img.tail or "").strip())
            if alone:
                parent.tag = "figure"
                img.tail = None
                if title:
                    cap = ET.SubElement(parent, "figcaption")
                    cap.text = title

        labels = {}
        for table in list(root.iter("table")):
            parent = parents[table]
            th = table.find(".//th")
            label = plain(th).strip() if th is not None else ""
            label = label or "Table"
            # A comparison table's empty corner is a plain cell, not a header with nothing in it.
            for cell in table.iter("th"):
                if not plain(cell).strip() and not len(cell):
                    cell.tag = "td"
            labels[label] = labels.get(label, 0) + 1
            if labels[label] > 1:
                label = f"{label}, table {labels[label]}"
            wrap = ET.Element("div", {"class": "table-wrap", "role": "region", "aria-label": label, "tabindex": "0"})
            i = list(parent).index(table)
            parent.remove(table)
            wrap.tail, table.tail = table.tail, "\n"
            wrap.text = "\n"
            wrap.append(table)
            parent.insert(i, wrap)

        used = set(site.reserved_ids)
        for el in root.iter():
            if el.tag not in ("h2", "h3") and el.get("id"):
                used.add(el.get("id"))
        for el in root.iter():
            if el.tag == "h1":
                r.has_h1 = True
            if el.tag in ("h2", "h3"):
                text = plain(el).strip()
                if el.tag == "h2":
                    r.h2s.append(text)
                base = el.get("id") or slugify(text) or "section"
                hid, n = base, 2
                while hid in used:
                    hid, n = f"{base}-{n}", n + 1
                used.add(hid)
                el.set("id", hid)
            if el.tag == "p":
                r.paragraphs.append(plain(el, skip=("code",)))

        r.words = count_words(plain(root))


class BodyExtension(Extension):
    def __init__(self, *args):
        super().__init__()
        self.args = args

    def extendMarkdown(self, md):
        md.treeprocessors.register(BodyTree(md, *self.args), "iterate-body", -5)


def render_body(post, site, resolve_post, pictures):
    r = Rendered()
    text, r.wiki_links, comment_problems = prepare(post.body, post.body_line)
    r.errors += comment_problems
    md = markdown.Markdown(extensions=["extra", "sane_lists", "attr_list",
                                       BodyExtension(post, site, resolve_post, pictures, r)],
                           output_format="html")
    out = md.convert(text)
    r.html = re.sub(r"<pre(?![^>]*\btabindex=)", '<pre tabindex="0"', out)
    return r


# -- Checks --------------------------------------------------------------------------------------

def name_key(s):
    """A name or a stretch of text reduced to lowercase words joined by hyphens, with no ʻokina,
    kahakō or apostrophes, so "Hawaiʻi", "Hawaii", a name broken across two lines and a name in a
    slug or file name all compare the same."""
    return slugify(s)


def check_names(post, site, pictures):
    """Names from the keep-out list, anywhere the post can put words on the site: its text, the
    frontmatter that's shown or sent to search engines, its web address and its picture files."""
    fields = [("slug" if clean(post.meta.get("slug")) else "slug (from the file name)", post.slug),
              ("title", post.title), ("search title", clean(post.meta.get("seo_title"))),
              ("target", post.target), ("description", post.description),
              ("closing line", post.closing), ("body", post.body)]
    fields += [(f'picture file "{f}"', f) for f in dict.fromkeys(pictures)]
    keys = [(field, name_key(text)) for field, text in fields if text]
    for line_no, name in site.names:
        k = name_key(name)
        if not k:
            continue
        for field, text in keys:
            if k in text:
                post.errors.append(f"the {field} has a name from the keep-out list (line {line_no} of "
                                   f"private/names-to-keep-out.txt)")


def check_fields(post, site, today):
    e, w = post.errors, post.warnings
    if not post.has_frontmatter:
        e.append("no frontmatter (the --- block at the top)")
    if post.bad_yaml:
        e.append("the frontmatter isn't valid YAML")
    for key, val in (("title", post.title), ("description", post.description), ("date", post.date_raw),
                     ("author", post.author), ("pillar", post.pillar), ("demo", post.demo)):
        if not val:
            e.append(f"no {key}")
    if not post.slug:
        e.append("no slug, and the file name doesn't make one")
    elif not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", post.slug):
        e.append(f'slug "{post.slug}" has to be lowercase words joined by hyphens')
    elif post.slug == "index":
        e.append('slug "index" is taken by the blog\'s own front page')
    if post.author and post.author not in AUTHORS:
        e.append(f'author "{post.author}" isn\'t one of {", ".join(AUTHORS)}')
    elif post.author and post.author not in site.authors:
        e.append(f'author "{post.author}" has no card on about.html')
    if post.pillar and post.pillar not in PILLARS:
        e.append(f'pillar "{post.pillar}" isn\'t one of {", ".join(PILLARS)}')
    if post.demo and post.demo not in DEMOS:
        e.append(f'demo "{post.demo}" isn\'t one of {", ".join(DEMOS)}')
    elif post.demo and post.demo not in site.demos:
        e.append(f'demo "{post.demo}" has no page at demos/{post.demo}.html')
    if post.date_raw and not post.date:
        e.append(f'date "{post.date_raw}" isn\'t a real date written YYYY-MM-DD')
    if post.updated_raw and not post.updated:
        e.append(f'updated "{post.updated_raw}" isn\'t a real date written YYYY-MM-DD')
    if post.date and post.updated and post.updated < post.date:
        w.append("updated is earlier than date, so the page shows only the date")
    if post.updated and post.updated > max(today, post.date or today):
        e.append(f'updated "{post.updated_raw}" hasn\'t happened yet; set it to the day of the last real change')
    if post.seo_title and len(post.seo_title) > 60:
        e.append(f'the search title is {len(post.seo_title)} characters, over 60: "{post.seo_title}"')
    if not post.target:
        w.append("no target phrase, the search the post is written to answer")
    elif post.seo_title and fold(post.target) not in fold(post.seo_title):
        e.append(f'the target "{post.target}" isn\'t in the search title "{post.seo_title}"')
    for n, line in enumerate(post.raw.split("\n"), 1):
        if re.search("[\u2013\u2014]|&[mn]dash;|&#(8211|8212|x201[34]);", line, re.I):
            e.append(f"line {n} has an en or em dash; use a comma, period or parentheses")
    if NEEDS_KAWIKA.search(post.raw):
        e.append('the "Needs Kawika" box is still in it; answer it or cut it before publishing')
    if post.description and not 120 <= len(post.description) <= 155:
        w.append(f"the description is {len(post.description)} characters (aim for 120 to 155)")
    if post.status not in ("draft", "published"):
        w.append(f'status "{post.status}" is treated as a draft (use draft or published)')


def validate(posts, site, images_dir, today):
    """Fill each post's errors and warnings. Links to other posts are judged against the posts
    that would be live today."""
    rendered = {}
    for p in posts:
        p.errors, p.warnings = [], []
        check_fields(p, site, today)
        r = render_body(p, site, lambda slug: None, Pictures(images_dir))
        rendered[p.name] = r
        p.errors += r.errors
        check_names(p, site, r.pictures)
        if r.has_h1:
            p.errors.append("the text has a level-one heading (#); the title is the only one, use ## for sections")
        p.words, p.minutes = r.words, max(1, math.ceil(r.words / 220))
    slugs = {}
    for p in posts:
        slugs.setdefault(p.slug, []).append(p)
    for slug, group in slugs.items():
        if len(group) > 1:
            for p in group:
                others = ", ".join(q.name for q in group if q is not p)
                p.errors.append(f'slug "{slug}" is also used by {others}')
    live = {p.slug for p in posts if p.live(today) and not p.errors}
    for p in posts:
        r = rendered[p.name]
        lo, hi = WORDS.get(p.pillar, WORDS_DEFAULT)
        if not lo <= r.words <= hi:
            p.warnings.append(f"{r.words:,} words (aim for {lo:,} to {hi:,} for this pillar)")
        unpublished = sorted({s for s in r.post_links if s not in live})
        for s in unpublished:
            p.warnings.append(f'the link to post:{s} shows as plain text, because that post isn\'t live')
        links = len(r.internal) + len({s for s in r.post_links if s in live})
        if links < 3:
            p.warnings.append(f"{links} link{'' if links == 1 else 's'} to our own pages "
                              f"(aim for 3 or more: its demo, a service page, another post)")
        if not any(re.search(r"faq|questions|\bask\b", h, re.I) for h in r.h2s):
            p.warnings.append('no FAQ section (a ## heading with "FAQ", "Questions" or "ask" in it, like "What else do owners ask?")')
        for para in r.paragraphs:
            if ": " in para:
                snippet = re.sub(r"\s+", " ", para).strip()
                at = snippet.find(": ")
                p.warnings.append(f'a colon inside a sentence: "...{snippet[max(0, at - 40):at + 30]}..."')
        if r.wiki_links:
            p.warnings.append(f"{r.wiki_links} [[wiki links]] show as plain text; use demo:, page: or post: links")
    return live


def report(posts, today, log):
    for p in posts:
        if p.published and p.date and p.date > today:
            state = f"published, scheduled for {p.date.isoformat()}"
        elif p.published:
            state = "published"
        else:
            state = p.status
        if not p.errors and not p.warnings:
            log(f"{p.name} ({state}): ok")
            continue
        log(f"{p.name} ({state})")
        for m in p.errors:
            log(f"  error  {m}")
        for m in p.warnings:
            log(f"  warn   {m}")


# -- Pages ---------------------------------------------------------------------------------------

def jsonld(graph):
    text = json.dumps({"@context": "https://schema.org", "@graph": graph}, indent=1, ensure_ascii=False)
    return '<script type="application/ld+json">\n' + text.replace("</", "<\\/") + "\n</script>"


def head(site, *, title, description, canonical, og_type, image, image_alt, extra, graph, og_title=None):
    og_title = og_title or title
    lines = [
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        "",
        f"<title>{esc(title)}</title>",
        f'<meta name="description" content="{attr(description)}">',
        f'<link rel="canonical" href="{attr(canonical)}">',
        "",
        f'<meta property="og:type" content="{og_type}">',
        f'<meta property="og:title" content="{attr(og_title)}">',
        f'<meta property="og:description" content="{attr(description)}">',
        f'<meta property="og:image" content="{attr(image)}">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        '<meta property="og:image:type" content="image/jpeg">',
        f'<meta property="og:image:alt" content="{attr(image_alt)}">',
        f'<meta property="og:url" content="{attr(canonical)}">',
        '<meta property="og:site_name" content="Iterate">',
        '<meta property="og:locale" content="en_US">',
        *extra,
        '<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:title" content="{attr(og_title)}">',
        f'<meta name="twitter:description" content="{attr(description)}">',
        f'<meta name="twitter:image" content="{attr(image)}">',
        f'<meta name="twitter:image:alt" content="{attr(image_alt)}">',
        f'<meta name="theme-color" content="{attr(site.theme_color)}">',
        "",
        *[x for x in site.head_links if 'rel="preload"' not in x],
        "",
        *[x for x in site.head_links if 'rel="preload"' in x],
        '<link rel="stylesheet" href="../assets/css/site.css">',
        '<link rel="alternate" type="application/rss+xml" title="Iterate blog" href="../feed.xml">',
        "",
        jsonld(graph),
        '<script>document.documentElement.className += " js";</script>',
        site.analytics,
    ]
    return "\n".join(x for x in lines if x is not None)


def page(site, head_html, main_html):
    return ("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n" + head_html + "\n</head>\n"
            + site.body_tag + "\n" + MARKER + site.top + "\n\n<main id=\"main\">\n" + main_html
            + "\n</main>\n\n" + site.footer
            + '\n\n<script src="../assets/js/site.js" defer></script>\n</body>\n</html>\n')


def cards(posts, href, level, indent=""):
    h = f"h{level}"
    out = [f'{indent}<ul class="post-cards" role="list">']
    for p in posts:
        out += [
            f'{indent}  <li class="post-card">',
            f'{indent}    <p class="kicker">{esc(p.pillar_label)}</p>',
            f'{indent}    <{h} class="post-card-title"><a class="tlink" href="{attr(href(p))}">{esc(p.title)}</a></{h}>',
            f'{indent}    <p class="post-card-desc">{esc(p.description)}</p>',
            f'{indent}    <p class="post-card-meta"><time datetime="{p.date.isoformat()}">{long_date(p.date)}</time>'
            f'<span>{p.minutes} min read</span></p>',
            f"{indent}  </li>",
        ]
    out.append(f"{indent}</ul>")
    return "\n".join(out)


def closing_band(site, line):
    return f"""  <section class="sec-tight on-ink post-cta" aria-labelledby="post-cta-title">
    <div class="wrap">
      <h2 class="h2" id="post-cta-title">Skip the rabbit hole</h2>
      <p>{esc(line)}</p>
      {site.cta_button}
    </div>
  </section>"""


def banner(post, today, card_href):
    if post.published and post.date and post.date > today and not post.errors:
        lead = (f"<strong>Scheduled for {long_date(post.date)}.</strong> It goes live when the publish "
                f"step runs on or after that day.")
    elif post.published and post.date and post.date <= today and not post.errors:
        return ""
    elif post.published:
        lead = "<strong>Published in the vault, but it can't go live yet.</strong> Fix what's listed below first."
    else:
        lead = "<strong>Draft, not published.</strong> Only this local preview shows it."
    if card_href:
        lead += f' <a class="tlink" href="{attr(card_href)}">See the share card</a>.'
    parts = [f"      <div class=\"draft-banner\">\n        <p>{lead}</p>"]
    if post.errors:
        parts.append("        <p>Before it can go live</p>\n        <ul>"
                     + "".join(f"<li>{esc(m)}</li>" for m in post.errors) + "</ul>")
    if post.warnings:
        parts.append("        <p>Worth a look</p>\n        <ul>"
                     + "".join(f"<li>{esc(m)}</li>" for m in post.warnings) + "</ul>")
    parts.append("      </div>")
    return "\n".join(parts) + "\n"


def post_page(site, post, body, others, image, image_alt, today, preview, card_href):
    author = site.authors.get(post.author)
    demo = site.demos.get(post.demo)
    d = post.date or today
    # Never a change date in the future, even in a preview of a post that fails the check for it.
    modified = min(post.modified or d, max(today, d))
    graph = [
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE},
            {"@type": "ListItem", "position": 2, "name": "Blog", "item": f"{SITE}blog/"},
            {"@type": "ListItem", "position": 3, "name": post.title, "item": post.canonical},
        ]},
        {"@type": "BlogPosting", "@id": f"{post.canonical}#post", "headline": post.title,
         "description": post.description, "url": post.canonical, "mainEntityOfPage": post.canonical,
         "datePublished": d.isoformat(), "dateModified": modified.isoformat(),
         "author": {"@id": f"{SITE}about#{post.author}", **({"name": author["name"], "url": f"{SITE}about#{post.author}"} if author else {})},
         "publisher": {"@id": f"{SITE}#business", "name": "Iterate", "url": SITE},
         "image": image, "inLanguage": "en-US", "articleSection": post.pillar_label, "wordCount": post.words},
    ]
    extra = [
        f'<meta property="article:published_time" content="{d.isoformat()}">',
        f'<meta property="article:modified_time" content="{modified.isoformat()}">',
        f'<meta property="article:author" content="{SITE}about#{attr(post.author)}">',
        f'<meta property="article:section" content="{attr(post.pillar_label)}">',
    ]
    if preview and not post.published:
        extra.insert(0, '<meta name="iterate-draft" content="1">')
    h = head(site, title=post.seo_title or post.title or post.slug, description=post.description,
             canonical=post.canonical, og_type="article", image=image, image_alt=image_alt,
             extra=extra, graph=graph, og_title=post.title)

    byline = []
    if author:
        byline.append(f'<span>By <a class="tlink" href="../about.html#{attr(post.author)}">{esc(author["name"])}</a></span>')
    byline.append(f'<span><time datetime="{d.isoformat()}">{long_date(d)}</time></span>')
    if modified != d:
        byline.append(f'<span>Updated <time datetime="{modified.isoformat()}">{long_date(modified)}</time></span>')
    byline.append(f"<span>{post.minutes} min read</span>")

    main = [f"""  <header class="page-hero post-head">
    <div class="wrap">
{banner(post, today, card_href) if preview else ""}      <nav class="crumbs" aria-label="Breadcrumb">
        <ol><li><a class="tlink" href="../">Home</a></li><li><a class="tlink" href="index.html">Blog</a></li></ol>
      </nav>
      <p class="kicker">{esc(post.pillar_label)}</p>
      <h1 class="h1">{esc(post.title or post.slug)}</h1>
      <p class="lede">{esc(post.description)}</p>
      <p class="byline">{"".join(byline)}</p>
    </div>
  </header>

  <div class="wrap post-body">
    <article class="prose">
{body}
    </article>"""]
    if demo:
        main.append(f"""
    <section class="post-demo" aria-labelledby="post-demo-title">
      <p class="kicker">Live demo</p>
      <h2 id="post-demo-title"><a class="tlink" href="../demos/{attr(post.demo)}.html">{esc(demo["h1"])}</a></h2>
      <p>{esc(demo["description"])}</p>
    </section>""")
    if author:
        bio = BIOS.get(post.author, "")
        main.append(f"""
    <section class="post-author" aria-labelledby="post-author-title">
      <img src="../{attr(author["src"])}" alt="{attr(author["alt"])}" width="{attr(author["width"])}" height="{attr(author["height"])}" loading="lazy" decoding="async">
      <div>
        <p class="kicker">Written by</p>
        <h2 id="post-author-title"><a class="tlink" href="../about.html#{attr(post.author)}">{esc(author["name"])}</a></h2>
        <p class="role">{esc(author["role"])}</p>
        <p>{esc(bio)}</p>
      </div>
    </section>""")
    main.append("  </div>")
    if others:
        main.append(f"""
  <section class="sec-tight post-related" aria-labelledby="post-related-title">
    <div class="wrap">
      <h2 class="h3" id="post-related-title">Keep reading</h2>
{cards(others, lambda p: f"{p.slug}.html", 3, "      ")}
    </div>
  </section>""")
    main.append("\n" + closing_band(site, post.closing or CLOSING_DEFAULT))
    return page(site, h, "\n".join(main))


def index_page(site, posts):
    graph = [
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE},
            {"@type": "ListItem", "position": 2, "name": "Blog", "item": f"{SITE}blog/"},
        ]},
        {"@type": "Blog", "@id": f"{SITE}blog/#blog", "name": "Iterate blog", "url": f"{SITE}blog/",
         "description": INDEX_DESCRIPTION, "inLanguage": "en-US",
         "publisher": {"@id": f"{SITE}#business", "name": "Iterate", "url": SITE},
         "blogPost": [{"@type": "BlogPosting", "@id": f"{p.canonical}#post", "url": p.canonical,
                       "headline": p.title, "datePublished": p.date.isoformat()} for p in posts]},
    ]
    h = head(site, title=INDEX_TITLE, description=INDEX_DESCRIPTION, canonical=f"{SITE}blog/",
             og_type="website", image=f"{SITE}assets/img/og.jpg", image_alt=site.default_og_alt,
             extra=[], graph=graph)
    main = f"""  <header class="page-hero post-head">
    <div class="wrap">
      <p class="kicker">Blog</p>
      <h1 class="h1">{esc(INDEX_H1)}</h1>
      <p class="lede">{esc(INDEX_LEDE)}</p>
    </div>
  </header>

  <section class="post-list" aria-label="Posts">
    <div class="wrap">
{cards(posts, lambda p: f"{p.slug}.html", 2, "      ")}
    </div>
  </section>

{closing_band(site, CLOSING_DEFAULT)}"""
    return page(site, h, main)


def feed(posts, card_bytes):
    ns = "http://www.w3.org/2005/Atom"
    ET.register_namespace("atom", ns)
    rss = ET.Element("rss", {"version": "2.0"})
    ch = ET.SubElement(rss, "channel")
    for tag, text in (("title", "Iterate blog"), ("link", f"{SITE}blog/"),
                      ("description", INDEX_DESCRIPTION), ("language", "en-us")):
        ET.SubElement(ch, tag).text = text
    ET.SubElement(ch, f"{{{ns}}}link", {"href": f"{SITE}feed.xml", "rel": "self", "type": "application/rss+xml"})
    for p in posts[:20]:
        item = ET.SubElement(ch, "item")
        ET.SubElement(item, "title").text = p.title
        ET.SubElement(item, "link").text = p.canonical
        ET.SubElement(item, "guid", {"isPermaLink": "true"}).text = p.canonical
        when = dt.datetime(p.date.year, p.date.month, p.date.day, 6, 0, tzinfo=HST)
        ET.SubElement(item, "pubDate").text = format_datetime(when)
        ET.SubElement(item, "description").text = p.description
        url, size = card_bytes[p.slug]
        ET.SubElement(item, "enclosure", {"url": url, "length": str(size), "type": "image/jpeg"})
    ET.indent(rss, space="  ")
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(rss, encoding="unicode") + "\n"


def fill_home(text, block):
    """index.html with the cards between the blog markers, or None when it has no markers."""
    a, b = text.find(HOME_OPEN), text.find(HOME_CLOSE)
    if a < 0 or b < 0 or b < a:
        return None
    line_start = text.rfind("\n", 0, b) + 1
    indent = text[line_start:b] if not text[line_start:b].strip() else ""
    inner = "\n" + (block + "\n" if block else "") + indent
    return text[:a + len(HOME_OPEN)] + inner + text[b:]


# -- Share cards ---------------------------------------------------------------------------------

def draw_cards(jobs, work_dir, log):
    """Run tools/og.mjs over [{title, pillar, out}]. Returns True when node ran cleanly."""
    if not jobs:
        return True
    node = shutil.which("node")
    if not node:
        log("warn   node isn't installed, so new share cards can't be drawn; posts without one use the site's share picture")
        return False
    env = dict(os.environ)
    env.setdefault("NODE_PATH", NODE_PATH_DEFAULT)
    fd, jobs_file = tempfile.mkstemp(prefix="og-jobs-", suffix=".json", dir=str(work_dir) if work_dir else None)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(jobs, f, ensure_ascii=False)
        r = subprocess.run([node, str(TOOLS / "og.mjs"), jobs_file], env=env, capture_output=True, text=True)
    finally:
        os.unlink(jobs_file)
    if r.returncode != 0:
        why = (r.stderr.strip().splitlines() or ["no output"])[-1]
        log(f"warn   tools/og.mjs failed ({why[:160]}); posts without a card use the site's share picture")
        return False
    return True


# -- Builds --------------------------------------------------------------------------------------

def _sitemap_module():
    spec = importlib.util.spec_from_file_location("iterate_sitemap", TOOLS / "sitemap.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _is_ours(path):
    try:
        return MARKER in path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return False


def _remove(path):
    if path.is_symlink() or path.is_file():
        path.unlink()
    elif path.is_dir():
        shutil.rmtree(path)


def _check_preview_place(repo, out):
    """The preview holds every draft, so inside the repo it has to sit where .gitignore keeps it
    out of commits: in or under a folder named .preview something (the .preview*/ rule).
    Outside the repo is fine."""
    repo_r, out_r = Path(repo).resolve(), Path(out).resolve()
    if out_r == repo_r or repo_r in out_r.parents:
        if not any(part.startswith(".preview") for part in out_r.relative_to(repo_r).parts):
            raise BlogError(f"{out} is inside the repo where git would commit it, and a preview holds every "
                            f"draft; use .preview (the default), another folder named .preview something, "
                            f"or one outside the repo")


def _prepare_preview(repo, out, log):
    _check_preview_place(repo, out)
    out.mkdir(parents=True, exist_ok=True)
    stamp = out / PREVIEW_STAMP
    if any(out.iterdir()) and not stamp.exists():
        raise BlogError(f"{out} already has files in it that aren't a blog preview; pick an empty folder")
    stamp.write_text("A local preview made by tools/blog.py --preview. Safe to delete.\n", encoding="utf-8")
    for child in out.iterdir():
        if child.name not in (PREVIEW_STAMP, "blog-assets"):
            _remove(child)
    out_real = out.resolve()
    skip = {"index.html", "blog", "feed.xml", "sitemap.xml", "private"}
    for item in sorted(repo.iterdir()):
        if item.name.startswith(".") or item.name in skip:
            continue
        real = item.resolve()
        if real == out_real or real in out_real.parents:
            continue
        (out / item.name).symlink_to(real, target_is_directory=item.is_dir())
    shutil.copyfile(repo / "index.html", out / "index.html")


def build(repo=REPO, vault=VAULT, mode="production", out=None, today=None, cards_on=True, log=print):
    """Render the blog. mode is "production" (into the repo) or "preview" (into out).
    Returns the exit code."""
    repo, vault = Path(repo), Path(vault)
    today = today or today_hst()
    preview = mode == "preview"
    site = Site(repo)
    posts = load_posts(vault)
    images_dir = vault.parent / "images"
    validate(posts, site, images_dir, today)
    report(posts, today, log)

    if preview:
        out = Path(out) if out else repo / ".preview"
        _prepare_preview(repo, out, log)
        root, assets_dir, assets_url = out, out / "blog-assets", "../blog-assets/"
        # Everything that can be shown is shown, problems and all, so a draft can be read while
        # it's being written. A missing date or title borrows today and the slug.
        seen, chosen = set(), []
        for p in posts:
            if p.slug and p.slug not in seen and p.slug != "index" and re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", p.slug):
                seen.add(p.slug)
                p.date = p.date or today
                p.title = p.title or p.slug
                chosen.append(p)
    else:
        root, assets_dir, assets_url = repo, repo / "assets" / "img" / "blog", "../assets/img/blog/"
        chosen = [p for p in posts if p.live(today) and not p.errors]
        for p in posts:
            if p.published and p.date and p.date > today:
                log(f"{p.slug}: scheduled for {p.date.isoformat()}, skipped")
        for p in posts:
            if p.published and p.errors:
                log(f"{p.slug}: not rendered, it has errors (any page it had is taken down with the rest of "
                    f"the old output)")
    chosen.sort(key=lambda p: p.sort_key)
    blog_dir = root / "blog"
    written = []

    # Share cards first, so every page can point at its own.
    if cards_on and chosen:
        tool_mtime = max((TOOLS / "og.mjs").stat().st_mtime, (repo / "assets/css/site.css").stat().st_mtime)
        jobs = []
        for p in chosen:
            card = assets_dir / p.slug / "og.jpg"
            if not card.is_file() or card.stat().st_mtime < max(tool_mtime, p.path.stat().st_mtime):
                jobs.append({"title": p.title or p.slug, "pillar": p.pillar_label, "out": str(card)})
        if jobs:
            assets_dir.mkdir(parents=True, exist_ok=True)
            draw_cards(jobs, out if preview else None, log)
    card_info = {}
    for p in chosen:
        card = assets_dir / p.slug / "og.jpg"
        if cards_on and card.is_file():
            card_info[p.slug] = (f"{SITE}assets/img/blog/{p.slug}/og.jpg", card.stat().st_size,
                                 f"{p.title}, on the Iterate blog", f"{assets_url}{p.slug}/og.jpg")
        else:
            card_info[p.slug] = (f"{SITE}assets/img/og.jpg", site.default_og_bytes, site.default_og_alt, "")

    slugs = {p.slug for p in chosen}
    pictures = Pictures(images_dir, assets_dir, assets_url)
    if chosen:
        blog_dir.mkdir(parents=True, exist_ok=True)
    for p in chosen:
        r = render_body(p, site, lambda s: f"{s}.html" if s in slugs else None, pictures)
        others = sorted((q for q in chosen if q is not p), key=lambda q: (q.pillar != p.pillar, q.sort_key))[:3]
        image, _, alt, card_href = card_info[p.slug]
        html = post_page(site, p, r.html, others, image, alt, today, preview, card_href if preview else "")
        target = blog_dir / f"{p.slug}.html"
        target.write_text(html, encoding="utf-8")
        written.append(target)

    feed_path, index_path = root / "feed.xml", blog_dir / "index.html"
    if chosen:
        index_path.write_text(index_page(site, chosen), encoding="utf-8")
        written.append(index_path)
        feed_path.write_text(feed(chosen, {s: (v[0], v[1]) for s, v in card_info.items()}), encoding="utf-8")
        written.append(feed_path)
    elif feed_path.exists():
        feed_path.unlink()
        log("removed feed.xml (no live posts)")

    home = root / "index.html"
    filled = fill_home(home.read_text(encoding="utf-8"),
                       cards(chosen[:3], lambda p: f"blog/{p.slug}.html", 3, "") if chosen else "")
    if filled is not None and filled != home.read_text(encoding="utf-8"):
        home.write_text(filled, encoding="utf-8")
        written.append(home)

    # Anything generated before and not produced now, including the old page of a live post that
    # fails a check: its words may be the reason it fails (a name from the keep-out list).
    produced = {p.slug for p in chosen}
    if blog_dir.is_dir():
        for f in sorted(blog_dir.glob("*.html")):
            wanted = bool(chosen) if f.stem == "index" else f.stem in produced
            if not wanted and _is_ours(f):
                f.unlink()
                log(f"removed {f.relative_to(root)}")
        if not any(blog_dir.iterdir()):
            blog_dir.rmdir()
    if assets_dir.is_dir():
        for d in sorted(assets_dir.iterdir()):
            if d.is_dir() and d.name not in produced:
                shutil.rmtree(d)
                log(f"removed {d.relative_to(root)}/")
            elif d.is_dir() and d.name in slugs:
                wanted = set(pictures.produced.get(d.name, {})) | {"og.jpg"}
                for f in d.iterdir():
                    if f.name not in wanted:
                        _remove(f)
        if not any(assets_dir.iterdir()):
            assets_dir.rmdir()

    for f in written:
        log(f"wrote {f.relative_to(root)}")
    if preview:
        sm = _sitemap_module()
        (out / "sitemap.xml").write_text(sm.render(sm.entries(out)), encoding="utf-8")
        log(f"preview ready in {out}: python3 -m http.server 8779 -d {out}")
        return 0

    r = subprocess.run([sys.executable, str(repo / "tools" / "sitemap.py")], cwd=repo, capture_output=True, text=True)
    log((r.stdout or r.stderr).strip())
    if r.returncode != 0:
        return 1
    live_count = len(chosen)
    log(f"{live_count} post{'s' if live_count != 1 else ''} live")
    return 1 if any(p.published and p.errors for p in posts) else 0


def check(repo=REPO, vault=VAULT, today=None, log=print):
    today = today or today_hst()
    site = Site(repo)
    posts = load_posts(vault)
    if not posts:
        log(f"no posts in {vault}")
        return 0
    validate(posts, site, Path(vault).parent / "images", today)
    report(posts, today, log)
    bad = [p for p in posts if p.published and p.errors]
    if bad:
        log(f"{len(bad)} published post{'s' if len(bad) != 1 else ''} can't go live until the errors are fixed")
        return 1
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--preview", action="store_true", help="build a local mirror with drafts")
    mode.add_argument("--check", action="store_true", help="check every post and write nothing")
    ap.add_argument("--vault", default=str(VAULT), help="the posts folder (default %(default)s)")
    ap.add_argument("--out", help="where --preview builds (default .preview in the repo)")
    ap.add_argument("--no-cards", action="store_true", help="--preview only: skip the share cards")
    a = ap.parse_args(argv)
    if (a.out or a.no_cards) and not a.preview:
        ap.error("--out and --no-cards go with --preview")
    try:
        if a.check:
            return check(REPO, a.vault)
        if a.preview:
            return build(REPO, a.vault, "preview", Path(a.out).resolve() if a.out else None, cards_on=not a.no_cards)
        return build(REPO, a.vault, "production")
    except BlogError as e:
        print(f"error  {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
