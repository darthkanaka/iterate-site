# Iterate site

The marketing site for Iterate, Kawika's AI automation business, rebuilt on 2026-09-23 from the expired Evolve HI Squarespace site. Staging is `https://darthkanaka.github.io/iterate-site/`; production will be `https://iteratehi.com/`. The vault note is `~/Documents/Obsidian/projects/iterate-site.md`: read it first for status, decisions and what is waiting on Kawika.

It is built the same way as `~/Documents/Developer/elevate-site`. When something here is unclear, that repo is the reference.

## Stack

- Plain HTML, one stylesheet, one script. No build step, no package.json, no framework.
- `assets/css/site.css` has numbered sections listed at the top of the file. All colors and fonts are tokens in section 01.
- `assets/js/site.js` is one IIFE per effect behind a shared gate (`reduced`, `fine`, `wide`, `visibleLoop`, `fitCanvas`, `onView`). Any effect can be deleted without touching the others.
- GSAP 3.13 and ScrollTrigger from cdnjs, used only for the pinned case study rail and the photo drift. The page must be complete without them.
- Fonts are self-hosted in `assets/fonts/`: Oswald and Roboto (variable) and Poppins 500 and 600. No Google Fonts link.
- Hosting is GitHub Pages from the root of `main`. Internal links are relative (`about.html`, never `/about`), because staging lives on a subpath.

## Rules this codebase keeps

1. Nothing animates under `prefers-reduced-motion`. The hero network draws one still frame instead.
2. No loop runs while its element is off screen or the tab is hidden. Every loop goes through `visibleLoop`.
3. Content is never hidden if the script fails. Hiding is always scoped to the `.js` class on `<html>`.
4. Coral is never text on cream (2.5 to 1). It is text on navy, a fill, an underline or an icon. Buttons are navy text on coral.
5. The case study rail only pins when the whole section fits one screen. Otherwise it is a native scroll-snap row.
6. `harvest/` is the archive of the old site. Things are generated from it, never written into it.
7. Every page passes axe with zero violations at 1440, 1024 and 390, with JavaScript off, and with reduced motion on.

## Voice

Natural and spoken, contractions on, no marketing filler, and no em dashes anywhere. Don't invent facts, figures or results. The case studies say only what the vault records.

## Swap points

| What | Where | When |
| --- | --- | --- |
| Wordmark | `assets/img/wordmark.svg`, drawn through a CSS mask. The `aspect-ratio` on `.wordmark` in site.css changes only if the new wordmark has different proportions | Kawika's new type logo arrives |
| Enquiry address | `TO` at the top of site.js, plus the `mailto:` links in the footer and on the contact page | Google Workspace moves to iteratehi.com |
| Form backend | Add `data-endpoint` to the `<form>`; site.js posts there and keeps mailto as the fallback | A backend is chosen (the Elevate Apps Script is the obvious one) |
| Case study names | Anonymous headings only in index.html. Named versions are in `private/case-studies-named.md` (git-ignored) | Each client approves being named |
| Indexing | The `TODO-LAUNCH` robots line in every page head | Cutover to iteratehi.com |
| Phone | `(808) 201-4040` in the nav, footer, contact page, terms, JSON-LD and `TEL` in site.js | Only if the number changes |

Client names do not appear anywhere in this public repo until that client has approved it. That includes commit messages.

## Commands

```bash
python3 -m http.server 8778                       # preview at http://localhost:8778
python3 tools/vector.py <in.pdf|.ai> <out.svg>    # brand vector to a currentColor SVG
python3 tools/vector.py --favicons                # favicons and mark-512.png from the HI mark
node tools/check.mjs [base-url]                   # axe, overflow, JS off, reduced motion, rail
```

`tools/check.mjs` needs Playwright. Install it outside the repo (`npm i playwright` in any scratch folder, then run with `NODE_PATH` pointing at it) so the site stays dependency free.

## Commits

Plain-English imperative subject in sentence case, no prefix. A prose body saying why, and what was verified. End with:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

## Reporting to Kawika

Short. Three lists: what was done, what needs him, what is left. One question at a time.
