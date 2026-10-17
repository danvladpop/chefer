import { render, screen } from '@testing-library/react-native';
import { RecipeImage } from '../../src/features/recipes/recipe-image';

// F3 (2026-10-17): a recipe waits PENDING with `imageUrl: null` until the
// server makes its photo. It used to show an unrelated Unsplash dish; now the
// image area is a placeholder that says the photo is coming (or not).

describe('RecipeImage without a photo', () => {
  it('shows a placeholder, not a stock photo, for a null image', async () => {
    await render(<RecipeImage testID="card" imageUrl={null} className="h-28 w-28" />);

    expect(screen.queryByTestId('card')).toBeNull();
    expect(screen.getByTestId('card-placeholder')).toBeTruthy();
    // A thumbnail stays wordless.
    expect(screen.queryByTestId('card-status')).toBeNull();
  });

  it('says the photo is being prepared while the recipe waits for it', async () => {
    await render(
      <RecipeImage
        testID="hero"
        imageUrl={null}
        imageStatus="PENDING"
        showStatusLabel
        className="w-full"
        accessibilityLabel="Lentil soup"
      />,
    );

    expect(screen.getByText('Preparing photo…')).toBeTruthy();
    expect(screen.getByLabelText('Lentil soup, Preparing photo…')).toBeTruthy();
  });

  it('says the photo is unavailable once generation failed', async () => {
    await render(
      <RecipeImage
        testID="hero"
        imageUrl={null}
        imageStatus="FAILED"
        showStatusLabel
        className="w-full"
      />,
    );

    expect(screen.getByText('Photo unavailable')).toBeTruthy();
  });

  it('keeps an existing photo while a new one is generated', async () => {
    await render(
      <RecipeImage
        testID="hero"
        imageUrl="https://example.com/old.jpg"
        imageStatus="GENERATING"
        showStatusLabel
        className="w-full"
      />,
    );

    expect(screen.getByTestId('hero').props).toMatchObject({
      source: { uri: 'https://example.com/old.jpg' },
    });
    expect(screen.queryByText('Preparing photo…')).toBeNull();
  });
});
