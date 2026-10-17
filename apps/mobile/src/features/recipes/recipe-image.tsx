import { useState } from 'react';
import { Image, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, useThemeColors } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { resolveRecipeImage, type RecipeImageStatus } from '../../lib/recipe-image';

// UX-REC-10: a recipe photo that fails to load (the image host answers 402
// intermittently) used to leave a blank white hero or thumbnail. On `onError`
// the image swaps for a tinted placeholder with a dish icon, so the card still
// has a visible, tappable image area and the ← / ⋯ buttons stay on a surface.
// F3 (2026-10-17): a recipe without a photo yet (`imageUrl: null`, waiting
// PENDING for its generated image) gets the same placeholder instead of a stock
// dish; with `showStatusLabel` it also says the photo is coming or unavailable,
// like web's RecipeImage.

const STATUS_LABEL = {
  preparing: 'Preparing photo…',
  unavailable: 'Photo unavailable',
} as const;

export function RecipeImage({
  imageUrl,
  imageStatus,
  showStatusLabel = false,
  className,
  accessibilityLabel,
  iconSize = 32,
  testID,
  style,
}: {
  imageUrl: string | null | undefined;
  /** Recipe.imageStatus, where the DTO carries it: tells "coming" from "none". */
  imageStatus?: RecipeImageStatus | null | undefined;
  /** Caption the placeholder ("Preparing photo…"); for heroes, not thumbnails. */
  showStatusLabel?: boolean;
  /** Size classes, e.g. `h-40 w-full`. */
  className: string;
  /** Computed size (e.g. a window-aware hero height), applied over `className`. */
  style?: StyleProp<ViewStyle & ImageStyle>;
  accessibilityLabel?: string;
  iconSize?: number;
  testID?: string;
}) {
  const colors = useThemeColors();
  // Keyed by the URL that failed, so a changed photo gets a fresh try.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const resolved = resolveRecipeImage(imageUrl, imageStatus);
  const view =
    resolved.kind === 'photo' && failedUri === resolved.uri
      ? ({ kind: 'unavailable' } as const)
      : resolved;

  if (view.kind !== 'photo') {
    const label = showStatusLabel && view.kind !== 'none' ? STATUS_LABEL[view.kind] : undefined;
    return (
      <View
        testID={testID ? `${testID}-placeholder` : undefined}
        accessible={accessibilityLabel !== undefined}
        accessibilityRole={accessibilityLabel !== undefined ? 'image' : undefined}
        accessibilityLabel={
          accessibilityLabel !== undefined && label
            ? `${accessibilityLabel}, ${label}`
            : accessibilityLabel
        }
        // The caller's classes size the frame; the wash always wins over a
        // loading tint such as `bg-muted`.
        className={cn(className, 'items-center justify-center gap-2 bg-brand-tint')}
        style={style}
      >
        <Ionicons name="restaurant-outline" size={iconSize} color={colors.brand} />
        {label ? (
          <Text
            testID={testID ? `${testID}-status` : undefined}
            className="text-caption font-medium text-brand"
          >
            {label}
          </Text>
        ) : null}
      </View>
    );
  }
  return (
    <Image
      testID={testID}
      source={{ uri: view.uri }}
      className={className}
      style={style}
      resizeMode="cover"
      accessibilityLabel={accessibilityLabel}
      onError={() => setFailedUri(view.uri)}
    />
  );
}
