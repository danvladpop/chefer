import { describe, expect, it, vi } from 'vitest';
import type { Recipe } from '@chefer/database';
import { RecipeCopyService } from './recipe-copy.service.js';

// INV-5 (PRD §13): what goes into the viewer's own records. The one-copy rule
// under concurrency lives in the repository's SERIALIZABLE find-or-create
// (favourite-recipe.repository.ts `findOrCreateCopy`), checked against a real
// database by the lane's concurrency script (see the L-XRECIPE report).

const recipe = (over: Partial<Recipe>): Recipe =>
  ({ id: 'r1', source: 'MANUAL', creatorId: 'maria', originRecipeId: null, ...over }) as Recipe;

function repoWith(copy: Recipe, created = true) {
  return { findOrCreateCopy: vi.fn().mockResolvedValue({ recipe: copy, created }) };
}

describe('RecipeCopyService.ownedRecipeFor / ownedIdFor', () => {
  it('open recipes (AI, CURATED) are used as they are — no copy', async () => {
    const repo = repoWith(recipe({ id: 'never' }));
    const service = new RecipeCopyService(repo);
    for (const source of ['AI', 'CURATED'] as const) {
      const r = recipe({ source, creatorId: null });
      await expect(service.ownedRecipeFor('me', r)).resolves.toEqual({
        recipe: r,
        copiedFromId: null,
        created: false,
      });
    }
    expect(repo.findOrCreateCopy).not.toHaveBeenCalled();
  });

  it('your own recipe (incl. your copies) is used as it is', async () => {
    const repo = repoWith(recipe({ id: 'never' }));
    const own = recipe({ creatorId: 'me', originRecipeId: 'x' });
    await expect(new RecipeCopyService(repo).ownedIdFor('me', own)).resolves.toBe('r1');
    expect(repo.findOrCreateCopy).not.toHaveBeenCalled();
  });

  it("another user's MANUAL recipe → your copy (made or reused)", async () => {
    const theirs = recipe({ id: 'theirs', sourceUrl: 'https://youtube.com/watch?v=1' });
    const copy = recipe({ id: 'copy', creatorId: 'me', originRecipeId: 'theirs' });
    const repo = repoWith(copy, false);
    const service = new RecipeCopyService(repo);

    await expect(service.ownedRecipeFor('me', theirs)).resolves.toEqual({
      recipe: copy,
      copiedFromId: 'theirs',
      created: false,
    });
    await expect(service.ownedIdFor('me', theirs)).resolves.toBe('copy');
    expect(repo.findOrCreateCopy).toHaveBeenCalledWith('me', theirs);
  });

  it('F3.1: an auto-hidden recipe of another user is never newly copied (NOT_FOUND)', async () => {
    const hidden = recipe({ id: 'theirs', hiddenAt: new Date('2026-09-30T10:00:00Z') });
    const repo = repoWith(recipe({ id: 'never' }));
    await expect(new RecipeCopyService(repo).ownedRecipeFor('me', hidden)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(repo.findOrCreateCopy).not.toHaveBeenCalled();
    // The owner's own hidden recipe is still theirs to use.
    const mine = recipe({ creatorId: 'me', hiddenAt: new Date('2026-09-30T10:00:00Z') });
    await expect(new RecipeCopyService(repo).ownedIdFor('me', mine)).resolves.toBe('r1');
  });
});
