import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, useThemeColors } from '@chefer/ui-mobile';
import { cn, conflictHeadline, type ConflictLike } from '@chefer/utils';
import { useT } from '../../lib/i18n';

// Mirrors apps/web/src/features/recipes/components/AllergenWarning.tsx: shown
// wherever a recipe conflicts with the viewer's allergies or dietary
// restrictions (the API's `allergenWarnings`, household union), so an unsafe
// dish is never presented silently (audit F-REC-2-3, F-PLAN-1-7).

/** Full-width banner for the recipe screen and cook mode. */
export function AllergenWarningBanner({
  warnings,
  details,
  className,
}: {
  warnings: string[] | undefined;
  /** `safetyChecks.conflictDetails` — lets the line say "Not paleo: contains quinoa" (UX-PLAN-06). */
  details?: readonly ConflictLike[] | null | undefined;
  className?: string;
}) {
  const { t } = useT();
  const colors = useThemeColors();
  if (!warnings || warnings.length === 0) return null;
  const headline = conflictHeadline(warnings, details);
  return (
    <View
      testID="allergen-warning"
      accessibilityRole="alert"
      className={cn(
        'flex-row items-start gap-2 rounded-card border border-danger/30 bg-danger/10 px-3 py-2.5',
        className,
      )}
    >
      <Ionicons name="warning" size={16} color={colors.danger} style={{ marginTop: 2 }} />
      <Text className="min-w-0 flex-1 text-subhead text-danger">
        <Text className="text-subhead font-semibold text-danger">{headline}.</Text>{' '}
        {t('recipes.allergen.banner')}
      </Text>
    </View>
  );
}

/** Compact chip for meal cards. */
export function AllergenWarningChip({
  warnings,
  details,
}: {
  warnings: string[] | undefined;
  details?: readonly ConflictLike[] | null | undefined;
}) {
  const colors = useThemeColors();
  if (!warnings || warnings.length === 0) return null;
  const headline = conflictHeadline(warnings, details);
  return (
    <View
      accessibilityLabel={headline}
      className="flex-row items-center gap-1 self-start rounded-full bg-danger/10 px-2 py-0.5"
    >
      <Ionicons name="warning" size={12} color={colors.danger} />
      <Text numberOfLines={1} className="text-caption font-semibold text-danger">
        {headline}
      </Text>
    </View>
  );
}
