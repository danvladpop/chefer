import * as Reanimated from 'react-native-reanimated';
import { render, screen } from '@testing-library/react-native';
import { Skeleton, SKELETON_CYCLE_MS } from '@chefer/ui-mobile';

// Skeleton (MO-03): opacity pulse, static under reduced motion, hidden from
// the accessibility tree.

type Globals = { __REDUCED_MOTION__?: boolean };
const g = globalThis as Globals;

describe('Skeleton', () => {
  afterEach(() => {
    g.__REDUCED_MOTION__ = false;
    jest.restoreAllMocks();
  });

  it('is hidden from the accessibility tree', async () => {
    await render(<Skeleton testID="sk" />);
    const node = screen.getByTestId('sk', { includeHiddenElements: true });
    expect(node.props.accessible).toBe(false);
    expect(node.props.accessibilityElementsHidden).toBe(true);
  });

  it('starts a repeating opacity pulse of one 1.2 s cycle', async () => {
    const repeat = jest.spyOn(Reanimated, 'withRepeat');
    const timing = jest.spyOn(Reanimated, 'withTiming');
    await render(<Skeleton testID="sk" />);
    expect(repeat).toHaveBeenCalledTimes(1);
    expect(repeat.mock.calls[0]?.[1]).toBe(-1);
    const durations = timing.mock.calls.map((c) => (c[1] as { duration?: number }).duration);
    expect(durations).toEqual([SKELETON_CYCLE_MS / 2, SKELETON_CYCLE_MS / 2]);
    expect(SKELETON_CYCLE_MS).toBe(1200);
  });

  it('does not animate under reduced motion', async () => {
    g.__REDUCED_MOTION__ = true;
    const repeat = jest.spyOn(Reanimated, 'withRepeat');
    await render(<Skeleton testID="sk" />);
    expect(repeat).not.toHaveBeenCalled();
    const node = screen.getByTestId('sk', { includeHiddenElements: true });
    expect(node).toHaveStyle({ opacity: 1 });
  });
});
