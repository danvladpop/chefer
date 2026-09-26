'use client';

import { useState } from 'react';
import { StepDiet } from '@/features/onboarding/components/step-diet';
import { UpgradeButton } from '@/features/premium/components/UpgradeButton';
import { useEntitlement } from '@/hooks/useEntitlement';
import { useHousehold, type HouseholdMemberDto } from '@/hooks/useHousehold';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { Baby, Pencil, Plus, Sparkles, Trash2, Users } from 'lucide-react';
import { HOUSEHOLD_PORTION_OPTIONS } from '@chefer/types';
import { Sheet } from '@chefer/ui';
import { householdGhostSample, householdPortionSum, type HouseholdGhostKind } from '@chefer/utils';

// ─── "My household" (F2 Feed the Whole Table, backlog P2-3) ───────────────────
// Every tier adds and edits members: their allergies and restrictions filter
// every plan, allergen warning and cook-mode banner — safety is never
// premium. Premium adds SCALING: servings, the shopping list and the week
// cost follow the whole table.
// Free + empty: the §6.4 ghost — the chip tapped decides the sample (the kid
// chip shows a kid at ½ portion with a common allergy, audit F-PM-12), with a
// free "add" and the scaling upsell. Premium + empty: chips open the editor.

const PORTION_LABELS: Record<number, string> = {
  0.5: '½ · kid',
  0.75: '¾ · light',
  1: '1 · standard',
  1.25: '1¼ · hearty',
  1.5: '1½ · big eater',
};

const PORTION_OPTIONS = HOUSEHOLD_PORTION_OPTIONS.map((value) => ({
  value,
  label: PORTION_LABELS[value] ?? String(value),
}));

export interface MemberFormState {
  name: string;
  portionFactor: number;
  isKid: boolean;
  dietaryRestrictions: string[];
  allergies: string[];
  dislikedIngredients: string[];
}

const EMPTY_MEMBER: MemberFormState = {
  name: '',
  portionFactor: 1,
  isKid: false,
  dietaryRestrictions: [],
  allergies: [],
  dislikedIngredients: [],
};

/** Editor presets for the quick chips (the kid starts at ½ portion). */
export const MEMBER_PRESETS: Record<HouseholdGhostKind, Partial<MemberFormState>> = {
  partner: { portionFactor: 1, isKid: false },
  kid: { portionFactor: 0.5, isKid: true },
};

function safetySummary(member: HouseholdMemberDto): string {
  const parts: string[] = [];
  if (member.allergies.length) parts.push(`allergic to ${member.allergies.join(', ')}`);
  if (member.dietaryRestrictions.length) parts.push(member.dietaryRestrictions.join(', '));
  if (member.dislikedIngredients.length) {
    parts.push(`dislikes ${member.dislikedIngredients.join(', ')}`);
  }
  return parts.length ? parts.join(' · ') : 'no restrictions';
}

function portionLabel(factor: number): string {
  return PORTION_LABELS[factor] ?? `×${factor}`;
}

/** Member changes move plan warnings, list sizes and costs — refetch them. */
function useInvalidateHousehold() {
  const utils = trpc.useUtils();
  return () => {
    void utils.household.list.invalidate();
    void utils.preferences.get.invalidate();
    void utils.mealPlan.invalidate();
    void utils.shoppingList.invalidate();
  };
}

// ─── Member editor sheet (every tier) ─────────────────────────────────────────

export function MemberEditorSheet({
  open,
  onClose,
  editing,
  preset,
}: {
  open: boolean;
  onClose: () => void;
  /** null = creating a new member. */
  editing: HouseholdMemberDto | null;
  /** Starting values for a new member (quick chips). */
  preset?: Partial<MemberFormState>;
}) {
  const [form, setForm] = useState<MemberFormState>(
    editing
      ? {
          name: editing.name,
          portionFactor: editing.portionFactor,
          isKid: editing.isKid,
          dietaryRestrictions: editing.dietaryRestrictions,
          allergies: editing.allergies,
          dislikedIngredients: editing.dislikedIngredients,
        }
      : { ...EMPTY_MEMBER, ...preset },
  );
  const invalidate = useInvalidateHousehold();

  const onSaved = () => {
    invalidate();
    onClose();
  };
  const addMutation = trpc.household.add.useMutation({
    onSuccess: () => {
      capture('household_member_added');
      onSaved();
    },
  });
  const updateMutation = trpc.household.update.useMutation({ onSuccess: onSaved });
  const isSaving = addMutation.isPending || updateMutation.isPending;
  const error = addMutation.error ?? updateMutation.error;

  function handleSave() {
    if (!form.name.trim() || isSaving) return;
    const payload = { ...form, name: form.name.trim() };
    if (editing) updateMutation.mutate({ id: editing.id, ...payload });
    else addMutation.mutate(payload);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.name}` : 'Add someone to your table'}
      description="Their allergies and restrictions become hard rules for every plan. Portion size sets how much of each dish is theirs."
      size="lg"
      footer={
        <div className="flex flex-col gap-2">
          {error && <p className="text-sm text-red-600">{error.message}</p>}
          <button
            onClick={handleSave}
            disabled={!form.name.trim() || isSaving}
            className="min-h-11 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : editing ? 'Save changes' : 'Add to my table'}
          </button>
        </div>
      }
    >
      {/* The Sheet body has no padding of its own (audit F-ONB-3-3). */}
      <div className="space-y-6 px-5 pb-4">
        {/* Name */}
        <div>
          <label htmlFor="member-name" className="mb-1 block text-sm font-medium">
            Name
          </label>
          <input
            id="member-name"
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder={form.isKid ? 'e.g. Sam' : 'e.g. Maria'}
            maxLength={60}
            className="min-h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Portion */}
        <div>
          <p id="member-portion-label" className="mb-1 text-sm font-medium">
            Portion size
          </p>
          <p className="mb-2 text-xs text-muted-foreground">
            Relative to one standard serving — a kid eats about half.
          </p>
          <div role="group" aria-labelledby="member-portion-label" className="flex flex-wrap gap-2">
            {PORTION_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, portionFactor: value }))}
                aria-pressed={form.portionFactor === value}
                className={`min-h-11 rounded-xl border px-3 py-1.5 text-sm font-medium transition ${
                  form.portionFactor === value
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-input text-muted-foreground hover:border-primary/40'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Kid toggle — the whole row is the 44px target */}
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            checked={form.isKid}
            onChange={(e) => {
              const isKid = e.target.checked;
              setForm((f) => ({
                ...f,
                isKid,
                // Ticking "kid" on a standard portion is almost always ½.
                portionFactor: isKid && f.portionFactor === 1 ? 0.5 : f.portionFactor,
              }));
            }}
            className="h-5 w-5 accent-[#944a00]"
          />
          This is a kid
        </label>

        {/* Safety — the same editor onboarding uses (per-member) */}
        <div className="rounded-xl border bg-muted/30 p-4">
          <StepDiet
            value={{
              dietaryRestrictions: form.dietaryRestrictions,
              allergies: form.allergies,
              dislikedIngredients: form.dislikedIngredients,
            }}
            onChange={(diet) => setForm((f) => ({ ...f, ...diet }))}
          />
        </div>
      </div>
    </Sheet>
  );
}

// ─── Quick chips ──────────────────────────────────────────────────────────────

const CHIPS: { kind: HouseholdGhostKind; label: string }[] = [
  { kind: 'partner', label: '+ add your partner' },
  { kind: 'kid', label: '+ add a kid' },
];

function QuickChips({
  onPick,
  active = null,
}: {
  onPick: (kind: HouseholdGhostKind) => void;
  active?: HouseholdGhostKind | null;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {CHIPS.map(({ kind, label }) => (
        <button
          key={kind}
          type="button"
          onClick={() => onPick(kind)}
          aria-pressed={active === kind}
          className={`min-h-11 rounded-full border-2 border-dashed px-4 py-1.5 text-sm font-medium transition ${
            active === kind
              ? 'border-amber-400 bg-amber-50 text-amber-900'
              : 'border-amber-300 bg-amber-50/40 text-amber-800 hover:border-amber-400 hover:bg-amber-50'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Free-tier ghost (§6.4, F-PM-12) ──────────────────────────────────────────

const SAMPLE_WEEK: { day: string; dish: string }[] = [
  { day: 'Mon', dish: 'Chickpea & Roast Pepper Tagine' },
  { day: 'Tue', dish: 'Miso Ginger Noodle Stir-fry' },
  { day: 'Wed', dish: 'Charred Broccoli Rice Bowls' },
];

function HouseholdGhost({
  ownerSafety,
  onAdd,
}: {
  ownerSafety: OwnerSafety;
  onAdd: (kind: HouseholdGhostKind) => void;
}) {
  const [kind, setKind] = useState<HouseholdGhostKind | null>(null);

  function reveal(next: HouseholdGhostKind) {
    if (kind === null) {
      // §6.4: the ghost IS the upgrade prompt — one event per reveal.
      capture('upgrade_prompt_shown', { source: 'household' });
      capture('teaser_engaged', { feature: 'household' });
    }
    setKind(next);
  }

  const sample = kind ? householdGhostSample(kind) : null;
  // The demo runs on THEIR data: the user's own diet merged with the sample.
  const mergedChips = sample
    ? [
        ...new Set(
          [
            ...ownerSafety.allergies.map((a) => `no ${a}`),
            ...sample.allergies.map((a) => `no ${a}`),
            ...ownerSafety.dietaryRestrictions,
            ...sample.dietaryRestrictions,
          ].map((c) => c.toLowerCase()),
        ),
      ]
    : [];
  const servings = sample ? householdPortionSum([sample]) : 1;

  return (
    <div>
      <QuickChips onPick={reveal} active={kind} />

      {sample && kind && (
        <div
          data-testid="household-ghost-sample"
          className="mt-4 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4"
        >
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-amber-700">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Sample: your week with{' '}
            {sample.name}
          </p>
          <p className="mt-2 text-sm text-gray-700">
            Say you add <span className="font-semibold">{sample.name}</span> — {sample.summary}.
            Every dinner would be safe for you both:
          </p>
          <ul className="mt-3 space-y-1.5">
            {SAMPLE_WEEK.map(({ day, dish }) => (
              <li key={day} className="flex items-center gap-2 text-sm">
                <span className="w-9 shrink-0 text-xs font-semibold uppercase text-gray-500">
                  {day}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-gray-800">{dish}</span>
                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-600">
                  {servings} servings
                </span>
              </li>
            ))}
          </ul>
          {mergedChips.length > 0 && (
            <p className="mt-3 text-xs text-gray-600">
              Combined table rules: {mergedChips.join(' · ')}
            </p>
          )}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => onAdd(kind)}
              className="flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {kind === 'kid' ? 'Add a kid' : 'Add your partner'} — free
            </button>
            <p className="min-w-0 text-xs text-gray-600">
              Allergies are free. Premium also sizes servings and the shopping list for {servings}{' '}
              portions.
            </p>
          </div>
          <div className="mt-3">
            <UpgradeButton className="px-4 py-2 text-xs" source="household" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

interface OwnerSafety {
  allergies: string[];
  dietaryRestrictions: string[];
}

export function HouseholdSection({
  isPremium,
  ownerSafety,
  variant = 'preferences',
}: {
  isPremium: boolean;
  /** The user's live safety selection — the ghost demo runs on their data. */
  ownerSafety: OwnerSafety;
  /**
   * 'onboarding' = the "Who's at your table?" step: the user already said
   * they cook for a household, so chips open the editor straight away and
   * the card chrome stays out of the way.
   */
  variant?: 'preferences' | 'onboarding';
}) {
  const { members, memberCount, peopleCount, tablePortions, scalesForTable } = useHousehold();
  const { limit } = useEntitlement('householdMembers');
  const invalidate = useInvalidateHousehold();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<HouseholdMemberDto | null>(null);
  const [preset, setPreset] = useState<Partial<MemberFormState> | undefined>(undefined);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const removeMutation = trpc.household.remove.useMutation({
    onSuccess: () => {
      setConfirmingId(null);
      invalidate();
    },
  });

  const atLimit = limit !== null && memberCount >= limit;
  const onboarding = variant === 'onboarding';
  const showGhost = !isPremium && !onboarding && memberCount === 0;

  function openEditor(member: HouseholdMemberDto | null, nextPreset?: Partial<MemberFormState>) {
    setEditing(member);
    setPreset(nextPreset);
    setEditorOpen(true);
  }

  const body = (
    <>
      {showGhost ? (
        <HouseholdGhost
          ownerSafety={ownerSafety}
          onAdd={(kind) => openEditor(null, MEMBER_PRESETS[kind])}
        />
      ) : (
        <>
          {memberCount === 0 && (
            <QuickChips onPick={(kind) => openEditor(null, MEMBER_PRESETS[kind])} />
          )}

          {/* Members */}
          {memberCount > 0 && (
            <ul className="space-y-2">
              {members.map((m) =>
                confirmingId === m.id ? (
                  // Removing someone drops their allergies from every plan —
                  // confirm first (audit F-ONB-3-2).
                  <li
                    key={m.id}
                    className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 sm:flex-row sm:items-center"
                  >
                    <p className="min-w-0 flex-1 text-sm text-red-800">
                      Remove <span className="font-semibold">{m.name}</span>? Their allergies stop
                      applying to your plans.
                    </p>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm font-medium"
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        onClick={() => removeMutation.mutate({ id: m.id })}
                        disabled={removeMutation.isPending}
                        className="min-h-11 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {removeMutation.isPending ? 'Removing…' : 'Remove'}
                      </button>
                    </div>
                  </li>
                ) : (
                  <li
                    key={m.id}
                    className="flex items-center gap-3 rounded-xl border border-input px-3 py-2"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fff3e8] text-sm font-semibold text-[#944a00]">
                      {m.isKid ? (
                        <Baby className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        m.name.slice(0, 1).toUpperCase()
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {m.name}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {portionLabel(m.portionFactor)} portion
                        </span>
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {safetySummary(m)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => openEditor(m)}
                      aria-label={`Edit ${m.name}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingId(m.id)}
                      aria-label={`Remove ${m.name}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                ),
              )}
            </ul>
          )}

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => openEditor(null)}
              disabled={atLimit}
              className="flex min-h-11 items-center gap-1.5 rounded-xl border border-dashed border-primary/40 px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {memberCount === 0 ? 'Add someone else' : 'Add someone'}
            </button>
            {limit !== null && (
              <span className="text-xs text-muted-foreground">
                {memberCount} of {limit}
              </span>
            )}
          </div>

          {/* Free tables: safety applies, scaling is the premium part (P2-3) */}
          {!isPremium && memberCount > 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
              <p className="text-sm text-gray-700">
                Everyone&apos;s allergies already apply to every plan. Your shopping list and
                servings are still sized for one portion — Premium scales them for your table of{' '}
                {peopleCount} ({tablePortions} portions).
              </p>
              <div className="mt-2">
                <UpgradeButton className="px-4 py-2 text-xs" source="household" />
              </div>
            </div>
          )}
        </>
      )}

      {/* Key remounts the sheet per member so state starts fresh. */}
      {editorOpen && (
        <MemberEditorSheet
          key={editing?.id ?? `new-${preset?.isKid ? 'kid' : 'adult'}`}
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          editing={editing}
          {...(preset && { preset })}
        />
      )}
    </>
  );

  if (onboarding) return <div>{body}</div>;

  return (
    <section
      id="household"
      aria-labelledby="household-heading"
      className="scroll-mt-20 rounded-xl border bg-card p-4 shadow-sm sm:p-6"
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Users className="h-4 w-4 text-[#944a00]" aria-hidden="true" />
        <h2 id="household-heading" className="text-base font-semibold">
          My household
        </h2>
        {memberCount > 0 && (
          <span className="rounded-full bg-[#fff3e8] px-2 py-0.5 text-xs font-medium text-[#944a00]">
            {scalesForTable ? `cooking for ${tablePortions}` : `${peopleCount} at the table`}
          </span>
        )}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Add the people you cook for. Their allergies and restrictions apply to every plan — free.
        Premium also scales servings and the shopping list to the whole table.
      </p>
      {body}
    </section>
  );
}
