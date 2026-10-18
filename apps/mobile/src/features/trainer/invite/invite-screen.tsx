import { useState } from 'react';
import { ActivityIndicator, Share, View } from 'react-native';
import { COACHING_COPY, type InviteDto } from '@chefer/types';
import {
  Badge,
  Button,
  DONE_FIELD_PROPS,
  ErrorState,
  FormField,
  Input,
  KeyboardAwareScrollView,
  Screen,
  Sheet,
  Text,
} from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { formatStampDate } from '../../gym/routine/attribution';
import { CoachingCard } from '../components/coaching-card';
import { TrainerHeader } from '../components/trainer-header';
import { InviteQr } from './invite-qr';

// ─── Invite a client (spec §2.2) ──────────────────────────────────────────────
// Optional private label → "Create link". The link is single use, expires in 14 days and can be revoked.
// Sharing uses RN core `Share` (its sheet includes Copy on iOS and Android; no clipboard module — OTA-safe).
// Pending invites are listed with their label and expiry. An open invite also shows as a QR code to scan
// in person (PRD 2026-10 §4.1).

const SCREEN_EDGES: ('top' | 'bottom' | 'left' | 'right')[] = ['top', 'bottom', 'left', 'right'];

/** Opens the OS share sheet with the invite link. A dismissed or failed share is silent. */
export async function shareInvite(invite: Pick<InviteDto, 'url'>): Promise<void> {
  try {
    await Share.share({ message: invite.url });
  } catch {
    // Share sheet unavailable or dismissed with an error: nothing to show.
  }
}

/** The QR sheet (PRD 2026-10 §4.1, S5): the open invite as a code to scan in person. */
function QrSheet({ invite, onClose }: { invite: InviteDto | null; onClose: () => void }) {
  const qr = COACHING_COPY.trainer.qr;
  return (
    <Sheet
      visible={invite !== null}
      onClose={onClose}
      title={qr.title}
      eyebrow={invite?.label ?? undefined}
      testID="trainer-invite-qr-sheet"
    >
      {invite ? (
        <View className="gap-4 pb-4">
          <InviteQr url={invite.url} />
          <Text className="text-center text-subhead text-label-secondary">{qr.hint}</Text>
        </View>
      ) : null}
    </Sheet>
  );
}

function ShowQrButton({ invite, onShow }: { invite: InviteDto; onShow: () => void }) {
  return (
    <Button testID={`trainer-invite-${invite.code}-qr`} variant="outline" onPress={onShow}>
      {COACHING_COPY.trainer.qr.show}
    </Button>
  );
}

function InviteRow({
  invite,
  onRevoke,
  onShowQr,
  revoking,
}: {
  invite: InviteDto;
  onRevoke: (code: string) => void;
  onShowQr: () => void;
  revoking: boolean;
}) {
  const open = invite.state === 'OPEN';
  return (
    <CoachingCard testID={`trainer-invite-${invite.code}`} className="gap-2">
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
        <Text className="text-subhead text-label-secondary">
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
      {open ? <ShowQrButton invite={invite} onShow={onShowQr} /> : null}
    </CoachingCard>
  );
}

/**
 * The invite flow's content (label → Create link, the new link, pending invites), with no screen or
 * scroll view of its own: the legacy `/trainer/invite` route wraps it in a screen, trainer mode in a
 * Sheet (trainer-mode.md §6.4). `qr`: on the screen a QR opens in its own sheet; inside the invite sheet
 * it shows in place (no Modal on top of a Modal).
 */
export function InviteBody({ qr = 'sheet' }: { qr?: 'sheet' | 'inline' }) {
  const utils = trpc.useUtils();
  const [label, setLabel] = useState('');
  const [created, setCreated] = useState<InviteDto | null>(null);
  const [qrInvite, setQrInvite] = useState<InviteDto | null>(null);
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

  // Inside the sheet the QR takes the sheet's place until Hide (the body shrinks, so it is in view).
  if (qr === 'inline' && qrInvite) {
    return <InlineQr invite={qrInvite} onHide={() => setQrInvite(null)} />;
  }

  return (
    <>
      <CoachingCard className="gap-3">
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
            {...DONE_FIELD_PROPS}
            onChangeText={setLabel}
          />
        </FormField>
        {create.error ? (
          <Text testID="trainer-invite-error" className="text-sm text-danger">
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
      </CoachingCard>

      {created ? (
        <CoachingCard testID="trainer-invite-created" className="gap-2">
          <Text className="text-headline font-semibold text-label">
            {created.label ?? COACHING_COPY.trainer.invite}
          </Text>
          <Text testID="trainer-invite-created-url" selectable className="text-sm text-label">
            {created.url}
          </Text>
          <Text className="text-subhead text-label-secondary">
            {COACHING_COPY.trainer.inviteExpires(formatStampDate(created.expiresAt))}
          </Text>
          <Button testID="trainer-invite-created-share" onPress={() => void shareInvite(created)}>
            {COACHING_COPY.common.share}
          </Button>
          {created.state === 'OPEN' ? (
            <Button
              testID="trainer-invite-created-qr"
              variant="outline"
              onPress={() => setQrInvite(created)}
            >
              {COACHING_COPY.trainer.qr.show}
            </Button>
          ) : null}
        </CoachingCard>
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
            onShowQr={() => setQrInvite(invite)}
          />
        ))
      )}
      {revoke.error ? (
        <Text testID="trainer-invite-revoke-error" className="text-sm text-danger">
          {userFacingErrorMessage(revoke.error)}
        </Text>
      ) : null}
      {qr === 'sheet' ? <QrSheet invite={qrInvite} onClose={() => setQrInvite(null)} /> : null}
    </>
  );
}

export const HIDE_QR_LABEL = 'Hide QR code';

/** The QR inside the invite sheet, with Hide (back to the invites). */
function InlineQr({ invite, onHide }: { invite: InviteDto; onHide: () => void }) {
  const qr = COACHING_COPY.trainer.qr;
  return (
    <CoachingCard testID="trainer-invite-qr-inline" className="gap-3">
      <Text accessibilityRole="header" className="text-headline font-semibold text-label">
        {invite.label ? `${qr.title} · ${invite.label}` : qr.title}
      </Text>
      <InviteQr url={invite.url} />
      <Text className="text-center text-subhead text-label-secondary">{qr.hint}</Text>
      <Button testID="trainer-invite-qr-inline-hide" variant="outline" onPress={onHide}>
        {HIDE_QR_LABEL}
      </Button>
    </CoachingCard>
  );
}

/** `/trainer/invite` (Trainer tools, and trainer mode off): the flow as its own screen. */
export function InviteScreen() {
  return (
    <Screen edges={SCREEN_EDGES} className="bg-canvas px-0" testID="trainer-invite">
      <TrainerHeader testID="trainer-invite-header" title={COACHING_COPY.trainer.invite} />
      <KeyboardAwareScrollView contentContainerClassName="gap-4 px-4 py-4">
        <InviteBody />
      </KeyboardAwareScrollView>
    </Screen>
  );
}

/** Trainer mode (§6.4, §6.8): the same flow as a sheet, from Clients and from You. */
export function InviteSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={COACHING_COPY.trainer.invite}
      testID="trainer-invite-sheet"
    >
      {/* Mounted only while the sheet's Modal is up (exit motion included), so nothing loads closed. */}
      <View className="gap-4 pb-4">
        <InviteBody qr="inline" />
      </View>
    </Sheet>
  );
}
