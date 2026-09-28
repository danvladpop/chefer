import { render, screen, userEvent } from '@testing-library/react-native';
import { ChangeNoticeCard } from '../../src/features/nutrition/change-notice-card';

// §2.11, T-11.1/T-11.5 — "never change your targets silently" made visible.

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
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (input: { id: string; keep: boolean }) => {
            mockAcknowledge(input);
            opts?.onSuccess?.();
          },
          isPending: false,
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
});
