import { readFileSync } from 'fs';
import { join } from 'path';
import { colorRoles, cssVarName, hexToRgbTriplet, type ColorRole } from '@chefer/tokens';

// The revamp's colour roles live in ONE place (@chefer/tokens color.ts).
// NativeWind can only read CSS variables, so global.css carries a copy; this
// test is the sync check that keeps the copy honest (plan: "Design system →
// Colour"). Change a value in color.ts → update global.css in the same PR.

const css = readFileSync(join(__dirname, '..', '..', 'global.css'), 'utf8');

describe('global.css colour roles match @chefer/tokens', () => {
  for (const role of Object.keys(colorRoles) as ColorRole[]) {
    it(`${cssVarName(role)} is the light value of ${role}`, () => {
      const match = new RegExp(`${cssVarName(role)}:\\s*([0-9 ]+);`).exec(css);
      expect(match?.[1]?.trim()).toBe(hexToRgbTriplet(colorRoles[role].light));
    });
  }
});
