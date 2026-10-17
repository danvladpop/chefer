# The chefer loop: how we work with agents

This is a working pattern for chefer built from two installed skill packs: `mattpocock-skills` and `pstack`. It doesn't replace [`docs/backlog-2026-10/00-operating-rules.md`](../backlog-2026-10/00-operating-rules.md), which stays the rulebook for running a WP (worktrees, DB clones, lanes, the test ladder, the PR template). It adds the steps around that: getting aligned before code, proving behaviour, reviewing against the spec, and learning afterwards.

Why each skill was chosen or rejected: [skills-evaluation.md](./skills-evaluation.md).

## The loop

```
  ALIGN ──▶ SHAPE ──▶ BUILD ──▶ PROVE ──▶ REVIEW ──▶ (owner merges) ──▶ LEARN
    ▲                                                                    │
    └───────────────── lessons become lint / CI / CLAUDE.md ◀────────────┘
```

| Step          | When                                                                        | Type this                                                           | What you get                                                                                                                 |
| ------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **0. Orient** | Coming back to a session                                                    | `/pstack:ketchup`                                                   | A catch-up of under 150 words, each action item with a recommendation                                                        |
|               | Starting on a topic that spans several sessions                             | `/pstack:recall <topic>, include worktree session folders`          | A current-state brief built from transcripts, git and PRs                                                                    |
| **1. Align**  | Any feature, flow change or design note                                     | `/mattpocock-skills:grill-with-docs <idea or WP path>`              | Rounds of numbered questions with recommended answers. Terms land in `GLOSSARY.md`, hard-to-reverse decisions in `docs/adr/` |
|               | Product or UX call where nothing should be written to docs                  | `/mattpocock-skills:grill-me <idea>`                                | The same interview, with no files written                                                                                    |
|               | Small task or pasted tester feedback                                        | `/pstack:in-your-own-words <task>`                                  | The agent plays back the goal and the problem before touching code                                                           |
|               | "How should it look or behave?"                                             | `/mattpocock-skills:prototype <question>`                           | Throwaway variants or a clickable logic demo to react to                                                                     |
| **2. Shape**  | After grilling                                                              | Ask: "write the decisions into the WP doc" (the existing WP format) | A WP doc with acceptance criteria and test seams. Seams written down here mean lane agents don't block waiting for you       |
| **3. Build**  | Implementation                                                              | The usual WP kickoff from `00-operating-rules.md`                   | Orchestrator + Sonnet lanes. Lanes use `tdd` at the seams named in the WP doc                                                |
|               | A bug                                                                       | `/mattpocock-skills:diagnosing-bugs <symptom>`                      | A failing reproduction first, then hypotheses, a regression test, the fix, cleanup                                           |
| **4. Prove**  | Before declaring done                                                       | `/verify-chefer <feature>` (_to be generated, see next actions_)    | The feature driven on web, iOS and Android, with screenshots as evidence                                                     |
|               | The change touches a tRPC procedure, a shared Zod schema or Prisma          | `/pstack:blast-radius <change>`                                     | Proof, by running code, that shipped mobile binaries still work                                                              |
| **5. Review** | Before opening the PR                                                       | Built-in `/code-review`                                             | Bugs in the diff                                                                                                             |
|               |                                                                             | `/mattpocock-skills:code-review origin/master — spec: <WP doc>`     | "Did we build what the WP asked, following CLAUDE.md?" (scope creep, missing criteria, parity)                               |
|               | Merging a big PR you want to understand                                     | `/pstack:teach <PR>` or `/pstack:how <subsystem>`                   | A plain explanation, built up with diagrams                                                                                  |
| **6. Learn**  | End of every WP, or when you've corrected an agent twice for the same thing | `/mattpocock-skills:retro`, then `/pstack:correct`                  | The repeated mistake becomes a lint rule, CI check or test, not more prose                                                   |

### Situational

| Situation                                                               | Type this                                                                                                      |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Human-only setup (secrets, dashboards, env flips in OWNER-ACTIONS)      | `/mattpocock-skills:wizard <task>`: a script you run yourself, so secrets never pass through the agent         |
| A question only an outside expert (dietitian, coach, tester) can answer | `/mattpocock-skills:to-questionnaire <who> <what>`                                                             |
| Parity audit across many features                                       | `/pstack:swarm one worker per feature in mobile_parity_backlog.md …`                                           |
| Overnight or unattended wave you'll review later                        | `/pstack:show-me-your-work`, committing the decision TSV in the PR                                             |
| Context is getting long                                                 | The desktop app's built-in handoff to a new session, or `/mattpocock-skills:handoff` for a written handoff doc |
| "That didn't land"                                                      | `/mattpocock-skills:wait-what` or `/pstack:bro`                                                                |
| Editing CLAUDE.md, a skill or an agent-facing doc                       | Mention `writing-for-agents` in the request                                                                    |
| Architecture health check (monthly)                                     | `/mattpocock-skills:improve-codebase-architecture <hot zone>`                                                  |
| App Store copy, PR prose                                                | `/pstack:unslop`                                                                                               |

## Guardrails

- **Never use** these pstack playbooks: **Shipping**, **Autopilot-full**, **Autopilot-stack** and **Babysit**. They merge PRs or poll CI, and the owner merges while Auto-fix watches CI.
- **Never run** these skills:
  - `setup-pre-commit`, which would clobber husky;
  - `git-guardrails-claude-code`, which blocks legitimate pushes;
  - `no-comments`, which strips the required MO-xx comments;
  - `make-bot-ui`, which uses `sudo` installs;
  - `setup-pstack`, which does nothing here.
- **Refactor and principle skills apply to internal code only.** "Delete the legacy API in the same wave" never applies to a tRPC procedure that a shipped binary calls.
- **pstack review panels lose their second model.** They are built for Opus and Grok together; here every seat is Claude. Treat "consensus across models" as one model's view, or put `sonnet` on one seat.
- **Owner-only skills can't be fired by agents.** Most of these skills only run when you type them; an orchestrator or lane agent can't trigger them. If a brief needs one, tell the agent to read that skill's `SKILL.md` and follow it.
- **Transcript-mining skills miss worktree sessions by default.** `recall`, `automate-me` and `show-me-your-work` read only one folder in `~/.claude/projects/`. Tell them to include the `…chefer--claude-worktrees-*` folders.

## Next actions

| #   | Priority | Action                                                                                                                                                                                                                                                                          | Who                              | Done when                                                                             |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | **P0**   | Commit `.claude/settings.json`, this folder and the CLAUDE.md section to master in a small PR. Today the plugins are enabled only in the main checkout, and WP worktrees are cut from `origin/master`, so they don't see them.                                                  | Agent opens the PR, owner merges | A new worktree session lists `mattpocock-skills:*`                                    |
| 2   | **P0**   | Trial run: take the next real item through the loop, starting with `/mattpocock-skills:grill-with-docs` (suggested: the WP-15–17 design note or WP-12).                                                                                                                         | Owner types it, agent drives     | The decisions are in the WP doc, and the owner rates the interview                    |
| 3   | **P0**   | Generate `/verify-chefer` with `/pstack:create-verification-skill`. Cover Playwright, Maestro on the iOS simulator and Pixel_8, `mobile-preflight.sh` and `launch.json`, with a feature map for the meal plan, shopping list, gym workout and onboarding V4.                    | One session in a worktree        | `.claude/skills/verify-chefer/` proven once end to end                                |
| 4   | **P1**   | Run `/pstack:correct` to turn CLAUDE.md's prose-only rules into lint or CI checks: `h-screen`/`100vh`, `transition-all`, hand-rolled `fixed inset-0` overlays, text below `text-xs`, and a web-only UI change without a parity-backlog entry.                                   | One session, one PR              | Each rule fails on a real past mistake, and the rule → enforcer table is in CLAUDE.md |
| 5   | **P1**   | Seed `GLOSSARY.md` with `domain-modeling` for the food and gym vocabulary: Plan, Week, Day targets, rebalance, refit, swap, replace, workout, routine day, check-in.                                                                                                            | Owner and agent (grilling)       | GLOSSARY.md on master                                                                 |
| 6   | **P1**   | Fold the best review ideas into `00-operating-rules.md`: Merge Danger (`pr`) and Blast Radius (poteto) in the §7 PR body; a blast-radius step in §5 for API changes; Matt's `code-review` Spec pass before the PR; standing orders and TIMEBOX/FORBIDDEN/REPORT in lane briefs. | Agent drafts, owner approves     | Operating rules updated                                                               |
| 7   | **P1**   | Port the best poteto playbooks into chefer-owned skills in `.claude/skills/`. Each should use chefer's surfaces, transcript paths and DB clones.                                                                                                                                | One session                      | Skills present and tried once                                                         |
| 8   | **P2**   | After #7, disable the pstack plugin and keep only the skills used above. It adds about 55 slash-menu entries, and its merge and CI playbooks are a footgun.                                                                                                                     | Agent                            | `claude plugin disable pstack@cursor-plugins`, or copy the kept skills locally        |
| 9   | **P2**   | Run `/mattpocock-skills:wizard` on the open OWNER-ACTIONS items: the PostHog key, the domain switch, the HEALTH_CONSENT_ENFORCE flip.                                                                                                                                           | Owner runs the generated scripts | OWNER-ACTIONS list shorter                                                            |
| 10  | **P3**   | After 2–3 weeks on this loop, run `/pstack:automate-me`, including worktree folders, to draft a personal `dan-mode` skill. Re-run this evaluation as both packs evolve.                                                                                                         | Agent                            | `dan-mode` skill drafted                                                              |
| 11  | **P3**   | Optional: enforce Router → Service → Repository layering in `apps/api` with dependency-cruiser (the idea from `setup-ts-deep-modules`); `wayfinder` for the evidence-gated WP-15–17; `loop-me` for the weekly ingredient-catalog review.                                        | —                                | —                                                                                     |

These are the ports for #7:

| Skill                              | Source                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `chefer-bug-fix`                   | poteto's Bug-fix playbook plus Matt's diagnosing-bugs                                                  |
| `chefer-pause` and `chefer-pickup` | poteto's Pause-safely and Session-pickup playbooks                                                     |
| `chefer-worktree-cleanup`          | poteto's Worktree-cleanup playbook, with the Claude transcript paths fixed and `chefer_wpNN` DBs added |
