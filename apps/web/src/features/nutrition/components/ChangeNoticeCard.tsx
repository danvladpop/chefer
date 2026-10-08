'use client';

import { useState } from 'react';
import { useNumbersMode } from '@/features/numbers-mode/numbers-mode';
import { trpc } from '@/lib/trpc';
import { Sheet } from '@chefer/ui';
import { userFacingErrorMessage } from '@chefer/utils';

// ─── ChangeNoticeCard (§2.11, T-11.1/T-11.5) ────────────────────────────────────
// Web mirror of mobile's change-notice-card.tsx. "Never change your targets
// silently" made visible: shows the latest unresolved TargetChange
// (targets.changes, written by targets.get/tracker.getDay's detection). A
// CHANGED row already applied the new number — "Keep {before}" restores it as
// the user's own (AC1); a SUGGESTED row (informational drift, or the coach's
// proposal) reads "Suggested change" and applies nothing until "Use {n}" (AC2).

const REASON_HEADING: Record<string, string> = {
  GYM_SETUP: 'Your gym setup changed your targets',
  WEIGHT: 'A new weigh-in changed your targets',
  GOAL: 'Your goal changed your targets',
  DAY_KIND: 'Your training days changed your targets',
  COACH: 'Your coach suggests a change',
};

const FIELD_LABEL: Record<string, string> = {
  dailyCalorieTarget: 'Calories',
  proteinG: 'Protein',
  carbsG: 'Carbs',
  fatG: 'Fat',
};

interface TargetChangeField {
  field: string;
  before: number | string | null;
  after: number | string | null;
}

function fieldLine(f: TargetChangeField): string {
  const label = FIELD_LABEL[f.field] ?? f.field;
  const unit = f.field === 'dailyCalorieTarget' ? ' kcal' : ' g';
  return `${label}: ${f.before}${unit} → ${f.after}${unit}`;
}

export function ChangeNoticeCard() {
  const utils = trpc.useUtils();
  const { data: changes } = trpc.targets.changes.useQuery();
  const change = changes?.[0];
  // WP-08: protein-only mode lists the protein change only, and never quotes kcal.
  const { proteinOnly } = useNumbersMode();
  // UX-FOOD-14: "Keep" on an already-applied change fixes the targets at the
  // old numbers (it switches the user to "My own"), so it asks first.
  const [confirmKeepOpen, setConfirmKeepOpen] = useState(false);

  const acknowledge = trpc.targets.acknowledgeChange.useMutation({
    onSuccess: () => {
      setConfirmKeepOpen(false);
      void utils.targets.changes.invalidate();
      void utils.targets.get.invalidate();
      void utils.tracker.getDay.invalidate();
      void utils.dashboard.summary.invalidate();
    },
  });

  if (!change) return null;

  const fields = change.fields as unknown as TargetChangeField[];
  const isSuggested = change.kind === 'SUGGESTED';
  const badgeLabel = isSuggested ? 'Suggested change' : 'Target changed';
  const kcalField = proteinOnly ? undefined : fields.find((f) => f.field === 'dailyCalorieTarget');
  const shownFields = proteinOnly ? fields.filter((f) => f.field === 'proteinG') : fields;
  const keepLabel = isSuggested
    ? 'Keep mine'
    : kcalField
      ? `Keep ${kcalField.before}`
      : 'Keep mine';
  const useLabel = kcalField ? `Use ${kcalField.after}` : 'Use new';

  return (
    <div
      data-testid="change-notice-card"
      className="mb-6 rounded-2xl border-2 border-amber-300 bg-amber-50 p-5"
    >
      <span className="inline-block rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold uppercase text-amber-900">
        {badgeLabel}
      </span>
      <p className="mt-2 text-sm font-semibold text-neutral-900">
        {REASON_HEADING[change.reason] ?? 'Your targets changed'}
      </p>
      <ul className="mt-2 space-y-0.5">
        {shownFields.map((f) => (
          <li key={f.field} className="text-xs text-neutral-700">
            {fieldLine(f)}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          data-testid="change-notice-keep"
          onClick={() =>
            isSuggested
              ? acknowledge.mutate({ id: change.id, keep: true })
              : setConfirmKeepOpen(true)
          }
          className="h-10 flex-1 rounded-md border border-neutral-300 text-sm font-medium hover:bg-neutral-50"
        >
          {keepLabel}
        </button>
        <button
          type="button"
          data-testid="change-notice-use-new"
          onClick={() => acknowledge.mutate({ id: change.id, keep: false })}
          className="h-10 flex-1 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {useLabel}
        </button>
      </div>

      <Sheet
        open={confirmKeepOpen}
        onClose={() => setConfirmKeepOpen(false)}
        title={kcalField ? `Keep ${kcalField.before} kcal?` : 'Keep your old targets?'}
        description="Your targets will stay at these numbers and stop following your profile. You can switch back to Suggested in Preferences any time."
        size="sm"
        footer={
          <div className="flex w-full flex-col gap-2 px-5 pb-2">
            {acknowledge.isError && (
              <p role="alert" className="text-sm text-red-600">
                Couldn&apos;t keep your targets. {userFacingErrorMessage(acknowledge.error)}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmKeepOpen(false)}
                className="min-h-11 flex-1 rounded-xl border border-neutral-200 px-4 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="change-notice-keep-confirm"
                disabled={acknowledge.isPending}
                onClick={() => acknowledge.mutate({ id: change.id, keep: true })}
                className="min-h-11 flex-1 rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white hover:bg-[#7a3d00] disabled:opacity-50"
              >
                {acknowledge.isPending ? 'Keeping…' : 'Keep my numbers'}
              </button>
            </div>
          </div>
        }
      >
        <div />
      </Sheet>
    </div>
  );
}
