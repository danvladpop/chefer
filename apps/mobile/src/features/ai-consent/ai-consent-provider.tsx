import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Linking, View } from 'react-native';
import { AI_CONSENT_COPY, AI_CONSENT_FEATURE_DATA, type AiConsentFeature } from '@chefer/types';
import { Button, Sheet, Text } from '@chefer/ui-mobile';
import { aiConsentIntro, needsAiDataConsent } from '@chefer/utils';
import { getWebUrl } from '../../lib/api-url';
import { trpc } from '../../lib/trpc';

// ─── AI data consent gate (App Store 5.1.2(i)) ───────────────────────────────
// Mirrors apps/web/src/features/ai-consent/AiConsentProvider.tsx; the copy and
// the when-to-ask logic are shared (@chefer/types, @chefer/utils).
//
// Every client action that sends personal data to the AI provider goes
// through requestAiConsent(feature, run). Consent on record → `run` fires
// immediately. Otherwise the consent sheet opens: "Allow" records consent
// (user.grantAiDataConsent) and runs the original action once the sheet is
// fully dismissed (so `run` may present the camera); "Not now" drops the
// action — nothing is sent.
//
// iOS presents a Modal from the view controller that owns it, and one that is
// already presenting (an open Sheet) cannot present a second one. So the
// consent sheet renders in the most recently mounted <AiConsentHost />: the
// root layout has one, and a Sheet that can start an AI action renders its
// own inside its body, so the consent sheet nests over it.

export interface RequestAiConsentOptions {
  /** False when this call will not reach the AI (e.g. a free curated swap). */
  usesAi?: boolean;
}

type RequestAiConsent = (
  feature: AiConsentFeature,
  run: () => void,
  options?: RequestAiConsentOptions,
) => void;

interface ConsentState {
  request: RequestAiConsent;
  register: (hostId: string) => () => void;
  topHost: string | null;
  open: boolean;
  feature: AiConsentFeature;
  saving: boolean;
  saveFailed: boolean;
  allow: () => void;
  dismiss: () => void;
  onExited: () => void;
}

const AiConsentContext = createContext<ConsentState | null>(null);

function useConsentState(): ConsentState {
  const state = useContext(AiConsentContext);
  if (!state) throw new Error('AI consent hooks must be used inside <AiConsentProvider>');
  return state;
}

/** The consent guard. Must be rendered under <AiConsentProvider>. */
export function useAiConsent(): RequestAiConsent {
  return useConsentState().request;
}

export function AiConsentProvider({
  children,
  signedIn,
}: {
  children: React.ReactNode;
  /** No user.me lookups on the auth screens. */
  signedIn: boolean;
}) {
  const utils = trpc.useUtils();
  const { data: me } = trpc.user.me.useQuery(undefined, {
    staleTime: 30_000,
    enabled: signedIn,
  });
  const [open, setOpen] = useState(false);
  // Kept after close so the copy doesn't change during the exit animation.
  const [feature, setFeature] = useState<AiConsentFeature>('meal-plan');
  const [hosts, setHosts] = useState<string[]>([]);
  const pendingRun = useRef<(() => void) | null>(null);
  const runOnExit = useRef<(() => void) | null>(null);

  const grant = trpc.user.grantAiDataConsent.useMutation({
    onSuccess: ({ aiDataConsentAt }) => {
      utils.user.me.setData(undefined, (prev) => (prev ? { ...prev, aiDataConsentAt } : prev));
    },
  });
  const resetGrant = grant.reset;
  const mutateGrant = grant.mutate;

  const request = useCallback<RequestAiConsent>(
    (requested, run, options) => {
      const usesAi = options?.usesAi ?? true;
      const ask = () => {
        resetGrant();
        pendingRun.current = run;
        setFeature(requested);
        setOpen(true);
      };
      if (me === undefined && usesAi) {
        // user.me not loaded yet: look it up rather than asking someone who
        // already consented. A failed lookup asks (the safe side).
        utils.user.me
          .fetch()
          .then((user) => (needsAiDataConsent(user) ? ask() : run()))
          .catch(ask);
        return;
      }
      if (needsAiDataConsent(me, usesAi)) ask();
      else run();
    },
    [me, utils, resetGrant],
  );

  const register = useCallback((hostId: string) => {
    setHosts((prev) => [...prev, hostId]);
    return () => setHosts((prev) => prev.filter((id) => id !== hostId));
  }, []);

  const allow = useCallback(() => {
    mutateGrant(undefined, {
      onSuccess: () => {
        runOnExit.current = pendingRun.current;
        pendingRun.current = null;
        setOpen(false);
      },
    });
  }, [mutateGrant]);

  const dismiss = useCallback(() => {
    pendingRun.current = null;
    runOnExit.current = null;
    setOpen(false);
  }, []);

  const onExited = useCallback(() => {
    const run = runOnExit.current;
    runOnExit.current = null;
    run?.();
  }, []);

  const value = useMemo<ConsentState>(
    () => ({
      request,
      register,
      topHost: hosts.at(-1) ?? null,
      open,
      feature,
      saving: grant.isPending,
      saveFailed: grant.isError,
      allow,
      dismiss,
      onExited,
    }),
    [
      request,
      register,
      hosts,
      open,
      feature,
      grant.isPending,
      grant.isError,
      allow,
      dismiss,
      onExited,
    ],
  );

  return <AiConsentContext.Provider value={value}>{children}</AiConsentContext.Provider>;
}

/**
 * Where the consent sheet renders. One at the root; one inside every Sheet
 * whose buttons can start an AI action (see the header comment).
 */
export function AiConsentHost() {
  // No provider (isolated component tests) = nothing to host.
  const state = useContext(AiConsentContext);
  const hostId = useId();
  const register = state?.register;
  useEffect(() => register?.(hostId), [register, hostId]);
  if (state?.topHost !== hostId) return null;
  return <AiConsentSheet state={state} />;
}

function AiConsentSheet({ state }: { state: ConsentState }) {
  const { feature } = state;
  return (
    <Sheet
      visible={state.open}
      onClose={state.dismiss}
      onExited={state.onExited}
      title={AI_CONSENT_COPY.title}
      testID="ai-consent"
      footer={
        <View className="gap-2">
          <Button testID="ai-consent-allow" size="lg" loading={state.saving} onPress={state.allow}>
            {AI_CONSENT_COPY.allow}
          </Button>
          <Button testID="ai-consent-not-now" size="lg" variant="outline" onPress={state.dismiss}>
            {AI_CONSENT_COPY.notNow}
          </Button>
        </View>
      }
    >
      <Text className="text-base text-gray-800">{aiConsentIntro(feature)}</Text>
      <View className="gap-1">
        <Text className="text-sm font-semibold text-gray-900">{AI_CONSENT_COPY.sentHeading}</Text>
        {AI_CONSENT_FEATURE_DATA[feature].data.map((line) => (
          <View key={line} className="flex-row gap-2">
            <Text className="text-sm text-gray-700">•</Text>
            <Text className="min-w-0 flex-1 text-sm text-gray-700">{line}</Text>
          </View>
        ))}
      </View>
      <Text className="text-sm font-medium text-gray-900">{AI_CONSENT_COPY.noTraining}</Text>
      <Text variant="muted" className="text-sm">
        {AI_CONSENT_COPY.backupProvider}
      </Text>
      <Text variant="muted" className="text-sm">
        {AI_CONSENT_COPY.control}
      </Text>
      <Button
        testID="ai-consent-privacy"
        variant="ghost"
        onPress={() => void Linking.openURL(getWebUrl(AI_CONSENT_COPY.privacyPath))}
      >
        {AI_CONSENT_COPY.privacyLabel}
      </Button>
      {state.saveFailed && (
        <Text className="text-sm text-red-700">{AI_CONSENT_COPY.saveError}</Text>
      )}
    </Sheet>
  );
}
