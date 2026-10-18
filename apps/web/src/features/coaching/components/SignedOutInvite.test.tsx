// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignedOutInvite } from './SignedOutInvite';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

describe('SignedOutInvite', () => {
  it('one heading, the app first, the stores, then the web sign-in that comes back', () => {
    render(<SignedOutInvite code="AbC-123" />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Open in the Chefer app' })).toHaveAttribute(
      'href',
      'chefer://coaching/join/AbC-123',
    );
    const stores = screen.getByRole('list', { name: 'Get the Chefer app' });
    expect(within(stores).getByRole('link', { name: 'Get it on Google Play' })).toHaveAttribute(
      'href',
      expect.stringContaining('utm_campaign%3Dcoaching-invite'),
    );
    expect(screen.getByRole('link', { name: 'Continue on the web' })).toHaveAttribute(
      'href',
      '/login?next=%2Fcoaching%2Fjoin%2FAbC-123',
    );
  });
});
