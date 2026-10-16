import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Biscuit,
  KeyboardAwareScrollView,
  PressableScale,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { cn, ONBOARDING_V4_COPY, type BiscuitLoop, type OnboardingV4Icon } from '@chefer/utils';

// Onboarding V4 building blocks (boards: canvas page "Onboarding V4 —
// proposal"). Revamp roles only; press feedback is PressableScale (MO-01),
// Biscuit's loops are his own (MO-tokens, reduced motion inside).

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export const V4_ICONS: Record<OnboardingV4Icon, IoniconName> = {
  calendar: 'calendar-outline',
  barbell: 'barbell-outline',
  pie: 'pie-chart-outline',
  people: 'people-outline',
  scale: 'scale-outline',
  leaf: 'leaf-outline',
  restaurant: 'restaurant-outline',
};

/** Full-height canvas page: scrolling content and a pinned footer. */
export function V4Screen({
  top,
  children,
  footer,
  center = false,
  testID,
}: {
  top?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Vertically centre the content (welcome, loaders, success). */
  center?: boolean;
  testID?: string;
}) {
  return (
    <SafeAreaView
      edges={['top', 'bottom', 'left', 'right']}
      className="flex-1 bg-canvas"
      testID={testID}
    >
      {top}
      <KeyboardAwareScrollView
        contentContainerStyle={{
          gap: 18,
          paddingHorizontal: 14,
          paddingTop: 6,
          paddingBottom: 14,
          ...(center && { flexGrow: 1, justifyContent: 'center' as const }),
        }}
        footer={footer ? <View className="gap-1.5 px-4 pb-1 pt-2.5">{footer}</View> : undefined}
      >
        {children}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

/** Back arrow + segmented progress (no "Step x of y" text — the segments say it). */
export function V4TopBar({
  onBack,
  progress,
}: {
  onBack?: () => void;
  progress?: { current: number; total: number } | null;
}) {
  const c = useThemeColors();
  return (
    <View className="min-h-11 flex-row items-center gap-2.5 px-4">
      {onBack ? (
        <PressableScale
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={ONBOARDING_V4_COPY.back}
          testID="onb-v4-back"
          className="-ml-2 h-11 w-11 items-center justify-center"
        >
          <Ionicons name="chevron-back" size={26} color={c.brand} />
        </PressableScale>
      ) : (
        <View className="w-11" />
      )}
      {progress ? (
        <View
          className="flex-1 flex-row gap-1.5"
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: progress.total, now: progress.current }}
          testID="onb-v4-progress"
        >
          {Array.from({ length: progress.total }, (_, i) => (
            <View
              key={i}
              className={cn(
                'h-1.5 flex-1 rounded-full',
                i < progress.current ? 'bg-brand' : 'bg-separator',
              )}
            />
          ))}
        </View>
      ) : (
        <View className="flex-1" />
      )}
      <View className="w-9" />
    </View>
  );
}

/** Biscuit on his brand-tint halo. */
export function BiscuitStage({ loop, size = 170 }: { loop: BiscuitLoop; size?: number }) {
  return (
    <View
      className="items-center justify-end self-center"
      style={{ width: size, height: size * 0.94 }}
    >
      <View
        className="absolute rounded-full bg-brand-tint"
        style={{ width: size * 0.84, height: size * 0.6, bottom: size * 0.02 }}
      />
      <Biscuit loop={loop} size={size} />
    </View>
  );
}

export function V4Heading({
  title,
  lede,
  align = 'center',
}: {
  title: string;
  lede?: string;
  align?: 'center' | 'left';
}) {
  return (
    <View className="gap-1.5">
      <Text
        accessibilityRole="header"
        className={cn('text-title1 font-bold text-label', align === 'center' && 'text-center')}
        testID="onb-v4-title"
      >
        {title}
      </Text>
      {lede ? (
        <Text
          className={cn('text-callout text-label-secondary', align === 'center' && 'text-center')}
        >
          {lede}
        </Text>
      ) : null}
    </View>
  );
}

/** A 2-column tile: icon + 1–3 words, selected = brand border + check badge. */
export function V4Tile({
  icon,
  label,
  selected,
  onPress,
  role = 'checkbox',
  testID,
}: {
  icon: OnboardingV4Icon;
  label: string;
  selected: boolean;
  onPress: () => void;
  role?: 'checkbox' | 'radio';
  testID?: string;
}) {
  const c = useThemeColors();
  return (
    <PressableScale
      pressScale="card"
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      testID={testID}
      className={cn(
        'min-h-[104px] flex-1 justify-between gap-2.5 rounded-card p-3.5',
        selected ? 'border-2 border-brand bg-brand-tint' : 'border border-separator bg-surface',
      )}
    >
      {selected ? (
        <View className="absolute right-2 top-2 h-[22px] w-[22px] items-center justify-center rounded-full bg-brand">
          <Ionicons name="checkmark" size={15} color={c.onBrand} />
        </View>
      ) : null}
      <View
        className={cn(
          'h-11 w-11 items-center justify-center rounded-control',
          selected ? 'bg-brand' : 'bg-brand-tint',
        )}
      >
        <Ionicons name={V4_ICONS[icon]} size={24} color={selected ? c.onBrand : c.brand} />
      </View>
      <Text className="text-headline font-semibold text-label">{label}</Text>
    </PressableScale>
  );
}

/** Lays tiles out two to a row. */
export function V4TileGrid({ children }: { children: ReactNode[] }) {
  const rows: ReactNode[][] = [];
  children.forEach((child, i) => {
    if (i % 2 === 0) rows.push([]);
    rows[rows.length - 1]?.push(child);
  });
  return (
    <View className="gap-2.5">
      {rows.map((row, i) => (
        <View key={i} className="flex-row gap-2.5">
          {row}
          {row.length === 1 ? <View className="flex-1" /> : null}
        </View>
      ))}
    </View>
  );
}

export function V4Chip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      testID={testID}
      className={cn(
        'min-h-11 justify-center rounded-full border px-4',
        selected ? 'border-brand bg-brand' : 'border-separator bg-surface',
      )}
    >
      <Text className={cn('text-callout font-medium', selected ? 'text-brand-on' : 'text-label')}>
        {label}
      </Text>
    </PressableScale>
  );
}

export function V4Primary({
  label,
  onPress,
  loading = false,
  disabled = false,
  icon,
  testID,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: IoniconName;
  testID?: string;
}) {
  const c = useThemeColors();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      accessibilityLabel={label}
      testID={testID}
      className={cn(
        'min-h-[50px] flex-row items-center justify-center gap-2 rounded-control bg-brand px-4',
        (disabled || loading) && 'opacity-50',
      )}
    >
      {loading ? (
        <ActivityIndicator color={c.onBrand} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={20} color={c.onBrand} /> : null}
          <Text className="text-headline font-semibold text-brand-on">{label}</Text>
        </>
      )}
    </PressableScale>
  );
}

export function V4Ghost({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      className="min-h-11 items-center justify-center"
    >
      <Text className="text-callout font-semibold text-brand">{label}</Text>
    </PressableScale>
  );
}

/** Small section caption above a chip row. */
export function V4Caption({ children }: { children: string }) {
  return <Text className="text-subhead font-semibold text-label-secondary">{children}</Text>;
}

/** A green tick row (loader checklist, Premium-is-on list). */
export function V4Tick({ label, done }: { label: string; done: boolean }) {
  const c = useThemeColors();
  return (
    <View className="flex-row items-center gap-2.5">
      {done ? (
        <View className="h-[26px] w-[26px] items-center justify-center rounded-full bg-positive">
          <Ionicons name="checkmark" size={16} color={c.onBrand} />
        </View>
      ) : (
        <ActivityIndicator color={c.brand} style={{ width: 26, height: 26 }} />
      )}
      <Text className={cn('text-body', done ? 'text-label' : 'text-label-secondary')}>{label}</Text>
    </View>
  );
}
