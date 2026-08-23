import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  decodeEntities,
  extractJsonLdRecipe,
  extractOgImage,
  extractPageContent,
  stripToText,
} from './extract-content.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const load = (name: string) => readFileSync(join(FIXTURES, name), 'utf-8');

const jsonldBlog = load('jsonld-blog.html');
const plainArticle = load('plain-article.html');
const noRecipe = load('no-recipe.html');

describe('extractJsonLdRecipe', () => {
  it('finds the Recipe node inside an @graph and trims it to useful fields', () => {
    const json = extractJsonLdRecipe(jsonldBlog);
    expect(json).not.toBeNull();
    const parsed = JSON.parse(json ?? '{}') as Record<string, unknown>;
    expect(parsed['name']).toBe('Best Ever Peanut Chicken Satay');
    expect(parsed['recipeIngredient']).toContain('120 g peanut butter');
    expect(parsed['recipeYield']).toBe('4 servings');
    // Noise fields are dropped.
    expect(parsed['aggregateRating']).toBeUndefined();
  });

  it('returns null when the page has no Recipe JSON-LD', () => {
    expect(extractJsonLdRecipe(plainArticle)).toBeNull();
    expect(extractJsonLdRecipe(noRecipe)).toBeNull();
  });
});

describe('extractOgImage', () => {
  it('extracts an absolute og:image', () => {
    expect(extractOgImage(jsonldBlog, 'https://jennyskitchen.example/satay')).toBe(
      'https://cdn.jennyskitchen.example/images/satay-hero.jpg',
    );
  });

  it('resolves a relative og:image against the page URL', () => {
    expect(extractOgImage(plainArticle, 'https://slowpot.example/lentil-soup')).toBe(
      'https://slowpot.example/media/lentil-soup.webp',
    );
  });

  it('returns null when absent', () => {
    expect(extractOgImage(noRecipe, 'https://news.example/q3')).toBeNull();
  });
});

describe('stripToText', () => {
  it('keeps the recipe content and drops scripts, styles, nav and footer', () => {
    const text = stripToText(jsonldBlog);
    expect(text).toContain('500 g chicken breast');
    expect(text).toContain('Whisk peanut butter');
    expect(text).not.toContain('dataLayer'); // inline script gone
    expect(text).not.toContain('tracker.js');
    expect(text).not.toContain('font-family'); // style gone
    expect(text).not.toContain('Join 80,000 readers'); // nav gone
    expect(text).not.toContain('All rights reserved'); // footer gone
    expect(text).not.toContain('Trending now'); // aside gone
    expect(text).not.toContain('Subscribe'); // form gone
    expect(text).not.toMatch(/<[a-z]+[\s>]/i); // no tags survive
  });

  it('turns list items into readable lines and decodes entities', () => {
    const text = stripToText(plainArticle);
    expect(text).toContain('- 300 g red lentils');
    expect(text).toContain('- 1.5 l vegetable stock');
    const decoded = stripToText('<p>Fish &amp; chips &ndash; 1&frac12; hours</p>');
    expect(decoded).toContain('Fish & chips');
  });
});

describe('decodeEntities', () => {
  it('handles named, decimal and hex entities', () => {
    expect(decodeEntities('T&amp;T &#233;clair &#x2013; 250&nbsp;g')).toBe('T&T éclair – 250 g');
  });
});

describe('extractPageContent', () => {
  it('front-loads JSON-LD when present and flags it', () => {
    const content = extractPageContent(jsonldBlog, 'https://jennyskitchen.example/satay');
    expect(content.hasJsonLd).toBe(true);
    expect(content.aiText).toMatch(/^STRUCTURED RECIPE DATA/);
    expect(content.aiText).toContain('PAGE TEXT:');
    expect(content.ogImageUrl).toBe('https://cdn.jennyskitchen.example/images/satay-hero.jpg');
  });

  it('falls back to plain text when no JSON-LD exists', () => {
    const content = extractPageContent(plainArticle, 'https://slowpot.example/lentil-soup');
    expect(content.hasJsonLd).toBe(false);
    expect(content.aiText).toContain("Grandma's Lentil Soup");
    expect(content.aiText).toContain('- 300 g red lentils');
  });

  it('caps the AI text so a bloated page cannot blow up the prompt', () => {
    const huge = `<html><body><p>${'lorem ipsum '.repeat(10_000)}</p></body></html>`;
    const content = extractPageContent(huge, 'https://example.com/x');
    expect(content.aiText.length).toBeLessThanOrEqual(20_000);
  });
});
