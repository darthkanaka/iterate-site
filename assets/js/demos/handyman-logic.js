/* Handyman demo, the logic. Pure functions, no DOM, so tools/test-handyman-logic.mjs can
   run them in Node. The page finds them on window.HandymanLogic. */
(function (root) {
  "use strict";

  const round2 = (n) => Math.round(n * 100 + 1e-7) / 100;
  const nonNeg = (v) => Math.max(0, Number(v) || 0);

  // A line's labor is the invoice's, unless the office typed a different number.
  const laborOf = (row) => nonNeg(row.laborOverride != null ? row.laborOverride : row.labor);
  const shareOf = (row, techs) => { const t = techs.find((x) => x.id === row.tech); return t ? t.share : 0; };
  const payOf = (row, techs) => round2((laborOf(row) * shareOf(row, techs)) / 100);

  // Each tech's week: labor, pay, and how many lines are final and paid.
  function summary(rows, techs) {
    return techs.map((t) => {
      const mine = rows.filter((r) => r.tech === t.id);
      return {
        tech: t.id,
        count: mine.length,
        labor: round2(mine.reduce((s, r) => s + laborOf(r), 0)),
        pay: round2(mine.reduce((s, r) => s + payOf(r, techs), 0)),
        final: mine.filter((r) => r.final).length,
        paid: mine.filter((r) => r.paid).length,
      };
    });
  }
  const sheetTotal = (rows, techs) => round2(rows.filter((r) => r.tech).reduce((s, r) => s + payOf(r, techs), 0));
  const needsTech = (rows) => rows.filter((r) => !r.tech);

  // The assistant's answer: the first entry with a keyword that starts a word in the question.
  function answerFor(question, answers, fallback) {
    const q = String(question).toLowerCase();
    const hit = (key) => new RegExp(`(^|[^a-z])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(q);
    return answers.find((a) => a.keys.some(hit)) || fallback;
  }

  // A small, safe renderer for the assistant's answers: paragraphs, **bold**, numbered and
  // bulleted lists, and pipe tables. Everything is escaped before any markup is added.
  const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const inline = (s) => escape(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  function render(text) {
    const out = [];
    let list = null, table = [], para = [];
    const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join(" ")}</p>`); para = []; } };
    const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`); list = null; } };
    const flushTable = () => {
      if (!table.length) return;
      const [headRow, ...body] = table.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
      out.push(`<table class="app-table keep answer-table"><thead><tr>${headRow.map((c) => `<th scope="col">${inline(c)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      table = [];
    };
    for (const raw of String(text).split("\n")) {
      const line = raw.trim();
      if (line.startsWith("|")) { flushPara(); flushList(); table.push(line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim())); continue; }
      flushTable();
      const num = /^\d+\.\s+(.*)$/.exec(line), bullet = /^-\s+(.*)$/.exec(line);
      if (num || bullet) {
        flushPara();
        const tag = num ? "ol" : "ul";
        if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
        list.items.push((num || bullet)[1]);
        continue;
      }
      if (!line) { flushPara(); flushList(); continue; }
      flushList();
      para.push(line);
    }
    flushPara(); flushList(); flushTable();
    return out.join("");
  }

  // The stages of a field guide, in order.
  const STAGES = [["job", "The job"], ["gear", "Gear"], ["safety", "Safety"], ["steps", "Steps"], ["done", "Done right"]];
  const doneCount = (checks, guideId, kind, total) => Array.from({ length: total }, (_, i) => checks[`${guideId}:${kind}:${i}`]).filter(Boolean).length;

  const api = { round2, laborOf, payOf, summary, sheetTotal, needsTech, answerFor, render, escape, STAGES, doneCount };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HandymanLogic = api;
})(typeof self !== "undefined" ? self : this);
