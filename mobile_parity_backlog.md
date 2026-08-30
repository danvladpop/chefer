# Mobile Parity Backlog

> **Purpose:** the ledger of user-facing changes that landed on web while the affected
> feature did **not yet exist** on mobile (`apps/mobile`). Governed by the
> **Platform Parity** section of [`CLAUDE.md`](./CLAUDE.md). Porting agents executing
> [`mobile_native_plan.md`](./mobile_native_plan.md) Wave 2 **must** check this file for
> their feature and mark entries done in the same PR that ports them.
>
> **Baseline:** entries are only needed for changes made **after 2026-08-30** (the date
> `mobile_native_plan.md` was created). Anything older is already covered by the plan's
> rule "port from the current web source" — the web code itself is the spec.

## How to add an entry (for the agent making a web-only change)

Append a row to the table below in the **same PR** as the web change. Keep it one line;
the porting agent will read the web source for details — the entry's job is to make sure
the change is _noticed_, and to capture anything **not discoverable from the web source**
(e.g. "also applies to the mobile-only scan flow", "API added optional field X for this").

## How to drain an entry (for the porting agent)

When porting the feature (or when the feature already exists on mobile and you're
back-filling), implement the change on mobile, verify per `mobile_native_plan.md` §4, and
change the entry's Status to `done (<commit>)` in the same PR. Do not delete rows.

## Ledger

| Date | Feature (web dir) | Change (one line)  | Web commit/PR | Non-obvious notes for mobile | Status |
| ---- | ----------------- | ------------------ | ------------- | ---------------------------- | ------ |
| —    | —                 | _(no entries yet)_ | —             | —                            | —      |
