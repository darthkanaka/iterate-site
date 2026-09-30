// Unit tests for the inventory demo's math, using the same data the page loads.
// Every expected number was worked out by hand from assets/js/demos/inventory-data.js.
//
//   node --test tools/test-inventory-math.mjs
import { createRequire } from "module";
import { test } from "node:test";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const M = require("../assets/js/demos/inventory-math.js");
const D = require("../assets/js/demos/inventory-data.js");
const byId = Object.fromEntries(D.products.map((p) => [p.id, p]));
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

const run = (plan = D.plan, stock = D.stock) => {
  const lines = M.shoppingList(D.products, D.menu, plan, stock);
  const toBuy = lines.filter((l) => l.packs > 0);
  const groups = M.bySupplier(lines, D.suppliers);
  const total = M.round2(groups.reduce((t, g) => t + g.total, 0));
  const line = (id) => lines.find((l) => l.productId === id);
  return { lines, toBuy, groups, total, line };
};

test("requirements add each ingredient up across every recipe", () => {
  const req = M.requirements(D.menu, D.plan);
  close(req.sugar.total, 31.5, "sugar is cookies 12 + mochi 15 + shoyu chicken 4.5");
  assert.equal(req.sugar.from.length, 3, "sugar keeps all three recipes behind it");
  close(req.flour.total, 20.4, "flour");
  close(req.eggs.total, 90, "eggs");
  close(req.rice.total, 100, "rice across both plates");
  close(req.containers.total, 250, "one container per plate");
  close(req.pork.total, 55, "pork");
});

test("the default week's shopping list", () => {
  const { toBuy, total, line, groups } = run();
  assert.deepEqual(toBuy.map((l) => l.productId).sort(), ["butter", "chicken", "containers", "eggs", "macaroni", "mayo", "mochiko", "pork", "rice", "sugar"]);
  assert.equal(line("chicken").packs, 2, "55 lb short in 40 lb cases is 2 cases");
  assert.equal(line("sugar").packs, 1, "6.5 lb short is 1 bag");
  assert.equal(line("pork").packs, 1, "nothing on hand, 55 lb needed, 60 lb case");
  assert.equal(line("flour").packs, 0, "flour is covered");
  assert.deepEqual(groups.map((g) => [g.supplier.id, g.total]), [["wholesale", 413.5], ["meat", 410], ["packaging", 62]]);
  assert.equal(total, 885.5);
});

test("tripling cookies brings chocolate chips onto the list", () => {
  const { toBuy, total, line } = run({ ...D.plan, cookies: 300 });
  assert.equal(line("chips").packs, 1, "37.5 lb needed, 18.75 on hand, one 25 lb box");
  assert.equal(line("flour").packs, 0, "51 lb of flour is still covered by 75 on hand");
  assert.equal(toBuy.length, 11);
  assert.equal(total, 981.5);
});

test("a big cookie week rounds sugar up to whole bags", () => {
  const { line } = run({ ...D.plan, cookies: 600 });
  close(line("sugar").required, 79.5, "sugar needed");
  assert.equal(line("sugar").packs, 3, "54.5 lb short in 25 lb bags is 3 bags");
  assert.equal(line("flour").packs, 1, "102 lb needed, 75 on hand, one bag");
});

test("dropping kalua pork takes its ingredients off the list", () => {
  const { toBuy, total, line } = run({ ...D.plan, "kalua-pork": 0 });
  assert.equal(line("pork"), undefined, "no pork needed at all");
  assert.equal(line("rice").packs, 0, "60 lb of rice is covered");
  assert.equal(line("containers").packs, 1, "150 containers, 125 on hand");
  assert.equal(toBuy.length, 6);
  assert.equal(total, 577.5);
});

test("a count changes what gets ordered", () => {
  const { line, total } = run(D.plan, { ...D.stock, chicken: M.fromCount(1, 0.75) });
  assert.equal(line("chicken").packs, 1, "70 lb on hand, 5 short, one case");
  assert.equal(total, 767.5);
  const pork = run(D.plan, { ...D.stock, pork: M.fromCount(1, 0) }).line("pork");
  assert.equal(pork.packs, 0, "a full 60 lb case covers 55 lb");
});

test("rounding to packs", () => {
  assert.equal(M.packsToOrder(10, 10, 5), 0, "exactly enough orders nothing");
  assert.equal(M.packsToOrder(10.01, 10, 5), 1, "a sliver short orders a pack");
  assert.equal(M.packsToOrder(20, 0, 5), 4, "exact multiple");
  assert.equal(M.packsToOrder(21, 0, 5), 5, "just over a multiple");
  assert.equal(M.packsToOrder(3, 10, 5), 0, "more than enough");
});

test("cost to make one of each menu item", () => {
  const cost = (id) => M.costPerUnit(D.menu.find((m) => m.id === id), byId);
  assert.equal(cost("cookies"), 1.3);
  assert.equal(cost("mochi"), 6.85);
  assert.equal(cost("shoyu-chicken"), 2.73);
  assert.equal(cost("kalua-pork"), 2.65);
});

test("stock status against par", () => {
  assert.equal(M.status(0, 1), "out");
  assert.equal(M.status(0.5, 1), "low");
  assert.equal(M.status(1, 1), "ok");
  assert.equal(M.status(1.25, 2), "low");
  assert.equal(M.status(3, 2), "ok");
});

test("counts are whole packs plus a quarter, half or three quarters", () => {
  assert.equal(M.fromCount(2, 0.5), 2.5);
  assert.equal(M.fromCount("3", "0.75"), 3.75);
  assert.equal(M.fromCount(-4, 0.25), 0.25, "negative whole numbers count as zero");
  assert.equal(M.fromCount(1.9, 0), 1, "whole packs only in the first box");
  assert.equal(M.fromCount(1, 0.3), 1, "only the offered fractions count");
  assert.equal(M.fromCount("", ""), 0);
});

test("empty and bad plan numbers make an empty list, not an error", () => {
  const { lines, total } = run({ cookies: 0, mochi: "", "shoyu-chicken": -5, "kalua-pork": "abc" });
  assert.equal(lines.length, 0);
  assert.equal(total, 0);
});
