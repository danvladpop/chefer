// Wellness copy (technical-plan.md §2.10 / T-00.6). Empty scaffold: filled in
// by the lanes that build streak/progress/weight surfaces. Shame-free by
// rule (`Checked, not safe`; `2 of 4 this week`, never `You missed 2` or a
// `0-week streak` — see the copy rules table in
// docs/persona-study-2026-09/synthesis/03-ux-design-spec.md §2.7). Scanned by
// `chefer/no-forbidden-copy` and the belt-and-braces test in
// `copy-lint.test.ts`.

// T-22.3 (rev 2, §5.13): the goal/metrics disclaimer, shown under the goal
// picker and body-metrics form on every platform (onboarding AND the
// Settings › Preferences "Goal & body" card) — a calculator, not a doctor.
// The About-line variant is L-ENTRY's key, added alongside this one.
export type WellnessCopyKey = 'goalMetricsDisclaimer';

export const WELLNESS_COPY: Record<WellnessCopyKey, string> = {
  goalMetricsDisclaimer:
    'General estimates only, based on common formulas — for guidance about your own health, talk to a qualified professional.',
};
