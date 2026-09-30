// Full check of the inventory demo (demos/inventory.html) in a real browser.
//
//   1. Every control, driven the way a visitor would, on desktop and on a phone:
//      steppers, typing (including junk), the count editor (save, cancel, Enter,
//      Escape), the low-only filter, "Show the math", the covered list, tabs by
//      mouse and keyboard, Reset, and refresh. After each step the numbers on the
//      page are checked against hand-worked figures and the tested math.
//   2. axe (WCAG 2.1 A/AA and best practice), console errors, failed requests and
//      overflow on every tab and open state at 1440, 1024 and 390.
//   3. JS off, reduced motion.
//
//   node tools/check-inventory.mjs [base-url]      # default: local preview on :8778
//
// Needs Playwright outside the repo, same as tools/check.mjs (NODE_PATH).
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const playwright = require("playwright");
// BROWSER=webkit (Safari's engine) or BROWSER=firefox runs the same checks there. Firefox
// has no phone mode, so its "phone" runs are a narrow desktop window.
const ENGINE = process.env.BROWSER || "chromium";
const M = require("../assets/js/demos/inventory-math.js");
const D = require("../assets/js/demos/inventory-data.js");

const BASE = (process.argv[2] || "http://localhost:8778/").replace(/\/?$/, "/");
const URL = BASE + "demos/inventory.html";
const AXE = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.3/axe.min.js";

let failures = 0, passes = 0;
const fail = (msg) => { failures++; console.log("  FAIL " + msg); };
const ok = (msg) => { passes++; console.log("  ok   " + msg); };
const expect = (label, got, want) => (String(got) === String(want) ? ok(`${label}: ${want}`) : fail(`${label}: expected "${want}", got "${got}"`));
const money = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// What the page should show for a given plan and stock, from the unit-tested math.
function expected(plan, stock) {
  const lines = M.shoppingList(D.products, D.menu, plan, stock);
  const groups = M.bySupplier(lines, D.suppliers);
  const toBuy = lines.filter((l) => l.packs > 0);
  return { count: toBuy.length, total: M.round2(groups.reduce((t, g) => t + g.total, 0)), suppliers: groups.length, lines };
}

const browser = await playwright[ENGINE].launch();
if (ENGINE === "firefox") { const plain = browser.newContext.bind(browser); browser.newContext = ({ isMobile, ...o } = {}) => plain(o); }
console.log(`engine: ${ENGINE}`);

async function open(ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...ctxOpts });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("requestfailed", (r) => errors.push("request failed " + r.url()));
  await page.goto(URL, { waitUntil: "networkidle" });
  return { ctx, page, errors };
}
const txt = (page, sel) => page.locator(sel).first().innerText().then((t) => t.replace(/\s+/g, " ").trim());
const badge = (page) => txt(page, "#inv-count");
const strip = (page) => txt(page, "#week-strip-text");
async function buy(page, id) {
  const row = page.locator(`[data-buy="${id}"]`);
  if (!(await row.count())) return null;
  return { need: await txt(page, `[data-buy="${id}"] .buy-need`), qty: await txt(page, `[data-buy="${id}"] .qty`), cost: await txt(page, `[data-buy="${id}"] .cost`) };
}
const tab = (page, id) => page.click(`#inv-tab-${id}`);

// ── 1. functional, desktop ───────────────────────────────────────────────
console.log("\nfunctional, desktop 1280");
{
  const { ctx, page, errors } = await open();
  const plan = { ...D.plan }, stock = { ...D.stock };

  expect("opens on This week", await page.getAttribute("#inv-tab-week", "aria-selected"), "true");
  expect("shopping list badge", await badge(page), 10);
  expect("summary strip", await strip(page), "10 items to buy for $885.50 from 3 suppliers");
  expect("week total", await txt(page, "#week-total"), "$967.19");
  expect("cookies this week", await txt(page, '[data-weekcost="cookies"]'), "$156.44");
  expect("kalua pork cost to make one", await txt(page, 'tr:has([data-qty="kalua-pork"]) td:nth-child(3)'), "$2.65");

  // Plus button: cookies 120 to 300, the "try tripling the cookies" moment
  for (let i = 0; i < 18; i++) await page.click('[data-step="cookies"][data-dir="1"]');
  plan.cookies = 300;
  expect("cookies field after 18 taps of +", await page.inputValue("#qty-cookies"), "300");
  expect("cookies this week at 300", await txt(page, '[data-weekcost="cookies"]'), "$391.11");
  expect("badge after tripling cookies", await badge(page), 11);
  expect("strip after tripling cookies", await strip(page), "11 items to buy for $981.50 from 3 suppliers");
  await page.waitForTimeout(700);
  expect("status line announces it", await txt(page, "#inv-status"), "Shopping list updated. 11 items, $981.50.");

  // "See the shopping list" opens the list and moves focus to its tab
  await page.click('[data-act="open-list"]');
  expect("list tab selected", await page.getAttribute("#inv-tab-list", "aria-selected"), "true");
  expect("focus on the list tab", await page.evaluate(() => document.activeElement.id), "inv-tab-list");
  expect("week panel hidden", await page.isHidden("#inv-panel-week"), true);
  const chips = await buy(page, "chips");
  expect("chocolate chips now on the list", chips && chips.qty, "1 × 25 lb box");
  expect("chips cost", chips && chips.cost, "$96.00");
  expect("chips need", chips && chips.need, "Need 37.5 lb, have 18.75 lb");
  expect("wholesale subtotal", await txt(page, ".supplier:has(#sup-wholesale) .supplier-head span"), "$509.50");
  expect("list total", await txt(page, ".list-total"), "11 items, $981.50");

  // Show the math on sugar: three recipes behind one number
  await page.click('[data-why="sugar"]');
  expect("math open", await page.getAttribute('[data-why="sugar"]', "aria-expanded"), "true");
  const why = await page.locator("#why-sugar li").evaluateAll((lis) => lis.map((li) => [...li.children].map((c) => c.textContent.trim()).join(" | ")));
  expect("sugar lines", why.length, 6);
  expect("sugar from cookies", why[0], "Chocolate chip cookies, 300 × 0.1 lb | 30 lb");
  expect("sugar needed", why[3], "Needed this week | 49.5 lb");
  expect("sugar rounding", why[5], "Short, rounded up to whole bags | 1 × 25 lb bag");
  await page.click('[data-why="sugar"]');
  expect("math closes again", await page.isHidden("#why-sugar"), true);

  // Already covered
  await page.click(".covered summary");
  const covered = await page.locator(".covered li").evaluateAll((lis) => lis.map((li) => [...li.children].map((c) => c.textContent.trim()).join(" | ")));
  expect("covered count", covered.length, 5);
  expect("flour is covered", covered.includes("All-purpose flour | need 51 lb, have 75 lb"), true);

  // Typing: clear kalua pork, junk, negative, and over the top
  await tab(page, "week");
  await page.fill("#qty-kalua-pork", "0");
  plan["kalua-pork"] = 0;
  let e = expected(plan, stock);
  expect("badge with no kalua pork", await badge(page), e.count);
  await tab(page, "list");
  expect("pork off the list", await buy(page, "pork"), null);
  expect("list total with no kalua pork", await txt(page, ".list-total"), `${e.count} items, ${money(e.total)}`);
  await tab(page, "week");
  await page.click("#qty-mochi");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("abc");
  await page.keyboard.press("Tab");
  expect("junk in a field becomes 0", await page.inputValue("#qty-mochi"), "0");
  plan.mochi = 0;
  await page.fill("#qty-shoyu-chicken", "-40");
  await page.locator("#qty-shoyu-chicken").press("Tab");
  expect("negative becomes 0", await page.inputValue("#qty-shoyu-chicken"), "0");
  plan["shoyu-chicken"] = 0;
  await page.click('[data-step="shoyu-chicken"][data-dir="-1"]');
  expect("minus at 0 stays at 0", await page.inputValue("#qty-shoyu-chicken"), "0");
  await page.fill("#qty-cookies", "5000");
  await page.locator("#qty-cookies").press("Tab");
  expect("over the top caps at 999", await page.inputValue("#qty-cookies"), "999");
  plan.cookies = 999;
  e = expected(plan, stock);
  expect("badge after typing", await badge(page), e.count);
  expect("strip after typing", await strip(page), `${e.count} ${e.count === 1 ? "item" : "items"} to buy for ${money(e.total)} from ${e.suppliers} ${e.suppliers === 1 ? "supplier" : "suppliers"}`);

  // Reset puts everything back
  await page.click('[data-act="reset"]');
  expect("reset: badge", await badge(page), 10);
  expect("reset: cookies field", await page.inputValue("#qty-cookies"), "120");
  expect("reset: week total", await txt(page, "#week-total"), "$967.19");
  expect("reset: status line", await txt(page, "#inv-status"), "Demo reset. Everything is back the way it started.");
  Object.assign(plan, D.plan);

  // Counting stock: flour down to a quarter bag
  await tab(page, "stock");
  expect("stock summary", (await txt(page, "#inv-panel-stock .panel-head p")).endsWith("16 items, 9 low, 1 out."), true);
  await page.click('[data-count="flour"]');
  expect("count editor takes focus", await page.evaluate(() => document.activeElement.id), "cnt-whole");
  expect("editor starts at what's on the shelf", `${await page.inputValue("#cnt-whole")} + ${await page.inputValue("#cnt-frac")}`, "1 + 0.5");
  await page.fill("#cnt-whole", "0");
  await page.selectOption("#cnt-frac", "0.25");
  expect("live conversion while counting", await txt(page, "#cnt-eq"), "= 12.5 lb");
  await page.click('[data-act="save"]');
  stock.flour = 0.25;
  expect("flour row after save", await txt(page, '[data-row="flour"] .onhand'), "¼ bag 12.5 lb");
  expect("flour status after save", await txt(page, '[data-row="flour"] .pill'), "Low");
  expect("focus returns to Count", await page.evaluate(() => document.activeElement.dataset.count), "flour");
  e = expected(plan, stock);
  expect("badge after counting flour", await badge(page), e.count);
  expect("status line after counting", await txt(page, "#inv-status"), `All-purpose flour counted at ¼ bag. Shopping list is ${e.count} items, ${money(e.total)}.`);
  await tab(page, "list");
  const flour = await buy(page, "flour");
  expect("flour now on the list", flour && `${flour.need} | ${flour.qty} | ${flour.cost}`, "Need 20.4 lb, have 12.5 lb | 1 × 50 lb bag | $32.00");

  // Enter saves, Escape cancels
  await tab(page, "stock");
  await page.click('[data-count="pork"]');
  await page.fill("#cnt-whole", "1");
  await page.locator("#cnt-whole").press("Enter");
  stock.pork = 1;
  expect("Enter saves the count", await txt(page, '[data-row="pork"] .onhand-packs'), "1 case");
  expect("pork status now OK", await txt(page, '[data-row="pork"] .pill'), "OK");
  await page.click('[data-count="chicken"]');
  await page.fill("#cnt-whole", "9");
  await page.locator("#cnt-whole").press("Escape");
  expect("Escape cancels the count", await txt(page, '[data-row="chicken"] .onhand-packs'), "½ case");
  await page.click('[data-count="chicken"]');
  await page.fill("#cnt-whole", "7");
  await page.click('[data-act="cancel"]');
  expect("Cancel leaves it alone", await txt(page, '[data-row="chicken"] .onhand-packs'), "½ case");
  e = expected(plan, stock);
  await tab(page, "list");
  expect("pork covered after count", await buy(page, "pork"), null);
  expect("list total after counts", await txt(page, ".list-total"), `${e.count} items, ${money(e.total)}`);

  // Low and out filter
  await tab(page, "stock");
  const lowOut = D.products.filter((p) => M.status(stock[p.id] || 0, p.par) !== "ok").length;
  await page.check('[data-act="lowonly"]');
  expect("low-only filter", await page.locator("#inv-panel-stock tbody tr").count(), lowOut);
  expect("filter keeps focus", await page.evaluate(() => document.activeElement.dataset.act), "lowonly");
  await page.uncheck('[data-act="lowonly"]');
  expect("filter off shows all", await page.locator("#inv-panel-stock tbody tr").count(), 16);

  // Tabs by keyboard
  await page.focus("#inv-tab-stock");
  await page.keyboard.press("ArrowRight");
  expect("ArrowRight selects This week", await page.getAttribute("#inv-tab-week", "aria-selected"), "true");
  await page.keyboard.press("End");
  expect("End selects Shopping list", await page.evaluate(() => document.activeElement.id), "inv-tab-list");
  await page.keyboard.press("ArrowRight");
  expect("ArrowRight wraps to Stock", await page.evaluate(() => document.activeElement.id), "inv-tab-stock");
  await page.keyboard.press("ArrowLeft");
  expect("ArrowLeft wraps to Shopping list", await page.getAttribute("#inv-tab-list", "aria-selected"), "true");
  expect("only one tab in the Tab order", await page.locator('[role="tab"][tabindex="0"]').count(), 1);

  // Refresh starts over (nothing is saved)
  await page.reload({ waitUntil: "networkidle" });
  expect("refresh: badge back to 10", await badge(page), 10);
  await tab(page, "stock");
  expect("refresh: flour back to 1½ bags", await txt(page, '[data-row="flour"] .onhand-packs'), "1½ bags");

  errors.length ? fail("console or request errors: " + errors.join(" | ")) : ok("no console errors or failed requests");
  await ctx.close();
}

// ── 1b. functional, phone ─────────────────────────────────────────────────
console.log("\nfunctional, phone 390 (touch)");
{
  const { ctx, page, errors } = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (let i = 0; i < 18; i++) await page.tap('[data-step="cookies"][data-dir="1"]');
  expect("tapping + triples cookies", await page.inputValue("#qty-cookies"), "300");
  expect("badge follows on a phone", await badge(page), 11);
  await page.tap('[data-act="open-list"]');
  expect("chips on the list on a phone", (await buy(page, "chips"))?.qty, "1 × 25 lb box");
  await page.tap("#inv-tab-stock");
  await page.tap('[data-count="sugar"]');
  await page.fill("#cnt-whole", "3");
  await page.tap('[data-act="save"]');
  expect("count saved on a phone", await txt(page, '[data-row="sugar"] .onhand-packs'), "3 bags");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  overflow > 1 ? fail(`phone overflow ${overflow}px`) : ok("no sideways scroll on a phone");
  errors.length ? fail("errors: " + errors.join(" | ")) : ok("no console errors");
  await ctx.close();
}

// ── 2. axe and page health in every state ─────────────────────────────────
const STATES = [
  ["This week", async () => {}],
  ["Shopping list with math and covered open", async (p) => { await p.click("#inv-tab-list"); await p.click('[data-why="sugar"]'); await p.click(".covered summary"); }],
  ["Stock", async (p) => { await p.click("#inv-tab-stock"); }],
  ["Stock with the count editor open", async (p) => { await p.click("#inv-tab-stock"); await p.click('[data-count="flour"]'); }],
  ["Stock, low and out only", async (p) => { await p.click("#inv-tab-stock"); await p.check('[data-act="lowonly"]'); }],
  ["Nothing to buy", async (p) => { for (const m of D.menu) await p.fill(`#qty-${m.id}`, "0"); await p.click("#inv-tab-list"); }],
];
for (const width of [1440, 1024, 390]) {
  console.log(`\naxe and health, ${width}px`);
  for (const [label, act] of STATES) {
    const { ctx, page, errors } = await open({ viewport: { width, height: 900 }, isMobile: width < 600, hasTouch: width < 600 });
    await act(page);
    await page.waitForTimeout(400);
    await page.addScriptTag({ url: AXE });
    const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } })).violations.map((x) => `${x.id} x${x.nodes.length} (${x.nodes[0].target.join(" ")})`));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const problems = [...v, ...errors, ...(overflow > 1 ? [`overflow ${overflow}px`] : [])];
    problems.length ? fail(`${label}: ${problems.join(" | ")}`) : ok(label);
    await ctx.close();
  }
}

// ── 3. JS off and reduced motion ──────────────────────────────────────────
console.log("\nJS off and reduced motion");
{
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(URL);
  (await page.locator(".demo-nojs").isVisible()) ? ok("JS off: the explanation shows") : fail("JS off: no explanation");
  (await page.locator("h1").isVisible()) && (await page.locator(".why-grid").isVisible()) ? ok("JS off: intro and why panel still read") : fail("JS off: page content missing");
  await ctx.close();
}
{
  const { ctx, page } = await open({ reducedMotion: "reduce" });
  await page.click('[data-step="cookies"][data-dir="1"]');
  await page.click('[data-act="open-list"]');
  await page.waitForTimeout(300);
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
  running === 0 ? ok("reduced motion: nothing animating") : fail(`reduced motion: ${running} animations running`);
  await ctx.close();
}

await browser.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
