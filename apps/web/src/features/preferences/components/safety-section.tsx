import { StepDiet } from '@/features/onboarding/components/step-diet';
import { Section } from './section';

interface SafetyValue {
  dietaryRestrictions: string[];
  allergies: string[];
  dislikedIngredients: string[];
}

interface SafetySectionProps {
  value: SafetyValue;
  onChange: (patch: Partial<SafetyValue>) => void;
}

/**
 * Diet & restrictions — free for every account (P1-2). Rendered first so
 * free users see their editable section on top. Split out of
 * preferences-form.tsx (T-00.13, no behaviour change).
 */
export function SafetySection({ value, onChange }: SafetySectionProps) {
  return (
    <Section>
      <StepDiet value={value} onChange={onChange} />
    </Section>
  );
}
