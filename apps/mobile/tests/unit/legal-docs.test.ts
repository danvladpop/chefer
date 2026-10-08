import {
  legalAnchorFor,
  legalDocFor,
  legalHref,
  legalWebPath,
} from '../../src/features/legal/legal-docs';

describe('legal docs (UX-ACC-19)', () => {
  it('knows exactly two documents', () => {
    expect(legalDocFor('terms')).toBe('terms');
    expect(legalDocFor('privacy')).toBe('privacy');
    expect(legalDocFor(['privacy'])).toBe('privacy');
    expect(legalDocFor('x')).toBeNull();
    expect(legalDocFor('')).toBeNull();
    expect(legalDocFor(undefined)).toBeNull();
  });

  it('only accepts a plain #section name', () => {
    expect(legalAnchorFor('analytics')).toBe('analytics');
    expect(legalAnchorFor('data-retention')).toBe('data-retention');
    expect(legalAnchorFor('../login')).toBeNull();
    expect(legalAnchorFor('a b')).toBeNull();
    expect(legalAnchorFor(undefined)).toBeNull();
  });

  it('builds the in-app route and the website path', () => {
    expect(legalHref('terms')).toBe('/legal/terms');
    expect(legalHref('privacy', 'analytics')).toBe('/legal/privacy?anchor=analytics');
    expect(legalWebPath('privacy')).toBe('/privacy');
  });
});
