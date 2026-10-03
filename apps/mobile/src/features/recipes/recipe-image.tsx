import { useState } from 'react';
import { Image, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
}: {
  imageUrl: string | null | undefined;
  /** Size classes, e.g. `h-40 w-full`. */
  className: string;
  accessibilityLabel?: string;
  iconSize?: number;
  testID?: string;
}) {
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
        className={cn('items-center justify-center bg-accent', className)}
      >
        <Ionicons name="restaurant-outline" size={iconSize} color="#944a00" />
      </View>
    );
  }
  return (
    <Image
      testID={testID}
      source={{ uri }}
      className={className}
      resizeMode="cover"
      accessibilityLabel={accessibilityLabel}
      onError={() => setFailedUri(uri)}
    />
  );
}
