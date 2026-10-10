import { Children, isValidElement, type ReactNode } from 'react';
import { Image, View } from 'react-native';
import { cn } from '@chefer/utils';
import { PressableScale } from '../motion/pressable-scale';
import { Text } from './text';

// One tile for recipes and workouts (10 Oct redesign: "the grid where the
// recipes are displayed and the grid where the workouts are displayed should
// be similar"). Every tile is the same four parts: a framed image (or an
// illustration for things without a photo), a title, one meta line and one
// action. `MediaTile` stacks them for 2-column grids (Meals day, Cookbook,
// routine days); `MediaRow` lays the same parts in a line for lists where
// dates and stats scan better (past workouts, program days).

export interface MediaFrameProps {
  /** A photo; covers the frame (no letterboxing). */
  imageUri?: string | null;
  /** Shown when there is no photo: an icon on a brand-tint wash. */
  illustration?: ReactNode;
  /** Frame height; width fills (tile) or equals the height (row). */
  size: number;
  square?: boolean;
  radius?: 'inner' | 'control';
  testID?: string;
}

/** The framed image shared by tiles and rows. */
export function MediaFrame({
  imageUri,
  illustration,
  size,
  square = false,
  radius = 'control',
  testID,
}: MediaFrameProps) {
  const rounded = radius === 'inner' ? 'rounded-inner' : 'rounded-control';
  const box = square ? { width: size, height: size } : { height: size };
  if (imageUri) {
    return (
      <Image
        testID={testID}
        source={{ uri: imageUri }}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
        className={cn('bg-surface-sunken', rounded, !square && 'w-full')}
        style={box}
      />
    );
  }
  return (
    <View
      testID={testID}
      className={cn('items-center justify-center bg-brand-tint', rounded, !square && 'w-full')}
      style={box}
    >
      {illustration}
    </View>
  );
}

export interface MediaTileProps {
  title: string;
  /** The one meta line, e.g. "Lunch · 640 kcal" or "Wed 7 Oct · 61 min". */
  meta?: string;
  imageUri?: string | null;
  illustration?: ReactNode;
  /** A label on the frame's top-left, e.g. the meal type ("Breakfast"). */
  label?: string;
  /** A small badge next to the label (e.g. "🏆 PR"); text, so it is read aloud. */
  badge?: string;
  /** The one action, drawn on the frame's top-right (a 44pt round button). */
  action?: ReactNode;
  onPress?: () => void;
  accessibilityHint?: string;
  testID?: string;
}

function TileLabel({ text, tone }: { text: string; tone: 'brand' | 'surface' }) {
  return (
    <Text
      numberOfLines={1}
      className={cn(
        'rounded-full px-2.5 py-0.5 text-caption font-bold',
        tone === 'brand'
          ? 'bg-brand uppercase tracking-wide text-brand-on'
          : 'bg-surface text-brand',
      )}
    >
      {text}
    </Text>
  );
}

/** A grid tile: frame on top, title (2 lines max) and one meta line below. */
export function MediaTile({
  title,
  meta,
  imageUri,
  illustration,
  label,
  badge,
  action,
  onPress,
  accessibilityHint,
  testID,
}: MediaTileProps) {
  const spoken = [label, title, meta, badge].filter(Boolean).join(', ');
  return (
    <View
      testID={testID}
      className="min-w-0 flex-1 rounded-card border border-separator bg-surface p-2"
    >
      <PressableScale
        pressScale="card"
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityHint={accessibilityHint}
        onPress={onPress}
        disabled={!onPress}
        className="gap-2"
      >
        <MediaFrame imageUri={imageUri} illustration={illustration} size={120} />
        <View className="gap-0.5 px-1 pb-1">
          <Text numberOfLines={2} className="text-callout font-semibold text-label">
            {title}
          </Text>
          {meta ? (
            <Text numberOfLines={1} className="text-caption text-label-secondary">
              {meta}
            </Text>
          ) : null}
        </View>
      </PressableScale>
      {label || badge ? (
        <View
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          className="absolute left-3.5 top-3.5 flex-row gap-1"
          style={{ right: action ? 60 : 14 }}
        >
          {label ? <TileLabel text={label} tone="brand" /> : null}
          {badge ? <TileLabel text={badge} tone="surface" /> : null}
        </View>
      ) : null}
      {action ? <View className="absolute right-2.5 top-2.5">{action}</View> : null}
    </View>
  );
}

export interface MediaRowProps {
  title: string;
  meta?: string;
  imageUri?: string | null;
  illustration?: ReactNode;
  badge?: string;
  /** The one trailing action (a 44pt button), or nothing for a plain push row. */
  action?: ReactNode;
  onPress?: () => void;
  accessibilityHint?: string;
  testID?: string;
}

/** The tile's parts on one line: 56pt frame, title + badge, meta, action. */
export function MediaRow({
  title,
  meta,
  imageUri,
  illustration,
  badge,
  action,
  onPress,
  accessibilityHint,
  testID,
}: MediaRowProps) {
  const spoken = [title, badge, meta].filter(Boolean).join(', ');
  return (
    <View
      testID={testID}
      className="flex-row items-center gap-1 rounded-card border border-separator bg-surface py-2 pl-2 pr-1"
    >
      <PressableScale
        pressScale="card"
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityHint={accessibilityHint}
        onPress={onPress}
        disabled={!onPress}
        className="min-h-11 min-w-0 flex-1 flex-row items-center gap-3"
      >
        <MediaFrame
          imageUri={imageUri}
          illustration={illustration}
          size={56}
          square
          radius="inner"
        />
        <View className="min-w-0 flex-1 gap-0.5">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text numberOfLines={1} className="shrink text-headline font-semibold text-label">
              {title}
            </Text>
            {badge ? (
              <Text className="rounded-full bg-brand-tint px-2 text-caption font-semibold text-brand">
                {badge}
              </Text>
            ) : null}
          </View>
          {meta ? (
            <Text numberOfLines={1} className="text-caption text-label-secondary">
              {meta}
            </Text>
          ) : null}
        </View>
      </PressableScale>
      {action}
    </View>
  );
}

export interface TileGridProps {
  children: ReactNode;
  className?: string;
  testID?: string;
}

/** Two equal columns of `MediaTile`s; an odd last tile keeps its half width. */
export function TileGrid({ children, className, testID }: TileGridProps) {
  const items = Children.toArray(children).filter(isValidElement);
  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View testID={testID} className={cn('gap-2.5', className)}>
      {rows.map((row, index) => (
        <View key={index} className="flex-row gap-2.5">
          {row}
          {row.length === 1 ? <View className="flex-1" /> : null}
        </View>
      ))}
    </View>
  );
}
