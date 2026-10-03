import { useEffect, useId, useRef, useState } from 'react';
import { router } from 'expo-router';
import type { PremiumSource } from '@chefer/types';
import {
  activationStepCopy,
  activationStepKeys,
  defaultWeekOffset,
  userFacingErrorMessage,
} from '@chefer/utils';
import { track } from '../../lib/analytics';
import { trpc } from '../../lib/trpc';
import { useAiConsent } from '../ai-consent/ai-consent-provider';
import { closePremium, registerPremiumHost, usePremiumStore } from './open-premium';
import { ACTIVATION_HREFS } from './post-upgrade-sheet';
import { PremiumSheet, type PremiumSheetPhase } from './premium-sheet';
import { usePremiumPitch } from './use-premium-pitch';

// The renderer behind `openPremium(source)` (T-10.2). The root layout mounts
// one <PremiumHost />; a Sheet that can open Premium mounts its own nested
// one (iOS cannot present a Modal over a Modal), and the sheet renders in the
// most recently mounted host. Turn on Premium is the same free toggle as
// Profile — `user.upgradePlan`, no input, no payment (delta rule 2) — and the
// success state hands the user the job's next step (UX-08 §5) instead of a
// second sheet.

function PremiumOffer({ source }: { source: string | null }) {
  const open = source !== null;
  // Keep the last source while the exit animation plays.
  const lastSource = useRef<string | null>(null);
  if (source !== null) lastSource.current = source;
  const shownSource = source ?? lastSource.current;

  const pitch = usePremiumPitch(shownSource, open);
  const utils = trpc.useUtils();
  const { data: hasProfile } = trpc.preferences.hasProfile.useQuery(undefined, {
    enabled: open,
  });
  // UX-ACC-13: is there a week to regenerate? (`null` = no plan yet.)
  const { data: currentPlan } = trpc.mealPlan.getForWeek.useQuery(
    { weekOffset: defaultWeekOffset(new Date()) },
    { enabled: open, staleTime: 60_000, retry: false },
  );
  const { data: members = [] } = trpc.household.list.useQuery(undefined, {
    enabled: open,
    staleTime: 60_000,
  });
  const [phase, setPhase] = useState<PremiumSheetPhase>('offer');
  const [actionError, setActionError] = useState<string | null>(null);

  // AC6: a household lock's job is a week sized to the table. After turning
  // Premium on, the action builds next week for everyone (AI consent first —
  // "Not now" sends nothing), then opens Plan.
  const requestAiConsent = useAiConsent();
  const generate = trpc.mealPlan.generate.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      void utils.mealPlan.invalidate();
      void utils.shoppingList.invalidate();
      closePremium();
      router.push('/meal-plan');
    },
    onError: (err) => setActionError(userFacingErrorMessage(err)),
  });

  const upgrade = trpc.user.upgradePlan.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      if (shownSource) {
        track('upgrade_completed', { source: shownSource as PremiumSource, job: pitch.job });
      }
      setPhase('success');
      // The tier gates data everywhere (plans, preferences, quotas): drop the cache.
      void utils.invalidate();
    },
    onError: () => setPhase('error'),
  });

  // Each open starts on the offer, and counts as one prompt shown.
  useEffect(() => {
    if (source === null) return;
    setPhase('offer');
    setActionError(null);
    upgrade.reset();
    generate.reset();
    track('upgrade_prompt_shown', { source: source as PremiumSource, job: pitch.job });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per open
  }, [source]);

  const turnOn = () => {
    if (shownSource) {
      track('upgrade_clicked', { source: shownSource as PremiumSource, job: pitch.job });
    }
    upgrade.mutate();
  };

  const firstStep = activationStepKeys(shownSource, hasProfile ?? true)[0];
  const tableSize = members.length + 1;
  const scaleWeek = pitch.job === 'household' && members.length > 0;
  // UX-ACC-13: the CTA follows what the user came for. Snap goes to the
  // tracker (where the camera/photo picker lives); with no plan "Plan my
  // week" builds one right here; only a user who HAS a plan sees a regenerate.
  const hasPlan = currentPlan === undefined ? undefined : currentPlan !== null;
  const planWeek = firstStep === 'regenerate' && hasPlan === false;
  const generateWeek = (weekOffset: number) => {
    setActionError(null);
    requestAiConsent('meal-plan', () => generate.mutate({ weekOffset, keepPinned: true }));
  };
  const successAction = scaleWeek
    ? {
        label: `Scale next week to ${tableSize} portions`,
        loading: generate.isPending,
        onPress: () => generateWeek(1),
      }
    : planWeek
      ? {
          label: activationStepCopy('regenerate', { hasPlan: false }).title,
          loading: generate.isPending,
          onPress: () => generateWeek(defaultWeekOffset(new Date())),
        }
      : firstStep
        ? {
            label: activationStepCopy(firstStep, hasPlan === undefined ? {} : { hasPlan }).title,
            onPress: () => {
              closePremium();
              router.push(ACTIVATION_HREFS[firstStep]);
            },
          }
        : null;

  return (
    <PremiumSheet
      visible={open}
      onClose={closePremium}
      pitch={pitch}
      phase={phase}
      pending={upgrade.isPending}
      onTurnOn={turnOn}
      successAction={successAction}
      actionError={actionError}
      testID="premium-sheet"
    />
  );
}

export function PremiumHost() {
  const id = useId();
  const { source, hosts } = usePremiumStore();
  useEffect(() => registerPremiumHost(id), [id]);
  if (hosts[hosts.length - 1] !== id) return null;
  return <PremiumOffer source={source} />;
}
