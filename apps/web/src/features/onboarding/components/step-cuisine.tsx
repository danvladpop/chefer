'use client';

import Link from 'next/link';
import { Users } from 'lucide-react';

// ─── Cuisine options ───────────────────────────────────────────────────────────

const CUISINE_OPTIONS: { value: string; label: string; icon: string }[] = [
  { value: 'Italian', label: 'Italian', icon: '🍝' },
  { value: 'Mexican', label: 'Mexican', icon: '🌮' },
  { value: 'Asian', label: 'Asian', icon: '🍜' },
  { value: 'Mediterranean', label: 'Mediterranean', icon: '🫒' },
  { value: 'American', label: 'American', icon: '🍔' },
  { value: 'Indian', label: 'Indian', icon: '🍛' },
  { value: 'Middle Eastern', label: 'Middle Eastern', icon: '🧆' },
  { value: 'Japanese', label: 'Japanese', icon: '🍱' },
  { value: 'Thai', label: 'Thai', icon: '🌶️' },
  { value: 'Greek', label: 'Greek', icon: '🥙' },
  { value: 'French', label: 'French', icon: '🥐' },
  { value: 'Korean', label: 'Korean', icon: '🥢' },
];

const MEALS_OPTIONS = [2, 3, 4, 5] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StepCuisineValues {
  cuisinePreferences: string[];
  mealsPerDay: number;
}

interface StepCuisineProps {
  value: StepCuisineValues;
  onChange: (value: StepCuisineValues) => void;
  /**
   * Point at the household instead of asking "how many people" — the
   * household is the one people model (P2-3, audit F-PM-8). Off where the
   * household editor is already on screen.
   */
  showHouseholdHint?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StepCuisine({ value, onChange, showHouseholdHint = true }: StepCuisineProps) {
  function toggleCuisine(cuisine: string) {
    const next = value.cuisinePreferences.includes(cuisine)
      ? value.cuisinePreferences.filter((c) => c !== cuisine)
      : [...value.cuisinePreferences, cuisine];
    onChange({ ...value, cuisinePreferences: next });
  }

  const pillCls = (active: boolean) =>
    `inline-flex min-h-11 items-center justify-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
      active
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground'
    }`;

  return (
    <div className="space-y-8">
      {/* Heading */}
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Cuisine & meal cadence</h1>
        <p className="mt-2 text-muted-foreground">
          Tell us what cuisines you love and how you like to eat.
        </p>
      </div>

      <div className="space-y-8">
        {/* Cuisine preferences */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Favourite cuisines</p>
          <p className="text-xs text-muted-foreground">Select all that apply — or skip.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {CUISINE_OPTIONS.map(({ value: v, label, icon }) => {
              const selected = value.cuisinePreferences.includes(v);
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => toggleCuisine(v)}
                  aria-pressed={selected}
                  className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    selected
                      ? 'border-primary bg-primary/5 text-foreground'
                      : 'border-border bg-card text-muted-foreground'
                  }`}
                >
                  <span aria-hidden="true">{icon}</span>
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Meals per day */}
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">Meals per day</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              How many meals do you typically eat?
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {MEALS_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onChange({ ...value, mealsPerDay: n })}
                aria-pressed={value.mealsPerDay === n}
                className={pillCls(value.mealsPerDay === n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Who you cook for lives in the household (P2-3, F-PM-8) */}
        {showHouseholdHint && (
          <p className="flex items-start gap-2 rounded-xl border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-[#944a00]" aria-hidden="true" />
            <span className="min-w-0">
              Cooking for others?{' '}
              <Link
                href="/preferences#household"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Add them to your household
              </Link>{' '}
              — servings and the shopping list follow your table.
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
