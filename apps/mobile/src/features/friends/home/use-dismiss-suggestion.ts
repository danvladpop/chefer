import { useQueryClient } from '@tanstack/react-query';
import { FRIENDS_COPY } from '@chefer/types';
import { haptics, useSnackbar } from '@chefer/ui-mobile';
import { track } from '../../../lib/analytics';
import { trpc } from '../../../lib/trpc';
import { removePerson, rollbackFriendsCache } from '../api/relation-cache';
import type { SuggestionRowData } from './suggestion-row';

// ─── Hide a suggestion (UX §5.1) ──────────────────────────────────────────────
// The `×` removes the row at once (MO-04) in every suggestions list that
// shows it; the server hides the person for 90 days. A failure puts the row
// back with `Couldn’t update. Try again.` + `Retry`. Following keeps its own
// row in place — only the dismissal removes it.

export function useDismissSuggestion(): (person: SuggestionRowData) => Promise<void> {
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();
  const mutation = trpc.friends.dismissSuggestion.useMutation({ meta: { silent: true } });
  const snackbar = useSnackbar();

  const dismiss = async (person: SuggestionRowData): Promise<void> => {
    const snapshot = removePerson(queryClient, person.id, ['suggestions']);
    haptics.selection();
    try {
      await mutation.mutateAsync({ userId: person.id });
    } catch {
      rollbackFriendsCache(queryClient, snapshot);
      haptics.error();
      snackbar.show({
        message: FRIENDS_COPY.relation.error,
        actionLabel: FRIENDS_COPY.relation.errorAction,
        onAction: () => void dismiss(person),
      });
      return;
    }
    track('friend_suggestion_dismissed', { reason: person.reason });
    // Stale only: the next mount refetches; the screen keeps what it shows.
    void utils.friends.suggestions.invalidate(undefined, { refetchType: 'none' });
  };
  return dismiss;
}
