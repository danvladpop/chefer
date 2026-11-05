import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import type { Translator } from '@chefer/i18n';
import { Text, useThemeColors } from '@chefer/ui-mobile';
import { bodyWeightInUnit, bodyWeightUnit, type UnitSystem } from '@chefer/utils';
import { useT } from '../../lib/i18n';

// UX-FOOD-27: the Today weight card used to draw a bar per weigh-in whose
// heights were clamped to 20-100 %, so any two weights looked like two flat
// blocks with nothing to read. A small line over time, the end points
// marked, with the start and end values spelled out ("78.4 → 70.8 kg").

const HEIGHT = 48;
const PAD = 6;
const DAY_MS = 86_400_000;

type Point = { weightKg: number; recordedAt: Date | string };

function dayLabel(tr: Translator, value: Date | string): string {
  return tr.date(value, 'short');
}

export function WeightSparkline({
  entries,
  system,
  windowDays = 30,
}: {
  entries: readonly Point[];
  system: UnitSystem;
  windowDays?: number;
}) {
  const colors = useThemeColors();
  const tr = useT();
  const [width, setWidth] = useState(0);
  const first = entries.at(0);
  const last = entries.at(-1);
  if (!first || !last || entries.length < 2) return null;

  const unit = bodyWeightUnit(system);
  const values = entries.map((e) => bodyWeightInUnit(e.weightKg, system));
  const times = entries.map((e) => new Date(e.recordedAt).getTime() / DAY_MS);
  const minY = Math.min(...values);
  const maxY = Math.max(...values);
  const minX = Math.min(...times);
  const maxX = Math.max(...times);
  // A flat series still gets a visible line in the middle of the band.
  const spanY = maxY - minY || 1;
  const spanX = maxX - minX || 1;
  const px = (t: number) => PAD + ((t - minX) / spanX) * Math.max(0, width - PAD * 2);
  const py = (v: number) =>
    maxY === minY ? HEIGHT / 2 : HEIGHT - PAD - ((v - minY) / spanY) * (HEIGHT - PAD * 2);
  const points = values.map((v, i) => ({ x: px(times[i] ?? minX), y: py(v) }));
  const startValue = values[0] ?? 0;
  const endValue = values.at(-1) ?? 0;
  const summary = tr.t('today.progress.card.sparklineSummary', {
    start: tr.number(startValue, 1),
    end: tr.number(endValue, 1),
    unit,
  });

  return (
    <View
      testID="weight-sparkline"
      accessibilityRole="image"
      accessibilityLabel={tr.t('today.progress.card.sparklineA11y', { count: windowDays, summary })}
      className="mb-3"
    >
      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width))}
        style={{ height: HEIGHT }}
      >
        {width > 0 && (
          <Svg width={width} height={HEIGHT}>
            <Polyline
              points={points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={colors.positive}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {points.length > 0 && (
              <>
                <Circle cx={points[0]?.x} cy={points[0]?.y} r={3} fill={colors.positive} />
                <Circle cx={points.at(-1)?.x} cy={points.at(-1)?.y} r={4} fill={colors.positive} />
              </>
            )}
          </Svg>
        )}
      </View>
      <View className="mt-1 flex-row items-baseline justify-between gap-2">
        <Text className="text-xs text-label-tertiary">{dayLabel(tr, first.recordedAt)}</Text>
        <Text testID="weight-sparkline-summary" className="text-xs font-semibold text-label">
          {summary}
        </Text>
        <Text className="text-xs text-label-tertiary">{dayLabel(tr, last.recordedAt)}</Text>
      </View>
    </View>
  );
}
