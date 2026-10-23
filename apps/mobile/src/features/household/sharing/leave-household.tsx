import { Alert } from 'react-native';
import { HOUSEHOLD_SHARING_COPY } from '@chefer/types';
import { userFacingErrorMessage } from '@chefer/utils';
import { track } from '../../../lib/analytics';
import { trpc } from '../../../lib/trpc';
import { TrainButton } from '../../shell/train/train-button';
import { useInvalidateHousehold } from './use-household-sharing';

/**
 * A partner's "Leave household" (ADR 0002), confirmed first. The claimed profile and its allergies stay
 * with the owner; the partner's own plans come back, so every plan and list read is refetched.
 */
export function LeaveHouseholdButton({ ownerName }: { ownerName: string }) {
  const invalidate = useInvalidateHousehold();
  const leave = trpc.household.leave.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      track('household_left', { by: 'partner' });
      invalidate();
    },
    onError: (err) => Alert.alert(HOUSEHOLD_SHARING_COPY.leave, userFacingErrorMessage(err)),
  });
  return (
    <TrainButton
      testID="household-leave"
      label={HOUSEHOLD_SHARING_COPY.leave}
      variant="danger"
      loading={leave.isPending}
      onPress={() =>
        Alert.alert(HOUSEHOLD_SHARING_COPY.leave, HOUSEHOLD_SHARING_COPY.leaveConfirm(ownerName), [
          { text: HOUSEHOLD_SHARING_COPY.cancel, style: 'cancel' },
          {
            text: HOUSEHOLD_SHARING_COPY.leave,
            style: 'destructive',
            onPress: () => leave.mutate(),
          },
        ])
      }
    />
  );
}
