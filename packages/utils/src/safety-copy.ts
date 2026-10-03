// Safety copy (technical-plan.md §2.10 / T-00.6, UX-01/UX-02 §Copy tables).
// The one place every PAT-2 safety state's user-facing sentence lives —
// mobile (`features/safety/copy.ts` re-exports this module) and web import
// it directly, so the wording is identical on both platforms (Shared-first,
// CLAUDE.md Platform Parity). Copy never reads as a guarantee ("Safe",
// "allergen-free", "guaranteed", "suitable for"…) — see
// docs/persona-study-2026-09/synthesis/03-ux-design-spec.md §2.7. Scanned by
// the `chefer/no-forbidden-copy` ESLint rule and the belt-and-braces test in
// `copy-lint.test.ts` (static SAFETY_COPY strings only — the builder
// functions below are still scanned by the ESLint rule itself, which walks
// every string literal and template in this file regardless).

import { recogniseSafetyTerm } from './safety-recognise';

// ─── Static copy (scanned by copy-lint.test.ts) ────────────────────────────────

export const SAFETY_COPY_KEYS = [
  'weekCardTitle',
  'sheetEyebrow',
  'sheetTitle',
  'sheetHowHeading',
  'sheetHowBody',
  'sheetAction',
  'sheetCantCheckLabel',
  'discoverHeaderLine',
  'whatWeCheckLink',
  'migrationTitle',
  'migrationBody',
  'migrationLooksRight',
  'migrationChange',
  'reportTitle',
  'reportOptionCantEat',
  'reportOptionLabelWrong',
  'reportOptionSomethingElse',
  'reportNoteLabel',
  'reportSend',
  'reportCancel',
  'conflictConfirmAddAnyway',
  'conflictConfirmChooseAnother',
  'vegetarianReadBack',
  'vegetarianNoEggsReadBack',
  'veganReadBack',
  'pescatarianReadBack',
  'glutenFreeCoeliacReadBack',
  'eggFreeReadBack',
  'veganDairyFreeHint',
  'readBackTitle',
  'readBackEmpty',
  'unrecognisedKeepNote',
  'unrecognisedRemove',
  'conditionChooseGoal',
  'conditionOk',
  'excludeLabelDependentLabel',
  'somethingElsePlaceholder',
] as const;
export type SafetyCopyKey = (typeof SAFETY_COPY_KEYS)[number];

export const SAFETY_COPY: Record<SafetyCopyKey, string> = {
  weekCardTitle: 'Checked for your table',
  sheetEyebrow: 'WHAT WE CHECK',
  sheetTitle: 'Checked for your table',
  sheetHowHeading: 'How we check',
  sheetHowBody:
    'We read every ingredient and the recipe name before a meal reaches your plan, your swaps, the AI Chef or your list. We don’t know how packaged foods were made, so always read the label of anything you buy — especially for allergies.',
  sheetAction: 'Edit allergies & diets',
  sheetCantCheckLabel: 'Can’t check',
  discoverHeaderLine: 'Showing recipes that fit your table',
  whatWeCheckLink: 'What we check',
  migrationTitle: 'Check we understood you',
  migrationBody: 'We’ve made allergies easier to check. Here’s how we read what you typed:',
  migrationLooksRight: 'Looks right',
  migrationChange: 'Change',
  reportTitle: 'Report a safety problem',
  reportOptionCantEat: 'It contains something we can’t eat',
  reportOptionLabelWrong: 'A label is wrong (e.g. “vegetarian”)',
  reportOptionSomethingElse: 'Something else',
  reportNoteLabel: 'What did you notice? (optional)',
  reportSend: 'Send report',
  reportCancel: 'Cancel',
  conflictConfirmAddAnyway: 'Add anyway',
  conflictConfirmChooseAnother: 'Choose another',
  vegetarianReadBack: 'Vegetarian: no meat, fish or seafood. Eggs, milk and cheese are fine.',
  vegetarianNoEggsReadBack:
    'Vegetarian, no eggs: no meat, fish, seafood or eggs. Milk and cheese are fine.',
  veganReadBack: 'Vegan: nothing from animals — no meat, fish, eggs, dairy or honey.',
  pescatarianReadBack: 'Pescatarian: fish and seafood, but no meat.',
  glutenFreeCoeliacReadBack:
    'Gluten-free (coeliac): no wheat, barley, rye, spelt, semolina, malt or regular oats, and nothing made from them. Stock, curry powder and soy sauce only when labelled gluten-free.',
  eggFreeReadBack:
    'Egg-free: no eggs, and nothing made with them, like mayonnaise, meringue or fresh egg pasta.',
  veganDairyFreeHint: 'Vegan already excludes dairy',
  readBackTitle: 'We’ll keep out',
  readBackEmpty: 'No allergies selected.',
  unrecognisedKeepNote: 'Keep as a note',
  unrecognisedRemove: 'Remove',
  conditionChooseGoal: 'Choose a goal',
  conditionOk: 'OK',
  excludeLabelDependentLabel: 'Leave out recipes that need a certified gluten-free product',
  // UX-ACC-06: an example the checker really understands ("aubergine" was not one).
  somethingElsePlaceholder: 'e.g. walnuts or coeliac',
} as const;

// ─── Dynamic builders (interpolate data, never a bare guarantee word) ──────────

export interface CheckedRuleLike {
  label: string;
  who: string;
}

/** `Checked for tree nuts (Luca) · fish (Ana) · vegetarian (you)`. */
export function checkedForLineText(checks: readonly CheckedRuleLike[]): string {
  const rules = checks.map((c) => `${c.label} (${c.who})`).join(' · ');
  return `Checked for ${rules}`;
}

/**
 * `3 checks passed` — the compact card/row chip. It used to read `Checked for
 * 3`, which people took for a head count (UX-PLAN-12); the spelled-out rules
 * stay in the chip's a11y label and the "Checked for …" line.
 */
export function checkedForChipText(count: number): string {
  return `${count} check${count === 1 ? '' : 's'} passed`;
}

/** `Checked for tree nuts, fish and vegetarian` — the chip's a11y label. */
export function checkedForChipA11yLabel(labels: readonly string[]): string {
  if (labels.length === 0) return 'Checked for your table';
  if (labels.length === 1) return `Checked for ${labels[0]}`;
  return `Checked for ${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/**
 * UX-REC-01: a pass that rests on the recipe's stored diet TAG alone (nothing
 * in its ingredients could verify the diet) is never a "Checked" claim. The
 * API lists those in `taggedOnly` (a subset of `checked`, which keeps its
 * meaning for older apps); split them here so every surface agrees.
 */
export function splitCheckedByVerification<T extends CheckedRuleLike>(checks: {
  checked: readonly T[];
  taggedOnly?: readonly CheckedRuleLike[] | undefined;
}): { verified: T[]; taggedOnly: T[] } {
  const tagged = new Set((checks.taggedOnly ?? []).map((t) => `${t.label}|${t.who}`));
  const verified: T[] = [];
  const taggedOnly: T[] = [];
  for (const c of checks.checked) {
    (tagged.has(`${c.label}|${c.who}`) ? taggedOnly : verified).push(c);
  }
  return { verified, taggedOnly };
}

/** The rule labels a recipe really passed (tag-only passes left out) — for the compact chips. */
export function verifiedLabels(
  checks:
    | { checked: readonly CheckedRuleLike[]; taggedOnly?: readonly CheckedRuleLike[] | undefined }
    | null
    | undefined,
): string[] {
  return checks ? splitCheckedByVerification(checks).verified.map((c) => c.label) : [];
}

/** `Tagged paleo (not verified)` — the honest line for a tag-only pass. */
export function taggedOnlyLineText(checks: readonly CheckedRuleLike[]): string {
  const labels = checks.map((c) => c.label.toLowerCase());
  const list =
    labels.length <= 1
      ? (labels[0] ?? '')
      : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
  return `Tagged ${list} (not verified)`;
}

export interface ConflictLike {
  label: string;
  /** Present on `safetyChecks.conflictDetails` (newer API); absent from older responses. */
  kind?: 'allergy' | 'diet' | 'dislike' | undefined;
  ingredients?: readonly string[] | undefined;
  reason?: string | undefined;
}

/** True when a stored rule label is a diet ("Paleo", "Gluten-free") rather than an allergen. */
function isDietConflict(conflict: ConflictLike): boolean {
  if (conflict.kind) return conflict.kind === 'diet';
  const recognised = recogniseSafetyTerm(conflict.label);
  return recognised.kind === 'diet' || recognised.kind === 'condition';
}

/**
 * UX-PLAN-06: what a conflict says. A diet reads as what the dish ISN'T
 * ("Not paleo: contains quinoa"), never "Contains Paleo"; an allergen reads
 * as what it contains ("Contains peanut"). Names the offending ingredients
 * (first three) or the failed limit when the API sent them.
 */
export function conflictText(conflict: ConflictLike): string {
  const ingredients = (conflict.ingredients ?? []).filter((i) => i.trim().length > 0);
  const named = ingredients.slice(0, 3).join(', ');
  if (isDietConflict(conflict)) {
    const head = `Not ${conflict.label.toLowerCase()}`;
    if (named) return `${head}: contains ${named}`;
    if (conflict.reason) return `${head}: ${conflict.reason}`;
    return head;
  }
  const head = `Contains ${conflict.label.toLowerCase()}`;
  return named && named.toLowerCase() !== conflict.label.toLowerCase() ? `${head}: ${named}` : head;
}

/**
 * The same for the API's older `allergenWarnings` strings, which already read
 * "non-paleo" for a diet and "peanut" for an allergen ("gluten" for gluten-free).
 */
export function warningText(warning: string): string {
  const diet = /^non-(.+)$/i.exec(warning.trim());
  return diet?.[1] ? `Not ${diet[1].toLowerCase()}` : `Contains ${warning.trim().toLowerCase()}`;
}

/**
 * The headline for a recipe's conflicts: the API's per-rule details when it
 * sent them ("Not paleo: contains quinoa"), else the plain `allergenWarnings`
 * strings. Dislikes are soft preferences and never headline a warning.
 */
export function conflictHeadline(
  warnings: readonly string[],
  details?: readonly ConflictLike[] | null,
): string {
  const hard = (details ?? []).filter((d) => d.kind !== 'dislike');
  return hard.length > 0 ? hard.map(conflictText).join(' · ') : warningsHeadline(warnings);
}

/** The banner headline for a list of `allergenWarnings` ("Not paleo, not vegetarian · Contains peanut"). */
export function warningsHeadline(warnings: readonly string[]): string {
  const not = warnings.filter((w) => /^non-/i.test(w.trim())).map((w) => warningText(w));
  const contains = warnings.filter((w) => !/^non-/i.test(w.trim()));
  const parts: string[] = [];
  if (not.length > 0) {
    // "Not paleo, vegetarian": one "Not" for the list reads better than many.
    parts.push(`Not ${not.map((n) => n.replace(/^Not /, '')).join(' or ')}`);
  }
  if (contains.length > 0) parts.push(`Contains ${contains.map((c) => c.trim()).join(', ')}`);
  return parts.join(' · ');
}

/** `Can’t check: “low sugar”`. */
export function cantCheckLine(term: string): string {
  return `Can’t check: “${term}”`;
}

/** `Filtered for vegan + gluten-free · 14 hidden`. */
export function filteredForLineText(filters: string, hiddenCount: number): string {
  return `Filtered for ${filters} · ${hiddenCount} hidden`;
}

/** `{n} recipes hidden because they don’t fit your table`. */
export function pickerFooterText(hiddenCount: number): string {
  const recipes = hiddenCount === 1 ? 'recipe' : 'recipes';
  return `${hiddenCount} ${recipes} hidden because they don’t fit your table`;
}

/** `Checked for your table · 87 items` — shopping-list header. */
export function checkedForListHeaderText(itemCount: number): string {
  return `Checked for your table · ${itemCount} items`;
}

/** `4 at the table · we’ll check for tree nuts (Luca) and fish (Ana)`. */
export function tableSummaryLine(peopleCount: number, rules: readonly CheckedRuleLike[]): string {
  if (rules.length === 0) {
    return `${peopleCount} at the table`;
  }
  const parts = rules.map((r) => `${r.label} (${r.who})`);
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${peopleCount} at the table · we’ll check for ${list}`;
}

/** `Contains {allergen}`. */
export function conflictConfirmTitle(allergen: string): string {
  return `Contains ${allergen}`;
}

/** `{Name} is allergic to {allergen}. Add it to {day} anyway?`. */
export function conflictConfirmBody(name: string, allergen: string, day: string): string {
  return `${name} is allergic to ${allergen}. Add it to ${day} anyway?`;
}

/** `Check label: {allergen}` — shopping-list custom-line chip. */
export function checkLabelChipText(allergen: string): string {
  return `Check label: ${allergen}`;
}

/** `Check the label: certified GF {products}` — under the Checked line. */
export function labelCaveatLineText(products: readonly string[]): string {
  return `Check the label: certified GF ${products.join(' and ')}`;
}

/** `Buy certified gluten-free` — the ingredient/list-line inline form. */
export function labelCaveatCompactText(): string {
  return 'Buy certified gluten-free';
}

/** `Thanks. We’ve hidden {recipe} from your plans and will check it.` */
export function reportSentSnackbarText(recipeName: string): string {
  return `Thanks. We’ve hidden ${recipeName} from your plans and will check it.`;
}

/** `Added to Allergies: Tree nuts.` (recogniser outcome, allergy/dislike branch). */
export function recognisedAddedText(group: 'Allergies' | 'Won’t eat', label: string): string {
  return `Added to ${group}: ${label}.`;
}

/** `Set your diet to Vegetarian, no eggs.` (recogniser outcome, diet branch). */
export function recognisedDietSetText(label: string): string {
  return `Set your diet to ${label}.`;
}

/** `Added Egg-free to your diet.` (recogniser outcome, diet-modifier branch). */
export function recognisedModifierAddedText(label: string): string {
  return `Added ${label} to your diet.`;
}

/** `We’ll leave out recipes with aubergine (eggplant).` (dislike ingredient branch). */
export function recognisedDislikeAddedText(term: string): string {
  return `We’ll leave out recipes with ${term}.`;
}

/** `Chefer can’t check for “{term}” yet, so plans won’t change for it.` */
export function unrecognisedNoticeText(term: string): string {
  return `Chefer can’t check for “${term}” yet, so plans won’t change for it.`;
}

/**
 * T-22.1: a health condition is recognised but nothing is saved from it
 * (coeliac is the one exception, mapped to the gluten-free-coeliac diet
 * before this notice would ever show). Never medical advice — it only
 * points at the goal/preferences the app already has.
 */
export function conditionNoticeText(term: string): string {
  return `Chefer can’t check plans against “${term}”. Choose a goal that fits, and always check with your own doctor about what to eat.`;
}

/** `“tree nuts” → Tree nuts ✓` (migration card mapping row). */
export function migrationMappingText(from: string, to: string): string {
  return `“${from}” → ${to}`;
}

export const migrationMappingUncheckedText = '→ can’t check (note)';

/** `{portion} portion · allergic: {list} · {diet} · won’t eat: {list}` (member card). */
export function memberSummaryLine(parts: {
  portionLabel: string;
  allergies: readonly string[];
  diet?: string | undefined;
  dislikes: readonly string[];
}): string {
  const segments = [`${parts.portionLabel} portion`];
  if (parts.allergies.length > 0) segments.push(`allergic: ${parts.allergies.join(', ')}`);
  if (parts.diet) segments.push(parts.diet);
  if (parts.dislikes.length > 0) segments.push(`won’t eat: ${parts.dislikes.join(', ')}`);
  return segments.join(' · ');
}

/** `Allergies & diet for {name}`. */
export function allergiesAndDietForText(name: string): string {
  return `Allergies & diet for ${name}`;
}
