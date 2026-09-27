# Persona Study — synthesis pipeline (stage briefs)

Inputs: `../personas.md`, `../BRIEF.md`, `../sessions/P01…P10-*.md`, `../screenshots/`, and `00-market-research.md` (competitive dossier, for stage 2).
Every stage is **documents only**: no source-code changes, no commits. Read source code freely
(read-only) to ground claims. Each stage keeps IDs from the previous one, so every
recommendation traces back to observed evidence:

```
moment (P04-M07) → insight (CI-12) → business opportunity (B-05) → UX spec (UX-05) → tech tasks (T-05.1…)
```

Global conventions: British spelling is fine; link screenshots with relative paths; quote personas
sparingly and verbatim from the session files; always say how many of the 10 personas hit an issue.
**Caveat to carry through every doc:** these are synthetic users (LLM method-acting on the real app);
treat findings as strong hypotheses. Frequency counts are indicative, not statistical. The
docs must say what to validate with real users.

---

## Stage 1 — Research synthesis → `01-research-synthesis.md`

Role: principal UX researcher.

1. **Scoreboard:** one row per persona: device, tier start→end, goals done/total per session,
   SUS, tomorrow-score, NPS, the one-line verdict. Averages + distribution.
2. **Affinity map → insight catalogue `CI-xx`.** Cluster all moment-log rows (all 10 files) into
   insights. For each: title (a user-problem statement, not a solution), type(s), personas
   affected (n/10 + IDs), severity (max and mean), journey stage, evidence (moment IDs +
   2–3 screenshot links), 1–3 quotes, what we observed vs what we infer, a root-cause
   hypothesis (verify it in the source where you can: cite file:line), and confidence (H/M/L).
   Sort by impact = reach × severity. Keep bugs as their own insights when they block goals.
3. **Unmet jobs-to-be-done** (what people came for that the app doesn't do), with personas.
4. **Delights / strengths to protect.**
5. **Journey map** (discover → sign-up → onboarding → first value/"aha" → daily loop → return →
   pay): per stage, what works, where people stall, and churn risk (H/M/L), per segment
   (gym-only, food-only, both, household).
6. **Segment differences** (beginner vs expert, gym vs food, iOS vs Android, large text, dark mode).
7. **Tech bug list** (dedup of all researcher-note bugs + LogBox errors, with repro steps).
8. **Excluded / untestable:** mock-AI artifacts, dev-build artifacts, same-day limits, and what
   needs real-user validation.

## Stage 2 — Business & product strategy → `02-business-strategy.md`

Role: senior product owner + market researcher (consumer health/fitness/food apps).

1. Executive summary (one page): the three biggest reasons people would not use or would stop
   using Chefer, and the bet we recommend.
2. **Who Chefer is for:** segment attractiveness vs current fit (evidence from stage 1). Recommend
   the primary beachhead and secondary segments, and the positioning statement.
3. **Competitive landscape.** Use web search, cite sources and date-check prices: MyFitnessPal,
   MacroFactor, Cronometer, Yazio, Lose It!, Strong, Hevy, Fitbod, Mealime, Samsung Food (Whisk),
   Paprika, Eat This Much, Plan to Eat, and any relevant RO/EU players. What they win on, price
   points, and where Chefer can differentiate (food + training in one, household, zero waste, RO market…).
4. **JTBD ranking** and the activation ("aha") moment definition per segment, the habit loop,
   and the retention mechanics that fit Chefer.
5. **Monetisation:** what premium should contain based on observed willingness-to-pay, what must
   stay free (trust, safety), and paywall-moment recommendations. Mechanics only; real pricing is
   out of scope, but price anchors from competitors are useful.
6. **Opportunity backlog `B-xx`**, mapped to CI IDs. Per item: problem, the business outcome it
   moves (activation / retention / conversion / trust / referral), RICE (Reach = personas and
   segment size, Impact 0.25–3, Confidence %, Effort S/M/L/XL), and a bucket of
   **Now / Next / Later / Don't**. Include "stop doing" items (features to cut or hide).
7. **Success metrics & instrumentation:** a north-star metric, funnel metrics and the PostHog
   events to add, and the target for each Now item.
8. **Validation plan with real users** (what to test, how, sample sizes), plus risks
   (allergen safety liability, medical claims, GDPR/AI data, app-store policy).

## Stage 3 — UX/UI design spec → `03-ux-design-spec.md`

Role: principal product designer for native mobile (iOS HIG + Material aware), writing for
implementation agents.

- Start with **cross-cutting design principles and patterns** derived from the findings
  (e.g. jargon & copy system, empty states, onboarding architecture, feedback/undo,
  navigation model, trust & safety cues, accessibility at large text, dark mode, motion).
- Then **one spec per Now and Next B-item** (`UX-xx` = same number as B-xx), each with:
  the problem + evidence links; the user story; the proposed flow (step list or ASCII wireframes
  per screen state: default, empty, loading, error, offline, free vs premium); exact copy;
  the components (reuse `packages/ui-mobile` and `@chefer/tokens`, and name the existing
  component/screen files to change after reading `apps/mobile/app/**` and
  `apps/mobile/src/**`); interactions/motion; accessibility (labels, 44pt targets, Dynamic
  Type); analytics events; **testable acceptance criteria**; edge cases; the **web parity**
  note (the web counterpart if the feature exists on web — per CLAUDE.md "Platform Parity");
  and dependencies.
- Later-bucket items get a short paragraph each.
- Close with the **agent work packaging**: which UX items can be built in parallel (disjoint
  files), their order, and the size of each.

## Stage 4 — Technical implementation plan → `04-technical-plan.md`

Role: staff engineer who knows this monorepo (read `CLAUDE.md`, `infrastructure.md`,
`business_flow.md`, `mobile_native_plan.md`, `apps/mobile/CLAUDE.md`, and the relevant source).

- Architecture constraints restated briefly (layering, tRPC-only, Zod, shared-first in
  `@chefer/types`/`@chefer/utils`, **additive API only — never break shipped mobile binaries**,
  OTA vs native rebuild via the runtime fingerprint, docs-update table).
- **Per UX item → tasks `T-xx.n`**: real file paths to add/change; tRPC procedures (new/changed,
  input/output schema); Prisma schema changes + migration; shared types; mobile UI work; web
  parity work (or a `mobile_parity_backlog.md`-style ledger entry if the web feature does not
  exist); tests (unit/Jest, contract tests, Maestro flow, Playwright); which docs to update;
  feature flags; analytics; risk; effort (S/M/L); whether it ships over OTA or needs a native
  rebuild.
- Tech-debt/bug fixes from the stage-1 bug list as `T-BUG-n`.
- **Execution plan for agents:** waves (wave 0 contracts → parallel feature waves → integration
  → verification), file-ownership map to avoid merge conflicts, worktree/branch naming, the
  verification ladder per wave (typecheck → lint → Jest → contract → Maestro iOS + Pixel_8 →
  Playwright mobile sweep), and a definition of done per task.
- Open questions that need the owner's decision, collected in one list at the end.
