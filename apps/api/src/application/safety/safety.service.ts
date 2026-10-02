import {
  dietaryPreferencesRepository,
  householdMemberRepository,
  safetyReportRepository,
  type IDietaryPreferencesRepository,
  type IHouseholdMemberRepository,
  type ISafetyReportRepository,
  type Prisma,
  type SafetyReport,
} from '@chefer/database';
import type {
  SafetyCheckedItem,
  SafetyChecks,
  SafetyConflictDetail,
  TableSafety,
  TableSafetyPerson,
} from '@chefer/types';
import { recogniseSafetyTerm } from '@chefer/utils';
import {
  deriveDietTags,
  deriveTagQualifiers,
  evaluateRestriction,
  findLabelCaveats,
  findSafetyBlockers,
  hasSafetyPrefs,
  isRecipeSafe,
  type SafetyCheckable,
  type SafetyPrefs,
} from '../../lib/curated-recipes/safety.js';
import { mergeHouseholdSafety } from '../household/household.service.js';

// ─── Safety service (§2.1, T-01.1/T-01.2) ──────────────────────────────────────
// The ONE place every surface asks "is this recipe safe for this table" —
// UX-01's promise that the filter behaves identically wherever it appears.
// `loadContext` reads the owner + household + reported recipes once;
// `check`/`filter`/`decorate` are pure over that context so callers never
// duplicate the merge/matcher logic (that duplication was exactly how
// rebalance.ts, chat context and importSave's `original` variant fell out of
// sync with the rest of the app — T-BUG-X1, T-BUG-X3).

/**
 * The minimum shape `filter`/`decorate` need — structurally compatible with
 * both `SafetyCheckable` (curated `RecipeData`) and a raw Prisma `Recipe`
 * row (whose `ingredients`/`nutritionInfo` are typed as JSON).
 */
export interface RecipeSafetyLike {
  name: string;
  ingredients: unknown;
  instructions: string[];
  dietaryTags: string[];
}

export interface SafetyContext {
  /** The merged owner+household SafetyPrefs — what the matcher runs against. */
  prefs: SafetyPrefs;
  /** Recipe ids this user has reported (UX-01 d) — `filter()` removes them. */
  hiddenRecipeIds: string[];
  /** The read-back table (§2.2) — who's at the table and what's checked for them. */
  table: TableSafety;
}

export interface SafetyReportInput {
  recipeId: string;
  surface: string;
  reason: string;
  note?: string | null | undefined;
}

/** Builds one TableSafetyPerson row, recognising every stored term via the taxonomy. */
function classifyPerson(
  who: string,
  isOwner: boolean,
  safety: Pick<SafetyPrefs, 'allergies' | 'dietaryRestrictions' | 'dislikedIngredients'>,
): TableSafetyPerson {
  const items: TableSafetyPerson['items'] = [];
  const notes: string[] = [];
  const seen = new Set<string>();

  const add = (terms: string[], fallbackKind: 'allergy' | 'diet' | 'dislike') => {
    for (const term of terms) {
      const recognised = recogniseSafetyTerm(term);
      if (recognised.kind === 'unrecognised') {
        notes.push(term);
        continue;
      }
      if (recognised.kind === 'condition') {
        // Only coeliac has a safe automatic reading (→ the coeliac-strength
        // gluten-free diet); every other condition is surfaced as a note so
        // the UI can show UncheckedNotice's condition variant (T-22.1) —
        // nothing else is ever saved from a condition.
        if (recognised.impliesDietId) {
          const key = `diet:${recognised.impliesDietId}`;
          if (!seen.has(key)) {
            seen.add(key);
            items.push({ id: recognised.impliesDietId, label: recognised.label, kind: 'diet' });
          }
        } else {
          notes.push(term);
        }
        continue;
      }
      const kind =
        recognised.kind === 'allergy' || recognised.kind === 'dislike'
          ? recognised.kind
          : fallbackKind;
      const key = `${kind}:${recognised.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ id: recognised.id, label: recognised.label, kind });
    }
  };

  add(safety.allergies, 'allergy');
  add(safety.dietaryRestrictions, 'diet');
  add(safety.dislikedIngredients, 'dislike');

  return { who, isOwner, items, notes };
}

/** One `safety.filter` audit record (T-26.7): counts and rule ids — never names or terms. */
export interface SafetyFilterAudit {
  event: 'safety.filter';
  surface: string;
  poolSize: number;
  kept: number;
  removed: number;
  /** Taxonomy ids of the rules in force (`unrecognised` for free text) — no names, no user text. */
  ruleIds: string[];
}

/**
 * Builds the evidence-trail record for one filter pass (T-26.7). Pure: the
 * caller decides where to log it. Rule ids come from the taxonomy, so a
 * user's free text never reaches a log line.
 */
export function buildFilterAudit(input: {
  surface: string;
  poolSize: number;
  kept: number;
  prefs: Pick<SafetyPrefs, 'allergies' | 'dietaryRestrictions' | 'dislikedIngredients'>;
}): SafetyFilterAudit {
  const ids = new Set<string>();
  for (const term of [
    ...input.prefs.allergies,
    ...input.prefs.dietaryRestrictions,
    ...input.prefs.dislikedIngredients,
  ]) {
    const recognised = recogniseSafetyTerm(term);
    ids.add(recognised.kind === 'unrecognised' ? 'unrecognised' : recognised.id);
  }
  return {
    event: 'safety.filter',
    surface: input.surface,
    poolSize: input.poolSize,
    kept: input.kept,
    removed: Math.max(0, input.poolSize - input.kept),
    ruleIds: [...ids].sort(),
  };
}

export class SafetyService {
  constructor(
    private readonly prefsRepo: IDietaryPreferencesRepository = dietaryPreferencesRepository,
    private readonly householdRepo: IHouseholdMemberRepository = householdMemberRepository,
    private readonly reportRepo: ISafetyReportRepository = safetyReportRepository,
  ) {}

  /**
   * The one read every safety-aware surface starts from: owner + household
   * merged (hard union, including dislikes — T-01.2), the reported-recipe
   * ids to hide, and the read-back table.
   */
  async loadContext(userId: string): Promise<SafetyContext> {
    const [dietaryPrefs, members, hiddenRecipeIds] = await Promise.all([
      this.prefsRepo.findByUserId(userId),
      this.householdRepo.findByUserId(userId),
      this.reportRepo.findRecipeIdsByUser(userId),
    ]);

    const ownerSafety: SafetyPrefs = {
      allergies: dietaryPrefs?.allergies ?? [],
      dietaryRestrictions: dietaryPrefs?.dietaryRestrictions ?? [],
      dislikedIngredients: dietaryPrefs?.dislikedIngredients ?? [],
      excludeLabelDependent: dietaryPrefs?.excludeLabelDependent ?? false,
    };
    // excludeLabelDependent doesn't participate in unionTerms (not a term
    // list) — carry the owner's setting through explicitly.
    const prefs: SafetyPrefs = {
      ...mergeHouseholdSafety(ownerSafety, members),
      excludeLabelDependent: ownerSafety.excludeLabelDependent ?? false,
    };

    const people: TableSafetyPerson[] = [
      classifyPerson('you', true, ownerSafety),
      ...members.map((m) =>
        classifyPerson(m.name, false, {
          allergies: m.allergies,
          dietaryRestrictions: m.dietaryRestrictions,
          dislikedIngredients: m.dislikedIngredients ?? [],
        }),
      ),
    ];

    const hasUnrecognised = [...ownerSafety.allergies, ...ownerSafety.dietaryRestrictions].some(
      (term) => recogniseSafetyTerm(term).kind === 'unrecognised',
    );
    const needsReview = hasUnrecognised && !dietaryPrefs?.safetyReviewedAt;

    return {
      prefs,
      hiddenRecipeIds,
      table: {
        people,
        hasRules: people.some((p) => p.items.length > 0),
        needsReview,
      },
    };
  }

  /** Public read for `safety.getTable` — the client-facing slice of loadContext. */
  async getTable(userId: string): Promise<TableSafety> {
    return (await this.loadContext(userId)).table;
  }

  /**
   * Which of the table's rules a recipe passes/fails (§2.2 payload). Every
   * detail surface (recipe page, cook mode, household summary) renders from
   * this same shape.
   */
  check(recipe: SafetyCheckable, table: TableSafety): SafetyChecks {
    const checked: SafetyCheckedItem[] = [];
    const taggedOnly: SafetyCheckedItem[] = [];
    const conflicts = new Set<string>();
    const conflictDetails = new Map<string, SafetyConflictDetail>();
    const unchecked = new Set<string>();

    for (const person of table.people) {
      for (const note of person.notes) unchecked.add(note);
      for (const item of person.items) {
        const prefs: SafetyPrefs = {
          allergies: item.kind === 'allergy' ? [item.label] : [],
          dietaryRestrictions: item.kind === 'diet' ? [item.label] : [],
          dislikedIngredients: item.kind === 'dislike' ? [item.label] : [],
        };

        // UX-REC-01: a diet is judged on the recipe's own ingredients, not
        // only its tags — a pass that rests on the tag alone is not "Checked".
        if (item.kind === 'diet') {
          const verdict = evaluateRestriction(recipe, item.label, { deriveFromIngredients: true });
          if (verdict?.status === 'unverified') {
            // Untagged and nothing to prove it from: honest "can't check".
            unchecked.add(item.label);
            continue;
          }
          if (verdict?.status === 'pass') {
            checked.push({ label: item.label, who: person.who });
            if (!verdict.verified) taggedOnly.push({ label: item.label, who: person.who });
            continue;
          }
          if (verdict?.status === 'fail') {
            conflicts.add(item.label);
            if (!conflictDetails.has(item.label)) {
              conflictDetails.set(item.label, {
                label: item.label,
                kind: 'diet',
                ingredients: verdict.ingredients,
                ...(verdict.reason && { reason: verdict.reason }),
              });
            }
            continue;
          }
          // An unknown free-text diet term falls through to the matcher below.
        }

        if (isRecipeSafe(recipe, prefs)) {
          checked.push({ label: item.label, who: person.who });
        } else {
          conflicts.add(item.label);
          if (!conflictDetails.has(item.label)) {
            const blockers = findSafetyBlockers(recipe, {
              allergies: prefs.allergies,
              dietaryRestrictions: prefs.dietaryRestrictions,
            });
            conflictDetails.set(item.label, {
              label: item.label,
              kind: item.kind,
              ingredients: blockers.flatMap((b) => b.ingredients),
            });
          }
        }
      }
    }

    const dietLabels = table.people.flatMap((p) =>
      p.items.filter((i) => i.kind === 'diet').map((i) => i.label),
    );
    const labelCaveats = findLabelCaveats(recipe, { dietaryRestrictions: dietLabels });

    return {
      checked,
      conflicts: [...conflicts],
      unchecked: [...unchecked],
      ...(labelCaveats.length > 0 ? { labelCaveats } : {}),
      ...(taggedOnly.length > 0 ? { taggedOnly } : {}),
      ...(conflictDetails.size > 0 ? { conflictDetails: [...conflictDetails.values()] } : {}),
    };
  }

  /**
   * The pool, minus anything unsafe for the table and anything this user
   * reported. `opts.dislikes: 'mark'` (search results, UX-01) keeps
   * disliked-but-otherwise-safe recipes in the pool for the caller to chip
   * instead of hard-excluding them — generation and the Replace picker's
   * default list use the default `'hide'`. `deriveFromIngredients` (UX-REC-01)
   * is for pools of recipes people wrote or imported: an untagged one passes a
   * diet when its own ingredients verify it, instead of vanishing.
   *
   * `T` only needs to be STRUCTURALLY checkable (a Prisma `Recipe` row's
   * `ingredients`/`nutritionInfo` are typed as JSON, not the narrow
   * `SafetyCheckable` shape) — callers with a raw DB row are cast once here
   * instead of having to reshape every row themselves.
   */
  filter<T extends RecipeSafetyLike & { id: string }>(
    pool: T[],
    ctx: Pick<SafetyContext, 'prefs' | 'hiddenRecipeIds'>,
    opts?: { dislikes?: 'hide' | 'mark'; deriveFromIngredients?: boolean },
  ): T[] {
    const dislikesMode = opts?.dislikes ?? 'hide';
    const prefs: SafetyPrefs =
      dislikesMode === 'hide' ? ctx.prefs : { ...ctx.prefs, dislikedIngredients: [] };
    // No allergies/restrictions/dislikes at all: skip the matcher entirely
    // (a no-op filter, same as every safety-aware surface before T-01.2) —
    // also means a caller's recipe rows don't need `instructions`/
    // `dietaryTags` populated when there is nothing to check them against.
    const checkSafety = hasSafetyPrefs(prefs);
    return pool.filter((recipe) => {
      if (ctx.hiddenRecipeIds.includes(recipe.id)) return false;
      return (
        !checkSafety ||
        isRecipeSafe(recipe as unknown as SafetyCheckable, prefs, {
          deriveFromIngredients: opts?.deriveFromIngredients === true,
        })
      );
    });
  }

  /**
   * T-26.7 evidence trail: ONE structured log line per plan generation
   * (`safety.filter`: pool size, removed, rule ids — no names). The plan
   * generation path (`application/meal-plan/**`) calls this once after its
   * safety pass; retention of these lines is per counsel.
   */
  logFilterAudit(input: {
    surface: string;
    poolSize: number;
    kept: number;
    prefs: Pick<SafetyPrefs, 'allergies' | 'dietaryRestrictions' | 'dislikedIngredients'>;
  }): SafetyFilterAudit {
    const audit = buildFilterAudit(input);
    // Lazy: lib/logger.js pulls in lib/env.js, which validates the process
    // environment at import time — a static import would break every test
    // that imports this service without secrets.
    // Without a valid env (unit tests) the logger can't load — the audit
    // record is still returned, it just isn't printed.
    void import('../../lib/logger.js')
      .then(({ logger }) => logger.info(audit, 'safety.filter'))
      .catch(() => undefined);
    return audit;
  }

  /**
   * T-01.10: attaches ingredient-derived diet tags (never trust the static
   * `dietaryTags` for gluten-free/vegan/vegetarian/dairy-free) and their
   * label-dependency qualifiers. L-PLAN's `meal-plan.service.ts` DTO mapping
   * calls this in wave 2 (§7.3) — see the final report for the signature.
   */
  decorate<T extends RecipeSafetyLike>(
    recipe: T,
  ): T & { derivedTags: string[]; tagQualifiers?: Record<string, string> } {
    const checkable = recipe as unknown as SafetyCheckable;
    const derivedTags = deriveDietTags(checkable);
    const tagQualifiers = deriveTagQualifiers(checkable);
    return {
      ...recipe,
      derivedTags,
      ...(Object.keys(tagQualifiers).length > 0 ? { tagQualifiers } : {}),
    };
  }

  /**
   * UX-01 (d): reports a recipe as unsafe/wrong for this user. Hides it for
   * this user immediately (via `hiddenRecipeIds` on the next `loadContext`) —
   * it is never removed for anyone else, and never auto-deleted.
   */
  async report(userId: string, input: SafetyReportInput): Promise<{ success: true }> {
    const ctx = await this.loadContext(userId);
    await this.reportRepo.create({
      userId,
      recipeId: input.recipeId,
      surface: input.surface,
      reason: input.reason,
      note: input.note ?? null,
      rulesSnapshot: ctx.prefs as unknown as Prisma.InputJsonValue,
    });
    return { success: true };
  }

  /** Every recipe this user has reported, newest first — a passthrough read. */
  async listMyReports(userId: string): Promise<SafetyReport[]> {
    return this.reportRepo.findAllByUser(userId);
  }

  /**
   * T-01.3 hook: marks the legacy free-text review as done (`Looks right` /
   * after `Change` re-saves through the SafetyPicker). The migration-card UI
   * itself is cut from this PR (see the final report) — this write is
   * exercised directly by `safety.confirmReview` so a future PR only needs
   * to add the card.
   */
  async confirmReview(userId: string): Promise<{ success: true }> {
    await this.prefsRepo.upsert(userId, { safetyReviewedAt: new Date() });
    return { success: true };
  }
}

export const safetyService = new SafetyService();
