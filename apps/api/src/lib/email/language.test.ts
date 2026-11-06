import { describe, expect, it } from 'vitest';
import { emailTranslator } from './language.js';

describe('emailTranslator', () => {
  it('uses the Settings choice first', () => {
    expect(emailTranslator({ locale: 'ro', deviceLocale: 'en' }).locale).toBe('ro');
  });

  it('falls back to the device language, then English', () => {
    expect(emailTranslator({ locale: null, deviceLocale: 'ro' }).locale).toBe('ro');
    expect(emailTranslator({ locale: null, deviceLocale: null }).locale).toBe('en');
    expect(emailTranslator({}).locale).toBe('en');
  });

  it('treats an unknown stored value as unset', () => {
    expect(emailTranslator({ locale: 'xx', deviceLocale: 'ro' }).locale).toBe('ro');
  });
});
