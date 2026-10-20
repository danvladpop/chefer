'use client';

import { useEffect, useId, useState } from 'react';
import { GYM_MAX_WEIGHT_KG, TEMPLATE_COPY, type WeightUnit } from '@chefer/types';
import { cn, kgToUnit, unitLabel, unitToKg } from '@chefer/utils';

/** Text the field shows for a stored kg value (empty = none). */
function displayOf(kg: number | null | undefined, unit: WeightUnit): string {
  return kg === null || kg === undefined ? '' : String(kgToUnit(kg, unit));
}

/**
 * "Starting weight": the load a template suggests for one strength row, typed
 * in the trainer's unit and stored in kg. Empty = none (each client's history
 * decides). The text is local so "62." can be typed; only a valid number (or
 * empty) is passed up, otherwise the error is linked to the field.
 */
export function DefaultLoadField({
  valueKg,
  unit,
  exerciseName,
  onChange,
}: {
  valueKg: number | null | undefined;
  unit: WeightUnit;
  exerciseName: string;
  onChange: (kg: number | null) => void;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const [text, setText] = useState(() => displayOf(valueKg, unit));
  const [invalid, setInvalid] = useState(false);

  // A value replaced from outside (the other version after a conflict) shows up here.
  useEffect(() => {
    const parsed = Number(text.replace(',', '.'));
    const sameValue =
      text.trim() === ''
        ? valueKg === null || valueKg === undefined
        : valueKg !== null && valueKg !== undefined && unitToKg(parsed, unit) === valueKg;
    if (!sameValue) {
      setText(displayOf(valueKg, unit));
      setInvalid(false);
    }
    // Only an outside change of the stored value should rewrite the text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueKg, unit]);

  const handle = (next: string) => {
    setText(next);
    const trimmed = next.trim();
    if (trimmed === '') {
      setInvalid(false);
      onChange(null);
      return;
    }
    const value = Number(trimmed.replace(',', '.'));
    const kg = Number.isFinite(value) ? unitToKg(value, unit) : NaN;
    if (!Number.isFinite(kg) || kg < 0 || kg > GYM_MAX_WEIGHT_KG) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onChange(kg);
  };

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {TEMPLATE_COPY.editor.defaultLoad} ({unitLabel(unit)})
        <span className="sr-only">: {exerciseName}</span>
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        enterKeyHint="done"
        autoComplete="off"
        value={text}
        onChange={(e) => handle(e.target.value)}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={invalid ? `${hintId} ${errorId}` : hintId}
        className={cn(
          'h-11 w-full min-w-0 max-w-[10rem] rounded-md border px-2 text-base focus:outline-none sm:text-sm lg:h-9',
          invalid ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-gray-400',
        )}
        data-testid="template-default-load"
      />
      <p id={hintId} className="text-xs text-gray-500">
        {TEMPLATE_COPY.editor.defaultLoadHint}
      </p>
      {invalid && (
        <p id={errorId} role="alert" className="text-xs text-red-700">
          Enter a weight between 0 and {kgToUnit(GYM_MAX_WEIGHT_KG, unit)} {unitLabel(unit)}.
        </p>
      )}
    </div>
  );
}
