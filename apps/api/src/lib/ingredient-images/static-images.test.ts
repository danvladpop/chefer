import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createStaticIngredientImages,
  INGREDIENT_STATIC_DIR,
  loadIngredientImageManifest,
  type IngredientImageManifest,
} from './static-images';

const entry = (file: string, names: string[], hash = 'abc12345') => ({
  file,
  hash,
  names,
  subject: file,
  prompt: 'p',
  source: 'pollinations/flux',
  date: '2026-10-07',
});

const FIXTURE: IngredientImageManifest = {
  version: 1,
  entries: {
    strawberry: entry('strawberry.webp', ['strawberries', 'strawberry']),
    'cherry tomato': entry('cherry-tomato.webp', ['cherry tomatoes', 'cherry tomato']),
    'frozen strawberry': entry('frozen-strawberry.webp', [
      'frozen strawberries',
      'frozen strawberry',
    ]),
    'olive oil': entry('olive-oil.webp', ['olive oil']),
  },
};

describe('createStaticIngredientImages', () => {
  const images = createStaticIngredientImages(FIXTURE, 'https://chefer.example/');

  it('builds an absolute, cache-busted public URL under /uploads/ingredients', () => {
    expect(images.urlFor('Strawberries')).toBe(
      'https://chefer.example/uploads/ingredients/strawberry.webp?v=abc12345',
    );
  });

  it('matches singular and plural wordings', () => {
    expect(images.urlFor('strawberry')).toContain('/strawberry.webp');
    expect(images.urlFor('Cherry tomato')).toContain('/cherry-tomato.webp');
  });

  it('falls back to the reduced key when prep notes or parentheticals follow the name', () => {
    expect(images.urlFor('Cherry tomatoes, halved')).toContain('/cherry-tomato.webp');
    expect(images.urlFor('Olive oil (extra virgin)')).toContain('/olive-oil.webp');
  });

  it('prefers the exact (more specific) wording over a shorter base name', () => {
    expect(images.urlFor('Frozen strawberries')).toContain('/frozen-strawberry.webp');
  });

  it('returns null for names without a vendored image', () => {
    expect(images.urlFor('dragon fruit')).toBeNull();
    expect(images.urlFor('')).toBeNull();
  });

  it('is empty-safe', () => {
    const empty = createStaticIngredientImages(
      { version: 1, entries: {} },
      'http://localhost:3001',
    );
    expect(empty.size).toBe(0);
    expect(empty.urlFor('strawberries')).toBeNull();
  });
});

describe('loadIngredientImageManifest', () => {
  it('returns null for a directory without a manifest', () => {
    expect(
      loadIngredientImageManifest(path.join(INGREDIENT_STATIC_DIR, 'does-not-exist')),
    ).toBeNull();
  });
});

// Guards the shipped data: every manifest entry must point at a real file.
describe('vendored manifest', () => {
  const manifest = loadIngredientImageManifest();

  it('has a manifest', () => {
    expect(manifest).not.toBeNull();
  });

  it('points every entry at an existing, small webp with at least one lookup name', () => {
    for (const [key, e] of Object.entries(manifest?.entries ?? {})) {
      const file = path.join(INGREDIENT_STATIC_DIR, e.file);
      expect(existsSync(file), `${key} → ${e.file}`).toBe(true);
      expect(statSync(file).size, `${e.file} size`).toBeLessThan(40_000);
      expect(e.file.endsWith('.webp')).toBe(true);
      expect(e.names.length, `${key} names`).toBeGreaterThan(0);
    }
  });

  it('resolves the names the tester saw blank on the shopping list', () => {
    if (!manifest) throw new Error('manifest missing');
    const images = createStaticIngredientImages(manifest, 'https://chefer.example');
    expect(images.urlFor('Strawberries')).not.toBeNull();
    expect(images.urlFor('Raspberries')).not.toBeNull();
  });
});
