'use client';

import { useRef, useState } from 'react';
import { StepDiet, type StepDietHandle } from '@/features/onboarding/components/step-diet';
import { UpgradeButton } from '@/features/premium/components/UpgradeButton';
import { HealthDeclinedNotice } from '@/features/privacy/components/HealthDeclinedNotice';
import { useHealthConsent } from '@/features/privacy/use-health-consent';
import { useEntitlement } from '@/hooks/useEntitlement';
import { useHousehold, type HouseholdMemberDto } from '@/hooks/useHousehold';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { Baby, ChevronRight, Pencil, Plus, Sparkles, Trash2, Users } from 'lucide-react';
import { findSafetyTaxonomyEntry, HOUSEHOLD_PORTION_OPTIONS } from '@chefer/types';
import { Sheet } from '@chefer/ui';
import {
  allergiesAndDietForText,
  classifySafetyValue,
  householdGhostSample,
  householdPortionSum,
  memberSummaryLine,
  tableSummaryLine,
  userFacingErrorMessage,
  type HouseholdGhostKind,
  type SafetyPickerValue,
} from '@chefer/utils';

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
    meta: { silent: true },
    onSuccess: () => {
      capture('household_member_added');
      onSaved();
    },
  });
  const updateMutation = trpc.household.update.useMutation({
    meta: { silent: true },
    onSuccess: onSaved,
  });
  const isSaving = addMutation.isPending || updateMutation.isPending;
  const error = addMutation.error ?? updateMutation.error;
  // T-26.2: a member's allergies/diets are health information — asked once, on the first save.
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();
  const [safetyDeclined, setSafetyDeclined] = useState(false);
  // UX-ACC-01: flushes a typed-but-unadded "Something else?" term into the member on save.
  const safetyRef = useRef<StepDietHandle>(null);

  function handleSave() {
    if (!form.name.trim() || isSaving) return;
    // null = a typed term still needs a Keep/Remove choice: don't save yet.
    const safety = safetyRef.current
      ? safetyRef.current.flush()
      : {
          dietaryRestrictions: form.dietaryRestrictions,
          allergies: form.allergies,
          dislikedIngredients: form.dislikedIngredients,
        };
    if (safety === null) return;
    const { dietaryRestrictions, allergies, dislikedIngredients } = safety;
    const {
      dietaryRestrictions: _restrictions,
      allergies: _allergies,
      dislikedIngredients: _dislikes,
      ...rest
    } = form;
    const base = { ...rest, name: form.name.trim() };
    const send = (
      payload: typeof base &
        Partial<Pick<MemberFormState, 'allergies' | 'dietaryRestrictions' | 'dislikedIngredients'>>,
    ) => {
      if (editing) updateMutation.mutate({ id: editing.id, ...payload });
      else addMutation.mutate(payload);
    };
    setSafetyDeclined(false);
    requestHealthConsent(
      () => send({ ...base, dietaryRestrictions, allergies, dislikedIngredients }),
      {
        // A member with only a name and a portion stores nothing health-related.
        hasHealthData:
          allergies.length + dietaryRestrictions.length + dislikedIngredients.length > 0,
        // "Don't save it": keep name/portion/kid, leave the allergy lists out
        // (an edit keeps what is stored; an add stores none).
        onDeclined: () => {
          setSafetyDeclined(true);
          send(base);
        },
      },
    );
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={editing ? `Edit ${editing.name}` : 'Add someone to your table'}
        description="Their allergies and restrictions become hard rules for every plan. Portion size sets how much of each dish is theirs."
        size="lg"
        footer={
          <div className="flex flex-col gap-2">
            {error && <p className="text-sm text-red-600">{userFacingErrorMessage(error)}</p>}
            {safetyDeclined && <HealthDeclinedNotice testId="household-member-declined" />}
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
            <div
              role="group"
              aria-labelledby="member-portion-label"
              className="flex flex-wrap gap-2"
            >
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
              ref={safetyRef}
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
      {healthConsentSheet}
    </>
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

// ─── "You" card (T-01.7, UX-01) — always first ─────────────────────────────────

function labelFor(id: string): string {
  return findSafetyTaxonomyEntry(id)?.label ?? id;
}

const EMPTY_SAFETY: SafetyPickerValue = {
  allergies: [],
  dietaryRestrictions: [],
  dislikedIngredients: [],
};

function YouRow() {
  const { data, isError, refetch } = trpc.preferences.get.useQuery();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SafetyPickerValue>(EMPTY_SAFETY);
  // UX-ACC-01: flushes a typed-but-unadded "Something else?" term before Save.
  const pickerRef = useRef<StepDietHandle>(null);

  const ownSafety: SafetyPickerValue = {
    allergies: data?.dietaryPreferences?.allergies ?? [],
    dietaryRestrictions: data?.dietaryPreferences?.dietaryRestrictions ?? [],
    dislikedIngredients: data?.dietaryPreferences?.dislikedIngredients ?? [],
  };
  const classified = classifySafetyValue(ownSafety);
  const dietParts = [
    ...(classified.dietBaseId ? [classified.dietBaseId] : []),
    ...classified.dietModifierIds,
  ].map(labelFor);

  // T-26.2: your own allergies/diets are health information — asked once, on the first save.
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();
  const [declined, setDeclined] = useState(false);

  const saveMutation = trpc.preferences.updateSafety.useMutation({
    onSuccess: () => {
      setOpen(false);
      void utils.preferences.get.invalidate();
      void utils.mealPlan.invalidate();
    },
  });

  // UX-ACC-03: "You" is only editable once the saved preferences have loaded —
  // an editor seeded from a failed load would save empty lists over the real
  // allergies (updateSafety replaces them).
  if (data === undefined) {
    return (
      <div
        data-testid="household-you-unavailable"
        className="flex items-center gap-3 rounded-xl border border-input bg-card px-3 py-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">You</span>
          <span className="block text-xs text-muted-foreground">
            {isError
              ? 'Couldn’t load your allergies and diet. Nothing has been changed.'
              : 'Loading your allergies and diet…'}
          </span>
        </span>
        {isError && (
          <button
            type="button"
            onClick={() => void refetch()}
            className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm font-medium"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDraft(ownSafety);
          setOpen(true);
        }}
        aria-label={allergiesAndDietForText('you')}
        className="flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">You</span>
          <span className="block truncate text-xs text-muted-foreground">
            {memberSummaryLine({
              portionLabel: '1',
              allergies: classified.allergyIds.map(labelFor),
              diet: dietParts.length > 0 ? dietParts.join(', ') : undefined,
              dislikes: classified.dislikeIds.map(labelFor),
            })}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={allergiesAndDietForText('you')}
        size="lg"
        footer={
          <button
            onClick={() => {
              // null = a typed term still needs a Keep/Remove choice: don't save yet.
              const toSave = pickerRef.current ? pickerRef.current.flush() : draft;
              if (toSave === null) return;
              setDeclined(false);
              requestHealthConsent(() => saveMutation.mutate(toSave), {
                hasHealthData:
                  toSave.allergies.length +
                    toSave.dietaryRestrictions.length +
                    toSave.dislikedIngredients.length >
                  0,
                // "Don't save it": nothing is stored; the sheet stays open with the notice.
                onDeclined: () => setDeclined(true),
              });
            }}
            disabled={saveMutation.isPending}
            className="min-h-11 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save changes'}
          </button>
        }
      >
        <div className="px-5 pb-4">
          <StepDiet ref={pickerRef} value={draft} onChange={setDraft} />
          {declined && (
            <div className="mt-3">
              <HealthDeclinedNotice testId="household-you-declined" />
            </div>
          )}
        </div>
      </Sheet>
      {healthConsentSheet}
    </>
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
  const { members, memberCount, peopleCount, tablePortions, scalesForTable, loadFailed, refetch } =
    useHousehold();
  const { limit } = useEntitlement('householdMembers');
  const invalidate = useInvalidateHousehold();
  const { data: table } = trpc.safety.getTable.useQuery();
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

  const tableSummary =
    !onboarding && table?.hasRules
      ? tableSummaryLine(
          peopleCount,
          table.people.flatMap((p) => p.items.map((item) => ({ label: item.label, who: p.who }))),
        )
      : null;

  const body = (
    <>
      {!onboarding && <YouRow />}
      {loadFailed ? (
        // UX-ACC-03: a failed load must not read as "just you at the table".
        <div
          role="alert"
          data-testid="household-load-error"
          className="flex flex-col gap-2 rounded-xl border border-input px-3 py-3 sm:flex-row sm:items-center"
        >
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            Couldn’t load your household. Nothing has been changed.
          </p>
          <button
            type="button"
            onClick={refetch}
            className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm font-medium"
          >
            Try again
          </button>
        </div>
      ) : showGhost ? (
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

          {/* UX-02/CI-41: table read-back summary */}
          {tableSummary && <p className="mt-2 text-xs text-muted-foreground">{tableSummary}</p>}

          {/* Free tables: safety applies, scaling is the premium part (P2-3) */}
          {!isPremium && !onboarding && memberCount > 0 && (
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
