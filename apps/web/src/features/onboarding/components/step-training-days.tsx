'use client';

import type { DayKind } from '@chefer/types';
import { cn } from '@chefer/utils';

// ─── Step: Training days (§2.4, T-03.6/T-03.9) ─────────────────────────────────
// Web parity of mobile's training-days-step.tsx — Train + any food job only.
// The answer pre-fills gym setup's step 1 (count) and step 4 (weekdays); the
// day-kind row (T-03.9, UX-06) lets an endurance athlete's long-run day count
// as a training day for food without being a gym day.

export type TrainingDayKind = Exclude<DayKind, 'lift' | 'rest'>;

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const KIND_OPTIONS: { value: TrainingDayKind; label: string }[] = [
  { value: 'run', label: 'Run' },
  { value: 'long_run', label: 'Long run' },
];

function Chip({
  selected,
  onClick,
  children,
  testId,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'min-h-11 rounded-full border px-3.5 text-sm font-medium transition-colors',
        selected
          ? 'border-[#944a00] bg-[#944a00] text-white'
          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
      )}
    >
      {children}
    </button>
  );
}

export function StepTrainingDays({
  weekdays,
  onWeekdaysChange,
  dayKinds,
  onDayKindsChange,
  onNotSure,
}: {
  weekdays: number[];
  onWeekdaysChange: (weekdays: number[]) => void;
  dayKinds: Record<number, TrainingDayKind>;
  onDayKindsChange: (dayKinds: Record<number, TrainingDayKind>) => void;
  onNotSure: () => void;
}) {
  const sorted = [...weekdays].sort((a, b) => a - b);

  function withoutDay(weekday: number): Record<number, TrainingDayKind> {
    return Object.fromEntries(Object.entries(dayKinds).filter(([w]) => Number(w) !== weekday));
  }

  function setKind(weekday: number, kind: TrainingDayKind) {
    onDayKindsChange(
      dayKinds[weekday] === kind ? withoutDay(weekday) : { ...dayKinds, [weekday]: kind },
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Which days do you usually train?</h1>
        <p className="text-sm text-muted-foreground">
          We&apos;ll plan more food on these days and remind you to train. You can change them any
          time.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {WEEKDAY_LABELS.map((label, value) => (
          <Chip
            key={value}
            testId={`training-days-${value}`}
            selected={weekdays.includes(value)}
            onClick={() =>
              onWeekdaysChange(
                weekdays.includes(value)
                  ? weekdays.filter((d) => d !== value)
                  : [...weekdays, value],
              )
            }
          >
            {label}
          </Chip>
        ))}
      </div>
      <p data-testid="training-days-count" className="text-center text-sm text-muted-foreground">
        {weekdays.length} days a week
      </p>

      {sorted.length > 0 && (
        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Do you also run or ride?
          </p>
          {sorted.map((weekday) => (
            <div key={weekday} className="flex items-center justify-between gap-3">
              <span className="text-sm text-foreground">{WEEKDAY_FULL[weekday]}</span>
              <div className="flex gap-2">
                {KIND_OPTIONS.map(({ value, label }) => (
                  <Chip
                    key={value}
                    testId={`training-days-kind-${weekday}-${value}`}
                    selected={dayKinds[weekday] === value}
                    onClick={() => setKind(weekday, value)}
                  >
                    {label}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-center">
        <button
          type="button"
          data-testid="training-days-not-sure"
          onClick={onNotSure}
          className="min-h-11 px-4 text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Not sure yet
        </button>
      </div>
    </div>
  );
}
