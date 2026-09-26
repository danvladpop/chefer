import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { PLAN_FEATURES } from '@chefer/types';
import { Button, Card, PressableScale, Screen, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { PostUpgradeSheet } from '../src/features/premium/post-upgrade-sheet';
import { AccountDataCard } from '../src/features/profile/account-data-card';
import { trpc } from '../src/lib/trpc';

// Profile — port of apps/web (dashboard)/profile/page.tsx (M2-8). Same
// PW-2 semantics: upgrade/downgrade flip planTier directly (free beta);
// Stripe replaces only how the flag is set (P2-1). Upsells open this screen
// with `?source=` (e.g. household); a successful upgrade shows the
// source-aware "You're premium" sheet (F-PREM-1-5, F-PM-9).

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
        <Text numberOfLines={1} variant="muted" className="text-sm">
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
  const { source } = useLocalSearchParams<{ source?: string }>();
  const [activationOpen, setActivationOpen] = useState(false);
  const upgradeMutation = trpc.user.upgradePlan.useMutation({
    onSuccess: () => {
      invalidateUser();
      setActivationOpen(true);
    },
  });
  const downgradeMutation = trpc.user.downgradePlan.useMutation({ onSuccess: invalidateUser });

  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`
    : (user?.name ?? user?.email ?? '—');
  const isPremiumTier = user?.planTier === 'PREMIUM';

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
              <View className="rounded-full bg-gray-100 px-2 py-0.5">
                <Text className="text-[12px] font-medium uppercase text-gray-500">
                  {user?.role ?? '…'}
                </Text>
              </View>
              <View
                className={cn(
                  'rounded-full px-2 py-0.5',
                  isPremiumTier ? 'bg-amber-500' : 'bg-gray-100',
                )}
              >
                <Text
                  className={cn(
                    'text-[12px] font-medium uppercase',
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

        {/* Upgrade / downgrade (PW-2 free-beta semantics) */}
        {user && !isPremiumTier && user.role !== 'ADMIN' && (
          <Card className="border-primary/20 bg-accent">
            <Text className="font-semibold text-primary">Go Premium</Text>
            <Text className="mb-3 mt-1 text-xs text-primary/80">
              Unlock AI meal plans tailored to your goals, AI-powered swaps, and your personal
              nutrition profile.
            </Text>
            <Button
              testID="profile-upgrade"
              loading={upgradeMutation.isPending}
              onPress={() => upgradeMutation.mutate()}
            >
              Upgrade — free during beta
            </Button>
          </Card>
        )}
        {user && isPremiumTier && (
          <Button
            testID="profile-downgrade"
            variant="ghost"
            loading={downgradeMutation.isPending}
            onPress={() => downgradeMutation.mutate()}
          >
            <Text variant="muted" className="text-xs">
              Switch back to the free plan
            </Text>
          </Button>
        )}

        {/* AI usage — product quotas only (vendor telemetry is admin-only) */}
        {isLoading ? (
          <ActivityIndicator color="#944a00" />
        ) : usage && user && user.role !== 'ADMIN' ? (
          <Card testID="profile-usage">
            <Text variant="heading">Today&apos;s AI usage</Text>
            <Text variant="muted" className="text-xs">
              Daily allowances reset at midnight. Upgrading raises every limit.
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
                {
                  label: 'Meal plans generated',
                  used: usage.today.MEAL_PLAN,
                  limit: lim('planGenerationsPerDay'),
                },
                {
                  label: 'Chat messages',
                  used: usage.today.CHAT,
                  limit: lim('chatMessagesPerDay'),
                },
                {
                  label: 'Recipe imports',
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
          </Card>
        ) : null}
        <AccountDataCard />
      </ScrollView>
      <PostUpgradeSheet
        visible={activationOpen}
        onClose={() => setActivationOpen(false)}
        source={typeof source === 'string' && source !== '' ? source : null}
      />
    </Screen>
  );
}
