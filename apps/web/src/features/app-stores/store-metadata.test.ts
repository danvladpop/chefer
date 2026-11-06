import { describe, expect, it } from 'vitest';
import { serializeJsonLd, smartAppBanner, softwareApplicationJsonLd } from './store-metadata';

describe('smartAppBanner', () => {
  it('points at the live iOS app', () => {
    expect(smartAppBanner()).toEqual({ itunes: { appId: '6816948724' } });
  });

  it('emits nothing without an Apple ID', () => {
    expect(smartAppBanner(null)).toEqual({});
  });
});

describe('softwareApplicationJsonLd', () => {
  it('lists only live platforms and listings', () => {
    const data = softwareApplicationJsonLd('https://example.test');
    expect(data.url).toBe('https://example.test');
    expect(data.operatingSystem).toBe('Android, iOS, Web');
    expect(data.sameAs).toEqual([
      'https://play.google.com/store/apps/details?id=dev.chefer.app',
      'https://apps.apple.com/app/id6816948724',
    ]);
  });
});

describe('serializeJsonLd', () => {
  it('cannot close its own script tag', () => {
    expect(serializeJsonLd({ a: '</script><script>alert(1)</script>' })).not.toContain('<');
  });
});
