// Full check of the after-hours phone demo (demos/phone.html) in a real browser.
//
// The demos API, the Cloudflare person check and the Retell voice SDK are all stubbed
// (Playwright route interception), so nothing here reaches Retell or Twilio or costs money.
// The stub answers the way the real API does (same shapes, same error messages); the
// API's own behaviour is covered by the pytest suite in the iterate-demos-api repo.
//
//   1. Both channels, driven the way a visitor would: the setup choices, the person check
//      not finished yet, a refused start, a chat from greeting to alert to the agent
//      hanging up, the sample number button, typed HTML, a chat that times out, Start over
//      mid-reply; a voice call with talking, transcript, mute, the alert arriving by
//      polling, hanging up, a dropped call, a blocked microphone and hanging up while it
//      connects. Real texts switched on and off, one channel resting, the whole line
//      resting, and the person check failing to load. The same chat again on a phone.
//   2. axe (WCAG 2.1 A/AA and best practice), console errors and overflow in every state
//      at 1440, 1024 and 390.
//   3. JS off, reduced motion.
//
//   node tools/check-phone.mjs [base-url]      # default: local preview on :8778
//
// Needs Playwright outside the repo, same as tools/check.mjs (NODE_PATH).
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const playwright = require("playwright");
// BROWSER=webkit (Safari's engine) or BROWSER=firefox runs the same checks there. Firefox
// has no phone mode, so its "phone" runs are a narrow desktop window.
const ENGINE = process.env.BROWSER || "chromium";

const BASE = (process.argv[2] || "http://localhost:8778/").replace(/\/?$/, "/");
const URL = BASE + "demos/phone.html";
const AXE = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.3/axe.min.js";
const GREETING = "Aloha, thank you for calling Island Emergency Restoration. This is the after-hours line. What's going on?";
const ALERT = { text: "Iterate demo: New emergency for Island Emergency Restoration. Noa Tanaka, (808) 555-0142. Burst pipe under the bathroom sink. Call back by 3:46 PM. Reply STOP to opt out.", time: "3:31 PM", mode: "simulated", delivered: null };

let failures = 0, passes = 0;
const fail = (msg) => { failures++; console.log("  FAIL " + msg); };
const ok = (msg) => { passes++; console.log("  ok   " + msg); };
const expect = (label, got, want) => (String(got) === String(want) ? ok(`${label}: ${want}`) : fail(`${label}: expected "${want}", got "${got}"`));

// ── stubs ─────────────────────────────────────────────────────────────────
// The person check passes a moment after it draws, unless window.__fake.holdCheck is set.
const FAKE_TURNSTILE = `(() => { let n = 0; window.turnstile = {
  render(box, o) { const id = ++n; box.innerHTML = '<p class="item-sub">Person check (test stand-in)</p>'; if (!(window.__fake || {}).holdCheck) setTimeout(() => o.callback("token-" + id), 20); return id; },
  remove() {} }; })();`;
// A stand-in for retell-client-js-sdk's RetellWebClient: the test fires its events by hand.
const FAKE_SDK = `export class RetellWebClient {
  constructor() { this.h = {}; window.__voice = this; window.__voiceLog = window.__voiceLog || []; }
  on(e, f) { (this.h[e] = this.h[e] || []).push(f); }
  emit(e, x) { (this.h[e] || []).forEach((f) => f(x)); }
  async startCall(o) {
    const f = window.__fake || {};
    window.__voiceLog.push("start " + o.accessToken);
    if (f.delay) await new Promise((r) => setTimeout(r, f.delay));
    if (f.fail) throw Object.assign(new Error(f.fail + ": the browser said no"), { name: f.fail });
    if (!f.silent) setTimeout(() => this.emit("call_started"), 20);
  }
  stopCall() { window.__voiceLog.push("stop"); }
  mute() { window.__voiceLog.push("mute"); }
  unmute() { window.__voiceLog.push("unmute"); }
}`;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, POST, OPTIONS" };

async function stub(ctx, cfg) {
  const api = { health: { ok: true, chat: true, voice: true, real_sms: false }, healthStatus: 200, calls: [], turns: [], alert: null, startError: null, gate: null, turnstileDown: false, ...cfg };
  const json = (route, status, body) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });
  await ctx.route((u) => u.hostname === "challenges.cloudflare.com", (route) => (api.turnstileDown ? route.abort() : route.fulfill({ status: 200, headers: { "content-type": "text/javascript" }, body: FAKE_TURNSTILE })));
  await ctx.route((u) => u.href.startsWith("https://cdn.jsdelivr.net/npm/retell-client-js-sdk"), (route) => route.fulfill({ status: 200, headers: { ...CORS, "content-type": "text/javascript" }, body: FAKE_SDK }));
  await ctx.route(/localhost:8787\/|iterate-demos-api/, async (route) => { // the page's API, local or on Railway
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const path = new globalThis.URL(req.url()).pathname;
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    api.calls.push({ method: req.method(), path, body });
    if (api.gate && req.method() === "POST") await api.gate;
    if (path === "/health") return json(route, api.healthStatus, api.healthStatus === 200 ? api.health : { detail: "Service Unavailable" });
    if (path === "/session") {
      if (api.startError) { const [status, detail] = api.startError; api.startError = null; return json(route, status, { detail }); }
      return json(route, 200, body.channel === "chat" ? { session: "s1", greeting: GREETING } : { session: "s1", access_token: "voice-token" });
    }
    if (path === "/session/s1/message") {
      const t = api.turns.shift() || { replies: ["Okay."], alert: null, ended: false };
      return t.status ? json(route, t.status, { detail: t.detail }) : json(route, 200, t);
    }
    if (path === "/session/s1") return json(route, 200, { alert: api.alert, ended: false, channel: "voice", mode: "simulated" });
    if (path === "/session/s1/end") return json(route, 200, { ended: true });
    return json(route, 404, { detail: "Not Found" });
  });
  return api;
}

const browser = await playwright[ENGINE].launch();
if (ENGINE === "firefox") { const plain = browser.newContext.bind(browser); browser.newContext = ({ isMobile, ...o } = {}) => plain(o); }
console.log(`engine: ${ENGINE}`);
// httpErrors: the HTTP statuses a test sets up on purpose (Chrome logs each one as a console error).
async function open(ctxOpts = {}, cfg = {}, httpErrors = []) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...ctxOpts });
  const api = await stub(ctx, cfg);
  const page = await ctx.newPage();
  const errors = [];
  const expected = (t) => httpErrors.some((s) => t.includes(`status of ${s}`)) || (api.turnstileDown && /ERR_FAILED|challenges\.cloudflare/.test(t));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !expected(m.text())) errors.push(m.text()); });
  page.on("requestfailed", (r) => { if (!(api.turnstileDown && r.url().includes("challenges.cloudflare.com"))) errors.push("request failed " + r.url()); });
  page.on("dialog", (d) => { errors.push("a dialog opened: " + d.message()); d.dismiss(); });
  await page.goto(URL, { waitUntil: "load" }); // not networkidle: the person check keeps a connection open
  await waitFor(() => api.calls.some((c) => c.path === "/health"));
  await page.waitForTimeout(80);
  return { ctx, page, api, errors };
}
async function waitFor(fn, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 25)); }
  return false;
}
const hold = (api) => { let release; api.gate = new Promise((r) => { release = r; }); return () => { api.gate = null; release(); }; };
const clean = (t) => t.replace(/\s+/g, " ").trim();
const txt = (page, sel) => page.locator(sel).first().innerText().then(clean);
const statusLine = (page) => txt(page, "#line-status");
const active = (page) => page.evaluate(() => { const a = document.activeElement; return a.id || (a.dataset && a.dataset.act) || (a.name ? `${a.name}=${a.value}` : a.tagName.toLowerCase()); });
const msgs = (page) => page.locator("#chat-log > *").evaluateAll((els) => els.map((e) => (e.classList.contains("chat-note") ? "note: " : e.classList.contains("msg-you") ? "you: " : "agent: ") + (e.querySelector(".msg-body") || e).innerText.replace(/\s+/g, " ").trim()));
const lastMsg = async (page) => (await msgs(page)).at(-1);
const phoneText = (page) => txt(page, "#line-phone");
const ready = (page) => page.waitForFunction(() => document.querySelector(".human-check .item-sub")); // the stand-in person check drew
const startBtn = (page) => txt(page, ".start-btn");
const settle = (page) => page.waitForTimeout(60); // the stand-in person check passes 20 ms after it draws
const sendText = async (page, text) => { await page.fill("#chat-input", text); await page.press("#chat-input", "Enter"); };
const replied = (page) => page.waitForSelector("#chat-input:not([disabled]), .ended");
const voice = (page, ev, arg) => page.evaluate(([e, a]) => window.__voice.emit(e, a), [ev, arg]);
const voiceLog = (page) => page.evaluate(() => (window.__voiceLog || []).join(", "));
const callLabel = (page) => txt(page, "#call-label");

// ── 1. functional, desktop ───────────────────────────────────────────────
console.log("\nfunctional, desktop 1280: setup and chat");
{
  const { ctx, page, api, errors } = await open({}, {}, [429, 409]);

  // Setup
  expect("setup title", await txt(page, "#setup-title"), "Try the after-hours line");
  expect("chat is the default", await page.isChecked('input[name="channel"][value="chat"]'), true);
  expect("the page's phone is the default", await page.isChecked('input[name="mode"][value="simulated"]'), true);
  expect("real texts are off", await page.isDisabled('input[name="mode"][value="real"]'), true);
  expect("and it says so", await txt(page, "#real-note"), "Real texts aren't switched on yet. The phone on this page shows the exact same text.");
  expect("button", await startBtn(page), "Start the chat");
  expect("the on-call phone is empty", await phoneText(page), "On-call phone The tech on call tonight No new texts. When the agent flags an emergency, the alert lands here.");
  expect("status line", await statusLine(page), "Nothing is saved. Refresh or start over any time.");
  expect("says nobody calls back", await txt(page, ".setup-note"), "This is a demo. Nobody from Island Emergency Restoration will call you back.");
  await page.check('input[name="channel"][value="voice"]');
  expect("Talk to it changes the button", await startBtn(page), "Start the call");
  expect("focus stays on the choice", await active(page), "channel=voice");
  await page.check('input[name="channel"][value="chat"]');
  expect("and back", await startBtn(page), "Start the chat");

  // A refused start, then a good one
  await ready(page); await settle(page);
  api.startError = [429, "You've started a lot of demos in the last hour. Give it a little while and try again."];
  await page.click(".start-btn");
  await page.waitForSelector("#start-error");
  expect("a refused start says why", await txt(page, "#start-error"), "You've started a lot of demos in the last hour. Give it a little while and try again.");
  expect("focus on the message", await active(page), "start-error");
  expect("the button is back", await startBtn(page), "Start the chat");
  await ready(page); await settle(page);
  const release = hold(api);
  await page.click(".start-btn");
  await page.waitForSelector(".start-btn[disabled]");
  expect("while it connects", await startBtn(page), "Connecting");
  expect("the choices wait too", await page.isDisabled('input[name="channel"][value="voice"]'), true);
  release();
  await page.waitForSelector("#chat-input");
  const { turnstile, ...sent } = api.calls.filter((c) => c.path === "/session").at(-1).body;
  expect("what it asked the API for", JSON.stringify(sent), JSON.stringify({ channel: "chat", mode: "simulated", phone: null, consent: false }));
  expect("with a person check token", /^token-\d+$/.test(turnstile), true);
  expect("the agent answers", await msgs(page), [`agent: ${GREETING}`]);
  expect("focus in the box", await active(page), "chat-input");
  expect("status line", await statusLine(page), "Connected. The agent answered. Type your reply.");
  expect("the error is gone", await page.locator("#start-error").count(), 0);

  // Chat turns
  await page.click('.ask button[type="submit"]');
  expect("an empty message asks for one", await statusLine(page), "Type a message first.");
  const r2 = hold(api);
  api.turns.push({ replies: ["Oh no, I'm sorry. Is water still coming out right now?\n\nIf you can, shut off the valve under the sink."], alert: null, ended: false });
  await sendText(page, "Water is pouring out under my bathroom sink");
  await page.waitForSelector(".typing");
  expect("your message shows", (await msgs(page))[1], "you: Water is pouring out under my bathroom sink");
  expect("the agent is typing", await page.getAttribute(".typing", "aria-label"), "The agent is typing");
  expect("the box waits", await page.isDisabled("#chat-input"), true);
  expect("status while typing", await statusLine(page), "Sent. The agent is typing.");
  r2();
  await replied(page);
  expect("the reply, in two paragraphs", await page.locator(".msg-kai:last-child .msg-body p").count(), 2);
  expect("what the API was sent", JSON.stringify(api.calls.filter((c) => c.path === "/session/s1/message").at(-1).body), JSON.stringify({ text: "Water is pouring out under my bathroom sink" }));
  expect("status", await statusLine(page), "The agent replied.");
  expect("the box clears and keeps focus", `${await page.inputValue("#chat-input")}|${await active(page)}`, "|chat-input");
  api.turns.push({ replies: ["Thanks, Noa. Can I get the best callback number for you?"], alert: null, ended: false });
  await sendText(page, 'Yes. Noa Tanaka <img src=x onerror="document.title=1">');
  await replied(page);
  expect("typed HTML shows as text", (await msgs(page))[3], 'you: Yes. Noa Tanaka <img src=x onerror="document.title=1">');
  expect("and makes no element", await page.locator("#chat-log img").count(), 0);
  await page.click("[data-fill]");
  expect("the sample number button fills the box", `${await page.inputValue("#chat-input")}|${await active(page)}`, "808 555 0142|chat-input");
  api.turns.push({ replies: ["Let me read that back. 808 555 0142. Did I get that right?"], alert: null, ended: false });
  await page.press("#chat-input", "Enter");
  await replied(page);
  api.turns.push({ replies: ["I'm sending this to our emergency standby team now, and they'll call you directly within the next 15 minutes."], alert: ALERT, ended: false });
  await sendText(page, "Yes, that's right");
  await replied(page);
  expect("the alert lands on the on-call phone", await txt(page, ".mock-bubble"), `${ALERT.text} ${ALERT.time}`);
  expect("from the after-hours line", await txt(page, ".mock-from"), "After-hours line");
  expect("status", await statusLine(page), "The on-call phone just got the alert.");
  api.turns.push({ replies: ["Keep your phone close. Take care, Noa.", "Bye now."], alert: ALERT, ended: true });
  await sendText(page, "Thank you");
  await page.waitForSelector(".ended");
  expect("the agent hangs up", await txt(page, ".ended p"), "The agent ended the chat. The on-call alert went out.");
  expect("both parting lines", (await msgs(page)).slice(-2).join(" | "), "agent: Keep your phone close. Take care, Noa. | agent: Bye now.");
  expect("the box is gone", await page.locator("#chat-input").count(), 0);
  expect("focus on Start over", await active(page), "again");
  expect("status", await statusLine(page), "The agent ended the chat.");
  expect("the alert stays put", await page.locator(".mock-bubble").count(), 1);

  // Start over
  await page.click('[data-act="again"]');
  expect("back to setup", await active(page), "setup-title");
  expect("status", await statusLine(page), "Ready for another try.");
  expect("the phone is clear", await page.locator(".mock-bubble").count(), 0);
  expect("an ended chat isn't ended twice", api.calls.filter((c) => c.path === "/session/s1/end").length, 0);

  // A chat that times out, and Start over while the agent types
  await ready(page); await settle(page);
  await page.click(".start-btn");
  await page.waitForSelector("#chat-input");
  api.turns.push({ status: 409, detail: "This chat timed out. Start a new one to try again." });
  await sendText(page, "Hello?");
  await page.waitForSelector(".ended");
  expect("the timeout shows as a note", await lastMsg(page), "note: This chat timed out. Start a new one to try again.");
  expect("not as the agent", await page.locator(".msg-kai").count(), 1);
  expect("and the chat is over", await txt(page, ".ended p"), "This chat is over. No alert went out on this one.");
  await page.click('[data-act="again"]');
  await ready(page); await settle(page);
  await page.click(".start-btn");
  await page.waitForSelector("#chat-input");
  const r3 = hold(api);
  api.turns.push({ replies: ["This reply arrives after Start over."], alert: ALERT, ended: false });
  await sendText(page, "My ceiling is dripping");
  await page.waitForSelector(".typing");
  await page.click('[data-act="again"]');
  expect("Start over mid-reply ends that chat", await waitFor(() => api.calls.some((c) => c.path === "/session/s1/end")), true);
  r3();
  await page.waitForTimeout(150);
  expect("the late reply doesn't come back", `${await page.locator("#setup-title").count()}|${await page.locator(".mock-bubble").count()}`, "1|0");

  errors.length ? fail("errors: " + errors.join(" | ")) : ok("no console errors, failed requests or dialogs");
  await ctx.close();
}

console.log("\nfunctional, desktop 1280: voice");
{
  const { ctx, page, api, errors } = await open();
  await page.check('input[name="channel"][value="voice"]');
  await ready(page); await settle(page);
  await page.click(".start-btn");
  await page.waitForSelector("#call-label");
  expect("focus on Hang up", await active(page), "hangup");
  await page.waitForFunction(() => document.querySelector("#call-label").textContent === "On the call");
  expect("on the call", await callLabel(page), "On the call");
  expect("the browser got the token", await voiceLog(page), "start voice-token");
  expect("what it asked the API for", api.calls.filter((c) => c.path === "/session").at(-1).body.channel, "voice");
  expect("status", await statusLine(page), "You're on the call. Go ahead and talk.");
  expect("an empty transcript explains itself", await txt(page, "#voice-log"), "The conversation shows up here as you talk.");
  await voice(page, "agent_start_talking");
  expect("the agent talking", await callLabel(page), "The agent is talking");
  expect("the ring shows it", await page.getAttribute(".call-state", "class"), "call-state is-talking");
  await voice(page, "update", { transcript: [{ role: "agent", content: "Aloha — this is the after-hours line." }, { role: "user", content: "My ceiling is leaking <b>fast</b>" }] });
  await voice(page, "agent_stop_talking");
  expect("back to listening", await callLabel(page), "On the call");
  expect("the transcript, dashes swapped", await page.locator("#voice-log .msg").evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, " ").trim()).join(" | ")), "After-hours agent Aloha, this is the after-hours line. | You My ceiling is leaking <b>fast</b>");
  expect("HTML in the transcript stays text", await page.locator("#voice-log b").count(), 0);
  // Retell sends only the last five lines each time; the page keeps the whole call.
  const said = [["agent", "Aloha — this is the after-hours line."], ["user", "My ceiling is leaking <b>fast</b>"], ["agent", "Is water coming through right now?"], ["user", "Yes."], ["agent", "Can I get your name?"], ["user", "Noa Tanaka."], ["agent", "Thanks, Noa."]].map(([role, content]) => ({ role, content }));
  for (let n = 5; n <= said.length; n++) await voice(page, "update", { transcript: said.slice(n - 5, n) });
  expect("the whole call stays in the transcript", await page.locator("#voice-log .msg").count(), 7);
  expect("in order", await txt(page, "#voice-log .msg:last-child .msg-body"), "Thanks, Noa.");
  await page.click('[data-act="mute"]');
  expect("mute", `${await page.getAttribute('[data-act="mute"]', "aria-pressed")}|${await statusLine(page)}`, "true|Muted.");
  await page.click('[data-act="mute"]');
  expect("unmute", `${await page.getAttribute('[data-act="mute"]', "aria-pressed")}|${await statusLine(page)}`, "false|Unmuted.");
  expect("the call heard both", await voiceLog(page), "start voice-token, mute, unmute");
  api.alert = ALERT;
  await page.waitForSelector(".mock-bubble", { timeout: 4000 });
  expect("the alert arrives while talking", await txt(page, ".mock-bubble p"), ALERT.text);
  expect("status", await statusLine(page), "The on-call phone just got the alert.");
  await page.click('[data-act="hangup"]');
  await page.waitForSelector('[data-act="again"]');
  expect("hung up", await callLabel(page), "Call ended");
  expect("the call stops", (await voiceLog(page)).endsWith("stop"), true);
  expect("focus on Start over", await active(page), "again");
  expect("status", await statusLine(page), "Call ended. The alert went out.");
  const polls = api.calls.filter((c) => c.path === "/session/s1").length;
  await voice(page, "update", { transcript: [{ role: "agent", content: "A late line after hanging up." }] });
  await page.waitForTimeout(2300);
  expect("late events from the old call are ignored", (await txt(page, "#voice-log")).includes("late line"), false);
  expect("polling stops", api.calls.filter((c) => c.path === "/session/s1").length, polls);
  await page.click('[data-act="again"]');
  expect("Start over keeps Talk to it", await startBtn(page), "Start the call");
  expect("a voice call isn't ended through the chat route", api.calls.filter((c) => c.path === "/session/s1/end").length, 0);

  // The call drops, with no alert
  api.alert = null;
  await ready(page); await settle(page);
  await page.click(".start-btn");
  await page.waitForFunction(() => document.querySelector("#call-label")?.textContent === "On the call");
  await voice(page, "error", "socket closed");
  await page.waitForSelector('[data-act="again"]');
  expect("a dropped call says so", await txt(page, ".call-state .item-sub"), "The call dropped. Try again, or use the chat.");
  expect("status", await statusLine(page), "The call dropped. Try again, or use the chat.");
  await page.click('[data-act="again"]');

  // The agent hangs up, no alert
  await ready(page); await settle(page);
  await page.click(".start-btn");
  await page.waitForFunction(() => document.querySelector("#call-label")?.textContent === "On the call");
  await voice(page, "call_ended");
  await page.waitForSelector('[data-act="again"]');
  expect("the other side hangs up", `${await callLabel(page)}|${await txt(page, ".call-state .item-sub")}`, "Call ended|Thanks for trying it.");
  expect("status", await statusLine(page), "Call ended. No alert went out on this one.");
  await page.click('[data-act="again"]');

  // The microphone is blocked
  await page.evaluate(() => { window.__fake = { fail: "NotAllowedError" }; });
  await ready(page); await settle(page);
  await page.click(".start-btn");
  await page.waitForSelector('[data-act="again"]');
  expect("a blocked microphone says what to do", await txt(page, ".call-state .item-sub"), "Your browser blocked the microphone. Allow it and try again, or use the chat.");
  await page.click('[data-act="again"]');

  // Hang up while it's still connecting
  await page.evaluate(() => { window.__fake = { delay: 400 }; window.__voiceLog = []; });
  await ready(page); await settle(page);
  await page.click(".start-btn");
  await page.waitForSelector("#hangup");
  expect("connecting", await callLabel(page), "Connecting");
  await page.click("#hangup");
  await page.waitForTimeout(600);
  expect("the call that was connecting is stopped", (await voiceLog(page)).startsWith("start voice-token, stop"), true);
  expect("and the page stays ended", await callLabel(page), "Call ended");

  errors.length ? fail("errors: " + errors.join(" | ")) : ok("no console errors, failed requests or dialogs");
  await ctx.close();
}

console.log("\nfunctional, desktop 1280: real texts, resting, person check");
{
  const { ctx, page, api, errors } = await open({}, { health: { ok: true, chat: true, voice: true, real_sms: true } });
  expect("real texts can be picked", await page.isDisabled('input[name="mode"][value="real"]'), false);
  expect("and say what they are", await txt(page, "#real-note"), "One real text to your own US mobile number.");
  await page.check('input[name="mode"][value="real"]');
  expect("a number and a consent box appear", `${await page.locator("#real-phone").count()}|${await page.locator("#real-consent").count()}`, "1|1");
  expect("the consent links the SMS terms", await page.getAttribute(".consent a", "href"), "../terms.html#sms");
  await page.fill("#real-phone", "808 232 1234");
  await page.check("#real-consent");
  await page.check('input[name="channel"][value="voice"]');
  await page.check('input[name="channel"][value="chat"]');
  expect("the number survives a channel switch", `${await page.inputValue("#real-phone")}|${await page.isChecked("#real-consent")}`, "808 232 1234|true");
  await ready(page); await settle(page);
  await page.click(".start-btn");
  await page.waitForSelector("#chat-input");
  const body = api.calls.filter((c) => c.path === "/session").at(-1).body;
  expect("the number and consent go to the API", `${body.mode}|${body.phone}|${body.consent}`, "real|808 232 1234|true");
  expect("the right side is your phone", await phoneText(page), "Your phone When the agent flags an emergency, the on-call alert is texted to the number you entered.");
  api.turns.push({ replies: ["Sending it now."], alert: { ...ALERT, mode: "real", delivered: true, to: "your phone ending 1234" }, ended: false });
  await sendText(page, "Yes");
  await replied(page);
  expect("sent to your phone", await txt(page, ".real-sent"), "Sent. Check the texts on your phone ending 1234.");
  expect("with the text it sent", await txt(page, ".real-phone blockquote"), ALERT.text);
  expect("status", await statusLine(page), "The alert was texted to your phone.");
  await page.click('[data-act="again"]');
  expect("Start over keeps the number", await page.inputValue("#real-phone"), "808 232 1234");
  expect("but asks for consent again", await page.isChecked("#real-consent"), false);
  await ready(page); await settle(page);
  await page.check("#real-consent");
  await page.click(".start-btn");
  await page.waitForSelector("#chat-input");
  api.turns.push({ replies: ["Sending it now."], alert: { ...ALERT, mode: "real", delivered: false, to: "your phone ending 1234" }, ended: false });
  await sendText(page, "Yes");
  await replied(page);
  expect("a text that didn't go through", await txt(page, ".real-phone p"), "The text didn't go through. Here's what it said.");
  expect("status", await statusLine(page), "The alert text didn't go through.");
  errors.length ? fail("errors: " + errors.join(" | ")) : ok("no console errors");
  await ctx.close();
}
{
  const { ctx, page, errors } = await open({}, { health: { ok: true, chat: false, voice: true, real_sms: false } });
  expect("chat resting: Talk to it is picked", `${await page.isChecked('input[name="channel"][value="voice"]')}|${await startBtn(page)}`, "true|Start the call");
  expect("and chat can't be picked", await page.isDisabled('input[name="channel"][value="chat"]'), true);
  errors.length ? fail("errors: " + errors.join(" | ")) : ok("no console errors");
  await ctx.close();
}
{
  const { ctx, page, errors } = await open({}, { health: { ok: true, chat: true, voice: false, real_sms: false } });
  expect("voice resting: Talk to it can't be picked", await page.isDisabled('input[name="channel"][value="voice"]'), true);
  expect("chat still works", await startBtn(page), "Start the chat");
  errors.length ? fail("errors: " + errors.join(" | ")) : ok("no console errors");
  await ctx.close();
}
{
  const { ctx, page, errors } = await open({}, { healthStatus: 503 }, [503]);
  expect("the whole line resting", await txt(page, ".resting"), "The live line is resting right now The demo server didn't answer. Try again in a few minutes, or see how a call goes in the example below.");
  expect("no start button", await page.locator(".start-btn").count(), 0);
  expect("the example call is still there", await page.locator(".example-call li").count() > 0, true);
  errors.length ? fail("errors: " + errors.join(" | ")) : ok("no console errors");
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { window.__fake = { holdCheck: true }; });
  await stub(ctx, {});
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "load" });
  await ready(page);
  await page.click(".start-btn");
  expect("the person check not done yet", await txt(page, "#start-error"), "One moment, the quick person check hasn't finished. Try again in a second.");
  expect("focus on the message", await active(page), "start-error");
  await ctx.close();
}
{
  const { ctx, page, errors } = await open({}, { turnstileDown: true });
  await page.waitForSelector(".human-check .item-sub");
  expect("the person check can't load", await txt(page, ".human-check"), 'The "are you a person" check couldn\'t load. If you use a blocker, allow challenges.cloudflare.com and refresh.');
  errors.length ? fail("errors: " + errors.join(" | ")) : ok("no other console errors");
  await ctx.close();
}

// ── 1b. functional, phone ─────────────────────────────────────────────────
console.log("\nfunctional, phone 390 (touch)");
{
  const { ctx, page, api, errors } = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ready(page); await settle(page);
  await page.tap(".start-btn");
  await page.waitForSelector("#chat-input");
  await page.tap("[data-fill]");
  api.turns.push({ replies: ["Sending it now."], alert: ALERT, ended: false });
  await page.tap('.ask button[type="submit"]');
  await replied(page);
  expect("a chat on a phone", await txt(page, ".mock-bubble p"), ALERT.text);
  const box = await page.locator(".mock-phone").boundingBox();
  const chat = await page.locator("#chat-log").boundingBox();
  expect("the phone sits under the chat", box.y > chat.y + chat.height, true);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  overflow > 1 ? fail(`phone overflow ${overflow}px`) : ok("no sideways scroll on a phone");
  errors.length ? fail("errors: " + errors.join(" | ")) : ok("no console errors");
  await ctx.close();
}

// ── 2. axe and page health in every state ─────────────────────────────────
const toChat = async (p) => { await ready(p); await settle(p); await p.click(".start-btn"); await p.waitForSelector("#chat-input"); };
const toCall = async (p) => { await p.check('input[name="channel"][value="voice"]'); await ready(p); await settle(p); await p.click(".start-btn"); await p.waitForFunction(() => document.querySelector("#call-label")?.textContent === "On the call"); };
const STATES = [
  ["Setup", async () => {}],
  ["Setup, a refused start", async (p, api) => { await ready(p); await settle(p); api.startError = [429, "The demo has had a busy day. Try again tomorrow."]; await p.click(".start-btn"); await p.waitForSelector("#start-error"); }, [429]],
  ["Setup, real texts with the number fields", async (p) => { await p.check('input[name="mode"][value="real"]'); await p.fill("#real-phone", "808 232 1234"); }, [], { health: { ok: true, chat: true, voice: true, real_sms: true } }],
  ["Chat, the agent typing", async (p, api) => { await toChat(p); hold(api); await sendText(p, "Water everywhere"); await p.waitForSelector(".typing"); }],
  ["Chat, the alert on the phone", async (p, api) => { await toChat(p); api.turns.push({ replies: ["Sending it now."], alert: ALERT, ended: false }); await sendText(p, "Yes"); await replied(p); }],
  ["Chat, ended by the agent", async (p, api) => { await toChat(p); api.turns.push({ replies: ["Take care."], alert: ALERT, ended: true }); await sendText(p, "Thanks"); await p.waitForSelector(".ended"); }],
  ["Chat, timed out", async (p, api) => { await toChat(p); api.turns.push({ status: 409, detail: "This chat timed out. Start a new one to try again." }); await sendText(p, "Hello?"); await p.waitForSelector(".ended"); }, [409]],
  ["Chat, real text sent", async (p, api) => { await p.check('input[name="mode"][value="real"]'); await p.fill("#real-phone", "808 232 1234"); await p.check("#real-consent"); await toChat(p); api.turns.push({ replies: ["Sending it now."], alert: { ...ALERT, mode: "real", delivered: true, to: "your phone ending 1234" }, ended: false }); await sendText(p, "Yes"); await replied(p); }, [], { health: { ok: true, chat: true, voice: true, real_sms: true } }],
  ["Voice, talking with a transcript", async (p) => { await toCall(p); await voice(p, "agent_start_talking"); await voice(p, "update", { transcript: [{ role: "agent", content: "Aloha, what's going on?" }, { role: "user", content: "My ceiling is leaking." }] }); }],
  ["Voice, ended with the alert", async (p, api) => { await toCall(p); api.alert = ALERT; await p.waitForSelector(".mock-bubble", { timeout: 4000 }); await p.click("#hangup"); await p.waitForSelector('[data-act="again"]'); }],
  ["Voice, microphone blocked", async (p) => { await p.evaluate(() => { window.__fake = { fail: "NotAllowedError" }; }); await p.check('input[name="channel"][value="voice"]'); await ready(p); await settle(p); await p.click(".start-btn"); await p.waitForSelector('[data-act="again"]'); }],
  ["The line resting", async () => {}, [503], { healthStatus: 503 }],
];
for (const width of [1440, 1024, 390]) {
  console.log(`\naxe and health, ${width}px`);
  for (const [label, act, httpErrors = [], cfg = {}] of STATES) {
    const { ctx, page, api, errors } = await open({ viewport: { width, height: 900 }, isMobile: width < 600, hasTouch: width < 600 }, cfg, httpErrors);
    try { await act(page, api); } catch (e) { errors.push("step failed: " + e.message.split("\n")[0]); }
    await page.waitForTimeout(400); // let hover colours, the alert's arrival and the sticky nav finish before measuring contrast
    await page.addScriptTag({ url: AXE });
    const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } })).violations.map((x) => `${x.id} x${x.nodes.length} (${x.nodes[0].target.join(" ")})`));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const problems = [...v, ...errors, ...(overflow > 1 ? [`overflow ${overflow}px`] : [])];
    problems.length ? fail(`${label}: ${problems.join(" | ")}`) : ok(label);
    if (api.gate) { api.gate = null; }
    await ctx.close();
  }
}

// ── 3. JS off and reduced motion ──────────────────────────────────────────
console.log("\nJS off and reduced motion");
{
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(URL);
  (await page.locator(".demo-nojs").isVisible()) ? ok("JS off: the explanation shows") : fail("JS off: no explanation");
  (await page.locator(".demo-try").isVisible()) && (await page.locator(".example-call").isVisible()) && (await page.locator(".why-grid").isVisible()) ? ok("JS off: intro, example call and why panel still read") : fail("JS off: page content missing");
  await ctx.close();
}
{
  const { ctx, page, api } = await open({ reducedMotion: "reduce" });
  await toChat(page);
  hold(api);
  await sendText(page, "Water everywhere");
  await page.waitForSelector(".typing");
  await page.waitForTimeout(50);
  let running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
  running === 0 ? ok("reduced motion: nothing animating while the agent types") : fail(`reduced motion: ${running} animations running while typing`);
  await ctx.close();
}
{
  const { ctx, page, api } = await open({ reducedMotion: "reduce" });
  await toCall(page);
  await voice(page, "agent_start_talking");
  api.alert = ALERT;
  await page.waitForSelector(".mock-bubble", { timeout: 4000 });
  expect("reduced motion: the alert doesn't slide in", await page.locator(".mock-bubble.is-new").count(), 0);
  await page.waitForTimeout(50);
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
  running === 0 ? ok("reduced motion: nothing animating on a call") : fail(`reduced motion: ${running} animations running on a call`);
  await ctx.close();
}

await browser.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
