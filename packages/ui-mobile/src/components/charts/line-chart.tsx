// react-native-svg's typings mark `x`/`y` deprecated via TransformProps; on Rect
// and Text they are positional attributes, not transforms.
/* eslint-disable @typescript-eslint/no-deprecated */
import { View } from 'react-native';
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { cn } from '@chefer/utils';
import { Text } from '../text';
import { colors } from '../theme';
import { defaultFormat, linearScale, paddedExtent, useChartWidth } from './chart-utils';

export interface LinePoint {
  /** Any monotonic number: a timestamp, a day index… */
  x: number;
  y: number;
  /** Drawn as a large ringed dot (PRs). */
  highlight?: boolean;
}

export interface LineSeries {
  data: readonly { x: number; y: number }[];
  color?: string;
  formatY?: (value: number) => string;
}

export interface LineChartProps {
  data: readonly LinePoint[];
  /** Trend value per point (aligned with `data`; null leaves a gap). */
  trend?: readonly (number | null)[];
  /** A second series on its own right-hand axis (e.g. bodyweight overlay). */
  secondary?: LineSeries;
  /** Optional x-axis labels at given x positions. */
  xLabels?: readonly { x: number; label: string }[];
  width?: number;
  height?: number;
  color?: string;
  trendColor?: string;
  formatY?: (value: number) => string;
  emptyLabel?: string;
  className?: string;
  testID?: string;
  accessibilityLabel?: string;
}

const PAD_TOP = 10;
const AXIS_W = 38;
const LABEL_H = 18;

const toPoints = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x},${p.y}`).join(' ');

/**
 * Points + trend line + highlighted dots, with an optional secondary series
 * scaled to its own axis. In-house on react-native-svg (gym_plan.md §5.7).
 */
export function LineChart({
  data,
  trend,
  secondary,
  xLabels,
  width: widthProp,
  height = 180,
  color = colors.primary,
  trendColor,
  formatY = defaultFormat,
  emptyLabel = 'No data yet',
  className,
  testID,
  accessibilityLabel,
}: LineChartProps) {
  const { width, onLayout } = useChartWidth(widthProp);
  const secondaryData = secondary?.data ?? [];

  const yExtent = paddedExtent([
    ...data.map((p) => p.y),
    ...(trend ?? []).filter((v): v is number => v !== null),
  ]);
  const secondaryExtent = paddedExtent(secondaryData.map((p) => p.y));
  const xExtent = paddedExtent([...data.map((p) => p.x), ...secondaryData.map((p) => p.x)], 0);

  if (data.length === 0 || !yExtent || !xExtent) {
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

  const plotLeft = AXIS_W;
  const plotRight = width - (secondaryExtent ? AXIS_W : 8);
  const plotBottom = height - (xLabels ? LABEL_H : 6);
  const x = linearScale(xExtent, plotLeft + 6, plotRight - 6);
  const y = linearScale(yExtent, plotBottom, PAD_TOP);
  const y2 = secondaryExtent ? linearScale(secondaryExtent, plotBottom, PAD_TOP) : null;

  const gridValues = [yExtent.min, (yExtent.min + yExtent.max) / 2, yExtent.max];
  const formatY2 = secondary?.formatY ?? defaultFormat;
  const secondaryColor = secondary?.color ?? colors.info;

  // Split the trend at nulls so gaps stay gaps.
  const trendRuns: { x: number; y: number }[][] = [];
  if (trend) {
    let run: { x: number; y: number }[] = [];
    data.forEach((point, i) => {
      const value = trend[i];
      if (value === null || value === undefined) {
        if (run.length) trendRuns.push(run);
        run = [];
      } else {
        run.push({ x: x(point.x), y: y(value) });
      }
    });
    if (run.length) trendRuns.push(run);
  }

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
          {gridValues.map((value, i) => (
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
              {secondaryExtent && y2 ? (
                <SvgText
                  x={plotRight + 4}
                  y={y(value) + 3}
                  fontSize={10}
                  fill={secondaryColor}
                  textAnchor="start"
                >
                  {formatY2(
                    secondaryExtent.min +
                      ((value - yExtent.min) / (yExtent.max - yExtent.min)) *
                        (secondaryExtent.max - secondaryExtent.min),
                  )}
                </SvgText>
              ) : null}
            </G>
          ))}

          {y2 && secondaryData.length > 1 ? (
            <Polyline
              points={toPoints(secondaryData.map((p) => ({ x: x(p.x), y: y2(p.y) })))}
              fill="none"
              stroke={secondaryColor}
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          ) : null}

          {data.length > 1 ? (
            <Polyline
              points={toPoints(data.map((p) => ({ x: x(p.x), y: y(p.y) })))}
              fill="none"
              stroke={color}
              strokeOpacity={0.3}
              strokeWidth={1}
            />
          ) : null}

          {trendRuns.map((run, i) =>
            run.length > 1 ? (
              <Polyline
                key={`trend-${i}`}
                points={toPoints(run)}
                fill="none"
                stroke={trendColor ?? color}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null,
          )}

          {data.map((point, i) =>
            point.highlight ? (
              <Circle
                key={`pt-${i}`}
                cx={x(point.x)}
                cy={y(point.y)}
                r={5.5}
                fill={colors.warning}
                stroke={colors.card}
                strokeWidth={2}
              />
            ) : (
              <Circle key={`pt-${i}`} cx={x(point.x)} cy={y(point.y)} r={3} fill={color} />
            ),
          )}

          {xLabels?.map((label, i) => (
            <SvgText
              key={`xl-${i}`}
              x={x(label.x)}
              y={height - 4}
              fontSize={10}
              fill={colors.mutedForeground}
              textAnchor="middle"
            >
              {label.label}
            </SvgText>
          ))}
        </Svg>
      ) : null}
    </View>
  );
}
