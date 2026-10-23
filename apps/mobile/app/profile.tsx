import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { PLAN_FEATURES } from '@chefer/types';
import {
  ConfirmSheet,
  ErrorState,
  IconButton,
  KeyboardAwareScrollView,
  PressableScale,
  Screen,
  Text,
  useQueryState,
  useSnackbar,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  cn,
  dailyAllowanceResetTime,
  downgradeLosses,
  PREMIUM_PITCH_COPY,
  tierOf,
  userFacingErrorMessage,
} from '@chefer/utils';
import { Icon } from '../src/components/icon';
import {
  noticeText,
  useHouseholdNotices,
} from '../src/features/household/sharing/household-notices';
import { openPremium } from '../src/features/premium/open-premium';
import { usePremiumPitch } from '../src/features/premium/use-premium-pitch';
import { PrivacySection } from '../src/features/privacy/privacy-section';
import { SignInMethodsCard } from '../src/features/profile/sign-in-methods-card';
import { SectionAnchor, useSectionTitle } from '../src/features/settings/section-anchor';
import { TrainButton } from '../src/features/shell/train/train-button';
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
//
// 11 Oct restyle: the shell's look — canvas, hairline surface cards, named
// text styles and colour roles, and ShellTopBar's brand chevron + title1 top
// bar (drawn here so the title keeps `profile-title`; Back falls back to You).

/** The redesign's card: a surface on the canvas with a hairline border. */
const CARD = 'gap-3 rounded-card border border-separator bg-surface p-4';
/** A small pill (role, plan). */
const PILL = 'rounded-full px-2 text-caption font-semibold';

function StatRow({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(Math.round((used / limit) * 100), 100) : 0;
  return (
    <View className="gap-1">
      <View className="flex-row justify-between gap-3">
        <Text className="min-w-0 flex-1 text-subhead text-label">{label}</Text>
        <Text className="text-subhead text-label-secondary">
          {used}
          {limit !== null ? ` / ${limit}` : ' · unlimited'}
        </Text>
      </View>
      {limit !== null && (
        <View className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
          <View
            className={cn('h-full rounded-full', pct >= 100 ? 'bg-danger' : 'bg-brand')}
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
  const colors = useThemeColors();
  const { data: members = [] } = trpc.household.list.useQuery(undefined, { staleTime: 60_000 });
  // ADR 0002: the newest household notice ("Maria joined your household") under the summary.
  const latestNotice = useHouseholdNotices()[0];
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
      className="min-h-11 flex-row items-center gap-3 rounded-card border border-separator bg-surface p-4"
    >
      <View className="h-11 w-11 items-center justify-center rounded-full bg-brand-tint">
        <Icon name="following" size={22} color={colors.brand} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-headline font-semibold text-label">Your household</Text>
        {/* T-21.13: no numberOfLines cap — a household of several names (or
            the same names at a large Dynamic Type size) needs more than one
            line; the row's min-h-11 is a floor, not a fixed height, so it
            grows to fit instead of clipping the names. */}
        <Text className="text-subhead text-label-secondary">{summary}</Text>
        {latestNotice ? (
          <Text testID="profile-household-notice" className="text-subhead font-semibold text-brand">
            {noticeText(latestNotice)}
          </Text>
        ) : null}
      </View>
      <Icon name="chevronRight" size={18} color={colors.labelTertiary} />
    </PressableScale>
  );
}

export default function ProfileScreen() {
  const colors = useThemeColors();
  // UX-ACC-04: opened from a Settings row (`?section=`), the title is the row's.
  const title = useSectionTitle('Profile');
  const userQuery = trpc.user.me.useQuery();
  const { data: user } = userQuery;
  const { state: userState, retry: retryUser } = useQueryState(userQuery);
  const { data: usage, isLoading } = trpc.profile.getAiUsage.useQuery();
  const utils = trpc.useUtils();

  const invalidateUser = () => {
    void utils.user.me.invalidate();
    void utils.auth.me.invalidate();
  };
  const snackbar = useSnackbar();
  const [confirmingDowngrade, setConfirmingDowngrade] = useState(false);
  const downgradeMutation = trpc.user.downgradePlan.useMutation({
    meta: { silent: true },
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
  const hasPremiumAccess = user ? tierOf(user) !== 'free' : false;

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
    <Screen edges={['top', 'bottom', 'left', 'right']} className="bg-canvas px-0">
      <View className="mx-4 mt-3 min-h-11 flex-row items-center gap-1">
        <IconButton
          testID="profile-back"
          accessibilityLabel="Back"
          icon={<Icon name="chevronBack" color={colors.brand} size={26} />}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/you'))}
          className="-ml-2"
        />
        <Text
          testID="profile-title"
          accessibilityRole="header"
          numberOfLines={1}
          className="min-w-0 flex-1 text-title1 font-bold text-label"
        >
          {title}
        </Text>
      </View>

      {/* Keyboard-aware, so a `?section=` anchor can scroll its card into view. */}
      <KeyboardAwareScrollView contentContainerClassName="gap-4 px-4 pb-8 pt-3">
        {/* UX-X-12: a failed load is not a name of "—" and an empty profile. */}
        {userState === 'error' && (
          <ErrorState
            testID="profile-load-error"
            title="Couldn't load your profile"
            onRetry={retryUser}
          />
        )}

        {/* User card */}
        {userState !== 'error' && (
          <View testID="profile-user-card" className={cn(CARD, 'flex-row items-center gap-4')}>
            <View className="h-14 w-14 items-center justify-center rounded-full bg-brand-tint">
              <Text className="text-title2 font-bold text-brand">
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="text-headline font-semibold text-label">{displayName}</Text>
              <Text numberOfLines={1} className="text-subhead text-label-secondary">
                {user?.email}
              </Text>
              <View className="mt-1 flex-row gap-1.5">
                {/* R-15: "USER" means nothing to a person; staff roles only. */}
                {user && (user.role === 'ADMIN' || user.role === 'MODERATOR') ? (
                  <View testID="profile-role-badge">
                    <Text className={cn(PILL, 'bg-surface-sunken text-label-secondary')}>
                      {user.role}
                    </Text>
                  </View>
                ) : null}
                {/* Same tier as You's tier row: an admin reads Premium, not "Free plan". */}
                <Text
                  testID="profile-tier-badge"
                  className={cn(
                    PILL,
                    hasPremiumAccess ? 'bg-brand text-brand-on' : 'bg-brand-tint text-brand',
                  )}
                >
                  {hasPremiumAccess ? 'Premium' : 'Free plan'}
                </Text>
              </View>
            </View>
          </View>
        )}

        <HouseholdRow />

        {/* Plan & Premium (T-10.3). Admins have Premium access without a plan card. */}
        {user && user.role !== 'ADMIN' && (
          <SectionAnchor id="plan">
            <View testID="profile-plan" className={CARD}>
              <View className="gap-0.5">
                <Text
                  testID="profile-plan-title"
                  accessibilityRole="header"
                  className="text-headline font-semibold text-label"
                >
                  {isPremiumTier
                    ? PREMIUM_PITCH_COPY.planPremiumTitle
                    : PREMIUM_PITCH_COPY.planFreeTitle}
                </Text>
                {isPremiumTier ? (
                  <Text className="text-subhead font-semibold text-brand">
                    {PREMIUM_PITCH_COPY.planPremiumNote}
                  </Text>
                ) : (
                  <Text className="text-subhead text-label-secondary">
                    {PREMIUM_PITCH_COPY.planFreeBody}
                  </Text>
                )}
              </View>
              {isPremiumTier ? (
                <>
                  <View className="gap-1.5">
                    <Text className="text-subhead font-semibold text-label-secondary">
                      {PREMIUM_PITCH_COPY.planWhatYouHave}
                    </Text>
                    <View testID="profile-plan-have" className="gap-1.5">
                      {[...pitch.bullets, ...pitch.alsoIncluded].map((line) => (
                        <View key={line} className="flex-row items-start gap-2">
                          <Icon name="checkmark" size={18} color={colors.brand} />
                          <Text className="min-w-0 flex-1 text-subhead text-label">{line}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <TrainButton
                    testID="profile-downgrade"
                    label={PREMIUM_PITCH_COPY.switchBackToFree}
                    variant="ghost"
                    className="-ml-4 self-start"
                    onPress={() => setConfirmingDowngrade(true)}
                  />
                </>
              ) : (
                <TrainButton
                  testID="profile-upgrade"
                  label={PREMIUM_PITCH_COPY.seeWhatPremiumAdds}
                  onPress={() => openPremium('profile')}
                />
              )}
            </View>
          </SectionAnchor>
        )}

        {/* Daily AI allowances — product quotas only (vendor telemetry is admin-only).
            Counts what the server reserves: a plan from our recipes uses no AI, a
            premium plan is ONE AI reservation, an import counts when it is read
            (saving is free) — T-10.8, Q-18, Q-19. */}
        {isLoading ? (
          <ActivityIndicator color={colors.brand} />
        ) : usage && user && user.role !== 'ADMIN' ? (
          <View testID="profile-usage" className={CARD}>
            <View className="gap-0.5">
              <Text accessibilityRole="header" className="text-headline font-semibold text-label">
                {PREMIUM_PITCH_COPY.allowancesTitle}
              </Text>
              <Text className="text-subhead text-label-secondary">
                Allowances reset at {dailyAllowanceResetTime()} your time.
              </Text>
            </View>
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
            <Text testID="profile-usage-helper" className="text-caption text-label-secondary">
              {isPremiumTier
                ? 'Plans from our recipes use no AI. An import counts when we read it; saving it is free'
                : 'Plans from our recipes use no AI, and free accounts can build a few a day'}
              {isPremiumTier && usage.importsSaved > 0
                ? ` (${usage.importsSaved} saved today).`
                : '.'}
            </Text>
          </View>
        ) : null}
        {/* WP-22: connected Google/Apple accounts (hidden when there is nothing to show). */}
        <SignInMethodsCard />
        {/* T-39.4: AI & your data, Usage analytics, Consent history, Gym
            settings, Download my data / Delete account — all in one section. */}
        <SectionAnchor id="privacy">
          <PrivacySection />
        </SectionAnchor>
      </KeyboardAwareScrollView>
      <ConfirmSheet
        testID="downgrade-confirm"
        visible={confirmingDowngrade}
        onClose={() => {
          setConfirmingDowngrade(false);
          downgradeMutation.reset();
        }}
        title={PREMIUM_PITCH_COPY.downgradeTitle}
        body={downgradeBody}
        confirmLabel={PREMIUM_PITCH_COPY.downgradeConfirm}
        cancelLabel={PREMIUM_PITCH_COPY.downgradeCancel}
        destructive
        busy={downgradeMutation.isPending}
        error={downgradeMutation.isError ? userFacingErrorMessage(downgradeMutation.error) : null}
        onConfirm={() => downgradeMutation.mutate()}
      />
    </Screen>
  );
}
