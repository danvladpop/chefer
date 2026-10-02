import { shouldLoadEmbedUrl, shouldLoadLegalUrl } from '../../src/lib/webview-guard';

const PAGE = 'https://chefer.duckdns.org/privacy';

describe('shouldLoadLegalUrl', () => {
  it('allows the requested page, its query and its anchors', () => {
    expect(shouldLoadLegalUrl(PAGE, PAGE)).toBe(true);
    expect(shouldLoadLegalUrl(`${PAGE}/`, PAGE)).toBe(true);
    expect(shouldLoadLegalUrl(`${PAGE}#analytics`, PAGE)).toBe(true);
    expect(shouldLoadLegalUrl(`${PAGE}?x=1#a`, PAGE)).toBe(true);
    expect(shouldLoadLegalUrl('about:blank', PAGE)).toBe(true);
  });

  it('refuses every other page of the site, even with a similar prefix', () => {
    for (const url of [
      'https://chefer.duckdns.org/',
      'https://chefer.duckdns.org/login',
      'https://chefer.duckdns.org/support',
      'https://chefer.duckdns.org/terms',
      'https://chefer.duckdns.org/privacy-policy',
      'https://chefer.duckdns.org/privacyx#a',
      'https://chefer.duckdns.org/privacy/../login',
      'https://chefer.duckdns.org.evil.example/privacy',
    ]) {
      expect(shouldLoadLegalUrl(url, PAGE)).toBe(false);
    }
  });

  it('refuses outside sites and non-http schemes', () => {
    expect(shouldLoadLegalUrl('https://www.dataprotection.ro/', PAGE)).toBe(false);
    expect(shouldLoadLegalUrl('mailto:support@chefer.app', PAGE)).toBe(false);
  });
});

const EMBED = {
  baseOrigin: 'https://chefer.duckdns.org',
  embedHost: 'www.youtube-nocookie.com',
};

describe('shouldLoadEmbedUrl', () => {
  it('allows the inline document and the embed iframe', () => {
    expect(shouldLoadEmbedUrl('about:blank', EMBED)).toBe(true);
    expect(shouldLoadEmbedUrl('https://chefer.duckdns.org', EMBED)).toBe(true);
    expect(shouldLoadEmbedUrl('https://chefer.duckdns.org/', EMBED)).toBe(true);
    expect(
      shouldLoadEmbedUrl('https://www.youtube-nocookie.com/embed/abc123?start=30', {
        ...EMBED,
        isTopFrame: false,
      }),
    ).toBe(true);
  });

  it('allows https sub-frames of the player but refuses them as top-level navigation', () => {
    const adFrame = 'https://googleads.g.doubleclick.net/pagead/x';
    expect(shouldLoadEmbedUrl(adFrame, { ...EMBED, isTopFrame: false })).toBe(true);
    expect(shouldLoadEmbedUrl(adFrame, { ...EMBED, isTopFrame: true })).toBe(false);
  });

  it('refuses top-level youtube watch pages and the player logo links', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=abc123',
      'https://m.youtube.com/watch?v=abc123',
      'https://youtu.be/abc123?t=30',
      'https://www.youtube-nocookie.com/watch?v=abc123',
      'https://www.youtube.com/',
    ]) {
      expect(shouldLoadEmbedUrl(url, { ...EMBED, isTopFrame: true })).toBe(false);
      // Android never reports isTopFrame: treated as top-level.
      expect(shouldLoadEmbedUrl(url, EMBED)).toBe(false);
    }
  });

  it('refuses a tapped link even inside a sub-frame', () => {
    expect(
      shouldLoadEmbedUrl('https://www.youtube.com/watch?v=abc123', {
        ...EMBED,
        isTopFrame: false,
        navigationType: 'click',
      }),
    ).toBe(false);
    expect(
      shouldLoadEmbedUrl('https://www.youtube.com/s/player/x.js', {
        ...EMBED,
        isTopFrame: false,
        navigationType: 'other',
      }),
    ).toBe(true);
  });

  it('refuses http and non-web schemes at top level', () => {
    expect(shouldLoadEmbedUrl('http://example.com/', EMBED)).toBe(false);
    expect(shouldLoadEmbedUrl('vnd.youtube://abc123', EMBED)).toBe(false);
  });
});
