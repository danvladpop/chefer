// Safety copy (technical-plan.md §2.10 / T-00.6). Empty scaffold: the L-SAFE
// lanes fill this in as they build each PAT-2 safety state (Checked,
// Conflict, Couldn't check, Filtered for, Label caveat). Every user-facing
// safety sentence should live here rather than inline in a component, so the
// `chefer/no-forbidden-copy` ESLint rule and the belt-and-braces test in
// `copy-lint.test.ts` both have one place to scan — safety copy never reads
// as a guarantee ("Safe", "allergen-free"…): see the copy rules in
// docs/persona-study-2026-09/synthesis/03-ux-design-spec.md §2.7.

export type SafetyCopyKey = never;

export const SAFETY_COPY: Record<SafetyCopyKey, string> = {};
