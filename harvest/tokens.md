# Design tokens from the old site

What the Evolve HI site used, read off the screenshots. There was no stylesheet to save, so every color below was sampled with PIL from the screenshot pixels, not guessed, and every font is a match by eye until Kawika confirms it from the Squarespace Site Styles panel.

## Color

| Token | Hex | Where it is used |
| --- | --- | --- |
| cream | `#F0EEE8` | Page ground. Hero, footer, What We Do service sections, About, Contact |
| navy | `#181D38` | Dark sections, every heading on cream, body text, form borders, the rule under service headings |
| coral | `#ED7470` | Every button fill except Send, the marker underlines, card headings, body text on navy, the highlighted words in the About hero, the Why Choose Us icons |
| slate | `#43475B` | The contact form Send button only |
| white | `#FFFFFF` | Headings on navy, the About Us button, text on coral buttons |

Sampled at: hero ground and footer (`home-1`, `home-6`), navy band (`home-1`, `home-2`), coral button and nav pill (`home-1`), marker underline (`home-2`), Send button (`contact-2`), form border (`contact-1`).

Photo sections sit under a wash rather than on a flat color. The process section reads about `#E0D7C5` to `#E7E8D2` over the road aerial (cream at high opacity), the What We Do steps read `#1E203A` to `#302B3A` (navy at high opacity).

### Contrast, measured

| Pair | Ratio | WCAG AA |
| --- | --- | --- |
| navy on cream | 14.2 : 1 | passes |
| white on navy | 16.5 : 1 | passes |
| coral on navy | 5.8 : 1 | passes for body text |
| navy on coral | 5.8 : 1 | passes |
| **white on coral** | **2.9 : 1** | **fails**, even for large text (needs 3 : 1) |
| **coral on cream** | **2.5 : 1** | **fails** |

**This is the one real problem in the palette.** Every coral button on the old site puts white text on coral, and the What We Build card headings put coral text on a near-white wash. Both fail. The fix that keeps the exact coral is navy text on coral buttons (5.8 : 1), and coral used on cream only as a fill, an underline or an icon, never as text. Decision for Kawika at the first checkpoint.

## Typography

Three families. None of them could be confirmed from source, so these are matches by eye against the screenshots.

| Role | Looks like | Weight | Case | Notes |
| --- | --- | --- | --- | --- |
| Headings | **Oswald** | 500 to 600 | uppercase | Tall condensed grotesk, tight line height around 1.0, no tracking |
| Body, nav links, form labels | **Roboto** | 400 | sentence | About 18 to 20px at desktop, line height about 1.8 |
| Buttons and the nav phone pill | **Poppins** or close | 500 | title case | A wider geometric sans. The phone pill is clearly Poppins; the "Let's Connect" buttons may be a different wide face (Syne or Space Grotesk territory). Confirm from Site Styles |

The italic subhead in "Have something else in mind" is the heading face in italic.

## Shape

| Setting | Value |
| --- | --- |
| Button radius | about 12px |
| Card and photo radius | about 40px |
| Form field radius | fully rounded pills (text inputs), about 40px on the textarea |
| Button padding | generous, about 24px by 80px at desktop |
| Max content width | about 1600px, with the text columns well inside it |
| Rules | 1px navy, under each service heading on What We Do |

## Motifs

1. **The marker underline.** A hand-drawn coral brush stroke, two overlapping swipes, sitting just below the baseline of key words: PRACTICAL on the homepage, DISCOVER, DESIGN and DEPLOY in both process sections, PRACTICAL, EFFECTIVE and PERSONALIZED in the What We Do hero. It is the one thing on the site that looks designed rather than templated, and the rebuild keeps it and makes it draw in.
2. **The HI mark filled with a photo.** The banyan-filled stencil mark in the hero (`Icon_Tree.png`). The mark as a window onto Hawaiʻi.
3. **Oahu under a wash.** Road aerial, beach aerials, Kualoa ridge, the North Shore wave, the ridge hiker. Always washed in cream or navy so the type sits on top.
4. **The swoosh.** One long curve from bottom left to top right, where the navy partners band meets the cream footer.
5. **Alternating grounds.** Cream, navy, photo, navy, photo, navy, cream, top to bottom on the homepage.

## Layout

| Setting | Value |
| --- | --- |
| Header | logo left, links and phone pill right, sits on the page ground, not sticky as far as the screenshots show |
| Logo height | about 70px at desktop |
| Hero | headline left about 55% of the width, mark right |
| Three-up grids | process, what we build, why choose us, steps, examples, team |
| Service sections | 50/50 text and image, alternating sides |
| Footer | three columns: logo and blurb, links, contact and social |
