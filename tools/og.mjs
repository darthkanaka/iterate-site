// Share cards for blog posts: the 1200 by 630 picture that shows when a post's link is
// shared. Pillow can't read the site's woff2 fonts, so the card is drawn in Chromium with
// the real fonts and saved as a JPEG.
//
//   node tools/og.mjs jobs.json
//
// jobs.json holds [{ "title": "...", "pillar": "Education", "out": "/abs/path/og.jpg" }].
// tools/blog.py writes that file and calls this; nothing else needs to.
//
// The colors come from the tokens in assets/css/site.css (section 01) and the HI mark from
// the #mark symbol in what-we-do.html, both read at run time, so a token or logo change
// reaches the cards on the next build. Needs Playwright, installed outside this repo, with
// NODE_PATH pointing at it (the same setup as tools/check.mjs).

import { createRequire } from "module";
import { readFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = new URL("../", import.meta.url);
const FONTS = new URL("assets/fonts/", ROOT);
const W = 1200, H = 630;
// Title line height. Room for a kahakō on a capital (Ā, Ō) without it touching the line above,
// where at a tighter setting it reads as an underline. The three-line fit uses the same number.
const LH = 1.14;

const jobsFile = process.argv[2];
if (!jobsFile) { console.error("usage: node tools/og.mjs jobs.json"); process.exit(2); }
const jobs = JSON.parse(readFileSync(jobsFile, "utf8"));

// Tokens from site.css section 01. A missing token is a hard stop: a card in the wrong colors
// is worse than no card, and blog.py falls back to the site's own share picture.
const css = readFileSync(new URL("assets/css/site.css", ROOT), "utf8");
const token = (name) => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`));
  if (!m) throw new Error(`site.css has no --${name} token`);
  return m[1];
};
const NAVY = token("ink"), CORAL = token("accent"), CREAM = token("bg"), WHITE = token("paper");

const page0 = readFileSync(new URL("what-we-do.html", ROOT), "utf8");
const mark = page0.match(/<symbol id="mark" viewBox="([^"]+)"><path fill="currentColor" d="([^"]+)"\/><\/symbol>/);
if (!mark) throw new Error("what-we-do.html has no #mark symbol to copy");
const [, VIEWBOX, PATH] = mark;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const html = (title, pillar) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
@font-face { font-family: "Oswald"; font-weight: 200 700; src: url("${FONTS.href}oswald.woff2") format("woff2"); }
@font-face { font-family: "Poppins"; font-weight: 500; src: url("${FONTS.href}poppins-500.woff2") format("woff2"); }
@font-face { font-family: "Poppins"; font-weight: 600; src: url("${FONTS.href}poppins-600.woff2") format("woff2"); }
html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: ${NAVY}; }
.card { position: relative; box-sizing: border-box; width: ${W}px; height: ${H}px; padding: 74px 88px 62px; display: flex; flex-direction: column; overflow: hidden; }
.ghost { position: absolute; right: -70px; bottom: -96px; height: 560px; width: auto; color: ${WHITE}; opacity: .045; }
.rule { width: 76px; height: 6px; border-radius: 6px; background: ${CORAL}; }
.pillar { margin: 26px 0 0; font: 600 25px/1 "Poppins"; letter-spacing: .16em; text-transform: uppercase; color: ${CORAL}; }
.title { margin: 30px 0 0; max-width: 1010px; font-family: "Oswald"; font-weight: 500; line-height: ${LH}; text-transform: uppercase; color: ${WHITE}; text-wrap: balance; overflow-wrap: normal; }
.foot { margin-top: auto; display: flex; align-items: center; gap: 18px; color: ${CREAM}; }
.foot svg { height: 50px; width: auto; display: block; }
.foot span { font: 500 27px/1 "Poppins"; letter-spacing: .02em; }
</style></head><body>
<div class="card">
  <svg class="ghost" viewBox="${VIEWBOX}" aria-hidden="true"><path fill="currentColor" d="${PATH}"/></svg>
  <div class="rule"></div>
  <p class="pillar">${esc(pillar)}</p>
  <h1 class="title" id="t">${esc(title)}</h1>
  <div class="foot"><svg viewBox="${VIEWBOX}" aria-hidden="true"><path fill="currentColor" d="${PATH}"/></svg><span>iteratehi.com</span></div>
</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
// Start from a file: page so the file: font URLs are same-scheme and load. setContent keeps
// the page's address, so every card below can use them.
await page.goto(FONTS.href);

let failed = 0;
for (const job of jobs) {
  try {
    await page.setContent(html(job.title, job.pillar), { waitUntil: "load" });
    const fit = await page.evaluate(async (lh) => {
      await Promise.all([
        document.fonts.load('500 100px "Oswald"'),
        document.fonts.load('500 27px "Poppins"'),
        document.fonts.load('600 25px "Poppins"'),
      ]);
      await document.fonts.ready;
      const loaded = document.fonts.check('500 100px "Oswald"') && document.fonts.check('600 25px "Poppins"');
      // Largest size, in 2px steps, that keeps the title to three lines with no word cut off
      // and the footer clear.
      const t = document.getElementById("t");
      const foot = document.querySelector(".foot");
      let size = 108;
      for (; size >= 40; size -= 2) {
        t.style.fontSize = size + "px";
        const lines = Math.round(t.getBoundingClientRect().height / (size * lh));
        const clear = t.getBoundingClientRect().bottom <= foot.getBoundingClientRect().top - 28;
        if (lines <= 3 && t.scrollWidth <= t.clientWidth && clear) break;
      }
      return { loaded, size };
    }, LH);
    if (!fit.loaded) throw new Error("the site fonts didn't load");
    mkdirSync(dirname(job.out), { recursive: true });
    await page.screenshot({ path: job.out, type: "jpeg", quality: 85, clip: { x: 0, y: 0, width: W, height: H } });
    console.log(`card ${job.out} (title at ${fit.size}px)`);
  } catch (e) {
    failed++;
    console.error(`card ${job.out} failed: ${e.message}`);
  }
}

await browser.close();
process.exit(failed ? 1 : 0);
