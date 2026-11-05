# A partner joins the owner's household with their own account; the plan and list stay the owner's

Status: accepted 2026-10-22 (owner decision, market review MUST 5). Lane I of
`docs/market-review-2026-10/IMPLEMENTATION-PLAN.md`.

Until now a household was up to five **member profiles** inside one account: names, portions and allergies that the
account's owner typed in. A partner who wants to see the week or tick the list had to borrow the owner's phone.
The owner decided that an invited partner gets their **own** Chefer account and joins the household by an invite
link. Both people see and edit the same week plan and a live shared shopping list. Food logs, weight and targets stay
private to each person. Billing is on hold, so there are no paid seats; the check that would limit seats lives in one
place.

## Decision

**The household stays anchored on the owner's account.** There is no new `Household` table. The owner's
`HouseholdMember` rows, `MealPlan` rows and `ShoppingList` rows are the household's. A partner is linked to it by a
`HouseholdLink` row (`ownerId`, `partnerId`, `memberId`, `ACTIVE`/`ENDED`), created by redeeming a single-use
`HouseholdInvite`. This is the coaching pattern (`CoachingInvite` → `CoachingLink`) applied to households.

**A partner claims a member profile.** Every invite is made for one existing member profile ("Invite Maria"). On the
join screen the partner sees the allergies, diet and dislikes the owner entered for that profile, edits them if
needed, and confirms. The confirmed terms are written to the member profile **and** unioned into the partner's own
safety preferences, so their own searches and scans are safe too. While the link is active, the member profile's
safety terms are read as the union of the profile and the partner's own preferences
(`HouseholdMemberRepository.findByUserId`), so a later change in the partner's preferences reaches the shared plan
without a sync step. The union only ever adds terms: nobody can make a meal less safe for someone else.

**One seam decides whose plan a request touches.** `householdAccess.scope(userId)` returns
`{ role: 'SOLO' | 'OWNER' | 'PARTNER', planUserId, … }`. Plan and list procedures resolve it once, at the router, and
call the existing services with `planUserId`. A partner's swap therefore runs exactly as if the owner had made it:
the owner's tier, safety union, plan shape and targets-driven portions. Repositories were not changed to resolve
households implicitly. Doing that would also have changed callers that must never see another person's plan, such as
the Following profile's "this week" card.

**What a partner can do with the plan.** Swap, replace, pin, remove a meal, and add a recipe to the week. Generating
or regenerating a week, planning an empty day, following a saved week, restoring an old week, scaling a day and the
targets-driven rebalance stay with the owner. All of them are driven by the owner's preferences and targets, and a
partner running them would either use the wrong person's numbers or need the owner's private ones. A partner who
calls one of them gets `FORBIDDEN` with a sentence naming the owner, so a shipped binary shows readable text.

**Targets and portions per person.** Plan slots keep storing the owner's eater portion: the owner's day fit and
refit work as before, and only on the owner's own targets. `fitPlanDay` refuses to touch a plan whose `userId` is not
the caller's. A partner eats their member profile's `portionFactor` of every meal. The plan response for a partner
shows the slots at that portion, carries the partner's own calorie and protein targets, and leaves out the owner's
refit notice. "I ate this" logs that portion to the partner's own log. The shopping list does not change: owner
portion + Σ member portions, and the partner is one of the members. Fitting the partner's portions to their own
targets is a follow-up.

**Privacy line.** A partner can read the owner's plan, the list, and the household's member profiles (names,
portions, safety terms). Nothing else. Logs, weight, targets, preferences other than safety terms, workouts and
analytics are per account. Every household read goes through the scope seam, and a contract test asserts that a
partner's calls never return the owner's logs, weight or targets. The owner sees the partner's safety terms on the
claimed profile, and the join screen says so before the partner agrees.

**Live list: polling a small sync endpoint, not SSE or websockets.** `shoppingList.sync` returns the list's revision
and the per-item check state (who and when, about 1 KB). Clients poll it every 4 s while the Shop screen is focused
and the household has a partner. They fetch the full list only when the revision changes, which happens after a meal
swap or a custom item.

- **Why not SSE:** Chefer's only SSE stream (recipe images) uses an in-process emitter, which works only with one API
  instance. React Native has no `EventSource`. A polyfill is a new dependency, and native streaming would put a native
  module in an OTA lane that must not change the runtime fingerprint.
- **Why not websockets:** they would need Caddy and Next proxy changes and a connection registry.
- **Why polling is enough:** at today's scale, 4 s polling of a tiny indexed read while a screen is open costs
  nothing, survives flaky mobile networks, and needs no new infrastructure. Check-offs land on the other phone within
  about 5 s. If load ever matters, the same `sync` contract can be served by an SSE stream later without changing the
  clients' reconcile logic.

**Offline check-offs reconcile by last write per item.** Every toggle carries the device's time (`at`). The server
stores `{ by, at, checked }` per key in `ShoppingList.checkedMeta` and applies a toggle only when its `at` is newer
than the stored one, with `at` clamped to the server's clock. Mobile keeps unsent toggles in a durable outbox
(`KV_KEYS.shopOutbox`) and replays them in order when it is back online. An offline tick made at 10:00 therefore
cannot undo the partner's untick from 10:15 when it syncs at 10:30. Same-day plan edits now run in a serializable
transaction. A swap, replace, pin or remove can also send the recipe it expects to replace; if that slot changed
first, the server returns `CONFLICT` with a `mealSlot` cause ("Maria changed this meal a moment ago").

**Leaving, removing and deleting.**

- **Who can end it:** the owner can remove any partner, and a partner can leave. Nobody else can.
- **The member profile stays.** Removing or leaving keeps the claimed profile. It becomes an ordinary profile again,
  holding a snapshot of the safety terms it had at that moment, because the person usually still eats at the table.
  The owner can delete the profile afterwards. Deleting a claimed profile ends that partner's link first.
- **The plan and list stay.** Plan history and the list belong to the owner and stay. The partner goes back to their
  own plans: whatever they had before joining, or a fresh carry-forward. Nothing of theirs was changed while they
  were in the household.
- **The partner deletes their account:** the link cascades away. The profile stays with the owner as above.
- **The owner deletes their account:** every link ends and each partner keeps a notice ("Dan stopped using Chefer
  — your plan is your own again"). The notice is written with the partner as its actor, so it survives the cascade
  (the coaching pattern).
- **Notices:** joining, leaving and removal each write an in-app notice for the other side. Chefer has no server push
  today, so none is sent.

**Limits and entitlements in one place.** `PLAN_FEATURES.householdPartners` caps linked accounts. It is 4 on both
tiers: one owner plus four partners fills the five-profile cap. `householdAccess.canInvite(owner)` is the only
caller. Paid seats, if they ever come, are an edit to that matrix entry.

- A person is in at most one household as a partner (a partial unique index on the active `partnerId`).
- An owner with active partners cannot join someone else's household.
- Anyone else may join. Their own member profiles and plans wait, unused, until they leave.

**Dark launch.** Everything is behind the `householdSharing` feature flag. Old binaries keep working because:

- every change is additive (new procedures, optional inputs, optional response fields);
- a partner on an old binary sees the shared week through the same procedures;
- a single-account household is unaffected.

## Considered options

- **A `Household` table that owns plans and lists.** Rejected. Every plan, list, template and worker is keyed on
  `userId`, and shipped binaries read them through procedures that assume one person. Moving ownership would be a
  breaking data migration for a feature that is still behind a flag.
- **Copying the owner's plan into the partner's account and syncing it.** Rejected. That gives two copies of one
  week, and conflicts between them, which is the mistake ADR 0001 rejected for routines.
- **The partner as a second login to the owner's account.** Rejected by the owner: a partner's logs, weight and
  targets must stay private.

## Consequences

- Any new plan or list read for a partner must go through `householdAccess.scope`, or it will show the partner's
  dormant own plan. The router middleware and `plan-for-date.ts` are where that happens; a test pins the procedure
  list.
- A partner's portion does not adapt to their targets yet. Their day totals are honest, because they log their own
  portion, but the plan does not try to land them on target.
- The Sunday auto-plan worker skips partners, and the owner's setting decides the shared week.
