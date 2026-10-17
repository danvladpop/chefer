import { StyleSheet, type ImageProps } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { RecipeImage } from '../../src/features/recipes/recipe-image';

// F3 (feedback 2026-10-17): the recipe hero looked "distorted". On the iOS
// simulator and the Pixel_8 a geometric test pattern rendered with round
// circles (ratio 1.000) in the 16:9-ish hero: the photo is cropped, never
// stretched. The warping is in the generated source (the 512×384 Pollinations
// fallback), see docs/backlog-2026-10/feedback-2026-10-17/evidence/s3-README.md.
// These tests keep the crop: a 4:3 or 1:1 source in a wider frame must keep
// its aspect, whatever size classes or computed height the caller passes.

describe('RecipeImage', () => {
  it('crops the photo to its frame instead of stretching it (cover)', async () => {
    await render(
      <RecipeImage
        testID="recipe-hero"
        imageUrl="https://example.com/dish.jpg"
        className="w-full overflow-hidden rounded-card"
        style={{ height: 224 }}
      />,
    );

    const props = screen.getByTestId('recipe-hero').props as ImageProps;
    expect(props.resizeMode).toBe('cover');
    // A caller's style may size the frame but must not change how the photo fits.
    const flat = StyleSheet.flatten(props.style);
    expect(flat.resizeMode ?? 'cover').toBe('cover');
    expect(flat.objectFit ?? 'cover').toBe('cover');
    expect(flat.height).toBe(224);
  });

  it('keeps cover on card and tile sizes too', async () => {
    await render(<RecipeImage testID="recipe-card" imageUrl={null} className="h-40 w-full" />);

    const props = screen.getByTestId('recipe-card').props as ImageProps;
    expect(props.resizeMode).toBe('cover');
  });
});
