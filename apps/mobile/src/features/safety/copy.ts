// Safety copy (technical-plan.md §2.10 / T-00.6). Re-exports the shared
// `@chefer/utils` safety-copy module (T-02.2) — kept as one canonical source
// (Shared-first, CLAUDE.md Platform Parity) so web and mobile show the exact
// same sentence for every PAT-2 safety state (Checked, Conflict, Couldn't
// check, Filtered for, Label caveat). Copy never reads as a guarantee
// ("Safe", "allergen-free"…) — see
// docs/persona-study-2026-09/synthesis/03-ux-design-spec.md §2.2/§2.7.
// Scanned by the `chefer/no-forbidden-copy` ESLint rule (base.js), which
// also covers every other file under `features/safety/`.

export {
  SAFETY_COPY,
  type SafetyCopyKey,
  type CheckedRuleLike,
  checkedForLineText,
  checkedForChipText,
  checkedForChipA11yLabel,
  cantCheckLine,
  filteredForLineText,
  pickerFooterText,
  checkedForListHeaderText,
  tableSummaryLine,
  conflictConfirmTitle,
  conflictConfirmBody,
  checkLabelChipText,
  labelCaveatLineText,
  labelCaveatCompactText,
  reportSentSnackbarText,
  recognisedAddedText,
  recognisedDietSetText,
  recognisedModifierAddedText,
  recognisedDislikeAddedText,
  unrecognisedNoticeText,
  conditionNoticeText,
  migrationMappingText,
  migrationMappingUncheckedText,
  memberSummaryLine,
  allergiesAndDietForText,
} from '@chefer/utils';
