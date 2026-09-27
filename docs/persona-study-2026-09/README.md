# Chefer Persona Study — September 2026 (mobile)

A customer-obsessed usability study of the Chefer **native mobile app**. Ten synthetic personas each
signed up from a fresh install and used the app over two sessions ("first run" and "the next
evening"). A researcher sweep and an exit interview followed. The findings were then turned into
a business strategy, a UX design spec and a technical implementation plan.
**Documents only: nothing has been implemented.**

Build under test: `master` @ `f8f7f74` · Expo dev client · local API with **mock AI** · iOS 26 simulators (iPhone 16e, 17,
17 Pro Max) + Pixel 8 emulator · 2026-09-26/27.

## Read in this order

| #   | Document                                                                 | What it is                                                                                                                                        | For                                             |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1   | [synthesis/01-research-synthesis.md](synthesis/01-research-synthesis.md) | Scoreboard, 54 insights (CI-xx) with evidence, JTBD, journey map, segments, bug list                                                              | Everyone. **Start with its executive summary.** |
| 2   | [synthesis/02-business-strategy.md](synthesis/02-business-strategy.md)   | Beachhead, positioning, competition, monetisation, opportunity backlog B-xx (Now/Next/Later/Don't), metrics, validation plan, **owner decisions** | Owner / PO                                      |
| 3   | [synthesis/03-ux-design-spec.md](synthesis/03-ux-design-spec.md)         | Design principles, patterns, one spec per item (UX-xx = B-xx) with copy, states and acceptance criteria; agent packaging                          | Designer / implementation agents                |
| 4   | [synthesis/04-technical-plan.md](synthesis/04-technical-plan.md)         | Tasks T-xx.n with real file paths, procedures, schema, tests, docs, OTA vs rebuild; wave plan; file ownership                                     | Implementation agents                           |
| —   | [synthesis/00-market-research.md](synthesis/00-market-research.md)       | Competitive and market dossier (73 sources)                                                                                                       | Background for 2                                |

Traceability: `moment (P04-M13) → insight (CI-10) → opportunity (B-01) → UX spec (UX-01) → tasks (T-01.n)`.

## Raw material

- [personas.md](personas.md): the 10 personas, their goals and sweep lists
- [BRIEF.md](BRIEF.md): the session protocol every persona agent followed
- [sessions/](sessions/): one file per persona (timeline, goal scorecards, moment log, researcher sweep, exit interview)
- `screenshots/PXX/`: ~1,270 screenshots of evidence (~500 MB, **not meant for git**, see below)
- [tools/](tools/): `drive.sh` + `ui.mjs` (simulator/emulator driver: Maestro for iOS, adb for Android), `prepare.sh` (environment preflight + device prep), `monitor.sh` (progress/stall watcher)
- `scripts/PXX/`: the Maestro flows the agents wrote while driving
- [synthesis/PIPELINE.md](synthesis/PIPELINE.md): the stage briefs for the four synthesis documents

## Next steps

- **Implementing the fixes:** [waves/README.md](waves/README.md) has one compact kickoff brief per wave (W0–W4)
  and the prompt to paste into a fresh Claude Code session for each wave.
- **Measuring whether it worked:** [RERUN.md](RERUN.md) covers a quick check after each wave, and a full re-run with
  a before/after comparison against this baseline.

## Caveats

- **Synthetic users.** An LLM method-acted each persona on the real app. Findings are strong hypotheses; counts
  (n/10) show how many _designed segments_ hit something, not a population percentage. The validation plan is in
  doc 1 §8 and doc 2.
- **Mock AI.** AI outputs (plans, prices, estimates, chat) were canned. AI flows were judged on flow, framing and
  trust cues only; content and prices need re-checking with real providers.
- **Free-beta upgrade.** "Upgrade" cost nothing, so 8 of 10 upgraded. Conversion signals are about _what_ they
  upgraded for, not _whether_ they'd pay.
- **Same calendar day.** "Next evening" sessions couldn't move the clock, so streaks, weekly progression and
  reminders are marked untestable.
- **Load.** Parts of round 1 ran with the host overloaded; the Android emulator froze at times during P01. Those
  moments are logged as environment issues, not product findings.
