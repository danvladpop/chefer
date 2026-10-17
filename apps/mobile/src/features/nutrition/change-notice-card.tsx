import { useState } from 'react';
import { View } from 'react-native';
import type { TargetChangeField, TargetChangeReason } from '@chefer/types';
import { Button, Card, ConfirmSheet, Text, useSnackbar } from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { useNumbersMode } from '../numbers-mode/numbers-mode';

// ─── ChangeNoticeCard (§2.11, T-11.1/T-11.5) ────────────────────────────────────
// "Never change your targets silently" made visible: the tracker shows this
// whenever `targets.changes` has an unresolved row (written by
// targets.get/tracker.getDay's detection). Own kcal target NEVER moves
// silently (AC2) — a CHANGED row already applied the new number, and "Keep"
// restores the old one as the user's own; a SUGGESTED row (an informational
// drift notice, or the coach's proposal) applies nothing until accepted.

const REASON_HEADING: Record<TargetChangeReason, string> = {
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

function fieldLine(f: TargetChangeField): string {
  const label = FIELD_LABEL[f.field] ?? f.field;
  const unit = f.field === 'dailyCalorieTarget' ? ' kcal' : ' g';
  return `${label}: ${f.before}${unit} → ${f.after}${unit}`;
}

export function ChangeNoticeCard() {
  const utils = trpc.useUtils();
  const snackbar = useSnackbar();
  const { data: changes } = trpc.targets.changes.useQuery();
  const change = changes?.[0];
  // WP-08: protein-only mode lists the protein change only, and never quotes kcal.
  const { proteinOnly } = useNumbersMode();
  // UX-FOOD-14: "Keep" on an already-applied change fixes the targets at the
  // old numbers (it switches the user to "My own"), so it asks first.
  const [confirmKeepOpen, setConfirmKeepOpen] = useState(false);

  const acknowledge = trpc.targets.acknowledgeChange.useMutation({
    // The confirm sheet shows a failed Keep itself.
    meta: { silent: true },
    onSuccess: (_result, variables) => {
      void utils.targets.changes.invalidate();
      void utils.targets.get.invalidate();
      void utils.tracker.getDay.invalidate();
      void utils.dashboard.summary.invalidate();
      if (confirmKeepOpen && variables.keep) {
        setConfirmKeepOpen(false);
        snackbar.show({
          message: 'Your targets are fixed now. Switch back to Suggested in Preferences any time.',
          tone: 'success',
        });
      }
    },
  });

  if (!change) return null;

  // The router returns the Prisma-shaped row (fields: Json, reason: string);
  // both narrow to the @chefer/types shapes at runtime (targetsService only
  // ever writes them that way).
  const fields = change.fields as unknown as TargetChangeField[];
  const reason = change.reason as TargetChangeReason;
  const isSuggested = change.kind === 'SUGGESTED';
  // AC2: an own target's notice reads "Suggested change" — it's informational
  // (or the coach's proposal), never an already-applied number.
  const badgeLabel = isSuggested ? 'Suggested change' : 'Target changed';
  const kcalField = proteinOnly ? undefined : fields.find((f) => f.field === 'dailyCalorieTarget');
  const shownFields = proteinOnly ? fields.filter((f) => f.field === 'proteinG') : fields;
  const keepLabel = isSuggested
    ? 'Keep mine'
    : kcalField
      ? `Keep ${kcalField.before}`
      : 'Keep mine';
  const useLabel = kcalField ? `Use ${kcalField.after}` : isSuggested ? 'Use suggested' : 'Use new';

  return (
    <Card testID="change-notice-card" className="gap-3 border-2 border-amber-300 bg-amber-50">
      <View className="flex-row items-center gap-2">
        <View className="rounded-full bg-amber-200 px-2 py-0.5">
          <Text className="text-xs font-semibold uppercase text-amber-900">{badgeLabel}</Text>
        </View>
      </View>
      <Text className="text-sm font-semibold text-gray-900">{REASON_HEADING[reason]}</Text>
      <View className="gap-1">
        {shownFields.map((f) => (
          <Text key={f.field} className="text-xs text-gray-700">
            {fieldLine(f)}
          </Text>
        ))}
      </View>
      <View className="flex-row gap-2">
        <Button
          testID="change-notice-keep"
          variant="outline"
          className="flex-1"
          loading={acknowledge.isPending && acknowledge.variables.keep && !confirmKeepOpen}
          onPress={() =>
            isSuggested
              ? acknowledge.mutate({ id: change.id, keep: true })
              : setConfirmKeepOpen(true)
          }
        >
          {keepLabel}
        </Button>
        <Button
          testID="change-notice-use-new"
          className="flex-1"
          loading={acknowledge.isPending && !acknowledge.variables.keep}
          onPress={() => acknowledge.mutate({ id: change.id, keep: false })}
        >
          {useLabel}
        </Button>
      </View>
      <ConfirmSheet
        visible={confirmKeepOpen}
        onClose={() => setConfirmKeepOpen(false)}
        title={kcalField ? `Keep ${kcalField.before} kcal?` : 'Keep your old targets?'}
        body="Your targets will stay at these numbers and stop following your profile. You can switch back to Suggested in Preferences any time."
        confirmLabel="Keep my numbers"
        cancelLabel="Cancel"
        onConfirm={() => acknowledge.mutate({ id: change.id, keep: true })}
        busy={acknowledge.isPending}
        error={
          acknowledge.isError
            ? `Couldn't keep your targets. ${userFacingErrorMessage(acknowledge.error)}`
            : null
        }
        testID="change-notice-keep-confirm"
      />
    </Card>
  );
}
