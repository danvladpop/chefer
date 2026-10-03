import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { FRIENDS_COPY } from '@chefer/types';
import {
  Button,
  DENSE_MAX_FONT_SCALE,
  haptics,
  SegmentedControl,
  Sheet,
  Skeleton,
  Text,
  useSnackbar,
} from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { trpc, type RouterOutputs } from '../../../lib/trpc';
import { weekdayFull, weekdayShort } from '../profile/format';
import { FriendsConfirmSheet, type ConfirmCopy } from '../safety/confirm-copy';
import {
  canPickNextWeek,
  dayOfMonth,
  defaultDay,
  isPastDay,
  readAddFailure,
  slotRows,
  type AddFailure,
  type SlotRow,
} from './add-to-week-logic';

// ─── Add to my week (UX §9.5, PRD FR-17.4–17.7) ───────────────────────────────
// A day + meal picker over the VIEWER's own week (`mealPlan.getForWeek` +
// `mealPlan.getShape`). An empty slot adds directly. A filled slot closes this
// sheet and, from its `onExited`, opens `Replace {meal}?` (iOS: never present
// a sheet while another is dismissing). A clash with the viewer's table
// (`data.unsafeForTable`) keeps/reopens this sheet with the conflict line and
// `Use anyway`. No plan for that week → `Make a plan` (closes, then the Plan
// tab). Success → `Added to {Tue} {lunch}` with Undo (`friends.undoAddToWeek`)
// and `haptics.success`. The server puts another person's recipe in as the
// viewer's own private copy (INV-5); adding it again reuses that copy.
//
// Mount it only while open; `onDismiss` runs once every sheet has exited.

export type AddToWeekRecipe = { id: string; name: string; kcal: number };

type AddResult = RouterOutputs['friends']['addRecipeToWeek'];
type Phase = 'picker' | 'confirm' | 'idle';
type After = 'confirm' | 'picker' | 'makePlan' | null;

export function AddToWeekSheet({
  recipe,
  onDismiss,
  api = 'friends',
  testID = 'friends-add-to-week',
}: {
  recipe: AddToWeekRecipe;
  onDismiss: () => void;
  /**
   * Which procedures run the add: `friends.*` (Following, another person's
   * recipe — the default) or `recipe.*` (UX-REC-08: any recipe, no Following).
   * Same inputs and results.
   */
  api?: 'friends' | 'recipe';
  testID?: string;
}) {
  const utils = trpc.useUtils();
  const snackbar = useSnackbar();
  const nextWeekAllowed = canPickNextWeek();
  const [weekOffset, setWeekOffset] = useState<0 | 1>(0);
  const [day, setDay] = useState(() => defaultDay(0));
  const [selected, setSelected] = useState<SlotRow | null>(null);
  const [failure, setFailure] = useState<AddFailure | null>(null);
  const [phase, setPhase] = useState<Phase>('picker');
  const after = useRef<After>(null);
  const done = useRef<AddResult | null>(null);

  const week = trpc.mealPlan.getForWeek.useQuery({ weekOffset }, { retry: false });
  const shape = trpc.mealPlan.getShape.useQuery(undefined, { staleTime: 60_000 });
  const addViaFriends = trpc.friends.addRecipeToWeek.useMutation({ meta: { silent: true } });
  const addViaRecipe = trpc.recipe.addToWeek.useMutation({ meta: { silent: true } });
  const add = api === 'recipe' ? addViaRecipe : addViaFriends;

  const plan = week.data;
  const rows = plan ? slotRows(plan, day, shape.data?.slots ?? []) : [];
  const dayLabel = weekdayShort(day);
  const noPlan = failure?.kind === 'noPlan' || (!week.isLoading && !week.isError && plan === null);

  const switchWeek = (next: 0 | 1) => {
    setWeekOffset(next);
    setDay(defaultDay(next));
    setSelected(null);
    setFailure(null);
  };
  const pickDay = (d: number) => {
    setDay(d);
    setSelected(null);
    setFailure(null);
  };

  /** Close the current sheet; `next` runs from its onExited. */
  const closeThen = (next: After) => {
    after.current = next;
    setPhase('idle');
  };

  const finish = () => {
    const result = done.current;
    done.current = null;
    if (result) {
      haptics.success();
      void utils.mealPlan.getForWeek.invalidate();
      void utils.recipe.list.invalidate();
      void utils.dashboard.summary.invalidate();
      const meal = result.mealType;
      snackbar.show({
        message: FRIENDS_COPY.addToWeek.done(weekdayShort(result.dayOfWeek), meal),
        tone: 'success',
        actionLabel: FRIENDS_COPY.common.undo,
        onAction: () => {
          const undo =
            api === 'recipe'
              ? utils.client.recipe.undoAddToWeek
              : utils.client.friends.undoAddToWeek;
          void undo
            .mutate({
              planId: result.planId,
              dayOfWeek: result.dayOfWeek,
              mealType: result.mealType,
              slotIndex: result.slotIndex,
              addedRecipeId: result.addedRecipeId,
              ...(result.previousRecipeId ? { previousRecipeId: result.previousRecipeId } : {}),
              // F3.1: Undo restores the replaced slot's `Your pick` state too.
              ...(result.previousPinned !== undefined
                ? { previousPinned: result.previousPinned }
                : {}),
            })
            .then(
              () => {
                void utils.mealPlan.getForWeek.invalidate();
                void utils.dashboard.summary.invalidate();
              },
              () => snackbar.show({ message: FRIENDS_COPY.relation.error }),
            );
        },
      });
    }
    onDismiss();
  };

  const onPickerExited = () => {
    const next = after.current;
    after.current = null;
    if (next === 'confirm') {
      setPhase('confirm');
      return;
    }
    if (next === 'makePlan') router.push('/meal-plan');
    finish();
  };

  const onConfirmExited = () => {
    const next = after.current;
    after.current = null;
    if (next === 'picker') {
      setPhase('picker');
      return;
    }
    finish();
  };

  /** Runs the mutation; the caller decides what to do with the outcome. */
  const submit = async (acknowledgeConflict: boolean): Promise<'ok' | AddFailure> => {
    if (!selected) return { kind: 'error' };
    try {
      const result = await add.mutateAsync({
        recipeId: recipe.id,
        weekOffset,
        dayOfWeek: day,
        mealType: selected.mealType,
        mode: selected.mode,
        ...(selected.slotIndex !== null ? { slotIndex: selected.slotIndex } : {}),
        ...(acknowledgeConflict ? { acknowledgeConflict: true } : {}),
      });
      done.current = result;
      return 'ok';
    } catch (error) {
      haptics.error();
      return readAddFailure(error);
    }
  };

  /** From the picker: an add (or an acknowledged retry) runs here, in the sheet. */
  const addFromPicker = async (acknowledgeConflict: boolean) => {
    setFailure(null);
    const outcome = await submit(acknowledgeConflict);
    if (outcome === 'ok') closeThen(null);
    else setFailure(outcome);
  };

  const onCta = () => {
    if (!selected || add.isPending) return;
    if (selected.mode === 'replace') closeThen('confirm');
    else void addFromPicker(false);
  };

  const confirmCopy: ConfirmCopy | null =
    selected?.mode === 'replace'
      ? {
          title: FRIENDS_COPY.addToWeek.replaceTitle(selected.currentName ?? selected.mealType),
          body: FRIENDS_COPY.addToWeek.replaceBody(recipe.name, dayLabel, selected.mealType),
          confirmLabel: FRIENDS_COPY.addToWeek.replace,
          cancelLabel: FRIENDS_COPY.common.cancel,
          destructive: false,
        }
      : null;

  const ctaLabel = selected
    ? FRIENDS_COPY.addToWeek.cta(dayLabel, selected.mealType)
    : FRIENDS_COPY.addToWeek.title;

  return (
    <>
      <Sheet
        testID={testID}
        visible={phase === 'picker'}
        title={FRIENDS_COPY.addToWeek.title}
        eyebrow={FRIENDS_COPY.addToWeek.eyebrow(recipe.name, Math.round(recipe.kcal))}
        onClose={() => {
          if (!add.isPending) closeThen(null);
        }}
        onExited={onPickerExited}
        scrollable
        footer={
          noPlan ? null : (
            <Button
              testID={`${testID}-cta`}
              size="lg"
              disabled={!selected}
              loading={add.isPending}
              onPress={onCta}
            >
              {ctaLabel}
            </Button>
          )
        }
      >
        {nextWeekAllowed ? (
          <SegmentedControl<'0' | '1'>
            testID={`${testID}-week`}
            size="sm"
            value={weekOffset === 0 ? '0' : '1'}
            onChange={(v) => switchWeek(v === '0' ? 0 : 1)}
            options={[
              { value: '0', label: FRIENDS_COPY.addToWeek.thisWeek, testID: `${testID}-this-week` },
              { value: '1', label: FRIENDS_COPY.addToWeek.nextWeek, testID: `${testID}-next-week` },
            ]}
          />
        ) : null}

        <View className="flex-row justify-between">
          {Array.from({ length: 7 }, (_, d) => {
            const past = isPastDay(weekOffset, d);
            const isSelected = d === day;
            return (
              <Pressable
                key={d}
                testID={`${testID}-day-${d}`}
                accessibilityRole="button"
                accessibilityLabel={weekdayFull(d)}
                accessibilityState={{ selected: isSelected, disabled: past }}
                disabled={past}
                onPress={() => pickDay(d)}
                className={cn(
                  'h-14 w-11 items-center justify-center rounded-xl',
                  isSelected ? 'bg-primary' : 'bg-gray-50',
                  past && 'opacity-40',
                )}
              >
                <Text
                  maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE}
                  className={cn(
                    'text-xs font-semibold',
                    isSelected ? 'text-primary-foreground' : 'text-gray-700',
                  )}
                >
                  {weekdayShort(d)}
                </Text>
                <Text
                  maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE}
                  className={cn(
                    'text-xs',
                    isSelected ? 'text-primary-foreground' : 'text-gray-500',
                  )}
                >
                  {dayOfMonth(weekOffset, d)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {week.isLoading ? (
          <View testID={`${testID}-loading`} className="gap-2">
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </View>
        ) : noPlan ? (
          <View testID={`${testID}-no-plan`} className="gap-3 py-2">
            <Text>{FRIENDS_COPY.addToWeek.noPlan}</Text>
            <Button
              testID={`${testID}-make-plan`}
              variant="outline"
              onPress={() => closeThen('makePlan')}
            >
              {FRIENDS_COPY.addToWeek.makePlan}
            </Button>
          </View>
        ) : week.isError ? (
          <Text testID={`${testID}-load-error`} className="text-sm text-destructive">
            {FRIENDS_COPY.relation.error}
          </Text>
        ) : (
          <View accessibilityRole="radiogroup" className="gap-2">
            {rows.map((row) => {
              const isSelected = selected?.key === row.key;
              const action =
                row.mode === 'add'
                  ? FRIENDS_COPY.addToWeek.addHere
                  : FRIENDS_COPY.addToWeek.replace;
              return (
                <Pressable
                  key={row.key}
                  testID={`${testID}-slot-${row.key}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected, checked: isSelected }}
                  accessibilityLabel={[row.mealType, row.currentName, action]
                    .filter(Boolean)
                    .join(', ')}
                  onPress={() => {
                    setSelected(row);
                    setFailure(null);
                  }}
                  className={cn(
                    'min-h-12 flex-row items-center gap-3 rounded-xl border px-3 py-2',
                    isSelected ? 'border-primary bg-accent' : 'border-border',
                  )}
                >
                  <View className="min-w-0 flex-1">
                    <Text className="text-xs font-semibold uppercase text-gray-500">
                      {row.mealType}
                    </Text>
                    {row.currentName ? (
                      <Text numberOfLines={1} className="text-sm text-gray-900">
                        {row.currentName}
                      </Text>
                    ) : null}
                  </View>
                  <Text className="text-sm font-semibold text-primary">{action}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {failure?.kind === 'conflict' ? (
          <View
            testID={`${testID}-conflict`}
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2"
          >
            <Text accessibilityRole="alert" className="text-xs text-red-600">
              {failure.message}
            </Text>
            {failure.canAcknowledge ? (
              <Button
                testID={`${testID}-use-anyway`}
                variant="secondary"
                size="sm"
                className="mt-2 self-start"
                disabled={add.isPending}
                onPress={() => {
                  if (selected?.mode === 'replace') {
                    // The replace was already confirmed: retry it as is.
                    void (async () => {
                      const outcome = await submit(true);
                      if (outcome === 'ok') closeThen(null);
                      else setFailure(outcome);
                    })();
                  } else {
                    void addFromPicker(true);
                  }
                }}
              >
                {FRIENDS_COPY.addToWeek.useAnyway}
              </Button>
            ) : null}
          </View>
        ) : failure?.kind === 'error' ? (
          <Text
            testID={`${testID}-error`}
            accessibilityRole="alert"
            className="text-sm text-destructive"
          >
            {FRIENDS_COPY.relation.error}
          </Text>
        ) : null}
      </Sheet>

      {confirmCopy ? (
        <FriendsConfirmSheet
          testID={`${testID}-replace`}
          visible={phase === 'confirm'}
          copy={confirmCopy}
          onClose={() => {
            // Cancel goes back to the picker; a confirm sets `after` itself.
            if (after.current === null && !done.current) after.current = 'picker';
            setPhase('idle');
          }}
          onConfirm={async () => {
            const outcome = await submit(false);
            if (outcome === 'ok') {
              after.current = null;
              return true;
            }
            if (outcome.kind === 'error') return false; // stays open with the error line
            // A conflict or no plan: back to the picker, which shows it.
            setFailure(outcome);
            after.current = 'picker';
            return true;
          }}
          onExited={onConfirmExited}
        />
      ) : null}
    </>
  );
}
