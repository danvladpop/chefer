import { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, colors, Text } from '@chefer/ui-mobile';
import {
  cn,
  describeProteinSnack,
  localDateStr,
  rebalanceOfferCopy,
  userFacingErrorMessage,
  type RebalancePreviewLike,
  type RebalanceSwapLike,
} from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { useNumbersMode } from '../numbers-mode/numbers-mode';
import {
  describeSnackProteinOnly,
  proteinOnlyHeadline,
  proteinOnlyOfferCopy,
} from '../numbers-mode/numbers-mode-copy';
import { clearRebalanceOffer, setRebalanceOffer, useRebalanceOffer } from './rebalance-offer-store';
import { isMealType, recordRebalance } from './rebalance-store';

// Week-rebalance offer card (WP-07, UX-PLAN-09, B-11): "I can rebalance the
// rest of your week: Sunday dinner → X (+28 g protein)" with Preview · Apply ·
// Not now. Nothing changes until Apply; Apply goes through
// mealPlan.applyRebalance and its result feeds the same Undo banner an
// auto-applied rebalance always used (rebalance-store). Free for everyone — no
// AI behind it. The actions stack UNDER the text (the old banner squeezed them
// beside it). Buttons are PressableScale-based (MO-01); the card itself does
// not animate, so reduced motion has nothing to respect.

const kcalProtein = (
  kcal: number | undefined,
  proteinG: number | undefined,
  proteinOnly: boolean,
): string | null => {
  const parts: string[] = [];
  if (kcal !== undefined && !proteinOnly) parts.push(`${Math.round(kcal)} kcal`);
  if (proteinG !== undefined) parts.push(`${Math.round(proteinG)} g protein`);
  return parts.length > 0 ? parts.join(' · ') : null;
};

/** "Replaces Lentil soup (320 kcal · 14 g protein) with Chicken bowl (610 kcal · 42 g protein)". */
function swapDetail(swap: RebalanceSwapLike, proteinOnly: boolean): string {
  const was = kcalProtein(swap.previousKcal, swap.previousProteinG, proteinOnly);
  const now = kcalProtein(swap.newKcal, swap.newProteinG, proteinOnly);
  const from = `${swap.previousRecipeName ?? 'the planned meal'}${was ? ` (${was})` : ''}`;
  const to = `${swap.newRecipeName ?? 'a different dish'}${now ? ` (${now})` : ''}`;
  return `Replaces ${from} with ${to}`;
}

export interface RebalanceOfferProps {
  /** When set (Plan tab), only an offer for the displayed plan shows. */
  planId?: string | undefined;
  /** Called after Apply swapped meals — the caller refreshes its plan. */
  onApplied?: () => void;
  className?: string;
}

/** Mounted on every logging surface; renders (and touches tRPC) only while an offer is pending. */
export function RebalanceOffer({ planId, ...rest }: RebalanceOfferProps) {
  const offer = useRebalanceOffer();
  if (!offer || (planId !== undefined && offer.planId !== planId)) {
    return null;
  }
  return <OfferCard offer={offer} {...rest} />;
}

function OfferCard({
  offer,
  onApplied,
  className,
}: Omit<RebalanceOfferProps, 'planId'> & { offer: RebalancePreviewLike }) {
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // WP-08: protein-only mode shows the protein change only, never a calorie figure.
  const { proteinOnly } = useNumbersMode();
  const headline = proteinOnly ? proteinOnlyHeadline(offer.headline) : offer.headline;
  const utils = trpc.useUtils();
  const applyMutation = trpc.mealPlan.applyRebalance.useMutation({ meta: { silent: true } });
  const canApply = offer.swaps.length > 0;

  const apply = async () => {
    if (applyMutation.isPending) return;
    setNotice(null);
    try {
      const result = await applyMutation.mutateAsync({
        planId: offer.planId,
        swaps: offer.swaps.flatMap((s) =>
          isMealType(s.mealType)
            ? [
                {
                  dayOfWeek: s.dayOfWeek,
                  mealType: s.mealType,
                  ...(s.slotIndex !== undefined && { slotIndex: s.slotIndex }),
                  previousRecipeId: s.previousRecipeId,
                  newRecipeId: s.newRecipeId,
                },
              ]
            : [],
        ),
        localDate: localDateStr(),
      });
      // Applied swaps get the usual Undo banner; stale ones were skipped by the server.
      recordRebalance(result);
      clearRebalanceOffer();
      setExpanded(false);
      void utils.mealPlan.getForWeek.invalidate();
      void utils.dashboard.summary.invalidate();
      void utils.tracker.invalidate();
      void utils.shoppingList.invalidate();
      if (result.rebalanced) onApplied?.();
    } catch (error) {
      setNotice(`Couldn't change your week. ${userFacingErrorMessage(error)}`.trim());
    }
  };

  return (
    <View
      testID="rebalance-offer"
      accessibilityLiveRegion="polite"
      className={cn('gap-2 rounded-2xl border border-primary/20 bg-accent p-3', className)}
    >
      <View className="flex-row items-start gap-2">
        <Ionicons name="color-wand-outline" size={18} color={colors.primary} />
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-sm font-semibold text-gray-900">Rebalance your week?</Text>
          {headline !== '' && (
            <Text testID="rebalance-offer-headline" className="text-sm text-gray-800">
              {headline}
            </Text>
          )}
          {canApply && (
            <Text testID="rebalance-offer-text" className="text-sm text-gray-800">
              {proteinOnly ? proteinOnlyOfferCopy(offer.swaps) : rebalanceOfferCopy(offer)}
            </Text>
          )}
          {offer.snacks.length > 0 && (
            <View testID="rebalance-offer-snacks" className="gap-0.5">
              <Text className="text-sm text-gray-800">
                {canApply ? 'Or add a protein snack:' : 'A protein snack would help:'}
              </Text>
              {offer.snacks.map((snack) => (
                <Text key={snack.id} className="text-sm text-gray-700">
                  {`• ${proteinOnly ? describeSnackProteinOnly(snack) : describeProteinSnack(snack)}`}
                </Text>
              ))}
            </View>
          )}
          {expanded &&
            offer.swaps.map((swap, i) => (
              <Text
                key={`${swap.dayOfWeek}-${swap.mealType}-${swap.slotIndex ?? ''}`}
                testID={`rebalance-offer-detail-${i}`}
                className="text-xs text-gray-600"
              >
                {swapDetail(swap, proteinOnly)}
              </Text>
            ))}
          {notice !== null && (
            <Text testID="rebalance-offer-error" className="text-xs text-red-600">
              {notice}
            </Text>
          )}
        </View>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {canApply && (
          <>
            <Button
              testID="rebalance-offer-apply"
              size="sm"
              accessibilityLabel="Apply the rebalance to my week"
              loading={applyMutation.isPending}
              onPress={() => void apply()}
            >
              Apply
            </Button>
            <Button
              testID="rebalance-offer-preview"
              variant="outline"
              size="sm"
              accessibilityLabel={expanded ? 'Hide the swap details' : 'Preview the swaps'}
              accessibilityState={{ expanded }}
              onPress={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Hide' : 'Preview'}
            </Button>
          </>
        )}
        <Button
          testID="rebalance-offer-dismiss"
          variant="ghost"
          size="sm"
          accessibilityLabel="Not now, keep my week as it is"
          disabled={applyMutation.isPending}
          onPress={clearRebalanceOffer}
        >
          Not now
        </Button>
      </View>
    </View>
  );
}

export type RebalanceCheckState = 'idle' | 'loading' | 'on-track' | 'error';

export type RebalanceCheck = { state: RebalanceCheckState; check: () => Promise<void> };

/**
 * Asks the server for a preview of `planId` and shows it as the offer. State
 * 'on-track' = nothing to offer. Shared by Plan's button and the plan-miss
 * sheet's "Find a higher-protein swap", so both end in the same card.
 */
export function useRebalanceCheck(planId: string | undefined): RebalanceCheck {
  const utils = trpc.useUtils();
  const [state, setState] = useState<RebalanceCheckState>('idle');

  const check = async () => {
    if (state === 'loading' || planId === undefined) return;
    setState('loading');
    try {
      const preview = await utils.mealPlan.previewRebalance.fetch(
        { planId, localDate: localDateStr() },
        { staleTime: 0 },
      );
      const hasOffer = !!preview && (preview.swaps.length > 0 || preview.snacks.length > 0);
      setRebalanceOffer(preview);
      setState(hasOffer ? 'idle' : 'on-track');
    } catch {
      setState('error');
    }
  };
  return { state, check };
}

/**
 * Plan's "Rebalance my week" (UX-PLAN-09: reachable without logging first):
 * shows the same offer card, or "Your week is on track" when there is nothing
 * to offer. Pass `controller` when the screen also triggers the check elsewhere.
 */
export function RebalanceMyWeek({
  planId,
  controller,
  className,
}: {
  planId: string;
  controller?: RebalanceCheck;
  className?: string;
}) {
  const own = useRebalanceCheck(planId);
  const { state, check } = controller ?? own;
  const offer = useRebalanceOffer();
  const offerShown = offer !== null && offer.planId === planId;

  return (
    <View className={cn('gap-1', className)}>
      {!offerShown && (
        <Button
          testID="rebalance-my-week"
          variant="outline"
          size="sm"
          className="self-start"
          accessibilityLabel="Rebalance my week"
          loading={state === 'loading'}
          onPress={() => void check()}
        >
          <Ionicons name="color-wand-outline" size={14} color={colors.primary} />
          <Text className="text-sm font-medium text-foreground">Rebalance my week</Text>
        </Button>
      )}
      {!offerShown && state === 'on-track' && (
        <Text testID="rebalance-on-track" variant="muted" className="px-1 text-xs">
          Your week is on track
        </Text>
      )}
      {state === 'error' && (
        <Text testID="rebalance-my-week-error" className="px-1 text-xs text-red-600">
          Couldn&apos;t check your week just now. Try again.
        </Text>
      )}
    </View>
  );
}
