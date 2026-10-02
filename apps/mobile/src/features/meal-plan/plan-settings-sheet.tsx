import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PlanShape } from '@chefer/types';
import { Button, colors, Sheet, Text } from '@chefer/ui-mobile';
import { PREMIUM_PITCH_COPY, userFacingErrorMessage } from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { openPremium } from '../premium/open-premium';
import { PremiumHost } from '../premium/premium-host';
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
  /**
   * T-06.7: `Fit meals to my training days`. Pass it only when the user has
   * training days — the switch is hidden otherwise. Premium gets a working
   * switch; free sees it disabled with a lock and the PAT-3 taste link. The
   * value is sent with the next generate call (this sheet never generates).
   */
  fitTraining?: { value: boolean; onChange: (value: boolean) => void };
}

export function PlanSettingsSheet({
  visible,
  onClose,
  hasPlan,
  weekLabel,
  isPremium,
  onSaved,
  fitTraining,
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

          {(isPremium || fitTraining) && (
            <View className="gap-2 border-t border-border pt-4">
              <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                Options
              </Text>
              {isPremium && (
                <View className="min-h-11 flex-row items-center justify-between gap-3">
                  <Text className="min-w-0 flex-1 text-sm text-gray-700">
                    Cook once, eat twice (leftover lunches)
                  </Text>
                  <Switch
                    testID="plan-settings-leftovers"
                    accessibilityLabel="Cook once, eat twice (leftover lunches)"
                    value={draft.leftovers}
                    onValueChange={(leftovers) => setDraft({ ...draft, leftovers })}
                  />
                </View>
              )}
              {fitTraining && (
                <View className="gap-1">
                  <View className="min-h-11 flex-row items-center justify-between gap-3">
                    <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
                      {!isPremium && (
                        <Ionicons
                          name="lock-closed-outline"
                          size={14}
                          color={colors.mutedForeground}
                        />
                      )}
                      <Text className="min-w-0 flex-shrink text-sm text-gray-700">
                        Fit meals to my training days
                      </Text>
                    </View>
                    <Switch
                      testID="plan-settings-fit-training"
                      accessibilityLabel="Fit meals to my training days"
                      disabled={!isPremium}
                      value={isPremium ? fitTraining.value : false}
                      onValueChange={fitTraining.onChange}
                    />
                  </View>
                  {!isPremium && (
                    <Pressable
                      testID="plan-settings-fit-training-premium"
                      accessibilityRole="button"
                      onPress={() => openPremium('training-week')}
                      className="min-h-11 justify-center"
                    >
                      <Text className="text-sm font-semibold text-primary">
                        {PREMIUM_PITCH_COPY.seeWhatPremiumAdds}
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          )}

          {setShapeMutation.isError && (
            <Text className="text-xs text-red-600">
              {userFacingErrorMessage(setShapeMutation.error) || 'Could not save — try again.'}
            </Text>
          )}
        </View>
      )}
      {/* The lock's Premium sheet nests here (iOS can't stack root Modals). */}
      {fitTraining && !isPremium && <PremiumHost />}
    </Sheet>
  );
}
