import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import { LockedFeatureCard } from '../../src/features/premium/locked-feature-card';
import { PremiumSheet } from '../../src/features/premium/premium-sheet';

// PAT-3 (technical-plan.md §2.3): LockedFeatureCard + PremiumSheet UI shells
// (T-00.16) — no wiring to real copy or the upgrade mutation, just the
// pattern and its callbacks.

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

describe('LockedFeatureCard (PAT-3)', () => {
  it('renders PREMIUM eyebrow, job title and body, and hands the source to onSeeWhatPremiumAdds', async () => {
    const user = userEvent.setup();
    const onSeeWhatPremiumAdds = jest.fn();
    await render(
      <LockedFeatureCard
        source="household"
        job="Two of us"
        body="Cook once, split it between two portions automatically."
        onSeeWhatPremiumAdds={onSeeWhatPremiumAdds}
        testID="locked-household"
      />,
    );
    expect(screen.getByText('PREMIUM')).toBeOnTheScreen();
    expect(screen.getByText('Two of us')).toBeOnTheScreen();
    expect(
      screen.getByText('Cook once, split it between two portions automatically.'),
    ).toBeOnTheScreen();

    await user.press(screen.getByTestId('locked-household-see-what-premium-adds'));
    expect(onSeeWhatPremiumAdds).toHaveBeenCalledWith('household');
  });

  it('renders the free action as a secondary button when given', async () => {
    const user = userEvent.setup();
    const onFreeAction = jest.fn();
    await render(
      <LockedFeatureCard
        source="household"
        job="Two of us"
        body="Cook once, split it between two portions automatically."
        freeAction={{ label: 'Cook for one', onPress: onFreeAction }}
        onSeeWhatPremiumAdds={jest.fn()}
        testID="locked-household"
      />,
    );
    await user.press(screen.getByTestId('locked-household-free-action'));
    expect(onFreeAction).toHaveBeenCalledTimes(1);
  });

  it('renders no free-action button when omitted', async () => {
    await render(
      <LockedFeatureCard
        source="household"
        job="Two of us"
        body="Cook once, split it between two portions automatically."
        onSeeWhatPremiumAdds={jest.fn()}
        testID="locked-household"
      />,
    );
    expect(screen.queryByTestId('locked-household-free-action')).toBeNull();
  });
});

describe('PremiumSheet (PAT-3)', () => {
  it('renders the headline, bullets and terms, and hands the source to onTurnOnPremium', async () => {
    const user = userEvent.setup();
    const onTurnOnPremium = jest.fn();
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <PremiumSheet
          visible
          onClose={jest.fn()}
          source="household"
          headline="Two of us"
          bullets={['Cook once', 'Split servings automatically', 'One shopping list']}
          alsoIncluded={['AI chef', 'Own targets']}
          termsText="Beta pricing — cancel any time."
          onTurnOnPremium={onTurnOnPremium}
          testID="premium-sheet"
        />
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId('premium-sheet-title')).toHaveTextContent('Two of us');
    expect(screen.getByText('Cook once')).toBeOnTheScreen();
    expect(screen.getByText('Beta pricing — cancel any time.')).toBeOnTheScreen();
    expect(screen.queryByTestId('premium-sheet-also-included')).toBeNull();

    await user.press(screen.getByTestId('premium-sheet-turn-on'));
    expect(onTurnOnPremium).toHaveBeenCalledWith('household');
  });

  it('"Also included" expands and collapses', async () => {
    const user = userEvent.setup();
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <PremiumSheet
          visible
          onClose={jest.fn()}
          source="household"
          headline="Two of us"
          bullets={['Cook once']}
          alsoIncluded={['AI chef', 'Own targets']}
          termsText="Beta pricing."
          onTurnOnPremium={jest.fn()}
          testID="premium-sheet"
        />
      </SafeAreaProvider>,
    );
    await user.press(screen.getByTestId('premium-sheet-also-included-toggle'));
    expect(screen.getByText('AI chef')).toBeOnTheScreen();
    expect(screen.getByText('Own targets')).toBeOnTheScreen();

    await user.press(screen.getByTestId('premium-sheet-also-included-toggle'));
    expect(screen.queryByTestId('premium-sheet-also-included')).toBeNull();
  });

  it('"Not now" closes the sheet', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <PremiumSheet
          visible
          onClose={onClose}
          source="household"
          headline="Two of us"
          bullets={['Cook once']}
          alsoIncluded={[]}
          termsText="Beta pricing."
          onTurnOnPremium={jest.fn()}
          testID="premium-sheet"
        />
      </SafeAreaProvider>,
    );
    await user.press(screen.getByTestId('premium-sheet-not-now'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
