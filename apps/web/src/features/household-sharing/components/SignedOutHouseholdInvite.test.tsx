// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOUSEHOLD_SHARING_COPY as COPY } from '@chefer/types';
import { SignedOutHouseholdInvite } from './SignedOutHouseholdInvite';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

describe('SignedOutHouseholdInvite', () => {
  it('one heading, the app first, the stores, then the web sign-in that comes back', () => {
    render(<SignedOutHouseholdInvite code="AbC-123" />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: COPY.openInApp })).toHaveAttribute(
      'href',
      'chefer://household/join/AbC-123',
    );
    expect(screen.getByRole('list', { name: 'Get the Chefer app' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: COPY.continueOnWeb })).toHaveAttribute(
      'href',
      '/login?next=%2Fhousehold%2Fjoin%2FAbC-123',
    );
  });
});
