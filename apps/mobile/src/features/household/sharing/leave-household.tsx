import { Alert } from 'react-native';
import { userFacingErrorMessage } from '@chefer/utils';
import { track } from '../../../lib/analytics';
import { useT } from '../../../lib/i18n';
import { trpc } from '../../../lib/trpc';
import { TrainButton } from '../../shell/train/train-button';
import { useInvalidateHousehold } from './use-household-sharing';

/**
 * A partner's "Leave household" (ADR 0003), confirmed first. The claimed profile and its allergies stay
 * with the owner; the partner's own plans come back, so every plan and list read is refetched.
 */
export function LeaveHouseholdButton({ ownerName }: { ownerName: string }) {
  const { t } = useT();
  const invalidate = useInvalidateHousehold();
  const leave = trpc.household.leave.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      track('household_left', { by: 'partner' });
      invalidate();
    },
    onError: (err) => Alert.alert(t('household.sharing.leave'), userFacingErrorMessage(err)),
  });
  return (
    <TrainButton
      testID="household-leave"
      label={t('household.sharing.leave')}
      variant="danger"
      loading={leave.isPending}
      onPress={() =>
        Alert.alert(
          t('household.sharing.leave'),
          t('household.sharing.leaveConfirm', { ownerName }),
          [
            { text: t('household.sharing.cancel'), style: 'cancel' },
            {
              text: t('household.sharing.leave'),
              style: 'destructive',
              onPress: () => leave.mutate(),
            },
          ],
        )
      }
    />
  );
}
