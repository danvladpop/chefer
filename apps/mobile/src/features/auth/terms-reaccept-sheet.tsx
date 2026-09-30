import { useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
import { CURRENT_TERMS_VERSION } from '@chefer/types';
import { Button, Sheet, Text } from '@chefer/ui-mobile';
import { getWebUrl } from '../../lib/api-url';
import { trpc } from '../../lib/trpc';

// T-39.1: the re-accept sheet for an existing, signed-in account whose stored
// Terms/Privacy acceptance predates a document version bump. Reads the
// consent log (already-shipped `privacy.getConsentHistory`, T-39.2) rather
// than a field on the session's `UserProfile` — that type is owned by
// another lane this wave. Mounted in `app/_layout.tsx` next to `<AiConsentHost />`.
//
// Re-accept rule, deliberately: a MISSING TERMS record is NOT "stale" — it
// means this account predates versioned consent entirely (every account
// registered before this wave, at clientApiLevel 0/1). This is the FIRST
// wave with a versioned document, so treating "missing" as stale would pop
// this sheet for the entire existing user base the moment the update ships,
// which is not what the design calls for (03 §UX-39 only describes a
// one-time notice for the SEPARATE email-defaults change, not a mass
// re-consent prompt). The sheet only fires for an account that already went
// through the new consent flow (a real TERMS row exists) and the document
// version has since moved past what it recorded — the genuine "re-accept
// after a bump" case the design describes. Backfilling a baseline consent
// record for the pre-existing population, if that's ever wanted, is a
// separate decision for `ConsentBackfillService` (a different lane), not
// this sheet.
function isStale(latestVersion: string | null): boolean {
  if (!latestVersion) return false;
  return latestVersion < CURRENT_TERMS_VERSION;
}

export function TermsReacceptSheet({ signedIn }: { signedIn: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  const { data: history } = trpc.privacy.getConsentHistory.useQuery(undefined, {
    enabled: signedIn,
    staleTime: 5 * 60_000,
  });
  const acceptTerms = trpc.privacy.acceptTerms.useMutation({
    onSuccess: () => setDismissed(true),
  });

  const latestTermsVersion = useMemo(() => {
    const terms = (history ?? []).filter((e) => e.kind === 'TERMS');
    return terms.length > 0 ? (terms[0]?.documentVersion ?? null) : null;
  }, [history]);

  const visible = signedIn && history !== undefined && isStale(latestTermsVersion) && !dismissed;

  return (
    <Sheet
      testID="terms-reaccept-sheet"
      visible={visible}
      onClose={() => setDismissed(true)}
      title="Our Terms and Privacy Policy were updated"
    >
      <View className="gap-3">
        <Text className="text-sm text-gray-700">
          Please review and accept the current{' '}
          <Text
            accessibilityRole="link"
            className="text-primary underline"
            onPress={() => void Linking.openURL(getWebUrl('/terms'))}
          >
            Terms
          </Text>{' '}
          and{' '}
          <Text
            accessibilityRole="link"
            className="text-primary underline"
            onPress={() => void Linking.openURL(getWebUrl('/privacy'))}
          >
            Privacy Policy
          </Text>{' '}
          to keep using Chefer.
        </Text>
        <Button
          testID="terms-reaccept-agree"
          loading={acceptTerms.isPending}
          onPress={() => acceptTerms.mutate({ documentVersion: CURRENT_TERMS_VERSION })}
        >
          I agree
        </Button>
        <Button testID="terms-reaccept-later" variant="ghost" onPress={() => setDismissed(true)}>
          Not now
        </Button>
      </View>
    </Sheet>
  );
}
