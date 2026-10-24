import { Pressable, View } from 'react-native';
import { cn } from '@chefer/utils';
import { useThemeColors } from '../../hooks/use-theme-colors';
import { Text } from '../text';
import { useChartColors } from '../theme';

/** Mirrors WeekStatus in @chefer/types (ui-mobile stays free of domain deps). */
export type WeekGridStatus = 'met' | 'flex' | 'paused' | 'under' | 'empty' | 'current';

export interface WeekGridCell {
  /** Monday "YYYY-MM-DD" (also the React key). */
  weekStart: string;
  status: WeekGridStatus;
  /** Screen-reader text, e.g. "Week of 1 Sep: 3 of 3". Defaults to status. */
  label?: string;
}

// Neutral for misses — never red (gym_plan.md §1.2 principle 3).
/** Each status's fill in the active scheme (Day / Night). */
export function useWeekStatusColors(): Record<WeekGridStatus, string> {
  const roles = useThemeColors();
  const chart = useChartColors();
  return {
    met: roles.brand,
    flex: chart.flex,
    paused: chart.paused,
    under: roles.separator,
    empty: roles.surfaceSunken,
    current: roles.surface,
  };
}

export const WEEK_STATUS_LABELS: Record<WeekGridStatus, string> = {
  met: 'Goal met',
  flex: 'Flex week',
  paused: 'Paused',
  under: 'Under goal',
  empty: 'No sessions',
  current: 'This week',
};

export interface WeekGridProps {
  weeks: readonly WeekGridCell[];
  /** Cells per row (default 12 ≈ a quarter per row). */
  columns?: number;
  cellSize?: number;
  gap?: number;
  onPressWeek?: (week: WeekGridCell) => void;
  showLegend?: boolean;
  className?: string;
  /** Cells get `${testID}-cell-${index}`. */
  testID?: string;
}

/** Consistency grid: one square per week, oldest first, coloured by status. */
export function WeekGrid({
  weeks,
  columns = 12,
  cellSize = 18,
  gap = 4,
  onPressWeek,
  showLegend = false,
  className,
  testID,
}: WeekGridProps) {
  const statusColors = useWeekStatusColors();
  const colors = useThemeColors();
  const rows: WeekGridCell[][] = [];
  for (let i = 0; i < weeks.length; i += columns) {
    rows.push(weeks.slice(i, i + columns));
  }

  return (
    <View testID={testID} className={cn('gap-3', className)}>
      <View style={{ gap }}>
        {rows.map((row, r) => (
          <View key={`row-${r}`} className="flex-row" style={{ gap }}>
            {row.map((week, c) => {
              const index = r * columns + c;
              const style = {
                width: cellSize,
                height: cellSize,
                backgroundColor: statusColors[week.status],
                borderWidth: week.status === 'current' ? 2 : 0,
                borderColor: colors.brand,
              };
              const a11y = week.label ?? `${week.weekStart}: ${WEEK_STATUS_LABELS[week.status]}`;
              return onPressWeek ? (
                <Pressable
                  key={week.weekStart}
                  testID={testID ? `${testID}-cell-${index}` : undefined}
                  accessibilityRole="button"
                  accessibilityLabel={a11y}
                  hitSlop={Math.max(0, (44 - cellSize) / 2)}
                  onPress={() => onPressWeek(week)}
                  className="rounded"
                  style={style}
                />
              ) : (
                <View
                  key={week.weekStart}
                  testID={testID ? `${testID}-cell-${index}` : undefined}
                  accessibilityLabel={a11y}
                  className="rounded"
                  style={style}
                />
              );
            })}
          </View>
        ))}
      </View>
      {showLegend ? (
        <View className="flex-row flex-wrap gap-x-3 gap-y-1">
          {(['met', 'flex', 'paused', 'under'] as const).map((status) => (
            <View key={status} className="flex-row items-center gap-1.5">
              <View
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: statusColors[status] }}
              />
              <Text className="text-xs text-muted-foreground">{WEEK_STATUS_LABELS[status]}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
