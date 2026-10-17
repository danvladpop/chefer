# Tier status and a quiet Premium entry point on You

Research for owner feedback F6 and F7 (2026-10-17, `docs/backlog-2026-10/feedback-2026-10-17.md`).
The question: how should a subscription-style app show the current plan, and offer an upgrade that
stays visible without nagging? Chefer's Premium is currently switched on at no cost, with no price
and no payment.

Sources were read on 2026-10-17. Quotes are kept short and the rest is paraphrased.

## 1. What the primary sources say

### Apple Human Interface Guidelines, "In-app purchase"

Source: [HIG › In-app purchase](https://developer.apple.com/design/human-interface-guidelines/in-app-purchase),
read through Apple's DocC JSON at `developer.apple.com/tutorials/data/design/human-interface-guidelines/apple-in-app-purchase.json`.

- **Best practices.** _"Let people experience your app before making a purchase."_ People pay more
  readily once they have found the value. Present products _"in ways that mirror the style of your
  app"_, so the purchase never feels like a different app. Use simple, succinct names.
- **Auto-renewable subscriptions.**
  - _"Prompt people to subscribe at relevant times"_, and _"consider making it easy for people to
    subscribe at any time by including prompts at relevant points throughout your app."_
  - _"Encourage a new subscription only when someone isn't already a subscriber"_. Otherwise people
    may think their subscription has lapsed.
- **Making signup effortless.** _"Include a sign-up opportunity in your app's settings. App and
  account settings are common places for people to look for a way to subscribe."_ The sign-up
  screen must say what each period includes.
- **Managing subscriptions.**
  - _"Provide summaries of the customer's subscriptions"_, ideally _"in a settings or account
    screen, near the subscription-management option."_
  - _"Always make it easy for customers to cancel"_. Burying the action makes people feel
    discouraged from cancelling.
- **After unlocking.** _"Think about ways to align the post-redemption experience in your app with
  the subscriber's new status"_, for example a welcome or a short tour.

[HIG › Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding) makes
the same point: _"Prefer letting people experience your app or game before prompting them for
ratings or purchases."_

### App Store Review Guidelines

Source: [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).

- **3.1.1.** Unlocking features or functionality _"must use in-app purchase"_, and an app may not use
  its own unlock mechanism.
  - Chefer's free switch is the grey zone that R-04 in
    `docs/app-store/ios/app-review-simulation-2026-10-01.md` flagged.
  - R-04's cheapest fix shipped: the copy is now "Premium is included at no cost", with no "for
    now", no "price" and no "card".
  - Any new entry point must keep that copy. `copy-lint.test.ts` and `premium-pitch.test.ts`
    already ban price, "subscribe" and "beta" wording.
- **3.1.2(a).** Apps that _"trick users into purchasing a subscription under false pretenses or
  engage in bait-and-switch"_ are removed.
- **3.1.2(c).** _"Before asking a customer to subscribe, you should clearly describe what the user
  will get"_. This is what the owner asked for: tapping should show the benefits clearly.
- **5.6.** No manipulative practices, and no tricking people into unwanted purchases. A nagging
  modal is not named, but it is the kind of thing this section has in mind.

### Nielsen Norman Group, modals and popups

- **Popups are disliked.** Anna Kaley, [Popups: 10 Problematic Trends and Alternatives](https://www.nngroup.com/articles/popups/)
  (2019), and Kate Moran, [Overlay Overload](https://www.nngroup.com/articles/overlay-overload/)
  (2021). Modal popups are the most disliked pattern. One _"interrupts users and forces
  them to take an action inside the popup instead of continuing their tasks."_
- **Timing.** _"Never show a popup before users can glean value from your website or application."_
  Never right after login, and never in the middle of a task.
- **Alternatives.** Prefer nonmodal, user-initiated surfaces, such as a static link, tab or card
  the person chooses to open.

### Product write-ups (RevenueCat)

- **A permanent upgrade button.** Michal Parizek,
  [The essential guide to paywalls for subscription apps](https://www.revenuecat.com/blog/growth/guide-to-mobile-paywalls-subscription-apps)
  (Dec 2024). It names four placements: onboarding, contextual (a gated feature or limit), "buy
  now" (a permanent _"Get Pro" or "Upgrade"_ button) and campaign. _"Every app should offer a
  straightforward upgrade path"_. Adding that button lifted Avast's revenue by 10–20% _"even
  accounting for cannibalization"_. It also warns against dark patterns.
- **Placement.** Peter Meinertzhagen,
  [Optimizing paywall placement](https://www.revenuecat.com/blog/growth/paywall-placement) (Nov 2023).
  The aggressive end is "every app open, before any locked feature", and its own interviewees say
  the goal _"isn't about inundating users with payment requests."_ Chefer's own rules
  (`premium_plan.md` §6.5) already chose the soft end.

## 2. What Chefer already has (and must stay consistent with)

- **Paywall principles**, `premium_plan.md` §6.1 and §6.5.
  - Value first, lock second.
  - One comparison, generated from `PLAN_FEATURES`.
  - At most one contextual nudge a day, every nudge dismissible, a 7-day cooldown per dismissed
    source.
  - Never interrupt a task, and never use fake urgency.
- **The nudge cap.** It covers unprompted surfaces only. _"A user-initiated open is never capped"_
  (`business_flow.md` §9, about l.748).
- **The sheet.** `PremiumSheet` (mobile) and `UpgradeButton`'s Sheet (web) are one job-led pitch: a
  headline, up to 3 bullets, "Also included", the INCLUDED terms, then Turn on Premium or Not now.
  On success they show "Premium is on" with a next step. Copy lives in `PREMIUM_PITCH_COPY`.
- **Web's plan-status pattern.** `PlanFooterCard` shows a "Premium plan" pill, or a "Free plan"
  card with an ✕ that collapses to a one-line "Go premium" link. The upgrade path never fully
  disappears.
- **The plan card that exists today.** On mobile it is `app/profile.tsx` §plan, and on web it is
  `/profile`'s PlanCard. On mobile it is three taps deep (You → Account → Plan & Premium); on web
  it sits below the user and household cards on `/profile`, which lives in the More menu.

## 3. What the evidence adds up to

1. **Status and upsell are different things.** A plan status line on the account screen is
   expected (HIG). For a Premium user it is just status, with a link to what they have and how to
   switch back. Never pitch to someone who already has it (HIG).
2. **A persistent, user-initiated entry point is the non-annoying kind.**
   - It isn't a nudge, so the daily cap doesn't apply.
   - It needs no dismiss, because it never interrupts anything.
   - "Annoying" comes from **modality and timing**, not from visibility (NN/g).
3. **The tap shows the benefits first and the opt-in second** (3.1.2(c)). The opt-in stays a
   deliberate button, with "Not now" just as easy (5.6, no dark patterns).
4. **No price, no "free for now", no "subscribe" on any platform** until there is a real in-app
   purchase (3.1.1, R-04).
5. **Don't push in the first session** (HIG Onboarding, NN/g). A static status row is fine on day
   one. A louder, brand-coloured card or any auto-opening surface should wait until the person has
   used the app.

## 4. Options

All three put the title through `ShellChromeProvider` on one row with Ask Chef (F5).

### A. The plan pill in the header

"You **[Free]**" sits on the title row, and tapping the pill opens the sheet.

- It is the quietest option, and it doesn't push the list down.
- It is weak as a conversion path: a chip doesn't say what Premium is.
- It crowds the title row at 320pt and needs a padded 44pt hit area.
- `ShellTopBar` has no slot for it, and we don't change the shared chrome, so it would go into
  `actions` next to Ask Chef.

### B. A tier row as the first item on You (recommended)

A compact, full-width row card, styled like the other You rows:

- **Free:** a Free badge, "Free plan" and "See what Premium adds ›".
- **Premium:** a Premium badge, "Premium plan" and "Included · What you have ›".

What a tap does:

- **Free** opens `PremiumSheet` with a new `source: 'you'`. That source gets a "what Premium adds"
  pitch: a full-benefits headline, with "Also included" expanded by default. The opt-in is "Turn on
  Premium" in the sheet.
- **Premium** goes to `/profile?section=plan`.

Behaviour:

- It never auto-opens, and it has no dismiss, because it is status.
- It looks the same on the first session.
- Web parity: the same row heads `/profile`, the web counterpart of You. The existing
  PlanFooterCard stays.

### C. A benefits card with a dismiss that collapses to B

On Free, a brand-tone card shows the top 3 Premium perks and a "See what Premium adds" button,
plus an ✕.

- The ✕ collapses it to option B's row for good (the same model as web's PlanFooterCard).
- It is hidden until the second app day, and it counts as a capped nudge (`useNudge('you')`).
- It converts more, at the cost of the most visual weight on a settings-like screen. Of the three,
  it is the closest to "annoying".

### Recommendation

**B, with the tap reusing `PremiumSheet` and a `'you'` source.**

- It meets HIG's "sign-up opportunity in settings" and "summarise their plan" guidance.
- It is user-initiated, so it falls outside the nudge cap without bending the rules.
- It keeps one paywall component, one copy registry and one funnel (`upgrade_prompt_shown
{source:'you'}`).
- It needs no API change.

C is the fallback if the funnel data after two weeks shows B's row is ignored (`premium_plan.md`
§6.7).

## 5. Outcome (2026-10-17)

The owner accepted the defaults: **B**, built as the **tier row**. "Plan" means the meal plan in
Chefer, so the subscription concept is the tier, see `GLOSSARY.md`. The new upgrade source is
`tier-row` and its pitch job is `overview`. The flow is described in `business_flow.md` §9 under
"Tier row".
