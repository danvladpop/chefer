import { ActivityIndicator, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, Sheet, Text } from '@chefer/ui-mobile';
import { cn, PLAN_WEEK_COPY } from '@chefer/utils';
import type { RebalanceCheckState } from '../tracker/rebalance-offer';
import { useAfterSheetExit } from './after-sheet-exit';

// FB7-11: ONE "Week options" sheet replaces the separate Regenerate and
// "Rebalance my week" buttons. Two described rows: a new plan for the week
// (keeps the pins; always asks first) and the free week rebalance, which is
// disabled — with the reason — when the preview found nothing to swap.

export function WeekOptionsSheet({
  visible,
  onClose,
  onRegenerate,
  regenerating,
  rebalance,
}: {
  visible: boolean;
  onClose: () => void;
  /** Opens the existing RegenerateConfirm (runs once this sheet is gone). */
  onRegenerate: () => void;
  regenerating: boolean;
  /** Absent for a week that cannot be rebalanced (next week). */
  rebalance?: { state: RebalanceCheckState; onPress: () => void } | undefined;
}) {
  const afterExit = useAfterSheetExit();
  const rebalanceState = rebalance?.state;
  const onTrack = rebalanceState === 'on-track';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onExited={afterExit.onExited}
      title={PLAN_WEEK_COPY.optionsTitle}
      testID="plan-week-options-sheet"
    >
      <View className="gap-2 pb-2">
        <OptionRow
          testID="plan-week-options-regenerate"
          icon="refresh-outline"
          title={PLAN_WEEK_COPY.regenerate.title}
          description={PLAN_WEEK_COPY.regenerate.description}
          disabled={regenerating}
          busy={regenerating}
          onPress={() => {
            afterExit.schedule(onRegenerate);
            onClose();
          }}
        />
        {rebalance && (
          <OptionRow
            testID="plan-week-options-rebalance"
            icon="color-wand-outline"
            title={PLAN_WEEK_COPY.rebalance.title}
            description={
              onTrack
                ? PLAN_WEEK_COPY.rebalance.onTrack
                : rebalanceState === 'error'
                  ? PLAN_WEEK_COPY.rebalance.error
                  : PLAN_WEEK_COPY.rebalance.description
            }
            disabled={onTrack || rebalanceState === 'loading'}
            busy={rebalanceState === 'loading'}
            onPress={() => {
              onClose();
              rebalance.onPress();
            }}
          />
        )}
      </View>
    </Sheet>
  );
}

function OptionRow({
  testID,
  icon,
  title,
  description,
  disabled,
  busy,
  onPress,
}: {
  testID: string;
  icon: 'refresh-outline' | 'color-wand-outline';
  title: string;
  description: string;
  disabled: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}`}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'min-h-16 flex-row items-center gap-3 rounded-xl border border-border bg-card px-3 py-3',
        disabled && 'opacity-60',
      )}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons name={icon} size={20} color={colors.primary} />
      )}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-base font-medium text-gray-900">{title}</Text>
        <Text testID={`${testID}-description`} className="text-sm text-gray-600">
          {description}
        </Text>
      </View>
    </Pressable>
  );
}
