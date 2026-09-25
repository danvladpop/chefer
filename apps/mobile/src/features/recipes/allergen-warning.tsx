import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';

// Mirrors apps/web/src/features/recipes/components/AllergenWarning.tsx: shown
// wherever a recipe conflicts with the viewer's allergies or dietary
// restrictions (the API's `allergenWarnings`, household union), so an unsafe
// dish is never presented silently (audit F-REC-2-3, F-PLAN-1-7).

/** Full-width banner for the recipe screen and cook mode. */
export function AllergenWarningBanner({
  warnings,
  className,
}: {
  warnings: string[] | undefined;
  className?: string;
}) {
  if (!warnings || warnings.length === 0) return null;
  const list = warnings.join(', ');
  return (
    <View
      testID="allergen-warning"
      accessibilityRole="alert"
      className={cn(
        'flex-row items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5',
        className,
      )}
    >
      <Ionicons name="warning" size={16} color="#991b1b" style={{ marginTop: 2 }} />
      <Text className="min-w-0 flex-1 text-sm text-red-800">
        <Text className="text-sm font-semibold text-red-800">Contains {list}.</Text> This recipe
        conflicts with your allergies or diet — check the ingredients or swap it.
      </Text>
    </View>
  );
}

/** Compact chip for meal cards. */
export function AllergenWarningChip({ warnings }: { warnings: string[] | undefined }) {
  if (!warnings || warnings.length === 0) return null;
  const list = warnings.join(', ');
  return (
    <View
      accessibilityLabel={`Contains ${list}`}
      className="flex-row items-center gap-1 self-start rounded-full bg-red-100 px-2 py-0.5"
    >
      <Ionicons name="warning" size={12} color="#991b1b" />
      <Text numberOfLines={1} className="text-xs font-semibold text-red-800">
        Contains {list}
      </Text>
    </View>
  );
}
