'use client';

import { useId } from 'react';
import { BarChart3, Check, Dumbbell } from 'lucide-react';
import type { NumbersMode } from '@chefer/types';
import { cn, NUMBERS_MODE_COPY } from '@chefer/utils';

// "What do you want to keep an eye on?" (WP-08): the two numbers modes a user can
// pick today. Controlled, so it serves both the onboarding goal step (saved with
// the rest of setup) and the Preferences card (saved at once). NONE is reserved
// for WP-16 and is not offered. Mirrors apps/mobile .../numbers-mode-choice.tsx;
// the words are shared (NUMBERS_MODE_COPY in @chefer/utils).

export type NumbersModeChoiceValue = Extract<NumbersMode, 'FULL' | 'PROTEIN_ONLY'>;

const OPTIONS = [
  {
    value: 'FULL' as const,
    title: NUMBERS_MODE_COPY.fullTitle,
    detail: NUMBERS_MODE_COPY.fullDetail,
    Icon: BarChart3,
  },
  {
    value: 'PROTEIN_ONLY' as const,
    title: NUMBERS_MODE_COPY.proteinTitle,
    detail: NUMBERS_MODE_COPY.proteinDetail,
    Icon: Dumbbell,
  },
];

export function NumbersModeChoice({
  value,
  onChange,
  disabled = false,
  testIdPrefix = 'numbers-mode',
  className,
}: {
  value: NumbersModeChoiceValue;
  onChange: (mode: NumbersModeChoiceValue) => void;
  disabled?: boolean;
  testIdPrefix?: string;
  className?: string;
}) {
  const labelId = useId();
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      data-testid={`${testIdPrefix}-choice`}
      className={cn('space-y-2', className)}
    >
      <p id={labelId} className="text-sm font-semibold text-foreground">
        {NUMBERS_MODE_COPY.question}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {OPTIONS.map(({ value: v, title, detail, Icon }) => {
          const selected = value === v;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              data-testid={`${testIdPrefix}-${v === 'FULL' ? 'full' : 'protein'}`}
              onClick={() => onChange(v)}
              className={cn(
                'flex min-h-11 w-full min-w-0 items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                selected ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted',
              )}
            >
              <Icon
                className={cn(
                  'mt-0.5 h-5 w-5 shrink-0',
                  selected ? 'text-primary' : 'text-muted-foreground',
                )}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block text-sm font-semibold',
                    selected ? 'text-primary' : 'text-foreground',
                  )}
                >
                  {title}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>
              </span>
              {selected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
