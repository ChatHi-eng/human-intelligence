# Palam: Copy Inventory

*Every user-facing line across the product, as of Nov 13, 2026, after the copywriting review and humanizer pass. No dashes used as punctuation, and "expert" (never "founding expert").*

---

## 1. The positioning (north star)

**The one-liner:** Talk to a human who knows.

**The narrative:** Search anything today and a machine answers. The feeds are full of AI text compiled from other people's work. On Palam you talk to a person who has lived what you're asking about. Every expert is vetted by a person, and they get paid for what they know.

**Lines in use (reusable anywhere):**
- Talk, human to human.
- Never scraped. Personally vetted. A direct line.
- A human reads every application.
- AI can repeat what other people wrote, but you were there.
- Get paid for what you know.
- Palam's fee is 15% of each session. (Stated twice only: the wizard's rate step and step 3 of the landing page's expert card.)

**Lines retired in the Nov 13 rewrite (restore any you miss):** "Real perspective can't be compiled." / "Your experience isn't training data. It's a living." / "Not another AI answer." / "Your knowledge, paid for, never scraped." / "No algorithms deciding who gets in."

---

## 2. Website (palamapp.com)

**Browser title:** Palam: Talk to a human who knows.

**Meta description (Google result):** Every search answers with AI now. Palam is a direct line to real, personally vetted humans on 30-minute paid video calls. Now accepting expert applications.

**Hero**
> **Talk to a human who knows.**
> Search anything today and a machine answers. LinkedIn and Reddit are filling up with the same AI text, compiled from other people's work. Palam is a direct line to a person who has lived what you're asking about: a vetted expert on a 30-minute video call.
> We're signing up experts first. If you're the one people come to for advice, apply now and you'll be listed when booking opens.
> Button: **Apply as an expert**
> Takes about four minutes. A human reads every application.

**Pillars**
- **Never scraped.** Nothing here is compiled from other people's work. Experts share what they learned over years and get paid for it. Sessions are not recorded.
- **Personally vetted.** A person on our team reads every application and decides who gets in before a profile appears.
- **A direct line.** Thirty minutes on video with the person who has the experience you need.

**How a session works**
1. **Pick your person.** Browse vetted experts by field: lawyers, therapists, coders, designers, tradesmen. Each profile shows who they are and how long they have done the work.
2. **Book 30 minutes.** Pick a time and pay once. Free cancellation until 24 hours before your session.
3. **Talk, human to human.** A video call with their full attention, and answers that come from their own experience.

**Become an expert**
> You spent years getting good at your work. On Palam you charge for what you learned: you set your rate and talk directly with someone who wanted a person's answer instead of a chatbot's.
> 1. **Apply in about four minutes.** Tell us your field, your background and what you can help with. A person reads every application and replies within 2 to 3 days.
> 2. **Set your rate and your hours.** You decide what a session costs and when you are available, and you can change both later.
> 3. **Get booked and get paid.** Sessions are 30-minute video calls inside the app. Palam's fee is 15% of each session, and you are paid out through Stripe.
>
> Palam is opening to experts first. If people keep coming to you for advice about law, therapy, code, design, a trade, or anything else you know well, apply in the Palam app. Experts who join now are first in line when customer booking opens.
> Button: **Start your application**

**Contact:** Questions? Write to us at **info@palamapp.com**. A human reads it.

**Return page / 404 (after Stripe and unknown links)**
> **All done here**
> Head back to the Palam app to pick up where you left off.
> Button: **Open Palam**
> If the app doesn't open, just switch back to it.

Legal pages (Privacy, Terms, Delete your account) live in `docs/` and are not repeated here.

---

## 3. App: first touch

**Welcome screen (current, expert-recruiting mode)**
> **Get paid for what you know.**
> The internet answers everything with AI now, compiled from other people's work. Palam pays the people who did that work. You set your rate and take 30-minute video sessions. Apply now and you'll be first in line when booking opens.
> Button: **Start your application** (reads "Get started" once customer booking opens)

**Welcome screen (customer mode, when booking opens)**
> **Talk to a human who knows.**
> Every search answers with AI now. Palam is a direct line to people who have lived it: lawyers, therapists, coders, designers, tradesmen. Book a video call with one when you need it.

**Sign in**
> **Sign in or create account**
> Enter your email and we'll send you a sign-in code. New here? The code signs you in and creates your account at the same time.
> Button: **Send code**
> By continuing you agree to Palam's Terms and Privacy Policy.

**Enter code**
> **Enter your code**
> We emailed a sign-in code to {email}. It may take a minute to arrive.
> Buttons: **Verify and sign in**, **Resend code**, **Use a different email**

**Discover header:** **Talk to a human.** Vetted people who have lived what you need help with.

**Discover apply card (people who haven't applied):** **Become an expert.** Set your own rate and get paid for 30-minute video sessions. Applying takes about four minutes. Link: Start your application

**Discover when empty:** **No experts yet.** Be the first human on Palam. Your application takes about four minutes.

**You tab, become-expert card:** **People pay for what you know.** Years of experience in anything (law, code, pipes, paint) is worth real money to someone who is stuck. AI can repeat what other people wrote, but you were there. Apply as an expert and get paid for it. Button: **Become an expert**

**Public profile, signed-out visitor (share links):** **Palam is invite-only for now.** Apply as an expert or get the app.

**Expert profile, new sections:** role line under the name ("{title} at {company}") and **Ask me about** followed by the expert's topic tags.

**Booking screen while booking is off:** **Booking opens soon.** Palam is signing up experts first. You will be able to book sessions here soon.

---

## 4. The application wizard (6 steps)

**Progress:** Step {n} of 6, labelled Field / Experience / Pitch / Rate / Photo / Review

**Step 1: What's your field?**
> Search or pick the closest fit. Not listed? Choose "Something else" and type your own. The application takes about four minutes, and a real person reads every one.
- Search box: "Search fields (try law, design, finance)"
- 30 fields: Law, Therapy & Mental Health, Software Engineering, Product & UX Design, Engineering, Skilled Trades, Writing & Editing, Art & Illustration, Product Management, Startups & Founding, Marketing & Growth, Sales, Finance & Investing, Accounting & Tax, Real Estate, Medicine & Health, Nutrition & Fitness, Career & Job Search, Leadership & Management, HR & Recruiting, Data & AI, Operations & Logistics, Teaching & Education, Architecture & Interiors, Film & Photography, Music & Audio, Food & Hospitality, Parenting & Family, Immigration & Relocation, Nonprofit & Public Sector
- Last tile: **Something else**, which opens **Your field** ("e.g. Veterinary medicine, Aviation, Wine")

**Step 2: Your background**
> This is what our review team weighs most. Share your LinkedIn or upload a resume. We need at least one to verify your experience.
- **Current role** ("e.g. Senior Product Designer")
- **Company or practice (optional)** ("e.g. Acme, or Self-employed")
- **Years of experience**
- **LinkedIn URL**
- **Resume** (PDF or Word, up to 10 MB)
- Note: Your resume goes to our review team only. Customers never see it.

**Step 3: Your pitch**
> The headline shows on your Discover card. The longer pitch shows on your profile.
- **Headline** ("One sentence on what you offer")
- **How can you help? (optional, recommended)** ("Who are you for, and what problems do you solve?")
- **Topics you can help with (up to 6)**: The specific things people can ask you about. These show as tags on your profile and help customers find you in search. ("e.g. Portfolio reviews")

**Step 4: Set your hourly rate**
> Sessions are 30 minutes, so customers pay half your hourly rate per session. Palam's fee is 15% of each session. You can change your rate anytime.
- Guidance: "Typical for {field}: $X to $Y/hr. This is only a guide. Advice calls usually price above your day rate."
- Opt-out: **I'll decide later.** Apply without a rate. Your profile shows "Rate coming soon" and you can set it in Studio whenever you're ready.

**Step 5: Add a profile photo**
> Your photo is the first thing customers see on Discover. You can skip this step, but we recommend adding one.

**Step 6: Before you submit**
> One last question for our review team, then check that everything reads the way you want.
- **What expertise do you have to offer?**
- Your pitch to our review team: the value you bring, how you deliver it, and the kinds of customers you can serve. It never appears on your profile.
- Placeholder: "e.g. 15 years shipping consumer products. I can help early-career designers with portfolio reviews, interview prep, and getting unstuck on real projects."
- Button: **Submit application**

**After submitting:** **Application received.** A person on our team reads every application. You'll hear back within 2 to 3 days. Once you're approved, your Studio unlocks and you can open up availability.

**Studio while pending:** **Application under review.** Thanks for applying, {name}. A person on our team reads every application, including your pitch, experience, LinkedIn, and resume. You'll hear back within 2 to 3 days. Once you're approved, your Studio unlocks with availability, bookings, and earnings.

**Studio if not approved:** **We couldn't approve your application.** Thanks for your interest in Palam. We weren't able to approve your application this time. If your situation changes, or you think we got it wrong, get in touch and we'll gladly take another look.

---

## 5. Emails (all from "Palam <info@palamapp.com>")

Every email carries the header **palam** / *Talk to a human who knows.* and the footer *Palam · Questions? Write to info@palamapp.com*

**Sign-in code** (subject: *Your Palam sign-in code*): Sign in to Palam. Your sign-in code: {code}. Enter this code in the app. It expires in 1 hour.

**Sign-up code** (subject: *Your Palam sign-up code*): Welcome to Palam. Your sign-up code: {code}. Enter this code in the app. It expires in 1 hour.

**Welcome** (subject: *Welcome to Palam*)
> Welcome to Palam. Search engines now answer with AI text compiled from other people's work. Here you talk to a person who has lived the problem you're stuck on. We vet every expert ourselves.
> We're signing up experts first, so you can't book a session yet. You can still look around the app and see who's here.
> If you're the one people come to for advice, apply to become an expert in the app. It takes about four minutes and a person reads every application.
> Glad you're here, Palam

When customer booking opens, the middle two paragraphs switch to: "Sessions are 30 minutes, one-on-one, over video. You pick a person, pick a time, and have a straight conversation." / "Have a look around the app and see who's here. If you're the one people come to for advice, you can apply to become a Palam expert in the app."

**New application alert, to you** (subject: *New expert application: {headline}*): headline, field (marked "typed in" when it is their own), current role, rate, experience, LinkedIn, topics, "Expertise they offer (their pitch)", profile bio, applicant email, and where to review it.

**Application approved, to the applicant** (subject: *You're on Palam*)
> Good news: a human read your application and said yes. You're on Palam.
> Open the app and head to **Studio** to set your weekly availability and connect payouts. Once that's done, your profile is live.
> Welcome aboard, Palam

**New booking request, to the expert** (subject: *New booking request from {name}*): {name} just asked to book a session with you. It's waiting in **Studio → Requests**. Accept it if the time works, decline if it doesn't. Either way, the sooner you answer, the better it feels on their end. Then session details, "You earn $X (after Palam's 15% fee)", and: If you decline, {name} is refunded in full, with no fee to either of you.

**Request sent, to the customer** (subject: *Request sent. You'll hear back soon*): Your request is in. {expert} has been asked to confirm, and you'll get an email from us the moment they answer. Then: About your payment: you pay when you book, and that's what holds your spot. If {expert} declines or can't make it, your card is refunded in full. You can cancel for a full refund too, up to 24 hours before the start. Inside 24 hours, cancellations aren't refunded.

**Booking confirmed, to the customer** (subject: *You're booked: {expert} confirmed*): {expert} said yes. You're booked. To join, open Palam a few minutes before the start, open this booking, and tap **Join**. The call runs inside the app, so there is nothing to install. One tip: thirty minutes goes faster than you think. Come with your question sharp and the backstory trimmed, and you'll get twice as much out of it.

**Booking confirmed, to the expert** (subject: *Locked in: session with {name}*): You accepted. Your session with {name} is locked in. It'll be waiting in your **Today** list in Studio when the day comes.

**Expert declined, to the customer** (subject: *{expert} couldn't make your session*): {expert} declined your session request. It happens. Schedules are messy and good people are busy. Then the refund line, and: There are more people on Palam who know this ground. When you're ready, have another look around.

**Cancelled, to the expert** (subject: *Cancelled: session with {name}*): three versions. Customer cancelled: "{name} cancelled the session below. {refund status} That time is open again, and there is nothing you need to do." Payment failed: "The request below was withdrawn. {name}'s payment didn't go through, so the session never locked in." Otherwise: "The session below was cancelled. Nothing to do on your side."

**Refund, to the customer** (subject: *Your refund is through*): The refund for your session with {expert} went through: {amount} back on your card, in full. Depending on your bank, it can take 5 to 10 business days to show on your statement.

**No-show report, to you** (subject: *No-show reported: booking {id}*): details plus the policy reminder. **Acknowledgment, to the reporter** (subject: *We got your no-show report*): We got your report. A human reviews every one within 48 hours, and you'll hear from us as soon as it's resolved. Nothing more to do on your side.

---

## 6. Store and graphics

**Play feature graphic:** palam / Talk to a human who knows.

---

## 7. Lines to revisit before customer launch

- **Payment sheet (book screen)** still shows the Stripe test card line. Remove it when Stripe goes live.
- **Welcome email** currently goes out the moment someone asks for a code, before they have signed in. It should wait until the first sign-in.
- **Store listings** (Play and App Store descriptions) don't exist yet. Write them from Section 1 when the developer accounts clear.
- **When booking opens:** set the `CUSTOMER_BOOKING_ENABLED` secret to `true` in Supabase so the welcome email switches to the customer version, flip the app flag, and move the landing page hero back to the customer pitch.
- **Terms of Service** do not state Palam's 15% fee. The wizard and the landing page state it, so the Terms should too.
- **Proof the landing page still lacks:** how many experts are approved, two or three named experts willing to be featured, and one real quote from an expert about why they joined. None of these exist yet, so nothing was invented.
