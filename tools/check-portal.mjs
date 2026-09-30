// Full check of the team portal demo (demos/portal.html) in a real browser.
//
//   1. Both sides of every flow, driven the way a visitor would: Jesse calls out of a
//      shift; Mele fixes a double-booking, covers two shifts, adds one (with the "ends
//      before it starts" error) and cancels an edit; Jesse sees each change as an update;
//      he sends an invoice built from his worked shifts with a longer day and an expense;
//      Mele sends it back; he fixes and resubmits; she approves it and it lands in Finance
//      (month, quarter and year to date), and the CSV export matches. Also the "save the
//      new rate?" path, typed HTML shown as text, Reset and refresh, and the main flow on
//      a phone with taps. Numbers are checked against hand-worked figures.
//   2. axe (WCAG 2.1 A/AA and best practice), console errors, failed requests and
//      overflow in every view and open state at 1440, 1024 and 390.
//   3. JS off, reduced motion.
//
//   node tools/check-portal.mjs [base-url]      # default: local preview on :8778
//
// Needs Playwright outside the repo, same as tools/check.mjs (NODE_PATH).
import { createRequire } from "module";
import fs from "fs";
const require = createRequire(import.meta.url);
const playwright = require("playwright");
// BROWSER=webkit (Safari's engine) or BROWSER=firefox runs the same checks there. Firefox
// has no phone mode, so its "phone" runs are a narrow desktop window.
const ENGINE = process.env.BROWSER || "chromium";

const BASE = (process.argv[2] || "http://localhost:8778/").replace(/\/?$/, "/");
const URL = BASE + "demos/portal.html";
const AXE = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.3/axe.min.js";

let failures = 0, passes = 0;
const fail = (msg) => { failures++; console.log("  FAIL " + msg); };
const ok = (msg) => { passes++; console.log("  ok   " + msg); };
const expect = (label, got, want) => (String(got) === String(want) ? ok(`${label}: ${want}`) : fail(`${label}: expected "${want}", got "${got}"`));

const browser = await playwright[ENGINE].launch();
if (ENGINE === "firefox") { const plain = browser.newContext.bind(browser); browser.newContext = ({ isMobile, ...o } = {}) => plain(o); }
console.log(`engine: ${ENGINE}`);
async function open(ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, ...ctxOpts });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("requestfailed", (r) => { if (!r.url().startsWith("blob:")) errors.push("request failed " + r.url()); });
  page.on("dialog", (d) => { errors.push("a dialog opened: " + d.message()); d.dismiss(); });
  await page.goto(URL, { waitUntil: "networkidle" });
  return { ctx, page, errors };
}
const clean = (t) => t.replace(/\s+/g, " ").trim();
const txt = (page, sel) => page.locator(sel).first().innerText().then(clean);
const all = (page, sel) => page.locator(sel).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, " ").trim()));
const menu = (page) => all(page, ".portal-link").then((a) => a.join(" / "));
const totals = (page) => all(page, "#inv-totals div").then((a) => a.join(" | "));
const statusLine = (page) => txt(page, "#portal-status");
const as = (page, who) => page.click(`[data-as="${who}"]`);
const go = (page, view) => page.click(`[data-view="${view}"]`);
const active = (page) => page.evaluate(() => { const a = document.activeElement; return a.id || (a.dataset && (a.dataset.edit || a.dataset.cant || a.dataset.review || a.dataset.range || a.dataset.schedview || a.dataset.pick)) || a.className; });
const stat = (page, id) => txt(page, `#fin-${id}`);
const chipText = (page, sel) => page.locator(sel).first().evaluate((c) => `${c.querySelector(".chip-time").textContent} ${c.querySelector(".chip-proj").textContent}`);

// ── 1. functional, desktop ───────────────────────────────────────────────
console.log("\nfunctional, desktop 1280");
{
  const { ctx, page, errors } = await open();

  // Jesse's week
  expect("starts as Jesse", await page.getAttribute('[data-as="member"]', "aria-pressed"), "true");
  expect("Jesse's menu", await menu(page), "My schedule / My invoices");
  expect("six shifts this week", await page.locator(".shift-row").count(), 6);
  expect("week total", await txt(page, ".week-total"), "44 h scheduled this week");
  expect("calendar sync badge", (await txt(page, ".sync-live")).startsWith("Google Calendar sync"), true);
  expect("its dot is pulsing", await page.evaluate(() => document.getAnimations().some((a) => a.animationName === "live" && a.playState === "running")), true);
  await page.click('[data-cant="S6"]');
  expect("the note field takes focus", await active(page), "cant-note");
  await page.click('[data-act="cancel-cant"]');
  expect("Cancel returns focus", await active(page), "S6");
  await page.click('[data-cant="S6"]');
  await page.fill("#cant-note", "Dentist appointment I forgot about.");
  await page.click('[data-form="cant"] button[type="submit"]');
  expect("Friday waits on cover", await txt(page, '[data-shift="S6"] .shift-what'), "Fall campaign Waiting on cover");
  expect("status line", await statusLine(page), "Sent. Mele sees it on the schedule board and gets a phone notification.");
  await go(page, "invoices");

  // Mele's board
  await as(page, "owner");
  expect("Mele's menu", await menu(page), "Schedule board 4 , 4 need you / Approvals 1 , 1 waiting / Finance");
  expect("what needs her", (await all(page, ".attention li > span")).join(" | "),
    "Jesse is double-booked on Wed, Aug 19. | Jesse can't make Fri, Aug 21: “Dentist appointment I forgot about.” | Noelani can't make Thu, Aug 20: “Family thing came up, sorry for the short notice.” | Jesse is scheduled for 44 h this week, over 40.");
  expect("board total", await txt(page, ".board-total"), "Scheduled this week, $5,840.00 in contractor pay before GET.");
  expect("sync badge on the board", (await txt(page, ".sync-live")).startsWith("Google Calendar sync"), true);
  expect("Jesse over 40", await txt(page, "tbody tr:first-child .week-cell"), "44 h Over 40 $2,420.00");

  // Fix the double-booking by deleting the Wednesday campaign shift
  await page.click('.chip[data-edit="S3"]');
  expect("editor heading", await txt(page, "#ed-title"), "Change Jesse's shift on Wed, Aug 19");
  expect("the editor takes focus", await active(page), "ed-title");
  await page.click('[data-act="delete-shift"]');
  expect("deleted", await statusLine(page), "Shift deleted. It's off Jesse's Google Calendar too.");
  expect("two things left", await txt(page, "#att-title"), "2 things need you");
  expect("board total after delete", await txt(page, ".board-total strong"), "$5,400.00");

  // Cover Noelani's Thursday with Sam, from the attention list
  await page.click('.attention [data-edit="S10"]');
  expect("cover hint", await txt(page, ".editor .item-sub"), "Noelani can't make this one. Pick who covers it and save.");
  await page.selectOption("#ed-person", "sam");
  await page.click('[data-form="shift"] button[type="submit"]');
  expect("saved and synced", await statusLine(page), "Saved. Sam's Google Calendar is updated and their phone gets the usual alert.");
  expect("focus on the moved shift", await active(page), "S10");
  expect("Sam has Thursday now", await chipText(page, "tbody tr:nth-child(3) td:nth-child(5) .chip"), "9a–5p Website refresh");

  // Cover Jesse's Friday with Noelani
  await page.click('.chip[data-edit="S6"]');
  await page.selectOption("#ed-person", "noelani");
  await page.click('[data-form="shift"] button[type="submit"]');
  expect("all clear", await txt(page, ".all-clear"), "Nothing needs you right now. The week is covered.");
  expect("board total after covering", await txt(page, ".board-total strong"), "$5,340.00");

  // Add a Saturday shift for Jesse, with the ends-before-it-starts error first
  await page.click('[data-add="jesse|2026-08-22"]');
  expect("add heading", await txt(page, "#ed-title"), "Add a shift");
  await page.selectOption("#ed-start", "08:00");
  await page.selectOption("#ed-end", "07:00");
  await page.click('[data-form="shift"] button[type="submit"]');
  expect("end before start shows the error", await page.isVisible("#ed-end-error"), true);
  expect("the field is marked invalid", await page.getAttribute("#ed-end", "aria-invalid"), "true");
  await page.selectOption("#ed-end", "14:00");
  expect("changing the time clears the error", await page.isHidden("#ed-end-error"), true);
  await page.selectOption("#ed-project", "Launch video");
  await page.click('[data-form="shift"] button[type="submit"]');
  expect("new shift on Saturday", await chipText(page, 'tbody tr:first-child td:nth-child(7) .chip'), "8a–2p Launch video");
  expect("board total with Saturday", await txt(page, ".board-total strong"), "$5,670.00");
  await page.click('.chip[data-edit="S1"]');
  await page.click('[data-act="cancel-edit"]');
  expect("Cancel closes the editor", await page.locator(".editor").count(), 0);
  expect("and focus goes back to the shift", await active(page), "S1");
  expect("the board badge is gone", await menu(page), "Schedule board / Approvals 1 , 1 waiting / Finance");

  // Jesse sees every change
  await as(page, "member");
  expect("an update badge while he's on invoices", await menu(page), "My schedule 3 , 3 new updates / My invoices");
  await go(page, "schedule");
  expect("the badge clears", await menu(page), "My schedule / My invoices");
  expect("updates, newest first", (await all(page, ".updates li")).join(" | "),
    "Mele added a shift for you on Sat, Aug 22, 8:00 AM to 2:00 PM. Your Google Calendar is updated. | Mele moved your Fri, Aug 21 shift to Noelani. Your Google Calendar is updated. | Mele removed your Wed, Aug 19 shift, 9:00 AM to 5:00 PM. Your Google Calendar is updated.");
  expect("his week now", await txt(page, ".week-total"), "38 h scheduled this week");

  // His invoice, built from the shifts he worked
  await go(page, "invoices");
  expect("built from 11 shifts", await page.locator(".worked tbody tr").count(), 11);
  expect("arrives filled in", await totals(page), "Hours 82 h | Labor $4,510.00 | Expenses $0.00 | Hawaiʻi GET $212.51 | Total $4,722.51");
  await page.fill("#worked-9", "9.5");
  expect("a longer Thursday", await totals(page), "Hours 83.5 h | Labor $4,592.50 | Expenses $0.00 | Hawaiʻi GET $216.40 | Total $4,808.90");
  await page.click('[data-act="add-exp"]');
  expect("new expense takes focus", await active(page), "exp-desc-0");
  await page.fill("#exp-desc-0", "Props for the shoot");
  await page.fill("#exp-amt-0", "35");
  expect("with the expense", await totals(page), "Hours 83.5 h | Labor $4,592.50 | Expenses $35.00 | Hawaiʻi GET $218.05 | Total $4,845.55");
  await page.click('[data-act="add-exp"]');
  await page.click('[data-remove-exp="1"]');
  expect("remove an expense", await page.locator(".expense").count(), 1);
  await page.click('[data-form="invoice"] button[type="submit"]');
  expect("sent", await statusLine(page), "JT-20260817-1 sent to Mele for approval, $4,845.55.");
  expect("waiting", await txt(page, ".inv-card .req-top"), "JT-20260817-1 · Aug 3 to Aug 16, 2026 Waiting on Mele");

  // Mele reviews it and sends it back
  await as(page, "owner");
  await go(page, "approvals");
  expect("two waiting", await page.locator("[data-review]").count(), 2);
  await page.click('[data-review="JT-20260817-1"]');
  const lines = await page.locator(".inv-lines tr").evaluateAll((rows) => rows.map((r) => [...r.cells].map((c) => c.innerText.trim()).join(" = ")));
  expect("invoice lines", lines.slice(1).join(" | "), "Fall campaign, 61.5 h × $55.00 = $3,382.50 | Launch video, 22 h × $55.00 = $1,210.00 | Expense, Props for the shoot = $35.00 | Subtotal = $4,627.50 | Hawaiʻi GET 4.712% = $218.05 | Total = $4,845.55");
  expect("the changed day is called out", await txt(page, ".changes li"), "Thu, Aug 13, Fall campaign: 8 h scheduled, 9.5 h worked");
  await page.click('[data-form="sendback"] button[type="submit"]');
  expect("sending back needs a note", await page.isVisible("#sb-note-error"), true);
  await page.fill("#sb-note", "Thursday was 8 hours on the schedule. Can you check it?");
  await page.click('[data-form="sendback"] button[type="submit"]');
  expect("sent back", await statusLine(page), "Sent JT-20260817-1 back to Jesse with your note.");

  // Jesse fixes and resubmits
  await as(page, "member");
  expect("sent-back notice", await txt(page, ".notice-dark p"), "Mele sent back JT-20260817-1. “Thursday was 8 hours on the schedule. Can you check it?”");
  await page.click('[data-act="fix"]');
  expect("fixing", await txt(page, ".inv-form h3"), "Fixing JT-20260817-1");
  expect("starts from what he sent", await totals(page), "Hours 83.5 h | Labor $4,592.50 | Expenses $35.00 | Hawaiʻi GET $218.05 | Total $4,845.55");
  await page.fill("#worked-9", "8");
  await page.click('[data-form="invoice"] button[type="submit"]');
  expect("resubmitted", await statusLine(page), "JT-20260817-2 sent to Mele for approval, $4,759.16.");
  expect("old one marked replaced", await page.locator("tbody tr", { hasText: "JT-20260817-1" }).locator(".pill").innerText(), "Replaced");

  // Finance before and after approval
  await as(page, "owner");
  await go(page, "finance");
  expect("MTD paid", await stat(page, "paid"), "$13,528.79");
  expect("MTD waiting, both invoices", await stat(page, "waiting"), "$9,581.15");
  expect("MTD hours", await stat(page, "hours"), "236 h");
  expect("scheduled this week follows the board", await stat(page, "sched"), "$5,670.00");
  expect("MTD dates", await txt(page, ".fin-dates"), "Aug 1 to Aug 17, 2026");
  await go(page, "approvals");
  await page.click('[data-review="JT-20260817-2"]');
  expect("resubmit is labelled", (await txt(page, "#view-title + p")).endsWith("A resubmitted invoice."), true);
  await page.click('[data-act="approve"]');
  expect("approved", await statusLine(page), "Approved JT-20260817-2 for $4,759.16. It's in this month's numbers under Finance.");
  await go(page, "finance");
  expect("MTD paid after approval", await stat(page, "paid"), "$18,287.95");
  expect("MTD waiting after approval", await stat(page, "waiting"), "$4,821.99");
  expect("MTD hours after approval", await stat(page, "hours"), "318 h");
  expect("labor by project", (await all(page, ".bars tbody tr")).join(" | "), "Fall campaign $6,740.00 · 124 h | Launch video $6,370.00 · 122 h | Website refresh $4,320.00 · 72 h");
  expect("by person", (await all(page, "[data-person]")).join(" | "), "Jesse Tran 162 h $9,366.49 | Noelani Ruiz 72 h $4,523.56 | Sam Okamura 84 h $4,397.90");
  const download = page.waitForEvent("download");
  await page.click('[data-act="export"]');
  const dl = await download;
  expect("CSV file name", dl.suggestedFilename(), "brightreef-finance-mtd.csv");
  const csv = fs.readFileSync(await dl.path(), "utf8").split("\n");
  expect("CSV rows, header plus six invoices", csv.length, 7);
  expect("CSV has the approved resubmit", csv.includes('"JT-20260817-2","Jesse Tran","Aug 3 to Aug 16, 2026","82","4510.00","35.00","214.16","4759.16","Paid"'), true);
  expect("CSV has Noelani's waiting invoice", csv.some((l) => l.startsWith('"NR-20260817-1"') && l.endsWith('"Waiting"')), true);
  await page.click('[data-range="qtd"]');
  expect("QTD paid", await stat(page, "paid"), "$42,036.65");
  expect("QTD dates", await txt(page, ".fin-dates"), "Jul 1 to Aug 17, 2026");
  expect("range button pressed", await page.getAttribute('[data-range="qtd"]', "aria-pressed"), "true");
  expect("range status", await statusLine(page), "Showing quarter to date. $42,036.65 paid to contractors.");
  await page.click('[data-range="ytd"]');
  expect("YTD hours", await stat(page, "hours"), "3,030 h");
  expect("YTD dates", await txt(page, ".fin-dates"), "Jan 1 to Aug 17, 2026");

  // Typed HTML stays text
  await page.click('[data-act="reset"]');
  await page.click('[data-cant="S1"]');
  await page.fill("#cant-note", '<img src=x onerror="document.title=1">Sick');
  await page.click('[data-form="cant"] button[type="submit"]');
  await as(page, "owner");
  expect("typed HTML shows as text", (await txt(page, ".attention")).includes('“<img src=x onerror="document.title=1">Sick”'), true);
  expect("and makes no element", await page.locator(".attention img").count(), 0);

  // Reset and refresh
  await page.click('[data-act="reset"]');
  expect("reset status", await statusLine(page), "Demo reset. Everything is back the way it started.");
  expect("reset: back to Jesse", await page.getAttribute('[data-as="member"]', "aria-pressed"), "true");
  expect("reset: his week", await txt(page, ".week-total"), "44 h scheduled this week");
  await as(page, "owner");
  expect("reset: owner badges", await menu(page), "Schedule board 3 , 3 need you / Approvals 1 , 1 waiting / Finance");
  await page.reload({ waitUntil: "networkidle" });
  expect("refresh starts as Jesse", await page.getAttribute('[data-as="member"]', "aria-pressed"), "true");

  // Save the new rate for next time
  await go(page, "invoices");
  await page.click('[data-act="edit-rate"]');
  expect("rate field takes focus", await active(page), "inv-rate");
  await page.fill("#inv-rate", "60");
  expect("totals at $60", await totals(page), "Hours 82 h | Labor $4,920.00 | Expenses $0.00 | Hawaiʻi GET $231.83 | Total $5,151.83");
  await page.click('[data-form="invoice"] button[type="submit"]');
  expect("a changed rate asks first", await txt(page, "#rate-confirm p"), "Your rate changed from $55.00 to $60.00. Save it for next time?");
  expect("the question takes focus", await active(page), "rate-confirm");
  await page.click('[data-act="submit-save"]');
  expect("saved rate", await statusLine(page), "JT-20260817-1 sent to Mele for approval, $5,151.83. Your new rate is saved for next time.");
  await as(page, "owner");
  await go(page, "approvals");
  await page.click('[data-review="JT-20260817-1"]');
  await page.fill("#sb-note", "Checking the saved rate.");
  await page.click('[data-form="sendback"] button[type="submit"]');
  await as(page, "member");
  await page.click('[data-act="fix"]');
  await page.click('[data-form="invoice"] button[type="submit"]');
  expect("$60 is now the saved rate, so no question", await statusLine(page), "JT-20260817-2 sent to Mele for approval, $5,151.83.");

  errors.length ? fail("errors: " + errors.join(" | ")) : ok("no console errors, failed requests or dialogs");
  await ctx.close();
}

// ── 1a. Jesse's calendar view ─────────────────────────────────────────────
console.log("\ncalendar view, desktop 1280");
{
  const { ctx, page, errors } = await open();
  const style = (id, prop) => page.locator(`[data-pick="${id}"]`).evaluate((el, p) => el.style[p], prop);
  await page.click('[data-schedview="calendar"]');
  expect("Calendar is pressed", await page.getAttribute('[data-schedview="calendar"]', "aria-pressed"), "true");
  expect("focus stays on the switch", await active(page), "calendar");
  expect("six shifts on the calendar", await page.locator(".cal-block").count(), 6);
  expect("Monday 9 to 5 starts 2 hours into a 7 AM to 6 PM day", `${await style("S1", "top")} ${await style("S1", "height")}`, "18.182% 72.727%");
  expect("Wednesday's overlapping shifts sit side by side", `${await style("S4", "left")} ${await style("S4", "width")} | ${await style("S3", "left")} ${await style("S3", "width")}`, "0% 50% | 50% 50%");
  expect("today is marked", await page.locator(".cal-dayhead.is-today").innerText().then(clean), "Mon Aug 17");
  await page.click('[data-pick="S2"]');
  expect("picking a shift opens its details", await txt(page, ".cal-detail p"), "9:00 AM to 5:00 PM · 8 h · Fall campaign");
  expect("focus moves to the details", await active(page), "pick-title");
  expect("the picked shift is highlighted", await page.locator('[data-pick="S2"].is-picked').count(), 1);
  await page.click('[data-act="close-pick"]');
  expect("Close puts focus back on the shift", await page.evaluate(() => document.activeElement.dataset.pick), "S2");
  expect("the hint is back", await txt(page, ".cal-hint"), "Pick a shift to see it or call out of it.");
  await page.click('[data-pick="S2"]');
  await page.click('.cal-detail [data-cant="S2"]');
  expect("call-out form from the calendar", await active(page), "cant-note");
  await page.fill("#cant-note", "Car's in the shop.");
  await page.click('[data-form="cant"] button[type="submit"]');
  expect("the block shows it", await page.locator('[data-pick="S2"].is-cover .chip-flag').innerText(), "Waiting on cover");
  expect("so do the details", (await txt(page, ".cal-detail p")).endsWith("Waiting on cover"), true);
  await page.click('[data-as="owner"]');
  expect("Mele sees the call-out", (await all(page, ".attention li > span")).some((t) => t === "Jesse can't make Tue, Aug 18: “Car's in the shop.”"), true);
  await page.click('.chip[data-edit="S1"]');
  await page.selectOption("#ed-start", "07:00");
  await page.click('[data-form="shift"] button[type="submit"]');
  await page.click('[data-as="member"]');
  expect("his view is still the calendar", await page.getAttribute('[data-schedview="calendar"]', "aria-pressed"), "true");
  expect("a 7 AM start moves the block to the top", await style("S1", "top"), "0%");
  await page.click('[data-schedview="list"]');
  expect("back to the list", await page.locator(".shift-row").count(), 6);
  errors.length ? fail("errors: " + errors.join(" | ")) : ok("no console errors");
  await ctx.close();
}

// ── 1b. functional, phone ─────────────────────────────────────────────────
console.log("\nfunctional, phone 390 (touch)");
{
  const { ctx, page, errors } = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.tap('[data-cant="S1"]');
  await page.tap('[data-form="cant"] button[type="submit"]');
  expect("called out on a phone", await txt(page, '[data-shift="S1"] .shift-what'), "Fall campaign Waiting on cover");
  await page.tap('[data-as="owner"]');
  await page.locator('.chip[data-edit="S1"]').scrollIntoViewIfNeeded();
  await page.tap('.chip[data-edit="S1"]');
  await page.selectOption("#ed-person", "sam");
  await page.tap('[data-form="shift"] button[type="submit"]');
  expect("covered on a phone", await statusLine(page), "Saved. Sam's Google Calendar is updated and their phone gets the usual alert.");
  await page.tap('[data-view="approvals"]');
  await page.tap('[data-review="NR-20260817-1"]');
  await page.tap('[data-act="approve"]');
  expect("approved on a phone", await statusLine(page), "Approved NR-20260817-1 for $4,821.99. It's in this month's numbers under Finance.");
  await page.tap('[data-view="finance"]');
  expect("finance on a phone", await stat(page, "paid"), "$18,350.78");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  overflow > 1 ? fail(`phone overflow ${overflow}px`) : ok("no sideways scroll on a phone");
  errors.length ? fail("errors: " + errors.join(" | ")) : ok("no console errors");
  await ctx.close();
}

// ── 2. axe and page health in every view ──────────────────────────────────
const submitShift = (p) => p.click('[data-form="shift"] button[type="submit"]');
const STATES = [
  ["Jesse, schedule with the call-out form", async (p) => { await p.click('[data-cant="S2"]'); }],
  ["Jesse, calendar", async (p) => { await p.click('[data-schedview="calendar"]'); }],
  ["Jesse, calendar with a shift picked and the call-out form", async (p) => { await p.click('[data-schedview="calendar"]'); await p.click('[data-pick="S4"]'); await p.click('.cal-detail [data-cant="S4"]'); }],
  ["Jesse, schedule with updates", async (p) => { await p.click('[data-as="owner"]'); await p.click('.chip[data-edit="S3"]'); await p.click('[data-act="delete-shift"]'); await p.click('[data-as="member"]'); }],
  ["Jesse, invoice with expense and the rate question", async (p) => { await p.click('[data-view="invoices"]'); await p.click('[data-act="add-exp"]'); await p.click('[data-act="edit-rate"]'); await p.fill("#inv-rate", "60"); await p.click('[data-form="invoice"] button[type="submit"]'); }],
  ["Jesse, a sent-back invoice", async (p) => { await p.click('[data-view="invoices"]'); await p.click('[data-form="invoice"] button[type="submit"]'); await p.click('[data-as="owner"]'); await p.click('[data-view="approvals"]'); await p.click('[data-review="JT-20260817-1"]'); await p.fill("#sb-note", "Fix the hours."); await p.click('[data-form="sendback"] button[type="submit"]'); await p.click('[data-as="member"]'); }],
  ["Mele, board", async (p) => { await p.click('[data-as="owner"]'); }],
  ["Mele, board with the editor error", async (p) => { await p.click('[data-as="owner"]'); await p.click('[data-add="sam|2026-08-17"]'); await p.selectOption("#ed-end", "08:00"); await submitShift(p); }],
  ["Mele, board all clear", async (p) => { await p.click('[data-as="owner"]'); await p.click('.chip[data-edit="S3"]'); await p.click('[data-act="delete-shift"]'); await p.click('.chip[data-edit="S10"]'); await p.selectOption("#ed-person", "sam"); await submitShift(p); }],
  ["Mele, approvals", async (p) => { await p.click('[data-as="owner"]'); await p.click('[data-view="approvals"]'); }],
  ["Mele, reviewing with the send-back error", async (p) => { await p.click('[data-as="owner"]'); await p.click('[data-view="approvals"]'); await p.click('[data-review="NR-20260817-1"]'); await p.click('[data-form="sendback"] button[type="submit"]'); }],
  ["Mele, finance month to date", async (p) => { await p.click('[data-as="owner"]'); await p.click('[data-view="finance"]'); }],
  ["Mele, finance year to date", async (p) => { await p.click('[data-as="owner"]'); await p.click('[data-view="finance"]'); await p.click('[data-range="ytd"]'); }],
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
  await page.click('[data-as="owner"]');
  await page.click('[data-view="finance"]');
  await page.waitForTimeout(300);
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
  running === 0 ? ok("reduced motion: nothing animating") : fail(`reduced motion: ${running} animations running`);
  await ctx.close();
}

await browser.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
