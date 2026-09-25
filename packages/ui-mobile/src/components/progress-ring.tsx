import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { cn } from '@chefer/utils';
import { colors } from './theme';

export interface ProgressRingProps {
  /** 0..1 (clamped). Values above 1 draw a full ring. */
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  /** Centre content, e.g. <Text>2/3</Text>. */
  children?: React.ReactNode;
  className?: string;
  testID?: string;
  accessibilityLabel?: string;
}

/** Circular progress (the week ring). Starts at 12 o'clock, runs clockwise. */
export function ProgressRing({
  progress,
  size = 64,
  strokeWidth = 6,
  color = colors.primary,
  trackColor = colors.neutralSoft,
  children,
  className,
  testID,
  accessibilityLabel,
}: ProgressRingProps) {
  const clamped = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const centre = size / 2;

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      className={cn('items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle
          cx={centre}
          cy={centre}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {clamped > 0 ? (
          <Circle
            cx={centre}
            cy={centre}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - clamped)}
            transform={`rotate(-90 ${centre} ${centre})`}
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}
