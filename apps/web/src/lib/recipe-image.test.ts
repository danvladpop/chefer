import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRecipeImageProps, getRecipeImageUrl } from './recipe-image';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getRecipeImageUrl', () => {
  it.each([null, undefined, ''])('has no image for %j — never a stock fallback', (imageUrl) => {
    expect(getRecipeImageUrl(imageUrl)).toBeNull();
  });

  it('returns a full URL as-is', () => {
    expect(getRecipeImageUrl('https://example.com/a.jpg')).toBe('https://example.com/a.jpg');
  });

  it('builds a Cloudinary URL from a bare public_id', () => {
    vi.stubEnv('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', 'demo');
    expect(getRecipeImageUrl('recipes/curry')).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_800,h_600,c_fill/recipes/curry',
    );
  });

  it('has no image for a bare public_id when no cloud is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', '');
    expect(getRecipeImageUrl('recipes/curry')).toBeNull();
  });
});

describe('getRecipeImageProps', () => {
  it('is null when the recipe has no image', () => {
    expect(getRecipeImageProps(null)).toBeNull();
  });

  it('optimizes configured hosts', () => {
    const props = getRecipeImageProps('https://res.cloudinary.com/demo/image/upload/a.jpg');
    expect(props).toMatchObject({
      src: 'https://res.cloudinary.com/demo/image/upload/a.jpg',
      placeholder: 'blur',
    });
    expect(props).not.toHaveProperty('unoptimized');
  });

  it('renders other hosts unoptimized', () => {
    expect(getRecipeImageProps('https://blog.example.com/og.jpg')).toMatchObject({
      src: 'https://blog.example.com/og.jpg',
      unoptimized: true,
    });
  });
});
