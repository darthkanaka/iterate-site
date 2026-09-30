/* Inventory demo: Two Scoop Kitchen. Three tabs (Stock, This week, Shopping list)
   drawn from InventoryData, with every number run through InventoryMath. State lives
   in memory only, so a refresh or Reset puts the kitchen back the way it started.
   Keyboard: arrow keys move between tabs; in a count, Enter saves and Escape cancels. */
(function () {
  "use strict";

  const root = document.getElementById("inventory-app");
  const M = window.InventoryMath;
  const D = window.InventoryData;
  if (!root || !M || !D) return;

  const byId = Object.fromEntries(D.products.map((p) => [p.id, p]));
  const menuById = Object.fromEntries(D.menu.map((m) => [m.id, m]));
  const fresh = () => ({ tab: "week", stock: { ...D.stock }, plan: { ...D.plan }, counting: null, lowOnly: false, open: {} });
  let S = fresh();

  // ── formatting ───────────────────────────────────────────────────────────
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const money = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num = (n) => String(Number(n.toFixed(2)));
  const amount = (n, unit) => {
    const v = num(n);
    if (unit === "each") return v;
    if (unit === "can") return `${v} ${Number(v) === 1 ? "can" : "cans"}`;
    return `${v} ${unit}`;
  };
  const GLYPH = { 0: "", 0.25: "¼", 0.5: "½", 0.75: "¾" };
  const plural = (word) => (word === "box" ? "boxes" : word + "s");
  const packs = (n, word) => {
    const whole = Math.floor(n + 1e-9);
    const frac = Math.round((n - whole) * 4) / 4;
    const text = `${whole || (frac ? "" : "0")}${GLYPH[frac] || ""}`;
    return `${text} ${n > 0 && n <= 1 ? word : plural(word)}`;
  };
  const items = (n) => `${n} ${n === 1 ? "item" : "items"}`;

  // ── derived numbers ──────────────────────────────────────────────────────
  const listLines = () => M.shoppingList(D.products, D.menu, S.plan, S.stock);
  function listSummary() {
    const lines = listLines();
    const groups = M.bySupplier(lines, D.suppliers);
    const toBuy = lines.filter((l) => l.packs > 0);
    return { lines, groups, toBuy, covered: lines.filter((l) => l.packs === 0), total: M.round2(groups.reduce((t, g) => t + g.total, 0)) };
  }
  const unitCost = (id) => M.costPerUnit(menuById[id], byId);
  const weekCost = (id) => M.round2((S.plan[id] || 0) * menuUnitCostRaw(id));
  function menuUnitCostRaw(id) {
    let c = 0;
    for (const [pid, per] of Object.entries(menuById[id].lines)) c += per * M.unitCost(byId[pid]);
    return c;
  }
  const weekTotal = () => M.round2(D.menu.reduce((t, m) => t + (S.plan[m.id] || 0) * menuUnitCostRaw(m.id), 0));

  // ── shell ────────────────────────────────────────────────────────────────
  const TABS = [["stock", "Stock"], ["week", "This week"], ["list", "Shopping list"]];
  root.innerHTML = `
    <div class="app-bar">
      <div class="app-id"><span class="app-dot" aria-hidden="true">${esc(D.kitchen.name[0])}</span><div><p class="app-name">${esc(D.kitchen.name)}</p><p class="app-sub">Inventory · ${esc(D.kitchen.week)}</p></div></div>
      <button type="button" class="app-btn" data-act="reset">Reset demo</button>
    </div>
    <div class="app-tabs" role="tablist" aria-label="${esc(D.kitchen.name)} inventory">
      ${TABS.map(([id, label]) => `<button type="button" role="tab" class="app-tab" id="inv-tab-${id}" aria-controls="inv-panel-${id}" data-tab="${id}">${label}${id === "list" ? ` <span class="tab-count" id="inv-count" aria-hidden="true"></span><span class="sr-only" id="inv-count-sr"></span>` : ""}</button>`).join("")}
    </div>
    ${TABS.map(([id]) => `<div class="app-panel" role="tabpanel" id="inv-panel-${id}" aria-labelledby="inv-tab-${id}" tabindex="0" hidden></div>`).join("")}
    <p class="app-status" id="inv-status" role="status" aria-live="polite">Changes stay on this page. Refresh or reset to start over.</p>`;

  const $ = (sel) => root.querySelector(sel);
  const panel = (id) => $(`#inv-panel-${id}`);
  const status = $("#inv-status");
  let sayTimer = 0;
  // Announcements. Typing in the plan waits half a second so a screen reader hears
  // the result once, not on every keystroke; everything else says it straight away.
  const say = (text, delay = 0) => {
    clearTimeout(sayTimer);
    if (delay) sayTimer = setTimeout(() => { status.textContent = text; }, delay);
    else status.textContent = text;
  };

  function selectTab(id, focus) {
    S.tab = id;
    for (const [t] of TABS) {
      const tab = $(`#inv-tab-${t}`);
      const on = t === id;
      tab.setAttribute("aria-selected", on ? "true" : "false");
      tab.tabIndex = on ? 0 : -1;
      panel(t).hidden = !on;
    }
    RENDER[id]();
    if (focus) $(`#inv-tab-${id}`).focus();
  }

  function updateCounts() {
    const s = listSummary();
    $("#inv-count").textContent = s.toBuy.length;
    $("#inv-count-sr").textContent = `, ${items(s.toBuy.length)} to buy`;
    return s;
  }

  // ── stock ────────────────────────────────────────────────────────────────
  function stockRow(p) {
    const onHand = S.stock[p.id] || 0;
    const st = M.status(onHand, p.par);
    const counting = S.counting === p.id;
    const whole = Math.floor(onHand + 1e-9);
    const frac = Math.round((onHand - whole) * 4) / 4;
    const hand = counting
      ? `<div class="count-editor">
           <label class="sr-only" for="cnt-whole">Whole ${plural(p.packWord)} of ${esc(p.name)}</label>
           <input id="cnt-whole" type="number" inputmode="numeric" min="0" max="99" step="1" value="${whole}">
           <span aria-hidden="true">${plural(p.packWord)} +</span>
           <label class="sr-only" for="cnt-frac">Plus part of a ${p.packWord}</label>
           <select id="cnt-frac">${[0, 0.25, 0.5, 0.75].map((f) => `<option value="${f}"${f === frac ? " selected" : ""}>${f ? GLYPH[f] : "0"}</option>`).join("")}</select>
           <span class="equals" id="cnt-eq">= ${amount(M.onHandBase(p, onHand), p.unit)}</span>
         </div>`
      : `<span class="onhand"><span class="onhand-packs">${packs(onHand, p.packWord)}</span><span class="item-sub">${amount(M.onHandBase(p, onHand), p.unit)}</span></span>`;
    const action = counting
      ? `<span class="count-actions"><button type="button" class="app-btn app-btn-primary" data-act="save">Save</button><button type="button" class="app-btn app-btn-quiet" data-act="cancel">Cancel</button></span>`
      : `<button type="button" class="app-btn" data-count="${p.id}">Count<span class="sr-only"> ${esc(p.name)}</span></button>`;
    const label = { ok: "OK", low: "Low", out: "Out" }[st];
    return `<tr data-row="${p.id}">
      <td class="cell-item"><span class="item-name">${esc(p.name)}</span><span class="item-sub">${esc(p.packLabel)} · ${esc(D.suppliers.find((s) => s.id === p.supplier).name)}</span></td>
      <td class="num c-hand" data-label="On hand">${hand}</td>
      <td class="num c-par" data-label="Par">${packs(p.par, p.packWord)}</td>
      <td class="c-status" data-label="Status"><span class="pill pill-${st}">${label}</span></td>
      <td class="num cell-action">${action}</td>
    </tr>`;
  }
  function renderStock(focusSel) {
    const all = D.products.map((p) => ({ p, st: M.status(S.stock[p.id] || 0, p.par) }));
    const low = all.filter((x) => x.st === "low").length;
    const out = all.filter((x) => x.st === "out").length;
    const shown = S.lowOnly ? all.filter((x) => x.st !== "ok") : all;
    panel("stock").innerHTML = `
      <div class="panel-head">
        <div><h2>Stock</h2><p>What's on the shelf, counted the way the kitchen counts it. ${D.products.length} items, ${low} low, ${out} out.</p></div>
        <label class="stock-tools"><input type="checkbox" data-act="lowonly"${S.lowOnly ? " checked" : ""}> Show low and out only</label>
      </div>
      <table class="app-table stock-table">
        <caption class="sr-only">Stock on hand against par</caption>
        <thead><tr><th scope="col">Item</th><th scope="col" class="num">On hand</th><th scope="col" class="num">Par</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Count</span></th></tr></thead>
        <tbody>${shown.map((x) => stockRow(x.p)).join("")}</tbody>
      </table>`;
    if (focusSel) $(focusSel)?.focus();
  }
  function saveCount() {
    const p = byId[S.counting];
    if (!p) return;
    S.stock[p.id] = M.fromCount($("#cnt-whole").value, $("#cnt-frac").value);
    S.counting = null;
    renderStock(`[data-count="${p.id}"]`);
    const s = updateCounts();
    say(`${p.name} counted at ${packs(S.stock[p.id], p.packWord)}. Shopping list is ${items(s.toBuy.length)}, ${money(s.total)}.`);
  }
  function cancelCount() {
    const id = S.counting;
    S.counting = null;
    renderStock(`[data-count="${id}"]`);
  }

  // ── this week ────────────────────────────────────────────────────────────
  function renderWeek() {
    panel("week").innerHTML = `
      <div class="panel-head"><div><h2>This week</h2><p>Set how many of each you're making. Try tripling the cookies, then open the shopping list.</p></div></div>
      <table class="app-table">
        <caption class="sr-only">This week's plan and what it costs to make</caption>
        <thead><tr><th scope="col">Menu item</th><th scope="col">How many</th><th scope="col" class="num">Cost to make one</th><th scope="col" class="num">This week</th></tr></thead>
        <tbody>${D.menu.map((m) => `<tr>
          <td class="cell-item"><span class="item-name">${esc(m.name)}</span><span class="item-sub">per ${esc(m.unitLabel)}</span></td>
          <td data-label="How many"><div class="stepper">
            <button type="button" data-step="${m.id}" data-dir="-1" aria-label="${m.step} fewer, ${esc(m.name)}">−</button>
            <input type="number" inputmode="numeric" min="0" max="999" step="1" id="qty-${m.id}" data-qty="${m.id}" value="${S.plan[m.id]}" aria-label="${esc(m.name)}, how many this week">
            <button type="button" data-step="${m.id}" data-dir="1" aria-label="${m.step} more, ${esc(m.name)}">+</button>
          </div></td>
          <td class="num" data-label="Cost to make one">${money(unitCost(m.id))}</td>
          <td class="num" data-label="This week" data-weekcost="${m.id}">${money(weekCost(m.id))}</td>
        </tr>`).join("")}</tbody>
        <tfoot><tr><td colspan="3">Cost to make this week</td><td class="num" id="week-total">${money(weekTotal())}</td></tr></tfoot>
      </table>
      <div class="summary-strip" id="week-strip" style="margin: 22px 0 0"><p id="week-strip-text"></p><button type="button" class="app-btn app-btn-primary" data-act="open-list">See the shopping list</button></div>`;
    updateWeekNumbers(false);
  }
  function updateWeekNumbers(changed) {
    for (const m of D.menu) { const cell = $(`[data-weekcost="${m.id}"]`); if (cell) cell.textContent = money(weekCost(m.id)); }
    const t = $("#week-total"); if (t) t.textContent = money(weekTotal());
    const s = updateCounts();
    const strip = $("#week-strip-text");
    if (strip) strip.innerHTML = `<strong>${items(s.toBuy.length)} to buy</strong> for ${money(s.total)} from ${s.groups.length} ${s.groups.length === 1 ? "supplier" : "suppliers"}`;
    if (changed) {
      const box = $("#week-strip");
      if (box) { box.classList.add("changed"); requestAnimationFrame(() => requestAnimationFrame(() => box.classList.remove("changed"))); }
      say(`Shopping list updated. ${items(s.toBuy.length)}, ${money(s.total)}.`, 500);
    }
  }
  function setQty(id, value, rewriteField) {
    const n = Math.min(999, Math.max(0, Math.floor(Number(value) || 0)));
    S.plan[id] = n;
    if (rewriteField) { const f = $(`#qty-${id}`); if (f) f.value = n; }
    updateWeekNumbers(true);
  }

  // ── shopping list ────────────────────────────────────────────────────────
  function why(l) {
    const p = byId[l.productId];
    return `<ul class="why-list" id="why-${p.id}"${S.open[p.id] ? "" : " hidden"}>
      ${l.from.map((f) => `<li><span>${esc(menuById[f.itemId].name)}, ${f.qty} × ${amount(f.perUnit, p.unit)}</span><span class="num">${amount(f.amount, p.unit)}</span></li>`).join("")}
      <li class="why-total"><span>Needed this week</span><span class="num">${amount(l.required, p.unit)}</span></li>
      <li><span>On the shelf</span><span class="num">${amount(l.onHand, p.unit)}</span></li>
      <li><span>Short, rounded up to whole ${plural(p.packWord)}</span><span class="num">${l.packs} × ${esc(p.packLabel)}</span></li>
    </ul>`;
  }
  function renderList() {
    const s = updateCounts();
    const body = s.groups.length
      ? `<div class="list-groups">${s.groups.map((g) => `
          <section class="supplier" aria-labelledby="sup-${g.supplier.id}">
            <div class="supplier-head"><h3 id="sup-${g.supplier.id}">${esc(g.supplier.name)}</h3><span>${money(g.total)}</span></div>
            ${g.items.map((l) => { const p = byId[l.productId]; return `<div class="buy" data-buy="${p.id}">
              <div class="buy-row">
                <span class="item-name">${esc(p.name)}</span>
                <span class="buy-need">Need ${amount(l.required, p.unit)}, have ${amount(l.onHand, p.unit)}</span>
                <span class="buy-order"><span class="qty">${l.packs} × ${esc(p.packLabel)}</span><span class="cost">${money(l.cost)}</span></span>
              </div>
              <button type="button" class="why-btn" data-why="${p.id}" aria-expanded="${S.open[p.id] ? "true" : "false"}" aria-controls="why-${p.id}">Show the math<span class="sr-only"> for ${esc(p.name)}</span></button>
              ${why(l)}
            </div>`; }).join("")}
          </section>`).join("")}</div>`
      : `<p class="list-empty">Nothing to buy. The shelf already covers this week's plan.</p>`;
    const covered = s.covered.length
      ? `<details class="covered"><summary>Already covered, ${items(s.covered.length)}</summary><ul>${s.covered.map((l) => { const p = byId[l.productId]; return `<li><span>${esc(p.name)}</span><span>need ${amount(l.required, p.unit)}, have ${amount(l.onHand, p.unit)}</span></li>`; }).join("")}</ul></details>`
      : "";
    panel("list").innerHTML = `
      <div class="panel-head">
        <div><h2>Shopping list</h2><p>Everything this week's plan needs, minus what's on the shelf, rounded up to what each supplier actually sells.</p></div>
        <p class="list-total"><strong>${items(s.toBuy.length)}, ${money(s.total)}</strong></p>
      </div>
      ${body}${covered}`;
  }

  const RENDER = { stock: () => renderStock(), week: renderWeek, list: renderList };

  // ── events ───────────────────────────────────────────────────────────────
  root.addEventListener("click", (e) => {
    const t = e.target.closest("button, input[type=checkbox]");
    if (!t || !root.contains(t)) return;
    if (t.dataset.tab) return selectTab(t.dataset.tab);
    if (t.dataset.count) { S.counting = t.dataset.count; renderStock("#cnt-whole"); return; }
    if (t.dataset.step) {
      const m = menuById[t.dataset.step];
      setQty(m.id, (S.plan[m.id] || 0) + m.step * Number(t.dataset.dir), true);
      return;
    }
    if (t.dataset.why) {
      const id = t.dataset.why;
      S.open[id] = !S.open[id];
      t.setAttribute("aria-expanded", S.open[id] ? "true" : "false");
      $(`#why-${id}`).hidden = !S.open[id];
      return;
    }
    switch (t.dataset.act) {
      case "save": return saveCount();
      case "cancel": return cancelCount();
      case "lowonly": S.lowOnly = t.checked; return renderStock('[data-act="lowonly"]');
      case "open-list": return selectTab("list", true);
      case "reset":
        S = fresh();
        selectTab("week");
        say("Demo reset. Everything is back the way it started.");
        return;
    }
  });

  root.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.qty) setQty(t.dataset.qty, t.value, false);
    if (t.id === "cnt-whole" || t.id === "cnt-frac") {
      const p = byId[S.counting];
      $("#cnt-eq").textContent = `= ${amount(M.onHandBase(p, M.fromCount($("#cnt-whole").value, $("#cnt-frac").value)), p.unit)}`;
    }
  });
  root.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.qty) setQty(t.dataset.qty, t.value, true);
  });

  root.addEventListener("keydown", (e) => {
    const t = e.target;
    if (t.getAttribute("role") === "tab") {
      const i = TABS.findIndex(([id]) => id === t.dataset.tab);
      const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      selectTab(TABS[(to + TABS.length) % TABS.length][0], true);
      return;
    }
    if (t.id === "cnt-whole" || t.id === "cnt-frac") {
      if (e.key === "Enter") { e.preventDefault(); saveCount(); }
      else if (e.key === "Escape") { e.preventDefault(); cancelCount(); }
    }
  });

  selectTab(S.tab);
})();
