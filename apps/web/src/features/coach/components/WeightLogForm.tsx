'use client';

import { useState } from 'react';
import {
  HEALTH_DECLINED_BODY_NOTICE_WEIGHT,
  HealthDeclinedNotice,
} from '@/features/privacy/components/HealthDeclinedNotice';
import { useHealthConsent } from '@/features/privacy/use-health-consent';
import { useUnitSystem } from '@/hooks/useUnitSystem';
import { capture } from '@/lib/analytics';
import { showAppToast } from '@/lib/app-toast';
import { trpc } from '@/lib/trpc';
import { cn, formatBodyWeight, parseBodyWeight, userFacingErrorMessage } from '@chefer/utils';

// One weigh-in form for the dashboard card, /progress and the gym stats
// prompt (audit F-DASH-3-1, F-TRK-1-7). It used to be three copies of a bare
// input + button outside any <form>: Enter did nothing, 1000 kg saved, and 0
// or −5 was a silent no-op. Validation mirrors the API via the shared parser.
// The field takes the user's unit (lb for IMPERIAL, backlog P2-6) and sends kg.
//
// UX-FOOD-08 (mirrors the phone's WeightLogForm): Enter logs; a logged weight
// clears from the field and a "Logged 79.4 kg · Undo" toast offers to delete
// it; the same weight typed again on the same day as the newest entry is a
// duplicate weigh-in and is ignored with "Already logged … today".

const SAME_WEIGHT_KG = 0.05;
/** The Undo toast stays up as long as the phone's snackbar (10 s). */
const UNDO_TOAST_MS = 10_000;

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function WeightLogForm({
  placeholder,
  label,
  inputClassName,
  lastEntry,
}: {
  placeholder?: string;
  label?: string;
  inputClassName?: string;
  /** The newest weigh-in on record, for the same-value-same-day dedupe. */
  lastEntry?: { weightKg: number; recordedAt: Date | string } | null;
}) {
  const system = useUnitSystem();
  const imperial = system === 'IMPERIAL';
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const utils = trpc.useUtils();
  // T-26.2: a weigh-in is health information — asked once, on the first save.
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();
  const [declined, setDeclined] = useState(false);

  const logWeight = trpc.tracker.logWeight.useMutation({
    meta: { silent: true },
    onSuccess: (entry, variables) => {
      capture('weight_logged');
      setSaved(true);
      setValue('');
      setTimeout(() => setSaved(false), 3000);
      const refresh = () => {
        void utils.tracker.weightHistory.invalidate();
        void utils.gym.stats.bodyweight.invalidate();
        void utils.gym.bootstrap.invalidate();
      };
      refresh();
      showAppToast({
        message: `Logged ${formatBodyWeight(variables.weightKg, system)}`,
        type: 'success',
        durationMs: UNDO_TOAST_MS,
        action: {
          label: 'Undo',
          onClick: () => {
            // Imperative client: the card may be gone by the time Undo is clicked.
            utils.client.tracker.deleteWeight
              .mutate({ id: entry.id })
              .then(refresh)
              .catch((err: unknown) => showAppToast({ message: userFacingErrorMessage(err) }));
          },
        },
      });
    },
    onError: (err) => setError(userFacingErrorMessage(err)),
  });

  const submit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    const parsed = parseBodyWeight(value, system);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setDeclined(false);
    if (
      lastEntry &&
      isSameDay(new Date(lastEntry.recordedAt), new Date()) &&
      Math.abs(lastEntry.weightKg - parsed.kg) < SAME_WEIGHT_KG
    ) {
      setValue('');
      showAppToast({
        message: `Already logged ${formatBodyWeight(parsed.kg, system)} today`,
        type: 'success',
      });
      return;
    }
    // "Don't save it": nothing is stored; the typed value stays in the field.
    requestHealthConsent(() => logWeight.mutate({ weightKg: parsed.kg }), {
      onDeclined: () => setDeclined(true),
    });
  };

  return (
    <form onSubmit={submit} noValidate className="min-w-0">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          placeholder={placeholder ?? (imperial ? '160.5 lb' : '72.5 kg')}
          inputMode="decimal"
          aria-label={label ?? `Today's weight in ${imperial ? 'pounds' : 'kilograms'}`}
          aria-invalid={error != null}
          aria-describedby={error ? 'weight-log-error' : undefined}
          className={cn(
            'min-h-11 min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1',
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
              : 'border-gray-200 focus:border-[#944a00] focus:ring-[#944a00]',
            inputClassName,
          )}
        />
        <button
          type="submit"
          disabled={!value.trim() || logWeight.isPending || saved}
          className="min-h-11 shrink-0 rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white transition hover:bg-[#7a3d00] disabled:opacity-50"
        >
          {saved ? '✓ Saved' : 'Log'}
        </button>
      </div>
      {error && (
        <p id="weight-log-error" role="alert" className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      )}
      {declined && (
        <div className="mt-2">
          <HealthDeclinedNotice
            testId="weight-declined"
            message={HEALTH_DECLINED_BODY_NOTICE_WEIGHT}
          />
        </div>
      )}
      {healthConsentSheet}
    </form>
  );
}
