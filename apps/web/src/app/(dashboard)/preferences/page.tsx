import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { PreferencesForm } from '@/features/preferences/components/preferences-form';
import type { ChefProfileData, DietaryPreferencesData } from '@/features/preferences/types';
import { UpgradeCard } from '@/features/premium/components/UpgradeButton';
import { createServerClient } from '@/lib/trpc-server';

export const metadata: Metadata = {
  title: 'Preferences',
  description: 'Manage your personal chef preferences',
};

// ─── Preferences Page ─────────────────────────────────────────────────────────
// Server component — fetches ChefProfile + DietaryPreferences via tRPC and
// passes serialisable data down to the client form component.

export default async function PreferencesPage() {
  let chefProfile: ChefProfileData | null = null;
  let dietaryPreferences: DietaryPreferencesData | null = null;
  let isPremium = true; // fail open to the form; mutations are server-gated anyway

  try {
    const headerStore = await headers();
    const cookieHeader = headerStore.get('cookie') ?? '';
    const client = createServerClient(cookieHeader);

    const me = await client.user.me.query();
    isPremium = me.planTier === 'PREMIUM' || me.role === 'ADMIN';

    const result = await client.preferences.get.query();

    if (result.chefProfile) {
      chefProfile = {
        goal: result.chefProfile.goal,
        biologicalSex: result.chefProfile.biologicalSex,
        age: result.chefProfile.age,
        heightCm: result.chefProfile.heightCm,
        weightKg: result.chefProfile.weightKg,
        activityLevel: result.chefProfile.activityLevel,
        dailyCalorieTarget: result.chefProfile.dailyCalorieTarget,
        deliveryAddress: result.chefProfile.deliveryAddress,
        deliveryCurrency: result.chefProfile.deliveryCurrency,
        preferredUnits: result.chefProfile.preferredUnits,
      };
    }

    if (result.dietaryPreferences) {
      dietaryPreferences = {
        cuisinePreferences: result.dietaryPreferences.cuisinePreferences,
        dietaryRestrictions: result.dietaryPreferences.dietaryRestrictions,
        allergies: result.dietaryPreferences.allergies,
        dislikedIngredients: result.dietaryPreferences.dislikedIngredients,
        mealsPerDay: result.dietaryPreferences.mealsPerDay,
        servingSize: result.dietaryPreferences.servingSize,
      };
    }
  } catch {
    // If the API is unreachable, render the empty form — the user can still
    // fill and save. On next reload the data will be re-fetched.
  }

  // Profile personalisation is a premium feature — free users see the upgrade
  // panel instead of the form (the API also enforces this on mutations).
  if (!isPremium) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Preferences</h1>
          <p className="mt-1 text-muted-foreground">
            Personal goals, body metrics and dietary preferences are part of the premium plan.
          </p>
        </div>
        <UpgradeCard
          title="Unlock your personal profile"
          description="Set your goals, body metrics, allergies and dietary preferences, and let the AI chef build meal plans around them. On the free plan you get chef-curated generic recipes instead."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Preferences</h1>
        <p className="mt-1 text-muted-foreground">
          Update your goals, body metrics, and dietary preferences at any time.
        </p>
        {chefProfile?.dailyCalorieTarget && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
            <span className="font-medium text-primary">
              {chefProfile.dailyCalorieTarget.toLocaleString()} kcal / day
            </span>
            <span className="text-muted-foreground">— current target</span>
          </div>
        )}
      </div>

      <PreferencesForm chefProfile={chefProfile} dietaryPreferences={dietaryPreferences} />
    </div>
  );
}
