export { cn } from './cn';
export { formatQuantity, systemForWeightUnit, weightUnitForSystem, type UnitSystem } from './units';
export {
  EUR_EXCHANGE_RATES,
  EUR_EXCHANGE_RATES_AS_OF,
  currencySymbol,
  formatCurrencyAmount,
  formatMoney,
  fromEur,
  isConvertedCurrency,
  toDisplayCurrency,
  toEur,
  type FormatMoneyOptions,
} from './currency';
export {
  CM_PER_IN,
  EUROZONE_REGIONS,
  IMPERIAL_REGIONS,
  cmToIn,
  defaultsForRegion,
  detectRegion,
  inToCm,
  inferUnitsFromInput,
  regionFromLocale,
  type DisplayDefaults,
  type UnitInferenceInput,
  type UnitInferenceResult,
} from './locale';

export {
  formatDate,
  formatRelativeTime,
  formatRelativeTo,
  formatIso,
  formatForInput,
  daysBetween,
  hoursBetween,
  minutesBetween,
  isValidDate,
  getStartOfDay,
  getEndOfDay,
  addDaysToDate,
  addHoursToDate,
  isDateAfter,
  isDateBefore,
  isDateEqual,
  isPast,
  isFuture,
  localDateStr,
  type DateInput,
} from './date';

export {
  pick,
  omit,
  deepClone,
  isPlainObject,
  deepMerge,
  removeNullish,
  groupBy,
  keyBy,
  flattenObject,
} from './object';

export { isHealthTopic, isSafetyTopic } from './health-topic';

export {
  ACTIVITY_MULTIPLIERS,
  CALORIE_FLOOR_FEMALE,
  CALORIE_FLOOR_MALE,
  GOAL_ADJUSTMENTS,
  calorieFloor,
  computeBmrTdee,
  computeCalorieTarget,
  goalAdjustmentKcal,
  isDeficitBlockedForAge,
  isMinorAge,
  previewCalorieTarget,
} from './calorie-target';

export {
  invariant,
  assertDefined,
  assertString,
  assertNumber,
  assertBoolean,
  isDefined,
  assertNever,
  InvariantError,
  safeInvariant,
} from './assert';

// ─── Async Utilities ──────────────────────────────────────────────────────────

/**
 * Returns a promise that resolves after `ms` milliseconds.
 *
 * @example
 * await sleep(1000); // Wait 1 second
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries an async function up to `maxAttempts` times with exponential backoff.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    backoffFactor?: number;
    onError?: (error: unknown, attempt: number) => void;
  } = {},
): Promise<T> {
  const { maxAttempts = 3, delayMs = 100, backoffFactor = 2, onError } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      onError?.(error, attempt);

      if (attempt < maxAttempts) {
        await sleep(delayMs * Math.pow(backoffFactor, attempt - 1));
      }
    }
  }

  throw lastError;
}

// ─── String Utilities ─────────────────────────────────────────────────────────

/**
 * Converts a string to a URL-safe slug.
 *
 * @example
 * slugify('Hello World!') // 'hello-world'
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Capitalizes the first letter of a string.
 */
export function capitalize(str: string): string {
  if (str.length === 0) {
    return str;
  }
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Truncates a string to a maximum length, adding an ellipsis if truncated.
 */
export function truncate(str: string, maxLength: number, ellipsis = '...'): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - ellipsis.length) + ellipsis;
}

// ─── Number Utilities ─────────────────────────────────────────────────────────

/**
 * Clamps a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Generates a random integer between min and max (inclusive).
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Array Utilities ──────────────────────────────────────────────────────────

/**
 * Removes duplicate values from an array.
 */
export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/**
 * Chunks an array into subarrays of the given size.
 *
 * @example
 * chunk([1, 2, 3, 4, 5], 2) // [[1, 2], [3, 4], [5]]
 */
export function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Flattens a nested array one level deep.
 */
export function flatten<T>(arr: T[][]): T[] {
  return ([] as T[]).concat(...arr);
}

/**
 * Returns the last element of an array.
 */
export function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}

/**
 * Returns the first element of an array.
 */
export function first<T>(arr: T[]): T | undefined {
  return arr[0];
}

export {
  customEntryChipLabel,
  customEntryRows,
  customEntryTotals,
  type CustomEntryRow,
  type LoggedMealEntryLike,
} from './tracker';

export { portionsFor, tableBreakdown, type Portions, type PortionsInput } from './portions';
export { defaultCookServings, finishMealCopy, guessMealType, parseStepDuration } from './cook-mode';
export {
  buildPickerSections,
  filterReplaceCandidates,
  type FilterReplaceCandidatesOptions,
  type PickerSection,
  type ReplaceCandidateLike,
} from './recipe-picker';
export * from './gym';
export {
  BODY_WEIGHT_KG_MIN,
  BODY_WEIGHT_KG_MAX,
  BODY_WEIGHT_LB_MIN,
  BODY_WEIGHT_LB_MAX,
  bodyWeightInUnit,
  bodyWeightUnit,
  formatBodyWeight,
  formatWeightTrend,
  parseBodyWeight,
  parseBodyWeightKg,
  weightChangeTone,
  type WeightChangeTone,
  type WeightParseResult,
} from './weight';
export {
  KCAL_PER_G,
  INGREDIENT_GRAMS_MAX,
  MACRO_SANITY_TOLERANCE,
  QUICK_ADD_LIMITS,
  QUICK_ADD_MEAL_TYPES,
  checkMacroSanity,
  clampIngredientGrams,
  formatQuickAddGrams,
  maxIngredientGrams,
  parseQuickAdd,
  type MacroSanityResult,
  type QuickAddEntry,
  type QuickAddErrors,
  type QuickAddInput,
  type QuickAddMealType,
  type QuickAddParseResult,
} from './quick-add';
export {
  REBALANCE_UNDO_EXPIRY_MS,
  isPendingFresh,
  mergePendingRebalance,
  parsePendingRebalance,
  rebalanceBannerCopy,
  undoOperations,
  type PendingRebalance,
  type RebalanceResultLike,
  type RebalanceSwapLike,
} from './rebalance';
export { RATING_LABELS, composeNotesWithLikedBy, parseLikedBy, stripLikedBy } from './rating';
export { shoppingWindowLabel } from './shopping-window';
export {
  dayNutritionCaption,
  dayStatus,
  PLAN_STATUS_LABEL,
  planStatus,
  remainingPlannedKcal,
  type DayStatus,
  type DayStatusResult,
  type PlanStatus,
} from './day-nutrition';
export {
  BMI_ADJUSTED_WEIGHT_THRESHOLD,
  GOAL_WORDING,
  LIFTER_PROTEIN_G_PER_KG,
  LIFTER_PROTEIN_G_PER_KG_BY_GOAL,
  POST_WORKOUT_PROTEIN_G_PER_KG,
  TRAINING_DAY_KCAL,
  TRAINING_DAY_PROTEIN_G_PER_KG,
  adjustedProteinWeightKg,
  applyTrainingDayBonus,
  buildTrainingDayNutrition,
  goalWording,
  hasTrainingDayBump,
  isLifter,
  isRunKind,
  lifterProteinGPerKg,
  lifterProteinNote,
  postWorkoutProteinG,
  resolveTrainingDay,
  trainingDayBonus,
  trainingDayLine,
  trainingWeekdays,
  withLifterProtein,
  withLifterProteinDetailed,
  type ResolvedTrainingDay,
  type TrainingDayBonus,
} from './training-nutrition';
export {
  buildPlanTrainingDays,
  buildPremiumChanges,
  buildWeekGlance,
  joinDayNames,
  preRunNote,
  preRunSnackIdea,
  PRE_RUN_SNACK_IDEAS,
  trainingChipA11y,
  trainingDayHeaderCopy,
  trainingDaysChip,
  trainingExplainCopy,
  trainingGlyph,
  trainingKindLabel,
  weekdayLongName,
  weekdayShortName,
  type PremiumChangesResult,
  type TrainingDayHeaderCopy,
  type TrainingExplainCopy,
} from './plan-training';
export {
  choosePortions,
  formatPortion,
  isDayOnTarget,
  MIN_PROTEIN_GAP_G,
  PLAN_KCAL_BAND,
  PLAN_PORTION_STEPS,
  PROTEIN_SHORT_BAND,
  proteinGapG,
  scaleNutrition,
  slotPortion,
  sumPlanDay,
  type PortionMeal,
  type PortionOptions,
  type PortionPlan,
  type PortionTargets,
} from './meal-portion';
export {
  MEAL_ORDER,
  MEAL_WINDOW_END,
  isSlotEaten,
  matchLoggedToSlots,
  resolveTodayMeals,
  type LoggedMealRef,
  type PlannedMealSlot,
  type TodayMeals,
} from './today';
export { pastWeeks, type PlanWeekLike } from './my-weeks';
export {
  PANTRY_CONFIRM_MIN_AGE_DAYS,
  pantryConfirmWeekKey,
  pantryItemsToConfirm,
  type PantryItemAgeLike,
} from './pantry-confirm';
export {
  householdGhostSample,
  householdPortionSum,
  onboardingProgress,
  onboardingSteps,
  perPortionCost,
  type HouseholdGhostKind,
  type HouseholdGhostSample,
  type OnboardingProgress,
  type OnboardingStepKey,
} from './household';
export {
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_NEAR_LIMIT,
  feedbackCounter,
  type FeedbackCounter,
  type FeedbackCounterTone,
} from './feedback';
export {
  ACTIVATION_STEP_COPY,
  SOURCE_FEATURE_PRIORITY,
  activationIntro,
  activationStepKeys,
  type ActivationStepCopy,
  type ActivationStepKey,
} from './premium-activation';
export {
  aiConsentBackupLine,
  aiConsentIntro,
  aiConsentRequiredFor,
  aiConsentFeatureForPath,
  aiConsentToggleOn,
  aiDisclosureProviders,
  formatAiProviderNames,
  handleAiConsentRequiredError,
  isAiConsentRequiredError,
  needsAiDataConsent,
  notifyAiConsentRequired,
  onAiConsentRequired,
  toAiProviderDisclosure,
  type AiConsentSubject,
} from './ai-consent';
export {
  finalizeVideoDraft,
  isSupportedVideoUrl,
  parseQuantityInput,
  parseVideoUrl,
  videoDraftProblems,
  videoDraftToForm,
  videoFormToDraft,
  type VideoDraftFormValues,
  type VideoDraftLike,
} from './video-import';

// ─── Wave-0 shared contracts (T-00.5, T-00.7) ─────────────────────────────────
export {
  glossaryDefinition,
  GLOSSARY,
  type GlossaryDefinition,
  type GlossaryTermId,
} from './glossary';
export { defaultWeekOffset, getWeekStartDate, weekStartForDate } from './week-default';
export { defaultMealSlot } from './meal-slot';
export {
  canShowNudge,
  INITIAL_NUDGE_CAP_STATE,
  markNudgeDismissed,
  markNudgeShown,
  NUDGE_DISMISS_COOLDOWN_MS,
  type NudgeCapState,
} from './nudge-cap';
export {
  effectiveJobs,
  legacyIntentForJobs,
  TRACK_INFERENCE_MIN_DAYS,
  type EffectiveJobsInput,
} from './effective-jobs';
export { priceRange, formatPriceRange, PRICE_RANGE_BAND, type PriceRange } from './price-range';
export { pickProteinSnacks, PROTEIN_SNACKS, takeSnacks, type ProteinSnack } from './protein-snacks';
export { homeCardOrder, HOME_CARD_IDS, type HomeCardId } from './home-cards';
export { landingFor, type LandingInput, type LandingSurface } from './landing';
export {
  explainCarbsFatSentence,
  explainKcalSentence,
  explainProteinSentence,
  missingMetricsSentence,
  ownTargetSentence,
} from './explain-targets';
export {
  isValidPlanShape,
  planButtonLabel,
  planShapeSummary,
  resolvePlanDays,
  resolvePlanSlots,
} from './plan-shape';
export { recogniseSafetyTerm, type SafetyRecogniseOutcome } from './safety-recognise';
export { applySafetyTerm, keepSafetyTermAsNote, type SafetyTermOutcome } from './safety-add-term';
export {
  classifySafetyValue,
  serialiseSafetyPickerValue,
  BASE_DIET_IDS,
  DIET_MODIFIER_IDS,
  type SafetyPickerValue,
  type ClassifiedSafetyValue,
  type BaseDietId,
  type DietModifierId,
} from './safety-classify';
export {
  dinnersFromPlan,
  formatDinnersForSharing,
  formatListForSharing,
  SHARE_DINNERS_HEADING,
  shareableItems,
  shareListFooter,
  shareListSubtitle,
  shareListTitle,
  SHARE_LIST_FOOTER_TEMPLATE,
  type ShareDinner,
  type ShareListItem,
  type ShareListOptions,
  type ShareListScope,
} from './share-list';

export {
  SAFETY_COPY,
  type SafetyCopyKey,
  type CheckedRuleLike,
  checkedForLineText,
  checkedForChipText,
  checkedForChipA11yLabel,
  cantCheckLine,
  conflictHeadline,
  conflictText,
  splitCheckedByVerification,
  taggedOnlyLineText,
  verifiedLabels,
  warningText,
  warningsHeadline,
  type ConflictLike,
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
} from './safety-copy';
export { WELLNESS_COPY, type WellnessCopyKey } from './wellness-copy';
export {
  allPitchStrings,
  downgradeLosses,
  hasFoodJob,
  isBulletAvailable,
  PREMIUM_PITCH_COPY,
  premiumJobFor,
  premiumPitchFor,
  showSnapTaste,
  type DowngradeUsage,
  type PremiumPitch,
  type PremiumPitchContext,
  type PremiumPitchCopyKey,
  type PremiumPitchOptions,
} from './premium-pitch';
export { tagConflicts, type RecipeTagConflict } from './recipe-tags';
export {
  formatFractionalQuantity,
  formatScaledQuantity,
  formatServingsPair,
  isUnscalableUnit,
} from './scaled-quantity';
export {
  parseQuantity,
  recipeMissingFields,
  firstIncompleteIngredientLineIndex,
  missingSummary,
  type RecipeFormIngredientLike,
  type RecipeFormMinimum,
  type RecipeFormMissingField,
} from './recipe-form';
export {
  PLAN_TAILORING_COPY,
  isTailoringRunning,
  newlyTailoredDays,
  shouldShowTailoringBanner,
  tailoringBannerText,
  tailoringDayLabel,
  tailoringDayState,
  tailoringProgress,
  type PlanTailoringCopyKey,
  type TailoringBannerText,
  type TailoringDayState,
} from './plan-tailoring';

// ─── Following (code name: friends) — pure helpers, F0.2 ──────────────────────
export * from './friends/follow-policy';
export * from './friends/search-name';
export * from './friends/display-name';
export * from './friends/suggestions';
export * from './friends/relation';
export * from './friends/cursor';
export * from './friends/owner-week';
export * from './friends/friend-totals';
export * from './friends/source-domain';
export { BLOCKED_TERMS } from './moderation/blocked-terms';
export {
  containsBlockedTerm,
  firstBlockedField,
  normalizeForFilter,
} from './moderation/text-filter';

// ─── Computed recipe nutrition (docs/plan-ingredient-catalog.md §5) ───────────
export * from './nutrition';

export {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  SERVER_ERROR_MESSAGE,
  isNetworkError,
  isServerError,
  VALIDATION_ERROR_MESSAGE,
  describeValidationIssues,
  humaniseFieldPath,
  parseIssuesFromMessage,
  userFacingErrorMessage,
} from './user-facing-error';
export type { UserFacingErrorOptions, ValidationIssueLike } from './user-facing-error';
export { getQueryState, isNotFoundError } from './query-state';
export type { QueryState, QueryStateInput } from './query-state';
export { shouldNotifyMutationError } from './mutation-errors';
export type { MutationMetaShape } from './mutation-errors';
export {
  plannedRowKey,
  sumLogged,
  tickStateFromLog,
  withEntriesRemoved,
  withEntryRestored,
  withRecipeEntryEdited,
  withRecipeLogged,
  withRecipeUnlogged,
  type DayEntry,
  type DayLike,
  type OffPlanRowLike,
} from './tracker-day';
export { regenerateConfirmBody } from './regenerate-copy';
