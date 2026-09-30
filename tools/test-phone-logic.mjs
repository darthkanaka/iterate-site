// Unit tests for the phone demo's logic: keeping the whole call transcript when Retell only
// sends the last few lines at a time.
//
//   node --test tools/test-phone-logic.mjs
import { createRequire } from "module";
import { test } from "node:test";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const L = require("../assets/js/demos/phone-logic.js");

const A = (content) => ({ role: "agent", content });
const U = (content) => ({ role: "user", content });
const CALL = [
  A("Aloha, thank you for calling Island Emergency Restoration. What's going on?"),
  U("My water heater just burst and there's water all over the garage floor."),
  A("I'm sorry. Is water still coming out right now?"),
  U("Yes."),
  U("It's still going."),
  A("Okay. Can I get your name?"),
  U("Noa Tanaka."),
  A("Thanks, Noa. What's the best callback number?"),
  U("808 555 0142."),
  A("Let me read that back. 808 555 0142. Did I get that right?"),
  U("Yes."),
  A("I'm sending this to our emergency standby team now."),
];

// What Retell sends: the last five lines, with the newest one arriving a few words at a time.
function* updates(lines, size = 5) {
  for (let n = 1; n <= lines.length; n++) {
    const words = lines[n - 1].content.split(" ");
    for (let w = 1; w <= words.length; w += 3) {
      const window = lines.slice(Math.max(0, n - size), n).map((l) => ({ ...l }));
      window[window.length - 1].content = words.slice(0, w).join(" ");
      yield window;
    }
    yield lines.slice(Math.max(0, n - size), n);
  }
}

test("a whole call survives five-line windows", () => {
  let shown = [];
  for (const u of updates(CALL)) {
    shown = L.mergeTranscript(shown, u);
    const done = CALL.slice(0, shown.length);
    assert.deepEqual(shown.slice(0, -1), done.slice(0, -1), "every finished line stays put");
  }
  assert.deepEqual(shown, CALL);
});

test("a repeated line doesn't confuse it", () => {
  // "Yes." is said twice. A window that starts at either one lands in the right place.
  assert.deepEqual(L.mergeTranscript(CALL.slice(0, 5), CALL.slice(3, 8)), CALL.slice(0, 8));
  assert.deepEqual(L.mergeTranscript(CALL.slice(0, 11), CALL.slice(10, 12)), CALL);
  assert.deepEqual(L.mergeTranscript(CALL.slice(0, 11), CALL.slice(7, 12)), CALL);
});

test("a revised line replaces the old wording", () => {
  const have = [A("Aloha, what's going on?"), U("my water heater burst")];
  const got = [A("Aloha, what's going on?"), U("My water heater burst, water everywhere.")];
  assert.deepEqual(L.mergeTranscript(have, got), got);
});

test("the full transcript, if Retell sends it all, just replaces", () => {
  assert.deepEqual(L.mergeTranscript(CALL.slice(0, 4), CALL.slice(0, 6)), CALL.slice(0, 6));
});

test("nothing new keeps what's shown", () => {
  assert.deepEqual(L.mergeTranscript(CALL.slice(0, 3), []), CALL.slice(0, 3));
  assert.deepEqual(L.mergeTranscript([], []), []);
});

test("an empty line in progress doesn't match everything", () => {
  const have = [A("Aloha."), U("Hi.")];
  assert.deepEqual(L.mergeTranscript(have, [U(""), A("Go ahead.")]), [...have, U(""), A("Go ahead.")]);
});

test("lines are cleaned for the page", () => {
  assert.deepEqual(L.turn({ role: "agent", content: "Aloha — this is the after-hours line – go ahead." }), A("Aloha, this is the after-hours line, go ahead."));
  assert.deepEqual(L.turn({ role: "user", content: "Hi" }), U("Hi"));
  assert.deepEqual(L.turn({ role: "anything", content: null }), A(""));
});
