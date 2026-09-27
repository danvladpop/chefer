import { render, screen, userEvent } from '@testing-library/react-native';
import { ChangeNoticeCard } from '@chefer/ui-mobile';

// PAT-14 (technical-plan.md §2.14): "never change it silently" — props-only
// shell. Not wired to any real mutation here (T-00.16).

describe('ChangeNoticeCard (PAT-14)', () => {
  it('renders the eyebrow, title, before→after rows and reason', async () => {
    await render(
      <ChangeNoticeCard
        title="Your protein target changed"
        rows={[{ label: 'Protein', before: '128 g', after: '93 g' }]}
        reason="Because you finished gym setup: lifters get 1.6 g per kg of body weight."
        primary={{ label: 'Use the new target', onPress: jest.fn() }}
        secondary={{ label: 'Keep 128 g', onPress: jest.fn() }}
        testID="target-change"
      />,
    );
    expect(screen.getByText('CHANGED')).toBeOnTheScreen();
    expect(screen.getByText('Your protein target changed')).toBeOnTheScreen();
    expect(screen.getByText('128 g')).toBeOnTheScreen();
    expect(screen.getByText('93 g')).toBeOnTheScreen();
    expect(
      screen.getByText('Because you finished gym setup: lifters get 1.6 g per kg of body weight.'),
    ).toBeOnTheScreen();
    expect(screen.getByTestId('target-change')).toHaveProp('accessibilityRole', 'alert');
  });

  it('supports several changed rows and an optional eyebrow override', async () => {
    await render(
      <ChangeNoticeCard
        eyebrow="COACH SUGGESTS"
        title="Your week changed"
        rows={[
          { label: 'Calories', before: '2,284 kcal', after: '2,450 kcal' },
          { label: 'Protein', before: '128 g', after: '150 g' },
        ]}
        reason="Training day bonus applied."
        primary={{ label: 'Use the new plan', onPress: jest.fn() }}
        secondary={{ label: 'Keep mine', onPress: jest.fn() }}
        testID="week-change"
      />,
    );
    expect(screen.getByText('COACH SUGGESTS')).toBeOnTheScreen();
    expect(screen.getByText('2,284 kcal')).toBeOnTheScreen();
    expect(screen.getByText('2,450 kcal')).toBeOnTheScreen();
    expect(screen.getByText('150 g')).toBeOnTheScreen();
  });

  it('primary/secondary/why each fire their own callback', async () => {
    const user = userEvent.setup();
    const primary = jest.fn();
    const secondary = jest.fn();
    const why = jest.fn();
    await render(
      <ChangeNoticeCard
        title="Your protein target changed"
        rows={[{ label: 'Protein', before: '128 g', after: '93 g' }]}
        reason="Because you finished gym setup."
        primary={{ label: 'Use the new target', onPress: primary }}
        secondary={{ label: 'Keep 128 g', onPress: secondary }}
        why={{ onPress: why }}
        testID="target-change"
      />,
    );
    await user.press(screen.getByTestId('target-change-primary'));
    await user.press(screen.getByTestId('target-change-secondary'));
    await user.press(screen.getByTestId('target-change-why'));
    expect(primary).toHaveBeenCalledTimes(1);
    expect(secondary).toHaveBeenCalledTimes(1);
    expect(why).toHaveBeenCalledTimes(1);
  });

  it('renders no "Why?" link when why is omitted', async () => {
    await render(
      <ChangeNoticeCard
        title="Your protein target changed"
        rows={[{ label: 'Protein', before: '128 g', after: '93 g' }]}
        reason="Because you finished gym setup."
        primary={{ label: 'Use the new target', onPress: jest.fn() }}
        secondary={{ label: 'Keep 128 g', onPress: jest.fn() }}
        testID="target-change"
      />,
    );
    expect(screen.queryByTestId('target-change-why')).toBeNull();
  });
});
