/* Portal demo: Brightreef Studio. One app seen from two sides: Jesse, a contractor, and
   Mele, the owner. The "View as" switch flips between them.
   Jesse: My schedule (his shifts, "can't make it") and My invoices (built from the
   shifts he worked). Mele: the schedule board (flags, add, move, cover, delete),
   Approvals, and Finance (month, quarter or year to date, CSV export).
   The Google Calendar sync badges are illustration only; nothing leaves the page.
   Everything lives in memory, so a refresh or Reset starts the studio over. */
(function () {
  "use strict";

  const root = document.getElementById("portal-app");
  const L = window.PortalLogic;
  const D = window.PortalData;
  if (!root || !L || !D) return;

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const personById = Object.fromEntries(D.people.map((p) => [p.id, p]));
  const OWNER = D.people.find((p) => p.owner);
  const MEMBER = personById.jesse;
  const DAYS = Array.from({ length: 7 }, (_, i) => L.addDays(D.week.start, i));

  function blankDraft(saved, from) {
    return {
      worked: from ? clone(from.worked) : clone(D.jesseWorked),
      rate: from ? from.rate : saved.rate,
      expenses: from ? clone(from.expenses) : [],
      attempt: from ? from.attempt + 1 : 1,
      fixing: from ? from.id : null,
      editingRate: false,
    };
  }
  function fresh() {
    const saved = clone(D.saved.jesse);
    return {
      as: "member",
      view: { owner: "board", member: "schedule" },
      shifts: clone(D.shifts),
      invoices: clone(D.invoices),
      saved,
      draft: blankDraft(saved),
      editing: null,
      cantMake: null,
      reviewing: null,
      confirmRate: false,
      range: "mtd",
      schedView: "list",
      picked: null,
      updates: [],
      unread: { schedule: 0, invoices: 0 },
    };
  }
  let S = fresh();

  // ── formatting ───────────────────────────────────────────────────────────
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const money = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const hrs = (n) => `${Number(Number(n).toFixed(2)).toLocaleString("en-US")} h`;
  const date = (d, opts) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
  const dayLong = (d) => date(d, { weekday: "short", month: "short", day: "numeric" });
  const dayShort = (d) => date(d, { month: "short", day: "numeric" });
  const clock = (t) => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
  const compact = (t) => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""}${h < 12 ? "a" : "p"}`; };
  const span = (s) => `${clock(s.start)} to ${clock(s.end)}`;
  const TIMES = Array.from({ length: 33 }, (_, i) => `${String(6 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
  const INV = { waiting: [`Waiting on ${OWNER.first}`, "pill-hot"], approved: ["Approved", "pill-quiet"], sentback: ["Sent back", "pill-dark"], replaced: ["Replaced", "pill-quiet"] };
  const pill = (key) => `<span class="pill ${INV[key][1]}">${INV[key][0]}</span>`;
  const person = () => (S.as === "owner" ? OWNER : MEMBER);
  const plural = (n, one, many) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
  const SYNC = `<p class="sync-live"><span class="live-dot" aria-hidden="true"></span>Google Calendar sync<span class="sr-only">, on</span></p>`;

  // ── shell ────────────────────────────────────────────────────────────────
  root.innerHTML = `
    <div class="app-bar">
      <div class="app-id"><span class="app-dot" aria-hidden="true">${esc(D.studio.name[0])}</span><div><p class="app-name">${esc(D.studio.name)}</p><p class="app-sub">Team portal</p></div></div>
      <div class="viewas" role="group" aria-label="View the portal as">
        <span class="viewas-label" aria-hidden="true">View as</span>
        <button type="button" class="viewas-btn" data-as="member" aria-pressed="true">${esc(MEMBER.first)}, contractor</button>
        <button type="button" class="viewas-btn" data-as="owner" aria-pressed="false">${esc(OWNER.first)}, owner</button>
      </div>
    </div>
    <div class="portal">
      <nav class="portal-nav" aria-label="Portal menu">
        <p class="portal-who" id="portal-who"></p>
        <ul id="portal-menu"></ul>
        <button type="button" class="app-btn app-btn-quiet portal-reset" data-act="reset">Reset demo</button>
      </nav>
      <div class="portal-main" id="portal-main"></div>
    </div>
    <p class="app-status" id="portal-status" role="status" aria-live="polite">Changes stay on this page. Refresh or reset to start over.</p>`;

  const $ = (sel) => root.querySelector(sel);
  const status = $("#portal-status");
  const say = (text) => { status.textContent = text; };

  // ── menu ─────────────────────────────────────────────────────────────────
  function menuItems() {
    if (S.as === "owner") {
      const need = L.attention(S.shifts, D.team).length;
      const waiting = S.invoices.filter((i) => i.status === "waiting").length;
      return [
        { id: "board", label: "Schedule board", badge: need, word: () => "need you" },
        { id: "approvals", label: "Approvals", badge: waiting, word: () => "waiting" },
        { id: "finance", label: "Finance", badge: 0 },
      ];
    }
    return [
      { id: "schedule", label: "My schedule", badge: S.unread.schedule, word: (n) => (n === 1 ? "new update" : "new updates") },
      { id: "invoices", label: "My invoices", badge: S.unread.invoices, word: (n) => (n === 1 ? "new update" : "new updates") },
    ];
  }
  function renderMenu() {
    const v = S.view[S.as];
    const p = person();
    $("#portal-who").innerHTML = `<span class="item-name">${esc(p.name)}</span><span class="item-sub">${esc(p.role)}</span>`;
    $("#portal-menu").innerHTML = menuItems().map((i) => `<li><button type="button" class="portal-link" data-view="${i.id}"${i.id === v ? ' aria-current="page"' : ""}>${i.label}${i.badge ? ` <span class="menu-badge" aria-hidden="true">${i.badge}</span><span class="sr-only">, ${i.badge} ${i.word(i.badge)}</span>` : ""}</button></li>`).join("");
  }

  const head = (title, text) => `<div class="panel-head"><div><h2 tabindex="-1" id="view-title">${title}</h2>${text ? `<p>${text}</p>` : ""}</div></div>`;
  function renderMain(focus) {
    const v = S.view[S.as];
    if (S.as === "member") S.unread[v] = 0;
    const views = S.as === "owner" ? { board: ownerBoard, approvals: ownerApprovals, finance: ownerFinance } : { schedule: memberSchedule, invoices: memberInvoices };
    $("#portal-main").innerHTML = views[v]();
    renderMenu();
    if (focus) { const el = (typeof focus === "string" && $(focus)) || $("#view-title"); if (el) el.focus(); }
  }

  // ── Jesse: my schedule ───────────────────────────────────────────────────
  function cantForm() {
    return `<form class="pform cant-form" data-form="cant" novalidate>
      <div class="pfield"><label for="cant-note">Let ${esc(OWNER.first)} know why, if you want to</label><textarea id="cant-note" rows="2"></textarea></div>
      <div class="notice-actions"><button type="submit" class="app-btn app-btn-primary">Tell ${esc(OWNER.first)}</button><button type="button" class="app-btn app-btn-quiet" data-act="cancel-cant">Cancel</button></div>
    </form>`;
  }
  const cantButton = (s) => `<button type="button" class="app-btn" data-cant="${s.id}">Can't make it<span class="sr-only">, ${dayLong(s.date)}</span></button>`;
  function listView(mine) {
    return `<ul class="shift-list">${mine.map((s) => `<li class="shift-row${s.needsCover ? " is-cover" : ""}" data-shift="${s.id}">
        <div class="shift-when"><span class="item-name">${dayLong(s.date)}</span><span class="item-sub">${span(s)} · ${hrs(L.shiftHours(s))}</span></div>
        <div class="shift-what" tabindex="-1">${esc(s.project)}${s.needsCover ? ` <span class="pill pill-dark">Waiting on cover</span>` : ""}</div>
        <div class="shift-act">${s.needsCover || S.cantMake === s.id ? "" : cantButton(s)}</div>
        ${S.cantMake === s.id ? cantForm() : ""}
      </li>`).join("")}</ul>`;
  }
  // A week calendar: days across, time down, each shift placed by its clock times.
  // Shifts that overlap on the same day sit side by side.
  function calendarView(mine) {
    const startH = Math.min(7, ...mine.map((s) => Math.floor(L.minutes(s.start) / 60)));
    const endH = Math.max(18, ...mine.map((s) => Math.ceil(L.minutes(s.end) / 60)));
    const total = (endH - startH) * 60;
    const pct = (min) => ((min - startH * 60) / total) * 100;
    const blocks = (d) => {
      const day = mine.filter((s) => s.date === d).sort((a, b) => a.start.localeCompare(b.start));
      const laneEnds = [];
      const placed = day.map((s) => {
        let lane = laneEnds.findIndex((end) => end <= L.minutes(s.start));
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
        laneEnds[lane] = L.minutes(s.end);
        return { s, lane };
      });
      const lanes = Math.max(1, laneEnds.length);
      return placed.map(({ s, lane }) => `<button type="button" class="cal-block${s.needsCover ? " is-cover" : ""}${S.picked === s.id ? " is-picked" : ""}" data-pick="${s.id}" style="top:${pct(L.minutes(s.start)).toFixed(3)}%;height:${(pct(L.minutes(s.end)) - pct(L.minutes(s.start))).toFixed(3)}%;left:${((lane / lanes) * 100).toFixed(3)}%;width:${(100 / lanes).toFixed(3)}%"><span class="sr-only">${dayLong(s.date)}, ${span(s)}, </span><span class="chip-time" aria-hidden="true">${compact(s.start)}–${compact(s.end)}</span><span class="chip-proj">${esc(s.project)}</span>${s.needsCover ? `<span class="chip-flag">Waiting on cover</span>` : ""}</button>`).join("");
    };
    const hours = Array.from({ length: endH - startH + 1 }, (_, i) => startH + i);
    const picked = S.picked && mine.find((s) => s.id === S.picked);
    const detail = picked
      ? `<section class="cal-detail" aria-labelledby="pick-title">
          <h3 id="pick-title" tabindex="-1">${dayLong(picked.date)}</h3>
          <p>${span(picked)} · ${hrs(L.shiftHours(picked))} · ${esc(picked.project)}${picked.needsCover ? ` <span class="pill pill-dark">Waiting on cover</span>` : ""}</p>
          ${S.cantMake === picked.id ? cantForm() : `<div class="notice-actions">${picked.needsCover ? "" : cantButton(picked)}<button type="button" class="app-btn app-btn-quiet" data-act="close-pick">Close</button></div>`}
        </section>`
      : `<p class="item-sub cal-hint">Pick a shift to see it or call out of it.</p>`;
    return `<div class="cal-wrap" role="region" aria-label="My week as a calendar" tabindex="0">
        <div class="cal" style="--hours:${endH - startH}">
          <div class="cal-corner" aria-hidden="true"></div>
          ${DAYS.map((d) => `<div class="cal-dayhead${d === D.studio.today ? " is-today" : ""}"><span class="day-name">${date(d, { weekday: "short" })}</span><span class="item-sub">${dayShort(d)}</span></div>`).join("")}
          <div class="cal-times" aria-hidden="true">${hours.map((h) => `<span style="top:${pct(h * 60).toFixed(3)}%">${h % 12 || 12}${h < 12 ? " AM" : " PM"}</span>`).join("")}</div>
          ${DAYS.map((d) => `<div class="cal-day${d === D.studio.today ? " is-today" : ""}" data-day="${d}">${blocks(d)}</div>`).join("")}
        </div>
      </div>
      ${detail}`;
  }
  function memberSchedule() {
    const mine = S.shifts.filter((s) => s.person === MEMBER.id).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const updates = S.updates.length
      ? `<section class="updates" aria-labelledby="updates-title"><h3 id="updates-title">Updates from ${esc(OWNER.first)}</h3><ul>${S.updates.map((u) => `<li>${esc(u)}</li>`).join("")}</ul></section>`
      : "";
    return `${head("My schedule", `This week, ${dayShort(DAYS[0])} to ${dayShort(DAYS[6])}.`)}
      <div class="sched-bar">
        <div class="range" role="group" aria-label="Show my week as">${[["list", "List"], ["calendar", "Calendar"]].map(([id, label]) => `<button type="button" class="range-btn" data-schedview="${id}" aria-pressed="${S.schedView === id}">${label}</button>`).join("")}</div>
        ${SYNC}
      </div>
      ${updates}
      ${S.schedView === "calendar" ? calendarView(mine) : listView(mine)}
      <p class="week-total"><strong>${hrs(L.weekHours(S.shifts, MEMBER.id))}</strong> scheduled this week</p>`;
  }

  // ── Jesse: my invoices ───────────────────────────────────────────────────
  const memberCurrent = () => S.invoices.find((i) => i.from === MEMBER.id && i.period.start === D.period.start && i.status !== "replaced");
  function memberInvoices() {
    const cur = memberCurrent();
    const earlier = S.invoices.filter((i) => i.from === MEMBER.id && i !== cur).sort((a, b) => b.period.end.localeCompare(a.period.end) || b.attempt - a.attempt).slice(0, 3);
    let top;
    if (cur && cur.status === "sentback" && !S.draft.fixing) {
      top = `<div class="notice notice-dark" role="note"><p><strong>${esc(OWNER.first)} sent back ${esc(cur.id)}.</strong> “${esc(cur.comment)}”</p><button type="button" class="app-btn app-btn-primary" data-act="fix">Fix and resubmit</button></div>`;
    } else if (cur && !S.draft.fixing) {
      top = `<div class="inv-card"><div class="req-top"><h3>${esc(cur.id)} · ${esc(cur.period.label)}</h3>${pill(cur.status)}</div>${invoiceLines(cur)}</div>`;
    } else {
      top = invoiceForm();
    }
    return `${head("My invoices", `Pay period ${esc(D.period.label)}.`)}${top}
      <h3 class="section-title">Earlier invoices</h3>
      <table class="app-table">
        <caption class="sr-only">Earlier invoices</caption>
        <thead><tr><th scope="col">Invoice</th><th scope="col">Period</th><th scope="col" class="num">Total</th><th scope="col">Status</th></tr></thead>
        <tbody>${earlier.map((i) => `<tr><td class="cell-item"><span class="item-name">${esc(i.id)}</span></td><td data-label="Period">${esc(i.period.label)}</td><td class="num" data-label="Total">${money(L.totals(i).total)}</td><td data-label="Status">${pill(i.status)}</td></tr>`).join("")}</tbody>
      </table>`;
  }
  function draftTotals() {
    const d = S.draft;
    return L.totals({ lines: L.invoiceFromShifts(d.worked).lines, rate: d.rate, expenses: d.expenses, taxRate: D.taxRate });
  }
  const totalsList = (t) => `
    <div><dt>Hours</dt><dd>${hrs(t.hours)}</dd></div>
    <div><dt>Labor</dt><dd>${money(t.labor)}</dd></div>
    <div><dt>Expenses</dt><dd>${money(t.expenses)}</dd></div>
    <div><dt>Hawaiʻi GET</dt><dd>${money(t.tax)}</dd></div>
    <div class="grand"><dt>Total</dt><dd>${money(t.total)}</dd></div>`;
  function invoiceForm() {
    const d = S.draft;
    return `<form class="pform inv-form" data-form="invoice" novalidate>
      <h3>${d.fixing ? `Fixing ${esc(d.fixing)}` : "This period's invoice"}</h3>
      <p class="item-sub">It's built from the shifts you worked on the schedule. Fix any day that ran long or short.</p>
      <div class="saved">
        <p><span class="item-sub">Bill from</span>${esc(S.saved.business)}</p>
        <p><span class="item-sub">Payable to</span>${esc(S.saved.payableTo)}</p>
        <p><span class="item-sub">Terms</span>${esc(S.saved.terms)}</p>
        <div class="saved-rate">
          ${d.editingRate
            ? `<label for="inv-rate" class="item-sub">Hourly rate</label><span class="money-in">$<input id="inv-rate" type="number" inputmode="decimal" min="0" step="1" value="${esc(d.rate)}"></span>`
            : `<p><span class="item-sub">Hourly rate</span>${money(Number(d.rate))}</p><button type="button" class="app-btn app-btn-quiet" data-act="edit-rate">Edit<span class="sr-only"> hourly rate</span></button>`}
        </div>
      </div>
      <table class="app-table keep worked">
        <caption class="sr-only">Shifts worked, ${esc(D.period.label)}</caption>
        <thead><tr><th scope="col">Shift</th><th scope="col" class="num">Hours worked</th></tr></thead>
        <tbody>${d.worked.map((w, i) => `<tr><td><span class="item-name">${dayLong(w.date)}</span><span class="item-sub">${esc(w.project)}, ${hrs(w.scheduled)} scheduled</span></td><td class="num"><label class="sr-only" for="worked-${i}">Hours worked, ${dayLong(w.date)}</label><input class="hours-cell" id="worked-${i}" data-worked="${i}" type="number" inputmode="decimal" min="0" max="24" step="0.5" value="${esc(w.hours)}"></td></tr>`).join("")}</tbody>
      </table>
      <fieldset class="expenses"><legend>Expenses</legend>
        ${d.expenses.length ? d.expenses.map((e, i) => `<div class="expense">
          <div class="pfield"><label for="exp-desc-${i}">What for</label><input id="exp-desc-${i}" data-exp-desc="${i}" type="text" value="${esc(e.desc)}"></div>
          <div class="pfield"><label for="exp-amt-${i}">Amount</label><span class="money-in">$<input id="exp-amt-${i}" data-exp-amt="${i}" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(e.amount)}"></span></div>
          <button type="button" class="app-btn app-btn-quiet" data-remove-exp="${i}">Remove<span class="sr-only"> expense ${i + 1}</span></button>
        </div>`).join("") : `<p class="item-sub">No expenses this period.</p>`}
        <button type="button" class="app-btn" data-act="add-exp">Add an expense</button>
      </fieldset>
      <dl class="inv-totals" id="inv-totals">${totalsList(draftTotals())}</dl>
      ${S.confirmRate
        ? `<div class="notice" id="rate-confirm" tabindex="-1"><p><strong>Your rate changed from ${money(Number(S.saved.rate))} to ${money(Number(d.rate))}.</strong> Save it for next time?</p><div class="notice-actions"><button type="button" class="app-btn app-btn-primary" data-act="submit-save">Save it and send</button><button type="button" class="app-btn" data-act="submit-once">Just this invoice</button></div></div>`
        : `<button type="submit" class="app-btn app-btn-primary">Send to ${esc(OWNER.first)}</button>`}
    </form>`;
  }
  function submitInvoice(saveRate) {
    const d = S.draft;
    if (saveRate) S.saved.rate = Number(d.rate);
    if (d.fixing) { const old = S.invoices.find((i) => i.id === d.fixing); if (old) old.status = "replaced"; }
    const worked = d.worked.map((w) => ({ ...w, hours: Math.max(0, Number(w.hours) || 0) }));
    const built = L.invoiceFromShifts(worked);
    const inv = {
      id: L.invoiceNumber(MEMBER.name, D.studio.today, d.attempt),
      from: MEMBER.id,
      period: clone(D.period),
      worked,
      lines: built.lines,
      changes: built.changes,
      rate: Math.max(0, Number(d.rate) || 0),
      taxRate: D.taxRate,
      expenses: d.expenses.filter((e) => String(e.desc).trim() || Number(e.amount) > 0).map((e) => ({ desc: String(e.desc).trim(), amount: Math.max(0, Number(e.amount) || 0) })),
      status: "waiting",
      attempt: d.attempt,
      comment: "",
    };
    S.invoices.push(inv);
    S.draft = blankDraft(S.saved);
    S.confirmRate = false;
    renderMain(true);
    say(`${inv.id} sent to ${OWNER.first} for approval, ${money(L.totals(inv).total)}.${saveRate ? " Your new rate is saved for next time." : ""}`);
  }

  // ── shared: an invoice's lines ───────────────────────────────────────────
  function invoiceLines(inv) {
    const t = L.totals(inv);
    const changes = inv.changes && inv.changes.length
      ? `<div class="changes"><p class="item-name">Changed from the schedule</p><ul>${inv.changes.map((c) => `<li>${dayLong(c.date)}, ${esc(c.project)}: ${hrs(c.from)} scheduled, ${hrs(c.to)} worked</li>`).join("")}</ul></div>`
      : "";
    return `<table class="app-table keep inv-lines">
        <caption class="sr-only">Invoice ${esc(inv.id)}</caption>
        <thead><tr><th scope="col">Line</th><th scope="col" class="num">Amount</th></tr></thead>
        <tbody>
          ${inv.lines.map((l) => `<tr><td>${esc(l.project)}, ${hrs(l.hours)} × ${money(Number(inv.rate))}</td><td class="num">${money(L.round2(Number(l.hours) * Number(inv.rate)))}</td></tr>`).join("")}
          ${inv.expenses.map((e) => `<tr><td>Expense, ${esc(e.desc || "no description")}</td><td class="num">${money(Number(e.amount) || 0)}</td></tr>`).join("")}
        </tbody>
        <tfoot>
          <tr class="sub"><td>Subtotal</td><td class="num">${money(t.subtotal)}</td></tr>
          <tr class="sub"><td>Hawaiʻi GET ${(inv.taxRate * 100).toFixed(3)}%</td><td class="num">${money(t.tax)}</td></tr>
          <tr><td>Total</td><td class="num">${money(t.total)}</td></tr>
        </tfoot>
      </table>${changes}`;
  }

  // ── Mele: schedule board ─────────────────────────────────────────────────
  function attentionText(item) {
    const p = personById[item.person];
    if (item.kind === "double") return `${p.first} is double-booked on ${dayLong(item.date)}.`;
    if (item.kind === "cover") { const s = S.shifts.find((x) => x.id === item.shiftId); return `${p.first} can't make ${dayLong(item.date)}${s.note ? `: “${esc(s.note)}”` : "."}`; }
    return `${p.first} is scheduled for ${hrs(item.hours)} this week, over 40.`;
  }
  function chip(s, doubled) {
    const flag = s.needsCover ? "Needs cover" : doubled.has(s.id) ? "Double-booked" : "";
    return `<button type="button" class="chip${s.needsCover ? " is-cover" : doubled.has(s.id) ? " is-double" : ""}" data-edit="${s.id}"><span class="sr-only">${esc(personById[s.person].name)}, ${dayLong(s.date)}, ${span(s)}, </span><span class="chip-time" aria-hidden="true">${compact(s.start)}–${compact(s.end)}</span><span class="chip-proj">${esc(s.project)}</span>${flag ? `<span class="chip-flag">${flag}</span>` : ""}<span class="sr-only">. Change this shift</span></button>`;
  }
  function editor() {
    const e = S.editing;
    const s = e.id ? S.shifts.find((x) => x.id === e.id) : null;
    const f = e.fields;
    const title = s ? `Change ${esc(personById[s.person].first)}'s shift on ${dayLong(s.date)}` : "Add a shift";
    const opt = (list, val, label = (x) => x) => list.map((x) => `<option value="${esc(x)}"${x === val ? " selected" : ""}>${esc(label(x))}</option>`).join("");
    return `<section class="editor" aria-labelledby="ed-title">
      <h3 id="ed-title" tabindex="-1">${title}</h3>
      ${s && s.needsCover ? `<p class="item-sub">${esc(personById[s.person].first)} can't make this one. Pick who covers it and save.</p>` : ""}
      <form data-form="shift" novalidate>
        <div class="editor-grid">
          <div class="pfield"><label for="ed-person">Who</label><select id="ed-person">${opt(D.team.map((p) => p.id), f.person, (id) => personById[id].name)}</select></div>
          <div class="pfield"><label for="ed-date">Day</label><select id="ed-date">${opt(DAYS, f.date, dayLong)}</select></div>
          <div class="pfield"><label for="ed-start">Starts</label><select id="ed-start">${opt(TIMES, f.start, clock)}</select></div>
          <div class="pfield"><label for="ed-end">Ends</label><select id="ed-end" aria-describedby="ed-end-error">${opt(TIMES, f.end, clock)}</select></div>
          <div class="pfield"><label for="ed-project">Project</label><select id="ed-project">${opt(D.projects, f.project)}</select></div>
        </div>
        <p class="perror" id="ed-end-error" hidden>The shift has to end after it starts.</p>
        <div class="notice-actions">
          <button type="submit" class="app-btn app-btn-primary">Save shift</button>
          ${s ? `<button type="button" class="app-btn" data-act="delete-shift">Delete shift</button>` : ""}
          <button type="button" class="app-btn app-btn-quiet" data-act="cancel-edit">Cancel</button>
        </div>
      </form>
    </section>`;
  }
  function ownerBoard() {
    const items = L.attention(S.shifts, D.team);
    const doubled = L.doubleBooked(S.shifts);
    const attention = items.length
      ? `<section class="attention" aria-labelledby="att-title"><h3 id="att-title">${plural(items.length, "thing needs", "things need")} you</h3><ul>${items.map((i) => `<li><span>${attentionText(i)}</span>${i.shiftId ? `<button type="button" class="app-btn" data-edit="${i.shiftId}">Fix it<span class="sr-only">, ${esc(personById[i.person].first)} on ${dayLong(i.date)}</span></button>` : ""}</li>`).join("")}</ul></section>`
      : `<p class="all-clear">Nothing needs you right now. The week is covered.</p>`;
    return `${head("Schedule board", `${dayShort(DAYS[0])} to ${dayShort(DAYS[6])}. Pick a shift to change it, or a plus to add one.`)}
      <div class="sched-bar">${SYNC}</div>
      ${attention}
      ${S.editing ? editor() : ""}
      <div class="board-wrap" role="region" aria-label="This week's schedule" tabindex="0">
        <table class="board">
          <caption class="sr-only">Shifts by person and day, ${dayShort(DAYS[0])} to ${dayShort(DAYS[6])}</caption>
          <thead><tr><th scope="col">Person</th>${DAYS.map((d) => `<th scope="col"><span class="day-name">${date(d, { weekday: "short" })}</span><span class="item-sub">${dayShort(d)}</span></th>`).join("")}<th scope="col" class="num">Week</th></tr></thead>
          <tbody>${D.team.map((p) => {
            const h = L.weekHours(S.shifts, p.id);
            return `<tr><th scope="row"><span class="item-name">${esc(p.first)}</span><span class="item-sub">${esc(p.role)}</span></th>
              ${DAYS.map((d) => `<td>${S.shifts.filter((s) => s.person === p.id && s.date === d).sort((a, b) => a.start.localeCompare(b.start)).map((s) => chip(s, doubled)).join("")}<button type="button" class="add-shift" data-add="${p.id}|${d}"><span aria-hidden="true">+</span><span class="sr-only">Add a shift for ${esc(p.first)} on ${dayLong(d)}</span></button></td>`).join("")}
              <td class="num week-cell"><span class="item-name">${hrs(h)}</span>${h > 40 ? `<span class="pill pill-hot">Over 40</span>` : ""}<span class="item-sub">${money(L.round2(h * p.rate))}</span></td></tr>`;
          }).join("")}</tbody>
        </table>
      </div>
      <p class="board-total">Scheduled this week, <strong>${money(L.scheduledCost(S.shifts, D.rates))}</strong> in contractor pay before GET.</p>`;
  }
  function openEditor(id, add) {
    if (id) {
      const s = S.shifts.find((x) => x.id === id);
      S.editing = { id, fields: { person: s.person, date: s.date, start: s.start, end: s.end, project: s.project } };
    } else {
      const [p, d] = add.split("|");
      S.editing = { id: null, fields: { person: p, date: d, start: "09:00", end: "17:00", project: D.projects[0] } };
    }
    renderMain("#ed-title");
  }
  function tellJesse(text) {
    S.updates.unshift(`${text} Your Google Calendar is updated.`);
    S.unread.schedule += 1;
  }
  function saveShift() {
    const f = { person: $("#ed-person").value, date: $("#ed-date").value, start: $("#ed-start").value, end: $("#ed-end").value, project: $("#ed-project").value };
    if (L.minutes(f.end) <= L.minutes(f.start)) {
      S.editing.fields = f;
      showError("ed-end", true);
      return;
    }
    const J = MEMBER.id;
    let s;
    if (S.editing.id) {
      s = S.shifts.find((x) => x.id === S.editing.id);
      const was = { ...s };
      Object.assign(s, f);
      if (was.person !== s.person) { s.needsCover = false; s.note = ""; }
      if (was.person === J && s.person !== J) tellJesse(`${OWNER.first} moved your ${dayLong(was.date)} shift to ${personById[s.person].first}.`);
      else if (was.person !== J && s.person === J) tellJesse(`${OWNER.first} gave you a shift on ${dayLong(s.date)}, ${span(s)}.`);
      else if (s.person === J && (was.date !== s.date || was.start !== s.start || was.end !== s.end || was.project !== s.project)) tellJesse(`${OWNER.first} changed your ${dayLong(was.date)} shift to ${dayLong(s.date)}, ${span(s)}.`);
    } else {
      s = { id: L.nextId(S.shifts, "S"), ...f };
      S.shifts.push(s);
      if (s.person === J) tellJesse(`${OWNER.first} added a shift for you on ${dayLong(s.date)}, ${span(s)}.`);
    }
    S.editing = null;
    renderMain(`.chip[data-edit="${s.id}"]`);
    say(`Saved. ${personById[s.person].first}'s Google Calendar is updated and their phone gets the usual alert.`);
  }
  function deleteShift() {
    const s = S.shifts.find((x) => x.id === S.editing.id);
    S.shifts = S.shifts.filter((x) => x.id !== s.id);
    if (s.person === MEMBER.id) tellJesse(`${OWNER.first} removed your ${dayLong(s.date)} shift, ${span(s)}.`);
    S.editing = null;
    renderMain(true);
    say(`Shift deleted. It's off ${personById[s.person].first}'s Google Calendar too.`);
  }

  // ── Mele: approvals ──────────────────────────────────────────────────────
  function ownerApprovals() {
    if (S.reviewing) return ownerReview(S.invoices.find((i) => i.id === S.reviewing));
    const waiting = S.invoices.filter((i) => i.status === "waiting");
    const handled = S.invoices.filter((i) => (i.status === "approved" || i.status === "sentback") && i.period.start === D.period.start);
    const table = (list, cap, review) => `<table class="app-table">
        <caption class="sr-only">${cap}</caption>
        <thead><tr><th scope="col">Invoice</th><th scope="col">From</th><th scope="col" class="num">Total</th><th scope="col">${review ? '<span class="sr-only">Review</span>' : "Status"}</th></tr></thead>
        <tbody>${list.map((i) => `<tr data-inv="${i.id}"><td class="cell-item"><span class="item-name">${esc(i.id)}</span><span class="item-sub">${esc(i.period.label)}</span></td><td data-label="From">${esc(personById[i.from].first)}</td><td class="num" data-label="Total">${money(L.totals(i).total)}</td><td class="num cell-action">${review ? `<button type="button" class="app-btn" data-review="${i.id}">Review<span class="sr-only"> ${esc(i.id)}</span></button>` : pill(i.status)}</td></tr>`).join("")}</tbody>
      </table>`;
    return `${head("Approvals", "Contractor invoices waiting on you. Approve them or send them back with a note.")}
      ${waiting.length ? table(waiting, "Invoices waiting for approval", true) : `<p class="list-empty">Nothing waiting. You're all caught up.</p>`}
      ${handled.length ? `<h3 class="section-title">This pay period, handled</h3>${table(handled, "Invoices already handled this pay period", false)}` : ""}`;
  }
  function ownerReview(inv) {
    const from = personById[inv.from];
    return `<button type="button" class="app-btn app-btn-quiet back" data-act="back-approvals">Back to approvals</button>
      ${head(esc(inv.id), `From ${esc(from.name)}, ${esc(inv.period.label)}.${inv.attempt > 1 ? " A resubmitted invoice." : ""}`)}
      ${invoiceLines(inv)}
      <div class="decide">
        <button type="button" class="app-btn app-btn-primary" data-act="approve">Approve</button>
        <form class="pform sendback" data-form="sendback" novalidate>
          <div class="pfield"><label for="sb-note">Or send it back with a note</label><textarea id="sb-note" rows="2" aria-describedby="sb-note-error"></textarea><p class="perror" id="sb-note-error" hidden>Tell ${esc(from.first)} what to fix first.</p></div>
          <button type="submit" class="app-btn">Send back</button>
        </form>
      </div>`;
  }

  // ── Mele: finance ────────────────────────────────────────────────────────
  const RANGES = [["mtd", "Month to date"], ["qtd", "Quarter to date"], ["ytd", "Year to date"]];
  function currentFinance() {
    const range = L.periodRange(S.range, D.studio.today);
    return { range, f: L.finance(S.invoices, range, D.team, D.projects) };
  }
  function ownerFinance() {
    const { range, f } = currentFinance();
    const max = Math.max(1, ...f.byProject.map((p) => p.labor));
    const paidCount = f.rows.filter((i) => i.status === "approved").length;
    return `${head("Finance", "Contractor pay, counted on the day each pay period ended. Approve an invoice and it lands here.")}
      <div class="fin-controls">
        <div class="range" role="group" aria-label="Date range">${RANGES.map(([id, label]) => `<button type="button" class="range-btn" data-range="${id}" aria-pressed="${S.range === id}">${label}</button>`).join("")}</div>
        <p class="item-sub fin-dates">${date(range.start, { month: "short", day: "numeric" })} to ${date(range.end, { month: "short", day: "numeric", year: "numeric" })}</p>
        <button type="button" class="app-btn" data-act="export">Export CSV</button>
      </div>
      <div class="stats">
        <div class="stat stat-hero"><p class="stat-label">Paid to contractors</p><p class="stat-value" id="fin-paid">${money(f.paid)}</p><p class="stat-sub">${plural(paidCount, "invoice", "invoices")}, GET included</p></div>
        <div class="stat"><p class="stat-label">Waiting on approval</p><p class="stat-value" id="fin-waiting">${money(f.waiting)}</p><p class="stat-sub">${plural(f.waitingCount, "invoice", "invoices")}</p></div>
        <div class="stat"><p class="stat-label">Hours paid</p><p class="stat-value" id="fin-hours">${hrs(f.hours)}</p></div>
        <div class="stat"><p class="stat-label">Scheduled this week</p><p class="stat-value" id="fin-sched">${money(L.scheduledCost(S.shifts, D.rates))}</p><p class="stat-sub">before GET</p></div>
      </div>
      <div class="fin-grid">
        <section aria-labelledby="fin-proj-title">
          <h3 class="section-title" id="fin-proj-title">Labor by project, before GET</h3>
          <table class="app-table keep bars">
            <caption class="sr-only">Labor by project</caption>
            <thead><tr><th scope="col">Project</th><th scope="col">Labor</th></tr></thead>
            <tbody>${f.byProject.map((p) => `<tr data-project="${esc(p.project)}"><th scope="row">${esc(p.project)}</th><td><span class="bar-row"><span class="bar" style="width:${((p.labor / max) * 100).toFixed(1)}%" aria-hidden="true"></span><span class="bar-value">${money(p.labor)} · ${hrs(p.hours)}</span></span></td></tr>`).join("")}</tbody>
          </table>
        </section>
        <section aria-labelledby="fin-person-title">
          <h3 class="section-title" id="fin-person-title">By person</h3>
          <table class="app-table keep">
            <caption class="sr-only">Paid by person</caption>
            <thead><tr><th scope="col">Person</th><th scope="col" class="num">Hours</th><th scope="col" class="num">Paid</th></tr></thead>
            <tbody>${f.byPerson.map((p) => `<tr data-person="${p.person}"><th scope="row">${esc(personById[p.person].name)}</th><td class="num">${hrs(p.hours)}</td><td class="num">${money(p.paid)}</td></tr>`).join("")}</tbody>
          </table>
        </section>
      </div>`;
  }
  function exportCsv() {
    const { f } = currentFinance();
    const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [["Invoice", "Person", "Period", "Hours", "Labor", "Expenses", "GET", "Total", "Status"]];
    for (const i of f.rows) { const t = L.totals(i); rows.push([i.id, personById[i.from].name, i.period.label, t.hours, t.labor.toFixed(2), t.expenses.toFixed(2), t.tax.toFixed(2), t.total.toFixed(2), i.status === "approved" ? "Paid" : "Waiting"]); }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(cell).join(",")).join("\n")], { type: "text/csv" }));
    a.download = `brightreef-finance-${S.range}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    say(`Downloaded ${plural(f.rows.length, "invoice", "invoices")} as a CSV.`);
  }

  // ── actions ──────────────────────────────────────────────────────────────
  function switchAs(as) {
    if (S.as === as) return;
    S.as = as;
    S.editing = null;
    S.reviewing = null;
    S.cantMake = null;
    S.picked = null;
    root.querySelectorAll("[data-as]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.as === as ? "true" : "false"));
    renderMain();
    const p = person();
    say(`Viewing as ${p.name}, ${p.role.toLowerCase()}.`);
  }
  function showError(id, on) {
    const err = $(`#${id}-error`);
    const field = $(`#${id}`);
    if (err) err.hidden = !on;
    if (field) { if (on) field.setAttribute("aria-invalid", "true"); else field.removeAttribute("aria-invalid"); }
    if (on && field) field.focus();
  }

  root.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t || !root.contains(t)) return;
    const ds = t.dataset;
    if (ds.as) return switchAs(ds.as);
    if (ds.view) { S.view[S.as] = ds.view; S.editing = null; S.reviewing = null; S.cantMake = null; return renderMain(true); }
    if (ds.edit) return openEditor(ds.edit);
    if (ds.add) return openEditor(null, ds.add);
    if (ds.cant) { S.cantMake = ds.cant; return renderMain("#cant-note"); }
    if (ds.schedview) { S.schedView = ds.schedview; S.picked = null; S.cantMake = null; return renderMain(`[data-schedview="${ds.schedview}"]`); }
    if (ds.pick) { S.picked = ds.pick; S.cantMake = null; return renderMain("#pick-title"); }
    if (ds.review) { S.reviewing = ds.review; return renderMain(true); }
    if (ds.range) {
      S.range = ds.range;
      renderMain(`[data-range="${ds.range}"]`);
      const label = RANGES.find(([id]) => id === ds.range)[1].toLowerCase();
      return say(`Showing ${label}. ${money(currentFinance().f.paid)} paid to contractors.`);
    }
    if (ds.removeExp !== undefined) { S.draft.expenses.splice(Number(ds.removeExp), 1); return renderMain('[data-act="add-exp"]'); }
    switch (ds.act) {
      case "cancel-cant": { const id = S.cantMake; S.cantMake = null; return renderMain(`[data-cant="${id}"]`); }
      case "close-pick": { const id = S.picked; S.picked = null; return renderMain(`[data-pick="${id}"]`); }
      case "cancel-edit": { const id = S.editing.id; S.editing = null; return renderMain(id ? `.chip[data-edit="${id}"]` : true); }
      case "delete-shift": return deleteShift();
      case "back-approvals": { const id = S.reviewing; S.reviewing = null; return renderMain(`[data-review="${id}"]`); }
      case "edit-rate": S.draft.editingRate = true; return renderMain("#inv-rate");
      case "add-exp": S.draft.expenses.push({ desc: "", amount: "" }); return renderMain(`#exp-desc-${S.draft.expenses.length - 1}`);
      case "fix": S.draft = blankDraft(S.saved, memberCurrent()); return renderMain(true);
      case "submit-save": return submitInvoice(true);
      case "submit-once": return submitInvoice(false);
      case "export": return exportCsv();
      case "approve": {
        const inv = S.invoices.find((i) => i.id === S.reviewing);
        inv.status = "approved";
        S.reviewing = null;
        if (inv.from === MEMBER.id) S.unread.invoices += 1;
        renderMain(true);
        return say(`Approved ${inv.id} for ${money(L.totals(inv).total)}. It's in this month's numbers under Finance.`);
      }
      case "reset":
        S = fresh();
        root.querySelectorAll("[data-as]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.as === S.as ? "true" : "false"));
        renderMain();
        return say("Demo reset. Everything is back the way it started.");
    }
  });

  root.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target.dataset.form;
    if (form === "cant") {
      const s = S.shifts.find((x) => x.id === S.cantMake);
      s.needsCover = true;
      s.note = $("#cant-note").value.trim();
      S.cantMake = null;
      renderMain(S.schedView === "calendar" ? "#pick-title" : `[data-shift="${s.id}"] .shift-what`);
      return say(`Sent. ${OWNER.first} sees it on the schedule board and gets a phone notification.`);
    }
    if (form === "shift") return saveShift();
    if (form === "invoice") {
      const changed = L.changedDefaults(S.saved, { rate: Number(S.draft.rate) }, ["rate"]);
      if (changed.length) { S.confirmRate = true; return renderMain("#rate-confirm"); }
      return submitInvoice(false);
    }
    if (form === "sendback") {
      const note = $("#sb-note").value.trim();
      if (!note) return showError("sb-note", true);
      const inv = S.invoices.find((i) => i.id === S.reviewing);
      inv.status = "sentback";
      inv.comment = note;
      S.reviewing = null;
      if (inv.from === MEMBER.id) S.unread.invoices += 1;
      renderMain(true);
      return say(`Sent ${inv.id} back to ${personById[inv.from].first} with your note.`);
    }
  });

  root.addEventListener("input", (e) => {
    const t = e.target;
    const refresh = () => { const box = $("#inv-totals"); if (box) box.innerHTML = totalsList(draftTotals()); };
    if (t.dataset.worked !== undefined) { S.draft.worked[Number(t.dataset.worked)].hours = t.value; return refresh(); }
    if (t.dataset.expDesc !== undefined) { S.draft.expenses[Number(t.dataset.expDesc)].desc = t.value; return; }
    if (t.dataset.expAmt !== undefined) { S.draft.expenses[Number(t.dataset.expAmt)].amount = t.value; return refresh(); }
    if (t.id === "inv-rate") { S.draft.rate = t.value; return refresh(); }
    if (t.id === "sb-note" && t.value.trim()) showError("sb-note", false);
  });
  root.addEventListener("change", (e) => {
    if (e.target.id === "ed-end" || e.target.id === "ed-start") showError("ed-end", false);
  });

  renderMain();
})();
