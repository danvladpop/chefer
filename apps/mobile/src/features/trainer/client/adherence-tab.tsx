import { View } from 'react-native';
import type { AdherenceDayDto, AdherenceDto, AdherenceWeekDto, WeekStatus } from '@chefer/types';
import { Badge, Card, ProgressBar, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { formatStampDate } from '../../gym/routine/attribution';
import { WEEKDAY_SHORT_LABELS } from '../../gym/routine/weekday';
import { formatWeekdayDate } from '../format';

// ─── Client › Adherence (spec §2.5 tab 3) ─────────────────────────────────────
// The last 8 weeks (sessions against goal: met / missed / paused) and a 14-day strip of planned days:
// trained / missed / paused / rest. A pause is shown by its dates only, never the reason (the API never
// sends one).

const WEEK_STATUS_LABEL: Record<WeekStatus, string> = {
  met: 'Met',
  flex: 'Met',
  paused: 'Paused',
  under: 'Missed',
  empty: 'No sessions',
  current: 'This week',
};

export type DayState = 'trained' | 'missed' | 'paused' | 'planned' | 'rest';

/** How one strip cell reads. The last day (today) is "planned" rather than "missed" until it is trained. */
export function dayState(day: AdherenceDayDto, isToday: boolean): DayState {
  if (day.trained) return 'trained';
  if (day.paused) return 'paused';
  if (!day.planned) return 'rest';
  return isToday ? 'planned' : 'missed';
}

const DAY_GLYPH: Record<DayState, string> = {
  trained: '✓',
  missed: '✕',
  paused: 'P',
  planned: '•',
  rest: '·',
};

const DAY_WORD: Record<DayState, string> = {
  trained: 'trained',
  missed: 'missed',
  paused: 'paused',
  planned: 'planned today',
  rest: 'rest',
};

function dayInitial(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return '';
  const weekday = (new Date(y, m - 1, d).getDay() + 6) % 7;
  return (WEEKDAY_SHORT_LABELS[weekday] ?? '').slice(0, 1);
}

function WeekRow({ week }: { week: AdherenceWeekDto }) {
  const progress = week.goal > 0 ? week.sessions / week.goal : 0;
  return (
    <View
      testID={`trainer-adherence-week-${week.weekStart}`}
      accessible
      accessibilityLabel={`Week of ${formatStampDate(week.weekStart)}: ${week.sessions} of ${week.goal} sessions, ${WEEK_STATUS_LABEL[week.status]}`}
      className="min-h-11 flex-row items-center gap-3"
    >
      <Text variant="muted" className="w-16 text-sm">
        {formatStampDate(week.weekStart)}
      </Text>
      <View className="min-w-0 flex-1">
        <ProgressBar progress={progress} />
      </View>
      <Text className="w-10 text-right text-sm">
        {week.sessions} / {week.goal}
      </Text>
      <Badge variant={week.status === 'under' ? 'warning' : 'secondary'}>
        {WEEK_STATUS_LABEL[week.status]}
      </Badge>
    </View>
  );
}

export function AdherenceTab({ adherence }: { adherence: AdherenceDto }) {
  const lastIndex = adherence.days.length - 1;
  return (
    <View testID="trainer-adherence" className="gap-4">
      <Card className="gap-1">
        <Text variant="heading">Last 14 days</Text>
        <View testID="trainer-adherence-strip" className="mt-2 flex-row justify-between">
          {adherence.days.map((day, i) => {
            const state = dayState(day, i === lastIndex);
            return (
              <View
                key={day.localDate}
                testID={`trainer-adherence-day-${day.localDate}`}
                accessible
                accessibilityLabel={`${formatWeekdayDate(day.localDate)}: ${DAY_WORD[state]}`}
                className="min-w-0 flex-1 items-center gap-1"
              >
                <Text variant="muted" className="text-xs">
                  {dayInitial(day.localDate)}
                </Text>
                <View
                  className={cn(
                    'h-6 w-5 items-center justify-center rounded',
                    state === 'trained' && 'bg-green-100',
                    state === 'missed' && 'bg-red-100',
                    state === 'paused' && 'bg-amber-100',
                    (state === 'rest' || state === 'planned') && 'bg-gray-100',
                  )}
                >
                  <Text className="text-xs" importantForAccessibility="no">
                    {DAY_GLYPH[state]}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
        <Text variant="muted" className="mt-2 text-xs">
          ✓ trained · ✕ missed · P paused · · rest day
        </Text>
      </Card>
      <Card className="gap-1">
        <Text variant="heading">Last 8 weeks</Text>
        {adherence.weeks.map((week) => (
          <WeekRow key={week.weekStart} week={week} />
        ))}
      </Card>
    </View>
  );
}
