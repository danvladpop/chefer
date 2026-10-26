# Kitchen progress is an append-only ledger that records for everyone and never takes XP back

Every Chef XP reward is one row in `ProgressEvent`, written once under an idempotency key
(`<KIND>:<sourceId>`, unique per user). Totals, the Flame and achievements are derived from the ledger. Rows are
never updated or deleted except by the account-deletion cascade, and XP is stored as awarded, so tuning the XP table
later never rewrites history.

We record for **every** user from deploy, whether or not the `gamification` flag shows them anything (owner decision
D1, 2026-10-22). Back-dating existing history uses the **same keys** as the live hooks, so it can run any number of
times and overlap with live events without paying twice.

XP, active days and levels are **never taken back** (D2): unlogging a meal or deleting a workout keeps what it
earned. Abuse is bounded by the keys, the five-meals-a-day limit and the daily soft cap, and XP buys nothing.

We rejected:

- **Counters on the user row**, which cannot be audited, explained as a receipt, or replayed for offline workouts
  that sync late.
- **Recording only while the flag is on**, which leaves a hole: cooks before the flag cannot be back-dated because the
  server never knew about them.
- **Revoking XP on delete**, which creates "you lost" moments the guardrails forbid.

## Consequences

- Any new reward needs a stable source id. A source that cannot provide one (a client-only action) needs a server
  record first, which is why cook mode gained `CookLog` and `progress.finishCook`.
- Rewards are server-authoritative. Clients only render DTOs, and the shared pure rules in `@chefer/utils/progress`
  keep both platforms showing the same numbers.
- The ledger grows by a handful of rows per active user per day. That is small, but a later archive or rollup must
  keep `totalXp` equal to the sum of the rows.
