import { Alert, View } from 'react-native';
import { HOUSEHOLD_SHARING_COPY } from '@chefer/types';
import { Text } from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { track } from '../../../lib/analytics';
import { trpc } from '../../../lib/trpc';
import { TrainButton } from '../../shell/train/train-button';
import { useInvalidateHousehold, type HouseholdSharing } from './use-household-sharing';

// ─── A member row's sharing line (ADR 0002) ───────────────────────────────────
// Under each member on the Household screen, while sharing is on:
//   owner, profile with an account → "Has Chefer", "Maria manages their own allergies and diet.",
//                                    "Remove from household" (confirmed)
//   owner, adult profile, no account → "Invite to Chefer" (or "Invite sent", which reopens the link)
//   partner → "Has Chefer" on the claimed profiles, nothing to act on

export type SharingMember = {
  id: string;
  name: string;
  isKid: boolean;
  hasAccount?: boolean;
  isYou?: boolean;
};

export function MemberSharingLine({
  member,
  sharing,
  onInvite,
}: {
  member: SharingMember;
  sharing: HouseholdSharing;
  onInvite: (member: SharingMember) => void;
}) {
  const invalidate = useInvalidateHousehold();
  const remove = trpc.household.removePartner.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      track('household_left', { by: 'owner' });
      invalidate();
    },
    onError: (err) => Alert.alert(HOUSEHOLD_SHARING_COPY.remove, userFacingErrorMessage(err)),
  });
  const status = sharing.status;
  if (!sharing.enabled || !status) return null;

  if (member.hasAccount === true) {
    const link = status.partners.find((p) => p.memberId === member.id);
    const confirmRemove = () => {
      if (!link) return;
      Alert.alert(
        HOUSEHOLD_SHARING_COPY.remove,
        HOUSEHOLD_SHARING_COPY.removeConfirm(member.name),
        [
          { text: HOUSEHOLD_SHARING_COPY.cancel, style: 'cancel' },
          {
            text: HOUSEHOLD_SHARING_COPY.remove,
            style: 'destructive',
            onPress: () => remove.mutate({ linkId: link.linkId }),
          },
        ],
      );
    };
    return (
      <View testID={`household-sharing-${member.id}`} className="gap-1.5 px-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text
            testID={`household-joined-${member.id}`}
            className="rounded-full bg-brand-tint px-2 text-caption font-semibold text-brand"
          >
            {member.isYou ? HOUSEHOLD_SHARING_COPY.you : HOUSEHOLD_SHARING_COPY.joinedBadge}
          </Text>
          {!member.isYou ? (
            <Text className="min-w-0 flex-1 text-caption text-label-secondary">
              {HOUSEHOLD_SHARING_COPY.claimedProfileNote(member.name)}
            </Text>
          ) : null}
        </View>
        {sharing.isOwner && link ? (
          <TrainButton
            testID={`household-remove-partner-${member.id}`}
            label={HOUSEHOLD_SHARING_COPY.remove}
            variant="danger"
            loading={remove.isPending}
            onPress={confirmRemove}
          />
        ) : null}
      </View>
    );
  }

  // Inviting is the owner's (or a solo household's), for adults only.
  if (sharing.isPartner || member.isKid) return null;
  const pending = status.invites.some((i) => i.memberId === member.id);
  if (!pending && !status.canInvite) return null;
  return (
    <View testID={`household-sharing-${member.id}`} className="px-1">
      <TrainButton
        testID={`household-invite-${member.id}`}
        label={pending ? HOUSEHOLD_SHARING_COPY.invitePending : HOUSEHOLD_SHARING_COPY.inviteButton}
        variant={pending ? 'ghost' : 'tinted'}
        onPress={() => onInvite(member)}
      />
    </View>
  );
}
