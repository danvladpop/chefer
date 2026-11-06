// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StoreBadges, StoreTrademarks } from './StoreBadges';

// The day the owner sets APP_STORE_PROVIDER_TOKEN.
vi.mock('@chefer/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@chefer/types')>();
  return {
    ...actual,
    appStoreUrl: (campaign?: import('@chefer/types').StoreCampaign) =>
      actual.appStoreUrl(campaign, { providerToken: '118' }),
  };
});

afterEach(cleanup);

describe('StoreBadges with iOS live', () => {
  it('leads with the App Store badge, campaign-tagged with ct + pt', () => {
    render(<StoreBadges campaign="support" />);
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getAllByRole('img').map((img) => img.getAttribute('alt'))).toEqual([
      'Download on the App Store',
      'Get it on Google Play',
    ]);
    expect(
      screen.getByRole('link', { name: 'Download on the App Store' }).getAttribute('href'),
    ).toBe('https://apps.apple.com/app/id6816948724?pt=118&ct=support');
  });

  it('adds the Apple trademark notice', () => {
    render(<StoreTrademarks />);
    expect(screen.getByText(/App Store is a service mark of Apple Inc\./)).toBeTruthy();
    expect(screen.getByText(/Google Play and the Google Play logo/)).toBeTruthy();
  });
});
