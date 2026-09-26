'use client';

import { useEffect, useRef, useState } from 'react';
import { UpgradeButton } from '@/features/premium/components/UpgradeButton';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { Camera, Loader2, Sparkles } from 'lucide-react';
import { Sheet } from '@chefer/ui';
import { handleRebalanceResult } from '../lib/rebalance-storage';
import {
  scanMealPhoto,
  ScanUpgradeRequiredError,
  type MealPhotoEstimate,
} from '../lib/scan-client';

// ─── Snap-to-Log camera button (F4) ───────────────────────────────────────────
// Premium: photo → vision estimate → editable confirm sheet → custom entry in
// today's log. Free: the button stays visible (ghost state, §6.4) and opens a
// demo sheet — a sample scan animating into macros — with the snap-scan
// upgrade touchpoint.

const CONFIDENCE_STYLE: Record<MealPhotoEstimate['confidence'], { label: string; cls: string }> = {
  high: { label: 'high confidence', cls: 'bg-emerald-100 text-emerald-700' },
  med: { label: 'medium confidence', cls: 'bg-amber-100 text-amber-700' },
  low: { label: 'low confidence', cls: 'bg-red-100 text-red-700' },
};

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

interface ScanMealButtonProps {
  /** YYYY-MM-DD day the entry is logged to (the tracker's selected day). */
  date: string;
  isPremium: boolean | undefined;
  /** Called after a confirmed log so the page can refetch the day. */
  onLogged: () => void;
}

export function ScanMealButton({ date, isPremium, onLogged }: ScanMealButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<MealPhotoEstimate | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);

  // Editable confirm-sheet fields, seeded from the estimate.
  const [name, setName] = useState('');
  const [mealType, setMealType] = useState<(typeof MEAL_TYPES)[number]>('lunch');
  const [kcal, setKcal] = useState(0);
  const [protein, setProtein] = useState(0);
  const [carbs, setCarbs] = useState(0);
  const [fat, setFat] = useState(0);

  const logMutation = trpc.tracker.logCustomMeal.useMutation({
    onSuccess: (data) => {
      capture('meal_scanned', { confirmed: true });
      handleRebalanceResult(data.rebalance);
      setEstimate(null);
      onLogged();
    },
  });

  const openPicker = () => {
    if (isPremium === undefined) return; // still loading the tier
    if (!isPremium) {
      // Ghost state (§6.4): the demo sheet IS the upgrade prompt impression.
      capture('upgrade_prompt_shown', { source: 'snap-scan' });
      capture('teaser_engaged', { feature: 'snap' });
      setDemoOpen(true);
      return;
    }
    setScanError(null);
    fileInputRef.current?.click();
  };

  const onFileChosen = async (file: File | undefined) => {
    if (!file || scanning) return;
    setScanning(true);
    setScanError(null);
    try {
      const result = await scanMealPhoto(file);
      setEstimate(result);
      setName(result.dishName);
      setKcal(result.kcal);
      setProtein(result.protein);
      setCarbs(result.carbs);
      setFat(result.fat);
    } catch (err) {
      if (err instanceof ScanUpgradeRequiredError) {
        capture('upgrade_prompt_shown', { source: 'snap-scan' });
        setDemoOpen(true);
      } else {
        setScanError(err instanceof Error ? err.message : 'Scan failed. Please try again.');
      }
    } finally {
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const discardEstimate = () => {
    capture('meal_scanned', { confirmed: false });
    setEstimate(null);
  };

  const numberField = (
    label: string,
    value: number,
    setValue: (v: number) => void,
    unit: string,
    max: number,
  ) => (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-neutral-600">
      {label}
      <span className="flex items-center gap-1">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          value={value}
          onChange={(e) => setValue(Math.max(0, Math.min(max, Number(e.target.value) || 0)))}
          className="min-h-11 w-full min-w-0 rounded-xl border border-neutral-200 px-3 text-sm text-neutral-900"
        />
        <span className="shrink-0 text-neutral-400">{unit}</span>
      </span>
    </label>
  );

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        disabled={scanning}
        className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-[#944a00]/30 bg-white px-3 text-sm font-semibold text-[#944a00] shadow-sm transition hover:bg-[#fff8f0] disabled:opacity-60"
      >
        {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        {scanning ? 'Reading your plate…' : 'Scan a meal'}
        {isPremium === false && <Sparkles className="h-3.5 w-3.5 text-amber-500" />}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void onFileChosen(e.target.files?.[0])}
      />

      {scanError && <p className="w-full text-xs text-red-600">{scanError}</p>}

      {/* ── Confirm sheet: editable numbers, honest confidence ── */}
      <Sheet
        open={estimate !== null}
        onClose={discardEstimate}
        title="Log this meal?"
        description="The chef's estimate — adjust anything before logging."
        size="md"
        footer={
          <button
            type="button"
            onClick={() =>
              logMutation.mutate({
                date,
                name: name.trim() || 'Scanned meal',
                estimatedBy: 'vision',
                mealType,
                kcal,
                protein,
                carbs,
                fat,
              })
            }
            disabled={logMutation.isPending}
            className="min-h-11 w-full rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white transition hover:bg-[#7a3d00] disabled:opacity-50"
          >
            {logMutation.isPending ? 'Logging…' : `Log ${kcal} kcal`}
          </button>
        }
      >
        {estimate && (
          <div className="space-y-4 px-5 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${CONFIDENCE_STYLE[estimate.confidence].cls}`}
              >
                {CONFIDENCE_STYLE[estimate.confidence].label}
              </span>
              <span className="min-w-0 flex-1 text-xs text-neutral-500">
                {estimate.portionNote}
              </span>
            </div>

            <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
              Dish
              <input
                type="text"
                value={name}
                maxLength={200}
                onChange={(e) => setName(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm text-neutral-900"
              />
            </label>

            <div role="group" aria-label="Meal type" className="flex gap-1">
              {MEAL_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setMealType(t)}
                  aria-pressed={mealType === t}
                  className={`min-h-11 flex-1 rounded-xl text-xs font-medium capitalize transition ${mealType === t ? 'bg-[#944a00] text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {numberField('Calories', kcal, setKcal, 'kcal', 5000)}
              {numberField('Protein', protein, setProtein, 'g', 500)}
              {numberField('Carbs', carbs, setCarbs, 'g', 1000)}
              {numberField('Fat', fat, setFat, 'g', 500)}
            </div>

            {logMutation.isError && (
              <p className="text-xs text-red-600">{logMutation.error.message}</p>
            )}
          </div>
        )}
      </Sheet>

      {/* ── Free-tier demo sheet (ghost state, §6.4) ── */}
      <Sheet
        open={demoOpen}
        onClose={() => setDemoOpen(false)}
        title="Snap a photo, log the meal"
        description="Here's what a scan looks like — on your own plate with premium."
        size="sm"
        footer={<UpgradeButton className="w-full px-4 py-2.5 text-sm" source="snap-scan" />}
      >
        <div className="px-5 pb-4">
          <DemoScan />
          <p className="mt-4 text-sm text-neutral-600">
            Photograph any plate — restaurant, leftovers, grandma&apos;s — and the chef estimates
            the dish and macros, logs it, and quietly rebalances the rest of your week to keep you
            on track.
          </p>
        </div>
      </Sheet>
    </>
  );
}

/** Sample scan animating into macros — pure CSS/state, no network. */
function DemoScan() {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const macros = [
    { label: 'kcal', value: 520 },
    { label: 'protein', value: '38g' },
    { label: 'carbs', value: '55g' },
    { label: 'fat', value: '14g' },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200">
      <div className="relative flex h-32 items-center justify-center bg-gradient-to-br from-emerald-50 via-amber-50 to-orange-100">
        <span aria-hidden="true" className="text-5xl">
          🍗
        </span>
        {!revealed && (
          <div className="absolute inset-x-0 top-0 h-1 animate-pulse bg-[#944a00]/60 [animation-duration:600ms]" />
        )}
        {!revealed && (
          <span className="absolute bottom-2 rounded-full bg-white/80 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-[#944a00]">
            scanning…
          </span>
        )}
      </div>
      <div
        className={`grid grid-cols-4 divide-x divide-neutral-100 bg-white transition-opacity duration-500 ${revealed ? 'opacity-100' : 'opacity-0'}`}
      >
        {macros.map((m) => (
          <div key={m.label} className="px-2 py-3 text-center">
            <p className="text-sm font-bold text-neutral-900">{m.value}</p>
            <p className="text-xs uppercase tracking-wide text-neutral-500">{m.label}</p>
          </div>
        ))}
      </div>
      <div className="border-t border-neutral-100 bg-white px-3 pb-3 pt-1 text-xs text-neutral-500">
        Grilled chicken with rice &amp; vegetables —{' '}
        <span className="font-medium text-amber-600">medium confidence</span>
      </div>
    </div>
  );
}
