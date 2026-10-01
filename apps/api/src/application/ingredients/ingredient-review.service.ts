import { z } from 'zod';
import {
  energyCheck,
  ingredientNoticeRepository,
  ingredientRepository,
  type CatalogIngredientRow,
  type IIngredientNoticeRepository,
  type IIngredientRepository,
  type PrivateReviewRow,
} from '@chefer/database';
import { ingredientBaseKey } from '@chefer/utils';
import { ingredientResolver, type IngredientResolver } from './ingredient-resolver.js';
import { recipeNutritionService, type RecipeNutritionService } from './recipe-nutrition.service.js';

// ─── Weekly private-ingredient review (plan-ingredient-catalog §8.2) ──────────
// `ingredients:review-report` lists the week's private ingredients with the
// resolver's best global candidates and a nutrition delta; the reviewing
// session writes a decisions file; `ingredients:review-apply` carries it out:
//   MAP / PROMOTE — relink every line on the private rows to the global row,
//     recompute those recipes, mark the rows MERGED, notify the owners (D6);
//   KEEP — nothing;
//   REJECT_DATA — a "please check this ingredient" notice for the owner.
// PROMOTE rows must already be in catalog.json and synced: global rows are
// only ever written by the catalog sync (D7), never from user numbers.
// Idempotent: a row already MERGED into the decision's target is skipped.

const MACROS = ['proteinPer100g', 'carbsPer100g', 'fatPer100g', 'fiberPer100g'] as const;
/** Merge tolerance (§8.2): kcal within 25 %, each macro within 30 %… */
export const KCAL_TOLERANCE = 0.25;
export const MACRO_TOLERANCE = 0.3;
/** …or within these absolute floors, so 0.3 g vs 0.6 g fat is not a "100 % change". */
const KCAL_FLOOR = 15;
const MACRO_FLOOR_G = 2;

const ids = z.array(z.string().min(1)).min(1);
const reason = z.string().min(3);
export const reviewDecisionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('MAP'),
    privateIds: ids,
    globalSlug: z.string().min(1),
    /** A true synonym worth adding to catalog.json (reported, not written here: D7). */
    addAlias: z.string().optional(),
    force: z.boolean().optional(),
    reason: z.string().optional(),
  }),
  z.object({
    action: z.literal('PROMOTE'),
    privateIds: ids,
    /** The catalog.json entry the PR added (provenance FDC/CIQUAL/label). */
    newRow: z.object({ slug: z.string().min(1), sourceRef: z.string().min(1) }).passthrough(),
    force: z.boolean().optional(),
    reason: z.string().optional(),
  }),
  z.object({ action: z.literal('KEEP'), privateIds: ids, reason }),
  z.object({ action: z.literal('REJECT_DATA'), privateIds: ids, reason }),
]);
export const reviewDecisionsFileSchema = z.object({
  /** The review's date, "2026-10-08": names the D6 notices. */
  review: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  decisions: z.array(reviewDecisionSchema),
});
export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;
export type ReviewDecisionsFile = z.infer<typeof reviewDecisionsFileSchema>;

type Macros = Pick<CatalogIngredientRow, 'kcalPer100g' | (typeof MACROS)[number]>;

/** Signed % difference of the private row vs the global row, per field. */
/** Per-100 g values keyed the way reports print them. */
export interface MacroSet {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export function macroDelta(mine: Macros, global: Macros): MacroSet {
  const pct = (a: number, b: number) => (b === 0 ? (a === 0 ? 0 : 100) : ((a - b) / b) * 100);
  return {
    kcal: Math.round(pct(mine.kcalPer100g, global.kcalPer100g)),
    protein: Math.round(pct(mine.proteinPer100g, global.proteinPer100g)),
    carbs: Math.round(pct(mine.carbsPer100g, global.carbsPer100g)),
    fat: Math.round(pct(mine.fatPer100g, global.fatPer100g)),
    fiber: Math.round(pct(mine.fiberPer100g, global.fiberPer100g)),
  };
}

/** Why a merge would change the user's numbers too much, or null when it is within tolerance. */
export function mergeToleranceProblem(mine: Macros, global: Macros): string | null {
  const off: string[] = [];
  const dk = Math.abs(mine.kcalPer100g - global.kcalPer100g);
  if (dk > KCAL_FLOOR && dk > KCAL_TOLERANCE * global.kcalPer100g)
    off.push(`kcal ${mine.kcalPer100g} vs ${global.kcalPer100g}`);
  for (const m of MACROS) {
    const d = Math.abs(mine[m] - global[m]);
    if (d > MACRO_FLOOR_G && d > MACRO_TOLERANCE * global[m])
      off.push(`${m.replace('Per100g', '')} ${mine[m]} vs ${global[m]}`);
  }
  return off.length ? off.join(', ') : null;
}

/** §4.5 sanity flags on user-supplied numbers. */
export function sanityFlags(r: Macros): string[] {
  const flags: string[] = [];
  const e = energyCheck({ ...r });
  if (e && !e.ok)
    flags.push(`energy: ${r.kcalPer100g} kcal stated, macros give ${Math.round(e.computed)}`);
  const mass = r.proteinPer100g + r.carbsPer100g + r.fatPer100g + r.fiberPer100g;
  if (mass > 100.5) flags.push(`macros add up to ${Math.round(mass)} g per 100 g`);
  if ([r.kcalPer100g, ...MACROS.map((m) => r[m])].some((v) => v < 0)) flags.push('negative value');
  if (r.kcalPer100g > 900) flags.push('more than 900 kcal per 100 g');
  return flags;
}

export interface ReviewCandidate {
  slug: string;
  name: string;
  confidence: 'EXACT' | 'ALIAS' | 'CANDIDATE';
  delta: MacroSet;
  /** null = a MAP would pass the merge tolerance. */
  toleranceProblem: string | null;
}

export interface ReviewItem {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  category: string;
  recipeCount: number;
  createdAt: string;
  /** User-supplied per-100 g values: a hint only, never copied to a global row. */
  userMacros: MacroSet;
  portions: { unit: string; grams: number }[];
  densityGPerMl: number | null;
  sanity: string[];
  candidates: ReviewCandidate[];
}

export interface ReviewCluster {
  key: string;
  users: number;
  recipes: number;
  privateIds: string[];
}

export interface ReviewReport {
  since: string;
  generatedAt: string;
  items: ReviewItem[];
  /** Same normalized name across owners, most users first. */
  clusters: ReviewCluster[];
}

export interface IngredientNoticeView {
  id: string;
  /** VERIFIED_DATA: "N of your ingredients now use Chefer's verified data". CHECK_DATA: "please check". */
  kind: 'VERIFIED_DATA' | 'CHECK_DATA';
  ingredientNames: string[];
  createdAt: Date;
}

export interface ApplyOutcome {
  decision: ReviewDecision['action'];
  privateIds: string[];
  target: string | null;
  merged: string[];
  skipped: { id: string; why: string }[];
  recipes: { recipeId: string; oldKcal: number | null; newKcal: number | null }[];
  notes: string[];
}

export class IngredientReviewService {
  constructor(
    private readonly catalog: Pick<
      IIngredientRepository,
      'findPrivateForReview' | 'findForReview' | 'findGlobalIdsBySlugs' | 'markMerged'
    > = ingredientRepository,
    private readonly resolver: Pick<IngredientResolver, 'resolveMany'> = ingredientResolver,
    private readonly nutrition: Pick<
      RecipeNutritionService,
      'relinkIngredient'
    > = recipeNutritionService,
    private readonly notices: IIngredientNoticeRepository = ingredientNoticeRepository,
  ) {}

  /** The user's unread review notices (D6), newest first. */
  async listNotices(userId: string): Promise<IngredientNoticeView[]> {
    const rows = await this.notices.listUnread(userId);
    return rows.map((n) => ({
      id: n.id,
      kind: n.kind,
      ingredientNames: n.ingredientNames,
      createdAt: n.createdAt,
    }));
  }

  /** Marks one of the user's notices read; another user's id is a no-op. */
  async dismissNotice(userId: string, id: string): Promise<{ dismissed: boolean }> {
    return { dismissed: await this.notices.markRead(userId, id) };
  }

  async buildReport(since: Date): Promise<ReviewReport> {
    const rows = await this.catalog.findPrivateForReview(since);
    const resolved = await this.resolver.resolveMany(
      rows.map((r) => ({ rawName: r.name })),
      null,
      { candidateLimit: 3 },
    );
    const items: ReviewItem[] = rows.map((r, i) => {
      const res = resolved[i];
      const globals: { row: CatalogIngredientRow; confidence: ReviewCandidate['confidence'] }[] = [
        ...(res?.match
          ? [
              {
                row: res.match,
                confidence: res.confidence === 'EXACT' ? 'EXACT' : 'ALIAS',
              } as const,
            ]
          : []),
        ...(res?.candidates ?? []).map((row) => ({ row, confidence: 'CANDIDATE' as const })),
      ].slice(0, 3);
      return {
        id: r.id,
        ownerId: r.ownerId ?? '',
        name: r.name,
        slug: r.slug,
        category: r.category,
        recipeCount: r.recipeCount,
        createdAt: r.createdAt.toISOString(),
        userMacros: {
          kcal: r.kcalPer100g,
          protein: r.proteinPer100g,
          carbs: r.carbsPer100g,
          fat: r.fatPer100g,
          fiber: r.fiberPer100g,
        },
        portions: r.portions.map((p) => ({ unit: p.unit, grams: p.grams })),
        densityGPerMl: r.densityGPerMl,
        sanity: sanityFlags(r),
        candidates: globals.map(({ row, confidence }) => ({
          slug: row.slug,
          name: row.name,
          confidence,
          delta: macroDelta(r, row),
          toleranceProblem: mergeToleranceProblem(r, row),
        })),
      };
    });
    const byKey = new Map<string, PrivateReviewRow[]>();
    for (const r of rows) {
      const key = ingredientBaseKey(r.name);
      byKey.set(key, [...(byKey.get(key) ?? []), r]);
    }
    const clusters = [...byKey]
      .map(([key, rs]) => ({
        key,
        users: new Set(rs.map((r) => r.ownerId)).size,
        recipes: rs.reduce((s, r) => s + r.recipeCount, 0),
        privateIds: rs.map((r) => r.id),
      }))
      .sort((a, b) => b.users - a.users || b.recipes - a.recipes || a.key.localeCompare(b.key));
    return {
      since: since.toISOString().slice(0, 10),
      generatedAt: new Date().toISOString(),
      items,
      clusters,
    };
  }

  /**
   * Carries out a decisions file. With `dryRun`, nothing is written and each
   * outcome says what would happen (recipe kcal changes are not computed).
   */
  async apply(file: ReviewDecisionsFile, opts: { dryRun: boolean }): Promise<ApplyOutcome[]> {
    const outcomes: ApplyOutcome[] = [];
    const verified = new Map<string, string[]>();
    const toCheck = new Map<string, string[]>();
    for (const d of file.decisions) {
      const rows = await this.catalog.findForReview(d.privateIds);
      const out: ApplyOutcome = {
        decision: d.action,
        privateIds: d.privateIds,
        target: null,
        merged: [],
        skipped: [],
        recipes: [],
        notes: [],
      };
      for (const id of d.privateIds)
        if (!rows.some((r) => r.id === id)) out.skipped.push({ id, why: 'no such ingredient' });
      const privates = rows.filter((r) => {
        if (r.ownerId !== null) return true;
        out.skipped.push({ id: r.id, why: 'is a global row' });
        return false;
      });

      if (d.action === 'KEEP') {
        outcomes.push(out);
        continue;
      }
      if (d.action === 'REJECT_DATA') {
        for (const r of privates) if (r.ownerId) push(toCheck, r.ownerId, r.name);
        out.notes.push(`owners notified: ${new Set(privates.map((r) => r.ownerId)).size}`);
        outcomes.push(out);
        continue;
      }

      const slug = d.action === 'MAP' ? d.globalSlug : d.newRow.slug;
      out.target = slug;
      const globalId = (await this.catalog.findGlobalIdsBySlugs([slug])).get(slug);
      if (!globalId) {
        out.notes.push(
          d.action === 'PROMOTE'
            ? `"${slug}" is not synced yet: merge the catalog PR and deploy first`
            : `no global row "${slug}"`,
        );
        for (const r of privates) out.skipped.push({ id: r.id, why: 'target missing' });
        outcomes.push(out);
        continue;
      }
      const [global] = await this.catalog.findForReview([globalId]);
      if (d.action === 'MAP' && d.addAlias)
        out.notes.push(`add alias "${d.addAlias}" to "${slug}" in catalog.json (D7)`);

      for (const r of privates) {
        if (r.status === 'MERGED') {
          out.skipped.push({
            id: r.id,
            why: r.mergedIntoId === globalId ? 'already merged' : 'merged elsewhere',
          });
          continue;
        }
        if (r.status !== 'ACTIVE') {
          out.skipped.push({ id: r.id, why: r.status });
          continue;
        }
        const problem = global ? mergeToleranceProblem(r, global) : null;
        if (problem && !d.force) {
          out.skipped.push({ id: r.id, why: `outside merge tolerance (${problem})` });
          continue;
        }
        if (problem)
          out.notes.push(`${r.id}: forced past tolerance (${problem}): ${d.reason ?? ''}`);
        out.merged.push(r.id);
        if (opts.dryRun) continue;
        for (const x of await this.nutrition.relinkIngredient(r.id, globalId))
          out.recipes.push({ recipeId: x.recipeId, oldKcal: x.oldKcal, newKcal: x.newKcal });
        await this.catalog.markMerged(r.id, globalId);
        if (r.ownerId) push(verified, r.ownerId, r.name);
      }
      outcomes.push(out);
    }
    if (!opts.dryRun) {
      for (const [userId, names] of verified)
        await this.notices.upsert(userId, 'VERIFIED_DATA', file.review, names);
      for (const [userId, names] of toCheck)
        await this.notices.upsert(userId, 'CHECK_DATA', file.review, names);
    }
    return outcomes;
  }
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  map.set(key, [...new Set([...(map.get(key) ?? []), value])]);
}

export const ingredientReviewService = new IngredientReviewService();
