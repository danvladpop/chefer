// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_TERMS_VERSION } from '@chefer/types';
import { RegisterV4 } from './register-v4';

// "Save your plan" (flag onboardingV4): email + password + confirm (F9), one 16+/Terms
// checkbox sent as both acceptedTerms and ageConfirmed; success → /onboarding.
const m = vi.hoisted(() => ({ push: vi.fn(), register: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: m.push, refresh: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: unknown; href: string }) => (
    <a href={href}>{children as never}</a>
  ),
}));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ clear: vi.fn() }) }));
vi.mock('@/features/auth/components/social-sign-in', () => ({
  SocialSignIn: () => <p>social buttons</p>,
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    auth: {
      register: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          isPending: false,
          mutate: (input: unknown) => {
            m.register(input);
            opts.onSuccess?.();
          },
        }),
      },
    },
  },
}));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

function openEmail(confirm = 'Spinach-9') {
  render(<RegisterV4 />);
  expect(screen.getByRole('heading', { name: 'Save your plan' })).toBeTruthy();
  expect(screen.getByText('social buttons')).toBeTruthy();
  fireEvent.click(screen.getByTestId('v4-account-email'));
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' dana@example.com ' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Spinach-9' } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: confirm } });
}

describe('RegisterV4', () => {
  it('blocks Create account until the 16+/Terms box is ticked', () => {
    openEmail();
    fireEvent.click(screen.getByTestId('v4-account-create'));
    expect(m.register).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/agree to the Terms/);
  });

  it('one tick sends both acceptances and goes to /onboarding', async () => {
    openEmail();
    fireEvent.click(screen.getByTestId('v4-account-agree'));
    fireEvent.click(screen.getByTestId('v4-account-create'));
    await waitFor(() => expect(m.push).toHaveBeenCalledWith('/onboarding'));
    expect(m.register).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'dana@example.com',
        password: 'Spinach-9',
        acceptedTerms: true,
        ageConfirmed: true,
        acceptedTermsVersion: CURRENT_TERMS_VERSION,
      }),
    );
  });

  it('one Show reveals both password fields', () => {
    openEmail();
    const field = screen.getByLabelText<HTMLInputElement>('Password');
    const confirm = screen.getByLabelText<HTMLInputElement>('Confirm password');
    expect(field.type).toBe('password');
    expect(confirm.type).toBe('password');
    expect(screen.getAllByRole('button', { name: 'Show password' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field.type).toBe('text');
    expect(confirm.type).toBe('text');
  });

  it('F8/F9: the email is the username and both password fields are new-password', () => {
    openEmail();
    expect(screen.getByLabelText('Email').getAttribute('autocomplete')).toBe('username');
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('new-password');
    expect(screen.getByLabelText('Confirm password').getAttribute('autocomplete')).toBe(
      'new-password',
    );
  });

  it('F9: a different confirmation blocks Create account until it matches', () => {
    openEmail('Spinach-8');
    fireEvent.click(screen.getByTestId('v4-account-agree'));
    fireEvent.click(screen.getByTestId('v4-account-create'));
    expect(m.register).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('Passwords do not match');

    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'Spinach-9' },
    });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByTestId('v4-account-create'));
    expect(m.register).toHaveBeenCalledTimes(1);
    const [input] = m.register.mock.calls[0] as [Record<string, unknown>];
    expect(input).not.toHaveProperty('confirmPassword');
  });

  it('F9: an empty confirmation asks for it', () => {
    openEmail('');
    fireEvent.click(screen.getByTestId('v4-account-agree'));
    fireEvent.click(screen.getByTestId('v4-account-create'));
    expect(m.register).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('Please confirm your password');
  });
});
