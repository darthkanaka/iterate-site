// Full check of the handyman team app demo (demos/handyman.html) in a real browser.
//
//   1. Both sides of every flow, driven the way a visitor would: ask Kai with the quick
//      questions and by typing (including an empty question, a question it doesn't know,
//      and typed HTML); on the pay sheet assign the open invoice, reopen a line and correct
//      its labor, finalize, mark paid, and leave a note; as Malia read My pay, answer the
//      office and walk a field guide from start to finish; then see her note on the pay
//      sheet. Reset, refresh, and the main flow again on a phone with taps. Pay figures are
//      checked against hand-worked numbers.
//   2. axe (WCAG 2.1 A/AA and best practice), console errors, failed requests and
//      overflow in every view and open state at 1440, 1024 and 390.
//   3. JS off, reduced motion.
//
//   node tools/check-handyman.mjs [base-url]      # default: local preview on :8778
//
// Needs Playwright outside the repo, same as tools/check.mjs (NODE_PATH).
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const playwright = require("playwright");
// BROWSER=webkit (Safari's engine) or BROWSER=firefox runs the same checks there. Firefox
// has no phone mode, so its "phone" runs are a narrow desktop window.
const ENGINE = process.env.BROWSER || "chromium";

const BASE = (process.argv[2] || "http://localhost:8778/").replace(/\/?$/, "/");
const URL = BASE + "demos/handyman.html";
const AXE = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.3/axe.min.js";

let failures = 0, passes = 0;
const fail = (msg) => { failures++; console.log("  FAIL " + msg); };
const ok = (msg) => { passes++; console.log("  ok   " + msg); };
const expect = (label, got, want) => (String(got) === String(want) ? ok(`${label}: ${want}`) : fail(`${label}: expected "${want}", got "${got}"`));

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
  page.on("dialog", (d) => { errors.push("a dialog opened: " + d.message()); d.dismiss(); });
  await page.goto(URL, { waitUntil: "networkidle" });
  return { ctx, page, errors };
}
const clean = (t) => t.replace(/\s+/g, " ").trim();
const txt = (page, sel) => page.locator(sel).first().innerText().then(clean);
// The text a sighted visitor reads: screen-reader-only text removed, a space between elements.
const seen = (el) => { const c = el.cloneNode(true); c.querySelectorAll(".sr-only").forEach((s) => s.remove()); c.querySelectorAll("*").forEach((n) => { n.prepend(" "); n.append(" "); }); return c.textContent.replace(/\s+/g, " ").trim(); };
const visible = (page, sel) => page.locator(sel).first().evaluate(new Function("el", `return (${seen.toString()})(el);`));
const all = (page, sel) => page.locator(sel).evaluateAll(new Function("els", `return els.map((el) => (${seen.toString()})(el));`));
const menu = (page) => page.locator(".portal-link").evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, " ").trim()).join(" / "));
const statusLine = (page) => txt(page, "#hm-status");
const active = (page) => page.evaluate(() => { const a = document.activeElement; const d = a.dataset || {}; return a.id || d.guide || d.final || d.paid || d.paidall || d.note || d.technote || d.card || a.className; });
const lastAnswer = async (page) => { await page.waitForSelector(".msg-kai:last-child:not(.is-pending)"); return txt(page, ".msg-kai:last-child .msg-body"); };

// ── 1. functional, desktop ───────────────────────────────────────────────
console.log("\nfunctional, desktop 1280");
{
  const { ctx, page, errors } = await open();

  // Kai
  expect("starts as Leilani", await page.getAttribute('[data-as="owner"]', "aria-pressed"), "true");
  expect("her menu", await menu(page), "Kai, the assistant / Tech pay 2 , 2 need you / Field guides");
  expect("Kai says aloha", await txt(page, ".msg-kai .msg-body"), "Aloha, Leilani. What do you need?");
  await page.click('[data-prompt="What\'s on today?"]');
  expect("the question shows", await txt(page, ".msg-you .msg-body"), "What's on today?");
  expect("Kai shows what it's checking", await txt(page, ".msg-kai.is-pending .item-sub"), "Looking that up");
  expect("buttons wait while it looks", await page.isDisabled('[data-prompt="Who owes us money?"]'), true);
  await lastAnswer(page);
  expect("what it checked", (await all(page, ".msg-kai:last-child .lookups li")).join(" | "), "✓ Checked today's schedule | ✓ Checked who's free");
  expect("today's visits in a table", await page.locator(".msg-kai:last-child .answer-table tbody tr").count(), 6);
  expect("status line", await statusLine(page), "Kai answered. The answer is at the bottom of the conversation.");
  expect("buttons come back", await page.isDisabled('[data-prompt="Who owes us money?"]'), false);
  await page.fill("#ask-input", "who owes us money");
  await page.press("#ask-input", "Enter");
  await lastAnswer(page);
  expect("a typed question works", await txt(page, ".msg-kai:last-child .answer-table tbody tr:first-child"), "#631 Blue Pier Realty $486 21 days, past due");
  expect("the box clears and keeps focus", `${await page.inputValue("#ask-input")}|${await active(page)}`, "|ask-input");
  await page.click(".ask button");
  expect("an empty question asks for one", await statusLine(page), "Type a question for Kai first.");
  await page.fill("#ask-input", "Is this thing on?");
  await page.press("#ask-input", "Enter");
  expect("something it doesn't know", (await lastAnswer(page)).startsWith("✓ Searched everything I'm the demo version"), true);
  await page.fill("#ask-input", '<img src=x onerror="document.title=1">');
  await page.press("#ask-input", "Enter");
  await lastAnswer(page);
  expect("typed HTML shows as text", await txt(page, ".msg-you:nth-last-child(2) .msg-body"), '<img src=x onerror="document.title=1">');
  expect("and makes no element", await page.locator(".chat img").count(), 0);

  // Tech pay
  await page.click('[data-view="pay"]');
  expect("opening the sheet reads Jordan's note", await menu(page), "Kai, the assistant / Tech pay 1 , 1 need you / Field guides");
  expect("Jordan's note on his line", await visible(page, '[data-row="r7"] .row-note-tech'), "Jordan: Was the second trip for the boards counted?");
  expect("pay cards", (await all(page, ".pay-card .pay-amount")).join(" | "), "$285.25 | $297.50 | $353.40 | $255.50");
  expect("week total", await txt(page, "#pay-total"), "$1,191.65");
  expect("Paid waits until a line is final", await page.isDisabled('[data-paid="r8"]'), true);
  await page.click('[data-assign="r10"]');
  expect("assigning needs a name", await statusLine(page), "Pick who did the job first.");
  await page.selectOption("#assign-r10", "malia");
  await page.click('[data-assign="r10"]');
  expect("assigned", await statusLine(page), "#649 is on Malia's pay now, $63.00.");
  expect("Malia's card", await txt(page, '[data-card="malia"] .pay-amount'), "$348.25");
  expect("total with it", await txt(page, "#pay-total"), "$1,254.65");
  expect("nothing left to assign", await page.locator("#needs-title").count(), 0);
  expect("badge clears", await menu(page), "Kai, the assistant / Tech pay / Field guides");
  await page.click('[data-final="r5"]');
  expect("reopen a final line", await statusLine(page), "#645 is open again.");
  await page.fill("#labor-r5", "300");
  expect("pay follows the labor", await visible(page, '[data-pay="r5"]'), "$105.00 35%");
  expect("so does Noa's card", await txt(page, '[data-card="noa"] .pay-amount'), "$315.00");
  expect("and the total", await txt(page, "#pay-total"), "$1,272.15");
  await page.press("#labor-r5", "Tab");
  expect("the change is marked", await txt(page, '[data-row="r5"] td:nth-child(3) .item-sub'), "edited, invoice says $250.00");
  await page.click('[data-final="r5"]');
  expect("final again", await page.getAttribute('[data-final="r5"]', "aria-pressed"), "true");
  await page.click('[data-finalall="jordan"]');
  expect("finalize Jordan", await statusLine(page), "All of Jordan's lines are final.");
  expect("focus lands on his next step", await active(page), "jordan");
  await page.click('[data-finalall="malia"]');
  await page.click('[data-paidall="malia"]');
  expect("Malia paid", await statusLine(page), "Malia is paid, $348.25. They see it on My pay.");
  expect("her card says so", await txt(page, '[data-card="malia"] .pill'), "Paid");
  expect("every Malia line is paid", (await page.locator('[data-row] [data-paid][aria-pressed="true"]').count()), 4);
  await page.click('[data-note="r1"]');
  expect("note box takes focus", await active(page), "office-note");
  await page.fill("#office-note", "Great work on this one.");
  await page.click('[data-form="office-note"] button[type="submit"]');
  expect("note saved", await statusLine(page), "Note saved. Malia sees it on My pay.");
  expect("note on the line", await visible(page, '[data-row="r1"] .row-note'), "You: Great work on this one.");
  await page.click('[data-note="r3"]');
  await page.click('[data-act="cancel-note"]');
  expect("Cancel returns focus", await active(page), "r3");

  // Field guides from the office
  await page.click('[data-view="guides"]');
  expect("six guides", await page.locator(".guide-card").count(), 6);
  await page.fill("#guide-search", "door");
  expect("search", (await all(page, ".guide-card .item-name")).join(" | "), "Lanai screen re-screen | Interior door hang and adjust");
  await page.fill("#guide-search", "zzz");
  expect("no match", await txt(page, "#guide-list .list-empty"), "No guide matches that. Try a word like fan, door or leak.");
  await page.fill("#guide-search", "");

  // Malia
  await page.click('[data-as="tech"]');
  expect("Malia's menu with updates", await menu(page), "Field guides / My pay 3 , 3 new updates");
  await page.click('[data-view="mypay"]');
  expect("the badge clears", await menu(page), "Field guides / My pay");
  expect("her pay", await txt(page, "#my-pay"), "$348.25");
  expect("her lines", await page.locator(".mypay-row").count(), 4);
  expect("paid and final", (await all(page, '[data-row="r10"] .req-pills')).join(""), "Paid Final");
  expect("the office's notes", (await all(page, ".mypay-row .row-note")).join(" | "), "Office: Great work on this one. | Office: Customer paid cash for the hinge, so it isn't on the invoice.");
  await page.click('[data-technote="r3"]');
  expect("note box takes focus", await active(page), "tech-note");
  await page.fill("#tech-note", "Two of the three units needed longer anchors.");
  await page.click('[data-form="tech-note"] button[type="submit"]');
  expect("sent", await statusLine(page), "Sent. Leilani sees your note on the pay sheet.");
  expect("her note on the line", await visible(page, '[data-row="r3"] .row-note-tech'), "You: Two of the three units needed longer anchors.");

  // A field guide, start to finish
  await page.click('[data-view="guides"]');
  await page.click('[data-guide="g2"]');
  expect("guide opens on the job", await txt(page, "#view-title + p"), "Plumbing · step 1 of 5, the job");
  expect("the flat-rate price", await txt(page, ".price-base"), "$160 flat, disposal not included");
  await page.click('[data-stage="1"]');
  expect("Next moves focus to the stage", await active(page), "stage-title");
  expect("gear checklist", await page.locator(".checklist input").count(), 7);
  await page.check("#chk-tools-0");
  await page.click('[data-stage="2"]');
  expect("safety checklist", await page.locator(".checklist input").count(), 2);
  await page.click('[data-stage="3"]');
  expect("steps start at zero", await txt(page, "#steps-count"), "0 of 4 steps done");
  for (let i = 0; i < 4; i++) await page.check(`#chk-steps-${i}`);
  expect("every step checked", await txt(page, "#steps-count"), "4 of 4 steps done");
  expect("the bar is full", await page.locator("#steps-bar").evaluate((b) => `${b.value}/${b.max}`), "4/4");
  await page.click('.stage-nav [data-stage="1"]');
  expect("checks are kept", await page.isChecked("#chk-tools-0"), true);
  expect("done stages are marked", await page.locator(".stage-btn.is-done").count(), 1);
  await page.click('.stage-nav [data-stage="4"]');
  await page.click('[data-act="finish"]');
  expect("finished", await statusLine(page), "Garbage disposal install finished. Nice work.");
  expect("marked done today", await txt(page, '[data-guide="g2"] .pill'), "Done today");
  expect("focus on that guide", await active(page), "g2");

  // Leilani sees Malia's note
  await page.click('[data-as="owner"]');
  expect("a badge for the note", await menu(page), "Kai, the assistant / Tech pay 1 , 1 need you / Field guides");
  await page.click('[data-view="pay"]');
  expect("the note on the sheet", await visible(page, '[data-row="r3"] .row-note-tech'), "Malia: Two of the three units needed longer anchors.");

  // Reset and refresh
  await page.click('[data-act="reset"]');
  expect("reset", await statusLine(page), "Demo reset. Everything is back the way it started.");
  expect("reset menu", await menu(page), "Kai, the assistant / Tech pay 2 , 2 need you / Field guides");
  await page.click('[data-view="pay"]');
  expect("reset total", await txt(page, "#pay-total"), "$1,191.65");
  await page.reload({ waitUntil: "networkidle" });
  expect("refresh starts with an empty chat", await page.locator(".msg").count(), 1);

  errors.length ? fail("errors: " + errors.join(" | ")) : ok("no console errors, failed requests or dialogs");
  await ctx.close();
}

// ── 1b. functional, phone ─────────────────────────────────────────────────
console.log("\nfunctional, phone 390 (touch)");
{
  const { ctx, page, errors } = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.tap('[data-prompt="What should I do first?"]');
  expect("asked on a phone", (await lastAnswer(page)).includes("Here's your morning, in order"), true);
  await page.tap('[data-view="pay"]');
  await page.selectOption("#assign-r10", "ikaika");
  await page.tap('[data-assign="r10"]');
  expect("assigned on a phone", await statusLine(page), "#649 is on Ikaika's pay now, $63.00.");
  await page.tap('[data-as="tech"]');
  await page.tap('[data-guide="g5"]');
  await page.tap('[data-stage="1"]');
  expect("a guide on a phone", await txt(page, "#stage-title"), "Gear");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  overflow > 1 ? fail(`phone overflow ${overflow}px`) : ok("no sideways scroll on a phone");
  errors.length ? fail("errors: " + errors.join(" | ")) : ok("no console errors");
  await ctx.close();
}

// ── 2. axe and page health in every view ──────────────────────────────────
const answered = async (p, prompt) => { await p.click(`[data-prompt="${prompt}"]`); await p.waitForSelector(".msg-kai:last-child:not(.is-pending)"); };
const STATES = [
  ["Kai, a table answer", (p) => answered(p, "Who owes us money?")],
  ["Kai, a list answer", (p) => answered(p, "What should I do first?")],
  ["Tech pay", async (p) => { await p.click('[data-view="pay"]'); }],
  ["Tech pay, a line reopened and a note open", async (p) => { await p.click('[data-view="pay"]'); await p.click('[data-final="r1"]'); await p.click('[data-note="r2"]'); }],
  ["Field guides", async (p) => { await p.click('[data-view="guides"]'); }],
  ["A guide, the job", async (p) => { await p.click('[data-view="guides"]'); await p.click('[data-guide="g1"]'); }],
  ["A guide, steps half done", async (p) => { await p.click('[data-view="guides"]'); await p.click('[data-guide="g1"]'); await p.click('.stage-nav [data-stage="3"]'); await p.check("#chk-steps-0"); await p.check("#chk-steps-1"); }],
  ["Malia, My pay with a note open", async (p) => { await p.click('[data-as="tech"]'); await p.click('[data-view="mypay"]'); await p.click('[data-technote="r2"]'); }],
  ["Malia, guides with no match", async (p) => { await p.click('[data-as="tech"]'); await p.fill("#guide-search", "zzz"); }],
];
for (const width of [1440, 1024, 390]) {
  console.log(`\naxe and health, ${width}px`);
  for (const [label, act] of STATES) {
    const { ctx, page, errors } = await open({ viewport: { width, height: 900 }, isMobile: width < 600, hasTouch: width < 600 });
    try { await act(page); } catch (e) { errors.push("step failed: " + e.message.split("\n")[0]); }
    await page.waitForTimeout(400); // let hover colours and the sticky nav finish before measuring contrast
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
  (await page.locator(".demo-try").isVisible()) && (await page.locator(".why-grid").isVisible()) ? ok("JS off: intro and why panel still read") : fail("JS off: page content missing");
  await ctx.close();
}
{
  const { ctx, page } = await open({ reducedMotion: "reduce" });
  await page.click('[data-prompt="Any open requests?"]');
  await page.waitForTimeout(50);
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
  running === 0 ? ok("reduced motion: nothing animating while Kai looks") : fail(`reduced motion: ${running} animations running`);
  await ctx.close();
}

await browser.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
