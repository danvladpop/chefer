import { describe, expect, expectTypeOf, it } from 'vitest';
import { createTranslator } from './translator';
import type { MessageKey } from './types';

describe('createTranslator', () => {
  it('returns the message in the requested language', () => {
    expect(createTranslator('en').t('common.actions.save')).toBe('Save');
    expect(createTranslator('ro').t('common.actions.save')).toBe('Salvează');
  });

  it('fills placeholders', () => {
    const { t } = createTranslator('ro');
    expect(t('email.greeting', { name: 'Ana' })).toBe('Bună, Ana,');
  });

  it('picks the Romanian plural form, including "de" from 20 up', () => {
    const { t } = createTranslator('ro');
    expect(t('common.counts.recipes', { count: 1 })).toBe('1 rețetă');
    expect(t('common.counts.recipes', { count: 3 })).toBe('3 rețete');
    expect(t('common.counts.recipes', { count: 20 })).toBe('20 de rețete');
    expect(t('common.counts.recipes', { count: 101 })).toBe('101 rețete');
  });

  it('formats numeric params for the locale', () => {
    expect(createTranslator('ro').t('common.counts.meals', { count: 1500 })).toBe('1.500 de mese');
    expect(createTranslator('en', ['en-US']).t('common.counts.meals', { count: 1500 })).toBe(
      '1,500 meals',
    );
  });

  it('formats dates in the UI language, not the device language', () => {
    const d = new Date(Date.UTC(2026, 9, 22, 12));
    expect(createTranslator('ro', ['en-US']).date(d, 'long', 'UTC')).toBe('22 octombrie');
    expect(createTranslator('en', ['en-US']).date(d, 'long', 'UTC')).toBe('October 22');
  });

  it('formats currency for the locale', () => {
    expect(createTranslator('ro').currency(74, 'RON', 0)).toBe('74\u00a0RON');
  });

  it('returns the key for an unknown key instead of throwing', () => {
    const t = createTranslator('ro').t as (key: MessageKey) => string;
    expect(t('nope.missing' as MessageKey)).toBe('nope.missing');
  });

  it('types keys and params', () => {
    const { t } = createTranslator('en');
    // @ts-expect-error — not a key
    t('common.actions.sav');
    // @ts-expect-error — `name` is required
    t('email.greeting');
    // @ts-expect-error — plurals need `count`
    t('common.counts.days');
    expectTypeOf(t('common.counts.days', { count: 2 })).toEqualTypeOf<string>();
  });
});
