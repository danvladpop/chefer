import { readFileSync } from 'fs';
import { join } from 'path';
import { colorRoles, cssVarName, hexToRgbTriplet, type ColorRole } from '@chefer/tokens';

// The revamp's colour roles live in ONE place (@chefer/tokens color.ts).
// NativeWind can only read CSS variables, so global.css carries a copy; this
// test is the sync check that keeps the copy honest (plan: "Design system →
// Colour"). Change a value in color.ts → update global.css in the same PR.
// The light values sit in the first :root block, the dark ones in the
// `prefers-color-scheme: dark` block (night mode).

const css = readFileSync(join(__dirname, '..', '..', 'global.css'), 'utf8');
const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');
const lightCss = css.slice(0, darkStart);
const darkCss = css.slice(darkStart);

function value(block: string, role: ColorRole): string | undefined {
  return new RegExp(`${cssVarName(role)}:\\s*([0-9 ]+);`).exec(block)?.[1]?.trim();
}

describe('global.css colour roles match @chefer/tokens', () => {
  it('has a dark block', () => {
    expect(darkStart).toBeGreaterThan(0);
  });

  for (const role of Object.keys(colorRoles) as ColorRole[]) {
    it(`${cssVarName(role)} is the light value of ${role}`, () => {
      expect(value(lightCss, role)).toBe(hexToRgbTriplet(colorRoles[role].light));
    });
    it(`${cssVarName(role)} is the dark value of ${role} at night`, () => {
      expect(value(darkCss, role)).toBe(hexToRgbTriplet(colorRoles[role].dark));
    });
  }
});
