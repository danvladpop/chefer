import { useState } from 'react';
import { Image, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { getRecipeImageUrl } from '../../lib/recipe-image';

// UX-REC-10: a recipe photo that fails to load (the image host answers 402
// intermittently) used to leave a blank white hero or thumbnail. On `onError`
// the image swaps for a tinted placeholder with a dish icon, so the card still
// has a visible, tappable image area and the ← / ⋯ buttons stay on a surface.

export function RecipeImage({
  imageUrl,
  className,
  accessibilityLabel,
  iconSize = 32,
  testID,
  style,
}: {
  imageUrl: string | null | undefined;
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
  const uri = getRecipeImageUrl(imageUrl);
  const failed = failedUri === uri;

  if (failed) {
    return (
      <View
        testID={testID ? `${testID}-placeholder` : undefined}
        accessible={accessibilityLabel !== undefined}
        accessibilityLabel={accessibilityLabel}
        className={cn('items-center justify-center bg-brand-tint', className)}
        style={style}
      >
        <Ionicons name="restaurant-outline" size={iconSize} color={colors.brand} />
      </View>
    );
  }
  return (
    <Image
      testID={testID}
      source={{ uri }}
      className={className}
      style={style}
      resizeMode="cover"
      accessibilityLabel={accessibilityLabel}
      onError={() => setFailedUri(uri)}
    />
  );
}
