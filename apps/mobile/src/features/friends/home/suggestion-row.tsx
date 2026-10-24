import { Pressable, View } from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { Translator } from '@chefer/i18n';
import type { FriendUserSummary } from '@chefer/types';
import { type FriendUserSummary } from '@chefer/types';
import { duration, useReducedMotion, useThemeColors } from '@chefer/ui-mobile';
import { useT } from '../../../lib/i18n';
import { PersonRow } from '../components/person-row';
import { RelationButton } from '../components/relation-button';
import { useDismissSuggestion } from './use-dismiss-suggestion';

// ─── A suggestion row (UX §5.1) ───────────────────────────────────────────────
// PersonRow (the reason as the secondary line) + `RelationButton sm` + a
// dismiss `×` (44 pt, `Hide suggestion {name}`). Dismissing removes the row
// (MO-04); following keeps it in place with its new state until the next
// refresh (the cache walker only flips the relation).

export type SuggestionRowData = FriendUserSummary & {
  reason: 'mutual' | 'follows_you' | 'popular';
  mutualCount: number;
  reasonName?: string;
};

/** `Followed by Maria Pop` · `Followed by Maria Pop and 2 others` · `Follows you` · `Popular on Chefer`. */
export function suggestionReasonText(person: SuggestionRowData, t: Translator['t']): string {
  if (person.reason === 'follows_you') return t('friends.reason.followsYou');
  if (person.reason === 'mutual' && person.reasonName) {
    return person.mutualCount > 1
      ? t('friends.reason.mutualMany', {
          name: person.reasonName,
          count: person.mutualCount - 1,
        })
      : t('friends.reason.mutualOne', { name: person.reasonName });
  }
  return t('friends.reason.popular');
}

export function SuggestionRow({ person }: { person: SuggestionRowData }) {
  const colors = useThemeColors();
  const { t } = useT();
  const dismiss = useDismissSuggestion();
  const reduced = useReducedMotion();
  return (
    <Animated.View
      // MO-04: the row fades out; the rest settle with a short layout transition.
      exiting={reduced ? undefined : FadeOut.duration(duration.base)}
      layout={reduced ? undefined : LinearTransition.duration(duration.base)}
    >
      <PersonRow
        testID={`friends-suggestion-${person.id}`}
        person={person}
        secondary={suggestionReasonText(person, t)}
        trailing={
          <View className="flex-row items-center">
            <RelationButton
              testID={`friends-suggestion-${person.id}-relation`}
              userId={person.id}
              relation={person.relation}
              followsYou={person.followsYou}
              name={person.displayName}
              firstName={person.firstName}
              source="suggestion"
            />
            <Pressable
              testID={`friends-suggestion-${person.id}-dismiss`}
              accessibilityRole="button"
              accessibilityLabel={t('friends.home.hideSuggestion', { name: person.displayName })}
              onPress={() => void dismiss(person)}
              className="h-11 w-11 items-center justify-center"
            >
              <Ionicons name="close" size={18} color={colors.labelTertiary} />
            </Pressable>
          </View>
        }
      />
    </Animated.View>
  );
}
