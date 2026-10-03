import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import { PREMIUM_SOURCES } from '@chefer/types';
import { PREMIUM_PITCH_COPY, premiumPitchFor } from '@chefer/utils';
import { LockedFeatureCard } from '../../src/features/premium/locked-feature-card';
import { openPremium } from '../../src/features/premium/open-premium';
import { PremiumSheet, type PremiumSheetProps } from '../../src/features/premium/premium-sheet';

// openLegal (the AI consent sheet's Privacy link) pulls in expo-router.
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

// PAT-3 / UX-10 (T-10.2): the job-led premium sheet and the lock card. The
// sheet is presentational — PremiumHost (premium-host.test.tsx) feeds it the
// pitch for a source. Guards AC1 (job headline), AC2 (the included-at-no-cost terms
// on every open), AC3 (an unavailable bullet never renders) and delta rules 1
// and 2 (no "beta", no price/checkout on iOS).

jest.mock('../../src/features/premium/open-premium', () => ({
  openPremium: jest.fn(),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const PURCHASE_WORDING =
  /[€$£]|\b(checkout|subscribe|subscription|purchase|buy|billing|per month|web app)\b|https?:/i;

async function renderSheet(props: Partial<PremiumSheetProps> & { source?: string } = {}) {
  const { source = 'household', ...rest } = props;
  const onClose = jest.fn();
  const onTurnOn = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <PremiumSheet
        visible
        onClose={onClose}
        onTurnOn={onTurnOn}
        pitch={premiumPitchFor(source, { context: { tableSize: 4, kidName: 'Luca' } })}
        {...rest}
      />
    </SafeAreaProvider>,
  );
  return { onClose, onTurnOn };
}

describe('PremiumSheet — offer (AC1, AC2)', () => {
  it('is headlined by the job it unlocks and lists its live bullets', async () => {
    await renderSheet();
    expect(screen.getByTestId('premium-sheet-title')).toHaveTextContent(
      'Keep portions for your table of 4',
    );
    expect(screen.getByText("Recipes scaled to 4 portions — Luca's ½ counted")).toBeOnTheScreen();
    expect(screen.getByText('One shopping list with amounts for everyone')).toBeOnTheScreen();
  });

  it('shows the included-at-no-cost terms paragraph on every open, for every source', async () => {
    for (const source of PREMIUM_SOURCES) {
      const { unmount } = await render(
        <SafeAreaProvider initialMetrics={metrics}>
          <PremiumSheet
            visible
            onClose={jest.fn()}
            onTurnOn={jest.fn()}
            pitch={premiumPitchFor(source)}
          />
        </SafeAreaProvider>,
      );
      expect(screen.getByText('INCLUDED')).toBeOnTheScreen();
      expect(screen.getByText(PREMIUM_PITCH_COPY.termsBody)).toBeOnTheScreen();
      await unmount();
    }
  });

  it('carries no price, checkout or purchase link on iOS, and never says "beta"', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    try {
      for (const source of ['household', 'recipe-import', 'chat-locked', 'profile']) {
        const { unmount } = await render(
          <SafeAreaProvider initialMetrics={metrics}>
            <PremiumSheet
              visible
              onClose={jest.fn()}
              onTurnOn={jest.fn()}
              pitch={premiumPitchFor(source)}
            />
          </SafeAreaProvider>,
        );
        const tree = JSON.stringify(screen.toJSON());
        // The terms sentence is the one place the word "price" appears ("Before it
        // has a price, we'll tell you…"): no amount, currency or link goes with it.
        const withoutTerms = tree.replace(PREMIUM_PITCH_COPY.termsBody, '');
        expect(withoutTerms).not.toMatch(PURCHASE_WORDING);
        expect(tree).not.toMatch(/\bbeta\b/i);
        expect(screen.getByText(PREMIUM_PITCH_COPY.turnOn)).toBeOnTheScreen();
        await unmount();
      }
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
    }
  });

  it('never renders a bullet whose feature is not live (AC3)', async () => {
    await renderSheet({ source: 'training-day' });
    expect(screen.getByTestId('premium-sheet-title')).toHaveTextContent(
      'A week built around your training days',
    );
    expect(screen.queryByText(/Re-planned when your training days change/)).toBeNull();
    expect(screen.queryByText(/Refuel snacks/)).toBeNull();
    // 2 live bullets are enough — nothing fills the gap with a promise.
    const bullets = screen.getByTestId('premium-sheet-bullets');
    expect(bullets.children).toHaveLength(2);
  });

  it('"Turn on Premium" and "Not now" call back; "Also included" expands and collapses', async () => {
    const user = userEvent.setup();
    const { onClose, onTurnOn } = await renderSheet();
    expect(screen.queryByTestId('premium-sheet-also-included')).toBeNull();
    await user.press(screen.getByTestId('premium-sheet-also-included-toggle'));
    expect(screen.getByTestId('premium-sheet-also-included')).toBeOnTheScreen();
    expect(screen.getByText('The AI chef (daily allowance)')).toBeOnTheScreen();
    await user.press(screen.getByTestId('premium-sheet-also-included-toggle'));
    expect(screen.queryByTestId('premium-sheet-also-included')).toBeNull();

    await user.press(screen.getByTestId('premium-sheet-turn-on'));
    expect(onTurnOn).toHaveBeenCalledTimes(1);
    await user.press(screen.getByTestId('premium-sheet-not-now'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('PremiumSheet — error and success', () => {
  it('error: says nothing changed, offers Try again, and keeps the terms', async () => {
    const user = userEvent.setup();
    const { onTurnOn } = await renderSheet({ phase: 'error' });
    expect(screen.getByTestId('premium-sheet-error')).toHaveTextContent(
      "Couldn't turn on Premium. Nothing has changed.",
    );
    expect(screen.getByText(PREMIUM_PITCH_COPY.termsBody)).toBeOnTheScreen();
    await user.press(screen.getByText('Try again'));
    expect(onTurnOn).toHaveBeenCalledTimes(1);
  });

  it('success: "Premium is on", what you now have, the job action and Later', async () => {
    const user = userEvent.setup();
    const onAction = jest.fn();
    const { onClose } = await renderSheet({
      phase: 'success',
      successAction: { label: 'Add your table', onPress: onAction },
    });
    expect(screen.getByTestId('premium-sheet-title')).toHaveTextContent('Premium is on');
    expect(screen.getByText('You now have:')).toBeOnTheScreen();
    expect(screen.getByText('One shopping list with amounts for everyone')).toBeOnTheScreen();
    expect(screen.queryByTestId('premium-sheet-turn-on')).toBeNull();
    await user.press(screen.getByTestId('premium-sheet-action'));
    expect(onAction).toHaveBeenCalledTimes(1);
    await user.press(screen.getByTestId('premium-sheet-later'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('LockedFeatureCard (PAT-3)', () => {
  it('is headlined by the source’s job and opens the premium sheet for it', async () => {
    const user = userEvent.setup();
    await render(<LockedFeatureCard source="recipe-import" testID="locked-import" />);
    expect(screen.getByText('PREMIUM')).toBeOnTheScreen();
    expect(screen.getByText('Turn your saved links and videos into recipes')).toBeOnTheScreen();
    await user.press(screen.getByTestId('locked-import-see-what-premium-adds'));
    expect(openPremium).toHaveBeenCalledWith('recipe-import');
  });

  it('accepts an override handler, and renders the free action only when given', async () => {
    const user = userEvent.setup();
    const onSee = jest.fn();
    const onFree = jest.fn();
    await render(
      <LockedFeatureCard
        source="household"
        onSeeWhatPremiumAdds={onSee}
        freeAction={{ label: 'Or type it in yourself', onPress: onFree }}
        testID="locked-household"
      />,
    );
    await user.press(screen.getByTestId('locked-household-see-what-premium-adds'));
    expect(onSee).toHaveBeenCalledWith('household');
    await user.press(screen.getByTestId('locked-household-free-action'));
    expect(onFree).toHaveBeenCalledTimes(1);
  });

  it('renders no free-action button when omitted', async () => {
    await render(<LockedFeatureCard source="household" testID="locked-household" />);
    expect(screen.queryByTestId('locked-household-free-action')).toBeNull();
  });
});
