import { describe, expect, it } from 'vitest';
import { APP_STORE_APP_ID, appStoreUrl, PLAY_STORE_PACKAGE, playStoreUrl } from './app-stores';

describe('playStoreUrl', () => {
  it('links the live Android package', () => {
    expect(playStoreUrl()).toBe('https://play.google.com/store/apps/details?id=dev.chefer.app');
    expect(PLAY_STORE_PACKAGE).toBe('dev.chefer.app');
  });

  it('carries the campaign as one url-encoded referrer', () => {
    const url = new URL(playStoreUrl('landing-hero'));
    expect(url.searchParams.get('id')).toBe('dev.chefer.app');
    expect(url.searchParams.get('referrer')).toBe(
      'utm_source=chefer-web&utm_medium=badge&utm_campaign=landing-hero',
    );
    // Encoded, so Play sees one parameter rather than stray top-level utm_*.
    expect(url.search).toContain('referrer=utm_source%3Dchefer-web%26utm_medium%3Dbadge');
    expect(url.searchParams.has('utm_source')).toBe(false);
  });
});

describe('appStoreUrl', () => {
  it('stays hidden until the owner sets the Apple ID', () => {
    expect(APP_STORE_APP_ID).toBeNull();
    expect(appStoreUrl('landing-hero')).toBeNull();
    expect(appStoreUrl(undefined, { appId: null })).toBeNull();
  });

  it('links the app by numeric ID, untagged without a campaign', () => {
    expect(appStoreUrl(undefined, { appId: '1234567890' })).toBe(
      'https://apps.apple.com/app/id1234567890',
    );
  });

  it('adds ct, and pt only when a provider token is configured', () => {
    expect(appStoreUrl('support', { appId: '1234567890', providerToken: null })).toBe(
      'https://apps.apple.com/app/id1234567890?ct=support',
    );
    expect(appStoreUrl('landing-footer', { appId: '1234567890', providerToken: '118' })).toBe(
      'https://apps.apple.com/app/id1234567890?pt=118&ct=landing-footer',
    );
  });
});
