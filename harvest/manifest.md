# Harvest manifest

Everything gathered on 2026-09-23 to rebuild the old Evolve HI site as Iterate, before any build work. This folder is the archive. Web-optimized copies live in `assets/` and are generated from these, never the other way around.

Total 73 MB across 58 files.

## Why there is no saved HTML

The old site at www.evolve-hi.com (Squarespace site ID `6865cb20b404ff42f419c0ae`, internal domain `nonagon-carnation-jcgn.squarespace.com`) had already expired when the rebuild started. Every URL, including `?format=json` and `/sitemap.xml`, returned HTTP 404 with Squarespace's "Website Expired" page. The Wayback Machine has no snapshots of either hostname. The Squarespace editor still opened for Kawika, so he screenshotted every page from inside it, and those screenshots are the source of record.

The Squarespace image CDN (`images.squarespace-cdn.com/content/v1/6865cb20b404ff42f419c0ae/`) could not be tested, because without page source there are no file paths to request. If a WordPress XML export from the editor turns up later, it goes in `export/` (git-ignored) and the image URLs inside it get tested with the browser user agent and `Accept: image/png,image/jpeg,image/*;q=0.8` header described in the Elevate harvest.

## Screenshots

Taken by Kawika from the Squarespace editor, desktop width, about 2480px wide at 2x. Filed as `<page>-<n>.png` in scroll order.

| File | Size | Dimensions | What it shows |
| --- | --- | --- | --- |
| `screens/home-1.png` | 851 KB | 2482 x 1354 | Nav, hero, top of the navy band |
| `screens/home-2.png` | 1.7 MB | 2486 x 1354 | Making AI practical, group photo |
| `screens/home-3.png` | 3.9 MB | 2478 x 1352 | Our process on the road aerial, top of What we build |
| `screens/home-4.png` | 2.3 MB | 2478 x 1356 | What we build cards |
| `screens/home-5.png` | 1.8 MB | 2476 x 1352 | Why choose us on the Kualoa ridge |
| `screens/home-6.png` | 1003 KB | 2504 x 1364 | Partners band, swoosh, footer |
| `screens/what-we-do-1.png` | 3.0 MB | 2484 x 1326 | Hero, steps 1 to 3 on the navy road aerial |
| `screens/what-we-do-2.png` | 1.6 MB | 2488 x 1348 | AI agents |
| `screens/what-we-do-3.png` | 1.6 MB | 2486 x 1354 | Workflows |
| `screens/what-we-do-4.png` | 1.5 MB | 2480 x 1352 | Dashboards and insights |
| `screens/what-we-do-5.png` | 620 KB | 2486 x 1348 | Examples |
| `screens/what-we-do-6.png` | 1.7 MB | 2484 x 1352 | Have something else in mind, footer |
| `screens/about-1.png` | 1.9 MB | 2494 x 1354 | Hero on the ridge hiker photo |
| `screens/about-2.png` | 2.2 MB | 2502 x 1356 | Meet the team, headshots |
| `screens/about-3.png` | 593 KB | 2500 x 1356 | Team bios. Kept local and git-ignored: it names a business that the site keeps anonymous |
| `screens/about-4.png` | 233 KB | 2488 x 842 | End of bios, footer |
| `screens/contact-1.png` | 221 KB | 2498 x 1348 | Contact details, top of the form |
| `screens/contact-2.png` | 217 KB | 2502 x 1352 | Rest of the form, SMS disclaimer |

## Brand: Iterate

Kawika's interim Iterate lockups, from `~/Documents/EvolveHI/Website/Iterate Branding Assets/`. The wordmark is the Evolve letterform set as ITERATE with the same mirrored final E. He is refining the type logo, so the site treats the wordmark as one swappable file. The mark itself does not change.

| File | Size | Dimensions | Notes |
| --- | --- | --- | --- |
| `brand/iterate/Iterate-Text-Black.ai` | 586 KB | vector | Wordmark alone, PDF-compatible |
| `brand/iterate/Iterate-Text-Black.png` | 6 KB | 1883 x 191 | Wordmark alone |
| `brand/iterate/IterateLogo-Horizontal-Black.ai` | 588 KB | vector | Wordmark with the mark on the right |
| `brand/iterate/IterateLogo-Horizontal-Black.png` | 9 KB | 2523 x 333 | Same |
| `brand/iterate/IterateLogo-Vertical-Black.ai` | 588 KB | vector | Mark stacked over the wordmark |
| `brand/iterate/IterateLogo-Vertical-Black.png` | 11 KB | 1881 x 736 | Same. **Renamed on copy**: the source file is misnamed `EvolveLogo-Vertical-Black.png` |

## Brand: Evolve (the mark lives here)

From `~/Documents/EvolveHI/Website/Evolve_Branding_Assets/`, plus `Evolve-Icon-Black.ai` from `~/Documents/Evolve_Branding_Assets/`. The icon PDFs are the canonical vector for the HI stencil mark: nine axis-aligned rectangles, 160 x 153pt, nothing else.

| File | Size | Dimensions | Notes |
| --- | --- | --- | --- |
| `brand/evolve/Evolve-Icon-Black.pdf` | 216 KB | vector | **The mark.** Source for `assets/img/mark.svg` and every favicon |
| `brand/evolve/Evolve-Icon-White.pdf` | 210 KB | vector | Same, white |
| `brand/evolve/Evolve-Icon-Black.ai` | 222 KB | vector | Illustrator source of the mark |
| `brand/evolve/Evolve-Text-Black.pdf` | 212 KB | vector | Old EVOLVE wordmark, reference only |
| `brand/evolve/Evolve-Text-White.pdf` | 208 KB | vector | Same, white |
| `brand/evolve/EvolveLogo-Horizontal-Black.pdf` | 214 KB | vector | Old horizontal lockup |
| `brand/evolve/EvolveLogo-Horizontal-White.pdf` | 210 KB | vector | Same, white |
| `brand/evolve/EvolveLogo-Vertical-Black.pdf` | 215 KB | vector | Old vertical lockup |
| `brand/evolve/EvolveLogo-Vertical-White.pdf` | 210 KB | vector | Same, white |
| `brand/evolve/Evolve-Branding-Board.jpg` | 585 KB | 864 x 864 | All four lockups on one board. The reference to check `mark.svg` against |

## Photos: backgrounds

All Kawika's own photography. Nine from `~/Documents/EvolveHI/Website/Evolve_Branding_Assets/Evolve_Website_Backgrounds/`, and seven more that only exist in the older `~/Documents/Evolve_Branding_Assets/Evolve_Website_Backgrounds/` (marked below). Where each one sat on the old site was matched by eye from the screenshots.

| File | Size | Dimensions | Where it appeared on the old site |
| --- | --- | --- | --- |
| `photos/backgrounds/Icon_Tree.png` | 3.5 MB | 4000 x 2665 | Home hero, the banyan-filled HI mark. Older folder only |
| `photos/backgrounds/Kalanianaole.jpg` | 3.4 MB | 4000 x 3200 | Home process (cream wash) and What We Do steps (navy wash) |
| `photos/backgrounds/1.jpg` | 326 KB | 1333 x 1333 | What we build, card 1. Older folder only |
| `photos/backgrounds/2.jpg` | 336 KB | 1333 x 1333 | What we build, card 2. Older folder only |
| `photos/backgrounds/3.jpg` | 340 KB | 1333 x 1333 | What we build, card 3. Older folder only |
| `photos/backgrounds/M2P_16ND-PL-135.jpg` | 728 KB | 4000 x 2665 | Home why choose us, the Kualoa ridge |
| `photos/backgrounds/_DSC0775.jpg` | 684 KB | 4000 x 2668 | What We Do, have something else in mind |
| `photos/backgrounds/DSC09338.jpg` | 882 KB | 4000 x 2667 | About hero, the ridge hiker. Older folder only |
| `photos/backgrounds/DJI_0007.jpg` | 2.4 MB | 4000 x 2664 | Not seen on the old site. Koolau ridges at golden hour |
| `photos/backgrounds/DJI_0259.jpg` | 3.1 MB | 4000 x 2665 | Not seen. Coastal point from above |
| `photos/backgrounds/DJI_0267.jpg` | 2.0 MB | 4000 x 2667 | Not seen. Beach aerial, wide |
| `photos/backgrounds/_70A9124-1.jpg` | 836 KB | 4000 x 2667 | Not seen. Kualoa across the water at dusk |
| `photos/backgrounds/_DSC0626.jpg` | 806 KB | 4000 x 2670 | Not seen. Sunset break |
| `photos/backgrounds/_DSC6297.jpg` | 2.9 MB | 4000 x 2668 | Not seen. The banyan, whole |
| `photos/backgrounds/_DSC2044.jpg` | 2.1 MB | 4000 x 5000 | Not seen. Milky Way over the shore, portrait. Older folder only |
| `photos/backgrounds/_DSC2056.jpg` | 3.0 MB | 4000 x 5000 | Not seen. Milky Way through palms, portrait. Older folder only |

## Photos: team

From `~/Documents/EvolveHI/Website/Evolve_Branding_Assets/Photos/`. Identified from the About screenshots.

| File | Size | Dimensions | Who |
| --- | --- | --- | --- |
| `photos/team/GroupShot-01.jpeg` | 4.6 MB | 7926 x 5287 | All three, seated. Home, making AI practical |
| `photos/team/Headshots-01.jpeg` | 2.4 MB | 4782 x 5978 | Ben Eberhart |
| `photos/team/Headshots-02.jpeg` | 2.3 MB | 4775 x 5969 | Kawika Lopez |
| `photos/team/Headshots-o3.jpeg` | 5.3 MB | 4876 x 6095 | Dave Kusumoto |

## Pages

| File | Size | Notes |
| --- | --- | --- |
| `pages/proposal-roofing-client.html` | 81 KB | An Evolve HI client proposal page that lived on the Elevate Squarespace domain, copied from the Elevate harvest. Client collateral, kept local and git-ignored |

## Lost

Things that existed only on the Squarespace CDN and are gone unless an export turns up:

1. **The three service images on What We Do.** A woman at a laptop facing a humanoid robot (AI agents), a blue workflow diagram with coral arrows (workflows), hands pointing at a navy dashboard (dashboards). All three read as AI-generated stock. The rebuild replaces them with drawn SVG illustrations in navy and coral, which suit the brand better anyway.
2. **The three Why Choose Us icons.** A money bag, a zigzag arrow, a gear with a check, all solid or outlined coral. Redrawn as inline SVG.
3. **The marker underline.** Probably a PNG or an SVG in the theme. Redrawn as an SVG path so it can animate.
4. **Social link targets** for the Instagram, Facebook, TikTok and YouTube icons. The screenshots show the icons, not where they point.
5. **The Privacy Policy and Terms pages**, never screenshotted.
