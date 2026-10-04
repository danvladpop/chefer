import { View } from 'react-native';
import { COACHING_COPY, type ExerciseMeta, type NextTargetDto } from '@chefer/types';
import { Button, Text } from '@chefer/ui-mobile';
import { formatStampDate } from '../../gym/routine/attribution';
import { nextTargetValueText } from '../format';

// ─── Next session, one exercise (spec §2.5 "Next session" panel, §6) ─────────
// "60 kg × 8, 8, 8 · app suggestion" / "62.5 kg × 6, 6, 6, 6 · set by you 2 Oct" / "… · set by the client
// 2 Oct", with "Last done 3 Oct" once the exercise has been logged, and an Adjust button that opens the
// override sheet. A consumed target simply shows the engine's suggestion again plus "Last done" (there is
// no "Used" marker: the override is cleared when it is consumed).

export function nextTargetText(next: NextTargetDto, meta: ExerciseMeta | undefined): string {
  const value = nextTargetValueText(next, meta);
  if (!next.override) return COACHING_COPY.trainer.appSuggestion(value);
  const date = formatStampDate(next.override.at);
  return next.override.setBy === 'TRAINER'
    ? COACHING_COPY.trainer.setByYou(value, date)
    : COACHING_COPY.trainer.setByClient(value, date);
}

export function NextTargetLine({
  testID,
  next,
  meta,
  adjustDisabled,
  onAdjust,
}: {
  testID: string;
  next: NextTargetDto;
  meta: ExerciseMeta | undefined;
  adjustDisabled: boolean;
  onAdjust: () => void;
}) {
  const name = meta?.name ?? 'exercise';
  return (
    <View testID={testID} className="min-w-0 gap-0.5 pt-1">
      <View className="min-w-0 flex-row items-center gap-2">
        <View className="min-w-0 flex-1">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">
            {COACHING_COPY.trainer.nextSession}
          </Text>
          <Text testID={`${testID}-value`} className="min-w-0 text-sm">
            {nextTargetText(next, meta)}
          </Text>
        </View>
        <Button
          testID={`${testID}-adjust`}
          size="sm"
          variant="outline"
          disabled={adjustDisabled}
          accessibilityLabel={`${COACHING_COPY.trainer.adjust} next session target for ${name}`}
          onPress={onAdjust}
        >
          {COACHING_COPY.trainer.adjust}
        </Button>
      </View>
      {next.lastDoneDate ? (
        <Text testID={`${testID}-last-done`} variant="muted" className="text-xs">
          {COACHING_COPY.trainer.lastDone(formatStampDate(next.lastDoneDate))}
        </Text>
      ) : null}
    </View>
  );
}
