'use client';

import { DowngradeButton, UpgradeCard } from '@/features/premium/components/UpgradeButton';
import { AccountDataCard } from '@/features/profile/components/AccountDataCard';
import { trpc } from '@/lib/trpc';
import { PLAN_FEATURES } from '@chefer/types';

// ─── Usage bar ────────────────────────────────────────────────────────────────

function UsageBar({ used, limit }: { used: number; limit: number | null }) {
  const pct = limit ? Math.min((used / limit) * 100, 100) : 0;
  const colour = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-400' : 'bg-emerald-500';

  return (
    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
      {limit ? (
        <div
          className={`h-full rounded-full transition-all ${colour}`}
          style={{ width: `${pct}%` }}
        />
      ) : (
        // Unlimited — show a full muted bar
        <div className="h-full w-full rounded-full bg-emerald-200" />
      )}
    </div>
  );
}

// ─── Stat row ─────────────────────────────────────────────────────────────────

function StatRow({
  label,
  used,
  limit,
  sublabel,
}: {
  label: string;
  used: number;
  limit: number | null;
  sublabel?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-gray-700">{label}</span>
        <span className="text-sm font-semibold text-gray-900">
          {used}
          {limit ? (
            <span className="font-normal text-gray-500"> / {limit}</span>
          ) : (
            <span className="font-normal text-gray-500"> / ∞</span>
          )}
        </span>
      </div>
      <UsageBar used={used} limit={limit} />
      {sublabel && <p className="mt-0.5 text-xs text-gray-500">{sublabel}</p>}
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────

function Card({
  children,
  title,
  badge,
}: {
  children: React.ReactNode;
  title: string;
  badge?: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="font-semibold text-gray-800">{title}</h2>
        {badge && (
          <span className="rounded-full bg-[#fff3e8] px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-[#944a00]">
            {badge}
          </span>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { data: user } = trpc.user.me.useQuery();
  const { data: usage, isLoading } = trpc.profile.getAiUsage.useQuery();

  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`
    : (user?.name ?? user?.email ?? '—');

  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Account</p>
        <h1 className="font-serif text-2xl font-bold text-gray-900">Profile</h1>
      </div>

      {/* User info */}
      <div className="mb-6 flex items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#fff3e8] text-2xl font-bold text-[#944a00]">
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-gray-900">{displayName}</p>
          <p className="text-sm text-gray-500">{user?.email}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-gray-600">
              {user?.role ?? '…'}
            </span>
            {user && (
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${
                  user.planTier === 'PREMIUM'
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {user.planTier === 'PREMIUM' ? 'Premium' : 'Free plan'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Upgrade CTA for free users (admins are implicitly premium) */}
      {user && user.planTier !== 'PREMIUM' && user.role !== 'ADMIN' && (
        <div className="mb-6">
          <UpgradeCard
            source="profile-page"
            title="Go Premium"
            description="Unlock AI meal plans tailored to your goals, AI-powered swaps, and your personal nutrition profile."
          />
        </div>
      )}

      {/* Self-service downgrade (PW-2) — honest during the free beta */}
      {user?.planTier === 'PREMIUM' && (
        <div className="mb-6 flex justify-end">
          <DowngradeButton />
        </div>
      )}

      {/* AI usage. Users see THEIR daily product quotas; the provider/vendor
          telemetry (Gemini free-tier caps, Pollinations) is admin-only —
          exposing the vendor stack confused users and read as debug UI
          (review 5.3): "500 requests/day" next to "20 plans/day". */}
      {isLoading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-40 rounded-2xl bg-gray-100" />
          <div className="h-32 rounded-2xl bg-gray-100" />
        </div>
      ) : usage && user && user.role !== 'ADMIN' ? (
        <div className="space-y-4">
          <Card
            title="Today's AI usage"
            badge={user.planTier === 'PREMIUM' ? 'Premium' : 'Free plan'}
          >
            <p className="text-xs text-gray-500">
              Daily allowances reset at midnight. Upgrading raises every limit.
            </p>
            {(() => {
              const tier = user.planTier === 'PREMIUM' ? 'premium' : 'free';
              // false = no access on this tier → 0, and the row is hidden below.
              // It used to map to null and render "0 / ∞" (audit F-PROF-1-2).
              const lim = (key: keyof typeof PLAN_FEATURES): number | null => {
                const access = PLAN_FEATURES[key][tier];
                if (access === false) return 0;
                return typeof access === 'number' ? access : null;
              };
              const rows: { label: string; used: number; limit: number | null }[] = [
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
        </div>
      ) : usage ? (
        <div className="space-y-4">
          {/* Gemini */}
          <Card title="Gemini AI" badge="Recipe generation">
            <p className="text-xs text-gray-500">
              Used for meal plan generation, recipe swaps, and shopping lists. Free tier:{' '}
              <strong>{usage.limits.gemini.requestsPerDay} requests/day</strong>,{' '}
              {usage.limits.gemini.requestsPerMinute} req/min.
            </p>
            <StatRow
              label="Total requests today"
              used={usage.geminiTotal}
              limit={usage.limits.gemini.requestsPerDay}
            />
            <div className="grid grid-cols-3 gap-3 border-t pt-3">
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">{usage.today.MEAL_PLAN}</p>
                <p className="text-xs text-gray-500">Meal plans</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">{usage.today.RECIPE_SWAP}</p>
                <p className="text-xs text-gray-500">Swaps</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">{usage.today.SHOPPING_LIST}</p>
                <p className="text-xs text-gray-500">Shopping lists</p>
              </div>
            </div>
          </Card>

          {/* Pollinations */}
          <Card title="Pollinations.ai" badge="Image generation">
            <p className="text-xs text-gray-500">
              Used for AI recipe images. Free, open service — no account or API key required.
            </p>
            <StatRow
              label="Images generated today"
              used={usage.today.IMAGE_GENERATION}
              limit={null}
              sublabel="No daily limit enforced"
            />
          </Card>

          <p className="text-center text-xs text-gray-500">
            Usage resets at midnight · Limits are approximate and may change
          </p>
        </div>
      ) : null}

      <div className="mt-4">
        <AccountDataCard />
      </div>
    </div>
  );
}
