// Safety copy (technical-plan.md §2.10 / T-00.6). Empty scaffold: the L-SAFE
// lanes fill this in as they build the PAT-2 safety states (Checked,
// Conflict, Couldn't check, Filtered for, Label caveat) that live in this
// folder. Copy never reads as a guarantee ("Safe", "allergen-free"…) — see
// docs/persona-study-2026-09/synthesis/03-ux-design-spec.md §2.2/§2.7.
// Scanned by the `chefer/no-forbidden-copy` ESLint rule (base.js), which
// also covers every other file under `features/safety/`.

export type SafetyCopyKey = never;

export const SAFETY_COPY: Record<SafetyCopyKey, string> = {};
