# Iterate site

The marketing site for Iterate, Kawika's AI automation business, rebuilt on 2026-09-23 from the expired Evolve HI Squarespace site. Production is `https://iteratehi.com/` (custom domain set 2026-09-28 by the `CNAME` file); the old staging URL `https://darthkanaka.github.io/iterate-site/` now redirects there. The vault note is `~/Documents/Obsidian/projects/iterate-site.md`: read it first for status, decisions and what is waiting on Kawika.

It is built the same way as `~/Documents/Developer/elevate-site`. When something here is unclear, that repo is the reference.

## Stack

- Plain HTML, one stylesheet, one script. No build step, no package.json, no framework.
- `assets/css/site.css` has numbered sections listed at the top of the file. All colors and fonts are tokens in section 01.
- `assets/js/site.js` is one IIFE per effect behind a shared gate (`reduced`, `fine`, `wide`, `visibleLoop`, `fitCanvas`, `onView`). Any effect can be deleted without touching the others.
- GSAP 3.13 and ScrollTrigger from cdnjs, used only for the pinned case study rail and the photo drift. The page must be complete without them.
- Fonts are self-hosted in `assets/fonts/`: Oswald and Roboto (variable) and Poppins 500 and 600. No Google Fonts link.
- Hosting is GitHub Pages from the root of `main`, which is production: every push to `main` is live on iteratehi.com within a minute or two. Internal links are relative (`about.html`, never `/about`), so the site also works from a subpath or a local preview.
- Launch checkpoint: tag `launch-2026-09-28`. Its GitHub release carries full-page screenshots of every page at desktop and mobile. `git checkout launch-2026-09-28` returns to the site as launched.

## Rules this codebase keeps

1. Nothing animates under `prefers-reduced-motion`. The hero network draws one still frame instead.
2. No loop runs while its element is off screen or the tab is hidden. Every loop goes through `visibleLoop`.
3. Content is never hidden if the script fails. Hiding is always scoped to the `.js` class on `<html>`.
4. Coral is never text on cream (2.5 to 1). It is text on navy, a fill, an underline or an icon. Buttons are navy text on coral.
5. The case study rail only pins when the whole section fits one screen. Otherwise it is a native scroll-snap row.
6. `harvest/` is the archive of the old site. Things are generated from it, never written into it.
7. Every page passes axe with zero violations at 1440, 1024 and 390, with JavaScript off, and with reduced motion on.

## Demos

Interactive example apps live under `demos/`, each linked from its case study card. Live on iteratehi.com since 2026-09-30 (tag `demos-2026-09-30`). Plan, log and test results are in the vault notes `projects/iterate-demos.md` and `projects/iterate-demos-test-results.md`.

- `demos/handyman.html` is the handyman team app, rebuilt on 2026-09-29 in the same frame as the other demos from the original mockup (kept, untouched, in git-ignored `private/handyman-demo-original/`). It keeps its core tools: Kai the assistant, the tech pay sheet and the field guides for the owner; field guides and My pay for the tech. His field guides and assistant answers live in `handyman-data.js`; `handyman-logic.js` holds the pay math, the assistant's keyword matching and a small escaped text renderer. Tests: `tools/test-handyman-logic.mjs` and `tools/check-handyman.mjs`.
- Every name, business, address and price in a demo is made up and checked against real Hawaiʻi businesses. No client names, ever.
- `demos/inventory.html` is a site page (nav, footer, intro, "Built for this business", closing band) around the app in `assets/js/demos/inventory.js`. Its made-up kitchen lives in `inventory-data.js` and every number goes through `inventory-math.js`, which is plain functions with no DOM. Styles are in `assets/css/demos.css`, shared by the demos that sit inside site pages.
- `demos/portal.html` is built the same way: `portal-data.js` (the made-up studio, its week of shifts and a year of invoices; "today" is Aug 17, 2026 so month, quarter and year to date differ), `portal-logic.js` (shift hours, double-bookings, what needs the owner, invoices built from worked shifts, totals, finance by date range) and `portal.js` (the app, with a "View as" switch: the contractor gets My schedule, as a list or a week calendar, and My invoices; the owner gets the schedule board, Approvals and Finance). The "Google Calendar sync" badges, with their pulsing green dot, are illustration only. Tests: `tools/test-portal-logic.mjs` and `tools/check-portal.mjs`.
- `demos/phone.html` is the only demo with a server. The page (`phone.js`, plus `phone-logic.js`, which keeps the whole voice transcript when Retell sends only the last few lines) talks to the Iterate demos API on Railway, private repo `darthkanaka/iterate-demos-api` at `~/Documents/Developer/iterate-demos-api`. Read that repo's README before touching the phone demo. The API starts real Retell text chats and browser voice calls with a demo copy of the after-hours agent and hands the agent's alert back to the page. The real Cloudflare person check only runs on iteratehi.com. Previews anywhere else use Cloudflare's always-pass test key, which the live API rejects, so a local preview of the phone demo needs a local API (`?api=local`, see the API's README). Real texts stay off until the API's `DEMO_REAL_SMS` is on, and an SMS clause goes into terms.html (the consent line links `terms.html#sms`) before that. Tests: `tools/test-phone-logic.mjs` and `tools/check-phone.mjs`, which stubs the API, the person check and the voice SDK, so it never reaches Retell or costs anything.
- Every demo ships with a full functional test, not just an accessibility pass: `node --test tools/test-inventory-math.mjs` checks the math against hand-worked numbers, and `node tools/check-inventory.mjs` drives every control in a browser on desktop and phone, checks each number on screen, then runs axe in every state plus JS off and reduced motion. Both must pass before anything merges.

## Voice

Natural and spoken, contractions on, no marketing filler, and no em dashes anywhere. Don't invent facts, figures or results. The case studies say only what the vault records.

## Swap points

| What | Where | When |
| --- | --- | --- |
| Wordmark | `assets/img/wordmark.svg`, drawn through a CSS mask. The `aspect-ratio` on `.wordmark` in site.css changes only if the new wordmark has different proportions | Kawika's new type logo arrives |
| Enquiry address | `TO` at the top of site.js, plus the `mailto:` links in the footer and on the contact page | Google Workspace moves to iteratehi.com |
| Form backend | Add `data-endpoint` to the `<form>`; site.js posts there and keeps mailto as the fallback | A backend is chosen (the Elevate Apps Script is the obvious one) |
| Case study names | Anonymous headings only in index.html. Named versions are in `private/case-studies-named.md` (git-ignored) | Each client approves being named |
| Phone | `(808) 204-4575` in the footer (not the nav, by Kawika's choice), contact page, terms, JSON-LD and `TEL` in site.js | Only if the number changes |

Client names do not appear anywhere in this public repo until that client has approved it. That includes commit messages.

## Commands

```bash
python3 -m http.server 8778                       # preview at http://localhost:8778
python3 tools/vector.py <in.pdf|.ai> <out.svg>    # brand vector to a currentColor SVG
python3 tools/vector.py --favicons                # favicons and mark-512.png from the HI mark
node tools/check.mjs [base-url]                   # axe, overflow, JS off, reduced motion, rail
node --test tools/test-*.mjs                      # every demo's logic
node tools/check-<demo>.mjs                       # one demo, every control: inventory, portal, handyman, phone
BROWSER=webkit node tools/check-<demo>.mjs        # the same in Safari's engine (or BROWSER=firefox); works for check.mjs too
```

`tools/check.mjs` needs Playwright. Install it outside the repo (`npm i playwright` in any scratch folder, then run with `NODE_PATH` pointing at it) so the site stays dependency free.

## Commits

Plain-English imperative subject in sentence case, no prefix. A prose body saying why, and what was verified. End with:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

## Reporting to Kawika

Short. Three lists: what was done, what needs him, what is left. One question at a time.
