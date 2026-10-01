import { FlatList, RefreshControl } from 'react-native';
import { FRIENDS_COPY, FRIENDS_LIMITS } from '@chefer/types';
import { ErrorState, Screen } from '@chefer/ui-mobile';
import { isFriendsUnavailableError } from '../api/friends-errors';
import { FriendsGate, FriendsUnavailableScreen } from '../components/friends-gate';
import { FriendsScreenHeader } from '../components/friends-screen-header';
import { InviteCard } from '../components/invite';
import { FRIENDS_SCREEN_TITLES } from '../components/screen-titles';
import { ActivatedGate } from './activated-gate';
import { useSuggestions } from './friends-lists';
import { PersonRowsSkeleton } from './skeletons';
import { SuggestionRow } from './suggestion-row';

// ─── Suggested for you, See all (UX §2.2, §5.1; PRD FR-09) ────────────────────
// Up to 30, the same rows as the home section: reason as the secondary line,
// RelationButton, and the dismiss `×`. Following keeps the row in place with
// its new state; dismissing removes it (MO-04).

function SuggestionsBody() {
  const query = useSuggestions(FRIENDS_LIMITS.suggestionsAll);
  const suggestions = query.data ?? [];

  if (isFriendsUnavailableError(query.error)) return <FriendsUnavailableScreen />;
  if (query.isError && !query.data) {
    return (
      <ErrorState
        testID="friends-suggestions-error"
        title={FRIENDS_COPY.home.sectionError('suggestions')}
        description=""
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (query.isLoading) return <PersonRowsSkeleton testID="friends-suggestions-loading" />;

  return (
    <FlatList
      testID="friends-suggestions-list"
      data={suggestions}
      keyExtractor={(p) => p.id}
      initialNumToRender={20}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
      }
      renderItem={({ item }) => <SuggestionRow person={item} />}
      ListEmptyComponent={<InviteCard testID="friends-suggestions-invite" />}
      contentContainerClassName={suggestions.length === 0 ? 'px-4 py-4' : undefined}
    />
  );
}

export function FriendsSuggestionsScreen() {
  return (
    <FriendsGate>
      <ActivatedGate title={FRIENDS_SCREEN_TITLES.suggestions} testID="friends-suggestions">
        <Screen testID="friends-suggestions" className="px-0">
          <FriendsScreenHeader
            title={FRIENDS_SCREEN_TITLES.suggestions}
            testID="friends-suggestions-header"
          />
          <SuggestionsBody />
        </Screen>
      </ActivatedGate>
    </FriendsGate>
  );
}
