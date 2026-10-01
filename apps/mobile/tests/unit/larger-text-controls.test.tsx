import { render, screen } from '@testing-library/react-native';
import { Button, buttonVariants } from '@chefer/ui-mobile';
import { HeaderAvatar } from '../../src/components/header-avatar';

// App Review R-20: at Accessibility XL, Today's "Cook it" / "Swap" labels were
// clipped by a fixed-height Button and the header avatar lost its initial.

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    auth: { me: { useQuery: () => ({ data: { firstName: 'Dan', lastName: 'Pop' } }) } },
  },
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

describe('Button at large text (R-20)', () => {
  it.each(['default', 'sm', 'lg'] as const)(
    'the %s size grows with its label (min-h, never a fixed h-)',
    (size) => {
      const className = buttonVariants({ size });
      expect(className).toMatch(/\bmin-h-1[12]\b/);
      expect(className).not.toMatch(/(^|\s)h-1[12]\b/);
    },
  );

  it('caps the label scale so it wraps instead of overflowing', async () => {
    await render(<Button>Cook it</Button>);
    expect(screen.getByText('Cook it').props.maxFontSizeMultiplier).toBe(1.8);
  });
});

describe('HeaderAvatar at large text (R-20)', () => {
  it('caps the initials scale and shrinks to fit rather than disappearing', async () => {
    await render(<HeaderAvatar />);
    const initials = screen.getByTestId('header-avatar-initials');
    expect(initials).toHaveTextContent('DP');
    expect(initials.props.maxFontSizeMultiplier).toBe(1.2);
    expect(initials.props.adjustsFontSizeToFit).toBe(true);
    expect(initials.props.numberOfLines).toBe(1);
  });
});
