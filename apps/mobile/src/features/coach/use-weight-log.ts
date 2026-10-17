import { useState } from 'react';
import { showSnackbar } from '@chefer/ui-mobile';
import {
  formatBodyWeight,
  parseBodyWeight,
  userFacingErrorMessage,
  type UnitSystem,
} from '@chefer/utils';
import { useUnitSystem } from '../../hooks/use-unit-system';
import { trpc } from '../../lib/trpc';
import { useHealthConsent } from '../privacy/use-health-consent';

// The weigh-in write behind every weight field — the dashboard card, Progress
// and the 10 Oct redesign's Today "Weigh in" card. Extracted from
// WeightLogForm unchanged: the shared parser in the user's unit (audit
// F-DASH-3-1, backlog P2-6), the same-weight-same-day dedupe (UX-FOOD-08),
// the health-consent gate on the first save (T-26.2) and the Undo snackbar.

// UX-FOOD-08: the same weight, typed again on the same calendar day, is a
// duplicate weigh-in (a second tap on "+", or Return after the field was
// refilled) — it is ignored rather than stored twice.
const SAME_WEIGHT_KG = 0.05;

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export type WeightLogEntry = { weightKg: number; recordedAt: Date };

export interface WeightLog {
  system: UnitSystem;
  value: string;
  /** Typing clears the last validation error. */
  onChangeText: (text: string) => void;
  /** Returns true when the typed value was accepted (valid), so the caller may close the keyboard. */
  submit: () => boolean;
  /** The validation or server error, in plain words. */
  error: string | null;
  /** "Don't save it" was chosen on the consent sheet: nothing was stored. */
  declined: boolean;
  /** True for ~3 s after a save. */
  saved: boolean;
  /** Nothing typed, or a save in flight. */
  disabled: boolean;
  /** Render once next to the field (iOS presents one modal at a time). */
  healthConsentSheet: React.ReactElement;
}

export function useWeightLog(lastEntry: WeightLogEntry | null | undefined): WeightLog {
  const system = useUnitSystem();
  const [value, setValue] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const utils = trpc.useUtils();
  // T-26.2: a weigh-in is health information — asked once, on the first save.
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();
  const [declined, setDeclined] = useState(false);

  const logWeight = trpc.tracker.logWeight.useMutation({
    meta: { silent: true },
    onSuccess: (entry, variables) => {
      setSaved(true);
      // UX-FOOD-08: a logged weight must not stay in the field (it led to
      // duplicate weigh-ins) — clear it and offer an Undo.
      setValue('');
      setTimeout(() => setSaved(false), 3000);
      // Every range (30-day card, 90-day progress) and the gym bodyweight views.
      const refresh = () => {
        void utils.tracker.weightHistory.invalidate();
        void utils.gym.stats.bodyweight.invalidate();
        void utils.gym.bootstrap.invalidate();
      };
      refresh();
      showSnackbar({
        message: `Logged ${formatBodyWeight(variables.weightKg, system)}`,
        actionLabel: 'Undo',
        tone: 'success',
        onAction: () => {
          // Imperative client: the card may be gone by the time Undo is tapped.
          utils.client.tracker.deleteWeight
            .mutate({ id: entry.id })
            .then(refresh)
            .catch((err: unknown) => showSnackbar({ message: userFacingErrorMessage(err) }));
        },
      });
    },
  });

  const submit = (): boolean => {
    if (logWeight.isPending) return false;
    const parsed = parseBodyWeight(value, system);
    if (!parsed.ok) {
      setInputError(parsed.error);
      return false;
    }
    setInputError(null);
    setDeclined(false);
    if (
      lastEntry &&
      isSameDay(new Date(lastEntry.recordedAt), new Date()) &&
      Math.abs(lastEntry.weightKg - parsed.kg) < SAME_WEIGHT_KG
    ) {
      setValue('');
      showSnackbar({ message: `Already logged ${formatBodyWeight(parsed.kg, system)} today` });
      return true;
    }
    // "Don't save it": nothing is stored; the typed value stays in the field.
    requestHealthConsent(() => logWeight.mutate({ weightKg: parsed.kg }), {
      onDeclined: () => setDeclined(true),
    });
    return true;
  };

  const error =
    inputError ?? (logWeight.error ? userFacingErrorMessage(logWeight.error) : undefined) ?? null;

  return {
    system,
    value,
    onChangeText: (text) => {
      setValue(text);
      setInputError(null);
    },
    submit,
    error,
    declined,
    saved,
    disabled: logWeight.isPending || !value.trim(),
    healthConsentSheet,
  };
}
