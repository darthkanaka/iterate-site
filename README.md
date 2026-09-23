# Iterate

Marketing site for Iterate, practical AI for Hawaiʻi businesses. Four pages plus a privacy and terms page, static, on GitHub Pages.

- Staging: https://darthkanaka.github.io/iterate-site/
- Production: https://iteratehi.com/ (not yet pointed)

## What is here

| Path | What it is |
| --- | --- |
| `index.html` | Home: hero, making AI practical, process, what we build, case studies, why choose us, partners |
| `what-we-do.html` | The three services in depth, examples, discovery call |
| `about.html` | The team |
| `contact.html` | Contact form (opens the visitor's mail app until a backend is added) |
| `terms.html` | Privacy policy and SMS terms |
| `assets/` | The one stylesheet, the one script, fonts and web-sized images |
| `harvest/` | The archive of the old Evolve HI site: screenshots, transcribed copy, sampled tokens, brand files and original photos |
| `tools/` | `vector.py` (brand PDFs to SVG and favicons) and `check.mjs` (automated checks) |

## Run it

```bash
python3 -m http.server 8778
```

Then open http://localhost:8778.

## Before launch

- [ ] Kawika moves (808) 201-4040 off the Invisible Arts receptionist in Retell, so the number on the site reaches Iterate.
- [ ] The `aloha@iteratehi.com` forwarder exists in Namecheap and a test message arrives.
- [ ] Remove the `TODO-LAUNCH` robots line from every page.
- [ ] Add a `CNAME` file with `iteratehi.com` and the DNS records in the vault note.
- [ ] Point evolve-hi.com at iteratehi.com without touching its mail records.

Working notes and decisions: `~/Documents/Obsidian/projects/iterate-site.md`. Conventions for working in this repo: `CLAUDE.md`.
