import { View } from 'react-native';
import Animated, { useAnimatedProps } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { cn, formatNumber } from '@chefer/utils';
import { useThemeColors } from '../hooks/use-theme-colors';
import { CountUp } from '../motion/count-up';
import { isOverTarget, mainFill, normaliseProgress } from '../motion/progress';
import { useProgressValue } from '../motion/use-progress-value';
import { Text } from './text';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Below this the round cap would still paint a dot at the start — hide it. */
const VISIBLE_EPSILON = 0.002;

/** The figures a spoken sentence is built from, already formatted. */
export interface CalorieGaugeFigures {
  value: string;
  target: string;
  /** kcal left (0 once over target). */
  remaining: string;
  /** kcal over target (0 until over). */
  overBy: string;
  over: boolean;
}

/**
 * The gauge's words. The kit stays language-free: the app passes translated
 * labels (the English defaults below serve every other caller).
 */
export interface CalorieGaugeLabels {
  /** Under the right end: the target figure's name. */
  target: string;
  /** Under the left end while under target. */
  left: string;
  /** Under the left end once over target (neutral words, never an alarm). */
  over: string;
  /** The one accessibility sentence for the whole gauge. */
  spoken: (figures: CalorieGaugeFigures) => string;
}

function englishSpoken(caption: string) {
  return ({ value, target, remaining, overBy, over }: CalorieGaugeFigures) =>
    target === ''
      ? `${value} ${caption}`
      : `${value} of ${target} kcal ${caption.replace(/^kcal /, '')}, ${
          over ? `${overBy} over` : `${remaining} left`
        }`;
}

export interface CalorieGaugeProps {
  /** kcal eaten (or planned) so far. */
  value: number;
  /** The day's kcal target. 0 / missing hides the arc fill and the "left" figure. */
  target: number;
  /** Caption under the big number (default "kcal eaten"). */
  caption?: string;
  /**
   * Translated words for the ends and the spoken sentence (default English).
   * `spoken` gets `target: ''` when there is no target.
   */
  labels?: Partial<CalorieGaugeLabels>;
  /** Gauge width in pt; the height follows (half a ring). */
  width?: number;
  strokeWidth?: number;
  className?: string;
  testID?: string;
}

// One formatter for the app (WP-11): device locale via Intl, like formatKcal.
const fmt = (n: number) => formatNumber(Math.round(n));

/**
 * Half-ring calorie gauge (10 Oct redesign, ref-1/ref-2 layout in Chefer's
 * roles): the arc fills left → right with eaten / target, the number sits in
 * the bowl, "left" and "target" sit under the two ends. Over target the arc
 * keeps the brand colour and "left" reads "over" in neutral text — never an
 * alarm colour (F8; lane E3: eating-disorder-safe, every mode). MO-06: the
 * arc animates its dash offset from the previous value on the UI thread and
 * jumps under reduced motion (useProgressValue); the number counts up (CountUp).
 * One accessibility sentence covers the whole gauge.
 */
export function CalorieGauge({
  value,
  target,
  caption = 'kcal eaten',
  labels,
  width = 240,
  strokeWidth = 18,
  className,
  testID,
}: CalorieGaugeProps) {
  const colors = useThemeColors();
  const progress = target > 0 ? normaliseProgress(value / target) : 0;
  const over = target > 0 && isOverTarget(progress);
  const animated = useProgressValue(progress);

  const radius = (width - strokeWidth) / 2;
  const centreY = radius + strokeWidth / 2;
  const height = Math.ceil(centreY + strokeWidth / 2);
  const left = strokeWidth / 2;
  const right = width - strokeWidth / 2;
  const d = `M ${left} ${centreY} A ${radius} ${radius} 0 0 1 ${right} ${centreY}`;
  const length = Math.PI * radius;

  const fillProps = useAnimatedProps(() => {
    const fill = mainFill(animated.get());
    return {
      strokeDashoffset: length * (1 - fill),
      strokeOpacity: fill > VISIBLE_EPSILON ? 1 : 0,
    };
  });

  const remaining = Math.max(0, target - value);
  const overBy = Math.max(0, value - target);
  const words: CalorieGaugeLabels = {
    target: 'target',
    left: 'left',
    over: 'over',
    spoken: englishSpoken(caption),
    ...labels,
  };
  const label = words.spoken({
    value: fmt(value),
    target: target > 0 ? fmt(target) : '',
    remaining: fmt(remaining),
    overBy: fmt(overBy),
    over,
  });

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(mainFill(progress) * 100) }}
      className={cn('items-center gap-1.5', className)}
    >
      <View style={{ width, height }}>
        <Svg width={width} height={height}>
          <Path
            d={d}
            stroke={colors.surfaceSunken}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
          />
          <AnimatedPath
            {...(testID ? { testID: `${testID}-fill` } : {})}
            d={d}
            stroke={colors.brand}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${length} ${length}`}
            animatedProps={fillProps}
          />
        </Svg>
        <View className="absolute bottom-0 left-0 right-0 items-center">
          <CountUp
            value={value}
            format={fmt}
            className="text-display font-bold text-label"
            style={{ fontVariant: ['tabular-nums'] }}
          />
          <Text className="text-caption text-label-secondary">{caption}</Text>
        </View>
      </View>
      {target > 0 ? (
        <View className="w-full flex-row justify-between px-5">
          <View>
            <Text
              testID={testID ? `${testID}-left` : undefined}
              className="text-headline font-bold text-label"
            >
              {fmt(over ? overBy : remaining)}
            </Text>
            <Text className="text-caption text-label-secondary">
              {over ? words.over : words.left}
            </Text>
          </View>
          <View className="items-end">
            <Text className="text-headline font-bold text-label">{fmt(target)}</Text>
            <Text className="text-caption text-label-secondary">{words.target}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
