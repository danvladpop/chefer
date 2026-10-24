import { useCallback } from 'react';
import { Share } from 'react-native';
import { Button, Card, Text, type ButtonProps } from '@chefer/ui-mobile';
import { getWebUrl } from '../../../lib/api-url';
import { useT } from '../../../lib/i18n';
import { useFriendsMe } from '../api/use-friends-me';

// ─── Invite (UX §5.2, §12 `invite.*`) ─────────────────────────────────────────
// `Invite someone` opens the OS share sheet with RN core `Share.share` (no
// native module — the shopping-list share does the same). The message names
// me so the other person can search for me by name (search is name-only).

/** The link in the invite: the Chefer site, which points to both stores. */
export function inviteAppLink(): string {
  return getWebUrl('/');
}

/** Opens the share sheet. Cancelling or a share failure is silent. */
export function useInvite(): () => Promise<void> {
  const { t } = useT();
  const { me } = useFriendsMe();
  const myName = [me?.firstName, me?.lastName].filter(Boolean).join(' ').trim();
  return useCallback(async () => {
    try {
      await Share.share({
        message: t('friends.invite.message', { myName, appLink: inviteAppLink() }),
      });
    } catch {
      // Share sheet unavailable or dismissed with an error — nothing to show.
    }
  }, [myName, t]);
}

export type InviteButtonProps = {
  variant?: ButtonProps['variant'];
  className?: string;
  testID?: string;
};

/** `Invite someone` (Followers empty state, no-results search). */
export function InviteButton({
  variant = 'default',
  className,
  testID = 'friends-invite',
}: InviteButtonProps) {
  const { t } = useT();
  const invite = useInvite();
  return (
    <Button
      testID={testID}
      variant={variant}
      {...(className ? { className } : {})}
      onPress={() => void invite()}
    >
      {t('friends.invite.cta')}
    </Button>
  );
}

/** The empty-suggestions card: `Chefer is better together` (UX §5.2). */
export function InviteCard({ testID = 'friends-invite-card' }: { testID?: string }) {
  const { t } = useT();
  return (
    <Card testID={testID} className="gap-2">
      <Text variant="heading">{t('friends.invite.card.title')}</Text>
      <Text variant="muted">{t('friends.invite.card.body')}</Text>
      <InviteButton variant="outline" testID={`${testID}-cta`} className="mt-1 self-start" />
    </Card>
  );
}
