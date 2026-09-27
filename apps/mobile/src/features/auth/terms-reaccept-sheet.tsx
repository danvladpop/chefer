import { useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
import { LEGAL_VERSIONS } from '@chefer/types';
import { Button, Sheet, Text } from '@chefer/ui-mobile';
import { getWebUrl } from '../../lib/api-url';
import { trpc } from '../../lib/trpc';

// T-39.1: the re-accept sheet for an existing, signed-in account whose stored
// Terms/Privacy acceptance predates a document version bump. Reads the
// consent log (already-shipped `privacy.getConsentHistory`, T-39.2) rather
// than a field on the session's `UserProfile` — that type is owned by
// another lane this wave.
//
// NOT YET MOUNTED — see the handoff note in the wave-1 report: it needs to be
// rendered once from the signed-in part of `app/_layout.tsx` (outside this
// lane's ownership), e.g. next to `<AiConsentHost />`.

function isStale(latestVersion: string | null): boolean {
  if (!latestVersion) return true;
  return latestVersion < LEGAL_VERSIONS.terms;
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
          onPress={() => acceptTerms.mutate({ documentVersion: LEGAL_VERSIONS.terms })}
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
