// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HomePage from './page';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/features/auth/lib/session', () => ({ getSessionUser: vi.fn().mockResolvedValue(null) }));

afterEach(cleanup);

describe('landing page — the shopping list, not the retired pantry (WP-24 / FB7-10)', () => {
  it('advertises a shopping list built from your recipes', async () => {
    render(await HomePage());
    expect(screen.getByText('A shopping list built from your recipes')).toBeTruthy();
  });

  it('no longer promises plans that cook from your pantry', async () => {
    render(await HomePage());
    expect(screen.queryByText(/pantry/i)).toBeNull();
    expect(screen.queryByText(/what you bought/i)).toBeNull();
  });
});

describe('landing page — route to the app stores (ASO plan §5.2–5.3)', () => {
  it('shows the Play badge in the hero and by the closing CTA, each its own campaign', async () => {
    render(await HomePage());
    const play = screen.getAllByRole('link', { name: 'Get it on Google Play' });
    expect(play).toHaveLength(2);
    const campaigns = play.map((link) => {
      const url = new URL(link.getAttribute('href') ?? '');
      expect(url.searchParams.get('id')).toBe('dev.chefer.app');
      return new URLSearchParams(url.searchParams.get('referrer') ?? '').get('utm_campaign');
    });
    expect(campaigns).toEqual(['landing-hero', 'landing-footer']);
  });

  it('shows the App Store badge in the same two places, each its own campaign', async () => {
    render(await HomePage());
    const apple = screen.getAllByRole('link', { name: 'Download on the App Store' });
    expect(apple.map((link) => link.getAttribute('href'))).toEqual([
      'https://apps.apple.com/app/id6816948724?ct=landing-hero',
      'https://apps.apple.com/app/id6816948724?ct=landing-footer',
    ]);
    expect(screen.getByText(/App Store is a service mark of Apple Inc\./)).toBeTruthy();
  });

  it('keeps the register and sign-in calls to action', async () => {
    render(await HomePage());
    expect(screen.getByRole('link', { name: 'Get started free' }).getAttribute('href')).toBe(
      '/register',
    );
    expect(screen.getAllByRole('link', { name: 'Sign in' }).length).toBeGreaterThan(0);
  });

  it('describes the app as a free SoftwareApplication with no rating', async () => {
    const { container } = render(await HomePage());
    const script = container.querySelector('script[type="application/ld+json"]');
    const data = JSON.parse(script?.textContent ?? '{}') as Record<string, unknown>;
    expect(data).toMatchObject({
      '@type': 'SoftwareApplication',
      name: 'Chefer',
      applicationCategory: 'HealthApplication',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      operatingSystem: 'Android, iOS, Web',
      installUrl: [
        'https://play.google.com/store/apps/details?id=dev.chefer.app',
        'https://apps.apple.com/app/id6816948724',
      ],
    });
    expect(data).not.toHaveProperty('aggregateRating');
  });
});

describe('landing page — footer', () => {
  it('links to the Mealime switch page next to the legal links', async () => {
    render(await HomePage());
    expect(screen.getByRole('link', { name: 'Switching from Mealime?' }).getAttribute('href')).toBe(
      '/switch/mealime',
    );
    expect(screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe(
      '/privacy',
    );
  });
});
