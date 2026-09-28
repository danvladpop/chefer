import { useEffect, useState } from 'react';
import { ActivityIndicator, Switch, View } from 'react-native';
import type { PlanShape } from '@chefer/types';
import { Button, Sheet, Text } from '@chefer/ui-mobile';
import { trpc } from '../../lib/trpc';
import { HowYouCookForm } from './how-you-cook-form';

// PLAN SETTINGS SHEET (UX-07 §1/§2) — the same HowYouCookForm, opened from
// the Plan tab's empty-week "Change what we plan" and the header's
// `sliders-outline` "Plan settings" button. Persists via `mealPlan.setShape`;
// it never regenerates by itself — the caller (`app/(food)/meal-plan.tsx`)
// decides whether a plan already exists for the week and, if so, follows up
// with the UX-08 regenerate confirm.

export interface PlanSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Whether the current week already has a plan — changes the footer copy
   * (interaction spec: "Save" vs "Save and re-plan {week}"). */
  hasPlan: boolean;
  /** `{week}` for the footer, e.g. "this week" / "next week". */
  weekLabel: string;
  isPremium: boolean;
  onSaved: (shape: PlanShape & { leftovers: boolean }) => void;
}

export function PlanSettingsSheet({
  visible,
  onClose,
  hasPlan,
  weekLabel,
  isPremium,
  onSaved,
}: PlanSettingsSheetProps) {
  const { data, isLoading } = trpc.mealPlan.getShape.useQuery(undefined, { enabled: visible });
  const [draft, setDraft] = useState<(PlanShape & { leftovers: boolean }) | null>(null);
  const setShapeMutation = trpc.mealPlan.setShape.useMutation();

  // Start every open from the server's current shape — a stale local draft
  // from a previous open (or a change saved elsewhere) would silently
  // overwrite it otherwise.
  useEffect(() => {
    if (visible && data) setDraft(data);
    if (!visible) {
      setDraft(null);
      setShapeMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on open/close, not every `data` refresh
  }, [visible, data]);

  const handleSave = () => {
    if (!draft) return;
    setShapeMutation.mutate(draft, {
      onSuccess: (saved) => {
        onSaved(saved);
        onClose();
      },
    });
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      eyebrow="How you cook"
      title="Plan settings"
      testID="plan-settings"
      footer={
        <Button
          testID="plan-settings-save"
          loading={setShapeMutation.isPending}
          disabled={!draft}
          onPress={handleSave}
        >
          {hasPlan ? `Save and re-plan ${weekLabel}` : 'Save'}
        </Button>
      }
    >
      {isLoading || !draft ? (
        <View className="items-center py-10">
          <ActivityIndicator size="large" color="#944a00" />
        </View>
      ) : (
        <View className="gap-5 pb-2">
          <HowYouCookForm shape={draft} onChange={(shape) => setDraft({ ...draft, ...shape })} />

          {isPremium && (
            <View className="gap-2 border-t border-border pt-4">
              <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                Options
              </Text>
              <View className="min-h-11 flex-row items-center justify-between">
                <Text className="flex-1 text-sm text-gray-700">
                  Cook once, eat twice (leftover lunches)
                </Text>
                <Switch
                  testID="plan-settings-leftovers"
                  value={draft.leftovers}
                  onValueChange={(leftovers) => setDraft({ ...draft, leftovers })}
                />
              </View>
            </View>
          )}

          {setShapeMutation.isError && (
            <Text className="text-xs text-red-600">
              {setShapeMutation.error.message || 'Could not save — try again.'}
            </Text>
          )}
        </View>
      )}
    </Sheet>
  );
}
