"""Tests for tools/blog.py, run against throwaway copies of the site and the vault.

    python3 -m unittest tools/test_blog.py -v

Every test builds its own vault of posts in a temp folder and a temp copy of the repo pieces
the generator reads (the pages, demos, stylesheet and tools/sitemap.py), so nothing here
touches the real repo or the real vault. Bad fixtures spell their dashes as escapes, so no
dash character is ever committed. The share card test needs node and Playwright (NODE_PATH,
as for tools/check.mjs) and is skipped without them.
"""
import datetime as dt
import importlib.util
import json
import math
import os
import re
import shutil
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

import yaml
from PIL import Image

HERE = Path(__file__).resolve().parent
REAL_REPO = HERE.parent
_spec = importlib.util.spec_from_file_location("blog", HERE / "blog.py")
blog = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(blog)

TODAY = dt.date(2026, 10, 13)  # a Tuesday
KEEP_OUT = "Zanzibar Quokka"
KEEP_OUT_HI = "Zanzibar Hawaii"  # written with the ʻokina in posts, as the voice rules ask

SENTENCES = [
    "Owners tell us the phone rings while their hands are full, so the call goes to voicemail and the job goes to someone else.",
    "A good receptionist answers fast, asks the right questions, and hands the hard calls to a person who can help.",
    "Most of the work is in the details, like reading back a phone number or knowing when a calendar slot is really free.",
    "We test every flow with real calls before anything goes live, and we keep an eye on it after.",
]
FILLER = "\n\n".join(" ".join(SENTENCES[i % 4] for i in range(n, n + 3)) for n in range(18))
LINKS = "Try [the phone demo](demo:phone), read about [what we build](page:what-we-do), or [get in touch](page:contact)."
TABLE = "| Item | Monthly |\n|---|---|\n| Phone line | $5 |\n| Calls | $40 |"
FAQ = "## Questions owners ask\n\n### Does it sound like a robot?\n\nNot the good ones, and you can hear one for yourself in the demo."
BODY = f"The short answer comes first. {LINKS}\n\n## What does it cost to run?\n\n{TABLE}\n\n{FILLER}\n\n{FAQ}\n"

META = {
    "title": "What an AI receptionist is, and what it takes to run one",
    "seo_title": "What Is an AI Receptionist? | Iterate",
    "target": "what is an ai receptionist",
    "description": ("A plain-English answer for owners, what it does on a call, what it can't do, "
                    "and what it takes to keep one working after setup."),
    "pillar": "education",
    "author": "kawika",
    "demo": "phone",
    "status": "published",
    "date": "2026-10-13",
    "updated": "2026-10-13",
    "tags": ["iterate-seo", "post"],
    "project": "iterate-seo",
}


def make_repo(dst):
    """The pieces of the repo blog.py reads, copied into dst."""
    dst.mkdir(parents=True)
    for f in REAL_REPO.glob("*.html"):
        shutil.copy2(f, dst / f.name)
    shutil.copytree(REAL_REPO / "demos", dst / "demos", ignore=shutil.ignore_patterns("*.js"))
    shutil.copytree(REAL_REPO / "assets" / "css", dst / "assets" / "css")
    (dst / "assets" / "img").mkdir(parents=True)
    shutil.copy2(REAL_REPO / "assets" / "img" / "og.jpg", dst / "assets" / "img" / "og.jpg")
    (dst / "tools").mkdir()
    shutil.copy2(REAL_REPO / "tools" / "sitemap.py", dst / "tools" / "sitemap.py")
    (dst / "private").mkdir()
    (dst / "private" / "names-to-keep-out.txt").write_text(f"# test list\n\n{KEEP_OUT}\n{KEEP_OUT_HI}\n", encoding="utf-8")


def snapshot(root, skip=None):
    """Every file under root with its size and change time, and every folder by name. A folder's
    own time is left out, since making the preview folder inside the repo changes it."""
    out = {}
    for dirpath, dirnames, filenames in os.walk(root):
        d = Path(dirpath)
        dirnames[:] = [n for n in dirnames if d / n != skip]
        for name in dirnames:
            out[str(d / name)] = "folder"
        for name in filenames:
            st = os.lstat(d / name)
            out[str(d / name)] = (st.st_size, st.st_mtime_ns)
    return out


def node_with_playwright():
    if not shutil.which("node"):
        return False
    env = dict(os.environ)
    env.setdefault("NODE_PATH", blog.NODE_PATH_DEFAULT)
    r = subprocess.run(["node", "-e", "require('playwright')"], env=env, capture_output=True)
    return r.returncode == 0


class BlogTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="iterate-blog-test-")).resolve()
        self.repo = self.tmp / "repo"
        make_repo(self.repo)
        self.vault = self.tmp / "vault" / "posts"
        self.vault.mkdir(parents=True)
        self.images = self.tmp / "vault" / "images"
        self.log = []

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    # -- helpers --

    def write(self, name="good-post", body=BODY, raw=None, **changes):
        meta = dict(META)
        for k, v in changes.items():
            if v is None:
                meta.pop(k, None)
            else:
                meta[k] = v
        text = raw if raw is not None else (
            "---\n" + yaml.safe_dump(meta, sort_keys=False, allow_unicode=True) + "---\n\n" + body)
        path = self.vault / f"{name}.md"
        path.write_text(text, encoding="utf-8")
        return path

    def picture(self, slug="good-post", name="chart.png", size=(2400, 1200)):
        (self.images / slug).mkdir(parents=True, exist_ok=True)
        Image.new("RGB", size, (24, 29, 56)).save(self.images / slug / name)

    def validated(self):
        site = blog.Site(self.repo)
        posts = blog.load_posts(self.vault)
        blog.validate(posts, site, self.images, TODAY)
        return {p.path.stem: p for p in posts}

    def build(self, mode="production", **kw):
        kw.setdefault("cards_on", False)
        return blog.build(self.repo, self.vault, mode, today=TODAY, log=self.log.append, **kw)

    def page(self, slug="good-post", root=None):
        return ((root or self.repo) / "blog" / f"{slug}.html").read_text(encoding="utf-8")

    def ld(self, html):
        m = re.search(r'<script type="application/ld\+json">\n(.*?)\n</script>', html, re.S)
        return json.loads(m.group(1))

    def article(self, html):
        return html.split('<article class="prose">', 1)[1].split("</article>", 1)[0]


class Validation(BlogTest):
    def test_a_good_post_has_no_errors_or_warnings(self):
        self.write()
        p = self.validated()["good-post"]
        self.assertEqual(p.errors, [])
        self.assertEqual(p.warnings, [])

    ERRORS = [
        ("no title", {"title": None}, "no title"),
        ("no description", {"description": None}, "no description"),
        ("no date", {"date": None}, "no date"),
        ("no author", {"author": None}, "no author"),
        ("no pillar", {"pillar": None}, "no pillar"),
        ("no demo", {"demo": None}, "no demo"),
        ("unknown author", {"author": "keanu"}, 'author "keanu"'),
        ("unknown pillar", {"pillar": "opinion"}, 'pillar "opinion"'),
        ("unknown demo", {"demo": "crm"}, 'demo "crm"'),
        ("search title over 60", {"seo_title": "What Is an AI Receptionist and Why Would a Shop Want One | Iterate"}, "over 60"),
        ("title fallback over 60", {"seo_title": None, "title": "What is an AI receptionist, and what it takes to keep one going"}, "over 60"),
        ("target not in the search title", {"target": "ai answering service"}, "isn't in the search title"),
        ("date not YYYY-MM-DD", {"date": "Oct 13 2026"}, "isn't a real date"),
        ("date that doesn't exist", {"date": "2026-02-30"}, "isn't a real date"),
        ("em dash in the frontmatter", {"description": META["description"].replace(", what it does", " \u2014 what it does")}, "en or em dash"),
        ("keep-out name in the title", {"title": f"What {KEEP_OUT} learned"}, "the title has a name from the keep-out list"),
        ("keep-out name in the description", {"description": META["description"] + f" {KEEP_OUT}"}, "the description has a name"),
        ("bad slug", {"slug": "What Is It"}, "lowercase words joined by hyphens"),
        ("updated in the future", {"updated": "2026-12-25"}, "hasn't happened yet"),
        ("keep-out name in the closing line", {"closing": f"Want what we built for {KEEP_OUT}? Tell us."},
         "the closing line has a name"),
        ("keep-out name in the search title", {"seo_title": f"{KEEP_OUT} and AI | Iterate", "target": "and ai"},
         "the search title has a name"),
        ("keep-out name in the target", {"target": f"{KEEP_OUT} receptionist", "seo_title": f"{KEEP_OUT} Receptionist | Iterate"},
         "the target has a name"),
    ]
    BODY_ERRORS = [
        ("en dash in the body", BODY + "\nMonday \u2013 Friday.\n", "en or em dash"),
        ("em dash entity in the body", BODY + "\nMonday &mdash; Friday.\n", "en or em dash"),
        ("Needs Kawika box", "> [!question] Needs Kawika\n> - Is it true?\n\n" + BODY, "Needs Kawika"),
        ("Needs Kawika box, any case", "> [!QUESTION] needs kawika\n> - Is it true?\n\n" + BODY, "Needs Kawika"),
        ("Needs Kawika box, bold title", "> [!question] **Needs Kawika**\n> - Is it true?\n\n" + BODY, "Needs Kawika"),
        ("Needs Kawika box, folded and italic", "> [!question]- _Needs Kawika_\n> - Is it true?\n\n" + BODY, "Needs Kawika"),
        ("Needs Kawika box as faq", "> [!faq] Needs Kawika\n> - Is it true?\n\n" + BODY, "Needs Kawika"),
        ("Needs Kawika box as help", "> [!help] Needs Kawika\n> - Is it true?\n\n" + BODY, "Needs Kawika"),
        ("Needs Kawika box inside a quote", "> > [!question] Needs Kawika\n> > - Is it true?\n\n" + BODY, "Needs Kawika"),
        ("Needs Kawika box, two spaces", "> [!question] Needs  Kawika\n> - Is it true?\n\n" + BODY, "Needs Kawika"),
        ("Needs Kawika box, no-break space", "> [!question] Needs\u00a0Kawika\n> - Is it true?\n\n" + BODY, "Needs Kawika"),
        ("keep-out name in the body", BODY + f"\nWe worked with {KEEP_OUT.lower()} last year.\n", "the body has a name"),
        ("keep-out name with an okina", BODY + "\nWe built the line for Zanzibar Hawai\u02bbi last spring.\n", "the body has a name"),
        ("keep-out name across a line break", BODY + "\nThe crew at Zanzibar\nQuokka loved it.\n", "the body has a name"),
        ("keep-out name in a link", BODY + "\nSee [their site](https://zanzibar-quokka.example/).\n", "the body has a name"),
        ("unclosed %% comment", BODY + "\n%%\nKawika only, call them back about the invoice\n", "comment that never closes"),
        ("unclosed html comment", BODY + "\n<!-- todo\nPrivate, the margin on this one\n", "comment that never closes"),
        ("unknown demo shortcode", BODY + "\nSee [the crm](demo:crm).\n", "demo that doesn't exist"),
        ("unknown page shortcode", BODY + "\nSee [pricing](page:pricing).\n", "page that isn't on the site"),
        ("unknown picture", BODY + "\n![A chart of calls](img:missing.png)\n", "isn't in images/good-post/"),
        ("picture with no alt text", BODY + "\n![](img:chart.png)\n", "nothing in its brackets"),
        ("a level-one heading", "# Big heading\n\n" + BODY, "level-one heading"),
    ]

    def _assert_blocks(self, expected):
        p = self.validated()["good-post"]
        self.assertTrue(any(expected in e for e in p.errors), f"{expected!r} not in {p.errors}")
        self.assertEqual(self.build(), 1)
        self.assertFalse((self.repo / "blog" / "good-post.html").exists())
        self.assertFalse((self.repo / "feed.xml").exists())

    def test_each_error_is_caught_and_blocks_publishing(self):
        for label, changes, expected in self.ERRORS:
            with self.subTest(label):
                self.write(**changes)
                self._assert_blocks(expected)

    def test_each_body_error_is_caught_and_blocks_publishing(self):
        self.picture()
        for label, body, expected in self.BODY_ERRORS:
            with self.subTest(label):
                self.write(body=body)
                self._assert_blocks(expected)

    def test_frontmatter_missing_entirely(self):
        self.write(raw="Just some text with no frontmatter.\n")
        p = self.validated()["good-post"]
        self.assertIn("no frontmatter (the --- block at the top)", p.errors)

    def test_duplicate_slugs(self):
        self.write("good-post")
        self.write("another-file", slug="good-post")
        posts = self.validated()
        for name in ("good-post", "another-file"):
            self.assertTrue(any('slug "good-post" is also used by' in e for e in posts[name].errors))
        self.assertEqual(self.build(), 1)
        self.assertFalse((self.repo / "blog").exists())

    def test_slug_defaults_to_the_file_name(self):
        self.write("What Is It", slug=None)
        p = self.validated()["What Is It"]
        self.assertEqual(p.slug, "what-is-it")
        self.assertEqual(p.errors, [])

    def test_target_matches_without_okina_kahako_or_apostrophes(self):
        self.write(seo_title="Why Owners Can't Tell What It Costs in Hawaiʻi | Iterate",
                   target="why owners cant tell what it costs in hawaii")
        self.assertFalse(any("target" in e for e in self.validated()["good-post"].errors))
        self.write(seo_title="Kahakō Rules for Māui Owners | Iterate", target="kahako rules for maui")
        self.assertFalse(any("target" in e for e in self.validated()["good-post"].errors))

    def test_keep_out_name_in_the_slug_or_a_picture_blocks_publishing(self):
        self.write("zanzibar-quokka-story", slug=None)
        p = self.validated()["zanzibar-quokka-story"]
        self.assertIn("the slug (from the file name) has a name", " ".join(p.errors))
        self.assertEqual(self.build(), 1)
        self.assertFalse((self.repo / "blog").exists())
        (self.vault / "zanzibar-quokka-story.md").unlink()

        self.write(slug="zanzibar-hawaii-story")
        self.assertIn("the slug has a name", " ".join(self.validated()["good-post"].errors))
        self.assertEqual(self.build(), 1)
        self.assertFalse((self.repo / "blog").exists())

        self.picture(name="zanzibar-quokka-dashboard.png")
        self.write(body=BODY + "\n![A dashboard of calls](img:zanzibar-quokka-dashboard.png)\n")
        p = self.validated()["good-post"]
        self.assertIn('the picture file "zanzibar-quokka-dashboard.png" has a name', " ".join(p.errors))
        self.assertEqual(self.build(), 1)
        self.assertFalse((self.repo / "blog").exists())
        self.assertFalse((self.repo / "assets" / "img" / "blog").exists())
        self.assertNotIn("zanzibar", (self.repo / "sitemap.xml").read_text(encoding="utf-8"))

    def test_an_unclosed_comment_names_its_line_and_hides_the_rest(self):
        for opener, tail in (("%%", "%%\nKawika only, call them back\n"), ("<!--", "<!-- todo\nKawika only, call them back\n")):
            with self.subTest(opener):
                path = self.write(body=BODY + "\n" + tail)
                line = path.read_text(encoding="utf-8").split("\n").index(tail.split("\n")[0]) + 1
                errors = " ".join(self.validated()["good-post"].errors)
                self.assertIn(f"line {line} opens a {opener} comment that never closes", errors)
                self.assertEqual(self.build("preview"), 0)
                self.assertNotIn("call them back", self.page(root=self.repo / ".preview"))

    def test_a_scheduled_post_may_carry_its_go_live_date_as_updated(self):
        self.write(date="2026-10-20", updated="2026-10-20")
        self.assertEqual(self.validated()["good-post"].errors, [])

    def test_names_check_is_skipped_without_the_list(self):
        (self.repo / "private" / "names-to-keep-out.txt").unlink()
        self.write(body=BODY + f"\n{KEEP_OUT}\n")
        self.assertFalse(any("keep-out" in e for e in self.validated()["good-post"].errors))

    WARNINGS = [
        ("description too short", {"description": "Too short."}, BODY, "the description is 10 characters"),
        ("field notes too long", {"pillar": "field-notes"}, BODY, "aim for 600 to 900"),
        ("education too short", {}, f"{LINKS}\n\n{FAQ}\n", "aim for 800 to 2,000"),
        ("fewer than 3 internal links", {}, BODY.replace(LINKS, "No links here."), "0 links to our own pages"),
        ("no FAQ heading", {}, BODY.replace("## Questions owners ask", "## The end"), "no FAQ section"),
        ("colon in a sentence", {}, BODY + "\nHere's the thing: it works.\n", "a colon inside a sentence"),
        ("link to a post that isn't live", {}, BODY + "\nRead [the cost post](post:cost-post) next.\n",
         "post:cost-post shows as plain text"),
    ]

    def test_each_warning_is_reported_and_does_not_block(self):
        for label, changes, body, expected in self.WARNINGS:
            with self.subTest(label):
                self.write(body=body, **changes)
                p = self.validated()["good-post"]
                self.assertEqual(p.errors, [])
                self.assertTrue(any(expected in w for w in p.warnings), f"{expected!r} not in {p.warnings}")
                self.assertEqual(self.build(), 0)
                self.assertTrue((self.repo / "blog" / "good-post.html").exists())

    def test_faq_heading_may_say_faq(self):
        self.write(body=BODY.replace("## Questions owners ask", "## FAQ"))
        self.assertFalse(any("FAQ" in w for w in self.validated()["good-post"].warnings))

    def test_colons_in_code_and_headings_are_fine(self):
        self.write(body=BODY + "\n## Case study: one app\n\nRun `python3 -c 'a: 1'` to see it.\n")
        self.assertFalse(any("colon" in w for w in self.validated()["good-post"].warnings))

    def test_check_mode_exit_codes(self):
        self.write("a-draft", status="draft", body="> [!question] Needs Kawika\n> - Sure?\n\n" + BODY)
        self.assertEqual(blog.check(self.repo, self.vault, TODAY, self.log.append), 0)
        self.assertTrue(any("Needs Kawika" in line for line in self.log))
        self.write("broken", slug="broken", date="2026-10-01", body=BODY + "\nA \u2014 dash.\n")
        self.assertEqual(blog.check(self.repo, self.vault, TODAY, self.log.append), 1)

    def test_index_wording_fits(self):
        self.assertLessEqual(len(blog.INDEX_TITLE), 60)
        self.assertTrue(120 <= len(blog.INDEX_DESCRIPTION) <= 155)
        for s in (blog.INDEX_TITLE, blog.INDEX_DESCRIPTION, blog.INDEX_LEDE, blog.CLOSING_DEFAULT, *blog.BIOS.values()):
            self.assertNotRegex(s, "[\u2013\u2014]")


class Production(BlogTest):
    def test_drafts_and_future_posts_never_render(self):
        self.write("a-draft", slug="a-draft", status="draft")
        self.write("later", slug="later", date="2026-10-20")
        self.write("good-post")
        self.assertEqual(self.build(), 0)
        names = sorted(p.name for p in (self.repo / "blog").glob("*.html"))
        self.assertEqual(names, ["good-post.html", "index.html"])
        self.assertIn("later: scheduled for 2026-10-20, skipped", self.log)
        feed = (self.repo / "feed.xml").read_text(encoding="utf-8")
        self.assertNotIn("a-draft", feed)
        self.assertNotIn("later", feed)
        self.assertNotIn("a-draft", (self.repo / "blog" / "index.html").read_text(encoding="utf-8"))

    def test_zero_posts_writes_nothing_and_clears_old_output(self):
        self.assertEqual(self.build(), 0)
        self.assertFalse((self.repo / "blog").exists())
        self.assertFalse((self.repo / "feed.xml").exists())
        self.write()
        self.picture()
        self.write(body=BODY + "\n![A navy chart](img:chart.png)\n")
        self.assertEqual(self.build(), 0)
        self.assertTrue((self.repo / "feed.xml").exists())
        (self.vault / "good-post.md").unlink()
        self.assertEqual(self.build(), 0)
        self.assertFalse((self.repo / "blog").exists())
        self.assertFalse((self.repo / "feed.xml").exists())
        self.assertFalse((self.repo / "assets" / "img" / "blog").exists())

    def test_stale_files_are_removed_when_a_post_is_unpublished(self):
        self.picture()
        self.write(body=BODY + "\n![A navy chart](img:chart.png)\n")
        self.write("second", slug="second", date="2026-10-06")
        self.assertEqual(self.build(), 0)
        hand = self.repo / "blog" / "notes.html"
        hand.write_text('<link rel="canonical" href="https://iteratehi.com/blog/notes"><p>by hand</p>', encoding="utf-8")
        self.assertTrue((self.repo / "assets/img/blog/good-post/chart.webp").exists())
        self.write(status="draft", body=BODY + "\n![A navy chart](img:chart.png)\n")
        self.assertEqual(self.build(), 0)
        self.assertFalse((self.repo / "blog" / "good-post.html").exists())
        self.assertFalse((self.repo / "assets/img/blog/good-post").exists())
        self.assertTrue((self.repo / "blog" / "second.html").exists())
        self.assertTrue(hand.exists(), "a file without the generated marker is never removed")
        self.assertIn("removed blog/good-post.html", self.log)
        self.assertNotIn("good-post", (self.repo / "feed.xml").read_text(encoding="utf-8"))

    def test_a_live_post_that_breaks_is_taken_down(self):
        self.picture()
        self.write(body=BODY + "\n![A navy chart](img:chart.png)\n")
        self.write("second", slug="second", date="2026-10-06")
        self.assertEqual(self.build(), 0)
        self.assertTrue((self.repo / "assets/img/blog/good-post/chart.webp").exists())
        # The client asks to stay anonymous: their name goes on the list after the post is live.
        self.write(body=BODY + f"\n![A navy chart](img:chart.png)\n\nWe built it for {KEEP_OUT}.\n")
        self.assertEqual(self.build(), 1)
        self.assertTrue(any("good-post: not rendered, it has errors" in line for line in self.log))
        self.assertFalse((self.repo / "blog" / "good-post.html").exists())
        self.assertFalse((self.repo / "assets/img/blog/good-post").exists())
        # The index, feed and sitemap agree that it's gone, and the other post is untouched.
        index = (self.repo / "blog" / "index.html").read_text(encoding="utf-8")
        self.assertNotIn("good-post", index)
        self.assertIn('href="second.html"', index)
        self.assertNotIn("good-post", (self.repo / "feed.xml").read_text(encoding="utf-8"))
        sm = (self.repo / "sitemap.xml").read_text(encoding="utf-8")
        self.assertNotIn("blog/good-post<", sm)
        self.assertIn("blog/second<", sm)
        # As the only post, it takes the index and feed down with it.
        (self.vault / "second.md").unlink()
        self.assertEqual(self.build(), 1)
        self.assertFalse((self.repo / "blog").exists())
        self.assertFalse((self.repo / "feed.xml").exists())
        self.assertNotIn("/blog/", (self.repo / "sitemap.xml").read_text(encoding="utf-8"))

    def test_the_home_block_fills_only_between_the_markers(self):
        home = self.repo / "index.html"
        original = home.read_text(encoding="utf-8")
        self.write()
        self.build()
        self.assertEqual(home.read_text(encoding="utf-8"), original, "no markers, no change")
        anchor = '<section class="sec photo wash-cream" id="why">'
        self.assertIn(anchor, original)
        marked = original.replace(anchor, f"<!-- blog:latest -->\n    old stuff\n    <!-- /blog:latest -->\n  {anchor}", 1)
        home.write_text(marked, encoding="utf-8")
        for n in range(4):
            self.write(f"post-{n}", slug=f"post-{n}", date=f"2026-10-0{n + 1}")
        self.assertEqual(self.build(), 0)
        after = home.read_text(encoding="utf-8")
        a, b = after.index("<!-- blog:latest -->"), after.index("<!-- /blog:latest -->")
        self.assertEqual(after[:a], marked[:marked.index("<!-- blog:latest -->")])
        self.assertEqual(after[b:], marked[marked.index("<!-- /blog:latest -->"):])
        block = after[a:b]
        self.assertNotIn("old stuff", block)
        hrefs = re.findall(r'href="([^"]+)"', block)
        self.assertEqual(hrefs, ["blog/good-post.html", "blog/post-3.html", "blog/post-2.html"])
        self.assertEqual(block.count('class="post-card"'), 3)

    def test_sitemap_gains_the_post_with_its_modified_date(self):
        self.write(date="2026-10-06", updated="2026-10-12")
        self.assertEqual(self.build(), 0)
        sm = (self.repo / "sitemap.xml").read_text(encoding="utf-8")
        self.assertIn("<url><loc>https://iteratehi.com/blog/good-post</loc><lastmod>2026-10-12</lastmod></url>", sm)
        self.assertIn("<loc>https://iteratehi.com/blog/</loc>", sm)
        self.assertIn("Updated <time", self.page())

    def test_generated_pages_carry_the_marker_and_the_site_chrome(self):
        self.write()
        self.build()
        for f in [*(self.repo / "blog").glob("*.html")]:
            html = f.read_text(encoding="utf-8")
            with self.subTest(f.name):
                self.assertIn("<body>\n" + blog.MARKER, html)
                self.assertNotRegex(html, "[\u2013\u2014]")
                # Only links to the blog itself are marked as the current page.
                for a in re.findall(r'<a\b[^>]*aria-current="page"[^>]*>', html):
                    self.assertIn('href="../blog/"', a)
                self.assertIn('<header class="nav">', html)
                self.assertIn('<nav class="nav-menu" id="menu" hidden aria-label="Mobile">', html)
                self.assertIn('<footer class="footer">', html)
                self.assertIn('href="../what-we-do.html"', html)
                self.assertIn('<a class="brand" href="../"', html)
                self.assertIn('<link rel="manifest" href="../site.webmanifest">', html)
                self.assertIn('<script src="../assets/js/site.js" defer></script>', html)
                self.assertNotIn("gsap", html)
                self.assertNotIn("noindex", html)
                self.assertEqual(html.count("<h1"), 1)
        self.assertNotIn("--", blog.MARKER[4:-3])

    def test_post_page_anatomy(self):
        self.write("other", slug="other", pillar="rabbit-hole", date="2026-10-01")
        self.write("same-pillar", slug="same-pillar", date="2026-09-29")
        self.write(closing="Tell us about your phones and we'll show you what we'd set up.")
        self.build()
        html = self.page()
        self.assertIn("<title>What Is an AI Receptionist? | Iterate</title>", html)
        self.assertIn('<link rel="canonical" href="https://iteratehi.com/blog/good-post">', html)
        self.assertIn('<meta property="og:type" content="article">', html)
        self.assertIn('<meta property="article:published_time" content="2026-10-13">', html)
        self.assertIn('<link rel="alternate" type="application/rss+xml" title="Iterate blog" href="../feed.xml">', html)
        self.assertIn('<nav class="crumbs" aria-label="Breadcrumb">', html)
        self.assertIn('<p class="kicker">Education</p>', html)
        self.assertIn('By <a class="tlink" href="../about.html#kawika">Kawika Lopez</a>', html)
        self.assertIn('<time datetime="2026-10-13">October 13, 2026</time>', html)
        self.assertNotIn("Updated <time", html)
        demo = re.search(r'<section class="post-demo".*?</section>', html, re.S).group(0)
        self.assertIn('<a class="tlink" href="../demos/phone.html">An after-hours line for emergency calls</a>', demo)
        self.assertIn("Talk to or chat with a real after-hours phone agent", demo)
        author = re.search(r'<section class="post-author".*?</section>', html, re.S).group(0)
        self.assertIn('src="../assets/img/kawika.webp"', author)
        self.assertIn('width="800" height="1000"', author)
        self.assertIn("Co-founder | Chief of Strategy", author)
        related = re.search(r'<section class="sec-tight post-related".*?</section>', html, re.S).group(0)
        self.assertEqual(re.findall(r'href="([^"]+)"', related), ["same-pillar.html", "other.html"])
        cta = re.search(r'<section class="sec-tight on-ink post-cta".*?</section>', html, re.S).group(0)
        self.assertIn(">Skip the rabbit hole</h2>", cta)
        self.assertIn("Tell us about your phones and we'll show you what we'd set up.", cta)
        self.assertIn('<a class="btn" href="../contact.html" data-magnetic><span>Let\'s Connect</span>', cta)
        self.assertIn(blog.CLOSING_DEFAULT, self.page("other"))

    def test_no_keep_reading_without_other_posts(self):
        self.write()
        self.build()
        self.assertNotIn("Keep reading", self.page())

    def test_blog_index(self):
        self.write()
        self.write("older", slug="older", date="2026-10-01", title="An older post about phones")
        self.build()
        html = (self.repo / "blog" / "index.html").read_text(encoding="utf-8")
        self.assertIn(f"<title>{blog.INDEX_TITLE}</title>", html)
        self.assertIn('<link rel="canonical" href="https://iteratehi.com/blog/">', html)
        self.assertIn('<meta property="og:type" content="website">', html)
        self.assertIn('<p class="kicker">Blog</p>', html)
        cards = re.search(r'<ul class="post-cards".*?</ul>', html, re.S).group(0)
        self.assertEqual(re.findall(r'href="([^"]+)"', cards), ["good-post.html", "older.html"])
        self.assertEqual(cards.count("<a "), 2, "the title is the only link on a card")
        self.assertIn(f'<span>{self.validated()["good-post"].minutes} min read</span>', cards)
        graph = self.ld(html)["@graph"]
        blog_node = next(n for n in graph if n["@type"] == "Blog")
        self.assertEqual([p["url"] for p in blog_node["blogPost"]],
                         ["https://iteratehi.com/blog/good-post", "https://iteratehi.com/blog/older"])
        self.assertEqual(blog_node["publisher"]["@id"], "https://iteratehi.com/#business")
        crumbs = next(n for n in graph if n["@type"] == "BreadcrumbList")
        self.assertEqual([i["name"] for i in crumbs["itemListElement"]], ["Home", "Blog"])


class Rendering(BlogTest):
    def test_shortcodes_resolve(self):
        self.picture()
        self.picture(name="inline.png", size=(400, 300))
        self.write("other-post", slug="other-post", date="2026-10-01")
        self.write("draft-post", slug="draft-post", status="draft")
        body = BODY + (
            "\nSee [the portal](demo:portal), [about us](page:about#ben), [home](page:home), "
            "[the other post](post:other-post), and [the draft](post:draft-post).\n\n"
            '![A navy chart of calls](img:chart.png "Calls by hour")\n\n'
            "A tiny ![a small square](img:inline.png) inline.\n\n"
            "Plain [web link](https://example.com/page).\n")
        self.write(body=body)
        self.assertEqual(self.build(), 0)
        art = self.article(self.page())
        self.assertIn('<a class="tlink" href="../demos/portal.html">the portal</a>', art)
        self.assertIn('<a class="tlink" href="../about.html#ben">about us</a>', art)
        self.assertIn('<a class="tlink" href="../">home</a>', art)
        self.assertIn('<a class="tlink" href="other-post.html">the other post</a>', art)
        self.assertIn("and the draft.", art)
        self.assertNotIn("draft-post", art)
        self.assertIn('<a class="tlink" href="https://example.com/page">web link</a>', art)
        self.assertEqual(re.findall(r"<a (?![^>]*class=\"[^\"]*tlink)", art), [], "every link gets tlink")
        fig = re.search(r"<figure>.*?</figure>", art, re.S).group(0)
        self.assertIn('src="../assets/img/blog/good-post/chart.webp"', fig)
        self.assertIn('width="1600"', fig)
        self.assertIn('height="800"', fig)
        self.assertIn('alt="A navy chart of calls"', fig)
        self.assertIn('loading="lazy"', fig)
        self.assertIn('decoding="async"', fig)
        self.assertIn("<figcaption>Calls by hour</figcaption>", fig)
        self.assertIn('src="../assets/img/blog/good-post/inline.webp"', art)
        with Image.open(self.repo / "assets/img/blog/good-post/chart.webp") as im:
            self.assertEqual((im.format, im.size), ("WEBP", (1600, 800)))
        with Image.open(self.repo / "assets/img/blog/good-post/inline.webp") as im:
            self.assertEqual(im.size, (400, 300), "small pictures keep their size")
        self.assertIn("post:draft-post shows as plain text", " ".join(self.validated()["good-post"].warnings))

    def test_tables_get_the_scroll_wrapper(self):
        self.write(body=BODY + "\n\n| Item | Yearly |\n|---|---|\n| Line | $60 |\n\n| | |\n|---|---|\n| a | b |\n")
        self.build()
        art = self.article(self.page())
        wraps = re.findall(r"<div ([^>]*)>\s*<table>", art)
        self.assertEqual(len(wraps), 3)
        labels = [re.search(r'aria-label="([^"]*)"', w).group(1) for w in wraps]
        self.assertEqual(labels, ["Item", "Item, table 2", "Table"])
        for w in wraps:
            self.assertIn('class="table-wrap"', w)
            self.assertIn('role="region"', w)
            self.assertIn('tabindex="0"', w)
        self.assertEqual(art.count("<table>"), art.count('class="table-wrap"'))

    def test_an_empty_corner_cell_is_not_an_empty_header(self):
        self.write(body=BODY + "\n\n| | Person | Robot |\n|---|---|---|\n| Answers | Yes | Yes |\n")
        self.build()
        art = self.article(self.page())
        corner = re.search(r'<div [^>]*aria-label="Table"[^>]*>\s*<table>\s*<thead>\s*<tr>\s*(<t[dh]>[^<]*</t[dh]>)', art)
        self.assertIsNotNone(corner, "the comparison table is labelled Table")
        self.assertEqual(corner.group(1), "<td></td>")
        self.assertNotRegex(art, r"<th>\s*</th>")
        self.assertIn("<th>Person</th>", art)

    def test_heading_ids_are_unique(self):
        self.write(body=BODY + "\n## Pricing\n\nOne.\n\n## Pricing\n\nTwo.\n\n### Pricing\n\nThree.\n\n## Main\n\nFour.\n")
        self.build()
        html = self.page()
        ids = re.findall(r'\bid="([^"]+)"', html)
        self.assertEqual(len(ids), len(set(ids)), "no id repeats anywhere on the page")
        art = self.article(html)
        self.assertIn('<h2 id="pricing">Pricing</h2>', art)
        self.assertIn('<h2 id="pricing-2">Pricing</h2>', art)
        self.assertIn('<h3 id="pricing-3">Pricing</h3>', art)
        self.assertIn('<h2 id="main-2">Main</h2>', art)
        self.assertIn('<h2 id="questions-owners-ask">', art)

    def test_reading_time(self):
        for words, minutes in ((1320, 6), (1321, 7), (100, 1)):
            with self.subTest(words=words):
                self.write(body=" ".join(["alpha"] * words) + "\n")
                p = self.validated()["good-post"]
                self.assertEqual(p.words, words)
                self.assertEqual(p.minutes, max(1, math.ceil(words / 220)))
                self.assertEqual(p.minutes, minutes)
                self.build()
                self.assertIn(f"<span>{minutes} min read</span>", self.page())

    def test_json_ld(self):
        self.write(date="2026-10-06", updated="2026-10-12")
        self.build()
        graph = self.ld(self.page())["@graph"]
        post = next(n for n in graph if n["@type"] == "BlogPosting")
        self.assertEqual(post["author"]["@id"], "https://iteratehi.com/about#kawika")
        self.assertEqual(post["publisher"]["@id"], "https://iteratehi.com/#business")
        self.assertEqual(post["url"], "https://iteratehi.com/blog/good-post")
        self.assertEqual(post["mainEntityOfPage"], post["url"])
        self.assertEqual((post["datePublished"], post["dateModified"]), ("2026-10-06", "2026-10-12"))
        self.assertEqual(post["headline"], META["title"])
        self.assertEqual(post["inLanguage"], "en-US")
        self.assertEqual(post["articleSection"], "Education")
        self.assertIsInstance(post["wordCount"], int)
        self.assertEqual(post["image"], "https://iteratehi.com/assets/img/og.jpg", "cards off: the site picture")
        crumbs = next(n for n in graph if n["@type"] == "BreadcrumbList")["itemListElement"]
        self.assertEqual([c["item"] for c in crumbs],
                         ["https://iteratehi.com/", "https://iteratehi.com/blog/", "https://iteratehi.com/blog/good-post"])

    def test_feed(self):
        self.write()
        self.write("older", slug="older", date="2026-10-06")
        self.build()
        root = ET.parse(self.repo / "feed.xml").getroot()
        self.assertEqual(root.tag, "rss")
        ch = root.find("channel")
        self.assertEqual(ch.findtext("title"), "Iterate blog")
        self.assertEqual(ch.findtext("link"), "https://iteratehi.com/blog/")
        self.assertEqual(ch.findtext("language"), "en-us")
        self.assertEqual(ch.findtext("description"), blog.INDEX_DESCRIPTION)
        self_link = ch.find("{http://www.w3.org/2005/Atom}link")
        self.assertEqual((self_link.get("rel"), self_link.get("href")), ("self", "https://iteratehi.com/feed.xml"))
        items = ch.findall("item")
        self.assertEqual([i.findtext("link") for i in items],
                         ["https://iteratehi.com/blog/good-post", "https://iteratehi.com/blog/older"])
        first = items[0]
        self.assertEqual(first.findtext("guid"), "https://iteratehi.com/blog/good-post")
        self.assertEqual(first.findtext("pubDate"), "Tue, 13 Oct 2026 06:00:00 -1000")
        enc = first.find("enclosure")
        self.assertEqual(enc.get("type"), "image/jpeg")
        self.assertEqual(enc.get("url"), "https://iteratehi.com/assets/img/og.jpg")
        self.assertEqual(int(enc.get("length")), (self.repo / "assets/img/og.jpg").stat().st_size)

    def test_callouts_and_comments(self):
        self.write(body=BODY + "\n> [!note] Heads up\n> The body of the note.\n\n> [!tip]\n> A second box.\n\n"
                              "%% a private note %%\n\n<!-- another private note -->\n")
        self.build()
        art = self.article(self.page())
        self.assertNotIn("[!", art)
        self.assertEqual(art.count("<blockquote>"), 2)
        self.assertIn("The body of the note.", art)
        self.assertNotIn("private note", self.page())

    def test_comment_markers_inside_code_are_code(self):
        self.write(body=BODY + (
            '\nIn Sheets, type `=TEXT(A1, "0%%")` to show a percent. Keep this sentence. Then `100%%` again.\n\n'
            "```html\n<!-- a sample comment -->\n<p>50%% off</p>\n```\n\n"
            "Inline `<!-- x` stays, and %% this note goes %% away.\n\n"
            "%% a note around a sample\n```\nhidden code\n```\nstill the note %%\n\nAfter the note.\n"))
        self.assertEqual(self.validated()["good-post"].errors, [])
        self.assertEqual(self.build(), 0)
        art = self.article(self.page())
        self.assertIn('<code>=TEXT(A1, "0%%")</code> to show a percent. Keep this sentence. Then <code>100%%</code> again.', art)
        self.assertIn("&lt;!-- a sample comment --&gt;", art)
        self.assertIn("&lt;p&gt;50%% off&lt;/p&gt;", art)
        self.assertIn("<code>&lt;!-- x</code> stays, and  away.", art)
        self.assertNotIn("this note goes", art)
        self.assertNotIn("hidden code", art)
        self.assertNotIn("still the note", art)
        self.assertIn("After the note.", art)

    def test_a_future_updated_date_never_reaches_a_page(self):
        self.write(date="2026-10-06", updated="2026-12-25", status="draft")
        self.build("preview")
        html = self.page(root=self.repo / ".preview")
        self.assertIn('<meta property="article:modified_time" content="2026-10-13">', html)
        self.assertNotIn("2026-12-25", html.split("<main", 1)[0])


class Preview(BlogTest):
    def test_preview_writes_nothing_outside_its_folder(self):
        self.picture()
        self.write(body=BODY + "\n![A navy chart](img:chart.png)\n")
        self.write("a-draft", slug="a-draft", status="draft", body="> [!question] Needs Kawika\n> - Sure?\n\n" + BODY)
        self.write("later", slug="later", date="2026-10-27")
        out = self.repo / ".preview"
        before = snapshot(self.tmp, skip=out)
        self.assertEqual(self.build("preview"), 0)
        self.assertEqual(snapshot(self.tmp, skip=out), before)
        # Run again over the same folder: it rebuilds in place.
        self.assertEqual(self.build("preview"), 0)
        self.assertEqual(snapshot(self.tmp, skip=out), before)

        self.assertTrue((out / "about.html").is_symlink())
        self.assertTrue((out / "demos").is_symlink())
        self.assertTrue((out / "assets").is_symlink())
        self.assertFalse((out / "index.html").is_symlink())
        self.assertFalse((out / "private").exists())
        self.assertEqual(sorted(p.name for p in (out / "blog").glob("*.html")),
                         ["a-draft.html", "good-post.html", "index.html", "later.html"])
        self.assertTrue((out / "blog-assets" / "good-post" / "chart.webp").exists())
        self.assertIn('src="../blog-assets/good-post/chart.webp"', self.page(root=out))
        self.assertFalse((self.repo / "blog").exists())
        self.assertFalse((self.repo / "assets" / "img" / "blog").exists())

        draft = self.page("a-draft", root=out)
        self.assertIn('class="draft-banner"', draft)
        self.assertIn("Draft, not published.", draft)
        self.assertIn('<meta name="iterate-draft" content="1">', draft)
        self.assertNotIn("noindex", draft)
        self.assertIn("<strong>Needs Kawika</strong>", draft)
        later = self.page("later", root=out)
        self.assertIn("Scheduled for October 27, 2026.", later)
        self.assertNotIn("iterate-draft", later)
        live = self.page(root=out)
        self.assertNotIn("draft-banner", live)

        sm = (out / "sitemap.xml").read_text(encoding="utf-8")
        for slug in ("good-post", "a-draft", "later"):
            self.assertIn(f"<loc>https://iteratehi.com/blog/{slug}</loc>", sm)
        self.assertIn("<loc>https://iteratehi.com/about</loc>", sm)
        self.assertIn("a-draft", (out / "feed.xml").read_text(encoding="utf-8"))

    def test_preview_resolves_links_to_drafts(self):
        self.write("a-draft", slug="a-draft", status="draft")
        self.write(body=BODY + "\nRead [the draft](post:a-draft).\n")
        self.build("preview")
        self.assertIn('<a class="tlink" href="a-draft.html">the draft</a>', self.page(root=self.repo / ".preview"))

    def test_preview_refuses_a_folder_in_the_repo_that_git_would_commit(self):
        self.write()
        for out in (self.repo / "preview", self.repo / "drafts", self.repo):
            with self.subTest(str(out.relative_to(self.tmp))):
                before = snapshot(self.tmp)
                with self.assertRaises(blog.BlogError):
                    self.build("preview", out=out)
                self.assertEqual(snapshot(self.tmp), before)
        self.assertEqual(self.build("preview", out=self.repo / ".preview-x"), 0)
        self.assertTrue((self.repo / ".preview-x" / "blog" / "good-post.html").exists())
        self.assertEqual(self.build("preview", out=self.tmp / "elsewhere"), 0)
        self.assertTrue((self.tmp / "elsewhere" / "blog" / "good-post.html").exists())

    def test_preview_refuses_a_folder_that_is_not_a_preview(self):
        busy = self.tmp / "busy"
        busy.mkdir()
        (busy / "keep.txt").write_text("mine", encoding="utf-8")
        self.write()
        with self.assertRaises(blog.BlogError):
            self.build("preview", out=busy)
        self.assertEqual((busy / "keep.txt").read_text(encoding="utf-8"), "mine")


@unittest.skipUnless(node_with_playwright(), "node and Playwright aren't available")
class ShareCards(BlogTest):
    def test_share_card(self):
        self.write()
        self.assertEqual(self.build(cards_on=True), 0)
        card = self.repo / "assets/img/blog/good-post/og.jpg"
        with Image.open(card) as im:
            self.assertEqual((im.format, im.size), ("JPEG", (1200, 630)))
        html = self.page()
        self.assertIn('<meta property="og:image" content="https://iteratehi.com/assets/img/blog/good-post/og.jpg">', html)
        self.assertIn(f'<meta property="og:image:alt" content="{META["title"]}, on the Iterate blog">', html)
        enc = ET.parse(self.repo / "feed.xml").getroot().find("channel/item/enclosure")
        self.assertEqual(int(enc.get("length")), card.stat().st_size)
        # A second run with nothing changed leaves the card alone.
        stamp = card.stat().st_mtime_ns
        self.build(cards_on=True)
        self.assertEqual(card.stat().st_mtime_ns, stamp)


if __name__ == "__main__":
    unittest.main()
