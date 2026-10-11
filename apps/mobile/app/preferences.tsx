import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { DISPLAY_CURRENCIES, type DisplayCurrency } from '@chefer/types';
import {
  ErrorState,
  IconButton,
  Input,
  KeyboardAwareScrollView,
  PressableScale,
  Screen,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  cn,
  currencySymbol,
  formatKcal,
  fromEur,
  parseWeeklyBudget,
  toDisplayCurrency,
  toEur,
  userFacingErrorMessage,
  weeklyBudgetCapLabel,
} from '@chefer/utils';
import { Icon } from '../src/components/icon';
import { AutoPlanToggle } from '../src/features/preferences/auto-plan-toggle';
import { SafetyStep } from '../src/features/preferences/components/safety-step';
import { GoalBodyCard, type GoalBodySavePayload } from '../src/features/preferences/goal-body-card';
import { TargetsCard } from '../src/features/preferences/targets-card';
import type {
  ActivityLevel,
  BiologicalSex,
  Goal,
  SafetyValue,
} from '../src/features/preferences/types';
import { useNumericChain } from '../src/features/preferences/use-numeric-chain';
import { WeeklyUpdatesCard } from '../src/features/preferences/weekly-updates-card';
import { openPremium } from '../src/features/premium/open-premium';
import { HealthDeclinedNotice } from '../src/features/privacy/health-notices';
import { useHealthConsent } from '../src/features/privacy/use-health-consent';
import { MigrationCard } from '../src/features/safety/migration-card';
import type { SafetyPickerHandle } from '../src/features/safety/safety-picker';
import { SectionAnchor, useSectionTitle } from '../src/features/settings/section-anchor';
import { useShellV2 } from '../src/features/shell/shell-store';
import { BoardCard } from '../src/features/shell/today/parts';
import { TrainButton } from '../src/features/shell/train/train-button';
import { PreferencesHeaderV2 } from '../src/features/shell/you/preferences-header';
import { useIsPremium } from '../src/hooks/use-is-premium';
import { trpc } from '../src/lib/trpc';

// Preferences — port of apps/web /preferences (M2-7), plus dogfood feedback
// #6: goal + body metrics are back, saved through the every-tier
// preferences.saveProfileBasics procedure (not premium-gated) so a free
// account can set a goal and see a real calorie target on the dashboard.
// Safety preferences (allergies, restrictions, dislikes) are FREE (P1-2) and
// save through updateSafety; units + currency are FREE too (backlog P2-6,
// audit F-DASH-3-2) and save through setDisplayPreferences; the weekly
// budget stays premium (updateTargets), typed in the user's currency and
// stored in EUR.

/** EUR budget → input text in `currency` (55.56 EUR → "60" USD). */
function budgetText(budgetEur: number | null | undefined, currency: DisplayCurrency): string {
  if (budgetEur == null) return '';
  return String(Math.round(fromEur(budgetEur, currency) * 100) / 100);
}

/** A field label inside a card ("Measurement units", "Currency"). */
function FieldLabel({ children }: { children: string }) {
  return <Text className="text-subhead font-semibold text-label-secondary">{children}</Text>;
}

/** A card's heading ("Food safety", "Units & currency"). */
function CardTitle({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" className="text-headline font-semibold text-label">
      {children}
    </Text>
  );
}

export default function PreferencesScreen() {
  const colors = useThemeColors();
  const isPremium = useIsPremium();
  // 10 Oct redesign: the new shell titles this screen "Goals & diet" and puts
  // Goal & body first, food safety second; the old shell is unchanged.
  const shellV2 = useShellV2();
  // UX-ACC-04: opened from a Settings row (`?section=`), the title is the row's.
  const title = useSectionTitle(shellV2 ? 'Goals & diet' : 'Preferences');
  const { data, isLoading, isError, refetch } = trpc.preferences.get.useQuery();
  const utils = trpc.useUtils();
  // T-26.2: allergies/diets/dislikes are health information — asked once, on the first save.
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();
  const [safetyDeclined, setSafetyDeclined] = useState(false);

  // ── Safety (free) ──────────────────────────────────────────────────────────
  const [safety, setSafety] = useState<SafetyValue>({
    dietaryRestrictions: [],
    allergies: [],
    dislikedIngredients: [],
  });
  const [safetyLoaded, setSafetyLoaded] = useState(false);
  // UX-ACC-01: a term typed in "Something else?" but never added with "+" is
  // flushed into the value on Save (and counts as an unsaved edit meanwhile).
  const safetyPickerRef = useRef<SafetyPickerHandle>(null);
  const [safetyTermPending, setSafetyTermPending] = useState(false);

  // ── Units & currency (free) + budget (premium) ─────────────────────────────
  const savedCurrency = toDisplayCurrency(data?.chefProfile?.deliveryCurrency);
  const [units, setUnits] = useState<'METRIC' | 'IMPERIAL'>('METRIC');
  const [currency, setCurrency] = useState<DisplayCurrency>('EUR');
  const [budget, setBudget] = useState('');
  // UX-X-05: the budget pad gets its own "Done" bar (number pads have no Return on iOS).
  const budgetNumeric = useNumericChain('prefs-budget', 1);

  useEffect(() => {
    if (!data || safetyLoaded) {
      return;
    }
    setSafety({
      dietaryRestrictions: data.dietaryPreferences?.dietaryRestrictions ?? [],
      allergies: data.dietaryPreferences?.allergies ?? [],
      dislikedIngredients: data.dietaryPreferences?.dislikedIngredients ?? [],
    });
    const loadedCurrency = toDisplayCurrency(data.chefProfile?.deliveryCurrency);
    setUnits(data.chefProfile?.preferredUnits ?? 'METRIC');
    setCurrency(loadedCurrency);
    setBudget(budgetText(data.chefProfile?.weeklyBudgetEur, loadedCurrency));
    setSafetyLoaded(true);
  }, [data, safetyLoaded]);

  const safetyMutation = trpc.preferences.updateSafety.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      void utils.preferences.get.invalidate();
      void utils.mealPlan.invalidate();
    },
  });
  const displayMutation = trpc.preferences.setDisplayPreferences.useMutation({
    meta: { silent: true },
    onSuccess: (_result, input) => {
      // The typed budget keeps its value in the new currency.
      if (input.currency && input.currency !== savedCurrency) {
        const amount = parseFloat(budget.replace(',', '.'));
        if (Number.isFinite(amount)) {
          setBudget(budgetText(toEur(amount, savedCurrency), input.currency));
        }
      }
      void utils.preferences.get.invalidate();
      // A unit change also moves the gym's kg/lb (one preference, P2-6).
      void utils.gym.invalidate();
    },
  });
  const targetsMutation = trpc.preferences.updateTargets.useMutation({
    meta: { silent: true },
    onSuccess: () => void utils.preferences.get.invalidate(),
  });
  const goalBodyMutation = trpc.preferences.saveProfileBasics.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      void utils.preferences.get.invalidate();
      void utils.dashboard.invalidate();
      // UX-ACC-21: "Your targets" on this same screen showed the old number
      // until the next visit — the goal and body drive the suggested target.
      void utils.targets.invalidate();
    },
  });

  // Bug B-38: "Saved ✓" used to stick on every Preferences save button
  // regardless of edits made after the save. Each snapshot below is captured
  // the moment its mutation's `isSuccess` turns true, so a later edit is
  // compared against exactly what was actually persisted. Gated on
  // `safetyLoaded` too: the hydration effect above sets safety/units/
  // currency/budget from the server on the SAME first commit, and without
  // this gate the snapshot could be captured from the pre-hydration default
  // state a beat too early.
  const [savedSafety, setSavedSafety] = useState<SafetyValue | null>(null);
  useEffect(() => {
    if (safetyMutation.isSuccess && safetyLoaded) setSavedSafety(safety);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safetyMutation.isSuccess, safetyLoaded]);
  const safetyDirty =
    safetyTermPending ||
    (savedSafety !== null && JSON.stringify(savedSafety) !== JSON.stringify(safety));

  const [savedDisplay, setSavedDisplay] = useState<{
    units: 'METRIC' | 'IMPERIAL';
    currency: DisplayCurrency;
  } | null>(null);
  useEffect(() => {
    if (displayMutation.isSuccess && safetyLoaded) setSavedDisplay({ units, currency });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayMutation.isSuccess, safetyLoaded]);
  const displayDirty =
    savedDisplay !== null && (savedDisplay.units !== units || savedDisplay.currency !== currency);

  const [savedBudget, setSavedBudget] = useState<string | null>(null);
  useEffect(() => {
    if (targetsMutation.isSuccess && safetyLoaded) setSavedBudget(budget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetsMutation.isSuccess, safetyLoaded]);
  const budgetDirty = savedBudget !== null && savedBudget !== budget;

  const saveSafety = () => {
    // null = a typed term still needs a Keep/Remove choice: don't save yet.
    const toSave = safetyPickerRef.current ? safetyPickerRef.current.flush() : safety;
    if (toSave === null) return;
    setSafetyDeclined(false);
    requestHealthConsent(() => safetyMutation.mutate(toSave), {
      // Clearing every list stores nothing health-related — no consent needed.
      hasHealthData:
        toSave.allergies.length +
          toSave.dietaryRestrictions.length +
          toSave.dislikedIngredients.length >
        0,
      // "Don't save it": nothing health-related is stored; say what that means.
      onDeclined: () => setSafetyDeclined(true),
    });
  };

  const saveDisplay = () => displayMutation.mutate({ preferredUnits: units, currency });

  // UX-ACC-23: blank removes the budget; anything else must be a real amount
  // within the cap — "abc" no longer erases it and 5000 is no longer stored as 2000.
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const saveBudget = () => {
    const parsed = parseWeeklyBudget(budget, savedCurrency);
    if (parsed.kind === 'error') {
      setBudgetError(parsed.message);
      return;
    }
    setBudgetError(null);
    targetsMutation.mutate({ weeklyBudgetEur: parsed.kind === 'ok' ? parsed.eur : null });
  };

  const saveGoalBody = (payload: GoalBodySavePayload) => goalBodyMutation.mutate(payload);

  const currentTargetPill = isPremium === true && data?.chefProfile?.dailyCalorieTarget != null && (
    <View className="self-start rounded-full bg-brand-tint px-3 py-1.5">
      <Text className="text-subhead font-semibold text-brand">
        {formatKcal(data.chefProfile.dailyCalorieTarget)} kcal / day — current target
      </Text>
    </View>
  );

  // Goal & body — every tier (dogfood feedback #6)
  const goalBodySection = (
    <SectionAnchor id="goal-body">
      <GoalBodyCard
        initial={{
          goal: (data?.chefProfile?.goal as Goal | null) ?? null,
          biologicalSex: (data?.chefProfile?.biologicalSex as BiologicalSex | null) ?? null,
          age: data?.chefProfile?.age ?? null,
          heightCm: data?.chefProfile?.heightCm ?? null,
          weightKg: data?.chefProfile?.weightKg ?? null,
          activityLevel: (data?.chefProfile?.activityLevel as ActivityLevel | null) ?? null,
        }}
        units={data?.chefProfile?.preferredUnits ?? 'METRIC'}
        onSave={saveGoalBody}
        isSaving={goalBodyMutation.isPending}
        isSaved={goalBodyMutation.isSuccess}
        errorMessage={
          goalBodyMutation.error ? userFacingErrorMessage(goalBodyMutation.error) : undefined
        }
      />
    </SectionAnchor>
  );

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="bg-canvas px-0">
      {shellV2 ? (
        <PreferencesHeaderV2 title={title} />
      ) : (
        // The old shell: the same chevron Back + title1 header (plain back, no You fallback).
        <View className="min-h-11 flex-row items-center gap-1 px-4 py-2">
          <IconButton
            accessibilityLabel="Back"
            icon={<Icon name="chevronBack" color={colors.brand} size={26} />}
            onPress={() => router.back()}
            className="-ml-2"
          />
          <Text
            testID="preferences-title"
            accessibilityRole="header"
            className="min-w-0 flex-1 text-title1 font-bold text-label"
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>
      )}

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : isError && !data ? (
        // Never show an empty form over data we couldn't load — saving it
        // wrote empty allergy lists over the real ones (F-ONB-2-1).
        <ErrorState
          title="Couldn't load your preferences"
          description="Nothing has been changed. Check your connection and try again."
          icon={<Ionicons name="cloud-offline-outline" size={40} color={colors.labelTertiary} />}
          onRetry={() => void refetch()}
        />
      ) : (
        // UX-X-05: keyboard-aware, so the budget field and the Save button under
        // it (and the targets fields) scroll clear of the keyboard.
        <KeyboardAwareScrollView
          testID="preferences-scroll"
          contentContainerClassName="gap-4 px-4 pb-8 pt-2"
        >
          {/* 10 Oct redesign ("Goals & diet"): the goal first, allergies after. */}
          {shellV2 && currentTargetPill}
          {shellV2 && goalBodySection}

          <Text className="text-subhead text-label-secondary">
            Your allergies and dietary restrictions apply to every plan — free or premium.
          </Text>

          {!shellV2 && currentTargetPill}

          {/* T-01.3: one-time free-text migration card */}
          <MigrationCard />

          {/* Safety — free for every account (P1-2) */}
          <SectionAnchor id="safety">
            <BoardCard testID="preferences-safety" className="gap-4">
              <CardTitle>Food safety</CardTitle>
              <SafetyStep
                ref={safetyPickerRef}
                value={safety}
                onChange={setSafety}
                onPendingChange={setSafetyTermPending}
                testIDPrefix="prefs"
              />
              <TrainButton
                testID="prefs-save-safety"
                label={
                  safetyMutation.isSuccess && !safetyDirty ? 'Saved ✓' : 'Save safety preferences'
                }
                loading={safetyMutation.isPending}
                onPress={saveSafety}
              />
              {safetyMutation.isError && (
                <Text className="text-caption text-danger">
                  {userFacingErrorMessage(safetyMutation.error)}
                </Text>
              )}
              {safetyDeclined && <HealthDeclinedNotice testID="prefs-safety-declined" />}
            </BoardCard>
          </SectionAnchor>

          {!shellV2 && goalBodySection}

          {/* §2.11, T-35.3 — Suggested (computed) or My own (never moved
              silently — gym setup, a weigh-in or a goal edit only propose). */}
          <SectionAnchor id="targets">
            <TargetsCard
              numbersSettings={{
                numbersMode: data?.numbersMode,
                // T-04.5: an explicit choice overrides the goal-derived B-31 default.
                showNutritionOnToday:
                  data?.chefProfile?.showNutritionOnToday ?? data?.chefProfile?.goal != null,
              }}
            />
          </SectionAnchor>

          {isPremium === true && (
            <PressableScale
              testID="prefs-open-onboarding"
              accessibilityRole="button"
              onPress={() => router.push('/onboarding')}
              className="min-h-12 flex-row items-center justify-between gap-3 rounded-card border border-separator bg-surface px-4 py-3"
            >
              <Text className="min-w-0 flex-1 text-body text-label">
                Full setup: cuisine, cadence & targets
              </Text>
              <Icon name="chevronRight" size={18} color={colors.labelTertiary} />
            </PressableScale>
          )}

          {/* Every tier since P2-5: free users get a curated Sunday week. */}
          <SectionAnchor id="auto-plan">
            <AutoPlanToggle
              initialEnabled={data?.chefProfile?.autoPlanWeekly ?? true}
              isPremium={isPremium === true}
            />
          </SectionAnchor>
          <SectionAnchor id="weekly-updates">
            <WeeklyUpdatesCard />
          </SectionAnchor>

          {/* Units & currency — free for every account (P2-6, F-DASH-3-2) */}
          <SectionAnchor id="display">
            <BoardCard testID="preferences-display" className="gap-4">
              <CardTitle>Units & currency</CardTitle>
              <View className="gap-2">
                <FieldLabel>Measurement units</FieldLabel>
                <View className="flex-row gap-2">
                  {(['METRIC', 'IMPERIAL'] as const).map((u) => (
                    <Pressable
                      key={u}
                      testID={`prefs-units-${u}`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: units === u }}
                      onPress={() => setUnits(u)}
                      className={cn(
                        'min-h-11 flex-1 items-center justify-center rounded-control border px-2',
                        units === u ? 'border-brand bg-brand' : 'border-separator bg-surface',
                      )}
                    >
                      <Text
                        className={cn(
                          'text-callout font-semibold',
                          units === u ? 'text-brand-on' : 'text-label-secondary',
                        )}
                      >
                        {u === 'METRIC' ? 'Metric (g, kg)' : 'Imperial (oz, lb)'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text className="text-caption text-label-tertiary">
                  Recipes, shopping lists, your body weight and gym loads all use this system.
                </Text>
              </View>
              <View className="gap-2">
                <FieldLabel>Currency</FieldLabel>
                <View className="flex-row flex-wrap gap-2">
                  {DISPLAY_CURRENCIES.map((c) => (
                    <Pressable
                      key={c}
                      testID={`prefs-currency-${c}`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: currency === c }}
                      onPress={() => setCurrency(c)}
                      className={cn(
                        'h-11 min-w-16 items-center justify-center rounded-control border px-3',
                        currency === c ? 'border-brand bg-brand' : 'border-separator bg-surface',
                      )}
                    >
                      <Text
                        className={cn(
                          'text-callout font-semibold',
                          currency === c ? 'text-brand-on' : 'text-label-secondary',
                        )}
                      >
                        {c}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text className="text-caption text-label-tertiary">
                  Prices are estimates from typical supermarket prices
                  {currency !== 'EUR' ? ', converted from euros at an approximate rate' : ''}.
                </Text>
              </View>
              <TrainButton
                testID="prefs-save-display"
                label={
                  displayMutation.isSuccess && !displayDirty ? 'Saved ✓' : 'Save units & currency'
                }
                variant="tinted"
                loading={displayMutation.isPending}
                onPress={saveDisplay}
              />
              {displayMutation.isError && (
                <Text className="text-caption text-danger">
                  {userFacingErrorMessage(displayMutation.error)}
                </Text>
              )}
            </BoardCard>
          </SectionAnchor>

          {/* Weekly budget — premium, saved via updateTargets (stored in EUR).
              B-10 (T-00.13): on free, the field is READ-ONLY — it used to
              stay editable while the Save button was hidden, so anything
              typed there was silently dropped on navigation. */}
          <SectionAnchor id="budget">
            <BoardCard className="gap-4">
              <CardTitle>Weekly budget</CardTitle>
              <View className="gap-2">
                <FieldLabel>
                  {`Weekly ingredient budget (${currencySymbol(savedCurrency)}, optional)`}
                </FieldLabel>
                <Input
                  testID="prefs-budget"
                  {...budgetNumeric.bind(0)}
                  accessibilityLabel="Weekly ingredient budget"
                  value={budget}
                  onChangeText={
                    isPremium === true
                      ? (text) => {
                          setBudget(text);
                          setBudgetError(null);
                        }
                      : undefined
                  }
                  editable={isPremium === true}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 60"
                  className={cn(isPremium === false && 'bg-surface-sunken text-label-tertiary')}
                />
                {budgetNumeric.bars}
                {budgetError ? (
                  <Text
                    testID="prefs-budget-error"
                    accessibilityRole="alert"
                    className="text-caption text-danger"
                  >
                    {budgetError}
                  </Text>
                ) : (
                  <Text testID="prefs-budget-cap" className="text-caption text-label-tertiary">
                    {weeklyBudgetCapLabel(savedCurrency)}. Leave empty for no budget.
                  </Text>
                )}
              </View>
              {isPremium === false ? (
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="lock-closed" size={14} color={colors.labelTertiary} />
                  <Text className="min-w-0 flex-1 text-caption text-label-secondary">
                    Saving a weekly budget is part of Premium.
                  </Text>
                  <Pressable
                    testID="prefs-budget-premium"
                    accessibilityRole="button"
                    onPress={() => openPremium('budget')}
                    className="min-h-11 justify-center"
                  >
                    <Text className="text-subhead font-semibold text-brand">
                      See what Premium adds
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <TrainButton
                  testID="prefs-save-extras"
                  label={targetsMutation.isSuccess && !budgetDirty ? 'Saved ✓' : 'Save budget'}
                  variant="tinted"
                  loading={targetsMutation.isPending}
                  onPress={saveBudget}
                />
              )}
              {targetsMutation.isError && (
                <Text className="text-caption text-danger">
                  {userFacingErrorMessage(targetsMutation.error)}
                </Text>
              )}
            </BoardCard>
          </SectionAnchor>
        </KeyboardAwareScrollView>
      )}
      {healthConsentSheet}
    </Screen>
  );
}
