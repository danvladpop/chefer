import { useState } from 'react';
import { View } from 'react-native';
import type { FlameInfo } from '@chefer/types';
import { SelectSheet, Text } from '@chefer/ui-mobile';
import { flameWeeksLabel, formatDate, PROGRESS_COPY } from '@chefer/utils';
import { ActionButton } from '../shell/today/parts';
import { useFlameActions } from './use-flame-actions';

// "Pause my flame" (mockups 05 and 12): holiday, illness, life. Up to four
// weeks, from today; while it lasts the card says until when and offers
// "I'm back". Used by the Flame sheet and Rewards & motivation.

const PAUSE_WEEKS = [1, 2, 3, 4] as const;
const WEEK_OPTIONS = PAUSE_WEEKS.map((w) => ({ value: String(w), label: flameWeeksLabel(w) }));

export function PauseCard({
  flame,
  testID = 'pause-card',
}: {
  flame: Pick<FlameInfo, 'pausedUntil'>;
  testID?: string;
}) {
  const actions = useFlameActions();
  const [choosing, setChoosing] = useState(false);
  const until = flame.pausedUntil
    ? formatDate(`${flame.pausedUntil}T00:00:00Z`, 'weekday-short', { timeZone: 'UTC' })
    : null;

  return (
    <View testID={testID} className="gap-3 rounded-card border border-separator bg-surface p-4">
      <View className="flex-row items-start gap-3">
        <Text accessibilityElementsHidden className="text-title2">
          🏖️
        </Text>
        <View className="min-w-0 flex-1 gap-1">
          <Text accessibilityRole="header" className="text-headline font-semibold text-label">
            {PROGRESS_COPY.pauseTitle}
          </Text>
          <Text className="text-subhead text-label-secondary">
            {until ? `${PROGRESS_COPY.pausedUntil} ${until}` : PROGRESS_COPY.pauseBody}
          </Text>
        </View>
      </View>
      {until ? (
        <ActionButton
          testID={`${testID}-resume`}
          label={PROGRESS_COPY.resumeCta}
          disabled={actions.pending}
          onPress={actions.resume}
        />
      ) : (
        <ActionButton
          testID={`${testID}-pause`}
          label={PROGRESS_COPY.pauseCta}
          disabled={actions.pending}
          onPress={() => setChoosing(true)}
        />
      )}
      <SelectSheet
        testID={`${testID}-length`}
        visible={choosing}
        onClose={() => setChoosing(false)}
        title={PROGRESS_COPY.pauseLengthTitle}
        options={WEEK_OPTIONS}
        value={null}
        onChange={(weeks) => {
          setChoosing(false);
          actions.pause(Number(weeks));
        }}
      />
    </View>
  );
}
