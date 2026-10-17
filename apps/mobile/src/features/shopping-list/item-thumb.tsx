import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { categoryTile } from './categories';

/**
 * A shop row's thumbnail (FB7-10). The picture when the ingredient has one that
 * loads; otherwise the aisle's icon on a tinted tile — a missing URL or a failed
 * (cold, timed-out) render never leaves a blank box.
 */
export function ItemThumb({
  uri,
  category,
  testID,
}: {
  uri: string | null | undefined;
  category: string;
  testID: string;
}) {
  const [failed, setFailed] = useState(false);
  // A new picture for the same row (e.g. the list refetched) gets a fresh try.
  useEffect(() => setFailed(false), [uri]);

  if (!uri || failed) {
    const { icon, tile, color } = categoryTile(category);
    return (
      <View
        testID={`${testID}-fallback`}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className={`h-12 w-12 items-center justify-center rounded-lg ${tile}`}
      >
        <Ionicons name={icon} size={22} color={color} />
      </View>
    );
  }
  return (
    <Image
      testID={testID}
      source={{ uri }}
      onError={() => setFailed(true)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="h-12 w-12 rounded-lg bg-gray-100"
      resizeMode="cover"
    />
  );
}
