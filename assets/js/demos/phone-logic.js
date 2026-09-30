/* Phone demo, the logic. Pure functions, no DOM, so tools/test-phone-logic.mjs can run them
   in Node. The page finds them on window.PhoneLogic. */
(function (root) {
  "use strict";

  // Dashes read as a pause out loud but look wrong in print, so the transcript uses commas.
  const dashes = (text) => String(text || "").replace(/\s*[—–]\s*/g, ", ");

  // One line of a Retell transcript, as the page shows it.
  const turn = (m) => ({ role: m && m.role === "user" ? "user" : "agent", content: dashes(m && m.content) });

  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
  // The same line, or the same line still being spoken (one is the start of the other).
  function sameLine(a, b) {
    const x = norm(a.content), y = norm(b.content);
    return a.role === b.role && (x === y || (x !== "" && y !== "" && (x.startsWith(y) || y.startsWith(x))));
  }

  // During a call Retell sends only the last few lines each time, and the newest line grows
  // while it's being spoken. This keeps the whole call: it finds where the new window starts
  // in what's already shown (the longest overlap that lines up) and replaces from there on.
  function mergeTranscript(have, got) {
    if (!got.length) return have.slice();
    for (let p = Math.max(0, have.length - got.length); p < have.length; p++) {
      let fits = sameLine(have[p], got[0]);
      for (let j = 1; fits && p + j < have.length; j++) fits = have[p + j].role === got[j].role;
      if (fits) return have.slice(0, p).concat(got);
    }
    return have.concat(got);
  }

  const api = { dashes, turn, mergeTranscript };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PhoneLogic = api;
})(typeof self !== "undefined" ? self : this);
