/* Phone demo: Island Emergency Restoration's after-hours line. The only demo that talks to a
   server: the Iterate demos API starts a real Retell chat or browser voice call with the
   demo agent, and when the agent sends its alert the API hands it back here. In simulated
   mode the alert lands on the on-call phone drawn on the page; in real mode it's texted to
   the visitor's own number (only when the API has real texts switched on).
   The page keeps nothing: a refresh or "Start over" begins again. */
(function () {
  "use strict";

  const root = document.getElementById("phone-app");
  if (!root || !window.PhoneLogic) return;
  const L = window.PhoneLogic;

  // The real person check only runs on iteratehi.com. Previews anywhere else use Cloudflare's
  // always-pass test key, which the API accepts only while it's set up for review (see the
  // API's README). ?api=local talks to an API running on this machine instead.
  const LIVE = /(^|\.)iteratehi\.com$/.test(location.hostname);
  const API = (new URLSearchParams(location.search).get("api") === "local" ? root.dataset.apiLocal : root.dataset.api).replace(/\/$/, "");
  const SITEKEY = LIVE ? root.dataset.sitekey : "1x00000000000000000000AA";
  const SDK = "https://cdn.jsdelivr.net/npm/retell-client-js-sdk@3.0.1/+esm";
  const TURNSTILE = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  const SAMPLE = "808 555 0142";
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  const fresh = () => ({ stage: "setup", channel: "chat", mode: "simulated", phone: "", consent: false, token: "", starting: false, error: "", session: null, messages: [], waiting: false, alert: null, ended: false, voice: { status: "", muted: false, transcript: [] } });
  let S = fresh();
  let health = null;
  let voiceClient = null;
  let pollTimer = 0;
  let widgetId = null;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const paras = (t) => esc(t).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");

  // ── shell ────────────────────────────────────────────────────────────────
  root.innerHTML = `
    <div class="app-bar">
      <div class="app-id"><span class="app-dot" aria-hidden="true">I</span><div><p class="app-name">Island Emergency Restoration</p><p class="app-sub">After-hours line</p></div></div>
      <p class="sync-live line-live" id="line-state"><span class="live-dot" aria-hidden="true"></span>Answering 24/7</p>
    </div>
    <div class="line">
      <div class="line-main" id="line-main"></div>
      <div class="line-phone" id="line-phone"></div>
    </div>
    <p class="app-status" id="line-status" role="status" aria-live="polite">Nothing is saved. Refresh or start over any time.</p>`;
  const $ = (sel) => root.querySelector(sel);
  const say = (text) => { $("#line-status").textContent = text; };

  // ── the phone on the right ───────────────────────────────────────────────
  function renderPhone() {
    const box = $("#line-phone");
    if (S.mode === "real" && S.stage !== "setup") {
      const a = S.alert;
      box.innerHTML = `<div class="real-phone"><h2>Your phone</h2>${
        !a ? `<p>When the agent flags an emergency, the on-call alert is texted to the number you entered.</p>`
          : a.delivered ? `<p class="real-sent"><strong>Sent.</strong> Check the texts on ${esc(a.to)}.</p><blockquote>${esc(a.text)}</blockquote>`
            : `<p><strong>The text didn't go through.</strong> Here's what it said.</p><blockquote>${esc(a.text)}</blockquote>`}</div>`;
      return;
    }
    const a = S.alert;
    box.innerHTML = `<div class="mock-phone">
      <div class="mock-top"><span class="mock-notch" aria-hidden="true"></span><h2 class="mock-title">On-call phone</h2><p class="mock-sub">The tech on call tonight</p></div>
      <div class="mock-screen">${a
        ? `<div class="mock-from">After-hours line</div><div class="mock-bubble${reduced() ? "" : " is-new"}"><p>${esc(a.text)}</p><span class="mock-time">${esc(a.time)}</span></div>`
        : `<p class="mock-empty">No new texts. When the agent flags an emergency, the alert lands here.</p>`}</div>
    </div>`;
  }

  // ── setup ────────────────────────────────────────────────────────────────
  function renderSetup(focus) {
    const realOn = !!(health && health.real_sms);
    const off = health && !health[S.channel];
    $("#line-main").innerHTML = `
      <form class="setup" data-form="start" novalidate>
        <h2 tabindex="-1" id="setup-title">Try the after-hours line</h2>
        <fieldset class="choice"${S.starting ? " disabled" : ""}><legend>How do you want to reach it?</legend>
          <label class="choice-opt"><input type="radio" name="channel" value="chat"${S.channel === "chat" ? " checked" : ""}${health && !health.chat ? " disabled" : ""}><span><strong>Chat</strong><span class="item-sub">Type to it. Same agent, same rules as the phone line.</span></span></label>
          <label class="choice-opt"><input type="radio" name="channel" value="voice"${S.channel === "voice" ? " checked" : ""}${health && !health.voice ? " disabled" : ""}><span><strong>Talk to it</strong><span class="item-sub">A real voice call in your browser. It asks to use your microphone.</span></span></label>
        </fieldset>
        <fieldset class="choice"${S.starting ? " disabled" : ""}><legend>Where should the on-call alert go?</legend>
          <label class="choice-opt"><input type="radio" name="mode" value="simulated"${S.mode === "simulated" ? " checked" : ""}><span><strong>The phone on this page</strong><span class="item-sub">Use the sample number ${SAMPLE} and watch the text arrive on the right.</span></span></label>
          <label class="choice-opt${realOn ? "" : " is-off"}"><input type="radio" name="mode" value="real"${S.mode === "real" ? " checked" : ""}${realOn ? "" : " disabled"} aria-describedby="real-note"><span><strong>Text my phone</strong><span class="item-sub" id="real-note">${realOn ? "One real text to your own US mobile number." : "Real texts aren't switched on yet. The phone on this page shows the exact same text."}</span></span></label>
        </fieldset>
        ${S.mode === "real" ? `<div class="real-fields">
          <div class="pfield"><label for="real-phone">Your mobile number</label><input id="real-phone" type="tel" inputmode="tel" autocomplete="tel" value="${esc(S.phone)}" placeholder="808 555 0123"></div>
          <label class="consent"><input type="checkbox" id="real-consent"${S.consent ? " checked" : ""}> <span>This is my number, and I'm OK getting one text from Iterate for this demo. It's not saved or used for anything else. Reply STOP to opt out. <a class="tlink" href="../terms.html#sms">SMS terms</a>.</span></label>
        </div>` : ""}
        <div class="human-check" id="human-check" role="group" aria-label="Quick check that you're a person"></div>
        ${S.error ? `<p class="perror" role="alert" id="start-error" tabindex="-1">${esc(S.error)}</p>` : ""}
        ${off ? `<p class="perror" role="alert">This part of the demo is resting right now. Try the other one.</p>` : ""}
        <button type="submit" class="app-btn app-btn-primary start-btn"${S.starting ? " disabled" : ""}>${S.starting ? "Connecting" : S.channel === "voice" ? "Start the call" : "Start the chat"}</button>
        <p class="item-sub setup-note">This is a demo. Nobody from Island Emergency Restoration will call you back.</p>
      </form>`;
    mountTurnstile();
    if (focus) ($(focus) || $("#setup-title")).focus();
  }
  let turnstileLoad = null; // one load for the page; a failed load stays failed until a refresh
  function loadTurnstile() {
    turnstileLoad = turnstileLoad || new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = TURNSTILE; s.async = true; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
    return turnstileLoad;
  }
  async function mountTurnstile() {
    const box = $("#human-check");
    if (!box) return;
    try {
      await loadTurnstile();
      if (!document.body.contains(box)) return;
      if (widgetId !== null) { try { window.turnstile.remove(widgetId); } catch (e) { /* already gone */ } }
      S.token = "";
      widgetId = window.turnstile.render(box, {
        sitekey: SITEKEY,
        size: "flexible",
        callback: (t) => { S.token = t; },
        "expired-callback": () => { S.token = ""; },
        "error-callback": () => { S.token = ""; },
      });
    } catch (e) {
      box.innerHTML = `<p class="item-sub">The "are you a person" check couldn't load. If you use a blocker, allow challenges.cloudflare.com and refresh.</p>`;
    }
  }

  async function api(path, body) {
    const r = await fetch(API + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
    let data = {};
    try { data = await r.json(); } catch (e) { /* empty body */ }
    if (!r.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Something went wrong. Try again in a moment.");
    return data;
  }

  async function start() {
    if (S.starting) return;
    if (S.mode === "real") {
      S.phone = $("#real-phone").value.trim();
      S.consent = $("#real-consent").checked;
    }
    if (!S.token) { S.error = "One moment. The person check above hasn't finished yet. If it shows a box to tick, tick it, then start again."; return renderSetup("#start-error"); }
    S.starting = true;
    S.error = "";
    renderSetup();
    const channel = S.channel;
    try {
      const out = await api("/session", { channel, mode: S.mode, phone: S.mode === "real" ? S.phone : null, consent: S.consent, turnstile: S.token });
      S.session = out.session;
      S.starting = false;
      if (channel === "chat") {
        S.stage = "chat";
        S.messages = [{ from: "agent", text: out.greeting }];
        renderChat("#chat-input");
        renderPhone();
        say("Connected. The agent answered. Type your reply.");
      } else {
        S.stage = "voice";
        S.voice = { status: "connecting", muted: false, transcript: [] };
        renderVoice("#hangup");
        renderPhone();
        await startVoice(out.access_token);
      }
    } catch (e) {
      S.starting = false;
      S.error = e.message || "Couldn't reach the demo. Try again in a moment.";
      renderSetup("#start-error");
    }
  }

  // ── chat ─────────────────────────────────────────────────────────────────
  function chatLog() {
    return S.messages.map((m) => m.from === "note" ? `<p class="chat-note">${esc(m.text)}</p>`
      : `<div class="msg ${m.from === "you" ? "msg-you" : "msg-kai"}"><span class="msg-who">${m.from === "you" ? "You" : "After-hours agent"}</span><div class="msg-body">${paras(m.text)}</div></div>`).join("")
      + (S.waiting ? `<div class="msg msg-kai is-typing"><span class="msg-who">After-hours agent</span><div class="msg-body"><span class="typing" role="img" aria-label="The agent is typing"><span></span><span></span><span></span></span></div></div>` : "");
  }
  function renderChat(focus) {
    $("#line-main").innerHTML = `
      <div class="chat line-chat" id="chat-log" role="log" aria-label="Conversation with the after-hours agent" tabindex="0">${chatLog()}</div>
      ${S.ended
        ? `<div class="ended"><p><strong>${S.ended === "agent" ? "The agent ended the chat." : "This chat is over."}</strong> ${S.alert ? "The on-call alert went out." : "No alert went out on this one."}</p><button type="button" class="app-btn app-btn-primary" data-act="again">Start over</button></div>`
        : `<form class="ask" data-form="send" novalidate>
            <label class="sr-only" for="chat-input">Your message</label>
            <input id="chat-input" type="text" autocomplete="off" maxlength="500" placeholder="Tell it what's going on"${S.waiting ? " disabled" : ""}>
            <button type="submit" class="app-btn app-btn-primary"${S.waiting ? " disabled" : ""}>Send</button>
          </form>
          <div class="chat-tools"><button type="button" class="prompt" data-fill="${SAMPLE}"${S.waiting ? " disabled" : ""}>Use the sample number ${SAMPLE}</button><button type="button" class="app-btn app-btn-quiet" data-act="again">Start over</button></div>`}`;
    const log = $("#chat-log");
    log.scrollTop = log.scrollHeight;
    if (focus) { const el = $(focus); if (el) el.focus(); }
  }
  async function send(text) {
    const t = String(text).trim();
    if (!t || S.waiting || S.ended) return;
    S.messages.push({ from: "you", text: t });
    S.waiting = true;
    renderChat();
    say("Sent. The agent is typing.");
    const sid = S.session;
    try {
      const out = await api(`/session/${sid}/message`, { text: t });
      if (S.session !== sid) return; // started over while it was typing
      S.waiting = false;
      for (const r of out.replies) S.messages.push({ from: "agent", text: r });
      const newAlert = out.alert && !S.alert;
      if (out.alert) S.alert = out.alert;
      S.ended = out.ended ? "agent" : false;
      renderChat(S.ended ? '[data-act="again"]' : "#chat-input");
      if (newAlert) { renderPhone(); say(alertSay()); }
      else say(S.ended ? "The agent ended the chat." : "The agent replied.");
    } catch (e) {
      if (S.session !== sid) return;
      S.waiting = false;
      S.messages.push({ from: "note", text: e.message });
      if (/ended|timed out|end of this demo/.test(e.message)) S.ended = "over";
      renderChat(S.ended ? '[data-act="again"]' : "#chat-input");
      say(e.message);
    }
  }
  const alertSay = () => (S.mode === "real" ? (S.alert.delivered ? "The alert was texted to your phone." : "The alert text didn't go through.") : "The on-call phone just got the alert.");

  // ── voice ────────────────────────────────────────────────────────────────
  function renderVoice(focus) {
    const v = S.voice;
    const label = { connecting: "Connecting", live: "On the call", talking: "The agent is talking", ended: "Call ended", error: "Call ended" }[v.status] || "Connecting";
    $("#line-main").innerHTML = `
      <div class="call">
        <div class="call-state is-${esc(v.status)}"><span class="call-ring" aria-hidden="true"></span><div><p class="item-name" id="call-label">${label}</p><p class="item-sub">${v.status === "ended" || v.status === "error" ? (S.error ? esc(S.error) : "Thanks for trying it.") : "Talk out loud like you would on the phone. Try the sample number " + SAMPLE + "."}</p></div></div>
        <div class="chat line-chat voice-log" id="voice-log" role="log" aria-label="What's being said" tabindex="0">${v.transcript.length ? v.transcript.map((m) => `<div class="msg ${m.role === "user" ? "msg-you" : "msg-kai"}"><span class="msg-who">${m.role === "user" ? "You" : "After-hours agent"}</span><div class="msg-body"><p>${esc(m.content)}</p></div></div>`).join("") : `<p class="item-sub">The conversation shows up here as you talk.</p>`}</div>
        <div class="notice-actions">${v.status === "ended" || v.status === "error"
          ? `<button type="button" class="app-btn app-btn-primary" data-act="again">Start over</button>`
          : `<button type="button" class="toggle" data-act="mute" aria-pressed="${v.muted}">Mute</button><button type="button" class="app-btn app-btn-primary" id="hangup" data-act="hangup">Hang up</button>`}</div>
      </div>`;
    const log = $("#voice-log");
    log.scrollTop = log.scrollHeight;
    if (focus) { const el = $(focus); if (el) el.focus(); }
  }
  function updateVoice() {
    const v = S.voice;
    const lbl = $("#call-label");
    if (!lbl || v.status === "ended" || v.status === "error") return renderVoice();
    lbl.textContent = { connecting: "Connecting", live: "On the call", talking: "The agent is talking" }[v.status] || "On the call";
    root.querySelector(".call-state").className = `call-state is-${v.status}`;
    const log = $("#voice-log");
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    log.innerHTML = v.transcript.length ? v.transcript.map((m) => `<div class="msg ${m.role === "user" ? "msg-you" : "msg-kai"}"><span class="msg-who">${m.role === "user" ? "You" : "After-hours agent"}</span><div class="msg-body"><p>${esc(m.content)}</p></div></div>`).join("") : `<p class="item-sub">The conversation shows up here as you talk.</p>`;
    if (atBottom) log.scrollTop = log.scrollHeight;
  }
  async function startVoice(token) {
    const session = S.session;
    const current = () => S.session === session && S.stage === "voice" && S.voice.status !== "ended" && S.voice.status !== "error";
    try {
      const mod = await import(SDK);
      if (!current()) return; // hung up or started over while the call was loading
      const c = new mod.RetellWebClient();
      voiceClient = c;
      const on = (ev, fn) => c.on(ev, (x) => { if (voiceClient === c) fn(x); }); // late events from an old call are ignored
      on("call_started", () => { S.voice.status = "live"; updateVoice(); say("You're on the call. Go ahead and talk."); });
      on("agent_start_talking", () => { S.voice.status = "talking"; updateVoice(); });
      on("agent_stop_talking", () => { if (S.voice.status === "talking") S.voice.status = "live"; updateVoice(); });
      on("update", (u) => { if (u && Array.isArray(u.transcript)) { S.voice.transcript = L.mergeTranscript(S.voice.transcript, u.transcript.map(L.turn)); updateVoice(); } });
      on("call_ended", () => endVoice(""));
      on("error", () => endVoice("The call dropped. Try again, or use the chat."));
      await c.startCall({ accessToken: token });
      if (!current()) { try { c.stopCall(); } catch (e) { /* already stopped */ } return; }
      poll();
    } catch (e) {
      if (!current()) return;
      const blocked = /permission|notallowed|denied/i.test(String(e && (e.name || e.message)));
      endVoice(blocked ? "Your browser blocked the microphone. Allow it and try again, or use the chat." : "The call couldn't start. Try again, or use the chat.");
    }
  }
  async function endVoice(message) {
    if (S.voice.status === "ended" || S.voice.status === "error") return;
    S.voice.status = message ? "error" : "ended";
    S.error = message;
    clearTimeout(pollTimer);
    try { voiceClient && voiceClient.stopCall(); } catch (e) { /* already stopped */ }
    voiceClient = null;
    await checkAlert();
    renderVoice('[data-act="again"]');
    say(message || (S.alert ? "Call ended. The alert went out." : "Call ended. No alert went out on this one."));
  }
  async function checkAlert() {
    if (!S.session || S.alert) return;
    try {
      const out = await api(`/session/${S.session}`);
      if (out.alert) { S.alert = out.alert; renderPhone(); say(alertSay()); }
    } catch (e) { /* the call can go on without it */ }
  }
  function poll() {
    clearTimeout(pollTimer);
    if (S.stage !== "voice" || S.voice.status === "ended" || S.voice.status === "error") return;
    pollTimer = setTimeout(async () => { await checkAlert(); poll(); }, 2000);
  }

  // ── actions ──────────────────────────────────────────────────────────────
  function again() {
    clearTimeout(pollTimer);
    try { voiceClient && voiceClient.stopCall(); } catch (e) { /* not on a call */ }
    voiceClient = null;
    if (S.session && S.stage === "chat" && !S.ended) api(`/session/${S.session}/end`, {}).catch(() => {});
    const keep = { channel: S.channel, mode: S.mode, phone: S.phone };
    S = { ...fresh(), ...keep };
    renderSetup("#setup-title");
    renderPhone();
    say("Ready for another try.");
  }
  root.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t || !root.contains(t) || t.disabled) return;
    if (t.dataset.fill) { const i = $("#chat-input"); if (i) { i.value = t.dataset.fill; i.focus(); } return; }
    switch (t.dataset.act) {
      case "again": return again();
      case "hangup": return endVoice("");
      case "mute":
        S.voice.muted = !S.voice.muted;
        try { S.voice.muted ? voiceClient.mute() : voiceClient.unmute(); } catch (err) { /* not connected yet */ }
        t.setAttribute("aria-pressed", String(S.voice.muted));
        return say(S.voice.muted ? "Muted." : "Unmuted.");
    }
  });
  root.addEventListener("change", (e) => {
    const t = e.target;
    if (t.name === "channel" || t.name === "mode") {
      if (S.mode === "real") { const p = $("#real-phone"), c = $("#real-consent"); if (p) S.phone = p.value; if (c) S.consent = c.checked; }
      S[t.name] = t.value;
      S.error = "";
      renderSetup(`input[name="${t.name}"][value="${t.value}"]`);
      renderPhone();
    }
  });
  root.addEventListener("submit", (e) => {
    e.preventDefault();
    if (e.target.dataset.form === "start") return start();
    if (e.target.dataset.form === "send") {
      const i = $("#chat-input");
      if (!i.value.trim()) { i.focus(); return say("Type a message first."); }
      const v = i.value;
      i.value = "";
      return send(v);
    }
  });

  // ── boot ─────────────────────────────────────────────────────────────────
  renderSetup();
  renderPhone();
  api("/health").then((h) => {
    health = h;
    if (S.stage === "setup") { if (!h.chat && h.voice) S.channel = "voice"; renderSetup(); }
  }).catch(() => {
    health = { chat: false, voice: false, real_sms: false };
    if (S.stage === "setup") $("#line-main").innerHTML = `<div class="resting"><h2>The live line is resting right now</h2><p>The demo server didn't answer. Try again in a few minutes, or see how a call goes in the example below.</p></div>`;
  });
})();
