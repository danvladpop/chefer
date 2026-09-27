# Re-running the persona study (before/after evaluation)

The 2026-09 study is the **baseline**. A re-run replays the same 10 personas with the same goals,
protocol and scoring on a newer build, then compares against the baseline: did the scores move, and
which of the 54 insights (CI-01…CI-54) are fixed?

Two modes:

| Mode            | What runs                                                                                 | Use it when                                                                          | Rough cost             |
| --------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------- |
| **Quick check** | 2–3 agents walk each CI's repro steps on the new build, plus the wave acceptance criteria | After each wave, to confirm fixes landed                                             | ~0.5–1M tokens, ~1–2 h |
| **Full re-run** | All 10 persona sessions + the comparison report                                           | After waves 0–3 (or before a public launch), to measure whether the app got _better_ | ~3.5–4M tokens, ~6–7 h |

The baseline itself cost ~5–6M tokens: 10 sessions ≈ 3M, plus market research and four strategy documents.
A re-run skips the market research and the strategy docs, and writes one comparison report instead.

**Comparability rules.** Use the same model for persona agents as the baseline (Opus) in a full re-run: a different
model judges differently, and the scores would drift for reasons that have nothing to do with the app. Keep the
same personas, goals, lanes and mock AI. LLM personas vary between runs, so treat a SUS change under ~10 points, or a
tomorrow/NPS change under ~1.5, as noise. Trust CI status changes (fixed/unfixed), because those have evidence.

---

## 1. Set up (≈ 10 minutes)

1. **New study folder:** `docs/persona-study-<YYYY-MM>/` with `sessions/`, `screenshots/`, `scripts/`, `synthesis/`.
   Copy `BRIEF.md` and `personas.md` from this folder, then edit `BRIEF.md`:
   - the build line (`master @ <new sha>`, `git rev-parse --short HEAD`) and the date;
   - the accounts: use `pXX.<name>.<yyyymm>@study.chefer.dev` (the baseline accounts still exist in `chefer_dev`);
   - the output paths, which point at the new folder.
     Keep the tools where they are (`docs/persona-study-2026-09/tools/`), since the driver is shared.
2. **Servers.** Start both with the Browser preview tool, never Bash: `preview_start {name: "api-mock"}` (API on :3011,
   mock AI, relaxed rate limit) and `preview_start {name: "metro-study"}` (Metro :8081, app pointed at :3011).
   Leave the normal `api` on :3001 alone.
3. **Devices.** `docs/persona-study-2026-09/tools/prepare.sh L1 L3 L4` boots the lanes, installs the cached dev
   client, resets appearance and text size, and reverses the Android ports. It prints READY or what to fix.
   - If the native config changed since the builds were cached (it warns), rebuild with
     `pnpm --filter @chefer/mobile ios` / `android`, then `prepare.sh --cache-builds`.
   - The iOS-simulator MCP tool needs per-device approval from the owner, so it can't run unattended. The driver
     uses Maestro (iOS) and adb (Android) instead.
4. **Keep the Mac awake:** `nohup caffeinate -dims -t 36000 &` (and kill it when done).

## 2. Run the sessions

**Schedule: at most 3 persona agents at once.** Four at once overloaded the host (load ~50, 10 GB swap): every iOS
tap starts a JVM + xcodebuild, and the Android emulator froze. Start the next persona the moment a lane frees up,
and shut down simulators that are no longer needed (`xcrun simctl shutdown <udid>`).

| Persona     | Lane (keep as in baseline) | Notes                      |
| ----------- | -------------------------- | -------------------------- |
| P01 Andrei  | L4 Android                 |                            |
| P02 Maria   | L2 17 Pro Max              | dark mode                  |
| P03 Jake    | L1 16e                     |                            |
| P04 Elena   | L3 17                      |                            |
| P05 Priya   | L1 16e                     |                            |
| P06 Tom     | L2 17 Pro Max              | XXL text                   |
| P07 Ioana   | L4 Android                 | dark mode                  |
| P08 Daniela | L3 17                      |                            |
| P09 Chris   | L1 16e                     |                            |
| P10 Lena    | L3 17                      | ran on iOS in the baseline |

Suggested order, 3 at a time: (P01 L4, P03 L1, P04 L3) → (P07 L4, P05 L1, P08 L3) → (P02 L2, P09 L1, P10 L3) → P06 L2.
Only one of L1/L2 needs to be booted per round.

**Prompt per persona** (background agent, same model as the baseline). Replace `<…>`:

```
You are running one moderated usability session of the Chefer mobile app for a persona study.
Working directory: /Users/danpop/work/git-projects/chefer.

Read these first, fully, and follow them exactly:
- docs/persona-study-<YYYY-MM>/BRIEF.md (rules, environment, driver, output format)
- docs/persona-study-<YYYY-MM>/personas.md — your persona is **<PXX> — <Name>** (<device>, lane **<Lx>**)
- docs/persona-study-2026-09/tools/drive.sh header (driver commands)
- Quality reference: docs/persona-study-2026-09/sessions/P04-elena.md (don't copy findings)

Your lane is <Lx>. Never touch other lanes — other agents are driving them.
<dark mode / text size instructions if the persona has them; revert at the end>
Account: <pxx.name.yyyymm>@study.chefer.dev / Study@12345!
Output: docs/persona-study-<YYYY-MM>/sessions/<PXX>-<name>.md, screenshots in docs/persona-study-<YYYY-MM>/screenshots/<PXX>/.

Working habits: write the session file INCREMENTALLY (skeleton first, append every ~10 actions);
look at every screenshot before acting; iOS taps are slow, so batch predictable steps into Maestro flows;
if the emulator shows "app isn't responding", choose Wait and log it as environment;
do not modify source code, commit, or restart servers; only observed facts, each with screenshot evidence.
Do NOT read the baseline session for your persona — judge this build fresh.

Finish with the short reply described at the end of BRIEF.md.
```

Personas must **not** read their own baseline session: the comparison is only fair if they meet the app fresh.

**Monitoring:** run `docs/persona-study-2026-09/tools/monitor.sh docs/persona-study-<YYYY-MM>` as a Monitor
(30-minute max; re-arm it). Mark a finished persona with `touch docs/persona-study-<YYYY-MM>/sessions/.done-PXX`.

## 3. Compare → `synthesis/R-comparison.md`

One agent (Opus), after all sessions are in. Prompt:

```
You are a principal UX researcher. Compare the new persona study docs/persona-study-<YYYY-MM>/ against the
baseline docs/persona-study-2026-09/ (read the baseline's synthesis/01-research-synthesis.md for the scoreboard
and the CI catalogue; its sessions/ for detail) and write docs/persona-study-<YYYY-MM>/synthesis/R-comparison.md:

1. Executive verdict (≤ ½ page): is the app better, for whom, and what's still stopping people?
2. Scoreboard delta per persona and on average: SUS, tomorrow, NPS, goals done/total (baseline 34/80 = 43 %),
   moments by type and severity. Mark each delta as signal or noise (SUS < 10, tomorrow/NPS < 1.5 = noise).
3. CI status table, every CI-01…CI-54: Fixed / Improved / Unchanged / Regressed / Not re-tested, with new
   evidence (moment IDs + screenshots) and a one-line reason. List the Sev-4 CIs first.
4. Wave acceptance check: for the waves shipped since the baseline, which UX-xx acceptance criteria
   (docs/persona-study-2026-09/synthesis/03-ux-design-spec.md) are observably met in the sessions.
5. New issues not in the baseline, numbered N-01…, with the same fields as a CI. Include regressions
   introduced by the waves.
6. Delights kept or lost (the baseline's D1…D24).
7. Recommended next backlog changes, referring to B-xx IDs in the baseline's 02-business-strategy.md.
Verify root causes in source where it matters (read-only). Documents only: no code changes, no commits.
Separate observation from inference, and flag mock-AI artifacts. Write incrementally.
```

## 4. Quick check (after a single wave)

Skip the personas. One agent per 2–3 lanes, each with this prompt:

```
Using docs/persona-study-2026-09/tools/drive.sh on lane <Lx> (run `drive.sh <Lx> reset` first; account
qc.<yyyymmdd>.<n>@study.chefer.dev / Study@12345!), re-test these insights from
docs/persona-study-2026-09/synthesis/01-research-synthesis.md: <CI list, e.g. the ones the wave targets + all Sev-4>.
For each, follow its evidence/repro, and record Fixed / Improved / Unchanged / Regressed with a screenshot, in
docs/persona-study-2026-09/quick-checks/<yyyy-mm-dd>-<wave>.md. Also check the acceptance criteria of
<UX-xx list> from 03-ux-design-spec.md. Documents only.
```

## 5. Tear down

`preview_stop` both servers; shut down the simulators you booted (`xcrun simctl shutdown <udid>`); revert the
emulator (`adb shell cmd uimode night no`); kill `caffeinate`. The screenshots folder is large (~500 MB per full
run), so keep it out of git (compress it or keep it outside the repo) unless you decide otherwise.

## Lessons from the baseline run

- The dev-client first launch shows an Expo dev-menu intro; `drive.sh reset` dismisses it on both platforms.
- The iOS "Open in Chefer Dev?" system prompt appears on every deep-link launch; `reset`/`relaunch` handle it.
- Session agents take ~50–110 minutes each, and ~250–500 driver actions.
- Agents sometimes claim root causes that turn out to be wrong (e.g. "no PPL template": it was below the fold).
  The synthesis/comparison agent must verify them in the source before they count.
- Mock AI makes prices and plan contents canned: judge flows, not numbers.
- Same-day limitation: streaks, weekly progression and reminders can't be observed. Mark them untestable.
