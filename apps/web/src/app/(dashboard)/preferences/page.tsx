import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { AutoPlanToggle } from '@/features/preferences/components/auto-plan-toggle';
import { PreferencesForm } from '@/features/preferences/components/preferences-form';
import {
  WeeklyEmailToggles,
  type WeeklyEmailPreferences,
} from '@/features/preferences/components/weekly-email-toggles';
import type { ChefProfileData, DietaryPreferencesData } from '@/features/preferences/types';
import { createServerClient } from '@/lib/trpc-server';
import { Users } from 'lucide-react';
import { ErrorState } from '@chefer/ui';

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
  let autoPlanWeekly = true;
  let emailPrefs: WeeklyEmailPreferences | null = null;
  let loadFailed = false;

  try {
    const headerStore = await headers();
    const cookieHeader = headerStore.get('cookie') ?? '';
    const client = createServerClient(cookieHeader);

    const me = await client.user.me.query();
    isPremium = me.planTier === 'PREMIUM' || me.role === 'ADMIN';

    const result = await client.preferences.get.query();

    // Weekly emails (P2-5) — optional: a failure here hides the section
    // instead of failing the whole page.
    emailPrefs = await client.notifications.getEmailPreferences.query().catch(() => null);

    if (result.chefProfile) {
      autoPlanWeekly = result.chefProfile.autoPlanWeekly;
      chefProfile = {
        goal: result.chefProfile.goal,
        biologicalSex: result.chefProfile.biologicalSex,
        age: result.chefProfile.age,
        heightCm: result.chefProfile.heightCm,
        weightKg: result.chefProfile.weightKg,
        activityLevel: result.chefProfile.activityLevel,
        dailyCalorieTarget: result.chefProfile.dailyCalorieTarget,
        weeklyBudgetEur: result.chefProfile.weeklyBudgetEur,
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
      };
    }
  } catch {
    // Never render an empty form over data we couldn't load: saving it wrote
    // empty allergy lists over the real ones (audit F-ONB-2-1).
    loadFailed = true;
  }

  if (loadFailed) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
        <ErrorState
          title="Couldn't load your preferences"
          message="Nothing has been changed. Check your connection and try again."
          retryHref="/preferences"
        />
      </div>
    );
  }

  // Safety preferences (allergies, restrictions, dislikes) are free (P1-2);
  // the form itself locks the premium-only target sections.
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Preferences</h1>
        <p className="mt-1 text-muted-foreground">
          {isPremium
            ? 'Update your goals, body metrics, and dietary preferences at any time.'
            : 'Your allergies and dietary restrictions apply to every plan — free or premium.'}
        </p>
        {/* Household is its own entry point, not buried below the diet form
            (P2-3, PM review §5). */}
        <Link
          href="#household"
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          <Users className="h-4 w-4" aria-hidden="true" />
          Who you cook for — your household
        </Link>
        {isPremium && chefProfile?.dailyCalorieTarget && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
            <span className="font-medium text-primary">
              {chefProfile.dailyCalorieTarget.toLocaleString()} kcal / day
            </span>
            <span className="text-muted-foreground">— current target</span>
          </div>
        )}
      </div>

      <PreferencesForm
        chefProfile={chefProfile}
        dietaryPreferences={dietaryPreferences}
        isPremium={isPremium}
      />
      {/* Every tier since P2-5: free users get a curated Sunday week */}
      <AutoPlanToggle initialEnabled={autoPlanWeekly} isPremium={isPremium} />
      {emailPrefs && <WeeklyEmailToggles initial={emailPrefs} />}
    </div>
  );
}
