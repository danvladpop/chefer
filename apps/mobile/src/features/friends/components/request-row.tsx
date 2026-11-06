import { useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import type { FriendUserSummary } from '@chefer/types';
import { Button, haptics, useSnackbar } from '@chefer/ui-mobile';
import { track } from '../../../lib/analytics';
import { useT } from '../../../lib/i18n';
import { useAnswerRequest } from '../api/use-answer-request';
import { useIsOnline } from '../api/use-is-online';
import { useRelationActions } from '../api/use-relation-actions';
import { PersonRow } from './person-row';

// ─── RequestRow (UX §3.2, §5.1, §7) ───────────────────────────────────────────
// PersonRow + `Accept` (primary sm) + `Decline` (outline sm), each labelled
// with the name (`Accept Andrei Ionescu`). Answering is optimistic: the row
// leaves `friends.requests` at once (the list animates it out, MO-04) and the
// person's `Follows you` / Activity state update everywhere
// (use-answer-request.ts). Accept then shows `{first} can now see your meals
// and workouts.` with `Follow back` when I don't follow them yet. A failure
// puts the row back with `Couldn’t update. Try again.` + `Retry`.

export type RequestRowProps = {
  person: FriendUserSummary;
  secondary?: string | null;
  /** Analytics `friend_request_answered.via`. */
  via: 'home' | 'requests' | 'activity';
  /** After the server confirmed the answer. */
  onAnswered?: (answer: 'accept' | 'decline') => void;
  testID?: string;
};

function announce(message: string): void {
  try {
    AccessibilityInfo.announceForAccessibility(message);
  } catch {
    // No accessibility service (tests, some Android builds).
  }
}

export function RequestRow({
  person,
  secondary,
  via,
  onAnswered,
  testID = `friends-request-${person.id}`,
}: RequestRowProps) {
  const { t } = useT();
  const { accept, decline } = useAnswerRequest();
  const { follow } = useRelationActions();
  const snackbar = useSnackbar();
  const online = useIsOnline();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);

  const answer = async (kind: 'accept' | 'decline') => {
    if (busy) return;
    setBusy(kind);
    haptics.selection();
    const result = kind === 'accept' ? await accept(person.id) : await decline(person.id);
    setBusy(null);
    if (!result.ok) {
      haptics.error();
      snackbar.show({
        message: t('friends.relation.error'),
        actionLabel: t('friends.relation.errorAction'),
        onAction: () => void answer(kind),
      });
      return;
    }
    track('friend_request_answered', { action: kind, via });
    onAnswered?.(kind);
    if (kind === 'decline') return;
    announce(t('friends.announce.requestAccepted', { name: person.displayName }));
    const canFollowBack = person.relation === 'none';
    snackbar.show({
      message: t('friends.accepted.snackbar', { first: person.firstName }),
      tone: 'success',
      ...(canFollowBack
        ? {
            actionLabel: t('friends.accepted.action'),
            onAction: () => {
              void follow(person.id, 'requested').then((r) => {
                if (r.ok)
                  track('friend_follow', {
                    source: via === 'activity' ? 'activity' : 'followers',
                    outcome: r.relation === 'following' ? 'following' : 'requested',
                  });
              });
            },
          }
        : {}),
    });
  };

  const offlineHint = online ? undefined : t('friends.offline.needsConnection');

  return (
    <PersonRow
      testID={testID}
      person={person}
      secondary={secondary ?? null}
      trailing={
        <>
          <Button
            testID={`${testID}-accept`}
            size="sm"
            loading={busy === 'accept'}
            disabled={busy !== null || !online}
            accessibilityLabel={t('friends.requestRow.acceptLabel', { name: person.displayName })}
            accessibilityHint={offlineHint}
            onPress={() => void answer('accept')}
          >
            {t('friends.requestRow.accept')}
          </Button>
          <Button
            testID={`${testID}-decline`}
            size="sm"
            variant="outline"
            loading={busy === 'decline'}
            disabled={busy !== null || !online}
            accessibilityLabel={t('friends.requestRow.declineLabel', { name: person.displayName })}
            accessibilityHint={offlineHint}
            onPress={() => void answer('decline')}
          >
            {t('friends.requestRow.decline')}
          </Button>
        </>
      }
    />
  );
}
