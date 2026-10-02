# Operating rules for every work package (WP)

Every orchestrator session reads this file first, then its `WP-xx-*.md`, then `CLAUDE.md`. Where the two disagree, this
file and the WP doc override general habits, and `CLAUDE.md` overrides both.

All docs are on master. Read them **from your WP worktree** (cut from `origin/master`):

- Backlog: `docs/backlog-2026-10/`
- Audit: `docs/mobile-ux-audit-2026-10/README.md` (and `evidence/`)
- Product research: `docs/product/user-needs-research-2026-10.md`, `docs/product/nice-to-have.md`
- Tester feedback from 2026-10-02: [`feedback-2026-10-02.md`](./feedback-2026-10-02.md)
- Persona-study specs are **not** on master. Read them with
  `git show origin/docs/persona-study-2026-09:docs/persona-study-2026-09/synthesis/<file>`
  (`04-technical-plan.md`, `06-cardio-research.md`).

**Live coordination file** (outside every repo, shared by all sessions):
`/Users/danpop/work/git-projects/chefer-backlog-status.md`. It holds the WP status board, the Android-emulator lock, the
API-level claims and a running log. Read it before you start. Update it when you start a WP, claim or release the emulator,
claim an API level, open a PR or stop. The README's status table on master is only a snapshot.

Lane agents get **absolute paths (inside their worktree) and line ranges, never "read the whole doc"**.

---

## 1. Roles

| Role             | Model                                                                  | Does                                                                                                                                                     | Never                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Orchestrator** | Opus 5.5 (the session you paste the prompt into)                       | Plans lanes, spawns and briefs lane agents, reviews every diff, integrates, runs the full test ladder and device verification, writes docs, opens the PR | Writes large features itself while lanes sit idle; merges the PR                                                           |
| **Lane agent**   | Sonnet 5.5 (`Agent` with `model: "sonnet"`, `run_in_background: true`) | Implements one lane in its own worktree: code + unit/contract tests + lint/typecheck for the packages it touched; commits on its lane branch             | Pushes, opens PRs, starts emulators or simulators, runs dev servers on shared ports, edits files outside its **Owns** list |

- **At most 3 lane agents at a time.** Four overloaded the 32 GB Mac in earlier runs.
- **At most 2 orchestrator sessions on the machine at once.** Check the live coordination file for what is running
  before you start.
- Each lane brief contains:
  - the one-line tasks;
  - the **Owns** list (files and folders it may change) and the **Read-only** list;
  - pointers (absolute path plus line range) into the audit or spec;
  - the tests it must add;
  - the exact commands it must run before reporting;
  - the instruction "commit on `<lane-branch>`, do not push, report the commit SHA, the files changed and the test
    output".
- Lane agents run in the background. Don't poll them: you'll be notified when they finish. While they run, review
  finished lanes or prepare the integration.
- When a lane comes back, the orchestrator reviews the diff against the WP's acceptance criteria before merging it into
  the integration branch. Send it back (`SendMessage` to the same agent) rather than patching large gaps yourself.

## 2. Setup (orchestrator, before any lane starts)

`NN` is the two-digit WP number. Example: WP-05 → `05`.

1. **Worktree.**
   - Run `git -C /Users/danpop/work/git-projects/chefer fetch origin`.
   - Then `git -C /Users/danpop/work/git-projects/chefer worktree add ../chefer-wpNN -b <branch> <base>`, using the
     branch named in the WP doc.
   - `<base>` is `origin/master` when every dependency of the WP is merged. **If a dependency's PR is still open, stack on
     it:** use that WP's branch as `<base>` (merge several open dependencies into your branch if needed). Say "Stacked on
     #N; merge #N first" at the top of your PR body. Before opening the PR, merge `origin/master` into your branch again.
     The repo merges with merge commits, so stacked PRs collapse cleanly once the base merges.
   - Never touch the main checkout (`/Users/danpop/work/git-projects/chefer`). It holds the owner's uncommitted work.
2. **Lane worktrees.**
   - Path: `../chefer-wpNN-<lane>`. Branch: `<branch>-<lane>`, cut from the WP branch after setup.
   - Lanes merge back into the WP branch, which is the integration branch.
3. **Install.** Run `pnpm install --frozen-lockfile` in each worktree.
4. **Database.** Each WP gets its own clone, and lane agents share it:
   - Clone: `docker exec chefer-postgres createdb -U postgres -T chefer_dev chefer_wpNN`.
   - If `chefer_dev` has open connections, the clone fails. Then use
     `docker exec chefer-postgres sh -c "createdb -U postgres chefer_wpNN && pg_dump -U postgres chefer_dev | psql -q -U postgres chefer_wpNN"`.
   - Write a gitignored `apps/api/.env` in the WP worktree with `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/chefer_wpNN`.
   - Schema changes: `pnpm db:migrate` against **your clone only**. Never run `db push` or `migrate` against `chefer_dev`.
5. **Ports.** These never collide with the main checkout (3000/3001/3011/8081) or with another WP:
   - API on `32NN`;
   - web on `33NN`;
   - Metro on `81NN`.
   - Add these as **worktree-local, uncommitted** configurations in the WP worktree's `.claude/launch.json`:
     - `wpNN-api`: `pnpm --filter @chefer/api dev` with `PORT=32NN AI_MOCK_ENABLED=true AI_MOCK_DELAY_MS=1500 RATE_LIMIT_MAX=3000`
     - `wpNN-web`: `pnpm --filter @chefer/web dev -p 33NN`, pointing at the API on `32NN`
     - `wpNN-metro`: `EXPO_PUBLIC_API_URL=http://localhost:32NN … expo start --dev-client --port 81NN`
   - Copy the env shape from the committed `api-mock` / `metro-study` entries.
   - Start servers with `preview_start`, never with Bash.
6. **AI.** Always use `AI_MOCK_ENABLED=true`. Never make real AI calls, and never set real provider keys in a worktree.
7. **Accounts.**
   - Use the seed accounts from `CLAUDE.md`, or throwaway `wpNN-<n>@chefer.dev` accounts in your clone.
   - Never sign in to production.

## 3. Engineering rules

These come from `CLAUDE.md`, and the WP docs assume them.

- **Layers:** Router → Service → Repository → Prisma. Business logic goes in `apps/api/src/application/`. Shared Zod,
  types and pure logic go in `@chefer/types` / `@chefer/utils`, never duplicated per app.
- **Platform parity:** apply the same change on web wherever the feature exists there. Otherwise add a row to
  `mobile_parity_backlog.md`, or a "web parity" note in the PR if the change is mobile-only by nature (for example, Android
  BACK).
- **Backward-compatible API.** Binaries **1.0.1** are in the field.
  - Add new optional input fields and new procedures. Never rename, remove or tighten.
  - New enum values, or data that old clients would mis-render, must be gated by the client API level:
    - the header is `x-chefer-api-level`, currently `'4'` (`apps/mobile/src/lib/trpc-links.ts:36`);
    - gating examples: `apps/api/src/application/gym/client-level.ts`;
    - the level table is in `infrastructure.md`;
    - if your WP needs a new level, claim the next free number in the live coordination file first, because two WPs
      must not both claim level 6. A bundle that sends level N must implement every level below it, so if WPs merge out
      of order, renumber before merge.
- **OTA-safe only.**
  - Add no native modules and change no native config (`app.json` plugins, permissions, `eas.json`, `userInterfaceStyle`).
  - `react-native-keyboard-controller` and `react-native-gesture-handler` are **not installed**. Use RN core instead
    (`Keyboard` events, `KeyboardAvoidingView`, `PanResponder`) plus Reanimated, which is installed.
  - If a fix truly needs native code, ship the JS part, stop, and add a row to
    [OWNER-ACTIONS.md](./OWNER-ACTIONS.md#native-batch).
  - `pnpm --filter @chefer/mobile bundle:check` must pass, and the runtime fingerprint must be unchanged.
- **Motion, accessibility and responsive rules** in `CLAUDE.md` apply to every UI change. That includes the 44 pt targets,
  labels, `min-w-0` and the MO-xx pattern IDs.
- **Errors:** never show raw Zod or JSON to users. Use `userFacingErrorMessage`, or the default error path added by WP-02
  once it has merged.

## 4. Tests: every fix gets a regression test

| Change                                                                     | Test                                                                                            |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Pure logic (`packages/utils`, `packages/types`)                            | Co-located `*.test.ts` (Vitest)                                                                 |
| API service or router                                                      | Co-located `apps/api/src/**/*.test.ts` (Vitest, mocked repositories)                            |
| API contract a mobile client relies on (new or changed procedure or field) | `apps/mobile/tests/contract/*.contract.test.ts` (`pnpm mobile:contract`, needs your API and DB) |
| Mobile UI behaviour                                                        | `apps/mobile/tests/unit/*.test.tsx` (Jest + RNTL)                                               |
| Mobile end-to-end flow worth guarding                                      | `apps/mobile/e2e/*.flow.yaml` (Maestro, local only)                                             |
| Web UI                                                                     | Existing Vitest/RTL, plus Playwright where a flow changes                                       |

## 5. Verification ladder (orchestrator, on the integrated branch)

Run every level. **Never mark a level passed that you could not run.** Say so in the PR instead.

0. `pnpm typecheck && pnpm lint && pnpm format:check`
1. `pnpm test`
2. API without a DB: `cd apps/api && DATABASE_URL=postgresql://nobody:x@127.0.0.1:1/none npx vitest run`
3. `pnpm mobile:contract` against `wpNN-api`
4. `pnpm --filter @chefer/mobile bundle:check`, then confirm the fingerprint is unchanged. Compare
   `npx expo-updates runtimeversion:resolve --platform ios|android` with `apps/mobile/release-builds/runtime-*.txt`.
5. Web layout changes: `cd tests && pnpm exec playwright test --project=mobile`
6. **Devices** (user-facing changes):
   - Run the iOS simulator **and** one Android emulator (`Pixel_8`), with the dev client on `wpNN-metro`.
   - **Only one Android emulator may run on the machine.** Claim it in the live coordination file (`Emulator held by`)
     and run `adb devices` first. If another WP holds it, do iOS first and come back. Shut it down and release the claim
     when you're done.
   - Use one simulator per WP. Prefer an existing one, and shut it down at the end.
   - Prefer text tools (accessibility tree, Maestro) over screenshots. Take screenshots only as proof.
   - Known harness gotchas:
     - the simulator MCP `text` action injects hardware keys, which hides the soft keyboard; paste with
       `xcrun simctl pbcopy` instead;
     - emoji show as "?" on iOS 26.3 simulators, which is not a bug;
     - snackbar Undo taps late in the 8 s window miss, which is harness latency.
7. Each WP's acceptance criteria, with evidence: DB rows, API log lines and screenshots in the PR.

## 6. Documentation in the same PR

- The `CLAUDE.md` doc table: `infrastructure.md` sections for procedures, schema, env, levels; `business_flow.md` for flow
  changes; `mobile_parity_backlog.md`.
- **Audit fix status.**
  - The audit is on master at `docs/mobile-ux-audit-2026-10/`. WP-01 adds a **"Fix status"** table at the top: one row
    per finding ID, with status (fixed / partially fixed / deferred / open), WP, PR and reason.
  - Later WPs edit **only their own rows**, so merges stay trivial.
  - If the table doesn't exist on your base yet, list the statuses in your PR body instead.
- Research items (Gym 1 to 4, Food 1 to 5): mark the status in `docs/product/user-needs-research-2026-10.md`'s Summary
  tables.

## 7. Delivery

- Commits use Conventional Commits. Scopes: `web`, `api`, `mobile`, `ui`, `ui-mobile`, `tokens`, `database`, `types`,
  `utils`, `config`, `docker`, `ci`, `deps`, `release`, `docs`.
- Open **one PR to master** per WP. Never merge it: merging deploys production and publishes an OTA update. The PR body
  contains:
  - a summary;
  - the fix-status rows;
  - the ladder results;
  - device evidence;
  - API-level / compatibility notes;
  - owner actions;
  - the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- After opening the PR, use the ccd_pr tools: `get_status`, then `bind_pr` if needed. Offer Auto-fix for CI. Don't poll CI
  yourself.
- Don't run EAS builds or store submissions.
- Clean up after the PR is open:
  - remove the lane worktrees and branches (keep the WP worktree until merge);
  - stop dev servers, the emulator and the simulator;
  - list the `chefer_wpNN` DB for dropping after merge.

## 8. Final steps

1. Update the **live coordination file**: the WP row's state, PR link, API level claimed, and a log line.
2. Final summary to the owner:
   - what was fixed and how each fix was verified;
   - what was deferred, and why;
   - owner actions;
   - cleanup still pending.

## 9. Token hygiene

- Read slices (line ranges), not whole files, for anything over about 300 lines.
- Prefer text over screenshots.
- No sleep loops or polling.
- Don't re-read files you just edited.
- Give lane agents exactly what they need and nothing more.
