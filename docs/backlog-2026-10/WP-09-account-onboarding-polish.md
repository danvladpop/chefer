# WP-09 · Account, settings and onboarding polish

|                   |                                                                             |
| ----------------- | --------------------------------------------------------------------------- |
| Wave / priority   | 3 / P2 (during beta, OTA)                                                   |
| Size              | M–L: about 1 day                                                            |
| Branch / worktree | `fix/account-onboarding-polish` / `../chefer-wp09`                          |
| DB / ports        | `chefer_wp09` / 3209, 3309, 8109                                            |
| Depends on        | Wave 1 merged. Check the audit Fix status table for anything already closed |
| Can run alongside | WP-07, WP-10 or WP-11                                                       |

Every item has a full block in the audit, §4 (S2) or §5 (S3). The fix is in its **Fix** line, and the code pointers are
in its "Where", if present. Lanes get the ID plus the audit path, and they read only that block.

## Items

**Settings and navigation:**

- **ACC-04:** the Settings hub has no back control, and rows land on the wrong screens. Add `?section=` anchors that scroll
  to and highlight the card, plus Notifications, Legal and Account rows, and a "Set up training" CTA for food-only users.
- **ACC-19:** legal links open inconsistently. Use in-app `/legal/*` everywhere. More → Sign out gets a confirm.
  Household and Following get distinct icons.
- **ACC-24:** the premium sheet copy says "below" for a list that is above.
- **ACC-13:** the post-upgrade CTA is always Regenerate. Make it source-aware: Snap opens the picker; no plan gives "Plan
  my week".

**Auth:**

- **ACC-07:** an email with a trailing space is rejected. Use `z.string().trim()` in the shared schema and the API
  inputs, and clear the server error on change.
- **ACC-08 (JS part):** use `textContentType="newPassword"`, with the opt-out only in E2E builds, and clear the password
  after a failed sign-in. The `webcredentials` associated domain goes to the native batch.
- **ACC-09:** the reset link dead end. Render the missing-token card on UNAUTHORIZED, swap the title on success, and
  reset the login form on focus.
- **ACC-11:** delete account: the error sits below the fold; add a one-time "Your account and data have been deleted".
- **ACC-14:** auth forms jump as errors appear and clear.
- **ACC-15:** "account already exists" is a dead end. Add Sign in and Reset links.
- **ACC-16:** a stale "Passwords do not match".
- **ACC-18:** double submit from the keyboard.

**Data:**

- **ACC-06:** add the EU-14 allergens: mustard, celery, lupin, sulphites, molluscs, split from crustaceans.
  - Change `packages/types/src/safety-taxonomy.ts` (`ALLERGY_ENTRIES` :37) and the recogniser.
  - Adding taxonomy values is **additive**: check that old clients render unknown allergen keys (ladder 2c).
  - Update the placeholder.
- **ACC-21:** saving Goal & body leaves Targets stale. Invalidate the targets and the dashboard.
- **ACC-22:** "export ready" shows even when the share sheet was cancelled.
- **ACC-23:** the budget field accepts "abc" and silently caps at 2000. Add inline validation and show the cap.

**Onboarding:**

- **ONB-04:** units are reset on re-mount. Apply the region default once, in the initial state.
- **ONB-05:** imperial height as ft + in, and metric-only Preferences. Shared plausibility bounds live in
  `@chefer/types`: height 100–250 cm, weight 20–400 kg.
- **ONB-10:** nits: "1 days", the "Run or ride?" copy, token colours, Ionicons instead of emoji, a lone "Sun" chip.

Skip ONB-02: it's an owner flag. ONB-03, 06, 07 are WP-03; ONB-08, 09 are WP-01 and WP-02.

## Lanes

| Lane                       | Items                                                      |
| -------------------------- | ---------------------------------------------------------- |
| A, settings + nav          | ACC-04, 13, 19, 24                                         |
| B, auth + data             | ACC-06, 07, 08, 09, 11, 14, 15, 16, 18, 21, 22, 23         |
| C, onboarding + web parity | ONB-04, 05, 10, plus web equivalents of ACC-06, 07, ONB-05 |

## Acceptance

- Each item has a regression test or Maestro step.
- ACC-06: a "mustard" allergy is recognised and checked in plans. A safety-suite test covers it.
- The Fix status rows are updated.

## Kickoff prompt

```
You are the orchestrator for WP-09 "Account + onboarding polish". Read, in order:
1. docs/backlog-2026-10/00-operating-rules.md
2. docs/backlog-2026-10/WP-09-account-onboarding-polish.md
3. CLAUDE.md
Then execute it end to end under the operating rules. For each item, read only its block in
docs/mobile-ux-audit-2026-10/README.md, or the committed copy on master.
- Sonnet lanes, at most 3 at a time; OTA-safe; additive API; a regression test per fix; the full ladder;
- iOS plus ONE Android emulator;
- ONE PR to master, never merged.
Finish by updating the live coordination file and the audit Fix status rows, then give the final summary.
```
