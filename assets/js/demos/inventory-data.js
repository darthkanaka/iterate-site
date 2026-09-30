/* Inventory demo, the made-up kitchen. Two Scoop Kitchen is fictional: a bakery and
   plate lunch spot. Prices and amounts are plausible, not anyone's real numbers.
   Loaded before inventory.js; Node tests require it directly. */
(function (root) {
  "use strict";

  const kitchen = { name: "Two Scoop Kitchen", week: "Week of Oct 5" };

  const suppliers = [
    { id: "wholesale", name: "Wholesale club" },
    { id: "meat", name: "Meat supplier" },
    { id: "packaging", name: "Packaging supplier" },
  ];

  // packSize is in the base unit. packWord is what the kitchen calls one pack.
  const products = [
    { id: "flour", name: "All-purpose flour", unit: "lb", packWord: "bag", packLabel: "50 lb bag", packSize: 50, packCost: 32.0, supplier: "wholesale", par: 1 },
    { id: "sugar", name: "Sugar", unit: "lb", packWord: "bag", packLabel: "25 lb bag", packSize: 25, packCost: 19.5, supplier: "wholesale", par: 2 },
    { id: "butter", name: "Butter", unit: "lb", packWord: "case", packLabel: "36 lb case", packSize: 36, packCost: 148.0, supplier: "wholesale", par: 1 },
    { id: "eggs", name: "Eggs", unit: "each", packWord: "case", packLabel: "case of 180", packSize: 180, packCost: 54.0, supplier: "wholesale", par: 1 },
    { id: "chips", name: "Chocolate chips", unit: "lb", packWord: "box", packLabel: "25 lb box", packSize: 25, packCost: 96.0, supplier: "wholesale", par: 1 },
    { id: "mochiko", name: "Mochiko", unit: "lb", packWord: "case", packLabel: "case of 24 lb", packSize: 24, packCost: 58.0, supplier: "wholesale", par: 1 },
    { id: "coconut", name: "Coconut milk", unit: "can", packWord: "case", packLabel: "case of 24 cans", packSize: 24, packCost: 36.0, supplier: "wholesale", par: 1 },
    { id: "rice", name: "Calrose rice", unit: "lb", packWord: "bag", packLabel: "50 lb bag", packSize: 50, packCost: 44.0, supplier: "wholesale", par: 2 },
    { id: "macaroni", name: "Macaroni", unit: "lb", packWord: "case", packLabel: "20 lb case", packSize: 20, packCost: 28.0, supplier: "wholesale", par: 1 },
    { id: "mayo", name: "Mayonnaise", unit: "gal", packWord: "case", packLabel: "case of 4 gal", packSize: 4, packCost: 62.0, supplier: "wholesale", par: 1 },
    { id: "shoyu", name: "Shoyu", unit: "gal", packWord: "case", packLabel: "case of 4 gal", packSize: 4, packCost: 36.0, supplier: "wholesale", par: 1 },
    { id: "chicken", name: "Chicken thighs", unit: "lb", packWord: "case", packLabel: "40 lb case", packSize: 40, packCost: 118.0, supplier: "meat", par: 1 },
    { id: "pork", name: "Pork butt", unit: "lb", packWord: "case", packLabel: "60 lb case", packSize: 60, packCost: 174.0, supplier: "meat", par: 1 },
    { id: "containers", name: "Plate containers", unit: "each", packWord: "case", packLabel: "case of 250", packSize: 250, packCost: 62.0, supplier: "packaging", par: 1 },
    { id: "bags", name: "Cookie bags", unit: "each", packWord: "pack", packLabel: "pack of 500", packSize: 500, packCost: 24.0, supplier: "packaging", par: 1 },
    { id: "pans", name: "Foil pans with lids", unit: "each", packWord: "case", packLabel: "case of 100", packSize: 100, packCost: 42.0, supplier: "packaging", par: 1 },
  ];

  // What's on the shelf at the start, in packs.
  const stock = { flour: 1.5, sugar: 1, butter: 0.5, eggs: 0.25, chips: 0.75, mochiko: 0.5, coconut: 1, rice: 1.5, macaroni: 1, mayo: 1, shoyu: 1.25, chicken: 0.5, pork: 0, containers: 0.5, bags: 1, pans: 0.25 };

  // Recipes, per one menu unit, in base units.
  const menu = [
    { id: "cookies", name: "Chocolate chip cookies", unitLabel: "3-pack", step: 10, lines: { flour: 0.17, sugar: 0.1, butter: 0.125, eggs: 0.25, chips: 0.125, bags: 1 } },
    { id: "mochi", name: "Butter mochi", unitLabel: "tray of 12", step: 5, lines: { mochiko: 1, sugar: 0.75, butter: 0.25, eggs: 3, coconut: 1, pans: 1 } },
    { id: "shoyu-chicken", name: "Shoyu chicken plate", unitLabel: "plate", step: 10, lines: { chicken: 0.5, shoyu: 0.02, sugar: 0.03, rice: 0.4, macaroni: 0.1, mayo: 0.02, containers: 1 } },
    { id: "kalua-pork", name: "Kalua pork plate", unitLabel: "plate", step: 10, lines: { pork: 0.55, rice: 0.4, macaroni: 0.1, mayo: 0.02, containers: 1 } },
  ];

  const plan = { cookies: 120, mochi: 20, "shoyu-chicken": 150, "kalua-pork": 100 };

  const data = { kitchen, suppliers, products, stock, menu, plan };
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.InventoryData = data;
})(typeof self !== "undefined" ? self : this);
