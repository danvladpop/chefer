// react-native-svg's typings mark `x`/`y` deprecated via TransformProps; on Rect
// and Text they are positional attributes, not transforms.
/* eslint-disable @typescript-eslint/no-deprecated */
import { View } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { cn } from '@chefer/utils';
import { Text } from '../text';
import { chartPalette, colors } from '../theme';
import { defaultFormat, linearScale, useChartWidth } from './chart-utils';

export interface BarSegment {
  /** Series key — stable across bars so colours line up. */
  key: string;
  value: number;
}

export interface BarDatum {
  label: string;
  segments: readonly BarSegment[];
}

export interface BarChartProps {
  data: readonly BarDatum[];
  /** Series key → colour. Unlisted keys take the palette in first-seen order. */
  seriesColors?: Readonly<Record<string, string>>;
  /** Shaded horizontal band, e.g. the productive weekly-sets range. */
  band?: { min: number; max: number };
  /** Show every n-th x label (default: fit ~8 labels). */
  labelEvery?: number;
  width?: number;
  height?: number;
  formatY?: (value: number) => string;
  emptyLabel?: string;
  className?: string;
  testID?: string;
  accessibilityLabel?: string;
}

const PAD_TOP = 8;
const AXIS_W = 32;
const LABEL_H = 18;

/** Stacked bars with an optional shaded band (weekly sets per muscle). */
export function BarChart({
  data,
  seriesColors,
  band,
  labelEvery,
  width: widthProp,
  height = 180,
  formatY = defaultFormat,
  emptyLabel = 'No data yet',
  className,
  testID,
  accessibilityLabel,
}: BarChartProps) {
  const { width, onLayout } = useChartWidth(widthProp);

  if (data.length === 0) {
    return (
      <View
        testID={testID}
        className={cn('items-center justify-center', className)}
        style={{ height }}
      >
        <Text variant="muted">{emptyLabel}</Text>
      </View>
    );
  }

  const palette = new Map<string, string>(Object.entries(seriesColors ?? {}));
  for (const bar of data) {
    for (const segment of bar.segments) {
      if (!palette.has(segment.key)) {
        const next = chartPalette[palette.size % chartPalette.length] ?? colors.primary;
        palette.set(segment.key, next);
      }
    }
  }

  const totals = data.map((bar) => bar.segments.reduce((sum, s) => sum + Math.max(0, s.value), 0));
  const top = Math.max(...totals, band?.max ?? 0, 1) * 1.1;
  const plotLeft = AXIS_W;
  const plotRight = width - 4;
  const plotBottom = height - LABEL_H;
  const y = linearScale({ min: 0, max: top }, plotBottom, PAD_TOP);
  const slot = (plotRight - plotLeft) / data.length;
  const barWidth = Math.max(2, slot * 0.6);
  const every = labelEvery ?? Math.max(1, Math.ceil(data.length / 8));

  return (
    <View
      testID={testID}
      onLayout={onLayout}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      className={cn('w-full', className)}
      style={{ height }}
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          {band ? (
            <Rect
              {...(testID ? { testID: `${testID}-band` } : {})}
              x={plotLeft}
              y={y(band.max)}
              width={plotRight - plotLeft}
              height={Math.max(0, y(band.min) - y(band.max))}
              fill={colors.success}
              fillOpacity={0.12}
            />
          ) : null}

          {[0, top / 2, top].map((value, i) => (
            <G key={`grid-${i}`}>
              <Line
                x1={plotLeft}
                x2={plotRight}
                y1={y(value)}
                y2={y(value)}
                stroke={colors.border}
                strokeWidth={1}
              />
              <SvgText
                x={plotLeft - 4}
                y={y(value) + 3}
                fontSize={10}
                fill={colors.mutedForeground}
                textAnchor="end"
              >
                {formatY(value)}
              </SvgText>
            </G>
          ))}

          {data.map((bar, i) => {
            const left = plotLeft + i * slot + (slot - barWidth) / 2;
            let base = 0;
            return (
              <G key={`bar-${i}`}>
                {bar.segments.map((segment) => {
                  const value = Math.max(0, segment.value);
                  const y0 = y(base);
                  base += value;
                  const y1 = y(base);
                  return value > 0 ? (
                    <Rect
                      key={segment.key}
                      x={left}
                      y={y1}
                      width={barWidth}
                      height={Math.max(0, y0 - y1)}
                      fill={palette.get(segment.key) ?? colors.primary}
                    />
                  ) : null;
                })}
                {i % every === 0 ? (
                  <SvgText
                    x={left + barWidth / 2}
                    y={height - 4}
                    fontSize={10}
                    fill={colors.mutedForeground}
                    textAnchor="middle"
                  >
                    {bar.label}
                  </SvgText>
                ) : null}
              </G>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}
