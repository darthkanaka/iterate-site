/* Handyman demo: Coralgate Home Services. One app seen from two sides: Leilani, the
   owner, and Malia, a tech. The "View as" switch flips between them.
   Leilani: Kai, the office assistant (canned answers with the lookups it made), the
   weekly tech pay sheet (assign, correct labor, finalize, mark paid, notes), and the
   field guides. Malia: the field guides as step-by-step jobs, and My pay (her lines,
   the office's notes, and a note back). Everything lives in memory, so a refresh or
   Reset starts the company over. */
(function () {
  "use strict";

  const root = document.getElementById("handyman-app");
  const L = window.HandymanLogic;
  const D = window.HandymanData;
  if (!root || !L || !D) return;

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const techById = Object.fromEntries(D.techs.map((t) => [t.id, t]));
  const guideById = Object.fromEntries(D.guides.map((g) => [g.id, g]));
  const TECH = techById.malia;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  function fresh() {
    return {
      as: "owner",
      view: { owner: "assistant", tech: "guides" },
      rows: clone(D.rows).map((r) => ({ paid: false, officeNote: "", techNote: "", techNoteSeen: !r.techNote, ...r })),
      chat: [],
      busy: false,
      guide: null,
      stage: {},
      checks: {},
      finished: {},
      search: "",
      noteFor: null,
      techNoteFor: null,
      unreadTech: 0,
    };
  }
  let S = fresh();
  let chatTimer = 0;

  // ── formatting ───────────────────────────────────────────────────────────
  const esc = L.escape;
  const money = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const day = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const person = () => (S.as === "owner" ? { name: D.owner.name, role: "Owner" } : { name: TECH.name, role: `Tech, ${TECH.share}% of labor` });

  // ── shell ────────────────────────────────────────────────────────────────
  root.innerHTML = `
    <div class="app-bar">
      <div class="app-id"><span class="app-dot" aria-hidden="true">${esc(D.company.short[0])}</span><div><p class="app-name">${esc(D.company.name)}</p><p class="app-sub">Team app</p></div></div>
      <div class="viewas" role="group" aria-label="View the app as">
        <span class="viewas-label" aria-hidden="true">View as</span>
        <button type="button" class="viewas-btn" data-as="owner" aria-pressed="true">${esc(D.owner.first)}, owner</button>
        <button type="button" class="viewas-btn" data-as="tech" aria-pressed="false">${esc(TECH.first)}, tech</button>
      </div>
    </div>
    <div class="portal">
      <nav class="portal-nav" aria-label="App menu">
        <p class="portal-who" id="hm-who"></p>
        <ul id="hm-menu"></ul>
        <button type="button" class="app-btn app-btn-quiet portal-reset" data-act="reset">Reset demo</button>
      </nav>
      <div class="portal-main" id="hm-main"></div>
    </div>
    <p class="app-status" id="hm-status" role="status" aria-live="polite">Changes stay on this page. Refresh or reset to start over.</p>`;

  const $ = (sel) => root.querySelector(sel);
  const status = $("#hm-status");
  const say = (text) => { status.textContent = text; };

  // ── menu ─────────────────────────────────────────────────────────────────
  const unreadOwner = () => S.rows.filter((r) => r.techNote && !r.techNoteSeen).length;
  function menuItems() {
    if (S.as === "owner") {
      const need = L.needsTech(S.rows).length + unreadOwner();
      return [
        { id: "assistant", label: `${D.company.assistant}, the assistant` },
        { id: "pay", label: "Tech pay", badge: need, word: "need you" },
        { id: "guides", label: "Field guides" },
      ];
    }
    return [
      { id: "guides", label: "Field guides" },
      { id: "mypay", label: "My pay", badge: S.unreadTech, word: S.unreadTech === 1 ? "new update" : "new updates" },
    ];
  }
  function renderMenu() {
    const v = S.view[S.as];
    const p = person();
    $("#hm-who").innerHTML = `<span class="item-name">${esc(p.name)}</span><span class="item-sub">${esc(p.role)}</span>`;
    $("#hm-menu").innerHTML = menuItems().map((i) => `<li><button type="button" class="portal-link" data-view="${i.id}"${i.id === v ? ' aria-current="page"' : ""}>${i.label}${i.badge ? ` <span class="menu-badge" aria-hidden="true">${i.badge}</span><span class="sr-only">, ${i.badge} ${i.word}</span>` : ""}</button></li>`).join("");
  }
  const head = (title, text) => `<div class="panel-head"><div><h2 tabindex="-1" id="view-title">${title}</h2>${text ? `<p>${text}</p>` : ""}</div></div>`;
  function renderMain(focus) {
    const v = S.view[S.as];
    if (S.as === "owner" && v === "pay") S.rows.forEach((r) => { if (r.techNote) r.techNoteSeen = true; });
    if (S.as === "tech" && v === "mypay") S.unreadTech = 0;
    const views = S.as === "owner" ? { assistant: ownerAssistant, pay: ownerPay, guides } : { guides, mypay: techPay };
    $("#hm-main").innerHTML = views[v]();
    renderMenu();
    if (v === "assistant") scrollChat();
    if (focus) { const el = (typeof focus === "string" && $(focus)) || $("#view-title"); if (el) el.focus(); }
  }

  // ── Leilani: Kai ─────────────────────────────────────────────────────────
  function chatHtml() {
    const welcome = `<div class="msg msg-kai"><span class="msg-who">${esc(D.company.assistant)}</span><div class="msg-body"><p>Aloha, ${esc(D.owner.first)}. What do you need?</p></div></div>`;
    return welcome + S.chat.map((m) => m.from === "you"
      ? `<div class="msg msg-you"><span class="msg-who">You</span><div class="msg-body"><p>${esc(m.text)}</p></div></div>`
      : `<div class="msg msg-kai${m.pending ? " is-pending" : ""}"><span class="msg-who">${esc(D.company.assistant)}</span><div class="msg-body">
          ${m.lookups.length ? `<ul class="lookups">${m.lookups.map((l) => `<li>${m.pending ? `<span class="lookup-wait" aria-hidden="true"></span>` : `<span class="lookup-done" aria-hidden="true">✓</span>`}${esc(l)}</li>`).join("")}</ul>` : ""}
          ${m.pending ? `<p class="item-sub">Looking that up</p>` : L.render(m.text)}
        </div></div>`).join("");
  }
  function ownerAssistant() {
    return `${head(`${esc(D.company.assistant)}, the office assistant`, "Ask about the schedule, open requests, money owed, a quote or a repair. It looks things up in the systems the office already runs on.")}
      <div class="chat" id="chat-log" role="region" aria-label="Conversation with ${esc(D.company.assistant)}" tabindex="0">${chatHtml()}</div>
      <div class="prompts" role="group" aria-label="Try asking">${D.prompts.map((p) => `<button type="button" class="prompt" data-prompt="${esc(p)}"${S.busy ? " disabled" : ""}>${esc(p)}</button>`).join("")}</div>
      <form class="ask" data-form="ask" novalidate>
        <label class="sr-only" for="ask-input">Ask ${esc(D.company.assistant)}</label>
        <input id="ask-input" type="text" autocomplete="off" placeholder="Ask ${esc(D.company.assistant)} anything">
        <button type="submit" class="app-btn app-btn-primary"${S.busy ? " disabled" : ""}>Ask</button>
      </form>`;
  }
  function scrollChat() { const log = $("#chat-log"); if (log) log.scrollTop = log.scrollHeight; }
  function refreshChat() {
    const log = $("#chat-log");
    if (!log) return;
    log.innerHTML = chatHtml();
    root.querySelectorAll(".prompt, .ask button").forEach((b) => { b.disabled = S.busy; });
    scrollChat();
  }
  function ask(question) {
    const q = String(question).trim();
    if (!q || S.busy) return;
    const a = L.answerFor(q, D.answers, D.fallback);
    S.chat.push({ from: "you", text: q });
    const msg = { from: "kai", lookups: a.lookups, text: a.text, pending: true };
    S.chat.push(msg);
    S.busy = true;
    refreshChat();
    say(`${D.company.assistant} is looking that up.`);
    clearTimeout(chatTimer);
    chatTimer = setTimeout(() => {
      msg.pending = false;
      S.busy = false;
      if (S.as === "owner" && S.view.owner === "assistant") refreshChat();
      say(`${D.company.assistant} answered. The answer is at the bottom of the conversation.`);
    }, reduced() ? 150 : 700);
  }

  // ── Leilani: tech pay ────────────────────────────────────────────────────
  function payRow(r) {
    const t = techById[r.tech];
    const note = S.noteFor === r.id
      ? `<tr class="note-row"><td colspan="5"><form class="pform note-form" data-form="office-note" novalidate>
          <div class="pfield"><label for="office-note">Note to ${esc(t.first)} about #${esc(r.invoice)}</label><textarea id="office-note" rows="2">${esc(r.officeNote)}</textarea></div>
          <div class="notice-actions"><button type="submit" class="app-btn app-btn-primary">Save note</button><button type="button" class="app-btn app-btn-quiet" data-act="cancel-note">Cancel</button></div>
        </form></td></tr>`
      : "";
    const labor = r.final
      ? `${money(L.laborOf(r))}${r.laborOverride != null ? `<span class="item-sub">edited</span>` : ""}`
      : `<label class="sr-only" for="labor-${r.id}">Labor on #${esc(r.invoice)}, ${esc(r.client)}</label><span class="money-in">$<input id="labor-${r.id}" class="labor-in" data-labor="${r.id}" type="number" inputmode="decimal" min="0" step="1" value="${L.laborOf(r)}"></span>${r.laborOverride != null ? `<span class="item-sub">edited, invoice says ${money(r.labor)}</span>` : ""}`;
    return `<tr data-row="${r.id}">
      <td class="cell-item"><span class="item-name">${esc(r.client)}</span><span class="item-sub">${esc(r.job)} · #${esc(r.invoice)} · ${day(r.date)}</span>
        ${r.officeNote ? `<span class="row-note"><strong>You:</strong> ${esc(r.officeNote)}</span>` : ""}
        ${r.techNote ? `<span class="row-note row-note-tech"><strong>${esc(t.first)}:</strong> ${esc(r.techNote)}</span>` : ""}</td>
      <td data-label="Tech">${esc(t.first)}</td>
      <td class="num" data-label="Labor"><span class="stack">${labor}</span></td>
      <td class="num" data-label="Pay"><span class="stack" data-pay="${r.id}">${money(L.payOf(r, D.techs))}<span class="item-sub">${t.share}%</span></span></td>
      <td class="cell-action row-actions">
        <button type="button" class="toggle" data-final="${r.id}" aria-pressed="${!!r.final}">Final<span class="sr-only">, #${esc(r.invoice)}</span></button>
        <button type="button" class="toggle" data-paid="${r.id}" aria-pressed="${!!r.paid}"${r.final ? "" : " disabled"}>Paid<span class="sr-only">, #${esc(r.invoice)}</span></button>
        <button type="button" class="app-btn app-btn-quiet" data-note="${r.id}">${r.officeNote ? "Edit note" : "Note"}<span class="sr-only"> to ${esc(t.first)} on #${esc(r.invoice)}</span></button>
      </td>
    </tr>${note}`;
  }
  function ownerPay() {
    const open = L.needsTech(S.rows);
    const sum = L.summary(S.rows, D.techs);
    const assign = open.length
      ? `<section class="attention" aria-labelledby="needs-title"><h3 id="needs-title">${plural(open.length, "invoice has", "invoices have")} no tech on it</h3><ul>${open.map((r) => `<li><span>#${esc(r.invoice)}, ${esc(r.client)}, ${esc(r.job)}, ${money(r.labor)} labor</span>
          <span class="assign"><label class="sr-only" for="assign-${r.id}">Who did #${esc(r.invoice)}?</label><select id="assign-${r.id}"><option value="">Who did it?</option>${D.techs.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select><button type="button" class="app-btn" data-assign="${r.id}">Assign</button></span></li>`).join("")}</ul></section>`
      : "";
    const cards = sum.map((s) => {
      const t = techById[s.tech];
      const allFinal = s.final === s.count, allPaid = s.paid === s.count;
      return `<div class="pay-card${allPaid ? " is-paid" : ""}" data-card="${t.id}" tabindex="-1">
        <p class="item-name">${esc(t.name)}</p>
        <p class="pay-amount">${money(s.pay)}</p>
        <p class="item-sub">${money(s.labor)} labor at ${t.share}% · ${s.final} of ${s.count} final · ${s.paid} paid</p>
        <div class="notice-actions">${allPaid ? `<span class="pill pill-quiet">Paid</span>` : allFinal ? `<button type="button" class="app-btn app-btn-primary" data-paidall="${t.id}">Mark all paid<span class="sr-only">, ${esc(t.first)}</span></button>` : `<button type="button" class="app-btn" data-finalall="${t.id}">Finalize all<span class="sr-only">, ${esc(t.first)}</span></button>`}</div>
      </div>`;
    }).join("");
    const rows = S.rows.filter((r) => r.tech).sort((a, b) => D.techs.findIndex((t) => t.id === a.tech) - D.techs.findIndex((t) => t.id === b.tech) || a.date.localeCompare(b.date));
    return `${head("Tech pay", `Last week, ${esc(D.company.week)}. Each tech gets their share of the labor on their invoices. Check a line, mark it final, then mark it paid.`)}
      ${assign}
      <div class="pay-cards">${cards}</div>
      <table class="app-table pay-table">
        <caption class="sr-only">Pay lines for last week</caption>
        <thead><tr><th scope="col">Invoice</th><th scope="col">Tech</th><th scope="col" class="num">Labor</th><th scope="col" class="num">Pay</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${rows.map(payRow).join("")}</tbody>
      </table>
      <p class="board-total">Pay for the week, <strong id="pay-total">${money(L.sheetTotal(S.rows, D.techs))}</strong> across ${plural(sum.filter((s) => s.count).length, "tech", "techs")}.</p>`;
  }
  function refreshPayNumbers(rowId) {
    const r = S.rows.find((x) => x.id === rowId);
    const cell = $(`[data-pay="${rowId}"]`);
    if (cell) cell.innerHTML = `${money(L.payOf(r, D.techs))}<span class="item-sub">${techById[r.tech].share}%</span>`;
    const s = L.summary(S.rows, D.techs).find((x) => x.tech === r.tech);
    const card = $(`[data-card="${r.tech}"] .pay-amount`);
    if (card) card.textContent = money(s.pay);
    const sub = $(`[data-card="${r.tech}"] .item-sub`);
    if (sub) sub.textContent = `${money(s.labor)} labor at ${techById[r.tech].share}% · ${s.final} of ${s.count} final · ${s.paid} paid`;
    $("#pay-total").textContent = money(L.sheetTotal(S.rows, D.techs));
  }

  // ── Field guides (both sides) ────────────────────────────────────────────
  function guides() {
    if (S.guide) return guideView(guideById[S.guide]);
    const q = S.search.trim().toLowerCase();
    const list = D.guides.filter((g) => !q || `${g.title} ${g.category}`.toLowerCase().includes(q));
    return `${head("Field guides", "Every job done the same way, whoever's on it. Pick one to walk through it step by step.")}
      <div class="pfield guide-search"><label for="guide-search">Search the guides</label><input id="guide-search" type="search" value="${esc(S.search)}" placeholder="Fan, disposal, drywall" autocomplete="off"></div>
      <ul class="guide-list" id="guide-list">${guideItems(list)}</ul>`;
  }
  function guideItems(list) {
    return list.length
      ? list.map((g) => `<li><button type="button" class="guide-card" data-guide="${g.id}"><span class="item-name">${esc(g.title)}</span><span class="item-sub">${esc(g.category)} · about ${g.minutes} min · ${esc(g.skill)}</span>${S.finished[g.id] ? `<span class="pill pill-quiet">Done today</span>` : ""}</button></li>`).join("")
      : `<li class="list-empty">No guide matches that. Try a word like fan, door or leak.</li>`;
  }
  function checklist(g, kind, items) {
    return `<ul class="checklist">${items.map((it, i) => { const key = `${g.id}:${kind}:${i}`; return `<li><input type="checkbox" id="chk-${kind}-${i}" data-check="${key}"${S.checks[key] ? " checked" : ""}><label for="chk-${kind}-${i}">${esc(it)}</label></li>`; }).join("")}</ul>`;
  }
  function guideView(g) {
    const i = S.stage[g.id] || 0;
    const [stage, stageName] = L.STAGES[i];
    const stepsDone = L.doneCount(S.checks, g.id, "steps", g.steps.length);
    const body = {
      job: () => `<div class="guide-meta"><span class="pill pill-quiet">${esc(g.skill)}</span><span class="pill pill-quiet">about ${g.minutes} min</span><span class="pill pill-quiet">${g.steps.length} steps</span></div>
        <div class="price-card"><p class="item-sub">Flat-rate price</p><p class="price-base">${esc(g.price.base)}</p><p>${esc(g.price.materials)}. ${esc(g.price.note)}</p></div>
        <h4>Know before you go</h4><ul class="plain-list">${g.intake.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`,
      gear: () => `<h4>Tools</h4>${checklist(g, "tools", g.tools)}<h4>Materials</h4>${checklist(g, "materials", g.materials)}`,
      safety: () => `<p class="item-sub">Check each one before you start. If one can't be done safely, stop and call the office.</p>${checklist(g, "safety", g.safety)}`,
      steps: () => `<p class="steps-progress"><label for="steps-bar" id="steps-count">${stepsDone} of ${g.steps.length} steps done</label><progress id="steps-bar" max="${g.steps.length}" value="${stepsDone}"></progress></p>${checklist(g, "steps", g.steps)}`,
      done: () => `<p class="item-sub">What done right looks like. Check each one before you leave.</p>${checklist(g, "quality", g.quality)}`,
    }[stage]();
    return `<button type="button" class="app-btn app-btn-quiet back" data-act="all-guides">All guides</button>
      ${head(esc(g.title), `${esc(g.category)} · step ${i + 1} of ${L.STAGES.length}, ${stageName.toLowerCase()}`)}
      <ol class="stage-nav" aria-label="Stages">${L.STAGES.map(([id, name], n) => `<li><button type="button" class="stage-btn${n < i ? " is-done" : ""}" data-stage="${n}"${n === i ? ' aria-current="step"' : ""}><span class="stage-num" aria-hidden="true">${n + 1}</span>${name}</button></li>`).join("")}</ol>
      <section class="stage-body" aria-labelledby="stage-title"><h3 id="stage-title" tabindex="-1">${stageName}</h3>${body}</section>
      <div class="notice-actions stage-actions">
        ${i > 0 ? `<button type="button" class="app-btn" data-stage="${i - 1}">Back</button>` : ""}
        ${i < L.STAGES.length - 1 ? `<button type="button" class="app-btn app-btn-primary" data-stage="${i + 1}">Next, ${L.STAGES[i + 1][1].toLowerCase()}</button>` : `<button type="button" class="app-btn app-btn-primary" data-act="finish">Finish job</button>`}
      </div>`;
  }

  // ── Malia: my pay ────────────────────────────────────────────────────────
  function techPay() {
    const mine = S.rows.filter((r) => r.tech === TECH.id).sort((a, b) => a.date.localeCompare(b.date));
    const s = L.summary(S.rows, D.techs).find((x) => x.tech === TECH.id);
    return `${head("My pay", `Last week, ${esc(D.company.week)}. What the office has on the sheet for you. Anything look off? Leave a note on the line.`)}
      <div class="pay-cards single"><div class="pay-card"><p class="item-name">Your pay</p><p class="pay-amount" id="my-pay">${money(s.pay)}</p><p class="item-sub">${money(s.labor)} labor at ${TECH.share}% · ${s.final} of ${s.count} final · ${s.paid} paid</p></div></div>
      <ul class="mypay-list">${mine.map((r) => `<li class="mypay-row" data-row="${r.id}">
        <div class="mypay-top"><div><span class="item-name">${esc(r.client)}</span><span class="item-sub">${esc(r.job)} · #${esc(r.invoice)} · ${day(r.date)}</span></div>
          <div class="mypay-amount"><span class="item-name">${money(L.payOf(r, D.techs))}</span><span class="item-sub">${money(L.laborOf(r))} × ${TECH.share}%</span></div></div>
        <div class="req-pills">${r.paid ? `<span class="pill pill-quiet">Paid</span>` : ""}${r.final ? `<span class="pill pill-dark">Final</span>` : `<span class="pill pill-hot">Not final yet</span>`}</div>
        ${r.officeNote ? `<p class="row-note"><strong>Office:</strong> ${esc(r.officeNote)}</p>` : ""}
        ${r.techNote && S.techNoteFor !== r.id ? `<p class="row-note row-note-tech"><strong>You:</strong> ${esc(r.techNote)}</p>` : ""}
        ${S.techNoteFor === r.id
          ? `<form class="pform note-form" data-form="tech-note" novalidate><div class="pfield"><label for="tech-note">Note to the office about #${esc(r.invoice)}</label><textarea id="tech-note" rows="2">${esc(r.techNote)}</textarea></div><div class="notice-actions"><button type="submit" class="app-btn app-btn-primary">Send note</button><button type="button" class="app-btn app-btn-quiet" data-act="cancel-tech-note">Cancel</button></div></form>`
          : `<button type="button" class="app-btn app-btn-quiet" data-technote="${r.id}">${r.techNote ? "Edit your note" : "Ask the office"}<span class="sr-only"> about #${esc(r.invoice)}</span></button>`}
      </li>`).join("")}</ul>`;
  }

  // ── actions ──────────────────────────────────────────────────────────────
  function switchAs(as) {
    if (S.as === as) return;
    S.as = as;
    S.noteFor = null;
    S.techNoteFor = null;
    root.querySelectorAll("[data-as]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.as === as ? "true" : "false"));
    renderMain();
    const p = person();
    say(`Viewing as ${p.name}, ${as === "owner" ? "owner" : "tech"}.`);
  }
  const row = (id) => S.rows.find((r) => r.id === id);

  root.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t || !root.contains(t) || t.disabled) return;
    const ds = t.dataset;
    if (ds.as) return switchAs(ds.as);
    if (ds.view) { S.view[S.as] = ds.view; S.guide = null; S.noteFor = null; S.techNoteFor = null; return renderMain(true); }
    if (ds.prompt) return ask(ds.prompt);
    if (ds.guide) { S.guide = ds.guide; return renderMain(true); }
    if (ds.stage !== undefined) { S.stage[S.guide] = Number(ds.stage); return renderMain("#stage-title"); }
    if (ds.final) {
      const r = row(ds.final);
      r.final = !r.final;
      if (!r.final) r.paid = false;
      renderMain(`[data-final="${r.id}"]`);
      return say(r.final ? `#${r.invoice} is final. The numbers are locked.` : `#${r.invoice} is open again.`);
    }
    if (ds.paid) {
      const r = row(ds.paid);
      r.paid = !r.paid;
      if (r.tech === TECH.id) S.unreadTech += 1;
      renderMain(`[data-paid="${r.id}"]`);
      return say(r.paid ? `#${r.invoice} marked paid. ${techById[r.tech].first} sees it on My pay.` : `#${r.invoice} marked unpaid.`);
    }
    if (ds.finalall) {
      S.rows.filter((r) => r.tech === ds.finalall).forEach((r) => { r.final = true; });
      renderMain(`[data-paidall="${ds.finalall}"]`);
      return say(`All of ${techById[ds.finalall].first}'s lines are final.`);
    }
    if (ds.paidall) {
      S.rows.filter((r) => r.tech === ds.paidall).forEach((r) => { r.paid = true; });
      if (ds.paidall === TECH.id) S.unreadTech += 1;
      renderMain(`[data-card="${ds.paidall}"]`);
      const s = L.summary(S.rows, D.techs).find((x) => x.tech === ds.paidall);
      return say(`${techById[ds.paidall].first} is paid, ${money(s.pay)}. They see it on My pay.`);
    }
    if (ds.assign) {
      const r = row(ds.assign);
      const who = $(`#assign-${r.id}`).value;
      if (!who) { $(`#assign-${r.id}`).focus(); return say("Pick who did the job first."); }
      r.tech = who;
      if (who === TECH.id) S.unreadTech += 1;
      renderMain(`[data-final="${r.id}"]`);
      return say(`#${r.invoice} is on ${techById[who].first}'s pay now, ${money(L.payOf(r, D.techs))}.`);
    }
    if (ds.note) { S.noteFor = ds.note; return renderMain("#office-note"); }
    if (ds.technote) { S.techNoteFor = ds.technote; return renderMain("#tech-note"); }
    switch (ds.act) {
      case "cancel-note": { const id = S.noteFor; S.noteFor = null; return renderMain(`[data-note="${id}"]`); }
      case "cancel-tech-note": { const id = S.techNoteFor; S.techNoteFor = null; return renderMain(`[data-technote="${id}"]`); }
      case "all-guides": { const id = S.guide; S.guide = null; return renderMain(`[data-guide="${id}"]`); }
      case "finish": {
        const g = guideById[S.guide];
        S.finished[g.id] = true;
        S.guide = null;
        renderMain(`[data-guide="${g.id}"]`);
        return say(`${g.title} finished. Nice work.`);
      }
      case "reset":
        clearTimeout(chatTimer);
        S = fresh();
        root.querySelectorAll("[data-as]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.as === S.as ? "true" : "false"));
        renderMain();
        return say("Demo reset. Everything is back the way it started.");
    }
  });

  root.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target.dataset.form;
    if (form === "ask") {
      const input = $("#ask-input");
      if (!input.value.trim()) { input.focus(); return say(`Type a question for ${D.company.assistant} first.`); }
      ask(input.value);
      input.value = "";
      input.focus();
      return;
    }
    if (form === "office-note") {
      const r = row(S.noteFor);
      r.officeNote = $("#office-note").value.trim();
      S.noteFor = null;
      if (r.tech === TECH.id) S.unreadTech += 1;
      renderMain(`[data-note="${r.id}"]`);
      return say(`Note saved. ${techById[r.tech].first} sees it on My pay.`);
    }
    if (form === "tech-note") {
      const r = row(S.techNoteFor);
      r.techNote = $("#tech-note").value.trim();
      r.techNoteSeen = !r.techNote;
      S.techNoteFor = null;
      renderMain(`[data-technote="${r.id}"]`);
      return say(r.techNote ? `Sent. ${D.owner.first} sees your note on the pay sheet.` : "Note removed.");
    }
  });

  root.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "guide-search") {
      S.search = t.value;
      const q = S.search.trim().toLowerCase();
      $("#guide-list").innerHTML = guideItems(D.guides.filter((g) => !q || `${g.title} ${g.category}`.toLowerCase().includes(q)));
      return;
    }
    if (t.dataset.labor) {
      const r = row(t.dataset.labor);
      const v = t.value.trim();
      r.laborOverride = v === "" || Number(v) === r.labor ? null : Math.max(0, Number(v) || 0);
      return refreshPayNumbers(r.id);
    }
  });
  root.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.check) {
      S.checks[t.dataset.check] = t.checked;
      const g = guideById[S.guide];
      const bar = $("#steps-bar");
      if (bar && g) {
        const n = L.doneCount(S.checks, g.id, "steps", g.steps.length);
        bar.value = n;
        $("#steps-count").textContent = `${n} of ${g.steps.length} steps done`;
      }
    }
    if (t.dataset.labor) renderMain(`#labor-${t.dataset.labor}`);
  });

  renderMain();
})();
