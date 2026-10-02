import { GYM_MAX_REPS, GYM_MAX_WEIGHT_KG, type WeightUnit } from '@chefer/types';
import { formatLoadNumber, kgToUnit, unitLabel, userFacingErrorMessage } from '@chefer/utils';

// UX-GYM-01 / UX-X-06 (gym part): a server or schema validation failure must
// never reach the user as `[{"code":"too_big","maximum":1000,…}]`. These
// helpers turn the Zod issue list (parsed locally, or JSON in a tRPC
// BAD_REQUEST message) into one plain sentence that names what to fix.

export const GENERIC_VALIDATION_MESSAGE =
  'Some values are out of range. Check the numbers you entered and try again.';

export interface ValidationIssueLike {
  code?: unknown;
  path?: unknown;
  maximum?: unknown;
  minimum?: unknown;
  message?: unknown;
}

const WEIGHT_LIMIT = `${formatLoadNumber(GYM_MAX_WEIGHT_KG, 'KG')} kg (${formatLoadNumber(GYM_MAX_WEIGHT_KG, 'LB')} lb)`;

function pathHas(issue: ValidationIssueLike, key: string): boolean {
  return Array.isArray(issue.path) && issue.path.some((p) => p === key);
}

/** One sentence for the first recognisable issue, else the generic line. */
export function describeValidationIssues(issues: readonly ValidationIssueLike[]): string {
  for (const issue of issues) {
    const tooBig = issue.code === 'too_big';
    if (pathHas(issue, 'weightKg') || pathHas(issue, 'knownWeightsKg')) {
      return tooBig
        ? `A weight is above the ${WEIGHT_LIMIT} limit. Check for a typo.`
        : 'A weight is not a valid number. Check the weights you entered.';
    }
    if (pathHas(issue, 'reps')) {
      return tooBig
        ? `A rep count is above ${String(GYM_MAX_REPS)}. Check for a typo.`
        : 'A rep count is not a valid number.';
    }
    if (pathHas(issue, 'sets') && tooBig) return 'A workout has too many sets in one exercise.';
    if (pathHas(issue, 'exercises') && tooBig) return 'A workout has too many exercises.';
  }
  return GENERIC_VALIDATION_MESSAGE;
}

function asIssues(value: unknown[]): ValidationIssueLike[] {
  return value.filter((i): i is ValidationIssueLike => i !== null && typeof i === 'object');
}

/** Zod issues serialised in a message (`[{"code":…}]`), or null when it isn't. */
export function parseIssuesFromMessage(message: string): ValidationIssueLike[] | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return asIssues(parsed);
    if (parsed !== null && typeof parsed === 'object' && 'issues' in parsed) {
      const { issues } = parsed;
      if (Array.isArray(issues)) return asIssues(issues);
    }
    return [];
  } catch {
    return /"code"\s*:/.test(trimmed) ? [] : null;
  }
}

/** A raw server/validation message → text safe to show; plain prose passes through. */
export function friendlyValidationMessage(message: string): string {
  const issues = parseIssuesFromMessage(message);
  return issues === null ? message : describeValidationIssues(issues);
}

/** `userFacingErrorMessage` plus the Zod-JSON guard (gym screens use this). */
export function gymErrorMessage(error: unknown): string {
  return friendlyValidationMessage(userFacingErrorMessage(error));
}

/** Inline check of a "starting weight" field typed in the display unit. */
export function startingWeightError(raw: string, unit: WeightUnit): string | null {
  const text = raw.trim();
  if (text === '') return null;
  const value = Number.parseFloat(text.replace(',', '.'));
  if (!Number.isFinite(value) || !/^\d*[.,]?\d*$/.test(text)) return 'Enter a number.';
  if (value <= 0) return 'Enter a weight above 0, or leave it empty.';
  const max = kgToUnit(GYM_MAX_WEIGHT_KG, unit);
  if (value > max) return `Max ${formatLoadNumber(GYM_MAX_WEIGHT_KG, unit)} ${unitLabel(unit)}.`;
  return null;
}
