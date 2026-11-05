import { View } from 'react-native';
import type { Translator } from '@chefer/i18n';
import type { AdherenceDayDto, AdherenceDto, AdherenceWeekDto } from '@chefer/types';
import { Badge, ProgressBar, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { useT } from '../../../lib/i18n';
import { formatShortDayT, weekdayNameT } from '../../coaching/copy';
import { CoachingCard } from '../components/coaching-card';
import { formatWeekdayDate } from '../format';

// ─── Client › Adherence (spec §2.5 tab 3) ─────────────────────────────────────
// The last 8 weeks (sessions against goal: met / missed / paused) and a 14-day strip of planned days:
// trained / missed / paused / rest. A pause is shown by its dates only, never the reason (the API never
// sends one).

export type DayState = 'trained' | 'missed' | 'paused' | 'planned' | 'rest';

/** How one strip cell reads. The last day (today) is "planned" rather than "missed" until it is trained. */
export function dayState(day: AdherenceDayDto, isToday: boolean): DayState {
  if (day.trained) return 'trained';
  if (day.paused) return 'paused';
  if (!day.planned) return 'rest';
  return isToday ? 'planned' : 'missed';
}

function dayGlyph(state: DayState, t: Translator['t']): string {
  switch (state) {
    case 'trained':
      return '✓';
    case 'missed':
      return '✕';
    case 'paused':
      return t('coaching.trainer.adherence.pausedGlyph');
    case 'planned':
      return '•';
    case 'rest':
      return '·';
  }
}

function dayInitial(localDate: string, t: Translator['t']): string {
  const [y, m, d] = localDate.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return '';
  const weekday = (new Date(y, m - 1, d).getDay() + 6) % 7;
  return weekdayNameT(weekday, t).slice(0, 1);
}

function WeekRow({ week }: { week: AdherenceWeekDto }) {
  const { t } = useT();
  const progress = week.goal > 0 ? week.sessions / week.goal : 0;
  const date = formatShortDayT(week.weekStart, t);
  const status = t(`coaching.trainer.adherence.weekShort.${week.status}`);
  return (
    <View
      testID={`trainer-adherence-week-${week.weekStart}`}
      accessible
      accessibilityLabel={t('coaching.trainer.adherence.weekA11y', {
        date,
        sessions: week.sessions,
        goal: week.goal,
        status,
      })}
      className="min-h-11 flex-row items-center gap-3"
    >
      <Text className="w-16 text-subhead text-label-secondary">{date}</Text>
      <View className="min-w-0 flex-1">
        <ProgressBar progress={progress} />
      </View>
      <Text className="w-10 text-right text-sm">
        {t('coaching.trainer.adherence.sessionsOfGoal', {
          sessions: week.sessions,
          goal: week.goal,
        })}
      </Text>
      <Badge variant={week.status === 'under' ? 'warning' : 'secondary'}>{status}</Badge>
    </View>
  );
}

export function AdherenceTab({ adherence }: { adherence: AdherenceDto }) {
  const { t } = useT();
  const lastIndex = adherence.days.length - 1;
  return (
    <View testID="trainer-adherence" className="gap-4">
      <CoachingCard className="gap-1">
        <Text accessibilityRole="header" className="text-title3 font-bold text-label">
          {t('coaching.trainer.adherence.lastDays')}
        </Text>
        <View testID="trainer-adherence-strip" className="mt-2 flex-row justify-between">
          {adherence.days.map((day, i) => {
            const state = dayState(day, i === lastIndex);
            return (
              <View
                key={day.localDate}
                testID={`trainer-adherence-day-${day.localDate}`}
                accessible
                accessibilityLabel={t('coaching.trainer.adherence.dayA11y', {
                  date: formatWeekdayDate(day.localDate, t),
                  state: t(`coaching.trainer.adherence.dayWord.${state}`),
                })}
                className="min-w-0 flex-1 items-center gap-1"
              >
                <Text className="text-caption text-label-secondary">
                  {dayInitial(day.localDate, t)}
                </Text>
                <View
                  className={cn(
                    'h-6 w-5 items-center justify-center rounded',
                    state === 'trained' && 'bg-positive/10',
                    state === 'missed' && 'bg-danger/10',
                    state === 'paused' && 'bg-attention/10',
                    (state === 'rest' || state === 'planned') && 'bg-surface-sunken',
                  )}
                >
                  <Text className="text-xs" importantForAccessibility="no">
                    {dayGlyph(state, t)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
        <Text className="mt-2 text-caption text-label-secondary">
          {t('coaching.trainer.adherence.legendShort')}
        </Text>
      </CoachingCard>
      <CoachingCard className="gap-1">
        <Text accessibilityRole="header" className="text-title3 font-bold text-label">
          {t('coaching.trainer.adherence.lastWeeks')}
        </Text>
        {adherence.weeks.map((week) => (
          <WeekRow key={week.weekStart} week={week} />
        ))}
      </CoachingCard>
    </View>
  );
}
