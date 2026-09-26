'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { format } from 'date-fns';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { parseBodyWeightKg } from '@chefer/utils';

// Correct or remove weigh-ins (audit F-DASH-3-1). Before this, a typo like
// 1000 kg stayed forever: it flattened the /progress chart, became "Current"
// weight and skewed the coach's weekly trend.

type Entry = { id: string; weightKg: number; recordedAt: Date };

function EntryRow({ entry }: { entry: Entry }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm-delete'>('view');
  const [value, setValue] = useState(String(entry.weightKg));
  const [error, setError] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const invalidate = () => {
    void utils.tracker.weightHistory.invalidate();
    void utils.gym.stats.bodyweight.invalidate();
    void utils.gym.bootstrap.invalidate();
  };
  const update = trpc.tracker.updateWeight.useMutation({
    onSuccess: () => {
      setMode('view');
      invalidate();
    },
    onError: (err) => setError(err.message),
  });
  const remove = trpc.tracker.deleteWeight.useMutation({
    onSuccess: invalidate,
    onError: (err) => setError(err.message),
  });

  const dateLabel = format(new Date(entry.recordedAt), 'EEE d MMM');

  const save = (e: React.SyntheticEvent) => {
    e.preventDefault();
    const parsed = parseBodyWeightKg(value);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    update.mutate({ id: entry.id, weightKg: parsed.kg });
  };

  const iconButton =
    'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50';

  return (
    <li className="py-1">
      {mode === 'edit' ? (
        <form onSubmit={save} noValidate className="flex items-center gap-2">
          <span className="w-24 shrink-0 text-sm text-gray-500">{dateLabel}</span>
          <input
            autoFocus
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label={`Weight on ${dateLabel} in kilograms`}
            aria-invalid={error != null}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-gray-200 px-3 text-sm focus:border-[#944a00] focus:outline-none focus:ring-1 focus:ring-[#944a00]"
          />
          <button
            type="submit"
            aria-label="Save weight"
            disabled={update.isPending}
            className={iconButton}
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Cancel editing"
            onClick={() => {
              setMode('view');
              setValue(String(entry.weightKg));
              setError(null);
            }}
            className={iconButton}
          >
            <X className="h-4 w-4" />
          </button>
        </form>
      ) : mode === 'confirm-delete' ? (
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 text-sm text-gray-700">
            Delete {entry.weightKg} kg on {dateLabel}?
          </span>
          <button
            type="button"
            onClick={() => remove.mutate({ id: entry.id })}
            disabled={remove.isPending}
            className="min-h-11 shrink-0 rounded-xl bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => setMode('view')}
            className="min-h-11 shrink-0 rounded-xl px-3 text-sm text-gray-600 hover:bg-gray-100"
          >
            Keep
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="w-24 shrink-0 text-sm text-gray-500">{dateLabel}</span>
          <span className="min-w-0 flex-1 text-sm font-semibold text-gray-900">
            {entry.weightKg} kg
          </span>
          <button
            type="button"
            aria-label={`Edit ${entry.weightKg} kg on ${dateLabel}`}
            onClick={() => setMode('edit')}
            className={iconButton}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={`Delete ${entry.weightKg} kg on ${dateLabel}`}
            onClick={() => setMode('confirm-delete')}
            className={iconButton}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </li>
  );
}

/** Newest-first list of weigh-ins with inline edit and confirm-to-delete. */
export function WeightEntriesList({ entries, limit = 10 }: { entries: Entry[]; limit?: number }) {
  const [showAll, setShowAll] = useState(false);
  const newestFirst = [...entries].reverse();
  const visible = showAll ? newestFirst : newestFirst.slice(0, limit);
  if (visible.length === 0) return null;

  return (
    <div id="weight-entries" className="mt-4 border-t pt-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gray-500">Entries</p>
      <ul className="divide-y divide-gray-100">
        {visible.map((entry) => (
          <EntryRow key={entry.id} entry={entry} />
        ))}
      </ul>
      {newestFirst.length > limit && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-1 min-h-11 text-sm font-medium text-[#944a00] hover:underline"
        >
          {showAll ? 'Show fewer' : `Show all ${newestFirst.length}`}
        </button>
      )}
    </div>
  );
}
