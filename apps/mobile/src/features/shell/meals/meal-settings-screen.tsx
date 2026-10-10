import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, Switch, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import type { PlanShape } from '@chefer/types';
import {
  Button,
  ChipGroup,
  ErrorState,
  haptics,
  ListRow,
  ListSection,
  PressableScale,
  Screen,
  SegmentedControl,
  SelectSheet,
  Text,
  useQueryState,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  cn,
  defaultWeekOffset,
  formatMoney,
  PREMIUM_PITCH_COPY,
  toDisplayCurrency,
  userFacingErrorMessage,
  weekdayLongName,
} from '@chefer/utils';
import { Icon, type IconName } from '../../../components/icon';
import { useIsPremium } from '../../../hooks/use-is-premium';
import { trpc } from '../../../lib/trpc';
import {
  timeCapValue,
  withDays,
  withSlots,
  withTimeCap,
  type TimeCapValue,
} from '../../meal-plan/plan-shape-edits';
import { openPremium } from '../../premium/open-premium';
import { ShellTopBar } from '../shell-chrome';
import { intParam } from './meals-model';

// ─── Meal settings (10 Oct redesign, board PlanSettingsSheet) ──────────────
// The old Plan settings sheet as a screen of its own under You, with the
// food rows that were scattered over Settings gathered under "More". The
// shape saves the way the sheet did (`mealPlan.setShape`, the same
// validation via plan-shape-edits); saving never regenerates by itself — when
// the week already has a plan, Meals opens the usual "new plan?" confirm
// (`/plan?replan=1`). "Fit meals to training days" is saved with the shape
// (`setShape({ fitTrainingDays })`, T-06.7 follow-up): every later generate —
// the Meals button and the Sunday auto-plan — uses it (premium only).

/** `fitTrainingDays`: null/absent = never chosen (on for an account with training days). */
type Shape = PlanShape & { leftovers: boolean; fitTrainingDays?: boolean | null };

const SLOT_OPTIONS = [
  { value: 'breakfast' as const, label: 'Breakfast', testID: 'meal-settings-slot-breakfast' },
  { value: 'lunch' as const, label: 'Lunch', testID: 'meal-settings-slot-lunch' },
  { value: 'dinner' as const, label: 'Dinner', testID: 'meal-settings-slot-dinner' },
  { value: 'snack' as const, label: 'Snacks', testID: 'meal-settings-slot-snack' },
];

const TIME_OPTIONS = [
  { value: '15' as const, label: '15 min', testID: 'meal-settings-time-15' },
  { value: '30' as const, label: '30 min', testID: 'meal-settings-time-30' },
  { value: '45' as const, label: '45 min', testID: 'meal-settings-time-45' },
  { value: 'none' as const, label: 'Any', testID: 'meal-settings-time-none' },
];

const DAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const COOKING_FOR = [
  { value: '1' as const, label: 'Just me' },
  { value: '2' as const, label: 'Two of us' },
];

/** A titled group whose body is not a list of rows (chips, toggles, a segmented control). */
function Group({
  title,
  children,
  testID,
}: {
  title: string;
  children: ReactNode;
  testID?: string;
}) {
  return (
    <View className="gap-1.5" testID={testID}>
      <Text
        accessibilityRole="header"
        className="px-4 text-subhead font-semibold text-label-secondary"
      >
        {title}
      </Text>
      <View className="overflow-hidden rounded-card border border-separator bg-surface">
        {children}
      </View>
    </View>
  );
}

/** A labelled switch row (the switch is its own accessible control). */
function SwitchRow({
  title,
  subtitle,
  value,
  onChange,
  disabled = false,
  testID,
  badge,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  testID: string;
  badge?: string;
}) {
  const colors = useThemeColors();
  return (
    <View className="min-h-11 flex-row items-center gap-3 px-4 py-3">
      <View className="min-w-0 flex-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-body text-label">{title}</Text>
          {badge ? (
            <Text className="rounded-full bg-brand-tint px-2 text-caption font-semibold text-brand">
              {badge}
            </Text>
          ) : null}
        </View>
        {subtitle ? (
          <Text className="mt-0.5 text-subhead text-label-secondary">{subtitle}</Text>
        ) : null}
      </View>
      <Switch
        testID={testID}
        accessibilityLabel={title}
        accessibilityHint={subtitle}
        disabled={disabled}
        accessibilityState={{ disabled, checked: value }}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.brand, false: colors.separator }}
      />
    </View>
  );
}

export function MealSettingsScreen() {
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ week?: string }>();
  // Which week a save re-plans: the one Meals had open, else the default week.
  const weekOffset = intParam(params.week, 0, 1) ?? defaultWeekOffset(new Date());
  const weekWord = weekOffset === 0 ? 'this week' : 'next week';
  const isPremium = useIsPremium() === true;

  const shapeQuery = trpc.mealPlan.getShape.useQuery();
  const { state: loadState, retry } = useQueryState(shapeQuery);
  // UX-PLAN-12: a household's "Cooking for" is the table, read-only here.
  const householdQuery = trpc.household.list.useQuery(undefined, { staleTime: 60_000 });
  const { data: prefs } = trpc.preferences.get.useQuery(undefined, { staleTime: 60_000 });
  const { data: plan } = trpc.mealPlan.getForWeek.useQuery({ weekOffset }, { retry: false });
  const hasPlan = plan !== null && plan !== undefined;
  const hasTrainingDays = (plan?.trainingDays ?? []).length > 0;

  const [draft, setDraft] = useState<Shape | null>(null);
  const [cookingForOpen, setCookingForOpen] = useState(false);
  // Start from the server's shape once it loads (a later refetch never overwrites edits).
  useEffect(() => {
    if (shapeQuery.data && draft === null) setDraft(shapeQuery.data);
  }, [shapeQuery.data, draft]);

  const utils = trpc.useUtils();
  const setShapeMutation = trpc.mealPlan.setShape.useMutation({ meta: { silent: true } });

  const save = () => {
    if (!draft) return;
    setShapeMutation.mutate(draft, {
      onSuccess: () => {
        void utils.mealPlan.getShape.invalidate();
        if (hasPlan) {
          // Settings never regenerate by themselves: Meals asks first.
          router.navigate({
            pathname: '/plan',
            params: { week: String(weekOffset), replan: '1', at: String(Date.now()) },
          });
        } else if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/you');
        }
      },
    });
  };

  const members = householdQuery.data ?? [];
  const names = members.map((m) => m.name.trim()).filter(Boolean);
  const currency = toDisplayCurrency(prefs?.chefProfile?.deliveryCurrency);
  const budgetEur = prefs?.chefProfile?.weeklyBudgetEur;
  const units = prefs?.chefProfile?.preferredUnits === 'IMPERIAL' ? 'lb' : 'kg';
  const autoPlan = prefs?.chefProfile?.autoPlanWeekly;

  const moreRows: { title: string; icon: IconName; href: Href; value?: string; testID: string }[] =
    [
      {
        title: 'Allergies & diets',
        icon: 'shield',
        href: '/preferences?section=safety',
        testID: 'meal-settings-safety',
      },
      {
        title: 'Weekly budget',
        icon: 'cart',
        href: '/preferences?section=budget',
        ...(budgetEur != null && { value: formatMoney(budgetEur, currency, { decimals: 0 }) }),
        testID: 'meal-settings-budget',
      },
      {
        title: 'Plan my week automatically',
        icon: 'calendar',
        href: '/preferences?section=auto-plan',
        ...(autoPlan !== undefined && { value: autoPlan ? 'Sun' : 'Off' }),
        testID: 'meal-settings-auto-plan',
      },
      {
        title: 'Money & units',
        icon: 'gymSettings',
        href: '/preferences?section=display',
        ...(prefs && { value: `${currency} · ${units}` }),
        testID: 'meal-settings-display',
      },
    ];

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="bg-canvas px-0">
      <ShellTopBar className="mx-4 mt-3" />
      {loadState === 'error' ? (
        <ErrorState
          testID="meal-settings-load-error"
          title="Couldn't load your meal settings"
          onRetry={retry}
        />
      ) : !draft ? (
        <View className="items-center py-16">
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : (
        <ScrollView testID="meal-settings-scroll" contentContainerClassName="gap-5 px-4 pb-8 pt-3">
          <Group title="What we plan" testID="meal-settings-what">
            <View className="p-3">
              <ChipGroup
                testID="meal-settings-slots"
                options={SLOT_OPTIONS}
                value={draft.slots}
                multiple
                onChange={(slots) => {
                  const next = withSlots(draft, slots); // pick at least one meal
                  if (next) setDraft({ ...draft, ...next });
                }}
              />
            </View>
            <View className="h-px bg-separator" />
            <View
              testID="meal-settings-days"
              accessibilityLabel="Days"
              className="flex-row justify-between gap-1 p-3"
            >
              {DAY_INITIALS.map((initial, day) => {
                const on = draft.days.includes(day);
                return (
                  // MO-01: press feedback through PressableScale.
                  <PressableScale
                    key={day}
                    testID={`meal-settings-day-${day}`}
                    accessibilityRole="checkbox"
                    accessibilityLabel={weekdayLongName(day)}
                    accessibilityState={{ checked: on }}
                    onPress={() => {
                      const next = withDays(
                        draft,
                        on ? draft.days.filter((d) => d !== day) : [...draft.days, day],
                      ); // pick at least one day
                      if (!next) return;
                      haptics.selection();
                      setDraft({ ...draft, ...next });
                    }}
                    className={cn(
                      'h-11 w-11 items-center justify-center rounded-full',
                      on ? 'bg-brand' : 'border border-separator bg-surface',
                    )}
                  >
                    <Text
                      maxFontSizeMultiplier={1.3}
                      className={cn('text-callout font-bold', on ? 'text-brand-on' : 'text-label')}
                    >
                      {initial}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          </Group>

          <Group title="Cooking time" testID="meal-settings-time">
            <View className="p-3">
              <SegmentedControl
                testID="meal-settings-time-cap"
                accessibilityLabel="Cooking time"
                options={TIME_OPTIONS}
                value={timeCapValue(draft)}
                onChange={(value: TimeCapValue) =>
                  setDraft({ ...draft, ...withTimeCap(draft, value) })
                }
              />
            </View>
            <SwitchRow
              testID="meal-settings-weekends"
              title="Longer on weekends"
              value={draft.weekendNoLimit}
              onChange={(weekendNoLimit) => setDraft({ ...draft, weekendNoLimit })}
            />
          </Group>

          <ListSection title="Table">
            {members.length > 0 ? (
              <ListRow
                testID="meal-settings-cooking-for"
                title="Cooking for"
                value={`You + ${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2}` : ''}`}
                icon={<Icon name="following" color={colors.brand} />}
                onPress={() => router.push('/household')}
              />
            ) : (
              <ListRow
                testID="meal-settings-cooking-for"
                title="Cooking for"
                value={draft.cookingFor === 2 ? 'Two of us' : 'Just me'}
                icon={<Icon name="following" color={colors.brand} />}
                onPress={() => setCookingForOpen(true)}
              />
            )}
            {members.length === 0 ? (
              <ListRow
                testID="meal-settings-household"
                title="Set up your table"
                subtitle="For a household of 3 or more"
                icon={<Icon name="household" color={colors.brand} />}
                onPress={() => router.push('/household')}
              />
            ) : null}
          </ListSection>

          {isPremium || hasTrainingDays ? (
            <Group title="Options" testID="meal-settings-options">
              {isPremium ? (
                <SwitchRow
                  testID="meal-settings-leftovers"
                  title="Leftover lunches"
                  subtitle="Cook once, eat twice"
                  value={draft.leftovers}
                  onChange={(leftovers) => setDraft({ ...draft, leftovers })}
                />
              ) : null}
              {isPremium && hasTrainingDays ? <View className="ml-4 h-px bg-separator" /> : null}
              {hasTrainingDays ? (
                <>
                  <SwitchRow
                    testID="meal-settings-fit-training"
                    title="Fit meals to training days"
                    subtitle="More on workout days"
                    disabled={!isPremium}
                    {...(!isPremium && { badge: 'Premium' })}
                    value={isPremium ? (draft.fitTrainingDays ?? true) : false}
                    onChange={(fitTrainingDays) => setDraft({ ...draft, fitTrainingDays })}
                  />
                  {!isPremium ? (
                    <PressableScale
                      testID="meal-settings-fit-training-premium"
                      accessibilityRole="button"
                      onPress={() => openPremium('training-week')}
                      className="min-h-11 justify-center px-4 pb-2"
                    >
                      <Text className="text-subhead font-semibold text-brand">
                        {PREMIUM_PITCH_COPY.seeWhatPremiumAdds}
                      </Text>
                    </PressableScale>
                  ) : null}
                </>
              ) : null}
            </Group>
          ) : null}

          <ListSection title="More">
            {moreRows.map((row) => (
              <ListRow
                key={row.testID}
                testID={row.testID}
                title={row.title}
                {...(row.value !== undefined && { value: row.value })}
                icon={<Icon name={row.icon} color={colors.brand} />}
                onPress={() => router.push(row.href)}
              />
            ))}
          </ListSection>

          {setShapeMutation.isError ? (
            <Text
              testID="meal-settings-error"
              accessibilityLiveRegion="polite"
              className="text-subhead text-attention"
            >
              {userFacingErrorMessage(setShapeMutation.error) || 'Could not save. Try again.'}
            </Text>
          ) : null}

          <Button testID="meal-settings-save" loading={setShapeMutation.isPending} onPress={save}>
            {hasPlan ? `Save and re-plan ${weekWord}` : 'Save'}
          </Button>
        </ScrollView>
      )}

      <SelectSheet
        visible={cookingForOpen}
        onClose={() => setCookingForOpen(false)}
        title="Cooking for"
        options={COOKING_FOR}
        value={draft?.cookingFor === 2 ? '2' : '1'}
        onChange={(value) => {
          if (draft) setDraft({ ...draft, cookingFor: Number(value) as 1 | 2 });
          setCookingForOpen(false);
        }}
        testID="meal-settings-cooking-for-sheet"
      />
    </Screen>
  );
}
