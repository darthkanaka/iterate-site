// Unit tests for the portal demo's logic, using the same data the page loads.
// Every expected number was worked out by hand.
//
//   node --test tools/test-portal-logic.mjs
import { createRequire } from "module";
import { test } from "node:test";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const L = require("../assets/js/demos/portal-logic.js");
const D = require("../assets/js/demos/portal-data.js");

test("shift hours from clock times", () => {
  assert.equal(L.shiftHours({ start: "09:00", end: "17:00" }), 8);
  assert.equal(L.shiftHours({ start: "07:30", end: "15:30" }), 8);
  assert.equal(L.shiftHours({ start: "09:00", end: "13:00" }), 4);
  assert.equal(L.shiftHours({ start: "17:00", end: "09:00" }), 0, "an end before the start is no hours, not negative");
});

test("the seeded week", () => {
  assert.deepEqual(D.team.map((p) => L.weekHours(D.shifts, p.id)), [44, 32, 30], "Jesse, Noelani, Sam");
  assert.deepEqual([...L.doubleBooked(D.shifts)].sort(), ["S3", "S4"], "Jesse on Wednesday");
  assert.equal(L.scheduledCost(D.shifts, D.rates), 5840, "44 h at $55, 32 at $60, 30 at $50");
  const items = L.attention(D.shifts, D.team);
  assert.deepEqual(items.map((i) => `${i.kind}:${i.person}`), ["double:jesse", "cover:noelani", "over:jesse"]);
});

test("fixing the board clears what needs attention", () => {
  let shifts = D.shifts.filter((s) => s.id !== "S3");
  assert.equal(L.weekHours(shifts, "jesse"), 36);
  assert.equal(L.scheduledCost(shifts, D.rates), 5400);
  assert.deepEqual(L.attention(shifts, D.team).map((i) => i.kind), ["cover"], "deleting one shift fixes the double-booking and the long week");
  shifts = shifts.map((s) => (s.id === "S10" ? { ...s, person: "sam", needsCover: false } : s));
  assert.deepEqual(L.attention(shifts, D.team), [], "Sam is free Thursday");
  assert.equal(L.scheduledCost(shifts, D.rates), 5320);
  assert.equal(L.weekHours(shifts, "sam"), 38);
});

test("overlap edge cases", () => {
  const s = (id, person, start, end, date = "2026-08-20") => ({ id, person, date, start, end });
  assert.equal(L.doubleBooked([s("a", "x", "09:00", "13:00"), s("b", "x", "13:00", "17:00")]).size, 0, "back to back is fine");
  assert.equal(L.doubleBooked([s("a", "x", "09:00", "13:01"), s("b", "x", "13:00", "17:00")]).size, 2, "one minute over is a clash");
  assert.equal(L.doubleBooked([s("a", "x", "09:00", "17:00"), s("b", "y", "09:00", "17:00")]).size, 0, "different people");
  assert.equal(L.doubleBooked([s("a", "x", "09:00", "17:00"), s("b", "x", "09:00", "17:00", "2026-08-21")]).size, 0, "different days");
});

test("an invoice builds itself from the shifts worked", () => {
  const { lines, changes } = L.invoiceFromShifts(D.jesseWorked);
  assert.deepEqual(lines, [{ project: "Fall campaign", hours: 60 }, { project: "Launch video", hours: 22 }]);
  assert.deepEqual(changes, []);
  assert.deepEqual(L.totals({ lines, rate: 55, expenses: [], taxRate: D.taxRate }), { hours: 82, labor: 4510, expenses: 0, subtotal: 4510, tax: 212.51, total: 4722.51 });
});

test("a longer day and an expense", () => {
  const worked = D.jesseWorked.map((w) => (w.date === "2026-08-13" ? { ...w, hours: 9.5 } : w));
  const { lines, changes } = L.invoiceFromShifts(worked);
  assert.deepEqual(changes, [{ date: "2026-08-13", project: "Fall campaign", from: 8, to: 9.5 }]);
  assert.equal(L.totals({ lines, rate: 55, expenses: [], taxRate: D.taxRate }).total, 4808.9);
  const withProps = L.totals({ lines, rate: 55, expenses: [{ desc: "Props for the shoot", amount: 35 }], taxRate: D.taxRate });
  assert.deepEqual([withProps.subtotal, withProps.tax, withProps.total], [4627.5, 218.05, 4845.55]);
  assert.equal(L.totals({ lines: L.invoiceFromShifts(D.jesseWorked).lines, rate: 55, expenses: [{ amount: 35 }], taxRate: D.taxRate }).total, 4759.16, "the resubmit, back to 8 hours");
  assert.equal(L.totals({ lines: L.invoiceFromShifts(D.jesseWorked).lines, rate: 60, expenses: [], taxRate: D.taxRate }).total, 5151.83, "82 h at a raised $60: $4,920 plus $231.83 GET");
});

test("bad numbers count as zero", () => {
  const t = L.totals({ lines: [{ hours: "abc" }, { hours: -8 }, { hours: "7.5" }], rate: "55", expenses: [{ amount: "" }, { amount: -20 }], taxRate: 0.04712 });
  assert.deepEqual([t.hours, t.labor, t.expenses], [7.5, 412.5, 0]);
});

test("date ranges", () => {
  assert.deepEqual(L.periodRange("mtd", "2026-08-17"), { start: "2026-08-01", end: "2026-08-17" });
  assert.deepEqual(L.periodRange("qtd", "2026-08-17"), { start: "2026-07-01", end: "2026-08-17" });
  assert.deepEqual(L.periodRange("ytd", "2026-08-17"), { start: "2026-01-01", end: "2026-08-17" });
  assert.deepEqual(L.periodRange("qtd", "2026-12-31"), { start: "2026-10-01", end: "2026-12-31" });
});

test("finance, month to date", () => {
  const f = L.finance(D.invoices, L.periodRange("mtd", D.studio.today), D.team, D.projects);
  assert.equal(f.paid, 13528.79, "Jesse, Noelani and Sam for the period ending Aug 2, plus Sam's for Aug 16");
  assert.equal(f.hours, 236);
  assert.equal(f.waiting, 4821.99, "Noelani's 76 h and a $45 expense");
  assert.deepEqual(f.byProject.map((p) => [p.project, p.labor, p.hours]), [["Launch video", 5160, 100], ["Website refresh", 4320, 72], ["Fall campaign", 3440, 64]]);
  assert.deepEqual(f.byPerson.map((p) => [p.person, p.hours, p.paid]), [["jesse", 80, 4607.33], ["noelani", 72, 4523.56], ["sam", 84, 4397.9]]);
});

test("finance, quarter and year to date", () => {
  const q = L.finance(D.invoices, L.periodRange("qtd", D.studio.today), D.team, D.projects);
  assert.equal(q.paid, 37277.49);
  const y = L.finance(D.invoices, L.periodRange("ytd", D.studio.today), D.team, D.projects);
  assert.equal(y.hours, 2948, "1,160 Jesse + 1,080 Noelani + 664 Sam + Sam's 44 this period");
});

test("approving an invoice moves it into the numbers", () => {
  const worked = L.invoiceFromShifts(D.jesseWorked);
  const jesse = { id: "JT-20260817-2", from: "jesse", period: D.period, lines: worked.lines, rate: 55, taxRate: D.taxRate, expenses: [{ amount: 35 }], status: "approved" };
  const f = L.finance([...D.invoices, jesse], L.periodRange("mtd", D.studio.today), D.team, D.projects);
  assert.equal(f.paid, 18287.95);
  assert.equal(f.hours, 318);
  assert.deepEqual(f.byProject.map((p) => [p.project, p.labor]), [["Fall campaign", 6740], ["Launch video", 6370], ["Website refresh", 4320]]);
});

test("invoice numbers, saved details, ids", () => {
  assert.equal(L.invoiceNumber("Jesse Tran", "2026-08-17", 1), "JT-20260817-1");
  assert.equal(L.invoiceNumber("  noelani  ruiz extra ", "2026-08-17", 2), "NR-20260817-2");
  const saved = D.saved.jesse;
  assert.deepEqual(L.changedDefaults(saved, { ...saved, rate: 60 }, ["rate"]), [{ field: "rate", from: 55, to: 60 }]);
  assert.deepEqual(L.changedDefaults(saved, { ...saved, rate: "55" }, ["rate"]), []);
  assert.equal(L.nextId(D.shifts, "S"), "S15");
  assert.equal(L.addDays("2026-08-17", 6), "2026-08-23");
});
