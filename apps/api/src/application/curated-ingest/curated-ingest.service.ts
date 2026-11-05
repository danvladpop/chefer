import { TRPCError } from '@trpc/server';
import {
  CuratedDraftStateError,
  curatedRecipeDraftRepository,
  ingredientRepository,
  type CuratedDraftStatus,
  type CuratedRecipeDraft,
  type ICuratedRecipeDraftRepository,
  type IIngredientRepository,
  type RecipeLineWrite,
} from '@chefer/database';
import {
  CURATED_INGEST_COPY,
  CURATED_MEAL_TYPES,
  curatedDraftRecipeSchema,
  type CuratedDraftRecipe,
  type CuratedMealType,
} from '@chefer/types';
import { inferMealTypeFromName, isSupportedVideoUrl } from '@chefer/utils';
import { isAiCapacityFailure, toFriendlyAiError } from '../../lib/ai/friendly-error.js';
import { aiService } from '../../lib/ai/index.js';
import type { ExtractedRecipe, IAIService } from '../../lib/ai/index.js';
import { NO_RECIPE_SENTINEL } from '../../lib/ai/prompts.js';
import { invalidateIngestedCuratedRecipes } from '../../lib/curated-recipes/index.js';
import {
  curatedSafetyProfile,
  deriveCuratedDietTags,
  finaliseDietaryTags,
  findHiddenAllergens,
  type CuratedSafetyProfile,
  type HiddenAllergen,
} from '../../lib/curated-recipes/safety-profile.js';
import { startOfTodayUtc } from '../../lib/quotas.js';
import { notifyRecipeImageQueued } from '../../lib/recipe-image-signal.js';
import { extractPageContent, fetchRecipePage } from '../../lib/recipe-import/index.js';
import { findNotFoundFields } from '../../lib/video-import/index.js';
import { toRef, type CatalogIngredientRef } from '../ingredients/catalog-dto.js';
import { ingredientResolver, type IngredientResolver } from '../ingredients/ingredient-resolver.js';
import {
  recipeNutritionService,
  type RecipeNutritionService,
} from '../ingredients/recipe-nutrition.service.js';
import {
  videoRecipeService,
  type VideoRecipeService,
} from '../video-import/video-recipe.service.js';

// ─── Curated recipe ingest (market review F1, 2026-10-22) ─────────────────────
// Admin pastes a link → a DRAFT for the shared free pool → an admin edits,
// approves or rejects it. Owner decisions (2026-09-23): the destination is
// the CURATED pool; facts are extracted, the prose is rewritten in Chefer's
// voice, creator images are never reused, `sourceUrl` keeps the attribution.
//
//   ingest   — cap check, a draft row in EXTRACTING, extraction in the
//              background (a video can take minutes: captions, else subtitles,
//              else a Whisper transcript). The admin's queue polls.
//   extract  — video links through VideoRecipeService, web pages through the
//              Cheferize page reader + the annotated extractor (no invented
//              method). Then the prose rewrite and global catalog matching.
//   approve  — the gates below, then ONE transaction creates the CURATED
//              recipe with its catalog lines and computed nutrition; the image
//              worker generates its picture; the pool reloads.
//
// Drafts are never served: they have no recipe row until approval, and the
// pool loads APPROVED drafts only (lib/curated-recipes ingested slice).

export type CuratedIngestVia = 'video' | 'web';

/** One draft line as the review screen shows it. */
export interface CuratedLineReview {
  /** The global catalog row the line computes from; null = unmatched. */
  match: CatalogIngredientRef | null;
  /** Fuzzy suggestions for an unmatched line (never applied automatically). */
  candidates: CatalogIngredientRef[];
  grams: number | null;
  problem: string | null;
}

/** What approval would store, computed live for the review screen. */
export interface CuratedDraftReview {
  lines: CuratedLineReview[];
  nutrition: {
    status: 'COMPUTED' | 'PARTIAL';
    perServing: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
  };
  /** The diet tags approval will store. */
  dietaryTags: string[];
  safety: CuratedSafetyProfile;
  hiddenAllergens: HiddenAllergen[];
  /** Why approval would be refused right now; empty = ready. */
  blockers: string[];
}

export interface CuratedIngestBudget {
  used: number;
  cap: number;
  remaining: number;
  resetsAt: Date;
}

export interface CuratedIngestDeps {
  repo: ICuratedRecipeDraftRepository;
  ai: Pick<IAIService, 'extractRecipeAnnotated' | 'rewriteRecipeProse'>;
  video: Pick<VideoRecipeService, 'extract'>;
  fetchPage: (url: string) => Promise<{ html: string; finalUrl: string }>;
  resolver: Pick<IngredientResolver, 'resolveMany'>;
  nutrition: Pick<RecipeNutritionService, 'compute'>;
  ingredients: Pick<IIngredientRepository, 'findGlobalIdsBySlugs' | 'findVisibleByIds'>;
  /** Max links sent to the extractor per UTC day (first submits + retries). */
  dailyCap: () => number;
  /** Runs the extraction detached from the request. Tests run it inline. */
  runInBackground: (job: () => Promise<void>) => void;
  onPoolChanged: () => void;
  onImageQueued: () => void;
}

/** CURATED_INGEST_DAILY_CAP's default: Gemini's free tier is about 20 requests a day. */
export const DEFAULT_CURATED_INGEST_DAILY_CAP = 20;

/** Drafts that hold a link nobody may submit again. */
const LIVE_STATUSES: CuratedDraftStatus[] = ['EXTRACTING', 'DRAFT', 'APPROVED', 'UNPUBLISHED'];

/** Canonical form of a pasted link: trimmed, no fragment, no tracking parameters. */
export function normaliseCuratedUrl(raw: string): string {
  const url = new URL(raw.trim());
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|igsh$|igshid$|si$)/i.test(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

/** The draft's recipe, parsed; null for a draft still extracting or failed. */
export function parseDraftRecipe(
  draft: Pick<CuratedRecipeDraft, 'draft'>,
): CuratedDraftRecipe | null {
  const parsed = curatedDraftRecipeSchema.safeParse(draft.draft);
  return parsed.success ? parsed.data : null;
}

/** AI output → the editable draft (nutrition dropped: approval computes it). */
export function toDraftRecipe(recipe: ExtractedRecipe): CuratedDraftRecipe {
  const clamp = (v: number, min: number, max: number) =>
    Math.min(max, Math.max(min, Math.round(Number.isFinite(v) ? v : min)));
  return {
    name: recipe.name.trim().slice(0, 120),
    description: recipe.description.trim().slice(0, 500),
    ingredients: recipe.ingredients.slice(0, 40).flatMap((i) => {
      const name = i.name.trim().slice(0, 80);
      if (!name) return [];
      return [
        {
          name,
          quantity: Math.max(0.01, Math.round(i.quantity * 100) / 100),
          unit: i.unit.trim().slice(0, 20) || 'piece',
          ...(i.note ? { note: i.note.trim().slice(0, 200) } : {}),
          ...(i.optional ? { optional: true } : {}),
        },
      ];
    }),
    instructions: recipe.instructions
      .map((s) => s.trim().slice(0, 500))
      .filter(Boolean)
      .slice(0, 30),
    cuisineType: recipe.cuisineType.trim().slice(0, 60) || 'International',
    dietaryTags: recipe.dietaryTags
      .map((t) => t.trim().toLowerCase().slice(0, 30))
      .filter(Boolean)
      .slice(0, 10),
    prepTimeMins: clamp(recipe.prepTimeMins, 0, 24 * 60),
    cookTimeMins: clamp(recipe.cookTimeMins, 0, 24 * 60),
    servings: clamp(recipe.servings, 1, 20),
  };
}

/** True when the name, description or method differ (the admin rewrote them by hand). */
function proseChanged(a: CuratedDraftRecipe, b: CuratedDraftRecipe): boolean {
  return (
    a.name !== b.name ||
    a.description !== b.description ||
    a.instructions.length !== b.instructions.length ||
    a.instructions.some((s, i) => s !== b.instructions[i])
  );
}

function aiFailureMessage(err: unknown, fallback: string): string {
  if (isAiCapacityFailure(err)) return CURATED_INGEST_COPY.aiQuotaExhausted;
  return err instanceof TRPCError || err instanceof Error ? err.message || fallback : fallback;
}

export class CuratedIngestService {
  private readonly deps: CuratedIngestDeps;

  constructor(deps: Partial<CuratedIngestDeps> = {}) {
    this.deps = {
      repo: curatedRecipeDraftRepository,
      ai: aiService,
      video: videoRecipeService,
      fetchPage: fetchRecipePage,
      resolver: ingredientResolver,
      nutrition: recipeNutritionService,
      ingredients: ingredientRepository,
      dailyCap: () => DEFAULT_CURATED_INGEST_DAILY_CAP,
      runInBackground: (job) => {
        void job().catch((err: unknown) => console.error('[curated-ingest] job crashed', err));
      },
      onPoolChanged: invalidateIngestedCuratedRecipes,
      onImageQueued: notifyRecipeImageQueued,
      ...deps,
    };
  }

  async budget(): Promise<CuratedIngestBudget> {
    const since = startOfTodayUtc();
    const used = await this.deps.repo.countSubmittedSince(since);
    const cap = this.deps.dailyCap();
    return {
      used,
      cap,
      remaining: Math.max(0, cap - used),
      resetsAt: new Date(since.getTime() + 24 * 60 * 60 * 1000),
    };
  }

  private async assertBudget(): Promise<void> {
    const { remaining, cap } = await this.budget();
    if (remaining <= 0) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: CURATED_INGEST_COPY.dailyCapReached(cap),
      });
    }
  }

  /** Paste a link: a new draft in EXTRACTING, extracted in the background. */
  async ingest(adminId: string, rawUrl: string): Promise<CuratedRecipeDraft> {
    let sourceUrl: string;
    try {
      sourceUrl = normaliseCuratedUrl(rawUrl);
    } catch {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Paste a full http(s) link.' });
    }
    if (!/^https?:$/.test(new URL(sourceUrl).protocol)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Paste a full http(s) link.' });
    }
    const existing = await this.deps.repo.findBySourceUrl(sourceUrl);
    if (existing && LIVE_STATUSES.includes(existing.status)) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: CURATED_INGEST_COPY.duplicate(existing.status.toLowerCase()),
      });
    }
    await this.assertBudget();

    const via: CuratedIngestVia = isSupportedVideoUrl(sourceUrl) ? 'video' : 'web';
    const draft = existing
      ? await this.deps.repo.update(existing.id, {
          ...this.resetPatch(),
          rejectReason: null,
          reviewedById: null,
          reviewedAt: null,
        })
      : await this.deps.repo.create({
          sourceUrl,
          submittedUrl: rawUrl.trim(),
          via,
          createdById: adminId,
        });
    this.deps.runInBackground(() => this.extract(draft.id));
    return draft;
  }

  /** Re-runs a failed extraction (counts against the daily cap). */
  async retry(id: string): Promise<CuratedRecipeDraft> {
    const draft = await this.require(id);
    if (draft.status !== 'FAILED') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only a failed draft can be retried.' });
    }
    await this.assertBudget();
    const updated = await this.deps.repo.update(id, this.resetPatch());
    this.deps.runInBackground(() => this.extract(id));
    return updated;
  }

  private resetPatch() {
    return {
      status: 'EXTRACTING' as const,
      error: null,
      submittedAt: new Date(),
    };
  }

  /**
   * The background half of ingest: read the link, rewrite the prose, match
   * the catalog, store the DRAFT. Any failure lands as FAILED with a reason
   * the queue shows (the AI-quota case says so plainly).
   */
  async extract(id: string): Promise<void> {
    const row = await this.deps.repo.findById(id);
    if (row?.status !== 'EXTRACTING') return;
    try {
      const read =
        row.via === 'video'
          ? await this.readVideo(row.sourceUrl)
          : await this.readPage(row.sourceUrl);
      let recipe = toDraftRecipe(read.recipe);
      const assumptions = [...read.assumptions];

      let proseStatus: 'ORIGINAL' | 'REWRITTEN' = 'ORIGINAL';
      try {
        recipe = { ...recipe, ...(await this.rewrite(recipe)) };
        proseStatus = 'REWRITTEN';
      } catch (err) {
        assumptions.unshift(
          `Prose not rewritten: ${aiFailureMessage(err, 'the rewrite failed')} Use "Rewrite in Chefer's voice" or edit it by hand.`,
        );
      }
      recipe = { ...recipe, ingredients: await this.withGlobalSlugs(recipe.ingredients) };

      const mealGuess = inferMealTypeFromName(recipe.name);
      const patch = {
        status: 'DRAFT' as const,
        draft: recipe,
        mealTypes: mealGuess ? [mealGuess] : [],
        proseStatus,
        assumptions: assumptions.slice(0, 12),
        notFound: read.notFound,
        platform: read.platform,
        creator: read.creator,
        sourceTitle: read.title,
        transcriptSource: read.transcriptSource,
        error: null,
      };
      const canonical = read.sourceUrl ? normaliseCuratedUrl(read.sourceUrl) : row.sourceUrl;
      if (canonical !== row.sourceUrl) {
        const other = await this.deps.repo.findBySourceUrl(canonical);
        if (other && other.id !== id) {
          await this.deps.repo.updateIfStatus(id, ['EXTRACTING'], {
            status: 'FAILED',
            error: CURATED_INGEST_COPY.duplicate(other.status.toLowerCase()),
          });
          return;
        }
      }
      await this.deps.repo.updateIfStatus(id, ['EXTRACTING'], {
        ...patch,
        ...(canonical !== row.sourceUrl ? { sourceUrl: canonical } : {}),
      });
    } catch (err) {
      console.warn(`[curated-ingest] extraction failed for ${row.sourceUrl}`, err);
      await this.deps.repo.updateIfStatus(id, ['EXTRACTING'], {
        status: 'FAILED',
        error: aiFailureMessage(err, "We couldn't read a recipe from that link."),
      });
    }
  }

  private async readVideo(url: string) {
    const result = await this.deps.video.extract(url);
    return {
      recipe: result.recipe,
      assumptions: result.assumptions,
      notFound: findNotFoundFields(result.recipe, result.sourceText),
      sourceUrl: result.sourceUrl,
      platform: result.platform as string | null,
      creator: result.creator,
      title: result.title.slice(0, 200) || null,
      transcriptSource: result.stage as string,
    };
  }

  private async readPage(url: string) {
    const { html, finalUrl } = await this.deps.fetchPage(url);
    const content = extractPageContent(html, finalUrl);
    if (content.aiText.trim().length < 40) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'That page has no readable content.' });
    }
    let extraction;
    try {
      extraction = await this.deps.ai.extractRecipeAnnotated({ url, text: content.aiText });
    } catch (err) {
      throw toFriendlyAiError(
        err,
        'curatedIngest.extract',
        "We couldn't read a recipe from that page.",
      );
    }
    const { recipe } = extraction;
    if (recipe.name.trim() === NO_RECIPE_SENTINEL || recipe.ingredients.length === 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: "Couldn't find a recipe on that page." });
    }
    const title = /<title[^>]*>([^<]{1,200})/i.exec(html)?.[1]?.trim() ?? null;
    return {
      recipe,
      assumptions: extraction.assumptions,
      notFound: findNotFoundFields(recipe, content.aiText),
      sourceUrl: finalUrl,
      platform: new URL(finalUrl).hostname.replace(/^www\./, ''),
      creator: null,
      title,
      transcriptSource: 'page',
    };
  }

  private async rewrite(recipe: CuratedDraftRecipe) {
    const out = await this.deps.ai.rewriteRecipeProse({
      name: recipe.name,
      description: recipe.description,
      ingredients: recipe.ingredients.map((i) => i.name),
      instructions: recipe.instructions,
    });
    return {
      name: out.name.trim().slice(0, 120) || recipe.name,
      description: out.description.trim().slice(0, 500) || recipe.description,
      // An empty method in the answer means "no change": the steps are facts.
      instructions:
        out.instructions.length > 0
          ? out.instructions
              .map((s) => s.trim().slice(0, 500))
              .filter(Boolean)
              .slice(0, 30)
          : recipe.instructions,
    };
  }

  /** Sets `slug` on every line that matches a GLOBAL catalog row exactly or by alias. */
  private async withGlobalSlugs(lines: CuratedDraftRecipe['ingredients']) {
    const open = lines.filter((l) => !l.slug);
    if (open.length === 0) return lines;
    const resolved = await this.deps.resolver.resolveMany(
      open.map((l) => ({ rawName: l.name, unit: l.unit })),
      null,
      { candidates: false },
    );
    const slugs = new Map(open.map((l, i) => [l, resolved[i]?.match?.slug] as const));
    return lines.map((l) => {
      const slug = slugs.get(l);
      return slug ? { ...l, slug } : l;
    });
  }

  // ─── Review ─────────────────────────────────────────────────────────────────

  async list(statuses: CuratedDraftStatus[], limit = 100): Promise<CuratedRecipeDraft[]> {
    return this.deps.repo.list(statuses, limit);
  }

  async counts() {
    return this.deps.repo.countByStatus();
  }

  async get(id: string): Promise<{ draft: CuratedRecipeDraft; review: CuratedDraftReview | null }> {
    const draft = await this.require(id);
    const recipe = parseDraftRecipe(draft);
    return { draft, review: recipe ? await this.review(draft, recipe) : null };
  }

  /** Saves the admin's edits to a DRAFT. Changing the prose by hand marks it EDITED. */
  async update(
    id: string,
    edit: { draft?: CuratedDraftRecipe | undefined; mealTypes?: CuratedMealType[] | undefined },
  ): Promise<CuratedRecipeDraft> {
    const row = await this.require(id);
    if (row.status !== 'DRAFT') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Only a draft waiting for review can be edited.',
      });
    }
    const current = parseDraftRecipe(row);
    const next = edit.draft ?? current;
    const proseStatus =
      edit.draft && current && proseChanged(current, edit.draft) ? 'EDITED' : row.proseStatus;
    const ok = await this.deps.repo.updateIfStatus(id, ['DRAFT'], {
      ...(next
        ? { draft: { ...next, ingredients: await this.withGlobalSlugs(next.ingredients) } }
        : {}),
      ...(edit.mealTypes ? { mealTypes: [...new Set(edit.mealTypes)] } : {}),
      proseStatus,
    });
    if (!ok)
      throw new TRPCError({ code: 'CONFLICT', message: 'This draft was reviewed meanwhile.' });
    return this.require(id);
  }

  /** Re-runs the prose rewrite on a DRAFT (one AI call; refused once the day's cap is used). */
  async rewriteProse(id: string): Promise<CuratedRecipeDraft> {
    const row = await this.require(id);
    const recipe = parseDraftRecipe(row);
    if (row.status !== 'DRAFT' || !recipe) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Only a draft waiting for review can be rewritten.',
      });
    }
    await this.assertBudget();
    let rewritten;
    try {
      rewritten = await this.rewrite(recipe);
    } catch (err) {
      if (isAiCapacityFailure(err)) {
        throw new TRPCError({
          code: 'SERVICE_UNAVAILABLE',
          message: CURATED_INGEST_COPY.aiQuotaExhausted,
        });
      }
      throw toFriendlyAiError(err, 'curatedIngest.rewrite', "The rewrite didn't work — try again.");
    }
    await this.deps.repo.updateIfStatus(id, ['DRAFT'], {
      draft: { ...recipe, ...rewritten },
      proseStatus: 'REWRITTEN',
      assumptions: row.assumptions.filter((a) => !a.startsWith('Prose not rewritten')),
    });
    return this.require(id);
  }

  async reject(
    adminId: string,
    id: string,
    reason: string | undefined,
  ): Promise<CuratedRecipeDraft> {
    const ok = await this.deps.repo.updateIfStatus(id, ['DRAFT', 'FAILED'], {
      status: 'REJECTED',
      rejectReason: reason?.trim() ? reason.trim() : null,
      reviewedById: adminId,
      reviewedAt: new Date(),
    });
    if (!ok)
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Only a draft or a failed link can be rejected.',
      });
    return this.require(id);
  }

  /** Takes an approved recipe out of the pool; plans that hold it keep it. */
  async unpublish(adminId: string, id: string): Promise<CuratedRecipeDraft> {
    const ok = await this.deps.repo.updateIfStatus(id, ['APPROVED'], {
      status: 'UNPUBLISHED',
      reviewedById: adminId,
      reviewedAt: new Date(),
    });
    if (!ok)
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Only an approved recipe can be unpublished.',
      });
    this.deps.onPoolChanged();
    return this.require(id);
  }

  /**
   * DRAFT → APPROVED: the gates (complete, prose rewritten, every line on a
   * global catalog row, nutrition computes, no allergen hidden behind a line
   * name), then one transaction writes the CURATED recipe. Diet tags are
   * derived from the ingredients, never trusted from the extractor.
   */
  async approve(
    adminId: string,
    id: string,
    edit: {
      draft?: CuratedDraftRecipe | undefined;
      mealTypes?: CuratedMealType[] | undefined;
    } = {},
  ): Promise<{ draft: CuratedRecipeDraft; recipeId: string }> {
    if (edit.draft || edit.mealTypes) await this.update(id, edit);
    const row = await this.require(id);
    const recipe = parseDraftRecipe(row);
    if (row.status !== 'DRAFT' || !recipe) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Only a draft waiting for review can be approved.',
      });
    }
    const computed = await this.compute(recipe);
    const review = this.reviewFrom(row, recipe, computed);
    if (review.blockers.length > 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: review.blockers.join(' ') });
    }

    const lines: RecipeLineWrite[] = recipe.ingredients.map((l, k) => ({
      ingredientId: computed.ids[k] ?? null,
      rawName: l.name,
      quantity: l.quantity,
      unit: l.unit,
      grams: computed.result.lines[k]?.grams ?? null,
      note: l.note ?? null,
      optional: l.optional ?? false,
    }));
    const final: CuratedDraftRecipe = {
      ...recipe,
      ingredients: recipe.ingredients.map((l, k) => {
        const slug = computed.slugs[k];
        return slug ? { ...l, slug } : l;
      }),
      dietaryTags: review.dietaryTags,
    };
    try {
      const { draft, recipe: created } = await this.deps.repo.publish(id, {
        recipe: {
          name: final.name,
          description: final.description,
          ingredients: [],
          instructions: final.instructions,
          nutritionInfo: computed.result.perServing,
          cuisineType: final.cuisineType,
          dietaryTags: final.dietaryTags,
          prepTimeMins: final.prepTimeMins,
          cookTimeMins: final.cookTimeMins,
          servings: final.servings,
          sourceUrl: row.sourceUrl,
        },
        lines,
        nutrition: {
          status: 'COMPUTED',
          perServing: computed.result.perServing,
          total: computed.result.total,
        },
        draft: final,
        mealTypes: row.mealTypes,
        reviewedById: adminId,
      });
      this.deps.onImageQueued();
      this.deps.onPoolChanged();
      return { draft, recipeId: created.id };
    } catch (err) {
      if (err instanceof CuratedDraftStateError) {
        throw new TRPCError({ code: 'CONFLICT', message: 'This draft was reviewed meanwhile.' });
      }
      throw err;
    }
  }

  private async require(id: string): Promise<CuratedRecipeDraft> {
    const draft = await this.deps.repo.findById(id);
    if (!draft) throw new TRPCError({ code: 'NOT_FOUND', message: 'Draft not found.' });
    return draft;
  }

  /** Resolves every line to a GLOBAL catalog row and computes the nutrition against globals only. */
  private async compute(recipe: CuratedDraftRecipe) {
    const slugIds = await this.deps.ingredients.findGlobalIdsBySlugs(
      recipe.ingredients.flatMap((l) => (l.slug ? [l.slug] : [])),
    );
    const unslugged = recipe.ingredients.filter((l) => !l.slug || !slugIds.has(l.slug));
    const resolved = await this.deps.resolver.resolveMany(
      unslugged.map((l) => ({ rawName: l.name, unit: l.unit })),
      null,
      { candidates: true },
    );
    const byLine = new Map(unslugged.map((l, i) => [l, resolved[i]] as const));
    const ids = recipe.ingredients.map((l) =>
      l.slug && slugIds.has(l.slug)
        ? (slugIds.get(l.slug) ?? null)
        : (byLine.get(l)?.match?.id ?? null),
    );
    const { result, rows } = await this.deps.nutrition.compute(
      recipe.ingredients.map((l, k) => ({
        ingredientId: ids[k] ?? null,
        rawName: l.name,
        quantity: l.quantity,
        unit: l.unit,
        optional: l.optional,
      })),
      null,
      recipe.servings,
    );
    const slugs = ids.map((i) => (i ? (rows.get(i)?.slug ?? null) : null));
    const catalogNames = ids.map((i) => (i ? (rows.get(i)?.name ?? null) : null));
    const candidates = recipe.ingredients.map((l) =>
      (byLine.get(l)?.candidates ?? []).map((c) => toRef(c, null)),
    );
    const matches = ids.map((i) => {
      const row = i ? rows.get(i) : undefined;
      return row ? toRef(row, null) : null;
    });
    return { ids, slugs, catalogNames, candidates, matches, result };
  }

  private async review(
    row: CuratedRecipeDraft,
    recipe: CuratedDraftRecipe,
  ): Promise<CuratedDraftReview> {
    return this.reviewFrom(row, recipe, await this.compute(recipe));
  }

  private reviewFrom(
    row: CuratedRecipeDraft,
    recipe: CuratedDraftRecipe,
    computed: Awaited<ReturnType<CuratedIngestService['compute']>>,
  ): CuratedDraftReview {
    const { result } = computed;
    const status = result.status === 'COMPUTED' ? 'COMPUTED' : 'PARTIAL';
    const checkable = {
      ...recipe,
      nutritionInfo: result.perServing,
      nutritionStatus: status,
    };
    const dietaryTags = finaliseDietaryTags(recipe.dietaryTags, deriveCuratedDietTags(checkable));
    const served = { ...checkable, dietaryTags };
    const hiddenAllergens = findHiddenAllergens(recipe, computed.catalogNames);

    const blockers: string[] = [];
    const complete =
      recipe.name.trim() &&
      recipe.description.trim() &&
      recipe.ingredients.length > 0 &&
      recipe.instructions.length > 0 &&
      row.mealTypes.some((t) => (CURATED_MEAL_TYPES as readonly string[]).includes(t));
    if (!complete) blockers.push(CURATED_INGEST_COPY.incomplete);
    if (row.proseStatus === 'ORIGINAL') blockers.push(CURATED_INGEST_COPY.proseNotRewritten);
    const unmatched = recipe.ingredients.filter((_, k) => !computed.ids[k]).map((l) => l.name);
    if (unmatched.length > 0) blockers.push(CURATED_INGEST_COPY.unresolvedLines(unmatched));
    const unitProblems = result.lines
      .filter((l) => l.problem && computed.ids[l.position])
      .map((l) => `${recipe.ingredients[l.position]?.name ?? '?'} (${l.problem})`);
    if (unitProblems.length > 0) {
      blockers.push(`These amounts can't be converted to grams: ${unitProblems.join(', ')}.`);
    }
    for (const h of hiddenAllergens) {
      blockers.push(
        `"${h.line}" is ${h.catalogName} in the catalog, which is not ${h.term}-safe — name the line so the ${h.term} conflict is visible (e.g. "${h.catalogName.toLowerCase()}").`,
      );
    }

    return {
      lines: recipe.ingredients.map((_, k) => ({
        match: computed.matches[k] ?? null,
        candidates: computed.candidates[k] ?? [],
        grams: result.lines[k]?.grams ?? null,
        problem: result.lines[k]?.problem ?? null,
      })),
      nutrition: { status, perServing: result.perServing },
      dietaryTags,
      safety: curatedSafetyProfile(served),
      hiddenAllergens,
      blockers,
    };
  }
}
