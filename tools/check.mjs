// Automated checks for every page: console errors, failed requests,
// horizontal overflow, axe (WCAG 2.1 A and AA plus best practice), JS off,
// reduced motion, the mobile menu, and the case study rail.
//
//   node tools/check.mjs                       # against a local preview on :8778
//   node tools/check.mjs https://darthkanaka.github.io/iterate-site/
//
// Needs Playwright, installed outside this repo so the site stays dependency
// free: `npm i playwright` in any scratch folder, then run with NODE_PATH
// pointing at that folder's node_modules. Exits non-zero on any failure.

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = (process.argv[2] || "http://localhost:8778/").replace(/\/?$/, "/");
const PAGES = ["", "what-we-do.html", "about.html", "contact.html", "terms.html"];
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

const browser = await chromium.launch();

for (const width of WIDTHS) {
  console.log(`\n${width}px`);
  const mobile = width < 600;
  const ctx = await browser.newContext({
    viewport: { width, height: mobile ? 844 : 900 },
    hasTouch: mobile, isMobile: mobile,
  });
  for (const path of PAGES) {
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    page.on("requestfailed", (r) => errs.push("request failed " + r.url()));
    await page.goto(BASE + path, { waitUntil: "networkidle" });
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
