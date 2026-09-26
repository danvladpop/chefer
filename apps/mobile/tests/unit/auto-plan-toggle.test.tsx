import { fireEvent, render, screen } from '@testing-library/react-native';
import { AutoPlanToggle } from '../../src/features/preferences/auto-plan-toggle';

// Audit F-PLAN-4-3: premium users can switch Sunday auto-planning off.

const mockMutate = jest.fn();

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ preferences: { get: { invalidate: jest.fn() } } }),
    preferences: {
      setAutoPlanWeekly: {
        useMutation: () => ({ mutate: mockMutate, isPending: false, isError: false }),
      },
    },
  },
}));

describe('AutoPlanToggle', () => {
  it('saves the opt-out', async () => {
    await render(<AutoPlanToggle initialEnabled />);
    const toggle = screen.getByTestId('prefs-auto-plan-switch');
    expect(toggle.props.value).toBe(true);
    await fireEvent(toggle, 'valueChange', false);
    expect(mockMutate).toHaveBeenCalledWith({ enabled: false });
    expect(screen.getByTestId('prefs-auto-plan-switch').props.value).toBe(false);
  });
});
