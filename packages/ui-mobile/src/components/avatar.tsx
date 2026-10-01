import { useState } from 'react';
import { Image, View } from 'react-native';
import { avatarColorIndex, cn, initialsOf } from '@chefer/utils';
import { DENSE_MAX_FONT_SCALE, Text } from './text';

export type AvatarSize = 'sm' | 'md' | 'lg';

/** Diameter in points per size (UX §3.1: sm 32 · md 40 · lg 72). */
export const AVATAR_SIZES: Record<AvatarSize, number> = { sm: 32, md: 40, lg: 72 };

const AVATAR_TEXT: Record<AvatarSize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-2xl',
};

/**
 * Eight warm background colours, each ≥ 4.5:1 against the white initials.
 * Raw values (not NativeWind classes) so the seed → colour pick is a plain
 * array index that tests and other surfaces can read.
 */
export const AVATAR_COLORS = [
  '#944a00', // brand brown
  '#b45309', // amber-700
  '#9a3412', // orange-800
  '#b91c1c', // red-700
  '#9f1239', // rose-800
  '#854d0e', // yellow-800
  '#7c2d12', // orange-900
  '#a16207', // yellow-700
] as const;

export type AvatarProps = {
  /** Display name — the initials come from it. */
  name: string;
  /** Stable seed (the user id) — the same seed always gets the same colour. */
  seed: string;
  /** Optional photo. The initials stay underneath, so a failed load keeps the placeholder (MO-13). */
  imageUrl?: string | null;
  size?: AvatarSize;
  className?: string;
  testID?: string;
};

/**
 * Initials avatar on one of eight warm colours picked from `seed`. Decorative:
 * it is hidden from the accessibility tree because the row that contains it
 * carries the person's label (UX §13).
 *
 * Photos use React Native's `Image` — the kit has no `expo-image` dependency
 * and a JS-only change cannot add one; a failed load just leaves the initials.
 */
export function Avatar({ name, seed, imageUrl, size = 'md', className, testID }: AvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const diameter = AVATAR_SIZES[size];
  const color = AVATAR_COLORS[avatarColorIndex(seed, AVATAR_COLORS.length)];
  const showImage = !!imageUrl && failedUrl !== imageUrl;

  return (
    <View
      testID={testID}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={cn('shrink-0 items-center justify-center overflow-hidden rounded-full', className)}
      style={{ width: diameter, height: diameter, backgroundColor: color }}
    >
      <Text
        testID={testID ? `${testID}-initials` : undefined}
        maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE}
        className={cn('font-semibold text-white', AVATAR_TEXT[size])}
      >
        {initialsOf(name)}
      </Text>
      {showImage ? (
        <Image
          testID={testID ? `${testID}-image` : undefined}
          source={{ uri: imageUrl }}
          accessible={false}
          resizeMode="cover"
          onError={() => setFailedUrl(imageUrl)}
          style={{ position: 'absolute', left: 0, top: 0, width: diameter, height: diameter }}
        />
      ) : null}
    </View>
  );
}
