/* Handyman demo, the made-up company. Coralgate Home Services is fictional; its people,
   clients, prices and pay shares are invented. The field guides and the assistant's
   answers come from the original mockup, with every name made generic.
   "Today" is Tuesday, Sep 29, 2026; the pay sheet is last week, Sep 21 to Sep 27.
   Loaded before handyman.js; Node tests require it directly. */
(function (root) {
  "use strict";

  const company = { name: "Coralgate Home Services", short: "Coralgate", assistant: "Kai", week: "Sep 21 to Sep 27, 2026" };

  const owner = { id: "leilani", name: "Leilani Park", first: "Leilani", role: "Owner" };
  const techs = [
    { id: "malia", name: "Malia Reyes", first: "Malia", share: 35 },
    { id: "noa", name: "Noa Tanaka", first: "Noa", share: 35 },
    { id: "jordan", name: "Jordan Alvarez", first: "Jordan", share: 38 },
    { id: "ikaika", name: "Ikaika Fernandez", first: "Ikaika", share: 35 },
  ];

  // Last week's invoiced jobs. Labor is the invoice's labor line; a tech's pay is their
  // share of it. Everything is finalized except one line each for Jordan and Ikaika, and
  // one invoice has no tech on it yet.
  const rows = [
    { id: "r1", tech: "malia", date: "2026-09-21", invoice: "641", client: "Seabreeze Lane Rentals", job: "Kailua, replace bathroom faucet", labor: 225, final: true },
    { id: "r2", tech: "malia", date: "2026-09-22", invoice: "642", client: "L. Nakamura", job: "Kaimuki, exterior door adjust", labor: 140, final: true, officeNote: "Customer paid cash for the hinge, so it isn't on the invoice." },
    { id: "r3", tech: "malia", date: "2026-09-24", invoice: "646", client: "Kupuna Corner Care Homes", job: "Kaimuki, grab bars in three units", labor: 450, final: true },
    { id: "r4", tech: "noa", date: "2026-09-21", invoice: "643", client: "Two Palms Property Co.", job: "Mililani, hang 3 interior doors", labor: 600, final: true },
    { id: "r5", tech: "noa", date: "2026-09-23", invoice: "645", client: "R. & T. Souza", job: "Pearl City, ceiling fan swap", labor: 250, final: true },
    { id: "r6", tech: "jordan", date: "2026-09-22", invoice: "644", client: "J. Ho", job: "Wahiawa, toilet rebuild", labor: 210, final: true },
    { id: "r7", tech: "jordan", date: "2026-09-25", invoice: "650", client: "Pili Grass Properties", job: "Aiea, deck board replacement", labor: 720, final: false, techNote: "Was the second trip for the boards counted?" },
    { id: "r8", tech: "ikaika", date: "2026-09-23", invoice: "647", client: "M. Kealoha", job: "Kaneohe, install grab bars", labor: 250, final: false },
    { id: "r9", tech: "ikaika", date: "2026-09-24", invoice: "648", client: "The Lanai Loft Co.", job: "Hawaii Kai, patch and paint hallway", labor: 480, final: true },
    { id: "r10", tech: null, date: "2026-09-24", invoice: "649", client: "Blue Pier Realty", job: "Kailua, closet door track", labor: 180, final: false },
  ];

  const guides = [
    { id: "g1", title: "Ceiling fan replacement", category: "Electrical", minutes: 60, skill: "Intermediate",
      price: { base: "$185 flat for a swap, $265 if the box needs changing", materials: "Client supplies the fan; box and hardware billed at cost", note: "Add 30 minutes for ceilings over 10 ft." },
      intake: ["Ceiling height and downrod length?", "Does the existing box say fan-rated?", "One switch or two (fan and light)?"],
      tools: ["Non-contact voltage tester", "Drill and bits", "6 ft ladder", "Wire strippers"],
      materials: ["Fan-rated box if needed", "Wire nuts", "Mounting screws"],
      safety: ["Breaker off and tested dead", "Ladder on level footing", "Second person for fans over 52 in."],
      steps: ["Kill the breaker and test the wires dead.", "Remove the old fan and inspect the box. Replace it with a fan-rated box if it isn't one.", "Mount the bracket, hang the motor, and connect black, white, blue (light) and ground.", "Attach blades and the light kit, then restore power and test every speed and the light.", "Check for wobble and balance with the kit if needed."],
      quality: ["No wobble at high speed", "Light kit and pull chains both work", "Canopy tight to the ceiling, no gap"] },
    { id: "g2", title: "Garbage disposal install", category: "Plumbing", minutes: 45, skill: "Beginner",
      price: { base: "$160 flat, disposal not included", materials: "Disposal at cost plus 12%", note: "Hardwired units add $45." },
      intake: ["Existing disposal brand and horsepower?", "Outlet under the sink or hardwired?", "Dishwasher drain connected to it?"],
      tools: ["Bucket and towels", "Channel locks", "Screwdriver set", "Plumber's putty"],
      materials: ["Disposal unit", "Sink flange kit", "Dishwasher connector kit"],
      safety: ["Unplug or kill the circuit first", "Support the unit while twisting off the mount"],
      steps: ["Unplug and disconnect the drain and dishwasher hose.", "Twist the old unit off the mounting ring and replace the flange with fresh putty.", "Knock out the dishwasher plug if the hose connects, then hang the new unit.", "Reconnect the drain, run water, and check every joint for drips."],
      quality: ["Runs quiet with no vibration", "No drip at the flange or the drain elbow after a full sink", "Dishwasher drains through it"] },
    { id: "g3", title: "Drywall patch and paint", category: "Walls", minutes: 90, skill: "Intermediate",
      price: { base: "$135 per patch up to 6 in., $190 for a two-visit texture match", materials: "Included for patches under 6 in.", note: "Client supplies matched paint or we add a paint-match trip." },
      intake: ["Hole size? Nail pop, fist-size, or larger?", "Textured or smooth wall?", "Do they have the paint color?"],
      tools: ["Taping knives, 6 and 10 in.", "Sanding sponge", "Utility knife", "Drill"],
      materials: ["Patch or backing board", "Joint compound", "Mesh tape", "Primer and paint"],
      safety: ["Dust mask when sanding", "Check for wires before cutting"],
      steps: ["Square the hole and add backing if it's larger than 4 in.", "Set the patch, tape the seams, and apply the first coat thin.", "Let it dry, sand, second coat, sand again.", "Match texture, prime, and paint two coats."],
      quality: ["Patch invisible at arm's length with the light on", "Texture matches the wall around it", "Paint feathered, no visible edge"] },
    { id: "g4", title: "Lanai screen re-screen", category: "Doors and windows", minutes: 40, skill: "Beginner",
      price: { base: "$105 first panel, $65 each additional", materials: "Mesh and spline included up to 36 in. panels", note: "Oversize panels priced per square foot." },
      intake: ["Panel count and rough size?", "Aluminum or vinyl frame?", "Pet-resistant screen wanted?"],
      tools: ["Spline roller", "Utility knife", "Flat screwdriver"],
      materials: ["Screen roll", "Spline to match the groove"],
      safety: ["Watch for sharp frame edges"],
      steps: ["Pull the old spline and screen.", "Lay new screen with a 2 in. overhang and roll the spline in one side at a time, keeping tension even.", "Trim flush along the spline with the knife angled outward."],
      quality: ["Mesh drum-tight with no ripples", "Spline seated all the way around", "Frame back in square with all clips"] },
    { id: "g5", title: "Grab bar install", category: "Bath safety", minutes: 45, skill: "Beginner",
      price: { base: "$120 first bar, $75 each additional", materials: "Bar supplied by client or at cost", note: "Tile drilling included." },
      intake: ["Tile or fiberglass surround?", "Vertical, horizontal, or angled?", "What height does the customer want?"],
      tools: ["Stud finder", "Tile or carbide bit", "Level", "Caulk gun"],
      materials: ["Grab bar", "Wall anchors rated for the surface", "Silicone caulk"],
      safety: ["Every screw into a stud or a rated anchor, no exceptions"],
      steps: ["Find the studs and mark the bar position with a level.", "Drill pilot holes, with a tile bit on tile.", "Mount with rated hardware and caulk the flanges.", "Pull-test it hard before you leave."],
      quality: ["Bar holds a hard pull with no movement", "Both flanges on a stud or a rated anchor", "Holes sealed with silicone"] },
    { id: "g6", title: "Interior door hang and adjust", category: "Doors and windows", minutes: 75, skill: "Intermediate",
      price: { base: "$190 for a slab on existing hinges, $295 prehung", materials: "Door supplied by client", note: "Hardware install included." },
      intake: ["Slab only or prehung?", "Which way does it swing?", "Reusing the existing hinges?"],
      tools: ["4 ft level", "Chisel", "Shims", "Drill"],
      materials: ["Door", "Shims", "3 in. screws", "Hinges if needed"],
      safety: ["Two people for solid-core doors"],
      steps: ["Check the opening for plumb and level.", "Set the door in place, shim at the hinges, and secure the hinge side first.", "Adjust the strike side for an even gap, then set the latch."],
      quality: ["Even gap on both sides and the top", "Latches with a light push, no slam", "Swings without drifting open or closed"] },
  ];

  // The assistant's canned answers, matched by keyword in this order.
  const answers = [
    { keys: ["schedule", "today", "visits", "calendar", "on today"], lookups: ["Checked today's schedule", "Checked who's free"], text:
`**Today, Tuesday Sep 29** · 6 visits across 4 techs

| Time | Tech | Job | Area |
|---|---|---|---|
| 8:00 | Malia Reyes | Bathroom faucet replacement | Kailua |
| 8:30 | Noa Tanaka | Hang 3 interior doors | Mililani |
| 9:00 | Jordan Alvarez | Deck board replacement, day 2 | Aiea |
| 11:00 | Malia Reyes | Grab bars, 2 | Kaneohe |
| 1:00 | Jordan Alvarez | Patch and paint hallway | Hawaii Kai |
| 3:00 | Noa Tanaka | Garbage disposal install | Kapolei |

Ikaika Fernandez is open from 1:00. **Next step:** the 3:00 Kapolei disposal is a 45-minute job, so Noa could take the open Waipahu screen request after it.` },
    { keys: ["request", "open", "new lead", "leads", "inbox"], lookups: ["Checked open requests"], text:
`**Open requests · 4**

1. **R. & T. Souza**, Pearl City. Ceiling fan swap, two fans. Came in yesterday from the website. Not quoted yet.
2. **Two Palms Property Co.**, Waipahu. Re-screen 6 lanai panels at a rental. Wants a price by Friday.
3. **J. Ho**, Wahiawa. Toilet rebuild, "runs all night." Asked for the soonest slot.
4. **Kupuna Corner Care Homes**, Kaimuki. Grab bars in three units. Repeat customer.

**Next step:** the Souza fans and the Kupuna Corner grab bars are both easy to quote from the price list. Want me to draft those two?` },
    { keys: ["unpaid", "owe", "overdue", "past due", "money", "collections", "invoice"], lookups: ["Checked unpaid invoices", "Checked what's past due"], text:
`**Unpaid invoices · 5 · $2,318 outstanding**

| Invoice | Client | Amount | Age |
|---|---|---|---|
| #631 | Blue Pier Realty | $486 | 21 days, **past due** |
| #634 | L. Nakamura | $275 | 14 days |
| #637 | Pili Grass Properties | $832 | 9 days |
| #638 | The Lanai Loft Co. | $410 | 5 days |
| #639 | M. Kealoha | $315 | 2 days |

**Next step:** #631 is the only one past terms. A friendly reminder to Blue Pier's billing contact usually clears it. Want me to draft that?` },
    { keys: ["what should i do", "what do i do", "first", "priorit", "briefing", "morning"], lookups: ["Checked today's schedule", "Checked open requests", "Checked unpaid invoices", "Checked the pay sheet"], text:
`**Here's your morning, in order**

1. **Quote the Souza ceiling fans** in Pearl City. Two fans, standard height, about 2 hours. From the price list that's $270 labor each plus fans at cost.
2. **Fill Ikaika's afternoon.** He's open from 1:00 and the Two Palms lanai screens in Waipahu aren't assigned.
3. **Nudge Blue Pier Realty on #631.** 21 days, the only past-due invoice.
4. **Tech pay:** last week's sheet has 2 lines not finalized yet (Jordan, Ikaika) and one invoice with no tech on it.

Everything else is on track. 6 visits today, 4 open requests, $2,318 outstanding.` },
    { keys: ["quote", "estimate", "price", "how much", "cost"], lookups: ["Checked the price list", "Checked material costs"], text:
`**Draft quote: ceiling fan swap, two fans**

| Line | Qty | Each | Total |
|---|---|---|---|
| Ceiling fan replacement, standard height | 2 | $270.00 | $540.00 |
| Fan-rated box, if the old one isn't rated | 2 | $18.40 | $36.80 |
| Wire nuts and hardware | 1 | $6.20 | $6.20 |

**Labor $540 · Materials $43 at cost · Total $583**

Materials are at cost, so add your markup before this goes out. Want me to save it as a draft quote on the Souza request?` },
    { keys: ["client", "look up", "lookup", "find", "who is", "nakamura", "souza", "blue pier"], lookups: ["Searched clients"], text:
`**L. Nakamura** · Kaimuki · (808) 555-0142

- **Property:** Kaimuki, the house with the green gate
- **Jobs:** 4 since March. Last: exterior door adjust, Sep 22, $140.
- **Open invoice:** #634, $275, 14 days.
- **Notes:** Gate code 2231. Prefers mornings. Friendly dog in the yard.

**Next step:** she asked about a screen door last visit. Want me to add that to her next quote?` },
    { keys: ["how do i", "how to", "fix", "repair", "hum", "leak", "faucet", "disposal", "fan"], lookups: ["Searched the field guides"], text:
`**Garbage disposal that hums but won't spin**

That's a jam, not a dead motor.

1. Unplug it or kill the breaker.
2. Put the hex wrench in the socket on the bottom and work it back and forth until it turns freely.
3. Fish out whatever's in there with pliers, never your hand.
4. Press the red reset button on the bottom, restore power, run cold water, and test.

If it still hums after clearing the jam, the motor is done and it's a replacement. The full install guide is under **Field guides**.` },
    { keys: ["hello", "hi", "hey", "aloha"], lookups: [], text: `Aloha! I can pull up today's schedule, open requests, unpaid invoices, draft a quote, look up a client, or walk a tech through a repair. What do you need?` },
  ];
  const fallback = { lookups: ["Searched everything"], text:
`I'm the demo version, so I know a handful of things well: **today's schedule**, **open requests**, **unpaid invoices**, **quotes**, **client lookups**, and **how-to** questions. Try one of those, or pick a question below.` };

  const prompts = ["What's on today?", "Any open requests?", "Who owes us money?", "What should I do first?", "Quote two ceiling fans", "Disposal hums but won't spin"];

  const data = { company, owner, techs, rows, guides, answers, fallback, prompts };
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.HandymanData = data;
})(typeof self !== "undefined" ? self : this);
