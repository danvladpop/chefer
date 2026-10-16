import { describe, expect, it } from 'vitest';
import { serializeJsonLd, smartAppBanner, softwareApplicationJsonLd } from './store-metadata';

describe('smartAppBanner', () => {
  it('emits nothing until the iOS app has an Apple ID', () => {
    expect(smartAppBanner()).toEqual({});
    expect(smartAppBanner(null)).toEqual({});
  });

  it('emits the itunes app ID once set', () => {
    expect(smartAppBanner('1234567890')).toEqual({ itunes: { appId: '1234567890' } });
  });
});

describe('softwareApplicationJsonLd', () => {
  it('lists only live platforms and listings', () => {
    const data = softwareApplicationJsonLd('https://example.test');
    expect(data.url).toBe('https://example.test');
    expect(data.operatingSystem).toBe('Android, Web');
    expect(data.sameAs).toEqual(['https://play.google.com/store/apps/details?id=dev.chefer.app']);
  });
});

describe('serializeJsonLd', () => {
  it('cannot close its own script tag', () => {
    expect(serializeJsonLd({ a: '</script><script>alert(1)</script>' })).not.toContain('<');
  });
});
