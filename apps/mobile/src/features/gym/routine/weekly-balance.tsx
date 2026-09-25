import { Pressable, View } from 'react-native';
import type { MuscleVolume, RoutineHint, VolumeGroup } from '@chefer/types';
import { Badge, Card, CardTitle, colors, Text } from '@chefer/ui-mobile';
import { VOLUME_GROUP_LABELS } from '@chefer/utils';
import { hintKey } from './hints-storage';

// Weekly balance card (gym_plan.md §1.3 "Routine tab" / research §2.3): a
// bar-per-group list of fractional sets against the productive band, plus
// dismissible hint rows. Used read-only on the Routine tab (dismissedKeys +
// onDismiss, persisted per routine) and live in the editor (neither prop —
// every hint shows, nothing to persist yet since the draft isn't saved).

export interface WeeklyBalanceCardProps {
  volume: readonly MuscleVolume[];
  hints: readonly RoutineHint[];
  dismissedKeys?: ReadonlySet<string>;
  onDismiss?: (key: string) => void;
  testID?: string;
}

function fmt(n: number): string {
  return String(Math.round(n * 10) / 10);
}

function VolumeRow({ mv, testID }: { mv: MuscleVolume; testID?: string }) {
  const label = VOLUME_GROUP_LABELS[mv.group as VolumeGroup];
  const scale = Math.max(mv.warnAbove, mv.fractional, mv.productiveMax, 1) * 1.05;
  const pct = (v: number): `${number}%` => `${Math.min(100, Math.max(0, (v / scale) * 100))}%`;
  const bandLeftPct = pct(mv.floor);
  const bandWidthPct = pct(Math.max(0, Math.min(mv.productiveMax, scale) - mv.floor));
  const over = mv.fractional > mv.warnAbove;
  const under = mv.fractional < mv.floor;
  const fillColor = over ? colors.warning : under ? colors.mutedForeground : colors.primary;

  return (
    <View testID={testID} className="gap-1">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-medium">{label}</Text>
        <Text variant="muted" className="text-xs">
          {fmt(mv.fractional)} sets/wk · target {mv.floor}–{mv.productiveMax}
        </Text>
      </View>
      <View className="h-3 overflow-hidden rounded-full bg-muted">
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: bandLeftPct,
            width: bandWidthPct,
            height: '100%',
            backgroundColor: colors.success,
            opacity: 0.18,
          }}
        />
        <View style={{ width: pct(mv.fractional), height: '100%', backgroundColor: fillColor }} />
      </View>
    </View>
  );
}

export function WeeklyBalanceCard({
  volume,
  hints,
  dismissedKeys,
  onDismiss,
  testID,
}: WeeklyBalanceCardProps) {
  const visibleHints = dismissedKeys ? hints.filter((h) => !dismissedKeys.has(hintKey(h))) : hints;

  return (
    <Card testID={testID}>
      <CardTitle>Weekly balance</CardTitle>
      <View className="gap-3">
        {volume.map((mv) => (
          <VolumeRow key={mv.group} mv={mv} testID={testID ? `${testID}-${mv.group}` : undefined} />
        ))}
      </View>
      {visibleHints.length > 0 ? (
        <View className="mt-4 gap-2 border-t border-border pt-3">
          {visibleHints.map((hint) => {
            const key = hintKey(hint);
            return (
              <View
                key={key}
                testID={testID ? `${testID}-hint-${key}` : undefined}
                className="min-h-11 flex-row items-center gap-2 rounded-lg bg-muted px-3 py-2"
              >
                <Badge variant={hint.level === 'warning' ? 'warning' : 'info'}>
                  {hint.level === 'warning' ? '!' : 'i'}
                </Badge>
                <Text className="min-w-0 flex-1 text-sm">{hint.message}</Text>
                {onDismiss ? (
                  <Pressable
                    testID={testID ? `${testID}-hint-${key}-dismiss` : undefined}
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss"
                    onPress={() => onDismiss(key)}
                    className="h-11 w-11 items-center justify-center"
                  >
                    <Text className="text-base text-muted-foreground">✕</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </Card>
  );
}
