'use client';

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
const SERVING_OPTIONS = [1, 2, 3, 4, 5, 6] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StepCuisineValues {
  cuisinePreferences: string[];
  mealsPerDay: number;
  servingSize: number;
}

interface StepCuisineProps {
  value: StepCuisineValues;
  onChange: (value: StepCuisineValues) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StepCuisine({ value, onChange }: StepCuisineProps) {
  function toggleCuisine(cuisine: string) {
    const next = value.cuisinePreferences.includes(cuisine)
      ? value.cuisinePreferences.filter((c) => c !== cuisine)
      : [...value.cuisinePreferences, cuisine];
    onChange({ ...value, cuisinePreferences: next });
  }

  const pillCls = (active: boolean) =>
    `inline-flex h-9 items-center justify-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
      active
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground'
    }`;

  return (
    <div className="space-y-8">
      {/* Heading */}
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Cuisine & meal cadence</h1>
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
          <div className="flex gap-2">
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

        {/* Serving size */}
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">Serving size</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              How many people are you cooking for?
            </p>
          </div>
          <div className="flex gap-2">
            {SERVING_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onChange({ ...value, servingSize: n })}
                aria-pressed={value.servingSize === n}
                className={pillCls(value.servingSize === n)}
              >
                {n === 6 ? '6+' : n}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {value.servingSize === 1 ? '1 person' : `${value.servingSize} people`}
          </p>
        </div>
      </div>
    </div>
  );
}
