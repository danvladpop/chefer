'use client';

import { useRef, useState } from 'react';

// ─── Diet type options ────────────────────────────────────────────────────────

const DIET_OPTIONS: { value: string; label: string; icon: string }[] = [
  { value: 'Omnivore', label: 'Omnivore', icon: '🍖' },
  { value: 'Vegetarian', label: 'Vegetarian', icon: '🥦' },
  { value: 'Vegan', label: 'Vegan', icon: '🌱' },
  { value: 'Pescatarian', label: 'Pescatarian', icon: '🐟' },
  { value: 'Keto', label: 'Keto', icon: '🥑' },
  { value: 'Paleo', label: 'Paleo', icon: '🍗' },
  { value: 'Gluten-Free', label: 'Gluten-Free', icon: '🌾' },
  { value: 'Dairy-Free', label: 'Dairy-Free', icon: '🥛' },
];

// ─── Preset disliked ingredients ─────────────────────────────────────────────

const PRESET_DISLIKES: string[] = [
  'Onions',
  'Mushrooms',
  'Cilantro',
  'Bell peppers',
  'Olives',
  'Anchovies',
  'Blue cheese',
  'Liver',
  'Brussels sprouts',
  'Eggplant',
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StepDietValues {
  dietaryRestrictions: string[];
  allergies: string[];
  dislikedIngredients: string[];
}

interface StepDietProps {
  value: StepDietValues;
  onChange: (value: StepDietValues) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StepDiet({ value, onChange }: StepDietProps) {
  const [allergyInput, setAllergyInput] = useState('');
  const [dislikeInput, setDislikeInput] = useState('');
  const allergyRef = useRef<HTMLInputElement>(null);

  // ── Diet type toggles ──────────────────────────────────────────────────────

  function toggleDiet(diet: string) {
    const next = value.dietaryRestrictions.includes(diet)
      ? value.dietaryRestrictions.filter((d) => d !== diet)
      : [...value.dietaryRestrictions, diet];
    onChange({ ...value, dietaryRestrictions: next });
  }

  // ── Allergy chips ──────────────────────────────────────────────────────────

  function commitAllergyInput(raw: string) {
    const trimmed = raw.trim().replace(/,$/, '').trim();
    if (!trimmed) return;
    if (!value.allergies.includes(trimmed)) {
      onChange({ ...value, allergies: [...value.allergies, trimmed] });
    }
    setAllergyInput('');
  }

  function handleAllergyKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitAllergyInput(allergyInput);
    } else if (e.key === 'Backspace' && allergyInput === '' && value.allergies.length > 0) {
      onChange({ ...value, allergies: value.allergies.slice(0, -1) });
    }
  }

  function handleAllergyChange(raw: string) {
    // Auto-commit when user types a comma
    if (raw.endsWith(',')) {
      commitAllergyInput(raw);
    } else {
      setAllergyInput(raw);
    }
  }

  function removeAllergy(item: string) {
    onChange({ ...value, allergies: value.allergies.filter((a) => a !== item) });
  }

  // ── Disliked ingredients ───────────────────────────────────────────────────

  function toggleDislike(ingredient: string) {
    const next = value.dislikedIngredients.includes(ingredient)
      ? value.dislikedIngredients.filter((d) => d !== ingredient)
      : [...value.dislikedIngredients, ingredient];
    onChange({ ...value, dislikedIngredients: next });
  }

  function addCustomDislike() {
    const trimmed = dislikeInput.trim();
    if (!trimmed) return;
    if (!value.dislikedIngredients.includes(trimmed)) {
      onChange({ ...value, dislikedIngredients: [...value.dislikedIngredients, trimmed] });
    }
    setDislikeInput('');
  }

  function handleDislikeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustomDislike();
    }
  }

  function removeDislike(ingredient: string) {
    onChange({
      ...value,
      dislikedIngredients: value.dislikedIngredients.filter((d) => d !== ingredient),
    });
  }

  // ── Shared styles ──────────────────────────────────────────────────────────

  const inputCls =
    'flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

  return (
    <div className="space-y-8">
      {/* Heading */}
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Diet & restrictions</h1>
        <p className="mt-2 text-muted-foreground">
          All fields are optional — skip anything that doesn&apos;t apply.
        </p>
      </div>

      <div className="space-y-8">
        {/* Diet type */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Diet type</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DIET_OPTIONS.map(({ value: v, label, icon }) => {
              const selected = value.dietaryRestrictions.includes(v);
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => toggleDiet(v)}
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

        {/* Allergies */}
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">Allergies</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Type an allergy and press Enter or comma to add it.
            </p>
          </div>

          {/* Chip container */}
          <div
            className="flex min-h-[2.5rem] flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
            onClick={() => allergyRef.current?.focus()}
          >
            {value.allergies.map((allergy) => (
              <span
                key={allergy}
                className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-sm font-medium text-primary"
              >
                {allergy}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeAllergy(allergy);
                  }}
                  aria-label={`Remove ${allergy}`}
                  className="rounded-full hover:text-primary/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              ref={allergyRef}
              type="text"
              placeholder={value.allergies.length === 0 ? 'e.g. peanuts, shellfish…' : ''}
              value={allergyInput}
              onChange={(e) => handleAllergyChange(e.target.value)}
              onKeyDown={handleAllergyKeyDown}
              onBlur={() => commitAllergyInput(allergyInput)}
              className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Disliked ingredients */}
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">Ingredients you dislike</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Select from the list or add your own.
            </p>
          </div>

          {/* Preset grid */}
          <div className="flex flex-wrap gap-2">
            {PRESET_DISLIKES.map((ingredient) => {
              const selected = value.dislikedIngredients.includes(ingredient);
              return (
                <button
                  key={ingredient}
                  type="button"
                  onClick={() => toggleDislike(ingredient)}
                  aria-pressed={selected}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    selected
                      ? 'border-primary bg-primary/5 font-medium text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  }`}
                >
                  {ingredient}
                </button>
              );
            })}
          </div>

          {/* Custom additions */}
          {value.dislikedIngredients.filter((d) => !PRESET_DISLIKES.includes(d)).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {value.dislikedIngredients
                .filter((d) => !PRESET_DISLIKES.includes(d))
                .map((ingredient) => (
                  <span
                    key={ingredient}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/5 px-3 py-1 text-sm font-medium text-primary"
                  >
                    {ingredient}
                    <button
                      type="button"
                      onClick={() => removeDislike(ingredient)}
                      aria-label={`Remove ${ingredient}`}
                      className="rounded-full hover:text-primary/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      ×
                    </button>
                  </span>
                ))}
            </div>
          )}

          {/* Free-text add */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Add another ingredient…"
              value={dislikeInput}
              onChange={(e) => setDislikeInput(e.target.value)}
              onKeyDown={handleDislikeKeyDown}
              className={`${inputCls} flex-1`}
            />
            <button
              type="button"
              onClick={addCustomDislike}
              disabled={!dislikeInput.trim()}
              className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
