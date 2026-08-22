# Production follow-ups — issues found while testing on prod

> **Status:** open. Found during live production testing (browser automation against
> https://chefer.duckdns.org). Each entry is self-contained enough to start from cold.
> Add new findings here as prod testing continues; strike through when fixed.

---

## 1. `/meal-plan` sticks on the loading fallback (hydration error)

**Found:** 2026-08-22, fresh account `funnel-test@chefer.dev`. **Severity: high** —
it's the core page, and a beta user who hits this sees an infinite spinner.

The `/meal-plan` page intermittently never leaves the route-level Suspense fallback
("Loading your meal plan…" from `apps/web/src/app/(dashboard)/meal-plan/loading.tsx`),
even across a hard reload.

Evidence gathered:

- A direct `fetch('/trpc/mealPlan.getForWeek?batch=1', …)` with `weekOffset: 0` from the
  same session returned **200 with the full plan** (planId `cmt4daesf000bbs0i7zsk1pas`)
  — the API is fine; the stall is client-side.
- Browser console showed minified **React error #418 (hydration mismatch)**, captured by
  Sentry — the Sentry event has the stack.
- Observed twice: (a) first visit before any plan existed — eventually resolved on its
  own; (b) right after the account was upgraded to PREMIUM and downgraded back to FREE —
  did **not** resolve within ~30 s nor after `window.location.reload()`.

Suspects: server-rendered tier-dependent UI in the `(dashboard)` layout or meal-plan page
disagreeing with client state after a tier flip, or a suspended server component that
never resolves.

How to attack: reproduce with a fresh account (register → generate → upgrade → downgrade →
revisit `/meal-plan`); run `pnpm build && pnpm start` locally for unminified hydration
diffs, or pull the #418 event from Sentry. Page code:
`apps/web/src/app/(dashboard)/meal-plan/page.tsx`.

## 2. Chat send button ignored first synthetic click (low confidence)

**Found:** 2026-08-22, same session. Probably an automation artifact, **not** a product
bug — a JS-dispatched click on "Send message" did nothing (message stayed in the input),
while a real coordinate click submitted fine. Only worth a look if a real user ever
reports a dead send button; pair it with the P1-6 device sweep (`docs/device-checklist.md`).
