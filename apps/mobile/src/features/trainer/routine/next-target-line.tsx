import { View } from 'react-native';
import type { Translator } from '@chefer/i18n';
import type { ExerciseMeta, NextTargetDto } from '@chefer/types';
import { Button, Text } from '@chefer/ui-mobile';
import { getTranslator, useT } from '../../../lib/i18n';
import { formatShortDayT } from '../../coaching/copy';
import { nextTargetValueText } from '../format';

// ─── Next session, one exercise (spec §2.5 "Next session" panel, §6) ─────────
// "60 kg × 8, 8, 8 · app suggestion" / "62.5 kg × 6, 6, 6, 6 · set by you 2 Oct" / "… · set by the client
// 2 Oct", with "Last done 3 Oct" once the exercise has been logged, and an Adjust button that opens the
// override sheet. A consumed target simply shows the engine's suggestion again plus "Last done" (there is
// no "Used" marker: the override is cleared when it is consumed).

export function nextTargetText(
  next: NextTargetDto,
  meta: ExerciseMeta | undefined,
  t: Translator['t'] = getTranslator().t,
): string {
  const value = nextTargetValueText(next, meta);
  if (!next.override) return t('coaching.trainer.appSuggestion', { value });
  const date = formatShortDayT(next.override.at, t);
  return next.override.setBy === 'TRAINER'
    ? t('coaching.trainer.setByYou', { value, date })
    : t('coaching.trainer.setByClient', { value, date });
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
  const { t } = useT();
  const name = meta?.name ?? t('coaching.trainer.exerciseFallback');
  return (
    <View testID={testID} className="min-w-0 gap-0.5 pt-1">
      <View className="min-w-0 flex-row items-center gap-2">
        <View className="min-w-0 flex-1">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">
            {t('coaching.trainer.nextSession')}
          </Text>
          <Text testID={`${testID}-value`} className="min-w-0 text-sm">
            {nextTargetText(next, meta, t)}
          </Text>
        </View>
        <Button
          testID={`${testID}-adjust`}
          size="sm"
          variant="outline"
          disabled={adjustDisabled}
          accessibilityLabel={t('coaching.trainer.adjustNextFor', { name })}
          onPress={onAdjust}
        >
          {t('coaching.trainer.adjust')}
        </Button>
      </View>
      {next.lastDoneDate ? (
        <Text testID={`${testID}-last-done`} className="text-caption text-label-secondary">
          {t('coaching.trainer.lastDone', { date: formatShortDayT(next.lastDoneDate, t) })}
        </Text>
      ) : null}
    </View>
  );
}
