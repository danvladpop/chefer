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
  EUROZONE_REGIONS,
  IMPERIAL_REGIONS,
  defaultsForRegion,
  detectRegion,
  regionFromLocale,
  type DisplayDefaults,
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

export { defaultCookServings, guessMealType, parseStepDuration } from './cook-mode';
export { buildPickerSections, type PickerSection } from './recipe-picker';
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
  QUICK_ADD_LIMITS,
  QUICK_ADD_MEAL_TYPES,
  parseQuickAdd,
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
  PLAN_STATUS_LABEL,
  planStatus,
  type PlanStatus,
} from './day-nutrition';
export {
  LIFTER_PROTEIN_G_PER_KG,
  LIFTER_PROTEIN_G_PER_KG_BY_GOAL,
  POST_WORKOUT_PROTEIN_G_PER_KG,
  TRAINING_DAY_KCAL,
  TRAINING_DAY_PROTEIN_G_PER_KG,
  applyTrainingDayBonus,
  buildTrainingDayNutrition,
  hasTrainingDayBump,
  isLifter,
  lifterProteinGPerKg,
  postWorkoutProteinG,
  resolveTrainingDay,
  trainingDayBonus,
  trainingDayLine,
  trainingWeekdays,
  withLifterProtein,
  type ResolvedTrainingDay,
  type TrainingDayBonus,
} from './training-nutrition';
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
