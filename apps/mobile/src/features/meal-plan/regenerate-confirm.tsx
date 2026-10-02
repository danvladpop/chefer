import { ConfirmSheet } from '@chefer/ui-mobile';
import { regenerateConfirmBody } from '@chefer/utils';

// UX-08 §3 (PAT-5): Regenerate always asks; "Keep" defaults on and only shows
// when picks exist. UX-PLAN-01: the body promises what the server keeps (past
// days and logged meals). UX-PLAN-03: while the generation runs the confirm
// button spins and ignores taps, and a failure — the free-quota message
// included — is shown here instead of leaving the sheet open and silent.

export interface RegenerateConfirmProps {
  visible: boolean;
  onClose: () => void;
  weekLabel: string;
  /** 0 = this week, 1 = next week … */
  weekOffset: number;
  plannedMealsCount: number;
  /** How many of the user's own picks the week holds (0 hides the switch). */
  pinnedCount: number;
  keepPicks: boolean;
  onKeepPicksChange: (value: boolean) => void;
  /** A generation is in flight. */
  busy: boolean;
  /** User-facing text of the last failure, if any. */
  error: string | null;
  onConfirm: () => void;
}

export function RegenerateConfirm({
  visible,
  onClose,
  weekLabel,
  weekOffset,
  plannedMealsCount,
  pinnedCount,
  keepPicks,
  onKeepPicksChange,
  busy,
  error,
  onConfirm,
}: RegenerateConfirmProps) {
  return (
    <ConfirmSheet
      testID="regenerate-confirm"
      visible={visible}
      onClose={onClose}
      title={`Regenerate ${weekLabel}?`}
      body={regenerateConfirmBody(weekOffset, plannedMealsCount)}
      confirmLabel={`Regenerate ${weekLabel}`}
      cancelLabel="Cancel"
      busy={busy}
      error={error}
      onConfirm={onConfirm}
      {...(pinnedCount > 0 && {
        options: [
          {
            label: `Keep the ${pinnedCount} meal${pinnedCount === 1 ? '' : 's'} you chose`,
            value: keepPicks,
            onChange: onKeepPicksChange,
          },
        ],
      })}
    />
  );
}
