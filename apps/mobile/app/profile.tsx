import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { PLAN_FEATURES } from '@chefer/types';
import {
  Button,
  Card,
  ConfirmSheet,
  PressableScale,
  Screen,
  Text,
  useSnackbar,
} from '@chefer/ui-mobile';
import { cn, downgradeLosses, PREMIUM_PITCH_COPY } from '@chefer/utils';
import { openPremium } from '../src/features/premium/open-premium';
import { usePremiumPitch } from '../src/features/premium/use-premium-pitch';
import { PrivacySection } from '../src/features/privacy/privacy-section';
import { track } from '../src/lib/analytics';
import { trpc } from '../src/lib/trpc';

// Profile — port of apps/web (dashboard)/profile/page.tsx (M2-8). Same
// PW-2 semantics: upgrade/downgrade flip planTier directly (no payment);
// Stripe would replace only how the flag is set (P2-1).
//
// T-10.3 (UX-10 §3–4): the "Go Premium" card is now "Plan & Premium" — what
// the plan is and includes, a job-led premium sheet (`openPremium('profile')`,
// which carries the included-at-no-cost terms; no price and no checkout on any
// platform, delta rule 2), and a downgrade that says what you keep and what
// you lose before it acts. "Daily AI allowances" sit under it and count only
// what the server reserves (T-10.8, Q-18, Q-19).

function StatRow({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(Math.round((used / limit) * 100), 100) : 0;
  return (
    <View className="mt-3">
      <View className="mb-1 flex-row justify-between">
        <Text className="text-xs font-medium text-gray-700">{label}</Text>
        <Text className="text-xs text-gray-500">
          {used}
          {limit !== null ? ` / ${limit}` : ' · unlimited'}
        </Text>
      </View>
      {limit !== null && (
        <View className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <View
            className={cn('h-full rounded-full', pct >= 100 ? 'bg-red-400' : 'bg-primary')}
            style={{ width: `${pct}%` }}
          />
        </View>
      )}
    </View>
  );
}

/**
 * One tap from Profile to the household (backlog P2-3, PM review §5) — it
 * used to be reachable only from More.
 */
function HouseholdRow() {
  const { data: members = [] } = trpc.household.list.useQuery(undefined, { staleTime: 60_000 });
  const summary =
    members.length === 0
      ? 'Just you — add the people you cook for'
      : `${members.length + 1} at the table: you, ${members.map((m) => m.name).join(', ')}`;
  return (
    <PressableScale
      pressScale="card"
      testID="profile-household"
      accessibilityRole="button"
      accessibilityLabel="Your household"
      onPress={() => router.push('/household')}
      className="min-h-11 flex-row items-center gap-3 rounded-xl border border-border bg-card p-4"
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-accent">
        <Ionicons name="people-outline" size={20} color="#944a00" />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="font-semibold text-gray-900">Your household</Text>
        {/* T-21.13: no numberOfLines cap — a household of several names (or
            the same names at a large Dynamic Type size) needs more than one
            line; the row's min-h-11 is a floor, not a fixed height, so it
            grows to fit instead of clipping the names. */}
        <Text variant="muted" className="text-sm">
          {summary}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
    </PressableScale>
  );
}

export default function ProfileScreen() {
  const { data: user } = trpc.user.me.useQuery();
  const { data: usage, isLoading } = trpc.profile.getAiUsage.useQuery();
  const utils = trpc.useUtils();

  const invalidateUser = () => {
    void utils.user.me.invalidate();
    void utils.auth.me.invalidate();
  };
  const snackbar = useSnackbar();
  const [confirmingDowngrade, setConfirmingDowngrade] = useState(false);
  const downgradeMutation = trpc.user.downgradePlan.useMutation({
    onSuccess: () => {
      track('downgrade_completed', {});
      invalidateUser();
      setConfirmingDowngrade(false);
      snackbar.show({ message: PREMIUM_PITCH_COPY.downgradeDone, tone: 'success' });
    },
  });
  const { data: members = [] } = trpc.household.list.useQuery(undefined, { staleTime: 60_000 });
  const pitch = usePremiumPitch('profile');

  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`
    : (user?.name ?? user?.email ?? '—');
  const isPremiumTier = user?.planTier === 'PREMIUM';

  // "You'll lose:" names only the Premium jobs this user has used (T-10.3);
  // their plans, recipes, ratings, logs and workouts are never on it.
  const losses = downgradeLosses({
    members: members.length,
    aiMealPlans: usage?.aiMealPlans ?? 0,
    imports: usage?.today.RECIPE_IMPORT ?? 0,
    chatMessages: usage?.today.CHAT ?? 0,
    scans: usage?.today.SCAN ?? 0,
  });
  const downgradeBody = [
    PREMIUM_PITCH_COPY.downgradeKeep,
    ...(losses.length > 0
      ? ['', PREMIUM_PITCH_COPY.downgradeLose, ...losses.map((line) => `• ${line}`)]
      : []),
  ].join('\n');

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="px-0">
      <View className="flex-row items-center gap-3 px-4 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="arrow-back" size={20} color="#1f2937" />
        </Pressable>
        <Text testID="profile-title" variant="title">
          Profile
        </Text>
      </View>

      <ScrollView contentContainerClassName="gap-4 px-4 pb-8">
        {/* User card */}
        <Card testID="profile-user-card" className="flex-row items-center gap-4">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-accent">
            <Text className="text-2xl font-bold text-primary">
              {displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View className="min-w-0 flex-1">
            <Text className="font-semibold text-gray-900">{displayName}</Text>
            <Text numberOfLines={1} variant="muted" className="text-sm">
              {user?.email}
            </Text>
            <View className="mt-1 flex-row gap-1.5">
              {/* R-15: "USER" means nothing to a person; staff roles only. */}
              {user && (user.role === 'ADMIN' || user.role === 'MODERATOR') ? (
                <View testID="profile-role-badge" className="rounded-full bg-gray-100 px-2 py-0.5">
                  <Text className="text-xs font-medium uppercase text-gray-500">{user.role}</Text>
                </View>
              ) : null}
              <View
                className={cn(
                  'rounded-full px-2 py-0.5',
                  isPremiumTier ? 'bg-amber-500' : 'bg-gray-100',
                )}
              >
                <Text
                  className={cn(
                    'text-xs font-medium uppercase',
                    isPremiumTier ? 'text-white' : 'text-gray-500',
                  )}
                >
                  {isPremiumTier ? 'Premium' : 'Free plan'}
                </Text>
              </View>
            </View>
          </View>
        </Card>

        <HouseholdRow />

        {/* Plan & Premium (T-10.3). Admins have Premium access without a plan card. */}
        {user && user.role !== 'ADMIN' && (
          <Card
            testID="profile-plan"
            className={cn(!isPremiumTier && 'border-primary/20 bg-accent')}
          >
            <Text testID="profile-plan-title" className="font-semibold text-primary">
              {isPremiumTier
                ? PREMIUM_PITCH_COPY.planPremiumTitle
                : PREMIUM_PITCH_COPY.planFreeTitle}
            </Text>
            {isPremiumTier ? (
              <>
                <Text className="mt-0.5 text-xs font-semibold uppercase tracking-widest text-primary/80">
                  {PREMIUM_PITCH_COPY.planPremiumNote}
                </Text>
                <Text className="mt-3 text-xs font-semibold text-gray-700">
                  {PREMIUM_PITCH_COPY.planWhatYouHave}
                </Text>
                <View testID="profile-plan-have" className="mt-1 gap-1">
                  {[...pitch.bullets, ...pitch.alsoIncluded].map((line) => (
                    <View key={line} className="flex-row items-start gap-2">
                      <Ionicons name="checkmark" size={14} color="#944a00" />
                      <Text className="min-w-0 flex-1 text-xs text-gray-700">{line}</Text>
                    </View>
                  ))}
                </View>
                <Button
                  testID="profile-downgrade"
                  variant="ghost"
                  className="mt-2 self-start"
                  onPress={() => setConfirmingDowngrade(true)}
                >
                  <Text variant="muted" className="text-xs">
                    {PREMIUM_PITCH_COPY.switchBackToFree}
                  </Text>
                </Button>
              </>
            ) : (
              <>
                <Text className="mb-3 mt-1 text-xs text-primary/80">
                  {PREMIUM_PITCH_COPY.planFreeBody}
                </Text>
                <Button testID="profile-upgrade" onPress={() => openPremium('profile')}>
                  {PREMIUM_PITCH_COPY.seeWhatPremiumAdds}
                </Button>
              </>
            )}
          </Card>
        )}

        {/* Daily AI allowances — product quotas only (vendor telemetry is admin-only).
            Counts what the server reserves: a plan from our recipes uses no AI, a
            premium plan is ONE AI reservation, an import counts when it is read
            (saving is free) — T-10.8, Q-18, Q-19. */}
        {isLoading ? (
          <ActivityIndicator color="#944a00" />
        ) : usage && user && user.role !== 'ADMIN' ? (
          <Card testID="profile-usage">
            <Text variant="heading">{PREMIUM_PITCH_COPY.allowancesTitle}</Text>
            <Text variant="muted" className="text-xs">
              Allowances reset at midnight UTC.
            </Text>
            {(() => {
              const tier = isPremiumTier ? 'premium' : 'free';
              // false = no access on this tier → 0, and the row is hidden below
              // (it used to render "0 / unlimited" — audit F-PROF-1-2).
              const lim = (key: keyof typeof PLAN_FEATURES): number | null => {
                const access = PLAN_FEATURES[key][tier];
                if (access === false) return 0;
                return typeof access === 'number' ? access : null;
              };
              const rows = [
                // Free: the daily cap counts plans from our recipes (no AI).
                // Premium: the AI plans are the ones that count; recipe-built
                // ones (Plan this day) show only once used.
                ...(isPremiumTier
                  ? [
                      {
                        label: 'AI meal plans',
                        used: usage.aiMealPlans,
                        limit: lim('planGenerationsPerDay'),
                      },
                      ...(usage.curatedPlans > 0
                        ? [
                            {
                              label: 'Plans from our recipes',
                              used: usage.curatedPlans,
                              limit: lim('planGenerationsPerDay'),
                            },
                          ]
                        : []),
                    ]
                  : [
                      {
                        label: 'Plans from our recipes',
                        used: usage.curatedPlans,
                        limit: lim('planGenerationsPerDay'),
                      },
                    ]),
                {
                  label: 'Chat messages',
                  used: usage.today.CHAT,
                  limit: lim('chatMessagesPerDay'),
                },
                {
                  label: 'Recipe imports read',
                  used: usage.today.RECIPE_IMPORT,
                  limit: lim('recipeImportsPerDay'),
                },
                {
                  label: 'Meal photo scans',
                  used: usage.today.SCAN,
                  limit: lim('mealScansPerDay'),
                },
              ];
              return rows
                .filter((r) => r.limit !== 0)
                .map((r) => (
                  <StatRow key={r.label} label={r.label} used={r.used} limit={r.limit} />
                ));
            })()}
            <Text testID="profile-usage-helper" variant="muted" className="mt-3 text-xs">
              {isPremiumTier
                ? 'Plans from our recipes use no AI. An import counts when we read it; saving it is free'
                : 'Plans from our recipes use no AI, and free accounts can build a few a day'}
              {isPremiumTier && usage.importsSaved > 0
                ? ` (${usage.importsSaved} saved today).`
                : '.'}
            </Text>
          </Card>
        ) : null}
        {/* T-39.4: AI & your data, Usage analytics, Consent history, Gym
            settings, Download my data / Delete account — all in one section. */}
        <PrivacySection />
      </ScrollView>
      <ConfirmSheet
        testID="downgrade-confirm"
        visible={confirmingDowngrade}
        onClose={() => setConfirmingDowngrade(false)}
        title={PREMIUM_PITCH_COPY.downgradeTitle}
        body={downgradeBody}
        confirmLabel={PREMIUM_PITCH_COPY.downgradeConfirm}
        cancelLabel={PREMIUM_PITCH_COPY.downgradeCancel}
        destructive
        onConfirm={() => downgradeMutation.mutate()}
      />
    </Screen>
  );
}
