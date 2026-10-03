import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FRIENDS_COPY, type FriendsMeDto } from '@chefer/types';
import { useSnackbar } from '@chefer/ui-mobile';
import { track } from '../../../lib/analytics';
import { trpc } from '../../../lib/trpc';
import { isFriendsQueryKey } from '../api/query-keys';
import { FriendsConfirmSheet, type ConfirmCopy } from '../safety/confirm-copy';

// ─── Turn off Following (UX §11.5, FR-05, FD-14) ───────────────────────────────
// Destructive confirm listing the consequences. Not optimistic: nothing is
// removed until `friends.deactivate({ confirm: 'TURN_OFF' })` answers (it is
// idempotent — turning off twice is still `ok`). After the sheet has fully
// exited: snackbar `Following is off.`, the Following caches are dropped and
// `friends.me` refetched (it now says "not activated", so every entry point
// shows the intro again), and the user goes back to More.

const TURN_OFF_COPY: ConfirmCopy = {
  title: FRIENDS_COPY.turnOff.title,
  body: [
    FRIENDS_COPY.turnOff.intro,
    ...FRIENDS_COPY.turnOff.bullets.map((line) => `• ${line}`),
    FRIENDS_COPY.turnOff.outro,
  ].join('\n'),
  confirmLabel: FRIENDS_COPY.turnOff.cta,
  cancelLabel: FRIENDS_COPY.common.cancel,
  destructive: true,
};

/** Where `Turn off Following` leaves to. */
export function leaveToMore(): void {
  router.dismissTo('/(food)/more');
}

export function TurnOffSheet({
  visible,
  counts,
  onClose,
  onExited,
}: {
  visible: boolean;
  counts: FriendsMeDto['counts'];
  onClose: () => void;
  onExited?: () => void;
}) {
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();
  const mutation = trpc.friends.deactivate.useMutation({ meta: { silent: true } });
  const snackbar = useSnackbar();

  return (
    <FriendsConfirmSheet
      testID="friends-settings-turn-off-confirm"
      visible={visible}
      copy={TURN_OFF_COPY}
      errorMessage={FRIENDS_COPY.settings.saveError}
      onClose={onClose}
      onConfirm={async () => {
        try {
          await mutation.mutateAsync({ confirm: 'TURN_OFF' });
        } catch {
          return false;
        }
        track('friends_deactivated', {
          followingCount: counts.following,
          followerCount: counts.followers,
        });
        return true;
      }}
      onDone={() => {
        snackbar.show({ message: FRIENDS_COPY.turnOff.done, tone: 'success' });
        // Everything about other people is gone server-side: drop it rather
        // than refetch (it would answer "not activated"). `availability` stays.
        queryClient.removeQueries({
          predicate: ({ queryKey }) => {
            if (!isFriendsQueryKey(queryKey)) return false;
            const path = queryKey[0] as string[];
            return path[1] !== 'availability' && path[1] !== 'me';
          },
        });
        void utils.friends.me.invalidate();
        // My recipes left other people's saved lists, and theirs left mine.
        void utils.recipe.list.invalidate();
        leaveToMore();
      }}
      {...(onExited ? { onExited } : {})}
    />
  );
}
