import { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Translator } from '@chefer/i18n';
import { Button, Text, useThemeColors } from '@chefer/ui-mobile';
import {
  cn,
  describeProteinSnack,
  describeSnackProteinOnly,
  localDateStr,
  proteinOnlyHeadline,
  proteinOnlyOfferCopy,
  rebalanceOfferCopy,
  userFacingErrorMessage,
  type RebalancePreviewLike,
  type RebalanceSwapLike,
} from '@chefer/utils';
import { getTranslator, useT } from '../../lib/i18n';
import { trpc } from '../../lib/trpc';
import { useNumbersMode } from '../numbers-mode/numbers-mode';
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
  t: Translator['t'],
  kcal: number | undefined,
  proteinG: number | undefined,
  proteinOnly: boolean,
): string | null => {
  const showKcal = kcal !== undefined && !proteinOnly;
  if (showKcal && proteinG !== undefined) {
    return t('tracker.rebalance.kcalProtein', {
      kcal: Math.round(kcal),
      protein: Math.round(proteinG),
    });
  }
  if (showKcal) return t('tracker.rebalance.kcalOnly', { kcal: Math.round(kcal) });
  if (proteinG !== undefined) {
    return t('tracker.rebalance.proteinOnly', { protein: Math.round(proteinG) });
  }
  return null;
};

/** "Replaces Lentil soup (320 kcal · 14 g protein) with Chicken bowl (610 kcal · 42 g protein)". */
function swapDetail(t: Translator['t'], swap: RebalanceSwapLike, proteinOnly: boolean): string {
  const was = kcalProtein(t, swap.previousKcal, swap.previousProteinG, proteinOnly);
  const now = kcalProtein(t, swap.newKcal, swap.newProteinG, proteinOnly);
  const fromName = swap.previousRecipeName ?? t('tracker.rebalance.plannedMeal');
  const toName = swap.newRecipeName ?? t('tracker.rebalance.differentDish');
  const from = was
    ? t('tracker.rebalance.withNumbers', { name: fromName, numbers: was })
    : fromName;
  const to = now ? t('tracker.rebalance.withNumbers', { name: toName, numbers: now }) : toName;
  return t('tracker.rebalance.replaces', { from, to });
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
  // Lane E3 "Hide numbers": the offer is all calories and protein — not shown.
  const { noNumbers } = useNumbersMode();
  if (noNumbers || !offer || (planId !== undefined && offer.planId !== planId)) {
    return null;
  }
  return <OfferCard offer={offer} {...rest} />;
}

function OfferCard({
  offer,
  onApplied,
  className,
}: Omit<RebalanceOfferProps, 'planId'> & { offer: RebalancePreviewLike }) {
  const colors = useThemeColors();
  const { t } = useT();
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
      setNotice(
        getTranslator()
          .t('tracker.rebalance.applyError', { error: userFacingErrorMessage(error) })
          .trim(),
      );
    }
  };

  return (
    <View
      testID="rebalance-offer"
      accessibilityLiveRegion="polite"
      className={cn('gap-2 rounded-2xl border border-primary/20 bg-accent p-3', className)}
    >
      <View className="flex-row items-start gap-2">
        <Ionicons name="color-wand-outline" size={18} color={colors.brand} />
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-sm font-semibold text-label">{t('tracker.rebalance.title')}</Text>
          {headline !== '' && (
            <Text testID="rebalance-offer-headline" className="text-sm text-label">
              {headline}
            </Text>
          )}
          {canApply && (
            <Text testID="rebalance-offer-text" className="text-sm text-label">
              {proteinOnly ? proteinOnlyOfferCopy(offer.swaps) : rebalanceOfferCopy(offer)}
            </Text>
          )}
          {offer.snacks.length > 0 && (
            <View testID="rebalance-offer-snacks" className="gap-0.5">
              <Text className="text-sm text-label">
                {canApply ? t('tracker.rebalance.orSnack') : t('tracker.rebalance.snackHelps')}
              </Text>
              {offer.snacks.map((snack) => (
                <Text key={snack.id} className="text-sm text-label-secondary">
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
                className="text-xs text-label-secondary"
              >
                {swapDetail(t, swap, proteinOnly)}
              </Text>
            ))}
          {notice !== null && (
            <Text testID="rebalance-offer-error" className="text-xs text-danger">
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
              accessibilityLabel={t('tracker.rebalance.applyLabel')}
              loading={applyMutation.isPending}
              onPress={() => void apply()}
            >
              {t('tracker.rebalance.apply')}
            </Button>
            <Button
              testID="rebalance-offer-preview"
              variant="outline"
              size="sm"
              accessibilityLabel={
                expanded ? t('tracker.rebalance.hideLabel') : t('tracker.rebalance.previewLabel')
              }
              accessibilityState={{ expanded }}
              onPress={() => setExpanded((v) => !v)}
            >
              {expanded ? t('tracker.rebalance.hide') : t('tracker.rebalance.preview')}
            </Button>
          </>
        )}
        <Button
          testID="rebalance-offer-dismiss"
          variant="ghost"
          size="sm"
          accessibilityLabel={t('tracker.rebalance.notNowLabel')}
          disabled={applyMutation.isPending}
          onPress={clearRebalanceOffer}
        >
          {t('tracker.rebalance.notNow')}
        </Button>
      </View>
    </View>
  );
}

export type RebalanceCheckState = 'idle' | 'loading' | 'on-track' | 'error';

export type RebalanceCheck = {
  state: RebalanceCheckState;
  /** Resolves with the resulting state ('idle' = an offer is now showing). */
  check: () => Promise<RebalanceCheckState>;
};

/**
 * Asks the server for a preview of `planId` and shows it as the offer. State
 * 'on-track' = nothing to offer. Shared by Plan's button and the plan-miss
 * sheet's "Find a higher-protein swap", so both end in the same card.
 */
export function useRebalanceCheck(planId: string | undefined): RebalanceCheck {
  const utils = trpc.useUtils();
  const [state, setState] = useState<RebalanceCheckState>('idle');

  const check = async (): Promise<RebalanceCheckState> => {
    if (state === 'loading' || planId === undefined) return state;
    setState('loading');
    try {
      const preview = await utils.mealPlan.previewRebalance.fetch(
        { planId, localDate: localDateStr() },
        { staleTime: 0 },
      );
      const hasOffer = !!preview && (preview.swaps.length > 0 || preview.snacks.length > 0);
      setRebalanceOffer(preview);
      const next = hasOffer ? 'idle' : 'on-track';
      setState(next);
      return next;
    } catch {
      setState('error');
      return 'error';
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
  const colors = useThemeColors();
  const { t } = useT();
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
          accessibilityLabel={t('tracker.rebalance.myWeek')}
          loading={state === 'loading'}
          onPress={() => void check()}
        >
          <Ionicons name="color-wand-outline" size={14} color={colors.brand} />
          <Text className="text-sm font-medium text-foreground">
            {t('tracker.rebalance.myWeek')}
          </Text>
        </Button>
      )}
      {!offerShown && state === 'on-track' && (
        <Text testID="rebalance-on-track" variant="muted" className="px-1 text-xs">
          {t('tracker.rebalance.onTrack')}
        </Text>
      )}
      {state === 'error' && (
        <Text testID="rebalance-my-week-error" className="px-1 text-xs text-danger">
          {t('tracker.rebalance.checkError')}
        </Text>
      )}
    </View>
  );
}
