import { Text } from 'react-native';
import { act, render, renderHook, screen, userEvent, waitFor } from '@testing-library/react-native';
import {
  AnimatedCheck,
  Celebration,
  CELEBRATION_PARTICLES,
  enterUp,
  FloatUp,
  makeParticles,
  PopIn,
  resetEntrancesForTests,
  StrikeLine,
  useFirstEntrance,
} from '@chefer/ui-mobile';
import { kv } from '../../src/features/gym/offline/kv';
import { ShopScreen } from '../../src/features/shell/shop/shop-screen';
import type { DaySlot } from '../../src/features/shell/today/today-helpers';
import {
  isDayComplete,
  resetDayCompleteForTests,
  useDayCompleteBurst,
} from '../../src/features/shell/today/use-day-complete';
import { renderWithTrpc } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';

// Premium motion kit (docs/mobile-ux-revamp/motion-premium.md): MO-16 check,
// MO-17 strike, MO-14 pop, MO-18 celebration, MO-03 entrances. Reanimated runs
// on the Jest mock (animations land instantly), so these test the LOGIC: what
// renders, what is skipped under reduced motion, and when bursts and haptics fire.

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock('../../src/hooks/use-currency', () => ({ useCurrency: () => 'EUR' }));
jest.mock('../../src/hooks/use-household', () => ({
  useHousehold: () => ({ memberCount: 0, tablePortions: null, portionSum: null }),
}));
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => false }));

const HIDDEN = { includeHiddenElements: true };

type ReducedMotionGlobal = typeof globalThis & { __REDUCED_MOTION__?: boolean };
const setReducedMotion = (on: boolean) => {
  (globalThis as ReducedMotionGlobal).__REDUCED_MOTION__ = on;
};

const hapticsMock = jest.requireMock<{
  selectionAsync: jest.Mock;
  impactAsync: jest.Mock;
  notificationAsync: jest.Mock;
}>('expo-haptics');

afterEach(() => {
  setReducedMotion(false);
  jest.clearAllMocks();
});

describe('kit pieces', () => {
  it('AnimatedCheck renders in both states and re-renders on a flip', async () => {
    const props = { fillColor: '#2D7A4B', checkColor: '#fff', ringColor: '#ccc' };
    const { rerender } = await render(<AnimatedCheck testID="c" checked={false} {...props} />);
    expect(screen.getByTestId('c', HIDDEN)).toBeOnTheScreen();
    await rerender(<AnimatedCheck testID="c" checked {...props} />);
    await rerender(<AnimatedCheck testID="c" checked={false} shape="square" {...props} />);
    expect(screen.getByTestId('c', HIDDEN)).toBeOnTheScreen();
  });

  it('StrikeLine and PopIn render their content', async () => {
    await render(
      <>
        <StrikeLine testID="s" active color="#999" />
        <PopIn testID="p" shine>
          <Text>PR</Text>
        </PopIn>
      </>,
    );
    expect(screen.getByTestId('s', HIDDEN)).toBeOnTheScreen();
    expect(screen.getByText('PR')).toBeOnTheScreen();
  });

  it('a celebration is a fan of particles pointing up, the same every time', () => {
    const a = makeParticles(['#a', '#b']);
    const b = makeParticles(['#a', '#b']);
    expect(a).toHaveLength(CELEBRATION_PARTICLES);
    expect(a).toEqual(b);
    expect(a.every((p) => p.vy < 0)).toBe(true);
    expect(new Set(a.map((p) => p.color))).toEqual(new Set(['#a', '#b']));
  });

  it('Celebration and FloatUp render nothing until played, or under reduced motion', async () => {
    const { rerender } = await render(
      <>
        <Celebration testID="burst" play={0} colors={['#a']} />
        <FloatUp testID="float" play={0}>
          <Text>+500 kcal</Text>
        </FloatUp>
      </>,
    );
    expect(screen.queryByTestId('burst', HIDDEN)).toBeNull();
    expect(screen.queryByTestId('float', HIDDEN)).toBeNull();
    await rerender(
      <>
        <Celebration testID="burst" play={1} colors={['#a']} />
        <FloatUp testID="float" play={1}>
          <Text>+500 kcal</Text>
        </FloatUp>
      </>,
    );
    expect(screen.getByTestId('burst', HIDDEN)).toBeOnTheScreen();
    expect(screen.getByTestId('float', HIDDEN)).toBeOnTheScreen();

    setReducedMotion(true);
    await render(<Celebration testID="burst-reduced" play={3} colors={['#a']} />);
    expect(screen.queryByTestId('burst-reduced', HIDDEN)).toBeNull();
  });

  it('enterUp builds an entering animation for any index', () => {
    expect(enterUp(0)).toBeDefined();
    expect(enterUp(40)).toBeDefined();
  });

  it('a screen plays its entrance on its first mount of the session only', async () => {
    resetEntrancesForTests();
    const first = await renderHook(() => useFirstEntrance('today'));
    expect(first.result.current).toBe(true);
    await first.unmount();
    expect((await renderHook(() => useFirstEntrance('today'))).result.current).toBe(false);
    expect((await renderHook(() => useFirstEntrance('shop'))).result.current).toBe(true);
  });
});

const slot = (slotIndex: number, state: DaySlot['state']): DaySlot => ({
  key: `s${slotIndex}`,
  mealType: 'LUNCH',
  label: 'Lunch',
  kcal: 500,
  state,
  slotIndex,
  recipeId: `r${slotIndex}`,
  recipeName: 'Bowl',
  loggedAsPlanned: state === 'done',
});

describe('day complete (MO-18)', () => {
  beforeEach(() => resetDayCompleteForTests());

  it('is complete when every slot that counts is eaten', () => {
    expect(isDayComplete([])).toBe(false);
    expect(isDayComplete([slot(0, 'done'), slot(1, 'next')])).toBe(false);
    expect(isDayComplete([slot(0, 'done'), slot(1, 'skipped')])).toBe(true);
    expect(isDayComplete([slot(0, 'skipped')])).toBe(false);
  });

  it('bursts once, on the transition seen here, with a success haptic', async () => {
    const { result, rerender } = await renderHook(
      ({ slots }: { slots: DaySlot[] }) => useDayCompleteBurst(slots, '2026-10-15'),
      { initialProps: { slots: [slot(0, 'done'), slot(1, 'next')] } },
    );
    expect(result.current).toBe(0);
    await rerender({ slots: [slot(0, 'done'), slot(1, 'done')] });
    expect(result.current).toBe(1);
    expect(hapticsMock.notificationAsync).toHaveBeenCalledWith('success');
    // Untick and tick again the same day: no second burst.
    await rerender({ slots: [slot(0, 'done'), slot(1, 'next')] });
    await rerender({ slots: [slot(0, 'done'), slot(1, 'done')] });
    expect(result.current).toBe(1);
  });

  it('stays quiet for a day that loads already complete', async () => {
    const { result } = await renderHook(() => useDayCompleteBurst([slot(0, 'done')], '2026-10-16'));
    expect(result.current).toBe(0);
    expect(hapticsMock.notificationAsync).not.toHaveBeenCalled();
  });
});

const row = (key: string, category: string, ingredientName: string) => ({
  key,
  ingredientName,
  category,
  quantity: '1',
  unit: 'pcs',
  recipeNames: ['Something'],
  imageUrl: '',
  estimatedPriceEur: 2,
});

describe('Shop check-off', () => {
  beforeEach(() => kv.remove('shop.aisles-expanded.v1'));

  it('ticking gives a tick haptic; the last item of the list bursts with success', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <ShopScreen />,
      {
        'shoppingList.getForWeek': () => ({
          planId: 'p1',
          hasPlan: true,
          weekStartDate: new Date().toISOString(),
          items: [row('spinach', 'produce', 'Spinach'), row('milk', 'dairy', 'Milk')],
          checkedKeys: ['spinach'],
          estimatedTotalEur: 10,
        }),
        'mealPlan.getForWeek': () => null,
        'preferences.get': () => ({ chefProfile: { preferredUnits: 'METRIC' } }),
        'shoppingList.toggleItems': () => ({ ok: true }),
      },
      testQueryClient(),
    );
    await screen.findByText('Milk');
    expect(screen.queryByTestId('shop-celebration', HIDDEN)).toBeNull();
    await user.press(screen.getByTestId('shop-item-milk'));
    await waitFor(() => expect(screen.getByTestId('shop-celebration', HIDDEN)).toBeOnTheScreen());
    expect(hapticsMock.impactAsync).toHaveBeenCalledWith('light');
    expect(hapticsMock.notificationAsync).toHaveBeenCalledWith('success');

    // Unticking is a plain selection, no burst.
    await user.press(screen.getByTestId('shop-item-milk'));
    await act(() => Promise.resolve());
    expect(hapticsMock.selectionAsync).toHaveBeenCalled();
  });
});
