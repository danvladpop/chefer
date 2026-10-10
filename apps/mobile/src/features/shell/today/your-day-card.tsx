import { View } from 'react-native';
import { router } from 'expo-router';
import { Text, useThemeColors } from '@chefer/ui-mobile';
import { cn, formatNumber } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { ActionButton, BoardCard } from './parts';
import { eatenCountText, type DaySlot } from './today-helpers';

// "Your day" (10 Oct redesign, board Home): one circle per planned slot —
// done is a filled positive check, the next meal a brand ring, the rest
// empty — and the obvious way into the full day the owner asked for ("See
// full day" was too easy to miss). The state is also spoken and written
// (status line), never colour alone.

const STATE_WORDS: Record<DaySlot['state'], string> = {
  done: 'eaten',
  next: 'next',
  upcoming: 'still to eat',
  skipped: 'skipped',
};

function SlotCircle({ state }: { state: DaySlot['state'] }) {
  const colors = useThemeColors();
  return (
    <View
      className={cn(
        'h-9 w-9 items-center justify-center rounded-full',
        state === 'done' && 'bg-positive',
        state === 'next' && 'border-2 border-brand bg-brand-tint',
        state === 'upcoming' && 'border-2 border-separator',
        state === 'skipped' && 'border-2 border-separator bg-surface-sunken',
      )}
    >
      {state === 'done' ? <Icon name="checkmark" color={colors.onBrand} size={20} /> : null}
      {state === 'skipped' ? <Icon name="remove" color={colors.labelTertiary} size={18} /> : null}
    </View>
  );
}

export function YourDayCard({ slots, proteinOnly }: { slots: DaySlot[]; proteinOnly: boolean }) {
  return (
    <BoardCard testID="your-day-card">
      <View className="flex-row items-center justify-between gap-2">
        <Text accessibilityRole="header" className="text-headline font-bold text-label">
          Your day
        </Text>
        {slots.length > 0 ? (
          <Text testID="your-day-status" className="text-subhead text-label-secondary">
            {eatenCountText(slots)}
          </Text>
        ) : null}
      </View>
      {slots.length > 0 ? (
        <View className="flex-row justify-around gap-1">
          {slots.map((slot) => (
            <View
              key={slot.key}
              testID={`your-day-slot-${slot.key}`}
              accessible
              accessibilityLabel={`${slot.label}${proteinOnly ? '' : `, ${slot.kcal} kcal`}, ${STATE_WORDS[slot.state]}`}
              className="min-w-0 flex-1 items-center gap-1"
            >
              <SlotCircle state={slot.state} />
              <Text numberOfLines={1} className="text-subhead font-semibold text-label">
                {slot.label}
              </Text>
              {proteinOnly ? null : (
                <Text className="text-caption text-label-secondary">{formatNumber(slot.kcal)}</Text>
              )}
            </View>
          ))}
        </View>
      ) : (
        <Text testID="your-day-empty" className="text-subhead text-label-secondary">
          Nothing planned today. Log what you eat as you go.
        </Text>
      )}
      <ActionButton
        testID="your-day-open"
        label="Open your day"
        icon="list"
        accessibilityHint="Shows everything planned and logged today"
        onPress={() => router.push('/tracker')}
      />
    </BoardCard>
  );
}
