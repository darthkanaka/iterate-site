/* Portal demo, the logic. Pure functions, no DOM, so tools/test-portal-logic.mjs can run
   them in Node. The page finds them on window.PortalLogic.

   Times are "HH:MM" strings on a 24-hour clock and dates are ISO strings (2026-08-17).
   A shift is { id, person, date, start, end, project }; worked shifts on an invoice also
   carry scheduled and worked hours. */
(function (root) {
  "use strict";

  const DAY = 86400000;
  const parse = (isoDate) => new Date(isoDate + "T12:00:00Z");
  const iso = (d) => d.toISOString().slice(0, 10);
  const addDays = (isoDate, n) => iso(new Date(parse(isoDate).getTime() + n * DAY));
  const round2 = (n) => Math.round(n * 100 + 1e-7) / 100;
  const nonNeg = (v) => Math.max(0, Number(v) || 0);
  const minutes = (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return h * 60 + (m || 0); };

  const shiftHours = (s) => Math.max(0, (minutes(s.end) - minutes(s.start)) / 60);

  // Shifts that overlap another shift for the same person on the same day.
  function doubleBooked(shifts) {
    const out = new Set();
    for (let i = 0; i < shifts.length; i++) {
      for (let j = i + 1; j < shifts.length; j++) {
        const a = shifts[i], b = shifts[j];
        if (a.person !== b.person || a.date !== b.date) continue;
        if (minutes(a.start) < minutes(b.end) && minutes(b.start) < minutes(a.end)) { out.add(a.id); out.add(b.id); }
      }
    }
    return out;
  }

  const weekHours = (shifts, personId) => round2(shifts.filter((s) => s.person === personId).reduce((t, s) => t + shiftHours(s), 0));

  // What needs the owner's attention on this week's board. A double-booking is one item
  // per person and day, a call-out is one item per shift, a long week is one per person.
  function attention(shifts, people) {
    const items = [];
    const doubled = doubleBooked(shifts);
    const seen = new Set();
    for (const s of shifts) {
      if (!doubled.has(s.id)) continue;
      const key = `${s.person}|${s.date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ kind: "double", person: s.person, date: s.date, shiftId: s.id });
    }
    for (const s of shifts) if (s.needsCover) items.push({ kind: "cover", person: s.person, date: s.date, shiftId: s.id });
    for (const p of people) {
      const h = weekHours(shifts, p.id);
      if (h > 40) items.push({ kind: "over", person: p.id, hours: h });
    }
    return items;
  }

  // What this week's board costs in contractor pay, before tax.
  const scheduledCost = (shifts, rates) => round2(shifts.reduce((t, s) => t + shiftHours(s) * (rates[s.person] || 0), 0));

  // Invoice lines from worked shifts: hours per project, in the order projects first
  // appear, plus every shift where the hours worked differ from the schedule.
  function invoiceFromShifts(worked) {
    const lines = [];
    const changes = [];
    for (const s of worked) {
      const hours = nonNeg(s.hours);
      let line = lines.find((l) => l.project === s.project);
      if (!line) lines.push((line = { project: s.project, hours: 0 }));
      line.hours = round2(line.hours + hours);
      if (round2(hours) !== round2(s.scheduled)) changes.push({ date: s.date, project: s.project, from: s.scheduled, to: round2(hours) });
    }
    return { lines, changes };
  }

  // Hours, labor, expenses, tax and total for an invoice. Bad numbers count as zero.
  function totals({ lines, rate, expenses, taxRate }) {
    const hours = round2(lines.reduce((t, l) => t + nonNeg(l.hours), 0));
    const labor = round2(hours * nonNeg(rate));
    const exp = round2((expenses || []).reduce((t, e) => t + nonNeg(e.amount), 0));
    const subtotal = round2(labor + exp);
    const tax = round2(subtotal * nonNeg(taxRate));
    return { hours, labor, expenses: exp, subtotal, tax, total: round2(subtotal + tax) };
  }

  // JT-20260817-1: initials, the date it was sent, and which try this is.
  function invoiceNumber(name, dateISO, attempt) {
    const initials = String(name).trim().split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
    return `${initials}-${dateISO.replace(/-/g, "")}-${attempt}`;
  }

  // Which saved details changed on this invoice, so the person can keep them or not.
  function changedDefaults(saved, draft, fields) {
    return fields.filter((f) => String(saved[f]) !== String(draft[f])).map((f) => ({ field: f, from: saved[f], to: draft[f] }));
  }

  // Month, quarter or year to date, ending today.
  function periodRange(kind, todayISO) {
    const d = parse(todayISO);
    const y = d.getUTCFullYear(), m = d.getUTCMonth();
    const startMonth = kind === "mtd" ? m : kind === "qtd" ? m - (m % 3) : 0;
    return { start: iso(new Date(Date.UTC(y, startMonth, 1, 12))), end: todayISO };
  }

  // Contractor spend in a date range. An invoice counts on the day its work period ended.
  // Approved invoices are paid; waiting ones are shown apart. Labor by project is before tax.
  function finance(invoices, range, people, projects) {
    const inRange = invoices.filter((i) => i.period.end >= range.start && i.period.end <= range.end);
    const paidInv = inRange.filter((i) => i.status === "approved");
    const waitInv = inRange.filter((i) => i.status === "waiting");
    const sum = (list, f) => round2(list.reduce((t, i) => t + f(i), 0));
    const byProject = projects
      .map((project) => {
        let labor = 0, hours = 0;
        for (const i of paidInv) for (const l of i.lines) if (l.project === project) { hours += nonNeg(l.hours); labor += nonNeg(l.hours) * i.rate; }
        return { project, labor: round2(labor), hours: round2(hours) };
      })
      .filter((p) => p.hours > 0)
      .sort((a, b) => b.labor - a.labor);
    const byPerson = people
      .map((p) => {
        const mine = paidInv.filter((i) => i.from === p.id);
        return { person: p.id, hours: sum(mine, (i) => totals(i).hours), paid: sum(mine, (i) => totals(i).total) };
      })
      .filter((p) => p.hours > 0)
      .sort((a, b) => b.paid - a.paid);
    return {
      paid: sum(paidInv, (i) => totals(i).total),
      waiting: sum(waitInv, (i) => totals(i).total),
      waitingCount: waitInv.length,
      hours: sum(paidInv, (i) => totals(i).hours),
      byProject,
      byPerson,
      rows: [...paidInv, ...waitInv],
    };
  }

  const nextId = (list, prefix) => `${prefix}${list.reduce((m, x) => Math.max(m, Number(String(x.id).replace(/\D/g, "")) || 0), 0) + 1}`;

  const api = { addDays, minutes, shiftHours, doubleBooked, weekHours, attention, scheduledCost, invoiceFromShifts, totals, invoiceNumber, changedDefaults, periodRange, finance, nextId, round2 };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PortalLogic = api;
})(typeof self !== "undefined" ? self : this);
