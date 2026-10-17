# Launch plan · Following and trainer coaching, on the same day

|           |                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------- |
| Status    | Ready once the phase-1 coaching PR and the simple-mode PR are merged and deployed                     |
| Decisions | PRD [trainer-coaching.md](./trainer-coaching.md) §7 step 4 (owner, 2026-10-17); D-4 (allowlist first) |
| Terms     | [GLOSSARY.md](../../GLOSSARY.md): Trainer, Client, Coaching, Invite, Coaching request                 |

Following and coaching launch **together**: Find a trainer, the Trainer badge and a trainer's private profile all
live on Following. Everything below is configuration on the production VM; no code change and no native build is
needed if the mobile changes went out over the air.

## 1. Before launch day

1. **Merge order.** The simple-mode PR first (it carries the progression guard coaching depends on, PRD §4.3 and
   companion §9), then the coaching PR. Both deploy the API, the web app and an OTA update on merge.
2. **Database.** Deploys run `prisma db push` and then `packages/database/prisma/ensure-indexes.sql`. Check that the
   two partial unique indexes exist on production:
   `coaching_links_one_active_trainer` and `coaching_requests_one_pending`.
3. **Legal (owner + counsel).** The privacy policy needs its "Coaching" section and the terms a trainer clause, live
   before the flags go beyond the allowlists. Bump `LEGAL_VERSIONS.privacy` with that change so everyone re-accepts.
   DPIA addendum: `docs/trainer-platform/dpia-addendum.md`. Following's legal items (`docs/friends/implementation-plan.md`
   §14) are part of the same launch.
4. **Store metadata (Following's checklist).** In App Store Connect set "User-generated content shared with other users"
   to **Yes**, paste the review notes for report and block, and do the same in the Play content questionnaire. These go
   with the next store submission; no new binary is needed for either feature.
5. **Internal check.** With the flags still off, put the owner's and test accounts on the allowlists:
   - `FRIENDS_ALLOWLIST` = user ids (or `*`);
   - `COACHING_ALLOWLIST` and `TRAINER_ALLOWLIST` = e-mail addresses.
     Then walk the flows on web and on a phone: turn on Trainer tools (a private Following profile appears), find the
     trainer by name from a second account that has Following off, ask to coach, accept, edit the routine and see the
     "updated your routine" card, end coaching from the trainer side, turn trainer tools off.

## 2. Launch day

Run on the VM with `infrastructure/scripts/env.sh` (it keeps a backup and never prints values):

```bash
./infrastructure/scripts/env.sh set FEATURE_FLAGS "mobileShellV2,onboardingV4,friends,coaching"
```

```bash
./infrastructure/scripts/env.sh set FRIENDS_ALLOWLIST "*"
```

```bash
./infrastructure/scripts/env.sh set COACHING_ALLOWLIST "*"
```

```bash
./infrastructure/scripts/env.sh set TRAINER_ALLOWLIST "ana@example.com,mihai@example.com"
```

```bash
./infrastructure/scripts/env.sh apply
```

Keep whatever flags are already in `FEATURE_FLAGS` (check with `env.sh keys` / the current value first); the line
above assumes today's production value `mobileShellV2,onboardingV4`. The `friends` and `coaching` flags alone already
turn both features on for everyone; the `*` allowlists say the same thing and keep the features on for everyone if a
flag is later removed by mistake. Clients need no allowlist: any user can accept an invite or send a request to a
listed trainer.

`TRAINER_ALLOWLIST` lists the first trainers (D-4). Removing an address later **ends that trainer's coaching** (every
client keeps their routine and gets a notice), on their next request or by the daily sweep. An empty or unset list
never ends anything.

## 3. After launch

- **Watch** (PRD §8): invites accepted / sent, requests accepted / sent, clients with a workout within 7 days of
  joining, trainer edits per client per month. WP-13 events: invite sent / accepted, request sent / accepted, trainer
  edit, client workout, coaching ended + reason.
- **Moderation:** Following's weekly `moderation.weekly` log line covers trainer names and gym lines too (they go
  through the same word filter).
- **Open trainer sign-up** (PRD §7 step 5, owner's call, no code): once the first trainers have used it for a few weeks
  without blocking issues, set `TRAINER_ALLOWLIST` to `*`. The trainer screens then show "Chefer does not verify
  trainers' credentials" next to the badge (already in the copy deck).

## 4. Rollback

Remove `coaching` (and, if needed, `friends`) from `FEATURE_FLAGS` and set the allowlists back to empty, then
`env.sh apply`. Every coaching procedure answers `NOT_FOUND` and the apps hide the entry points; no data is deleted
and no schema rollback is ever needed. Emptying `TRAINER_ALLOWLIST` is not a rollback: it only stops new trainers (the
sweep ignores an empty list on purpose, so nobody's coaching ends). Pause coaching with the flag instead.
