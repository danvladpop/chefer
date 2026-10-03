import { describe, expect, it, vi } from 'vitest';
import type { Recipe } from '@chefer/database';
import type { SectionAccess } from '@chefer/types';
import {
  findRecipeVisibleTo,
  friendsEnabledFor,
  isRecipeOpenTo,
  isRecipeVisibleTo,
  isSocialRecipeCandidate,
  recipeAttribution,
  type RecipeSocialDeps,
} from './recipe-access.js';

// Every test injects its repo + social deps: no real repository is reached.

const row = (
  source: Recipe['source'],
  creatorId: string | null,
  over: Partial<Recipe> = {},
): Recipe =>
  ({
    id: 'r1',
    source,
    creatorId,
    originRecipeId: null,
    originCreatorId: null,
    hiddenAt: null,
    hiddenReason: null,
    deletedAt: null,
    ...over,
  }) as Recipe;

const repoWith = (recipe: Recipe | null, inPlans = false) => ({
  findRecipeById: vi.fn().mockResolvedValue(recipe),
  isRecipeInUserPlans: vi.fn().mockResolvedValue(inPlans),
});

function socialWith(opts: { enabled?: boolean; access?: SectionAccess; hearted?: boolean } = {}) {
  return {
    isEnabled: vi.fn<[string], Promise<boolean>>().mockResolvedValue(opts.enabled ?? true),
    recipesAccess: vi
      .fn<[string, string], Promise<SectionAccess>>()
      .mockResolvedValue(opts.access ?? 'visible'),
    hasHearted: vi
      .fn<[string, string], Promise<boolean>>()
      .mockResolvedValue(opts.hearted ?? false),
  } satisfies RecipeSocialDeps;
}

const CLOSED = socialWith({ enabled: false });

describe('isRecipeOpenTo', () => {
  it('opens curated and AI recipes to everyone', () => {
    expect(isRecipeOpenTo(row('CURATED', null), 'u2')).toBe(true);
    expect(isRecipeOpenTo(row('AI', 'u1'), 'u2')).toBe(true);
  });

  it('keeps a MANUAL recipe private to its creator', () => {
    expect(isRecipeOpenTo(row('MANUAL', 'u1'), 'u1')).toBe(true);
    expect(isRecipeOpenTo(row('MANUAL', 'u1'), 'u2')).toBe(false);
  });
});

describe('findRecipeVisibleTo', () => {
  it("hides another user's private recipe (F-REC-2-1)", async () => {
    const repo = repoWith(row('MANUAL', 'victim'));
    expect(await findRecipeVisibleTo('attacker', 'r1', repo, CLOSED)).toBeNull();
  });

  it("shows another user's recipe when it is already in the caller's own plan", async () => {
    const recipe = row('MANUAL', 'someone');
    const repo = repoWith(recipe, true);
    expect(await findRecipeVisibleTo('u2', 'r1', repo, CLOSED)).toBe(recipe);
    expect(repo.isRecipeInUserPlans).toHaveBeenCalledWith('u2', 'r1');
  });

  it('skips the plan lookup for open recipes and returns null for missing ones', async () => {
    const open = repoWith(row('CURATED', null));
    expect(await findRecipeVisibleTo('u2', 'r1', open, CLOSED)).not.toBeNull();
    expect(open.isRecipeInUserPlans).not.toHaveBeenCalled();
    expect(await findRecipeVisibleTo('u2', 'r1', repoWith(null), CLOSED)).toBeNull();
  });
});

describe('findRecipeVisibleTo — Following branch (plan §4.3)', () => {
  it("opens a followed creator's original MANUAL recipe when their recipes are visible", async () => {
    const recipe = row('MANUAL', 'maria');
    const social = socialWith();
    expect(await findRecipeVisibleTo('me', 'r1', repoWith(recipe), social)).toBe(recipe);
    expect(social.recipesAccess).toHaveBeenCalledWith('me', 'maria');
    // Not hidden → no heart lookup.
    expect(social.hasHearted).not.toHaveBeenCalled();
  });

  it('includes imported recipes (sourceUrl set, Q-F-7)', async () => {
    const recipe = row('MANUAL', 'maria', { sourceUrl: 'https://www.bbcgoodfood.com/x' });
    expect(await findRecipeVisibleTo('me', 'r1', repoWith(recipe), socialWith())).toBe(recipe);
  });

  it.each<SectionAccess>(['locked', 'not_shared'])(
    'stays closed when recipes are %s',
    async (a) => {
      const recipe = row('MANUAL', 'maria');
      expect(
        await findRecipeVisibleTo('me', 'r1', repoWith(recipe), socialWith({ access: a })),
      ).toBeNull();
    },
  );

  it('kill switch: Following off for the viewer → closed, and no social lookup at all', async () => {
    const social = socialWith({ enabled: false });
    expect(
      await findRecipeVisibleTo('me', 'r1', repoWith(row('MANUAL', 'maria')), social),
    ).toBeNull();
    expect(social.recipesAccess).not.toHaveBeenCalled();
  });

  it("never opens someone's COPY of another recipe (no laundering, PRD §13)", async () => {
    const copy = row('MANUAL', 'maria', { originRecipeId: 'orig', originCreatorId: 'ana' });
    const social = socialWith();
    expect(await findRecipeVisibleTo('me', 'r1', repoWith(copy), social)).toBeNull();
    expect(social.isEnabled).not.toHaveBeenCalled();
  });

  it('auto-hidden: open only to a viewer who hearted it before the hide', async () => {
    const hidden = row('MANUAL', 'maria', { hiddenAt: new Date(), hiddenReason: 'REPORTS' });
    expect(
      await findRecipeVisibleTo('me', 'r1', repoWith(hidden), socialWith({ hearted: false })),
    ).toBeNull();
    const social = socialWith({ hearted: true });
    expect(await findRecipeVisibleTo('me', 'r1', repoWith(hidden), social)).toBe(hidden);
    expect(social.hasHearted).toHaveBeenCalledWith('me', 'r1');
  });

  it('isRecipeVisibleTo works on a loaded row with the same rules', async () => {
    const repo = repoWith(null);
    expect(await isRecipeVisibleTo('me', row('MANUAL', 'maria'), repo, socialWith())).toBe(true);
    expect(await isRecipeVisibleTo('me', row('MANUAL', 'maria'), repo, CLOSED)).toBe(false);
    expect(await isRecipeVisibleTo('me', row('MANUAL', 'me'), repo, CLOSED)).toBe(true);
  });

  it('isSocialRecipeCandidate: only another user’s original MANUAL recipe', () => {
    expect(isSocialRecipeCandidate(row('MANUAL', 'maria'), 'me')).toBe(true);
    expect(isSocialRecipeCandidate(row('MANUAL', 'me'), 'me')).toBe(false);
    expect(isSocialRecipeCandidate(row('AI', 'maria'), 'me')).toBe(false);
    expect(isSocialRecipeCandidate(row('MANUAL', null), 'me')).toBe(false);
    expect(isSocialRecipeCandidate(row('MANUAL', 'maria', { originRecipeId: 'x' }), 'me')).toBe(
      false,
    );
  });
});

describe('friendsEnabledFor', () => {
  it('fails closed: false when the flag is off or the env cannot load, never a throw', async () => {
    // Unit tests run with no FEATURE_FLAGS (or no env at all).
    await expect(friendsEnabledFor('me')).resolves.toBe(false);
  });
});

describe('recipeAttribution', () => {
  const MARIA = { firstName: 'Maria', lastName: 'Pop', name: null };

  it('creator on another user’s MANUAL recipe, only while Following is on', () => {
    const r = row('MANUAL', 'maria');
    expect(recipeAttribution('me', r, { creator: MARIA }, { friendsOn: true })).toEqual({
      creator: { id: 'maria', displayName: 'Maria Pop', firstName: 'Maria' },
    });
    expect(recipeAttribution('me', r, { creator: MARIA }, { friendsOn: false })).toEqual({});
  });

  it('origin on the viewer’s copy, with the original creator’s first name', () => {
    const copy = row('MANUAL', 'me', { originRecipeId: 'orig', originCreatorId: 'maria' });
    expect(recipeAttribution('me', copy, { originCreator: MARIA }, { friendsOn: false })).toEqual({
      origin: { creatorFirstName: 'Maria' },
    });
    // The original was deleted (originRecipeId SetNull) but its owner remains.
    const orphan = row('MANUAL', 'me', { originCreatorId: 'maria' });
    expect(recipeAttribution('me', orphan, { originCreator: MARIA }, { friendsOn: true })).toEqual({
      origin: { creatorFirstName: 'Maria' },
    });
    // Origin creator's name not loaded → null (`From another Chefer cook`).
    expect(recipeAttribution('me', copy, {}, { friendsOn: true })).toEqual({
      origin: { creatorFirstName: null },
    });
  });

  it('hidden only for the owner, and only when asked for', () => {
    const own = row('MANUAL', 'me', { hiddenAt: new Date(), hiddenReason: 'FILTER' });
    expect(recipeAttribution('me', own, {}, { friendsOn: true, withHidden: true })).toEqual({
      hidden: { reason: 'FILTER' },
    });
    expect(recipeAttribution('me', own, {}, { friendsOn: true })).toEqual({});
    const theirs = row('MANUAL', 'maria', { hiddenAt: new Date(), hiddenReason: 'REPORTS' });
    expect(
      recipeAttribution('me', theirs, { creator: MARIA }, { friendsOn: true, withHidden: true }),
    ).not.toHaveProperty('hidden');
  });

  it('a plain own recipe and open recipes get no keys at all (INV-8)', () => {
    expect(recipeAttribution('me', row('MANUAL', 'me'), {}, { friendsOn: true })).toEqual({});
    expect(recipeAttribution('me', row('AI', null), {}, { friendsOn: true })).toEqual({});
    expect(recipeAttribution('me', row('CURATED', null), {}, { friendsOn: true })).toEqual({});
  });
});

describe('isRecipeVisibleTo — soft-deleted recipes (UX-REC-04)', () => {
  const deleted = (over: Partial<Recipe> = {}) =>
    row('MANUAL', 'u1', { deletedAt: new Date('2026-10-03'), ...over });

  it('hides a deleted own recipe that sits in no plan', async () => {
    const repo = repoWith(deleted(), false);
    expect(await findRecipeVisibleTo('u1', 'r1', repo, CLOSED)).toBeNull();
  });

  it('still resolves it as a tombstone while a plan slot holds it', async () => {
    const repo = repoWith(deleted(), true);
    expect(await findRecipeVisibleTo('u1', 'r1', repo, CLOSED)).not.toBeNull();
  });

  it('never opens a deleted original to a follower', async () => {
    const repo = repoWith(deleted(), false);
    const social = socialWith({ enabled: true, access: 'visible' });
    expect(await findRecipeVisibleTo('u2', 'r1', repo, social)).toBeNull();
  });
});
