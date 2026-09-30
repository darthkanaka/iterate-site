/* Portal demo, the made-up studio. Brightreef Studio is fictional: a small creative and
   tech studio with three contractors. Names, projects, rates and dates are invented.
   "Today" is Monday, August 17, 2026, so month, quarter and year to date all differ.
   Loaded before portal.js; Node tests require it directly. */
(function (root) {
  "use strict";

  const studio = { name: "Brightreef Studio", today: "2026-08-17" };
  const taxRate = 0.04712;

  const people = [
    { id: "mele", name: "Mele Kahale", first: "Mele", role: "Owner", owner: true },
    { id: "jesse", name: "Jesse Tran", first: "Jesse", role: "Designer", rate: 55 },
    { id: "noelani", name: "Noelani Ruiz", first: "Noelani", role: "Web developer", rate: 60 },
    { id: "sam", name: "Sam Okamura", first: "Sam", role: "Video editor", rate: 50 },
  ];
  const team = people.filter((p) => !p.owner);
  const rates = Object.fromEntries(team.map((p) => [p.id, p.rate]));
  const projects = ["Fall campaign", "Website refresh", "Launch video"];

  // This week's board, Monday Aug 17 to Sunday Aug 23. Jesse is double-booked on
  // Wednesday and over 40 hours; Noelani can't make Thursday.
  const week = { start: "2026-08-17" };
  const shifts = [
    { id: "S1", person: "jesse", date: "2026-08-17", start: "09:00", end: "17:00", project: "Fall campaign" },
    { id: "S2", person: "jesse", date: "2026-08-18", start: "09:00", end: "17:00", project: "Fall campaign" },
    { id: "S3", person: "jesse", date: "2026-08-19", start: "09:00", end: "17:00", project: "Fall campaign" },
    { id: "S4", person: "jesse", date: "2026-08-19", start: "07:30", end: "15:30", project: "Launch video" },
    { id: "S5", person: "jesse", date: "2026-08-20", start: "09:00", end: "17:00", project: "Fall campaign" },
    { id: "S6", person: "jesse", date: "2026-08-21", start: "09:00", end: "13:00", project: "Fall campaign" },
    { id: "S7", person: "noelani", date: "2026-08-17", start: "09:00", end: "17:00", project: "Website refresh" },
    { id: "S8", person: "noelani", date: "2026-08-18", start: "09:00", end: "17:00", project: "Website refresh" },
    { id: "S9", person: "noelani", date: "2026-08-19", start: "09:00", end: "17:00", project: "Website refresh" },
    { id: "S10", person: "noelani", date: "2026-08-20", start: "09:00", end: "17:00", project: "Website refresh", needsCover: true, note: "Family thing came up, sorry for the short notice." },
    { id: "S11", person: "sam", date: "2026-08-18", start: "10:00", end: "18:00", project: "Launch video" },
    { id: "S12", person: "sam", date: "2026-08-19", start: "07:30", end: "15:30", project: "Launch video" },
    { id: "S13", person: "sam", date: "2026-08-21", start: "10:00", end: "18:00", project: "Launch video" },
    { id: "S14", person: "sam", date: "2026-08-22", start: "08:00", end: "14:00", project: "Launch video" },
  ];

  // The pay period that just ended, and the shifts Jesse worked in it (82 hours).
  const period = { start: "2026-08-03", end: "2026-08-16", label: "Aug 3 to Aug 16, 2026" };
  const jesseWorked = [
    ["2026-08-03", "Fall campaign", 8], ["2026-08-04", "Fall campaign", 8], ["2026-08-05", "Fall campaign", 8], ["2026-08-06", "Fall campaign", 8],
    ["2026-08-07", "Launch video", 8], ["2026-08-08", "Launch video", 6],
    ["2026-08-10", "Fall campaign", 8], ["2026-08-11", "Fall campaign", 8], ["2026-08-12", "Launch video", 8], ["2026-08-13", "Fall campaign", 8], ["2026-08-14", "Fall campaign", 4],
  ].map(([date, project, hours]) => ({ date, project, scheduled: hours, hours }));

  // Invoice history. Pay periods run two weeks from Monday, Jan 5. Every contractor's
  // invoice through the period ending Aug 2 is approved; for the period just ended,
  // Sam's is approved, Noelani's is waiting, and Jesse hasn't sent his yet.
  const HOURS = {
    jesse: [80, 76, 80, 72, 80, 80, 64, 80, 80, 76, 80, 80, 72, 80, 80],
    noelani: [72, 72, 64, 72, 72, 80, 72, 72, 64, 72, 72, 72, 80, 72, 72],
    sam: [40, 48, 40, 40, 56, 40, 48, 40, 40, 48, 40, 40, 56, 48, 40],
  };
  const split = {
    jesse: (h) => [{ project: "Fall campaign", hours: h - 32 }, { project: "Launch video", hours: 32 }],
    noelani: (h) => [{ project: "Website refresh", hours: h }],
    sam: (h) => [{ project: "Launch video", hours: h - 8 }, { project: "Fall campaign", hours: 8 }],
  };
  const DAY = 86400000;
  const addDays = (d, n) => new Date(new Date(d + "T12:00:00Z").getTime() + n * DAY).toISOString().slice(0, 10);
  const label = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const periodOf = (k) => { const start = addDays("2026-01-05", 14 * k); const end = addDays(start, 13); return { start, end, label: `${label(start)} to ${label(end)}, 2026` }; };
  const initials = { jesse: "JT", noelani: "NR", sam: "SO" };
  const invoices = [];
  for (let k = 0; k < 15; k++) {
    const p = periodOf(k);
    for (const id of ["jesse", "noelani", "sam"]) {
      invoices.push({ id: `${initials[id]}-${addDays(p.end, 1).replace(/-/g, "")}-1`, from: id, period: p, lines: split[id](HOURS[id][k]), changes: [], rate: rates[id], taxRate, expenses: [], status: "approved", attempt: 1, comment: "" });
    }
  }
  invoices.push({ id: "SO-20260817-1", from: "sam", period, lines: split.sam(44), changes: [], rate: rates.sam, taxRate, expenses: [], status: "approved", attempt: 1, comment: "" });
  invoices.push({ id: "NR-20260817-1", from: "noelani", period, lines: split.noelani(76), changes: [], rate: rates.noelani, taxRate, expenses: [{ desc: "Test hosting account", amount: 45 }], status: "waiting", attempt: 1, comment: "" });

  // What Jesse saved last time. His next invoice starts from these.
  const saved = { jesse: { business: "Jesse Tran Design", payableTo: "Jesse Tran", rate: 55, terms: "Net 15" } };

  const data = { studio, taxRate, people, team, rates, projects, week, shifts, period, jesseWorked, invoices, saved };
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.PortalData = data;
})(typeof self !== "undefined" ? self : this);
