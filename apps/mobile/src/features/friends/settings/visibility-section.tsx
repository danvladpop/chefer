import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { FriendsMeDto } from '@chefer/types';
import { PressableScale, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { track } from '../../../lib/analytics';
import { useT } from '../../../lib/i18n';
import { AppealLink } from '../components/appeal-link';
import { FriendsConfirmSheet, type ConfirmCopy } from '../safety/confirm-copy';
import { sharedSectionsList } from './shared-sections';
import { useUpdateSettings } from './use-update-settings';
import { PrivateConfirmSheet } from './visibility-sheets';

// ─── Who can follow you (UX §11.1, §11.2, FR-03) ───────────────────────────────
// Two radios. Choosing the other one NEVER saves straight away: it opens the
// confirm that states what changes (Public: what followers will see + how many
// pending requests get accepted; Private: the current followers keep seeing
// what's shared). The save waits for the server — on error the sheet stays
// open with `Couldn’t save. Try again.`. A forced-private profile (moderation,
// PRD §9.3) has both radios disabled, Private selected, and the explanation;
// the server refuses Public in that state anyway.

type Settings = NonNullable<FriendsMeDto['settings']>;
type Visibility = Settings['visibility'];

type Pending =
  | { kind: 'public'; copy: ConfirmCopy }
  | { kind: 'private'; followers: number }
  | null;

function Radio({
  testID,
  label,
  selected,
  disabled,
  onPress,
}: {
  testID: string;
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      testID={testID}
      pressScale="card"
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn('min-h-11 flex-row items-center gap-3 py-2', disabled && 'opacity-60')}
    >
      <View
        className={cn(
          'h-5 w-5 items-center justify-center rounded-full border-2',
          selected ? 'border-brand' : 'border-separator',
        )}
      >
        {selected ? <View className="h-2.5 w-2.5 rounded-full bg-brand" /> : null}
      </View>
      <Text className="min-w-0 flex-1 text-body text-label">{label}</Text>
    </PressableScale>
  );
}

export function VisibilitySection({ me, settings }: { me: FriendsMeDto; settings: Settings }) {
  const { t } = useT();
  const { save } = useUpdateSettings();
  const [pending, setPending] = useState<Pending>(null);
  const [visible, setVisible] = useState(false);
  const locked = settings.forcedPrivate;

  const choose = (to: Visibility) => {
    if (locked || to === settings.visibility) return;
    if (to === 'PUBLIC') {
      // Snapshot the copy now: after the save the pending count drops to 0
      // while the sheet is still animating out.
      const requests = me.counts.pendingRequests;
      const body = t('friends.public.confirm.body', { sections: sharedSectionsList(settings, t) });
      setPending({
        kind: 'public',
        copy: {
          title: t('friends.public.confirm.title'),
          body:
            requests > 0
              ? `${body}\n\n${t('friends.public.confirm.pending', { count: requests })}`
              : body,
          confirmLabel: t('friends.public.confirm.cta'),
          cancelLabel: t('friends.common.cancel'),
          destructive: false,
        },
      });
    } else {
      setPending({ kind: 'private', followers: me.counts.followers });
    }
    setVisible(true);
  };

  const change = async (to: Visibility): Promise<boolean> => {
    const outcome = await save({ visibility: to });
    if (!outcome.ok) return false;
    track('friends_visibility_changed', {
      to: to === 'PUBLIC' ? 'public' : 'private',
      autoAccepted: outcome.result.autoAccepted ?? 0,
    });
    return true;
  };

  return (
    <View testID="friends-settings-visibility" accessibilityRole="radiogroup" className="gap-1">
      <Radio
        testID="friends-settings-visibility-private"
        label={t('friends.visibility.private')}
        selected={settings.visibility === 'PRIVATE'}
        disabled={locked}
        onPress={() => choose('PRIVATE')}
      />
      <Radio
        testID="friends-settings-visibility-public"
        label={t('friends.visibility.public')}
        selected={settings.visibility === 'PUBLIC'}
        disabled={locked}
        onPress={() => choose('PUBLIC')}
      />
      {locked ? (
        <View className="gap-1 pb-2 pl-8">
          <Text
            testID="friends-settings-forced-private"
            className="text-subhead text-label-secondary"
          >
            {t('friends.settings.forcedPrivate')}
          </Text>
          <AppealLink subject="profile" testID="friends-settings-forced-private-appeal" />
        </View>
      ) : null}

      {pending?.kind === 'public' ? (
        <FriendsConfirmSheet
          testID="friends-settings-public-confirm"
          visible={visible}
          copy={pending.copy}
          errorMessage={t('friends.settings.saveError')}
          onConfirm={() => change('PUBLIC')}
          onClose={() => setVisible(false)}
          onExited={() => setPending(null)}
        />
      ) : null}
      {pending?.kind === 'private' ? (
        <PrivateConfirmSheet
          visible={visible}
          followers={pending.followers}
          onConfirm={() => change('PRIVATE')}
          onClose={() => setVisible(false)}
          // Chained from the sheet's exit (iOS): back to the home, where the
          // Followers list lives. `list=followers` is the deep-link hint for it.
          onReview={() => router.dismissTo({ pathname: '/friends', params: { list: 'followers' } })}
        />
      ) : null}
    </View>
  );
}
