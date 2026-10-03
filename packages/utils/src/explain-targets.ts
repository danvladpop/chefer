import type { TargetInputs } from '@chefer/types';
import { formatDate } from './format';

// ─── Explain your targets (§2.11, T-11.2) ──────────────────────────────────────
// Plain-English sentences for the TargetExplainSheet. Every sentence is a
// pure function of `TargetInputs` (the resolver's `inputs`, §2.11) so the
// same wording renders on web and mobile.

/** "Formula: Mifflin–St Jeor, based on your weight, height, age and activity level." */
export function explainKcalSentence(inputs: TargetInputs): string {
  if (inputs.weightKg == null || inputs.heightCm == null || inputs.age == null) {
    return missingMetricsSentence();
  }
  return 'Formula: Mifflin–St Jeor, based on your weight, height, age and activity level.';
}

/** Protein basis sentence, naming the BMI >= 30 adjusted-weight rule when it applied. */
export function explainProteinSentence(inputs: TargetInputs): string {
  if (inputs.proteinGPerKg == null) {
    return 'Protein is set from a general guideline until we know your weight.';
  }
  const base = `Protein: ${inputs.proteinGPerKg} g per kg of body weight${
    inputs.isLifter ? ', following a training-focused guideline' : ''
  }.`;
  return inputs.usedAdjustedWeight
    ? `${base} A BMI of 30 or higher uses an adjusted body weight for this calculation.`
    : base;
}

/** "The rest of your calories are split between carbs and fat." */
export function explainCarbsFatSentence(): string {
  return 'The rest of your calories are split between carbs and fat.';
}

/** "You set this on {date}." for a user's own (OWN) target override. */
export function ownTargetSentence(setOnDate: Date): string {
  return `You set this on ${formatDate(setOnDate, 'medium')}.`;
}

/** Shown when weight/height/age are missing, so the sheet never invents numbers. */
export function missingMetricsSentence(): string {
  return 'Add your weight, height and age to see how this is calculated.';
}
