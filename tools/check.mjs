// Automated checks for every page: console errors, failed requests,
// horizontal overflow, axe (WCAG 2.1 A and AA plus best practice), JS off,
// reduced motion, the mobile menu, the case study rail, and an SEO pass (one h1,
// title and description, canonical, social tags, structured data, no dashes, no
// client names in the text or in any address on the page, and a sitemap that
// matches the pages).
//
// Pages are found on disk: every .html file at the root, in demos/ and in blog/. CHECK_ROOT
// points that search at another folder, such as a blog preview from tools/blog.py --preview,
// served on its own port.
//
//   node tools/check.mjs                       # against a local preview on :8778
//   node tools/check.mjs https://darthkanaka.github.io/iterate-site/
//   CHECK_ROOT=.preview node tools/check.mjs http://localhost:8779/
//
// Needs Playwright, installed outside this repo so the site stays dependency
// free: `npm i playwright` in any scratch folder, then run with NODE_PATH
// pointing at that folder's node_modules. Exits non-zero on any failure.

import { createRequire } from "module";
import { existsSync, readdirSync, readFileSync } from "fs";
import { resolve } from "path";
import { pathToFileURL } from "url";
const require = createRequire(import.meta.url);
const playwright = require("playwright");
// BROWSER=webkit (Safari's engine) or BROWSER=firefox runs the same checks there. Firefox
// has no phone mode, so its "phone" runs are a narrow desktop window.
const ENGINE = process.env.BROWSER || "chromium";

const BASE = (process.argv[2] || "http://localhost:8778/").replace(/\/?$/, "/");
const REPO = new URL("../", import.meta.url);
// Where the pages are found. The keep-out names list stays the repo's own.
const ROOT = process.env.CHECK_ROOT ? pathToFileURL(resolve(process.env.CHECK_ROOT) + "/") : REPO;
const htmlIn = (dir) => existsSync(new URL(dir, ROOT)) ? readdirSync(new URL(dir, ROOT)).filter((f) => f.endsWith(".html")).sort().map((f) => dir + f) : [];
// "" is the home page; index.html in a folder is that folder's page (blog/).
const PAGES = ["", ...htmlIn("").filter((f) => f !== "index.html"), ...htmlIn("demos/"), ...htmlIn("blog/")];
const SITE = "https://iteratehi.com/";
// The canonical URL a page should declare: no .html, folders end in a slash.
const canonicalFor = (path) => SITE + path.replace(/(^|\/)index\.html$/, "$1").replace(/\.html$/, "");
// Real names kept out of public pages. The list is git-ignored, so on a machine without it
// that part of the check is skipped.
const NAMES_FILE = new URL("private/names-to-keep-out.txt", REPO);
const NAMES = existsSync(NAMES_FILE) ? readFileSync(NAMES_FILE, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")) : [];
// Names and text are compared as lowercase words joined by hyphens, with no ʻokina, kahakō or
// apostrophes (the same as nameKey in tools/blog.py), so "Hawaiʻi" matches "Hawaii", a name
// broken across lines still matches, and so does a name in a web address or file name.
const nameKey = (s) => s.normalize("NFKD").replace(/\p{M}/gu, "").replace(/[\u02BB'\u2019\u2018]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const NAME_KEYS = NAMES.map(nameKey).filter(Boolean);
const warn = (msg) => console.log("  warn " + msg);
const canonicals = [];
const WIDTHS = [1440, 1024, 390];
const AXE = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.3/axe.min.js";

let failures = 0;
const fail = (msg) => { failures++; console.log("  FAIL " + msg); };
const ok = (msg) => console.log("  ok   " + msg);

async function scrollThrough(page) {
  const h = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h; y += 500) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function seo(page, path, name) {
  const d = await page.evaluate(() => {
    const meta = (sel) => document.querySelector(sel)?.getAttribute("content") ?? null;
    const body = document.body.cloneNode(true);
    body.querySelectorAll("script, style, noscript").forEach((n) => n.remove());
    return {
      h1: document.querySelectorAll("h1").length,
      title: document.title,
      description: meta('meta[name="description"]'),
      noindex: /noindex/.test(meta('meta[name="robots"]') || ""),
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
      og: ["og:title", "og:description", "og:image", "og:image:alt", "og:url", "og:site_name"].map((p) => [p, meta(`meta[property="${p}"]`)]),
      tw: ["twitter:card", "twitter:title", "twitter:description", "twitter:image"].map((p) => [p, meta(`meta[name="${p}"]`)]),
      ogUrl: meta('meta[property="og:url"]'),
      ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent),
      text: [document.title, meta('meta[name="description"]') || "", body.innerText].join("\n"),
      urls: [location.pathname, ...[...document.querySelectorAll("[href], [src]")].map((e) => e.getAttribute("href") || e.getAttribute("src") || "")],
    };
  });
  const problems = [];
  if (d.h1 !== 1) problems.push(`${d.h1} h1 headings`);
  if (/[\u2013\u2014]/.test(d.text)) problems.push("a dash character in the text");
  const said = nameKey(d.text), linked = d.urls.map(nameKey);
  for (const k of NAME_KEYS) {
    if (said.includes(k)) problems.push("a name from the keep-out list in the text");
    if (linked.some((u) => u.includes(k))) problems.push("a name from the keep-out list in a web address or file name");
  }
  if (!d.noindex) {
    if (!d.title) problems.push("no title");
    else if (d.title.length > 60) problems.push(`title is ${d.title.length} characters`);
    else if (d.title.length < 30) warn(`${name} title is short (${d.title.length}): ${d.title}`);
    if (!d.description) problems.push("no description");
    else if (d.description.length < 120 || d.description.length > 155) warn(`${name} description is ${d.description.length} characters (aim for 120 to 155)`);
    const want = canonicalFor(path || "index.html");
    if (d.canonical !== want) problems.push(`canonical is ${d.canonical}, expected ${want}`);
    else canonicals.push(want);
    if (d.ogUrl !== d.canonical) problems.push("og:url doesn't match the canonical");
    for (const [p, v] of [...d.og, ...d.tw]) if (!v) problems.push(`no ${p}`);
    if (!d.ld.length) problems.push("no structured data");
    for (const j of d.ld) { try { JSON.parse(j); } catch (e) { problems.push("structured data doesn't parse"); } }
  }
  problems.length ? fail(`${name} seo: ${problems.join("; ")}`) : ok(`${name} seo`);
}

const browser = await playwright[ENGINE].launch();
if (ENGINE === "firefox") { const plain = browser.newContext.bind(browser); browser.newContext = ({ isMobile, ...o } = {}) => plain(o); }
console.log(`engine: ${ENGINE}` + (process.env.CHECK_ROOT ? `, pages from ${resolve(process.env.CHECK_ROOT)}` : ""));

for (const width of WIDTHS) {
  console.log(`\n${width}px`);
  const mobile = width < 600;
  const ctx = await browser.newContext({
    viewport: { width, height: mobile ? 844 : 900 },
    hasTouch: mobile, isMobile: mobile,
  });
  // The phone demo asks the demos API if it's up. Answer for it, so this check doesn't depend
  // on the API running (tools/check-phone.mjs covers the demo itself).
  await ctx.route(/localhost:8787\/|iterate-demos-api/, (route) => route.fulfill({
    status: 200, headers: { "access-control-allow-origin": "*", "content-type": "application/json" },
    body: JSON.stringify({ ok: true, chat: true, voice: true, real_sms: false }),
  }));
  for (const path of PAGES) {
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => { if (!/challenges\.cloudflare\.com" from accessing a frame/.test(e.message)) errs.push(e.message); }); // WebKit reports Cloudflare's frame reaching for ours as a page error
    // Cloudflare's person check (phone demo) runs in its own frame. On the live site it treats
    // an automated browser as a bot and its challenge logs errors and failed requests; in
    // Playwright's WebKit it also trips over its own blob URLs. None of that is our code, so
    // anything coming from Cloudflare's frame or hosts is left out.
    const fromCloudflare = (u) => /^(blob:)?https:\/\/([a-z0-9-]+\.)*challenges\.cloudflare\.com\//.test(u || "");
    const cloudflareNoise = (m) => fromCloudflare(m.location().url) || /WebKitBlobResource|challenges\.cloudflare\.com" from accessing a frame/.test(m.text());
    page.on("console", (m) => { if (m.type() === "error" && !cloudflareNoise(m)) errs.push(m.text() + (m.location().url ? ` (${m.location().url.slice(0, 80)})` : "")); });
    page.on("requestfailed", (r) => { if (!fromCloudflare(r.url())) errs.push("request failed " + r.url()); });
    // The person check on the phone demo keeps a connection open, so that page never goes network idle.
    await page.goto(BASE + path, { waitUntil: path === "demos/phone.html" ? "load" : "networkidle" });
    await scrollThrough(page);
    const name = path || "index.html";

    errs.length ? fail(`${name} errors: ${errs.join("; ")}`) : ok(`${name} no errors`);

    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    over > 0 ? fail(`${name} overflows by ${over}px`) : ok(`${name} no horizontal overflow`);

    await page.addScriptTag({ url: AXE });
    const v = await page.evaluate(async () => {
      const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } });
      return r.violations.map((x) => `${x.id} (${x.nodes.length})`);
    });
    v.length ? fail(`${name} axe: ${v.join(", ")}`) : ok(`${name} axe clean`);

    const links = await page.evaluate(() => [...document.querySelectorAll("a[href]")]
      .map((a) => a.getAttribute("href"))
      .filter((h) => h && !/^(https?:|mailto:|tel:|#)/.test(h)));
    for (const href of [...new Set(links)]) {
      const res = await page.request.get(new URL(href, page.url()).href);
      if (!res.ok()) fail(`${name} link ${href} returns ${res.status()}`);
    }

    if (width === 1440) await seo(page, path, name);

    if (path === "" && mobile) {
      await page.click(".burger");
      const open = await page.evaluate(() => !document.getElementById("menu").hidden);
      await page.keyboard.press("Escape");
      const closed = await page.evaluate(() => document.getElementById("menu").hidden
        && document.activeElement.classList.contains("burger"));
      open && closed ? ok("menu opens, Escape closes, focus returns") : fail("mobile menu");
      const pins = await page.evaluate(() => window.ScrollTrigger ? ScrollTrigger.getAll().filter((s) => s.pin).length : 0);
      pins === 0 ? ok("rail is a scroll row on touch") : fail("rail pinned on touch");
    }
    if (path === "" && width === 1440) {
      const pinned = await page.evaluate(() => !!document.querySelector(".hscroll.pinned"));
      pinned ? ok("rail pins on desktop") : fail("rail did not pin at 1440x900");
      const painted = await page.evaluate(() => {
        const c = document.getElementById("hero-canvas");
        const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
        let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
        return n;
      });
      painted > 0 ? ok("hero network is drawing") : fail("hero canvas is blank");
    }
    await page.close();
  }
  await ctx.close();
}

console.log("\nSitemap");
{
  const ctx = await browser.newContext();
  const res = await ctx.request.get(BASE + "sitemap.xml");
  const listed = res.ok() ? [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]) : [];
  const missing = canonicals.filter((u) => !listed.includes(u));
  const extra = listed.filter((u) => !canonicals.includes(u));
  missing.length || extra.length || !res.ok()
    ? fail(`sitemap: missing ${missing.join(", ") || "none"}; not a page ${extra.join(", ") || "none"} (run python3 tools/sitemap.py)`)
    : ok(`sitemap lists exactly the ${listed.length} indexable pages`);
  await ctx.close();
}

console.log("\nJavaScript off");
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
  for (const path of PAGES) {
    const page = await ctx.newPage();
    await page.goto(BASE + path);
    const hidden = await page.evaluate(() => [...document.querySelectorAll("[data-reveal]")]
      .filter((e) => getComputedStyle(e).opacity !== "1").length);
    hidden ? fail(`${path || "index.html"} hides ${hidden} blocks`) : ok(`${path || "index.html"} all content visible`);
    await page.close();
  }
  await ctx.close();
}

console.log("\nReduced motion");
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  const r = await page.evaluate(() => ({
    pins: window.ScrollTrigger ? ScrollTrigger.getAll().length : 0,
    hidden: [...document.querySelectorAll("[data-reveal]")].filter((e) => getComputedStyle(e).opacity !== "1").length,
  }));
  const sample = () => page.evaluate(() => {
    const c = document.getElementById("hero-canvas");
    return c.toDataURL().length + ":" + c.toDataURL().slice(-40);
  });
  const a = await sample(); await page.waitForTimeout(500); const b = await sample();
  r.pins === 0 ? ok("no ScrollTrigger") : fail(`${r.pins} ScrollTriggers under reduced motion`);
  r.hidden === 0 ? ok("all content visible") : fail(`${r.hidden} blocks hidden`);
  a === b ? ok("hero network is a still frame") : fail("hero network animates under reduced motion");
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} failure(s)` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
