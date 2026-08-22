# Real-device verification checklist (P1-6 + P1-3)

> **Author:** 2026-08-22, launch plan B10. Everything below has passed WebKit/
> Chromium **emulation**, but `mobile_followups.md` §3 documents why emulation
> cannot be trusted for these behaviours — this list needs a real iPhone
> (iOS Safari) and a real Android phone (Chrome) against
> **https://chefer.duckdns.org**. Tick as you go; file anything broken.
> Record device + OS versions at the top of `mobile_followups.md` when done.

## Cook mode (P1-3) — the new acceptance criteria

Open any recipe → **Cook** (or dashboard → Start Cooking).

- ☐ **Wake lock**: leave the phone untouched on a step for longer than your
  auto-lock timeout (test with a 10-step recipe, e.g. any AI dinner). The
  screen must stay on. iOS needs ≥ 16.4; older versions degrade silently —
  note the version if it sleeps.
- ☐ **Swipe**: swipe left/right advances/rewinds steps; a swipe from the very
  screen edge must not fight the browser's back gesture.
- ☐ **Inline timer**: open a step that mentions minutes (most simmer/bake
  steps) — start the timer, background the app for a minute, return: the
  remaining time should still be sane. On Android, expect a vibration at 0.
- ☐ **Servings scaler + drawer**: bump servings, open the ingredients drawer —
  quantities scale; toggle Imperial in Preferences and re-check units.
- ☐ **"Made it!"**: finish a recipe, log it, rate it. Check the Tracker shows
  the meal and the recipe page shows your stars.

## Carried over from mobile_followups.md §3 (never device-tested)

- ☐ Input focus on every form (login, register, preferences, tracker, chat):
  **no zoom-on-focus** on iOS (the 16px rule's real target).
- ☐ `dvh` behaviour as the iOS URL bar collapses/expands: dashboard,
  meal-plan, recipe detail, cook mode — nothing important hidden under bars.
- ☐ Landscape (~844×390): sticky header + tab bar on a short viewport.
- ☐ On-screen keyboard vs sticky bars: tracker Save, preferences save bar,
  chat input — if the keyboard occludes them, we apply
  `interactive-widget=resizes-content` and re-test.
- ☐ `prefers-reduced-motion`: drawer and sheet transitions respect it.
- ☐ Chart tooltips on the progress page: tap outside dismisses.
- ☐ Sign-up page scrolls to the top of the card on a small phone
  (the my-auto fix from the 2026-08-22 bug sweep — regression check).

## New-since-the-audit surfaces worth a quick tap-through

- ☐ Chat widget: send a message, watch it stream; hit the free 5/day limit on
  a free account and confirm the upgrade message renders as a chat reply.
- ☐ Shopping list: check items on the phone, open the same account on another
  device — checks appear after refresh.
- ☐ Meal-plan cost chip + over-budget banner readable at 375px.
- ☐ Admin /admin/users usable on a phone (you'll manage tiers from anywhere).
