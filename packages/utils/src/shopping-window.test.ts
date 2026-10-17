import { describe, expect, it } from 'vitest';
import { shoppingProvenanceText, shoppingWindowLabel } from './shopping-window';

describe('shoppingWindowLabel', () => {
  it('labels the remaining days of a mid-week plan', () => {
    expect(shoppingWindowLabel(4)).toBe('Fri–Sun');
    expect(shoppingWindowLabel(6)).toBe('Sun only');
  });
  it('is null for a whole-week list', () => {
    expect(shoppingWindowLabel(undefined)).toBeNull();
    expect(shoppingWindowLabel(0)).toBeNull();
  });
});

describe('shoppingProvenanceText (FB7-10)', () => {
  it('says where the list comes from and the whole week by default', () => {
    expect(shoppingProvenanceText(undefined)).toBe("From your plan's recipes · Mon–Sun");
    expect(shoppingProvenanceText(0)).toBe("From your plan's recipes · Mon–Sun");
  });
  it('uses the mid-week window label otherwise', () => {
    expect(shoppingProvenanceText(4)).toBe("From your plan's recipes · Fri–Sun");
    expect(shoppingProvenanceText(6)).toBe("From your plan's recipes · Sun only");
  });
});
