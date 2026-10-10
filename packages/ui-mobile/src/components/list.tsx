import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { colorsFor } from '@chefer/tokens';
import { cn } from '@chefer/utils';
import { haptics } from '../motion/haptics';
import { Text } from './text';

// Inset grouped list — the revamp's one list pattern (plan: "Components →
// ListSection + ListRow"), the shape iOS Settings and Material lists share:
// a titled group of rows on a rounded surface, hairlines between rows, one
// tap target per row (44pt minimum, it grows with Dynamic Type). It replaces
// the More rows, the Settings hub rows and the hand-rolled rows in screens.

export interface ListSectionProps {
  /** Title-case header above the group (iOS 26 dropped all-caps headers). */
  title?: string;
  /** One line of help under the group. */
  footer?: string;
  children: ReactNode;
  className?: string;
  testID?: string;
}

/** A titled group of `ListRow`s on one surface, separated by hairlines. */
export function ListSection({ title, footer, children, className, testID }: ListSectionProps) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View className={cn('gap-1.5', className)} testID={testID}>
      {title ? (
        <Text
          accessibilityRole="header"
          className="px-4 text-subhead font-semibold text-label-secondary"
        >
          {title}
        </Text>
      ) : null}
      <View className="overflow-hidden rounded-card border border-separator bg-surface">
        {rows.map((row, index) => (
          <Fragment key={row.key ?? index}>
            {index > 0 ? <View className="ml-14 h-px bg-separator" /> : null}
            {row}
          </Fragment>
        ))}
      </View>
      {footer ? <Text className="px-4 text-caption text-label-tertiary">{footer}</Text> : null}
    </View>
  );
}

export interface ListRowProps {
  title: string;
  /** A second line under the title. */
  subtitle?: string;
  /** Right-aligned value, e.g. "2,100 kcal" or "On". */
  value?: string;
  /** The leading icon (already sized and tinted by the caller, ~22pt). */
  icon?: ReactNode;
  /** A trailing badge, e.g. a count pill. */
  badge?: ReactNode;
  /** `chevron` for a push, `none` for an action row, or a custom node (a Switch). */
  accessory?: 'chevron' | 'none' | ReactElement;
  /** Destructive action row (Sign out, Delete): danger-coloured title, no chevron. */
  destructive?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
  accessibilityHint?: string;
}

const PRESSED = colorsFor('light').surfaceSunken;

function Chevron() {
  // A text chevron keeps ui-mobile free of an icon font dependency and
  // scales with Dynamic Type like the row it sits in.
  return (
    <Text
      importantForAccessibility="no"
      accessibilityElementsHidden
      className="text-title3 text-label-tertiary"
    >
      ›
    </Text>
  );
}

/** One row of a `ListSection`. Pressable when `onPress` is given. */
export function ListRow({
  title,
  subtitle,
  value,
  icon,
  badge,
  accessory,
  destructive = false,
  onPress,
  disabled = false,
  testID,
  accessibilityHint,
}: ListRowProps) {
  const trailing = accessory ?? (onPress && !destructive ? 'chevron' : 'none');

  const body = (
    <View className="min-h-11 flex-row items-center gap-3 px-4 py-3">
      {icon ? <View className="w-7 items-center">{icon}</View> : null}
      <View className="min-w-0 flex-1">
        <Text
          className={cn('text-body', destructive ? 'text-danger' : 'text-label')}
          numberOfLines={2}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text className="mt-0.5 text-subhead text-label-secondary">{subtitle}</Text>
        ) : null}
      </View>
      {value ? (
        <Text className="max-w-[45%] text-right text-body text-label-secondary" numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {badge}
      {trailing === 'chevron' ? <Chevron /> : trailing === 'none' ? null : trailing}
    </View>
  );

  if (!onPress) {
    return (
      <View
        testID={testID}
        accessible
        accessibilityLabel={[title, subtitle, value].filter(Boolean).join(', ')}
      >
        {body}
      </View>
    );
  }
  return (
    // A full-width row highlights instead of scaling (MO-01's list variant):
    // a row that shrinks inside its rounded group reads as a glitch, and the
    // highlight is the press feedback iOS and Material lists both use.
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={[title, value].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint ?? subtitle}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={({ pressed }) => (pressed ? { backgroundColor: PRESSED } : undefined)}
    >
      {body}
    </Pressable>
  );
}
