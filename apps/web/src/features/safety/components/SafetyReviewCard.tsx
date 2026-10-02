'use client';

import { useRef, useState } from 'react';
import { StepDiet, type StepDietHandle } from '@/features/onboarding/components/step-diet';
import { useHealthConsent } from '@/features/privacy/use-health-consent';
import { trpc } from '@/lib/trpc';
import { ShieldQuestion } from 'lucide-react';
import { Sheet } from '@chefer/ui';
import {
  migrationMappingText,
  migrationMappingUncheckedText,
  recogniseSafetyTerm,
  SAFETY_COPY,
  type SafetyPickerValue,
} from '@chefer/utils';

// T-01.3 — the one-time free-text migration card (UX-01 (b), AC9). Web
// parity of the mobile migration-card.tsx, mounted in Settings › Allergies &
// diets (the Preferences page). Shown while safety.getTable().needsReview is
// true; "Change" opens the same SafetyPicker (StepDiet) pre-applied.

function mappingLine(term: string): string {
  const recognised = recogniseSafetyTerm(term);
  if (recognised.kind === 'unrecognised') {
    return `“${term}” ${migrationMappingUncheckedText}`;
  }
  return migrationMappingText(term, recognised.label);
}

const EMPTY_SAFETY: SafetyPickerValue = {
  allergies: [],
  dietaryRestrictions: [],
  dislikedIngredients: [],
};

export function SafetyReviewCard() {
  const { data: table } = trpc.safety.getTable.useQuery();
  const { data: prefsData } = trpc.preferences.get.useQuery();
  const utils = trpc.useUtils();
  const [changeOpen, setChangeOpen] = useState(false);
  // T-26.2: re-saving the allergy lists stores health information.
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();

  const ownSafety: SafetyPickerValue = {
    allergies: prefsData?.dietaryPreferences?.allergies ?? [],
    dietaryRestrictions: prefsData?.dietaryPreferences?.dietaryRestrictions ?? [],
    dislikedIngredients: prefsData?.dietaryPreferences?.dislikedIngredients ?? [],
  };
  const [draft, setDraft] = useState<SafetyPickerValue>(EMPTY_SAFETY);
  // UX-ACC-01: flushes a typed-but-unadded "Something else?" term before Save.
  const pickerRef = useRef<StepDietHandle>(null);

  const confirmMutation = trpc.safety.confirmReview.useMutation({
    onSuccess: () => void utils.safety.getTable.invalidate(),
  });
  const updateSafetyMutation = trpc.preferences.updateSafety.useMutation({
    onSuccess: () => {
      confirmMutation.mutate();
      setChangeOpen(false);
      void utils.preferences.get.invalidate();
      void utils.mealPlan.invalidate();
    },
  });

  if (!table?.needsReview) return null;

  const terms = [
    ...ownSafety.allergies,
    ...ownSafety.dietaryRestrictions,
    ...ownSafety.dislikedIngredients,
  ];

  return (
    <div className="mb-6 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2">
        <ShieldQuestion className="h-4 w-4 text-amber-800" aria-hidden="true" />
        <p className="text-sm font-semibold text-amber-900">{SAFETY_COPY.migrationTitle}</p>
      </div>
      <p className="text-sm text-amber-800">{SAFETY_COPY.migrationBody}</p>
      <div className="space-y-1">
        {terms.map((term) => (
          <p key={term} className="text-xs text-amber-900">
            {mappingLine(term)}
          </p>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => confirmMutation.mutate()}
          disabled={confirmMutation.isPending}
          className="min-h-11 flex-1 rounded-lg border border-amber-300 bg-background px-3 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
        >
          {SAFETY_COPY.migrationLooksRight}
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(ownSafety);
            setChangeOpen(true);
          }}
          className="min-h-11 flex-1 rounded-lg px-3 text-sm font-medium text-amber-900 hover:bg-amber-100"
        >
          {SAFETY_COPY.migrationChange}
        </button>
      </div>
      <Sheet
        open={changeOpen}
        onClose={() => setChangeOpen(false)}
        title={SAFETY_COPY.migrationChange}
        size="lg"
        footer={
          <button
            onClick={() => {
              // null = a typed term still needs a Keep/Remove choice: don't save yet.
              const toSave = pickerRef.current ? pickerRef.current.flush() : draft;
              if (toSave === null) return;
              requestHealthConsent(() => updateSafetyMutation.mutate(toSave), {
                hasHealthData:
                  toSave.allergies.length +
                    toSave.dietaryRestrictions.length +
                    toSave.dislikedIngredients.length >
                  0,
                onDeclined: () => setChangeOpen(false),
              });
            }}
            disabled={updateSafetyMutation.isPending}
            className="min-h-11 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {updateSafetyMutation.isPending ? 'Saving…' : 'Save changes'}
          </button>
        }
      >
        <div className="px-5 pb-4">
          <StepDiet ref={pickerRef} value={draft} onChange={setDraft} />
        </div>
      </Sheet>
      {healthConsentSheet}
    </div>
  );
}
