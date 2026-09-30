/* Inventory demo, the math. Pure functions, no DOM, so tools/test-inventory-math.mjs
   can run them in Node. The page loads this first and finds it on window.InventoryMath.

   Units: every product has a base unit (lb, each, can, gal) and a pack it's bought in
   (a 50 lb bag, a case of 180). Stock is counted in packs, the way a kitchen counts
   ("two and a half bags"), and costed in base units. */
(function (root) {
  "use strict";

  const EPS = 1e-9;

  // Base units needed by one menu unit, from its recipe lines.
  function needsFor(recipe, qty) {
    const out = {};
    for (const [productId, perUnit] of Object.entries(recipe.lines)) out[productId] = perUnit * qty;
    return out;
  }

  // Every product the week's plan needs, added up across recipes, with the "why" kept:
  // { productId: { total, from: [{ itemId, qty, perUnit, amount }] } }
  function requirements(menu, plan) {
    const req = {};
    for (const item of menu) {
      const qty = Math.max(0, Number(plan[item.id]) || 0);
      if (!qty) continue;
      for (const [productId, perUnit] of Object.entries(item.lines)) {
        const r = (req[productId] = req[productId] || { total: 0, from: [] });
        const amount = perUnit * qty;
        r.total += amount;
        r.from.push({ itemId: item.id, qty, perUnit, amount });
      }
    }
    return req;
  }

  const onHandBase = (product, packsOnHand) => packsOnHand * product.packSize;
  const unitCost = (product) => product.packCost / product.packSize;

  // Shortfall rounded up to whole packs, the way the product is actually sold.
  function packsToOrder(required, onHand, packSize) {
    const short = required - onHand;
    if (short <= EPS) return 0;
    return Math.ceil(short / packSize - EPS);
  }

  // One line per product the plan needs: what's needed, what's there, what to buy.
  function shoppingList(products, menu, plan, stock) {
    const req = requirements(menu, plan);
    const lines = [];
    for (const p of products) {
      const r = req[p.id];
      if (!r) continue;
      const have = onHandBase(p, stock[p.id] || 0);
      const packs = packsToOrder(r.total, have, p.packSize);
      lines.push({
        productId: p.id,
        supplier: p.supplier,
        required: r.total,
        onHand: have,
        short: Math.max(0, r.total - have),
        packs,
        cost: round2(packs * p.packCost),
        from: r.from,
      });
    }
    return lines;
  }

  // The lines that need buying, grouped by supplier in the order suppliers are listed.
  function bySupplier(lines, suppliers) {
    return suppliers
      .map((s) => {
        const items = lines.filter((l) => l.supplier === s.id && l.packs > 0);
        return { supplier: s, items, total: round2(items.reduce((t, l) => t + l.cost, 0)) };
      })
      .filter((g) => g.items.length);
  }

  // What one menu unit costs to make, from current pack prices.
  function costPerUnit(item, productsById) {
    let c = 0;
    for (const [productId, perUnit] of Object.entries(item.lines)) c += perUnit * unitCost(productsById[productId]);
    return round2(c);
  }

  // Stock status against par, in packs.
  function status(packsOnHand, par) {
    if (packsOnHand <= EPS) return "out";
    if (packsOnHand < par - EPS) return "low";
    return "ok";
  }

  // A counted amount: whole packs plus a quarter, half or three quarters.
  function fromCount(whole, fraction) {
    const w = Math.max(0, Math.floor(Number(whole) || 0));
    const f = [0, 0.25, 0.5, 0.75].includes(Number(fraction)) ? Number(fraction) : 0;
    return w + f;
  }

  const round2 = (n) => Math.round(n * 100 + 1e-7) / 100;

  const api = { needsFor, requirements, onHandBase, unitCost, packsToOrder, shoppingList, bySupplier, costPerUnit, status, fromCount, round2 };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.InventoryMath = api;
})(typeof self !== "undefined" ? self : this);
