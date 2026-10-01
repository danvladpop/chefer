import { render, screen } from '@testing-library/react-native';
import { CountPill, countPillText } from '@chefer/ui-mobile';

// CountPill (UX §3.1): number pill, capped at 9+, hidden at 0, labelled "{n} new".

describe('CountPill', () => {
  it('shows the count with an "{n} new" label', async () => {
    await render(<CountPill count={3} testID="pill" />);
    expect(screen.getByTestId('pill')).toHaveTextContent('3');
    expect(screen.getByLabelText('3 new')).toBeTruthy();
  });

  it('renders nothing at 0, negative or non-finite counts', async () => {
    for (const count of [0, -2, Number.NaN]) {
      const view = await render(<CountPill count={count} testID="pill" />);
      expect(screen.queryByTestId('pill')).toBeNull();
      await view.unmount();
    }
  });

  it('caps the display at 9+ but reads the real count aloud', async () => {
    await render(<CountPill count={12} testID="pill" />);
    expect(screen.getByTestId('pill')).toHaveTextContent('9+');
    expect(screen.getByLabelText('12 new')).toBeTruthy();
  });

  it('shows exactly the cap without a plus', async () => {
    await render(<CountPill count={9} testID="pill" />);
    expect(screen.getByTestId('pill')).toHaveTextContent(/^9$/);
  });

  it('supports a 99+ cap', async () => {
    await render(<CountPill count={150} max={99} testID="pill" />);
    expect(screen.getByTestId('pill')).toHaveTextContent('99+');
    expect(countPillText(99, 99)).toBe('99');
    expect(countPillText(100, 99)).toBe('99+');
  });

  it('takes a custom accessibility label', async () => {
    await render(<CountPill count={2} accessibilityLabel="2 requests" testID="pill" />);
    expect(screen.getByLabelText('2 requests')).toBeTruthy();
  });

  it('is a single accessible element', async () => {
    await render(<CountPill count={4} testID="pill" />);
    expect(screen.getByTestId('pill').props.accessible).toBe(true);
  });
});
