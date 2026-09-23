# Old site copy, verbatim

Every word from the Evolve HI site as it stood before it expired, transcribed from the 18 editor screenshots Kawika took on 2026-09-23 (`screens/`). The public site at www.evolve-hi.com was already returning Squarespace's "Website Expired" page, so there was no HTML to save and no JSON to pull. Nothing here is edited. Known bugs are flagged in bold beneath the line they appear on, so the rebuild fixes them deliberately instead of copying them forward.

Transcription notes: typographic quotes and apostrophes are written straight here. The one em dash on the site is written as `[em dash]` so this file stays clean of the character. Coral words are marked **(coral)**, words with the hand-drawn marker underline are marked **(underlined)**.

Source: Squarespace, site ID `6865cb20b404ff42f419c0ae`, internal domain `nonagon-carnation-jcgn.squarespace.com`, public domain `www.evolve-hi.com`. Created around 2025-07-03.

## Site map

Four pages in the nav, plus two legal pages linked from the contact form that were not screenshotted.

| Page | In nav | Screens | What it is |
| --- | --- | --- | --- |
| Home | logo | `home-1` to `home-6` | Marketing homepage |
| What We Do | yes | `what-we-do-1` to `what-we-do-6` | The three service lines in depth, plus examples |
| About | yes | `about-1` to `about-4` | Hero and the three co-founders |
| Contact | footer only, and every "Let's Connect" button | `contact-1`, `contact-2` | Contact form with SMS consent |
| Privacy Policy | linked from the contact form | none | Not captured |
| Terms | linked from the contact form | none | Not captured |

**Gap: the Privacy Policy and Terms pages were not screenshotted.** The SMS consent language points to both, and A2P 10DLC registration expects them to exist. The rebuild adapts the Elevate `terms.html` (privacy policy plus SMS terms) and renames the business.

## Global chrome (every page)

Navigation, left to right: the horizontal EVOLVE HI lockup linking home, then `What We Do`, `About`, then a coral button reading `(808) 201-4040`. No Contact link in the nav; the phone button is the only header call to action.

**Bug: the phone button is the only way to Contact from the header.** There is no Contact link in the nav at all.

Footer, three columns on cream:

Left, under the horizontal lockup:

> At Evolve HI, we solve real business problems with practical AI tools. We automate repetitive tasks, streamline workflows, and improve efficiency. Our solutions are simple, effective, and built to deliver results.

Middle, stacked links: `What We Do`, `About`, `Contact`.

**Bug: "What We Do" wraps to two lines** ("What We / Do") because the column is too narrow.

Right: `info@evolve-hi.com`, `(808) 201-4040`, then icons for Instagram, Facebook, TikTok and YouTube. Link targets unknown.

## Home

### Section 1: hero

Cream background. Headline left, the banyan-filled HI mark (`photos/backgrounds/Icon_Tree.png`) right.

> H1: SIMPLE AI SOLUTIONS FOR POWERFUL RESULTS.
>
> Button: Work With Us

### Section 2: making AI practical

Navy background. Heading centered across the top. Group photo of the three founders left (`photos/team/GroupShot-01.jpeg`) with a button beneath it, copy right, centered.

> H2: MAKING AI PRACTICAL **(underlined)** FOR YOUR BUSINESS
>
> H3: AI CAN FEEL MASSIVE, COMPLICATED, AND OVERWHELMING.
>
> **(coral)** Every week there's a new tool, a new headline, or a new way that "AI is changing everything." The truth is: AI *is* big, but you don't need ALL of it. You just need the right parts that actually move the needle for your business.
>
> H3: THAT'S WHERE WE COME IN.
>
> **(coral)** Instead of a one-size-fits-all approach, we personalize AI to your company's real needs, whether that's automating repetitive tasks, building smarter customer experiences, or streamlining operations.
>
> Button: Let's Connect

### Section 3: our process

The Kalanianaole Highway road aerial (`photos/backgrounds/Kalanianaole.jpg`) under a heavy cream wash, three columns.

> H2: OUR PROCESS
>
> H3: 1. DISCOVER **(underlined)**
>
> We start by understanding your business, your workflows, challenges, and goals, to identify where AI can create the most impact.
>
> H3: 2. DESIGN **(underlined)**
>
> We build a tailored strategy, selecting the right AI tools and automations to fit your company, and create a step-by-step plan for implementation.
>
> H3: 3. DEPLOY **(underlined)**
>
> We roll out your AI solutions in clear, manageable steps, testing, refining, and integrating along the way so your team adopts the technology smoothly and confidently.

### Section 4: what we build

Navy background. Three rounded cards, each on a beach aerial (`1.jpg`, `2.jpg`, `3.jpg`) under a white wash, heading in coral, body centered.

> H2: WHAT WE BUILD?

**Bug: a statement with a question mark.** Either "WHAT WE BUILD" or "WHAT DO WE BUILD?".

> H3 **(coral)**: AI AGENTS
>
> From AI Receptionists to AI Personal Assistants, we can tailor make an AI agent to fit you or your businesses personal needs.

**Bug: "tailor make" needs a hyphen, and "businesses" should be "business's".**

> H3 **(coral)**: AUTOMATIONS
>
> Automate your workflows with AI, streamlining everyday tasks so teams can focus on what matters most.

**Bug: this card is "AUTOMATIONS" but the matching What We Do section is "WORKFLOWS".** Pick one name for the service.

> H3 **(coral)**: DASHBOARDS & INSIGHTS
>
> Our AI-powered dashboards turn scattered data into clear insights, helping you make smarter decisions, faster

**Bug: no closing period.**

> Button: Our Solutions

### Section 5: why choose us

The Kualoa ridge photo (`photos/backgrounds/M2P_16ND-PL-135.jpg`) under a cream wash. Three columns, each with a large coral icon: a money bag, a rising zigzag arrow, and a gear with a check.

> H2: WHY CHOOSE US?
>
> H3: VALUE & ACCESSIBILITY
>
> Affordable, tailored solutions[em dash]so any business can harness AI without breaking the budget.

**Bug: the em dash.** House style bans it. A comma or a period does the same job.

> H3: START SIMPLE. SCALE UP.
>
> Begin with one simple AI solution and expand into many aspects of your business as you see results.
>
> H3: WE MAKE THE TECH EASY
>
> AI can feel complicated, but we handle the setup, integrations, and training so you don't have to.
>
> Button: Let's Connect

### Section 6: partners band

Navy background, left aligned. The bottom edge sweeps in a long curve from low left to high right into the cream footer.

> H2: WE'RE NOT JUST A TEAM, WE'RE PARTNERS IN YOUR JOURNEY.
>
> Button (white): About Us

## What We Do

### Section 1: hero

Cream background. Headline left, button right.

> H1: OUR AIM IS TO MAKE AI PRACTICAL **(underlined)**, EFFECTIVE **(underlined)**, AND PERSONALIZED **(underlined)** TO DRIVE REAL RESULTS FOR YOUR BUSINESS.
>
> Button: Let's Connect

### Section 2: steps

The same road aerial, this time under a navy wash. Three columns, white text, centered.

> H3: STEP 1: DISCOVER **(underlined)**
>
> We start with a discovery meeting to understand your business goals, workflows, and pain points. This is where we listen deeply and identify areas where AI can have the biggest impact. Our goal is to uncover opportunities to save time, improve customer experience, and drive growth.
>
> H3: STEP 2: DESIGN **(underlined)**
>
> Next, we research and design tailored AI solutions for your specific needs. We use our expertise to explore the best tools, automations, and integrations that fit seamlessly into your business. You'll receive clear recommendations with an implementation plan that aligns with your goals.
>
> H3: STEP 3: DEPLOY **(underlined)**
>
> Finally, we build and implement your AI solutions with minimal disruption to your daily operations. We handle the technical setup, testing, and training to ensure everything runs smoothly. Our job isn't done until your team feels confident using these tools and sees real results.

**Note: the homepage process copy and this copy say the same thing twice in different words.** Fine to keep both, since one is the short version and one the long, but they should agree on tense and voice.

### Section 3: AI agents

Cream. Heading centered over a thin navy rule, copy left, AI-generated stock image right (a woman at a laptop facing a humanoid robot, speech bubbles above). **The image is lost**; it lived only on the Squarespace CDN.

> H2: AI AGENTS
>
> The term AI Agent is being used more and more, but what does it actually mean? Simply put, an AI Agent is a digital assistant powered by artificial intelligence that can handle tasks, make decisions, and take action. Unlike static chatbots, AI Agents are dynamic, able to connect with your tools, automate processes, and adapt in real time.
>
> Our AI Agents are custom-built to fit your business. They can:
>
> - Qualify leads and follow up automatically
> - Streamline customer communication
> - Organize and analyze data in real time
> - Automate repetitive workflows
> - Scale and adapt as your business grows
>
> We build them step by step: first understanding your processes, then tailoring workflows, and finally deploying agents that integrate seamlessly with your systems. The result is a reliable AI partner that helps your team focus on what matters most.

### Section 4: workflows

Cream. Stock image left (a blue workflow diagram with coral arrows and a hand at the edge), heading and copy right. **The image is lost.**

> H2: WORKFLOWS
>
> Every business runs on processes, but too often they are manual, messy, and time-consuming. A workflow takes those processes and organizes them into clear, repeatable steps that keep things moving smoothly. When automated, workflows free your team from repetitive tasks and ensure work is done consistently every time.
>
> With our workflow solutions, you can:
>
> - Eliminate bottlenecks by automating routine tasks
> - Link your apps and tools so data flows without friction
> - Standardize operations for accuracy and accountability
> - Track progress in real time with full transparency
> - Build systems that grow alongside your business
>
> We focus on making your day-to-day easier by designing workflows that are practical, efficient, and tailored to how you actually work.

### Section 5: dashboards and insights

Cream. Heading and copy left, stock image right (hands pointing at a navy dashboard on a monitor). **The image is lost.**

> H2: DASHBOARDS & INSIGHTS
>
> Information is only valuable if you can see it clearly and act on it. Dashboards turn scattered data into a single view, giving you real-time visibility into the metrics that matter most. Insights go a step further, helping you understand patterns, spot opportunities, and make smarter decisions with confidence.
>
> With our dashboard and insights solutions, you can:
>
> - Combine data from multiple sources into one clear view
> - Track key performance indicators in real time
> - Highlight trends and patterns that would otherwise go unnoticed
> - Share interactive reports with your team for better collaboration
> - Make data-driven decisions that move your business forward
>
> We design dashboards that are simple to use, visually clear, and tailored to your goals. That way you don't just see the numbers, you understand the story behind them.

### Section 6: examples

Navy. Heading centered, three columns, white headings, coral body.

> H2: EXAMPLES
>
> H3: AI RECEPTIONIST/CHATBOTS
>
> **(coral)** Add an AI Chatbot to your website and implement an AI receptionist that answers calls 24/7. They both can schedule appointments, answer common questions, and route urgent requests to the right person. Your customers get fast, professional service without you ever missing a call or chat.
>
> H3: PERSONAL ASSISTANT AGENTS
>
> **(coral)** A Personal Assistant AI Agent acts like your right hand, handling the small tasks that take up big chunks of your day. It can schedule meetings, send reminders, organize emails, manage to-do lists, and even find information on demand. This AI Agent keeps you organized, efficient, and focused on what matters most.
>
> H3: BACK OFFICE AUTOMATION
>
> **(coral)** Automate your behind-the-scenes tasks like data entry and scheduling updates. Backend automations keep your operations running smoothly without manual effort. Save time and reduce errors so your team can focus on higher-value work.

**Bug: "RECEPTIONIST/CHATBOTS" mixes singular and plural around a slash.** "AI RECEPTIONISTS AND CHATBOTS" reads cleaner.

### Section 7: something else in mind

The North Shore wave photo (`photos/backgrounds/_DSC0775.jpg`) under a cream wash. Centered.

> H2: HAVE SOMETHING ELSE IN MIND?
>
> H3 (italic): HOP ON A DISCOVERY CALL WITH US, AND LET'S EXPLORE WHAT'S POSSIBLE TOGETHER.
>
> We specialize in building custom AI agents and automations designed specifically for your business needs. Whether you have a unique agent in mind or need guidance on where to start, we're here to help.
>
> Button: Contact Us

## About

### Section 1: hero

The ridge hiker photo (`photos/backgrounds/DSC09338.jpg`) under a light wash, headline centered across the full width.

> H1: BACKED BY A COMBINED 50+ YEARS **(coral)** IN BUSINESS, OUR TEAM DELIVERS SOLUTIONS THAT ARE PRACTICAL **(coral)** AND EFFECTIVE **(coral)**

**Bug: no closing period**, where every other headline on the site has one.

### Section 2: meet the team

Cream. Three columns: rounded headshot, name, title, bio.

> H2: MEET THE TEAM

Column 1, photo `photos/team/Headshots-02.jpeg`:

> H3: KAWIKA LOPEZ
>
> Co-founder | Chief of Strategy
>
> Kawika Lopez is a multidisciplinary creative and entrepreneur with a background in film and a deep passion for photography, marketing, and design.
>
> After majoring in film, he quickly pivoted to entrepreneurship, building a strong foundation in customer service and business strategy. He joined Dave Kusumoto at 9th Avenue Studio, eventually becoming a partner, where they tackled projects across branding, photography, video, web development, and animation. Kawika's ability to blend technical expertise with business acumen has made him a go-to resource for elevating brand identity and streamlining operations.
>
> Recognizing AI as a defining force in the future of business, he has actively studied and implemented AI tools to bring cutting-edge solutions to Hawaii's small business community.

Column 2, photo `photos/team/Headshots-o3.jpeg`:

> H3: DAVE KUSUMOTO
>
> Co-founder | Chief of Sales
>
> Dave Kusumoto began his career with Internet Advantage, delivering some of Hawai'i's earliest web services before expanding into web design and branding with his wife, Shay.
>
> Their passion for creativity led them into video production, where they co-founded 9th Ave Studios and later he united with Jon Yamasato to launch HiSessions, a platform showcasing Hawai'i's music and culture through intimate live performances.
>
> [Third paragraph not transcribed here. It named one of Dave's businesses, and the rebuild replaces it at Kawika's request (2026-09-23) with: "Today, alongside running several businesses in home services and digital media, Dave brings his decades of experience...". The original is in the screenshot `about-3.png`, which is kept local and out of the public repo for the same reason.]

Column 3, photo `photos/team/Headshots-01.jpeg`:

> H3: BEN EBERHART
>
> Co-founder | Chief of Development
>
> Ben Eberhart is a digital strategist and problem solver with a background in marketing, video production, and nonprofit leadership.
>
> He brings over five years of experience in digital marketing, helping businesses across a multitude of different industries grow through strategic online campaigns. He joined Dave Kusumoto at 9th Avenue Studio, specializing in video production and storytelling to amplify brand impact. As a co-founder of Kaula Tree, a nonprofit based on O'ahu, he is dedicated to strengthening and encouraging communities through faith and service.
>
> When AI technology first emerged, he began researching and implementing AI solutions for businesses and discovered a true passion for creating practical, transformative tools that help companies thrive.

**Bug: the studio is "9th Avenue Studio" in two bios and "9th Ave Studios" in Dave's.** One name throughout.

**Bug: Hawaiian spelling is inconsistent.** Dave's bio uses Hawai'i (with a curly apostrophe standing in for the 'okina), Ben's uses a true 'okina and a kahako in Kāula, Kawika's uses plain "Hawaii's". The rebuild uses the true 'okina (U+02BB) and kahako throughout: Hawaiʻi, Oʻahu, Kāula.


## Contact

Cream. Heading and contact details left, form right.

> H1: CONTACT US
>
> info@evolve-hi.com
>
> (808) 201-4040
>
> Icons: Instagram, Facebook, TikTok, YouTube

Form, top to bottom:

> Group legend: Name
>
> First Name (required)
>
> Last Name (required)
>
> Email (required)
>
> Group legend: Phone
>
> Country (select, default "United States")
>
> Number (placeholder "+1")
>
> Checkbox: I agree to receive SMS messages from Evolve HI about scheduling, reminders, and service updates. Consent is not a condition of purchase.
>
> Message (required), textarea
>
> How did you hear about us? Radios: Friend/Family Member, Social Media, Other
>
> Button (slate): Send
>
> \*By providing your mobile number and opting in, you agree to receive text messages from **Evolve HI**. **Message frequency varies. Msg & data rates may apply.** Reply **STOP** to opt out, **HELP** for help. See our **Privacy Policy** and **Terms**.

**Note: the SMS consent block is A2P 10DLC compliance language** for the (808) 201-4040 number. If that number is still a live Twilio or Retell line, the consent text and the Privacy and Terms pages have to survive the rebuild word for word, with only the business name changed.

**Bug: the Send button is slate `#43475B`** while every other button on the site is coral.
