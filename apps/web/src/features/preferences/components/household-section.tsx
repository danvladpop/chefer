'use client';

import { useState } from 'react';
import { StepDiet } from '@/features/onboarding/components/step-diet';
import { UpgradeButton } from '@/features/premium/components/UpgradeButton';
import { useEntitlement } from '@/hooks/useEntitlement';
import { useHousehold, type HouseholdMemberDto } from '@/hooks/useHousehold';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { Baby, Pencil, Plus, Sparkles, Trash2, Users } from 'lucide-react';
import { Sheet } from '@chefer/ui';

// ─── "My household" (F2 Feed the Whole Table) ─────────────────────────────────
// Premium: member chips + per-member safety editors (reusing the onboarding
// StepDiet component), capped by the householdMembers matrix limit.
// Free: the §6.4 ghost state — ghost chips that render a sample merged week
// from the user's OWN diet + one fictional member, then the upgrade CTA.
// Members persist after a downgrade (their safety union keeps filtering
// plans), so a free user WITH members sees a manage-lite list instead.

const PORTION_OPTIONS: { value: number; label: string }[] = [
  { value: 0.5, label: '½ · kid' },
  { value: 0.75, label: '¾ · light' },
  { value: 1, label: '1 · standard' },
  { value: 1.25, label: '1¼ · hearty' },
  { value: 1.5, label: '1½ · big eater' },
];

interface MemberFormState {
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

function safetySummary(member: HouseholdMemberDto): string {
  const parts: string[] = [];
  if (member.allergies.length) parts.push(`allergic to ${member.allergies.join(', ')}`);
  if (member.dietaryRestrictions.length) parts.push(member.dietaryRestrictions.join(', '));
  if (member.dislikedIngredients.length) {
    parts.push(`dislikes ${member.dislikedIngredients.join(', ')}`);
  }
  return parts.length ? parts.join(' · ') : 'no restrictions';
}

// ─── Member editor sheet (premium) ────────────────────────────────────────────

function MemberEditorSheet({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  /** null = creating a new member. */
  editing: HouseholdMemberDto | null;
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
      : EMPTY_MEMBER,
  );
  const utils = trpc.useUtils();

  const onSaved = () => {
    void utils.household.list.invalidate();
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
      title={editing ? `Edit ${editing.name}` : 'Add a household member'}
      description="Their allergies and restrictions become hard rules for every plan; portion size scales servings and the shopping list."
      size="lg"
      footer={
        <div className="flex flex-col gap-2">
          {error && <p className="text-sm text-red-600">{error.message}</p>}
          <button
            onClick={handleSave}
            disabled={!form.name.trim() || isSaving}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : editing ? 'Save changes' : 'Add member'}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
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
            placeholder="e.g. Maria"
            maxLength={60}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Portion */}
        <div>
          <p className="mb-1 text-sm font-medium">Portion size</p>
          <p className="mb-2 text-xs text-muted-foreground">
            Relative to one standard serving — a kid eats about half.
          </p>
          <div className="flex flex-wrap gap-2">
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

        {/* Kid toggle */}
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={form.isKid}
            onChange={(e) => setForm((f) => ({ ...f, isKid: e.target.checked }))}
            className="h-4 w-4 accent-[#944a00]"
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

// ─── Free-tier ghost state (§6.4) ─────────────────────────────────────────────

const SAMPLE_MEMBER = { name: 'Alex', restrictions: ['Vegan'], allergies: ['peanuts'] };

const SAMPLE_WEEK: { day: string; dish: string }[] = [
  { day: 'Mon', dish: 'Chickpea & Roast Pepper Tagine' },
  { day: 'Tue', dish: 'Miso Ginger Noodle Stir-fry' },
  { day: 'Wed', dish: 'Charred Broccoli Rice Bowls' },
];

function HouseholdGhost({ ownerSafety }: { ownerSafety: OwnerSafety }) {
  const [showSample, setShowSample] = useState(false);

  function revealSample() {
    if (!showSample) {
      // §6.4: the ghost IS the upgrade prompt — one event per reveal.
      capture('upgrade_prompt_shown', { source: 'household' });
      capture('teaser_engaged', { feature: 'household' });
    }
    setShowSample(true);
  }

  // The demo runs on THEIR data: the user's own diet merged with Alex's.
  const mergedChips = [
    ...new Set(
      [
        ...ownerSafety.allergies.map((a) => `no ${a.toLowerCase()}`),
        ...SAMPLE_MEMBER.allergies.map((a) => `no ${a}`),
        ...ownerSafety.dietaryRestrictions,
        ...SAMPLE_MEMBER.restrictions,
      ].map((c) => c.toLowerCase()),
    ),
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {(['+ add your partner', '+ add a kid'] as const).map((label) => (
          <button
            key={label}
            type="button"
            onClick={revealSample}
            className="min-h-11 rounded-full border-2 border-dashed border-amber-300 bg-amber-50/40 px-4 py-1.5 text-sm font-medium text-amber-800 transition hover:border-amber-400 hover:bg-amber-50"
          >
            {label}
          </button>
        ))}
      </div>

      {showSample && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-amber-700">
            <Sparkles className="h-3.5 w-3.5" /> Sample: your week, cooking for two
          </p>
          <p className="mt-2 text-sm text-gray-700">
            Say you add <span className="font-semibold">{SAMPLE_MEMBER.name}</span> — vegan,
            allergic to peanuts. Every dinner would fit you both:
          </p>
          <ul className="mt-3 space-y-1.5">
            {SAMPLE_WEEK.map(({ day, dish }) => (
              <li key={day} className="flex items-center gap-2 text-sm">
                <span className="w-9 shrink-0 text-xs font-semibold uppercase text-gray-400">
                  {day}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-gray-800">{dish}</span>
                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-gray-500">
                  2 servings
                </span>
              </li>
            ))}
          </ul>
          {mergedChips.length > 0 && (
            <p className="mt-3 text-xs text-gray-600">
              Combined table rules: {mergedChips.join(' · ')} — shopping list and cook mode scale to
              match.
            </p>
          )}
          <div className="mt-4">
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
}: {
  isPremium: boolean;
  /** The user's live safety selection — the ghost demo runs on their data. */
  ownerSafety: OwnerSafety;
}) {
  const { members, memberCount, portionSum } = useHousehold();
  const { limit } = useEntitlement('householdMembers');
  const utils = trpc.useUtils();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<HouseholdMemberDto | null>(null);

  const removeMutation = trpc.household.remove.useMutation({
    onSuccess: () => void utils.household.list.invalidate(),
  });

  const atLimit = limit !== null && memberCount >= limit;
  const canManage = isPremium;
  // Downgraded accounts keep their members (safety still applies) — show the
  // list read-only with remove, not the ghost.
  const showGhost = !isPremium && memberCount === 0;

  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
      <div className="mb-1 flex items-center gap-2">
        <Users className="h-4 w-4 text-[#944a00]" aria-hidden="true" />
        <h2 className="text-base font-semibold">My household</h2>
        {portionSum !== null && (
          <span className="rounded-full bg-[#fff3e8] px-2 py-0.5 text-[11px] font-medium text-[#944a00]">
            cooking for {portionSum}
          </span>
        )}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Add the people you cook for. Their allergies and restrictions are always respected in every
        plan; portions and the shopping list scale to the whole table.
      </p>

      {showGhost ? (
        <HouseholdGhost ownerSafety={ownerSafety} />
      ) : (
        <>
          {/* Member chips */}
          <ul className="space-y-2">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 rounded-xl border border-input px-3 py-2"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fff3e8] text-sm font-semibold text-[#944a00]">
                  {m.isKid ? <Baby className="h-4 w-4" /> : m.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {m.name}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ×{m.portionFactor} portion
                    </span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {safetySummary(m)}
                  </span>
                </span>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(m);
                      setEditorOpen(true);
                    }}
                    aria-label={`Edit ${m.name}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeMutation.mutate({ id: m.id })}
                  disabled={removeMutation.isPending}
                  aria-label={`Remove ${m.name}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>

          {canManage ? (
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setEditorOpen(true);
                }}
                disabled={atLimit}
                className="flex min-h-11 items-center gap-1.5 rounded-xl border border-dashed border-primary/40 px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Add member
              </button>
              {limit !== null && (
                <span className="text-xs text-muted-foreground">
                  {memberCount} of {limit}
                </span>
              )}
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              Adding and editing members is a premium feature — their safety rules above still apply
              to every plan.
            </p>
          )}
        </>
      )}

      {/* Key remounts the sheet per member so state starts fresh. */}
      {editorOpen && (
        <MemberEditorSheet
          key={editing?.id ?? 'new'}
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          editing={editing}
        />
      )}
    </section>
  );
}
