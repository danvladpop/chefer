import { View } from 'react-native';
import type { MuscleVolume, RoutineHint, VolumeGroup } from '@chefer/types';
import { IconButton, Text, useThemeColors } from '@chefer/ui-mobile';
import { cn, VOLUME_GROUP_LABELS } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { hintKey } from './hints-storage';

/** TrainCard's surface (10 Oct redesign) — inlined to keep this file free of the shell's router imports. */
const CARD = 'gap-3 rounded-card border border-separator bg-surface p-4';

// Weekly balance card (gym_plan.md §1.3 "Routine tab" / research §2.3): a
// bar-per-group list of fractional sets against the productive band, plus
// dismissible hint rows. Used read-only on the Routine tab (dismissedKeys +
// onDismiss, persisted per routine) and live in the editor (neither prop —
// every hint shows, nothing to persist yet since the draft isn't saved).
// 10 Oct redesign: drawn like the Routine page's balance (TrainCard, a
// hairline track, the target band in brand tint, the fill in brand —
// attention when over the band) with colour roles only.

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

  return (
    <View testID={testID} className="gap-1.5">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-subhead font-semibold text-label">{label}</Text>
        <Text className="text-caption text-label-secondary">
          {fmt(mv.fractional)} sets/wk · target {mv.floor}–{mv.productiveMax}
        </Text>
      </View>
      <View className="h-2.5 overflow-hidden rounded-full border border-separator bg-surface">
        <View
          pointerEvents="none"
          className="absolute h-full bg-brand-tint"
          style={{ left: bandLeftPct, width: bandWidthPct }}
        />
        <View
          className={cn('h-full rounded-full', over ? 'bg-attention' : 'bg-brand')}
          style={{ width: pct(mv.fractional) }}
        />
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
  const colors = useThemeColors();
  const visibleHints = dismissedKeys ? hints.filter((h) => !dismissedKeys.has(hintKey(h))) : hints;

  return (
    <View testID={testID} className={CARD}>
      <Text accessibilityRole="header" className="text-headline font-semibold text-label">
        Weekly balance
      </Text>
      <View className="gap-3">
        {volume.map((mv) => (
          <VolumeRow key={mv.group} mv={mv} testID={testID ? `${testID}-${mv.group}` : undefined} />
        ))}
      </View>
      {volume.length > 0 ? (
        <Text className="text-caption text-label-secondary">Shaded band = weekly target sets</Text>
      ) : null}
      {visibleHints.length > 0 ? (
        <View className="gap-2 border-t border-separator pt-3">
          {visibleHints.map((hint) => {
            const key = hintKey(hint);
            return (
              <View
                key={key}
                testID={testID ? `${testID}-hint-${key}` : undefined}
                className={cn(
                  'min-h-11 flex-row items-center gap-2 rounded-control bg-surface-sunken py-2 pl-3',
                  onDismiss ? 'pr-0' : 'pr-3',
                )}
              >
                <Icon
                  name="info"
                  color={hint.level === 'warning' ? colors.attention : colors.brand}
                  size={18}
                />
                <Text className="min-w-0 flex-1 text-subhead text-label">{hint.message}</Text>
                {onDismiss ? (
                  <IconButton
                    testID={testID ? `${testID}-hint-${key}-dismiss` : undefined}
                    accessibilityLabel="Dismiss"
                    onPress={() => onDismiss(key)}
                    icon={<Icon name="close" color={colors.labelSecondary} size={18} />}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
