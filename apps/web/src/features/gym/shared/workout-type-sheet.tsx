'use client';

import { useEffect, useState } from 'react';
import { WORKOUT_TYPES, type WorkoutType, type WorkoutTypeEntry } from '@chefer/types';
import { Button, pressControl, Sheet } from '@chefer/ui';
import { cn } from '@chefer/utils';
import { groupWorkoutTypes } from '../simple/simple-helpers';

// ─── Workout type picker (simple training mode §6.3) ──────────────────────────
// One grouped chip list for every place a workout type is chosen: "Log a
// workout", "Start a workout" on simple Today, and a My week row (which adds
// a "Rest" chip). Chips are toggle buttons (aria-pressed), 44 px tall.

export const typeChipClass = (selected: boolean) =>
  cn(
    'inline-flex min-h-11 items-center justify-center rounded-full border px-4 py-2 text-sm font-medium',
    pressControl,
    selected
      ? 'border-[#944a00] bg-[#944a00] text-white'
      : 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50',
  );

export function WorkoutTypeChips({
  options = WORKOUT_TYPES,
  value,
  onChange,
  testIdPrefix,
  allowRest = false,
  describedBy,
}: {
  options?: readonly WorkoutTypeEntry[];
  /** Selected type; `null` is Rest when `allowRest`, else nothing picked. */
  value: WorkoutType | null | undefined;
  onChange: (type: WorkoutType | null) => void;
  testIdPrefix: string;
  /** Adds a "Rest" chip (My week). */
  allowRest?: boolean;
  describedBy?: string | undefined;
}) {
  return (
    <div className="space-y-3">
      {groupWorkoutTypes(options).map((section) => (
        <div key={section.group}>
          <p
            id={`${testIdPrefix}-group-${section.group}`}
            className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500"
          >
            {section.label}
          </p>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-labelledby={`${testIdPrefix}-group-${section.group}`}
            aria-describedby={describedBy}
          >
            {section.types.map((t) => (
              <button
                key={t.type}
                type="button"
                aria-pressed={value === t.type}
                data-testid={`${testIdPrefix}-${t.type}`}
                className={typeChipClass(value === t.type)}
                onClick={() => onChange(t.type)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      {allowRest && (
        <div>
          <button
            type="button"
            aria-pressed={value === null}
            data-testid={`${testIdPrefix}-REST`}
            className={typeChipClass(value === null)}
            onClick={() => onChange(null)}
          >
            Rest
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * "What are you training?" With `confirmLabel` the chips select and a footer
 * button confirms (Start a workout); without it a tap picks at once (My week).
 */
export function WorkoutTypeSheet({
  open,
  onClose,
  title = 'What are you training?',
  description,
  initial,
  onPick,
  confirmLabel,
  allowRest = false,
  testIdPrefix = 'workout-type',
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  initial: WorkoutType | null;
  onPick: (type: WorkoutType | null) => void;
  confirmLabel?: string;
  allowRest?: boolean;
  testIdPrefix?: string;
}) {
  const [selected, setSelected] = useState<WorkoutType | null>(initial);
  useEffect(() => {
    if (open) setSelected(initial);
  }, [open, initial]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      {...(description !== undefined && { description })}
      size="md"
      {...(confirmLabel && {
        footer: (
          <Button
            className="w-full"
            disabled={selected === null}
            onClick={() => onPick(selected)}
            data-testid={`${testIdPrefix}-confirm`}
          >
            {confirmLabel}
          </Button>
        ),
      })}
    >
      <div className="px-5 pb-5">
        <WorkoutTypeChips
          value={selected}
          allowRest={allowRest}
          testIdPrefix={testIdPrefix}
          onChange={(type) => {
            setSelected(type);
            if (!confirmLabel) onPick(type);
          }}
        />
      </div>
    </Sheet>
  );
}
