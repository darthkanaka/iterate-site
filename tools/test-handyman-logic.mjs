// Unit tests for the handyman demo's logic, using the same data the page loads.
// Expected pay figures were worked out by hand.
//
//   node --test tools/test-handyman-logic.mjs
import { createRequire } from "module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const L = require("../assets/js/demos/handyman-logic.js");
const D = require("../assets/js/demos/handyman-data.js");
const clone = (o) => JSON.parse(JSON.stringify(o));

test("last week's pay sheet", () => {
  const s = L.summary(D.rows, D.techs);
  assert.deepEqual(s.map((t) => [t.tech, t.labor, t.pay, `${t.final}/${t.count}`]), [
    ["malia", 815, 285.25, "3/3"],
    ["noa", 850, 297.5, "2/2"],
    ["jordan", 930, 353.4, "1/2"],
    ["ikaika", 730, 255.5, "1/2"],
  ]);
  assert.equal(L.sheetTotal(D.rows, D.techs), 1191.65);
  assert.deepEqual(L.needsTech(D.rows).map((r) => r.id), ["r10"]);
});

test("assigning the open invoice and correcting a labor number", () => {
  const rows = clone(D.rows);
  rows.find((r) => r.id === "r10").tech = "malia";
  assert.equal(L.summary(rows, D.techs)[0].pay, 348.25, "995 of labor at 35%");
  assert.equal(L.sheetTotal(rows, D.techs), 1254.65);
  rows.find((r) => r.id === "r5").laborOverride = 300;
  assert.equal(L.summary(rows, D.techs)[1].pay, 315, "Noa's fan swap corrected to $300 of labor");
  assert.equal(L.sheetTotal(rows, D.techs), 1272.15);
});

test("labor overrides and bad numbers", () => {
  assert.equal(L.laborOf({ labor: 200 }), 200);
  assert.equal(L.laborOf({ labor: 200, laborOverride: 0 }), 0, "zero is a real override");
  assert.equal(L.laborOf({ labor: 200, laborOverride: -50 }), 0, "negative counts as zero");
  assert.equal(L.laborOf({ labor: 200, laborOverride: "abc" }), 0);
  assert.equal(L.payOf({ tech: "nobody", labor: 500 }, D.techs), 0, "no tech, no pay");
});

test("the assistant's quick questions each find their answer", () => {
  const first = (q) => L.answerFor(q, D.answers, D.fallback).lookups[0];
  assert.deepEqual(D.prompts.map(first), [
    "Checked today's schedule", "Checked open requests", "Checked unpaid invoices",
    "Checked today's schedule", "Checked the price list", "Searched the field guides",
  ]);
  assert.equal(L.answerFor("What should I do first?", D.answers, D.fallback).lookups.length, 4, "the morning briefing checks four things");
});

test("keywords only match at the start of a word", () => {
  assert.equal(L.answerFor("Is this thing on?", D.answers, D.fallback), D.fallback, "'this' does not match 'hi'");
  assert.equal(L.answerFor("Hi Kai", D.answers, D.fallback).lookups.length, 0, "a greeting");
  assert.equal(L.answerFor("what's the priority", D.answers, D.fallback).lookups[0], "Checked today's schedule", "'priorit' starts a word");
  assert.equal(L.answerFor("", D.answers, D.fallback), D.fallback);
});

test("rendering answers", () => {
  const html = L.render("**Bold** start\n\n| A | B |\n|---|---|\n| 1 | **2** |\n\n1. one\n2. two\n- dot");
  assert.equal(html, '<p><strong>Bold</strong> start</p><table class="app-table keep answer-table"><thead><tr><th scope="col">A</th><th scope="col">B</th></tr></thead><tbody><tr><td>1</td><td><strong>2</strong></td></tr></tbody></table><ol><li>one</li><li>two</li></ol><ul><li>dot</li></ul>');
  assert.equal(L.render('<img src=x onerror="alert(1)">'), "<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>", "markup is escaped");
  for (const a of [...D.answers, D.fallback]) assert.ok(!/\*\*/.test(L.render(a.text)), "no stray asterisks left in any answer");
});

test("guide progress", () => {
  const checks = { "g1:steps:0": true, "g1:steps:2": true, "g1:gear:0": true, "g2:steps:1": true };
  assert.equal(L.doneCount(checks, "g1", "steps", 5), 2);
  assert.equal(L.doneCount(checks, "g1", "gear", 7), 1);
  assert.equal(L.doneCount(checks, "g3", "steps", 4), 0);
  assert.deepEqual(L.STAGES.map((s) => s[0]), ["job", "gear", "safety", "steps", "done"]);
});

test("no real names or em dashes in the data", () => {
  // The real names are kept in git-ignored private/names-to-keep-out.txt, so this public
  // file never spells them out. Without that file only the dash check runs.
  const list = new URL("../private/names-to-keep-out.txt", import.meta.url);
  const names = existsSync(list) ? readFileSync(list, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")) : [];
  const text = JSON.stringify(D);
  for (const bad of [...names, "—"]) assert.ok(!text.includes(bad), `a name from the keep-out list, or an em dash, is in the data`);
});
