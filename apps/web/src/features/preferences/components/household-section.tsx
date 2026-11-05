'use client';

import { useRef, useState } from 'react';
import { HouseholdNotices } from '@/features/household-sharing/components/HouseholdNotices';
import { LeaveHousehold } from '@/features/household-sharing/components/LeaveHousehold';
import { MemberSharingLine } from '@/features/household-sharing/components/MemberSharingLine';
import { PartnerBanner } from '@/features/household-sharing/components/PartnerBanner';
import { useHouseholdSharing } from '@/features/household-sharing/use-household-sharing';
import { StepDiet, type StepDietHandle } from '@/features/onboarding/components/step-diet';
import { UpgradeButton } from '@/features/premium/components/UpgradeButton';
import { HealthDeclinedNotice } from '@/features/privacy/components/HealthDeclinedNotice';
import { useHealthConsent } from '@/features/privacy/use-health-consent';
import { useEntitlement } from '@/hooks/useEntitlement';
import { useHousehold, type HouseholdMemberDto } from '@/hooks/useHousehold';
import { capture } from '@/lib/analytics';
import { useT } from '@/lib/i18n';
import { rich } from '@/lib/i18n/rich';
import { trpc } from '@/lib/trpc';
import { Baby, ChevronRight, Pencil, Plus, Sparkles, Trash2, Users } from 'lucide-react';
import type { Translator } from '@chefer/i18n';
import {
  findSafetyTaxonomyEntry,
  HOUSEHOLD_AGE_BANDS,
  HOUSEHOLD_PORTION_OPTIONS,
  type HouseholdAgeBand,
} from '@chefer/types';
import { Sheet } from '@chefer/ui';
import {
  AGE_BAND_LABELS,
  ageBandLabel,
  ageBandPortionFactor,
  classifySafetyValue,
  householdGhostSample,
  householdPortionSum,
  parseAgeBand,
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

type PortionChipKey = `household.editor.portionChip.${'p50' | 'p75' | 'p100' | 'p125' | 'p150'}`;

const PORTION_LABELS: Record<number, PortionChipKey> = {
  0.5: 'household.editor.portionChip.p50',
  0.75: 'household.editor.portionChip.p75',
  1: 'household.editor.portionChip.p100',
  1.25: 'household.editor.portionChip.p125',
  1.5: 'household.editor.portionChip.p150',
};

/** "A, B and C" in the UI language. */
function joinList(t: Translator['t'], items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return t('household.editor.listAnd', {
    list: items.slice(0, -1).join(', '),
    last: items[items.length - 1] ?? '',
  });
}

/** `{n} at the table · we’ll check for tree nuts (Luca) and fish (Ana)` (UX-02, CI-41). */
function tableSummaryText(
  t: Translator['t'],
  peopleCount: number,
  rules: readonly { label: string; who: string }[],
): string {
  if (rules.length === 0) return t('household.editor.atTable', { people: peopleCount });
  return t('household.editor.tableSummary', {
    people: peopleCount,
    list: joinList(
      t,
      rules.map((r) => t('household.editor.tableRule', { label: r.label, who: r.who })),
    ),
  });
}

/** `{portion} portion · allergic: … · {diet} · won’t eat: …` (member card). */
function memberSummaryText(
  t: Translator['t'],
  parts: { portionLabel: string; allergies: string[]; diet?: string; dislikes: string[] },
): string {
  const segments = [t('household.editor.portion', { portion: parts.portionLabel })];
  if (parts.allergies.length > 0) {
    segments.push(t('household.editor.summaryAllergic', { list: parts.allergies.join(', ') }));
  }
  if (parts.diet) segments.push(parts.diet);
  if (parts.dislikes.length > 0) {
    segments.push(t('household.editor.summaryWontEat', { list: parts.dislikes.join(', ') }));
  }
  return segments.join(' · ');
}

export interface MemberFormState {
  name: string;
  portionFactor: number;
  isKid: boolean;
  /** Optional kid age band (UX-PLAN-12); picking one pre-fills portionFactor. */
  ageBand: HouseholdAgeBand | null;
  dietaryRestrictions: string[];
  allergies: string[];
  dislikedIngredients: string[];
}

const EMPTY_MEMBER: MemberFormState = {
  name: '',
  portionFactor: 1,
  isKid: false,
  ageBand: null,
  dietaryRestrictions: [],
  allergies: [],
  dislikedIngredients: [],
};

/** Editor presets for the quick chips (the kid starts at ½ portion). */
export const MEMBER_PRESETS: Record<HouseholdGhostKind, Partial<MemberFormState>> = {
  partner: { portionFactor: 1, isKid: false },
  kid: { portionFactor: 0.5, isKid: true },
};

function safetySummary(t: Translator['t'], member: HouseholdMemberDto): string {
  const parts: string[] = [];
  if (member.allergies.length) {
    parts.push(t('household.editor.summaryAllergicTo', { list: member.allergies.join(', ') }));
  }
  if (member.dietaryRestrictions.length) parts.push(member.dietaryRestrictions.join(', '));
  if (member.dislikedIngredients.length) {
    parts.push(
      t('household.editor.summaryDislikes', { list: member.dislikedIngredients.join(', ') }),
    );
  }
  return parts.length ? parts.join(' · ') : t('household.editor.summaryNone');
}

function portionLabel(t: Translator['t'], factor: number): string {
  const key = PORTION_LABELS[factor];
  return key ? t(key) : `×${factor}`;
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
  const { t } = useT();
  const [form, setForm] = useState<MemberFormState>(
    editing
      ? {
          name: editing.name,
          portionFactor: editing.portionFactor,
          isKid: editing.isKid,
          ageBand: editing.isKid ? parseAgeBand(editing.ageBand) : null,
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
    // `ageBand` is sent only when it differs from what is stored (null clears
    // it; a non-kid never keeps one).
    const { ageBand: formBand, ...restWithoutBand } = rest;
    const nextBand = form.isKid ? formBand : null;
    const base = {
      ...restWithoutBand,
      name: form.name.trim(),
      ...(nextBand !== (editing ? parseAgeBand(editing.ageBand) : null)
        ? { ageBand: nextBand }
        : {}),
    };
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
        title={
          editing
            ? t('household.editor.editTitle', { name: editing.name })
            : t('household.editor.addTitle')
        }
        description={t('household.editor.sheetDescription')}
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
              {isSaving
                ? t('common.states.saving')
                : editing
                  ? t('household.editor.saveChanges')
                  : t('household.editor.addToTable')}
            </button>
          </div>
        }
      >
        {/* The Sheet body has no padding of its own (audit F-ONB-3-3). */}
        <div className="space-y-6 px-5 pb-4">
          {/* Name */}
          <div>
            <label htmlFor="member-name" className="mb-1 block text-sm font-medium">
              {t('household.editor.name')}
            </label>
            <input
              id="member-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={
                form.isKid
                  ? t('household.editor.namePlaceholderKid')
                  : t('household.editor.namePlaceholderAdult')
              }
              maxLength={60}
              className="min-h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Portion */}
          <div>
            <p id="member-portion-label" className="mb-1 text-sm font-medium">
              {t('household.editor.portionSize')}
            </p>
            <p className="mb-2 text-xs text-muted-foreground">
              {t('household.editor.portionHint')}
            </p>
            <div
              role="group"
              aria-labelledby="member-portion-label"
              className="flex flex-wrap gap-2"
            >
              {HOUSEHOLD_PORTION_OPTIONS.map((value) => (
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
                  {portionLabel(t, value)}
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
                  ageBand: isKid ? f.ageBand : null,
                }));
              }}
              className="h-5 w-5 accent-[#944a00]"
            />
            {t('household.editor.isKid')}
          </label>

          {/* UX-PLAN-12: optional age — picking one pre-fills the portion, which stays adjustable. */}
          {form.isKid && (
            <div>
              <p id="member-age-label" className="mb-1 text-sm font-medium">
                {t('household.editor.age')}{' '}
                <span className="font-normal text-muted-foreground">
                  {t('household.editor.optional')}
                </span>
              </p>
              <div
                role="group"
                aria-labelledby="member-age-label"
                data-testid="member-age-group"
                className="flex flex-wrap gap-2"
              >
                {HOUSEHOLD_AGE_BANDS.map((band) => (
                  <button
                    key={band}
                    type="button"
                    onClick={() =>
                      setForm((f) =>
                        f.ageBand === band
                          ? { ...f, ageBand: null }
                          : { ...f, ageBand: band, portionFactor: ageBandPortionFactor(band) },
                      )
                    }
                    aria-pressed={form.ageBand === band}
                    aria-label={t('household.editor.ageLabel', { range: AGE_BAND_LABELS[band] })}
                    className={`min-h-11 rounded-xl border px-3 py-1.5 text-sm font-medium transition ${
                      form.ageBand === band
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-input text-muted-foreground hover:border-primary/40'
                    }`}
                  >
                    {AGE_BAND_LABELS[band]}
                  </button>
                ))}
              </div>
            </div>
          )}

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

const CHIPS: {
  kind: HouseholdGhostKind;
  label: 'household.editor.chipPartner' | 'household.editor.chipKid';
}[] = [
  { kind: 'partner', label: 'household.editor.chipPartner' },
  { kind: 'kid', label: 'household.editor.chipKid' },
];

function QuickChips({
  onPick,
  active = null,
}: {
  onPick: (kind: HouseholdGhostKind) => void;
  active?: HouseholdGhostKind | null;
}) {
  const { t } = useT();
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
          {t(label)}
        </button>
      ))}
    </div>
  );
}

// ─── Free-tier ghost (§6.4, F-PM-12) ──────────────────────────────────────────

const SAMPLE_WEEK = ['mon', 'tue', 'wed'] as const;

function HouseholdGhost({
  ownerSafety,
  onAdd,
}: {
  ownerSafety: OwnerSafety;
  onAdd: (kind: HouseholdGhostKind) => void;
}) {
  const { t } = useT();
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
            ...ownerSafety.allergies.map((a) => t('household.editor.ghost.noItem', { item: a })),
            ...sample.allergies.map((a) => t('household.editor.ghost.noItem', { item: a })),
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
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />{' '}
            {t('household.editor.ghost.title', { name: sample.name })}
          </p>
          <p className="mt-2 text-sm text-gray-700">
            {rich(
              t,
              'household.editor.ghost.body',
              { name: <span className="font-semibold">{sample.name}</span> },
              { summary: t(`household.editor.ghost.summary.${kind}`) },
            )}
          </p>
          <ul className="mt-3 space-y-1.5">
            {SAMPLE_WEEK.map((day) => (
              <li key={day} className="flex items-center gap-2 text-sm">
                <span className="w-9 shrink-0 text-xs font-semibold uppercase text-gray-500">
                  {t(`common.weekdaysShort.${day}`)}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-gray-800">
                  {t(`household.editor.ghost.dishes.${day}`)}
                </span>
                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-600">
                  {t('common.counts.servings', { count: servings })}
                </span>
              </li>
            ))}
          </ul>
          {mergedChips.length > 0 && (
            <p className="mt-3 text-xs text-gray-600">
              {t('household.editor.ghost.combinedRules', { rules: mergedChips.join(' · ') })}
            </p>
          )}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => onAdd(kind)}
              className="flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {kind === 'kid'
                ? t('household.editor.ghost.addKidFree')
                : t('household.editor.ghost.addPartnerFree')}
            </button>
            <p className="min-w-0 text-xs text-gray-600">
              {t('household.editor.ghost.upsell', { count: servings })}
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
  const { t } = useT();
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
          <span className="block text-sm font-medium text-foreground">
            {t('household.editor.you')}
          </span>
          <span className="block text-xs text-muted-foreground">
            {isError ? t('household.editor.youLoadError') : t('household.editor.youLoading')}
          </span>
        </span>
        {isError && (
          <button
            type="button"
            onClick={() => void refetch()}
            className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm font-medium"
          >
            {t('household.editor.retry')}
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
        aria-label={t('household.editor.allergiesAndDietForYou')}
        className="flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">
            {t('household.editor.you')}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {memberSummaryText(t, {
              portionLabel: '1',
              allergies: classified.allergyIds.map(labelFor),
              ...(dietParts.length > 0 && { diet: dietParts.join(', ') }),
              dislikes: classified.dislikeIds.map(labelFor),
            })}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('household.editor.allergiesAndDietForYou')}
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
            {saveMutation.isPending ? t('common.states.saving') : t('household.editor.saveChanges')}
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
  const { t } = useT();
  const { members, memberCount, peopleCount, tablePortions, scalesForTable, loadFailed, refetch } =
    useHousehold();
  const { limit } = useEntitlement('householdMembers');
  const invalidate = useInvalidateHousehold();
  const { data: table } = trpc.safety.getTable.useQuery();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<HouseholdMemberDto | null>(null);
  const [preset, setPreset] = useState<Partial<MemberFormState> | undefined>(undefined);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // ADR 0003: sharing shows only on the Preferences section, with the flag on.
  const sharing = useHouseholdSharing();
  const sharingStatus = variant === 'onboarding' ? null : sharing.status;
  // A partner sees the owner's table: only their own profile is theirs to edit.
  const isPartner = sharingStatus?.role === 'PARTNER';
  const partnerOwner = isPartner ? (sharingStatus.owner?.name ?? '') : null;

  const removeMutation = trpc.household.remove.useMutation({
    onSuccess: () => {
      setConfirmingId(null);
      invalidate();
    },
  });

  const atLimit = limit !== null && memberCount >= limit;
  const onboarding = variant === 'onboarding';
  const showGhost = !isPremium && !onboarding && !isPartner && memberCount === 0;

  function openEditor(member: HouseholdMemberDto | null, nextPreset?: Partial<MemberFormState>) {
    setEditing(member);
    setPreset(nextPreset);
    setEditorOpen(true);
  }

  const tableSummary =
    !onboarding && table?.hasRules
      ? tableSummaryText(
          t,
          peopleCount,
          table.people.flatMap((p) => p.items.map((item) => ({ label: item.label, who: p.who }))),
        )
      : null;

  const body = (
    <>
      {sharingStatus && <HouseholdNotices enabled />}
      {partnerOwner !== null && <PartnerBanner ownerName={partnerOwner} className="mb-3" />}
      {!onboarding && <YouRow />}
      {loadFailed ? (
        // UX-ACC-03: a failed load must not read as "just you at the table".
        <div
          role="alert"
          data-testid="household-load-error"
          className="flex flex-col gap-2 rounded-xl border border-input px-3 py-3 sm:flex-row sm:items-center"
        >
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            {t('household.editor.loadError')}
          </p>
          <button
            type="button"
            onClick={refetch}
            className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm font-medium"
          >
            {t('common.actions.retry')}
          </button>
        </div>
      ) : showGhost ? (
        <HouseholdGhost
          ownerSafety={ownerSafety}
          onAdd={(kind) => openEditor(null, MEMBER_PRESETS[kind])}
        />
      ) : (
        <>
          {memberCount === 0 && !isPartner && (
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
                      {rich(t, 'household.editor.removeConfirm', {
                        name: <span className="font-semibold">{m.name}</span>,
                      })}
                    </p>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm font-medium"
                      >
                        {t('household.editor.keep')}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeMutation.mutate({ id: m.id })}
                        disabled={removeMutation.isPending}
                        className="min-h-11 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {removeMutation.isPending
                          ? t('household.editor.removing')
                          : t('household.editor.remove')}
                      </button>
                    </div>
                  </li>
                ) : (
                  <li key={m.id} className="rounded-xl border border-input px-3 py-2">
                    <div className="flex items-center gap-3">
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
                          {m.isYou && (
                            <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              {t('household.sharing.you')}
                            </span>
                          )}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {ageBandLabel(m.ageBand)
                              ? t('household.editor.agePortion', {
                                  age: ageBandLabel(m.ageBand) ?? '',
                                  portion: portionLabel(t, m.portionFactor),
                                })
                              : t('household.editor.portion', {
                                  portion: portionLabel(t, m.portionFactor),
                                })}
                          </span>
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {safetySummary(t, m)}
                        </span>
                      </span>
                      {(!isPartner || m.isYou) && (
                        <button
                          type="button"
                          onClick={() => openEditor(m)}
                          aria-label={t('household.editor.editLabel', { name: m.name })}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                      {!isPartner && (
                        <button
                          type="button"
                          onClick={() => setConfirmingId(m.id)}
                          aria-label={t('household.editor.removeLabel', { name: m.name })}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    {sharingStatus && <MemberSharingLine member={m} status={sharingStatus} />}
                  </li>
                ),
              )}
            </ul>
          )}

          {!isPartner && (
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => openEditor(null)}
                disabled={atLimit}
                className="flex min-h-11 items-center gap-1.5 rounded-xl border border-dashed border-primary/40 px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {memberCount === 0
                  ? t('household.editor.addSomeoneElse')
                  : t('household.editor.addSomeone')}
              </button>
              {limit !== null && (
                <span className="text-xs text-muted-foreground">
                  {t('household.editor.ofLimit', { used: memberCount, limit })}
                </span>
              )}
            </div>
          )}

          {/* UX-02/CI-41: table read-back summary */}
          {tableSummary && <p className="mt-2 text-xs text-muted-foreground">{tableSummary}</p>}

          {/* Free tables: safety applies, scaling is the premium part (P2-3) */}
          {!isPremium && !onboarding && !isPartner && memberCount > 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
              <p className="text-sm text-gray-700">
                {t('household.editor.freeNote', { people: peopleCount, count: tablePortions ?? 0 })}
              </p>
              <div className="mt-2">
                <UpgradeButton className="px-4 py-2 text-xs" source="household" />
              </div>
            </div>
          )}

          {partnerOwner !== null && <LeaveHousehold ownerName={partnerOwner} />}
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
          {t('household.editor.sectionTitle')}
        </h2>
        {memberCount > 0 && (
          <span className="rounded-full bg-[#fff3e8] px-2 py-0.5 text-xs font-medium text-[#944a00]">
            {scalesForTable
              ? t('household.editor.cookingFor', { portions: tablePortions ?? 0 })
              : t('household.editor.atTable', { people: peopleCount })}
          </span>
        )}
      </div>
      <p className="mb-4 text-sm text-muted-foreground" hidden={isPartner}>
        {t('household.editor.sectionIntro')}
      </p>
      {body}
    </section>
  );
}
