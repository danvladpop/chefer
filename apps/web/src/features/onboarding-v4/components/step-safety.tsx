'use client';

import { useRef, useState } from 'react';
import { StepDiet, type StepDietHandle } from '@/features/onboarding/components/step-diet';
import { HealthDeclinedNotice } from '@/features/privacy/components/HealthDeclinedNotice';
import { Check, ChevronRight } from 'lucide-react';
import { pressCard, pressControl, Sheet } from '@chefer/ui';
import {
  cn,
  eatsEverything,
  EMPTY_SAFETY_VALUE,
  isQuickSafetyOn,
  ONBOARDING_V4_COPY,
  ONBOARDING_V4_QUICK_SAFETY,
  toggleQuickSafety,
  type SafetyPickerValue,
} from '@chefer/utils';
import { BiscuitHalo, Chip, PrimaryButton, V4Heading } from './ui';

// ─── Anything you can't eat? (OnbV4Safety + OnbV4SafetyMore) ───────────────────
// "I eat everything" is the default; the quick chips cover the common cases,
// and "More options" opens the full safety picker the current wizard uses
// (StepDiet) in a Sheet. Every change keeps whatever the other surface set.

export function StepSafety({
  value,
  onChange,
  declined,
}: {
  value: SafetyPickerValue;
  onChange: (value: SafetyPickerValue) => void;
  /** "Don't save it" on the health sheet: the picks were cleared. */
  declined: boolean;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [draft, setDraft] = useState<SafetyPickerValue>(value);
  const pickerRef = useRef<StepDietHandle>(null);
  const everything = eatsEverything(value);

  function openMore() {
    setDraft(value);
    setMoreOpen(true);
  }

  /** UX-ACC-01: a typed-but-not-added term is flushed first; a pending choice keeps the sheet open. */
  function closeMore() {
    const flushed = pickerRef.current ? pickerRef.current.flush() : draft;
    if (flushed === null) return;
    onChange(flushed);
    setMoreOpen(false);
  }

  return (
    <div className="flex flex-col gap-3.5">
      <BiscuitHalo loop="sniff" size={140} />
      <V4Heading title={ONBOARDING_V4_COPY.safetyTitle} lede={ONBOARDING_V4_COPY.safetyLede} />

      <button
        type="button"
        aria-pressed={everything}
        onClick={() => onChange(EMPTY_SAFETY_VALUE)}
        data-testid="v4-safety-everything"
        className={cn(
          'flex min-h-14 items-center gap-3 rounded-card px-3.5 text-left text-revamp-label focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          everything
            ? 'border-2 border-revamp-brand bg-revamp-brand-tint'
            : 'border border-revamp-separator bg-revamp-surface',
          pressCard,
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
            everything
              ? 'bg-revamp-brand text-revamp-on-brand'
              : 'border-2 border-revamp-separator bg-revamp-surface',
          )}
        >
          {everything && <Check className="h-4 w-4" />}
        </span>
        <span className="flex-1 text-[1.0625rem] font-semibold">
          {ONBOARDING_V4_COPY.safetyEverything}
        </span>
      </button>

      <span id="v4-safety-or-pick" className="text-sm font-semibold text-revamp-label-secondary">
        {ONBOARDING_V4_COPY.safetyOrPick}
      </span>
      <div role="group" aria-labelledby="v4-safety-or-pick" className="flex flex-wrap gap-2">
        {ONBOARDING_V4_QUICK_SAFETY.map((chip) => (
          <Chip
            key={chip.key}
            label={chip.label}
            selected={isQuickSafetyOn(value, chip.key)}
            onClick={() => onChange(toggleQuickSafety(value, chip.key))}
            testId={`v4-safety-${chip.key}`}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={openMore}
        data-testid="v4-safety-more"
        className={cn(
          'flex min-h-11 items-center gap-1.5 self-start text-base font-semibold text-revamp-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          pressControl,
        )}
      >
        {ONBOARDING_V4_COPY.safetyMore}
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>

      {declined && <HealthDeclinedNotice testId="onb-v4-safety-declined" />}

      <Sheet
        open={moreOpen}
        onClose={closeMore}
        title={ONBOARDING_V4_COPY.safetyMore}
        size="lg"
        footer={
          <PrimaryButton onClick={closeMore} testId="v4-safety-more-done">
            {ONBOARDING_V4_COPY.continue}
          </PrimaryButton>
        }
      >
        <StepDiet ref={pickerRef} value={draft} onChange={setDraft} hideHeading />
      </Sheet>
    </div>
  );
}
