import type { Ref } from 'react';
import { StepDiet, type StepDietHandle } from '@/features/onboarding/components/step-diet';
import { Section } from './section';

interface SafetyValue {
  dietaryRestrictions: string[];
  allergies: string[];
  dislikedIngredients: string[];
}

interface SafetySectionProps {
  value: SafetyValue;
  onChange: (patch: Partial<SafetyValue>) => void;
  /** UX-ACC-01: lets the page flush a typed-but-unadded "Something else?" term on Save. */
  ref?: Ref<StepDietHandle> | undefined;
  onPendingChange?: ((pending: boolean) => void) | undefined;
}

/**
 * Diet & restrictions — free for every account (P1-2). Rendered first so
 * free users see their editable section on top. Split out of
 * preferences-form.tsx (T-00.13, no behaviour change).
 */
export function SafetySection({ value, onChange, ref, onPendingChange }: SafetySectionProps) {
  return (
    <Section>
      <StepDiet value={value} onChange={onChange} ref={ref} onPendingChange={onPendingChange} />
    </Section>
  );
}
