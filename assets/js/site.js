/* ==========================================================================
   Iterate

   Built the way the Elevate Media site was: one IIFE per effect, so any of
   them can be deleted without touching the others. GSAP is optional
   throughout. Where it is missing, the effect degrades to CSS or does not run,
   and the page stays complete either way.

   Three rules every effect here follows:
     1. Nothing animates when the visitor asked for reduced motion.
     2. No loop runs while its section is off screen or the tab is hidden.
     3. Content is never left hidden if the script fails.
   ========================================================================== */

(function () {
  "use strict";

  /* Where enquiries go. One address, swapped here when the Workspace moves. */
  var TO = "aloha@iteratehi.com";
  var TEL = "(808) 201-4040";

  /* -- Shared gate ------------------------------------------------------- */

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  var wide = window.matchMedia("(min-width: 901px)");
  var hasGsap = typeof window.gsap !== "undefined";
  var hasST = hasGsap && typeof window.ScrollTrigger !== "undefined";

  if (hasST) window.gsap.registerPlugin(window.ScrollTrigger);

  function motionOK() { return !reduced.matches; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function debounce(fn, ms) {
    var t;
    return function () {
      var a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms || 160);
    };
  }

  /* A loop that only runs while its element is on screen and the tab is
     visible. Every continuous animation in this file goes through it. */
  function visibleLoop(el, step) {
    var raf = 0, onScreen = false;

    function frame(t) {
      if (!onScreen || document.hidden) { raf = 0; return; }
      step(t);
      raf = requestAnimationFrame(frame);
    }
    function start() { if (!raf && onScreen && !document.hidden) raf = requestAnimationFrame(frame); }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[0].isIntersecting;
        onScreen ? start() : stop();
      }, { rootMargin: "120px" }).observe(el);
    } else {
      onScreen = true;
      start();
    }

    document.addEventListener("visibilitychange", function () {
      document.hidden ? stop() : start();
    });

    return { stop: stop, start: start };
  }

  /* Sizes a canvas to its box in real device pixels, capped at 2x. */
  function fitCanvas(canvas) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: r.width, h: r.height };
  }

  /* Once-only "scrolled into view" for anything that is not [data-reveal]. */
  function onView(els, fn, threshold) {
    if (!els.length) return;
    if (!("IntersectionObserver" in window)) { els.forEach(fn); return; }
    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        fn(e.target);
        obs.unobserve(e.target);
      });
    }, { threshold: threshold || 0.3, rootMargin: "0px 0px -6% 0px" });
    els.forEach(function (el) { io.observe(el); });
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /* -- 01  Nav ----------------------------------------------------------- */

  (function nav() {
    var bar = $(".nav");
    if (!bar) return;

    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        bar.classList.toggle("stuck", window.scrollY > 40);
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    var burger = $(".burger");
    var menu = $(".nav-menu");
    if (!burger || !menu) return;

    var lastFocus = null;

    function open() {
      lastFocus = document.activeElement;
      menu.hidden = false;
      burger.setAttribute("aria-expanded", "true");
      document.body.classList.add("menu-open");
      var first = $("a, button", menu);
      if (first) first.focus();
    }
    function close() {
      menu.hidden = true;
      burger.setAttribute("aria-expanded", "false");
      document.body.classList.remove("menu-open");
      if (lastFocus) lastFocus.focus();
    }
    function isOpen() { return burger.getAttribute("aria-expanded") === "true"; }

    burger.addEventListener("click", function () { isOpen() ? close() : open(); });
    menu.addEventListener("click", function (e) { if (e.target.closest("a")) close(); });

    document.addEventListener("keydown", function (e) {
      if (!isOpen()) return;
      if (e.key === "Escape") { close(); return; }
      if (e.key !== "Tab") return;
      // Keep focus inside the open menu, the burger included so it can close.
      var items = [burger].concat($$("a, button", menu)).filter(function (n) { return n.offsetParent !== null; });
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    window.addEventListener("resize", debounce(function () {
      if (window.innerWidth > 900 && isOpen()) close();
    }, 200));
  })();

  /* -- 02  Reveal on scroll ---------------------------------------------- */

  (function reveal() {
    var items = $$("[data-reveal]");
    if (!items.length) return;

    function showAll() { items.forEach(function (el) { el.classList.add("in", "settled"); }); }
    if (!motionOK() || !("IntersectionObserver" in window)) { showAll(); return; }

    /* Once an element has finished revealing, drop the transition. Left in
       place, it fights anything that later drives transform on the same
       element, which is exactly what the tilt cards do. */
    function settle(el) {
      if (el.dataset.settled) return;
      el.dataset.settled = "1";
      el.classList.add("settled");
      el.style.removeProperty("--d");
    }

    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        el.classList.add("in");
        obs.unobserve(el);
        el.addEventListener("transitionend", function onEnd(ev) {
          if (ev.target !== el || ev.propertyName !== "transform") return;
          el.removeEventListener("transitionend", onEnd);
          settle(el);
        });
        setTimeout(function () { settle(el); }, 1600);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });

    items.forEach(function (el) {
      if (!el.style.getPropertyValue("--d")) {
        var sibs = el.parentElement ? $$(":scope > [data-reveal]", el.parentElement) : [];
        var idx = sibs.indexOf(el);
        if (idx > 0) el.style.setProperty("--d", Math.min(idx, 6) * 110 + "ms");
      }
      io.observe(el);
    });
  })();

  /* -- 03  Count up ------------------------------------------------------ */

  (function counters() {
    var nums = $$("[data-count]");
    if (!nums.length) return;

    function run(el) {
      var target = parseFloat(el.getAttribute("data-count"));
      var suffix = el.getAttribute("data-suffix") || "";
      if (isNaN(target)) return;
      if (!motionOK()) { el.textContent = target + suffix; return; }
      var start = performance.now(), dur = 1800;
      (function tick(now) {
        var p = Math.min((now - start) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      })(start);
    }

    onView(nums, run, 0.6);
  })();

  /* -- 04  Hero network -------------------------------------------------- */
  /* Nodes drifting on the cream, joined by faint navy lines when they come
     close, with small coral packets running along the live connections. It
     reads as a system quietly doing its work, which is the whole pitch. The
     pointer acts as one more node while it is over the hero.

     Under reduced motion it draws a single still frame and never loops. */

  (function network() {
    var canvas = $("#hero-canvas");
    if (!canvas) return;

    var size = fitCanvas(canvas);
    var ctx = size.ctx, W = size.w, H = size.h;
    var link = W > 700;
    var LINK = 130, LINK2 = LINK * LINK, REACH = 160, REACH2 = REACH * REACH;
    var ink = cssVar("--ink") || "#181d38";
    var coral = cssVar("--accent-rgb") || "237, 116, 112";
    var inkRGB = hexToRgb(ink);
    var nodes = [], packets = [];
    var pointer = { x: -999, y: -999, on: false };

    function hexToRgb(h) {
      h = h.replace("#", "");
      if (h.length === 3) h = h.replace(/./g, "$&$&");
      var n = parseInt(h, 16);
      return ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255);
    }

    function build() {
      var n = Math.min(Math.round(W * H / 22000), link ? 70 : 28);
      nodes = [];
      packets = [];
      for (var i = 0; i < n; i++) {
        var hub = i % 7 === 0;
        nodes.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.36,
          vy: (Math.random() - 0.5) * 0.36,
          r: hub ? 3.2 : Math.random() * 1.4 + 1.2,
          hub: hub
        });
      }
    }

    function near(a, b) {
      var dx = a.x - b.x, dy = a.y - b.y;
      return dx * dx + dy * dy <= LINK2;
    }

    function spawnPacket() {
      if (!link || packets.length >= 6 || !nodes.length) return;
      var a = nodes[(Math.random() * nodes.length) | 0];
      for (var k = 0; k < nodes.length; k++) {
        var b = nodes[(Math.random() * nodes.length) | 0];
        if (b !== a && near(a, b)) { packets.push({ a: a, b: b, t: 0 }); return; }
      }
    }

    function draw(move) {
      ctx.clearRect(0, 0, W, H);
      var i, j, p, q, dx, dy, d2;

      for (i = 0; i < nodes.length; i++) {
        p = nodes[i];
        if (move) {
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0 || p.x > W) p.vx *= -1;
          if (p.y < 0 || p.y > H) p.vy *= -1;
        }
        if (!link) continue;
        for (j = i + 1; j < nodes.length; j++) {
          q = nodes[j];
          dx = p.x - q.x; dy = p.y - q.y;
          d2 = dx * dx + dy * dy;
          if (d2 > LINK2) continue;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = "rgba(" + inkRGB + "," + (0.2 * (1 - d2 / LINK2)).toFixed(3) + ")";
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }

      // The pointer joins the network while it is over the hero.
      if (pointer.on) {
        for (i = 0; i < nodes.length; i++) {
          p = nodes[i];
          dx = p.x - pointer.x; dy = p.y - pointer.y;
          d2 = dx * dx + dy * dy;
          if (d2 > REACH2) continue;
          ctx.beginPath();
          ctx.moveTo(pointer.x, pointer.y);
          ctx.lineTo(p.x, p.y);
          ctx.strokeStyle = "rgba(" + coral + "," + (0.55 * (1 - d2 / REACH2)).toFixed(3) + ")";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(pointer.x, pointer.y, 3.4, 0, 6.2832);
        ctx.fillStyle = "rgba(" + coral + ",.9)";
        ctx.fill();
      }

      for (i = 0; i < nodes.length; i++) {
        p = nodes[i];
        if (p.hub) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 2.6, 0, 6.2832);
          ctx.fillStyle = "rgba(" + inkRGB + ",.08)";
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.2832);
        ctx.fillStyle = p.hub ? "rgba(" + coral + ",.9)" : "rgba(" + inkRGB + ",.42)";
        ctx.fill();
      }

      if (!move) return;

      // Packets travel one live connection, then hop to a neighbour.
      if (Math.random() < 0.05) spawnPacket();
      for (i = packets.length - 1; i >= 0; i--) {
        var k = packets[i];
        if (!near(k.a, k.b)) { packets.splice(i, 1); continue; }
        k.t += 1 / 84;                        // about 1.4s at 60fps
        if (k.t >= 1) {
          var next = null;
          for (j = 0; j < nodes.length; j++) {
            var c = nodes[(Math.random() * nodes.length) | 0];
            if (c !== k.b && c !== k.a && near(k.b, c)) { next = c; break; }
          }
          if (!next) { packets.splice(i, 1); continue; }
          k.a = k.b; k.b = next; k.t = 0;
        }
        var x = k.a.x + (k.b.x - k.a.x) * k.t;
        var y = k.a.y + (k.b.y - k.a.y) * k.t;
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, 6.2832);
        ctx.fillStyle = "rgba(" + coral + ",1)";
        ctx.fill();
      }
    }

    build();

    if (!motionOK()) { draw(false); return; }

    window.addEventListener("resize", debounce(function () {
      size = fitCanvas(canvas);
      ctx = size.ctx; W = size.w; H = size.h; link = W > 700;
      build();
    }, 220));

    if (fine.matches) {
      var host = canvas.parentElement;
      host.addEventListener("pointermove", function (e) {
        var r = canvas.getBoundingClientRect();
        pointer.x = e.clientX - r.left;
        pointer.y = e.clientY - r.top;
        pointer.on = true;
      }, { passive: true });
      host.addEventListener("pointerleave", function () { pointer.on = false; }, { passive: true });
    }

    visibleLoop(canvas, function () { draw(true); });
  })();

  /* -- 05  Magnetic buttons ---------------------------------------------- */

  (function magnetic() {
    if (!motionOK() || !fine.matches) return;
    $$("[data-magnetic]").forEach(function (el) {
      var raf = 0, tx = 0, ty = 0;
      function apply() { el.style.transform = "translate3d(" + tx + "px," + ty + "px,0)"; raf = 0; }

      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        if (Math.hypot(dx, dy) > Math.max(r.width, r.height) * 0.9) return;
        tx = dx * 0.24; ty = dy * 0.32;
        if (!raf) raf = requestAnimationFrame(apply);
      }, { passive: true });

      el.addEventListener("pointerleave", function () {
        tx = ty = 0;
        el.style.transition = "transform .55s cubic-bezier(.22,1,.36,1)";
        if (!raf) raf = requestAnimationFrame(apply);
        setTimeout(function () { el.style.transition = ""; }, 560);
      }, { passive: true });
    });
  })();

  /* -- 06  Tilt cards with glare ----------------------------------------- */
  /* Box shadow is deliberately not animated: it is not compositor
     accelerated and repainting it on every pointer move stutters. */

  (function tilt() {
    if (!motionOK() || !fine.matches) return;
    var cards = $$("[data-tilt]");
    if (!cards.length) return;
    var coral = cssVar("--accent-rgb") || "237, 116, 112";

    cards.forEach(function (card) {
      var glare = $(".card-glare", card);
      var raf = 0, rx = 0, ry = 0, ga = 0;

      function apply() {
        card.style.transform =
          "perspective(900px) rotateX(" + rx.toFixed(2) + "deg) rotateY(" + ry.toFixed(2) + "deg)";
        if (glare) {
          glare.style.background =
            "linear-gradient(" + ga.toFixed(0) + "deg, rgba(" + coral + ",.55) 0%, rgba(255,255,255,.3) 40%, transparent 70%)";
          glare.style.opacity = "1";
        }
        raf = 0;
      }

      card.addEventListener("pointerenter", function () { card.style.transition = "none"; });

      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width;
        var py = (e.clientY - r.top) / r.height;
        ry = (px - 0.5) * 11;
        rx = (0.5 - py) * 11;
        ga = Math.atan2(py - 0.5, px - 0.5) * 180 / Math.PI + 90;
        if (!raf) raf = requestAnimationFrame(apply);
      }, { passive: true });

      card.addEventListener("pointerleave", function () {
        rx = ry = 0;
        card.style.transition = "transform .7s cubic-bezier(.22,1,.36,1)";
        card.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg)";
        if (glare) glare.style.opacity = "0";
        setTimeout(function () { card.style.transition = ""; }, 720);
      }, { passive: true });
    });
  })();

  /* -- 07  Photo drift and the hero mark --------------------------------- */
  /* The washed photos move a little slower than the page, and the banyan HI
     in the hero floats and leans toward the pointer. Small, and all of it
     off under reduced motion. */

  (function drift() {
    if (!motionOK()) return;

    if (hasST) {
      $$(".photo-bg").forEach(function (bg) {
        window.gsap.fromTo(bg, { yPercent: -6 }, {
          yPercent: 6,
          ease: "none",
          scrollTrigger: { trigger: bg.parentElement, start: "top bottom", end: "bottom top", scrub: true }
        });
      });
    }

    var art = $(".hero-art img");
    if (!art) return;
    var tx = 0, ty = 0, cx = 0, cy = 0;
    if (fine.matches) {
      $(".hero").addEventListener("pointermove", function (e) {
        tx = (e.clientX / window.innerWidth - 0.5) * 18;
        ty = (e.clientY / window.innerHeight - 0.5) * 14;
      }, { passive: true });
      $(".hero").addEventListener("pointerleave", function () { tx = ty = 0; }, { passive: true });
    }
    visibleLoop(art, function (t) {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      var bob = Math.sin(t / 1400) * 7;
      art.style.transform = "translate3d(" + cx.toFixed(2) + "px," + (cy + bob).toFixed(2) + "px,0) rotate(" + (cx * 0.12).toFixed(2) + "deg)";
    });
  })();

  /* -- 08  Marker underlines --------------------------------------------- */
  /* Each .ul draws its coral stroke when it scrolls in. Several in one
     heading draw one after another, like someone marking up a page. */

  (function underlines() {
    var uls = $$(".ul");
    if (!uls.length) return;
    if (!motionOK()) { uls.forEach(function (u) { u.classList.add("drawn"); }); return; }

    // Stagger within the same heading.
    uls.forEach(function (u) {
      var group = $$(".ul", u.parentElement.closest("h1, h2, h3, p, li") || u.parentElement);
      var i = group.indexOf(u);
      if (i > 0) u.style.setProperty("--ud", i * 320 + 300 + "ms");
      else u.style.setProperty("--ud", "300ms");
    });
    onView(uls, function (u) { u.classList.add("drawn"); }, 0.8);
  })();

  /* -- 09  Illustrations draw in ----------------------------------------- */
  /* The three What We Do illustrations and the process line. Stroked paths
     draw themselves, then the pieces marked data-pop arrive. */

  (function drawPaths() {
    var svgs = $$("[data-draw]");
    if (!svgs.length) return;

    function finish(svg) {
      var host = svg.closest(".service-art");
      if (host) host.classList.add("drawn");
    }

    if (!motionOK() || !("IntersectionObserver" in window)) { svgs.forEach(finish); return; }

    svgs.forEach(function (svg) {
      $$("path[data-line], line[data-line], polyline[data-line], rect[data-line], circle[data-line]", svg).forEach(function (p) {
        var len = p.getTotalLength ? p.getTotalLength() : 0;
        if (!len) return;
        p.style.strokeDasharray = len;
        p.style.strokeDashoffset = len;
      });
    });

    onView(svgs, function (svg) {
      $$("[data-line]", svg).forEach(function (p, i) {
        p.style.transition = "stroke-dashoffset 1.8s cubic-bezier(.16,1,.3,1) " + (i * 0.12) + "s";
        p.style.strokeDashoffset = "0";
      });
      setTimeout(function () { finish(svg); }, 500);
    }, 0.3);
  })();

  /* -- 10  Pinned case study rail ---------------------------------------- */
  /* Desktop with a real pointer only. Everywhere else the CSS turns the same
     markup into a native scroll-snap row, which is far more reliable on touch
     than hijacking the scroll. */

  (function hscroll() {
    var sec = $(".hscroll");
    var track = $(".hs-track");
    if (!sec || !track) return;
    if (!hasST || !motionOK() || !wide.matches || !fine.matches) return;

    // Pin only if the whole section fits on one screen. On a short or narrow
    // window it stays a scroll row rather than cutting the cards off.
    sec.classList.add("pinned");
    if (sec.offsetHeight > window.innerHeight + 2) { sec.classList.remove("pinned"); return; }

    var bar = $(".hs-bar i");
    function dist() { return Math.max(0, track.scrollWidth - window.innerWidth); }

    window.gsap.to(track, {
      x: function () { return -dist(); },
      ease: "none",
      scrollTrigger: {
        trigger: sec,
        start: "top top",
        end: function () { return "+=" + dist(); },
        pin: true,
        scrub: 0.6,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: function (self) {
          if (bar) bar.style.transform = "scaleX(" + (1 + self.progress * 6.15).toFixed(3) + ")";
        }
      }
    });

    window.addEventListener("resize", debounce(function () { window.ScrollTrigger.refresh(); }, 250));
    // Web fonts change card heights after load.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { window.ScrollTrigger.refresh(); });
  })();

  /* -- 11  Anchor scrolling ---------------------------------------------- */
  /* A bare "#" is not a selector. Guarded. */

  (function anchors() {
    document.addEventListener("click", function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var href = a.getAttribute("href");
      if (!href || href === "#") return;
      var target = document.getElementById(href.slice(1));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: motionOK() ? "smooth" : "auto", block: "start" });
      if (history.replaceState) history.replaceState(null, "", href);
    });
  })();

  /* -- 12  Contact form -------------------------------------------------- */
  /* No backend yet. If the form ever gets a data-endpoint (the Elevate site's
     Apps Script pattern is the obvious one), it posts there. Until then it
     opens the visitor's own mail app with everything filled in, addressed to
     TO above, so an enquiry is never just lost. */

  (function form() {
    $$(".form").forEach(function (f) {
      var status = $(".form-status", f);
      var btn = $("button[type=submit]", f);
      var opened = Date.now();

      function say(msg) {
        if (!status) return;
        status.hidden = false;
        status.textContent = msg;
      }
      function val(name) {
        var el = f.elements[name];
        if (!el) return "";
        if (!el.tagName) return el.value || "";   // a radio group: the checked value
        if (el.type === "checkbox") return el.checked ? "yes" : "no";
        return String(el.value).trim();
      }
      function collect() {
        return {
          first: val("first"), last: val("last"), email: val("email"), phone: val("phone"),
          sms: val("sms"), message: val("message"), heard: val("heard"), website: val("website")
        };
      }
      function body(d) {
        return "From: " + d.first + " " + d.last + " <" + d.email + ">\n"
          + (d.phone ? "Phone: " + d.phone + "\nSMS consent: " + d.sms + "\n" : "")
          + (d.heard ? "Heard about us: " + d.heard + "\n" : "")
          + "\n" + d.message;
      }
      function mailto(d) {
        window.location.href = "mailto:" + TO
          + "?subject=" + encodeURIComponent("Website enquiry from " + d.first + " " + d.last)
          + "&body=" + encodeURIComponent(body(d));
      }

      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var d = collect();

        if (!d.first || !d.last || !d.email || !d.message) {
          say("Please add your first and last name, your email and a message, then send again.");
          return;
        }

        // Filled in under three seconds, or the hidden field has a value: not a person.
        if (d.website || Date.now() - opened < 3000) {
          say("Thanks, your message is on its way.");
          f.reset();
          return;
        }

        var endpoint = f.getAttribute("data-endpoint");
        if (!endpoint) {
          say("Opening your email app with this message ready to send. If nothing happens, email " + TO + " or call " + TEL + ".");
          mailto(d);
          return;
        }

        var params = new URLSearchParams();
        Object.keys(d).forEach(function (k) { if (k !== "website") params.set(k, d[k]); });
        params.set("page", location.pathname);

        if (btn) btn.disabled = true;
        say("Sending...");
        fetch(endpoint, { method: "POST", mode: "no-cors", body: params })
          .then(function () {
            say("Thanks " + d.first + ", it's sent. We'll be in touch soon.");
            f.reset();
          })
          .catch(function () {
            say("That didn't go through, so we're opening your email app with the message ready instead.");
            mailto(d);
          })
          .then(function () { if (btn) btn.disabled = false; });
      });
    });
  })();

  /* -- 13  Footer year --------------------------------------------------- */

  (function year() {
    $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
  })();
})();
