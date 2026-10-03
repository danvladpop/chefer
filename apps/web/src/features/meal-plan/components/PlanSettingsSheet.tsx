'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { HouseholdTableSummary } from '@/features/meal-plan/components/HouseholdTableSummary';
import { UpgradeButton } from '@/features/premium/components/UpgradeButton';
import { trpc } from '@/lib/trpc';
import { useQueryState } from '@/lib/use-query-state';
import { Lock } from 'lucide-react';
import type { PlanShape, PlanSlot } from '@chefer/types';
import { ErrorState, Sheet } from '@chefer/ui';
import { cn, householdTableSummary, planShapeSummary, userFacingErrorMessage } from '@chefer/utils';

// ─── Plan settings (T-07.6 web parity of the mobile HowYouCookForm /
// plan-settings-sheet.tsx) ──────────────────────────────────────────────────
// Which meals to plan, which days, an optional prep+cook time cap (with a
// weekend exemption) and "cooking for 1 or 2" — the same `mealPlan.getShape`/
// `setShape` procedures mobile uses (UX-07 §1). This sheet only PERSISTS the
// shape; it never regenerates by itself — the caller decides whether a plan
// already exists for the week and, if so, follows up with the regenerate
// confirm (interaction spec: settings never regenerate silently).

type DraftShape = PlanShape & { leftovers: boolean };

const SLOT_OPTIONS: { value: PlanSlot; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snacks' },
];

const DAY_OPTIONS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const TIME_CAP_OPTIONS: { value: '15' | '30' | '45' | 'none'; label: string }[] = [
  { value: '15', label: '≤ 15 min' },
  { value: '30', label: '≤ 30 min' },
  { value: '45', label: '≤ 45 min' },
  { value: 'none', label: 'No limit' },
];

function Chip({
  selected,
  onClick,
  children,
  testId,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'min-h-11 rounded-full border px-3.5 text-sm font-medium transition-colors',
        selected
          ? 'border-[#944a00] bg-[#944a00] text-white'
          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
      )}
    >
      {children}
    </button>
  );
}

export interface PlanSettingsSheetProps {
  open: boolean;
  onClose: () => void;
  /** Whether the current week already has a plan — changes the footer copy. */
  hasPlan: boolean;
  /** `{week}` for the footer, e.g. "this week" / "next week". */
  weekLabel: string;
  isPremium: boolean;
  onSaved: (shape: DraftShape) => void;
  /**
   * T-06.8 (UX-06 §4): premium `Fit meals to my training days`. A per-generation
   * option (the API takes it on `mealPlan.generate`, it is not part of the
   * stored shape), so the page owns the state. Free sees it locked.
   */
  fitTrainingDays?: boolean;
  onFitTrainingDaysChange?: (value: boolean) => void;
}

export function PlanSettingsSheet({
  open,
  onClose,
  hasPlan,
  weekLabel,
  isPremium,
  onSaved,
  fitTrainingDays = true,
  onFitTrainingDaysChange,
}: PlanSettingsSheetProps) {
  const shapeQuery = trpc.mealPlan.getShape.useQuery(undefined, { enabled: open });
  // UX-PLAN-12: a household's "Cooking for" is read-only, from the table.
  const householdQuery = trpc.household.list.useQuery(undefined, {
    enabled: open,
    staleTime: 60_000,
  });
  const table = householdTableSummary(householdQuery.data ?? []);
  const { data } = shapeQuery;
  const { state: loadState, retry } = useQueryState(shapeQuery);
  const [draft, setDraft] = useState<DraftShape | null>(null);
  const setShapeMutation = trpc.mealPlan.setShape.useMutation({ meta: { silent: true } });

  // Start every open from the server's current shape — a stale local draft
  // from a previous open (or a change saved elsewhere) would silently
  // overwrite it otherwise.
  useEffect(() => {
    if (open && data) setDraft(data);
    if (!open) {
      setDraft(null);
      setShapeMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on open/close, not every `data` refresh
  }, [open, data]);

  const handleSave = () => {
    if (!draft) return;
    setShapeMutation.mutate(draft, {
      onSuccess: (saved) => {
        onSaved(saved);
        onClose();
      },
    });
  };

  const timeCapValue = draft?.timeCapMins == null ? 'none' : String(draft.timeCapMins);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Plan settings"
      description="How you cook"
      footer={
        <button
          type="button"
          data-testid="plan-settings-save"
          disabled={!draft || setShapeMutation.isPending}
          onClick={handleSave}
          className="flex h-11 w-full items-center justify-center rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#7a3d00] disabled:opacity-50"
        >
          {setShapeMutation.isPending
            ? 'Saving…'
            : hasPlan
              ? `Save and re-plan ${weekLabel}`
              : 'Save'}
        </button>
      }
    >
      <div className="px-5 pb-4">
        {loadState === 'error' ? (
          // UX-X-12: a failed load is not a spinner forever.
          <div data-testid="plan-settings-load-error">
            <ErrorState title="Couldn't load your plan settings" onRetry={retry} />
          </div>
        ) : !draft ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-[#944a00]/20 border-t-[#944a00]" />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <fieldset className="flex flex-col gap-2">
              <legend className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                Which meals should we plan?
              </legend>
              <div className="flex flex-wrap gap-2">
                {SLOT_OPTIONS.map(({ value, label }) => {
                  const selected = draft.slots.includes(value);
                  return (
                    <Chip
                      key={value}
                      testId={`plan-settings-slot-${value}`}
                      selected={selected}
                      onClick={() => {
                        const slots = selected
                          ? draft.slots.filter((s) => s !== value)
                          : [...draft.slots, value];
                        if (slots.length === 0) return; // validation: pick at least one meal
                        setDraft({ ...draft, slots });
                      }}
                    >
                      {label}
                    </Chip>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                On which days?
              </legend>
              <div className="flex flex-wrap gap-2">
                {DAY_OPTIONS.map((label, value) => {
                  const selected = draft.days.includes(value);
                  return (
                    <Chip
                      key={value}
                      testId={`plan-settings-day-${value}`}
                      selected={selected}
                      onClick={() => {
                        const days = selected
                          ? draft.days.filter((d) => d !== value)
                          : [...draft.days, value].sort((a, b) => a - b);
                        if (days.length === 0) return; // validation: pick at least one day
                        setDraft({ ...draft, days });
                      }}
                    >
                      {label}
                    </Chip>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                How long can you cook on those days?
              </legend>
              <div
                role="radiogroup"
                aria-label="How long can you cook on those days?"
                className="flex flex-wrap gap-2"
              >
                {TIME_CAP_OPTIONS.map(({ value, label }) => (
                  <Chip
                    key={value}
                    testId={`plan-settings-time-${value}`}
                    selected={timeCapValue === value}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        timeCapMins: value === 'none' ? null : (Number(value) as 15 | 30 | 45),
                      })
                    }
                  >
                    {label}
                  </Chip>
                ))}
              </div>
              <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-gray-700">
                Weekends can take longer
                <input
                  type="checkbox"
                  data-testid="plan-settings-weekend-no-limit"
                  checked={draft.weekendNoLimit}
                  onChange={(e) => setDraft({ ...draft, weekendNoLimit: e.target.checked })}
                  className="h-5 w-5 rounded border-gray-300 text-[#944a00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#944a00]"
                />
              </label>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                Cooking for
              </legend>
              {table ? (
                <HouseholdTableSummary table={table} testId="plan-settings-household-summary" />
              ) : (
                <>
                  <div role="radiogroup" aria-label="Cooking for" className="flex flex-wrap gap-2">
                    <Chip
                      testId="plan-settings-for-1"
                      selected={draft.cookingFor == null || draft.cookingFor === 1}
                      onClick={() => setDraft({ ...draft, cookingFor: 1 })}
                    >
                      Just me
                    </Chip>
                    <Chip
                      testId="plan-settings-for-2"
                      selected={draft.cookingFor === 2}
                      onClick={() => setDraft({ ...draft, cookingFor: 2 })}
                    >
                      Two of us
                    </Chip>
                  </div>
                  <Link
                    href="/preferences#household"
                    data-testid="plan-settings-household-link"
                    className="text-xs font-semibold text-[#944a00] hover:underline"
                  >
                    Household of 3+? Set up your table ›
                  </Link>
                </>
              )}
            </fieldset>

            <div className="flex flex-col gap-2 border-t border-gray-200 pt-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                Options
              </p>
              {isPremium && (
                <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-gray-700">
                  Cook once, eat twice (leftover lunches)
                  <input
                    type="checkbox"
                    data-testid="plan-settings-leftovers"
                    checked={draft.leftovers}
                    onChange={(e) => setDraft({ ...draft, leftovers: e.target.checked })}
                    className="h-5 w-5 rounded border-gray-300 text-[#944a00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#944a00]"
                  />
                </label>
              )}
              {isPremium ? (
                <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-gray-700">
                  Fit meals to my training days
                  <input
                    type="checkbox"
                    role="switch"
                    data-testid="plan-settings-fit-training"
                    checked={fitTrainingDays}
                    onChange={(e) => onFitTrainingDaysChange?.(e.target.checked)}
                    className="h-5 w-5 rounded border-gray-300 text-[#944a00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#944a00]"
                  />
                </label>
              ) : (
                <div
                  data-testid="plan-settings-fit-training-locked"
                  className="flex flex-col gap-1"
                >
                  <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-gray-500">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      Fit meals to my training days
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      disabled
                      checked={false}
                      readOnly
                      data-testid="plan-settings-fit-training"
                      className="h-5 w-5 rounded border-gray-300"
                    />
                  </label>
                  <UpgradeButton source="fit-training-days" className="self-start" />
                </div>
              )}
            </div>

            <div aria-live="polite" className="rounded-xl bg-gray-50 px-3 py-2.5">
              <p data-testid="plan-settings-summary" className="text-sm text-gray-700">
                {planShapeSummary(draft, table ? (householdQuery.data?.length ?? 0) + 1 : null)}
              </p>
            </div>

            {setShapeMutation.isError && (
              <p className="text-xs text-red-600">
                {userFacingErrorMessage(setShapeMutation.error, 'Could not save — try again.')}
              </p>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
