import { describe, expect, it } from 'vitest';
import {
  colorRoles,
  colorsFor,
  contrastRatio,
  cssVarName,
  hexToRgbTriplet,
  type ColorRole,
  type ColorScheme,
} from './color';

const SCHEMES: ColorScheme[] = ['light', 'dark'];

// Every text role must stay readable on every background it sits on, in both
// themes: WCAG AA is 4.5:1 for body text. Brand text on the canvas and the
// status colours are also used as text (links, "Over by 120"), so they get
// the same bar.
const TEXT_ROLES: ColorRole[] = [
  'label',
  'labelSecondary',
  'labelTertiary',
  'brand',
  'positive',
  'attention',
  'info',
  'danger',
];
const BACKGROUNDS: ColorRole[] = ['canvas', 'surface', 'surfaceRaised'];

describe('colour roles', () => {
  for (const scheme of SCHEMES) {
    const c = colorsFor(scheme);
    for (const text of TEXT_ROLES) {
      for (const bg of BACKGROUNDS) {
        it(`${scheme}: ${text} on ${bg} meets AA (4.5:1)`, () => {
          expect(contrastRatio(c[text], c[bg])).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
    it(`${scheme}: label on the sunken well and the brand tint meets AA`, () => {
      expect(contrastRatio(c.label, c.surfaceSunken)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.label, c.brandTint)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.brand, c.brandTint)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${scheme}: text on a brand fill meets AA`, () => {
      expect(contrastRatio(c.onBrand, c.brand)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('has a light and a dark value for every role', () => {
    for (const value of Object.values(colorRoles)) {
      expect(value.light).toMatch(/^#[0-9A-F]{6}$/);
      expect(value.dark).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('converts hex to the rgb triplet global.css stores', () => {
    expect(hexToRgbTriplet('#944A00')).toBe('148 74 0');
    expect(hexToRgbTriplet('#FFFFFF')).toBe('255 255 255');
  });

  it('names CSS variables in kebab-case', () => {
    expect(cssVarName('labelSecondary')).toBe('--label-secondary');
    expect(cssVarName('canvas')).toBe('--canvas');
  });

  it('computes the WCAG contrast of black on white as 21', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });
});
