// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  markWelcomePending,
  ONBOARDING_V4_WELCOME_KEY,
  OnboardingV4WelcomeCard,
} from './welcome-card';

// The one-time "You're all set" card after Onboarding V4.
const m = vi.hoisted(() => ({
  me: vi.fn<[], { data: { firstName: string | null } | undefined }>(),
}));
vi.mock('@/lib/trpc', () => ({ trpc: { user: { me: { useQuery: () => m.me() } } } }));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  m.me.mockReturnValue({ data: { firstName: 'Dana' } });
});

describe('OnboardingV4WelcomeCard', () => {
  it('renders nothing (and asks nothing) without the marker', () => {
    const { container } = render(<OnboardingV4WelcomeCard />);
    expect(container.innerHTML).toBe('');
    expect(m.me).not.toHaveBeenCalled();
  });

  it('shows once after V4, then Dismiss clears it', () => {
    markWelcomePending('both');
    render(<OnboardingV4WelcomeCard />);
    expect(screen.getByText('You’re all set, Dana!')).toBeTruthy();
    expect(screen.getByText('Your week is planned and your first workout is ready.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('onb-v4-welcome')).toBeNull();
    expect(window.localStorage.getItem(ONBOARDING_V4_WELCOME_KEY)).toBeNull();
  });
});
