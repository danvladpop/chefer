// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  RECIPE_DELETE_UNDO_WINDOW_MS,
  takeRecipeDeleteUndo,
  writeRecipeDeleteUndo,
} from './recipe-delete-undo';

beforeEach(() => sessionStorage.clear());

describe('recipe delete Undo handoff (UX-REC-04)', () => {
  it('returns a fresh offer once, then nothing', () => {
    writeRecipeDeleteUndo({ recipeId: 'r1', name: 'Soup' }, 1_000);
    expect(takeRecipeDeleteUndo(2_000)).toEqual({ recipeId: 'r1', name: 'Soup', ts: 1_000 });
    expect(takeRecipeDeleteUndo(2_000)).toBeNull();
  });

  it('ignores a stale offer', () => {
    writeRecipeDeleteUndo({ recipeId: 'r1', name: 'Soup' }, 1_000);
    expect(takeRecipeDeleteUndo(1_000 + RECIPE_DELETE_UNDO_WINDOW_MS + 1)).toBeNull();
  });

  it('ignores malformed storage', () => {
    sessionStorage.setItem('chefer.last-recipe-delete', '{not json');
    expect(takeRecipeDeleteUndo()).toBeNull();
    sessionStorage.setItem('chefer.last-recipe-delete', JSON.stringify({ recipeId: 5 }));
    expect(takeRecipeDeleteUndo()).toBeNull();
  });
});
