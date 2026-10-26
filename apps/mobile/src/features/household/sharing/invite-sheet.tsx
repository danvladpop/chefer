import { useEffect, useRef } from 'react';
import { ActivityIndicator, Share, View } from 'react-native';
import { HOUSEHOLD_SHARING_COPY, type HouseholdOpenInviteDto } from '@chefer/types';
import { Button, Sheet, Text, useThemeColors } from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { track } from '../../../lib/analytics';
import { trpc } from '../../../lib/trpc';

// ─── Invite to Chefer (ADR 0003) ──────────────────────────────────────────────
// The owner's sheet for one adult member profile: what the partner gets, the
// single-use link, the OS share sheet (RN core `Share`, no native module — the
// app has no clipboard module, so there is no separate Copy button; "Copy" is
// in the share sheet) and Cancel invite. An open invite for the profile is
// shown as-is; otherwise opening the sheet makes one (`household.invites.create`
// replaces that profile's older link).

export type InviteSheetMember = { id: string; name: string };

export function InviteSheet({
  member,
  openInvite,
  onClose,
}: {
  /** The profile being invited; null = closed. */
  member: InviteSheetMember | null;
  /** The profile's open invite, from `household.sharing`. */
  openInvite: HouseholdOpenInviteDto | undefined;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const utils = trpc.useUtils();
  // The share message names the owner ("Dan invited you…").
  const { data: me } = trpc.user.me.useQuery(undefined, { staleTime: 30_000 });
  const ownerName = me?.firstName ?? me?.name ?? '';
  const create = trpc.household.invites.create.useMutation({
    meta: { silent: true },
    onSuccess: () => void utils.household.sharing.invalidate(),
  });
  const revoke = trpc.household.invites.revoke.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      void utils.household.sharing.invalidate();
      onClose();
    },
  });

  // Keeps the name and link through the sheet's exit animation.
  const lastMember = useRef<InviteSheetMember | null>(null);
  if (member) lastMember.current = member;
  const shown = member ?? lastMember.current;

  const createdFor =
    create.isSuccess && create.variables.memberId === shown?.id ? create.data : null;
  const invite = openInvite ?? createdFor;

  const mutateCreate = create.mutate;
  const resetCreate = create.reset;
  const resetRevoke = revoke.reset;
  const memberId = member?.id ?? null;
  const hasOpenInvite = openInvite !== undefined;
  useEffect(() => {
    if (memberId === null) return;
    resetRevoke();
    if (hasOpenInvite) return;
    resetCreate();
    mutateCreate({ memberId });
    // Only when the sheet opens for a profile (not when the open invite list refreshes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  const share = async () => {
    if (!invite) return;
    try {
      const result = await Share.share({
        message: `${HOUSEHOLD_SHARING_COPY.shareMessage(ownerName)}${invite.url}`,
      });
      if (result.action !== Share.dismissedAction) {
        track('household_invite_created', { via: 'share' });
      }
    } catch {
      // The share sheet could not open; the link stays on screen to copy by hand.
    }
  };

  return (
    <Sheet
      visible={member !== null}
      onClose={onClose}
      title={HOUSEHOLD_SHARING_COPY.inviteSheetTitle(shown?.name ?? '')}
      testID="household-invite-sheet"
      footer={
        <View className="gap-2">
          <Button testID="household-invite-share" disabled={!invite} onPress={() => void share()}>
            {HOUSEHOLD_SHARING_COPY.shareLink}
          </Button>
          {invite ? (
            <Button
              testID="household-invite-revoke"
              variant="outline"
              loading={revoke.isPending}
              onPress={() => revoke.mutate({ code: invite.code })}
            >
              {HOUSEHOLD_SHARING_COPY.revoke}
            </Button>
          ) : null}
        </View>
      }
    >
      <Text className="text-body text-label">
        {HOUSEHOLD_SHARING_COPY.inviteSheetBody(shown?.name ?? '')}
      </Text>
      {invite ? (
        <View className="gap-1 rounded-control border border-separator bg-surface px-3 py-2">
          <Text testID="household-invite-url" selectable className="text-subhead text-label">
            {invite.url}
          </Text>
          <Text className="text-caption text-label-secondary">
            {HOUSEHOLD_SHARING_COPY.inviteExpires}
          </Text>
        </View>
      ) : create.isError ? (
        <View className="gap-2">
          <Text
            testID="household-invite-error"
            accessibilityRole="alert"
            className="text-subhead text-danger"
          >
            {HOUSEHOLD_SHARING_COPY.inviteLoadFailed}
          </Text>
          <Button
            testID="household-invite-retry"
            variant="outline"
            onPress={() => shown && create.mutate({ memberId: shown.id })}
          >
            {HOUSEHOLD_SHARING_COPY.tryAgain}
          </Button>
        </View>
      ) : (
        <View className="items-center py-4">
          <ActivityIndicator color={colors.brand} />
        </View>
      )}
      {revoke.isError ? (
        <Text accessibilityRole="alert" className="text-subhead text-danger">
          {userFacingErrorMessage(revoke.error)}
        </Text>
      ) : null}
    </Sheet>
  );
}
