import { useState } from 'react';
import { View } from 'react-native';
import {
  HEALTH_CONSENT_COPY,
  HEALTH_WITHDRAW_CONFIRM,
  healthConsentAllowedLine,
} from '@chefer/types';
import { Button, Card, ConfirmSheet, Text, useSnackbar } from '@chefer/ui-mobile';
import { track } from '../../lib/analytics';
import { trpc } from '../../lib/trpc';
import { useHealthConsent } from './use-health-consent';

// ─── Profile › Privacy & data › Health information (UX-26, T-26.4) ────────────
// One row: the consent status (`Allowed on {date}`), and `Withdraw and delete`
// (a confirm first — it removes allergies, diets, dislikes, goal, measurements
// and weigh-ins for you and your household; plans stop being checked). When not
// allowed, the row offers the sheet again. Separate from `AiConsentCard`.
// PENDING COUNSEL REVIEW: copy.

export function HealthConsentCard() {
  const utils = trpc.useUtils();
  const snackbar = useSnackbar();
  const { data: me } = trpc.user.me.useQuery(undefined, { staleTime: 30_000 });
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();
  const [confirming, setConfirming] = useState(false);

  const withdraw = trpc.privacy.withdrawHealthData.useMutation({
    onSuccess: () => {
      track('health_consent_withdrawn', {});
      setConfirming(false);
      // Everything that read the deleted data: rules, targets, plans' "Checked for", weigh-ins.
      void utils.invalidate();
      snackbar.show({ message: HEALTH_CONSENT_COPY.withdrawDone, tone: 'success' });
    },
  });

  const consentedAt = me?.healthDataConsentAt ?? null;

  return (
    <Card testID="profile-health-consent" className="gap-2">
      <Text variant="heading">{HEALTH_CONSENT_COPY.rowTitle}</Text>
      <Text testID="profile-health-consent-status" variant="muted" className="text-sm">
        {consentedAt
          ? healthConsentAllowedLine(consentedAt)
          : me
            ? HEALTH_CONSENT_COPY.rowNotAllowed
            : ' '}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {consentedAt ? (
          <Button
            testID="profile-health-withdraw"
            variant="outline"
            onPress={() => setConfirming(true)}
          >
            {HEALTH_CONSENT_COPY.withdraw}
          </Button>
        ) : (
          me && (
            <Button
              testID="profile-health-allow"
              variant="outline"
              onPress={() => requestHealthConsent(() => void utils.user.me.invalidate())}
            >
              {HEALTH_CONSENT_COPY.rowAllowAction}
            </Button>
          )
        )}
      </View>
      {withdraw.isError && (
        <Text className="text-xs text-red-600">{HEALTH_CONSENT_COPY.withdrawError}</Text>
      )}
      <ConfirmSheet
        testID="health-withdraw-confirm"
        visible={confirming}
        onClose={() => setConfirming(false)}
        title={HEALTH_CONSENT_COPY.withdrawTitle}
        body={HEALTH_CONSENT_COPY.withdrawBody}
        confirmLabel={HEALTH_CONSENT_COPY.withdraw}
        cancelLabel={HEALTH_CONSENT_COPY.withdrawKeep}
        destructive
        onConfirm={() => withdraw.mutate({ confirm: HEALTH_WITHDRAW_CONFIRM })}
      />
      {healthConsentSheet}
    </Card>
  );
}
