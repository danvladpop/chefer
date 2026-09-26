'use client';

import { useState } from 'react';
import { useUnitSystem } from '@/hooks/useUnitSystem';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { cn, parseBodyWeight } from '@chefer/utils';

// One weigh-in form for the dashboard card, /progress and the gym stats
// prompt (audit F-DASH-3-1, F-TRK-1-7). It used to be three copies of a bare
// input + button outside any <form>: Enter did nothing, 1000 kg saved, and 0
// or −5 was a silent no-op. Validation mirrors the API via the shared parser.
// The field takes the user's unit (lb for IMPERIAL, backlog P2-6) and sends kg.

export function WeightLogForm({
  placeholder,
  label,
  inputClassName,
}: {
  placeholder?: string;
  label?: string;
  inputClassName?: string;
}) {
  const system = useUnitSystem();
  const imperial = system === 'IMPERIAL';
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const utils = trpc.useUtils();

  const logWeight = trpc.tracker.logWeight.useMutation({
    onSuccess: () => {
      capture('weight_logged');
      setSaved(true);
      setValue('');
      setTimeout(() => setSaved(false), 3000);
      void utils.tracker.weightHistory.invalidate();
      void utils.gym.stats.bodyweight.invalidate();
      void utils.gym.bootstrap.invalidate();
    },
    onError: (err) => setError(err.message),
  });

  const submit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    const parsed = parseBodyWeight(value, system);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    logWeight.mutate({ weightKg: parsed.kg });
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
    </form>
  );
}
