import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AI_GENERATED_A11Y_LABEL, AI_GENERATED_LABEL, isAiGenerated } from '@chefer/types';
import { Text } from '@chefer/ui-mobile';

// ─── AI-generated chip (UX-26 §4, T-26.6; EU AI Act Art. 50) ──────────────────
// Muted `sparkles-outline` chip. Pass the recipe (anything with the optional
// `aiGenerated` flag): it renders nothing unless the flag is exactly true, so an
// old API (no flag) or a curated/manual recipe shows no chip. Web twin:
// `AiGeneratedChip` in @chefer/ui. Mount on AI plan meals (plan-meal-card),
// recipe detail, imported drafts and the AI swap proposal.

export function AiGeneratedChip({
  recipe,
  testID = 'ai-generated-chip',
  a11yLabel = AI_GENERATED_A11Y_LABEL,
}: {
  /** Anything carrying the optional `aiGenerated` flag (a recipe, or the weekly review). */
  recipe: object | null | undefined;
  testID?: string;
  /** Spoken label; defaults to the recipe wording. */
  a11yLabel?: string;
}) {
  if (!isAiGenerated(recipe)) return null;
  return (
    <View
      testID={testID}
      accessibilityLabel={a11yLabel}
      className="min-h-6 flex-row items-center gap-1 self-start rounded-full bg-gray-100 px-2 py-0.5"
    >
      <Ionicons name="sparkles-outline" size={11} color="#6b7280" accessible={false} />
      <Text className="text-xs font-medium text-gray-600">{AI_GENERATED_LABEL}</Text>
    </View>
  );
}
