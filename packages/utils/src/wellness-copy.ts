// Wellness copy (technical-plan.md §2.10 / T-00.6). Filled in by the lanes
// that build streak/progress/weight/guardrail surfaces. Shame-free by rule
// (`Checked, not safe`; `2 of 4 this week`, never `You missed 2` or a
// `0-week streak` — see the copy rules table in
// docs/persona-study-2026-09/synthesis/03-ux-design-spec.md §2.7). Scanned by
// `chefer/no-forbidden-copy` and the belt-and-braces test in
// `copy-lint.test.ts`. None of these lines may say `suitable for diabetics`,
// `medical`, `treat`, `cure` or `prevent` (UX-22 AC6).
//
// UX-22 (T-22.2, T-22.3, L-ENTRY): the AI Chef guardrail lines and the
// Settings "About" disclaimer. The goal/metrics disclaimer strings are added
// here by L-TRACK, which owns `goal-step.tsx`/`metrics-step.tsx` this wave.
//
// Advisory disclaimers (2026-10-02, owner request): `gymAdvisoryDisclaimer`
// sits on gym setup and gym settings, `mealPlanAdvisoryDisclaimer` under the
// meal plan and in the "What we check" sheet — every platform. Chefer only
// suggests; the user's own judgement decides. Terms §"Health and nutrition"
// carries the long form.

// T-22.3 (rev 2, §5.13): `goalMetricsDisclaimer` is shown under the goal
// picker and body-metrics form on every platform (onboarding AND the
// Settings › Preferences "Goal & body" card) — a calculator, not a doctor.
export type WellnessCopyKey =
  | 'chatHeaderSubtitle'
  | 'chatEmptyStateDisclaimer'
  | 'chatHealthTopicFooter'
  | 'chatSafetyTopicFooter'
  | 'aboutMedicalDisclaimer'
  | 'goalMetricsDisclaimer'
  | 'gymAdvisoryDisclaimer'
  | 'mealPlanAdvisoryDisclaimer';

export const WELLNESS_COPY: Record<WellnessCopyKey, string> = {
  chatHeaderSubtitle: 'AI · answers can be wrong',
  chatEmptyStateDisclaimer:
    "The chef gives cooking and nutrition ideas — it's not a doctor. Not medical advice; check with your GP for health questions.",
  chatHealthTopicFooter: 'Not medical advice — check with your GP.',
  chatSafetyTopicFooter: 'AI can be wrong about allergens — always check the label.',
  aboutMedicalDisclaimer:
    "Chefer suggests meals and workouts as general guidance only. It isn't a medical device and doesn't give medical advice, or certified dietary or coaching advice. Suggestions, including AI ones, can be wrong, even about allergens, so use your own judgement before you follow them.",
  goalMetricsDisclaimer:
    'General estimates only, based on common formulas — for guidance about your own health, talk to a qualified professional.',
  gymAdvisoryDisclaimer:
    'Workouts and weight targets are general suggestions, not certified coaching. Warm up, use a weight you can control and stop if something hurts. Check with a doctor first if you have an injury or health condition.',
  mealPlanAdvisoryDisclaimer:
    'Meals are suggestions, and our checks and the AI can make mistakes, even about allergens. Always read the ingredients and labels yourself and use your own judgement.',
};
