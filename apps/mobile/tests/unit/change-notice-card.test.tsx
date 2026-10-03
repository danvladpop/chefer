import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render as rtlRender, screen, userEvent } from '@testing-library/react-native';
import { ChangeNoticeCard } from '../../src/features/nutrition/change-notice-card';

// §2.11, T-11.1/T-11.5 — "never change your targets silently" made visible.

// The Keep confirmation is a Sheet, which reads the safe-area insets.
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const render = (ui: ReactElement) =>
  rtlRender(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

const mockAcknowledge = jest.fn();
const mockInvalidate = jest.fn();
let mockChangesData: unknown[] | undefined;

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      targets: { changes: { invalidate: mockInvalidate }, get: { invalidate: mockInvalidate } },
      tracker: { getDay: { invalidate: mockInvalidate } },
      dashboard: { summary: { invalidate: mockInvalidate } },
    }),
    targets: {
      changes: { useQuery: () => ({ data: mockChangesData }) },
      acknowledgeChange: {
        useMutation: (opts?: {
          onSuccess?: (result: unknown, input: { id: string; keep: boolean }) => void;
        }) => ({
          mutate: (input: { id: string; keep: boolean }) => {
            mockAcknowledge(input);
            opts?.onSuccess?.({ resolved: true }, input);
          },
          isPending: false,
          isError: false,
          error: null,
          variables: undefined,
        }),
      },
    },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockChangesData = undefined;
});

describe('ChangeNoticeCard', () => {
  it('renders nothing when there is no unresolved change', async () => {
    mockChangesData = [];
    await render(<ChangeNoticeCard />);
    expect(screen.queryByTestId('change-notice-card')).toBeNull();
  });

  it('a CHANGED row (gym setup) shows "Target changed" and the before/after numbers', async () => {
    mockChangesData = [
      {
        id: 'c1',
        kind: 'CHANGED',
        reason: 'GYM_SETUP',
        fields: [
          { field: 'dailyCalorieTarget', before: 2100, after: 2400 },
          { field: 'proteinG', before: 160, after: 190 },
        ],
      },
    ];
    await render(<ChangeNoticeCard />);

    expect(screen.getByText('Target changed')).toBeTruthy();
    expect(screen.getByText('Your gym setup changed your targets')).toBeTruthy();
    expect(screen.getByText('Calories: 2100 kcal → 2400 kcal')).toBeTruthy();
  });

  it('a SUGGESTED row (coach) reads "Suggested change" (AC2)', async () => {
    mockChangesData = [
      {
        id: 'c2',
        kind: 'SUGGESTED',
        reason: 'COACH',
        fields: [{ field: 'dailyCalorieTarget', before: 2100, after: 2000 }],
      },
    ];
    await render(<ChangeNoticeCard />);

    expect(screen.getByText('Suggested change')).toBeTruthy();
    expect(screen.getByText('Your coach suggests a change')).toBeTruthy();
  });

  it('"Keep mine" resolves with keep:true', async () => {
    mockChangesData = [
      {
        id: 'c3',
        kind: 'SUGGESTED',
        reason: 'COACH',
        fields: [{ field: 'dailyCalorieTarget', before: 2100, after: 2000 }],
      },
    ];
    const user = userEvent.setup();
    await render(<ChangeNoticeCard />);

    await user.press(screen.getByTestId('change-notice-keep'));

    expect(mockAcknowledge).toHaveBeenCalledWith({ id: 'c3', keep: true });
    expect(mockInvalidate).toHaveBeenCalled();
  });

  it('"Use {n}" resolves with keep:false', async () => {
    mockChangesData = [
      {
        id: 'c4',
        kind: 'CHANGED',
        reason: 'WEIGHT',
        fields: [{ field: 'dailyCalorieTarget', before: 2100, after: 2400 }],
      },
    ];
    const user = userEvent.setup();
    await render(<ChangeNoticeCard />);

    expect(screen.getByTestId('change-notice-use-new')).toHaveTextContent('Use 2400');
    await user.press(screen.getByTestId('change-notice-use-new'));

    expect(mockAcknowledge).toHaveBeenCalledWith({ id: 'c4', keep: false });
  });

  // UX-FOOD-14: "Keep" on an applied change switches the user to fixed targets,
  // so it asks first instead of doing it silently.
  it('"Keep {n}" on an applied change asks before it fixes the targets', async () => {
    mockChangesData = [
      {
        id: 'c5',
        kind: 'CHANGED',
        reason: 'WEIGHT',
        fields: [{ field: 'dailyCalorieTarget', before: 2000, after: 1492 }],
      },
    ];
    const user = userEvent.setup();
    await render(<ChangeNoticeCard />);

    await user.press(screen.getByTestId('change-notice-keep'));
    expect(mockAcknowledge).not.toHaveBeenCalled();
    expect(screen.getByText('Keep 2000 kcal?')).toBeTruthy();
    expect(screen.getByTestId('change-notice-keep-confirm-body')).toHaveTextContent(
      /stay at these numbers/,
    );

    await user.press(screen.getByTestId('change-notice-keep-confirm-confirm'));
    expect(mockAcknowledge).toHaveBeenCalledWith({ id: 'c5', keep: true });
  });

  it('cancelling the Keep confirmation changes nothing', async () => {
    mockChangesData = [
      {
        id: 'c6',
        kind: 'CHANGED',
        reason: 'GYM_SETUP',
        fields: [{ field: 'dailyCalorieTarget', before: 2100, after: 2400 }],
      },
    ];
    const user = userEvent.setup();
    await render(<ChangeNoticeCard />);

    await user.press(screen.getByTestId('change-notice-keep'));
    await user.press(screen.getByTestId('change-notice-keep-confirm-cancel'));

    expect(mockAcknowledge).not.toHaveBeenCalled();
  });
});
