'use client';

import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';

// ─── TargetsCard (§2.11, T-35.3) ────────────────────────────────────────────────
// Web mirror of mobile's targets-card.tsx. Suggested (read-only, computed) or
// My own (editable kcal/protein/carbs/fat) via targets.get/set. Bounds mirror
// the server's (targets.router.ts) — the server is still the source of truth
// (AC4); this is a friendlier inline message before the round trip. The
// training-day pair (customTrainingKcal/customTrainingProteinG,
// addTrainingBonus) is API-ready but has no UI here yet.

function parseIntOrNull(text: string): number | null {
  const n = parseInt(text, 10);
  return Number.isFinite(n) ? n : null;
}

export function TargetsCard() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.targets.get.useQuery();

  const [mode, setMode] = useState<'SUGGESTED' | 'OWN'>('SUGGESTED');
  const [kcalText, setKcalText] = useState('');
  const [proteinText, setProteinText] = useState('');
  const [carbsText, setCarbsText] = useState('');
  const [fatText, setFatText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  // Bug B-38 pattern: "Saved ✓" must not stick past a further edit —
  // snapshot exactly what was sent, captured at save-click time.
  const [savedSnapshot, setSavedSnapshot] = useState<{
    mode: 'SUGGESTED' | 'OWN';
    kcalText: string;
    proteinText: string;
    carbsText: string;
    fatText: string;
  } | null>(null);
  const dirty =
    savedSnapshot !== null &&
    (savedSnapshot.mode !== mode ||
      savedSnapshot.kcalText !== kcalText ||
      savedSnapshot.proteinText !== proteinText ||
      savedSnapshot.carbsText !== carbsText ||
      savedSnapshot.fatText !== fatText);

  useEffect(() => {
    if (!data || loaded) return;
    setMode(data.targetMode);
    setKcalText(String(data.custom.kcal ?? data.effective.dailyCalorieTarget));
    setProteinText(String(data.custom.proteinG ?? data.effective.proteinG));
    setCarbsText(String(data.custom.carbsG ?? data.effective.carbsG));
    setFatText(String(data.custom.fatG ?? data.effective.fatG));
    setLoaded(true);
  }, [data, loaded]);

  const setMutation = trpc.targets.set.useMutation({
    onSuccess: () => {
      void utils.targets.get.invalidate();
      void utils.targets.changes.invalidate();
      void utils.dashboard.summary.invalidate();
      void utils.tracker.getDay.invalidate();
      setLocalError(null);
    },
    onError: (err) => setLocalError(err.message),
  });

  const save = () => {
    const snapshot = { mode, kcalText, proteinText, carbsText, fatText };
    if (mode === 'SUGGESTED') {
      setSavedSnapshot(snapshot);
      setMutation.mutate({ targetMode: 'SUGGESTED' });
      return;
    }
    const kcal = parseIntOrNull(kcalText);
    const proteinG = parseIntOrNull(proteinText);
    const carbsG = parseIntOrNull(carbsText);
    const fatG = parseIntOrNull(fatText);
    if (kcal === null || kcal < 1200 || kcal > 5000) {
      setLocalError('Calories must be between 1,200 and 5,000.');
      return;
    }
    if (proteinG === null || proteinG < 40 || proteinG > 400) {
      setLocalError('Protein must be between 40 and 400 g.');
      return;
    }
    setLocalError(null);
    setSavedSnapshot(snapshot);
    setMutation.mutate({
      targetMode: 'OWN',
      kcal,
      proteinG,
      ...(carbsG !== null && { carbsG }),
      ...(fatG !== null && { fatG }),
    });
  };

  if (isLoading || !data) {
    return (
      <section
        id="own-targets"
        className="scroll-mt-20 rounded-xl border bg-card p-4 shadow-sm sm:p-6"
      >
        <h2 className="text-lg font-semibold">Your targets</h2>
        <p className="mt-1 text-sm text-muted-foreground">Loading…</p>
      </section>
    );
  }

  return (
    <section
      id="own-targets"
      className="scroll-mt-20 rounded-xl border bg-card p-4 shadow-sm sm:p-6"
    >
      <h2 className="text-lg font-semibold">Your targets</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Suggested is computed from your body and goal; My own is never changed for you — a gym
        setup, weigh-in or goal edit only ever proposes a change, and you decide.
      </p>

      <div className="mt-3 inline-flex rounded-lg border p-1">
        {(
          [
            { value: 'SUGGESTED' as const, label: 'Suggested' },
            { value: 'OWN' as const, label: 'My own' },
          ] satisfies { value: 'SUGGESTED' | 'OWN'; label: string }[]
        ).map((opt) => (
          <button
            key={opt.value}
            type="button"
            data-testid={`targets-mode-${opt.value.toLowerCase()}`}
            onClick={() => setMode(opt.value)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              mode === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {mode === 'SUGGESTED' ? (
        <div className="mt-4 rounded-xl bg-primary/5 p-4">
          <p className="text-2xl font-bold text-primary">
            {data.suggested.dailyCalorieTarget.toLocaleString()} kcal
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.suggested.proteinG}g protein · {data.suggested.carbsG}g carbs ·{' '}
            {data.suggested.fatG}g fat
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-neutral-700">Calories</span>
            <input
              data-testid="targets-kcal"
              value={kcalText}
              onChange={(e) => setKcalText(e.target.value)}
              inputMode="numeric"
              className="h-10 w-full rounded-md border border-input px-3 text-base"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-neutral-700">Protein (g)</span>
            <input
              data-testid="targets-protein"
              value={proteinText}
              onChange={(e) => setProteinText(e.target.value)}
              inputMode="numeric"
              className="h-10 w-full rounded-md border border-input px-3 text-base"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-neutral-700">Carbs (g)</span>
            <input
              data-testid="targets-carbs"
              value={carbsText}
              onChange={(e) => setCarbsText(e.target.value)}
              inputMode="numeric"
              className="h-10 w-full rounded-md border border-input px-3 text-base"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-neutral-700">Fat (g)</span>
            <input
              data-testid="targets-fat"
              value={fatText}
              onChange={(e) => setFatText(e.target.value)}
              inputMode="numeric"
              className="h-10 w-full rounded-md border border-input px-3 text-base"
            />
          </label>
        </div>
      )}

      <button
        type="button"
        data-testid="targets-save"
        onClick={save}
        disabled={setMutation.isPending}
        className="mt-4 h-10 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 sm:w-auto sm:px-8"
      >
        {setMutation.isPending
          ? 'Saving…'
          : setMutation.isSuccess && !dirty
            ? 'Saved ✓'
            : 'Save targets'}
      </button>
      {(localError ?? setMutation.error?.message) && (
        <p data-testid="targets-error" className="mt-2 text-xs text-red-600">
          {localError ?? setMutation.error?.message}
        </p>
      )}
    </section>
  );
}
