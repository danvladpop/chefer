import { randomBytes } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { shareCardRepository, type IShareCardRepository, type Recipe } from '@chefer/database';
import type {
  CreateShareCardParsed,
  ShareCardDto,
  ShareCardLink,
  ShareCardPayload,
} from '@chefer/types';
import { env } from '../../lib/env.js';
import { gymStatsService, type GymStatsService } from '../gym/gym-stats.service.js';
import { recapService, type RecapService } from '../recap/recap.service.js';
import { findRecipeVisibleTo } from '../recipe/recipe-access.js';

// ─── Share cards (market review 2026-10, lane E2) ────────────────────────────
// `create` snapshots ONLY what the card shows into a ShareCard row and hands
// back the public link; `get` reads it for the web image route and landing
// page. The snapshot follows the Following privacy rules: no allergies,
// diets, body weight, logged meals, notes or names. Nutrition and protein
// days appear only when the create call opts in.

const NOT_FOUND = 'That isn’t available to share.';

type Deps = {
  repo: IShareCardRepository;
  findRecipe: (userId: string, recipeId: string) => Promise<Recipe | null>;
  gym: Pick<GymStatsService, 'sessionShareFacts'>;
  recap: Pick<RecapService, 'week'>;
  newId: () => string;
  appUrl: string;
  /** Where relative upload paths (`/uploads/…`) are served from. */
  mediaUrl: string;
};

const defaultDeps: Deps = {
  repo: shareCardRepository,
  findRecipe: (userId, recipeId) => findRecipeVisibleTo(userId, recipeId),
  gym: gymStatsService,
  recap: recapService,
  newId: () => randomBytes(10).toString('hex'),
  appUrl: env.APP_URL,
  mediaUrl: env.API_PUBLIC_URL ?? env.APP_URL,
};

function absolute(url: string | null, base: string): string | null {
  if (!url) return null;
  if (url.startsWith('https://')) return url;
  if (url.startsWith('/')) return new URL(url, base).toString();
  return null;
}

function nutritionOf(recipe: Recipe): { kcal: number; proteinG: number } | null {
  const info = recipe.nutritionInfo as { calories?: unknown; protein?: unknown } | null;
  const kcal = typeof info?.calories === 'number' ? Math.round(info.calories) : null;
  const protein = typeof info?.protein === 'number' ? Math.round(info.protein) : null;
  return kcal !== null && protein !== null ? { kcal, proteinG: protein } : null;
}

export class ShareService {
  private readonly deps: Deps;

  constructor(deps: Partial<Deps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  private async payloadFor(
    userId: string,
    input: CreateShareCardParsed,
  ): Promise<ShareCardPayload> {
    switch (input.kind) {
      case 'recipe':
      case 'cook': {
        const recipe = await this.deps.findRecipe(userId, input.recipeId);
        if (!recipe) throw new TRPCError({ code: 'NOT_FOUND', message: NOT_FOUND });
        const minutes = recipe.prepTimeMins + recipe.cookTimeMins;
        const nutrition = input.showNutrition ? nutritionOf(recipe) : null;
        return {
          kind: input.kind,
          title: recipe.name,
          imageUrl: absolute(recipe.imageUrl, this.deps.mediaUrl),
          totalMinutes: minutes > 0 ? minutes : null,
          servings: recipe.servings > 0 ? recipe.servings : null,
          ...(nutrition && { nutrition }),
        };
      }
      case 'workout': {
        const facts = await this.deps.gym.sessionShareFacts(userId, input.sessionId);
        if (!facts) throw new TRPCError({ code: 'NOT_FOUND', message: NOT_FOUND });
        const { prs, ...rest } = facts;
        return { kind: 'workout', ...rest, ...(input.showPrs && prs.length > 0 && { prs }) };
      }
      case 'recap': {
        const week = await this.deps.recap.week(userId, {
          weekStart: input.weekStart,
          localDate: input.localDate,
        });
        return {
          kind: 'recap',
          label: week.label,
          ...(input.include.cooking && {
            cooking: {
              cookedFromPlan: week.food.cookedFromPlan,
              newRecipesTried: week.food.newRecipesTried,
            },
          }),
          ...(input.include.protein && week.food.proteinDays && { protein: week.food.proteinDays }),
          ...(input.include.training &&
            week.gym && {
              training: {
                sessions: week.gym.sessions,
                prCount: week.gym.prCount,
                streakWeeks: week.gym.streakWeeks,
              },
            }),
        };
      }
    }
  }

  async create(userId: string, input: CreateShareCardParsed): Promise<ShareCardLink> {
    const payload = await this.payloadFor(userId, input);
    const id = this.deps.newId();
    await this.deps.repo.create({ id, userId, kind: input.kind, payload });
    const url = new URL(`/s/${id}`, this.deps.appUrl).toString();
    return { id, url, imageUrl: `${url}/image` };
  }

  async get(id: string): Promise<ShareCardDto> {
    const row = await this.deps.repo.findById(id);
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: NOT_FOUND });
    return {
      id: row.id,
      payload: row.payload as unknown as ShareCardPayload,
      createdAt: row.createdAt,
    };
  }
}

export const shareService = new ShareService();
