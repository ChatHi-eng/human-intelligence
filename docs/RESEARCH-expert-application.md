# Expert application — research notes (Nov 2026)

How Intro.co, ADPList, Clarity.fm, and Airbnb host onboarding structure supply-side
signup, distilled to the takeaways that shaped Palam's application wizard
(`app/expert-onboarding.tsx`). Sources: the products' own pages and help centers,
plus UX teardowns of Airbnb's 2022 host-onboarding redesign (uxdesign.cc,
chameleon.io) and Clio/Heard/Payscale rate surveys.

## The 10 takeaways we built on

1. **Cheapest commitment first.** All four open with a near-zero-effort step
   (Intro: just a phone number; Airbnb: property type from a list). Nobody asks
   for writing, proof, or money on screen one. → Our step 1 is a one-tap
   industry pick; writing comes mid-flow.

2. **Price goes late, after value is salient.** Airbnb deliberately puts price
   in the final phase ("reminding hosts-to-be of the value proposition of
   making money" — uxdesign.cc); Clarity sets the rate after profile + payout.
   → Rate is step 4 of 6, after the applicant has already pitched themselves.

3. **Never make them invent a number cold.** Airbnb generates a suggested price
   from comparables; Clarity anchors "the average 30-minute call works out to
   about $50"; Intro recommends "your hourly rate + a 20% premium."
   → Each industry now carries a `suggestedRateCents` range shown as
   "most {field} charge $X–$Y/hr", with tappable presets and a tip that advice
   calls price above day-rate work.

4. **"You can always adjust it" is load-bearing reassurance.** Airbnb says it
   verbatim about nightly price. → The rate step keeps "you can change this
   anytime", and "I'll decide later" submits with no rate at all (profile shows
   "Rate coming soon"; booking stays closed until a rate exists).

5. **State a review-time number.** Clarity promises ~24h review and a friendly
   fix-and-reapply path; ADPList states 3 weeks up front; Intro says nothing and
   gets dinged for it in reviews. → "You'll hear back within 2–3 days" stays on
   the received screen and the Studio pending card.

6. **Proof stays lightweight — but publish what reviewers look at.** None of the
   four hard-requires a resume (Clarity historically required LinkedIn sign-in;
   ADPList vets a photo + bio against published standards). ADPList publishes
   its bar (7+ years experience) so weak applicants self-select out.
   → We ask for LinkedIn **or** a resume (at least one, so the vetting team
   always has something to verify — resume goes to a private bucket), and the
   wizard + pending card say plainly that a human reviews pitch, experience,
   LinkedIn, and resume.

7. **Motivation is screened with a short prompt, never an essay.** ADPList
   reads "eagerness to invest in others" out of the bio; nobody fields a long
   "why us" essay. → "What do you hope to get out of Palam?" is capped at 500
   chars, lives on the final step, and says "a sentence or two is plenty." It's
   vetting material only — never shown publicly.

8. **Progress feel: one bar, one primary action.** Airbnb's teardown credits the
   visible progress bar and a single centered Continue per screen. → Single
   fill bar + "Step X of 6 · Name", one primary button, selection inputs over
   free text wherever possible.

9. **Selectivity is a feature, not friction.** Human-vetted platforms brag about
   it (ADPList: ~30% approval; Intro is invite-only). → Copy leans into "a real
   person reads every application" instead of apologizing for review time.

10. **Review-before-submit catches regret.** With money and vetting on the line,
    the last step shows a compact summary (field, background, headline, rate,
    photo) with per-row Edit links before "Submit application."

## Rate ranges (USD/hr, 1:1 advice calls — guidance shown in the wizard)

| Industry | Range | Anchor |
| --- | --- | --- |
| Artists | 50–150 | freelance creative-consult benchmarks |
| Writers | 50–150 | experienced editorial/coaching calls (earned pay avg ~$28/hr sits below advice pricing — Payscale) |
| Product Designers | 100–250 | senior mentors on paid platforms commonly $100–300 |
| Coders | 100–250 | US freelance $75–200; senior advisory $150–300 |
| Engineers | 100–250 | PE consulting benchmarks |
| Lawyers | 250–500 | Clio: national average $349/hr (2025) |
| Therapists | 100–250 | Heard survey: average session fee $159/hr |
| Tradesmen | 75–150 | plumbers/electricians bill $45–200; advice calls sit mid-range |

Marketplace-wide anchors: Intro.co experts span $100–2,000/hr; Clarity's implied
average is ≈$100/hr ($1.60/min).
