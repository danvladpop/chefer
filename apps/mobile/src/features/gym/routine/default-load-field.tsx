import { useState } from 'react';
import { GYM_MAX_WEIGHT_KG, TEMPLATE_COPY, type WeightUnit } from '@chefer/types';
import { DONE_FIELD_PROPS, FormField, Input } from '@chefer/ui-mobile';
import { formatLoadNumber, kgToUnit, parseBodyNumber, unitLabel, unitToKg } from '@chefer/utils';

// ─── A template row's "Starting weight" (trainer-mode.md §6.6, M2) ───────────
// Optional: empty means each client's history decides. Typed in the trainer's own unit (kg / lb, the
// gym unit the app already knows) and stored in kg, like every load. Only for exercises that take a
// load: cardio, timed holds and pure bodyweight moves have no starting weight.

/** Typed text → kg, null for an empty field, or 'invalid'. */
export function parseStartingWeight(raw: string, unit: WeightUnit): number | null | 'invalid' {
  if (raw.trim() === '') return null;
  const n = parseBodyNumber(raw);
  if (n === null || n < 0) return 'invalid';
  const kg = unitToKg(n, unit);
  return kg > GYM_MAX_WEIGHT_KG ? 'invalid' : kg;
}

function initialText(weightKg: number | null | undefined, unit: WeightUnit): string {
  return weightKg === null || weightKg === undefined ? '' : formatLoadNumber(weightKg, unit);
}

export function DefaultLoadField({
  testID,
  weightKg,
  unit,
  onChange,
}: {
  testID: string;
  weightKg: number | null | undefined;
  unit: WeightUnit;
  onChange: (weightKg: number | null) => void;
}) {
  // Text is held locally so "62." or "62,5" never reformats under the thumb.
  const [text, setText] = useState(() => initialText(weightKg, unit));
  const [invalid, setInvalid] = useState(false);
  const label = `${TEMPLATE_COPY.editor.defaultLoad} (${unitLabel(unit)})`;
  const max = `${formatLoadNumber(GYM_MAX_WEIGHT_KG, unit)} ${unitLabel(unit)}`;
  return (
    <FormField
      testID={testID}
      label={label}
      hint={TEMPLATE_COPY.editor.defaultLoadHint}
      {...(invalid && { error: `Enter a weight from 0 to ${max}.` })}
    >
      <Input
        testID={`${testID}-input`}
        label={label}
        value={text}
        keyboardType="decimal-pad"
        {...DONE_FIELD_PROPS}
        placeholder={unitLabel(unit)}
        {...(invalid && { accessibilityHint: `Enter a weight from 0 to ${max}.` })}
        onChangeText={(next) => {
          setText(next);
          const parsed = parseStartingWeight(next, unit);
          setInvalid(parsed === 'invalid');
          if (parsed !== 'invalid') onChange(parsed);
        }}
        onBlur={() => {
          // Show what was stored ("62,50" → "62.5"); an invalid entry keeps its text and the error.
          const parsed = parseStartingWeight(text, unit);
          if (parsed !== 'invalid') setText(initialText(parsed, unit));
        }}
      />
    </FormField>
  );
}

/** "Starting weight 60 kg" for a collapsed template row, or null when there is none. */
export function startingWeightSummary(
  weightKg: number | null | undefined,
  unit: WeightUnit,
): string | null {
  if (weightKg === null || weightKg === undefined) return null;
  return `${TEMPLATE_COPY.editor.defaultLoad} ${String(kgToUnit(weightKg, unit))} ${unitLabel(unit)}`;
}
