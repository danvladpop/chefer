# WP-12 · Gym polish

|                   |                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| Wave / priority   | 3 / P2 (during beta, OTA)                                                                                           |
| Size              | M–L: about 1 day                                                                                                    |
| Branch / worktree | `fix/gym-polish` / `../chefer-wp12`                                                                                 |
| DB / ports        | `chefer_wp12` / 3212, 3312, 8112                                                                                    |
| Depends on        | Wave 1 merged (WP-01..04; gym S1s, errors and outbox). Phase A: runs **before** WP-05/WP-18, which then build on it |
| Can run alongside | WP-09, WP-10 or WP-11                                                                                               |

Every item has a full block in the audit (§4 or §5) with its fix.

## Items

**Timers and notifications:**

- **GYM-09:** the rest countdown is shown on the Resume and Today cards. The notification is scheduled at rest start.
  TalkBack announces only start, 10 s and end.
- **GYM-10:** late Android rest alert.
  - JS part: schedule at rest start, which may be enough. Measure the delay on the emulator.
  - Exact alarms (`USE_EXACT_ALARM`) are native, so add them to the native batch.

**Today, routines and stats:**

- GYM-12: no "missed" sessions before setup; pro-rate the first week.
- GYM-13: "See September" opens the monthly recap.
- GYM-14: template preview, plus "Create" vs "Create and switch".
- GYM-15: archiving the active routine.
- GYM-16: pause copy, Intl dates, a start choice.
- GYM-18: editing a rep range keeps the known weight; no PR on a first session.
- GYM-20: the Food/Gym pill is derived from the route group.
- GYM-27: `formatLoad` with `loadType`.
- GYM-28: the target sheet reuses the summary Adjust sheet.
- GYM-29: the "All history" segment, week strip labels, `useIsOnline()`.
- GYM-30: setup scrolls to the top on step change.
- GYM-31: one `nextSession()` selector.
- GYM-32: the edited weekday in the "Next time changed" copy.
- GYM-33: stats polish.
- GYM-34: gym polish (Intl dates, an Archived section, keys, the rest bar padding).

GYM-17 and 19 are in WP-11. GYM-21 to 26 are in WP-02 and WP-03.

## Lanes

| Lane                            | Items                                        |
| ------------------------------- | -------------------------------------------- |
| A, timers + Today               | GYM-09, 10 (JS), 12, 13, 20, 31              |
| B, routines + settings          | GYM-14, 15, 16, 18, 28, 30, 32               |
| C, stats + history + web parity | GYM-27, 29, 33, 34, plus the web equivalents |

## Kickoff prompt

```
You are the orchestrator for WP-12 "Gym polish". Read, in order:
1. docs/backlog-2026-10/00-operating-rules.md
2. docs/backlog-2026-10/WP-12-gym-polish.md
3. CLAUDE.md
Then execute it end to end under the operating rules. Read only each item's block in the audit.
- Sonnet lanes, at most 3 at a time; OTA-safe; a regression test per fix; the full ladder;
- iOS plus ONE Android emulator (measure the GYM-10 delay);
- ONE PR to master, never merged.
Finish by updating the live coordination file and the audit Fix status rows, then give the final summary.
```
