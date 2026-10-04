import { useState } from 'react';
import { ActivityIndicator, Share, View } from 'react-native';
import { COACHING_COPY, type InviteDto } from '@chefer/types';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  FormField,
  Input,
  KeyboardAwareScrollView,
  Screen,
  Text,
} from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { formatStampDate } from '../../gym/routine/attribution';
import { TrainerHeader } from '../components/trainer-header';

// ─── Invite a client (spec §2.2) ──────────────────────────────────────────────
// Optional private label → "Create link". The link is single use, expires in 14 days and can be revoked.
// Sharing uses RN core `Share` (its sheet includes Copy on iOS and Android; no clipboard module — OTA-safe).
// Pending invites are listed with their label and expiry.

const SCREEN_EDGES: ('top' | 'bottom' | 'left' | 'right')[] = ['top', 'bottom', 'left', 'right'];

/** Opens the OS share sheet with the invite link. A dismissed or failed share is silent. */
export async function shareInvite(invite: Pick<InviteDto, 'url'>): Promise<void> {
  try {
    await Share.share({ message: invite.url });
  } catch {
    // Share sheet unavailable or dismissed with an error: nothing to show.
  }
}

function InviteRow({
  invite,
  onRevoke,
  revoking,
}: {
  invite: InviteDto;
  onRevoke: (code: string) => void;
  revoking: boolean;
}) {
  const open = invite.state === 'OPEN';
  return (
    <Card testID={`trainer-invite-${invite.code}`} className="gap-2">
      <View className="flex-row items-center gap-2">
        <Text className="min-w-0 flex-1 font-medium" numberOfLines={1}>
          {invite.label ?? 'No label'}
        </Text>
        <Badge
          testID={`trainer-invite-${invite.code}-state`}
          variant={open ? 'default' : 'secondary'}
        >
          {COACHING_COPY.trainer.inviteStates[invite.state]}
        </Badge>
      </View>
      {open ? (
        <Text variant="muted" className="text-sm">
          {COACHING_COPY.trainer.inviteExpires(formatStampDate(invite.expiresAt))}
        </Text>
      ) : null}
      {open ? (
        <View className="flex-row gap-2">
          <Button
            testID={`trainer-invite-${invite.code}-share`}
            className="flex-1"
            onPress={() => void shareInvite(invite)}
          >
            {COACHING_COPY.common.share}
          </Button>
          <Button
            testID={`trainer-invite-${invite.code}-revoke`}
            variant="outline"
            className="flex-1"
            disabled={revoking}
            onPress={() => onRevoke(invite.code)}
          >
            {COACHING_COPY.trainer.revoke}
          </Button>
        </View>
      ) : null}
    </Card>
  );
}

export function InviteScreen() {
  const utils = trpc.useUtils();
  const [label, setLabel] = useState('');
  const [created, setCreated] = useState<InviteDto | null>(null);
  const invites = trpc.trainer.invites.list.useQuery();
  const create = trpc.trainer.invites.create.useMutation({
    meta: { silent: true },
    onSuccess: (invite) => {
      setCreated(invite);
      setLabel('');
      void utils.trainer.invites.list.invalidate();
    },
  });
  const revoke = trpc.trainer.invites.revoke.useMutation({
    meta: { silent: true },
    onSuccess: () => void utils.trainer.invites.list.invalidate(),
  });

  const trimmed = label.trim();
  // The freshly created invite is shown above the list; don't repeat it below.
  const others = (invites.data ?? []).filter((i) => i.code !== created?.code);

  return (
    <Screen edges={SCREEN_EDGES} className="px-0" testID="trainer-invite">
      <TrainerHeader testID="trainer-invite-header" title={COACHING_COPY.trainer.invite} />
      <KeyboardAwareScrollView contentContainerClassName="gap-4 px-4 py-4">
        <Card className="gap-3">
          <FormField
            testID="trainer-invite-label-field"
            label={COACHING_COPY.trainer.inviteLabel}
            hint={COACHING_COPY.trainer.inviteLabelHint}
          >
            <Input
              testID="trainer-invite-label"
              label={COACHING_COPY.trainer.inviteLabel}
              value={label}
              maxLength={60}
              returnKeyType="done"
              onChangeText={setLabel}
            />
          </FormField>
          {create.error ? (
            <Text testID="trainer-invite-error" className="text-sm text-destructive">
              {userFacingErrorMessage(create.error)}
            </Text>
          ) : null}
          <Button
            testID="trainer-invite-create"
            loading={create.isPending}
            onPress={() => create.mutate(trimmed === '' ? {} : { label: trimmed })}
          >
            {COACHING_COPY.trainer.createLink}
          </Button>
        </Card>

        {created ? (
          <Card testID="trainer-invite-created" className="gap-2">
            <Text variant="label">{created.label ?? COACHING_COPY.trainer.invite}</Text>
            <Text
              testID="trainer-invite-created-url"
              selectable
              className="text-sm text-foreground"
            >
              {created.url}
            </Text>
            <Text variant="muted" className="text-sm">
              {COACHING_COPY.trainer.inviteExpires(formatStampDate(created.expiresAt))}
            </Text>
            <Button testID="trainer-invite-created-share" onPress={() => void shareInvite(created)}>
              {COACHING_COPY.common.share}
            </Button>
          </Card>
        ) : null}

        {invites.isPending ? (
          <View testID="trainer-invite-loading" className="items-center py-6">
            <ActivityIndicator />
          </View>
        ) : invites.isError ? (
          <ErrorState testID="trainer-invite-list-error" onRetry={() => void invites.refetch()} />
        ) : (
          others.map((invite) => (
            <InviteRow
              key={invite.code}
              invite={invite}
              revoking={revoke.isPending}
              onRevoke={(code) => revoke.mutate({ code })}
            />
          ))
        )}
        {revoke.error ? (
          <Text testID="trainer-invite-revoke-error" className="text-sm text-destructive">
            {userFacingErrorMessage(revoke.error)}
          </Text>
        ) : null}
      </KeyboardAwareScrollView>
    </Screen>
  );
}
